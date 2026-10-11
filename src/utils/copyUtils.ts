import { Product, AuditSession, AuditProductResult, ComputedProductAnalytics } from '../types';
import { cleanDateOnly } from './fileParser';

/**
 * Copies plain text to clipboard safely across desktop & mobile devices.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (e) {
    // Fallback to execCommand for mobile/iframe edge cases
  }
  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    return successful;
  } catch (err) {
    console.error('Failed to copy to clipboard:', err);
    return false;
  }
}

/**
 * Formats standard Indian Currency with two decimals (e.g. ₹3,350.00). Returns "N/A" for missing/undefined/null.
 */
export function formatIndianCurrency(val: number | string | null | undefined): string {
  if (val === null || val === undefined || val === '') return 'N/A';
  const num = typeof val === 'number' ? val : parseFloat(String(val).replace(/,/g, ''));
  if (isNaN(num)) return 'N/A';
  return (
    '₹' +
    num.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

export interface StandardStockProductsCopyOptions {
  title: string;
  store?: string;
  scope?: string; // e.g. "Suppliers: SHREE TRADING CO | Brands: FORTUNE" or "Categories: BISCUITS"
  activeFilters?: string[];
  search?: string;
  salesPeriod?: string | null;
  analyticsMap?: Map<string, ComputedProductAnalytics>;
}

/**
 * Standard WhatsApp / Plain-Text Formatter for Stock & Analytics Product Lists.
 *
 * Example Format:
 * SUPPLIER ANALYSIS — PATAN
 * Suppliers: SHREE TRADING CO | Brands: FORTUNE
 * Products: 12
 * Sales Period: 01/09/2026–30/09/2026
 *
 * 1. FORTUNE SOYA HEALTH OIL TIN-15 kg (002008265)
 * MRP: ₹3,350.00 | SP: ₹2,590.00
 * Closing: 85 | Sales: 362 | Cover: 7.0 Days
 */
export function formatStandardStockProductsText(
  products: Product[],
  options: StandardStockProductsCopyOptions
): string {
  const store = (options.store && options.store.trim() ? options.store.trim() : 'PATAN').toUpperCase();
  const screenTitle = options.title.trim().toUpperCase();

  const headerLines: string[] = [`${screenTitle} — ${store}`];

  // Selected Scope (e.g. Suppliers: ..., Brands: ..., Categories: ...)
  if (options.scope && options.scope.trim()) {
    headerLines.push(options.scope.trim());
  }

  // Active filters (omit if none or if only 'all')
  if (options.activeFilters && options.activeFilters.length > 0) {
    const cleanFilters = options.activeFilters.filter((f) => f && f.trim());
    if (cleanFilters.length > 0) {
      headerLines.push(`Filters: ${cleanFilters.join(' | ')}`);
    }
  }

  // Search if active
  if (options.search && options.search.trim()) {
    headerLines.push(`Search: "${options.search.trim()}"`);
  }

  // Count
  headerLines.push(`Products: ${products.length}`);

  // Sales period
  const cleanPeriod = options.salesPeriod ? options.salesPeriod.trim() : '';
  headerLines.push(`Sales Period: ${cleanPeriod && cleanPeriod !== 'Period unavailable' ? cleanPeriod : 'Not Available'}`);

  const header = headerLines.join('\n');

  if (products.length === 0) {
    return header;
  }

  const itemsText = products
    .map((p, idx) => {
      const code = cleanCodePreserveLeadingZeros(p.localCode || p.bansalCode || p.code || p.barcode) || 'N/A';
      const name = (p.name || p.itemName || 'Unknown Product').trim();

      const mrpFormatted = formatIndianCurrency(p.mrp);
      const spFormatted = formatIndianCurrency(p.retailPrice ?? p.mrp);

      const closing = p.stock ?? p.closingStock ?? 0;
      const sales = p.salesCount ?? p.salesQty ?? 0;

      // Cover calculation
      let coverStr = 'N/A';
      const calc = options.analyticsMap?.get(p.id);
      if (calc?.daysCover !== undefined && calc.daysCover !== null) {
        coverStr = `${calc.daysCover.toFixed(1)} Days`;
      } else {
        const ads = (p.salesCount || 0) / 30;
        if (ads > 0) {
          const dc = p.stock / ads;
          coverStr = `${dc.toFixed(1)} Days`;
        } else if (p.stock <= 0) {
          coverStr = '0.0 Days';
        } else {
          coverStr = 'N/A';
        }
      }

      return `${idx + 1}. ${name} (${code})\nMRP: ${mrpFormatted} | SP: ${spFormatted}\nClosing: ${closing} | Sales: ${sales} | Cover: ${coverStr}`;
    })
    .join('\n\n');

  return `${header}\n\n${itemsText}`;
}

/**
 * Formats Stock IQ filtered product list for WhatsApp-friendly plain-text copying.
 */
export function formatStockProductsText(
  products: Product[],
  analyticsMap?: Map<string, ComputedProductAnalytics>,
  title?: string,
  kpiType?: string
): string {
  const header = title
    ? `*ID STUDIO — STOCK IQ — ${title.toUpperCase()}*\nTotal Items: ${products.length}\n-----------------------------------\n`
    : '';

  const lines = products.map((p) => {
    const code = p.localCode || p.bansalCode || p.code || p.barcode || 'N/A';
    const name = p.name || p.itemName || 'Unknown Product';
    const mrp = p.mrp ? `₹${p.mrp}` : 'N/A';
    const stock = p.stock ?? p.closingStock ?? 0;
    const sales = p.salesCount ?? p.salesQty ?? 0;
    const analytics = analyticsMap?.get(p.id);

    if (kpiType === 'low_stock') {
      const cover = analytics?.daysCover !== undefined ? `${analytics.daysCover.toFixed(1)} days` : 'N/A';
      return `• ${name} (${code})\nStock: ${stock} | Sales: ${sales} | Cover: ${cover}`;
    }
    if (kpiType === 'zero_sales') {
      return `• ${name} (${code})\nMRP: ${mrp} | Stock: ${stock} | Sales: 0`;
    }
    if (kpiType === 'replenishment') {
      const suggested = analytics ? Math.max(0, Math.ceil(sales * 0.5) - stock) : Math.max(1, sales - stock);
      return `• ${name} (${code})\nStock: ${stock} | Sales: ${sales} | Suggested Qty: ${suggested > 0 ? suggested : 1}`;
    }
    if (kpiType === 'out_of_stock') {
      return `• ${name} (${code})\nMRP: ${mrp} | Sales: ${sales} | Stock: 0`;
    }
    return `• ${name} (${code})\nMRP: ${mrp} | Stock: ${stock} | Sales: ${sales}`;
  });

  return header + lines.join('\n\n');
}

/**
 * Formats a single Floor IQ Audit Product Result for plain-text copying.
 */
export function formatSingleProductResultText(r: AuditProductResult): string {
  const code = r.bansalCode || r.localCode || r.code || r.barcode || 'N/A';
  const name = r.productName || 'Unknown Product';
  const category = r.category || 'General';
  const mrpStr = r.mrp ? `₹${r.mrp}` : r.retailPrice ? `₹${r.retailPrice}` : '';
  const stock = r.stock ?? r.closingStock;
  const lpd = cleanDateOnly(r.lastPurchaseDate) || '—';
  const checker = r.checkedBy || 'Floor Team';

  const isOnFloor =
    r.isOnFloor === 'yes' ||
    r.isOnFloor === true ||
    r.locationStatus === 'on_floor' ||
    r.locationStatus === 'both';

  const boardStatusStr =
    r.boardStatus === 'correct' || r.boardStatus === 'board_correct'
      ? 'CORRECT'
      : r.boardStatus === 'missing' || r.boardStatus === 'board_missing'
      ? 'MISSING'
      : r.boardStatus === 'incorrect' || r.boardStatus === 'wrong_price'
      ? 'INCORRECT'
      : 'N/A';

  const lines: string[] = [`• ${name} (${code})`];
  lines.push(`Category: ${category}`);
  if (mrpStr) lines.push(`MRP: ${mrpStr}`);
  if (stock !== undefined) lines.push(`System Stock: ${stock}`);

  if (r.status === 'flagged') {
    lines.push(`Status: ACTION REQUIRED`);
    const issueText = r.remarks || r.issueReason || 'Action Required on floor';
    lines.push(`Issue: ${issueText}`);
  } else if (!isOnFloor && (r.status === 'done' || r.status === 'resolved')) {
    lines.push(`On Floor: NO`);
    lines.push(`Status: NOT ON FLOOR`);
  } else if (r.status === 'done' || r.status === 'resolved') {
    lines.push(`On Floor: YES`);
    lines.push(`Board: ${boardStatusStr}`);
  } else {
    lines.push(`Status: PENDING`);
  }

  lines.push(`Last Purchase: ${lpd}`);
  lines.push(`Checked By: ${checker}`);
  if (r.remarks && r.status !== 'flagged') {
    lines.push(`Remark: ${r.remarks}`);
  }

  return lines.join('\n');
}

/**
 * Formats Floor IQ Audit Summary for plain-text copying.
 */
export function formatFloorAuditSummaryText(
  session: AuditSession,
  results: AuditProductResult[]
): string {
  const dateStr = session.completedAt
    ? cleanDateOnly(session.completedAt) || new Date(session.completedAt).toLocaleDateString('en-GB')
    : cleanDateOnly(session.createdAt) || new Date(session.createdAt).toLocaleDateString('en-GB');

  const checker = session.lastChecker || session.activeChecker || 'Floor Team';
  const total = results.length || session.totalItems;
  const checked = results.filter((r) => r.status === 'done' || r.status === 'resolved').length;
  const notOnFloor = results.filter(
    (r) =>
      (r.status === 'done' || r.status === 'resolved') &&
      (r.isOnFloor === 'no' || r.isOnFloor === false || r.locationStatus === 'not_found')
  ).length;
  const actionReq = results.filter((r) => r.status === 'flagged').length;
  const pending = total - checked - actionReq;

  return `${session.title.toUpperCase()}
Date: ${dateStr}
Checked By: ${checker}

Total: ${total}
Checked: ${checked}
Not On Floor: ${notOnFloor}
Action Required: ${actionReq}
Pending: ${pending > 0 ? pending : 0}`;
}

/**
 * Formats Floor IQ product audit items for plain-text copying (Supports Entire, Filtered, Checked, Not On Floor, Action Required).
 */
export function formatFloorAuditResultsText(
  results: AuditProductResult[],
  filterType: 'all' | 'checked' | 'not_on_floor' | 'flagged' | 'pending' = 'all',
  title?: string,
  session?: AuditSession,
  filterHeader?: string
): string {
  let filtered = results;
  if (filterType === 'checked') {
    filtered = results.filter((r) => r.status === 'done' || r.status === 'resolved');
  } else if (filterType === 'not_on_floor') {
    filtered = results.filter(
      (r) =>
        (r.status === 'done' || r.status === 'resolved') &&
        (r.isOnFloor === 'no' || r.isOnFloor === false || r.locationStatus === 'not_found')
    );
  } else if (filterType === 'flagged') {
    filtered = results.filter((r) => r.status === 'flagged');
  } else if (filterType === 'pending') {
    filtered = results.filter((r) => r.status === 'pending');
  }

  const dateStr = session?.completedAt
    ? cleanDateOnly(session.completedAt) || new Date(session.completedAt).toLocaleDateString('en-GB')
    : session?.createdAt
    ? cleanDateOnly(session.createdAt) || new Date(session.createdAt).toLocaleDateString('en-GB')
    : new Date().toLocaleDateString('en-GB');

  const checker = session?.lastChecker || session?.activeChecker || results[0]?.checkedBy || 'Floor Team';

  // Overall counts if session/full results provided
  const total = results.length;
  const checkedCount = results.filter((r) => r.status === 'done' || r.status === 'resolved').length;
  const notOnFloorCount = results.filter(
    (r) =>
      (r.status === 'done' || r.status === 'resolved') &&
      (r.isOnFloor === 'no' || r.isOnFloor === false || r.locationStatus === 'not_found')
  ).length;
  const actionReqCount = results.filter((r) => r.status === 'flagged').length;

  let header = '';
  if (title || session) {
    const mainTitle = (title || session?.title || 'FLOOR AUDIT').toUpperCase();
    header = `${mainTitle}\nDate: ${dateStr}\nChecked By: ${checker}\n\n`;
    if (filterHeader) {
      header += `FILTER:\n${filterHeader}\nTotal: ${filtered.length}\n\n`;
    } else {
      header += `Total: ${total}\nChecked: ${checkedCount}\nNot On Floor: ${notOnFloorCount}\nAction Required: ${actionReqCount}\n\n`;
    }
  }

  const productBlocks = filtered.map((r) => {
    return formatSingleProductResultText(r);
  });

  return (header + productBlocks.join('\n\n')).trim();
}

/**
 * Helper to preserve leading zeros in item codes.
 */
function cleanCodePreserveLeadingZeros(val: any): string {
  if (val === null || val === undefined) return '';
  let str = String(val).trim();
  if (!str) return '';

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

  if (/^\d+\.0+$/.test(str)) {
    str = str.replace(/\.0+$/, '');
  }

  return str;
}

/**
 * Formats a product name with its unit of measure, avoiding duplicate units if already in the name.
 */
function formatProductNameWithUOM(r: AuditProductResult): string {
  const name = (r.productName || 'Unknown Product').trim();
  const rawUnit = (
    r.unit ||
    (r.rawRowData ? (r.rawRowData['Unit'] || r.rawRowData['UNIT'] || r.rawRowData['UOM'] || r.rawRowData['Uom']) : '') ||
    ''
  ).toString().trim();

  if (!rawUnit) {
    return name;
  }

  const nameLower = name.toLowerCase();
  const unitLower = rawUnit.toLowerCase();

  // If unit is already mentioned in the name, do not repeat
  if (nameLower.includes(unitLower)) {
    return name;
  }

  const normUnit = unitLower.replace(/[^a-z0-9]/g, '');
  const normName = nameLower.replace(/[^a-z0-9]/g, '');
  if (normUnit && normName.includes(normUnit)) {
    return name;
  }

  return `${name} — ${rawUnit.toUpperCase()}`;
}

/**
 * Checks if a date string is valid and not empty / placeholder.
 */
function isValidDate(dateStr?: string): boolean {
  if (!dateStr) return false;
  const trimmed = dateStr.trim();
  if (
    !trimmed ||
    trimmed === '—' ||
    trimmed === '-' ||
    trimmed === 'Not Available' ||
    trimmed === 'N/A' ||
    trimmed === 'undefined' ||
    trimmed === 'null'
  ) {
    return false;
  }
  return true;
}

/**
 * Formats Daily Purchase Audit products for WhatsApp sharing adhering to strict compact requirements.
 */
export function formatDailyPurchaseWhatsAppText(
  session: AuditSession,
  results: AuditProductResult[],
  filterHeader?: string,
  allAuditResults?: AuditProductResult[]
): string {
  const storeName = session.purchaseMeta?.storeName || (session.storeId === 'store_1' ? 'PATAN' : 'PATAN');
  const reportPeriod = session.reportPeriod || session.purchaseMeta?.periodStr || 'N/A';
  
  const rawAuditDate =
    session.auditDate ||
    session.purchaseMeta?.auditDateStr ||
    (session.completedAt ? cleanDateOnly(session.completedAt) : cleanDateOnly(session.createdAt));
  const checkedDateStr = cleanDateOnly(rawAuditDate) || new Date().toLocaleDateString('en-GB');

  // Checkers determination
  const checkersWithItems = results
    .map((r) => (r.checkedBy || '').trim())
    .filter((c) => c && c.toLowerCase() !== 'floor team');
  const distinctCheckers = Array.from(new Set(checkersWithItems));

  let singleChecker: string | null = null;
  if (distinctCheckers.length === 1) {
    singleChecker = distinctCheckers[0];
  } else if (distinctCheckers.length === 0) {
    if (session.activeChecker && session.activeChecker.trim()) {
      singleChecker = session.activeChecker.trim();
    } else if (session.lastChecker && session.lastChecker.trim()) {
      singleChecker = session.lastChecker.trim();
    } else {
      singleChecker = 'Arpit';
    }
  }
  const isMultipleCheckers = distinctCheckers.length > 1;

  // Header Lines
  const headerLine1 = `DAILY PURCHASE AUDIT — ${storeName.toUpperCase()}`;
  const headerLine2 = `Report: ${reportPeriod}`;
  const headerLine3 = singleChecker
    ? `Checked: ${checkedDateStr} | By: ${singleChecker}`
    : `Checked: ${checkedDateStr}`;

  // Metrics (distinguish full audit from copied products)
  const datasetForMetrics = allAuditResults && allAuditResults.length > 0 ? allAuditResults : results;
  const totalSKUs = session.totalItems || datasetForMetrics.length;
  const checkedCount = datasetForMetrics.filter(
    (r) => r.status === 'done' || r.status === 'resolved' || r.status === 'flagged'
  ).length;
  const pendingCount = datasetForMetrics.filter((r) => r.status === 'pending').length;

  const notOnFloorCount = datasetForMetrics.filter(
    (r) =>
      (r.status === 'done' || r.status === 'resolved' || r.status === 'flagged') &&
      (r.isDisplayedOnFloor === 'no' ||
        r.isOnFloor === 'no' ||
        r.isOnFloor === false ||
        r.locationStatus === 'not_found' ||
        r.dailyPurchaseOutcome === 'NOT_ON_FLOOR')
  ).length;

  const boardMissingCount = datasetForMetrics.filter(
    (r) =>
      (r.status === 'done' || r.status === 'resolved' || r.status === 'flagged') &&
      (r.isBoardCorrect === 'no' ||
        r.boardStatus === 'board_missing' ||
        r.boardStatus === 'wrong_price' ||
        r.boardStatus === 'incorrect' ||
        r.boardStatus === 'missing' ||
        r.dailyPurchaseOutcome === 'BOARD_INCORRECT')
  ).length;

  const reportedIssuesCount = datasetForMetrics.filter((r) => r.status === 'flagged').length;
  const copiedCount = results.length;

  const metricLine1 = `Total SKUs: ${totalSKUs} | Checked: ${checkedCount} | Pending: ${pendingCount}`;
  const metricLine2 = `Not on Floor: ${notOnFloorCount} | Board Missing: ${boardMissingCount} | Reported Issues: ${reportedIssuesCount}`;
  const metricLine3 = `Copied Products: ${copiedCount}`;

  // Partition results into 5 priority groups (mutually exclusive)
  const reportedIssuesGroup: AuditProductResult[] = [];
  const notOnFloorGroup: AuditProductResult[] = [];
  const boardMissingGroup: AuditProductResult[] = [];
  const pendingGroup: AuditProductResult[] = [];
  const checkedOkGroup: AuditProductResult[] = [];

  for (const r of results) {
    if (r.status === 'flagged') {
      reportedIssuesGroup.push(r);
    } else if (
      (r.status === 'done' || r.status === 'resolved') &&
      (r.isDisplayedOnFloor === 'no' ||
        r.isOnFloor === 'no' ||
        r.isOnFloor === false ||
        r.locationStatus === 'not_found' ||
        r.dailyPurchaseOutcome === 'NOT_ON_FLOOR')
    ) {
      notOnFloorGroup.push(r);
    } else if (
      (r.status === 'done' || r.status === 'resolved') &&
      (r.isBoardCorrect === 'no' ||
        r.boardStatus === 'board_missing' ||
        r.boardStatus === 'wrong_price' ||
        r.boardStatus === 'incorrect' ||
        r.boardStatus === 'missing' ||
        r.dailyPurchaseOutcome === 'BOARD_INCORRECT')
    ) {
      boardMissingGroup.push(r);
    } else if (r.status === 'pending') {
      pendingGroup.push(r);
    } else {
      checkedOkGroup.push(r);
    }
  }

  // Define groups with display headers
  const groupsToRender = (
    [
      { title: `REPORTED ISSUES — ${reportedIssuesGroup.length}`, items: reportedIssuesGroup, type: 'issues' as const },
      { title: `NOT ON FLOOR — ${notOnFloorGroup.length}`, items: notOnFloorGroup, type: 'not_on_floor' as const },
      { title: `BOARD MISSING — ${boardMissingGroup.length}`, items: boardMissingGroup, type: 'board_missing' as const },
      { title: `PENDING — ${pendingGroup.length}`, items: pendingGroup, type: 'pending' as const },
      { title: `CHECKED OK — ${checkedOkGroup.length}`, items: checkedOkGroup, type: 'ok' as const },
    ] as const
  ).filter((g) => g.items.length > 0);

  let counter = 1;
  const renderedSections: string[] = [];

  for (const group of groupsToRender) {
    const groupLines: string[] = [group.title, ''];

    for (const r of group.items) {
      const productName = formatProductNameWithUOM(r);
      const code = cleanCodePreserveLeadingZeros(r.bansalCode || r.localCode || r.code) || 'N/A';
      const mrp = r.mrp || r.retailPrice;
      const mrpPart = mrp && mrp > 0 ? ` | MRP: ₹${mrp}` : '';

      const itemBlock: string[] = [];
      itemBlock.push(`${counter}. ${productName}`);
      itemBlock.push(`Code: ${code}${mrpPart}`);

      if (isMultipleCheckers && r.checkedBy) {
        itemBlock.push(`By: ${r.checkedBy}`);
      }

      if (isValidDate(r.lastPurchaseDate)) {
        itemBlock.push(`Last Purchase: ${r.lastPurchaseDate}`);
      }

      // Group specific lines
      if (group.type === 'issues') {
        const issueDesc = r.issueReason || r.remarks || 'Action Required';
        itemBlock.push(`Issue: ${issueDesc}`);
        if (
          r.isDisplayedOnFloor === 'no' ||
          r.isOnFloor === 'no' ||
          r.isOnFloor === false ||
          r.locationStatus === 'not_found'
        ) {
          itemBlock.push('On Floor: No');
        } else if (r.isDisplayedOnFloor === 'yes' || r.isOnFloor === 'yes' || r.isOnFloor === true) {
          itemBlock.push('On Floor: Yes');
        }
        if (
          r.isBoardCorrect === 'no' ||
          r.boardStatus === 'board_missing' ||
          r.boardStatus === 'wrong_price' ||
          r.boardStatus === 'incorrect' ||
          r.boardStatus === 'missing'
        ) {
          itemBlock.push(`Board: ${r.boardStatus === 'wrong_price' ? 'Incorrect Price' : 'Missing'}`);
        }
        if (r.remarks && r.remarks !== r.issueReason && r.remarks !== issueDesc) {
          itemBlock.push(`Remark: ${r.remarks}`);
        }
      } else if (group.type === 'not_on_floor') {
        if (
          r.isBoardCorrect === 'no' ||
          r.boardStatus === 'board_missing' ||
          r.boardStatus === 'wrong_price' ||
          r.boardStatus === 'incorrect' ||
          r.boardStatus === 'missing'
        ) {
          itemBlock.push(`Board: ${r.boardStatus === 'wrong_price' ? 'Incorrect Price' : 'Missing'}`);
        }
        if (r.remarks) {
          itemBlock.push(`Remark: ${r.remarks}`);
        }
      } else if (group.type === 'board_missing') {
        itemBlock.push('On Floor: Yes');
        if (r.remarks) {
          itemBlock.push(`Remark: ${r.remarks}`);
        }
      } else if (group.type === 'pending') {
        if (r.remarks) {
          itemBlock.push(`Remark: ${r.remarks}`);
        }
      } else if (group.type === 'ok') {
        if (r.remarks) {
          itemBlock.push(`Remark: ${r.remarks}`);
        }
      }

      groupLines.push(itemBlock.join('\n'));
      groupLines.push(''); // blank line between items
      counter++;
    }

    renderedSections.push(groupLines.join('\n').trim());
  }

  const topBlock = [
    headerLine1,
    headerLine2,
    headerLine3,
    '',
    metricLine1,
    metricLine2,
    metricLine3,
  ].join('\n');

  if (renderedSections.length === 0) {
    return topBlock;
  }

  return topBlock + '\n\n' + renderedSections.join('\n\n');
}


