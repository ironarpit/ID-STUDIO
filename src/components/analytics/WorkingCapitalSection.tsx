import React from 'react';
import { Coins, AlertOctagon, Turtle, PackagePlus, ShieldCheck, ArrowRight } from 'lucide-react';
import { Product, ComputedProductAnalytics, AnalyticsViewType } from '../../types';
import { computeWorkingCapitalSummary } from '../../utils/analytics';

interface WorkingCapitalSectionProps {
  products: Product[];
  analyticsMap: Map<string, ComputedProductAnalytics>;
  onSelectView: (view: AnalyticsViewType) => void;
  isDarkMode?: boolean;
}

export const WorkingCapitalSection: React.FC<WorkingCapitalSectionProps> = ({
  products,
  analyticsMap,
  onSelectView,
  isDarkMode
}) => {
  const cap = React.useMemo(() => {
    return computeWorkingCapitalSummary(products, analyticsMap);
  }, [products, analyticsMap]);

  const cards = [
    {
      title: 'Total Capital in Stock',
      value: `₹${(cap.totalInventoryValue || 0).toLocaleString('en-IN')}`,
      subtext: 'Complete stock cost valuation',
      icon: Coins,
      view: 'inventory_value' as AnalyticsViewType,
      color: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800'
    },
    {
      title: 'Dead Stock Capital',
      value: `₹${(cap.deadStockValue || 0).toLocaleString('en-IN')}`,
      subtext: 'Zero sales + active stock',
      icon: AlertOctagon,
      view: 'dead_stock' as AnalyticsViewType,
      color: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800'
    },
    {
      title: 'Slow Moving Capital',
      value: `₹${(cap.slowMovingValue || 0).toLocaleString('en-IN')}`,
      subtext: 'Low turnover products',
      icon: Turtle,
      view: 'slow_moving' as AnalyticsViewType,
      color: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800'
    },
    {
      title: 'Overstock Capital',
      value: `₹${(cap.overstockValue || 0).toLocaleString('en-IN')}`,
      subtext: '>60 days stock cover',
      icon: PackagePlus,
      view: 'overstock' as AnalyticsViewType,
      color: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800'
    },
    {
      title: 'Healthy Active Capital',
      value: `₹${(cap.healthyStockValue || 0).toLocaleString('en-IN')}`,
      subtext: 'Optimally turning stock',
      icon: ShieldCheck,
      view: 'inventory_value' as AnalyticsViewType,
      color: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
    }
  ];

  return (
    <div className={`p-3.5 sm:p-4 rounded-xl border ${isDarkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-800'} shadow-xs space-y-3`}>
      <div className="flex items-center justify-between border-b pb-2 border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-1.5 min-w-0">
          <div className="p-1 rounded-md bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 shrink-0">
            <Coins className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate">
              Working Capital & Stock Money Breakdown
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
              Financial valuation of stock liquidity, blocked capital, and risk exposure
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2.5">
        {cards.map((c, idx) => {
          const Icon = c.icon;
          return (
            <button
              key={idx}
              onClick={() => onSelectView(c.view)}
              className={`p-3 rounded-lg border text-left transition-all cursor-pointer flex flex-col justify-between group ${
                isDarkMode ? 'bg-slate-850/60 border-slate-800 hover:border-slate-700' : 'bg-slate-50/80 border-slate-200/80 hover:border-slate-300'
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-1 mb-1.5">
                  <div className={`p-1 rounded-md border ${c.color}`}>
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <ArrowRight className="w-3 h-3 text-slate-400 group-hover:text-indigo-600 group-hover:translate-x-0.5 transition-all" />
                </div>
                <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 block truncate">
                  {c.title}
                </span>
                <span className="text-sm sm:text-base font-black tracking-tight mt-0.5 block truncate font-mono">
                  {c.value}
                </span>
              </div>
              <span className="text-[10px] text-slate-400 mt-1.5 block truncate">
                {c.subtext}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
