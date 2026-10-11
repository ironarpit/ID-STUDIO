import React, { useState, useMemo } from 'react';
import {
  Archive,
  CheckCircle2,
  RotateCcw,
  Search,
  Eye,
  AlertTriangle,
  Calendar,
  Layers
} from 'lucide-react';
import { NearExpiryBatch, NearExpiryItem } from '../../types';
import { formatDateDDMMYYYY, getActionNowLabel } from '../../utils/nearExpiryEngine';
import { normalizeLocalCode, normalizeScannedBarcode } from '../../utils/barcodeResolver';
import { revertItemCompletion } from '../../utils/nearExpiryStorage';
import { NearExpiryDetailsModal } from './NearExpiryDetailsModal';

interface NearExpiryCompletedProps {
  batch: NearExpiryBatch;
  items: NearExpiryItem[];
  onItemsChange: (items: NearExpiryItem[]) => void;
  isDarkMode?: boolean;
}

export const NearExpiryCompleted: React.FC<NearExpiryCompletedProps> = ({
  batch,
  items,
  onItemsChange,
  isDarkMode = false
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [detailItem, setDetailItem] = useState<NearExpiryItem | null>(null);
  const [revertItem, setRevertItem] = useState<NearExpiryItem | null>(null);

  // Show ONLY genuinely completed HO actions (Requirement 14)
  // Floor removal alone does not mean the final HO action is completed!
  const completedItems = useMemo(() => {
    return items.filter(
      (it) => it.completedAt || it.status === 'COMPLETED' || it.executionStatus === 'COMPLETED'
    );
  }, [items]);

  // Filter by search term
  const filteredItems = useMemo(() => {
    if (!searchTerm.trim()) return completedItems;
    const query = searchTerm.trim().toLowerCase();
    const norm = normalizeLocalCode(query);
    const normBar = normalizeScannedBarcode(query);

    return completedItems.filter((it) => {
      const code = normalizeLocalCode(it.bansalCode || it.hoBansalCode);
      const barcode = normalizeScannedBarcode(it.barcode || it.hoEanCode);
      const name = (it.itemName || it.hoItemName || '').toLowerCase();
      const remark = (it.hoRemark || '').toLowerCase();

      return (
        (norm && code === norm) ||
        (normBar && barcode === normBar) ||
        name.includes(query) ||
        remark.includes(query)
      );
    });
  }, [completedItems, searchTerm]);

  // Confirm Reversal (Requirement 14: allow safe reversal only after confirmation)
  const handleConfirmReversal = async () => {
    if (!revertItem) return;
    const updated = await revertItemCompletion(items, revertItem.id);
    onItemsChange(updated);
    setRevertItem(null);
  };

  return (
    <div className="space-y-3.5 max-w-5xl mx-auto">
      {/* Header & Stats Bar */}
      <div
        className={`p-3 sm:p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
          isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
        } shadow-xs`}
      >
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-emerald-600 text-white">
            <Archive className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
              Completed Actions
            </h2>
            <p className="text-[11px] text-slate-500">
              {completedItems.length} action{completedItems.length === 1 ? '' : 's'} completed in {batch.name}
            </p>
          </div>
        </div>

        {/* Search Input */}
        <div className="relative min-w-[220px]">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search completed records..."
            className={`w-full pl-8 pr-3 py-1.5 rounded-xl border text-xs ${
              isDarkMode
                ? 'bg-slate-800 border-slate-700 text-white'
                : 'bg-slate-50 border-slate-300 text-slate-900'
            } focus:outline-hidden focus:border-emerald-500`}
          />
        </div>
      </div>

      {/* Completed Records List */}
      <div
        className={`rounded-2xl border overflow-hidden ${
          isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
        } shadow-xs`}
      >
        {filteredItems.length === 0 ? (
          <div className="p-10 text-center text-slate-400 text-xs">
            {completedItems.length === 0
              ? 'No completed actions yet. Execute instructions in "HO ACTIONS" to complete them.'
              : 'No completed records match your search.'}
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {filteredItems.map((it) => (
              <div
                key={it.id}
                className="p-3 sm:px-4 sm:py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs hover:bg-slate-50 dark:hover:bg-slate-800/40"
              >
                {/* Left: Product & Lot info */}
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-extrabold text-sm text-slate-900 dark:text-white">
                      {it.itemName || it.hoItemName}
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 text-[10px] font-extrabold">
                      {getActionNowLabel(it.actionType || 'COMPLETED')}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-slate-500 dark:text-slate-400">
                    <span>Code: <strong className="font-mono text-slate-700 dark:text-slate-300">{it.bansalCode || it.hoBansalCode}</strong></span>
                    <span>•</span>
                    <span>Lot / Expiry: <strong className="text-slate-800 dark:text-slate-200">{formatDateDDMMYYYY(it.expiryDate || it.hoExpiryDate)}</strong></span>
                    <span>•</span>
                    <span>Qty: <strong className="text-slate-900 dark:text-white">{it.nearExpiryStock ?? it.hoNearExpiryStock} units</strong></span>
                  </div>

                  {/* HO Remark & Completion Note */}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5 text-[11px]">
                    <span className="text-slate-600 dark:text-slate-300">
                      HO Instruction: <strong>"{it.hoRemark || 'Manual Complete'}"</strong>
                    </span>
                    {it.notes && (
                      <span className="text-indigo-600 dark:text-indigo-400 font-medium">
                        Note: {it.notes}
                      </span>
                    )}
                  </div>
                </div>

                {/* Right: Timestamp & Actions */}
                <div className="flex items-center gap-2 shrink-0 self-start sm:self-center">
                  <div className="text-right text-[11px] text-slate-500 mr-1">
                    <div className="font-bold text-emerald-600 dark:text-emerald-400">
                      Completed
                    </div>
                    <div>
                      {it.completedAt ? new Date(it.completedAt).toLocaleString('en-GB') : 'Yes'}
                    </div>
                  </div>

                  {/* Reversal button (Requirement 14: allow safe reversal only after confirmation) */}
                  <button
                    type="button"
                    onClick={() => setRevertItem(it)}
                    className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-rose-50 hover:border-rose-300 hover:text-rose-700 text-slate-600 dark:text-slate-300 text-xs font-semibold flex items-center gap-1 cursor-pointer transition-all"
                    title="Undo completion and restore to active HO Actions"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Revert</span>
                  </button>

                  {/* View Details */}
                  <button
                    type="button"
                    onClick={() => setDetailItem(it)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                    title="View Full Details"
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Reversal Confirmation Modal */}
      {revertItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-xs"
          onClick={() => setRevertItem(null)}
        >
          <div
            className={`w-full max-w-sm p-4 rounded-2xl border ${
              isDarkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900'
            } shadow-xl`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 text-rose-600 mb-2">
              <AlertTriangle className="w-5 h-5" />
              <h3 className="font-bold text-sm">Revert Completed Action?</h3>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300">
              Reverting <strong>{revertItem.itemName}</strong> will remove its completed status and move it back to active HO Actions.
            </p>

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRevertItem(null)}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmReversal}
                className="px-4 py-1.5 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-xs cursor-pointer"
              >
                Revert to Active
              </button>
            </div>
          </div>
        </div>
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
    </div>
  );
};
