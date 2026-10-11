import Papa from 'papaparse';
import { Product, ComputedProductAnalytics } from '../types';
import { cleanDateOnly } from './fileParser';
import { getProductBrand } from './analytics';
import { printHtmlDocument } from './exportEngine';

export function exportToCsv(
  filename: string,
  products: Product[],
  analyticsMap: Map<string, ComputedProductAnalytics>
) {
  const data = products.map((p) => {
    const calc = analyticsMap.get(p.id);
    return {
      Barcode: p.barcode,
      'Main Code': p.mainCode || '',
      'Bansal Code': p.localCode || '',
      Product: p.name,
      Category: p.category || 'General',
      Brand: getProductBrand(p),
      Supplier: p.supplierName || '',
      MRP: p.mrp || 0,
      Retail: p.retailPrice || 0,
      'Cost / Buy Price': p.costPrice || 0,
      'Closing Stock': p.stock || 0,
      Sales: p.salesCount || 0,
      'Inventory Value': calc ? calc.inventoryValue : 0,
      'Last Purchase Date': cleanDateOnly(p.lastPurchaseDate) || '',
      'ABC Category': calc ? calc.abcCategory : 'C',
      'Stock Age Group': calc ? calc.stockAgeGroup : '',
      'Movement Status': calc ? calc.movementStatus : '',
      'Stock Status': calc ? calc.stockStatus : '',
      'AI Recommendation': calc ? calc.aiRecommendation : ''
    };
  });

  const csv = Papa.unparse(data);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function exportToPrint(
  title: string,
  products: Product[],
  analyticsMap: Map<string, ComputedProductAnalytics>
) {
  const rowsHtml = products.slice(0, 500).map((p, idx) => {
    const calc = analyticsMap.get(p.id);
    return `
      <tr>
        <td style="padding: 6px; border: 1px solid #ddd; text-align: center;">${idx + 1}</td>
        <td style="padding: 6px; border: 1px solid #ddd; font-family: monospace;">${p.barcode}</td>
        <td style="padding: 6px; border: 1px solid #ddd; font-weight: bold;">${p.name}</td>
        <td style="padding: 6px; border: 1px solid #ddd;">${p.category || 'General'}</td>
        <td style="padding: 6px; border: 1px solid #ddd; text-align: right;">₹${(p.retailPrice || 0).toLocaleString('en-IN')}</td>
        <td style="padding: 6px; border: 1px solid #ddd; text-align: right; font-weight: bold;">${p.stock || 0}</td>
        <td style="padding: 6px; border: 1px solid #ddd; text-align: right;">${p.salesCount || 0}</td>
        <td style="padding: 6px; border: 1px solid #ddd; text-align: right;">₹${(calc ? calc.inventoryValue : 0).toLocaleString('en-IN')}</td>
        <td style="padding: 6px; border: 1px solid #ddd; text-align: center;">${calc ? calc.abcCategory : 'C'}</td>
      </tr>
    `;
  }).join('');

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>${title}</title>
        <style>
          body { font-family: system-ui, -apple-system, sans-serif; padding: 20px; color: #1e293b; }
          h1 { font-size: 20px; margin-bottom: 4px; }
          p { font-size: 12px; color: #64748b; margin-top: 0; margin-bottom: 16px; }
          table { width: 100%; border-collapse: collapse; font-size: 11px; }
          th { background: #f1f5f9; padding: 8px; border: 1px solid #cbd5e1; text-align: left; }
          @media print {
            body { padding: 0; }
          }
        </style>
      </head>
      <body>
        <h1>${title} - Retail Inventory Report</h1>
        <p>Generated on ${new Date().toLocaleString()} | Total Items: ${products.length}</p>
        <table>
          <thead>
            <tr>
              <th style="width: 30px;">#</th>
              <th>Barcode</th>
              <th>Product Name</th>
              <th>Category</th>
              <th style="text-align: right;">Retail</th>
              <th style="text-align: right;">Stock</th>
              <th style="text-align: right;">Sales</th>
              <th style="text-align: right;">Value</th>
              <th style="text-align: center;">ABC</th>
            </tr>
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
