import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Layers,
  Copy,
  Check,
  CheckCircle2,
  Clock,
  RotateCcw,
  SlidersHorizontal,
  Search,
  AlertTriangle,
  Send,
  Eye,
  X,
  ArrowRight,
  ShieldAlert,
  ChevronRight
} from 'lucide-react';
import { Product, NearExpiryBatch, NearExpiryItem } from '../../types';
import {
  calculateShelfLife,
  formatDateDDMMYYYY,
  formatDisplayDays,
  formatDisplayPct
} from '../../utils/nearExpiryEngine';
import { normalizeLocalCode, normalizeScannedBarcode } from '../../utils/barcodeResolver';
import {
  markItemsFloorSent,
  markItemsFloorRemoved,
  returnItemToFloor
} from '../../utils/nearExpiryStorage';
import { formatRemoveTodayWhatsApp, copyTextToClipboard } from '../../utils/nearExpiryCopy';
import { NearExpiryDetailsModal } from './NearExpiryDetailsModal';
import { NearExpiryLotSelectorModal } from './NearExpiryLotSelectorModal';

export type FloorQuickView = 'REMOVE_TODAY' | 'SENT' | 'REMOVED' | 'ALL';

interface NearExpiryFloorRemovalProps {
  batch: NearExpiryBatch;
  items: NearExpiryItem[];
  onItemsChange: (items: NearExpiryItem[]) => void;
  stockProducts?: Product[];
  isDarkMode?: boolean;
}

export const NearExpiryFloorRemoval: React.FC<NearExpiryFloorRemovalProps> = ({
  batch,
  items,
  onItemsChange,
  stockProducts = [],
  isDarkMode = false
}) => {
  // Quick View Tab (Default: REMOVE_TODAY)
  const [activeQuickView, setActiveQuickView] = useState<FloorQuickView>('REMOVE_TODAY');

  // Multi-selection state (explicit product selection only!)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Search & Filter Drawer
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [debitStatusFilter, setDebitStatusFilter] = useState('');
  const [urgencyFilter, setUrgencyFilter] = useState<'ALL' | 'EXPIRED' | 'CRITICAL_5' | 'WARNING_15'>('ALL');

  // Modals & Feedback state
  const [detailItem, setDetailItem] = useState<NearExpiryItem | null>(null);
  const [copiedBanner, setCopiedBanner] = useState<string | null>(null);
  const [copiedTodayItems, setCopiedTodayItems] = useState<NearExpiryItem[] | null>(null);
  const [confirmRemovalOpen, setConfirmRemovalOpen] = useState(false);
  const [pendingRemovalIds, setPendingRemovalIds] = useState<string[]>([]);

  // Return to Floor Modal state
  const [returnToFloorItem, setReturnToFloorItem] = useState<NearExpiryItem | null>(null);
  const [returnReason, setReturnReason] = useState('HO instruction: Continue sale');

  // Scanner Feedback & Multiple Lot Disambiguation
  const [scannerFeedback, setScannerFeedback] = useState<{
    type: 'success' | 'warning' | 'error';
    message: string;
  } | null>(null);
  const [highlightedItemId, setHighlightedItemId] = useState<string | null>(null);
  const [multipleLotsData, setMultipleLotsData] = useState<{
    productName: string;
    barcode: string;
    bansalCode: string;
    items: NearExpiryItem[];
  } | null>(null);

  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Reset selection when switching quick views
  const handleSwitchQuickView = (view: FloorQuickView) => {
    setActiveQuickView(view);
    setSelectedIds(new Set());
    setCopiedTodayItems(null);
  };

  // 1. Filter items according to Quick View rules
  const baseViewItems = useMemo(() => {
    return items.filter((it) => {
      const shelf = calculateShelfLife(it.mfgDate || it.hoMfgDate, it.expiryDate || it.hoExpiryDate);
      const isDueToday = shelf.pendingPct <= 5 || shelf.isExpired;
      const isSent = Boolean(it.floorRemovalSentAt || it.floorRemovalStatus === 'SENT');
      const isRemoved = Boolean(it.floorRemovalRemovedAt || it.floorRemovalStatus === 'REMOVED');

      switch (activeQuickView) {
        case 'REMOVE_TODAY':
          // Must have reached <= 5% pending shelf life, or expired
          // AND not already been sent today or previously
          // AND not already been physically removed
          return isDueToday && !isSent && !isRemoved;

        case 'SENT':
          // Marked sent, but not yet physically removed
          return isSent && !isRemoved;

        case 'REMOVED':
          // Physically removed from floor
          return isRemoved;

        case 'ALL':
        default:
          return true;
      }
    });
  }, [items, activeQuickView]);

  // Quick view tab counts
  const quickViewCounts = useMemo(() => {
    let removeTodayCount = 0;
    let sentCount = 0;
    let removedCount = 0;

    for (const it of items) {
      const shelf = calculateShelfLife(it.mfgDate || it.hoMfgDate, it.expiryDate || it.hoExpiryDate);
      const isDueToday = shelf.pendingPct <= 5 || shelf.isExpired;
      const isSent = Boolean(it.floorRemovalSentAt || it.floorRemovalStatus === 'SENT');
      const isRemoved = Boolean(it.floorRemovalRemovedAt || it.floorRemovalStatus === 'REMOVED');

      if (isRemoved) {
        removedCount++;
      } else if (isSent) {
        sentCount++;
      } else if (isDueToday) {
        removeTodayCount++;
      }
    }

    return {
      REMOVE_TODAY: removeTodayCount,
      SENT: sentCount,
      REMOVED: removedCount,
      ALL: items.length
    };
  }, [items]);

  // 2. Apply optional secondary filters from Drawer
  const filteredItems = useMemo(() => {
    return baseViewItems.filter((it) => {
      // Search term
      if (searchTerm.trim()) {
        const query = searchTerm.trim().toLowerCase();
        const norm = normalizeLocalCode(query);
        const normBar = normalizeScannedBarcode(query);
        const code = normalizeLocalCode(it.bansalCode || it.hoBansalCode);
        const barcode = normalizeScannedBarcode(it.barcode || it.hoEanCode);
        const name = (it.itemName || it.hoItemName || '').toLowerCase();

        const matches = (norm && code === norm) || (normBar && barcode === normBar) || name.includes(query);
        if (!matches) return false;
      }

      // Category filter
      if (categoryFilter && (it.category || it.hoCategory) !== categoryFilter) {
        return false;
      }

      // Debit status filter
      if (debitStatusFilter && (it.debitStatus || it.hoDebitStatus) !== debitStatusFilter) {
        return false;
      }

      // Urgency filter
      if (urgencyFilter !== 'ALL') {
        const shelf = calculateShelfLife(it.mfgDate || it.hoMfgDate, it.expiryDate || it.hoExpiryDate);
        if (urgencyFilter === 'EXPIRED' && !shelf.isExpired) return false;
        if (urgencyFilter === 'CRITICAL_5' && (shelf.pendingPct > 5 || shelf.isExpired)) return false;
        if (urgencyFilter === 'WARNING_15' && (shelf.pendingPct > 15 || shelf.pendingPct <= 5)) return false;
      }

      return true;
    });
  }, [baseViewItems, searchTerm, categoryFilter, debitStatusFilter, urgencyFilter]);

  // Unique categories for drawer
  const categories = useMemo(() => {
    const set = new Set<string>();
    items.forEach((it) => {
      const c = it.category || it.hoCategory;
      if (c) set.add(c);
    });
    return Array.from(set).sort();
  }, [items]);

  // Hardware/Camera scanner listener (Requirement 9)
  useEffect(() => {
    const handleNearExpiryScan = (e: CustomEvent<{ barcode: string }>) => {
      const rawCode = e.detail?.barcode;
      if (!rawCode) return;

      const normCode = normalizeLocalCode(rawCode);
      const normBar = normalizeScannedBarcode(rawCode);

      // Find matches in current fortnight batch
      const matches = items.filter((it) => {
        const c = normalizeLocalCode(it.bansalCode || it.hoBansalCode);
        const b = normalizeScannedBarcode(it.barcode || it.hoEanCode);
        return (normBar && b === normBar) || (normCode && c === normCode);
      });

      if (matches.length === 0) {
        // Product not in active Near Expiry batch
        // Check if product exists in general stock
        const existsInStock = stockProducts.some((p) => {
          const c = normalizeLocalCode(p.bansalCode || p.localCode || p.code);
          const b = normalizeScannedBarcode(p.barcode);
          return (normBar && b === normBar) || (normCode && c === normCode);
        });

        if (existsInStock) {
          setScannerFeedback({
            type: 'warning',
            message: 'NOT IN THIS NEAR EXPIRY BATCH'
          });
        } else {
          setScannerFeedback({
            type: 'error',
            message: 'BARCODE NOT FOUND'
          });
        }
        return;
      }

      if (matches.length === 1) {
        const match = matches[0];
        highlightAndScrollToItem(match);
        setDetailItem(match);
        setScannerFeedback({
          type: 'success',
          message: `✓ MATCHED: ${match.itemName || match.hoItemName}`
        });
      } else {
        // Multiple expiry lots exist! (Requirement 9 & Test case G)
        setDetailItem(null);
        setMultipleLotsData({
          productName: matches[0].itemName || matches[0].hoItemName || 'Product',
          barcode: matches[0].barcode || matches[0].hoEanCode || '',
          bansalCode: matches[0].bansalCode || matches[0].hoBansalCode || '',
          items: matches
        });
      }
    };

    window.addEventListener('near-expiry-scan' as any, handleNearExpiryScan);
    return () => {
      window.removeEventListener('near-expiry-scan' as any, handleNearExpiryScan);
    };
  }, [items, stockProducts]);

  // Helper to scroll and highlight item
  const highlightAndScrollToItem = (item: NearExpiryItem) => {
    // Switch to the relevant quick view if necessary
    const isRemoved = Boolean(item.floorRemovalRemovedAt || item.floorRemovalStatus === 'REMOVED');
    const isSent = Boolean(item.floorRemovalSentAt || item.floorRemovalStatus === 'SENT');
    const shelf = calculateShelfLife(item.mfgDate, item.expiryDate);

    if (isRemoved && activeQuickView !== 'REMOVED') {
      setActiveQuickView('REMOVED');
    } else if (isSent && !isRemoved && activeQuickView !== 'SENT') {
      setActiveQuickView('SENT');
    } else if (!isSent && !isRemoved && (shelf.pendingPct <= 5 || shelf.isExpired) && activeQuickView !== 'REMOVE_TODAY') {
      setActiveQuickView('REMOVE_TODAY');
    }

    setHighlightedItemId(item.id);
    setTimeout(() => {
      const row = rowRefs.current[item.id];
      if (row) {
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 150);

    setTimeout(() => {
      setHighlightedItemId((prev) => (prev === item.id ? null : prev));
    }, 3500);
  };

  // Clear scanner feedback banner after 4s
  useEffect(() => {
    if (!scannerFeedback) return;
    const timer = setTimeout(() => setScannerFeedback(null), 4000);
    return () => clearTimeout(timer);
  }, [scannerFeedback]);

  // Selection handlers (Requirement 7: explicit product selection only!)
  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAllVisible = () => {
    if (selectedIds.size === filteredItems.length && filteredItems.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredItems.map((it) => it.id)));
    }
  };

  // Copy Remove Today List (Requirement 8)
  const handleCopyRemoveTodayList = async () => {
    // Exactly the products currently visible in the Remove Today view
    const todayItems = items.filter((it) => {
      const shelf = calculateShelfLife(it.mfgDate || it.hoMfgDate, it.expiryDate || it.hoExpiryDate);
      const isDue = shelf.pendingPct <= 5 || shelf.isExpired;
      const isSent = Boolean(it.floorRemovalSentAt || it.floorRemovalStatus === 'SENT');
      const isRemoved = Boolean(it.floorRemovalRemovedAt || it.floorRemovalStatus === 'REMOVED');
      return isDue && !isSent && !isRemoved;
    });

    if (todayItems.length === 0) {
      setCopiedBanner('No products currently due in Remove Today view.');
      setTimeout(() => setCopiedBanner(null), 2500);
      return;
    }

    const text = formatRemoveTodayWhatsApp(todayItems, batch.storeName || 'PATAN');
    const ok = await copyTextToClipboard(text);

    if (ok) {
      setCopiedTodayItems(todayItems);
      setCopiedBanner(`Copied ${todayItems.length} products in WhatsApp format!`);
      setTimeout(() => setCopiedBanner(null), 4000);
    }
  };

  // Mark Copied Products as Sent (Requirement 8)
  const handleMarkCopiedAsSent = async () => {
    if (!copiedTodayItems || copiedTodayItems.length === 0) return;
    const targetIds = copiedTodayItems.map((it) => it.id);
    const updated = await markItemsFloorSent(items, targetIds);
    onItemsChange(updated);
    setCopiedTodayItems(null);
    setCopiedBanner(`Marked ${targetIds.length} copied products as Sent.`);
    setTimeout(() => setCopiedBanner(null), 3000);
  };

  // Single Item Copy
  const handleCopySingleItem = async (item: NearExpiryItem) => {
    const text = formatRemoveTodayWhatsApp([item], batch.storeName || 'PATAN');
    await copyTextToClipboard(text);
    setCopiedBanner(`Copied ${item.itemName} to clipboard.`);
    setTimeout(() => setCopiedBanner(null), 2500);
  };

  // Single Item Mark Sent
  const handleSingleMarkSent = async (item: NearExpiryItem) => {
    const updated = await markItemsFloorSent(items, [item.id]);
    onItemsChange(updated);
  };

  // Single Item Mark Removed (triggers confirmation prompt)
  const handleSingleMarkRemoved = (item: NearExpiryItem) => {
    setPendingRemovalIds([item.id]);
    setConfirmRemovalOpen(true);
  };

  // Bulk Mark Sent (Requirement 7: operate only on explicitly selected products!)
  const handleBulkMarkSent = async () => {
    if (selectedIds.size === 0) return;
    const targetIds = Array.from(selectedIds) as string[];
    const updated = await markItemsFloorSent(items, targetIds);
    onItemsChange(updated);
    setSelectedIds(new Set());
  };

  // Bulk Mark Removed (triggers confirmation prompt)
  const handleBulkMarkRemovedPrompt = () => {
    if (selectedIds.size === 0) return;
    setPendingRemovalIds(Array.from(selectedIds) as string[]);
    setConfirmRemovalOpen(true);
  };

  // Confirmed execution of removal (Requirement 7: ask confirmation)
  const handleConfirmExecuteRemoval = async () => {
    if (pendingRemovalIds.length === 0) return;
    const updated = await markItemsFloorRemoved(items, pendingRemovalIds);
    onItemsChange(updated);
    setPendingRemovalIds([]);
    setConfirmRemovalOpen(false);
    setSelectedIds(new Set());
  };

  // Return to floor action (Requirements 6 & 12)
  const handleConfirmReturnToFloor = async () => {
    if (!returnToFloorItem) return;
    const updated = await returnItemToFloor(items, returnToFloorItem.id, returnReason);
    onItemsChange(updated);
    setReturnToFloorItem(null);
    setReturnReason('HO instruction: Continue sale');
  };

  const isAllVisibleSelected = filteredItems.length > 0 && selectedIds.size === filteredItems.length;

  return (
    <div className="space-y-3 max-w-5xl mx-auto">
      {/* Feedback Banners (Scanner Feedback / Copied Feedback) */}
      {scannerFeedback && (
        <div
          className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-between shadow-md transition-all ${
            scannerFeedback.type === 'success'
              ? 'bg-emerald-500 text-white border-emerald-600'
              : scannerFeedback.type === 'warning'
              ? 'bg-amber-500 text-slate-900 border-amber-600'
              : 'bg-rose-500 text-white border-rose-600'
          }`}
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span className="tracking-wide uppercase">{scannerFeedback.message}</span>
          </div>
          <button type="button" onClick={() => setScannerFeedback(null)} className="opacity-80 hover:opacity-100">
            ✕
          </button>
        </div>
      )}

      {copiedBanner && (
        <div className="p-2.5 rounded-xl bg-indigo-600 text-white text-xs font-bold flex items-center justify-between shadow-xs">
          <span>{copiedBanner}</span>
          <button type="button" onClick={() => setCopiedBanner(null)} className="text-indigo-200 hover:text-white">
            ✕
          </button>
        </div>
      )}

      {/* 1. Quick View Chips Bar (4 chips only: Remove Today, Sent, Removed, All) */}
      <div
        className={`p-2.5 sm:p-3 rounded-2xl border ${
          isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
        } shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5`}
      >
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Remove Today (DEFAULT) */}
          <button
            type="button"
            onClick={() => handleSwitchQuickView('REMOVE_TODAY')}
            className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
              activeQuickView === 'REMOVE_TODAY'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200'
            }`}
          >
            <span>Remove Today</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                activeQuickView === 'REMOVE_TODAY'
                  ? 'bg-white text-rose-700'
                  : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
              }`}
            >
              {quickViewCounts.REMOVE_TODAY}
            </span>
          </button>

          {/* Sent */}
          <button
            type="button"
            onClick={() => handleSwitchQuickView('SENT')}
            className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
              activeQuickView === 'SENT'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200'
            }`}
          >
            <span>Sent</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                activeQuickView === 'SENT'
                  ? 'bg-white text-blue-700'
                  : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200'
              }`}
            >
              {quickViewCounts.SENT}
            </span>
          </button>

          {/* Removed */}
          <button
            type="button"
            onClick={() => handleSwitchQuickView('REMOVED')}
            className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
              activeQuickView === 'REMOVED'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200'
            }`}
          >
            <span>Removed</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                activeQuickView === 'REMOVED'
                  ? 'bg-white text-emerald-700'
                  : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200'
              }`}
            >
              {quickViewCounts.REMOVED}
            </span>
          </button>

          {/* All */}
          <button
            type="button"
            onClick={() => handleSwitchQuickView('ALL')}
            className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
              activeQuickView === 'ALL'
                ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900 shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200'
            }`}
          >
            <span>All</span>
            <span className="text-[10px] opacity-70">({quickViewCounts.ALL})</span>
          </button>
        </div>

        {/* More Filters Drawer Button */}
        <button
          type="button"
          onClick={() => setIsFilterDrawerOpen(!isFilterDrawerOpen)}
          className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 cursor-pointer ${
            isFilterDrawerOpen || searchTerm || categoryFilter || debitStatusFilter || urgencyFilter !== 'ALL'
              ? 'bg-indigo-50 border-indigo-300 text-indigo-700 dark:bg-indigo-950 dark:border-indigo-800 dark:text-indigo-300'
              : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50'
          }`}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          <span>More Filters</span>
          {(searchTerm || categoryFilter || debitStatusFilter || urgencyFilter !== 'ALL') && (
            <span className="w-2 h-2 rounded-full bg-indigo-600" />
          )}
        </button>
      </div>

      {/* 2. More Filters Drawer (Collapsible) */}
      {isFilterDrawerOpen && (
        <div
          className={`p-3.5 rounded-2xl border ${
            isDarkMode ? 'bg-slate-900/90 border-slate-800' : 'bg-slate-50 border-slate-200'
          } space-y-3`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              Secondary Filters
            </span>
            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                setCategoryFilter('');
                setDebitStatusFilter('');
                setUrgencyFilter('ALL');
              }}
              className="text-xs text-indigo-600 hover:underline cursor-pointer"
            >
              Reset Filters
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 text-xs">
            {/* Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search name / code / barcode..."
                className={`w-full pl-8 pr-2.5 py-1.5 rounded-lg border ${
                  isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                }`}
              />
            </div>

            {/* Category Filter */}
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className={`px-2.5 py-1.5 rounded-lg border ${
                isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
              }`}
            >
              <option value="">All Categories</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>

            {/* Debit Status Filter */}
            <select
              value={debitStatusFilter}
              onChange={(e) => setDebitStatusFilter(e.target.value)}
              className={`px-2.5 py-1.5 rounded-lg border ${
                isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
              }`}
            >
              <option value="">All Types (Debit & Non-Debit)</option>
              <option value="DEBIT">DEBIT</option>
              <option value="NON DEBIT">NON DEBIT</option>
            </select>

            {/* Expiry Urgency */}
            <select
              value={urgencyFilter}
              onChange={(e) => setUrgencyFilter(e.target.value as any)}
              className={`px-2.5 py-1.5 rounded-lg border ${
                isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
              }`}
            >
              <option value="ALL">All Urgencies</option>
              <option value="EXPIRED">Expired Only</option>
              <option value="CRITICAL_5">Critical (≤ 5%)</option>
              <option value="WARNING_15">Warning (5% – 15%)</option>
            </select>
          </div>
        </div>
      )}

      {/* 3. Action Bar: Copy for WhatsApp + Safe Bulk Actions */}
      <div
        className={`p-2.5 sm:p-3 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${
          isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
        } shadow-xs`}
      >
        {/* Left Side: Select all & Copy for WhatsApp */}
        <div className="flex items-center gap-2 flex-wrap">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isAllVisibleSelected}
              onChange={handleSelectAllVisible}
              className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
            />
            <span>Select All ({filteredItems.length})</span>
          </label>

          {/* COPY REMOVE-TODAY LIST button */}
          <button
            type="button"
            onClick={handleCopyRemoveTodayList}
            className="px-3 py-1.5 rounded-xl border border-indigo-300 dark:border-indigo-700 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            title="Copies exactly the products currently visible in Remove Today view"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>Copy Remove-Today List</span>
          </button>

          {/* After copying, provide separate option: MARK COPIED PRODUCTS AS SENT */}
          {copiedTodayItems && copiedTodayItems.length > 0 && (
            <button
              type="button"
              onClick={handleMarkCopiedAsSent}
              className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-2xs animate-pulse"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Mark Copied Products as Sent ({copiedTodayItems.length})</span>
            </button>
          )}
        </div>

        {/* Right Side: Safe Bulk Actions (Requirement 7: operate only on explicitly selected products!) */}
        <div className="flex items-center gap-2 flex-wrap">
          {selectedIds.size === 0 ? (
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Select Products First
            </span>
          ) : (
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-indigo-600">
                {selectedIds.size} Selected:
              </span>

              {activeQuickView !== 'REMOVED' && (
                <>
                  <button
                    type="button"
                    onClick={handleBulkMarkSent}
                    className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Mark Sent</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleBulkMarkRemovedPrompt}
                    className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Mark Removed</span>
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 4. Products List (Simple Floor Removal Product Rows) */}
      <div
        className={`rounded-2xl border overflow-hidden ${
          isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
        } shadow-xs`}
      >
        {filteredItems.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-xs">
            {activeQuickView === 'REMOVE_TODAY'
              ? 'No products currently due for removal. All near expiry items are either above 5% shelf life, already sent, or already removed.'
              : 'No products in this view.'}
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {filteredItems.map((item) => {
              const shelf = calculateShelfLife(item.mfgDate || item.hoMfgDate, item.expiryDate || item.hoExpiryDate);
              const isSelected = selectedIds.has(item.id);
              const isHighlighted = highlightedItemId === item.id;
              const isRemoved = Boolean(item.floorRemovalRemovedAt || item.floorRemovalStatus === 'REMOVED');
              const isSent = Boolean(item.floorRemovalSentAt || item.floorRemovalStatus === 'SENT');

              return (
                <div
                  key={item.id}
                  ref={(el) => (rowRefs.current[item.id] = el)}
                  className={`p-3 sm:px-4 sm:py-3 transition-colors ${
                    isHighlighted
                      ? 'bg-amber-100/80 dark:bg-amber-950/60 ring-2 ring-amber-500'
                      : isSelected
                      ? 'bg-indigo-50/60 dark:bg-indigo-950/30'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    {/* Checkbox */}
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleToggleSelect(item.id)}
                      className="mt-1 w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                    />

                    {/* Product Details Content */}
                    <div className="min-w-0 flex-1 space-y-1">
                      {/* Product Name & Floor Status Badge */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-extrabold text-sm text-slate-900 dark:text-white">
                          {item.itemName || item.hoItemName}
                        </span>

                        {/* Current Floor Status Badge */}
                        {isRemoved ? (
                          <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 text-[10px] font-bold">
                            Removed: {item.floorRemovalRemovedAt ? new Date(item.floorRemovalRemovedAt).toLocaleDateString('en-GB') : 'Yes'}
                          </span>
                        ) : isSent ? (
                          <span className="px-2 py-0.5 rounded-md bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 text-[10px] font-bold">
                            Sent: {item.floorRemovalSentAt ? new Date(item.floorRemovalSentAt).toLocaleDateString('en-GB') : 'Yes'}
                          </span>
                        ) : shelf.pendingPct <= 5 || shelf.isExpired ? (
                          <span className="px-2 py-0.5 rounded-md bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 text-[10px] font-extrabold">
                            Remove Today
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 text-[10px] font-semibold">
                            On Floor
                          </span>
                        )}

                        {item.returnedToFloorAt && (
                          <span className="px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 text-[10px] font-bold">
                            Returned to Floor
                          </span>
                        )}
                      </div>

                      {/* Identifiers & Quantities: Code, Barcode, Qty, Expiry, Days Left, % */}
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                        <span>
                          Code: <strong className="font-mono text-slate-800 dark:text-slate-200">{item.bansalCode || item.hoBansalCode}</strong>
                        </span>
                        <span>•</span>
                        <span>
                          Barcode: <span className="font-mono">{item.barcode || item.hoEanCode || 'N/A'}</span>
                        </span>
                        <span>•</span>
                        <span>
                          Qty: <strong className="text-slate-900 dark:text-white font-bold">{item.nearExpiryStock ?? item.hoNearExpiryStock} units</strong>
                        </span>
                        <span>•</span>
                        <span>
                          Expiry: <strong className="text-slate-900 dark:text-white">{formatDateDDMMYYYY(item.expiryDate || item.hoExpiryDate)}</strong>
                        </span>
                        <span>•</span>
                        <span>
                          Days Left:{' '}
                          <strong
                            className={
                              shelf.isExpired
                                ? 'text-rose-600 dark:text-rose-400'
                                : shelf.pendingDays <= 5
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'text-slate-700 dark:text-slate-300'
                            }
                          >
                            {formatDisplayDays(shelf.pendingDays)}
                          </strong>
                        </span>
                        <span>•</span>
                        <span>
                          Pending:{' '}
                          <strong
                            className={
                              shelf.pendingPct <= 5
                                ? 'text-rose-600 dark:text-rose-400 font-extrabold'
                                : 'text-slate-700 dark:text-slate-300'
                            }
                          >
                            {formatDisplayPct(shelf.pendingPct)}
                          </strong>
                        </span>
                      </div>

                      {/* HO Remark, ONLY IF RECEIVED (Requirement 6) */}
                      {item.hoRemark && (
                        <div className="mt-1 text-xs text-indigo-900 dark:text-indigo-300 bg-indigo-50/70 dark:bg-indigo-950/40 p-1.5 rounded-lg border border-indigo-200 dark:border-indigo-900/60 inline-block">
                          <span className="font-bold text-[10px] uppercase text-indigo-600 dark:text-indigo-400 block">HO Remark:</span>
                          <span className="font-medium">"{item.hoRemark}"</span>
                        </div>
                      )}
                    </div>

                    {/* Relevant Row Actions Only (Requirement 6) */}
                    <div className="flex items-center gap-1.5 shrink-0 self-start mt-0.5">
                      {/* Copy */}
                      <button
                        type="button"
                        onClick={() => handleCopySingleItem(item)}
                        className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 cursor-pointer"
                        title="Copy item details for WhatsApp"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>

                      {/* If NOT Sent & NOT Removed: Mark Sent */}
                      {!isSent && !isRemoved && (
                        <button
                          type="button"
                          onClick={() => handleSingleMarkSent(item)}
                          className="px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-bold cursor-pointer"
                        >
                          Mark Sent
                        </button>
                      )}

                      {/* If Sent & NOT Removed: Mark Removed */}
                      {isSent && !isRemoved && (
                        <button
                          type="button"
                          onClick={() => handleSingleMarkRemoved(item)}
                          className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-bold cursor-pointer"
                        >
                          Mark Removed
                        </button>
                      )}

                      {/* If Already Removed: RETURN TO FLOOR (Requirement 6 & 12) */}
                      {isRemoved && (
                        <button
                          type="button"
                          onClick={() => setReturnToFloorItem(item)}
                          className="px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-xs font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Return to Floor</span>
                        </button>
                      )}

                      {/* View Details */}
                      <button
                        type="button"
                        onClick={() => setDetailItem(item)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                        title="View Full Details"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Confirmation Modal for Physical Removal (Requirement 7) */}
      {confirmRemovalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-xs"
          onClick={() => setConfirmRemovalOpen(false)}
        >
          <div
            className={`w-full max-w-sm p-4 rounded-2xl border ${
              isDarkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900'
            } shadow-xl`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 text-amber-600 mb-2">
              <ShieldAlert className="w-5 h-5" />
              <h3 className="font-bold text-sm">Confirm Physical Removal</h3>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Confirm these <strong>{pendingRemovalIds.length}</strong> products have been physically removed from the sales floor?
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmRemovalOpen(false)}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmExecuteRemoval}
                className="px-4 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs cursor-pointer"
              >
                Confirm Removal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Return to Floor Modal (Requirements 6 & 12) */}
      {returnToFloorItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-xs"
          onClick={() => setReturnToFloorItem(null)}
        >
          <div
            className={`w-full max-w-md p-4 rounded-2xl border ${
              isDarkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900'
            } shadow-xl`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 text-indigo-600 mb-2">
              <RotateCcw className="w-5 h-5" />
              <h3 className="font-bold text-sm">Return Product to Sales Floor?</h3>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 mb-3">
              Returning <strong>{returnToFloorItem.itemName}</strong> (Expiry: {formatDateDDMMYYYY(returnToFloorItem.expiryDate)}) back to the sales floor will clear its physical removal status and keep it in the active batch.
            </p>

            <div className="space-y-1 mb-4">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                Return Reason / Instruction
              </label>
              <input
                type="text"
                value={returnReason}
                onChange={(e) => setReturnReason(e.target.value)}
                placeholder="e.g. HO instruction: Continue sale till 15 days"
                className={`w-full px-3 py-2 rounded-xl border text-xs ${
                  isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                }`}
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setReturnToFloorItem(null)}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmReturnToFloor}
                className="px-4 py-1.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs cursor-pointer"
              >
                Return to Floor
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Multiple Expiry Lots Disambiguation Modal (Requirement 9 & Test case G) */}
      {multipleLotsData && (
        <NearExpiryLotSelectorModal
          isOpen={Boolean(multipleLotsData)}
          onClose={() => setMultipleLotsData(null)}
          productName={multipleLotsData.productName}
          barcode={multipleLotsData.barcode}
          bansalCode={multipleLotsData.bansalCode}
          items={multipleLotsData.items}
          onSelectLot={(selectedLot) => {
            highlightAndScrollToItem(selectedLot);
            setDetailItem(selectedLot);
            setScannerFeedback({
              type: 'success',
              message: `✓ MATCHED LOT: Expiry ${formatDateDDMMYYYY(selectedLot.expiryDate)}`
            });
          }}
          isDarkMode={isDarkMode}
        />
      )}

      {/* Compact Product Details Modal (Requirement 13) */}
      {detailItem && (
        <NearExpiryDetailsModal
          isOpen={Boolean(detailItem)}
          onClose={() => setDetailItem(null)}
          item={detailItem}
          isDarkMode={isDarkMode}
        />
      )}
    </div>
  );
};
