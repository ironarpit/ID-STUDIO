import React from 'react';
import { Product, ComputedProductAnalytics, AuditType } from '../../types';
import { AnalyticsTable } from './AnalyticsTable';
import { Turtle, Boxes, Coins, Clock } from 'lucide-react';

interface SlowMovingViewProps {
  products: Product[];
  analyticsMap: Map<string, ComputedProductAnalytics>;
  onSelectProduct: (p: Product) => void;
  onStartFloorAudit?: (title: string, type: AuditType, products: Product[]) => void;
  isDarkMode?: boolean;
}

export const SlowMovingView: React.FC<SlowMovingViewProps> = ({
  products,
  analyticsMap,
  onSelectProduct,
  onStartFloorAudit,
  isDarkMode
}) => {
  const slowProducts = React.useMemo(() => {
    const list = products.filter((p) => {
      const calc = analyticsMap.get(p.id);
      return calc?.movementStatus === 'slow';
    });
    return list.sort((a, b) => {
      const valA = analyticsMap.get(a.id)?.inventoryValue || 0;
      const valB = analyticsMap.get(b.id)?.inventoryValue || 0;
      return valB - valA;
    });
  }, [products, analyticsMap]);

  const summary = React.useMemo(() => {
    let count = 0;
    let totalSales = 0;
    let totalStock = 0;
    let totalInvValue = 0;
    let totalDays = 0;
    let daysCount = 0;

    slowProducts.forEach((p) => {
      count++;
      totalSales += p.salesCount || 0;
      totalStock += p.stock || 0;
      const calc = analyticsMap.get(p.id);
      if (calc) {
        totalInvValue += calc.inventoryValue;
        if (calc.daysCover < 9000) {
          totalDays += calc.daysCover;
          daysCount++;
        }
      }
    });

    const avgDays = daysCount > 0 ? Math.round(totalDays / daysCount) : 0;

    return { count, totalSales, totalStock, totalInvValue, avgDays };
  }, [slowProducts, analyticsMap]);

  return (
    <div className="space-y-4">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className={`p-3.5 rounded-2xl border ${isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'}`}>
          <div className="flex items-center gap-2 mb-1 text-slate-500 dark:text-slate-400">
            <Turtle className="w-4 h-4 text-amber-600" />
            <span className="text-[10px] font-black uppercase tracking-wider">Slow Moving SKUs</span>
          </div>
          <div className="text-xl font-black text-amber-600 dark:text-amber-400">{summary.count.toLocaleString('en-IN')}</div>
          <span className="text-[10px] text-slate-400">Bottom 20% active sales class</span>
        </div>

        <div className={`p-3.5 rounded-2xl border ${isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'}`}>
          <div className="flex items-center gap-2 mb-1 text-slate-500 dark:text-slate-400">
            <Boxes className="w-4 h-4 text-indigo-600" />
            <span className="text-[10px] font-black uppercase tracking-wider">Slow Stock Balance</span>
          </div>
          <div className="text-xl font-black">{summary.totalStock.toLocaleString('en-IN')} Qty</div>
          <span className="text-[10px] text-slate-400">{summary.totalSales.toLocaleString('en-IN')} sold in period</span>
        </div>

        <div className={`p-3.5 rounded-2xl border ${isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'}`}>
          <div className="flex items-center gap-2 mb-1 text-slate-500 dark:text-slate-400">
            <Coins className="w-4 h-4 text-rose-600" />
            <span className="text-[10px] font-black uppercase tracking-wider">Capital Sitting in Slow Stock</span>
          </div>
          <div className="text-xl font-black text-rose-600 dark:text-rose-400">₹{summary.totalInvValue.toLocaleString('en-IN')}</div>
          <span className="text-[10px] font-bold text-rose-600">Total money tied in slow stock</span>
        </div>

        <div className={`p-3.5 rounded-2xl border ${isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'}`}>
          <div className="flex items-center gap-2 mb-1 text-slate-500 dark:text-slate-400">
            <Clock className="w-4 h-4 text-teal-600" />
            <span className="text-[10px] font-black uppercase tracking-wider">Avg Days Cover</span>
          </div>
          <div className="text-xl font-black text-teal-600 dark:text-teal-400">{summary.avgDays} Days</div>
          <span className="text-[10px] text-slate-400">Turnover runway</span>
        </div>
      </div>

      <AnalyticsTable
        title="Slow Moving Products Analysis"
        description="Products with high closing stock relative to low sales output — ranked by highest inventory value"
        products={slowProducts}
        analyticsMap={analyticsMap}
        onSelectProduct={onSelectProduct}
        onStartFloorAudit={onStartFloorAudit ? (prods) => onStartFloorAudit('Slow Moving Floor Audit', 'dead_stock', prods) : undefined}
        isDarkMode={isDarkMode}
      />
    </div>
  );
};
