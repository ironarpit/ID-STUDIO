import React, { useState, useMemo, useEffect } from 'react';
import {
  CheckCircle2,
  Clock,
  Search,
  Filter,
  RotateCcw,
  Eye,
  Check,
  Upload,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  FileSpreadsheet,
  X
} from 'lucide-react';
import { NearExpiryBatch, NearExpiryItem, NearExpiryActionType } from '../../types';
import {
  evaluateItemStatus,
  formatDateDDMMYYYY,
  calculateShelfLife,
  formatDisplayDays,
  formatDisplayPct,
  getActionNowLabel
} from '../../utils/nearExpiryEngine';
import { normalizeLocalCode, normalizeScannedBarcode } from '../../utils/barcodeResolver';
import { markItemsCompleted, returnItemToFloor } from '../../utils/nearExpiryStorage';
import { NearExpiryDetailsModal } from './NearExpiryDetailsModal';
import { NearExpiryLotSelectorModal } from './NearExpiryLotSelectorModal';

export type HoActionTab = 'DO_NOW' | 'DO_LATER';

interface NearExpiryHoActionsProps {
  batch: NearExpiryBatch;
  items: NearExpiryItem[];
  onItemsChange: (items: NearExpiryItem[]) => void;
  onOpenHoUploadModal: () => void;
  isDarkMode?: boolean;
}

export const NearExpiryHoActions: React.FC<NearExpiryHoActionsProps> = ({
  batch,
  items,
  onItemsChange,
  onOpenHoUploadModal,
  isDarkMode = false
}) => {
  // Two main tabs only (Requirement 10: DO NOW and DO LATER)
  const [activeTab, setActiveTab] = useState<HoActionTab>('DO_NOW');

  // Multi-select for bulk complete (explicit selection only!)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Search and Action Filter
  const [searchTerm, setSearchTerm] = useState('');
  const [actionGroupFilter, setActionGroupFilter] = useState<string>('ALL');

  // Modals
  const [detailItem, setDetailItem] = useState<NearExpiryItem | null>(null);
  const [completeModalItem, setCompleteModalItem] = useState<NearExpiryItem | null>(null);
  const [completionNote, setCompletionNote] = useState('');
  const [bulkCompleteOpen, setBulkCompleteOpen] = useState(false);

  // Return to floor confirmation
  const [returnToFloorItem, setReturnToFloorItem] = useState<NearExpiryItem | null>(null);
  const [returnReason, setReturnReason] = useState('HO instruction: Continue sale');

  // Scanner Feedback & Multiple Lot Disambiguation
  const [scannerFeedback, setScannerFeedback] = useState<{
    type: 'success' | 'warning' | 'error';
    message: string;
  } | null>(null);
  const [multipleLotsData, setMultipleLotsData] = useState<{
    productName: string;
    barcode: string;
    bansalCode: string;
    items: NearExpiryItem[];
  } | null>(null);

  // Scanner listener for HO Actions
  useEffect(() => {
    const handleNearExpiryScan = (e: CustomEvent<{ barcode: string }>) => {
      const rawCode = e.detail?.barcode;
      if (!rawCode) return;

      const normCode = normalizeLocalCode(rawCode);
      const normBar = normalizeScannedBarcode(rawCode);

      const matches = items.filter((it) => {
        const c = normalizeLocalCode(it.bansalCode || it.hoBansalCode);
        const b = normalizeScannedBarcode(it.barcode || it.hoEanCode);
        return (normBar && b === normBar) || (normCode && c === normCode);
      });

      if (matches.length === 0) {
        setDetailItem(null);
        setScannerFeedback({
          type: 'warning',
          message: 'NOT IN ACTIVE HO ACTIONS LIST'
        });
        return;
      }

      if (matches.length === 1) {
        setDetailItem(matches[0]);
        setScannerFeedback({
          type: 'success',
          message: `✓ MATCHED: ${matches[0].itemName || matches[0].hoItemName}`
        });
      } else {
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
  }, [items]);

  // Only evaluate uncompleted items with HO remarks
  const evaluatedItems = useMemo(() => {
    return items.map((it) => {
      const evaluation = evaluateItemStatus(it);
      const shelf = calculateShelfLife(it.mfgDate || it.hoMfgDate, it.expiryDate || it.hoExpiryDate);
      return {
        item: it,
        evaluation,
        shelf
      };
    });
  }, [items]);

  // Tab counts
  const tabCounts = useMemo(() => {
    let doNowCount = 0;
    let doLaterCount = 0;

    for (const { item, evaluation } of evaluatedItems) {
      if (item.completedAt || item.status === 'COMPLETED') continue;
      if (!item.hoRemark) continue;

      if (evaluation.status === 'ACTION_REQUIRED') {
        doNowCount++;
      } else if (evaluation.status === 'WAITING') {
        doLaterCount++;
      }
    }

    return { doNowCount, doLaterCount };
  }, [evaluatedItems]);

  // Filter items based on activeTab (DO NOW vs DO LATER)
  const currentTabItems = useMemo(() => {
    return evaluatedItems.filter(({ item, evaluation }) => {
      if (item.completedAt || item.status === 'COMPLETED') return false;
      if (!item.hoRemark) return false;

      if (activeTab === 'DO_NOW') {
        return evaluation.status === 'ACTION_REQUIRED';
      } else {
        return evaluation.status === 'WAITING';
      }
    });
  }, [evaluatedItems, activeTab]);

  // Apply Action Group filter & search
  const filteredItems = useMemo(() => {
    return currentTabItems.filter(({ item, evaluation }) => {
      // Action group filter
      if (actionGroupFilter !== 'ALL') {
        const type = item.actionType || evaluation.effectiveActionType;
        if (type !== actionGroupFilter) return false;
      }

      // Search term
      if (searchTerm.trim()) {
        const query = searchTerm.trim().toLowerCase();
        const norm = normalizeLocalCode(query);
        const normBar = normalizeScannedBarcode(query);
        const code = normalizeLocalCode(item.bansalCode || item.hoBansalCode);
        const barcode = normalizeScannedBarcode(item.barcode || item.hoEanCode);
        const name = (item.itemName || item.hoItemName || '').toLowerCase();
        const remark = (item.hoRemark || '').toLowerCase();

        return (
          (norm && code === norm) ||
          (normBar && barcode === normBar) ||
          name.includes(query) ||
          remark.includes(query)
        );
      }

      return true;
    });
  }, [currentTabItems, actionGroupFilter, searchTerm]);

  // Selection handlers
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
      setSelectedIds(new Set(filteredItems.map(({ item }) => item.id)));
    }
  };

  // Complete action handlers
  const handleConfirmSingleComplete = async () => {
    if (!completeModalItem) return;
    const updated = await markItemsCompleted(items, [completeModalItem.id], completionNote);
    onItemsChange(updated);
    setCompleteModalItem(null);
    setCompletionNote('');
  };

  const handleConfirmBulkComplete = async () => {
    if (selectedIds.size === 0) return;
    const targetIds = Array.from(selectedIds) as string[];
    const updated = await markItemsCompleted(items, targetIds, completionNote || 'Bulk completed in HO Actions');
    onItemsChange(updated);
    setSelectedIds(new Set());
    setBulkCompleteOpen(false);
    setCompletionNote('');
  };

  // Return to floor confirmation
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
      {/* Header bar: Upload HO response prompt & Tab switcher */}
      <div
        className={`p-3 rounded-2xl border ${
          isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
        } shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3`}
      >
        {/* Two main tabs: DO NOW & DO LATER (Requirement 10) */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setActiveTab('DO_NOW');
              setSelectedIds(new Set());
            }}
            className={`min-h-[42px] px-3.5 py-2 rounded-xl text-xs font-extrabold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'DO_NOW'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200'
            }`}
          >
            <span>DO NOW</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                activeTab === 'DO_NOW'
                  ? 'bg-white text-rose-700'
                  : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
              }`}
            >
              {tabCounts.doNowCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('DO_LATER');
              setSelectedIds(new Set());
            }}
            className={`min-h-[42px] px-3.5 py-2 rounded-xl text-xs font-extrabold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'DO_LATER'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200'
            }`}
          >
            <span>DO LATER</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                activeTab === 'DO_LATER'
                  ? 'bg-white text-amber-700'
                  : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200'
              }`}
            >
              {tabCounts.doLaterCount}
            </span>
          </button>
        </div>

        {/* Upload HO Response Button */}
        <button
          type="button"
          onClick={onOpenHoUploadModal}
          className="px-3 py-1.5 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-2xs self-start sm:self-auto"
        >
          <FileSpreadsheet className="w-3.5 h-3.5" />
          <span>Upload New HO Response</span>
        </button>
      </div>

      {/* Filter & Search Bar */}
      <div
        className={`p-2.5 sm:p-3 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${
          isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
        } shadow-xs`}
      >
        <div className="flex items-center gap-2 flex-1 flex-wrap">
          {/* Action Group Filter */}
          <select
            value={actionGroupFilter}
            onChange={(e) => setActionGroupFilter(e.target.value)}
            className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold ${
              isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
            }`}
          >
            <option value="ALL">All Action Groups</option>
            <option value="DEBIT TO VENDOR">Debit to Vendor</option>
            <option value="TRANSFER TO DC">Transfer to DC</option>
            <option value="WRITE OFF + SEND TO DC">Write Off + Send to DC</option>
            <option value="ADD TO NEAR EXPIRY / RE-SUBMIT TO HO">Add / Re-submit to HO</option>
            <option value="MANUAL FOLLOW-UP">Manual Follow-up</option>
            <option value="MANUAL REVIEW">Manual Review</option>
          </select>

          {/* Search Box */}
          <div className="relative min-w-[200px] flex-1 max-w-sm">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search product / code / remark..."
              className={`w-full pl-8 pr-2.5 py-1.5 rounded-lg border text-xs ${
                isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
              }`}
            />
          </div>
        </div>

        {/* Bulk Action Controls */}
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isAllVisibleSelected}
              onChange={handleSelectAllVisible}
              className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
            />
            <span>Select All</span>
          </label>

          {selectedIds.size > 0 ? (
            <button
              type="button"
              onClick={() => setBulkCompleteOpen(true)}
              className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1 cursor-pointer shadow-2xs"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Mark Selected Done ({selectedIds.size})</span>
            </button>
          ) : (
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Select Products First
            </span>
          )}
        </div>
      </div>

      {/* Product Rows */}
      <div
        className={`rounded-2xl border overflow-hidden ${
          isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
        } shadow-xs`}
      >
        {filteredItems.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-xs">
            {activeTab === 'DO_NOW'
              ? 'No instructions currently due in DO NOW. Check DO LATER for deferred instructions, or upload a new HO Response Excel.'
              : 'No deferred instructions in DO LATER.'}
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {filteredItems.map(({ item, evaluation, shelf }) => {
              const isSelected = selectedIds.has(item.id);
              const isRemoved = Boolean(item.floorRemovalRemovedAt || item.floorRemovalStatus === 'REMOVED');
              const effectiveAction = item.actionType || evaluation.effectiveActionType;

              // Check if candidate for Return to Floor (Requirement 12)
              const remarkUpper = (item.hoRemark || '').toUpperCase();
              const canReturnToFloor =
                isRemoved &&
                (remarkUpper.includes('SALE TILL') ||
                  remarkUpper.includes('CONTINUE SALE') ||
                  remarkUpper.includes('KEEP ON FLOOR') ||
                  evaluation.status === 'WAITING');

              return (
                <div
                  key={item.id}
                  className={`p-3 sm:px-4 sm:py-3 transition-colors ${
                    isSelected ? 'bg-indigo-50/60 dark:bg-indigo-950/30' : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
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

                    {/* Content */}
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-extrabold text-sm text-slate-900 dark:text-white">
                          {item.itemName || item.hoItemName}
                        </span>

                        {/* Action Badge */}
                        <span className="px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 text-[10px] font-extrabold">
                          {getActionNowLabel(effectiveAction)}
                        </span>

                        {/* Floor Status */}
                        {isRemoved ? (
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                            Removed from floor
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                            On Floor
                          </span>
                        )}
                      </div>

                      {/* Identifiers */}
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
                        <span>Code: <strong className="font-mono text-slate-800 dark:text-slate-200">{item.bansalCode || item.hoBansalCode}</strong></span>
                        <span>•</span>
                        <span>Qty: <strong className="text-slate-900 dark:text-white font-bold">{item.nearExpiryStock ?? item.hoNearExpiryStock} units</strong></span>
                        <span>•</span>
                        <span>Expiry: <strong className="text-slate-900 dark:text-white">{formatDateDDMMYYYY(item.expiryDate || item.hoExpiryDate)}</strong></span>
                        <span>•</span>
                        <span>Left: <strong className={shelf.isExpired ? 'text-rose-600' : 'text-slate-700 dark:text-slate-300'}>{formatDisplayDays(shelf.pendingDays)}</strong> ({formatDisplayPct(shelf.pendingPct)})</span>
                      </div>

                      {/* Exact HO Remark & Due Condition */}
                      <div className="mt-1 p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                        <div>
                          <span className="text-[10px] font-bold uppercase text-slate-400 block">HO Remark:</span>
                          <span className="font-semibold text-slate-900 dark:text-white">"{item.hoRemark}"</span>
                        </div>

                        <div className="sm:text-right">
                          <span className="text-[10px] font-bold uppercase text-slate-400 block">Due Condition:</span>
                          <span className="font-bold text-indigo-700 dark:text-indigo-300">
                            {evaluation.actionDueFormatted ? `Due on ${evaluation.actionDueFormatted}` : evaluation.instruction}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-1.5 shrink-0 self-start mt-0.5">
                      {/* RETURN TO FLOOR button (Requirement 12) */}
                      {canReturnToFloor && (
                        <button
                          type="button"
                          onClick={() => setReturnToFloorItem(item)}
                          className="px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-xs font-bold flex items-center gap-1 cursor-pointer"
                          title="Return product to sales floor as instructed by HO"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Return to Floor</span>
                        </button>
                      )}

                      {/* Complete Action Button */}
                      <button
                        type="button"
                        onClick={() => setCompleteModalItem(item)}
                        className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1 cursor-pointer shadow-2xs"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Done</span>
                      </button>

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

      {/* Mark Complete Modal */}
      {completeModalItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-xs"
          onClick={() => setCompleteModalItem(null)}
        >
          <div
            className={`w-full max-w-md p-4 rounded-2xl border ${
              isDarkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900'
            } shadow-xl`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 text-emerald-600 mb-2">
              <ShieldCheck className="w-5 h-5" />
              <h3 className="font-bold text-sm">Mark HO Action Completed</h3>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 mb-3">
              Mark <strong>{completeModalItem.itemName}</strong> as completed for action{' '}
              <strong>"{completeModalItem.hoRemark}"</strong>?
            </p>

            <div className="space-y-1 mb-4">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                Completion Note (Optional)
              </label>
              <input
                type="text"
                value={completionNote}
                onChange={(e) => setCompletionNote(e.target.value)}
                placeholder="e.g. Debited via invoice #1234 or Sent via DC van"
                className={`w-full px-3 py-2 rounded-xl border text-xs ${
                  isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                }`}
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCompleteModalItem(null)}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmSingleComplete}
                className="px-4 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs cursor-pointer"
              >
                Mark Completed
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Complete Modal */}
      {bulkCompleteOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-xs"
          onClick={() => setBulkCompleteOpen(false)}
        >
          <div
            className={`w-full max-w-md p-4 rounded-2xl border ${
              isDarkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900'
            } shadow-xl`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 text-emerald-600 mb-2">
              <CheckCircle2 className="w-5 h-5" />
              <h3 className="font-bold text-sm">Bulk Mark Completed</h3>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 mb-3">
              Mark <strong>{selectedIds.size}</strong> selected products as completed?
            </p>

            <div className="space-y-1 mb-4">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                Bulk Completion Note (Optional)
              </label>
              <input
                type="text"
                value={completionNote}
                onChange={(e) => setCompletionNote(e.target.value)}
                placeholder="e.g. Transferred to DC batch #5"
                className={`w-full px-3 py-2 rounded-xl border text-xs ${
                  isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                }`}
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setBulkCompleteOpen(false)}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmBulkComplete}
                className="px-4 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs cursor-pointer"
              >
                Confirm All Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Return to Floor Modal (Requirement 12) */}
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
              Returning <strong>{returnToFloorItem.itemName}</strong> back to the sales floor will clear its physical removal status and move it to <strong>DO LATER</strong> until its new due condition is reached.
            </p>

            <div className="space-y-1 mb-4">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                Reason / Note
              </label>
              <input
                type="text"
                value={returnReason}
                onChange={(e) => setReturnReason(e.target.value)}
                placeholder="e.g. HO instruction: Continue sale till expiry"
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

      {/* Multiple Expiry Lots Disambiguation Modal */}
      {multipleLotsData && (
        <NearExpiryLotSelectorModal
          isOpen={Boolean(multipleLotsData)}
          onClose={() => setMultipleLotsData(null)}
          productName={multipleLotsData.productName}
          barcode={multipleLotsData.barcode}
          bansalCode={multipleLotsData.bansalCode}
          items={multipleLotsData.items}
          onSelectLot={(selectedLot) => {
            setDetailItem(selectedLot);
            setScannerFeedback({
              type: 'success',
              message: `✓ MATCHED LOT: Expiry ${formatDateDDMMYYYY(selectedLot.expiryDate)}`
            });
          }}
          isDarkMode={isDarkMode}
        />
      )}

      {/* Full Details Modal */}
      {detailItem && (
        <NearExpiryDetailsModal
          isOpen={Boolean(detailItem)}
          onClose={() => setDetailItem(null)}
          item={detailItem}
          isDarkMode={isDarkMode}
        />
      )}

      {/* Scanner feedback toast */}
      {scannerFeedback && (
        <div className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl text-xs font-bold shadow-lg animate-fade-in flex items-center gap-2 ${
          scannerFeedback.type === 'success'
            ? 'bg-emerald-600 text-white'
            : scannerFeedback.type === 'warning'
            ? 'bg-amber-600 text-white'
            : 'bg-rose-600 text-white'
        }`}>
          <span>{scannerFeedback.message}</span>
          <button
            type="button"
            onClick={() => setScannerFeedback(null)}
            className="p-0.5 hover:opacity-80"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};
