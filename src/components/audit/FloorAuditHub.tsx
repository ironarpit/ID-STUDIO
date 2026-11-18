import React, { useState, useEffect } from 'react';
import {
  ClipboardCheck,
  EyeOff,
  Flame,
  Tags,
  Flag,
  Play,
  CheckCircle2,
  Clock,
  ArrowRight,
  RefreshCw,
  Plus,
  Trash2,
  FileSpreadsheet,
  FileText,
  Scan,
  Calendar,
  ShoppingBag,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { Product, AuditSession, AuditProductResult, AnalyticsViewType } from '../../types';
import {
  loadAllSessions,
  getFlaggedItems,
  resumeSession,
  forceRefreshSessions,
  deleteAuditSession,
  seedTestZeroSaleAudit
} from '../../utils/auditStorage';
import { exportAuditSessionToExcel, exportZeroSaleAuditToExcel } from '../../utils/auditExport';
import { getOrCreateActiveBatch, getNearExpiryItemsDB } from '../../utils/nearExpiryStorage';
import { calculateShelfLife } from '../../utils/nearExpiryEngine';
import { DailyPurchaseImportModal } from './DailyPurchaseImportModal';

interface FloorAuditHubProps {
  products: Product[];
  selectedStoreId: string;
  isDarkMode?: boolean;
  onStartAudit: (session: AuditSession, results: AuditProductResult[]) => void;
  onResumeAudit: (session: AuditSession, results: AuditProductResult[]) => void;
  onOpenFlagged: () => void;
  onNavigateToStockIQ?: () => void;
  onOpenNearExpiry?: () => void;
  onNavigateView?: (view: AnalyticsViewType) => void;
}

export const FloorAuditHub: React.FC<FloorAuditHubProps> = ({
  products,
  selectedStoreId,
  isDarkMode = false,
  onStartAudit,
  onResumeAudit,
  onOpenFlagged,
  onNavigateToStockIQ,
  onOpenNearExpiry,
  onNavigateView
}) => {
  const [activeSessions, setActiveSessions] = useState<AuditSession[]>([]);
  const [allSessions, setAllSessions] = useState<AuditSession[]>([]);
  const [flaggedCount, setFlaggedCount] = useState<number>(0);
  const [nearExpiryDueCount, setNearExpiryDueCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);
  const [showDailyPurchaseImportModal, setShowDailyPurchaseImportModal] = useState(false);
  const [showCompletedSection, setShowCompletedSection] = useState(false);

  // Load active sessions, flagged items, and near expiry counts
  const refreshData = async (isManual = false) => {
    if (isManual) setIsSyncing(true);
    else setLoading(true);

    try {
      const all = isManual
        ? await forceRefreshSessions(selectedStoreId)
        : await loadAllSessions(selectedStoreId);

      const active = all.filter((s) => s.status === 'in_progress');
      const flagged = await getFlaggedItems(selectedStoreId);

      setActiveSessions(active);
      setAllSessions(all);
      setFlaggedCount(flagged.length);

      // Load active Near Expiry batch action due count
      try {
        const { activeBatch } = await getOrCreateActiveBatch('PATAN', selectedStoreId);
        if (activeBatch) {
          const items = await getNearExpiryItemsDB(activeBatch.id);
          const due = items.filter((it) => {
            if (it.completedAt || it.status === 'COMPLETED') return false;
            const shelf = calculateShelfLife(it.mfgDate, it.expiryDate);
            return (
              it.status === 'ACTION_REQUIRED' ||
              it.floorRemovalStatus === 'SENT' ||
              shelf.pendingPct <= 5 ||
              shelf.isExpired
            );
          }).length;
          setNearExpiryDueCount(due);
        }
      } catch (e) {
        console.warn('Near Expiry count load error:', e);
      }

      if (isManual) {
        setSyncFeedback('All audits refreshed!');
        setTimeout(() => setSyncFeedback(null), 3000);
      }
    } catch (err) {
      console.error('Failed to load audit hub data:', err);
    } finally {
      setLoading(false);
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    refreshData();
  }, [selectedStoreId]);

  const handleResumeClick = async (sessionId: string) => {
    const { session, results } = await resumeSession(sessionId);
    if (session) {
      onResumeAudit(session, results);
    }
  };

  const handleDeleteSession = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm('Are you sure you want to permanently delete this audit session and all its counted item data?')) {
      await deleteAuditSession(sessionId, selectedStoreId);
      await refreshData();
    }
  };

  const handleExportExcelDirectly = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const { session: s, results } = await resumeSession(sessionId);
      if (s && results) {
        const isZeroSale = s.type === 'zero_sales' || (s.title && s.title.toLowerCase().includes('zero sale'));
        if (isZeroSale) {
          await exportZeroSaleAuditToExcel(s, results);
        } else {
          await exportAuditSessionToExcel(s, results);
        }
      } else {
        alert('Could not retrieve audit session details or results.');
      }
    } catch (err) {
      console.error('Failed to export completed audit session:', err);
      alert('Error exporting session. Please try again.');
    }
  };

  const handleSeedTestAudit = async () => {
    try {
      await seedTestZeroSaleAudit(selectedStoreId);
      await refreshData();
      alert('Reference Zero Sale Audit created successfully! You can view it under Completed Audits.');
    } catch (err: any) {
      console.error('Failed to seed reference audit:', err);
      alert('Failed to seed audit: ' + (err.message || String(err)));
    }
  };

  const getAuditTypeName = (s: AuditSession): string => {
    switch (s.type) {
      case 'daily_purchase': return 'Daily Purchase';
      case 'core_focus': return 'Core Focus';
      case 'non_core_focus': return 'Non-Core Focus';
      case 'top_100': return 'Top Products';
      case 'zero_sales': return 'Zero Sales';
      case 'category': return s.categoryFilter ? `Category: ${s.categoryFilter}` : 'Category';
      case 'random': return 'Random Sampling';
      case 'shelf_board': return 'Price Board';
      case 'low_stock': return 'Low Stock';
      case 'out_of_stock': return 'Out of Stock';
      case 'overstock': return 'Overstock';
      case 'dead_stock': return 'Dead Stock';
      default: return s.title || 'Floor Audit';
    }
  };

  // Zero sales count for badge
  const zeroSalesCount = React.useMemo(() => {
    return products.filter((p) => p.salesCount === 0).length;
  }, [products]);

  // Operational Summary Calculations
  const pendingItemsCount = React.useMemo(() => {
    return activeSessions.reduce((acc, s) => acc + Math.max(0, s.totalItems - (s.completedCount || 0)), 0);
  }, [activeSessions]);

  const completedSessions = React.useMemo(() => {
    return allSessions.filter((s) => s.status === 'completed');
  }, [allSessions]);

  const completedAuditsCount = completedSessions.length;

  return (
    <div className="space-y-3 pb-12 max-w-4xl mx-auto px-1 sm:px-2">
      {/* 1. COMPACT HEADER: Floor IQ · PATAN + Scanner indicator & Sync icon */}
      <div className={`p-2.5 sm:p-3 rounded-2xl border transition-all flex items-center justify-between gap-2 shadow-xs ${
        isDarkMode ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
      }`}>
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-2 rounded-xl bg-indigo-600 text-white shadow-xs shrink-0">
            <ClipboardCheck className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h1 className="text-sm sm:text-base font-extrabold tracking-tight text-slate-900 dark:text-white leading-tight truncate">
              Floor IQ · PATAN
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* Compact Scanner Ready Indicator */}
          <div className="flex items-center gap-1 px-2 py-1 rounded-xl bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 text-[11px] font-bold border border-indigo-200 dark:border-indigo-800/80">
            <Scan className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            <span className="hidden xs:inline">Scanner Ready</span>
          </div>

          {/* Single Sync Icon Button */}
          <button
            type="button"
            onClick={() => refreshData(true)}
            disabled={isSyncing}
            className={`min-h-[44px] min-w-[44px] flex items-center justify-center p-2 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
              isDarkMode
                ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
                : 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-800'
            }`}
            title="Sync audits with database"
          >
            <RefreshCw className={`w-4 h-4 text-indigo-600 dark:text-indigo-400 ${isSyncing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {syncFeedback && (
        <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs font-semibold flex items-center gap-1.5 animate-fade-in">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>{syncFeedback}</span>
        </div>
      )}

      {/* 2. COMPACT SUMMARY STRIP: Active | Pending | Action Required | Completed */}
      <div className={`p-2 rounded-2xl border grid grid-cols-4 gap-1.5 text-center font-mono shadow-xs ${
        isDarkMode ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
      }`}>
        <div className="p-1.5 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/40">
          <span className="text-[10px] sm:text-[11px] font-sans font-bold text-slate-500 dark:text-slate-400 block uppercase tracking-wider">
            Active
          </span>
          <span className="text-base sm:text-lg font-black text-indigo-600 dark:text-indigo-400">
            {activeSessions.length}
          </span>
        </div>

        <div className="p-1.5 rounded-xl bg-amber-50/70 dark:bg-amber-950/40 border border-amber-100 dark:border-amber-900/40">
          <span className="text-[10px] sm:text-[11px] font-sans font-bold text-slate-500 dark:text-slate-400 block uppercase tracking-wider">
            Pending
          </span>
          <span className="text-base sm:text-lg font-black text-amber-600 dark:text-amber-400">
            {pendingItemsCount.toLocaleString('en-IN')}
          </span>
        </div>

        <button
          type="button"
          onClick={onOpenFlagged}
          className={`p-1.5 rounded-xl border text-center transition-all cursor-pointer ${
            flaggedCount > 0
              ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900 hover:bg-rose-100 dark:hover:bg-rose-900/40'
              : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800'
          }`}
        >
          <span className="text-[10px] sm:text-[11px] font-sans font-bold text-slate-500 dark:text-slate-400 block uppercase tracking-wider truncate">
            Action Req
          </span>
          <span className={`text-base sm:text-lg font-black ${flaggedCount > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-700 dark:text-slate-300'}`}>
            {flaggedCount}
          </span>
        </button>

        <div className="p-1.5 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-900/40">
          <span className="text-[10px] sm:text-[11px] font-sans font-bold text-slate-500 dark:text-slate-400 block uppercase tracking-wider">
            Completed
          </span>
          <span className="text-base sm:text-lg font-black text-emerald-600 dark:text-emerald-400">
            {completedAuditsCount}
          </span>
        </div>
      </div>

      {/* 3. CONTINUE AUDITS: Active audits immediately visible */}
      <div className="space-y-2 pt-1">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-xs sm:text-sm font-black uppercase tracking-wide text-slate-900 dark:text-white flex items-center gap-1.5">
            <Play className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            <span>Continue Audits ({activeSessions.length})</span>
          </h2>
        </div>

        {activeSessions.length === 0 ? (
          <div className={`p-4 rounded-2xl border text-center text-xs font-semibold ${
            isDarkMode ? 'bg-slate-900 border-slate-800 text-slate-400' : 'bg-white border-slate-200 text-slate-500'
          }`}>
            No active audits in progress. Start a new audit below.
          </div>
        ) : (
          <div className="space-y-2">
            {activeSessions.map((session) => {
              const total = session.totalItems || 0;
              const checked = session.completedCount || 0;
              const pct = Math.round((checked / (total || 1)) * 100) || 0;
              const periodOrDate =
                session.reportPeriod ||
                session.purchaseMeta?.periodStr ||
                session.auditDate ||
                (session.createdAt ? new Date(session.createdAt).toLocaleDateString('en-GB') : 'Today');

              return (
                <div
                  key={session.id}
                  onClick={() => handleResumeClick(session.id)}
                  className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 group hover:border-indigo-500 shadow-2xs ${
                    isDarkMode
                      ? 'bg-slate-900 border-slate-800 text-slate-100 hover:bg-slate-850'
                      : 'bg-white border-slate-200 text-slate-900 hover:bg-slate-50/80'
                  }`}
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-indigo-50 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/60">
                        {getAuditTypeName(session)}
                      </span>
                      <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                        {periodOrDate}
                      </span>
                    </div>

                    <h3 className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white truncate" title={session.title}>
                      {session.title}
                    </h3>

                    {/* Progress indicator */}
                    <div className="flex items-center gap-2 text-xs font-mono">
                      <div className="w-24 sm:w-36 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden shrink-0">
                        <div className="h-full bg-indigo-600 rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-[11px] text-slate-600 dark:text-slate-300 font-bold">
                        {checked}/{total} ({pct}%)
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => handleResumeClick(session.id)}
                      className="min-h-[44px] px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
                    >
                      <span>RESUME</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handleDeleteSession(session.id, e)}
                      className="min-h-[44px] min-w-[44px] flex items-center justify-center p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-xl transition-colors cursor-pointer"
                      title="Delete audit session"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 4. START AUDIT: Compact options */}
      <div className="space-y-2 pt-2">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-xs sm:text-sm font-black uppercase tracking-wide text-slate-900 dark:text-white flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            <span>Start Audit</span>
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {/* Daily Purchase */}
          <button
            type="button"
            onClick={() => setShowDailyPurchaseImportModal(true)}
            className={`p-3 rounded-2xl border transition-all text-left flex items-center justify-between gap-2.5 cursor-pointer group hover:border-indigo-500 min-h-[48px] ${
              isDarkMode ? 'bg-slate-900 border-slate-800 text-slate-100 hover:bg-slate-850' : 'bg-white border-slate-200 text-slate-900 hover:bg-slate-50 shadow-2xs'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 group-hover:scale-105 transition-transform shrink-0">
                <ShoppingBag className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white truncate">
                  Daily Purchase Audit
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  Import Purchase Summary
                </div>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-600 group-hover:translate-x-0.5 transition-all shrink-0" />
          </button>

          {/* Zero Sales */}
          <button
            type="button"
            onClick={() => onNavigateView ? onNavigateView('zero_sales') : onNavigateToStockIQ?.()}
            className={`p-3 rounded-2xl border transition-all text-left flex items-center justify-between gap-2.5 cursor-pointer group hover:border-indigo-500 min-h-[48px] ${
              isDarkMode ? 'bg-slate-900 border-slate-800 text-slate-100 hover:bg-slate-850' : 'bg-white border-slate-200 text-slate-900 hover:bg-slate-50 shadow-2xs'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/80 text-amber-600 dark:text-amber-400 group-hover:scale-105 transition-transform shrink-0">
                <EyeOff className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white truncate">
                  Zero Sales Audit
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  {zeroSalesCount} Zero Sales SKUs in Stock IQ
                </div>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-600 group-hover:translate-x-0.5 transition-all shrink-0" />
          </button>

          {/* Top Products */}
          <button
            type="button"
            onClick={() => onNavigateView ? onNavigateView('top_sales') : onNavigateToStockIQ?.()}
            className={`p-3 rounded-2xl border transition-all text-left flex items-center justify-between gap-2.5 cursor-pointer group hover:border-indigo-500 min-h-[48px] ${
              isDarkMode ? 'bg-slate-900 border-slate-800 text-slate-100 hover:bg-slate-850' : 'bg-white border-slate-200 text-slate-900 hover:bg-slate-50 shadow-2xs'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 group-hover:scale-105 transition-transform shrink-0">
                <Flame className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white truncate">
                  Top Products Audit
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  Audit Top 100 Revenue & Velocity SKUs
                </div>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-600 group-hover:translate-x-0.5 transition-all shrink-0" />
          </button>

          {/* Category / Board Checks */}
          <button
            type="button"
            onClick={() => onNavigateView ? onNavigateView('category_dash') : onNavigateToStockIQ?.()}
            className={`p-3 rounded-2xl border transition-all text-left flex items-center justify-between gap-2.5 cursor-pointer group hover:border-indigo-500 min-h-[48px] ${
              isDarkMode ? 'bg-slate-900 border-slate-800 text-slate-100 hover:bg-slate-850' : 'bg-white border-slate-200 text-slate-900 hover:bg-slate-50 shadow-2xs'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 group-hover:scale-105 transition-transform shrink-0">
                <Tags className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white truncate">
                  Category & Board Checks
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  Filter by category / department
                </div>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-600 group-hover:translate-x-0.5 transition-all shrink-0" />
          </button>
        </div>
      </div>

      {/* 5. NEAR EXPIRY: Compact shortcut with due action count */}
      {onOpenNearExpiry && (
        <div className="space-y-2 pt-2">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-xs sm:text-sm font-black uppercase tracking-wide text-slate-900 dark:text-white flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>Near Expiry</span>
            </h2>
          </div>

          <div
            onClick={onOpenNearExpiry}
            className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 group hover:border-indigo-500 shadow-2xs ${
              isDarkMode ? 'bg-slate-900 border-slate-800 text-slate-100 hover:bg-slate-850' : 'bg-white border-slate-200 text-slate-900 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 group-hover:scale-105 transition-transform shrink-0">
                <Calendar className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white truncate">
                    Near Expiry Management
                  </h3>
                  {nearExpiryDueCount > 0 && (
                    <span className="px-2 py-0.5 text-[10px] font-black rounded-full bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300 border border-rose-300 dark:border-rose-800">
                      {nearExpiryDueCount} Due Action
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  Fortnightly batch list, floor removal & HO response tasks
                </p>
              </div>
            </div>

            <button
              type="button"
              className="min-h-[44px] px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs transition-all flex items-center gap-1.5 shrink-0 pointer-events-none"
            >
              <span>OPEN</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>
        </div>
      )}

      {/* 6. COMPLETED AUDITS SECTION (Collapsible) */}
      {completedAuditsCount > 0 && (
        <div className="space-y-2 pt-3 border-t border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setShowCompletedSection(!showCompletedSection)}
            className="w-full flex items-center justify-between p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer text-left"
          >
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                Completed Audits ({completedAuditsCount})
              </span>
            </div>
            {showCompletedSection ? (
              <ChevronUp className="w-4 h-4 text-slate-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-400" />
            )}
          </button>

          {showCompletedSection && (
            <div className="space-y-2 animate-fade-in">
              <div className="flex justify-end pb-1">
                <button
                  type="button"
                  onClick={handleSeedTestAudit}
                  className="px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-[11px] font-bold cursor-pointer hover:bg-emerald-100 dark:hover:bg-emerald-900 transition-all flex items-center gap-1"
                  title="Create 17-05-2026 Reference Zero Sale Audit with 8 test cases"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                  <span>+ Load Reference Audit</span>
                </button>
              </div>

              {completedSessions.map((s) => {
                const total = s.totalItems || 0;
                const done = s.completedCount || 0;
                const startDateStr = s.createdAt
                  ? new Date(s.createdAt).toLocaleDateString('en-GB')
                  : 'N/A';

                return (
                  <div
                    key={s.id}
                    className={`p-3 rounded-xl border flex items-center justify-between gap-3 ${
                      isDarkMode ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900 shadow-2xs'
                    }`}
                  >
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="px-1.5 py-0.2 text-[9.5px] font-bold rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                          ✓ Completed
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">{startDateStr}</span>
                      </div>
                      <h4 className="font-bold text-xs truncate text-slate-900 dark:text-white">
                        {s.title}
                      </h4>
                      <p className="text-[11px] text-slate-500 font-mono">
                        {done}/{total} Checked
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleResumeClick(s.id)}
                        className="min-h-[40px] px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer flex items-center gap-1"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span className="hidden xs:inline">View</span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleExportExcelDirectly(s.id, e)}
                        className="min-h-[40px] px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer flex items-center gap-1"
                        title="Download Excel"
                      >
                        <FileSpreadsheet className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Excel</span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleDeleteSession(s.id, e)}
                        className="min-h-[40px] min-w-[40px] flex items-center justify-center p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-lg cursor-pointer"
                        title="Delete audit"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Daily Purchase Import Modal */}
      {showDailyPurchaseImportModal && (
        <DailyPurchaseImportModal
          isOpen={showDailyPurchaseImportModal}
          onClose={() => setShowDailyPurchaseImportModal(false)}
          products={products}
          selectedStoreId={selectedStoreId}
          existingSessions={allSessions}
          isDarkMode={isDarkMode}
          onAuditCreated={(session, results) => {
            setShowDailyPurchaseImportModal(false);
            onStartAudit(session, results);
          }}
        />
      )}
    </div>
  );
};
