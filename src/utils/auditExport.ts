import * as XLSX from 'xlsx';
import { AuditSession, AuditProductResult } from '../types';
import { cleanDateOnly } from './fileParser';

function getLocationLabel(val?: string): string {
  if (val === 'on_floor') return 'On Floor';
  if (val === 'warehouse') return 'Warehouse Only';
  if (val === 'both') return 'Floor & Warehouse';
  if (val === 'not_found') return 'Not Found';
  return val || '';
}

function getDisplayLabel(val?: string): string {
  if (val === 'eye_level') return 'Eye Level';
  if (val === 'above_eye') return 'Above Eye Level';
  if (val === 'below_eye') return 'Below Eye Level';
  if (val === 'not_displayed') return 'Not Displayed';
  return val || '';
}

function getRefillLabel(val?: string): string {
  if (val === 'fully_refilled') return 'Fully Refilled';
  if (val === 'partially_refilled') return 'Partially Refilled';
  if (val === 'refill_required') return 'Refill Required';
  if (val === 'shelf_empty') return 'Shelf Empty';
  return val || '';
}

function getBoardLabel(val?: string): string {
  if (val === 'board_correct') return 'Board Available & Correct';
  if (val === 'board_missing') return 'Board Missing';
  if (val === 'wrong_price') return 'Wrong Price';
  if (val === 'not_applicable') return 'Not Applicable';
  return val || '';
}

/**
 * Format Last Purchase Date (LPD) into DD/MM/YYYY.
 * Returns empty string if date is missing/invalid.
 */
function formatLPDDate(val: any): string {
  if (!val || val === 'N/A' || val === '—' || val === 'null' || val === 'undefined') return '';
  const str = String(val).trim();
  if (!str) return '';

  // Already in DD/MM/YYYY
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) return str;

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    const parts = str.split('T')[0].split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
  }

  // DD-MM-YYYY
  if (/^\d{2}-\d{2}-\d{4}$/.test(str)) {
    return str.replace(/-/g, '/');
  }

  // General JS Date parse
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  }

  return str;
}

/**
 * Determine Zero Sale Audit Scope (e.g. CORE, NON-CORE, ALL)
 */
function getAuditScope(session: AuditSession): string {
  const titleUpper = (session.title || '').toUpperCase();
  const mainCodeVal = session.mainCodeFilter;
  const mainCodeUpper = String(mainCodeVal || '').toUpperCase();

  if (titleUpper.includes('NON-CORE') || titleUpper.includes('NON CORE') || mainCodeUpper.includes('NON-CORE') || mainCodeUpper.includes('NONCORE')) {
    return 'NON-CORE';
  }

  if (titleUpper.includes('CORE') || mainCodeUpper.includes('CORE')) {
    return 'CORE';
  }

  if (Array.isArray(mainCodeVal) && mainCodeVal.length > 0) {
    const joined = mainCodeVal.map(s => String(s).toUpperCase()).join(' ');
    if (joined.includes('FOOD') && joined.includes('GROCERY') && !joined.includes('NON-CORE')) {
      return 'CORE';
    }
    if (joined.includes('NON-CORE') && !joined.includes('FOOD')) {
      return 'NON-CORE';
    }
    if (joined.includes('ALL')) return 'ALL';
    return mainCodeVal.join(', ');
  }

  if (titleUpper.includes('ALL') || mainCodeUpper.includes('ALL')) {
    return 'ALL';
  }

  return 'CORE';
}

/**
 * Extract Period From and To Dates formatted as DD/MM/YYYY
 */
function getReportPeriodDates(session: AuditSession): { fromDateStr: string; toDateStr: string } {
  let periodText = session.reportPeriod || session.filterConditions || '';

  // Match pattern like "17/04/2026 To 17/05/2026" or "17/04/2026 - 17/05/2026"
  const match = periodText.match(/(\d{2}\/\d{2}\/\d{4})\s*(?:To|-|to)\s*(\d{2}\/\d{2}\/\d{4})/i);
  if (match) {
    return { fromDateStr: match[1], toDateStr: match[2] };
  }

  // Fallback calculation: completion date and 30 days prior
  const compDStr = session.completedAt || session.createdAt;
  let endD = compDStr ? new Date(compDStr) : new Date();
  if (isNaN(endD.getTime())) endD = new Date();

  const toDay = String(endD.getDate()).padStart(2, '0');
  const toMonth = String(endD.getMonth() + 1).padStart(2, '0');
  const toYear = endD.getFullYear();
  const toDateStr = `${toDay}/${toMonth}/${toYear}`;

  const startD = new Date(endD.getTime() - 30 * 24 * 60 * 60 * 1000);
  const fromDay = String(startD.getDate()).padStart(2, '0');
  const fromMonth = String(startD.getMonth() + 1).padStart(2, '0');
  const fromYear = startD.getFullYear();
  const fromDateStr = `${fromDay}/${fromMonth}/${fromYear}`;

  return { fromDateStr, toDateStr };
}

/**
 * Generate fallback remark if saved remark is blank.
 * Does NOT overwrite existing user-edited remarks.
 */
function getOrGenerateRemark(r: AuditProductResult): string {
  const savedRemark = (r.remarks || r.remark || '').trim();
  if (savedRemark) {
    return savedRemark;
  }

  const isOnFloor = r.isOnFloor === true || r.isOnFloor === 'yes' || r.locationStatus === 'on_floor' || r.locationStatus === 'both';
  const board = r.boardStatus;
  const isBoardCorrect = board === 'board_correct' || board === 'correct';
  const isBoardMissing = board === 'board_missing' || board === 'missing';
  const isBoardWrong = board === 'wrong_price' || board === 'incorrect';

  if (!isOnFloor) {
    if (r.issueReason) return r.issueReason;
    return 'Product and board not found on floor.';
  }

  if (r.issueReason && r.issueReason.toLowerCase().includes('damaged')) {
    return 'Damaged/Expired product found; remove from sale.';
  }

  let visStr = 'Product on floor';
  if (r.displayPosition === 'eye_level' || r.visibilityLevel === 'eye_level') {
    visStr = 'Product on Eye Level Rack';
  } else if (r.displayPosition === 'below_eye' || r.visibilityLevel === 'below_eye') {
    visStr = 'Product available Below Eye Level; improve visibility';
  } else if (r.displayPosition === 'above_eye' || r.visibilityLevel === 'above_eye') {
    visStr = 'Product available Above Eye Level';
  }

  if (r.displayLocations && r.displayLocations.length > 0) {
    const locNames = r.displayLocations.map(l => l.replace(/_/g, ' ')).join(', ');
    visStr = `Product on ${locNames}`;
  }

  if (isBoardMissing) {
    return `${visStr}; board missing.`;
  }
  if (isBoardWrong) {
    return `${visStr}; wrong price board.`;
  }
  if (isBoardCorrect) {
    return `${visStr}; board correct.`;
  }

  if (r.issueReason) {
    return `${visStr}; ${r.issueReason}.`;
  }

  return `${visStr}; board correct.`;
}

/**
 * Export completed Zero Sale audit using exact structure from reference workbook.
 * Lazy-loads ExcelJS dynamically so initial mobile app bundle size remains compact.
 */
export async function exportZeroSaleAuditToExcel(session: AuditSession, results: AuditProductResult[]): Promise<boolean> {
  try {
    // Dynamic import ExcelJS to avoid increasing initial bundle size
    const ExcelJSModule = await import('exceljs');
    const ExcelJS = ExcelJSModule.default || ExcelJSModule;

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'StoreIQ';
    workbook.lastModifiedBy = 'StoreIQ';

    const sheet = workbook.addWorksheet('ZERO SALE', {
      views: [{ showGridLines: true }]
    });

    // Column Widths matching reference workbook EXACTLY
    // A: 6, B: 21.57, C: 55.29, D: 10.71, E: 5.29, F: 9.14, G: 6.57, H: 11, I: 13.57, J: 9.14, K: 13, L: 30.71, M: 17.86, N: 10.14
    sheet.columns = [
      { key: 'srNo', width: 6 },
      { key: 'category', width: 21.57 },
      { key: 'itemName', width: 55.29 },
      { key: 'code', width: 10.71 },
      { key: 'sale', width: 5.29 },
      { key: 'stock', width: 9.14 },
      { key: 'cost', width: 6.57 },
      { key: 'mrp', width: 11 },
      { key: 'retail', width: 13.57 },
      { key: 'floorStock', width: 9.14 },
      { key: 'board', width: 13 },
      { key: 'remarks', width: 30.71 },
      { key: 'name', width: 17.86 },
      { key: 'lpd', width: 10.14 }
    ];

    // Determine Scope & Dates
    const scope = getAuditScope(session);
    const { fromDateStr, toDateStr } = getReportPeriodDates(session);

    let compD = session.completedAt ? new Date(session.completedAt) : new Date(session.createdAt);
    if (isNaN(compD.getTime())) compD = new Date();
    const compDay = String(compD.getDate()).padStart(2, '0');
    const compMonth = String(compD.getMonth() + 1).padStart(2, '0');
    const compYear = compD.getFullYear();

    const completionDateStr = `${compDay}/${compMonth}/${compYear}`;
    const completionFileDateStr = `${compDay}-${compMonth}-${compYear}`;

    // --- ROW 1: MERGED HEADERS ---
    sheet.mergeCells('A1:G1');
    sheet.mergeCells('H1:J1');
    sheet.mergeCells('K1:N1');

    ['A1','B1','C1','D1','E1','F1','G1'].forEach(ref => {
      const c = sheet.getCell(ref);
      c.font = { name: 'Arial', size: 12, bold: true };
      c.alignment = { horizontal: 'center', vertical: 'middle' };
    });
    sheet.getCell('A1').value = `ZERO SALE ${scope} Period : ${fromDateStr} To ${toDateStr}`;

    ['H1','I1','J1'].forEach(ref => {
      const c = sheet.getCell(ref);
      c.font = { name: 'Arial', size: 12, bold: true };
      c.alignment = { horizontal: 'center', vertical: 'middle' };
    });
    sheet.getCell('H1').value = scope;

    ['K1','L1','M1','N1'].forEach(ref => {
      const c = sheet.getCell(ref);
      c.font = { name: 'Arial', size: 12, bold: true };
      c.alignment = { horizontal: 'center', vertical: 'middle' };
    });
    sheet.getCell('K1').value = completionDateStr;

    sheet.getRow(1).height = 24;

    // --- ROW 2: TABLE HEADERS ---
    const headers = [
      'SR N', 'CATEGORY', 'ITEM NAME', 'CODE', 'SALE',
      'STOCK', 'COST', 'MRP', 'RETAIL', 'STOCK',
      'BOARD', 'REMARKS', 'NAME', 'LPD'
    ];

    const row2 = sheet.getRow(2);
    row2.values = headers;
    row2.height = 20;

    row2.eachCell({ includeEmpty: true }, (cell, colIndex) => {
      if (colIndex >= 1 && colIndex <= 14) {
        cell.font = { name: 'Arial', size: 10, bold: true };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      }
    });

    // --- ROW 3+: PRODUCT DATA ROWS ---
    results.forEach((r, idx) => {
      const rowNum = idx + 3;
      const srNo = idx + 1;
      const category = r.category || '';
      const itemName = r.productName || '';
      const bansalCode = String(r.bansalCode || r.localCode || r.code || '').trim();

      const saleQty = typeof r.salesCount === 'number' ? r.salesCount : (typeof r.salesQty === 'number' ? r.salesQty : 0);
      const closingStock = typeof r.stock === 'number' ? r.stock : (typeof r.closingStock === 'number' ? r.closingStock : 0);
      const costPrice = typeof r.costPrice === 'number' ? r.costPrice : (typeof r.cost === 'number' ? r.cost : 0);
      const mrp = typeof r.mrp === 'number' ? r.mrp : 0;
      const retailPrice = typeof r.retailPrice === 'number' ? r.retailPrice : (typeof r.salePrice === 'number' ? r.salePrice : 0);

      const isChecked = r.status === 'done' || r.status === 'resolved' || r.status === 'flagged';

      let floorStockStr = '';
      let boardStatusStr = '';
      let remarkStr = '';
      let checkerNameStr = '';

      if (isChecked) {
        const isOnFloor = r.isOnFloor === true || r.isOnFloor === 'yes' || r.locationStatus === 'on_floor' || r.locationStatus === 'both' || r.isDisplayedOnFloor === 'yes';
        const isNotOnFloor = r.isOnFloor === false || r.isOnFloor === 'no' || r.locationStatus === 'not_found' || r.isDisplayedOnFloor === 'no';
        floorStockStr = isOnFloor ? 'YES' : isNotOnFloor ? 'NO' : 'NO';

        const bs = (r.boardStatus as string | undefined)?.toLowerCase();
        const bc = (r.isBoardCorrect as string | undefined)?.toLowerCase();
        if (bs === 'board_missing' || bs === 'missing' || bs === 'wrong_price' || bs === 'incorrect' || bc === 'no') {
          boardStatusStr = 'NO';
        } else if (bs === 'not_applicable' || bs === 'n_a' || bs === 'na' || bc === 'not_applicable') {
          boardStatusStr = 'N/A';
        } else if (bs === 'board_correct' || bs === 'correct' || bc === 'yes') {
          boardStatusStr = 'YES';
        } else if (!isOnFloor) {
          boardStatusStr = 'NO';
        } else {
          boardStatusStr = 'YES';
        }

        remarkStr = (r.remarks || r.remark || r.issueReason || '').trim();
        checkerNameStr = (r.checkedBy || session.activeChecker || session.lastChecker || '').trim();
      }

      const lpdStr = formatLPDDate(r.lastPurchaseDate);

      const dataRow = sheet.getRow(rowNum);
      dataRow.values = [
        srNo,
        category,
        itemName,
        bansalCode,
        saleQty,
        closingStock,
        costPrice,
        mrp,
        retailPrice,
        floorStockStr,
        boardStatusStr,
        remarkStr,
        checkerNameStr,
        lpdStr
      ];

      // Store CODE explicitly as Excel text string node so leading zeroes (e.g., "013006849") remain exact
      const cellD = dataRow.getCell(4);
      cellD.value = bansalCode;

      // Formatting & Alignments
      dataRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
      dataRow.getCell(2).alignment = { horizontal: 'left', vertical: 'middle' };
      dataRow.getCell(3).alignment = { horizontal: 'left', vertical: 'middle' };
      dataRow.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };
      dataRow.getCell(5).alignment = { horizontal: 'right', vertical: 'middle' };
      dataRow.getCell(6).alignment = { horizontal: 'right', vertical: 'middle' };
      dataRow.getCell(7).alignment = { horizontal: 'right', vertical: 'middle' };
      dataRow.getCell(8).alignment = { horizontal: 'right', vertical: 'middle' };
      dataRow.getCell(9).alignment = { horizontal: 'right', vertical: 'middle' };
      dataRow.getCell(10).alignment = { horizontal: 'center', vertical: 'middle' };
      dataRow.getCell(11).alignment = { horizontal: 'center', vertical: 'middle' };
      dataRow.getCell(12).alignment = { horizontal: 'left', vertical: 'middle' };
      dataRow.getCell(13).alignment = { horizontal: 'center', vertical: 'middle' };
      dataRow.getCell(14).alignment = { horizontal: 'center', vertical: 'middle' };

      for (let col = 1; col <= 14; col++) {
        const cell = dataRow.getCell(col);
        cell.font = { name: 'Arial', size: 10 };
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      }
    });

    // AutoFilter across A2:N{lastRow}
    const lastRowIndex = results.length + 2;
    sheet.autoFilter = `A2:N${lastRowIndex}`;

    // Generate Genuine .xlsx Buffer
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });

    const sanitizedScope = scope.replace(/[/\\?%*:|"<>]/g, '_');
    const fileName = `ZERO SALE ${completionFileDateStr} ${sanitizedScope}.xlsx`;

    // Trigger Browser Download compatible with PWAs (iOS & Android) and Desktop browsers
    const url = URL.createObjectURL(blob);
    const downloadAnchor = document.createElement('a');
    downloadAnchor.href = url;
    downloadAnchor.download = fileName;
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();

    setTimeout(() => {
      document.body.removeChild(downloadAnchor);
      URL.revokeObjectURL(url);
    }, 1000);

    return true;
  } catch (err: any) {
    console.error('Failed to export Zero Sale audit Excel:', err);
    alert(`Export Error: ${err.message || 'Could not generate Excel file.'}`);
    return false;
  }
}

/**
 * Generates exact Focus Physical Audit Excel Checklist matching Requirements 13-18.
 * Single worksheet, A4 landscape, A1:I1 merged title with download day/date,
 * exact Row 2 columns (MAIN CODE, CATEGORY, CODE, ITEM NAME, MRP, OFFER, BOARD TYPE, DISPLAY, BOARD).
 */
export async function exportFocusAuditToExcel(
  session: AuditSession,
  results: AuditProductResult[]
): Promise<boolean> {
  try {
    const ExcelJSModule = await import('exceljs');
    const ExcelJS = ExcelJSModule.default || ExcelJSModule;

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'StoreIQ';
    workbook.lastModifiedBy = 'StoreIQ';

    const sheet = workbook.addWorksheet('FOCUS AUDIT', {
      views: [{ showGridLines: true }],
      pageSetup: {
        paperSize: 9, // A4
        orientation: 'landscape',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        margins: {
          top: 0.4,
          left: 0.4,
          bottom: 0.4,
          right: 0.4,
          header: 0.2,
          footer: 0.2
        },
        printTitlesRow: '1:2'
      }
    });

    // Column widths: Item Name wider than other columns
    sheet.columns = [
      { key: 'mainCode', width: 14 },
      { key: 'category', width: 22 },
      { key: 'code', width: 15 },
      { key: 'itemName', width: 48 },
      { key: 'mrp', width: 11 },
      { key: 'offer', width: 24 },
      { key: 'boardType', width: 14 },
      { key: 'display', width: 12 },
      { key: 'board', width: 12 }
    ];

    // TOP ROW TITLE
    const isNonCore = session.type === 'non_core_focus' || session.focusType === 'non_core' || (session.title || '').toUpperCase().includes('NON-CORE') || (session.title || '').toUpperCase().includes('NON CORE');
    const isCore = !isNonCore && (session.type === 'core_focus' || session.focusType === 'core' || (session.title || '').toUpperCase().includes('CORE'));
    const prefix = isCore ? 'CORE FOCUS OFFER CHECK LIST' : 'NON-CORE FOCUS OFFER CHECK LIST';
    const monthStr = (session.focusMonth || 'CURRENT MONTH').toUpperCase();

    // Day and Date when downloaded
    const exportDate = new Date();
    const dayNames = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
    const dayName = dayNames[exportDate.getDay()];
    const dd = String(exportDate.getDate()).padStart(2, '0');
    const mm = String(exportDate.getMonth() + 1).padStart(2, '0');
    const yyyy = exportDate.getFullYear();
    const dateFormatted = `${dd}-${mm}-${yyyy}`;

    const topHeaderTitle = `${prefix} — ${monthStr} — ${dayName} — ${dateFormatted}`;

    // Merge A1:I1
    sheet.mergeCells('A1:I1');
    const titleCell = sheet.getCell('A1');
    titleCell.value = topHeaderTitle;
    titleCell.font = { name: 'Arial', size: 12, bold: true, color: { argb: 'FF000000' } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getRow(1).height = 28;

    for (let col = 1; col <= 9; col++) {
      const c = sheet.getRow(1).getCell(col);
      c.border = {
        top: { style: 'thin', color: { argb: 'FF000000' } },
        bottom: { style: 'thin', color: { argb: 'FF000000' } },
        left: { style: 'thin', color: { argb: 'FF000000' } },
        right: { style: 'thin', color: { argb: 'FF000000' } }
      };
    }

    // ROW 2: Column Headers
    const headers = [
      'MAIN CODE',
      'CATEGORY',
      'CODE',
      'ITEM NAME',
      'MRP',
      'OFFER',
      'BOARD TYPE',
      'DISPLAY',
      'BOARD'
    ];
    const headerRow = sheet.getRow(2);
    headerRow.height = 22;
    headers.forEach((h, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = h;
      cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF000000' } };
      cell.alignment = {
        horizontal: i === 3 ? 'left' : 'center',
        vertical: 'middle'
      };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF2F2F2' }
      };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF000000' } },
        bottom: { style: 'thin', color: { argb: 'FF000000' } },
        left: { style: 'thin', color: { argb: 'FF000000' } },
        right: { style: 'thin', color: { argb: 'FF000000' } }
      };
    });

    // DATA ROWS (Row 3 onwards)
    results.forEach((r, idx) => {
      const rowIdx = idx + 3;
      const dataRow = sheet.getRow(rowIdx);
      dataRow.height = 20;

      const mainCode = r.mainCode || (isCore ? 'CORE' : 'NON-CORE');
      const category = r.category || 'General';
      const codeStr = String(r.bansalCode || r.code || r.localCode || '');
      const itemName = r.productName || 'Unnamed Product';
      const mrpVal = typeof r.mrp === 'number' && !isNaN(r.mrp) ? r.mrp : parseFloat(String(r.mrp || 0)) || 0;
      const offerStr = r.focusOffer || r.issueReason || '';
      const isChecked = r.status === 'done' || r.status === 'resolved' || r.status === 'flagged';
      const boardType = isChecked ? (r.boardType || '') : '';
      const display = isChecked ? (r.display || (r.isOnFloor === 'yes' || r.isOnFloor === true ? 'YES' : r.isOnFloor === 'no' || r.isOnFloor === false ? 'NO' : '')) : '';
      const board = isChecked ? (r.board || (r.boardStatus === 'board_correct' || r.boardStatus === 'correct' ? 'YES' : r.boardStatus ? 'NO' : '')) : '';

      dataRow.getCell(1).value = mainCode;
      dataRow.getCell(2).value = category;
      
      // Preserve CODE explicitly as Excel string node so leading zeros remain exact
      const codeCell = dataRow.getCell(3);
      codeCell.value = codeStr;
      codeCell.numFmt = '@';

      dataRow.getCell(4).value = itemName;
      dataRow.getCell(5).value = mrpVal;
      dataRow.getCell(5).numFmt = '0.00';
      dataRow.getCell(6).value = offerStr;
      dataRow.getCell(7).value = boardType;
      dataRow.getCell(8).value = display;
      dataRow.getCell(9).value = board;

      // Alignments
      dataRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
      dataRow.getCell(2).alignment = { horizontal: 'left', vertical: 'middle' };
      dataRow.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' };
      dataRow.getCell(4).alignment = { horizontal: 'left', vertical: 'middle', wrapText: false };
      dataRow.getCell(5).alignment = { horizontal: 'right', vertical: 'middle' };
      dataRow.getCell(6).alignment = { horizontal: 'left', vertical: 'middle' };
      dataRow.getCell(7).alignment = { horizontal: 'center', vertical: 'middle' };
      dataRow.getCell(8).alignment = { horizontal: 'center', vertical: 'middle' };
      dataRow.getCell(9).alignment = { horizontal: 'center', vertical: 'middle' };

      for (let col = 1; col <= 9; col++) {
        const cell = dataRow.getCell(col);
        cell.font = { name: 'Arial', size: 9.5, color: { argb: 'FF000000' } };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FF000000' } },
          bottom: { style: 'thin', color: { argb: 'FF000000' } },
          left: { style: 'thin', color: { argb: 'FF000000' } },
          right: { style: 'thin', color: { argb: 'FF000000' } }
        };
      }
    });

    const lastRow = results.length + 2;
    sheet.autoFilter = `A2:I${lastRow}`;

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });

    const fileName = `${isCore ? 'CORE' : 'NON_CORE'}_FOCUS_OFFER_CHECKLIST_${monthStr.replace(/\s+/g, '_')}_${dateFormatted}.xlsx`;

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 1000);

    return true;
  } catch (err: any) {
    console.error('Failed to export Focus Audit Excel:', err);
    alert(`Export Error: ${err.message || 'Could not generate Excel file.'}`);
    return false;
  }
}

export async function exportDailyPurchaseAuditToExcel(
  session: AuditSession,
  results: AuditProductResult[]
): Promise<boolean> {
  try {
    const storeName = session.purchaseMeta?.storeName || (session.storeId === 'store_1' ? 'PATAN' : 'PATAN');
    const auditDateStr = session.auditDate || (session.completedAt ? cleanDateOnly(session.completedAt) : cleanDateOnly(session.createdAt)) || new Date().toLocaleDateString('en-GB');
    const reportPeriod = session.reportPeriod || session.purchaseMeta?.periodStr || 'N/A';
    const checker = session.lastChecker || session.activeChecker || results[0]?.checkedBy || 'Floor Team';

    const total = results.length || session.totalItems;
    const checked = results.filter((r) => r.status === 'done' || r.status === 'resolved').length;
    const flagged = results.filter((r) => r.status === 'flagged').length;
    const pending = results.filter((r) => r.status === 'pending').length;
    const notOnFloor = results.filter((r) => 
      (r.status === 'done' || r.status === 'resolved' || r.status === 'flagged') &&
      (r.isDisplayedOnFloor === 'no' || r.isOnFloor === 'no' || r.isOnFloor === false || r.locationStatus === 'not_found' || r.dailyPurchaseOutcome === 'NOT_ON_FLOOR')
    ).length;
    const boardIncorrect = results.filter((r) =>
      (r.status === 'done' || r.status === 'resolved' || r.status === 'flagged') &&
      (r.isBoardCorrect === 'no' || r.boardStatus === 'board_missing' || r.boardStatus === 'wrong_price' || r.boardStatus === 'incorrect' || r.boardStatus === 'missing' || r.dailyPurchaseOutcome === 'BOARD_INCORRECT')
    ).length;

    const wb = XLSX.utils.book_new();

    // 1. Summary Sheet
    const summaryAoa = [
      ['BANSAL SUPERMARKET — FLOOR IQ DAILY PURCHASE AUDIT SUMMARY'],
      [],
      ['AUDIT DETAILS'],
      ['Store', storeName],
      ['Audit Date', auditDateStr],
      ['Report Period', reportPeriod],
      ['Auditor / Checked By', checker],
      ['Status', session.status === 'completed' ? 'COMPLETED' : 'IN PROGRESS'],
      ['Created At', session.createdAt],
      ['Completed At', session.completedAt || 'N/A'],
      [],
      ['EXECUTION METRICS'],
      ['Total Purchased SKUs', total],
      ['Checked', checked],
      ['Pending', pending],
      ['Not On Floor', notOnFloor],
      ['Board Incorrect', boardIncorrect],
      ['Action Required (Flagged)', flagged],
    ];

    const wsSummary = XLSX.utils.aoa_to_sheet(summaryAoa);
    wsSummary['!cols'] = [{ wch: 28 }, { wch: 40 }];
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Audit Summary');

    // 2. Products Sheet
    const productHeaders = [
      'Sr No',
      'Bansal Code',
      'Product Name',
      'Barcode',
      'Main Code',
      'Category',
      'Brand',
      'Last Purchase Date',
      'Purchased Qty',
      'Free Qty',
      'Suppliers Information',
      'Displayed on Floor',
      'Board Correct',
      'Recorded Outcome',
      'Audit Status',
      'Issue Description',
      'Remarks',
      'Checked By',
      'Check Timestamp',
    ];

    const productRows = results.map((r, idx) => {
      const bansalCode = r.bansalCode || r.localCode || r.code || '';
      const prodName = r.productName || 'Unknown Product';
      const purQty = r.purchasedQty ?? r.purchaseQty ?? 0;
      const freeQty = r.freeQty ?? 0;
      const lastPurDate = r.lastPurchaseDate ? r.lastPurchaseDate : 'Not Available';

      const suppliersStr = r.suppliersList && r.suppliersList.length > 0
        ? r.suppliersList.map((s) => `${s.supplierName} (${s.purchaseQty}${s.freeQty ? `+${s.freeQty}F` : ''})`).join('; ')
        : r.supplierName || r.supplier || 'Direct Inward';

      const isChecked = r.status === 'done' || r.status === 'resolved' || r.status === 'flagged';

      const floorStr = isChecked
        ? (r.isDisplayedOnFloor === 'yes' || r.isOnFloor === 'yes' || r.isOnFloor === true
          ? 'YES'
          : r.isDisplayedOnFloor === 'no' || r.isOnFloor === 'no' || r.isOnFloor === false
          ? 'NO (NOT ON FLOOR)'
          : '')
        : '';

      const boardStr = isChecked
        ? (r.isBoardCorrect === 'yes' || r.boardStatus === 'board_correct' || r.boardStatus === 'correct'
          ? 'CORRECT'
          : r.isBoardCorrect === 'no' || r.boardStatus === 'board_missing' || r.boardStatus === 'wrong_price' || r.boardStatus === 'incorrect' || r.boardStatus === 'missing'
          ? 'INCORRECT'
          : r.isBoardCorrect === 'not_applicable' || r.boardStatus === 'not_applicable'
          ? 'N/A'
          : '')
        : '';

      const outcomeStr = isChecked
        ? (r.dailyPurchaseOutcome || (
            r.status === 'flagged' ? 'ACTION_REQUIRED' :
            r.isDisplayedOnFloor === 'no' || r.isOnFloor === 'no' ? 'NOT_ON_FLOOR' :
            r.isBoardCorrect === 'no' ? 'BOARD_INCORRECT' :
            r.status === 'done' ? 'OK' : ''
          ))
        : '';

      const statusStr = isChecked
        ? (r.status === 'done' || r.status === 'resolved'
          ? 'CHECKED'
          : r.status === 'flagged'
          ? 'ACTION REQUIRED'
          : '')
        : '';

      const issueDesc = isChecked ? (r.issueReason || '') : '';
      const remarks = isChecked ? (r.remarks || r.remark || '') : '';
      const checkedBy = isChecked ? (r.checkedBy || '') : '';
      const timestampStr = isChecked
        ? (r.checkedDate && r.checkedTime
          ? `${r.checkedDate} ${r.checkedTime}`
          : r.checkedAt || '')
        : '';

      return [
        idx + 1,
        bansalCode,
        prodName,
        r.barcode || '',
        r.mainCode || '',
        r.category || '',
        r.brand || '',
        lastPurDate,
        purQty,
        freeQty,
        suppliersStr,
        floorStr,
        boardStr,
        outcomeStr,
        statusStr,
        issueDesc,
        remarks,
        checkedBy,
        timestampStr,
      ];
    });

    const wsProducts = XLSX.utils.aoa_to_sheet([productHeaders, ...productRows]);
    wsProducts['!cols'] = [
      { wch: 6 },
      { wch: 14 },
      { wch: 35 },
      { wch: 16 },
      { wch: 14 },
      { wch: 16 },
      { wch: 14 },
      { wch: 18 },
      { wch: 14 },
      { wch: 10 },
      { wch: 32 },
      { wch: 18 },
      { wch: 16 },
      { wch: 18 },
      { wch: 16 },
      { wch: 24 },
      { wch: 24 },
      { wch: 16 },
      { wch: 20 },
    ];
    XLSX.utils.book_append_sheet(wb, wsProducts, 'All Products');

    const cleanDateStr = auditDateStr.replace(/[\/\\]/g, '-');
    const fileName = `DAILY_PURCHASE_AUDIT_${storeName}_${cleanDateStr}.xlsx`;
    XLSX.writeFile(wb, fileName);
    return true;
  } catch (err: any) {
    console.error('Failed to export daily purchase audit:', err);
    alert('Export Error: ' + (err.message || 'Could not generate Excel file.'));
    return false;
  }
}

/**
 * Main export router function.
 * Automatically delegates zero_sales audits, daily purchase audits, and focus audits to specialized workbook handlers.
 */
export async function exportAuditSessionToExcel(session: AuditSession, results: AuditProductResult[]): Promise<boolean> {
  const isZeroSale = session.type === 'zero_sales' || (session.title && session.title.toLowerCase().includes('zero sale'));
  if (isZeroSale) {
    return exportZeroSaleAuditToExcel(session, results);
  }

  const isDailyPurchase = session.type === 'daily_purchase' || (session.title && session.title.toLowerCase().includes('daily purchase'));
  if (isDailyPurchase) {
    return exportDailyPurchaseAuditToExcel(session, results);
  }

  const isFocus = session.type === 'core_focus' || session.type === 'non_core_focus' || session.focusType === 'core' || session.focusType === 'non_core' || (session.title && session.title.toLowerCase().includes('focus'));
  if (isFocus) {
    return exportFocusAuditToExcel(session, results);
  }

  // Generic fallback multi-sheet export for other audit types
  const wb = XLSX.utils.book_new();
  const sessionDateStr = new Date(session.createdAt).toLocaleDateString();
  const allResults = results;
  const doneResults = results.filter(r => r.status === 'done');
  const flaggedResults = results.filter(r => r.status === 'flagged');
  const resolvedResults = results.filter(r => r.status === 'resolved');
  const pendingResults = results.filter(r => r.status === 'pending');
  const checkedResults = results.filter(r => r.status !== 'pending');

  const summaryAoa = [
    ['ID STUDIO - FLOOR IQ AUDIT SUMMARY REPORT'],
    [],
    ['AUDIT INFORMATION'],
    ['Audit Name', session.title],
    ['Audit Type', session.type.replace('_', ' ').toUpperCase()],
    ['Store', session.storeId],
    ['Started Date/Time', session.createdAt],
    ['Completed Date/Time', session.completedAt || 'In Progress'],
    ['Total Products', session.totalItems],
    ['Done', doneResults.length],
    ['Pending', pendingResults.length],
    ['Flagged', flaggedResults.length],
    ['Resolved', resolvedResults.length]
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryAoa);
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Audit Summary');

  const detailHeaders = [
    'Sr No', 'Audit Type', 'Audit Date', 'Product Name', 'Barcode/EAN',
    'Product Code', 'Main Code', 'Category', 'Brand', 'Manufacturer',
    'Supplier', 'Opening Stock', 'Purchase Qty', 'Sales Qty', 'Closing Stock',
    'Cost Price', 'Retail Price', 'MRP', 'Inventory Value (Cost)',
    'Inventory Value (Retail)', 'Last Purchase Date', 'Last Purchase No',
    'Location', 'Display Position', 'Refill Status', 'Board Status',
    'Issue/Reason', 'Remark', 'Audit Status', 'Checked Date', 'Checked Time',
    'Flagged Date/Time', 'Resolution Remark', 'Resolved Date/Time'
  ];

  function mapRow(r: AuditProductResult, idx: number) {
    const productName = r.productName || 'Unnamed Product';
    const bansalCode = r.bansalCode || r.localCode || r.code || '';
    const closingStock = r.stock ?? r.closingStock ?? 0;
    const costPrice = r.costPrice ?? r.cost ?? 0;
    const retailPrice = r.retailPrice ?? r.salePrice ?? 0;
    const isChecked = r.status === 'done' || r.status === 'resolved' || r.status === 'flagged';

    return [
      idx + 1,
      session.type.replace('_', ' ').toUpperCase(),
      sessionDateStr,
      productName,
      r.barcode || '',
      bansalCode,
      r.mainCode || '',
      r.category || '',
      r.brand || '',
      r.manufacturer || '',
      r.supplierName || r.supplier || '',
      r.openingStock ?? 0,
      r.purchaseQty ?? 0,
      r.salesCount ?? r.salesQty ?? 0,
      closingStock,
      costPrice,
      retailPrice,
      r.mrp ?? 0,
      closingStock * costPrice,
      closingStock * retailPrice,
      r.lastPurchaseDate || '',
      r.lastPurchaseNo || '',
      isChecked ? getLocationLabel(r.locationStatus) : '',
      isChecked ? getDisplayLabel(r.displayPosition) : '',
      isChecked ? getRefillLabel(r.refillStatus) : '',
      isChecked ? getBoardLabel(r.boardStatus) : '',
      isChecked ? (r.issueReason || '') : '',
      isChecked ? (r.remark || r.remarks || '') : '',
      isChecked ? r.status.toUpperCase() : '',
      isChecked ? (r.checkedDate || '') : '',
      isChecked ? (r.checkedTime || '') : '',
      isChecked ? (r.flaggedAt || '') : '',
      isChecked ? (r.resolutionRemark || '') : '',
      isChecked ? (r.resolvedAt || '') : ''
    ];
  }

  const aoa = [detailHeaders, ...allResults.map((r, i) => mapRow(r, i))];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  XLSX.utils.book_append_sheet(wb, ws, 'All Products');

  const fileName = `floor_audit_${session.title.toLowerCase().replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, fileName);
  return true;
}
