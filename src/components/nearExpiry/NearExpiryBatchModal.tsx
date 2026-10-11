import React, { useState } from 'react';
import {
  Calendar,
  Plus,
  CheckCircle2,
  X,
  Layers,
  Trash2,
  ArrowRight
} from 'lucide-react';
import { NearExpiryBatch } from '../../types';
import { createNewBatch } from '../../utils/nearExpiryStorage';
import { deleteNearExpiryBatchDB } from '../../utils/indexedDB';

interface NearExpiryBatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  batches: NearExpiryBatch[];
  activeBatch: NearExpiryBatch;
  onSelectBatch: (batch: NearExpiryBatch) => void;
  onBatchesUpdated: (batches: NearExpiryBatch[], newActive: NearExpiryBatch) => void;
  onDeleteAllNearExpiry?: () => void;
  isDarkMode?: boolean;
}

export const NearExpiryBatchModal: React.FC<NearExpiryBatchModalProps> = ({
  isOpen,
  onClose,
  batches,
  activeBatch,
  onSelectBatch,
  onBatchesUpdated,
  onDeleteAllNearExpiry,
  isDarkMode = false
}) => {
  const [isCreating, setIsCreating] = useState(false);
  const [newBatchName, setNewBatchName] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  if (!isOpen) return null;

  const handleCreateNew = async () => {
    if (!newBatchName.trim()) return;
    setIsProcessing(true);
    try {
      const storeName = activeBatch.storeName && activeBatch.storeName !== 'Store 1' ? activeBatch.storeName : 'PATAN';
      const created = await createNewBatch(newBatchName, storeName, activeBatch.storeId || 'store_1');
      const updated = [created, ...batches];
      onBatchesUpdated(updated, created);
      setIsCreating(false);
      setNewBatchName('');
    } catch (err) {
      console.error('Failed to create batch:', err);
      alert('Error creating new batch.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteBatch = async (b: NearExpiryBatch) => {
    if (batches.length <= 1) {
      alert('Cannot delete the only remaining batch.');
      return;
    }
    if (!confirm(`Are you sure you want to delete "${b.name}" and all its near expiry items?`)) {
      return;
    }

    try {
      await deleteNearExpiryBatchDB(b.id);
      const remaining = batches.filter((item) => item.id !== b.id);
      const nextActive = activeBatch.id === b.id ? remaining[0] : activeBatch;
      onBatchesUpdated(remaining, nextActive);
    } catch (err) {
      console.error('Failed to delete batch:', err);
      alert('Error deleting batch.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
      <div
        className={`w-full max-w-md p-3.5 sm:p-4 rounded-2xl border shadow-xl ${
          isDarkMode
            ? 'bg-slate-900 border-slate-800 text-white'
            : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        <div className="flex items-center justify-between pb-2.5 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <div className="p-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-800/60">
              <Calendar className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Near Expiry Fortnight Batches
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Create new batch section */}
        {isCreating ? (
          <div className="mt-2.5 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 space-y-2">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
              New Fortnight Name:
            </label>
            <input
              type="text"
              value={newBatchName}
              onChange={(e) => setNewBatchName(e.target.value)}
              placeholder="e.g. Fortnight 2 - Sep 2026"
              className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-semibold ${
                isDarkMode
                  ? 'bg-slate-800 border-slate-700 text-white'
                  : 'bg-white border-slate-300 text-slate-900'
              } focus:outline-hidden focus:border-indigo-500`}
            />
            <div className="flex items-center gap-2 pt-0.5">
              <button
                type="button"
                onClick={handleCreateNew}
                disabled={!newBatchName.trim() || isProcessing}
                className="flex-1 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold disabled:opacity-50 cursor-pointer shadow-xs"
              >
                Create Batch
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsCreating(false);
                  setNewBatchName('');
                }}
                className="py-1.5 px-3 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-2.5">
            <button
              type="button"
              onClick={() => setIsCreating(true)}
              className="w-full min-h-[36px] py-1.5 px-3 rounded-xl border border-dashed border-indigo-400 dark:border-indigo-600 text-indigo-600 dark:text-indigo-400 text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 cursor-pointer transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create New Fortnight Batch</span>
            </button>
          </div>
        )}

        {/* List of Batches */}
        <div className="mt-3 space-y-1.5 max-h-60 overflow-y-auto">
          {batches.map((b) => {
            const isSelected = b.id === activeBatch.id;
            return (
              <div
                key={b.id}
                className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 transition-all shadow-xs ${
                  isSelected
                    ? 'border-indigo-600 bg-indigo-50/60 dark:bg-indigo-950/40 dark:border-indigo-500 ring-1 ring-indigo-500'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 bg-white dark:bg-slate-900'
                }`}
              >
                <div
                  className="min-w-0 flex-1 cursor-pointer"
                  onClick={() => {
                    onSelectBatch(b);
                    onClose();
                  }}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-xs sm:text-[13px] text-slate-900 dark:text-white truncate">
                      {b.name}
                    </span>
                    {isSelected && (
                      <span className="px-1.5 py-0.2 text-[9px] font-extrabold rounded-md bg-indigo-600 text-white">
                        ACTIVE
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5 flex gap-2">
                    <span>Store: {b.storeName && b.storeName !== 'Store 1' ? b.storeName : 'PATAN'}</span>
                    <span>• Status: {b.status}</span>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {!isSelected && (
                    <button
                      type="button"
                      onClick={() => {
                        onSelectBatch(b);
                        onClose();
                      }}
                      className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 cursor-pointer shadow-xs"
                    >
                      Switch
                    </button>
                  )}

                  {batches.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleDeleteBatch(b)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 cursor-pointer rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                      title="Delete batch"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-3 pt-2.5 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
          {onDeleteAllNearExpiry && (
            <button
              type="button"
              onClick={onDeleteAllNearExpiry}
              className="text-xs font-semibold text-rose-600 hover:text-rose-700 dark:text-rose-400 flex items-center gap-1 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete All</span>
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 ml-auto rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-bold text-slate-800 dark:text-slate-200 cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
