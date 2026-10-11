import React, { useState, useMemo } from 'react';
import { Product, ComputedProductAnalytics, AuditType } from '../../types';
import { AnalyticsTable } from './AnalyticsTable';
import { cleanDateOnly } from '../../utils/fileParser';
import { EyeOff, Boxes, Coins, ShoppingBag, SlidersHorizontal } from 'lucide-react';

interface ZeroSalesViewProps {
  products: Product[];
  analyticsMap: Map<string, ComputedProductAnalytics>;
  onSelectProduct: (p: Product) => void;
  onStartFloorAudit?: (title: string, type: AuditType, products: Product[]) => void;
  isDarkMode?: boolean;
}

type MaxSalesOption = 0 | 1 | 2 | 3 | 4 | 5;
type ClosingStockOption = 'gt0' | 'gt1' | 'gt2' | 'gt5' | 'gt10' | 'custom';

export const ZeroSalesView: React.FC<ZeroSalesViewProps> = ({
  products,
  analyticsMap,
  onSelectProduct,
  onStartFloorAudit,
  isDarkMode
}) => {
  // Max Sales Filter (Default: <= 5 Sales)
  const [maxSalesOption, setMaxSalesOption] = useState<MaxSalesOption>(5);

  // Closing Stock Filter (Default: Stock > 0)
  const [closingStockOption, setClosingStockOption] = useState<ClosingStockOption>('gt0');
  const [customStockMin, setCustomStockMin] = useState<string>('0');

  // Compute numeric minimum stock threshold
  const effectiveMinStock = useMemo(() => {
    switch (closingStockOption) {
      case 'gt0':
        return 0;
      case 'gt1':
        return 1;
      case 'gt2':
        return 2;
      case 'gt5':
        return 5;
      case 'gt10':
        return 10;
      case 'custom': {
        const num = parseFloat(customStockMin);
        return !isNaN(num) && num >= 0 ? num : 0;
      }
      default:
        return 0;
    }
  }, [closingStockOption, customStockMin]);

  // Combined filtering of products
  const zeroSalesProducts = useMemo(() => {
    const list = products.filter((p) => {
      const sales = typeof p.salesCount === 'number' ? p.salesCount : (typeof p.salesQty === 'number' ? p.salesQty : 0);
      const stock = typeof p.stock === 'number' ? p.stock : (typeof p.closingStock === 'number' ? p.closingStock : (typeof p.closingQty === 'number' ? p.closingQty : 0));

      // 1. Max Sales Filter
      const matchesSales = maxSalesOption === 0 ? sales === 0 : sales <= maxSalesOption;
      if (!matchesSales) return false;

      // 2. Closing Stock Filter (strictly greater than threshold)
      if (!(stock > effectiveMinStock)) return false;

      return true;
    });

    // Sort by highest inventory value by default
    return list.sort((a, b) => {
      const valA = analyticsMap.get(a.id)?.inventoryValue || 0;
      const valB = analyticsMap.get(b.id)?.inventoryValue || 0;
      return valB - valA;
    });
  }, [products, analyticsMap, maxSalesOption, effectiveMinStock]);

  const summary = useMemo(() => {
    let count = 0;
    let totalUnits = 0;
    let invValue = 0;
    let retailValue = 0;

    zeroSalesProducts.forEach((p) => {
      count++;
      totalUnits += p.stock || 0;
      const calc = analyticsMap.get(p.id);
      if (calc) {
        invValue += calc.inventoryValue;
        retailValue += calc.retailStockValue;
      }
    });

    return { count, totalUnits, invValue, retailValue };
  }, [zeroSalesProducts, analyticsMap]);

  const maxSalesLabel = maxSalesOption === 0 ? '0 Sales' : `≤ ${maxSalesOption} Sales`;
  const closingStockLabel = `Stock > ${effectiveMinStock}`;

  return (
    <div className="space-y-4">
      {/* Filters Bar: MAX SALES & CLOSING STOCK */}
      <div className={`p-3.5 rounded-2xl border ${isDarkMode ? 'bg-slate-800/90 border-slate-700/80 text-white' : 'bg-white border-slate-200 text-slate-800'} shadow-2xs`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200/60 dark:border-indigo-800/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
              <SlidersHorizontal className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100">Zero / Low Sales SKU Filters</h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Active scope: <span className="font-semibold text-indigo-600 dark:text-indigo-400">{maxSalesLabel}</span> &amp; <span className="font-semibold text-indigo-600 dark:text-indigo-400">{closingStockLabel}</span> ({summary.count.toLocaleString('en-IN')} SKUs)
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* 1. MAX SALES FILTER */}
            <div className="flex items-center gap-1.5">
              <label htmlFor="zero-sales-max-sales-select" className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 whitespace-nowrap">
                MAX SALES
              </label>
              <select
                id="zero-sales-max-sales-select"
                value={maxSalesOption}
                onChange={(e) => setMaxSalesOption(Number(e.target.value) as MaxSalesOption)}
                className={`text-xs font-semibold px-2.5 py-1.5 rounded-xl border transition-colors cursor-pointer ${
                  isDarkMode
                    ? 'bg-slate-900 border-slate-700 text-slate-200 hover:border-slate-600'
                    : 'bg-slate-50 border-slate-300 text-slate-800 hover:border-slate-400'
                }`}
              >
                <option value={0}>0 Sales Only</option>
                <option value={1}>≤ 1 Sale</option>
                <option value={2}>≤ 2 Sales</option>
                <option value={3}>≤ 3 Sales</option>
                <option value={4}>≤ 4 Sales</option>
                <option value={5}>≤ 5 Sales (Default)</option>
              </select>
            </div>

            {/* 2. CLOSING STOCK FILTER */}
            <div className="flex items-center gap-1.5">
              <label htmlFor="zero-sales-closing-stock-select" className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 whitespace-nowrap">
                CLOSING STOCK
              </label>
              <select
                id="zero-sales-closing-stock-select"
                value={closingStockOption}
                onChange={(e) => setClosingStockOption(e.target.value as ClosingStockOption)}
                className={`text-xs font-semibold px-2.5 py-1.5 rounded-xl border transition-colors cursor-pointer ${
                  isDarkMode
                    ? 'bg-slate-900 border-slate-700 text-slate-200 hover:border-slate-600'
                    : 'bg-slate-50 border-slate-300 text-slate-800 hover:border-slate-400'
                }`}
              >
                <option value="gt0">Stock &gt; 0 (Default)</option>
                <option value="gt1">Stock &gt; 1</option>
                <option value="gt2">Stock &gt; 2</option>
                <option value="gt5">Stock &gt; 5</option>
                <option value="gt10">Stock &gt; 10</option>
                <option value="custom">Custom minimum...</option>
              </select>

              {/* Numeric input when "Custom minimum..." is selected */}
              {closingStockOption === 'custom' && (
                <div className="flex items-center gap-1 bg-white dark:bg-slate-900 border border-indigo-300 dark:border-indigo-600 rounded-xl px-2 py-1 shadow-2xs animate-in fade-in duration-150">
                  <span className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 whitespace-nowrap">&gt;</span>
                  <input
                    id="zero-sales-custom-stock-min"
                    type="number"
                    min="0"
                    step="1"
                    value={customStockMin}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === '' || (!isNaN(Number(val)) && Number(val) >= 0)) {
                        setCustomStockMin(val);
                      }
                    }}
                    placeholder="0"
                    className="w-16 bg-transparent text-xs font-bold text-slate-900 dark:text-white focus:outline-none"
                    aria-label="Custom minimum stock value"
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className={`p-3.5 rounded-2xl border ${isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'}`}>
          <div className="flex items-center gap-2 mb-1 text-slate-500 dark:text-slate-400">
            <EyeOff className="w-4 h-4 text-slate-600" />
            <span className="text-[10px] font-black uppercase tracking-wider">Zero / Low Sales SKUs</span>
          </div>
          <div className="text-xl font-black">{summary.count.toLocaleString('en-IN')}</div>
          <span className="text-[10px] text-slate-400">{maxSalesLabel} &amp; {closingStockLabel}</span>
        </div>

        <div className={`p-3.5 rounded-2xl border ${isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'}`}>
          <div className="flex items-center gap-2 mb-1 text-slate-500 dark:text-slate-400">
            <Boxes className="w-4 h-4 text-indigo-600" />
            <span className="text-[10px] font-black uppercase tracking-wider">Total Stock Units</span>
          </div>
          <div className="text-xl font-black text-indigo-600 dark:text-indigo-400">{summary.totalUnits.toLocaleString('en-IN')} Qty</div>
          <span className="text-[10px] text-slate-400">Physical unsold inventory</span>
        </div>

        <div className={`p-3.5 rounded-2xl border ${isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'}`}>
          <div className="flex items-center gap-2 mb-1 text-slate-500 dark:text-slate-400">
            <Coins className="w-4 h-4 text-rose-600" />
            <span className="text-[10px] font-black uppercase tracking-wider">Inventory Value</span>
          </div>
          <div className="text-xl font-black text-rose-600 dark:text-rose-400">₹{summary.invValue.toLocaleString('en-IN')}</div>
          <span className="text-[10px] text-slate-400">Capital in low/zero sales stock</span>
        </div>

        <div className={`p-3.5 rounded-2xl border ${isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'}`}>
          <div className="flex items-center gap-2 mb-1 text-slate-500 dark:text-slate-400">
            <ShoppingBag className="w-4 h-4 text-purple-600" />
            <span className="text-[10px] font-black uppercase tracking-wider">Retail Potential Value</span>
          </div>
          <div className="text-xl font-black text-purple-600 dark:text-purple-400">₹{summary.retailValue.toLocaleString('en-IN')}</div>
          <span className="text-[10px] text-slate-400">Total retail realization potential</span>
        </div>
      </div>

      <AnalyticsTable
        title="Zero Sales Products Analysis"
        description={`Catalog SKUs with ${maxSalesLabel} & ${closingStockLabel} — ranked by highest inventory value`}
        products={zeroSalesProducts}
        analyticsMap={analyticsMap}
        onSelectProduct={onSelectProduct}
        onStartFloorAudit={onStartFloorAudit ? (prods) => onStartFloorAudit(`Zero Sales Floor Audit (${maxSalesLabel}, ${closingStockLabel})`, 'zero_sales', prods) : undefined}
        isDarkMode={isDarkMode}
        extraColumns={[
          {
            key: 'lastPurchaseDate',
            label: 'Last Purchase',
            render: (p) => (
              <span className="font-mono text-xs text-slate-600 dark:text-slate-300">
                {cleanDateOnly(p.lastPurchaseDate) || '—'}
              </span>
            )
          }
        ]}
      />
    </div>
  );
};
