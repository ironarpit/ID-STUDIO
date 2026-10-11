import React, { useState, useEffect } from 'react';
import {
  Calendar,
  PlusCircle,
  FileSpreadsheet,
  Upload,
  CheckCircle2,
  Clock,
  Layers,
  ArrowLeft,
  ChevronDown,
  RefreshCw,
  Sparkles,
  Archive,
  Trash2,
  AlertTriangle,
  X
} from 'lucide-react';
import { Product, NearExpiryBatch, NearExpiryItem } from '../../types';
import { getOrCreateActiveBatch, loadBatchItems, clearAllNearExpiryData } from '../../utils/nearExpiryStorage';
import { calculateShelfLife, evaluateItemStatus } from '../../utils/nearExpiryEngine';
import { NearExpiryPrepareList } from './NearExpiryPrepareList';
import { NearExpiryFloorRemoval } from './NearExpiryFloorRemoval';
import { NearExpiryHoActions } from './NearExpiryHoActions';
import { NearExpiryCompleted } from './NearExpiryCompleted';
import { NearExpiryHoUploadModal } from './NearExpiryHoUploadModal';
import { NearExpiryBatchModal } from './NearExpiryBatchModal';
import { NearExpiryImportModal } from './NearExpiryImportModal';

export type NearExpiryTab = 'PREPARE' | 'FLOOR_REMOVAL' | 'HO_ACTIONS' | 'COMPLETED';

interface NearExpiryHubProps {
  products: Product[];
  onBack?: () => void;
  isDarkMode?: boolean;
}

export const NearExpiryHub: React.FC<NearExpiryHubProps> = ({
  products,
  onBack,
  isDarkMode = false
}) => {
  const [activeTab, setActiveTab] = useState<NearExpiryTab>('PREPARE');
  const [isLoading, setIsLoading] = useState(true);

  // Batches and Active Batch state
  const [batches, setBatches] = useState<NearExpiryBatch[]>([]);
  const [activeBatch, setActiveBatch] = useState<NearExpiryBatch | null>(null);
  const [items, setItems] = useState<NearExpiryItem[]>([]);

  // Modals
  const [isHoUploadOpen, setIsHoUploadOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [isDeleteAllOpen, setIsDeleteAllOpen] = useState(false);
  const [isDeletingAll, setIsDeletingAll] = useState(false);

  // Initialize and load active batch
  useEffect(() => {
    let isMounted = true;
    async function init() {
      setIsLoading(true);
      try {
        const { activeBatch: batch, allBatches } = await getOrCreateActiveBatch();
        if (!isMounted) return;
        setBatches(allBatches);
        setActiveBatch(batch);

        const loadedItems = await loadBatchItems(batch.id);
        if (!isMounted) return;
        setItems(loadedItems);
      } catch (err) {
        console.error('Error initializing Near Expiry:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }
    init();
    return () => {
      isMounted = false;
    };
  }, []);

  // When active batch changes, load items for that batch
  const handleSelectBatch = async (batch: NearExpiryBatch) => {
    setActiveBatch(batch);
    setIsLoading(true);
    try {
      const loadedItems = await loadBatchItems(batch.id);
      setItems(loadedItems);
    } catch (err) {
      console.error('Error loading items for batch:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmDeleteAll = async () => {
    setIsDeletingAll(true);
    try {
      const { activeBatch: freshBatch, allBatches: freshBatches } = await clearAllNearExpiryData(
        activeBatch?.storeName && activeBatch.storeName !== 'Store 1' ? activeBatch.storeName : 'PATAN',
        activeBatch?.storeId || 'store_1'
      );
      setBatches(freshBatches);
      setActiveBatch(freshBatch);
      setItems([]);
      setActiveTab('PREPARE');
      setIsDeleteAllOpen(false);
    } catch (err) {
      console.error('Failed to clear Near Expiry data:', err);
      alert('Error clearing data.');
    } finally {
      setIsDeletingAll(false);
    }
  };

  if (isLoading || !activeBatch) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] p-8 text-center">
        <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin mb-3" />
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">
          Loading Near Expiry Offline Hub...
        </h3>
        <p className="text-xs text-slate-500 mt-1">
          Accessing local IndexedDB storage
        </p>
      </div>
    );
  }

  // Count metrics for 4 tabs
  const removeTodayCount = items.filter((it) => {
    const shelf = calculateShelfLife(it.mfgDate || it.hoMfgDate, it.expiryDate || it.hoExpiryDate);
    const isDue = shelf.pendingPct <= 5 || shelf.isExpired;
    const isSent = Boolean(it.floorRemovalSentAt || it.floorRemovalStatus === 'SENT');
    const isRemoved = Boolean(it.floorRemovalRemovedAt || it.floorRemovalStatus === 'REMOVED');
    return isDue && !isSent && !isRemoved;
  }).length;

  const hoDoNowCount = items.filter((it) => {
    if (it.completedAt || it.status === 'COMPLETED') return false;
    if (!it.hoRemark) return false;
    return evaluateItemStatus(it).status === 'ACTION_REQUIRED';
  }).length;

  const completedCount = items.filter(
    (it) => it.completedAt || it.status === 'COMPLETED' || it.executionStatus === 'COMPLETED'
  ).length;

  return (
    <div className="w-full max-w-7xl mx-auto space-y-3 pb-16">
      {/* 1. Header Bar with Back Navigation & Batch Switcher & Reset Button */}
      <div
        className={`p-3 sm:p-4 rounded-2xl border ${
          isDarkMode
            ? 'bg-slate-900 border-slate-800 text-white'
            : 'bg-white border-slate-200 text-slate-900'
        } shadow-xs`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-all cursor-pointer"
                title="Back to Floor IQ"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md bg-indigo-600 text-white tracking-wider">
                  Floor IQ
                </span>
                <span className="text-xs font-bold text-slate-500">
                  Near Expiry Hub
                </span>
              </div>
              <h1 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white tracking-tight leading-tight">
                Near Expiry Hub
              </h1>
            </div>
          </div>

          {/* Action buttons on Right */}
          <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
            {/* Batch Selector Capsule */}
            <button
              type="button"
              onClick={() => setIsBatchModalOpen(true)}
              className="min-h-[40px] px-3 py-1.5 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50/70 hover:bg-indigo-100/70 dark:bg-indigo-950/40 dark:hover:bg-indigo-900/50 text-indigo-900 dark:text-indigo-200 text-xs font-bold flex items-center gap-2 transition-all cursor-pointer"
            >
              <Calendar className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <div className="text-left">
                <div className="text-[10px] uppercase text-indigo-500 font-bold">
                  Active Fortnight:
                </div>
                <div className="font-extrabold text-xs leading-none">
                  {activeBatch.name}
                </div>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-indigo-500 ml-1" />
            </button>

            {/* Clear All Near Expiry Data Button */}
            <button
              type="button"
              onClick={() => setIsDeleteAllOpen(true)}
              className="min-h-[40px] px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 hover:bg-rose-50 hover:border-rose-300 dark:bg-slate-800/60 dark:hover:bg-rose-950/40 dark:hover:border-rose-800 text-slate-600 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
              title="Delete all Near Expiry batches and product data"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Delete All Data</span>
            </button>
          </div>
        </div>

        {/* 2. Top Navigation Tabs (Exact Four-Stage Workflow) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
          {/* Stage 1: PREPARE LIST */}
          <button
            type="button"
            onClick={() => setActiveTab('PREPARE')}
            className={`min-h-[44px] px-2.5 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'PREPARE'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <PlusCircle className="w-4 h-4 shrink-0" />
            <div className="text-left">
              <span className="block text-[9px] uppercase tracking-wider opacity-80 leading-none">Stage 1</span>
              <span className="font-extrabold text-xs">PREPARE LIST</span>
            </div>
            <span
              className={`ml-auto px-1.5 py-0.5 text-[10px] font-extrabold rounded-full ${
                activeTab === 'PREPARE'
                  ? 'bg-white text-indigo-700'
                  : 'bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-200'
              }`}
            >
              {items.length}
            </span>
          </button>

          {/* Stage 2: FLOOR REMOVAL */}
          <button
            type="button"
            onClick={() => setActiveTab('FLOOR_REMOVAL')}
            className={`min-h-[44px] px-2.5 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'FLOOR_REMOVAL'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <Layers className="w-4 h-4 shrink-0" />
            <div className="text-left">
              <span className="block text-[9px] uppercase tracking-wider opacity-80 leading-none">Stage 2</span>
              <span className="font-extrabold text-xs">FLOOR REMOVAL</span>
            </div>
            {removeTodayCount > 0 && (
              <span
                className={`ml-auto px-1.5 py-0.5 text-[10px] font-extrabold rounded-full ${
                  activeTab === 'FLOOR_REMOVAL'
                    ? 'bg-amber-400 text-slate-900'
                    : 'bg-amber-500 text-white'
                }`}
                title="Products due for removal (≤ 5% shelf life or expired)"
              >
                {removeTodayCount}
              </span>
            )}
          </button>

          {/* Stage 3: HO ACTIONS */}
          <button
            type="button"
            onClick={() => setActiveTab('HO_ACTIONS')}
            className={`min-h-[44px] px-2.5 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'HO_ACTIONS'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <div className="text-left">
              <span className="block text-[9px] uppercase tracking-wider opacity-80 leading-none">Stage 3</span>
              <span className="font-extrabold text-xs">HO ACTIONS</span>
            </div>
            {hoDoNowCount > 0 && (
              <span
                className={`ml-auto px-1.5 py-0.5 text-[10px] font-extrabold rounded-full ${
                  activeTab === 'HO_ACTIONS'
                    ? 'bg-white text-rose-700'
                    : 'bg-rose-500 text-white'
                }`}
              >
                {hoDoNowCount}
              </span>
            )}
          </button>

          {/* Stage 4: COMPLETED */}
          <button
            type="button"
            onClick={() => setActiveTab('COMPLETED')}
            className={`min-h-[44px] px-2.5 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'COMPLETED'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <Archive className="w-4 h-4 shrink-0" />
            <div className="text-left">
              <span className="block text-[9px] uppercase tracking-wider opacity-80 leading-none">Stage 4</span>
              <span className="font-extrabold text-xs">COMPLETED</span>
            </div>
            {completedCount > 0 && (
              <span
                className={`ml-auto px-1.5 py-0.5 text-[10px] font-extrabold rounded-full ${
                  activeTab === 'COMPLETED'
                    ? 'bg-white text-emerald-700'
                    : 'bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-200'
                }`}
              >
                {completedCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* 3. Main Active Content View (Clean 4 Stages) */}
      {activeTab === 'PREPARE' && (
        <NearExpiryPrepareList
          batch={activeBatch}
          items={items}
          onItemsChange={setItems}
          stockProducts={products}
          onOpenImportModal={() => setIsImportModalOpen(true)}
          onBatchUpdated={(updatedBatch) => {
            setActiveBatch(updatedBatch);
            setBatches((prev) => prev.map((b) => (b.id === updatedBatch.id ? updatedBatch : b)));
          }}
          isDarkMode={isDarkMode}
        />
      )}

      {activeTab === 'FLOOR_REMOVAL' && (
        <NearExpiryFloorRemoval
          batch={activeBatch}
          items={items}
          onItemsChange={setItems}
          stockProducts={products}
          isDarkMode={isDarkMode}
        />
      )}

      {activeTab === 'HO_ACTIONS' && (
        <NearExpiryHoActions
          batch={activeBatch}
          items={items}
          onItemsChange={setItems}
          onOpenHoUploadModal={() => setIsHoUploadOpen(true)}
          isDarkMode={isDarkMode}
        />
      )}

      {activeTab === 'COMPLETED' && (
        <NearExpiryCompleted
          batch={activeBatch}
          items={items}
          onItemsChange={setItems}
          isDarkMode={isDarkMode}
        />
      )}

      {/* 4. Import Near Expiry List Modal (for selected batch) */}
      <NearExpiryImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        batch={activeBatch}
        items={items}
        stockProducts={products}
        onImportComplete={(updatedItems, updatedBatch) => {
          setItems(updatedItems);
          setActiveBatch(updatedBatch);
          setActiveTab('PREPARE');
        }}
        isDarkMode={isDarkMode}
      />

      {/* 5. HO Upload Modal */}
      <NearExpiryHoUploadModal
        isOpen={isHoUploadOpen}
        onClose={() => setIsHoUploadOpen(false)}
        batch={activeBatch}
        items={items}
        stockProducts={products}
        onImportComplete={(updatedItems, updatedBatch) => {
          setItems(updatedItems);
          setActiveBatch(updatedBatch);
          setActiveTab('HO_ACTIONS'); // Direct user to execution screen immediately
        }}
        isDarkMode={isDarkMode}
      />

      {/* 6. Batch Selection & Creation Modal */}
      <NearExpiryBatchModal
        isOpen={isBatchModalOpen}
        onClose={() => setIsBatchModalOpen(false)}
        batches={batches}
        activeBatch={activeBatch}
        onSelectBatch={handleSelectBatch}
        onBatchesUpdated={(updatedBatches, newActive) => {
          setBatches(updatedBatches);
          handleSelectBatch(newActive);
        }}
        isDarkMode={isDarkMode}
      />

      {/* 7. Confirm Delete All Near Expiry Data Modal */}
      {isDeleteAllOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-xs"
          onClick={() => !isDeletingAll && setIsDeleteAllOpen(false)}
        >
          <div
            className={`w-full max-w-md p-5 rounded-2xl border ${
              isDarkMode
                ? 'bg-slate-900 border-slate-800 text-white'
                : 'bg-white border-slate-200 text-slate-900'
            } shadow-2xl space-y-4`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 text-rose-600">
              <div className="p-2.5 rounded-xl bg-rose-100 dark:bg-rose-950/60">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-black">
                  Clear All Near Expiry Data?
                </h3>
                <p className="text-xs text-slate-500">
                  Permanent action for offline storage
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              This will remove all fortnight batches and product entries from your browser's IndexedDB. A fresh empty batch will be created.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                disabled={isDeletingAll}
                onClick={() => setIsDeleteAllOpen(false)}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeletingAll}
                onClick={handleConfirmDeleteAll}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-xs cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                {isDeletingAll ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Clearing...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Yes, Clear Everything</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

