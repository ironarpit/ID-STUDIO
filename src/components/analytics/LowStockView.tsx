import React from 'react';
import { Product, ComputedProductAnalytics, AuditType } from '../../types';
import { AnalyticsTable } from './AnalyticsTable';
import { AlertTriangle, Boxes, Coins, Clock } from 'lucide-react';

interface LowStockViewProps {
  products: Product[];
  analyticsMap: Map<string, ComputedProductAnalytics>;
  onSelectProduct: (p: Product) => void;
  onStartFloorAudit?: (title: string, type: AuditType, products: Product[]) => void;
  isDarkMode?: boolean;
}

export const LowStockView: React.FC<LowStockViewProps> = ({
  products,
  analyticsMap,
  onSelectProduct,
  onStartFloorAudit,
  isDarkMode
}) => {
  const lowStockProducts = React.useMemo(() => {
    const list = products.filter((p) => {
      const calc = analyticsMap.get(p.id);
      return calc?.stockStatus === 'low_stock';
    });

    // Priority sorting: Fast Moving + Low Stock first, then lowest days cover
    return list.sort((a, b) => {
      const calcA = analyticsMap.get(a.id);
      const calcB = analyticsMap.get(b.id);

      const isFastA = calcA?.movementStatus === 'fast' ? 1 : 0;
      const isFastB = calcB?.movementStatus === 'fast' ? 1 : 0;

      if (isFastA !== isFastB) {
        return isFastB - isFastA; // Fast moving first
      }

      // Then by lowest days cover
      const daysA = calcA ? calcA.daysCover : 999;
      const daysB = calcB ? calcB.daysCover : 999;

      return daysA - daysB;
    });
  }, [products, analyticsMap]);

  const summary = React.useMemo(() => {
    let count = 0;
    let units = 0;
    let invValue = 0;
    let totalDays = 0;
    let daysCount = 0;

    lowStockProducts.forEach((p) => {
      count++;
      units += p.stock || 0;
      const calc = analyticsMap.get(p.id);
      if (calc) {
        invValue += calc.inventoryValue;
        if (calc.daysCover < 9000) {
          totalDays += calc.daysCover;
          daysCount++;
        }
      }
    });

    const avgDays = daysCount > 0 ? (totalDays / daysCount).toFixed(1) : '0';

    return { count, units, invValue, avgDays };
  }, [lowStockProducts, analyticsMap]);

  return (
    <div className="space-y-4">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className={`p-3.5 rounded-2xl border ${isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'}`}>
          <div className="flex items-center gap-2 mb-1 text-slate-500 dark:text-slate-400">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <span className="text-[10px] font-black uppercase tracking-wider">Low Stock SKUs</span>
          </div>
          <div className="text-xl font-black text-amber-600 dark:text-amber-400">{summary.count.toLocaleString('en-IN')}</div>
          <span className="text-[10px] text-slate-400">&le; 15 days stock cover</span>
        </div>

        <div className={`p-3.5 rounded-2xl border ${isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'}`}>
          <div className="flex items-center gap-2 mb-1 text-slate-500 dark:text-slate-400">
            <Boxes className="w-4 h-4 text-indigo-600" />
            <span className="text-[10px] font-black uppercase tracking-wider">Total Stock Units</span>
          </div>
          <div className="text-xl font-black">{summary.units.toLocaleString('en-IN')} Qty</div>
          <span className="text-[10px] text-slate-400">Remaining stock on shelf</span>
        </div>

        <div className={`p-3.5 rounded-2xl border ${isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'}`}>
          <div className="flex items-center gap-2 mb-1 text-slate-500 dark:text-slate-400">
            <Coins className="w-4 h-4 text-teal-600" />
            <span className="text-[10px] font-black uppercase tracking-wider">Inventory Value</span>
          </div>
          <div className="text-xl font-black text-teal-600 dark:text-teal-400">₹{summary.invValue.toLocaleString('en-IN')}</div>
          <span className="text-[10px] text-slate-400">Low stock valuation</span>
        </div>

        <div className={`p-3.5 rounded-2xl border ${isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'}`}>
          <div className="flex items-center gap-2 mb-1 text-slate-500 dark:text-slate-400">
            <Clock className="w-4 h-4 text-rose-600" />
            <span className="text-[10px] font-black uppercase tracking-wider">Avg Days Cover</span>
          </div>
          <div className="text-xl font-black text-rose-600 dark:text-rose-400">{summary.avgDays} Days</div>
          <span className="text-[10px] text-slate-400">Urgent stock depletion risk</span>
        </div>
      </div>

      <AnalyticsTable
        title="Low Stock & Replenishment Priority"
        description="Prioritized by Fast Moving SKUs + Very Low Days Cover first"
        products={lowStockProducts}
        analyticsMap={analyticsMap}
        onSelectProduct={onSelectProduct}
        onStartFloorAudit={onStartFloorAudit ? (prods) => onStartFloorAudit('Low Stock Floor Audit', 'low_stock', prods) : undefined}
        isDarkMode={isDarkMode}
        extraColumns={[
          {
            key: 'suggestedReorder',
            label: 'Suggested Order Qty',
            render: (p, calc) => (
              <span className="font-mono font-black text-xs text-amber-700 bg-amber-100 dark:bg-amber-950 dark:text-amber-300 px-2 py-0.5 rounded-md">
                +{calc ? calc.suggestedReorder : 10} Units
              </span>
            )
          }
        ]}
      />
    </div>
  );
};
