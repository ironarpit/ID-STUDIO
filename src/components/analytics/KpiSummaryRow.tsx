import React from 'react';
import { 
  Package, 
  IndianRupee, 
  AlertOctagon, 
  AlertTriangle, 
  TrendingUp, 
  Layers, 
  ArrowUpRight 
} from 'lucide-react';
import { RetailDashboardSummary } from '../../utils/analytics';
import { AnalyticsViewType } from '../../types';

interface KpiSummaryRowProps {
  summary: RetailDashboardSummary;
  onSelectView: (view: AnalyticsViewType) => void;
  isDarkMode?: boolean;
}

export const KpiSummaryRow: React.FC<KpiSummaryRowProps> = ({
  summary,
  onSelectView,
  isDarkMode
}) => {
  const totalProducts = summary?.totalProducts || 0;
  const totalInventoryValue = summary?.totalInventoryValue || 0;
  const outOfStockCount = summary?.outOfStockCount || 0;
  const lowStockCount = summary?.lowStockCount || 0;
  const totalStockQuantity = summary?.totalStockQuantity || 0;

  const kpis = [
    {
      id: 'total_products',
      label: 'Total Products',
      value: totalProducts.toLocaleString('en-IN'),
      unit: `${totalStockQuantity.toLocaleString('en-IN')} units on hand`,
      icon: Package,
      view: 'all_products' as AnalyticsViewType,
      // Restrained status styling: Indigo (general)
      iconClass: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800/80',
      valueClass: 'text-slate-900 dark:text-white',
      borderHover: 'hover:border-indigo-300 dark:hover:border-indigo-600'
    },
    {
      id: 'inventory_value',
      label: 'Total Inventory Value',
      value: `₹${(totalInventoryValue || 0).toLocaleString('en-IN')}`,
      unit: 'Cost valuation of holding stock',
      icon: IndianRupee,
      view: 'inventory_value' as AnalyticsViewType,
      // Restrained status styling: Green (healthy / value)
      iconClass: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/80',
      valueClass: 'text-slate-900 dark:text-white',
      borderHover: 'hover:border-emerald-300 dark:hover:border-emerald-600'
    },
    {
      id: 'out_of_stock',
      label: 'Out of Stock',
      value: outOfStockCount.toLocaleString('en-IN'),
      unit: 'SKUs with 0 stock on hand',
      icon: AlertOctagon,
      view: 'out_of_stock' as AnalyticsViewType,
      // Restrained status styling: Red (critical)
      iconClass: 'bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400 border-rose-200 dark:border-rose-800/80',
      valueClass: outOfStockCount > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white',
      borderHover: 'hover:border-rose-300 dark:hover:border-rose-600'
    },
    {
      id: 'low_stock',
      label: 'Low Stock Risk',
      value: lowStockCount.toLocaleString('en-IN'),
      unit: 'SKUs with <7 days cover',
      icon: AlertTriangle,
      view: 'low_stock' as AnalyticsViewType,
      // Restrained status styling: Amber (warning)
      iconClass: 'bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400 border-amber-200 dark:border-amber-800/80',
      valueClass: lowStockCount > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-900 dark:text-white',
      borderHover: 'hover:border-amber-300 dark:hover:border-amber-600'
    }
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3.5">
      {kpis.map((kpi) => {
        const Icon = kpi.icon;
        return (
          <div
            key={kpi.id}
            onClick={() => onSelectView(kpi.view)}
            className={`p-3 sm:p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between group shadow-xs ${
              isDarkMode 
                ? 'bg-slate-900 border-slate-800 hover:bg-slate-850' 
                : 'bg-white border-slate-200 hover:bg-slate-50'
            } ${kpi.borderHover}`}
          >
            <div className="flex items-start justify-between gap-1.5 mb-2">
              <span className="text-[11px] sm:text-xs font-semibold text-slate-500 dark:text-slate-400 leading-tight">
                {kpi.label}
              </span>
              <div className={`p-1.5 rounded-lg border shrink-0 transition-transform group-hover:scale-105 ${kpi.iconClass}`}>
                <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </div>
            </div>

            <div className="space-y-1">
              <span className={`text-xl sm:text-2xl lg:text-3xl font-black tracking-tight font-mono block truncate ${kpi.valueClass}`}>
                {kpi.value}
              </span>
              <div className="flex items-center justify-between gap-1 text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400">
                <span className="truncate">{kpi.unit}</span>
                <ArrowUpRight className="w-3 h-3 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
