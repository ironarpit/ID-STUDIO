import React from 'react';
import { 
  AlertOctagon, 
  AlertTriangle, 
  RefreshCw, 
  PackageX, 
  Archive, 
  ArrowRight,
  ShieldAlert
} from 'lucide-react';
import { RetailDashboardSummary } from '../../utils/analytics';
import { AnalyticsViewType, Product, ComputedProductAnalytics } from '../../types';

interface TopAlertsSectionProps {
  summary: RetailDashboardSummary;
  products: Product[];
  analyticsMap: Map<string, ComputedProductAnalytics>;
  onSelectView: (view: AnalyticsViewType) => void;
  isDarkMode?: boolean;
}

export const TopAlertsSection: React.FC<TopAlertsSectionProps> = ({
  summary,
  products,
  analyticsMap,
  onSelectView,
  isDarkMode
}) => {
  // Use existing summary counts & analytics data
  const outOfStockCount = summary?.outOfStockCount || 0;
  const lowStockCount = summary?.lowStockCount || 0;
  const replenishmentCount = lowStockCount + outOfStockCount; // Needs replenishment
  const deadStockCount = summary?.deadStockCount || 0;
  const overstockCount = summary?.overstockCount || 0;

  const alerts = [
    {
      id: 'out_of_stock',
      title: 'Out of Stock SKUs',
      count: outOfStockCount,
      label: 'Zero stock units',
      sublabel: 'Immediate revenue loss risk',
      view: 'out_of_stock' as AnalyticsViewType,
      icon: AlertOctagon,
      statusColor: 'text-rose-600 dark:text-rose-400',
      iconBg: 'bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-800/80',
      borderHover: 'hover:border-rose-400 dark:hover:border-rose-600',
      tag: 'Critical'
    },
    {
      id: 'low_stock',
      title: 'Low Stock Risk',
      count: lowStockCount,
      label: '<7 days coverage',
      sublabel: 'Reorder before stockout',
      view: 'low_stock' as AnalyticsViewType,
      icon: AlertTriangle,
      statusColor: 'text-amber-600 dark:text-amber-400',
      iconBg: 'bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800/80',
      borderHover: 'hover:border-amber-400 dark:hover:border-amber-600',
      tag: 'Warning'
    },
    {
      id: 'replenishment',
      title: 'Replenishment Needs',
      count: replenishmentCount,
      label: 'Purchase orders required',
      sublabel: 'Low stock + stockouts',
      view: 'replenishment' as AnalyticsViewType,
      icon: RefreshCw,
      statusColor: 'text-indigo-600 dark:text-indigo-400',
      iconBg: 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800/80',
      borderHover: 'hover:border-indigo-400 dark:hover:border-indigo-600',
      tag: 'Action'
    },
    {
      id: 'dead_stock',
      title: 'Dead Stock SKUs',
      count: deadStockCount,
      label: 'Zero sales & capital tied',
      sublabel: 'Clearance candidate',
      view: 'dead_stock' as AnalyticsViewType,
      icon: Archive,
      statusColor: 'text-slate-600 dark:text-slate-400',
      iconBg: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700',
      borderHover: 'hover:border-slate-400 dark:hover:border-slate-500',
      tag: 'Capital Risk'
    }
  ];

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between px-0.5">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded-md bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800">
            <ShieldAlert className="w-3.5 h-3.5" />
          </div>
          <div>
            <h2 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
              Top Alerts & Risk Monitoring
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 hidden sm:block">
              Priority operational issues requiring immediate stock or procurement action
            </p>
          </div>
        </div>

        <button
          onClick={() => onSelectView('replenishment')}
          className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer"
        >
          <span>View All Replenishments</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
        {alerts.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.id}
              onClick={() => onSelectView(item.view)}
              className={`p-3 sm:p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between group ${
                isDarkMode 
                  ? 'bg-slate-900 border-slate-800 hover:bg-slate-850' 
                  : 'bg-white border-slate-200 hover:bg-slate-50'
              } ${item.borderHover} shadow-xs`}
            >
              <div>
                <div className="flex items-center justify-between gap-1.5 mb-2">
                  <div className={`p-1.5 rounded-lg border ${item.iconBg}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md border ${
                    item.tag === 'Critical' 
                      ? 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800'
                      : item.tag === 'Warning'
                      ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800'
                      : 'bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
                  }`}>
                    {item.tag}
                  </span>
                </div>

                <div className="space-y-0.5">
                  <span className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-white block font-mono">
                    {item.count.toLocaleString('en-IN')}
                  </span>
                  <h3 className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                    {item.title}
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
                    {item.sublabel}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2.5 mt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
                <span className="text-[10px] text-slate-400 font-medium truncate">
                  {item.label}
                </span>
                <div className="flex items-center gap-0.5 text-[11px] font-bold text-indigo-600 dark:text-indigo-400 group-hover:translate-x-0.5 transition-transform shrink-0">
                  <span>Review</span>
                  <ArrowRight className="w-3 h-3" />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
