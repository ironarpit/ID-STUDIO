import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { DailyPurchaseSupplierEntry, Product } from '../types';
import { cleanBarcode, cleanDateOnly } from './fileParser';
import { normalizeLocalCode } from './barcodeResolver';

export interface PurchaseParsedItem {
  id: string; // generated unique id
  bansalCode: string; // Item Code / Bansal Code with leading zeros preserved
  code: string;
  productName: string;
  mainCode?: string;
  category: string;
  brand?: string;
  purchaseQty: number;
  purchasedQty: number;
  freeQty: number;
  supplierCode?: string;
  supplierName?: string;
  suppliersList: DailyPurchaseSupplierEntry[];
  barcode?: string;
  mrp?: number;
  costPrice?: number;
  retailPrice?: number;
  lastPurchaseDate?: string; // Formatted DD/MM/YYYY strictly from stock report
  isAmbiguousMatch?: boolean;
  rawRowData?: Record<string, any>;
}

export interface PurchaseValidationStats {
  totalRowsRead: number;
  uniqueProductsCount: number;
  invalidRowsCount: number;
  invalidRows: { rowNumber: number; reason: string; rawSnippet: string }[];
}

export interface PurchaseReportParseResult {
  reportTitle: string;
  detectedStore: string;
  reportPeriod: string;
  detectedAuditDate: string; // ISO date YYYY-MM-DD or DD/MM/YYYY
  items: PurchaseParsedItem[];
  validation: PurchaseValidationStats;
  headers: string[];
}

/**
 * Preserves code values with leading zeros (e.g. "00412", "0941").
 */
export function cleanCodePreserveLeadingZeros(val: any): string {
  if (val === null || val === undefined) return '';
  let str = String(val).trim();
  if (!str) return '';

  // Handle scientific notation e.g. 1.23456E+05
  if (/^[+-]?\d+(\.\d+)?[eE][+-]?\d+$/i.test(str)) {
    try {
      const num = Number(str);
      if (!isNaN(num) && isFinite(num)) {
        str = BigInt(Math.round(num)).toString();
      }
    } catch {
      // ignore
    }
  }

  // Remove trailing .0 from float conversion of integer code e.g. "412.0"
  if (/^\d+\.0+$/.test(str)) {
    str = str.replace(/\.0+$/, '');
  }

  return str;
}

/**
 * Parses numeric quantities safely.
 */
function parseQty(val: any, fallback = 0): number {
  if (val === null || val === undefined || val === '') return fallback;
  if (typeof val === 'number') return isNaN(val) ? fallback : val;
  const clean = String(val).replace(/[^0-9.-]/g, '');
  const num = parseFloat(clean);
  return isNaN(num) ? fallback : num;
}

/**
 * Normalizes header string for keyword comparison.
 */
function normKey(h: string): string {
  return String(h || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Extracts store name, report period, and report title from the top header lines.
 */
function extractReportMeta(rawMatrix: any[][]): {
  reportTitle: string;
  detectedStore: string;
  reportPeriod: string;
  detectedAuditDate: string;
} {
  let reportTitle = 'Purchase Summary – Item Wise';
  let detectedStore = 'PATAN';
  let reportPeriod = '';
  let detectedAuditDate = new Date().toISOString().slice(0, 10);

  const topScan = Math.min(rawMatrix.length, 12);
  const dateRegex = /\b(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})\b/g;

  for (let r = 0; r < topScan; r++) {
    const row = rawMatrix[r];
    if (!row || !Array.isArray(row)) continue;
    const rowStr = row.map((c) => String(c || '').trim()).filter(Boolean).join(' ');
    const lower = rowStr.toLowerCase();

    // Check for Title
    if (lower.includes('purchase summary') || lower.includes('item wise') || lower.includes('purchase item summary')) {
      reportTitle = rowStr;
    }

    // Check for Store Name
    if (lower.includes('patan')) {
      detectedStore = 'PATAN';
    } else if (lower.includes('store') || lower.includes('bansal')) {
      const match = rowStr.match(/bansal\s+(?:supermarket\s+)?([a-zA-Z]+)/i);
      if (match && match[1]) {
        detectedStore = match[1].toUpperCase();
      }
    }

    // Check for Period / Date Range
    // e.g. "From Date : 01/10/2026 To Date : 01/10/2026" or "Period: 01/10/2026 To 03/10/2026"
    if (lower.includes('date') || lower.includes('period') || lower.includes('from') || lower.includes('to')) {
      const datesInRow: string[] = [];
      let m;
      dateRegex.lastIndex = 0;
      while ((m = dateRegex.exec(rowStr)) !== null) {
        datesInRow.push(m[0]);
      }

      if (datesInRow.length >= 2) {
        reportPeriod = `${datesInRow[0]} to ${datesInRow[1]}`;
        // Set audit date to the end date of the period
        const [d, mo, y] = datesInRow[datesInRow.length - 1].split(/[\/\-\.]/);
        const yNum = parseInt(y, 10) < 100 ? 2000 + parseInt(y, 10) : parseInt(y, 10);
        detectedAuditDate = `${yNum}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      } else if (datesInRow.length === 1 && !reportPeriod) {
        reportPeriod = datesInRow[0];
        const [d, mo, y] = datesInRow[0].split(/[\/\-\.]/);
        const yNum = parseInt(y, 10) < 100 ? 2000 + parseInt(y, 10) : parseInt(y, 10);
        detectedAuditDate = `${yNum}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      }
    }
  }

  // If report period wasn't formatted, make a clean default
  if (!reportPeriod) {
    const today = new Date();
    const d = String(today.getDate()).padStart(2, '0');
    const mo = String(today.getMonth() + 1).padStart(2, '0');
    const y = today.getFullYear();
    reportPeriod = `${d}/${mo}/${y}`;
  }

  return { reportTitle, detectedStore, reportPeriod, detectedAuditDate };
}

/**
 * Finds the index of the column header row.
 */
function findPurchaseHeaderRowIndex(matrix: any[][]): number {
  if (!matrix || matrix.length === 0) return 0;

  const codeKeywords = ['itemcode', 'code', 'bansalcode', 'item_code', 'bansal_code', 'shortcode', 'prodcode'];
  const nameKeywords = ['itemname', 'productname', 'item_name', 'particulars', 'description', 'item', 'itemdescription'];
  const qtyKeywords = ['purqty', 'purchaseqty', 'purchasedqty', 'qty', 'recqty', 'quantity', 'inwardqty'];

  let bestIndex = 0;
  let maxScore = -1;

  for (let r = 0; r < Math.min(matrix.length, 25); r++) {
    const row = matrix[r];
    if (!row || !Array.isArray(row)) continue;

    let score = 0;
    const rowKeys = row.map((c) => normKey(c));

    const hasCode = rowKeys.some((k) => codeKeywords.some((kw) => k === kw || k.includes(kw)));
    const hasName = rowKeys.some((k) => nameKeywords.some((kw) => k === kw || k.includes(kw)));
    const hasQty = rowKeys.some((k) => qtyKeywords.some((kw) => k === kw || k.includes(kw)));

    if (hasCode) score += 3;
    if (hasName) score += 3;
    if (hasQty) score += 2;

    for (const k of rowKeys) {
      if (['maincode', 'category', 'brand', 'party', 'supplier', 'freeqty', 'rate', 'amount', 'mrp'].some((kw) => k.includes(kw))) {
        score += 1;
      }
    }

    if (score > maxScore && score >= 4) {
      maxScore = score;
      bestIndex = r;
    }
  }

  return bestIndex;
}

/**
 * Detects column indices for purchase summary fields.
 */
function detectPurchaseColumnIndices(headers: string[]): {
  codeIdx: number;
  nameIdx: number;
  mainCodeIdx: number;
  categoryIdx: number;
  brandIdx: number;
  purQtyIdx: number;
  freeQtyIdx: number;
  partyCodeIdx: number;
  partyNameIdx: number;
  barcodeIdx: number;
  mrpIdx: number;
  costIdx: number;
} {
  const normHeaders = headers.map((h) => normKey(h));

  const findCol = (keywords: string[]): number => {
    // Exact match first
    for (const kw of keywords) {
      const idx = normHeaders.findIndex((h) => h === kw);
      if (idx !== -1) return idx;
    }
    // Substring match
    for (const kw of keywords) {
      const idx = normHeaders.findIndex((h) => h.includes(kw));
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const codeIdx = findCol(['itemcode', 'bansalcode', 'item_code', 'bansal_code', 'code', 'shortcode', 'internalcode', 'prodcode', 'itemno']);
  const nameIdx = findCol(['itemname', 'productname', 'item_name', 'product_name', 'description', 'particulars', 'itemdescription', 'item', 'name']);
  const mainCodeIdx = findCol(['maincode', 'main_code', 'maincategory', 'maingroup', 'dept', 'department', 'section']);
  const categoryIdx = findCol(['category', 'group', 'subgroup', 'sub_group', 'segment']);
  const brandIdx = findCol(['brand', 'brandname', 'mfg', 'manufacturer', 'company']);
  
  // Purchase Qty (Must NOT match free qty)
  let purQtyIdx = -1;
  for (let i = 0; i < normHeaders.length; i++) {
    const h = normHeaders[i];
    if (h.includes('free') || h.includes('scheme') || h.includes('bonus')) continue;
    if (['purqty', 'purchaseqty', 'purchasedqty', 'pur_qty', 'purchase_qty', 'recqty', 'receivedqty', 'netpurqty', 'inwardqty', 'qty', 'quantity', 'purnet'].some((kw) => h === kw || h.includes(kw))) {
      purQtyIdx = i;
      break;
    }
  }

  // Free Qty
  const freeQtyIdx = findCol(['freeqty', 'free_qty', 'free', 'schemeqty', 'schemqty', 'schqty', 'bonusqty', 'fqty', 'bonus']);
  
  // Party / Supplier
  const partyCodeIdx = findCol(['partycode', 'party_code', 'vendorcode', 'suppliercode', 'suppcode']);
  const partyNameIdx = findCol(['partyname', 'party_name', 'suppliername', 'supplier', 'party', 'vendor', 'vendorname', 'distributor']);
  
  const barcodeIdx = findCol(['barcode', 'bar_code', 'ean', 'upc', 'sku']);
  const mrpIdx = findCol(['mrp', 'maxretailprice', 'listprice']);
  const costIdx = findCol(['rate', 'costrate', 'purrate', 'purchaserate', 'cost', 'costprice', 'buyrate', 'netrate']);

  return {
    codeIdx,
    nameIdx,
    mainCodeIdx,
    categoryIdx,
    brandIdx,
    purQtyIdx,
    freeQtyIdx,
    partyCodeIdx,
    partyNameIdx,
    barcodeIdx,
    mrpIdx,
    costIdx,
  };
}

/**
 * Checks if a row is a subtotal, grand total, heading, or separator row.
 */
function isSubtotalOrHeadingRow(row: any[], codeIdx: number, nameIdx: number): boolean {
  if (!row || !Array.isArray(row)) return true;
  const joined = row.map((c) => String(c || '').trim()).join(' ').toLowerCase();
  
  if (!joined || joined.length === 0) return true;
  if (joined.includes('grand total') || joined.includes('sub total') || joined.includes('subtotal') || joined.includes('total items:') || joined.includes('page ') || joined.includes('printed on')) {
    return true;
  }

  const codeVal = codeIdx !== -1 ? String(row[codeIdx] || '').trim() : '';
  const nameVal = nameIdx !== -1 ? String(row[nameIdx] || '').trim() : '';

  // If code is "Total" or empty and name contains "Total"
  if (codeVal.toLowerCase() === 'total' || nameVal.toLowerCase().startsWith('total')) {
    return true;
  }

  // If both code and name are empty, ignore
  if (!codeVal && !nameVal) {
    return true;
  }

  return false;
}

/**
 * Parses a Purchase Summary report file (.xls, .xlsx, .csv).
 */
export async function parsePurchaseReportFile(
  file: File,
  currentStockProducts: Product[] = []
): Promise<PurchaseReportParseResult> {
  const fileName = file.name;
  const fileExt = fileName.split('.').pop()?.toLowerCase() || '';

  let rawMatrix: any[][] = [];

  if (fileExt === 'csv') {
    const text = await file.text();
    const parsed = Papa.parse(text, { skipEmptyLines: false });
    rawMatrix = parsed.data as any[][];
  } else {
    // Read using SheetJS XLSX which supports .xls binary (BIFF8), XML, HTML-in-XLS, and .xlsx
    const arrayBuffer = await file.arrayBuffer();
    const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: true, raw: false });
    
    // Pick the first sheet or the sheet with most rows
    let bestSheet = wb.Sheets[wb.SheetNames[0]];
    let maxRows = 0;
    for (const sName of wb.SheetNames) {
      const s = wb.Sheets[sName];
      const sheetAoa = XLSX.utils.sheet_to_json(s, { header: 1, defval: '' }) as any[][];
      if (sheetAoa.length > maxRows) {
        maxRows = sheetAoa.length;
        bestSheet = s;
      }
    }

    if (!bestSheet) {
      throw new Error('No readable sheet found in the uploaded purchase report.');
    }

    rawMatrix = XLSX.utils.sheet_to_json(bestSheet, { header: 1, defval: '' }) as any[][];
  }

  if (!rawMatrix || rawMatrix.length === 0) {
    throw new Error('The uploaded file is empty.');
  }

  // 1. Extract report metadata (Store, Period, Title)
  const { reportTitle, detectedStore, reportPeriod, detectedAuditDate } = extractReportMeta(rawMatrix);

  // 2. Find header row
  const headerRowIdx = findPurchaseHeaderRowIndex(rawMatrix);
  const rawHeaders = (rawMatrix[headerRowIdx] || []).map((h, i) => String(h || '').trim() || `Col_${i + 1}`);

  // 3. Detect column indices
  const cols = detectPurchaseColumnIndices(rawHeaders);

  if (cols.codeIdx === -1 && cols.nameIdx === -1) {
    throw new Error('Could not identify Item Code or Item Name columns in the purchase report.');
  }

  // 4. Map & Aggregate Rows (handling duplicate rows / multiple suppliers per item)
  // Map from normalized Bansal Code -> Grouped Purchase Item
  const itemsByCode = new Map<string, PurchaseParsedItem>();
  const invalidRows: { rowNumber: number; reason: string; rawSnippet: string }[] = [];
  let totalDataRowsRead = 0;

  // Build stock lookup map strictly by exact normalized Bansal / Local Code (preserving leading zeros)
  // Map from normalized code -> list of stock products
  const stockByCode = new Map<string, Product[]>();
  for (const p of currentStockProducts) {
    const rawCode = p.bansalCode || p.localCode || p.code || '';
    const norm = normalizeLocalCode(rawCode);
    if (norm) {
      const list = stockByCode.get(norm) || [];
      list.push(p);
      stockByCode.set(norm, list);
    }
  }

  for (let r = headerRowIdx + 1; r < rawMatrix.length; r++) {
    const row = rawMatrix[r];
    if (!row || !Array.isArray(row)) continue;

    // Check if subtotal or heading
    if (isSubtotalOrHeadingRow(row, cols.codeIdx, cols.nameIdx)) {
      continue;
    }

    totalDataRowsRead++;

    const rawCode = cols.codeIdx !== -1 ? row[cols.codeIdx] : '';
    const bansalCode = cleanCodePreserveLeadingZeros(rawCode);
    const rawName = cols.nameIdx !== -1 ? row[cols.nameIdx] : '';
    const productName = String(rawName || '').trim();

    if (!bansalCode && !productName) {
      invalidRows.push({
        rowNumber: r + 1,
        reason: 'Missing both Item Code and Product Name',
        rawSnippet: row.slice(0, 5).join(' | '),
      });
      continue;
    }

    const mainCode = cols.mainCodeIdx !== -1 ? String(row[cols.mainCodeIdx] || '').trim() : undefined;
    const category = cols.categoryIdx !== -1 ? String(row[cols.categoryIdx] || '').trim() || 'General' : 'General';
    const brand = cols.brandIdx !== -1 ? String(row[cols.brandIdx] || '').trim() : undefined;
    
    const purQty = cols.purQtyIdx !== -1 ? parseQty(row[cols.purQtyIdx], 0) : 0;
    const freeQty = cols.freeQtyIdx !== -1 ? parseQty(row[cols.freeQtyIdx], 0) : 0;

    const supplierCode = cols.partyCodeIdx !== -1 ? String(row[cols.partyCodeIdx] || '').trim() : undefined;
    const supplierName = cols.partyNameIdx !== -1 ? String(row[cols.partyNameIdx] || '').trim() : undefined;

    const rawBarcode = cols.barcodeIdx !== -1 ? cleanBarcode(row[cols.barcodeIdx]) : '';
    const mrp = cols.mrpIdx !== -1 ? parseQty(row[cols.mrpIdx]) : undefined;
    const costPrice = cols.costIdx !== -1 ? parseQty(row[cols.costIdx]) : undefined;

    // Create supplier entry
    const supplierEntry: DailyPurchaseSupplierEntry = {
      supplierCode: supplierCode || undefined,
      supplierName: supplierName || 'Direct Inward',
      purchaseQty: purQty,
      freeQty: freeQty > 0 ? freeQty : undefined,
    };

    // Grouping key: strictly by Item Code / Bansal Code
    const groupKey = bansalCode ? normalizeLocalCode(bansalCode) : `NAME_${productName.toLowerCase().replace(/[^a-z0-9]/g, '')}`;

    if (itemsByCode.has(groupKey)) {
      // Existing product under multiple suppliers or multiple invoices -> aggregate quantities and append supplier
      const existing = itemsByCode.get(groupKey)!;
      existing.purchaseQty += purQty;
      existing.purchasedQty += purQty;
      existing.freeQty += freeQty;

      // Add to supplier list if not already listed or if supplier entry is distinct
      const existingSuppIdx = existing.suppliersList.findIndex(
        (s) => s.supplierName.toLowerCase() === supplierEntry.supplierName.toLowerCase() && s.supplierCode === supplierEntry.supplierCode
      );
      if (existingSuppIdx !== -1) {
        existing.suppliersList[existingSuppIdx].purchaseQty += purQty;
        if (freeQty > 0) {
          existing.suppliersList[existingSuppIdx].freeQty = (existing.suppliersList[existingSuppIdx].freeQty || 0) + freeQty;
        }
      } else {
        existing.suppliersList.push(supplierEntry);
      }
    } else {
      // New product
      // Match stock strictly by Bansal / Local Code (do not match by product name or category)
      const normBansal = bansalCode ? normalizeLocalCode(bansalCode) : '';
      const matchedStockList = normBansal ? stockByCode.get(normBansal) : undefined;

      let stockProd: Product | undefined = undefined;
      let matchedLastPurchaseDate: string | undefined = undefined;
      let isAmbiguous = false;

      if (matchedStockList && matchedStockList.length === 1) {
        stockProd = matchedStockList[0];
        const rawLpd = stockProd.lastPurchaseDate || (stockProd.rawRowData ? (stockProd.rawRowData['Last Pur Date'] || stockProd.rawRowData['Last Purchase Date'] || stockProd.rawRowData['Pur Date']) : undefined);
        matchedLastPurchaseDate = cleanDateOnly(rawLpd) || undefined;
      } else if (matchedStockList && matchedStockList.length > 1) {
        // Multiple stock items match this exact Bansal code
        const lpds = matchedStockList.map(sp => {
          const raw = sp.lastPurchaseDate || (sp.rawRowData ? (sp.rawRowData['Last Pur Date'] || sp.rawRowData['Last Purchase Date'] || sp.rawRowData['Pur Date']) : undefined);
          return cleanDateOnly(raw);
        }).filter(Boolean);

        const uniqueLpds = Array.from(new Set(lpds));
        if (uniqueLpds.length === 1) {
          matchedLastPurchaseDate = uniqueLpds[0];
          stockProd = matchedStockList[0];
        } else {
          // Ambiguous / conflicting last purchase dates in stock report
          isAmbiguous = true;
          stockProd = matchedStockList[0];
        }
      }

      let safeBarcode = rawBarcode;
      if (!safeBarcode && stockProd?.barcode && !stockProd.barcode.startsWith('AUTO-')) {
        safeBarcode = stockProd.barcode;
      }

      // Safe mainCode / category resolution fallback from stock if blank
      const finalMainCode = mainCode || stockProd?.mainCode;
      const finalCategory = category !== 'General' ? category : (stockProd?.category || 'General');
      const finalBrand = brand || stockProd?.brand;

      const newItem: PurchaseParsedItem = {
        id: `pur_item_${bansalCode || Date.now()}_${itemsByCode.size}`,
        bansalCode: bansalCode || (stockProd?.bansalCode || stockProd?.localCode || ''),
        code: bansalCode || (stockProd?.bansalCode || stockProd?.localCode || ''),
        productName: productName || stockProd?.name || 'Unnamed Purchase Item',
        mainCode: finalMainCode,
        category: finalCategory,
        brand: finalBrand,
        purchaseQty: purQty,
        purchasedQty: purQty,
        freeQty,
        supplierCode,
        supplierName,
        suppliersList: [supplierEntry],
        barcode: safeBarcode || undefined,
        mrp: mrp || stockProd?.mrp,
        costPrice: costPrice || stockProd?.costPrice,
        retailPrice: stockProd?.retailPrice || mrp,
        lastPurchaseDate: matchedLastPurchaseDate,
        isAmbiguousMatch: isAmbiguous ? true : undefined,
      };

      itemsByCode.set(groupKey, newItem);
    }
  }

  const items = Array.from(itemsByCode.values());

  const validation: PurchaseValidationStats = {
    totalRowsRead: totalDataRowsRead,
    uniqueProductsCount: items.length,
    invalidRowsCount: invalidRows.length,
    invalidRows,
  };

  return {
    reportTitle,
    detectedStore,
    reportPeriod,
    detectedAuditDate,
    items,
    validation,
    headers: rawHeaders,
  };
}
