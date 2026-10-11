import React, { useMemo, useState, useEffect } from 'react';
import {
  ShoppingBag,
  Upload,
  Sparkles,
  CheckCircle2,
  XCircle,
  ArrowRight,
  Layers,
  AlertCircle,
  AlertTriangle,
  Info,
  Tag,
  ClipboardCheck,
  ShieldCheck,
  Copy,
  Check,
  Play,
  Scan,
  RefreshCw,
  X,
  FileSpreadsheet
} from 'lucide-react';
import {
  FocusMaster,
  FocusType,
  Product,
  PhysicalFocusCheckSession,
  EvaluatedFocusOfferProduct,
  FocusOfferStats
} from '../../types';
import {
  evaluateFocusProductsWithLiveStock,
  calculateFocusIQStats,
  evaluateFocusOfferProducts,
  calculateFocusOfferStats,
  generateFocusNotMatchedWhatsAppText
} from '../../utils/focusMatcher';
import { loadAllPhysicalFocusChecks } from '../../utils/focusStorage';

interface FocusIQHubProps {
  coreMaster: FocusMaster | null;
  nonCoreMaster: FocusMaster | null;
  allMasters: FocusMaster[];
  stockProducts: Product[];
  reportDays?: number | null;
  initialScope?: FocusType;
  onScopeChange?: (scope: FocusType) => void;
  onOpenFocusIssues: (type: FocusType, filter?: 'all' | 'out_of_stock' | 'low_stock') => void;
  onOpenOfferMismatch?: (type: FocusType, filter?: string) => void;
  onOpenPhysicalCheck?: (type: FocusType) => void;
  onOpenFocusList: (type: FocusType, filter?: string) => void;
  onOpenUploadModal: (type: FocusType) => void;
  onReloadMasters: () => Promise<void>;
  onSelectActiveMaster?: (type: FocusType, masterId: string) => Promise<void>;
  selectedStoreId?: string;
  isDarkMode?: boolean;
  onOpenAdminSettings?: () => void;
}

export const FocusIQHub: React.FC<FocusIQHubProps> = ({
  coreMaster,
  nonCoreMaster,
  allMasters: _allMasters,
  stockProducts,
  reportDays,
  initialScope = 'core',
  onScopeChange,
  onOpenFocusIssues,
  onOpenOfferMismatch,
  onOpenPhysicalCheck,
  onOpenFocusList,
  onOpenUploadModal,
  onReloadMasters,
  onSelectActiveMaster: _onSelectActiveMaster,
  selectedStoreId = 'store_1',
  isDarkMode = false,
  onOpenAdminSettings
}) => {
  // Active Scope Selection: 'core' or 'non_core'
  const [activeScope, setActiveScope] = useState<FocusType>(initialScope);
  const [showInfo, setShowInfo] = useState(false);
  const [showDataSettings, setShowDataSettings] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [copiedNotMatched, setCopiedNotMatched] = useState(false);

  // Active Physical Checks for both scopes
  const [activeCoreCheck, setActiveCoreCheck] = useState<PhysicalFocusCheckSession | null>(null);
  const [activeNonCoreCheck, setActiveNonCoreCheck] = useState<PhysicalFocusCheckSession | null>(null);

  // Keep activeScope synced if initialScope changes
  useEffect(() => {
    if (initialScope && initialScope !== activeScope) {
      setActiveScope(initialScope);
    }
  }, [initialScope]);

  const handleSelectScope = (scope: FocusType) => {
    setActiveScope(scope);
    if (onScopeChange) {
      onScopeChange(scope);
    }
  };

  // Load Active Physical Focus Checks
  const refreshPhysicalChecks = async () => {
    try {
      const checks = await loadAllPhysicalFocusChecks(selectedStoreId);
      const core = checks.find(c => c.type === 'core' && c.status === 'in_progress') || null;
      const nonCore = checks.find(c => c.type === 'non_core' && c.status === 'in_progress') || null;
      setActiveCoreCheck(core);
      setActiveNonCoreCheck(nonCore);
    } catch (err) {
      console.warn('Failed to load active focus checks:', err);
    }
  };

  useEffect(() => {
    refreshPhysicalChecks();
  }, [selectedStoreId]);

  // Live Stage 2 evaluations
  const coreEvaluated = useMemo(() => {
    if (!coreMaster || !coreMaster.items) return [];
    return evaluateFocusProductsWithLiveStock(coreMaster.items, stockProducts, reportDays);
  }, [coreMaster, stockProducts, reportDays]);

  const coreStats = useMemo(() => {
    return calculateFocusIQStats(
      coreEvaluated,
      coreMaster?.monthDisplay || 'Not Configured',
      reportDays,
      coreMaster?.uploadedAt,
      coreMaster?.fileName
    );
  }, [coreEvaluated, coreMaster, reportDays]);

  const nonCoreEvaluated = useMemo(() => {
    if (!nonCoreMaster || !nonCoreMaster.items) return [];
    return evaluateFocusProductsWithLiveStock(nonCoreMaster.items, stockProducts, reportDays);
  }, [nonCoreMaster, stockProducts, reportDays]);

  const nonCoreStats = useMemo(() => {
    return calculateFocusIQStats(
      nonCoreEvaluated,
      nonCoreMaster?.monthDisplay || 'Not Configured',
      reportDays,
      nonCoreMaster?.uploadedAt,
      nonCoreMaster?.fileName
    );
  }, [nonCoreEvaluated, nonCoreMaster, reportDays]);

  // Live Stage 3 evaluations
  const coreOfferEvaluated: EvaluatedFocusOfferProduct[] = useMemo(() => {
    if (!coreMaster || !coreMaster.items) return [];
    return evaluateFocusOfferProducts(coreMaster.items, stockProducts);
  }, [coreMaster, stockProducts]);

  const coreOfferStats: FocusOfferStats = useMemo(() => {
    return calculateFocusOfferStats(
      coreOfferEvaluated,
      coreMaster?.monthDisplay || 'Not Configured',
      coreMaster?.uploadedAt,
      coreMaster?.fileName
    );
  }, [coreOfferEvaluated, coreMaster]);

  const nonCoreOfferEvaluated: EvaluatedFocusOfferProduct[] = useMemo(() => {
    if (!nonCoreMaster || !nonCoreMaster.items) return [];
    return evaluateFocusOfferProducts(nonCoreMaster.items, stockProducts);
  }, [nonCoreMaster, stockProducts]);

  const nonCoreOfferStats: FocusOfferStats = useMemo(() => {
    return calculateFocusOfferStats(
      nonCoreOfferEvaluated,
      nonCoreMaster?.monthDisplay || 'Not Configured',
      nonCoreMaster?.uploadedAt,
      nonCoreMaster?.fileName
    );
  }, [nonCoreOfferEvaluated, nonCoreMaster]);

  // Active Scope Selected Data
  const isCore = activeScope === 'core';
  const activeMaster = isCore ? coreMaster : nonCoreMaster;
  const activeEvaluated = isCore ? coreEvaluated : nonCoreEvaluated;
  const activeStats = isCore ? coreStats : nonCoreStats;
  const activeOfferEvaluated = isCore ? coreOfferEvaluated : nonCoreOfferEvaluated;
  const activeOfferStats = isCore ? coreOfferStats : nonCoreOfferStats;
  const activePhysicalCheck = isCore ? activeCoreCheck : activeNonCoreCheck;

  // Counts for Primary Actions
  const activeIssuesTotal = activeStats.outOfStockCount + activeStats.lowStockCount;

  // Unique products needing Offer Review (mismatches, manual check, unrecognized, or MRP changed)
  const uniqueReviewProducts = useMemo(() => {
    return activeOfferEvaluated.filter(item => 
      item.offerStatus === 'MISMATCH' || 
      item.offerStatus === 'MANUAL_CHECK' || 
      item.offerStatus === 'UNRECOGNIZED' || 
      item.isMrpChanged
    );
  }, [activeOfferEvaluated]);

  const uniqueReviewCount = uniqueReviewProducts.length;

  // Accurate, Non-Misleading Offer Status Banner
  const offerStatusSummary = useMemo(() => {
    if (!activeMaster || activeStats.totalProducts === 0) {
      return {
        type: 'empty' as const,
        label: 'No Master Loaded',
        badgeClass: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border-slate-200 dark:border-slate-700'
      };
    }

    const mismatchCount = activeOfferStats?.mismatchCount || 0;
    const unrecognizedCount = activeOfferStats?.unrecognizedCount || 0;
    const manualCheckCount = activeOfferStats?.manualCheckCount || 0;
    const correctCount = activeOfferStats?.correctCount || 0;
    const unresolvedCount = unrecognizedCount + manualCheckCount;

    if (mismatchCount > 0) {
      if (unresolvedCount > 0) {
        return {
          type: 'mismatch_and_unresolved' as const,
          label: `${mismatchCount} Mismatch · ${unresolvedCount} Need Review`,
          badgeClass: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200 border-rose-300 dark:border-rose-800'
        };
      }
      return {
        type: 'mismatch' as const,
        label: `${mismatchCount} Offer Mismatch`,
        badgeClass: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200 border-rose-300 dark:border-rose-800'
      };
    }

    if (unresolvedCount > 0) {
      return {
        type: 'unresolved' as const,
        label: `${unresolvedCount} Offers Need Review`,
        badgeClass: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200 border-amber-300 dark:border-amber-800'
      };
    }

    // Only claim "All verified offers match" when no unverified/unrecognized/manual checks exist AND all eligible items verified
    const totalEligible = activeStats.totalProducts - (activeOfferStats.notMatchedCount || 0);
    if (correctCount > 0 && correctCount >= totalEligible) {
      return {
        type: 'all_matched' as const,
        label: 'All Verified Offers Match',
        badgeClass: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200 border-emerald-300 dark:border-emerald-800'
      };
    }

    if (correctCount > 0) {
      return {
        type: 'neutral' as const,
        label: `${correctCount} Verified Correct`,
        badgeClass: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700'
      };
    }

    return {
      type: 'neutral' as const,
      label: 'Ready for Review',
      badgeClass: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700'
    };
  }, [activeMaster, activeStats, activeOfferStats]);

  // Handle WhatsApp Copy for Unmatched Products
  const handleCopyNotMatched = async () => {
    const unmatched = activeEvaluated.filter(i => !i.isMatched || i.status === 'NOT_MATCHED');
    const text = generateFocusNotMatchedWhatsAppText(
      unmatched,
      activeScope,
      activeMaster?.monthDisplay || 'Current Month'
    );
    try {
      await navigator.clipboard.writeText(text);
      setCopiedNotMatched(true);
      setTimeout(() => setCopiedNotMatched(false), 2500);
    } catch (err) {
      console.error('Failed to copy unmatched to clipboard:', err);
    }
  };

  const handleManualSync = async () => {
    setIsSyncing(true);
    try {
      await onReloadMasters();
      await refreshPhysicalChecks();
    } finally {
      setIsSyncing(false);
    }
  };

  const activeMonthDisplay = activeMaster?.monthDisplay || 'Active Month';

  return (
    <div className="space-y-3 pb-12 max-w-4xl mx-auto px-1 sm:px-2 animate-fade-in">
      {/* 1. STICKY / COMPACT HEADER & SCOPE TABS */}
      <div className="sticky top-0 z-30 space-y-2 pt-1 pb-1 backdrop-blur-md">
        {/* Header Bar */}
        <div className={`p-2.5 sm:p-3 rounded-2xl border transition-all flex items-center justify-between gap-2 shadow-xs ${
          isDarkMode ? 'bg-slate-900/95 border-slate-800 text-slate-100' : 'bg-white/95 border-slate-200 text-slate-900'
        }`}>
          <div className="flex items-center gap-2 min-w-0">
            <div className="p-2 rounded-xl bg-indigo-600 text-white shadow-xs shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm sm:text-base font-extrabold tracking-tight text-slate-900 dark:text-white leading-tight truncate">
                Focus IQ · {activeMonthDisplay}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* Compact Scanner Ready Indicator in Header */}
            <div className="flex items-center gap-1 px-2 py-1 rounded-xl bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 text-[11px] font-bold border border-indigo-200 dark:border-indigo-800/80">
              <Scan className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              <span className="hidden xs:inline">Scanner Ready</span>
            </div>

            {/* Info Toggle Button */}
            <button
              type="button"
              onClick={() => setShowInfo(!showInfo)}
              className={`min-h-[44px] min-w-[44px] flex items-center justify-center p-2 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                showInfo
                  ? 'bg-indigo-100 dark:bg-indigo-900/60 border-indigo-300 dark:border-indigo-700 text-indigo-800 dark:text-indigo-200'
                  : isDarkMode
                  ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300'
                  : 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700'
              }`}
              title="Toggle Info"
            >
              <Info className="w-4 h-4" />
            </button>

            {/* Data Settings Button */}
            <button
              type="button"
              onClick={() => setShowDataSettings(true)}
              className={`min-h-[44px] min-w-[44px] flex items-center justify-center p-2 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                isDarkMode
                  ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
                  : 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-800'
              }`}
              title="Data Settings & Source Info"
            >
              <ShieldCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            </button>
          </div>
        </div>

        {/* Scope Tabs: CORE / NON-CORE */}
        <div className={`p-1.5 rounded-2xl border flex items-center gap-1.5 shadow-xs ${
          isDarkMode ? 'bg-slate-900/95 border-slate-800' : 'bg-white/95 border-slate-200'
        }`}>
          <button
            type="button"
            onClick={() => handleSelectScope('core')}
            className={`flex-1 min-h-[44px] py-2 px-3 rounded-xl font-black text-xs sm:text-sm transition-all flex items-center justify-center gap-2 cursor-pointer ${
              activeScope === 'core'
                ? 'bg-indigo-600 text-white shadow-xs'
                : isDarkMode
                ? 'text-slate-300 hover:bg-slate-800/80'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <ShoppingBag className="w-4 h-4 shrink-0" />
            <span>CORE FOCUS</span>
            {coreMaster && (
              <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-md ${
                activeScope === 'core' ? 'bg-indigo-700 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
              }`}>
                {coreStats.totalProducts}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => handleSelectScope('non_core')}
            className={`flex-1 min-h-[44px] py-2 px-3 rounded-xl font-black text-xs sm:text-sm transition-all flex items-center justify-center gap-2 cursor-pointer ${
              activeScope === 'non_core'
                ? 'bg-teal-600 text-white shadow-xs'
                : isDarkMode
                ? 'text-slate-300 hover:bg-slate-800/80'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Layers className="w-4 h-4 shrink-0" />
            <span>NON-CORE FOCUS</span>
            {nonCoreMaster && (
              <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-md ${
                activeScope === 'non_core' ? 'bg-teal-700 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
              }`}>
                {nonCoreStats.totalProducts}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Info Help Collapsible */}
      {showInfo && (
        <div className={`p-3 rounded-2xl border text-xs space-y-1.5 animate-fade-in ${
          isDarkMode ? 'bg-slate-900 border-slate-800 text-slate-300' : 'bg-indigo-50/70 border-indigo-200 text-slate-700'
        }`}>
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              <Info className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span>About Focus IQ</span>
            </h3>
            <button
              type="button"
              onClick={() => setShowInfo(false)}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="leading-relaxed text-[11px]">
            Focus IQ matches monthly Master SKUs with live Stock IQ inventory via normalized <strong>Bansal CODE</strong>.
            Out of Stock (Closing ≤ 0) and Low Stock (Cover ≤ 7 days) are evaluated live against currently loaded inventory.
          </p>
        </div>
      )}

      {/* Status Bar / Overview Badge */}
      <div className="flex items-center justify-between px-1 flex-wrap gap-2 text-xs">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-bold text-slate-600 dark:text-slate-300">
            {isCore ? 'Core Focus Master' : 'Non-Core Focus Master'}:
          </span>
          <span className="font-mono text-slate-500 dark:text-slate-400">
            {activeStats.totalProducts} SKUs
          </span>
        </div>

        <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${offerStatusSummary.badgeClass}`}>
          {offerStatusSummary.label}
        </span>
      </div>

      {/* ======================================================== */}
      {/* 2. HOME SCREEN ORDER (SELECTED SCOPE) */}
      {/* ======================================================== */}

      {/* A. RESUME PHYSICAL CHECK (Shown when an active check exists) */}
      {activePhysicalCheck && (
        <div className={`p-3 rounded-2xl border transition-all flex items-center justify-between gap-3 shadow-2xs ${
          isDarkMode
            ? 'bg-slate-900 border-indigo-900/60 text-slate-100'
            : 'bg-white border-indigo-200 text-slate-900'
        }`}>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2 py-0.5 text-[10px] font-black rounded-md bg-indigo-50 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/60">
                ACTIVE PHYSICAL CHECK
              </span>
              <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                {activePhysicalCheck.monthDisplay || activeMonthDisplay}
              </span>
            </div>

            <h3 className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white truncate">
              {isCore ? 'Core Focus Floor Check' : 'Non-Core Focus Floor Check'}
            </h3>

            {/* Progress bar */}
            <div className="flex items-center gap-2 text-xs font-mono">
              <div className="w-28 sm:w-36 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden shrink-0">
                <div
                  className="h-full bg-indigo-600 rounded-full transition-all"
                  style={{ width: `${activePhysicalCheck.completionPercentage || 0}%` }}
                />
              </div>
              <span className="text-[11px] text-slate-600 dark:text-slate-300 font-bold">
                {activePhysicalCheck.doneCount || 0}/{activePhysicalCheck.totalCount || 0} ({activePhysicalCheck.completionPercentage || 0}%)
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onOpenPhysicalCheck && onOpenPhysicalCheck(activeScope)}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black shadow-xs transition-all flex items-center gap-1.5 shrink-0 cursor-pointer active:scale-95"
          >
            <span>RESUME</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* B. PRIMARY ACTIONS: 4 Compact, Readable Buttons */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
        {/* 1. Physical Check */}
        <button
          type="button"
          onClick={() => onOpenPhysicalCheck && onOpenPhysicalCheck(activeScope)}
          disabled={!activeMaster}
          className={`min-h-[52px] p-2.5 sm:p-3 rounded-2xl border text-left transition-all cursor-pointer group flex flex-col justify-between ${
            activeMaster
              ? isDarkMode
                ? 'bg-slate-900 border-slate-800 text-slate-100 hover:border-indigo-500'
                : 'bg-white border-slate-200 text-slate-900 hover:border-indigo-400 hover:bg-slate-50/70 shadow-xs'
              : 'opacity-50 cursor-not-allowed bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between w-full">
            <span className="text-[10px] sm:text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Physical Check
            </span>
            <div className="p-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 group-hover:scale-110 transition-transform">
              <ClipboardCheck className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="mt-1">
            <span className="font-black text-xs sm:text-sm text-slate-900 dark:text-white block truncate">
              Physical Check
            </span>
            <span className="text-[10px] text-slate-500 dark:text-slate-400 truncate block">
              Facing & Board
            </span>
          </div>
        </button>

        {/* 2. No / Low Stock */}
        <button
          type="button"
          onClick={() => onOpenFocusIssues(activeScope, 'all')}
          disabled={!activeMaster}
          className={`min-h-[52px] p-2.5 sm:p-3 rounded-2xl border text-left transition-all cursor-pointer group flex flex-col justify-between ${
            activeIssuesTotal > 0
              ? isDarkMode
                ? 'bg-rose-950/30 border-rose-900/60 hover:bg-rose-950/50 hover:border-rose-700'
                : 'bg-rose-50/80 border-rose-200 hover:bg-rose-100/70 hover:border-rose-400 shadow-xs'
              : isDarkMode
              ? 'bg-slate-900 border-slate-800 text-slate-100 hover:border-indigo-500'
              : 'bg-white border-slate-200 text-slate-900 hover:border-indigo-400 hover:bg-slate-50/70 shadow-xs'
          } ${!activeMaster ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <div className="flex items-center justify-between w-full">
            <span className="text-[10px] sm:text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              No / Low Stock
            </span>
            <div className="p-1 rounded-lg bg-rose-100 dark:bg-rose-950/80 text-rose-600 dark:text-rose-400 group-hover:scale-110 transition-transform">
              <AlertCircle className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="mt-1 flex items-baseline justify-between gap-1">
            <span className="font-black text-base sm:text-lg text-rose-600 dark:text-rose-400">
              {activeIssuesTotal}
            </span>
            <span className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
              {activeStats.outOfStockCount} OOS · {activeStats.lowStockCount} Low
            </span>
          </div>
        </button>

        {/* 3. Offer Review */}
        <button
          type="button"
          onClick={() => onOpenOfferMismatch && onOpenOfferMismatch(activeScope, 'all')}
          disabled={!activeMaster}
          title="Includes mismatches, manual checks, unrecognised offers & MRP shifts"
          className={`min-h-[52px] p-2.5 sm:p-3 rounded-2xl border text-left transition-all cursor-pointer group flex flex-col justify-between ${
            uniqueReviewCount > 0
              ? isDarkMode
                ? 'bg-amber-950/30 border-amber-900/60 hover:bg-amber-950/50 hover:border-amber-700'
                : 'bg-amber-50/80 border-amber-200 hover:bg-amber-100/70 hover:border-amber-400 shadow-xs'
              : isDarkMode
              ? 'bg-slate-900 border-slate-800 text-slate-100 hover:border-indigo-500'
              : 'bg-white border-slate-200 text-slate-900 hover:border-indigo-400 hover:bg-slate-50/70 shadow-xs'
          } ${!activeMaster ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <div className="flex items-center justify-between w-full">
            <span className="text-[10px] sm:text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Offer Review
            </span>
            <div className="p-1 rounded-lg bg-amber-100 dark:bg-amber-950/80 text-amber-600 dark:text-amber-400 group-hover:scale-110 transition-transform">
              <Tag className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="mt-1 flex items-baseline justify-between gap-1">
            <span className={`font-black text-base sm:text-lg ${uniqueReviewCount > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-900 dark:text-white'}`}>
              {uniqueReviewCount}
            </span>
            <span className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
              {activeOfferStats.mismatchCount > 0 ? `${activeOfferStats.mismatchCount} Mismatch` : 'Needs Review'}
            </span>
          </div>
        </button>

        {/* 4. Full List */}
        <button
          type="button"
          onClick={() => onOpenFocusList(activeScope, 'all')}
          disabled={!activeMaster}
          className={`min-h-[52px] p-2.5 sm:p-3 rounded-2xl border text-left transition-all cursor-pointer group flex flex-col justify-between ${
            isDarkMode
              ? 'bg-slate-900 border-slate-800 text-slate-100 hover:border-indigo-500'
              : 'bg-white border-slate-200 text-slate-900 hover:border-indigo-400 hover:bg-slate-50/70 shadow-xs'
          } ${!activeMaster ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <div className="flex items-center justify-between w-full">
            <span className="text-[10px] sm:text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Full List
            </span>
            <div className="p-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 group-hover:scale-110 transition-transform">
              {isCore ? <ShoppingBag className="w-3.5 h-3.5" /> : <Layers className="w-3.5 h-3.5" />}
            </div>
          </div>
          <div className="mt-1 flex items-baseline justify-between gap-1">
            <span className="font-black text-base sm:text-lg text-slate-900 dark:text-white">
              {activeStats.totalProducts}
            </span>
            <span className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
              {isCore ? '100% Core' : '100% Non-Core'}
            </span>
          </div>
        </button>
      </div>

      {/* C. COMPACT SUMMARY: Total | Out of Stock | Low Stock | Offer Mismatch */}
      <div className={`p-2 rounded-2xl border grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-center font-mono shadow-xs ${
        isDarkMode ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
      }`}>
        {/* Total */}
        <button
          type="button"
          onClick={() => onOpenFocusList(activeScope, 'all')}
          className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer text-center"
        >
          <span className="text-[10px] sm:text-[11px] font-sans font-bold text-slate-500 dark:text-slate-400 block uppercase tracking-wider">
            Total Focus
          </span>
          <span className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
            {activeStats.totalProducts}
          </span>
        </button>

        {/* Out of Stock */}
        <button
          type="button"
          onClick={() => onOpenFocusIssues(activeScope, 'out_of_stock')}
          className={`p-2 rounded-xl border transition-colors cursor-pointer text-center ${
            activeStats.outOfStockCount > 0
              ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900/60 hover:bg-rose-100 dark:hover:bg-rose-900/40'
              : 'bg-slate-50 dark:bg-slate-800/50 border-slate-100 dark:border-slate-800'
          }`}
        >
          <span className="text-[10px] sm:text-[11px] font-sans font-bold text-rose-600 dark:text-rose-400 block uppercase tracking-wider">
            Out of Stock
          </span>
          <span className="text-base sm:text-lg font-black text-rose-600 dark:text-rose-400">
            {activeStats.outOfStockCount}
          </span>
        </button>

        {/* Low Stock */}
        <button
          type="button"
          onClick={() => onOpenFocusIssues(activeScope, 'low_stock')}
          className={`p-2 rounded-xl border transition-colors cursor-pointer text-center ${
            activeStats.lowStockCount > 0
              ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900/60 hover:bg-amber-100 dark:hover:bg-amber-900/40'
              : 'bg-slate-50 dark:bg-slate-800/50 border-slate-100 dark:border-slate-800'
          }`}
        >
          <span className="text-[10px] sm:text-[11px] font-sans font-bold text-amber-600 dark:text-amber-400 block uppercase tracking-wider">
            Low Stock
          </span>
          <span className="text-base sm:text-lg font-black text-amber-600 dark:text-amber-400">
            {activeStats.lowStockCount}
          </span>
        </button>

        {/* Offer Mismatch */}
        <button
          type="button"
          onClick={() => onOpenOfferMismatch && onOpenOfferMismatch(activeScope, 'mismatch')}
          className={`p-2 rounded-xl border transition-colors cursor-pointer text-center ${
            activeOfferStats.mismatchCount > 0
              ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900/60 hover:bg-rose-100 dark:hover:bg-rose-900/40'
              : 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900/60'
          }`}
        >
          <span className="text-[10px] sm:text-[11px] font-sans font-bold text-slate-500 dark:text-slate-400 block uppercase tracking-wider">
            Offer Mismatch
          </span>
          <span className={`text-base sm:text-lg font-black ${
            activeOfferStats.mismatchCount > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'
          }`}>
            {activeOfferStats.mismatchCount}
          </span>
        </button>
      </div>

      {/* D. NOT MATCHED WARNING (Compact row when > 0, omitted when 0) */}
      {activeStats.notMatchedCount > 0 && (
        <div className={`p-2.5 sm:p-3 rounded-2xl border flex items-center justify-between gap-2.5 text-xs animate-fade-in ${
          isDarkMode
            ? 'bg-rose-950/30 border-rose-900/60 text-rose-200'
            : 'bg-rose-50 border-rose-200 text-rose-800'
        }`}>
          <div className="flex items-center gap-2 min-w-0">
            <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span className="font-semibold truncate">
              <strong>{activeStats.notMatchedCount}</strong> products not matched to Current Stock
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleCopyNotMatched}
              className="min-h-[44px] px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-2xs transition-all flex items-center gap-1 cursor-pointer active:scale-95"
              title="Copy unmatched list for WhatsApp"
            >
              {copiedNotMatched ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span className="hidden xs:inline">{copiedNotMatched ? 'Copied' : 'COPY'}</span>
            </button>

            <button
              type="button"
              onClick={() => onOpenFocusList(activeScope, 'not_matched')}
              className="min-h-[44px] px-3 py-1.5 rounded-xl border border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/50 font-bold text-xs transition-colors cursor-pointer"
            >
              VIEW
            </button>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 5. DATA SETTINGS MODAL / DRAWER */}
      {/* ======================================================== */}
      {showDataSettings && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 animate-fade-in">
          <div className={`p-4 sm:p-5 rounded-2xl max-w-md w-full border shadow-xl space-y-4 relative ${
            isDarkMode ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-800'
          }`}>
            <div className="flex items-center justify-between border-b pb-3 border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-indigo-600 text-white">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-slate-900 dark:text-white">
                    {isCore ? 'Core Focus Data Settings' : 'Non-Core Focus Data Settings'}
                  </h3>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">
                    Active Master File & Live Matching Config
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowDataSettings(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2.5 text-xs">
              {/* File Info */}
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 space-y-1.5">
                <div className="flex justify-between items-center text-[11px]">
                  <span className="text-slate-500 dark:text-slate-400 font-semibold">Active Month:</span>
                  <strong className="font-mono text-indigo-600 dark:text-indigo-400">{activeMonthDisplay}</strong>
                </div>
                <div className="flex justify-between items-center text-[11px]">
                  <span className="text-slate-500 dark:text-slate-400 font-semibold">Master File:</span>
                  <span className="font-mono truncate max-w-[200px]" title={activeMaster?.fileName || 'None'}>
                    {activeMaster?.fileName || 'No file loaded'}
                  </span>
                </div>
                <div className="flex justify-between items-center text-[11px]">
                  <span className="text-slate-500 dark:text-slate-400 font-semibold">Uploaded Date:</span>
                  <span>
                    {activeMaster?.uploadedAt
                      ? new Date(activeMaster.uploadedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
                      : '—'}
                  </span>
                </div>
                <div className="flex justify-between items-center text-[11px]">
                  <span className="text-slate-500 dark:text-slate-400 font-semibold">Total Master SKUs:</span>
                  <span className="font-bold">{activeStats.totalProducts}</span>
                </div>
              </div>

              {/* Live Inventory Linking */}
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 space-y-1 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-slate-500 dark:text-slate-400 font-semibold">Current Stock SKUs:</span>
                  <strong className="font-mono">{stockProducts.length.toLocaleString()} items</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 dark:text-slate-400 font-semibold">Sales Period:</span>
                  <span>{reportDays ? `${reportDays} days report` : 'Active report'}</span>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setShowDataSettings(false);
                  onOpenUploadModal(activeScope);
                }}
                className="w-full min-h-[44px] py-2.5 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition-all flex items-center justify-center gap-1.5 shadow-xs cursor-pointer active:scale-95"
              >
                <Upload className="w-4 h-4" />
                <span>Upload / Replace {isCore ? 'Core' : 'Non-Core'} Master</span>
              </button>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleManualSync}
                  disabled={isSyncing}
                  className={`flex-1 min-h-[44px] py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    isDarkMode
                      ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
                      : 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700'
                  }`}
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                  <span>{isSyncing ? 'Refreshing...' : 'Reload Masters'}</span>
                </button>

                {onOpenAdminSettings && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowDataSettings(false);
                      onOpenAdminSettings();
                    }}
                    className={`flex-1 min-h-[44px] py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      isDarkMode
                        ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
                        : 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700'
                    }`}
                  >
                    <ShieldCheck className="w-3.5 h-3.5 text-indigo-500" />
                    <span>Admin Settings</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
