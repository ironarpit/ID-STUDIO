import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Product, ComputedProductAnalytics, StockReportMeta } from '../types';

export interface ReportColumn {
  header: string;
  key: string;
  type?: 'text' | 'number' | 'currency' | 'percent' | 'code';
  align?: 'left' | 'center' | 'right';
  width?: number;
}

export interface ExportReportOptions {
  title: string;
  reportType: string;
  generatedAt: string;
  appliedFilters: string[];
  summaryKPIs: { label: string; value: string | number }[];
  columns: ReportColumn[];
  rows: Record<string, any>[];
  reportMeta?: StockReportMeta | null;
}

/**
 * Format string as code with preserved leading zeros
 */
export function formatCodeString(val: any): string {
  if (val === null || val === undefined) return '';
  return String(val).trim();
}

/**
 * Excel Export (.xlsx) using xlsx library
 */
export async function exportToExcel(options: ExportReportOptions) {
  const wb = XLSX.utils.book_new();

  // Build matrix data
  const matrix: any[][] = [];

  // Title Block
  matrix.push([options.title.toUpperCase()]);
  matrix.push([`Generated: ${options.generatedAt}`]);
  if (options.reportMeta?.reportPeriodText) {
    matrix.push([`Sales Period: ${options.reportMeta.reportPeriodText}`]);
  }
  matrix.push([`Applied Filters: ${options.appliedFilters.length > 0 ? options.appliedFilters.join(' | ') : 'None (All Products)'}`]);
  matrix.push([]); // blank row

  // Summary KPIs Block
  if (options.summaryKPIs && options.summaryKPIs.length > 0) {
    matrix.push(['REPORT SUMMARY KPI TOTALS']);
    const kpiHeaders = options.summaryKPIs.map(k => k.label);
    const kpiValues = options.summaryKPIs.map(k => typeof k.value === 'number' ? k.value : String(k.value));
    matrix.push(kpiHeaders);
    matrix.push(kpiValues);
    matrix.push([]); // blank row
  }

  // Column Headers
  const tableHeaders = options.columns.map(c => c.header);
  matrix.push(tableHeaders);

  // Table Data Rows
  options.rows.forEach(row => {
    const rowCells = options.columns.map(col => {
      const val = row[col.key];
      if (val === null || val === undefined) return '';
      if (col.type === 'code') {
        return formatCodeString(val);
      }
      return val;
    });
    matrix.push(rowCells);
  });

  // Calculate Totals Row for Numeric/Currency columns
  const totalsRow: any[] = options.columns.map((col, idx) => {
    if (idx === 0) return 'TOTAL / SUMMARY';
    if (col.type === 'number' || col.type === 'currency') {
      const sum = options.rows.reduce((acc, row) => {
        const v = Number(row[col.key]) || 0;
        return acc + v;
      }, 0);
      return sum;
    }
    return '';
  });
  matrix.push(totalsRow);

  // Create Worksheet
  const ws = XLSX.utils.aoa_to_sheet(matrix);

  // Format Code cells explicitly as strings to prevent losing leading zeros in Excel
  const dataStartRow = (options.summaryKPIs && options.summaryKPIs.length > 0) ? 9 : 6;
  options.columns.forEach((col, colIdx) => {
    if (col.type === 'code') {
      const colLetter = XLSX.utils.encode_col(colIdx);
      options.rows.forEach((row, rowIdx) => {
        const cellRef = `${colLetter}${dataStartRow + rowIdx}`;
        if (ws[cellRef]) {
          ws[cellRef].t = 's'; // Force String type
          ws[cellRef].v = formatCodeString(row[col.key]);
        }
      });
    }
  });

  // Set column widths
  ws['!cols'] = options.columns.map(col => ({
    wch: col.width || Math.max(col.header.length + 4, 12)
  }));

  const sheetName = options.reportType.substring(0, 30).replace(/[:\/?*\[\]]/g, '');
  XLSX.utils.book_append_sheet(wb, ws, sheetName || 'Report');

  const fileName = `${options.reportType.toLowerCase().replace(/\s+/g, '_')}_${new Date().toISOString().slice(0,10)}.xlsx`;
  XLSX.writeFile(wb, fileName);
}

/**
 * CSV Export with preserved leading zeros
 */
export function exportToCsvEngine(options: ExportReportOptions) {
  const formattedRows = options.rows.map(row => {
    const obj: Record<string, any> = {};
    options.columns.forEach(col => {
      let val = row[col.key];
      if (val === null || val === undefined) val = '';
      if (col.type === 'code' && val) {
        // Tab prefix prevents Excel/CSV software from stripping leading zeros
        val = `\t${formatCodeString(val)}`;
      }
      obj[col.header] = val;
    });
    return obj;
  });

  const csvContent = Papa.unparse(formattedRows);

  // Add metadata header comments
  const metaHeader = [
    `# ${options.title.toUpperCase()}`,
    `# Generated: ${options.generatedAt}`,
    `# Applied Filters: ${options.appliedFilters.join(' | ') || 'None'}`,
    `# Records Count: ${options.rows.length}`,
    ''
  ].join('\n');

  const fullContent = metaHeader + csvContent;
  const blob = new Blob([fullContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${options.reportType.toLowerCase().replace(/\s+/g, '_')}_${new Date().toISOString().slice(0,10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * PDF Export using jsPDF and jspdf-autotable
 */
export function exportToPdfEngine(options: ExportReportOptions) {
  const doc = new jsPDF({
    orientation: options.columns.length > 7 ? 'landscape' : 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  // Header Title
  doc.setFontSize(16);
  doc.setTextColor(30, 41, 59); // Slate-800
  doc.text(options.title.toUpperCase(), 14, 15);

  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139); // Slate-500
  doc.text(`Retail Store Intelligence Console | Generated: ${options.generatedAt}`, 14, 21);

  if (options.appliedFilters.length > 0) {
    doc.text(`Filters: ${options.appliedFilters.join(' | ')}`, 14, 26);
  }

  let startY = options.appliedFilters.length > 0 ? 30 : 25;

  // KPI Summary Bar in PDF
  if (options.summaryKPIs && options.summaryKPIs.length > 0) {
    doc.setFillColor(241, 245, 249); // Slate-100
    doc.roundedRect(14, startY, doc.internal.pageSize.getWidth() - 28, 14, 2, 2, 'F');

    let xPos = 18;
    const kpiStep = (doc.internal.pageSize.getWidth() - 36) / options.summaryKPIs.length;

    options.summaryKPIs.forEach(kpi => {
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text(kpi.label.toUpperCase(), xPos, startY + 5);

      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text(String(kpi.value), xPos, startY + 11);

      xPos += kpiStep;
    });

    startY += 18;
  }

  // Table Headers & Rows
  const tableHeaders = options.columns.map(c => c.header);
  const tableBody = options.rows.map(row => {
    return options.columns.map(col => {
      const val = row[col.key];
      if (val === null || val === undefined) return '';
      if (col.type === 'currency' && typeof val === 'number') {
        return `Rs. ${val.toLocaleString('en-IN')}`;
      }
      if (col.type === 'number' && typeof val === 'number') {
        return val.toLocaleString('en-IN');
      }
      return String(val);
    });
  });

  // Calculate Column Styles Alignment
  const columnStyles: Record<number, any> = {};
  options.columns.forEach((col, idx) => {
    if (col.align === 'right' || col.type === 'number' || col.type === 'currency') {
      columnStyles[idx] = { halign: 'right' };
    } else if (col.align === 'center' || col.type === 'code') {
      columnStyles[idx] = { halign: 'center' };
    }
  });

  autoTable(doc, {
    startY: startY,
    head: [tableHeaders],
    body: tableBody,
    styles: {
      fontSize: 7.5,
      cellPadding: 2,
      font: 'helvetica'
    },
    headStyles: {
      fillColor: [79, 70, 229], // Indigo-600
      textColor: [255, 255, 255],
      fontStyle: 'bold'
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252] // Slate-50
    },
    columnStyles: columnStyles,
    didDrawPage: (data) => {
      // Footer page numbers
      const pageCount = (doc as any).internal.getNumberOfPages();
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text(
        `Page ${data.pageNumber} of ${pageCount}`,
        doc.internal.pageSize.getWidth() - 25,
        doc.internal.pageSize.getHeight() - 10
      );
    }
  });

  const fileName = `${options.reportType.toLowerCase().replace(/\s+/g, '_')}_${new Date().toISOString().slice(0,10)}.pdf`;
  doc.save(fileName);
}

/**
 * Safe Print Document in Browser using Hidden IFrame
 */
export function printHtmlDocument(html: string) {
  let iframe = document.getElementById('bsm-print-iframe') as HTMLIFrameElement | null;
  if (!iframe) {
    iframe = document.createElement('iframe');
    iframe.id = 'bsm-print-iframe';
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);
  }

  const doc = iframe.contentWindow?.document || iframe.contentDocument;
  if (doc) {
    doc.open();
    doc.write(html);
    doc.close();
    setTimeout(() => {
      try {
        iframe?.contentWindow?.focus();
        iframe?.contentWindow?.print();
      } catch (err) {
        console.warn('Print error fallback:', err);
      }
    }, 400);
  }
}

/**
 * Print Report in Browser
 */
export function printReportEngine(options: ExportReportOptions) {
  const kpisHtml = (options.summaryKPIs || []).map(k => `
    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px; flex: 1; min-width: 120px;">
      <div style="font-size: 10px; text-transform: uppercase; font-weight: 800; color: #64748b;">${k.label}</div>
      <div style="font-size: 14px; font-weight: 900; color: #0f172a; margin-top: 2px;">${k.value}</div>
    </div>
  `).join('');

  const headersHtml = options.columns.map(c => `
    <th style="padding: 8px; border: 1px solid #cbd5e1; background: #f1f5f9; text-align: ${c.align || (c.type === 'number' || c.type === 'currency' ? 'right' : 'left')};">
      ${c.header}
    </th>
  `).join('');

  const rowsHtml = options.rows.map((row, idx) => `
    <tr style="background: ${idx % 2 === 0 ? '#ffffff' : '#f8fafc'};">
      ${options.columns.map(col => {
        const val = row[col.key];
        let displayVal = val !== null && val !== undefined ? String(val) : '';
        if (col.type === 'currency' && typeof val === 'number') displayVal = `₹${val.toLocaleString('en-IN')}`;
        if (col.type === 'number' && typeof val === 'number') displayVal = val.toLocaleString('en-IN');
        return `
          <td style="padding: 6px; border: 1px solid #e2e8f0; text-align: ${col.align || (col.type === 'number' || col.type === 'currency' ? 'right' : 'left')};">
            ${displayVal}
          </td>
        `;
      }).join('')}
    </tr>
  `).join('');

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>${options.title}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 24px; color: #0f172a; }
          h1 { font-size: 22px; font-weight: 900; margin: 0 0 4px 0; text-transform: uppercase; letter-spacing: -0.02em; }
          .meta { font-size: 11px; color: #64748b; margin-bottom: 16px; }
          .kpi-container { display: flex; gap: 12px; margin-bottom: 20px; flex-wrap: wrap; }
          table { width: 100%; border-collapse: collapse; font-size: 11px; }
          @media print {
            body { padding: 0; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <h1>${options.title}</h1>
        <div class="meta">
          Retail Store Console | Generated: ${options.generatedAt}<br/>
          ${options.appliedFilters.length > 0 ? `Applied Filters: ${options.appliedFilters.join(' | ')}` : 'All Products'}
        </div>

        <div class="kpi-container">
          ${kpisHtml}
        </div>

        <table>
          <thead>
            <tr>${headersHtml}</tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </body>
    </html>
  `;

  printHtmlDocument(html);
}
