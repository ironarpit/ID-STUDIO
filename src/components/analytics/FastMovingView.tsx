import React from 'react';
import { Product, ComputedProductAnalytics, AuditType } from '../../types';
import { AnalyticsTable } from './AnalyticsTable';
import { Zap, TrendingUp, Coins, Boxes } from 'lucide-react';

interface FastMovingViewProps {
  products: Product[];
  analyticsMap: Map<string, ComputedProductAnalytics>;
  onSelectProduct: (p: Product) => void;
  onStartFloorAudit?: (title: string, type: AuditType, products: Product[]) => void;
  isDarkMode?: boolean;
}

export const FastMovingView: React.FC<FastMovingViewProps> = ({
  products,
  analyticsMap,
  onSelectProduct,
  onStartFloorAudit,
  isDarkMode
}) => {
  const fastProducts = React.useMemo(() => {
    const list = products.filter((p) => {
      const calc = analyticsMap.get(p.id);
      return calc?.movementStatus === 'fast';
    });
    return list.sort((a, b) => (b.salesCount || 0) - (a.salesCount || 0));
  }, [products, analyticsMap]);

  const summary = React.useMemo(() => {
    let count = 0;
    let totalSales = 0;
    let totalRevenue = 0;
    let totalInvValue = 0;

    fastProducts.forEach((p) => {
      count++;
      totalSales += p.salesCount || 0;
      const calc = analyticsMap.get(p.id);
      if (calc) {
        totalRevenue += calc.salesValue;
        totalInvValue += calc.inventoryValue;
      }
    });

    return { count, totalSales, totalRevenue, totalInvValue };
  }, [fastProducts, analyticsMap]);

  return (
    <div className="space-y-4">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className={`p-3.5 rounded-2xl border ${isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'}`}>
          <div className="flex items-center gap-2 mb-1 text-slate-500 dark:text-slate-400">
            <Zap className="w-4 h-4 text-emerald-600" />
            <span className="text-[10px] font-black uppercase tracking-wider">Fast Moving SKUs</span>
          </div>
          <div className="text-xl font-black text-emerald-600 dark:text-emerald-400">{summary.count.toLocaleString('en-IN')}</div>
          <span className="text-[10px] text-slate-400">Top 20% sales velocity class</span>
        </div>

        <div className={`p-3.5 rounded-2xl border ${isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'}`}>
          <div className="flex items-center gap-2 mb-1 text-slate-500 dark:text-slate-400">
            <Boxes className="w-4 h-4 text-indigo-600" />
            <span className="text-[10px] font-black uppercase tracking-wider">Total Sales Volume</span>
          </div>
          <div className="text-xl font-black text-indigo-600 dark:text-indigo-400">{summary.totalSales.toLocaleString('en-IN')} Sold</div>
          <span className="text-[10px] text-slate-400">High demand throughput</span>
        </div>

        <div className={`p-3.5 rounded-2xl border ${isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'}`}>
          <div className="flex items-center gap-2 mb-1 text-slate-500 dark:text-slate-400">
            <TrendingUp className="w-4 h-4 text-emerald-600" />
            <span className="text-[10px] font-black uppercase tracking-wider">Sales Revenue</span>
          </div>
          <div className="text-xl font-black text-emerald-600 dark:text-emerald-400">₹{summary.totalRevenue.toLocaleString('en-IN')}</div>
          <span className="text-[10px] text-slate-400">Gross sales revenue</span>
        </div>

        <div className={`p-3.5 rounded-2xl border ${isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'}`}>
          <div className="flex items-center gap-2 mb-1 text-slate-500 dark:text-slate-400">
            <Coins className="w-4 h-4 text-teal-600" />
            <span className="text-[10px] font-black uppercase tracking-wider">Active Inventory Value</span>
          </div>
          <div className="text-xl font-black text-teal-600 dark:text-teal-400">₹{summary.totalInvValue.toLocaleString('en-IN')}</div>
          <span className="text-[10px] text-slate-400 font-bold">Fast turning stock capital</span>
        </div>
      </div>

      <AnalyticsTable
        title="Fast Moving Products Analysis"
        description="Top velocity SKUs generating the primary sales throughput"
        products={fastProducts}
        analyticsMap={analyticsMap}
        onSelectProduct={onSelectProduct}
        onStartFloorAudit={onStartFloorAudit ? (prods) => onStartFloorAudit('Fast Moving Floor Audit', 'top_100', prods) : undefined}
        isDarkMode={isDarkMode}
      />
    </div>
  );
};
