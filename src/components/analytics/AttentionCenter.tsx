import React from 'react';
import { AlertCircle, AlertTriangle, ArrowRight, ShieldAlert, CheckCircle2, AlertOctagon } from 'lucide-react';
import { AttentionItem } from '../../utils/analytics';
import { AnalyticsViewType, Product } from '../../types';

interface AttentionCenterProps {
  attentionItems: AttentionItem[];
  onSelectView: (view: AnalyticsViewType) => void;
  onSelectProduct: (p: Product) => void;
  isDarkMode?: boolean;
}

export const AttentionCenter: React.FC<AttentionCenterProps> = ({
  attentionItems,
  onSelectView,
  onSelectProduct,
  isDarkMode
}) => {
  if (!attentionItems || attentionItems.length === 0) {
    return (
      <div className={`p-4 rounded-2xl border ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'} flex items-center gap-3`}>
        <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
        <div>
          <h3 className="text-sm font-bold dark:text-white">Management Attention Center: All Systems Healthy</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">No critical stockouts, negative margins, or severe data anomalies detected.</p>
        </div>
      </div>
    );
  }

  const getPriorityBadge = (priority: AttentionItem['priority']) => {
    switch (priority) {
      case 'CRITICAL':
        return (
          <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-rose-600 text-white shadow-2xs flex items-center gap-1">
            <AlertOctagon className="w-3 h-3" /> CRITICAL
          </span>
        );
      case 'HIGH':
        return (
          <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-amber-500 text-white shadow-2xs flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> HIGH
          </span>
        );
      case 'MEDIUM':
        return (
          <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-indigo-500 text-white shadow-2xs flex items-center gap-1">
            <AlertCircle className="w-3 h-3" /> MEDIUM
          </span>
        );
      case 'LOW':
        return (
          <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-slate-500 text-white shadow-2xs flex items-center gap-1">
            LOW
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-emerald-500 text-white shadow-2xs">
            NORMAL
          </span>
        );
    }
  };

  return (
    <div className={`p-3 sm:p-4 rounded-xl border ${isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'} shadow-2xs space-y-2.5`}>
      <div className="flex items-center justify-between border-b pb-2 border-slate-100 dark:border-slate-700">
        <div className="flex items-center gap-1.5 min-w-0">
          <div className="p-1.5 rounded-lg bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400 border border-rose-200 dark:border-rose-800 shrink-0">
            <ShieldAlert className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h2 className="text-xs sm:text-sm font-black tracking-tight flex items-center gap-1.5 truncate">
              <span>Management Attention Center</span>
              <span className="px-1.5 py-0.2 text-[10px] font-bold rounded-md bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                {attentionItems.length} Alerts
              </span>
            </h2>
            <p className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 truncate">
              High-priority operational issues requiring immediate stock or pricing decisions
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 sm:gap-2.5">
        {attentionItems.map((item) => (
          <div
            key={item.id}
            onClick={() => {
              if (item.viewTarget) {
                onSelectView(item.viewTarget as AnalyticsViewType);
              }
            }}
            className={`p-2.5 sm:p-3 rounded-lg border transition-all cursor-pointer flex flex-col justify-between group hover:scale-[1.01] ${
              item.priority === 'CRITICAL'
                ? isDarkMode
                  ? 'bg-rose-950/20 border-rose-800/80 hover:border-rose-500'
                  : 'bg-rose-50/70 border-rose-200 hover:border-rose-400'
                : item.priority === 'HIGH'
                ? isDarkMode
                  ? 'bg-amber-950/20 border-amber-800/80 hover:border-amber-500'
                  : 'bg-amber-50/70 border-amber-200 hover:border-amber-400'
                : isDarkMode
                ? 'bg-slate-900/60 border-slate-700 hover:border-indigo-500'
                : 'bg-slate-50 border-slate-200 hover:border-indigo-400'
            }`}
          >
            <div>
              <div className="flex items-center justify-between gap-1.5 mb-1">
                {getPriorityBadge(item.priority)}
                <span className="text-[11px] font-black font-mono">
                  {(item.count || 0).toLocaleString('en-IN')} SKUs
                </span>
              </div>

              <h3 className="text-xs sm:text-sm font-extrabold tracking-tight group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                {item.title}
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
                {item.description}
              </p>
            </div>

            <div className="flex items-center justify-between pt-2 mt-1.5 border-t border-slate-200/60 dark:border-slate-700/60 text-xs">
              <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">
                {item.totalValue > 0 ? `Tied: ₹${(item.totalValue || 0).toLocaleString('en-IN')}` : 'Action Required'}
              </span>
              <div className="flex items-center gap-1 font-bold text-[11px] text-indigo-600 dark:text-indigo-400 group-hover:translate-x-0.5 transition-transform">
                <span>View Products</span>
                <ArrowRight className="w-3 h-3" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
