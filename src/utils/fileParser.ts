import Papa from 'papaparse';
import ExcelJS from 'exceljs';
import { ColumnMapping, Product } from '../types';
import { isExcludedMainCode } from './mainCode';

export interface ParseResult {
  headers: string[];
  rows: Record<string, any>[];
  detectedMapping: ColumnMapping;
  detectedReportDays?: number;
  detectedDateRangeStr?: string;
}

export function cleanBarcode(val: any): string {
  if (val === null || val === undefined) return '';
  let str = String(val).trim();

  // Convert scientific notation e.g. 8.90123E+12 or 1.23456e11 to full string integer
  if (/^[+-]?\d+(\.\d+)?[eE][+-]?\d+$/i.test(str)) {
    try {
      const num = Number(str);
      if (!isNaN(num) && isFinite(num)) {
        str = BigInt(Math.round(num)).toString();
      }
    } catch (e) {
      str = Number(str).toLocaleString('fullwide', { useGrouping: false });
    }
  }

  // Remove trailing decimal zeroes e.g. "8901234567890.0"
  str = str.replace(/\.0+$/, '');

  return str;
}

export function autoDetectColumns(headers: string[]): ColumnMapping {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

  const findBestHeader = (keywords: string[], excludeIndices: number[] = [1]): string => {
    // Pass 1: Look for exact normalized matches across all keywords
    for (const kw of keywords) {
      const match = headers.find((h, idx) => !excludeIndices.includes(idx) && normalize(h) === kw);
      if (match) return match;
    }
    // Pass 2: Look for substring matches
    for (const kw of keywords) {
      const match = headers.find((h, idx) => !excludeIndices.includes(idx) && normalize(h).includes(kw));
      if (match) return match;
    }
    return '';
  };

  // Detect Local / Bansal Code: header keywords first, then column J (index 9) fallback
  const localCodeHeader = findBestHeader(['code', 'bansalcode', 'bansal_code', 'bansal', 'localcode', 'local_code', 'itemcode', 'item_code', 'shortcode', 'storecode', 'internalcode', 'hsncode', 'hsn'], [1]);
  const detectedLocalCode = localCodeHeader || ((headers.length >= 10 && headers[9]) ? headers[9] : '');

  // Detect Barcode: header keywords first, then column K (index 10) fallback
  const barcodeHeader = findBestHeader(['barcode', 'bar_code', 'upc', 'ean', 'sku', 'isbn'], [1]);
  const detectedBarcode = barcodeHeader || ((headers.length >= 11 && headers[10]) ? headers[10] : '');

  // Main Code: header keywords first, then column B (index 1) fallback
  const mainCodeHeader = findBestHeader(['maincode', 'main_code', 'maincategory', 'main_category', 'maingroup', 'main_group', 'dept', 'department', 'section'], []);
  const detectedMainCode = mainCodeHeader || ((headers.length >= 2 && headers[1]) ? headers[1] : '');

  return {
    barcode: detectedBarcode || findBestHeader(['barcode', 'bar_code', 'upc', 'ean', 'sku'], [1]),
    name: findBestHeader(['itemname', 'productname', 'item_name', 'product_name', 'item', 'product', 'particulars', 'description', 'title', 'name'], [1]),
    category: findBestHeader(['category', 'categor', 'group', 'subgroup', 'sub_group', 'segment', 'department'], [1]),
    mainCode: detectedMainCode,
    brand: findBestHeader(['brand'], [1]),
    manufacturer: findBestHeader(['manufacturer', 'manufacture'], [1]),
    openingStock: findBestHeader(['openingqty', 'opening_qty', 'opening', 'opqty', 'opstock'], [1]),
    purchaseQty: findBestHeader(['purnet', 'pur_net', 'purchaseqty', 'purchase', 'purchases', 'inward'], [1]),
    mrp: findBestHeader(['mrp', 'maxretailprice', 'listprice', 'markedprice', 'originalprice'], [1]),
    costPrice: findBestHeader(['costprice', 'cost', 'netrate', 'averagerate', 'avragerate', 'purrate', 'buyprice', 'buyingprice', 'buyrate', 'costrate', 'purchaserate', 'cp', 'purchaseprice', 'inwardrate', 'inwardprice', 'buy', 'lastpurrate', 'lastpur'], [1]),
    retailPrice: findBestHeader(['retailprice', 'retail', 'sellingprice', 'sp', 'regularprice', 'rate', 'price', 'retailrate', 'tagprice', 'customerprice', 'wsale', 'wholesale'], [1]),
    stock: findBestHeader(['closingstock', 'closingqty', 'closing', 'closings', 'clqty', 'clstock', 'stock', 'quantity', 'qty', 'stockqty', 'inventory', 'balance', 'count', 'available'], [1]),
    salesCount: findBestHeader(['salenet', 'salesnet', 'salereport', 'salescount', 'soldqty', 'unitsold', 'salenum', 'sale', 'sales', 'sold', 'qtyout', 'saleprice', 'totalsold', 'nosold'], [1]),
    localCode: detectedLocalCode,
    lastPurchaseDate: findBestHeader(['lastpurdate', 'lastpurchasedate', 'purchasedate', 'lastpur', 'purdate', 'pdate', 'date', 'lastpurchase', 'entrydate', 'inwarddate', 'receiptdate'], [1]),
    lastPurchaseNo: findBestHeader(['lastpurno', 'last_pur_no', 'purno', 'pur_no', 'invoiceno'], [1]),
    supplierName: findBestHeader(['suppliername', 'supplier', 'vendor', 'vendorname', 'distributor', 'party', 'partyname', 'source', 'company'], [1])
  };
}

function findBestHeaderRowIndex(matrix: (string | number | null | undefined)[][]): number {
  if (!matrix || matrix.length === 0) return 0;

  const keywords = [
    'barcode', 'upc', 'ean', 'sku', 'code', 'itemcode', 'productcode',
    'product', 'name', 'item', 'particulars', 'description', 'title',
    'category', 'categor', 'group', 'subgroup', 'brand', 'manufacturer', 'segment', 'department',
    'mrp', 'retail', 'price', 'rate', 'netrate', 'cost', 'avragerate',
    'stock', 'qty', 'quantity', 'balance', 'closing', 'closingstock', 'opening',
    'sold', 'sales', 'sale', 'salenet', 'date', 'supplier', 'vendor', 'lastpur', 'hsn'
  ];

  let bestIndex = 0;
  let maxScore = -1;

  // Scan up to first 20 rows to locate header row if file starts on row 8
  const maxScan = Math.min(matrix.length, 20);
  for (let r = 0; r < maxScan; r++) {
    const row = matrix[r];
    if (!row || !Array.isArray(row)) continue;

    let score = 0;
    for (const cell of row) {
      if (!cell) continue;
      const normalized = String(cell).toLowerCase().replace(/[^a-z0-9]/g, '');
      if (keywords.some(kw => normalized === kw || normalized.includes(kw))) {
        score++;
      }
    }

    if (score > maxScore && score >= 1) {
      maxScore = score;
      bestIndex = r;
    }
  }

  return bestIndex;
}

export function detectReportDateRange(matrix: (string | number | null | undefined)[][]): {
  calculatedDays?: number;
  dateRangeStr?: string;
} {
  if (!matrix || matrix.length === 0) return {};

  const dateRegex = /\b(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})\b/g;
  let foundDates: { date: Date; rawStr: string }[] = [];

  // Prioritize scanning Row 4 (index 3, 0-based), then surrounding rows
  const rowsToScan: number[] = [];
  if (matrix.length >= 4) rowsToScan.push(3); // Row 4 (1-indexed)
  for (let r = 0; r < Math.min(matrix.length, 15); r++) {
    if (!rowsToScan.includes(r)) rowsToScan.push(r);
  }

  for (const r of rowsToScan) {
    const row = matrix[r];
    if (!row) continue;

    const rowStr = row.map(c => String(c || '')).join(' ');
    let match;
    dateRegex.lastIndex = 0;
    const rowDates: { date: Date; rawStr: string }[] = [];

    while ((match = dateRegex.exec(rowStr)) !== null) {
      const day = parseInt(match[1], 10);
      const month = parseInt(match[2], 10) - 1;
      let year = parseInt(match[3], 10);
      if (year < 100) year += 2000;

      if (month >= 0 && month < 12 && day >= 1 && day <= 31) {
        const d = new Date(year, month, day);
        if (!isNaN(d.getTime())) {
          rowDates.push({ date: d, rawStr: match[0] });
        }
      }
    }

    if (rowDates.length >= 2) {
      foundDates = rowDates;
      break; // Successfully matched date range in this row!
    } else if (rowDates.length > 0 && foundDates.length < 2) {
      foundDates.push(...rowDates);
    }
  }

  if (foundDates.length >= 2) {
    foundDates.sort((a, b) => a.date.getTime() - b.date.getTime());
    const startDate = foundDates[0].date;
    const endDate = foundDates[foundDates.length - 1].date;

    const diffTime = endDate.getTime() - startDate.getTime();
    const rawDays = Math.max(1, Math.round(diffTime / (1000 * 60 * 60 * 24)) + 1);

    // Highlight and classify into 7, 15, 30, 60, or 90 days period tier
    let calculatedDays = rawDays;
    if (rawDays <= 10) calculatedDays = 7;
    else if (rawDays <= 22) calculatedDays = 15;
    else if (rawDays <= 45) calculatedDays = 30;
    else if (rawDays <= 75) calculatedDays = 60;
    else calculatedDays = 90;

    const startStr = foundDates[0].rawStr.replace(/[\-\.]/g, '/');
    const endStr = foundDates[foundDates.length - 1].rawStr.replace(/[\-\.]/g, '/');

    return {
      calculatedDays,
      dateRangeStr: `${startStr}–${endStr}`
    };
  }

  return {};
}

/**
 * Formats a clean sales period without parser/debug wording (e.g. "03/09/2026–03/10/2026").
 * Returns "Period unavailable" when no valid date range is present.
 */
export function formatCleanSalesPeriod(rawPeriod?: string | null): string {
  if (!rawPeriod || typeof rawPeriod !== 'string') return 'Period unavailable';

  const cleaned = rawPeriod.trim();
  if (!cleaned) return 'Period unavailable';

  // Match date ranges like "DD/MM/YYYY to DD/MM/YYYY" or "DD-MM-YYYY - DD-MM-YYYY" or "YYYY-MM-DD"
  const dateRegex = /\b(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})\b/g;
  const dates = cleaned.match(dateRegex);

  if (dates && dates.length >= 2) {
    const start = dates[0].replace(/[\-\.]/g, '/');
    const end = dates[dates.length - 1].replace(/[\-\.]/g, '/');
    return `${start}–${end}`;
  }

  if (dates && dates.length === 1) {
    return dates[0].replace(/[\-\.]/g, '/');
  }

  // Strip legacy debug prefixes if present
  const stripped = cleaned
    .replace(/^Row\s*\d+\s*:\s*/i, '')
    .replace(/\s*\(\d+\s*Days\s*→\s*\d+\s*Days\s*Stock\)/i, '')
    .replace(/\s*\(\d+\s*Days\)/i, '')
    .replace(/\b\d+\s*Days\s*Report\b/i, '')
    .trim();

  if (stripped && !stripped.toLowerCase().includes('row') && !stripped.toLowerCase().includes('stock') && !stripped.toLowerCase().includes('days')) {
    return stripped.replace(/\s+to\s+/i, '–');
  }

  return 'Period unavailable';
}

export async function parseStockReportFile(file: File): Promise<ParseResult> {
  const fileExt = file.name.split('.').pop()?.toLowerCase();

  if (fileExt === 'xlsx' || fileExt === 'xls') {
    return parseExcelFile(file);
  } else {
    return parseCsvFile(file);
  }
}

function parseCsvFile(file: File): Promise<ParseResult> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: false, // Read as raw 2D array to locate starting header row (e.g. 8th row)
      skipEmptyLines: 'greedy',
      complete: (results) => {
        const rawMatrix = results.data as string[][];
        if (!rawMatrix || rawMatrix.length === 0) {
          reject(new Error('The CSV file is empty.'));
          return;
        }

        const dateRangeInfo = detectReportDateRange(rawMatrix);
        const headerRowIndex = findBestHeaderRowIndex(rawMatrix);
        const headerCells = rawMatrix[headerRowIndex] || [];
        const headers: string[] = headerCells.map((h, i) => String(h || '').trim() || `Column ${i + 1}`);

        const rows: Record<string, any>[] = [];
        for (let r = headerRowIndex + 1; r < rawMatrix.length; r++) {
          const rowData = rawMatrix[r];
          if (!rowData) continue;

          let hasVal = false;
          const rowObj: Record<string, any> = {};

          headers.forEach((h, colIdx) => {
            const cellVal = rowData[colIdx];
            if (cellVal !== undefined && cellVal !== null && String(cellVal).trim() !== '') {
              hasVal = true;
              rowObj[h] = String(cellVal).trim();
            } else {
              rowObj[h] = '';
            }
          });

          if (hasVal) {
            rows.push(rowObj);
          }
        }

        const detectedMapping = autoDetectColumns(headers);
        resolve({ 
          headers, 
          rows, 
          detectedMapping,
          detectedReportDays: dateRangeInfo.calculatedDays,
          detectedDateRangeStr: dateRangeInfo.dateRangeStr
        });
      },
      error: (err) => {
        reject(err);
      }
    });
  });
}

async function parseExcelFile(file: File): Promise<ParseResult> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(arrayBuffer);

    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      throw new Error('The Excel file contains no worksheets.');
    }

    const rawMatrix: string[][] = [];
    worksheet.eachRow({ includeEmpty: true }, (row) => {
      const rowArr: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const val = cell.value;
        let formattedVal = '';
        if (val !== null && val !== undefined) {
          if (typeof val === 'object' && 'result' in val) {
            formattedVal = String((val as any).result ?? '');
          } else if (typeof val === 'object' && 'richText' in val) {
            formattedVal = (val as any).richText.map((rt: any) => rt.text).join('');
          } else {
            formattedVal = String(val);
          }
        }
        rowArr[colNumber - 1] = formattedVal;
      });
      rawMatrix.push(rowArr);
    });

    if (rawMatrix.length === 0) {
      throw new Error('Excel sheet is empty.');
    }

    const dateRangeInfo = detectReportDateRange(rawMatrix);
    const headerRowIndex = findBestHeaderRowIndex(rawMatrix);
    const headerCells = rawMatrix[headerRowIndex] || [];
    const headers: string[] = headerCells.map((h, i) => String(h || '').trim() || `Column ${i + 1}`);

    const rows: Record<string, any>[] = [];
    for (let r = headerRowIndex + 1; r < rawMatrix.length; r++) {
      const rowData = rawMatrix[r];
      if (!rowData) continue;

      let hasVal = false;
      const rowObj: Record<string, any> = {};

      headers.forEach((h, colIdx) => {
        const cellVal = rowData[colIdx];
        if (cellVal !== undefined && cellVal !== null && String(cellVal).trim() !== '') {
          hasVal = true;
          rowObj[h] = String(cellVal).trim();
        } else {
          rowObj[h] = '';
        }
      });

      if (hasVal) {
        rows.push(rowObj);
      }
    }

    const detectedMapping = autoDetectColumns(headers);
    return { 
      headers, 
      rows, 
      detectedMapping,
      detectedReportDays: dateRangeInfo.calculatedDays,
      detectedDateRangeStr: dateRangeInfo.dateRangeStr
    };
  } catch (error: any) {
    throw new Error(error.message || 'Failed to parse Excel file.');
  }
}

export function cleanDateOnly(val: any): string {
  if (val === null || val === undefined || val === '') return '';

  const pad = (n: number) => String(n).padStart(2, '0');

  // 1. Handle JS Date object
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return '';
    return `${pad(val.getDate())}/${pad(val.getMonth() + 1)}/${val.getFullYear()}`;
  }

  // 2. Handle Excel Serial Date Number
  if (typeof val === 'number') {
    if (val > 20000 && val < 60000) {
      const jsDate = new Date(Math.round((val - 25569) * 86400 * 1000));
      if (!isNaN(jsDate.getTime())) {
        return `${pad(jsDate.getDate())}/${pad(jsDate.getMonth() + 1)}/${jsDate.getFullYear()}`;
      }
    }
  }

  let str = String(val).trim();
  if (!str) return '';

  // 3. Regex for DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY (with optional time after whitespace)
  const ddFirst = /^(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{4})(?:\s.*)?$/.exec(str);
  if (ddFirst) {
    const dd = pad(parseInt(ddFirst[1], 10));
    const mm = pad(parseInt(ddFirst[2], 10));
    const yyyy = ddFirst[3];
    return `${dd}/${mm}/${yyyy}`;
  }

  // 4. Regex for YYYY/MM/DD or YYYY-MM-DD or YYYY.MM.DD (with optional time after whitespace)
  const yyyyFirst = /^(\d{4})[-/. ](\d{1,2})[-/. ](\d{1,2})(?:\s.*)?$/.exec(str);
  if (yyyyFirst) {
    const yyyy = yyyyFirst[1];
    const mm = pad(parseInt(yyyyFirst[2], 10));
    const dd = pad(parseInt(yyyyFirst[3], 10));
    return `${dd}/${mm}/${yyyy}`;
  }

  // 5. Try parsing full date string via JS Date (handles "Wed Nov 16 1994 07:00:00 GMT...", ISO string "1994-11-16T07:00:00Z", etc.)
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    return `${pad(parsed.getDate())}/${pad(parsed.getMonth() + 1)}/${parsed.getFullYear()}`;
  }

  // 6. Fallback: try first word if string has spaces or 'T'
  const firstPart = str.split(/[T\s]+/)[0];
  if (firstPart && firstPart !== str) {
    const partDd = /^(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{4})$/.exec(firstPart);
    if (partDd) {
      return `${pad(parseInt(partDd[1], 10))}/${pad(parseInt(partDd[2], 10))}/${partDd[3]}`;
    }
    const partYyyy = /^(\d{4})[-/. ](\d{1,2})[-/. ](\d{1,2})$/.exec(firstPart);
    if (partYyyy) {
      return `${pad(parseInt(partYyyy[3], 10))}/${pad(parseInt(partYyyy[2], 10))}/${partYyyy[1]}`;
    }
  }

  return str;
}

export function convertRowsToProducts(rows: Record<string, any>[], mapping: ColumnMapping): Product[] {
  return rows.map((row, index) => {
    const getVal = (field?: string) => (field ? row[field] : undefined);
    const parseNum = (val: any, fallback = 0): number => {
      if (val === null || val === undefined || val === '') return fallback;
      if (typeof val === 'number') return isNaN(val) ? fallback : val;
      const cleanStr = String(val).replace(/[^0-9.-]/g, '');
      const num = parseFloat(cleanStr);
      return isNaN(num) ? fallback : num;
    };

    const rawBarcode = getVal(mapping.barcode);
    const barcodeStr = cleanBarcode(rawBarcode);

    const nameStr = String(getVal(mapping.name) || `Product #${index + 1}`).trim();

    // Auto-search for Category column if not explicitly mapped
    const categoryHeaderKey = Object.keys(row).find(k => {
      const norm = k.toLowerCase().replace(/[^a-z0-9]/g, '');
      return norm === 'category' || norm === 'categor' || norm === 'group' || norm === 'subgroup' || norm === 'brand' || norm === 'segment';
    });
    const categoryStr = String(getVal(mapping.category) || (categoryHeaderKey ? row[categoryHeaderKey] : '') || row['CATEGORY'] || row['Category'] || row['GROUP'] || row['Group'] || 'General').trim();

    // Column B (MainCode - Food, Grocery, Nonfood, Noncore, SOR, SOR-S, Vegetable & Fruit, etc.)
    const mainCodeHeaderKey = Object.keys(row).find(k => {
      const norm = k.toLowerCase().replace(/[^a-z0-9]/g, '');
      return norm === 'maincode' || norm === 'main_code' || norm === 'maingroup' || norm === 'main_group' || norm === 'dept' || norm === 'department';
    });
    const rowKeys = Object.keys(row);
    let mainCodeStr = '';
    if (mapping.mainCode && row[mapping.mainCode] !== undefined && row[mapping.mainCode] !== null) {
      mainCodeStr = String(row[mapping.mainCode]).trim();
    } else if (mainCodeHeaderKey && row[mainCodeHeaderKey] !== undefined && row[mainCodeHeaderKey] !== null) {
      mainCodeStr = String(row[mainCodeHeaderKey]).trim();
    } else if (rowKeys.length >= 2 && rowKeys[1] && row[rowKeys[1]] !== undefined && row[rowKeys[1]] !== null) {
      mainCodeStr = String(row[rowKeys[1]]).trim();
    }

    if (isExcludedMainCode(mainCodeStr)) {
      return null as any;
    }

    const mrp = parseNum(getVal(mapping.mrp));
    let costPrice = parseNum(getVal(mapping.costPrice), 0);
    if (costPrice <= 0) {
      const costKey = Object.keys(row).find(k => {
        const norm = k.toLowerCase().replace(/[^a-z0-9]/g, '');
        return ['costprice', 'cost', 'netrate', 'averagerate', 'avragerate', 'purrate', 'buyprice', 'buyingprice', 'buyrate', 'costrate', 'purchaserate', 'cp', 'purchaseprice', 'inwardrate', 'inwardprice', 'lastpurrate'].includes(norm);
      });
      if (costKey) {
        costPrice = parseNum(row[costKey], 0);
      }
    }

    const retailPrice = parseNum(getVal(mapping.retailPrice), mrp);
    const stock = parseNum(getVal(mapping.stock), 0);
    const openingStock = parseNum(getVal(mapping.openingStock), 0);
    const purchaseQty = parseNum(getVal(mapping.purchaseQty), 0);
    const salesCount = parseNum(getVal(mapping.salesCount) ?? (mapping.salePrice ? getVal(mapping.salePrice) : undefined), 0);
    let localCodeStr = String(getVal(mapping.localCode) || '').trim();
    if (!localCodeStr) {
      const codeKey = Object.keys(row).find((k, idx) => {
        if (idx === 1) return false; // Exclude column B (mainCode)
        const norm = k.toLowerCase().replace(/[^a-z0-9]/g, '');
        return ['code', 'bansalcode', 'bansal', 'localcode', 'itemcode', 'shortcode', 'storecode'].includes(norm);
      });
      if (codeKey) {
        localCodeStr = String(row[codeKey] || '').trim();
      } else if (rowKeys.length >= 10 && rowKeys[9] && row[rowKeys[9]]) {
        localCodeStr = String(row[rowKeys[9]]).trim();
      }
    }
    if (
      localCodeStr && (
        localCodeStr.toLowerCase() === categoryStr.toLowerCase() ||
        ['grocery', 'food', 'nonfood', 'non-food', 'dairy', 'beverage', 'beverages', 'staples', 'fmcg', 'general'].includes(localCodeStr.toLowerCase())
      )
    ) {
      localCodeStr = '';
    }
    const brandStr = String(getVal(mapping.brand) || row['Brand'] || row['BRAND'] || '').trim();
    const manufacturerStr = String(getVal(mapping.manufacturer) || row['Manufacturer'] || row['MANUFACTURER'] || '').trim();
    const lastPurchaseDateStr = cleanDateOnly(getVal(mapping.lastPurchaseDate) || row['Last Pur Date'] || row['Pur Date']);
    const lastPurchaseNoStr = String(getVal(mapping.lastPurchaseNo) || row['Last Pur No'] || row['Pur No'] || '').trim();
    const supplierNameStr = String(getVal(mapping.supplierName) || row['Supplier'] || row['Vendor'] || row['Party'] || '').trim();

    // Generate fallback barcode if empty
    const barcode = barcodeStr || `AUTO-${100000 + index}`;

    // Extract ALL custom attributes for rawRowData retaining EVERY column from the uploaded file
    const customKeys = Object.keys(row).filter(
      k =>
        row[k] !== null &&
        row[k] !== undefined &&
        row[k] !== ''
    );

    let rawRowData: Record<string, any> | undefined = undefined;
    if (customKeys.length > 0) {
      rawRowData = {};
      for (const k of customKeys) {
        if (row[k] !== undefined) {
          rawRowData[k] = row[k];
        }
      }
    }

    const product: Product = {
      id: `prod-${index}-${Date.now().toString(36)}`,
      barcode,
      name: nameStr,
      category: categoryStr || 'General',
      mrp,
      retailPrice,
      salePrice: retailPrice,
      stock,
      closingQty: stock,
      salesCount,
      salesQty: salesCount
    };

    if (mainCodeStr) product.mainCode = mainCodeStr;
    if (brandStr) product.brand = brandStr;
    if (manufacturerStr) product.manufacturer = manufacturerStr;
    if (openingStock > 0) {
      product.openingStock = openingStock;
      product.openingQty = openingStock;
    }
    if (purchaseQty > 0) product.purchaseQty = purchaseQty;
    if (costPrice > 0) {
      product.costPrice = costPrice;
      product.cost = costPrice;
    }
    if (localCodeStr) {
      product.localCode = localCodeStr;
      product.bansalCode = localCodeStr;
      product.code = localCodeStr;
    }
    if (lastPurchaseDateStr) product.lastPurchaseDate = lastPurchaseDateStr;
    if (lastPurchaseNoStr) {
      product.lastPurchaseNo = lastPurchaseNoStr;
      product.lastPurchaseNumber = lastPurchaseNoStr;
    }
    if (supplierNameStr) {
      product.supplierName = supplierNameStr;
      product.supplier = supplierNameStr;
    }
    if (rawRowData) {
      product.rawRowData = rawRowData;
    }

    return product;
  }).filter((p): p is Product => p !== null && p !== undefined);
}

