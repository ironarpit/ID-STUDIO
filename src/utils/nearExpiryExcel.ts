import ExcelJS from 'exceljs';
import { NearExpiryBatch, NearExpiryItem, HoImportMatchResult, Product } from '../types';
import {
  formatDateDDMMYYYY,
  interpretHoRemark,
  evaluateItemStatus,
  calculateShelfLife,
  getDaysRemaining,
  parseToMidnightDate
} from './nearExpiryEngine';
import { normalizeLocalCode, normalizeScannedBarcode } from './barcodeResolver';

/**
 * Downloads a genuine .xlsx file for HO following the exact source format.
 * All 21 operational columns, with EAN and Bansal Code formatted as text
 * so leading zeros are strictly preserved.
 */
export async function downloadHoNearExpiryExcel(
  batch: NearExpiryBatch,
  items: NearExpiryItem[]
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'ID STUDIO Floor IQ';
  workbook.lastModifiedBy = 'ID STUDIO Floor IQ';
  workbook.created = new Date();
  workbook.modified = new Date();

  const sheetName = 'Near Expiry';
  const worksheet = workbook.addWorksheet(sheetName, {
    views: [{ showGridLines: true }]
  });

  // 21 Required Columns matching source operational structure
  worksheet.columns = [
    { header: 'SR NO.', key: 'srNo', width: 8 },
    { header: 'Store Name', key: 'storeName', width: 16 },
    { header: 'EAN CODE', key: 'ean', width: 18 },
    { header: 'Bansal Code', key: 'bansalCode', width: 16 },
    { header: 'MAIN CODE', key: 'mainCode', width: 14 },
    { header: 'Category', key: 'category', width: 22 },
    { header: 'ITEM NAME', key: 'itemName', width: 36 },
    { header: 'NONDEBIT AND DEBIT', key: 'debitStatus', width: 20 },
    { header: 'MRP', key: 'mrp', width: 12 },
    { header: 'COST', key: 'cost', width: 12 },
    { header: 'VALUE', key: 'value', width: 14 },
    { header: 'Near Expiry Stock', key: 'nearExpiryStock', width: 18 },
    { header: 'MTD Sale', key: 'mtdSale', width: 12 },
    { header: 'MFG Date', key: 'mfgDate', width: 14 },
    { header: 'Expiry Date', key: 'expiryDate', width: 14 },
    { header: 'Today date', key: 'todayDate', width: 14 },
    { header: 'TOTAL DAYS', key: 'totalDays', width: 14 },
    { header: 'Pending Self Life in Days', key: 'pendingDays', width: 24 },
    { header: 'Pending Self Life %', key: 'pendingPct', width: 20 },
    { header: 'SUPPLIER', key: 'supplier', width: 28 },
    { header: 'REMARK', key: 'remark', width: 32 }
  ];

  // Style Header Row (Row 1)
  const headerRow = worksheet.getRow(1);
  headerRow.height = 28;
  headerRow.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1E293B' } // Slate-800
  };

  const todayFormatted = formatDateDDMMYYYY(new Date());

  // Populate Data Rows
  items.forEach((item, index) => {
    // Live integer calculation against current device date
    const liveLife = calculateShelfLife(item.mfgDate, item.expiryDate);
    const liveTotalDays = liveLife.totalDays > 0 ? liveLife.totalDays : (item.totalDays || 0);
    const livePendingDays = liveLife.pendingDays;
    const livePendingPct = liveTotalDays > 0
      ? `${Number(liveLife.pendingPct || 0).toFixed(1)}%`
      : item.pendingPct !== undefined
      ? `${Number(item.pendingPct || 0).toFixed(1)}%`
      : '0.0%';

    const addedRow = worksheet.addRow({
      srNo: index + 1,
      storeName: 'PATAN',
      ean: item.barcode ? String(item.barcode) : '',
      bansalCode: item.bansalCode ? String(item.bansalCode) : '',
      mainCode: item.mainCode || '',
      category: item.category || '',
      itemName: item.itemName || '',
      debitStatus: item.debitStatus || 'NON DEBIT',
      mrp: Number(item.mrp || 0),
      cost: Number(item.cost || 0),
      value: Number(item.value || 0),
      nearExpiryStock: Number(item.nearExpiryStock || 0),
      mtdSale: Number(item.mtdSale || 0),
      mfgDate: formatDateDDMMYYYY(item.mfgDate),
      expiryDate: formatDateDDMMYYYY(item.expiryDate),
      todayDate: todayFormatted,
      totalDays: Number(liveTotalDays || 0),
      pendingDays: Number(livePendingDays || 0),
      pendingPct: livePendingPct,
      supplier: item.supplier || '',
      remark: item.hoRemark ? String(item.hoRemark).trim() : '' // Strictly blank before HO response!
    });

    addedRow.height = 20;
    addedRow.font = { name: 'Arial', size: 9 };
    addedRow.alignment = { vertical: 'middle' };

    // Format individual cells
    const cellSr = addedRow.getCell('srNo');
    cellSr.alignment = { vertical: 'middle', horizontal: 'center' };

    // Strict text formatting for EAN and Bansal Code to preserve leading zeros
    const cellEan = addedRow.getCell('ean');
    cellEan.numFmt = '@';
    cellEan.value = item.barcode ? String(item.barcode) : '';
    cellEan.alignment = { vertical: 'middle', horizontal: 'left' };

    const cellCode = addedRow.getCell('bansalCode');
    cellCode.numFmt = '@';
    cellCode.value = item.bansalCode ? String(item.bansalCode) : '';
    cellCode.alignment = { vertical: 'middle', horizontal: 'left' };

    // Numeric formats
    addedRow.getCell('mrp').numFmt = '#,##0.00';
    addedRow.getCell('cost').numFmt = '#,##0.00';
    addedRow.getCell('value').numFmt = '#,##0.00';
    addedRow.getCell('nearExpiryStock').numFmt = '#,##0';
    addedRow.getCell('mtdSale').numFmt = '#,##0';
    addedRow.getCell('totalDays').numFmt = '#,##0';
    addedRow.getCell('pendingDays').numFmt = '#,##0';

    // Center alignment for dates & metrics
    addedRow.getCell('mfgDate').alignment = { vertical: 'middle', horizontal: 'center' };
    addedRow.getCell('expiryDate').alignment = { vertical: 'middle', horizontal: 'center' };
    addedRow.getCell('todayDate').alignment = { vertical: 'middle', horizontal: 'center' };
    addedRow.getCell('totalDays').alignment = { vertical: 'middle', horizontal: 'right' };
    addedRow.getCell('pendingDays').alignment = { vertical: 'middle', horizontal: 'right' };
    addedRow.getCell('pendingPct').alignment = { vertical: 'middle', horizontal: 'right' };

    // Thin borders for grid cleanlines
    const borderStyle: Partial<ExcelJS.Borders> = {
      top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
    };
    addedRow.eachCell((cell) => {
      cell.border = borderStyle;
    });
  });

  // Write buffer and trigger browser download
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;

  // Clean filename: Near_Expiry_PATAN_Fortnight_YYYYMMDD.xlsx
  const effectiveStoreName = batch.storeName && batch.storeName !== 'Store 1' ? batch.storeName : 'PATAN';
  const safeStore = effectiveStoreName.replace(/[^a-zA-Z0-9]/g, '_');
  const safeBatch = (batch.name || 'Fortnight').replace(/[^a-zA-Z0-9]/g, '_');
  const todayIso = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  a.download = `Near_Expiry_${safeStore}_${safeBatch}_${todayIso}.xlsx`;

  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Safely extracts raw text from an ExcelJS cell value across plain strings, numbers,
 * dates, rich text objects, formulas with result values, and text properties.
 * NEVER returns "[object Object]".
 */
export function extractCellText(cellValue: any): string {
  if (cellValue === null || cellValue === undefined) return '';
  if (typeof cellValue === 'string') return cellValue.trim();
  if (typeof cellValue === 'number' || typeof cellValue === 'boolean') return String(cellValue).trim();
  if (cellValue instanceof Date) {
    // Format date as DD/MM/YYYY or ISO
    const d = cellValue.getDate().toString().padStart(2, '0');
    const m = (cellValue.getMonth() + 1).toString().padStart(2, '0');
    const y = cellValue.getFullYear();
    return `${d}/${m}/${y}`;
  }
  if (typeof cellValue === 'object') {
    if (Array.isArray(cellValue.richText)) {
      return cellValue.richText
        .map((rt: any) => (rt && typeof rt.text === 'string' ? rt.text : (rt ? String(rt) : '')))
        .join('')
        .trim();
    }
    if (cellValue.result !== undefined && cellValue.result !== null) {
      return extractCellText(cellValue.result);
    }
    if (cellValue.text !== undefined && cellValue.text !== null) {
      return extractCellText(cellValue.text);
    }
    if (cellValue.sharedString !== undefined && cellValue.sharedString !== null) {
      return extractCellText(cellValue.sharedString);
    }
    if (cellValue.value !== undefined && cellValue.value !== null) {
      return extractCellText(cellValue.value);
    }
    return '';
  }
  return String(cellValue).trim();
}

/**
 * Normalizes header strings by trimming, lowercasing, and stripping all spaces/punctuation/underscores/hyphens.
 */
export function normalizeHeaderName(val: any): string {
  const text = extractCellText(val);
  return text.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Normalizes Bansal Code as 9-digit text:
 * - String
 * - trim
 * - remove trailing .0
 * - digits only
 * - padStart(9, '0')
 * Examples: 13001223 -> "013001223", 2003907 -> "002003907"
 */
export function normalizeBansalCode9Digits(val: any): string {
  if (val === null || val === undefined) return '';
  let str = extractCellText(val);
  str = str.replace(/\.0+$/, '').trim();
  const digits = str.replace(/\D/g, '');
  if (!digits) return '';
  return digits.padStart(9, '0');
}

/**
 * Normalizes EAN Code as string without padding to 9 digits and avoiding scientific notation.
 */
export function normalizeEanString(val: any): string {
  if (val === null || val === undefined) return '';
  if (typeof val === 'number') {
    if (!isNaN(val) && isFinite(val)) {
      return Math.round(val).toLocaleString('fullwide', { useGrouping: false });
    }
  }
  const str = extractCellText(val);
  if (/^[0-9]+(\.[0-9]+)?[eE]\+[0-9]+$/.test(str.trim())) {
    const num = Number(str.trim());
    if (!isNaN(num) && isFinite(num)) {
      return Math.round(num).toLocaleString('fullwide', { useGrouping: false });
    }
  }
  return str.replace(/\.0+$/, '').trim();
}

// 22 Expected Columns and Safe Aliases
const SR_NO_ALIASES = new Set(['srno', 'sno', 'slno', 'serialno', 'srn', 'sr']);
const STORE_ALIASES = new Set(['storename', 'store', 'branch', 'branchname', 'location', 'unit']);
const EAN_ALIASES = new Set(['eancode', 'ean', 'barcode', 'barcodeean']);
const CODE_ALIASES = new Set(['bansalcode', 'bansalitemcode', 'localcode', 'itemcode', 'productcode', 'materialcode', 'articlecode', 'sapcode', 'bcode', 'code']);
const MAIN_CODE_ALIASES = new Set(['maincode', 'mcode', 'groupcode']);
const CATEGORY_ALIASES = new Set(['category', 'cat', 'categoryname', 'dept', 'department', 'group']);
const ITEM_NAME_ALIASES = new Set(['itemname', 'item', 'productname', 'product', 'description', 'particulars', 'itemdescription', 'productdescription', 'articlename', 'materialname', 'name']);
const PURCHASE_NAME_ALIASES = new Set(['purchasename', 'pname', 'purchaseitemname', 'supplieritemname', 'supplierproductname']);
const DEBIT_ALIASES = new Set(['nondebitanddebit', 'debitnondebit', 'debitstatus', 'debit', 'nondebit', 'debitordebit', 'nondebitdebit', 'debitornondebit']);
const MRP_ALIASES = new Set(['mrp', 'maximumretailprice', 'mrpval', 'unitmrp']);
const COST_ALIASES = new Set(['cost', 'costprice', 'rate', 'unitcost']);
const VALUE_ALIASES = new Set(['value', 'totalvalue', 'stockvalue', 'amount']);
const STOCK_ALIASES = new Set(['nearexpirystock', 'nearexpiryqty', 'expirystock', 'stock', 'qty', 'quantity', 'nearstock']);
const MTD_SALE_ALIASES = new Set(['mtdsale', 'mtdsales', 'mtdqty', 'mtd']);
const MFG_DATE_ALIASES = new Set(['mfgdate', 'mfg', 'manufacturingdate', 'dom']);
const EXPIRY_DATE_ALIASES = new Set(['expirydate', 'expiry', 'expdate', 'exp', 'doe']);
const TODAY_DATE_ALIASES = new Set(['todaydate', 'today', 'currentdate', 'reportdate', 'asondate', 'date']);
const TOTAL_DAYS_ALIASES = new Set(['totaldays', 'shelflife', 'totalshelflife', 'totalshelfdays']);
const PENDING_DAYS_ALIASES = new Set(['pendingselflifeindays', 'pendingshelflifeindays', 'pendingshelflife', 'pendingselflife', 'pendingdays', 'remainingdays', 'shelfleftdays']);
const PENDING_PCT_ALIASES = new Set(['pendingselflifepercent', 'pendingshelflifepercent', 'pendingselflifepct', 'pendingshelflifepct', 'pendingselflife', 'pendingshelflife', 'pendingpct', 'remainingpct', 'pendinglife']);
const SUPPLIER_ALIASES = new Set(['supplier', 'suppliername', 'vendor', 'vendorname', 'party', 'partyname']);
const REMARK_ALIASES = new Set([
  'remark',
  'remarks',
  'horemark',
  'horemarks',
  'comment',
  'comments',
  'hocomment',
  'hocomments',
  'hodecision',
  'decision',
  'hoaction',
  'action',
  'instruction',
  'instructions',
  'hoinstruction',
  'hoinstructions',
  'hostatus',
  'horeturn',
  'returnremark'
]);

/**
 * Normalizes an item name specifically for matching:
 * - trim
 * - uppercase
 * - collapse repeated whitespace
 * - normalize common punctuation spacing
 * Does NOT overwrite the original HO item name.
 */
export function normalizeItemNameForMatching(name: any): string {
  if (!name) return '';
  let s = extractCellText(name).trim().toUpperCase();
  // Standardize spaces around common punctuation marks
  s = s.replace(/\s*([-,/&+*():.])\s*/g, ' $1 ');
  // Collapse repeated whitespace
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

function parseNumberValue(val: any): number | undefined {
  if (val === null || val === undefined || val === '') return undefined;
  if (typeof val === 'number') return isNaN(val) ? undefined : val;
  const str = extractCellText(val).replace(/,/g, '').replace(/[^0-9.-]/g, '');
  if (!str) return undefined;
  const n = parseFloat(str);
  return isNaN(n) ? undefined : n;
}

function toCanonicalDateString(val: unknown): string {
  const d = parseToMidnightDate(val);
  if (!d) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function normalizeDateString(val: any): string {
  return toCanonicalDateString(val);
}

/**
 * Parses and imports an HO-returned Excel workbook.
 *
 * STANDALONE WORKFLOW:
 * - Does NOT require a pre-populated Prepare List or current fortnight batch.
 * - Every valid row in the detailed Near Expiry sheet is imported as an authoritative Near Expiry item.
 * - Optional Local Linking: If a product already exists in activeItems (by 9-digit Bansal code or EAN),
 *   it is merged/linked preserving local data, history, and HO response.
 * - If no local item exists, a new HO-imported Near Expiry item is created.
 * - Optional Stock IQ Enrichment: Looks up product in Stock Master database (stockProducts)
 *   by Bansal code or EAN, enriching item data with current stock details.
 * - Action Engine: All rows with remarks are interpreted immediately for Take Action / Waiting.
 */
export async function importHoReturnedExcel(
  file: File,
  activeItems: NearExpiryItem[] = [],
  targetStoreName?: string,
  stockProducts: Product[] = [],
  batchId?: string
): Promise<HoImportMatchResult> {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(arrayBuffer);

  // Step 1: Detect Worksheet with Prioritized Selection
  // Priority 1: Sheet named "NEAR EXPIRY LIST" (normalized: "nearexpirylist")
  // Priority 2: Other sheets whose name is NOT "sheet1", "purchaselist", "purchase list", etc.
  // Priority 3: Remaining sheets as fallback
  const prioritizedSheets = [...workbook.worksheets].sort((a, b) => {
    const aNorm = normalizeHeaderName(a.name);
    const bNorm = normalizeHeaderName(b.name);
    const aIsNearExpiry = aNorm.includes('nearexpirylist') || aNorm === 'nearexpiry';
    const bIsNearExpiry = bNorm.includes('nearexpirylist') || bNorm === 'nearexpiry';
    if (aIsNearExpiry && !bIsNearExpiry) return -1;
    if (!aIsNearExpiry && bIsNearExpiry) return 1;

    const aIsExcluded = aNorm.includes('purchaselist') || aNorm === 'sheet1';
    const bIsExcluded = bNorm.includes('purchaselist') || bNorm === 'sheet1';
    if (!aIsExcluded && bIsExcluded) return -1;
    if (aIsExcluded && !bIsExcluded) return 1;

    return 0;
  });

  let targetWorksheet: ExcelJS.Worksheet | null = null;
  let detectedSheetName = '';
  let headerRowIndex = -1;
  let detectedHeaderNames: string[] = [];

  let srNoCol = -1;
  let storeCol = -1;
  let eanCol = -1;
  let codeCol = -1;
  let mainCodeCol = -1;
  let categoryCol = -1;
  let itemCol = -1;
  let purchaseNameCol = -1;
  let debitCol = -1;
  let mrpCol = -1;
  let costCol = -1;
  let valCol = -1;
  let stockCol = -1;
  let mtdCol = -1;
  let mfgCol = -1;
  let expCol = -1;
  let todayDateCol = -1;
  let totalDaysCol = -1;
  let pendingDaysCol = -1;
  let pendingPctCol = -1;
  let supplierCol = -1;
  let remarkCol = -1;

  let bestSheetScore = -1;

  for (const sheet of prioritizedSheets) {
    if (!sheet || sheet.rowCount === 0) continue;
    const sheetNorm = normalizeHeaderName(sheet.name);
    const isPreferredSheet = sheetNorm.includes('nearexpirylist') || sheetNorm === 'nearexpiry';

    for (let r = 1; r <= Math.min(sheet.rowCount, 15); r++) {
      const row = sheet.getRow(r);
      let fSrNo = -1, fStore = -1, fEan = -1, fCode = -1, fMainCode = -1;
      let fCategory = -1, fItem = -1, fPurchaseName = -1, fDebit = -1;
      let fMrp = -1, fCost = -1, fVal = -1, fStock = -1, fMtd = -1;
      let fMfg = -1, fExp = -1, fTodayDate = -1, fTotalDays = -1;
      let fPendingDays = -1, fPendingPct = -1, fSupplier = -1, fRemark = -1;

      const rowHeaders: string[] = [];

      row.eachCell((cell, colNumber) => {
        const rawText = extractCellText(cell.value);
        if (rawText) rowHeaders.push(rawText);
        const norm = normalizeHeaderName(cell.value);
        if (!norm) return;

        if (SR_NO_ALIASES.has(norm)) fSrNo = colNumber;
        else if (STORE_ALIASES.has(norm)) fStore = colNumber;
        else if (EAN_ALIASES.has(norm)) fEan = colNumber;
        else if (CODE_ALIASES.has(norm)) fCode = colNumber;
        else if (MAIN_CODE_ALIASES.has(norm)) fMainCode = colNumber;
        else if (CATEGORY_ALIASES.has(norm)) fCategory = colNumber;
        else if (ITEM_NAME_ALIASES.has(norm)) fItem = colNumber;
        else if (PURCHASE_NAME_ALIASES.has(norm)) fPurchaseName = colNumber;
        else if (DEBIT_ALIASES.has(norm)) fDebit = colNumber;
        else if (MRP_ALIASES.has(norm)) fMrp = colNumber;
        else if (COST_ALIASES.has(norm)) fCost = colNumber;
        else if (VALUE_ALIASES.has(norm)) fVal = colNumber;
        else if (STOCK_ALIASES.has(norm)) fStock = colNumber;
        else if (MTD_SALE_ALIASES.has(norm)) fMtd = colNumber;
        else if (MFG_DATE_ALIASES.has(norm)) fMfg = colNumber;
        else if (EXPIRY_DATE_ALIASES.has(norm)) fExp = colNumber;
        else if (TODAY_DATE_ALIASES.has(norm)) fTodayDate = colNumber;
        else if (TOTAL_DAYS_ALIASES.has(norm)) fTotalDays = colNumber;
        else if (PENDING_DAYS_ALIASES.has(norm)) fPendingDays = colNumber;
        else if (PENDING_PCT_ALIASES.has(norm)) fPendingPct = colNumber;
        else if (SUPPLIER_ALIASES.has(norm)) fSupplier = colNumber;
        else if (REMARK_ALIASES.has(norm)) fRemark = colNumber;
      });

      // Header row check: must have at least one product identifier (Item Name, Code, or EAN)
      // and at least one other column (mrp, cost, val, stock, mfg, exp, store, remark, debit, etc.)
      const hasIdentifier = fItem !== -1 || fCode !== -1 || fEan !== -1;
      const countOtherCols =
        (fRemark !== -1 ? 1 : 0) +
        (fExp !== -1 ? 1 : 0) +
        (fStock !== -1 ? 1 : 0) +
        (fMrp !== -1 ? 1 : 0) +
        (fCost !== -1 ? 1 : 0) +
        (fMfg !== -1 ? 1 : 0) +
        (fStore !== -1 ? 1 : 0) +
        (fDebit !== -1 ? 1 : 0) +
        (fVal !== -1 ? 1 : 0);

      if (hasIdentifier && countOtherCols >= 1) {
        let score = 0;
        if (fRemark !== -1) score += 15;
        if (fItem !== -1) score += 10;
        if (fCode !== -1) score += 10;
        if (fEan !== -1) score += 8;
        if (fExp !== -1) score += 8;
        if (fStock !== -1) score += 6;
        if (fMfg !== -1) score += 4;
        if (fStore !== -1) score += 4;
        if (fMrp !== -1) score += 3;
        if (fCost !== -1) score += 3;
        if (fCategory !== -1) score += 2;
        if (fDebit !== -1) score += 2;
        if (isPreferredSheet) score += 50; // Priority boost for NEAR EXPIRY LIST

        if (score > bestSheetScore) {
          bestSheetScore = score;
          targetWorksheet = sheet;
          detectedSheetName = sheet.name;
          headerRowIndex = r;
          detectedHeaderNames = rowHeaders;

          srNoCol = fSrNo;
          storeCol = fStore;
          eanCol = fEan;
          codeCol = fCode;
          mainCodeCol = fMainCode;
          categoryCol = fCategory;
          itemCol = fItem;
          purchaseNameCol = fPurchaseName;
          debitCol = fDebit;
          mrpCol = fMrp;
          costCol = fCost;
          valCol = fVal;
          stockCol = fStock;
          mtdCol = fMtd;
          mfgCol = fMfg;
          expCol = fExp;
          todayDateCol = fTodayDate;
          totalDaysCol = fTotalDays;
          pendingDaysCol = fPendingDays;
          pendingPctCol = fPendingPct;
          supplierCol = fSupplier;
          remarkCol = fRemark;

          if (isPreferredSheet) break;
        }
      }
    }
    if (isPreferredSheet && headerRowIndex !== -1) break;
  }

  if (!targetWorksheet || headerRowIndex === -1 || (itemCol === -1 && codeCol === -1 && eanCol === -1)) {
    throw new Error('Could not detect valid product columns (Item Name, Bansal Code, or EAN) in the Excel file.');
  }

  // Pre-index active items for optional local linking
  const activeByCode = new Map<string, NearExpiryItem[]>();
  const activeByBarcode = new Map<string, NearExpiryItem[]>();
  const activeByName = new Map<string, NearExpiryItem[]>();

  if (activeItems && activeItems.length > 0) {
    activeItems.forEach((item) => {
      // 9-digit normalized Bansal Code
      const normCode = normalizeBansalCode9Digits(item.bansalCode || item.rawProductData?.localCode);
      if (normCode) {
        const existing = activeByCode.get(normCode) || [];
        existing.push(item);
        activeByCode.set(normCode, existing);
      }

      // Exact string EAN barcode
      const normEan = normalizeEanString(item.barcode || item.rawProductData?.barcode);
      if (normEan) {
        const existing = activeByBarcode.get(normEan) || [];
        existing.push(item);
        activeByBarcode.set(normEan, existing);
      }

      // Normalized Item Name
      const normName = normalizeItemNameForMatching(item.itemName || item.rawProductData?.name);
      if (normName) {
        const existing = activeByName.get(normName) || [];
        existing.push(item);
        activeByName.set(normName, existing);
      }
    });
  }

  // Pre-index Stock Master products for optional enrichment
  const stockByCode = new Map<string, Product>();
  const stockByBarcode = new Map<string, Product>();

  if (stockProducts && stockProducts.length > 0) {
    stockProducts.forEach((p) => {
      const pCode = normalizeBansalCode9Digits(p.localCode || (p as any).bansalCode || p.id);
      if (pCode && !stockByCode.has(pCode)) {
        stockByCode.set(pCode, p);
      }
      const pBarcode = normalizeEanString(p.barcode);
      if (pBarcode && !stockByBarcode.has(pBarcode)) {
        stockByBarcode.set(pBarcode, p);
      }
    });
  }

  const updatedItemsMap = new Map<string, NearExpiryItem>();
  const unmatchedRows: HoImportMatchResult['unmatchedRows'] = [];
  const ambiguousRows: HoImportMatchResult['ambiguousRows'] = [];
  const matchedExistingIds = new Set<string>();
  let totalDataRows = 0;
  let linkedCount = 0;
  let newHoCount = 0;
  let stockMasterMatchedCount = 0;
  let stockMasterNotFoundCount = 0;
  let skippedCount = 0;

  // Step 2: Process Data Rows
  for (let r = headerRowIndex + 1; r <= targetWorksheet.rowCount; r++) {
    const row = targetWorksheet.getRow(r);

    const rawSrNo = srNoCol !== -1 ? extractCellText(row.getCell(srNoCol).value) : '';
    const rawStore = storeCol !== -1 ? extractCellText(row.getCell(storeCol).value) : '';
    const rawEan = eanCol !== -1 ? extractCellText(row.getCell(eanCol).value) : '';
    const rawCode = codeCol !== -1 ? extractCellText(row.getCell(codeCol).value) : '';
    const rawMainCode = mainCodeCol !== -1 ? extractCellText(row.getCell(mainCodeCol).value) : '';
    const rawCategory = categoryCol !== -1 ? extractCellText(row.getCell(categoryCol).value) : '';
    const rawItemName = itemCol !== -1 ? extractCellText(row.getCell(itemCol).value) : '';
    const rawPurchaseName = purchaseNameCol !== -1 ? extractCellText(row.getCell(purchaseNameCol).value) : '';
    const rawDebit = debitCol !== -1 ? extractCellText(row.getCell(debitCol).value) : '';
    const rawMrp = mrpCol !== -1 ? extractCellText(row.getCell(mrpCol).value) : '';
    const rawCost = costCol !== -1 ? extractCellText(row.getCell(costCol).value) : '';
    const rawVal = valCol !== -1 ? extractCellText(row.getCell(valCol).value) : '';
    const rawStock = stockCol !== -1 ? extractCellText(row.getCell(stockCol).value) : '';
    const rawMtd = mtdCol !== -1 ? extractCellText(row.getCell(mtdCol).value) : '';
    const rawMfg = mfgCol !== -1 ? extractCellText(row.getCell(mfgCol).value) : '';
    const rawExp = expCol !== -1 ? extractCellText(row.getCell(expCol).value) : '';
    const rawTodayDate = todayDateCol !== -1 ? extractCellText(row.getCell(todayDateCol).value) : '';
    const rawTotalDays = totalDaysCol !== -1 ? extractCellText(row.getCell(totalDaysCol).value) : '';
    const rawPendingDays = pendingDaysCol !== -1 ? extractCellText(row.getCell(pendingDaysCol).value) : '';
    const rawPendingPct = pendingPctCol !== -1 ? extractCellText(row.getCell(pendingPctCol).value) : '';
    const rawSupplier = supplierCol !== -1 ? extractCellText(row.getCell(supplierCol).value) : '';
    const rawRemark = remarkCol !== -1 ? extractCellText(row.getCell(remarkCol).value) : '';

    // Ignore completely blank rows
    if (!rawItemName && !rawRemark && !rawCode && !rawEan && !rawMrp && !rawStock) {
      continue;
    }

    // Row must have at least an item name, code, EAN, or remark to be valid
    if (!rawItemName && !rawCode && !rawEan && !rawRemark) {
      skippedCount++;
      continue;
    }

    totalDataRows++;

    const normCode = normalizeBansalCode9Digits(rawCode);
    const normEan = normalizeEanString(rawEan);
    const normName = normalizeItemNameForMatching(rawItemName);
    const numMrp = parseNumberValue(rawMrp);
    const numStock = parseNumberValue(rawStock);
    const canonExp = toCanonicalDateString(rawExp);
    const canonMfg = toCanonicalDateString(rawMfg);

    let matchedPreparedItem: NearExpiryItem | null = null;
    let isAmbiguous = false;
    let ambiguityReason = '';

    // =========================================================================
    // USER MANDATE: DO NOT MERGE SAME PRODUCT BY BANSAL CODE ALONE
    // The same product can have multiple Near Expiry entries with different expiry dates.
    // Each imported row should remain a separate Near Expiry entry unless it is an exact duplicate.
    // For exact duplicate detection use at minimum:
    // Bansal Code + Expiry Date + MFG Date (if available)
    // Never overwrite a product with a different expiry date just because it shares the same Bansal Code.
    // =========================================================================
    if (activeItems && activeItems.length > 0) {
      const candidatePool = activeItems.filter((it) => !matchedExistingIds.has(it.id));

      const matchedCandidates = candidatePool.filter((cand) => {
        const candCode = normalizeBansalCode9Digits(cand.bansalCode || cand.rawProductData?.localCode);
        const candEan = normalizeEanString(cand.barcode || cand.rawProductData?.barcode);
        const candExp = toCanonicalDateString(cand.expiryDate || cand.hoExpiryDate);
        const candMfg = toCanonicalDateString(cand.mfgDate || cand.hoMfgDate);

        // 1. Primary Identifier Match: Bansal Code or EAN
        const codeMatches = normCode && candCode && normCode === candCode;
        const eanMatches = (!codeMatches && normEan && candEan && normEan === candEan);
        if (!codeMatches && !eanMatches) {
          return false;
        }

        // 2. Strict Expiry Date Check:
        // If both have expiry date and they differ -> STRICTLY DIFFERENT LOTS! DO NOT MERGE!
        if (canonExp && candExp && canonExp !== candExp) {
          return false;
        }

        // 3. Strict MFG Date Check:
        // If both have MFG date and they differ -> STRICTLY DIFFERENT LOTS! DO NOT MERGE!
        if (canonMfg && candMfg && canonMfg !== candMfg) {
          return false;
        }

        // 4. Exact duplicate evaluation:
        if (canonExp && candExp && canonExp === candExp) {
          if (canonMfg && candMfg && canonMfg === candMfg) return true;
          if (!canonMfg || !candMfg) {
            if (numStock !== undefined && Math.abs((cand.nearExpiryStock || 0) - numStock) < 0.01) return true;
            return true;
          }
        }

        // 5. If neither has expiry date:
        if (!canonExp && !candExp) {
          if (numStock !== undefined && Math.abs((cand.nearExpiryStock || 0) - numStock) < 0.01) return true;
          if (numMrp !== undefined && Math.abs((cand.mrp || 0) - numMrp) < 1) return true;
        }

        return false;
      });

      if (matchedCandidates.length === 1) {
        matchedPreparedItem = matchedCandidates[0];
        matchedExistingIds.add(matchedPreparedItem.id);
      } else if (matchedCandidates.length > 1) {
        // Pick candidate with closest matching stock or first candidate
        const exactStock = numStock !== undefined
          ? matchedCandidates.find((c) => Math.abs((c.nearExpiryStock || 0) - numStock) < 0.01)
          : null;
        matchedPreparedItem = exactStock || matchedCandidates[0];
        matchedExistingIds.add(matchedPreparedItem.id);
      }
    }

    if (isAmbiguous) {
      ambiguousRows.push({
        rowNumber: r,
        bansalCode: rawCode,
        ean: rawEan,
        itemName: rawItemName,
        remark: rawRemark,
        reason: ambiguityReason
      });
    }

    // -----------------------------------------------------------------
    // Step 3: Interpret HO Remark
    // -----------------------------------------------------------------
    const parsedCost = parseNumberValue(rawCost);
    const parsedVal = parseNumberValue(rawVal);
    const parsedMtd = parseNumberValue(rawMtd);
    const parsedTotalDays = parseNumberValue(rawTotalDays);
    const parsedPendingDays = parseNumberValue(rawPendingDays);
    const parsedPendingPct = parseNumberValue(rawPendingPct);

    const expiryForInterpretation = rawExp || (matchedPreparedItem ? matchedPreparedItem.expiryDate : undefined);
    const interpreted = rawRemark
      ? interpretHoRemark(rawRemark, expiryForInterpretation)
      : {
          actionType: 'PENDING HO RESPONSE' as const,
          actionTiming: 'MANUAL' as const,
          cleanRemark: ''
        };

    let targetItem: NearExpiryItem;

    if (matchedPreparedItem) {
      // -----------------------------------------------------------------
      // SCENARIO A: LINKED TO EXISTING PREPARED LIST ITEM
      // -----------------------------------------------------------------
      linkedCount++;
      const finalExp = rawExp || matchedPreparedItem.expiryDate;
      const finalMfg = rawMfg || matchedPreparedItem.mfgDate;
      let livePending = parsedPendingDays !== undefined ? parsedPendingDays : matchedPreparedItem.pendingDays;
      let liveTotalDays = parsedTotalDays !== undefined ? parsedTotalDays : matchedPreparedItem.totalDays;
      let livePendingPct = parsedPendingPct !== undefined ? parsedPendingPct : matchedPreparedItem.pendingPct;

      if (finalExp) {
        const calcDays = getDaysRemaining(finalExp);
        if (livePending === 0 || isNaN(livePending)) {
          livePending = calcDays;
        }
      }
      if (finalMfg && finalExp && (!liveTotalDays || liveTotalDays === 0)) {
        const shelf = calculateShelfLife(finalMfg, finalExp);
        liveTotalDays = shelf.totalDays;
        livePendingPct = shelf.pendingPct;
      }

      targetItem = {
        ...matchedPreparedItem,
        hoRemark: rawRemark || matchedPreparedItem.hoRemark,
        actionType: interpreted.actionType,
        actionTiming: interpreted.actionTiming,
        actionDueDate: interpreted.actionDueDate,
        isHoImported: true,
        pendingDays: livePending,
        totalDays: liveTotalDays,
        pendingPct: livePendingPct,

        // Preserve all 22 values explicitly
        hoSrNo: rawSrNo || undefined,
        hoStoreName: rawStore || undefined,
        hoEanCode: rawEan || undefined,
        hoBansalCode: normCode || rawCode || undefined,
        hoMainCode: rawMainCode || undefined,
        hoCategory: rawCategory || undefined,
        hoItemName: rawItemName || undefined,
        hoPurchaseName: rawPurchaseName || undefined,
        hoNonDebitDebit: rawDebit || undefined,
        hoDebitStatus: rawDebit || undefined,
        hoMrp: numMrp !== undefined ? numMrp : matchedPreparedItem.mrp,
        hoCost: parsedCost !== undefined ? parsedCost : matchedPreparedItem.cost,
        hoValue: parsedVal !== undefined ? parsedVal : matchedPreparedItem.value,
        hoNearExpiryStock: numStock !== undefined ? numStock : matchedPreparedItem.nearExpiryStock,
        hoMtdSale: parsedMtd !== undefined ? parsedMtd : matchedPreparedItem.mtdSale,
        hoMfgDate: rawMfg || matchedPreparedItem.mfgDate,
        hoExpiryDate: rawExp || matchedPreparedItem.expiryDate,
        hoTodayDate: rawTodayDate || undefined,
        hoTotalDays: liveTotalDays,
        hoPendingShelfLifeDays: livePending,
        hoPendingShelfLifePct: livePendingPct,
        hoPendingShelfLifePercent: rawPendingPct || (livePendingPct !== undefined ? `${livePendingPct}%` : undefined),
        hoSupplier: rawSupplier || matchedPreparedItem.supplier,

        hoImportData: {
          srNo: rawSrNo,
          storeName: rawStore,
          eanCode: rawEan,
          bansalCode: rawCode,
          mainCode: rawMainCode,
          category: rawCategory,
          itemName: rawItemName,
          purchaseName: rawPurchaseName,
          nonDebitDebit: rawDebit,
          mrp: rawMrp,
          cost: rawCost,
          value: rawVal,
          nearExpiryStock: rawStock,
          mtdSale: rawMtd,
          mfgDate: rawMfg,
          expiryDate: rawExp,
          todayDate: rawTodayDate,
          totalDays: rawTotalDays,
          pendingShelfLifeDays: rawPendingDays,
          pendingShelfLifePercent: rawPendingPct,
          supplier: rawSupplier,
          hoRemark: rawRemark
        }
      };

      if (rawDebit && (rawDebit.toUpperCase().includes('DEBIT') || rawDebit.toUpperCase().includes('NON'))) {
        targetItem.debitStatus = rawDebit.trim().toUpperCase();
      }
    } else {
      // -----------------------------------------------------------------
      // SCENARIO B: NEW HO-ONLY ITEM CREATED DIRECTLY FROM EXCEL
      // -----------------------------------------------------------------
      newHoCount++;
      const targetBatchId = batchId || (activeItems && activeItems.length > 0 ? activeItems[0].batchId : 'ho-imported-batch');
      const calculatedVal =
        parsedVal !== undefined
          ? parsedVal
          : numStock !== undefined && parsedCost !== undefined
            ? numStock * parsedCost
            : 0;

      const expDate = canonExp || rawExp || '';
      const mfgDate = canonMfg || rawMfg || '';
      let calculatedTotalDays = parsedTotalDays !== undefined ? parsedTotalDays : 0;
      let calculatedPendingDays = parsedPendingDays !== undefined ? parsedPendingDays : 0;
      let calculatedPendingPct = parsedPendingPct !== undefined ? parsedPendingPct : 0;

      if (expDate) {
        const liveDays = getDaysRemaining(expDate);
        if (calculatedPendingDays === 0 || isNaN(calculatedPendingDays)) {
          calculatedPendingDays = liveDays;
        }
      }
      if (mfgDate && expDate && (calculatedTotalDays === 0 || isNaN(calculatedTotalDays))) {
        const shelf = calculateShelfLife(mfgDate, expDate);
        calculatedTotalDays = shelf.totalDays;
        calculatedPendingPct = shelf.pendingPct;
      }

      targetItem = {
        id: `ho_item_${Date.now()}_${r}_${Math.random().toString(36).substring(2, 7)}`,
        batchId: targetBatchId,
        barcode: normEan || rawEan || '',
        bansalCode: normCode || rawCode || '',
        mainCode: rawMainCode || '',
        category: rawCategory || 'General',
        itemName: rawItemName || rawPurchaseName || (normCode ? `Item ${normCode}` : 'HO Product'),
        debitStatus: rawDebit ? rawDebit.trim().toUpperCase() : 'NON DEBIT',
        mrp: numMrp !== undefined ? numMrp : 0,
        cost: parsedCost !== undefined ? parsedCost : 0,
        value: calculatedVal,
        nearExpiryStock: numStock !== undefined ? numStock : 0,
        mtdSale: parsedMtd !== undefined ? parsedMtd : 0,
        mfgDate: mfgDate,
        expiryDate: expDate,
        entryDate: rawTodayDate ? normalizeDateString(rawTodayDate) : new Date().toISOString().slice(0, 10),
        totalDays: calculatedTotalDays,
        pendingDays: calculatedPendingDays,
        pendingPct: calculatedPendingPct,
        supplier: rawSupplier || '',
        hoRemark: rawRemark || '',
        actionType: interpreted.actionType,
        actionTiming: interpreted.actionTiming,
        actionDueDate: interpreted.actionDueDate,
        status: 'DRAFT',
        isHoImported: true,

        // Preserve all 22 HO values
        hoSrNo: rawSrNo || undefined,
        hoStoreName: rawStore || undefined,
        hoEanCode: rawEan || undefined,
        hoBansalCode: normCode || rawCode || undefined,
        hoMainCode: rawMainCode || undefined,
        hoCategory: rawCategory || undefined,
        hoItemName: rawItemName || undefined,
        hoPurchaseName: rawPurchaseName || undefined,
        hoNonDebitDebit: rawDebit || undefined,
        hoDebitStatus: rawDebit || undefined,
        hoMrp: numMrp !== undefined ? numMrp : undefined,
        hoCost: parsedCost !== undefined ? parsedCost : undefined,
        hoValue: parsedVal !== undefined ? parsedVal : calculatedVal,
        hoNearExpiryStock: numStock !== undefined ? numStock : undefined,
        hoMtdSale: parsedMtd !== undefined ? parsedMtd : undefined,
        hoMfgDate: rawMfg || undefined,
        hoExpiryDate: rawExp || undefined,
        hoTodayDate: rawTodayDate || undefined,
        hoTotalDays: calculatedTotalDays,
        hoPendingShelfLifeDays: calculatedPendingDays,
        hoPendingShelfLifePct: calculatedPendingPct,
        hoPendingShelfLifePercent: rawPendingPct || (calculatedPendingPct !== undefined ? `${calculatedPendingPct}%` : undefined),
        hoSupplier: rawSupplier || undefined,

        hoImportData: {
          srNo: rawSrNo,
          storeName: rawStore,
          eanCode: rawEan,
          bansalCode: rawCode,
          mainCode: rawMainCode,
          category: rawCategory,
          itemName: rawItemName,
          purchaseName: rawPurchaseName,
          nonDebitDebit: rawDebit,
          mrp: rawMrp,
          cost: rawCost,
          value: rawVal,
          nearExpiryStock: rawStock,
          mtdSale: rawMtd,
          mfgDate: rawMfg,
          expiryDate: rawExp,
          todayDate: rawTodayDate,
          totalDays: rawTotalDays,
          pendingShelfLifeDays: rawPendingDays,
          pendingShelfLifePercent: rawPendingPct,
          supplier: rawSupplier,
          hoRemark: rawRemark
        }
      };
    }

    // -----------------------------------------------------------------
    // Step 4: Optional Stock IQ Enrichment
    // -----------------------------------------------------------------
    let matchedStockProduct: Product | undefined;
    if (normCode && stockByCode.has(normCode)) {
      matchedStockProduct = stockByCode.get(normCode);
    } else if (normEan && stockByBarcode.has(normEan)) {
      matchedStockProduct = stockByBarcode.get(normEan);
    }

    if (matchedStockProduct) {
      targetItem.productId = matchedStockProduct.id;
      targetItem.rawProductData = matchedStockProduct;
      targetItem.stockMasterLinked = true;
      if ((!targetItem.category || targetItem.category === 'General') && matchedStockProduct.category) {
        targetItem.category = matchedStockProduct.category;
      }
      if (!targetItem.mainCode && matchedStockProduct.mainCode) {
        targetItem.mainCode = matchedStockProduct.mainCode;
      }
      stockMasterMatchedCount++;
    } else {
      targetItem.stockMasterLinked = false;
      stockMasterNotFoundCount++;
    }

    // -----------------------------------------------------------------
    // Step 5: Dynamically evaluate status
    // -----------------------------------------------------------------
    const evaluated = evaluateItemStatus(targetItem);
    targetItem.status = evaluated.status;

    updatedItemsMap.set(targetItem.id, targetItem);
  }

  const updatedItems = Array.from(updatedItemsMap.values());

  return {
    totalRows: totalDataRows,
    importedCount: updatedItems.length,
    linkedCount,
    newHoCount,
    stockMasterMatchedCount,
    stockMasterNotFoundCount,
    ambiguousCount: ambiguousRows.length,
    skippedCount,
    storeFilteredRows: totalDataRows,
    matchedCount: updatedItems.length, // Alias for importedCount
    unmatchedCount: ambiguousRows.length + skippedCount,
    updatedItems,
    unmatchedRows,
    ambiguousRows,
    detectedSheet: detectedSheetName,
    detectedHeaderRow: headerRowIndex,
    detectedHeaders: detectedHeaderNames
  };
}
