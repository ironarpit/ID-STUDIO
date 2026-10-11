import React from 'react';
import { Product, ComputedProductAnalytics, AuditType } from '../../types';
import { AnalyticsTable } from './AnalyticsTable';
import { PackagePlus, Boxes, Coins, Tag, Clock } from 'lucide-react';

interface OverstockViewProps {
  products: Product[];
  analyticsMap: Map<string, ComputedProductAnalytics>;
  onSelectProduct: (p: Product) => void;
  onStartFloorAudit?: (title: string, type: AuditType, products: Product[]) => void;
  isDarkMode?: boolean;
}

export const OverstockView: React.FC<OverstockViewProps> = ({
  products,
  analyticsMap,
  onSelectProduct,
  onStartFloorAudit,
  isDarkMode
}) => {
  const overstockProducts = React.useMemo(() => {
    const list = products.filter((p) => {
      const calc = analyticsMap.get(p.id);
      return calc?.stockStatus === 'overstock';
    });
    // Sort by highest inventory value by default
    return list.sort((a, b) => {
      const valA = analyticsMap.get(a.id)?.inventoryValue || 0;
      const valB = analyticsMap.get(b.id)?.inventoryValue || 0;
      return valB - valA;
    });
  }, [products, analyticsMap]);

  const summary = React.useMemo(() => {
    let count = 0;
    let units = 0;
    let invValue = 0;
    let retailValue = 0;
    let totalDays = 0;
    let daysCount = 0;

    overstockProducts.forEach((p) => {
      count++;
      units += p.stock || 0;
      const calc = analyticsMap.get(p.id);
      if (calc) {
        invValue += calc.inventoryValue;
        retailValue += calc.retailStockValue;
        if (calc.daysCover < 9000) {
          totalDays += calc.daysCover;
          daysCount++;
        }
      }
    });

    const avgDays = daysCount > 0 ? Math.round(totalDays / daysCount) : 0;

    return { count, units, invValue, retailValue, avgDays };
  }, [overstockProducts, analyticsMap]);

  return (
    <div className="space-y-4">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className={`p-3.5 rounded-2xl border ${isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'}`}>
          <div className="flex items-center gap-2 mb-1 text-slate-500 dark:text-slate-400">
            <PackagePlus className="w-4 h-4 text-indigo-600" />
            <span className="text-[10px] font-black uppercase tracking-wider">Overstock SKUs</span>
          </div>
          <div className="text-xl font-black text-indigo-600 dark:text-indigo-400">{summary.count.toLocaleString('en-IN')}</div>
          <span className="text-[10px] text-slate-400">&gt; 90 days cover threshold</span>
        </div>

        <div className={`p-3.5 rounded-2xl border ${isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'}`}>
          <div className="flex items-center gap-2 mb-1 text-slate-500 dark:text-slate-400">
            <Boxes className="w-4 h-4 text-blue-600" />
            <span className="text-[10px] font-black uppercase tracking-wider">Overstock Units</span>
          </div>
          <div className="text-xl font-black">{summary.units.toLocaleString('en-IN')} Qty</div>
          <span className="text-[10px] text-slate-400">Total surplus physical inventory</span>
        </div>

        <div className={`p-3.5 rounded-2xl border ${isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'}`}>
          <div className="flex items-center gap-2 mb-1 text-slate-500 dark:text-slate-400">
            <Coins className="w-4 h-4 text-amber-600" />
            <span className="text-[10px] font-black uppercase tracking-wider">Inventory Value</span>
          </div>
          <div className="text-xl font-black text-amber-600 dark:text-amber-400">₹{summary.invValue.toLocaleString('en-IN')}</div>
          <span className="text-[10px] text-slate-400">Cost capital tied in excess stock</span>
        </div>

        <div className={`p-3.5 rounded-2xl border ${isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'}`}>
          <div className="flex items-center gap-2 mb-1 text-slate-500 dark:text-slate-400">
            <Tag className="w-4 h-4 text-purple-600" />
            <span className="text-[10px] font-black uppercase tracking-wider">Retail Value</span>
          </div>
          <div className="text-xl font-black text-purple-600 dark:text-purple-400">₹{summary.retailValue.toLocaleString('en-IN')}</div>
          <span className="text-[10px] text-slate-400">Retail sales potential value</span>
        </div>

        <div className={`p-3.5 rounded-2xl border ${isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'}`}>
          <div className="flex items-center gap-2 mb-1 text-slate-500 dark:text-slate-400">
            <Clock className="w-4 h-4 text-teal-600" />
            <span className="text-[10px] font-black uppercase tracking-wider">Avg Days Cover</span>
          </div>
          <div className="text-xl font-black text-teal-600 dark:text-teal-400">{summary.avgDays} Days</div>
          <span className="text-[10px] text-slate-400">Stock runway length</span>
        </div>
      </div>

      <AnalyticsTable
        title="Overstock Analysis & Runway"
        description="Products with stock level exceeding 3 months of estimated sales volume — ranked by highest inventory value"
        products={overstockProducts}
        analyticsMap={analyticsMap}
        onSelectProduct={onSelectProduct}
        onStartFloorAudit={onStartFloorAudit ? (prods) => onStartFloorAudit('Overstock Floor Audit', 'overstock', prods) : undefined}
        isDarkMode={isDarkMode}
        extraColumns={[
          {
            key: 'monthsOfStock',
            label: 'Months Cover',
            render: (p, calc) => (
              <span className="font-mono font-bold text-xs text-indigo-600 dark:text-indigo-400">
                {calc ? `${calc.monthsOfStock.toFixed(1)} Mos` : '—'}
              </span>
            )
          }
        ]}
      />
    </div>
  );
};
