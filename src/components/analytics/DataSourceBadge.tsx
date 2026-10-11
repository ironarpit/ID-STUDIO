import React from 'react';
import { Database, Clock, Layers, Calendar, FileText, CheckCircle2 } from 'lucide-react';
import { StockReportMeta } from '../../types';

interface DataSourceBadgeProps {
  reportMeta: StockReportMeta | null;
  totalProducts: number;
  isDarkMode?: boolean;
}

export const DataSourceBadge: React.FC<DataSourceBadgeProps> = ({
  reportMeta,
  totalProducts,
  isDarkMode
}) => {
  const fileName = reportMeta?.fileName || 'Active Master Stock Memory';
  const uploadedAt = reportMeta?.uploadedAt ? new Date(reportMeta.uploadedAt).toLocaleString('en-IN') : 'Live Synced';
  const periodText = reportMeta?.reportPeriodText || (reportMeta?.reportDays ? `${reportMeta.reportDays}-Day Sales Window` : '30-Day Period');

  return (
    <div className={`p-2.5 sm:p-3 rounded-xl border ${
      isDarkMode ? 'bg-slate-900/90 border-slate-800 text-slate-200' : 'bg-slate-50/90 border-slate-200 text-slate-700'
    } shadow-2xs space-y-2`}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 border-b pb-1.5 border-slate-200/60 dark:border-slate-800">
        <div className="flex items-center gap-1.5 min-w-0">
          <div className="p-1 rounded-md bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 shrink-0">
            <Database className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0 flex items-center gap-2">
            <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
              {fileName}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800">
            <CheckCircle2 className="w-3 h-3 text-emerald-500" />
            <span>Central Sync Engine Active</span>
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-xs">
        <div className="p-1.5 rounded-lg bg-white dark:bg-slate-800/80 border border-slate-200/70 dark:border-slate-700/60">
          <div className="flex items-center gap-1 text-slate-400 text-[9px] uppercase font-semibold mb-0.5">
            <Clock className="w-2.5 h-2.5" />
            <span>Last Updated</span>
          </div>
          <span className="font-semibold text-slate-800 dark:text-slate-200 truncate block text-[11px]">
            {uploadedAt}
          </span>
        </div>

        <div className="p-1.5 rounded-lg bg-white dark:bg-slate-800/80 border border-slate-200/70 dark:border-slate-700/60">
          <div className="flex items-center gap-1 text-slate-400 text-[9px] uppercase font-semibold mb-0.5">
            <Layers className="w-2.5 h-2.5" />
            <span>Products Loaded</span>
          </div>
          <span className="font-semibold text-slate-800 dark:text-slate-200 block text-[11px] font-mono">
            {(totalProducts || 0).toLocaleString('en-IN')} SKUs
          </span>
        </div>

        <div className="p-1.5 rounded-lg bg-white dark:bg-slate-800/80 border border-slate-200/70 dark:border-slate-700/60">
          <div className="flex items-center gap-1 text-slate-400 text-[9px] uppercase font-semibold mb-0.5">
            <Calendar className="w-2.5 h-2.5" />
            <span>Sales Period</span>
          </div>
          <span className="font-semibold text-slate-800 dark:text-slate-200 truncate block text-[11px]">
            {periodText}
          </span>
        </div>

        <div className="p-1.5 rounded-lg bg-white dark:bg-slate-800/80 border border-slate-200/70 dark:border-slate-700/60">
          <div className="flex items-center gap-1 text-slate-400 text-[9px] uppercase font-semibold mb-0.5">
            <FileText className="w-2.5 h-2.5" />
            <span>Data Columns</span>
          </div>
          <span className="font-semibold text-slate-800 dark:text-slate-200 truncate block text-[11px]">
            Stock, Sales, Cost, MRP, Retail
          </span>
        </div>
      </div>
    </div>
  );
};
