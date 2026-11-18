import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import {
  analyzePurchaseSheet,
  buildPurchaseContactLookupIndex,
  buildPurchaseResponsibilityImportPreview,
  extractPopulatedWorksheetMatrix,
  normalizePurchasePhone,
  parsePurchaseWorkbookBuffer,
  readPhoneCellAsString,
  resolvePurchaseContactsForProduct,
  resolvePurchaseContactsFromIndex,
  safeCellToString,
} from '../src/utils/purchaseResponsibility';
import {
  DB_NAME,
  DB_VERSION,
  STORE_PURCHASE_MASTER,
  STORE_PURCHASE_RECORDS,
  ensureObjectStoresAndIndexes,
} from '../src/utils/indexedDB';

function createWorkbookBuffer(sheets: Record<string, any[][]>): Uint8Array {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  const out = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return new Uint8Array(out);
}

test('parses multi-sheet workbook defaulting to Sheet1 and detecting PUCHASE NB header variations', () => {
  const buf = createWorkbookBuffer({
    Summary: [['Report Date', '2026-11-01'], ['Total', 99]],
    Sheet1: [
      ['BANSAL CODE', 'ITEM NAME', 'PURCHASE NAME', '  puchase   nb ', 'EXTRA COL'],
      [101, 'Basmati Rice 5kg', 'Rajesh Sharma', 9876543210, 'Ignored Note'],
      ['00205', 'Olive Oil 1L', 'Anita Verma', '+91 (98111) 22334', 'Extra'],
    ],
  });

  const parsed = parsePurchaseWorkbookBuffer(buf, 'contacts.xlsx');
  assert.equal(parsed.defaultSheetName, 'Sheet1');
  assert.deepEqual(parsed.sheetNames, ['Summary', 'Sheet1']);

  const analysis = analyzePurchaseSheet(parsed.sheets[parsed.defaultSheetName]);
  assert.equal(analysis.mapping.bansalCode, 'BANSAL CODE');
  assert.equal(analysis.mapping.itemName, 'ITEM NAME');
  assert.equal(analysis.mapping.purchaseName, 'PURCHASE NAME');
  assert.equal(analysis.mapping.phone, 'puchase   nb');

  const preview = buildPurchaseResponsibilityImportPreview({
    fileName: parsed.fileName,
    sheetName: 'Sheet1',
    matrix: parsed.sheets['Sheet1'],
    headerRowIndex: analysis.headerRowIndex,
    headers: analysis.headers,
    mapping: analysis.mapping,
  });

  assert.equal(preview.isValidToActivate, true);
  assert.equal(preview.validRecords.length, 2);
  assert.equal(preview.uniqueProductCodesCount, 2);
  assert.equal(preview.validRecords[0].bansalCode, '101');
  assert.equal(preview.validRecords[0].whatsappUrl, 'https://wa.me/919876543210');
  assert.equal(preview.validRecords[0].telUrl, 'tel:+919876543210');
  assert.equal(preview.validRecords[1].bansalCode, '00205');
  assert.equal(preview.validRecords[1].whatsappUrl, 'https://wa.me/919811122334');
});

test('phone normalization handles numeric cells, Indian 10-digit/91 prefixes, international numbers, and malformed inputs', () => {
  assert.equal(readPhoneCellAsString(9876543210), '9876543210');
  assert.equal(readPhoneCellAsString('9876543210.0'), '9876543210');

  const indian10 = normalizePurchasePhone(9876543210);
  assert.equal(indian10.phoneStatus, 'valid_indian');
  assert.equal(indian10.normalizedPhoneDigits, '919876543210');
  assert.equal(indian10.whatsappUrl, 'https://wa.me/919876543210');
  assert.equal(indian10.telUrl, 'tel:+919876543210');

  const formatted91 = normalizePurchasePhone('91 98111-22334');
  assert.equal(formatted91.phoneStatus, 'valid_indian');
  assert.equal(formatted91.normalizedPhoneDigits, '919811122334');
  assert.equal(formatted91.whatsappUrl, 'https://wa.me/919811122334');

  const intlPlus = normalizePurchasePhone('+1 (415) 555-2671');
  assert.equal(intlPlus.phoneStatus, 'valid_international');
  assert.equal(intlPlus.normalizedPhoneDigits, '14155552671');
  assert.equal(intlPlus.whatsappUrl, 'https://wa.me/14155552671');
  assert.equal(intlPlus.telUrl, 'tel:+14155552671');

  const intl00 = normalizePurchasePhone('0044 20 7946 0958');
  assert.equal(intl00.phoneStatus, 'valid_international');
  assert.equal(intl00.normalizedPhoneDigits, '442079460958');

  const missing = normalizePurchasePhone('');
  assert.equal(missing.phoneStatus, 'missing');
  assert.equal(missing.whatsappUrl, undefined);

  const multiNumber = normalizePurchasePhone('9876543210 / 9811122334');
  assert.equal(multiNumber.phoneStatus, 'ambiguous');
  assert.equal(multiNumber.telUrl, undefined);

  const ambiguous12 = normalizePurchasePhone('442079460958');
  assert.equal(ambiguous12.phoneStatus, 'ambiguous');

  const malformedShort = normalizePurchasePhone('12345');
  assert.equal(malformedShort.phoneStatus, 'invalid');
});

test('matches strictly by Bansal Code, handles leading zeros unambiguously, and never matches barcode/mainCode/name', () => {
  const matrix = [
    ['BANSAL CODE', 'ITEM NAME', 'PURCHASE NAME', 'PUCHASE NB'],
    [123, 'Widget A', 'Aarav', 9876543210],
    ['00456', 'Widget B', 'Meera', 9811122334],
    ['0789', 'Widget C1', 'Karan', 9822233445],
    ['00789', 'Widget C2', 'Sonia', 9833344556],
    ['ABC-10', 'Alpha Item', 'Vikram', ''],
  ];
  const analysis = analyzePurchaseSheet(matrix);
  const preview = buildPurchaseResponsibilityImportPreview({
    fileName: 'master.xlsx',
    sheetName: 'Sheet1',
    matrix,
    headerRowIndex: analysis.headerRowIndex,
    headers: analysis.headers,
    mapping: analysis.mapping,
  });

  // 1. Numeric Excel 123 matches zero-padded stock code 00123 unambiguously
  const resZeroPadded = resolvePurchaseContactsForProduct(
    { id: 'p1', name: 'Wrong Name', barcode: '8901234567890', bansalCode: '00123', mainCode: '00456' },
    preview.validRecords
  );
  assert.equal(resZeroPadded.status, 'assigned');
  assert.equal(resZeroPadded.matchType, 'leading_zero_normalized');
  assert.equal(resZeroPadded.contacts[0].purchasePersonName, 'Aarav');

  // 2. Exact match takes precedence
  const resExact = resolvePurchaseContactsForProduct(
    { id: 'p2', name: 'Widget B', barcode: '00123', bansalCode: '00456' },
    preview.validRecords
  );
  assert.equal(resExact.status, 'assigned');
  assert.equal(resExact.matchType, 'exact');
  assert.equal(resExact.contacts[0].purchasePersonName, 'Meera');

  // 3. Ambiguous leading-zero collision between 0789 and 00789 when searching 789
  const resAmbiguous = resolvePurchaseContactsForProduct(
    { id: 'p3', name: 'Widget C', barcode: '111', bansalCode: '789' },
    preview.validRecords
  );
  assert.equal(resAmbiguous.status, 'ambiguous_code');
  assert.equal(resAmbiguous.ambiguousCodeGroups?.length, 2);

  // 4. Never match by barcode, mainCode, or itemName
  const resNoMatch = resolvePurchaseContactsForProduct(
    { id: 'p4', name: 'Widget A', barcode: '123', mainCode: '00456', bansalCode: '99999' },
    preview.validRecords
  );
  assert.equal(resNoMatch.status, 'not_assigned');
  assert.equal(resNoMatch.contacts.length, 0);

  // 5. Missing phone still preserves person name and flags phoneStatus
  const resMissingPhone = resolvePurchaseContactsForProduct(
    { id: 'p5', name: 'Alpha', barcode: '555', bansalCode: 'ABC-10' },
    preview.validRecords
  );
  assert.equal(resMissingPhone.status, 'assigned');
  assert.equal(resMissingPhone.contacts[0].purchasePersonName, 'Vikram');
  assert.equal(resMissingPhone.contacts[0].phoneStatus, 'missing');
  assert.equal(resMissingPhone.contacts[0].whatsappUrl, undefined);
});

test('deduplicates identical rows, flags conflicting contacts on same code, and tracks full replacement diff', () => {
  const prevMatrix = [
    ['BANSAL CODE', 'ITEM NAME', 'PURCHASE NAME', 'PUCHASE NB'],
    ['100', 'Old Item 1', 'Raj', '9876543210'],
    ['200', 'Old Item 2', 'Simran', '9811122334'],
  ];
  const prevAnalysis = analyzePurchaseSheet(prevMatrix);
  const prevPreview = buildPurchaseResponsibilityImportPreview({
    fileName: 'prev.xlsx',
    sheetName: 'Sheet1',
    matrix: prevMatrix,
    headerRowIndex: prevAnalysis.headerRowIndex,
    headers: prevAnalysis.headers,
    mapping: prevAnalysis.mapping,
  });

  const nextMatrix = [
    ['BANSAL CODE', 'ITEM NAME', 'PURCHASE NAME', 'PUCHASE NB'],
    ['100', 'Old Item 1', 'Raj', '+91 98765-43210'], // Same normalized contact -> unchanged
    ['100', 'Old Item 1', 'Raj', '9876543210'], // Exact duplicate -> deduplicated
    ['300', 'Conflict Item', 'Buyer One', '9822233445'],
    ['300', 'Conflict Item', 'Buyer Two', '9833344556'], // Different contact on 300 -> conflict preserved
  ];
  const nextAnalysis = analyzePurchaseSheet(nextMatrix);
  const nextPreview = buildPurchaseResponsibilityImportPreview({
    fileName: 'next.xlsx',
    sheetName: 'Sheet1',
    matrix: nextMatrix,
    headerRowIndex: nextAnalysis.headerRowIndex,
    headers: nextAnalysis.headers,
    mapping: nextAnalysis.mapping,
    previousRecords: prevPreview.validRecords,
  });

  assert.equal(nextPreview.deduplicatedCount, 1);
  assert.equal(nextPreview.conflictingCodes.length, 1);
  assert.equal(nextPreview.conflictingCodes[0].bansalCode, '300');
  assert.equal(nextPreview.conflictingCodes[0].contacts.length, 2);

  assert.equal(nextPreview.diff.hasPreviousMaster, true);
  assert.equal(nextPreview.diff.unchangedCount, 1);
  assert.equal(nextPreview.diff.addedCodes.map((c) => c.bansalCode).join(','), '300');
  assert.equal(nextPreview.diff.removedCodes.map((c) => c.bansalCode).join(','), '200');

  // Absent code 200 resolves as not_assigned after replacement
  const afterReplaceRemoved = resolvePurchaseContactsForProduct(
    { id: 'p200', name: 'Old Item 2', barcode: '200', bansalCode: '200' },
    nextPreview.validRecords
  );
  assert.equal(afterReplaceRemoved.status, 'not_assigned');
});

test('IndexedDB schema version is >= 16 and upgrade handler idempotently preserves existing stores', () => {
  assert.equal(DB_NAME, 'BSMIQOfflineOnlyDB_v1');
  assert.ok(DB_VERSION >= 16, `Expected DB_VERSION >= 16, got ${DB_VERSION}`);

  const existingStores = new Set<string>([
    'products',
    'meta',
    'history',
    'audit_sessions',
    'audit_results',
    'focus_masters',
    'focus_checks',
    'barcode_master',
    'barcode_mappings',
    'near_expiry_batches',
    'near_expiry_items',
    'barcode_overrides',
    'stock_variations',
  ]);
  const createdStores: string[] = [];
  const createdIndexes: Array<{ store: string; index: string; keyPath: string }> = [];

  const mockStoreIndices = new Map<string, Set<string>>([
    ['barcode_mappings', new Set(['code', 'ean'])],
    ['near_expiry_items', new Set(['batchId', 'bansalCode', 'barcode', 'status'])],
  ]);

  const makeMockStore = (name: string) => ({
    indexNames: {
      contains: (idx: string) => (mockStoreIndices.get(name) || new Set()).has(idx),
    },
    createIndex: (idx: string, keyPath: string) => {
      if (!mockStoreIndices.has(name)) mockStoreIndices.set(name, new Set());
      mockStoreIndices.get(name)!.add(idx);
      createdIndexes.push({ store: name, index: idx, keyPath });
    },
  });

  const mockDb = {
    objectStoreNames: {
      contains: (name: string) => existingStores.has(name),
    },
    createObjectStore: (name: string) => {
      assert.ok(!existingStores.has(name), `Attempted to recreate existing store: ${name}`);
      existingStores.add(name);
      createdStores.push(name);
      return makeMockStore(name);
    },
  } as unknown as IDBDatabase;

  const mockTx = {
    objectStore: (name: string) => makeMockStore(name),
  } as unknown as IDBTransaction;

  ensureObjectStoresAndIndexes(mockDb, mockTx);

  assert.deepEqual(createdStores, [STORE_PURCHASE_MASTER, STORE_PURCHASE_RECORDS]);
  assert.deepEqual(createdIndexes, [
    { store: STORE_PURCHASE_RECORDS, index: 'bansalCode', keyPath: 'bansalCode' },
  ]);
});

test('parses Excel workbooks with 1,048,576-row formatted !ref without hanging or OOM', () => {
  // 1. Direct matrix test for full A1:XFD1048576 Excel formatting bounds (All Borders / yellow header fill)
  const fullBoundsWs: XLSX.WorkSheet = {
    '!ref': 'A1:XFD1048576',
    A1: { t: 's', v: 'BANSAL CODE' },
    B1: { t: 's', v: 'ITEM NAME' },
    C1: { t: 's', v: 'PURCHASE NAME' },
    D1: { t: 's', v: 'PUCHASE NB' },
    A2: { t: 'n', v: 13014764 },
    B2: { t: 's', v: 'ODONIL AIR FRSHNR MIX BLCKS 100G*4N-400 g' },
    C2: { t: 's', v: 'AFJAL' },
    D2: { t: 'n', v: 9213016152 },
    A3: { t: 'n', v: 2003304 },
    B3: { t: 's', v: 'DABUR LAL TAIL-100 ml' },
    C3: { t: 's', v: 'AFJAL' },
    D3: { t: 'n', v: 9213016152 },
    XFD1048576: { t: 'z' },
  };
  const tDirect = performance.now();
  const directMatrix = extractPopulatedWorksheetMatrix(fullBoundsWs);
  assert.ok(performance.now() - tDirect < 200, 'Direct matrix extraction should take <200ms');
  assert.equal(directMatrix.length, 3);
  assert.equal(directMatrix[1][0], 13014764);

  // 2. End-to-end .xlsx buffer test with default Sheet1 + unrelated Sheet2 (lazy extraction)
  const wb = XLSX.utils.book_new();
  const ws2 = XLSX.utils.aoa_to_sheet([['OTHER', 'DATA'], ['X', 'Y']]);
  XLSX.utils.book_append_sheet(wb, ws2, 'Sheet2');
  const ws1 = XLSX.utils.aoa_to_sheet([
    ['BANSAL CODE', 'ITEM NAME', 'PURCHASE NAME', 'PUCHASE NB'],
    [13014764, 'ODONIL AIR FRSHNR MIX BLCKS 100G*4N-400 g', 'AFJAL', 9213016152],
    [2003304, 'DABUR LAL TAIL-100 ml', 'AFJAL', 9213016152],
  ]);
  XLSX.utils.book_append_sheet(wb, ws1, 'Sheet1');

  const out = new Uint8Array(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  const t0 = performance.now();
  const parsed = parsePurchaseWorkbookBuffer(out, 'styled_full_sheet.xlsx');
  const elapsedMs = performance.now() - t0;

  assert.ok(elapsedMs < 1000, `Expected <1000ms parse time, got ${elapsedMs.toFixed(1)}ms`);
  assert.equal(parsed.defaultSheetName, 'Sheet1');

  const matrix = parsed.getSheetMatrix ? parsed.getSheetMatrix('Sheet1') : parsed.sheets['Sheet1'];
  const analysis = analyzePurchaseSheet(matrix);
  const preview = buildPurchaseResponsibilityImportPreview({
    fileName: parsed.fileName,
    sheetName: 'Sheet1',
    matrix,
    headerRowIndex: analysis.headerRowIndex,
    headers: analysis.headers,
    mapping: analysis.mapping,
  });

  assert.equal(preview.isValidToActivate, true);
  assert.equal(preview.validRecords.length, 2);
  assert.equal(preview.validRecords[0].bansalCode, '13014764');
  assert.equal(preview.validRecords[0].purchasePersonName, 'AFJAL');
  assert.equal(preview.validRecords[0].whatsappUrl, 'https://wa.me/919213016152');
  assert.equal(preview.validRecords[0].telUrl, 'tel:+919213016152');
});

test('O(1) PurchaseContactLookupIndex matches resolvePurchaseContactsForProduct and safeCellToString handles null-prototype objects', () => {
  const nullProtoObj = Object.create(null);
  nullProtoObj.v = '  TEST-VAL  ';
  assert.equal(safeCellToString(nullProtoObj), 'TEST-VAL');
  assert.equal(safeCellToString({ richText: [{ text: 'AF' }, { text: 'JAL' }] }), 'AFJAL');
  assert.equal(safeCellToString({ result: 9213016152 }), '9213016152');

  const matrix = [
    ['BANSAL CODE', 'ITEM NAME', 'PURCHASE NAME', 'PUCHASE NB'],
    [13014764, 'ODONIL', 'AFJAL', 9213016152],
    ['00456', 'WIDGET B', 'MEERA', 9811122334],
    ['0789', 'WIDGET C1', 'KARAN', 9822233445],
    ['00789', 'WIDGET C2', 'SONIA', 9833344556],
    [300, 'CONFLICT 1', 'BUYER ONE', 9822233445],
    [300, 'CONFLICT 2', 'BUYER TWO', 9833344556],
  ];
  const analysis = analyzePurchaseSheet(matrix);
  const preview = buildPurchaseResponsibilityImportPreview({
    fileName: 'master.xlsx',
    sheetName: 'Sheet1',
    matrix,
    headerRowIndex: analysis.headerRowIndex,
    headers: analysis.headers,
    mapping: analysis.mapping,
  });

  const index = buildPurchaseContactLookupIndex(preview.validRecords);
  const probes = [
    { id: '1', bansalCode: '0013014764' },
    { id: '2', bansalCode: '00456' },
    { id: '3', bansalCode: '789' },
    { id: '4', bansalCode: '300' },
    { id: '5', bansalCode: '999999' },
    { id: '6', barcode: '13014764' },
  ];

  for (const product of probes) {
    const linear = resolvePurchaseContactsForProduct(product, preview.validRecords);
    const indexed = resolvePurchaseContactsFromIndex(product, index);
    assert.deepEqual(indexed, linear);
  }
});

