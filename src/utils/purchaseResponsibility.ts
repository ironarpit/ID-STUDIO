import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import {
  Product,
  PurchaseColumnMapping,
  PurchasePhoneStatus,
  PurchaseResponsibilityMeta,
  PurchaseResponsibilityRecord,
} from '../types';

export interface ParsedWorkbookSheet {
  name: string;
  rows: any[][];
}

export interface ParsedPurchaseWorkbook {
  fileName: string;
  sheetNames: string[];
  defaultSheetName: string;
  sheets: Record<string, any[][]>;
  getSheetMatrix?: (sheetName: string) => any[][];
}

export interface SheetHeaderAnalysis {
  headerRowIndex: number;
  headers: string[];
  mapping: PurchaseColumnMapping;
  previewRows: any[][];
}

export interface PurchaseRowPreview {
  rowNumber: number;
  bansalCode: string;
  itemName: string;
  purchasePersonName: string;
  rawPhone: string;
  phoneStatus: PurchasePhoneStatus;
  phoneError?: string;
  normalizedPhoneDigits?: string;
  displayPhone?: string;
  whatsappUrl?: string;
  telUrl?: string;
  isConflictingCode?: boolean;
}

export interface PurchaseConflictGroup {
  bansalCode: string;
  itemNames: string[];
  contacts: PurchaseResponsibilityRecord[];
}

export interface PurchaseDiffEntry {
  bansalCode: string;
  itemName?: string;
  previousContacts: string[];
  nextContacts: string[];
}

export interface PurchaseMasterDiffSummary {
  hasPreviousMaster: boolean;
  addedCodes: PurchaseDiffEntry[];
  changedCodes: PurchaseDiffEntry[];
  removedCodes: PurchaseDiffEntry[];
  unchangedCount: number;
}

export interface PurchaseValidationResult {
  fileName: string;
  sheetName: string;
  totalRowsRead: number;
  validRecords: PurchaseResponsibilityRecord[];
  uniqueProductCodesCount: number;
  missingCodeRowsCount: number;
  missingNameCount: number;
  missingOrInvalidPhoneCount: number;
  deduplicatedCount: number;
  conflictingCodes: PurchaseConflictGroup[];
  rowPreviews: PurchaseRowPreview[];
  issueRows: Array<{
    rowNumber: number;
    bansalCode: string;
    purchasePersonName: string;
    rawPhone: string;
    reason: string;
  }>;
  diff: PurchaseMasterDiffSummary;
  isValidToActivate: boolean;
  blockingError?: string;
}

export interface PurchaseContactResolution {
  status: 'assigned' | 'not_assigned' | 'ambiguous_code' | 'no_product_code';
  productBansalCode: string;
  matchedMasterCode?: string;
  matchType?: 'exact' | 'leading_zero_normalized';
  contacts: PurchaseResponsibilityRecord[];
  ambiguousCodeGroups?: Array<{
    masterCode: string;
    contacts: PurchaseResponsibilityRecord[];
  }>;
  message?: string;
}

/**
 * Extracts raw Bansal internal item code from a Product without falling back to barcode, mainCode, or product name.
 * Preserves original leading zeros.
 */
export function getProductBansalCode(product?: Partial<Product> | null): string {
  if (!product) return '';
  const raw =
    product.bansalCode ??
    product.localCode ??
    product.code ??
    (product.rawRowData
      ? product.rawRowData['Bansal Code'] ??
        product.rawRowData['bansal code'] ??
        product.rawRowData['BANSAL CODE'] ??
        product.rawRowData['BansalCode'] ??
        product.rawRowData['BANSALCODE'] ??
        product.rawRowData['Local Code'] ??
        product.rawRowData['LOCAL CODE'] ??
        product.rawRowData['Item Code'] ??
        product.rawRowData['ITEM CODE'] ??
        product.rawRowData['Code'] ??
        product.rawRowData['CODE']
      : undefined);

  if (raw === null || raw === undefined) return '';
  const cleaned = cleanBansalCodePreserveZeros(raw);
  return cleaned === '—' ? '' : cleaned;
}

/**
 * Safely converts any spreadsheet cell value to a trimmed string without throwing on
 * non-primitive or null-prototype objects.
 */
export function safeCellToString(val: unknown): string {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string') return val.trim();
  if (typeof val === 'number') return Number.isFinite(val) ? String(val).trim() : '';
  if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
  if (val instanceof Date) return Number.isNaN(val.getTime()) ? '' : val.toISOString();
  if (typeof val === 'object') {
    const obj = val as Record<string, unknown>;
    if ('v' in obj && obj.v !== undefined) return safeCellToString(obj.v);
    if ('w' in obj && obj.w !== undefined) return safeCellToString(obj.w);
    if ('result' in obj && obj.result !== undefined) return safeCellToString(obj.result);
    if ('text' in obj && obj.text !== undefined) return safeCellToString(obj.text);
    if ('richText' in obj && Array.isArray(obj.richText)) {
      return obj.richText.map((part: any) => safeCellToString(part?.text)).join('').trim();
    }
    return '';
  }
  try {
    return String(val).trim();
  } catch {
    return '';
  }
}

/**
 * Cleans a Bansal Code cell value as a string, handling numeric Excel cells without adding .0,
 * handling scientific notation if integer, and preserving any leading zeros present in string cells.
 */
export function cleanBansalCodePreserveZeros(val: unknown): string {
  if (val === null || val === undefined) return '';

  if (typeof val === 'number') {
    if (!Number.isFinite(val)) return '';
    if (Number.isInteger(val)) {
      return val.toString();
    }
    const str = String(val);
    if (/^\d+\.0+$/.test(str)) {
      return str.replace(/\.0+$/, '');
    }
    return str.trim();
  }

  let s = safeCellToString(val);
  if (!s) return '';

  if (/^[+-]?\d+(\.\d+)?[eE][+-]?\d+$/.test(s)) {
    const num = Number(s);
    if (Number.isFinite(num) && Number.isSafeInteger(Math.round(num))) {
      s = Math.round(num).toString();
    }
  }

  if (/^\d+\.0+$/.test(s)) {
    s = s.replace(/\.0+$/, '');
  }

  return s.trim();
}

/**
 * Reads an Excel/CSV phone cell value cleanly as a string without adding decimal suffixes.
 */
export function readPhoneCellAsString(val: unknown): string {
  if (val === null || val === undefined) return '';

  if (typeof val === 'number') {
    if (!Number.isFinite(val)) return '';
    if (Number.isInteger(val)) {
      return val.toString();
    }
    const str = String(val);
    if (/^\d+\.0+$/.test(str)) {
      return str.replace(/\.0+$/, '');
    }
    return str.trim();
  }

  let s = safeCellToString(val);
  if (!s) return '';

  // Handle scientific notation (e.g. 9.87654E+09 or 9.19877E+11) only if lossless safe integer
  if (/^[+-]?\d+(\.\d+)?[eE][+-]?\d+$/.test(s)) {
    const num = Number(s);
    if (Number.isFinite(num) && Number.isSafeInteger(Math.round(num))) {
      s = Math.round(num).toString();
    }
  }

  // Remove Excel-style trailing .0 when the string is purely numeric + .0+
  if (/^[+]?[\d\s()-]+\.0+$/.test(s)) {
    s = s.replace(/\.0+$/, '');
  }

  return s.trim();
}

export interface NormalizedPhoneResult {
  rawPhone: string;
  phoneStatus: PurchasePhoneStatus;
  phoneError?: string;
  normalizedPhoneDigits?: string;
  displayPhone?: string;
  whatsappUrl?: string;
  telUrl?: string;
}

/**
 * Validates and normalizes phone numbers for WhatsApp & tel links:
 * - Reads as string without trailing .0
 * - Strips formatting spaces, brackets, and hyphens
 * - 10-digit Indian mobile ([6-9]xxxxxxxxx) -> 91 + 10 digits
 * - Existing 91 prefix (91[6-9]xxxxxxxxx or +91[6-9]xxxxxxxxx) -> 91 + 10 digits without duplicating 91
 * - Explicit international country code (+... or 00... with 7-15 E.164 digits) -> preserved international digits
 * - Ambiguous or malformed numbers -> flagged instead of guessing
 */
export function normalizePurchasePhone(rawVal: unknown): NormalizedPhoneResult {
  const rawPhone = readPhoneCellAsString(rawVal);

  if (!rawPhone) {
    return {
      rawPhone: '',
      phoneStatus: 'missing',
      phoneError: 'Phone number not provided.',
    };
  }

  const lower = rawPhone.toLowerCase();
  if (lower === '-' || lower === '--' || lower === 'n/a' || lower === 'na' || lower === 'none' || lower === 'nil' || lower === 'null') {
    return {
      rawPhone,
      phoneStatus: 'missing',
      phoneError: 'Phone number not provided.',
    };
  }

  // Reject negative numbers or leading hyphens / Excel formula error tokens (#REF!, #N/A, #VALUE!)
  if (rawPhone.startsWith('-') || rawPhone.startsWith('#')) {
    return {
      rawPhone,
      phoneStatus: 'invalid',
      phoneError: 'Phone number starts with an invalid sign or spreadsheet error.',
    };
  }

  // Detect multiple numbers separated by slash, comma, semicolon, or newline
  if (/[\/,;\n|]/.test(rawPhone)) {
    return {
      rawPhone,
      phoneStatus: 'ambiguous',
      phoneError: 'Multiple or separated phone values in cell; cannot safely select one number.',
    };
  }

  // Detect alphabetic or unexpected characters (allow +, digits, spaces, parentheses, hyphens, dots only for trailing .0 already stripped)
  if (/[a-zA-Z]/.test(rawPhone)) {
    return {
      rawPhone,
      phoneStatus: 'invalid',
      phoneError: 'Phone number contains letters or invalid text.',
    };
  }

  // Strip spaces, brackets, hyphens, and non-breaking spaces
  let compact = rawPhone.replace(/[\s()\-\u00A0]+/g, '');

  // If fractional decimal remains (e.g. 9876543210.5), flag invalid
  if (/\.\d+$/.test(compact)) {
    return {
      rawPhone,
      phoneStatus: 'invalid',
      phoneError: 'Phone number contains unexpected decimal digits.',
    };
  }

  // Reject unexpected symbols after stripping formatting
  if (!/^\+?\d+$/.test(compact)) {
    return {
      rawPhone,
      phoneStatus: 'invalid',
      phoneError: 'Phone number contains unsupported characters.',
    };
  }

  // Case 1: Explicit '+' international prefix
  if (compact.startsWith('+')) {
    const digits = compact.slice(1);
    if (!/^[1-9]\d{6,14}$/.test(digits)) {
      return {
        rawPhone,
        phoneStatus: 'invalid',
        phoneError: 'Invalid international phone format (expected + followed by 7–15 digits).',
      };
    }

    // Specific check for +91 Indian numbers
    if (digits.startsWith('91')) {
      const rest = digits.slice(2);
      if (/^[6-9]\d{9}$/.test(rest)) {
        const normalized = `91${rest}`;
        return {
          rawPhone,
          phoneStatus: 'valid_indian',
          normalizedPhoneDigits: normalized,
          displayPhone: `+91 ${rest.slice(0, 5)} ${rest.slice(5)}`,
          whatsappUrl: `https://wa.me/${normalized}`,
          telUrl: `tel:+${normalized}`,
        };
      }
      return {
        rawPhone,
        phoneStatus: 'invalid',
        phoneError: 'Indian number after +91 must be a 10-digit mobile number starting with 6–9.',
      };
    }

    return {
      rawPhone,
      phoneStatus: 'valid_international',
      normalizedPhoneDigits: digits,
      displayPhone: `+${digits}`,
      whatsappUrl: `https://wa.me/${digits}`,
      telUrl: `tel:+${digits}`,
    };
  }

  // Case 2: Explicit '00' international dialing prefix
  if (compact.startsWith('00')) {
    const digits = compact.slice(2);
    if (!/^[1-9]\d{6,14}$/.test(digits)) {
      return {
        rawPhone,
        phoneStatus: 'invalid',
        phoneError: 'Invalid international number after 00 prefix.',
      };
    }
    if (digits.startsWith('91')) {
      const rest = digits.slice(2);
      if (/^[6-9]\d{9}$/.test(rest)) {
        const normalized = `91${rest}`;
        return {
          rawPhone,
          phoneStatus: 'valid_indian',
          normalizedPhoneDigits: normalized,
          displayPhone: `+91 ${rest.slice(0, 5)} ${rest.slice(5)}`,
          whatsappUrl: `https://wa.me/${normalized}`,
          telUrl: `tel:+${normalized}`,
        };
      }
      return {
        rawPhone,
        phoneStatus: 'invalid',
        phoneError: 'Indian number after 0091 must be a 10-digit mobile number starting with 6–9.',
      };
    }
    return {
      rawPhone,
      phoneStatus: 'valid_international',
      normalizedPhoneDigits: digits,
      displayPhone: `+${digits}`,
      whatsappUrl: `https://wa.me/${digits}`,
      telUrl: `tel:+${digits}`,
    };
  }

  // Case 3: No '+' or '00' prefix
  const digits = compact;

  // 10-digit Indian mobile number (starts with 6, 7, 8, or 9)
  if (/^[6-9]\d{9}$/.test(digits)) {
    const normalized = `91${digits}`;
    return {
      rawPhone,
      phoneStatus: 'valid_indian',
      normalizedPhoneDigits: normalized,
      displayPhone: `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`,
      whatsappUrl: `https://wa.me/${normalized}`,
      telUrl: `tel:+${normalized}`,
    };
  }

  // Existing 91 prefix without '+' (12 digits: 91 + 10-digit Indian mobile)
  if (/^91[6-9]\d{9}$/.test(digits)) {
    const rest = digits.slice(2);
    return {
      rawPhone,
      phoneStatus: 'valid_indian',
      normalizedPhoneDigits: digits,
      displayPhone: `+91 ${rest.slice(0, 5)} ${rest.slice(5)}`,
      whatsappUrl: `https://wa.me/${digits}`,
      telUrl: `tel:+${digits}`,
    };
  }

  // Trunk-prefixed Indian mobile 0 + 10 digits (11 digits starting with 0[6-9])
  if (/^0[6-9]\d{9}$/.test(digits)) {
    const rest = digits.slice(1);
    const normalized = `91${rest}`;
    return {
      rawPhone,
      phoneStatus: 'valid_indian',
      normalizedPhoneDigits: normalized,
      displayPhone: `+91 ${rest.slice(0, 5)} ${rest.slice(5)}`,
      whatsappUrl: `https://wa.me/${normalized}`,
      telUrl: `tel:+${normalized}`,
    };
  }

  // 10 digits NOT starting with 6-9 (could be landline or malformed mobile)
  if (digits.length === 10) {
    return {
      rawPhone,
      phoneStatus: 'invalid',
      phoneError: '10-digit number is not a valid Indian mobile (must start with 6–9) and lacks a + country code.',
    };
  }

  // 11-15 digits without '+' and not matching 91/0 Indian mobile -> ambiguous (don't guess country code)
  if (digits.length >= 11 && digits.length <= 15) {
    return {
      rawPhone,
      phoneStatus: 'ambiguous',
      phoneError: 'Missing + country code prefix; cannot determine whether this is an international number or a mistyped mobile.',
    };
  }

  return {
    rawPhone,
    phoneStatus: 'invalid',
    phoneError: 'Phone number must be a 10-digit Indian mobile or include an explicit + country code.',
  };
}

/**
 * Normalizes a header string for flexible matching (e.g. "PUCHASE NB" -> "PUCHASENB").
 */
export function normalizePurchaseHeader(header: unknown): string {
  return safeCellToString(header)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

const BANSAL_CODE_HEADER_ALIASES = new Set([
  'BANSALCODE',
  'CODE',
  'ITEMCODE',
  'LOCALCODE',
  'PRODUCTCODE',
  'SKUCODE',
  'SHORTCODE',
]);

const ITEM_NAME_HEADER_ALIASES = new Set([
  'ITEMNAME',
  'PRODUCTNAME',
  'NAME',
  'DESCRIPTION',
  'PARTICULARS',
  'ITEM',
  'ITEMDESC',
]);

const PURCHASE_NAME_HEADER_ALIASES = new Set([
  'PURCHASENAME',
  'PUCHASENAME',
  'PURCHASEPERSON',
  'PURCHASEPERSONNAME',
  'PURCHASECONTACT',
  'PURCHASECONTACTNAME',
  'BUYER',
  'BUYERNAME',
  'CONTACTNAME',
  'CONTACTPERSON',
  'RESPONSIBLEPERSON',
  'PERSONNAME',
]);

const PHONE_HEADER_ALIASES = new Set([
  'PUCHASENB', // Exact typo header from user's workbook ("PUCHASE NB")
  'PURCHASENB',
  'PUCHASENO',
  'PURCHASENO',
  'PUCHASENUMBER',
  'PURCHASENUMBER',
  'PUCHASEPHONE',
  'PURCHASEPHONE',
  'PHONENUMBER',
  'PHONENO',
  'PHONE',
  'MOBILENUMBER',
  'MOBILENO',
  'MOBILE',
  'CONTACTNUMBER',
  'CONTACTNO',
  'WHATSAPPNO',
  'WHATSAPPNUMBER',
  'WHATSAPP',
  'TEL',
]);

/**
 * Parses an uploaded Excel (.xlsx/.xls) or CSV/TSV file into raw sheet matrices.
 * Defaults to Sheet1 (case-insensitive) when present.
 */
export async function parsePurchaseWorkbookFile(file: File): Promise<ParsedPurchaseWorkbook> {
  const fileName = file.name || 'PurchaseResponsibility.xlsx';
  const ext = fileName.split('.').pop()?.toLowerCase() || '';

  if (ext === 'csv' || ext === 'tsv' || ext === 'txt') {
    const text = await file.text();
    const parsed = Papa.parse(text, {
      skipEmptyLines: false,
    });
    const rows = (parsed.data as any[][]) || [];
    if (rows.length === 0) {
      throw new Error('The uploaded CSV file is empty.');
    }
    return {
      fileName,
      sheetNames: ['Sheet1'],
      defaultSheetName: 'Sheet1',
      sheets: { Sheet1: rows },
    };
  }

  if (ext !== 'xlsx' && ext !== 'xls') {
    throw new Error('Unsupported file format. Please upload an Excel (.xlsx, .xls) or CSV file.');
  }

  const buffer = await file.arrayBuffer();
  return parsePurchaseWorkbookBuffer(buffer, fileName);
}

/**
 * Extracts a trimmed 2D array from a SheetJS worksheet by visiting only actual populated
 * cell keys. This prevents multi-million row/column OOM crashes when Excel formatting
 * (e.g. All Borders or yellow row fills) extends `!ref` to A1:XFD1048576.
 */
export function extractPopulatedWorksheetMatrix(ws: XLSX.WorkSheet | undefined): any[][] {
  if (!ws) return [];

  const rowsMap = new Map<number, Map<number, any>>();
  let maxRow = -1;
  let maxCol = -1;

  for (const key of Object.keys(ws)) {
    if (key.charCodeAt(0) === 33 /* '!' */) continue;
    const cell = ws[key] as XLSX.CellObject | undefined;
    if (!cell || cell.t === 'z' || cell.t === 'e') continue;

    const val = cell.v;
    if (val === undefined || val === null) continue;
    if (typeof val === 'string' && val.trim() === '') continue;

    const pos = XLSX.utils.decode_cell(key);
    if (pos.r < 0 || pos.c < 0) continue;

    let rowCells = rowsMap.get(pos.r);
    if (!rowCells) {
      rowCells = new Map<number, any>();
      rowsMap.set(pos.r, rowCells);
    }
    rowCells.set(pos.c, val);
    if (pos.r > maxRow) maxRow = pos.r;
    if (pos.c > maxCol) maxCol = pos.c;
  }

  if (rowsMap.size === 0 || maxRow < 0 || maxCol < 0) {
    return [];
  }

  // Preserve original row alignment for normal sheets; pack non-empty rows if sparse sheet has trailing huge row gap
  const sortedRowIndices = Array.from(rowsMap.keys()).sort((a, b) => a - b);
  const colWidth = Math.min(maxCol + 1, 256);
  const matrix: any[][] = [];

  for (const rIdx of sortedRowIndices) {
    const rowCells = rowsMap.get(rIdx)!;
    const denseRow = new Array(colWidth).fill('');
    for (const [cIdx, val] of rowCells.entries()) {
      if (cIdx < colWidth) {
        denseRow[cIdx] = val;
      }
    }
    matrix.push(denseRow);
  }

  return matrix;
}

/**
 * Parses an ArrayBuffer/Uint8Array Excel workbook (also usable directly in automated tests).
 * Extracts the default sheet (`Sheet1` if present) immediately and extracts other sheets
 * lazily on demand so unrelated massive/styled sheets never cause OOM crashes.
 */
export function parsePurchaseWorkbookBuffer(
  buffer: ArrayBuffer | Uint8Array,
  fileName: string = 'PurchaseResponsibility.xlsx'
): ParsedPurchaseWorkbook {
  const workbook = XLSX.read(buffer, {
    type: 'array',
    cellDates: false,
    cellStyles: false,
    cellHTML: false,
    cellNF: false,
    cellFormula: false,
    sheetStubs: false,
  });

  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new Error('The uploaded workbook contains no worksheets.');
  }

  const sheetNames = workbook.SheetNames.filter((name) => Boolean(workbook.Sheets[name]));
  if (sheetNames.length === 0) {
    throw new Error('No readable worksheets found in the uploaded workbook.');
  }

  // Default to Sheet1 (exact or case-insensitive) when present
  const sheet1Match = sheetNames.find((s) => s.trim().toLowerCase() === 'sheet1');
  const defaultSheetName = sheet1Match || sheetNames[0];

  const sheetCache: Record<string, any[][]> = {};
  const getSheetMatrix = (name: string): any[][] => {
    if (Object.prototype.hasOwnProperty.call(sheetCache, name)) {
      return sheetCache[name];
    }
    const matrix = extractPopulatedWorksheetMatrix(workbook.Sheets[name]);
    sheetCache[name] = matrix;
    // Free raw worksheet object once converted to matrix so memory stays low
    delete workbook.Sheets[name];
    return matrix;
  };

  // Eagerly decode only the default sheet; other sheets remain lazy until selected
  getSheetMatrix(defaultSheetName);

  const sheets = new Proxy(sheetCache, {
    get(target, prop) {
      if (typeof prop === 'string' && sheetNames.includes(prop)) {
        return getSheetMatrix(prop);
      }
      return (target as any)[prop];
    },
  });

  return {
    fileName,
    sheetNames,
    defaultSheetName,
    sheets,
    getSheetMatrix,
  };
}

/**
 * Automatically detects the header row and maps columns for a given sheet matrix.
 */
export function analyzePurchaseSheet(matrix: any[][]): SheetHeaderAnalysis {
  if (!matrix || matrix.length === 0) {
    return {
      headerRowIndex: 0,
      headers: [],
      mapping: { bansalCode: '', itemName: '', purchaseName: '', phone: '' },
      previewRows: [],
    };
  }

  let bestRowIdx = -1;
  let bestScore = -1;

  const scanLimit = Math.min(matrix.length, 15);
  for (let r = 0; r < scanLimit; r++) {
    const row = matrix[r];
    if (!Array.isArray(row)) continue;

    let score = 0;
    let hasCode = false;
    let hasPurchaseName = false;
    let hasPhone = false;
    let hasItemName = false;

    for (let c = 0; c < row.length; c++) {
      const norm = normalizePurchaseHeader(row[c]);
      if (!norm) continue;
      if (BANSAL_CODE_HEADER_ALIASES.has(norm)) hasCode = true;
      if (ITEM_NAME_HEADER_ALIASES.has(norm)) hasItemName = true;
      if (PURCHASE_NAME_HEADER_ALIASES.has(norm)) hasPurchaseName = true;
      if (PHONE_HEADER_ALIASES.has(norm)) hasPhone = true;
    }

    if (hasCode) score += 4;
    if (hasPurchaseName) score += 4;
    if (hasPhone) score += 4;
    if (hasItemName) score += 2;

    if (score > bestScore && score > 0) {
      bestScore = score;
      bestRowIdx = r;
    }
  }

  // Fallback to first non-empty row if no known header matched
  if (bestRowIdx === -1) {
    bestRowIdx = matrix.findIndex(
      (row) => Array.isArray(row) && row.some((cell) => safeCellToString(cell) !== '')
    );
    if (bestRowIdx === -1) bestRowIdx = 0;
  }

  const rawHeaderRow = matrix[bestRowIdx] || [];
  const usedNames = new Map<string, number>();
  const headers: string[] = rawHeaderRow.map((cell, idx) => {
    const base = safeCellToString(cell) || `Column ${idx + 1}`;
    const count = usedNames.get(base) || 0;
    usedNames.set(base, count + 1);
    return count > 0 ? `${base} (${count + 1})` : base;
  });

  const findHeaderByAliases = (aliases: Set<string>): string => {
    // Exact alias match
    for (const h of headers) {
      if (aliases.has(normalizePurchaseHeader(h))) return h;
    }
    return '';
  };

  let bansalCode = findHeaderByAliases(BANSAL_CODE_HEADER_ALIASES);
  let itemName = findHeaderByAliases(ITEM_NAME_HEADER_ALIASES);
  let purchaseName = findHeaderByAliases(PURCHASE_NAME_HEADER_ALIASES);
  let phone = findHeaderByAliases(PHONE_HEADER_ALIASES);

  // Secondary fuzzy header matching if any core column wasn't found via exact alias
  if (!bansalCode) {
    bansalCode = headers.find((h) => {
      const n = normalizePurchaseHeader(h);
      return n.includes('BANSAL') || n === 'CODE' || n.endsWith('CODE');
    }) || '';
  }
  if (!purchaseName) {
    purchaseName = headers.find((h) => {
      const n = normalizePurchaseHeader(h);
      return (n.includes('PURCHASE') || n.includes('PUCHASE')) && (n.includes('NAME') || n.includes('PERSON'));
    }) || '';
  }
  if (!phone) {
    phone = headers.find((h) => {
      const n = normalizePurchaseHeader(h);
      return n.includes('PUCHASENB') || n.includes('PURCHASENB') || n.includes('PHONE') || n.includes('MOBILE') || n.includes('WHATSAPP') || n.includes('CONTACT');
    }) || '';
  }
  if (!itemName) {
    itemName = headers.find((h) => {
      const n = normalizePurchaseHeader(h);
      return n.includes('ITEM') && n.includes('NAME');
    }) || '';
  }

  return {
    headerRowIndex: bestRowIdx,
    headers,
    mapping: {
      bansalCode,
      itemName,
      purchaseName,
      phone,
    },
    previewRows: matrix.slice(bestRowIdx + 1, bestRowIdx + 6),
  };
}

/**
 * Computes diff between the newly validated master and the currently active master.
 */
export function computePurchaseMasterDiff(
  nextRecords: PurchaseResponsibilityRecord[],
  previousRecords: PurchaseResponsibilityRecord[]
): PurchaseMasterDiffSummary {
  const hasPreviousMaster = previousRecords.length > 0;

  const formatContactLabel = (r: PurchaseResponsibilityRecord) => {
    const name = r.purchasePersonName || 'Unnamed';
    const phone = r.displayPhone || r.rawPhone || 'No phone';
    return `${name} (${phone})`;
  };

  const groupByCode = (records: PurchaseResponsibilityRecord[]) => {
    const map = new Map<string, PurchaseResponsibilityRecord[]>();
    for (const r of records) {
      const list = map.get(r.bansalCode) || [];
      list.push(r);
      map.set(r.bansalCode, list);
    }
    return map;
  };

  const prevMap = groupByCode(previousRecords);
  const nextMap = groupByCode(nextRecords);

  const canonicalSignature = (records: PurchaseResponsibilityRecord[]) =>
    records
      .map(
        (r) =>
          `${r.purchasePersonName.trim().toLowerCase()}|${r.normalizedPhoneDigits || r.rawPhone.trim().toLowerCase()}|${r.phoneStatus}`
      )
      .sort()
      .join('||');

  const addedCodes: PurchaseDiffEntry[] = [];
  const changedCodes: PurchaseDiffEntry[] = [];
  const removedCodes: PurchaseDiffEntry[] = [];
  let unchangedCount = 0;

  for (const [code, nextList] of nextMap.entries()) {
    const prevList = prevMap.get(code);
    if (!prevList) {
      addedCodes.push({
        bansalCode: code,
        itemName: nextList[0]?.itemName,
        previousContacts: [],
        nextContacts: nextList.map(formatContactLabel),
      });
    } else if (canonicalSignature(prevList) !== canonicalSignature(nextList)) {
      changedCodes.push({
        bansalCode: code,
        itemName: nextList[0]?.itemName || prevList[0]?.itemName,
        previousContacts: prevList.map(formatContactLabel),
        nextContacts: nextList.map(formatContactLabel),
      });
    } else {
      unchangedCount++;
    }
  }

  for (const [code, prevList] of prevMap.entries()) {
    if (!nextMap.has(code)) {
      removedCodes.push({
        bansalCode: code,
        itemName: prevList[0]?.itemName,
        previousContacts: prevList.map(formatContactLabel),
        nextContacts: [],
      });
    }
  }

  return {
    hasPreviousMaster,
    addedCodes,
    changedCodes,
    removedCodes,
    unchangedCount,
  };
}

/**
 * Validates and transforms a sheet matrix using the selected column mapping into
 * deduplicated PurchaseResponsibilityRecord items, conflict flags, issue diagnostics, and diff vs previous master.
 */
export function buildPurchaseResponsibilityImportPreview(params: {
  fileName: string;
  sheetName: string;
  matrix: any[][];
  headerRowIndex: number;
  headers: string[];
  mapping: PurchaseColumnMapping;
  previousRecords?: PurchaseResponsibilityRecord[];
}): PurchaseValidationResult {
  const {
    fileName,
    sheetName,
    matrix,
    headerRowIndex,
    headers,
    mapping,
    previousRecords = [],
  } = params;

  const codeColIdx = mapping.bansalCode ? headers.indexOf(mapping.bansalCode) : -1;
  const itemNameColIdx = mapping.itemName ? headers.indexOf(mapping.itemName) : -1;
  const purchaseNameColIdx = mapping.purchaseName ? headers.indexOf(mapping.purchaseName) : -1;
  const phoneColIdx = mapping.phone ? headers.indexOf(mapping.phone) : -1;

  if (codeColIdx === -1 || purchaseNameColIdx === -1 || phoneColIdx === -1) {
    const missingCols: string[] = [];
    if (codeColIdx === -1) missingCols.push('Bansal Code');
    if (purchaseNameColIdx === -1) missingCols.push('Purchase Person Name');
    if (phoneColIdx === -1) missingCols.push('Phone Number');
    return {
      fileName,
      sheetName,
      totalRowsRead: 0,
      validRecords: [],
      uniqueProductCodesCount: 0,
      missingCodeRowsCount: 0,
      missingNameCount: 0,
      missingOrInvalidPhoneCount: 0,
      deduplicatedCount: 0,
      conflictingCodes: [],
      rowPreviews: [],
      issueRows: [],
      diff: computePurchaseMasterDiff([], previousRecords),
      isValidToActivate: false,
      blockingError: `Please map required columns: ${missingCols.join(', ')}.`,
    };
  }

  let totalRowsRead = 0;
  let missingCodeRowsCount = 0;
  let missingNameCount = 0;
  let missingOrInvalidPhoneCount = 0;
  let deduplicatedCount = 0;

  const validRecords: PurchaseResponsibilityRecord[] = [];
  const rowPreviews: PurchaseRowPreview[] = [];
  const issueRows: PurchaseValidationResult['issueRows'] = [];
  const seenAssignments = new Set<string>();

  for (let r = headerRowIndex + 1; r < matrix.length; r++) {
    const row = matrix[r];
    if (!Array.isArray(row)) continue;
    const hasContent = row.some((cell) => safeCellToString(cell) !== '');
    if (!hasContent) continue;

    totalRowsRead++;
    const excelRowNum = r + 1;

    const bansalCode = cleanBansalCodePreserveZeros(row[codeColIdx]);
    const itemName = itemNameColIdx !== -1 ? safeCellToString(row[itemNameColIdx]) : '';
    const purchasePersonName = safeCellToString(row[purchaseNameColIdx]);
    const phoneInfo = normalizePurchasePhone(row[phoneColIdx]);

    if (!bansalCode) {
      missingCodeRowsCount++;
      issueRows.push({
        rowNumber: excelRowNum,
        bansalCode: '',
        purchasePersonName,
        rawPhone: phoneInfo.rawPhone,
        reason: 'Missing Bansal Code',
      });
      continue;
    }

    if (!purchasePersonName) {
      missingNameCount++;
      issueRows.push({
        rowNumber: excelRowNum,
        bansalCode,
        purchasePersonName: '',
        rawPhone: phoneInfo.rawPhone,
        reason: 'Missing Purchase Person Name',
      });
      continue;
    }

    if (phoneInfo.phoneStatus !== 'valid_indian' && phoneInfo.phoneStatus !== 'valid_international') {
      missingOrInvalidPhoneCount++;
      issueRows.push({
        rowNumber: excelRowNum,
        bansalCode,
        purchasePersonName,
        rawPhone: phoneInfo.rawPhone,
        reason: phoneInfo.phoneError || 'Missing or invalid phone number',
      });
    }

    // Deduplicate identical (bansalCode + personName + normalizedPhone/rawPhone) assignments
    const phoneKey = phoneInfo.normalizedPhoneDigits || phoneInfo.rawPhone.replace(/[\s()-]+/g, '').toLowerCase();
    const dedupKey = `${bansalCode}::${purchasePersonName.toLowerCase()}::${phoneKey}`;

    if (seenAssignments.has(dedupKey)) {
      deduplicatedCount++;
      continue;
    }
    seenAssignments.add(dedupKey);

    const record: PurchaseResponsibilityRecord = {
      id: `pr_${validRecords.length}_${bansalCode}`,
      bansalCode,
      itemName,
      purchasePersonName,
      rawPhone: phoneInfo.rawPhone,
      phoneStatus: phoneInfo.phoneStatus,
      phoneError: phoneInfo.phoneError,
      normalizedPhoneDigits: phoneInfo.normalizedPhoneDigits,
      displayPhone: phoneInfo.displayPhone,
      whatsappUrl: phoneInfo.whatsappUrl,
      telUrl: phoneInfo.telUrl,
    };

    validRecords.push(record);
    rowPreviews.push({
      rowNumber: excelRowNum,
      bansalCode,
      itemName,
      purchasePersonName,
      rawPhone: phoneInfo.rawPhone,
      phoneStatus: phoneInfo.phoneStatus,
      phoneError: phoneInfo.phoneError,
      normalizedPhoneDigits: phoneInfo.normalizedPhoneDigits,
      displayPhone: phoneInfo.displayPhone,
      whatsappUrl: phoneInfo.whatsappUrl,
      telUrl: phoneInfo.telUrl,
    });
  }

  // Group by code to detect conflicting assignments (multiple distinct contacts for same code)
  const recordsByCode = new Map<string, PurchaseResponsibilityRecord[]>();
  for (const rec of validRecords) {
    const list = recordsByCode.get(rec.bansalCode) || [];
    list.push(rec);
    recordsByCode.set(rec.bansalCode, list);
  }

  const conflictingCodes: PurchaseConflictGroup[] = [];
  const conflictingCodeSet = new Set<string>();

  for (const [code, contacts] of recordsByCode.entries()) {
    if (contacts.length > 1) {
      conflictingCodeSet.add(code);
      const itemNames = Array.from(new Set(contacts.map((c) => c.itemName).filter(Boolean)));
      conflictingCodes.push({
        bansalCode: code,
        itemNames,
        contacts,
      });
    }
  }

  for (const preview of rowPreviews) {
    if (conflictingCodeSet.has(preview.bansalCode)) {
      preview.isConflictingCode = true;
    }
  }

  const diff = computePurchaseMasterDiff(validRecords, previousRecords);
  const isValidToActivate = validRecords.length > 0;

  return {
    fileName,
    sheetName,
    totalRowsRead,
    validRecords,
    uniqueProductCodesCount: recordsByCode.size,
    missingCodeRowsCount,
    missingNameCount,
    missingOrInvalidPhoneCount,
    deduplicatedCount,
    conflictingCodes,
    rowPreviews,
    issueRows,
    diff,
    isValidToActivate,
    blockingError: isValidToActivate
      ? undefined
      : 'No valid purchase assignments with Bansal Code and Purchase Person Name were found.',
  };
}

/**
 * Builds PurchaseResponsibilityMeta from a validated import preview.
 */
export function buildPurchaseMasterMeta(
  validation: PurchaseValidationResult,
  importedAt: string = new Date().toISOString()
): PurchaseResponsibilityMeta {
  return {
    id: 'active_purchase_master',
    fileName: validation.fileName,
    sheetName: validation.sheetName,
    importedAt,
    totalRowsRead: validation.totalRowsRead,
    validAssignmentsCount: validation.validRecords.length,
    uniqueProductCodesCount: validation.uniqueProductCodesCount,
    missingNameCount: validation.missingNameCount,
    missingOrInvalidPhoneCount: validation.missingOrInvalidPhoneCount,
    deduplicatedCount: validation.deduplicatedCount,
    conflictingCodesCount: validation.conflictingCodes.length,
    storageScope: 'device_local',
  };
}

/**
 * Resolves purchase contacts for a selected product strictly by its Bansal internal item code:
 * 1. Exact code match first (preserving leading zeros).
 * 2. Secondary digits-only comparison ignoring leading zeros ONLY when:
 *    - product code is digits-only (/^\d+$/)
 *    - it identifies ONE unambiguous master code (even if that one code has multiple contacts).
 * 3. Never matches by barcode, mainCode, or product name.
 * 4. Never substitutes another product's contact.
 */
export function resolvePurchaseContactsForProduct(
  product: Partial<Product> | null | undefined,
  masterRecords: PurchaseResponsibilityRecord[]
): PurchaseContactResolution {
  const productBansalCode = getProductBansalCode(product);

  if (!productBansalCode) {
    return {
      status: 'no_product_code',
      productBansalCode: '',
      contacts: [],
      message: 'Purchase contact not assigned.',
    };
  }

  if (!masterRecords || masterRecords.length === 0) {
    return {
      status: 'not_assigned',
      productBansalCode,
      contacts: [],
      message: 'Purchase contact not assigned.',
    };
  }

  // Step 1: Exact Bansal Code match (preserving leading zeros)
  const exactMatches = masterRecords.filter((rec) => rec.bansalCode === productBansalCode);
  if (exactMatches.length > 0) {
    return {
      status: 'assigned',
      productBansalCode,
      matchedMasterCode: productBansalCode,
      matchType: 'exact',
      contacts: exactMatches,
    };
  }

  // Step 2: Secondary digits-only match ignoring leading zeros
  if (/^\d+$/.test(productBansalCode)) {
    const strippedTarget = productBansalCode.replace(/^0+/, '') || '0';
    const matchingByCode = new Map<string, PurchaseResponsibilityRecord[]>();

    for (const rec of masterRecords) {
      if (/^\d+$/.test(rec.bansalCode)) {
        const strippedRec = rec.bansalCode.replace(/^0+/, '') || '0';
        if (strippedRec === strippedTarget) {
          const list = matchingByCode.get(rec.bansalCode) || [];
          list.push(rec);
          matchingByCode.set(rec.bansalCode, list);
        }
      }
    }

    if (matchingByCode.size === 1) {
      const [[matchedMasterCode, contacts]] = Array.from(matchingByCode.entries());
      return {
        status: 'assigned',
        productBansalCode,
        matchedMasterCode,
        matchType: 'leading_zero_normalized',
        contacts,
      };
    }

    if (matchingByCode.size > 1) {
      const ambiguousCodeGroups = Array.from(matchingByCode.entries()).map(([masterCode, contacts]) => ({
        masterCode,
        contacts,
      }));
      return {
        status: 'ambiguous_code',
        productBansalCode,
        contacts: [],
        ambiguousCodeGroups,
        message: 'Multiple numeric codes in the responsibility master match after ignoring leading zeros.',
      };
    }
  }

  return {
    status: 'not_assigned',
    productBansalCode,
    contacts: [],
    message: 'Purchase contact not assigned.',
  };
}

export interface PurchaseContactLookupIndex {
  totalRecords: number;
  exactByCode: Map<string, PurchaseResponsibilityRecord[]>;
  strippedNumericByCode: Map<string, Map<string, PurchaseResponsibilityRecord[]>>;
}

/**
 * Builds an O(1) lookup index for purchase contacts so product cards and search results
 * resolve contacts instantaneously regardless of master size.
 */
export function buildPurchaseContactLookupIndex(
  masterRecords: PurchaseResponsibilityRecord[]
): PurchaseContactLookupIndex {
  const exactByCode = new Map<string, PurchaseResponsibilityRecord[]>();
  const strippedNumericByCode = new Map<string, Map<string, PurchaseResponsibilityRecord[]>>();

  if (!masterRecords || masterRecords.length === 0) {
    return { totalRecords: 0, exactByCode, strippedNumericByCode };
  }

  for (const rec of masterRecords) {
    const code = rec.bansalCode;
    if (!code) continue;

    let exactList = exactByCode.get(code);
    if (!exactList) {
      exactList = [];
      exactByCode.set(code, exactList);
    }
    exactList.push(rec);

    if (/^\d+$/.test(code)) {
      const stripped = code.replace(/^0+/, '') || '0';
      let codeGroup = strippedNumericByCode.get(stripped);
      if (!codeGroup) {
        codeGroup = new Map<string, PurchaseResponsibilityRecord[]>();
        strippedNumericByCode.set(stripped, codeGroup);
      }
      let list = codeGroup.get(code);
      if (!list) {
        list = [];
        codeGroup.set(code, list);
      }
      list.push(rec);
    }
  }

  return {
    totalRecords: masterRecords.length,
    exactByCode,
    strippedNumericByCode,
  };
}

/**
 * O(1) contact resolution using a pre-built PurchaseContactLookupIndex.
 */
export function resolvePurchaseContactsFromIndex(
  product: Partial<Product> | null | undefined,
  index: PurchaseContactLookupIndex
): PurchaseContactResolution {
  const productBansalCode = getProductBansalCode(product);

  if (!productBansalCode) {
    return {
      status: 'no_product_code',
      productBansalCode: '',
      contacts: [],
      message: 'Purchase contact not assigned.',
    };
  }

  if (index.totalRecords === 0) {
    return {
      status: 'not_assigned',
      productBansalCode,
      contacts: [],
      message: 'Purchase contact not assigned.',
    };
  }

  const exactMatches = index.exactByCode.get(productBansalCode);
  if (exactMatches && exactMatches.length > 0) {
    return {
      status: 'assigned',
      productBansalCode,
      matchedMasterCode: productBansalCode,
      matchType: 'exact',
      contacts: exactMatches,
    };
  }

  if (/^\d+$/.test(productBansalCode)) {
    const strippedTarget = productBansalCode.replace(/^0+/, '') || '0';
    const matchingByCode = index.strippedNumericByCode.get(strippedTarget);

    if (matchingByCode && matchingByCode.size === 1) {
      const [[matchedMasterCode, contacts]] = Array.from(matchingByCode.entries());
      return {
        status: 'assigned',
        productBansalCode,
        matchedMasterCode,
        matchType: 'leading_zero_normalized',
        contacts,
      };
    }

    if (matchingByCode && matchingByCode.size > 1) {
      const ambiguousCodeGroups = Array.from(matchingByCode.entries()).map(([masterCode, contacts]) => ({
        masterCode,
        contacts,
      }));
      return {
        status: 'ambiguous_code',
        productBansalCode,
        contacts: [],
        ambiguousCodeGroups,
        message: 'Multiple numeric codes in the responsibility master match after ignoring leading zeros.',
      };
    }
  }

  return {
    status: 'not_assigned',
    productBansalCode,
    contacts: [],
    message: 'Purchase contact not assigned.',
  };
}
