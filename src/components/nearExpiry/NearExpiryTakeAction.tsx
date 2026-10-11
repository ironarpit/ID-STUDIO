import React, { useState, useMemo } from 'react';
import {
  CheckCircle2,
  Clock,
  AlertCircle,
  Share2,
  Sparkles,
  Calendar,
  Layers,
  ChevronRight,
  Archive,
  RefreshCw,
  Eye,
  Info,
  DollarSign,
  Tag,
  Building,
  Package,
  AlertTriangle,
  X,
  Copy,
  Truck,
  FileText,
  RotateCcw,
  Check,
  Flame,
  HelpCircle
} from 'lucide-react';
import { NearExpiryBatch, NearExpiryItem, NearExpiryActionType } from '../../types';
import {
  formatDateDDMMYYYY,
  evaluateItemStatus,
  formatDisplayDays,
  formatDisplayPct,
  formatPendingDaysText,
  getActionNowLabel,
  getActionGroupKey,
  ActionGroupKey
} from '../../utils/nearExpiryEngine';
import {
  copyTextToClipboard,
  formatNearExpiryListForWhatsApp,
  formatNearExpiryItemForWhatsApp
} from '../../utils/nearExpiryCopy';
import { markActionCompleted } from '../../utils/nearExpiryStorage';

interface NearExpiryTakeActionProps {
  batch: NearExpiryBatch;
  items: NearExpiryItem[];
  onItemsChange: (items: NearExpiryItem[]) => void;
  initialQuickTab?: 'ALL' | 'ACTION_REQUIRED' | 'NEED_ACTION_NOW' | 'WAITING' | 'COMPLETED';
  isDarkMode?: boolean;
}

export const NearExpiryTakeAction: React.FC<NearExpiryTakeActionProps> = ({
  batch,
  items,
  onItemsChange,
  initialQuickTab = 'ACTION_REQUIRED',
  isDarkMode = false
}) => {
  // Main Quick View Tabs: 'NEED_ACTION_NOW' | 'WAITING' | 'COMPLETED' | 'ALL'
  const resolveInitialTab = (tab: string): 'NEED_ACTION_NOW' | 'WAITING' | 'COMPLETED' | 'ALL' => {
    if (tab === 'ACTION_REQUIRED' || tab === 'NEED_ACTION_NOW') return 'NEED_ACTION_NOW';
    if (tab === 'WAITING') return 'WAITING';
    if (tab === 'COMPLETED') return 'COMPLETED';
    return 'ALL';
  };

  const [quickTab, setQuickTab] = useState<'NEED_ACTION_NOW' | 'WAITING' | 'COMPLETED' | 'ALL'>(
    resolveInitialTab(initialQuickTab)
  );

  // Sync quickTab when parent tab switcher deep-links into this view
  React.useEffect(() => {
    if (initialQuickTab) {
      setQuickTab(resolveInitialTab(initialQuickTab));
    }
  }, [initialQuickTab]);

  // Selected Action Card inside NEED ACTION NOW
  const [selectedActionGroup, setSelectedActionGroup] = useState<ActionGroupKey | null>(null);

  // Feedback notifications
  const [copiedNotification, setCopiedNotification] = useState<string | null>(null);

  // Mark Action Done confirmation modal
  const [completingItem, setCompletingItem] = useState<NearExpiryItem | null>(null);
  const [completionNotes, setCompletionNotes] = useState('');
  const [isSubmittingComplete, setIsSubmittingComplete] = useState(false);

  // Full Details inspector modal
  const [inspectingItem, setInspectingItem] = useState<NearExpiryItem | null>(null);

  // Re-evaluate all items dynamically against today's date
  const evaluatedItems = useMemo(() => {
    const now = new Date();
    return (items || []).map((it) => {
      const evalRes = evaluateItemStatus(it, now);
      const isDone = Boolean(it.completedAt || it.status === 'COMPLETED' || it.executionStatus === 'COMPLETED');
      const executionStatus: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' = isDone
        ? 'COMPLETED'
        : (it.executionStatus || 'PENDING');

      return {
        ...it,
        status: isDone ? 'COMPLETED' : evalRes.status,
        executionStatus,
        effectiveActionType: evalRes.effectiveActionType || it.actionType,
        daysUntilAction: evalRes.daysUntilAction,
        actionDueFormatted: evalRes.actionDueFormatted,
        instruction: evalRes.instruction
      };
    });
  }, [items]);

  // Tab counts
  const tabCounts = useMemo(() => {
    const total = evaluatedItems.length;
    const needActionNow = evaluatedItems.filter((it) => it.status === 'ACTION_REQUIRED').length;
    const waiting = evaluatedItems.filter((it) => it.status === 'WAITING').length;
    const completed = evaluatedItems.filter((it) => it.status === 'COMPLETED').length;
    return { total, needActionNow, waiting, completed };
  }, [evaluatedItems]);

  // Action Groups Summary for NEED ACTION NOW
  const actionGroupsSummary = useMemo(() => {
    const actionItems = evaluatedItems.filter((it) => it.status === 'ACTION_REQUIRED');

    const groups: Record<
      ActionGroupKey,
      {
        key: ActionGroupKey;
        label: string;
        badgeLabel: string;
        skuCount: number;
        totalUnits: number;
        totalValue: number;
        accentColor: string;
        activeRing: string;
        bgClass: string;
        borderClass: string;
        icon: React.ReactNode;
      }
    > = {
      DEBIT_TO_VENDOR: {
        key: 'DEBIT_TO_VENDOR',
        label: 'DEBIT TO VENDOR NOW',
        badgeLabel: 'DEBIT TO VENDOR',
        skuCount: 0,
        totalUnits: 0,
        totalValue: 0,
        accentColor: 'text-rose-600 dark:text-rose-400',
        activeRing: 'ring-2 ring-rose-500 border-rose-500 bg-rose-50/90 dark:bg-rose-950/40 shadow-sm',
        bgClass: 'bg-rose-50/40 dark:bg-rose-950/20 hover:bg-rose-50 dark:hover:bg-rose-950/40',
        borderClass: 'border-rose-200 dark:border-rose-900/60',
        icon: <RotateCcw className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
      },
      TRANSFER_TO_DC: {
        key: 'TRANSFER_TO_DC',
        label: 'TRANSFER TO DC NOW',
        badgeLabel: 'TRANSFER TO DC',
        skuCount: 0,
        totalUnits: 0,
        totalValue: 0,
        accentColor: 'text-blue-600 dark:text-blue-400',
        activeRing: 'ring-2 ring-blue-500 border-blue-500 bg-blue-50/90 dark:bg-blue-950/40 shadow-sm',
        bgClass: 'bg-blue-50/40 dark:bg-blue-950/20 hover:bg-blue-50 dark:hover:bg-blue-950/40',
        borderClass: 'border-blue-200 dark:border-blue-900/60',
        icon: <Truck className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
      },
      WRITE_OFF_SEND_TO_DC: {
        key: 'WRITE_OFF_SEND_TO_DC',
        label: 'WRITE OFF + SEND TO DC NOW',
        badgeLabel: 'WRITE OFF + SEND TO DC',
        skuCount: 0,
        totalUnits: 0,
        totalValue: 0,
        accentColor: 'text-amber-600 dark:text-amber-400',
        activeRing: 'ring-2 ring-amber-500 border-amber-500 bg-amber-50/90 dark:bg-amber-950/40 shadow-sm',
        bgClass: 'bg-amber-50/40 dark:bg-amber-950/20 hover:bg-amber-50 dark:hover:bg-amber-950/40',
        borderClass: 'border-amber-200 dark:border-amber-900/60',
        icon: <Flame className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
      },
      ADD_TO_NEAR_EXPIRY: {
        key: 'ADD_TO_NEAR_EXPIRY',
        label: 'ADD TO NEAR EXPIRY / RE-SUBMIT TO HO NOW',
        badgeLabel: 'RE-SUBMIT TO HO',
        skuCount: 0,
        totalUnits: 0,
        totalValue: 0,
        accentColor: 'text-purple-600 dark:text-purple-400',
        activeRing: 'ring-2 ring-purple-500 border-purple-500 bg-purple-50/90 dark:bg-purple-950/40 shadow-sm',
        bgClass: 'bg-purple-50/40 dark:bg-purple-950/20 hover:bg-purple-50 dark:hover:bg-purple-950/40',
        borderClass: 'border-purple-200 dark:border-purple-900/60',
        icon: <RotateCcw className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />
      },
      MANUAL_REVIEW: {
        key: 'MANUAL_REVIEW',
        label: 'MANUAL REVIEW',
        badgeLabel: 'MANUAL REVIEW',
        skuCount: 0,
        totalUnits: 0,
        totalValue: 0,
        accentColor: 'text-slate-700 dark:text-slate-300',
        activeRing: 'ring-2 ring-slate-500 border-slate-500 bg-slate-100 dark:bg-slate-800 shadow-sm',
        bgClass: 'bg-slate-50 dark:bg-slate-800/40 hover:bg-slate-100 dark:hover:bg-slate-800/70',
        borderClass: 'border-slate-200 dark:border-slate-700',
        icon: <HelpCircle className="w-4 h-4 text-slate-600 dark:text-slate-400 shrink-0" />
      }
    };

    actionItems.forEach((it) => {
      const key = getActionGroupKey(it);
      const g = groups[key];
      g.skuCount += 1;
      const qty = Number(it.nearExpiryStock ?? it.hoNearExpiryStock) || 0;
      g.totalUnits += qty;
      const val = Number(it.value ?? it.hoValue) || ((Number(it.cost ?? it.hoCost) || 0) * qty);
      g.totalValue += val;
    });

    return groups;
  }, [evaluatedItems]);

  // Only show cards that have products (Requirement 7)
  const visibleActionCards = useMemo(() => {
    const keys: ActionGroupKey[] = [
      'DEBIT_TO_VENDOR',
      'TRANSFER_TO_DC',
      'WRITE_OFF_SEND_TO_DC',
      'ADD_TO_NEAR_EXPIRY',
      'MANUAL_REVIEW'
    ];
    return keys
      .map((k) => actionGroupsSummary[k])
      .filter((g) => g.skuCount > 0);
  }, [actionGroupsSummary]);

  // Filtered Items respecting:
  // 1. quickTab (NEED_ACTION_NOW vs WAITING vs COMPLETED vs ALL)
  // 2. selectedActionGroup (when in NEED_ACTION_NOW and user clicks an action card)
  const filteredItems = useMemo(() => {
    return evaluatedItems.filter((it) => {
      // 1. Quick Tab Filter
      if (quickTab === 'NEED_ACTION_NOW') {
        if (it.status !== 'ACTION_REQUIRED') return false;
        // Inside NEED_ACTION_NOW: Action Card filter
        if (selectedActionGroup) {
          const itemGroup = getActionGroupKey(it);
          if (itemGroup !== selectedActionGroup) return false;
        }
      } else if (quickTab === 'WAITING') {
        if (it.status !== 'WAITING') return false;
      } else if (quickTab === 'COMPLETED') {
        if (it.status !== 'COMPLETED') return false;
      }

      return true;
    });
  }, [evaluatedItems, quickTab, selectedActionGroup]);

  // Copy Complete Action List for WhatsApp
  const handleCopyFilteredList = async (customTitle?: string) => {
    let title = customTitle;
    if (!title) {
      if (quickTab === 'NEED_ACTION_NOW') {
        if (selectedActionGroup) {
          title = actionGroupsSummary[selectedActionGroup].badgeLabel;
        } else {
          title = 'NEED ACTION NOW';
        }
      } else if (quickTab === 'WAITING') {
        title = 'WAITING';
      } else if (quickTab === 'COMPLETED') {
        title = 'COMPLETED';
      } else {
        title = 'ALL PRODUCTS';
      }
    }

    const text = formatNearExpiryListForWhatsApp(title, filteredItems, batch.storeName);
    const ok = await copyTextToClipboard(text);
    if (ok) {
      setCopiedNotification(`Copied ${filteredItems.length} products for WhatsApp!`);
      setTimeout(() => setCopiedNotification(null), 3000);
    }
  };

  // Handle WhatsApp Copy for Individual Item (Requirement 5)
  const handleCopySingleItem = async (item: NearExpiryItem) => {
    const text = formatNearExpiryItemForWhatsApp(item);
    const ok = await copyTextToClipboard(text);
    if (ok) {
      setCopiedNotification(`Copied details for ${item.itemName || item.hoItemName || 'product'}!`);
      setTimeout(() => setCopiedNotification(null), 2500);
    }
  };

  // Confirm Mark Action Done (Requirement 9)
  const handleConfirmComplete = async () => {
    if (!completingItem) return;
    setIsSubmittingComplete(true);

    try {
      const updated = await markActionCompleted(completingItem, completionNotes);
      // Update local state and trigger parent persistence
      const updatedList = items.map((it) => (it.id === updated.id ? updated : it));
      onItemsChange(updatedList);
      setCompletingItem(null);
      setCompletionNotes('');
      setCopiedNotification(`Marked "${updated.itemName || updated.hoItemName}" as COMPLETED!`);
      setTimeout(() => setCopiedNotification(null), 3000);
    } catch (err) {
      console.error('Failed to complete action:', err);
      alert('Error updating action status.');
    } finally {
      setIsSubmittingComplete(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* 1. Header with Section Tabs and COPY LIST */}
      <div
        className={`p-3 sm:p-4 rounded-xl border ${
          isDarkMode
            ? 'bg-slate-900 border-slate-800 text-slate-100'
            : 'bg-white border-slate-200 text-slate-900'
        } shadow-xs`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 mb-3">
          <div>
            <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
              <span>Take Action</span>
              <span className="text-xs font-normal text-slate-500">
                • {batch.name}
              </span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Execute verified HO instructions on the floor with dedicated action groups.
            </p>
          </div>

          {/* Quick Copy Action for Filtered List */}
          <button
            type="button"
            onClick={() => handleCopyFilteredList()}
            disabled={filteredItems.length === 0}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-xs font-black flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed self-stretch sm:self-auto"
          >
            <Share2 className="w-4 h-4" />
            <span>COPY LIST FOR WHATSAPP ({filteredItems.length})</span>
          </button>
        </div>

        {/* Main Tabs: ACTION NOW | WAITING | COMPLETED | ALL */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl border border-slate-200/80 dark:border-slate-800 text-xs">
          {/* 1. NEED ACTION NOW */}
          <button
            type="button"
            onClick={() => {
              setQuickTab('NEED_ACTION_NOW');
              setSelectedActionGroup(null);
            }}
            className={`min-h-[38px] px-2.5 py-1.5 rounded-lg font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              quickTab === 'NEED_ACTION_NOW'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'text-slate-700 dark:text-slate-300 hover:bg-white/60 dark:hover:bg-slate-700/60'
            }`}
          >
            <span>ACTION NOW</span>
            <span
              className={`px-1.5 py-0.2 text-[10px] font-extrabold rounded-md ${
                quickTab === 'NEED_ACTION_NOW'
                  ? 'bg-white text-rose-700'
                  : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
              }`}
            >
              {tabCounts.needActionNow}
            </span>
          </button>

          {/* 2. WAITING */}
          <button
            type="button"
            onClick={() => {
              setQuickTab('WAITING');
              setSelectedActionGroup(null);
            }}
            className={`min-h-[38px] px-2.5 py-1.5 rounded-lg font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              quickTab === 'WAITING'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'text-slate-700 dark:text-slate-300 hover:bg-white/60 dark:hover:bg-slate-700/60'
            }`}
          >
            <span>WAITING</span>
            <span
              className={`px-1.5 py-0.2 text-[10px] font-extrabold rounded-md ${
                quickTab === 'WAITING'
                  ? 'bg-white text-amber-700'
                  : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
              }`}
            >
              {tabCounts.waiting}
            </span>
          </button>

          {/* 3. COMPLETED */}
          <button
            type="button"
            onClick={() => {
              setQuickTab('COMPLETED');
              setSelectedActionGroup(null);
            }}
            className={`min-h-[38px] px-2.5 py-1.5 rounded-lg font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              quickTab === 'COMPLETED'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-700 dark:text-slate-300 hover:bg-white/60 dark:hover:bg-slate-700/60'
            }`}
          >
            <span>COMPLETED</span>
            <span
              className={`px-1.5 py-0.2 text-[10px] font-extrabold rounded-md ${
                quickTab === 'COMPLETED'
                  ? 'bg-white text-emerald-700'
                  : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
              }`}
            >
              {tabCounts.completed}
            </span>
          </button>

          {/* 4. ALL */}
          <button
            type="button"
            onClick={() => {
              setQuickTab('ALL');
              setSelectedActionGroup(null);
            }}
            className={`min-h-[38px] px-2.5 py-1.5 rounded-lg font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              quickTab === 'ALL'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-700 dark:text-slate-300 hover:bg-white/60 dark:hover:bg-slate-700/60'
            }`}
          >
            <span>ALL</span>
            <span
              className={`px-1.5 py-0.2 text-[10px] font-extrabold rounded-md ${
                quickTab === 'ALL'
                  ? 'bg-white text-indigo-700'
                  : 'bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-300'
              }`}
            >
              {tabCounts.total}
            </span>
          </button>
        </div>

        {/* Copy Notification Toast */}
        {copiedNotification && (
          <div className="mt-2.5 p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-xs font-semibold text-emerald-800 dark:text-emerald-300 flex items-center gap-2 animate-in fade-in duration-200">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{copiedNotification}</span>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 2. DEDICATED ACTION CARDS (Inside NEED ACTION NOW) (Requirements 1, 3, 7) */}
      {/* ========================================================================= */}
      {quickTab === 'NEED_ACTION_NOW' && (
        <div className="space-y-2.5">
          {visibleActionCards.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {visibleActionCards.map((card) => {
                const isSelected = selectedActionGroup === card.key;
                const valueFormatted = `₹${card.totalValue.toLocaleString('en-IN', {
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 2
                })}`;

                return (
                  <div
                    key={card.key}
                    onClick={() => {
                      // Toggle action group filter
                      setSelectedActionGroup((prev) => (prev === card.key ? null : card.key));
                    }}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer relative ${
                      isSelected
                        ? card.activeRing
                        : `${card.bgClass} ${card.borderClass}`
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-white/80 dark:bg-slate-800/80 shadow-2xs">
                          {card.icon}
                        </div>
                        <h4 className="text-xs sm:text-sm font-black text-slate-900 dark:text-white tracking-tight">
                          {card.label}
                        </h4>
                      </div>

                      {isSelected ? (
                        <span className="px-2 py-0.5 text-[9px] font-black rounded-full bg-slate-900 text-white dark:bg-white dark:text-slate-900 flex items-center gap-1 shrink-0">
                          <Check className="w-2.5 h-2.5" />
                          ACTIVE
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 shrink-0">
                          Filter ▾
                        </span>
                      )}
                    </div>

                    {/* Summary Metrics: SKU count | total units | total value */}
                    <div className="mt-2.5 pt-2 border-t border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-slate-900 dark:text-white font-extrabold">
                          {card.skuCount} {card.skuCount === 1 ? 'SKU' : 'SKUs'}
                        </span>
                        <span>•</span>
                        <span>{card.totalUnits} Units</span>
                        <span>•</span>
                        <span className="font-extrabold text-slate-900 dark:text-white">
                          {valueFormatted}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div
              className={`p-4 text-center rounded-xl border text-xs ${
                isDarkMode ? 'bg-slate-900 border-slate-800 text-slate-400' : 'bg-white border-slate-200 text-slate-600'
              }`}
            >
              <CheckCircle2 className="w-6 h-6 text-emerald-600 mx-auto mb-1" />
              <p className="font-bold text-slate-800 dark:text-slate-200">
                All immediate actions are completed!
              </p>
              <p className="text-slate-500 mt-0.5">
                Check the WAITING tab for deferred items or COMPLETED for verified items.
              </p>
            </div>
          )}

          {/* Active Action Group Header */}
          {selectedActionGroup && (
            <div className="p-3.5 sm:p-4 rounded-xl border bg-white dark:bg-slate-900 border-indigo-200 dark:border-indigo-800 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-white uppercase tracking-tight">
                    {actionGroupsSummary[selectedActionGroup].label}
                  </h3>
                  <span className="px-2 py-0.5 text-[10px] font-black rounded-md bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">
                    {filteredItems.length} {filteredItems.length === 1 ? 'Product' : 'Products'}
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Total Quantity:{' '}
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    {filteredItems.reduce((s, it) => s + (Number(it.nearExpiryStock ?? it.hoNearExpiryStock) || 0), 0)} units
                  </span>
                </p>
              </div>

              <div className="flex items-center gap-2 self-stretch sm:self-auto">
                <button
                  type="button"
                  onClick={() => handleCopyFilteredList(actionGroupsSummary[selectedActionGroup].badgeLabel)}
                  className="flex-1 sm:flex-none min-h-[42px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-xs font-black flex items-center justify-center gap-2 shadow-xs cursor-pointer transition-all"
                >
                  <Share2 className="w-4 h-4" />
                  <span>COPY LIST FOR WHATSAPP</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedActionGroup(null)}
                  className="min-h-[42px] px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold cursor-pointer transition-all shrink-0"
                >
                  Show All Action Items
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. WAITING TAB INFORMATIONAL BANNER (Requirement 6) */}
      {/* ========================================================================= */}
      {quickTab === 'WAITING' && (
        <div className="p-3.5 rounded-xl border bg-amber-50/70 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/60 flex items-start gap-2.5 text-xs text-amber-900 dark:text-amber-200">
          <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <h4 className="font-black text-amber-900 dark:text-amber-100">
              WAITING (CONTINUE SALE ON FLOOR)
            </h4>
            <p className="text-amber-800 dark:text-amber-300 leading-relaxed">
              These products have deferred instructions (e.g. <em>SALE TILL EXPIRY AFTER THAT TRANSFER TO DC</em> or <em>SALE TILL 15 DAYS REMAINS</em>). Keep selling on floor. Once their threshold date arrives, they will automatically move to <strong>NEED ACTION NOW</strong>.
            </p>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. COMPLETED TAB INFORMATIONAL BANNER */}
      {/* ========================================================================= */}
      {quickTab === 'COMPLETED' && (
        <div className="p-3 rounded-xl border bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/60 flex items-center justify-between gap-2 text-xs text-emerald-900 dark:text-emerald-200">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span className="font-bold">
              Completed Actions ({tabCounts.completed} verified products with execution timestamps)
            </span>
          </div>
          <button
            type="button"
            onClick={() => handleCopyFilteredList('COMPLETED ACTIONS')}
            className="min-h-[36px] px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>COPY COMPLETED LIST</span>
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. PRODUCT CARDS LIST */}
      {/* ========================================================================= */}
      {filteredItems.length === 0 ? (
        <div
          className={`p-8 text-center rounded-xl border ${
            isDarkMode
              ? 'bg-slate-900 border-slate-800 text-slate-400'
              : 'bg-white border-slate-200 text-slate-500'
          }`}
        >
          <AlertCircle className="w-8 h-8 mx-auto text-slate-400 mb-2" />
          <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
            No products found in this section
          </p>
          <p className="text-xs mt-1 text-slate-500">
            {selectedActionGroup
              ? 'All items in this action group have been completed or moved.'
              : 'No items currently require action in this tab.'}
          </p>
          {selectedActionGroup && (
            <button
              type="button"
              onClick={() => setSelectedActionGroup(null)}
              className="mt-3 px-3.5 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 text-xs font-bold border border-indigo-200 dark:border-indigo-800 cursor-pointer"
            >
              Show All Action Items
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2.5">
          {filteredItems.map((it) => {
            const isCompleted = Boolean(it.completedAt || it.status === 'COMPLETED' || it.executionStatus === 'COMPLETED');
            const isWaiting = it.status === 'WAITING';
            const pendingDays = it.pendingDays ?? it.hoPendingShelfLifeDays;
            const stockQty = it.nearExpiryStock ?? it.hoNearExpiryStock ?? 0;
            const itemVal = it.value ?? it.hoValue ?? ((it.cost || it.hoCost || 0) * stockQty);
            const whatToDoNow = getActionNowLabel(it);
            const rawRemark = (it.hoRemark || '').trim();

            return (
              <div
                key={it.id}
                className={`p-3 sm:p-3.5 rounded-xl border transition-all ${
                  isDarkMode
                    ? 'bg-slate-900 border-slate-800'
                    : 'bg-white border-slate-200'
                } shadow-xs hover:border-indigo-300 dark:hover:border-indigo-700`}
              >
                {/* 1. Header: Required Action & Status Badge */}
                <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-[9.5px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 shrink-0">
                      {isWaiting ? 'DUE ACTION:' : 'ACTION:'}
                    </span>
                    <span className="text-xs font-black text-slate-900 dark:text-white truncate">
                      {whatToDoNow}
                    </span>
                    {isWaiting && it.actionDueFormatted && (
                      <span className="text-[10px] text-amber-700 dark:text-amber-400 font-bold shrink-0 hidden sm:inline">
                        (Due: {it.actionDueFormatted})
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <span
                      className={`px-2 py-0.5 text-[9.5px] font-bold rounded-md uppercase border ${
                        isCompleted
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800'
                          : isWaiting
                          ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800'
                          : 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-800'
                      }`}
                    >
                      {isCompleted ? 'COMPLETED' : isWaiting ? 'WAITING' : 'PENDING'}
                    </span>
                  </div>
                </div>

                {/* 2. Product Information: Item Name, Code, Expiry, Qty, Value */}
                <div className="mt-2 flex items-start justify-between gap-2.5">
                  <div className="min-w-0 flex-1">
                    <h3
                      onClick={() => setInspectingItem(it)}
                      className="text-xs sm:text-sm font-black text-slate-900 dark:text-white leading-tight cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400"
                    >
                      {it.itemName || it.hoItemName}
                    </h3>
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 mt-1 text-[11px] text-slate-600 dark:text-slate-400">
                      <span>
                        Code: <strong className="font-mono text-slate-900 dark:text-slate-200 font-bold">{it.bansalCode || it.hoBansalCode || 'N/A'}</strong>
                      </span>
                      <span>•</span>
                      <span>
                        Expiry: <strong>{formatDateDDMMYYYY(it.expiryDate || it.hoExpiryDate)}</strong>
                      </span>
                      {pendingDays !== undefined && (
                        <>
                          <span>•</span>
                          <span className="font-semibold text-slate-700 dark:text-slate-300">
                            {formatPendingDaysText(Number(pendingDays), it.expiryDate || it.hoExpiryDate)}
                          </span>
                        </>
                      )}
                      {rawRemark && (
                        <>
                          <span>•</span>
                          <span className="text-slate-500 italic truncate max-w-[220px]" title={rawRemark}>
                            HO: {rawRemark}
                          </span>
                        </>
                      )}
                      {it.floorRemovalStatus === 'REMOVED' ? (
                        <span className="px-1.5 py-0.2 rounded-sm text-[9px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                          Floor: Removed
                        </span>
                      ) : it.floorRemovalSentAt ? (
                        <span className="px-1.5 py-0.2 rounded-sm text-[9px] font-bold bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                          Floor: Sent
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="px-2 py-0.5 text-xs font-black rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 inline-block font-mono">
                      Qty: {stockQty}
                    </span>
                    <div className="text-xs font-bold text-slate-800 dark:text-slate-200 mt-0.5 font-mono">
                      ₹{Number(itemVal || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                    </div>
                  </div>
                </div>

                {/* 3. Action Controls: Secondary (Copy, Details) & Dominant Primary (Mark Action Done only for Action Required) */}
                <div className="flex items-center justify-between flex-wrap gap-2 mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleCopySingleItem(it)}
                      className="min-h-[36px] px-2.5 py-1 rounded-lg text-emerald-800 hover:bg-emerald-100 dark:text-emerald-300 dark:hover:bg-emerald-950/60 font-bold flex items-center gap-1 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 transition-colors cursor-pointer text-xs"
                      title="Copy item details for WhatsApp"
                    >
                      <Share2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>COPY FOR WHATSAPP</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setInspectingItem(it)}
                      className="min-h-[36px] px-2 text-slate-600 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 font-bold flex items-center gap-1 cursor-pointer text-xs"
                      title="View all columns and batch details"
                    >
                      <Eye className="w-3.5 h-3.5 text-indigo-500" />
                      <span>VIEW FULL DETAILS</span>
                    </button>
                  </div>

                  {isCompleted ? (
                    <div className="flex items-center gap-1 text-xs font-bold text-emerald-700 dark:text-emerald-400">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>
                        Done {it.completedAt ? `(${new Date(it.completedAt).toLocaleDateString('en-IN')})` : ''}
                      </span>
                    </div>
                  ) : isWaiting ? (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 text-xs font-bold">
                      <Clock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                      <span>
                        WAITING · {it.actionDueFormatted ? `Action Due: ${it.actionDueFormatted}` : 'Continue Sale on Floor'}
                      </span>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setCompletingItem(it);
                        setCompletionNotes('');
                      }}
                      className="min-h-[36px] px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>MARK ACTION DONE</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 7. MARK ACTION DONE CONFIRMATION MODAL (Requirement 9) */}
      {/* ========================================================================= */}
      {completingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-900/60 backdrop-blur-xs">
          <div
            className={`w-full max-w-md p-4 sm:p-5 rounded-2xl border shadow-xl ${
              isDarkMode
                ? 'bg-slate-900 border-slate-800 text-white'
                : 'bg-white border-slate-200 text-slate-900'
            }`}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <span>Confirm Action Completion</span>
              </h3>
              <button
                type="button"
                onClick={() => setCompletingItem(null)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="mt-3.5 space-y-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                <div className="font-bold text-slate-900 dark:text-white text-sm">
                  {completingItem.itemName || completingItem.hoItemName}
                </div>
                <div className="text-slate-500 mt-1 flex items-center gap-3">
                  <span>
                    Bansal Code:{' '}
                    <strong className="text-slate-800 dark:text-slate-200 font-mono">
                      {completingItem.bansalCode || completingItem.hoBansalCode}
                    </strong>
                  </span>
                  <span>
                    Qty:{' '}
                    <strong className="text-indigo-600 dark:text-indigo-400">
                      {completingItem.nearExpiryStock ?? completingItem.hoNearExpiryStock}
                    </strong>
                  </span>
                </div>
                <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300">
                  <span className="text-[10px] uppercase font-bold text-slate-500 block">HO Remark:</span>
                  <span className="font-semibold">{completingItem.hoRemark}</span>
                </div>
                <div className="mt-1 text-indigo-700 dark:text-indigo-300 font-extrabold">
                  Required Action: {getActionNowLabel(completingItem)}
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase mb-1">
                  Floor Notes / Reference / Challan No (Optional):
                </label>
                <input
                  type="text"
                  value={completionNotes}
                  onChange={(e) => setCompletionNotes(e.target.value)}
                  placeholder="e.g. DC Challan #8821 / Debit Note #4412 / Handed to Vendor"
                  className={`w-full min-h-[44px] px-3 py-2 rounded-xl border text-xs ${
                    isDarkMode
                      ? 'bg-slate-800 border-slate-700 text-white'
                      : 'bg-white border-slate-300 text-slate-900'
                  } focus:outline-hidden focus:border-indigo-500`}
                />
              </div>
            </div>

            <div className="flex items-center gap-2 mt-5 pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={handleConfirmComplete}
                disabled={isSubmittingComplete}
                className="flex-1 min-h-[44px] py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isSubmittingComplete ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                <span>CONFIRM &amp; MARK DONE</span>
              </button>

              <button
                type="button"
                onClick={() => setCompletingItem(null)}
                className="min-h-[44px] px-4 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 8. ALL PRODUCT DETAILS INSPECTOR MODAL */}
      {/* ========================================================================= */}
      {inspectingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div
            className={`w-full max-w-2xl my-6 p-4 sm:p-6 rounded-2xl border shadow-2xl max-h-[90vh] flex flex-col ${
              isDarkMode
                ? 'bg-slate-900 border-slate-800 text-white'
                : 'bg-white border-slate-200 text-slate-900'
            }`}
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between pb-3 border-b border-slate-200 dark:border-slate-800 shrink-0">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                  Near Expiry Product Inspector
                </span>
                <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white leading-tight mt-0.5">
                  {inspectingItem.itemName || inspectingItem.hoItemName}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setInspectingItem(null)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body - 4 Complete HO Sections */}
            <div className="mt-4 space-y-4 overflow-y-auto flex-1 pr-1 text-xs">
              {/* SECTION 1: IDENTIFICATION */}
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                <h4 className="text-[11px] font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-2.5 flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5 text-indigo-500" />
                  <span>IDENTIFICATION</span>
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase block">SR No.</span>
                    <span className="font-bold">{inspectingItem.hoSrNo || '-'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase block">Store Name</span>
                    <span className="font-bold">{inspectingItem.hoStoreName || batch.storeName || '-'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase block">EAN / Barcode</span>
                    <span className="font-mono font-semibold">{inspectingItem.barcode || inspectingItem.hoEanCode || '-'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase block">Bansal Code</span>
                    <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                      {inspectingItem.bansalCode || inspectingItem.hoBansalCode || '-'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase block">Main Code</span>
                    <span className="font-bold">{inspectingItem.mainCode || inspectingItem.hoMainCode || '-'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase block">Category</span>
                    <span className="font-bold">{inspectingItem.category || inspectingItem.hoCategory || '-'}</span>
                  </div>
                  <div className="col-span-2 sm:col-span-3">
                    <span className="text-[10px] text-slate-500 uppercase block">Item Name</span>
                    <span className="font-bold text-slate-900 dark:text-white">
                      {inspectingItem.itemName || inspectingItem.hoItemName || '-'}
                    </span>
                  </div>
                </div>
              </div>

              {/* SECTION 2: COMMERCIAL */}
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                <h4 className="text-[11px] font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-2.5 flex items-center gap-1.5">
                  <DollarSign className="w-3.5 h-3.5 text-emerald-500" />
                  <span>COMMERCIAL</span>
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase block">Purchase Name</span>
                    <span className="font-semibold">{inspectingItem.hoPurchaseName || '-'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase block">Debit Status</span>
                    <span className="font-bold">
                      {inspectingItem.debitStatus || inspectingItem.hoDebitStatus || inspectingItem.hoNonDebitDebit || '-'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase block">MRP</span>
                    <span className="font-bold">
                      {inspectingItem.mrp || inspectingItem.hoMrp ? `₹${Number(inspectingItem.mrp || inspectingItem.hoMrp).toFixed(2)}` : '₹___'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase block">Cost</span>
                    <span className="font-bold">
                      {inspectingItem.cost || inspectingItem.hoCost ? `₹${Number(inspectingItem.cost || inspectingItem.hoCost).toFixed(2)}` : '-'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase block">Value</span>
                    <span className="font-extrabold text-emerald-600 dark:text-emerald-400">
                      ₹{Number(inspectingItem.value ?? inspectingItem.hoValue ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase block">Supplier</span>
                    <span className="font-semibold">{inspectingItem.supplier || inspectingItem.hoSupplier || '-'}</span>
                  </div>
                </div>
              </div>

              {/* SECTION 3: NEAR EXPIRY METRICS */}
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                <h4 className="text-[11px] font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-2.5 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-amber-500" />
                  <span>NEAR EXPIRY METRICS</span>
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase block">Near Expiry Stock</span>
                    <span className="font-extrabold text-indigo-600 dark:text-indigo-400">
                      {inspectingItem.nearExpiryStock ?? inspectingItem.hoNearExpiryStock ?? 0}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase block">MTD Sale</span>
                    <span className="font-bold">{inspectingItem.mtdSale ?? inspectingItem.hoMtdSale ?? 0}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase block">MFG Date</span>
                    <span className="font-bold">{formatDateDDMMYYYY(inspectingItem.mfgDate || inspectingItem.hoMfgDate)}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase block">Expiry Date</span>
                    <span className="font-bold text-rose-600 dark:text-rose-400">
                      {formatDateDDMMYYYY(inspectingItem.expiryDate || inspectingItem.hoExpiryDate)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase block">Live Reference Date</span>
                    <span className="font-semibold">{formatDateDDMMYYYY(new Date())}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase block">Total Days</span>
                    <span className="font-bold">{formatDisplayDays(inspectingItem.totalDays ?? inspectingItem.hoTotalDays)}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase block">Pending Shelf Life</span>
                    <span className="font-bold text-amber-700 dark:text-amber-400">
                      {formatPendingDaysText(inspectingItem.pendingDays, inspectingItem.expiryDate || inspectingItem.hoExpiryDate)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase block">Pending %</span>
                    <span className="font-bold">
                      {formatDisplayPct(inspectingItem.pendingPct ?? inspectingItem.hoPendingShelfLifePct ?? inspectingItem.hoPendingShelfLifePercent)}
                    </span>
                  </div>
                </div>
              </div>

              {/* SECTION 4: HO RESPONSE & EXECUTION */}
              <div className="p-3.5 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/60">
                <h4 className="text-[11px] font-extrabold uppercase tracking-wider text-indigo-900 dark:text-indigo-200 mb-2.5 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600" />
                  <span>HO RESPONSE &amp; EXECUTION STATUS</span>
                </h4>
                <div className="space-y-2">
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase block font-bold">Exact Original HO Remark</span>
                    <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-indigo-100 dark:border-indigo-900 font-bold text-slate-900 dark:text-white mt-0.5">
                      {inspectingItem.hoRemark || 'Awaiting response'}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-1">
                    <div>
                      <span className="text-[10px] text-slate-500 uppercase block">Required Action</span>
                      <span className="font-bold text-indigo-700 dark:text-indigo-300">
                        {getActionNowLabel(inspectingItem)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 uppercase block">Action Due Date</span>
                      <span className="font-bold">
                        {inspectingItem.actionDueFormatted || formatDateDDMMYYYY(inspectingItem.actionDueDate) || 'Immediate'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 uppercase block">Execution Status</span>
                      <span
                        className={`inline-block px-2 py-0.5 text-[10px] font-extrabold rounded-md uppercase border mt-0.5 ${
                          inspectingItem.completedAt || inspectingItem.status === 'COMPLETED'
                            ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300'
                            : 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-300'
                        }`}
                      >
                        {inspectingItem.completedAt || inspectingItem.status === 'COMPLETED' ? 'COMPLETED' : 'PENDING'}
                      </span>
                    </div>
                  </div>

                  {inspectingItem.completedAt && (
                    <div className="pt-2 border-t border-indigo-200 dark:border-indigo-800 text-[11px]">
                      <span className="text-slate-500">Completed At: </span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">
                        {new Date(inspectingItem.completedAt).toLocaleString('en-IN')}
                      </span>
                      {inspectingItem.notes && (
                        <div className="mt-1 text-slate-700 dark:text-slate-300 italic">
                          Notes: {inspectingItem.notes}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between gap-2 mt-4 pt-3 border-t border-slate-200 dark:border-slate-800 shrink-0">
              <button
                type="button"
                onClick={() => {
                  handleCopySingleItem(inspectingItem);
                }}
                className="min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Share2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>COPY FOR WHATSAPP</span>
              </button>

              <div className="flex items-center gap-2">
                {!(inspectingItem.completedAt || inspectingItem.status === 'COMPLETED') && (
                  <button
                    type="button"
                    onClick={() => {
                      const it = inspectingItem;
                      setInspectingItem(null);
                      setCompletingItem(it);
                      setCompletionNotes('');
                    }}
                    className="min-h-[44px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>MARK ACTION DONE</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setInspectingItem(null)}
                  className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
