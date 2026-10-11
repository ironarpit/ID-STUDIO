import ExcelJS from 'exceljs';
import { 
  Product, 
  FocusProductItem, 
  MatchedFocusProduct, 
  FocusSummaryStats,
  FocusType,
  FocusStockStatus,
  EvaluatedFocusProduct,
  FocusIQStats,
  FocusOfferStatus,
  OfferParsedType,
  EvaluatedFocusOfferProduct,
  FocusOfferStats
} from '../types';

/**
 * Normalizes a Focus / Stock code as TEXT preserving leading zeros.
 * Standardizes valid numeric codes to 9-digit padded strings (e.g. '2031916' -> '002031916').
 * Never converts to a number.
 */
export function normalizeFocusCode(val: any): string {
  if (val === null || val === undefined) return '';
  let str = String(val).trim();

  // Remove potential invisible unicode whitespaces/BOM
  str = str.replace(/[\u200B-\u200D\uFEFF]/g, '').trim();

  // Remove trailing .0 if Excel represented an integer as decimal e.g. "2031916.0" or "013013394.0"
  if (str.endsWith('.0')) {
    str = str.slice(0, -2).trim();
  }

  if (!str) return '';

  // If pure numeric code, pad to exactly 9 digits if shorter than 9
  // Examples: '2031916' -> '002031916', '2020626' -> '002020626', '13013394' -> '013013394', '013013394' -> '013013394'
  if (/^\d+$/.test(str)) {
    if (str.length < 9) {
      str = str.padStart(9, '0');
    }
  }

  return str;
}

/**
 * Formats a raw focus offer string into a clean, standardized badge label.
 * Examples:
 * - "125 off", "125 OFF", "46/- rs off" -> "₹125 OFF", "₹46 OFF"
 * - "₹100 OFF", "100 off" -> "₹100 OFF"
 * - "99 only", "99/- only", "₹99 ONLY" -> "₹99 ONLY"
 * - "b1g1", "B1G1" -> "B1G1"
 * - "b1g2", "B1G2" -> "B1G2"
 * - "buy 1 get 1 free" -> "BUY 1 GET 1 FREE"
 * - "20% off", "20%" -> "20% OFF"
 */
export function formatCleanOfferBadge(offerText?: string): string {
  if (!offerText) return '';
  const trimmed = offerText.trim();
  if (!trimmed) return '';

  // 1. Rupee off: e.g. "125 off", "46/- rs off", "100 off", "₹100 OFF"
  const rupeeOffMatch = trimmed.match(/^(?:(?:rs\.?|₹)\s*)?(\d+(?:\.\d+)?)\s*(?:\/[-–])?\s*(?:rs\.?)?\s*off$/i);
  if (rupeeOffMatch) {
    return `₹${rupeeOffMatch[1]} OFF`;
  }

  // 2. Fixed Selling Price / ONLY: e.g. "99 only", "99/- only", "₹99 only"
  const onlyMatch = trimmed.match(/^(?:(?:rs\.?|₹)\s*)?(\d+(?:\.\d+)?)\s*(?:\/[-–])?\s*(?:rs\.?)?\s*only$/i);
  if (onlyMatch) {
    return `₹${onlyMatch[1]} ONLY`;
  }

  // 3. Multi-buy: standard clean uppercase e.g. "b1g1" -> "B1G1", "b1 g1" -> "B1G1"
  const bxyMatch = trimmed.match(/^b\s*(\d+)\s*[-/]?\s*g\s*(\d+)$/i);
  if (bxyMatch) {
    return `B${bxyMatch[1]}G${bxyMatch[2]}`;
  }

  // 4. Percentage off e.g. "20% off", "20%" -> "20% OFF"
  const pctMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s*%\s*(?:off)?$/i);
  if (pctMatch) {
    return `${pctMatch[1]}% OFF`;
  }

  // Fallback: clean trimmed uppercase
  return trimmed.toUpperCase();
}

/**
 * Builds a lookup map from Stock IQ products indexed by Bansal / Local Code.
 * Note: Barcode / EAN is strictly EXCLUDED from focus matching as required.
 */
export function buildStockCodeMap(stockProducts: Product[]): Map<string, Product> {
  const codeMap = new Map<string, Product>();

  for (const prod of stockProducts) {
    if (!prod) continue;

    // Index by bansalCode, localCode, and code (all represent Bansal / Local store item code)
    const bansal = normalizeFocusCode(prod.bansalCode);
    if (bansal && !codeMap.has(bansal)) {
      codeMap.set(bansal, prod);
    }

    const local = normalizeFocusCode(prod.localCode);
    if (local && !codeMap.has(local)) {
      codeMap.set(local, prod);
    }

    const code = normalizeFocusCode(prod.code);
    if (code && !codeMap.has(code)) {
      codeMap.set(code, prod);
    }
  }

  return codeMap;
}

/**
 * Matches a list of Focus items against the active Stock IQ products.
 * Uses ONLY Focus Excel CODE -> Stock IQ Bansal / Local Code.
 */
export function matchFocusProductsWithStock(
  focusItems: FocusProductItem[],
  stockProducts: Product[]
): MatchedFocusProduct[] {
  const stockMap = buildStockCodeMap(stockProducts);

  return focusItems.map((focusItem) => {
    const normCode = normalizeFocusCode(focusItem.code);
    const matchedStock = normCode ? stockMap.get(normCode) : undefined;

    return {
      focusItem,
      isMatched: !!matchedStock,
      stockProduct: matchedStock
    };
  });
}

/**
 * Computes summary stats for a list of matched focus products.
 */
export function calculateFocusStats(
  matchedList: MatchedFocusProduct[],
  monthDisplay: string,
  lastUploadedAt?: string,
  fileName?: string
): FocusSummaryStats {
  const total = matchedList.length;
  const matched = matchedList.filter(m => m.isMatched).length;
  const notMatched = total - matched;
  const percentage = total > 0 ? Math.round((matched / total) * 100) : 0;

  return {
    activeMonth: monthDisplay,
    totalProducts: total,
    matchedCount: matched,
    notMatchedCount: notMatched,
    matchedPercentage: percentage,
    lastUploadedAt,
    fileName
  };
}

// ==========================================
// STAGE 2 — LIVE STOCK IQ EVALUATION & ISSUES
// ==========================================

/**
 * Evaluates monthly Focus products against the active Stock IQ dataset.
 * Status logic:
 * 1. NOT_MATCHED: Focus CODE does not match any Stock IQ Bansal/Local Code.
 * 2. OUT_OF_STOCK: Closing Stock Qty <= 0 (Stock 0 or negative is OUT OF STOCK).
 * 3. LOW_STOCK: Stock > 0 AND Sales > 0 AND valid reportDays available AND Stock Cover Days <= 7.
 *    (Average Daily Sales = Sales Qty / reportDays, Stock Cover Days = Stock Qty / Avg Daily Sales).
 * 4. AVAILABLE: Stock > 0 and does not qualify as LOW_STOCK. (If Sales = 0, product is AVAILABLE).
 */
export function evaluateFocusProductsWithLiveStock(
  focusItems: FocusProductItem[],
  stockProducts: Product[],
  reportDays?: number | null
): EvaluatedFocusProduct[] {
  const stockMap = buildStockCodeMap(stockProducts);
  const validReportDays = (typeof reportDays === 'number' && reportDays > 0) ? reportDays : null;

  return focusItems.map((focusItem) => {
    const normCode = normalizeFocusCode(focusItem.code);
    const matchedStock = normCode ? stockMap.get(normCode) : undefined;
    const isMatched = !!matchedStock;

    if (!isMatched) {
      return {
        focusItem,
        isMatched: false,
        stockProduct: undefined,
        code: normCode || focusItem.code,
        productName: focusItem.name || 'Unknown Focus Product',
        category: focusItem.category || '',
        brand: focusItem.brand || '',
        focusOffer: focusItem.focusOffer || '',
        salesQty: 0,
        stockQty: 0,
        avgDailySales: null,
        stockCoverDays: null,
        costPrice: 0,
        mrp: focusItem.mrp || 0,
        retailPrice: focusItem.mrp || 0,
        status: 'NOT_MATCHED' as FocusStockStatus,
      };
    }

    // Matched product: Read live fields from active Stock IQ dataset
    const stockQty = matchedStock.stock ?? matchedStock.closingQty ?? 0;
    const salesQty = matchedStock.salesCount ?? matchedStock.salesQty ?? 0;
    const costPrice = matchedStock.costPrice ?? matchedStock.cost ?? 0;
    const mrp = matchedStock.mrp ?? focusItem.mrp ?? 0;
    const retailPrice = matchedStock.retailPrice ?? matchedStock.salePrice ?? mrp;
    const category = focusItem.category || matchedStock.category || '';
    const brand = focusItem.brand || matchedStock.brand || '';
    const productName = matchedStock.name || focusItem.name;
    const focusOffer = focusItem.focusOffer || '';

    let status: FocusStockStatus = 'AVAILABLE';
    let avgDailySales: number | null = null;
    let stockCoverDays: number | null = null;

    if (stockQty <= 0) {
      // OUT OF STOCK: Closing Stock Qty <= 0 (Stock 0 or negative is OUT OF STOCK)
      status = 'OUT_OF_STOCK';
      stockCoverDays = 0;
      if (validReportDays && salesQty > 0) {
        avgDailySales = salesQty / validReportDays;
      }
    } else {
      // Stock > 0
      if (validReportDays && salesQty > 0) {
        avgDailySales = salesQty / validReportDays;
        stockCoverDays = stockQty / avgDailySales; // Equivalent: (stockQty * validReportDays) / salesQty

        if (stockCoverDays <= 7) {
          status = 'LOW_STOCK';
        } else {
          status = 'AVAILABLE';
        }
      } else {
        // If Sales Qty = 0 or valid report period is not available:
        // Do NOT call the product Low Stock. It remains AVAILABLE while Stock > 0.
        avgDailySales = validReportDays && salesQty === 0 ? 0 : null;
        stockCoverDays = null;
        status = 'AVAILABLE';
      }
    }

    return {
      focusItem,
      isMatched: true,
      stockProduct: matchedStock,
      code: normCode || focusItem.code,
      productName,
      category,
      brand,
      focusOffer,
      salesQty,
      stockQty,
      avgDailySales,
      stockCoverDays,
      costPrice,
      mrp,
      retailPrice,
      status,
    };
  });
}

/**
 * Calculates live Focus IQ summary statistics across all 4 disjoint statuses.
 * Sum: outOfStock + lowStock + available + notMatched === total.
 */
export function calculateFocusIQStats(
  evaluatedList: EvaluatedFocusProduct[],
  monthDisplay: string,
  reportDays?: number | null,
  lastUploadedAt?: string,
  fileName?: string
): FocusIQStats {
  const total = evaluatedList.length;
  let outOfStock = 0;
  let lowStock = 0;
  let available = 0;
  let notMatched = 0;

  for (const item of evaluatedList) {
    if (item.status === 'OUT_OF_STOCK') outOfStock++;
    else if (item.status === 'LOW_STOCK') lowStock++;
    else if (item.status === 'AVAILABLE') available++;
    else if (item.status === 'NOT_MATCHED') notMatched++;
  }

  return {
    activeMonth: monthDisplay,
    totalProducts: total,
    outOfStockCount: outOfStock,
    lowStockCount: lowStock,
    availableCount: available,
    notMatchedCount: notMatched,
    reportDays: (typeof reportDays === 'number' && reportDays > 0) ? reportDays : null,
    lastUploadedAt,
    fileName,
  };
}

/**
 * Sorts Focus issues for Purchase Action:
 * 1. OUT OF STOCK
 * 2. LOW STOCK with lowest Stock Cover Days
 * 3. Higher Sales Qty when cover is equal
 */
export function sortFocusIssues(issues: EvaluatedFocusProduct[]): EvaluatedFocusProduct[] {
  return [...issues].sort((a, b) => {
    // 1. OUT OF STOCK first
    if (a.status === 'OUT_OF_STOCK' && b.status !== 'OUT_OF_STOCK') return -1;
    if (a.status !== 'OUT_OF_STOCK' && b.status === 'OUT_OF_STOCK') return 1;

    // Both OUT OF STOCK -> rank by higher Sales Qty, then lower Stock (e.g. -2 before 0)
    if (a.status === 'OUT_OF_STOCK' && b.status === 'OUT_OF_STOCK') {
      if ((b.salesQty || 0) !== (a.salesQty || 0)) {
        return (b.salesQty || 0) - (a.salesQty || 0);
      }
      return (a.stockQty || 0) - (b.stockQty || 0);
    }

    // 2. LOW STOCK with lowest Stock Cover Days
    const coverA = a.stockCoverDays !== null ? a.stockCoverDays : 999999;
    const coverB = b.stockCoverDays !== null ? b.stockCoverDays : 999999;
    if (Math.abs(coverA - coverB) > 0.0001) {
      return coverA - coverB;
    }

    // 3. Higher Sales Qty when cover is equal
    if ((b.salesQty || 0) !== (a.salesQty || 0)) {
      return (b.salesQty || 0) - (a.salesQty || 0);
    }

    // Tie-breaker: lower stock quantity
    return (a.stockQty || 0) - (b.stockQty || 0);
  });
}

/**
 * Generates plain text formatted for WhatsApp from the filtered issues list.
 */
export function generateFocusWhatsAppText(
  items: EvaluatedFocusProduct[],
  focusType: FocusType,
  filterType: 'all' | 'out_of_stock' | 'low_stock' = 'all'
): string {
  const heading = focusType === 'core' 
    ? '*CORE FOCUS – NO / LOW STOCK*' 
    : '*NON-CORE FOCUS – NO / LOW STOCK*';

  const oosItems = items.filter(i => i.status === 'OUT_OF_STOCK');
  const lowItems = items.filter(i => i.status === 'LOW_STOCK');

  const sections: string[] = [heading, ''];

  if ((filterType === 'all' || filterType === 'out_of_stock') && oosItems.length > 0) {
    sections.push('🔴 *OUT OF STOCK*');
    sections.push('');
    oosItems.forEach((item, idx) => {
      const offerStr = item.focusOffer ? item.focusOffer.trim() : '—';
      sections.push(`${idx + 1}. ${item.productName}`);
      sections.push(`   Code: ${item.code} | Stock: ${item.stockQty} | Offer: ${offerStr}`);
      sections.push('');
    });
  }

  if ((filterType === 'all' || filterType === 'low_stock') && lowItems.length > 0) {
    sections.push('🟠 *LOW STOCK*');
    sections.push('');
    lowItems.forEach((item, idx) => {
      const offerStr = item.focusOffer ? item.focusOffer.trim() : '—';
      const coverStr = item.stockCoverDays !== null 
        ? `${Number(item.stockCoverDays.toFixed(1))} Days` 
        : '—';
      sections.push(`${idx + 1}. ${item.productName}`);
      sections.push(`   Code: ${item.code} | Stock: ${item.stockQty} | Sales: ${item.salesQty} | Cover: ${coverStr} | Offer: ${offerStr}`);
      sections.push('');
    });
  }

  if (oosItems.length === 0 && lowItems.length === 0) {
    sections.push('No stock issues found in current selection.');
    sections.push('');
  }

  sections.push('Please arrange the above Focus Offer stock on priority.');

  return sections.join('\n');
}

/**
 * Generates plain text formatted for WhatsApp for Focus products NOT MATCHED in Stock IQ inventory.
 */
export function generateFocusNotMatchedWhatsAppText(
  items: EvaluatedFocusProduct[],
  focusType: FocusType,
  monthDisplay: string = 'Current Month'
): string {
  const heading = focusType === 'core'
    ? '*CORE FOCUS – NOT MATCHED IN STOCK IQ*'
    : '*NON-CORE FOCUS – NOT MATCHED IN STOCK IQ*';

  const notMatchedItems = items.filter(i => !i.isMatched || i.status === 'NOT_MATCHED');

  const sections: string[] = [
    heading,
    `📅 Month: ${monthDisplay}`,
    `📦 Total Unmatched: ${notMatchedItems.length} SKUs`,
    '',
    'The following Focus products were not found in the active Stock IQ inventory. Please verify/map these codes in master data:',
    ''
  ];

  if (notMatchedItems.length === 0) {
    sections.push('No unmatched Focus products found in current selection.');
    sections.push('');
  } else {
    notMatchedItems.forEach((item, idx) => {
      const cleanOffer = item.focusOffer ? item.focusOffer.trim() : '—';
      const mrpStr = item.mrp ? `₹${item.mrp}` : '—';
      const catStr = item.category ? ` | Cat: ${item.category}` : '';
      
      sections.push(`${idx + 1}. ${item.productName}`);
      sections.push(`   Code: ${item.code} | MRP: ${mrpStr}${catStr} | Offer: ${cleanOffer}`);
      sections.push('');
    });
  }

  sections.push('Action Required: Please check and update the above item codes in the ERP / Stock IQ master.');

  return sections.join('\n');
}

/**
 * Generates single product plain text formatted for WhatsApp for a product NOT MATCHED in Stock IQ inventory.
 */
export function generateSingleNotMatchedWhatsAppText(
  item: EvaluatedFocusProduct,
  focusType: FocusType
): string {
  const typeLabel = focusType === 'core' ? 'CORE FOCUS' : 'NON-CORE FOCUS';
  const cleanOffer = item.focusOffer ? item.focusOffer.trim() : '—';
  const mrpStr = item.mrp ? `₹${item.mrp}` : '—';
  const catStr = item.category ? `\nCategory: ${item.category}` : '';

  return [
    `*${typeLabel} – NOT MATCHED IN STOCK IQ*`,
    `Product: ${item.productName}`,
    `Code: ${item.code}`,
    `MRP: ${mrpStr}${catStr}`,
    `Offer: ${cleanOffer}`,
    '',
    'Please check if this product code exists in the store system.'
  ].join('\n');
}

/**
 * Exports currently filtered Focus issues to a genuine XLSX file using ExcelJS.
 * Columns: SR NO, FOCUS TYPE, CODE, PRODUCT NAME, CATEGORY, BRAND, FOCUS OFFER, SALES, STOCK, STOCK COVER DAYS, COST, MRP, RETAIL, STATUS.
 * CODE is strictly stored as Excel TEXT to preserve leading zeros.
 */
export async function exportFocusIssuesToExcel(
  items: EvaluatedFocusProduct[],
  focusType: FocusType,
  monthDisplay: string,
  filterName: string = 'Issues'
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  const sheetName = focusType === 'core' ? 'CORE Focus Issues' : 'NON-CORE Focus Issues';
  const worksheet = workbook.addWorksheet(sheetName);

  worksheet.columns = [
    { header: 'SR NO', key: 'srNo', width: 8 },
    { header: 'FOCUS TYPE', key: 'focusType', width: 14 },
    { header: 'CODE', key: 'code', width: 16 },
    { header: 'PRODUCT NAME', key: 'productName', width: 38 },
    { header: 'CATEGORY', key: 'category', width: 20 },
    { header: 'BRAND', key: 'brand', width: 18 },
    { header: 'FOCUS OFFER', key: 'focusOffer', width: 22 },
    { header: 'SALES', key: 'sales', width: 10 },
    { header: 'STOCK', key: 'stock', width: 10 },
    { header: 'STOCK COVER DAYS', key: 'stockCoverDays', width: 18 },
    { header: 'COST', key: 'cost', width: 12 },
    { header: 'MRP', key: 'mrp', width: 12 },
    { header: 'RETAIL', key: 'retail', width: 12 },
    { header: 'STATUS', key: 'status', width: 16 },
  ];

  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: focusType === 'core' ? 'FF4338CA' : 'FF0F766E' }
  };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
  headerRow.height = 24;

  const typeLabel = focusType === 'core' ? 'CORE' : 'NON-CORE';

  items.forEach((item, index) => {
    const row = worksheet.addRow({
      srNo: index + 1,
      focusType: typeLabel,
      code: item.code || '',
      productName: item.productName || '',
      category: item.category || '',
      brand: item.brand || '',
      focusOffer: item.focusOffer || '',
      sales: item.salesQty ?? 0,
      stock: item.stockQty ?? 0,
      stockCoverDays: item.stockCoverDays !== null ? Number(item.stockCoverDays.toFixed(1)) : '—',
      cost: item.costPrice ?? 0,
      mrp: item.mrp ?? 0,
      retail: item.retailPrice ?? 0,
      status: item.status === 'OUT_OF_STOCK' ? 'OUT OF STOCK' : item.status === 'LOW_STOCK' ? 'LOW STOCK' : item.status
    });

    // Enforce CODE as TEXT format
    const codeCell = row.getCell(3);
    codeCell.value = String(item.code || '');
    codeCell.numFmt = '@';
    codeCell.alignment = { horizontal: 'left' };

    row.getCell(1).alignment = { horizontal: 'center' }; // SR NO
    row.getCell(2).alignment = { horizontal: 'center' }; // FOCUS TYPE
    row.getCell(8).alignment = { horizontal: 'right' };  // SALES
    row.getCell(9).alignment = { horizontal: 'right' };  // STOCK
    row.getCell(10).alignment = { horizontal: 'right' }; // COVER DAYS
    row.getCell(11).alignment = { horizontal: 'right' }; // COST
    row.getCell(12).alignment = { horizontal: 'right' }; // MRP
    row.getCell(13).alignment = { horizontal: 'right' }; // RETAIL
    row.getCell(14).alignment = { horizontal: 'center' }; // STATUS

    const statusCell = row.getCell(14);
    if (item.status === 'OUT_OF_STOCK') {
      statusCell.font = { bold: true, color: { argb: 'FFDC2626' } };
    } else if (item.status === 'LOW_STOCK') {
      statusCell.font = { bold: true, color: { argb: 'FFD97706' } };
    }
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const cleanMonth = monthDisplay.replace(/\s+/g, '_');
  a.download = `${typeLabel}_Focus_${filterName}_${cleanMonth}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ==========================================
// STAGE 3 — OFFER PARSING, VALIDATION & EXPORT
// ==========================================

export interface ParsedOfferResult {
  offerType: OfferParsedType;
  offerStatus: FocusOfferStatus;
  expectedRetail: number | null;
  calculationExplanation: string;
}

/**
 * Parses Focus Offer text and computes Expected Retail based on CURRENT Stock IQ MRP.
 * Supports:
 * - PERCENTAGE OFF (e.g. "20% OFF", "10%", "15 % OFF") -> MRP * (1 - disc/100)
 * - FIXED RUPEE OFF (e.g. "125 off", "₹10 OFF", "46/- RS OFF", "60 RS OFF") -> MRP - discount
 * - ONLY / FIXED SELLING PRICE (e.g. "99 ONLY", "39 Only", "76 /-ONLY", "₹149 ONLY", "@99") -> stated price
 * - MRP / SP FORMAT (e.g. "MRP 125, SP 99") -> stated SP
 * - MULTI-BUY (e.g. "B1G1", "BUY 1 GET 1 FREE", "B1G2", "2+1 FREE") -> MANUAL CHECK
 */
export function parseFocusOffer(
  offerText?: string,
  currentStockIQMrp: number = 0,
  specialPrice?: number,
  discount?: string | number
): ParsedOfferResult {
  const raw = (offerText || '').trim();
  const text = raw.toLowerCase();

  // If explicit specialPrice was provided in master and no text or text references SP
  if (typeof specialPrice === 'number' && !isNaN(specialPrice) && specialPrice > 0 && (!raw || text.includes('sp') || text.includes('special'))) {
    const sp = Math.round(specialPrice * 100) / 100;
    return {
      offerType: 'EXPLICIT_SP',
      offerStatus: 'CORRECT',
      expectedRetail: sp,
      calculationExplanation: `Explicit Special Price = ₹${sp}`
    };
  }

  if (!raw) {
    // Check if discount property has value
    if (discount !== undefined && discount !== null && String(discount).trim() !== '') {
      const discStr = String(discount).trim();
      const pctMatch = discStr.match(/(\d+(?:\.\d+)?)\s*%/);
      if (pctMatch) {
        const pct = parseFloat(pctMatch[1]);
        const exp = Math.round(currentStockIQMrp * (1 - pct / 100) * 100) / 100;
        return {
          offerType: 'PERCENT_OFF',
          offerStatus: 'CORRECT',
          expectedRetail: exp,
          calculationExplanation: `MRP ₹${currentStockIQMrp} × (1 - ${pct}%) = ₹${exp.toFixed(2)}`
        };
      }
      const numDisc = parseFloat(discStr);
      if (!isNaN(numDisc) && numDisc > 0) {
        if (numDisc <= 100 && discStr.includes('%')) {
          const exp = Math.round(currentStockIQMrp * (1 - numDisc / 100) * 100) / 100;
          return {
            offerType: 'PERCENT_OFF',
            offerStatus: 'CORRECT',
            expectedRetail: exp,
            calculationExplanation: `MRP ₹${currentStockIQMrp} × (1 - ${numDisc}%) = ₹${exp.toFixed(2)}`
          };
        } else {
          const exp = Math.max(0, Math.round((currentStockIQMrp - numDisc) * 100) / 100);
          return {
            offerType: 'RUPEE_OFF',
            offerStatus: 'CORRECT',
            expectedRetail: exp,
            calculationExplanation: `MRP ₹${currentStockIQMrp} - ₹${numDisc} = ₹${exp.toFixed(2)}`
          };
        }
      }
    }

    return {
      offerType: 'NO_OFFER',
      offerStatus: 'UNRECOGNIZED',
      expectedRetail: null,
      calculationExplanation: 'No offer text provided'
    };
  }

  // 1. Explicit SP / MRP & SP format: e.g. "MRP 125, SP 99", "MRP 125 / SP 99", "SP: 99", "SP 99"
  const spMatch = text.match(/(?:sp|selling\s*price|offer\s*price|special\s*price)\s*[:=\-\/]?\s*(?:rs\.?|₹)?\s*(\d+(?:\.\d+)?)/i);
  if (spMatch) {
    const sp = parseFloat(spMatch[1]);
    const cleanSp = Math.round(sp * 100) / 100;
    return {
      offerType: 'EXPLICIT_SP',
      offerStatus: 'CORRECT',
      expectedRetail: cleanSp,
      calculationExplanation: `Explicit SP = ₹${cleanSp}`
    };
  }

  // 2. Recognizable Multi-buy offers: B1G1, BUY 1 GET 1 FREE, B1G2, BUY 1 GET 2 FREE, BUY 2 GET 1 FREE, etc.
  // Rule: BUY X GET Y FREE -> Expected SP = MRP * X / (X + Y), rounded to 2 decimals.
  let multiBuyMatch = text.match(/\bb\s*(\d+)\s*[-/]?\s*g\s*(\d+)\b/i);
  if (!multiBuyMatch) {
    multiBuyMatch = text.match(/\bbuy\s*(\d+)\s*(?:items?|pcs?|units?|packs?)?\s*(?:and\s*)?get\s*(\d+)(?:\s*(?:free|items?|pcs?|units?|packs?))?\b/i);
  }
  if (!multiBuyMatch) {
    multiBuyMatch = text.match(/\b(\d+)\s*\+\s*(\d+)\s*(?:free)?\b/i);
  }

  if (multiBuyMatch) {
    const x = parseInt(multiBuyMatch[1], 10);
    const y = parseInt(multiBuyMatch[2], 10);
    if (!isNaN(x) && !isNaN(y) && x > 0 && y > 0) {
      if (currentStockIQMrp <= 0) {
        return {
          offerType: 'MULTI_BUY',
          offerStatus: 'CORRECT',
          expectedRetail: 0,
          calculationExplanation: `B${x}G${y}: MRP is ₹0`
        };
      }
      // General rule: BUY X GET Y FREE -> Expected SP = MRP * X / (X + Y)
      // Currency-safe rounding to 2 decimals
      const expectedSp = Math.round(((currentStockIQMrp * x) / (x + y)) * 100) / 100;
      let explanation = '';
      if (x === 1 && y === 1) {
        explanation = `B1G1: MRP ₹${currentStockIQMrp} / 2 = ₹${expectedSp.toFixed(2)}`;
      } else if (x === 1 && y === 2) {
        explanation = `B1G2: MRP ₹${currentStockIQMrp} / 3 = ₹${expectedSp.toFixed(2)}`;
      } else if (x === 2 && y === 1) {
        explanation = `B2G1: MRP ₹${currentStockIQMrp} × 2/3 = ₹${expectedSp.toFixed(2)}`;
      } else {
        explanation = `Buy ${x} Get ${y} Free: MRP ₹${currentStockIQMrp} × ${x}/(${x}+${y}) = ₹${expectedSp.toFixed(2)}`;
      }

      return {
        offerType: 'MULTI_BUY',
        offerStatus: 'CORRECT', // evaluated against currentRetail in evaluateFocusOfferProducts
        expectedRetail: expectedSp,
        calculationExplanation: explanation
      };
    }
  }

  // 3. Percentage off: e.g. "20% OFF", "10%", "15 % OFF", "flat 20% discount"
  const pctMatch = text.match(/(\d+(?:\.\d+)?)\s*%\s*(?:off|discount)?/i);
  if (pctMatch) {
    const pct = parseFloat(pctMatch[1]);
    if (pct > 0 && pct <= 100) {
      const exp = Math.round(currentStockIQMrp * (1 - pct / 100) * 100) / 100;
      return {
        offerType: 'PERCENT_OFF',
        offerStatus: 'CORRECT',
        expectedRetail: exp,
        calculationExplanation: `MRP ₹${currentStockIQMrp} × (1 - ${pct}%) = ₹${exp.toFixed(2)}`
      };
    }
  }

  // 4. Fixed Selling Price / ONLY: e.g. "99 ONLY", "39 Only", "76 /-ONLY", "₹149 ONLY", "@99", "@ 149"
  const onlyMatch = text.match(/(?:(?:rs\.?|₹)\s*)?(\d+(?:\.\d+)?)\s*(?:\/[-–])?\s*(?:rs\.?|₹)?\s*only\b/i);
  if (onlyMatch) {
    const price = parseFloat(onlyMatch[1]);
    const cleanPrice = Math.round(price * 100) / 100;
    return {
      offerType: 'FIXED_PRICE',
      offerStatus: 'CORRECT',
      expectedRetail: cleanPrice,
      calculationExplanation: `Fixed Selling Price = ₹${cleanPrice}`
    };
  }
  const atMatch = text.match(/@\s*(?:rs\.?|₹)?\s*(\d+(?:\.\d+)?)/i);
  if (atMatch) {
    const price = parseFloat(atMatch[1]);
    const cleanPrice = Math.round(price * 100) / 100;
    return {
      offerType: 'FIXED_PRICE',
      offerStatus: 'CORRECT',
      expectedRetail: cleanPrice,
      calculationExplanation: `Fixed Selling Price = ₹${cleanPrice}`
    };
  }
  const netMatch = text.match(/\bnet\s*(?:rs\.?|₹)?\s*(\d+(?:\.\d+)?)\b/i);
  if (netMatch) {
    const price = parseFloat(netMatch[1]);
    const cleanPrice = Math.round(price * 100) / 100;
    return {
      offerType: 'FIXED_PRICE',
      offerStatus: 'CORRECT',
      expectedRetail: cleanPrice,
      calculationExplanation: `Fixed Selling Price = ₹${cleanPrice}`
    };
  }

  // 5. Fixed Rupee Off: e.g. "125 off", "₹10 OFF", "46/- RS OFF", "60 RS OFF", "15 RS OFF", "save 20", "25/- off"
  const rupeeMatch = text.match(/(?:(?:rs\.?|₹|flat|save|less)\s*)?(\d+(?:\.\d+)?)\s*(?:\/[-–])?\s*(?:rs\.?|₹)?\s*(?:off|discount|less|save)\b/i) 
    || text.match(/(?:save|less|off)\s*(?:rs\.?|₹)?\s*(\d+(?:\.\d+)?)/i)
    || text.match(/(\d+(?:\.\d+)?)\s*(?:rs\.?|₹)\s*off\b/i);
  if (rupeeMatch) {
    const discountVal = parseFloat(rupeeMatch[1]);
    const exp = Math.max(0, Math.round((currentStockIQMrp - discountVal) * 100) / 100);
    return {
      offerType: 'RUPEE_OFF',
      offerStatus: 'CORRECT',
      expectedRetail: exp,
      calculationExplanation: `MRP ₹${currentStockIQMrp} - ₹${discountVal} = ₹${exp.toFixed(2)}`
    };
  }

  // 6. Ambiguous / unparseable multi-buy offers -> MANUAL_CHECK
  // Keep Manual Check only for multi-buy offer strings that cannot be parsed safely or are ambiguous.
  const isAmbiguousMultiBuy = /(?:b\s*\d+\s*g|buy\s*\d+\s*get|\bfree\b|\bcombo\b|\bbuy\s*\d+\b|\bget\s*\d+\b)/i.test(text);
  if (isAmbiguousMultiBuy) {
    return {
      offerType: 'MULTI_BUY',
      offerStatus: 'MANUAL_CHECK',
      expectedRetail: null,
      calculationExplanation: 'Ambiguous multi-buy scheme (POS manual check required)'
    };
  }

  return {
    offerType: 'UNRECOGNIZED',
    offerStatus: 'UNRECOGNIZED',
    expectedRetail: null,
    calculationExplanation: 'Unrecognized offer format'
  };
}

/**
 * Evaluates monthly Focus products against the current active Stock IQ dataset.
 * Matches Focus CODE -> Stock IQ localCode / bansalCode ONLY.
 * Computes Expected Retail using CURRENT Stock IQ MRP as the pricing base.
 * Flags:
 * - CORRECT: |Current Retail - Expected Retail| <= ₹0.50
 * - MISMATCH: |Current Retail - Expected Retail| > ₹0.50
 * - MANUAL_CHECK: Multi-Buy scheme
 * - UNRECOGNIZED: Unrecognized offer text
 * - NOT_MATCHED: Code not in Stock IQ
 * - MRP CHANGED: Focus MRP != Current Stock IQ MRP (> ₹0.50)
 * - ⚠ BELOW COST: Expected Retail < Stock IQ Cost
 */
export function evaluateFocusOfferProducts(
  focusItems: FocusProductItem[],
  stockProducts: Product[]
): EvaluatedFocusOfferProduct[] {
  // Build lookup map by normalized localCode / bansalCode / code
  const stockMap = new Map<string, Product>();
  for (const prod of stockProducts) {
    const codes = [prod.localCode, prod.bansalCode, prod.code];
    for (const c of codes) {
      if (c) {
        const norm = normalizeFocusCode(c);
        if (norm && !stockMap.has(norm)) {
          stockMap.set(norm, prod);
        }
      }
    }
  }

  return focusItems.map((focusItem) => {
    const normCode = normalizeFocusCode(focusItem.code);
    const matchedStock = normCode ? stockMap.get(normCode) : undefined;
    const isMatched = !!matchedStock;

    const focusMrp = typeof focusItem.mrp === 'number' && !isNaN(focusItem.mrp) ? focusItem.mrp : 0;
    const focusOffer = focusItem.focusOffer ? focusItem.focusOffer.trim() : '';

    if (!isMatched) {
      return {
        focusItem,
        stockProduct: undefined,
        isMatched: false,
        code: normCode || focusItem.code,
        productName: focusItem.name || 'Unknown Focus Product',
        category: focusItem.category || '',
        brand: focusItem.brand || '',
        focusOffer,
        focusMrp,
        currentMrp: focusMrp,
        expectedRetail: null,
        currentRetail: focusMrp,
        difference: null,
        costPrice: 0,
        stockQty: 0,
        salesQty: 0,
        offerStatus: 'NOT_MATCHED' as FocusOfferStatus,
        offerType: 'UNRECOGNIZED' as OfferParsedType,
        calculationExplanation: 'Focus CODE not found in active Stock IQ file',
        isMrpChanged: false,
        isBelowCost: false,
        warnings: ['NOT MATCHED IN STOCK IQ']
      };
    }

    // Matched product: Read live fields from Stock IQ
    const currentMrp = matchedStock.mrp ?? focusMrp;
    const currentRetail = matchedStock.retailPrice ?? matchedStock.salePrice ?? currentMrp;
    const costPrice = matchedStock.costPrice ?? matchedStock.cost ?? 0;
    const stockQty = matchedStock.stock ?? matchedStock.closingQty ?? 0;
    const salesQty = matchedStock.salesCount ?? matchedStock.salesQty ?? 0;
    const productName = matchedStock.name || focusItem.name;
    const category = focusItem.category || matchedStock.category || '';
    const brand = focusItem.brand || matchedStock.brand || '';

    // Offer Parsing against CURRENT Stock IQ MRP as the pricing base!
    const parseResult = parseFocusOffer(
      focusOffer,
      currentMrp,
      focusItem.specialPrice,
      focusItem.discount
    );

    let offerStatus: FocusOfferStatus = parseResult.offerStatus;
    let difference: number | null = null;

    if (parseResult.expectedRetail !== null) {
      const diff = currentRetail - parseResult.expectedRetail;
      difference = Math.round(diff * 100) / 100;
      if (Math.abs(diff) <= 0.50) {
        offerStatus = 'CORRECT';
      } else {
        offerStatus = 'MISMATCH';
      }
    }

    // MRP Changed: Focus MRP != Current Stock IQ MRP within ₹0.50 tolerance (when Focus MRP > 0)
    const isMrpChanged = focusMrp > 0 && Math.abs(focusMrp - currentMrp) > 0.50;

    // Cost safety warning: Expected Retail < Cost Price
    const isBelowCost = parseResult.expectedRetail !== null && costPrice > 0 && parseResult.expectedRetail < costPrice;

    const warnings: string[] = [];
    if (isMrpChanged) {
      warnings.push('MRP CHANGED');
    }
    if (isBelowCost) {
      warnings.push('⚠ BELOW COST');
    }

    return {
      focusItem,
      stockProduct: matchedStock,
      isMatched: true,
      code: normCode || focusItem.code,
      productName,
      category,
      brand,
      focusOffer,
      focusMrp,
      currentMrp,
      expectedRetail: parseResult.expectedRetail,
      currentRetail,
      difference,
      costPrice,
      stockQty,
      salesQty,
      offerStatus,
      offerType: parseResult.offerType,
      calculationExplanation: parseResult.calculationExplanation,
      isMrpChanged,
      isBelowCost,
      warnings
    };
  });
}

/**
 * Calculates live summary statistics for Focus Offers
 */
export function calculateFocusOfferStats(
  evaluated: EvaluatedFocusOfferProduct[],
  monthDisplay: string,
  lastUploadedAt?: string,
  fileName?: string
): FocusOfferStats {
  const total = evaluated.length;
  let matched = 0;
  let notMatched = 0;
  let correct = 0;
  let mismatch = 0;
  let manualCheck = 0;
  let unrecognized = 0;
  let mrpChanged = 0;
  let belowCost = 0;

  for (const item of evaluated) {
    if (item.isMatched) matched++;
    if (item.offerStatus === 'NOT_MATCHED') notMatched++;
    else if (item.offerStatus === 'CORRECT') correct++;
    else if (item.offerStatus === 'MISMATCH') mismatch++;
    else if (item.offerStatus === 'MANUAL_CHECK') manualCheck++;
    else if (item.offerStatus === 'UNRECOGNIZED') unrecognized++;

    if (item.isMrpChanged) mrpChanged++;
    if (item.isBelowCost) belowCost++;
  }

  return {
    activeMonth: monthDisplay,
    totalProducts: total,
    matchedCount: matched,
    notMatchedCount: notMatched,
    correctCount: correct,
    mismatchCount: mismatch,
    manualCheckCount: manualCheck,
    unrecognizedCount: unrecognized,
    mrpChangedCount: mrpChanged,
    belowCostCount: belowCost,
    lastUploadedAt,
    fileName
  };
}

/**
 * Generates plain text formatted for WhatsApp for the GRN pricing team.
 * Default output contains only MISMATCH items unless filtered by another criteria.
 */
export function generateFocusOfferWhatsAppText(
  items: EvaluatedFocusOfferProduct[],
  focusType: FocusType,
  filterName: string = 'OFFER MISMATCH'
): string {
  const heading = focusType === 'core' 
    ? `*CORE FOCUS – ${filterName.toUpperCase()}*` 
    : `*NON-CORE FOCUS – ${filterName.toUpperCase()}*`;

  const sections: string[] = [
    heading,
    '',
    'Please check/update the following Focus Offer items:',
    ''
  ];

  if (items.length === 0) {
    sections.push('No offer mismatch items found in current selection.');
    sections.push('');
  } else {
    items.forEach((item, idx) => {
      const cleanOffer = formatCleanOfferBadge(item.focusOffer) || item.focusOffer || '—';
      sections.push(`${idx + 1}. ${item.productName}`);
      sections.push(`   Code: ${item.code}`);
      sections.push(`   MRP: ₹${item.currentMrp}`);
      sections.push(`   Focus Offer: ${cleanOffer}`);
      
      if (item.expectedRetail !== null) {
        sections.push(`   Expected SP: ₹${item.expectedRetail}`);
        sections.push(`   Current SP: ₹${item.currentRetail}`);
        if (item.offerStatus === 'MISMATCH') {
          const diffVal = item.difference !== null ? Math.abs(item.difference) : 0;
          sections.push(`   Mismatch: ₹${diffVal}`);
        } else {
          sections.push(`   Status: CORRECT`);
        }
      } else {
        if (item.offerStatus === 'MANUAL_CHECK') {
          sections.push(`   Status: MANUAL CHECK (Ambiguous Scheme)`);
        } else if (item.offerStatus === 'UNRECOGNIZED') {
          sections.push(`   Status: UNRECOGNIZED OFFER`);
        }
      }

      if (item.isMrpChanged) {
        sections.push(`   Note: MRP CHANGED (Focus MRP: ₹${item.focusMrp} vs Current MRP: ₹${item.currentMrp})`);
      }
      if (item.isBelowCost) {
        sections.push(`   Warning: ⚠ Expected SP (₹${item.expectedRetail}) is BELOW Cost (₹${item.costPrice})`);
      }

      sections.push('');
    });
  }

  sections.push('Please check the system pricing and update as required.');

  return sections.join('\n');
}

/**
 * Exports currently filtered Focus Offer items to a genuine XLSX file using ExcelJS.
 * Columns:
 * SR NO, FOCUS TYPE, CODE, PRODUCT NAME, CATEGORY, FOCUS MRP, CURRENT MRP, FOCUS OFFER,
 * EXPECTED SP, CURRENT SP, MISMATCH / DIFF, COST, STOCK, SALES, OFFER STATUS, MRP STATUS, WARNING
 * CODE is strictly formatted as Excel TEXT ('@') to preserve leading zeros.
 */
export async function exportFocusOfferToExcel(
  items: EvaluatedFocusOfferProduct[],
  focusType: FocusType,
  monthDisplay: string,
  filterName: string = 'Offer_Review'
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  const sheetName = focusType === 'core' ? 'CORE Focus Offers' : 'NON-CORE Focus Offers';
  const worksheet = workbook.addWorksheet(sheetName);

  worksheet.columns = [
    { header: 'SR NO', key: 'srNo', width: 8 },
    { header: 'FOCUS TYPE', key: 'focusType', width: 14 },
    { header: 'CODE', key: 'code', width: 16 },
    { header: 'PRODUCT NAME', key: 'productName', width: 36 },
    { header: 'CATEGORY', key: 'category', width: 18 },
    { header: 'FOCUS MRP', key: 'focusMrp', width: 12 },
    { header: 'CURRENT MRP', key: 'currentMrp', width: 14 },
    { header: 'FOCUS OFFER', key: 'focusOffer', width: 22 },
    { header: 'EXPECTED SP', key: 'expectedRetail', width: 16 },
    { header: 'CURRENT SP', key: 'currentRetail', width: 16 },
    { header: 'MISMATCH / DIFF', key: 'difference', width: 16 },
    { header: 'COST', key: 'cost', width: 12 },
    { header: 'STOCK', key: 'stock', width: 10 },
    { header: 'SALES', key: 'sales', width: 10 },
    { header: 'OFFER STATUS', key: 'offerStatus', width: 24 },
    { header: 'MRP STATUS', key: 'mrpStatus', width: 16 },
    { header: 'WARNING', key: 'warning', width: 24 },
  ];

  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: focusType === 'core' ? 'FF4338CA' : 'FF0F766E' }
  };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
  headerRow.height = 24;

  const typeLabel = focusType === 'core' ? 'CORE' : 'NON-CORE';

  items.forEach((item, index) => {
    let statusLabel = item.offerStatus as string;
    if (item.offerStatus === 'MANUAL_CHECK') statusLabel = 'MANUAL CHECK (Ambiguous)';
    else if (item.offerStatus === 'UNRECOGNIZED') statusLabel = 'UNRECOGNIZED OFFER';
    else if (item.offerStatus === 'NOT_MATCHED') statusLabel = 'NOT MATCHED';

    const mrpStatus = item.isMrpChanged ? 'MRP CHANGED' : 'SAME MRP';
    const warningsStr = item.warnings.length > 0 ? item.warnings.join(', ') : 'NONE';
    const cleanOffer = formatCleanOfferBadge(item.focusOffer) || item.focusOffer || '';

    const row = worksheet.addRow({
      srNo: index + 1,
      focusType: typeLabel,
      code: item.code || '',
      productName: item.productName || '',
      category: item.category || '',
      focusMrp: item.focusMrp ?? 0,
      currentMrp: item.currentMrp ?? 0,
      focusOffer: cleanOffer,
      expectedRetail: item.expectedRetail !== null ? item.expectedRetail : '—',
      currentRetail: item.currentRetail ?? 0,
      difference: item.difference !== null ? item.difference : '—',
      cost: item.costPrice ?? 0,
      stock: item.stockQty ?? 0,
      sales: item.salesQty ?? 0,
      offerStatus: statusLabel,
      mrpStatus,
      warning: warningsStr
    });

    // Enforce CODE as TEXT format
    const codeCell = row.getCell(3);
    codeCell.value = String(item.code || '');
    codeCell.numFmt = '@';
    codeCell.alignment = { horizontal: 'left' };

    row.getCell(1).alignment = { horizontal: 'center' }; // SR NO
    row.getCell(2).alignment = { horizontal: 'center' }; // FOCUS TYPE
    row.getCell(6).alignment = { horizontal: 'right' };  // FOCUS MRP
    row.getCell(7).alignment = { horizontal: 'right' };  // CURRENT MRP
    row.getCell(9).alignment = { horizontal: 'right' };  // EXPECTED RETAIL
    row.getCell(10).alignment = { horizontal: 'right' }; // CURRENT RETAIL
    row.getCell(11).alignment = { horizontal: 'right' }; // DIFFERENCE
    row.getCell(12).alignment = { horizontal: 'right' }; // COST
    row.getCell(13).alignment = { horizontal: 'right' }; // STOCK
    row.getCell(14).alignment = { horizontal: 'right' }; // SALES
    row.getCell(15).alignment = { horizontal: 'center' };// OFFER STATUS
    row.getCell(16).alignment = { horizontal: 'center' };// MRP STATUS
    row.getCell(17).alignment = { horizontal: 'left' };  // WARNING

    const statusCell = row.getCell(15);
    if (item.offerStatus === 'MISMATCH') {
      statusCell.font = { bold: true, color: { argb: 'FFDC2626' } };
    } else if (item.offerStatus === 'CORRECT') {
      statusCell.font = { bold: true, color: { argb: 'FF16A34A' } };
    } else if (item.offerStatus === 'MANUAL_CHECK') {
      statusCell.font = { bold: true, color: { argb: 'FFD97706' } };
    }

    if (item.isMrpChanged) {
      row.getCell(16).font = { bold: true, color: { argb: 'FFD97706' } };
    }
    if (item.isBelowCost) {
      row.getCell(17).font = { bold: true, color: { argb: 'FFDC2626' } };
    }
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const cleanMonth = monthDisplay.replace(/\s+/g, '_');
  const cleanFilter = filterName.replace(/\s+/g, '_');
  a.download = `${typeLabel}_Focus_${cleanFilter}_${cleanMonth}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

