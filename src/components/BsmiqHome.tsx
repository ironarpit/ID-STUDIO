import React from 'react';
import { 
  Layers, 
  ClipboardCheck, 
  Sparkles, 
  ArrowRight, 
  Package, 
  RefreshCw, 
  ShieldCheck, 
  Coins, 
  CheckCircle2, 
  AlertCircle,
  BarChart3
} from 'lucide-react';
import { RetailDashboardSummary } from '../utils/analytics';
import { Product, StockReportMeta } from '../types';
import { LastSearchedProductCard } from './LastSearchedProductCard';

interface BsmiqHomeProps {
  onOpenStockIq: () => void;
  onOpenFloorIq: () => void;
  onOpenFocusIq: () => void;
  summary: RetailDashboardSummary;
  reportMeta?: StockReportMeta | null;
  coreCheckStatus?: 'in_progress' | 'completed' | 'none';
  nonCoreCheckStatus?: 'in_progress' | 'completed' | 'none';
  hasActiveFloorAudit?: boolean;
  isDarkMode?: boolean;
  onOpenSettings?: () => void;
}

export const BsmiqHome: React.FC<BsmiqHomeProps> = ({
  onOpenStockIq,
  onOpenFloorIq,
  onOpenFocusIq,
  summary,
  coreCheckStatus = 'none',
  nonCoreCheckStatus = 'none',
  hasActiveFloorAudit = false,
  isDarkMode = false,
  onOpenSettings
}) => {
  const formatVal = (val: number) => {
    if (!val || val === 0) return '₹0';
    if (val >= 10000000) return `₹${(val / 10000000).toFixed(2)} Cr`;
    if (val >= 100000) return `₹${(val / 100000).toFixed(2)} Lakh`;
    return `₹${Math.round(val).toLocaleString('en-IN')}`;
  };

  return (
    <div className="p-1.5 sm:p-4 max-w-7xl mx-auto space-y-2 sm:space-y-4 animate-fade-in">
      {/* THREE PRIMARY MODULE CARDS (STOCK IQ, FLOOR IQ, FOCUS IQ) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 sm:gap-4">
        
        {/* ======================================================== */}
        {/* MODULE CARD 1: STOCK IQ */}
        {/* ======================================================== */}
        <div className={`p-2.5 sm:p-5 rounded-xl border flex flex-col justify-between transition-all group hover:shadow-md ${
          isDarkMode
            ? 'bg-slate-900 border-slate-800 hover:border-indigo-500/60'
            : 'bg-white border-slate-200 hover:border-indigo-300 shadow-xs'
        }`}>
          <div className="space-y-1.5 sm:space-y-3">
            {/* Header: Icon + Title + Badge */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-indigo-50 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 border border-indigo-200/80 dark:border-indigo-800 flex items-center justify-center shadow-2xs shrink-0">
                  <Layers className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-sm sm:text-lg font-black text-slate-900 dark:text-white tracking-tight leading-tight">
                    STOCK IQ
                  </h2>
                  <p className="text-[10.5px] sm:hidden text-slate-500 dark:text-slate-400 font-medium truncate leading-tight">
                    Inventory & Analytics
                  </p>
                </div>
              </div>
              <span className="text-[8.5px] sm:text-[10px] font-bold px-1.5 sm:px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 shrink-0">
                <span className="sm:hidden">INVENTORY</span>
                <span className="hidden sm:inline">INVENTORY & ANALYTICS</span>
              </span>
            </div>

            {/* Desktop-only full description */}
            <p className="hidden sm:block text-xs text-slate-500 dark:text-slate-400 font-medium">
              Inventory, sales, replenishment and barcode intelligence
            </p>

            {/* Live Metrics Snippet */}
            <div className={`p-1.5 sm:p-3 rounded-lg sm:rounded-xl border space-y-0.5 sm:space-y-1.5 text-[10.5px] sm:text-xs leading-tight ${
              isDarkMode ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200/80'
            }`}>
              <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                <span>Inventory Value</span>
                <strong className="text-slate-900 dark:text-white font-mono font-bold">{formatVal(summary.totalInventoryValue)}</strong>
              </div>
              <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                <span>Reorder Needed</span>
                <strong className="text-rose-600 dark:text-rose-400 font-mono font-bold">
                  {(summary.lowStockCount + summary.outOfStockCount).toLocaleString()}
                  <span className="hidden sm:inline"> SKUs</span>
                </strong>
              </div>
              <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                <span>Dead / Zero</span>
                <strong className="text-slate-800 dark:text-slate-200 font-mono font-bold">
                  {(summary.deadStockCount + summary.zeroSalesCount).toLocaleString()}
                  <span className="hidden sm:inline"> SKUs</span>
                </strong>
              </div>
            </div>
          </div>

          {/* Action Button */}
          <div className="pt-1.5 sm:pt-4">
            <button
              onClick={onOpenStockIq}
              className="w-full h-10 sm:min-h-[42px] py-1 sm:py-2.5 px-3 sm:px-4 rounded-lg sm:rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold text-xs shadow-xs transition-all cursor-pointer flex items-center justify-center gap-1.5 sm:gap-2"
            >
              <span>Open Stock IQ</span>
              <ArrowRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>
        </div>

        {/* ======================================================== */}
        {/* MODULE CARD 2: FLOOR IQ */}
        {/* ======================================================== */}
        <div className={`p-2.5 sm:p-5 rounded-xl border flex flex-col justify-between transition-all group hover:shadow-md ${
          isDarkMode
            ? 'bg-slate-900 border-slate-800 hover:border-amber-500/60'
            : 'bg-white border-slate-200 hover:border-amber-300 shadow-xs'
        }`}>
          <div className="space-y-1.5 sm:space-y-3">
            {/* Header: Icon + Title + Badge */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-amber-50 dark:bg-amber-950/80 text-amber-600 dark:text-amber-400 border border-amber-200/80 dark:border-amber-800 flex items-center justify-center shadow-2xs shrink-0">
                  <ClipboardCheck className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-sm sm:text-lg font-black text-slate-900 dark:text-white tracking-tight leading-tight">
                    FLOOR IQ
                  </h2>
                  <p className="text-[10.5px] sm:hidden text-slate-500 dark:text-slate-400 font-medium truncate leading-tight">
                    Audits & Execution
                  </p>
                </div>
              </div>
              <span className="text-[8.5px] sm:text-[10px] font-bold px-1.5 sm:px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 shrink-0">
                <span className="sm:hidden">AUDITS</span>
                <span className="hidden sm:inline">STORE EXECUTION</span>
              </span>
            </div>

            {/* Desktop-only full description */}
            <p className="hidden sm:block text-xs text-slate-500 dark:text-slate-400 font-medium">
              Physical floor audits and execution checks
            </p>

            {/* Live Metrics Snippet */}
            <div className={`p-1.5 sm:p-3 rounded-lg sm:rounded-xl border space-y-0.5 sm:space-y-1.5 text-[10.5px] sm:text-xs leading-tight ${
              isDarkMode ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200/80'
            }`}>
              <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                <span>Active Floor Audit</span>
                <strong className={hasActiveFloorAudit ? 'text-amber-600 dark:text-amber-400 font-bold' : 'text-slate-500 font-normal'}>
                  {hasActiveFloorAudit ? 'In Progress' : 'Ready'}
                </strong>
              </div>
              <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                <span>Scanner Mode</span>
                <strong className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" /> Barcode Ready
                </strong>
              </div>
              <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                <span>Action Follow-Ups</span>
                <strong className="text-slate-800 dark:text-slate-200 font-semibold truncate max-w-[130px] sm:max-w-none">
                  <span className="sm:hidden">Shelf Checks</span>
                  <span className="hidden sm:inline">Physical Shelf Checks</span>
                </strong>
              </div>
            </div>
          </div>

          {/* Action Button */}
          <div className="pt-1.5 sm:pt-4">
            <button
              onClick={onOpenFloorIq}
              className="w-full h-10 sm:min-h-[42px] py-1 sm:py-2.5 px-3 sm:px-4 rounded-lg sm:rounded-xl bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white font-bold text-xs shadow-xs transition-all cursor-pointer flex items-center justify-center gap-1.5 sm:gap-2"
            >
              <span>Open Floor IQ</span>
              <ArrowRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>
        </div>

        {/* ======================================================== */}
        {/* MODULE CARD 3: FOCUS IQ */}
        {/* ======================================================== */}
        <div className={`p-2.5 sm:p-5 rounded-xl border flex flex-col justify-between transition-all group hover:shadow-md ${
          isDarkMode
            ? 'bg-slate-900 border-slate-800 hover:border-teal-500/60'
            : 'bg-white border-slate-200 hover:border-teal-300 shadow-xs'
        }`}>
          <div className="space-y-1.5 sm:space-y-3">
            {/* Header: Icon + Title + Badge */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-teal-50 dark:bg-teal-950/80 text-teal-600 dark:text-teal-400 border border-teal-200/80 dark:border-teal-800 flex items-center justify-center shadow-2xs shrink-0">
                  <Sparkles className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-sm sm:text-lg font-black text-slate-900 dark:text-white tracking-tight leading-tight">
                    FOCUS IQ
                  </h2>
                  <p className="text-[10.5px] sm:hidden text-slate-500 dark:text-slate-400 font-medium truncate leading-tight">
                    Offers & Checks
                  </p>
                </div>
              </div>
              <span className="text-[8.5px] sm:text-[10px] font-bold px-1.5 sm:px-2 py-0.5 rounded-md bg-teal-50 dark:bg-teal-950 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800 shrink-0">
                <span className="sm:hidden">OFFERS</span>
                <span className="hidden sm:inline">SCHEMES & OFFERS</span>
              </span>
            </div>

            {/* Desktop-only full description */}
            <p className="hidden sm:block text-xs text-slate-500 dark:text-slate-400 font-medium">
              Focus offers, stock availability and physical checks
            </p>

            {/* Live Metrics Snippet */}
            <div className={`p-1.5 sm:p-3 rounded-lg sm:rounded-xl border space-y-0.5 sm:space-y-1.5 text-[10.5px] sm:text-xs leading-tight ${
              isDarkMode ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200/80'
            }`}>
              <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                <span>Core Focus Check</span>
                <strong className={
                  coreCheckStatus === 'in_progress' ? 'text-emerald-600 font-bold' :
                  coreCheckStatus === 'completed' ? 'text-slate-700 font-semibold' : 'text-slate-500 font-normal'
                }>
                  {coreCheckStatus === 'in_progress' ? 'Active' :
                   coreCheckStatus === 'completed' ? 'Done' : 'Not Started'}
                </strong>
              </div>
              <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                <span>Non-Core Check</span>
                <strong className={
                  nonCoreCheckStatus === 'in_progress' ? 'text-teal-600 font-bold' :
                  nonCoreCheckStatus === 'completed' ? 'text-slate-700 font-semibold' : 'text-slate-500 font-normal'
                }>
                  {nonCoreCheckStatus === 'in_progress' ? 'Active' :
                   nonCoreCheckStatus === 'completed' ? 'Done' : 'Not Started'}
                </strong>
              </div>
              <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                <span>Physical Scanner</span>
                <strong className="text-indigo-600 dark:text-indigo-400 font-semibold truncate">
                  SKU Restricted
                </strong>
              </div>
            </div>
          </div>

          {/* Action Button */}
          <div className="pt-1.5 sm:pt-4">
            <button
              onClick={onOpenFocusIq}
              className="w-full h-10 sm:min-h-[42px] py-1 sm:py-2.5 px-3 sm:px-4 rounded-lg sm:rounded-xl bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white font-bold text-xs shadow-xs transition-all cursor-pointer flex items-center justify-center gap-1.5 sm:gap-2"
            >
              <span>Open Focus IQ</span>
              <ArrowRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>
        </div>

      </div>

      {/* System Quick Bar */}
      {onOpenSettings && (
        <div className={`p-2 sm:p-3.5 rounded-xl border flex flex-row items-center justify-between gap-2 text-[11px] sm:text-xs ${
          isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-slate-50 border-slate-200'
        }`}>
          <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400 min-w-0">
            <ShieldCheck className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <span className="truncate">Manage datasets & offline storage</span>
          </div>
          <button
            onClick={onOpenSettings}
            className="px-2.5 py-1 sm:px-3 sm:py-1.5 h-8 sm:h-9 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors shrink-0 cursor-pointer text-[11px] sm:text-xs whitespace-nowrap"
          >
            Settings & Offline Data
          </button>
        </div>
      )}
    </div>
  );
};
