import ExcelJS from 'exceljs';
import Papa from 'papaparse';
import { SupplierPurchaseEntry } from '../types';
import { normalizeLocalCode } from './barcodeResolver';

export interface ParsedPurchaseProduct {
  id: string;
  code: string;
  bansalCode: string;
  localCode: string;
  name: string;
  itemName: string;
  mainCode: string;
  category: string;
  brand: string;
  purchasedQty: number;
  purchaseQty: number;
  freeQty: number;
  supplierName: string;
  supplier: string;
  supplierEntries: SupplierPurchaseEntry[];
  mrp?: number;
  costPrice?: number;
  retailPrice?: number;
  rawRowData?: Record<string, any>;
}

export interface PurchaseReportParseResult {
  totalRowsRead: number;
  uniqueProductsCount: number;
  invalidRowsCount: number;
  invalidRows: { rowNumber: number; reason: string; rawData: any }[];
  validProducts: ParsedPurchaseProduct[];
  detectedStore: string;
  detectedPeriod: string;
  detectedDate: string;
  fileName: string;
  headers: string[];
}

/**
 * Normalizes text headers for keyword matching
 */
function normKey(s: string): string {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Parses numeric cell values safely (handles strings, commas, decimals)
 */
function parseNumeric(val: any): number {
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  if (!val) return 0;
  const str = String(val).replace(/,/g, '').trim();
  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}

/**
 * Cleans and formats code values, strictly preserving leading zeros
 */
export function cleanPurchaseCode(val: any): string {
  if (val === null || val === undefined) return '';
  let str = String(val).trim();
  str = str.replace(/\.0+$/, ''); // Remove .0 from Excel numeric exports
  str = str.replace(/\s+/g, '');
  return str;
}

/**
 * Parses the "Purchase Summary – Item Wise" report file (XLSX, XLS, or CSV).
 */
export async function parsePurchaseReport(
  file: File
): Promise<PurchaseReportParseResult> {
  const fileName = file.name;
  const isCsv = fileName.toLowerCase().endsWith('.csv');
  const rawMatrix: any[][] = [];

  if (isCsv) {
    const text = await file.text();
    const parsed = Papa.parse(text, { skipEmptyLines: false });
    if (parsed.data && Array.isArray(parsed.data)) {
      rawMatrix.push(...(parsed.data as any[][]));
    }
  } else {
    const arrayBuffer = await file.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(arrayBuffer);

    // Pick worksheet: Prioritize sheet matching "Purchase", "Summary", "Item", "Patan", or first sheet with data
    let selectedSheet: ExcelJS.Worksheet | undefined;

    workbook.eachSheet((sheet) => {
      const cleanName = sheet.name.trim().toLowerCase();
      if ((cleanName.includes('purchase') || cleanName.includes('summary') || cleanName.includes('item') || cleanName.includes('patan')) && sheet.rowCount > 0) {
        if (!selectedSheet) selectedSheet = sheet;
      }
    });

    if (!selectedSheet) {
      workbook.eachSheet((sheet) => {
        if (!selectedSheet && sheet.rowCount > 0) {
          selectedSheet = sheet;
        }
      });
    }

    if (!selectedSheet) {
      throw new Error('No readable worksheet found in the uploaded Purchase Summary Excel file.');
    }

    selectedSheet.eachRow({ includeEmpty: true }, (row) => {
      const rowVals: any[] = [];
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        let val = cell.value;
        if (val !== null && val !== undefined) {
          if (typeof val === 'object') {
            if ('result' in val) {
              val = (val as any).result;
            } else if ('richText' in val && Array.isArray((val as any).richText)) {
              val = (val as any).richText.map((t: any) => t.text).join('');
            } else if ('text' in val) {
              val = (val as any).text;
            }
          }
          rowVals[colNumber - 1] = typeof val === 'string' ? val.trim() : val;
        } else {
          rowVals[colNumber - 1] = '';
        }
      });
      rawMatrix.push(rowVals);
    });
  }

  if (rawMatrix.length === 0) {
    throw new Error('The uploaded Purchase Summary report file is empty.');
  }

  // 1. Extract Report Metadata (Store Name, Title, Period / Date) from first 25 rows
  let detectedStore = 'PATAN';
  let detectedPeriod = '';
  let detectedDate = '';

  const metaScanRows = Math.min(rawMatrix.length, 25);
  for (let r = 0; r < metaScanRows; r++) {
    const row = rawMatrix[r] || [];
    const rowFullText = row.map((c) => String(c || '').trim()).join(' ');
    const lowerText = rowFullText.toLowerCase();

    // Check for store name
    if (lowerText.includes('patan') || lowerText.includes('store: patan') || lowerText.includes('store - patan')) {
      detectedStore = 'PATAN';
    } else if (lowerText.includes('deesa')) {
      detectedStore = 'DEESA';
    } else if (lowerText.includes('mehsana')) {
      detectedStore = 'MEHSANA';
    }

    // Check for Period / Date Range e.g. "From: 01/10/2026 To: 03/10/2026" or "Period: 01-10-2026 To 03-10-2026"
    const periodMatch = rowFullText.match(
      /(?:from\s*:?\s*)?(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})\s*(?:to|-)\s*(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})/i
    );
    if (periodMatch && !detectedPeriod) {
      detectedPeriod = `${periodMatch[1]} To ${periodMatch[2]}`.replace(/-/g, '/');
      detectedDate = periodMatch[2].replace(/-/g, '/');
    }

    // Check for single Date e.g. "Date: 03/10/2026" or "For Date: 03-10-2026"
    const singleDateMatch = rowFullText.match(/(?:date|on|as on|as at)\s*:?\s*(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})/i);
    if (singleDateMatch && !detectedDate) {
      detectedDate = singleDateMatch[1].replace(/-/g, '/');
      if (!detectedPeriod) {
        detectedPeriod = detectedDate;
      }
    }
  }

  // Fallback period if not explicitly found
  if (!detectedPeriod) {
    const today = new Date();
    const day = String(today.getDate()).padStart(2, '0');
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const year = today.getFullYear();
    detectedPeriod = `${day}/${month}/${year}`;
    detectedDate = detectedPeriod;
  }

  // 2. Dynamic Header Row Finder
  let bestHeaderIdx = 0;
  let maxScore = -1;

  for (let r = 0; r < metaScanRows; r++) {
    const row = rawMatrix[r] || [];
    let score = 0;
    const rowNormStrings = row.map((cell) => normKey(String(cell || '')));

    for (const str of rowNormStrings) {
      if (!str) continue;
      if (str === 'code' || str === 'itemcode' || str === 'bansalcode' || str === 'localcode' || str === 'artno' || str === 'plu') score += 10;
      else if (str === 'item' || str === 'itemname' || str === 'description' || str === 'particulars' || str === 'productname') score += 10;
      else if (str === 'purchaseqty' || str === 'purchasedqty' || str === 'purqty' || str === 'qty' || str === 'quantity' || str === 'purnet') score += 8;
      else if (str === 'freeqty' || str === 'free' || str === 'schemeqty' || str === 'schqty' || str === 'bonus' || str === 'bonusqty') score += 8;
      else if (str === 'party' || str === 'supplier' || str === 'partyname' || str === 'suppliername' || str === 'vendor' || str === 'partycode') score += 8;
      else if (str === 'maincode' || str === 'maingroup' || str === 'dept' || str === 'division') score += 7;
      else if (str === 'category' || str === 'group' || str === 'subgroup') score += 6;
      else if (str === 'brand' || str === 'company' || str === 'mfg') score += 6;
      else if (str === 'mrp' || str === 'rate' || str === 'cost' || str === 'netrate') score += 4;
    }

    if (score > maxScore) {
      maxScore = score;
      bestHeaderIdx = r;
    }
  }

  const rawHeaders = rawMatrix[bestHeaderIdx] || [];
  const headers: string[] = rawHeaders.map((h, i) => String(h || '').trim() || `Column_${i + 1}`);

  const findColIdx = (keywords: string[]): number => {
    // Pass 1: exact normalized match
    for (let i = 0; i < headers.length; i++) {
      const nh = normKey(headers[i]);
      if (keywords.includes(nh)) return i;
    }
    // Pass 2: substring match
    for (let i = 0; i < headers.length; i++) {
      const nh = normKey(headers[i]);
      if (keywords.some((kw) => nh.includes(kw) || kw.includes(nh))) return i;
    }
    return -1;
  };

  const codeCol = findColIdx(['code', 'bansalcode', 'bansal_code', 'itemcode', 'item_code', 'localcode', 'artno', 'plu', 'shortcode', 'itemno', 'barcode']);
  const nameCol = findColIdx(['item', 'itemname', 'item_name', 'description', 'particulars', 'product', 'productname', 'product_name', 'title', 'name']);
  const mainCodeCol = findColIdx(['maincode', 'main_code', 'maingroup', 'main_group', 'dept', 'division', 'section']);
  const categoryCol = findColIdx(['category', 'group', 'subgroup', 'sub_group', 'dept', 'department', 'segment']);
  const brandCol = findColIdx(['brand', 'company', 'mfg', 'manufacturer', 'make']);
  const purchaseQtyCol = findColIdx(['purchaseqty', 'purchasedqty', 'purqty', 'purchased_qty', 'pur_qty', 'qty', 'quantity', 'purnet', 'inwardqty', 'inward', 'pur']);
  const freeQtyCol = findColIdx(['freeqty', 'free_qty', 'free', 'schemeqty', 'schqty', 'bonus', 'bonusqty', 'sch']);
  const supplierCol = findColIdx(['supplier', 'suppliername', 'party', 'partyname', 'vendor', 'vendorname', 'distributor', 'party_name', 'supplier_name', 'partycode', 'party_code']);
  const mrpCol = findColIdx(['mrp', 'maxretailprice', 'listprice', 'markedprice', 'price', 'retail', 'rate']);
  const costCol = findColIdx(['cost', 'costprice', 'netrate', 'averagerate', 'purrate', 'buyprice', 'buyingprice']);

  if (codeCol === -1 && nameCol === -1) {
    throw new Error('Could not identify Item Code or Item Name columns in the Purchase Summary file.');
  }

  // 3. Process Data Rows & Aggregate Multiple Suppliers for same product
  const productsMap = new Map<string, ParsedPurchaseProduct>();
  const invalidRows: { rowNumber: number; reason: string; rawData: any }[] = [];
  let totalRowsRead = 0;

  for (let r = bestHeaderIdx + 1; r < rawMatrix.length; r++) {
    const row = rawMatrix[r];
    if (!row || row.length === 0) continue;

    totalRowsRead++;

    // Row full text check to ignore page totals, report subtotals, grand totals
    const rowText = row.map((c) => String(c || '').trim()).join(' ').toLowerCase();
    if (
      rowText.includes('grand total') ||
      rowText.includes('sub total') ||
      rowText.includes('total :') ||
      rowText.includes('total:') ||
      rowText.includes('page no') ||
      rowText.includes('page :') ||
      rowText.includes('printed on') ||
      rowText.startsWith('total') ||
      rowText.startsWith('---') ||
      rowText.startsWith('===')
    ) {
      continue;
    }

    const rawCodeVal = codeCol !== -1 ? row[codeCol] : '';
    const rawNameVal = nameCol !== -1 ? row[nameCol] : '';

    const cleanCode = cleanPurchaseCode(rawCodeVal);
    const cleanName = String(rawNameVal || '').trim();

    // Check row validity
    if (!cleanCode && !cleanName) {
      continue;
    }

    if (!cleanCode || cleanCode.length < 2) {
      invalidRows.push({
        rowNumber: r + 1,
        reason: 'Missing or malformed Item Code',
        rawData: row
      });
      continue;
    }

    if (!cleanName) {
      invalidRows.push({
        rowNumber: r + 1,
        reason: 'Missing Product Description',
        rawData: row
      });
      continue;
    }

    // Extract fields
    const mainCodeVal = mainCodeCol !== -1 ? String(row[mainCodeCol] || '').trim() : '';
    const categoryVal = categoryCol !== -1 ? String(row[categoryCol] || '').trim() : '';
    const brandVal = brandCol !== -1 ? String(row[brandCol] || '').trim() : '';
    const purQtyVal = purchaseQtyCol !== -1 ? parseNumeric(row[purchaseQtyCol]) : 0;
    const freeQtyVal = freeQtyCol !== -1 ? parseNumeric(row[freeQtyCol]) : 0;
    const supplierVal = supplierCol !== -1 ? String(row[supplierCol] || '').trim() : '';
    const mrpVal = mrpCol !== -1 ? parseNumeric(row[mrpCol]) : undefined;
    const costVal = costCol !== -1 ? parseNumeric(row[costCol]) : undefined;

    // Normalization key for aggregation
    const normCodeKey = normalizeLocalCode(cleanCode) || cleanCode.toUpperCase();

    const supplierEntry: SupplierPurchaseEntry = {
      supplierName: supplierVal || 'Primary Supplier',
      supplier: supplierVal || 'Primary Supplier',
      purchaseQty: purQtyVal,
      freeQty: freeQtyVal > 0 ? freeQtyVal : undefined
    };

    if (productsMap.has(normCodeKey)) {
      // Same product exists under multiple suppliers or rows -> Merge into one audit product
      const existing = productsMap.get(normCodeKey)!;
      existing.purchasedQty += purQtyVal;
      existing.purchaseQty += purQtyVal;
      existing.freeQty += freeQtyVal;

      if (supplierVal && !existing.supplierEntries.some((s) => s.supplier === supplierVal && s.purchaseQty === purQtyVal)) {
        existing.supplierEntries.push(supplierEntry);
      }

      // Rebuild combined supplier summary string
      const uniqueSuppliers = Array.from(new Set(existing.supplierEntries.map((s) => s.supplier).filter(Boolean)));
      if (uniqueSuppliers.length > 1) {
        existing.supplierName = existing.supplierEntries
          .map((s) => `${s.supplier} (${s.purchaseQty}${s.freeQty ? `+${s.freeQty}` : ''})`)
          .join(', ');
        existing.supplier = existing.supplierName;
      }
    } else {
      // New product
      const item: ParsedPurchaseProduct = {
        id: `pur_${normCodeKey}`,
        code: cleanCode,
        bansalCode: cleanCode,
        localCode: cleanCode,
        name: cleanName,
        itemName: cleanName,
        mainCode: mainCodeVal || categoryVal || 'General',
        category: categoryVal || 'General',
        brand: brandVal || '',
        purchasedQty: purQtyVal,
        purchaseQty: purQtyVal,
        freeQty: freeQtyVal,
        supplierName: supplierVal || 'Primary Supplier',
        supplier: supplierVal || 'Primary Supplier',
        supplierEntries: [supplierEntry],
        mrp: mrpVal,
        costPrice: costVal,
        retailPrice: mrpVal,
        rawRowData: {
          code: cleanCode,
          name: cleanName,
          mainCode: mainCodeVal,
          category: categoryVal,
          brand: brandVal,
          purchaseQty: purQtyVal,
          freeQty: freeQtyVal,
          supplier: supplierVal
        }
      };

      productsMap.set(normCodeKey, item);
    }
  }

  const validProducts = Array.from(productsMap.values());

  if (validProducts.length === 0) {
    throw new Error('No valid purchase products found in the uploaded file. Please verify column headers and data rows.');
  }

  return {
    totalRowsRead,
    uniqueProductsCount: validProducts.length,
    invalidRowsCount: invalidRows.length,
    invalidRows,
    validProducts,
    detectedStore,
    detectedPeriod,
    detectedDate,
    fileName,
    headers
  };
}
