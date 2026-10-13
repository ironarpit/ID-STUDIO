import React, { useState, useMemo } from 'react';
import {
  Download,
  Upload,
  Search,
  Filter,
  Share2,
  Trash2,
  Edit2,
  AlertTriangle,
  Calendar,
  Layers,
  ChevronDown,
  CheckCircle2,
  Clock,
  ArrowUpDown,
  Send,
  Check,
  CheckSquare,
  Square,
  RotateCcw,
  Sparkles,
  Truck,
  Flame,
  Info
} from 'lucide-react';
import { NearExpiryBatch, NearExpiryItem, FloorRemovalStatus } from '../../types';
import { downloadHoNearExpiryExcel } from '../../utils/nearExpiryExcel';
import { formatDateDDMMYYYY, formatDateYYYYMMDD, formatPendingDaysText, calculateShelfLife } from '../../utils/nearExpiryEngine';
import {
  copyTextToClipboard,
  formatNearExpiryListForWhatsApp,
  formatNearExpiryItemForWhatsApp,
  formatFilteredNearExpiryForWhatsApp,
  formatFloorRemovalForWhatsApp
} from '../../utils/nearExpiryCopy';
import { deleteNearExpiryItemDB, saveNearExpiryItemDB } from '../../utils/indexedDB';
import {
  markItemsFloorSent,
  markItemsFloorRemoved,
  undoItemsFloorStatus
} from '../../utils/nearExpiryStorage';
import { matchesMainCodeFilter, normalizeMainCode } from '../../utils/mainCode';

export type FloorRemovalFilterType = 'ALL' | 'PENDING' | 'SENT_TODAY' | 'PREVIOUSLY_SENT' | 'REMOVED';

interface NearExpiryCurrentFortnightProps {
  batch: NearExpiryBatch;
  items: NearExpiryItem[];
  onItemsChange: (items: NearExpiryItem[]) => void;
  onOpenUploadModal: () => void;
  onOpenImportModal?: () => void;
  onNavigateToTakeAction: () => void;
  isDarkMode?: boolean;
}

function formatDisplayDateTime(isoStr?: string): string {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return isoStr;
  const datePart = formatDateDDMMYYYY(d);
  const timePart = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
  return `${datePart}, ${timePart}`;
}

export const NearExpiryCurrentFortnight: React.FC<NearExpiryCurrentFortnightProps> = ({
  batch,
  items,
  onItemsChange,
  onOpenUploadModal,
  onOpenImportModal,
  onNavigateToTakeAction,
  isDarkMode = false
}) => {
  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMainCode, setSelectedMainCode] = useState<string>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedDebitFilter, setSelectedDebitFilter] = useState<string>('ALL');
  const [selectedExpiryFilter, setSelectedExpiryFilter] = useState<string>('ALL');
  const [selectedPctFilter, setSelectedPctFilter] = useState<string>('ALL');
  const [selectedFloorRemovalFilter, setSelectedFloorRemovalFilter] = useState<FloorRemovalFilterType>('ALL');

  // Multi-selection & Copied tracking
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [copiedItemIds, setCopiedItemIds] = useState<string[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [copiedNotification, setCopiedNotification] = useState<string | null>(null);

  // Edit Item Modal State
  const [editingItem, setEditingItem] = useState<NearExpiryItem | null>(null);
  const [editQty, setEditQty] = useState('');
  const [editMfg, setEditMfg] = useState('');
  const [editExp, setEditExp] = useState('');
  const [editDebit, setEditDebit] = useState<'NON DEBIT' | 'DEBIT'>('NON DEBIT');

  const todayDateStr = useMemo(() => formatDateYYYYMMDD(new Date()), []);

  // Bidirectional Linked Main Codes (filtered by selectedCategory if active)
  const availableMainCodes = useMemo(() => {
    const codes = new Set<string>();
    items.forEach((it) => {
      if (selectedCategory !== 'ALL' && it.category?.trim().toLowerCase() !== selectedCategory.trim().toLowerCase()) return;
      if (it.mainCode) {
        codes.add(normalizeMainCode(it.mainCode));
      }
    });
    // Ensure selectedMainCode remains present even if 0 matches
    if (selectedMainCode !== 'ALL' && !codes.has(selectedMainCode)) {
      codes.add(selectedMainCode);
    }
    return Array.from(codes).sort();
  }, [items, selectedCategory, selectedMainCode]);

  // Bidirectional Linked Categories (filtered by selectedMainCode if active)
  const availableCategories = useMemo(() => {
    const cats = new Set<string>();
    items.forEach((it) => {
      const matchMain =
        selectedMainCode === 'ALL' ||
        matchesMainCodeFilter(it.mainCode, selectedMainCode);
      if (matchMain && it.category) {
        cats.add(it.category.trim());
      }
    });
    // Ensure selectedCategory remains present even if 0 matches
    if (selectedCategory !== 'ALL' && !cats.has(selectedCategory)) {
      cats.add(selectedCategory);
    }
    return Array.from(cats).sort();
  }, [items, selectedMainCode, selectedCategory]);

  // Counts for Floor Removal Filter badges
  const floorRemovalCounts = useMemo(() => {
    let pending = 0;
    let sentToday = 0;
    let previouslySent = 0;
    let removed = 0;

    items.forEach((it) => {
      const liveLife = calculateShelfLife(it.mfgDate, it.expiryDate);
      const hasValidCalc = liveLife.totalDays > 0 || (it.pendingPct !== undefined && it.pendingPct !== null && !isNaN(Number(it.pendingPct)));
      const livePct = liveLife.totalDays > 0 ? liveLife.pendingPct : (Number(it.pendingPct) || 0);

      // Pending Removal: pending shelf life % <= 5% AND never marked as sent or removed
      const isPending = hasValidCalc && livePct <= 5 && !it.floorRemovalSentAt && !it.floorRemovalRemovedAt && it.floorRemovalStatus !== 'SENT' && it.floorRemovalStatus !== 'REMOVED';
      if (isPending) pending++;

      // Sent Today: marked as sent on current local date (includes subsequently removed)
      if (it.floorRemovalSentDate && it.floorRemovalSentDate === todayDateStr) {
        sentToday++;
      }

      // Previously Sent: marked as sent before today (includes subsequently removed)
      if (it.floorRemovalSentDate && it.floorRemovalSentDate < todayDateStr) {
        previouslySent++;
      }

      // Removed: physical removal confirmed
      if (it.floorRemovalStatus === 'REMOVED' || it.floorRemovalRemovedAt) {
        removed++;
      }
    });

    return {
      all: items.length,
      pending,
      sentToday,
      previouslySent,
      removed
    };
  }, [items, todayDateStr]);

  // Filtered items
  const filteredItems = useMemo(() => {
    return items.filter((it) => {
      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const qDigits = searchQuery.trim().replace(/\D/g, '');
        const nameMatch = (it.itemName || '').toLowerCase().includes(q);
        const codeMatch = (it.bansalCode || '').includes(qDigits || q);
        const barcodeMatch = (it.barcode || '').includes(q);
        if (!nameMatch && !codeMatch && !barcodeMatch) return false;
      }

      // Main Code
      if (
        selectedMainCode !== 'ALL' &&
        !matchesMainCodeFilter(it.mainCode, selectedMainCode)
      ) {
        return false;
      }

      // Category
      if (selectedCategory !== 'ALL' && it.category?.trim() !== selectedCategory) {
        return false;
      }

      // Debit
      if (selectedDebitFilter !== 'ALL' && it.debitStatus !== selectedDebitFilter) {
        return false;
      }

      // Live shelf life calculation against current device date
      const liveLife = calculateShelfLife(it.mfgDate, it.expiryDate);
      const liveDays = liveLife.pendingDays;
      const hasValidCalc = liveLife.totalDays > 0 || (it.pendingPct !== undefined && it.pendingPct !== null && !isNaN(Number(it.pendingPct)));
      const livePct = liveLife.totalDays > 0 ? liveLife.pendingPct : (Number(it.pendingPct) || 0);

      // Expiry urgency filter
      if (selectedExpiryFilter === 'EXPIRED') {
        if (liveDays >= 0) return false;
      } else if (selectedExpiryFilter === 'CRITICAL_15') {
        if (liveDays < 0 || liveDays > 15) return false;
      } else if (selectedExpiryFilter === 'NEAR_60') {
        if (liveDays < 15 || liveDays > 60) return false;
      }

      // Pending Shelf Life % filter
      if (selectedPctFilter === 'LTE_5' && (!hasValidCalc || livePct > 5)) return false;
      if (selectedPctFilter === 'LTE_10' && (!hasValidCalc || livePct > 10)) return false;
      if (selectedPctFilter === 'LTE_15' && (!hasValidCalc || livePct > 15)) return false;
      if (selectedPctFilter === 'LTE_20' && (!hasValidCalc || livePct > 20)) return false;
      if (selectedPctFilter === 'LTE_30' && (!hasValidCalc || livePct > 30)) return false;
      if (selectedPctFilter === 'LTE_50' && (!hasValidCalc || livePct > 50)) return false;
      if (selectedPctFilter === 'GT_50' && (!hasValidCalc || livePct <= 50)) return false;

      // Floor Removal Filter
      const isPendingRemoval = hasValidCalc && livePct <= 5 && !it.floorRemovalSentAt && !it.floorRemovalRemovedAt && it.floorRemovalStatus !== 'SENT' && it.floorRemovalStatus !== 'REMOVED';
      const isSentToday = Boolean(it.floorRemovalSentDate && it.floorRemovalSentDate === todayDateStr);
      const isPreviouslySent = Boolean(it.floorRemovalSentDate && it.floorRemovalSentDate < todayDateStr);
      const isRemoved = Boolean(it.floorRemovalStatus === 'REMOVED' || it.floorRemovalRemovedAt);

      if (selectedFloorRemovalFilter === 'PENDING' && !isPendingRemoval) return false;
      if (selectedFloorRemovalFilter === 'SENT_TODAY' && !isSentToday) return false;
      if (selectedFloorRemovalFilter === 'PREVIOUSLY_SENT' && !isPreviouslySent) return false;
      if (selectedFloorRemovalFilter === 'REMOVED' && !isRemoved) return false;

      return true;
    });
  }, [
    items,
    searchQuery,
    selectedMainCode,
    selectedCategory,
    selectedDebitFilter,
    selectedExpiryFilter,
    selectedPctFilter,
    selectedFloorRemovalFilter,
    todayDateStr
  ]);

  // Metrics
  const summary = useMemo(() => {
    const totalQty = items.reduce((s, it) => s + (Number(it.nearExpiryStock) || 0), 0);
    const totalValue = items.reduce((s, it) => s + (Number(it.value) || 0), 0);
    const withHoCount = items.filter((it) => Boolean(it.hoRemark)).length;
    return {
      count: items.length,
      totalQty,
      totalValue,
      withHoCount
    };
  }, [items]);

  // Selection helpers
  const handleToggleSelectAll = () => {
    if (selectedItemIds.size === filteredItems.length && filteredItems.length > 0) {
      setSelectedItemIds(new Set());
    } else {
      setSelectedItemIds(new Set(filteredItems.map((it) => it.id)));
    }
  };

  const handleToggleSelectItem = (id: string) => {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Handle Download HO Excel (Always full batch scope, independent of Floor Removal filter)
  const handleDownloadExcel = async () => {
    if (items.length === 0) {
      alert('The current fortnight list is empty. Add products before downloading.');
      return;
    }
    setIsExporting(true);
    try {
      await downloadHoNearExpiryExcel(batch, items);
    } catch (err) {
      console.error('Download error:', err);
      alert('Failed to generate Excel download.');
    } finally {
      setIsExporting(false);
    }
  };

  // Handle WhatsApp Copy for Floor Removal (Pending Removal format)
  const handleCopyFloorRemovalList = async () => {
    if (filteredItems.length === 0) return;
    const store = batch.storeName && batch.storeName !== 'Store 1' ? batch.storeName : 'PATAN';
    const formatted = formatFloorRemovalForWhatsApp(filteredItems, store);
    const ok = await copyTextToClipboard(formatted);
    if (ok) {
      const ids = filteredItems.map((it) => it.id);
      setCopiedItemIds(ids);
      setCopiedNotification(
        `Copied ${filteredItems.length} items for WhatsApp! Use "Mark Copied (${filteredItems.length}) as Sent" below after sending.`
      );
      setTimeout(() => setCopiedNotification(null), 4000);
    }
  };

  // Handle WhatsApp Copy for Filtered List (General format)
  const handleCopyFilteredList = async () => {
    if (filteredItems.length === 0) return;

    if (selectedFloorRemovalFilter === 'PENDING') {
      return handleCopyFloorRemovalList();
    }

    const formatted = formatFilteredNearExpiryForWhatsApp(filteredItems);
    const ok = await copyTextToClipboard(formatted);
    if (ok) {
      const ids = filteredItems.map((it) => it.id);
      setCopiedItemIds(ids);
      setCopiedNotification(
        `Copied ${filteredItems.length} filtered products for WhatsApp!`
      );
      setTimeout(() => setCopiedNotification(null), 3000);
    }
  };

  // Bulk: Mark as Sent
  const handleBulkMarkSent = async (targetIds?: string[]) => {
    const idsToMark = targetIds && targetIds.length > 0
      ? targetIds
      : selectedItemIds.size > 0
      ? Array.from(selectedItemIds)
      : copiedItemIds.length > 0
      ? copiedItemIds
      : filteredItems.map((it) => it.id);

    if (idsToMark.length === 0) {
      alert('No items selected or filtered to mark as sent.');
      return;
    }

    const updated = await markItemsFloorSent(items, idsToMark);
    onItemsChange(updated);
    setSelectedItemIds(new Set());
    setCopiedNotification(`Marked ${idsToMark.length} items as Sent to Staff!`);
    setTimeout(() => setCopiedNotification(null), 3000);
  };

  // Bulk: Mark as Removed
  const handleBulkMarkRemoved = async (targetIds?: string[]) => {
    const idsToMark = targetIds && targetIds.length > 0
      ? targetIds
      : selectedItemIds.size > 0
      ? Array.from(selectedItemIds)
      : filteredItems.map((it) => it.id);

    if (idsToMark.length === 0) {
      alert('No items selected or filtered to mark as removed.');
      return;
    }

    const updated = await markItemsFloorRemoved(items, idsToMark);
    onItemsChange(updated);
    setSelectedItemIds(new Set());
    setCopiedNotification(`Marked ${idsToMark.length} items as Removed from Floor!`);
    setTimeout(() => setCopiedNotification(null), 3000);
  };

  // Single Item: Mark as Sent
  const handleSingleMarkSent = async (it: NearExpiryItem) => {
    const updated = await markItemsFloorSent(items, [it.id]);
    onItemsChange(updated);
  };

  // Single Item: Mark as Removed
  const handleSingleMarkRemoved = async (it: NearExpiryItem) => {
    const updated = await markItemsFloorRemoved(items, [it.id]);
    onItemsChange(updated);
  };

  // Single Item: Undo Floor Status
  const handleSingleUndoStatus = async (it: NearExpiryItem, mode: 'UNDO_REMOVED' | 'RESET_ALL' = 'RESET_ALL') => {
    const updated = await undoItemsFloorStatus(items, [it.id], mode);
    onItemsChange(updated);
  };

  // Open Edit Modal
  const openEditModal = (it: NearExpiryItem) => {
    setEditingItem(it);
    setEditQty(String(it.nearExpiryStock || '1'));
    setEditMfg(formatDateYYYYMMDD(it.mfgDate));
    setEditExp(formatDateYYYYMMDD(it.expiryDate));
    setEditDebit(it.debitStatus || 'NON DEBIT');
  };

  // Save Edit Item
  const handleSaveEdit = async () => {
    if (!editingItem) return;
    const parsedQty = parseFloat(editQty) || 0;
    if (parsedQty <= 0) {
      alert('Please enter a valid quantity.');
      return;
    }
    if (!editExp) {
      alert('Expiry Date is required.');
      return;
    }

    const life = calculateShelfLife(editMfg, editExp);
    const updatedValue = Math.round(parsedQty * (editingItem.cost || 0) * 100) / 100;

    const updated: NearExpiryItem = {
      ...editingItem,
      nearExpiryStock: parsedQty,
      mfgDate: editMfg,
      expiryDate: editExp,
      debitStatus: editDebit,
      value: updatedValue,
      totalDays: life.totalDays,
      pendingDays: life.pendingDays,
      pendingPct: life.pendingPct
    };

    await saveNearExpiryItemDB(updated);
    onItemsChange(items.map((it) => (it.id === updated.id ? updated : it)));
    setEditingItem(null);
  };

  // Delete Item
  const handleDeleteItem = async (it: NearExpiryItem) => {
    if (!confirm(`Remove "${it.itemName}" from this fortnight's list?`)) return;
    await deleteNearExpiryItemDB(it.id);
    onItemsChange(items.filter((item) => item.id !== it.id));
  };

  return (
    <div className="space-y-3">
      {/* 1. Fortnight Batch Summary & Primary Actions */}
      <div
        className={`p-3 sm:p-4 rounded-xl border ${
          isDarkMode
            ? 'bg-slate-900 border-slate-800 text-slate-100'
            : 'bg-white border-slate-200 text-slate-900'
        } shadow-xs`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-indigo-100 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-300">
                {batch.name}
              </span>
              <span className="text-xs text-slate-500 font-bold">
                Store: {batch.storeName && batch.storeName !== 'Store 1' ? batch.storeName : 'PATAN'}
              </span>
            </div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white mt-1">
              Current Fortnight Near Expiry List
            </h2>
          </div>

          {/* Action Buttons Header */}
          <div className="flex flex-wrap items-center gap-2">
            {/* COPY FOR WHATSAPP BUTTON */}
            <button
              type="button"
              onClick={
                selectedFloorRemovalFilter === 'PENDING'
                  ? handleCopyFloorRemovalList
                  : handleCopyFilteredList
              }
              disabled={filteredItems.length === 0}
              className={`min-h-[40px] px-3.5 py-2 rounded-xl text-white text-xs sm:text-sm font-black flex items-center gap-1.5 shadow-xs transition-all disabled:opacity-50 cursor-pointer ${
                selectedFloorRemovalFilter === 'PENDING'
                  ? 'bg-amber-600 hover:bg-amber-700 active:bg-amber-800'
                  : 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800'
              }`}
              title={
                selectedFloorRemovalFilter === 'PENDING'
                  ? 'Copy daily floor removal list (≤5%) for WhatsApp'
                  : 'Copy filtered list for WhatsApp'
              }
            >
              <Share2 className="w-4 h-4" />
              <span>
                {selectedFloorRemovalFilter === 'PENDING'
                  ? 'COPY FOR WHATSAPP (≤5%)'
                  : 'COPY FILTERED LIST'}
              </span>
            </button>

            {/* Import Near Expiry List */}
            {onOpenImportModal && (
              <button
                type="button"
                onClick={onOpenImportModal}
                className="min-h-[40px] px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-xs sm:text-sm font-bold flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
                title="Import Near Expiry list into this batch"
              >
                <Upload className="w-4 h-4" />
                <span>Import List</span>
              </button>
            )}

            {/* Download Excel */}
            <button
              type="button"
              onClick={handleDownloadExcel}
              disabled={isExporting || items.length === 0}
              className="min-h-[40px] px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-bold flex items-center gap-1.5 shadow-xs transition-all disabled:opacity-50 cursor-pointer"
              title="Download full operational HO Excel sheet"
            >
              <Download className="w-4 h-4" />
              <span>{isExporting ? 'Generating...' : 'Download HO Excel'}</span>
            </button>

            {/* Upload HO Response */}
            <button
              type="button"
              onClick={onOpenUploadModal}
              className="min-h-[40px] px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs sm:text-sm font-bold flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              <span>Upload HO Response</span>
            </button>
          </div>
        </div>

        {/* 4 Key Summary KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60">
            <span className="text-[10px] text-slate-500 uppercase font-semibold block">
              Total Products
            </span>
            <span className="text-base font-extrabold text-slate-900 dark:text-white">
              {summary.count}
            </span>
          </div>

          <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60">
            <span className="text-[10px] text-slate-500 uppercase font-semibold block">
              Total Near Expiry Qty
            </span>
            <span className="text-base font-extrabold text-indigo-600 dark:text-indigo-400">
              {summary.totalQty}
            </span>
          </div>

          <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60">
            <span className="text-[10px] text-slate-500 uppercase font-semibold block">
              Total Value (Cost)
            </span>
            <span className="text-base font-extrabold text-emerald-600 dark:text-emerald-400">
              ₹{summary.totalValue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
            </span>
          </div>

          <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60">
            <span className="text-[10px] text-slate-500 uppercase font-semibold block">
              HO Remarks Received
            </span>
            <span className="text-base font-extrabold text-slate-800 dark:text-slate-200">
              {summary.withHoCount} / {summary.count}
            </span>
          </div>
        </div>

        {copiedNotification && (
          <div className="mt-2.5 p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-xs font-semibold text-emerald-800 dark:text-emerald-300 flex items-center justify-between gap-2 animate-fade-in">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>{copiedNotification}</span>
            </div>
            {copiedItemIds.length > 0 && (
              <button
                type="button"
                onClick={() => handleBulkMarkSent(copiedItemIds)}
                className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold shrink-0 cursor-pointer shadow-2xs"
              >
                Mark Copied ({copiedItemIds.length}) as Sent
              </button>
            )}
          </div>
        )}
      </div>

      {/* 2. Filters & Search Strip */}
      <div
        className={`p-3 rounded-xl border ${
          isDarkMode
            ? 'bg-slate-900 border-slate-800'
            : 'bg-white border-slate-200'
        } shadow-xs space-y-2.5`}
      >
        {/* Search Bar */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search current list by item name, Bansal Code, barcode..."
            className={`w-full pl-9 pr-8 py-2 rounded-xl border text-xs font-medium ${
              isDarkMode
                ? 'bg-slate-800 border-slate-700 text-white placeholder-slate-400'
                : 'bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400'
            } focus:outline-hidden focus:border-indigo-500`}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
            >
              ✕
            </button>
          )}
        </div>

        {/* Dropdowns Row: Floor Removal Filter + MainCode, Dependent Category, Debit, Expiry, Pending Shelf Life % */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-xs">
          {/* 1. FLOOR REMOVAL FILTER (Targeted Workflow Filter) */}
          <div className="col-span-2 sm:col-span-1 lg:col-span-1">
            <label className="block text-[10px] uppercase font-black text-amber-700 dark:text-amber-400 mb-0.5 flex items-center gap-1">
              <Truck className="w-3 h-3 text-amber-600 dark:text-amber-400" />
              <span>Floor Removal</span>
            </label>
            <select
              value={selectedFloorRemovalFilter}
              onChange={(e) => setSelectedFloorRemovalFilter(e.target.value as FloorRemovalFilterType)}
              className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-bold ${
                selectedFloorRemovalFilter !== 'ALL'
                  ? 'bg-amber-50 dark:bg-amber-950/60 border-amber-400 dark:border-amber-600 text-amber-900 dark:text-amber-200 ring-1 ring-amber-400'
                  : isDarkMode
                  ? 'bg-slate-800 border-slate-700 text-white'
                  : 'bg-slate-50 border-slate-300 text-slate-900'
              }`}
            >
              <option value="ALL">All Items ({floorRemovalCounts.all})</option>
              <option value="PENDING">Pending Removal (≤5%) ({floorRemovalCounts.pending})</option>
              <option value="SENT_TODAY">Sent Today ({floorRemovalCounts.sentToday})</option>
              <option value="PREVIOUSLY_SENT">Previously Sent ({floorRemovalCounts.previouslySent})</option>
              <option value="REMOVED">Removed ({floorRemovalCounts.removed})</option>
            </select>
          </div>

          {/* 2. Main Code */}
          <div>
            <label className="block text-[10px] uppercase font-bold text-slate-500 mb-0.5">
              Main Code
            </label>
            <select
              value={selectedMainCode}
              onChange={(e) => {
                setSelectedMainCode(e.target.value);
              }}
              className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-semibold ${
                isDarkMode
                  ? 'bg-slate-800 border-slate-700 text-white'
                  : 'bg-slate-50 border-slate-300 text-slate-900'
              }`}
            >
              <option value="ALL">All Main Codes</option>
              {availableMainCodes.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </div>

          {/* 3. Dependent Category */}
          <div>
            <label className="block text-[10px] uppercase font-bold text-slate-500 mb-0.5">
              Category
            </label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-semibold ${
                isDarkMode
                  ? 'bg-slate-800 border-slate-700 text-white'
                  : 'bg-slate-50 border-slate-300 text-slate-900'
              }`}
            >
              <option value="ALL">All Categories</option>
              {availableCategories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {/* 4. Debit Filter */}
          <div>
            <label className="block text-[10px] uppercase font-bold text-slate-500 mb-0.5">
              Debit Status
            </label>
            <select
              value={selectedDebitFilter}
              onChange={(e) => setSelectedDebitFilter(e.target.value)}
              className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-semibold ${
                isDarkMode
                  ? 'bg-slate-800 border-slate-700 text-white'
                  : 'bg-slate-50 border-slate-300 text-slate-900'
              }`}
            >
              <option value="ALL">All (Debit + Non-Debit)</option>
              <option value="NON DEBIT">NON DEBIT</option>
              <option value="DEBIT">DEBIT</option>
            </select>
          </div>

          {/* 5. Expiry Range Filter */}
          <div>
            <label className="block text-[10px] uppercase font-bold text-slate-500 mb-0.5">
              Expiry Urgency
            </label>
            <select
              value={selectedExpiryFilter}
              onChange={(e) => setSelectedExpiryFilter(e.target.value)}
              className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-semibold ${
                isDarkMode
                  ? 'bg-slate-800 border-slate-700 text-white'
                  : 'bg-slate-50 border-slate-300 text-slate-900'
              }`}
            >
              <option value="ALL">All Products</option>
              <option value="EXPIRED">Expired (&lt; 0 days)</option>
              <option value="CRITICAL_15">Critical (1 - 15 days)</option>
              <option value="NEAR_60">Near Expiry (16 - 60 days)</option>
            </select>
          </div>

          {/* 6. Pending Shelf Life % Filter */}
          <div>
            <label className="block text-[10px] uppercase font-bold text-slate-500 mb-0.5">
              Shelf Life %
            </label>
            <select
              value={selectedPctFilter}
              onChange={(e) => setSelectedPctFilter(e.target.value)}
              className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-semibold ${
                isDarkMode
                  ? 'bg-slate-800 border-slate-700 text-white'
                  : 'bg-slate-50 border-slate-300 text-slate-900'
              }`}
            >
              <option value="ALL">All %</option>
              <option value="LTE_5">≤ 5%</option>
              <option value="LTE_10">≤ 10%</option>
              <option value="LTE_15">≤ 15%</option>
              <option value="LTE_20">≤ 20%</option>
              <option value="LTE_30">≤ 30%</option>
              <option value="LTE_50">≤ 50%</option>
              <option value="GT_50">&gt; 50%</option>
            </select>
          </div>
        </div>

        {/* Active Filter Info & Reset */}
        <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-500 pt-1 gap-2 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <span>Showing <strong>{filteredItems.length}</strong> of {items.length} products</span>
            {selectedFloorRemovalFilter !== 'ALL' && (
              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-900 dark:bg-amber-950/80 dark:text-amber-300">
                Floor Filter: {selectedFloorRemovalFilter.replace('_', ' ')}
              </span>
            )}
          </div>

          {(selectedFloorRemovalFilter !== 'ALL' ||
            selectedMainCode !== 'ALL' ||
            selectedCategory !== 'ALL' ||
            selectedDebitFilter !== 'ALL' ||
            selectedExpiryFilter !== 'ALL' ||
            selectedPctFilter !== 'ALL' ||
            searchQuery) && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setSelectedFloorRemovalFilter('ALL');
                setSelectedMainCode('ALL');
                setSelectedCategory('ALL');
                setSelectedDebitFilter('ALL');
                setSelectedExpiryFilter('ALL');
                setSelectedPctFilter('ALL');
              }}
              className="text-indigo-600 dark:text-indigo-400 font-bold hover:underline cursor-pointer"
            >
              Reset All Filters
            </button>
          )}
        </div>
      </div>

      {/* 3. Floor Removal Bulk Actions Toolbar (Visible when filtered or items selected) */}
      <div
        className={`p-2.5 sm:p-3 rounded-xl border flex flex-wrap items-center justify-between gap-2.5 ${
          selectedFloorRemovalFilter === 'PENDING'
            ? 'bg-amber-50/80 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900/60'
            : isDarkMode
            ? 'bg-slate-900 border-slate-800'
            : 'bg-white border-slate-200'
        } shadow-xs`}
      >
        {/* Left: Select all checkbox & selection badge */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleToggleSelectAll}
            className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white cursor-pointer"
          >
            {selectedItemIds.size > 0 && selectedItemIds.size === filteredItems.length ? (
              <CheckSquare className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            ) : (
              <Square className="w-4 h-4 text-slate-400" />
            )}
            <span>
              {selectedItemIds.size > 0
                ? `${selectedItemIds.size} Selected`
                : 'Select All Filtered'}
            </span>
          </button>
        </div>

        {/* Right: Targeted Floor Removal Workflow Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Mark as Sent (Works on Copied / Selected / Filtered) */}
          {copiedItemIds.length > 0 && (
            <button
              type="button"
              onClick={() => handleBulkMarkSent(copiedItemIds)}
              className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer"
              title="Mark the exact lots you just copied as Sent to staff"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Mark Copied ({copiedItemIds.length}) as Sent</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => handleBulkMarkSent()}
            disabled={filteredItems.length === 0}
            className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer"
            title="Mark selected or filtered items as Sent"
          >
            <Send className="w-3.5 h-3.5" />
            <span>
              {selectedItemIds.size > 0
                ? `Mark Selected (${selectedItemIds.size}) as Sent`
                : `Mark Filtered (${filteredItems.length}) as Sent`}
            </span>
          </button>

          {/* Mark as Removed (Physical removal confirmed) */}
          <button
            type="button"
            onClick={() => handleBulkMarkRemoved()}
            disabled={filteredItems.length === 0}
            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer"
            title="Confirm physical removal of selected or filtered items from the floor"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>
              {selectedItemIds.size > 0
                ? `Mark Selected (${selectedItemIds.size}) as Removed`
                : `Mark Filtered (${filteredItems.length}) as Removed`}
            </span>
          </button>
        </div>
      </div>

      {/* 4. Items List / Cards */}
      {filteredItems.length === 0 ? (
        <div
          className={`p-8 text-center rounded-xl border ${
            isDarkMode
              ? 'bg-slate-900 border-slate-800 text-slate-400'
              : 'bg-white border-slate-200 text-slate-500'
          }`}
        >
          <Layers className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
          <p className="text-sm font-semibold">No near expiry products matching criteria.</p>
          <p className="text-xs mt-1">
            {selectedFloorRemovalFilter === 'PENDING'
              ? 'No unsent products with ≤5% remaining shelf life found for floor removal today.'
              : 'Try changing your search terms or filter selections.'}
          </p>
          {onOpenImportModal && items.length === 0 && (
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                onClick={onOpenImportModal}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer"
              >
                <Upload className="w-4 h-4" />
                <span>Import Near Expiry List into {batch.name}</span>
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredItems.map((it) => {
            const liveLife = calculateShelfLife(it.mfgDate, it.expiryDate);
            const isExpired = liveLife.pendingDays < 0;
            const isCritical = liveLife.pendingDays >= 0 && liveLife.pendingDays <= 15;
            const hasValidCalc = liveLife.totalDays > 0 || (it.pendingPct !== undefined && it.pendingPct !== null && !isNaN(Number(it.pendingPct)));
            const livePct = liveLife.totalDays > 0 ? liveLife.pendingPct : (Number(it.pendingPct) || 0);

            // Floor status helpers
            const isPendingFloorRemoval = hasValidCalc && livePct <= 5 && !it.floorRemovalSentAt && !it.floorRemovalRemovedAt && it.floorRemovalStatus !== 'SENT' && it.floorRemovalStatus !== 'REMOVED';
            const isSentToday = Boolean(it.floorRemovalSentDate && it.floorRemovalSentDate === todayDateStr);
            const isPreviouslySent = Boolean(it.floorRemovalSentDate && it.floorRemovalSentDate < todayDateStr);
            const isRemoved = Boolean(it.floorRemovalStatus === 'REMOVED' || it.floorRemovalRemovedAt);
            const isSelected = selectedItemIds.has(it.id);

            return (
              <div
                key={it.id}
                className={`p-3 rounded-xl border transition-all ${
                  isSelected
                    ? 'ring-2 ring-indigo-500 border-indigo-400 bg-indigo-50/30 dark:bg-indigo-950/30'
                    : isDarkMode
                    ? 'bg-slate-900 border-slate-800 hover:border-slate-700'
                    : 'bg-white border-slate-200 hover:border-slate-300'
                } shadow-xs`}
              >
                <div className="flex items-start gap-2.5">
                  {/* Item selection checkbox */}
                  <button
                    type="button"
                    onClick={() => handleToggleSelectItem(it.id)}
                    className="mt-0.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 cursor-pointer"
                  >
                    {isSelected ? (
                      <CheckSquare className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                  </button>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        {/* Item Name */}
                        <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white leading-tight">
                          {it.itemName}
                        </h3>

                        {/* Metadata strip */}
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                          <span>
                            Code:{' '}
                            <strong className="font-mono text-slate-800 dark:text-slate-200">
                              {it.bansalCode}
                            </strong>
                          </span>
                          {it.barcode && <span>• EAN: <span className="font-mono">{it.barcode}</span></span>}
                          <span>• Main: <strong>{it.mainCode}</strong></span>
                          <span>• Cat: <strong>{it.category}</strong></span>
                          <span
                            className={`px-1.5 py-0.2 text-[9px] font-bold rounded-sm border ${
                              it.debitStatus === 'DEBIT'
                                ? 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-300'
                                : 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300'
                            }`}
                          >
                            {it.debitStatus}
                          </span>
                        </div>
                      </div>

                      {/* Stock & Value badge */}
                      <div className="text-right shrink-0">
                        <div className="px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-right">
                          <span className="text-[10px] text-indigo-700 dark:text-indigo-300 font-bold block uppercase">
                            Qty: {it.nearExpiryStock}
                          </span>
                          <span className="text-xs font-extrabold text-slate-900 dark:text-white">
                            ₹{Number(it.value || 0).toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Expiry & Metric Row */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
                      <div>
                        <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                          MFG Date
                        </span>
                        <span className="font-semibold text-slate-700 dark:text-slate-300">
                          {formatDateDDMMYYYY(it.mfgDate) || '—'}
                        </span>
                      </div>

                      <div>
                        <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                          Expiry Date
                        </span>
                        <span className="font-bold text-slate-900 dark:text-white">
                          {formatDateDDMMYYYY(it.expiryDate)}
                        </span>
                      </div>

                      <div>
                        <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                          Pending Shelf Life
                        </span>
                        <span
                          className={`font-bold ${
                            isExpired
                              ? 'text-rose-600 dark:text-rose-400 font-extrabold'
                              : isCritical
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-slate-800 dark:text-slate-200'
                          }`}
                        >
                          {formatPendingDaysText(liveLife.pendingDays, it.expiryDate || it.hoExpiryDate)}
                        </span>
                      </div>

                      <div>
                        <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                          Pending %
                        </span>
                        <span className="font-bold text-slate-800 dark:text-slate-200">
                          {liveLife.totalDays > 0
                            ? `${liveLife.pendingPct.toFixed(1)}%`
                            : it.pendingPct !== undefined
                            ? `${Number(it.pendingPct).toFixed(1)}%`
                            : '—'}
                        </span>
                      </div>
                    </div>

                    {/* FLOOR REMOVAL STATUS STRIP */}
                    <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {/* Status Badges */}
                        {isRemoved ? (
                          <span className="px-2 py-0.5 text-[10px] font-black rounded-md bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span>REMOVED FROM FLOOR</span>
                            {it.floorRemovalRemovedAt && (
                              <span className="font-normal opacity-90">
                                ({formatDisplayDateTime(it.floorRemovalRemovedAt)})
                              </span>
                            )}
                          </span>
                        ) : null}

                        {it.floorRemovalSentAt ? (
                          <span
                            className={`px-2 py-0.5 text-[10px] font-black rounded-md border flex items-center gap-1 ${
                              isSentToday
                                ? 'bg-blue-100 dark:bg-blue-950/80 text-blue-800 dark:text-blue-300 border-blue-300 dark:border-blue-800'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-300 border-slate-300 dark:border-slate-700'
                            }`}
                          >
                            <Send className="w-3 h-3 text-blue-600" />
                            <span>{isSentToday ? 'SENT TODAY' : 'PREVIOUSLY SENT'}</span>
                            <span className="font-normal opacity-90">
                              ({formatDisplayDateTime(it.floorRemovalSentAt)})
                            </span>
                          </span>
                        ) : isPendingFloorRemoval ? (
                          <span className="px-2 py-0.5 text-[10px] font-black rounded-md bg-amber-100 dark:bg-amber-950/80 text-amber-900 dark:text-amber-300 border border-amber-300 dark:border-amber-700 flex items-center gap-1">
                            <Flame className="w-3 h-3 text-amber-600" />
                            <span>PENDING REMOVAL (≤5%)</span>
                          </span>
                        ) : null}
                      </div>

                      {/* Targeted Row Actions */}
                      <div className="flex items-center gap-1.5">
                        {/* Send to Staff */}
                        {!it.floorRemovalSentAt && !isRemoved && (
                          <button
                            type="button"
                            onClick={() => handleSingleMarkSent(it)}
                            className="px-2 py-1 rounded-md bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/50 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 text-[11px] font-bold border border-blue-200 dark:border-blue-800 flex items-center gap-1 cursor-pointer"
                            title="Mark as sent to floor staff"
                          >
                            <Send className="w-3 h-3" />
                            <span>Send</span>
                          </button>
                        )}

                        {/* Mark Removed */}
                        {!isRemoved && (
                          <button
                            type="button"
                            onClick={() => handleSingleMarkRemoved(it)}
                            className="px-2 py-1 rounded-md bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 text-[11px] font-bold border border-emerald-200 dark:border-emerald-800 flex items-center gap-1 cursor-pointer"
                            title="Confirm physical removal from floor"
                          >
                            <Check className="w-3 h-3" />
                            <span>Mark Removed</span>
                          </button>
                        )}

                        {/* Undo / Correction Actions */}
                        {isRemoved && (
                          <button
                            type="button"
                            onClick={() => handleSingleUndoStatus(it, 'UNDO_REMOVED')}
                            className="px-2 py-1 rounded-md bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-[11px] font-semibold border border-slate-200 dark:border-slate-700 flex items-center gap-1 cursor-pointer"
                            title="Undo removal status (revert to sent)"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>Undo Removal</span>
                          </button>
                        )}

                        {it.floorRemovalSentAt && !isRemoved && (
                          <button
                            type="button"
                            onClick={() => handleSingleUndoStatus(it, 'RESET_ALL')}
                            className="px-2 py-1 rounded-md bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-[11px] font-semibold border border-slate-200 dark:border-slate-700 flex items-center gap-1 cursor-pointer"
                            title="Undo sent status (revert to unsent)"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>Undo Sent</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* HO Remark if present */}
                    {it.hoRemark && (
                      <div className="mt-2 p-2 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 flex items-start justify-between gap-2 text-xs">
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300 block">
                            HO REMARK:
                          </span>
                          <span className="font-semibold text-slate-900 dark:text-white">
                            {it.hoRemark}
                          </span>
                        </div>
                        {it.actionType && (
                          <span className="px-2 py-0.5 text-[10px] font-extrabold rounded-md bg-indigo-600 text-white shrink-0 self-center">
                            {it.actionType}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Bottom row actions */}
                    <div className="flex items-center justify-between gap-2 mt-2 pt-1 text-xs">
                      <button
                        type="button"
                        onClick={async () => {
                          const text = formatNearExpiryItemForWhatsApp(it);
                          await copyTextToClipboard(text);
                          setCopiedNotification(`Copied details for ${it.itemName}!`);
                          setTimeout(() => setCopiedNotification(null), 2500);
                        }}
                        className="text-slate-500 hover:text-emerald-600 flex items-center gap-1 font-semibold text-[11px] cursor-pointer"
                      >
                        <Share2 className="w-3 h-3" />
                        <span>Copy</span>
                      </button>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openEditModal(it)}
                          className="text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 font-semibold text-[11px] cursor-pointer"
                        >
                          <Edit2 className="w-3 h-3" />
                          <span>Edit</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeleteItem(it)}
                          className="text-rose-600 dark:text-rose-400 hover:underline flex items-center gap-1 font-semibold text-[11px] cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>Delete</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Edit Item Modal */}
      {editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-900/60 backdrop-blur-xs">
          <div
            className={`w-full max-w-md p-4 rounded-xl border shadow-xl ${
              isDarkMode
                ? 'bg-slate-900 border-slate-800 text-white'
                : 'bg-white border-slate-200 text-slate-900'
            }`}
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-sm font-bold">Edit Near Expiry Product</h3>
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="mt-2 space-y-2.5">
              <div className="text-xs">
                <span className="font-bold text-slate-900 dark:text-white block">
                  {editingItem.itemName}
                </span>
                <span className="text-slate-500 font-mono">
                  Code: {editingItem.bansalCode} | Cost: ₹{editingItem.cost}
                </span>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase mb-1">
                  Near Expiry Qty
                </label>
                <input
                  type="number"
                  min="0.01"
                  step="any"
                  value={editQty}
                  onChange={(e) => setEditQty(e.target.value)}
                  className={`w-full px-3 py-2 rounded-lg border text-sm font-bold ${
                    isDarkMode
                      ? 'bg-slate-800 border-slate-700 text-white'
                      : 'bg-white border-slate-300 text-slate-900'
                  }`}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase mb-1">
                    MFG Date
                  </label>
                  <input
                    type="date"
                    value={editMfg}
                    onChange={(e) => setEditMfg(e.target.value)}
                    className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-semibold ${
                      isDarkMode
                        ? 'bg-slate-800 border-slate-700 text-white'
                        : 'bg-white border-slate-300 text-slate-900'
                    }`}
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase mb-1">
                    Expiry Date
                  </label>
                  <input
                    type="date"
                    value={editExp}
                    onChange={(e) => setEditExp(e.target.value)}
                    className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-bold ${
                      isDarkMode
                        ? 'bg-slate-800 border-slate-700 text-white'
                        : 'bg-white border-slate-300 text-slate-900'
                    }`}
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase mb-1">
                  Debit / Non-Debit Status
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setEditDebit('NON DEBIT')}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-lg border cursor-pointer ${
                      editDebit === 'NON DEBIT'
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-700'
                    }`}
                  >
                    NON DEBIT
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditDebit('DEBIT')}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-lg border cursor-pointer ${
                      editDebit === 'DEBIT'
                        ? 'bg-rose-600 text-white border-rose-600'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-700'
                    }`}
                  >
                    DEBIT
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 mt-4 pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={handleSaveEdit}
                className="flex-1 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer"
              >
                Save Changes
              </button>
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="py-2 px-3 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
