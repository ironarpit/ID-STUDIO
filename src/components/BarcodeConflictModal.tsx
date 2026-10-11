import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  X,
  AlertTriangle,
  ArrowRight,
  Tag,
  Package,
  Search,
  CheckCircle2,
  BookmarkCheck,
  Zap,
  Info,
  Layers,
  AlertOctagon
} from 'lucide-react';
import {
  Product,
  BarcodeCandidateProduct,
  BarcodeMasterIdentity,
  BarcodeOverride
} from '../types';
import { useModalTransition } from '../utils/useModalTransition';
import { searchProductsFlexible, normalizeLocalCode } from '../utils/barcodeResolver';

interface BarcodeConflictModalProps {
  isOpen: boolean;
  onClose: () => void;
  barcode: string;
  candidates?: Product[];
  candidateDetails?: BarcodeCandidateProduct[];
  masterIdentity?: BarcodeMasterIdentity;
  overrideIdentity?: BarcodeOverride;
  isStaleOverride?: boolean;
  onSelectCandidate: (candidate: Product, alwaysUse: boolean) => void;
  stockProducts?: Product[];
  title?: string;
  isDarkMode?: boolean;
}

export const BarcodeConflictModal: React.FC<BarcodeConflictModalProps> = ({
  isOpen,
  onClose,
  barcode,
  candidates = [],
  candidateDetails,
  masterIdentity,
  overrideIdentity,
  isStaleOverride = false,
  onSelectCandidate,
  stockProducts = [],
  title = 'Barcode Mapping Conflict',
  isDarkMode = false
}) => {
  const { handleClose, backdropClass, panelClass } = useModalTransition({
    onClose,
    isOpen,
    duration: 170
  });

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [activeTab, setActiveTab] = useState<'candidates' | 'search'>('candidates');
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Merge candidates with candidateDetails
  const displayCandidates: BarcodeCandidateProduct[] = useMemo(() => {
    if (candidateDetails && candidateDetails.length > 0) {
      return candidateDetails;
    }

    return candidates.map((p, idx) => {
      const isFirst = idx === 0;
      return {
        product: p,
        reason: isFirst ? 'Name + UOM Match' : 'Multiple Stock Match',
        badge: isFirst ? 'RECOMMENDED' : 'MATCH',
        isRecommended: isFirst,
        uom: p.unit
      };
    });
  }, [candidateDetails, candidates]);

  // Initial selection: do not preselect conflicting product; if a recommended candidate exists, preselect it
  useEffect(() => {
    if (isOpen) {
      const rec = displayCandidates.find((c) => c.isRecommended);
      if (rec) {
        setSelectedProduct(rec.product);
      } else if (displayCandidates.length > 0 && displayCandidates[0].badge !== 'CONFLICT') {
        setSelectedProduct(displayCandidates[0].product);
      } else {
        setSelectedProduct(null);
      }
      setActiveTab('candidates');
      setSearchQuery('');
    }
  }, [isOpen, displayCandidates]);

  // Filtered products for manual search tab
  const searchResults = useMemo(() => {
    if (!searchQuery.trim() || stockProducts.length === 0) return [];
    return searchProductsFlexible(searchQuery, stockProducts, { limit: 12 });
  }, [searchQuery, stockProducts]);

  if (!isOpen) return null;

  const handleConfirmSelection = (alwaysUse: boolean) => {
    if (!selectedProduct) return;
    onSelectCandidate(selectedProduct, alwaysUse);
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs ${backdropClass}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div
        className={`w-full max-w-xl rounded-2xl shadow-2xl border flex flex-col max-h-[92vh] overflow-hidden mobile-bottom-sheet ${panelClass} ${
          isDarkMode ? 'bg-slate-900 border-slate-750 text-white' : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        {/* Header */}
        <div
          className={`px-4 py-3.5 sm:px-5 sm:py-4 border-b flex items-center justify-between shrink-0 ${
            isDarkMode ? 'border-slate-800 bg-slate-900' : 'border-slate-100 bg-slate-50'
          }`}
        >
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 border border-amber-500/30">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-black tracking-tight uppercase leading-tight truncate">
                {title}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-mono truncate">
                Scanned: <span className="font-bold text-indigo-600 dark:text-indigo-400">{barcode}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 sm:p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            title="Cancel"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Master Identity Card or Stale Override Warning */}
        {masterIdentity && (
          <div
            className={`px-4 py-2.5 sm:px-5 sm:py-3 border-b text-xs flex flex-col gap-1 shrink-0 ${
              isDarkMode ? 'bg-indigo-950/30 border-slate-800' : 'bg-indigo-50/60 border-indigo-100'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold text-indigo-900 dark:text-indigo-200 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                Barcode Master Identifies:
              </span>
              <span className="font-mono text-[11px] font-bold text-slate-600 dark:text-slate-300">
                Old Code: {masterIdentity.code}
              </span>
            </div>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-black text-slate-900 dark:text-white text-xs sm:text-sm">
                {masterIdentity.itemName}
              </span>
              {masterIdentity.uom && (
                <span className="px-2 py-0.5 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-semibold text-slate-700 dark:text-slate-300 text-[11px]">
                  UOM: {masterIdentity.uom}
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5 leading-snug">
              The old mapped code now belongs to a different product in Current Stock. Select the correct current product.
            </p>
          </div>
        )}

        {isStaleOverride && overrideIdentity && (
          <div className="px-4 py-2.5 sm:px-5 sm:py-3 bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-800 text-xs flex items-start gap-2 text-amber-800 dark:text-amber-200">
            <AlertOctagon className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">Saved Override is Stale:</span> Target product identity has changed or was removed in latest stock file. Please re-assign or select below.
            </div>
          </div>
        )}

        {/* Tab Switcher: Candidates vs Search All Stock */}
        <div className="px-4 pt-2.5 pb-1 flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 shrink-0 bg-slate-50/50 dark:bg-slate-900/50">
          <button
            type="button"
            onClick={() => setActiveTab('candidates')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'candidates'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Suggested Candidates ({displayCandidates.length})</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('search');
              setTimeout(() => searchInputRef.current?.focus(), 50);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'search'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'
            }`}
          >
            <Search className="w-3.5 h-3.5" />
            <span>Search Current Products</span>
          </button>
        </div>

        {/* Content Area */}
        <div className="p-3 sm:p-4 overflow-y-auto space-y-2.5 flex-1 min-h-[180px]">
          {activeTab === 'candidates' ? (
            displayCandidates.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">
                No candidate products found. Use "Search Current Products" tab to locate by name or code.
              </div>
            ) : (
              displayCandidates.map((cand, idx) => {
                const p = cand.product;
                const isSelected = selectedProduct?.id === p.id || selectedProduct?.code === p.code;
                const code = p.bansalCode || p.localCode || p.code || 'N/A';
                const currentBarcode = p.barcode || 'N/A';
                const stock = p.stock ?? p.closingStock ?? 0;
                const mrp = p.mrp ?? 0;
                const uom = cand.uom || p.unit || 'N/A';

                const isConflict = cand.badge === 'CONFLICT' || cand.reason.includes('Mismatch');
                const isRec = cand.badge === 'RECOMMENDED' || cand.isRecommended;

                return (
                  <div
                    key={p.id || `${code}-${idx}`}
                    onClick={() => setSelectedProduct(p)}
                    className={`p-3 sm:p-3.5 rounded-xl border transition-all cursor-pointer relative ${
                      isSelected
                        ? isDarkMode
                          ? 'bg-indigo-950/40 border-indigo-500 shadow-md ring-1 ring-indigo-500/50'
                          : 'bg-indigo-50/50 border-indigo-500 shadow-md ring-1 ring-indigo-500/50'
                        : isDarkMode
                        ? 'bg-slate-800/80 border-slate-700 hover:border-slate-600'
                        : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1.5 flex-1 min-w-0">
                        {/* Badges & Reason */}
                        <div className="flex flex-wrap items-center gap-1.5">
                          {isRec && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                              <CheckCircle2 className="w-3 h-3" />
                              RECOMMENDED
                            </span>
                          )}
                          {isConflict && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-800">
                              <AlertTriangle className="w-3 h-3" />
                              CONFLICT
                            </span>
                          )}
                          {!isRec && !isConflict && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                              {cand.badge}
                            </span>
                          )}
                          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                            • {cand.reason}
                          </span>
                        </div>

                        {/* Item Name */}
                        <div className="font-bold text-sm leading-snug line-clamp-2 text-slate-900 dark:text-white">
                          {p.name || p.itemName || 'Unnamed Item'}
                        </div>

                        {/* Meta Pills: Code, Barcode, UOM */}
                        <div className="flex flex-wrap items-center gap-2 text-xs font-mono pt-0.5">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-bold border border-indigo-200 dark:border-indigo-800">
                            <Tag className="w-3 h-3" />
                            Code: {code}
                          </span>

                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                            Barcode: {currentBarcode}
                          </span>

                          <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 text-[11px] font-sans">
                            UOM: {uom}
                          </span>
                        </div>

                        {/* Stock & MRP */}
                        <div className="flex items-center gap-4 pt-1 text-xs">
                          <div className="flex items-center gap-1">
                            <span className="text-slate-500 dark:text-slate-400">Current Stock:</span>
                            <span
                              className={`font-black ${
                                stock > 0
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-rose-500 dark:text-rose-400'
                              }`}
                            >
                              {stock.toLocaleString('en-IN')}
                            </span>
                          </div>

                          <div className="flex items-center gap-1">
                            <span className="text-slate-500 dark:text-slate-400">MRP:</span>
                            <span className="font-bold text-slate-900 dark:text-white">
                              ₹{mrp.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Selection Indicator */}
                      <div className="shrink-0 pt-1">
                        <div
                          className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                            isSelected
                              ? 'border-indigo-600 bg-indigo-600 text-white'
                              : 'border-slate-300 dark:border-slate-600'
                          }`}
                        >
                          {isSelected && <div className="w-2 h-2 rounded-full bg-white" />}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )
          ) : (
            <div className="space-y-3">
              {/* Search input */}
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by product name, Bansal code, or exact barcode..."
                  className="w-full pl-9 pr-4 py-2 rounded-xl text-xs sm:text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500 font-sans"
                />
              </div>

              {/* Search Results */}
              <div className="space-y-2">
                {searchQuery.trim() && searchResults.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-500">
                    No products matching "{searchQuery}".
                  </div>
                ) : (
                  searchResults.map((p, idx) => {
                    const isSelected = selectedProduct?.id === p.id || selectedProduct?.code === p.code;
                    const code = p.bansalCode || p.localCode || p.code || 'N/A';
                    const currentBarcode = p.barcode || 'N/A';
                    const stock = p.stock ?? p.closingStock ?? 0;
                    const mrp = p.mrp ?? 0;
                    const uom = p.unit || 'N/A';

                    return (
                      <div
                        key={p.id || `${code}-${idx}`}
                        onClick={() => setSelectedProduct(p)}
                        className={`p-3 rounded-xl border transition-all cursor-pointer ${
                          isSelected
                            ? isDarkMode
                              ? 'bg-indigo-950/40 border-indigo-500 ring-1 ring-indigo-500/50'
                              : 'bg-indigo-50/50 border-indigo-500 ring-1 ring-indigo-500/50'
                            : isDarkMode
                            ? 'bg-slate-800/80 border-slate-700 hover:border-slate-600'
                            : 'bg-white border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1 flex-1 min-w-0">
                            <div className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white truncate">
                              {p.name || p.itemName || 'Unnamed Item'}
                            </div>
                            <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
                              <span className="font-bold text-indigo-600 dark:text-indigo-400">
                                Code: {code}
                              </span>
                              <span className="text-slate-500 dark:text-slate-400">
                                Barcode: {currentBarcode}
                              </span>
                              <span className="text-slate-500 dark:text-slate-400 font-sans">
                                UOM: {uom}
                              </span>
                              <span className="font-bold text-emerald-600 dark:text-emerald-400 font-sans">
                                Stock: {stock}
                              </span>
                              <span className="text-slate-700 dark:text-slate-300 font-sans">
                                ₹{mrp.toFixed(2)}
                              </span>
                            </div>
                          </div>
                          <div className="shrink-0 pt-0.5">
                            <div
                              className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                                isSelected
                                  ? 'border-indigo-600 bg-indigo-600 text-white'
                                  : 'border-slate-300 dark:border-slate-600'
                              }`}
                            >
                              {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons & Footer */}
        <div
          className={`px-3 py-3 sm:px-5 sm:py-3.5 border-t flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 shrink-0 ${
            isDarkMode ? 'border-slate-800 bg-slate-900' : 'border-slate-100 bg-slate-50'
          }`}
        >
          <button
            type="button"
            onClick={handleClose}
            className="px-3.5 py-2 text-xs font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer order-last sm:order-first text-center"
          >
            Cancel
          </button>

          <div className="flex items-center gap-2 flex-1 sm:flex-initial justify-end">
            <button
              type="button"
              disabled={!selectedProduct}
              onClick={() => handleConfirmSelection(false)}
              className="flex-1 sm:flex-initial px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-bold flex items-center justify-center gap-1.5 shadow-2xs transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              title="Use selected product for this scan only without saving an override"
            >
              <Zap className="w-3.5 h-3.5 text-amber-500" />
              <span>Use Once</span>
            </button>

            <button
              type="button"
              disabled={!selectedProduct}
              onClick={() => handleConfirmSelection(true)}
              className="flex-1 sm:flex-initial px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-2xs transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              title="Save override in offline storage so this barcode always maps to this product"
            >
              <BookmarkCheck className="w-3.5 h-3.5" />
              <span>Always Use This Product</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
