import ExcelJS from 'exceljs';
import Papa from 'papaparse';
import { FocusType, FocusProductItem } from '../types';
import { normalizeFocusCode } from './focusMatcher';

export interface FocusValidationStats {
  totalRows: number;
  validProductsCount: number;
  duplicateCodesCount: number;
  duplicateCodes: string[];
  missingOrInvalidCodeCount: number;
  invalidRows: { rowNumber: number; rawCode: string; name: string; reason: string }[];
}

export interface FocusParsedFileResult {
  detectedType: FocusType;
  detectedMonthKey: string;
  detectedMonthDisplay: string;
  detectedSheetName: string;
  headers: string[];
  detectedColumns: {
    codeColHeader?: string;
    nameColHeader?: string;
    categoryColHeader?: string;
    mrpColHeader?: string;
    offerColHeader?: string;
  };
  items: FocusProductItem[];
  validation: FocusValidationStats;
  totalRows: number;
}

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

/**
 * Extracts month and year from a filename or text string.
 * Examples:
 * "CORE FOCUS SEPTEMBER 2026.xlsx" -> { monthKey: "2026-09", monthDisplay: "September 2026" }
 */
export function detectMonthFromText(text: string): { monthKey: string; monthDisplay: string } {
  const clean = text.toLowerCase();
  const currentYear = new Date().getFullYear();
  const currentMonthIdx = new Date().getMonth(); // 0-11

  // Check full month names or 3-letter abbreviations
  for (let i = 0; i < MONTH_NAMES.length; i++) {
    const full = MONTH_NAMES[i].toLowerCase();
    const short = full.slice(0, 3);
    if (clean.includes(full) || (short.length >= 3 && clean.includes(short))) {
      // Look for 4-digit year nearby (e.g. 2025, 2026, 2027)
      const yearMatch = text.match(/\b(20\d{2})\b/);
      const year = yearMatch ? parseInt(yearMatch[1], 10) : currentYear;
      const monthNum = String(i + 1).padStart(2, '0');
      return {
        monthKey: `${year}-${monthNum}`,
        monthDisplay: `${MONTH_NAMES[i]} ${year}`
      };
    }
  }

  // Check numerical date patterns like 09-2026 or 09/2026 or 2026-09
  const numPattern1 = /\b(0[1-9]|1[0-2])[-/.](20\d{2})\b/.exec(text);
  if (numPattern1) {
    const monthIdx = parseInt(numPattern1[1], 10) - 1;
    const year = parseInt(numPattern1[2], 10);
    return {
      monthKey: `${year}-${numPattern1[1]}`,
      monthDisplay: `${MONTH_NAMES[monthIdx]} ${year}`
    };
  }

  const numPattern2 = /\b(20\d{2})[-/.](0[1-9]|1[0-2])\b/.exec(text);
  if (numPattern2) {
    const year = parseInt(numPattern2[1], 10);
    const monthIdx = parseInt(numPattern2[2], 10) - 1;
    return {
      monthKey: `${year}-${numPattern2[2]}`,
      monthDisplay: `${MONTH_NAMES[monthIdx]} ${year}`
    };
  }

  // Default to current month and year
  const defaultMonthNum = String(currentMonthIdx + 1).padStart(2, '0');
  return {
    monthKey: `${currentYear}-${defaultMonthNum}`,
    monthDisplay: `${MONTH_NAMES[currentMonthIdx]} ${currentYear}`
  };
}

/**
 * Detects whether the file / sheet is CORE or NON-CORE Focus.
 */
export function detectFocusType(fileName: string, sheetName: string = ''): FocusType {
  const combined = `${fileName} ${sheetName}`.toLowerCase();
  if (combined.includes('non core') || combined.includes('non-core') || combined.includes('noncore')) {
    return 'non_core';
  }
  if (combined.includes('core')) {
    return 'core';
  }
  return 'core'; // Default
}

/**
 * Normalizes header string for keyword matching
 */
function normHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Parses raw number or returns undefined
 */
function parseFocusNumber(val: any): number | undefined {
  if (val === null || val === undefined || val === '') return undefined;
  if (typeof val === 'number') return isNaN(val) ? undefined : val;
  const clean = String(val).replace(/[^0-9.-]/g, '');
  const num = parseFloat(clean);
  return isNaN(num) ? undefined : num;
}

/**
 * Parses a Focus Excel or CSV file.
 * Prioritizes the 'PRINT' worksheet for CORE Focus files.
 */
export async function parseFocusFile(file: File): Promise<FocusParsedFileResult> {
  const fileName = file.name;
  const isCsv = fileName.toLowerCase().endsWith('.csv');

  let rawMatrix: any[][] = [];
  let detectedSheetName = 'Default';

  if (isCsv) {
    const text = await file.text();
    const parsed = Papa.parse(text, { skipEmptyLines: false });
    rawMatrix = parsed.data as any[][];
    detectedSheetName = 'CSV Data';
  } else {
    const arrayBuffer = await file.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(arrayBuffer);

    // Pick worksheet: Prioritize "PRINT" sheet (case-insensitive), or sheets matching "NON CORE", "OFFERS", "FOCUS", etc.
    let selectedSheet: ExcelJS.Worksheet | undefined;

    // Pass 1: Prioritize "PRINT" sheet
    workbook.eachSheet((sheet) => {
      const cleanSheetName = sheet.name.trim().toLowerCase();
      if (cleanSheetName === 'print' && sheet.rowCount > 0) {
        selectedSheet = sheet;
        detectedSheetName = sheet.name;
      }
    });

    // Pass 2: Check for sheets with "non core", "non-core", "focus", "offer" in name
    if (!selectedSheet) {
      workbook.eachSheet((sheet) => {
        const cleanSheetName = sheet.name.trim().toLowerCase();
        if ((cleanSheetName.includes('non core') || cleanSheetName.includes('non-core') || cleanSheetName.includes('noncore') || cleanSheetName.includes('offer') || cleanSheetName.includes('focus')) && sheet.rowCount > 0) {
          if (!selectedSheet) {
            selectedSheet = sheet;
            detectedSheetName = sheet.name;
          }
        }
      });
    }

    // Pass 3: Fallback to first non-empty worksheet
    if (!selectedSheet) {
      workbook.eachSheet((sheet) => {
        if (!selectedSheet && sheet.rowCount > 0) {
          selectedSheet = sheet;
          detectedSheetName = sheet.name;
        }
      });
    }

    if (!selectedSheet) {
      throw new Error('No readable worksheet found in the uploaded Focus Excel file.');
    }

    selectedSheet.eachRow({ includeEmpty: false }, (row) => {
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
          // Preserve text formatting or convert to string
          rowVals[colNumber - 1] = typeof val === 'string' ? val.trim() : val;
        } else {
          rowVals[colNumber - 1] = '';
        }
      });
      rawMatrix.push(rowVals);
    });
  }

  if (rawMatrix.length === 0) {
    throw new Error('The uploaded file is empty.');
  }

  // Find best header row index
  // Columns expected in Core Focus: CODE, CATEGORY, ITEM, MRP, OFFER
  let bestHeaderIdx = 0;
  let maxScore = -1;

  for (let r = 0; r < Math.min(rawMatrix.length, 25); r++) {
    const row = rawMatrix[r] || [];
    let score = 0;
    const rowNormStrings = row.map(cell => normHeader(String(cell || '')));

    for (const str of rowNormStrings) {
      if (!str) continue;
      // High score for exact core column matches
      if (str === 'code' || str === 'itemcode' || str === 'bansalcode') score += 10;
      else if (str === 'item' || str === 'itemname' || str === 'description') score += 10;
      else if (str === 'category' || str === 'group') score += 8;
      else if (str === 'mrp' || str === 'mrpamount') score += 8;
      else if (str === 'offer' || str === 'scheme' || str === 'focusoffer') score += 8;
      else if (str.includes('code')) score += 5;
      else if (str.includes('item') || str.includes('product') || str.includes('particulars')) score += 5;
      else if (str.includes('offer') || str.includes('scheme') || str.includes('promo')) score += 5;
      else if (str.includes('mrp') || str.includes('price')) score += 4;
      else if (str.includes('category') || str.includes('brand')) score += 3;
    }

    if (score > maxScore) {
      maxScore = score;
      bestHeaderIdx = r;
    }
  }

  const rawHeaders = rawMatrix[bestHeaderIdx] || [];
  const headers: string[] = rawHeaders.map((h, i) => String(h || '').trim() || `Column_${i + 1}`);

  // Header column index finder
  const findColIdx = (keywords: string[]): number => {
    // Pass 1: exact normalized match
    for (let i = 0; i < headers.length; i++) {
      const nh = normHeader(headers[i]);
      if (keywords.includes(nh)) return i;
    }
    // Pass 2: substring match
    for (let i = 0; i < headers.length; i++) {
      const nh = normHeader(headers[i]);
      if (keywords.some(kw => nh.includes(kw) || kw.includes(nh))) return i;
    }
    return -1;
  };

  // Primary column matches according to user specifications:
  // CODE -> Bansal / Local Code
  // CATEGORY -> Category
  // ITEM -> Product Name
  // MRP -> Focus MRP
  // OFFER -> Focus Offer
  const codeCol = findColIdx(['code', 'bansalcode', 'bansal_code', 'itemcode', 'item_code', 'localcode', 'productcode', 'artno', 'plu', 'shortcode']);
  const categoryCol = findColIdx(['category', 'group', 'subgroup', 'sub_group', 'dept', 'department', 'segment']);
  const nameCol = findColIdx(['item', 'itemname', 'description', 'itemdescription', 'productdescription', 'productname', 'particulars', 'product', 'title', 'name']);
  const mrpCol = findColIdx(['mrp', 'maxretailprice', 'listprice', 'markedprice', 'price']);
  const offerCol = findColIdx([
    'offer', 'focusoffer', 'scheme', 'consumeroffer', 'focusscheme', 
    'promotion', 'deal', 'promo', 'offerdesc', 'offerdescription', 
    'schemedetails', 'offerdetails', 'originaloffer', 'original_offer',
    'originalscheme', 'original_scheme', 'promoofer', 'promotionaloffer',
    'dealoffer', 'offers', 'schemes', 'remarks', 'details', 'plan', 'offertext'
  ]);
  const brandCol = findColIdx(['brand', 'company', 'mfg', 'manufacturer']);
  const discountCol = findColIdx(['discount', 'disc', 'discpercent', 'discountpercent', 'off']);
  const specialPriceCol = findColIdx(['focusprice', 'specialprice', 'offerprice', 'saleprice', 'dealprice', 'rate', 'sp', 'sellingprice']);

  const detectedColumns = {
    codeColHeader: codeCol !== -1 ? headers[codeCol] : undefined,
    nameColHeader: nameCol !== -1 ? headers[nameCol] : undefined,
    categoryColHeader: categoryCol !== -1 ? headers[categoryCol] : undefined,
    mrpColHeader: mrpCol !== -1 ? headers[mrpCol] : undefined,
    offerColHeader: offerCol !== -1 ? headers[offerCol] : undefined
  };

  const items: FocusProductItem[] = [];
  const seenCodes = new Map<string, number>();
  const duplicateCodesList: string[] = [];
  const invalidRows: { rowNumber: number; rawCode: string; name: string; reason: string }[] = [];
  let totalDataRowsScanned = 0;

  for (let r = bestHeaderIdx + 1; r < rawMatrix.length; r++) {
    const row = rawMatrix[r];
    if (!row) continue;

    // Check if row has any non-empty cells
    const hasData = row.some(cell => cell !== null && cell !== undefined && String(cell).trim() !== '');
    if (!hasData) continue;

    totalDataRowsScanned++;
    const rowNumber = r + 1;

    // Extract CODE as strict TEXT and normalize to 9 digits with leading zeros
    const rawCodeVal = codeCol !== -1 ? row[codeCol] : row[0];
    const rawNameVal = nameCol !== -1 ? row[nameCol] : row[1];
    const rawCategoryVal = categoryCol !== -1 ? row[categoryCol] : undefined;
    const rawMrpVal = mrpCol !== -1 ? row[mrpCol] : undefined;
    const rawOfferVal = offerCol !== -1 ? row[offerCol] : undefined;
    const rawBrandVal = brandCol !== -1 ? row[brandCol] : undefined;
    const rawDiscountVal = discountCol !== -1 ? row[discountCol] : undefined;
    const rawSpecialPriceVal = specialPriceCol !== -1 ? row[specialPriceCol] : undefined;

    const codeStr = normalizeFocusCode(rawCodeVal);
    const nameStr = rawNameVal !== null && rawNameVal !== undefined ? String(rawNameVal).trim() : '';

    // Check if it is a summary footer row (e.g. "Total", "Grand Total", "Count")
    const lowerCode = codeStr.toLowerCase();
    const lowerName = nameStr.toLowerCase();
    if (
      lowerCode.includes('total') || lowerCode.includes('count') || lowerCode.includes('summary') ||
      lowerName.startsWith('total') || lowerName.startsWith('grand total')
    ) {
      continue;
    }

    // Validation checks
    if (!codeStr) {
      invalidRows.push({
        rowNumber,
        rawCode: String(rawCodeVal || ''),
        name: nameStr || 'Unnamed Item',
        reason: 'Missing or empty product code'
      });
      continue;
    }

    // Track duplicate normalized codes
    const prevCount = seenCodes.get(codeStr) || 0;
    seenCodes.set(codeStr, prevCount + 1);
    if (prevCount === 1) {
      duplicateCodesList.push(codeStr);
    }

    // Retain all raw row data
    const rawRowData: Record<string, any> = {};
    headers.forEach((h, idx) => {
      const val = row[idx];
      if (val !== undefined && val !== null && String(val).trim() !== '') {
        rawRowData[h] = String(val).trim();
      }
    });

    const categoryStr = rawCategoryVal !== undefined && rawCategoryVal !== null ? String(rawCategoryVal).trim() : undefined;
    const brandStr = rawBrandVal !== undefined && rawBrandVal !== null ? String(rawBrandVal).trim() : undefined;
    const mrp = parseFocusNumber(rawMrpVal);
    
    // Import OFFER verbatim as provided in Excel (B1G1, 20% OFF, 46/- RS OFF, etc.)
    const offerStr = rawOfferVal !== undefined && rawOfferVal !== null ? String(rawOfferVal).trim() : undefined;
    const specialPrice = parseFocusNumber(rawSpecialPriceVal);
    const discountVal = rawDiscountVal !== undefined && rawDiscountVal !== null ? String(rawDiscountVal).trim() : undefined;

    const item: FocusProductItem = {
      id: `focus_item_${r}_${codeStr}_${Date.now().toString(36)}`,
      code: codeStr, // 9-digit normalized text
      bansalCode: codeStr,
      name: nameStr || `Focus Item ${items.length + 1}`,
      itemName: nameStr || `Focus Item ${items.length + 1}`,
      category: categoryStr,
      brand: brandStr,
      mrp,
      focusMrp: mrp,
      focusOffer: offerStr, // Stored and displayed as provided
      offerText: offerStr,
      specialPrice,
      discount: discountVal,
      rawRowData
    };

    items.push(item);
  }

  const validation: FocusValidationStats = {
    totalRows: totalDataRowsScanned,
    validProductsCount: items.length,
    duplicateCodesCount: duplicateCodesList.length,
    duplicateCodes: duplicateCodesList,
    missingOrInvalidCodeCount: invalidRows.length,
    invalidRows
  };

  const detectedType = detectFocusType(fileName, detectedSheetName);
  const { monthKey, monthDisplay } = detectMonthFromText(`${fileName} ${detectedSheetName}`);

  return {
    detectedType,
    detectedMonthKey: monthKey,
    detectedMonthDisplay: monthDisplay,
    detectedSheetName,
    headers,
    detectedColumns,
    items,
    validation,
    totalRows: items.length
  };
}
