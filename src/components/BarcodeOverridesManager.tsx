import React, { useState, useEffect, useMemo } from 'react';
import {
  BookmarkCheck,
  Trash2,
  Edit2,
  CheckCircle2,
  AlertTriangle,
  Search,
  X,
  Plus,
  RefreshCw,
  Tag,
  ArrowRight
} from 'lucide-react';
import { Product, BarcodeOverride } from '../types';
import {
  getBarcodeOverridesDB,
  saveBarcodeOverrideDB,
  deleteBarcodeOverrideDB
} from '../utils/indexedDB';
import {
  normalizeLocalCode,
  compareProductIdentities,
  searchProductsFlexible
} from '../utils/barcodeResolver';

interface BarcodeOverridesManagerProps {
  products: Product[];
  isDarkMode?: boolean;
}

export const BarcodeOverridesManager: React.FC<BarcodeOverridesManagerProps> = ({
  products,
  isDarkMode = false
}) => {
  const [overrides, setOverrides] = useState<BarcodeOverride[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [deletingBarcode, setDeletingBarcode] = useState<string | null>(null);
  const [editingOverride, setEditingOverride] = useState<BarcodeOverride | null>(null);
  const [searchPickerQuery, setSearchPickerQuery] = useState('');

  const loadOverrides = async () => {
    setIsLoading(true);
    try {
      const data = await getBarcodeOverridesDB();
      setOverrides(data);
    } catch (err) {
      console.warn('Error loading barcode overrides:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadOverrides();
  }, []);

  // Compute status for each override
  const validatedOverrides = useMemo(() => {
    return overrides.map((ov) => {
      const normTarget = normalizeLocalCode(ov.targetBansalCode);
      const targetProd = products.find((p) => {
        const pCode = normalizeLocalCode(p.bansalCode || p.localCode || p.code);
        return (normTarget && pCode === normTarget) || p.id === ov.targetBansalCode;
      });

      let isValid = false;
      let currentStockName = '';
      if (targetProd) {
        currentStockName = targetProd.name || targetProd.itemName || '';
        const idMatch = compareProductIdentities(
          { name: ov.targetProductName },
          { name: currentStockName, uom: targetProd.unit }
        );
        isValid = idMatch.isMatch;
      }

      return {
        ...ov,
        isValid,
        targetProduct: targetProd,
        currentStockName
      };
    });
  }, [overrides, products]);

  const handleDeleteOverride = async (barcode: string) => {
    await deleteBarcodeOverrideDB(barcode);
    setDeletingBarcode(null);
    await loadOverrides();
  };

  const handleUpdateTargetProduct = async (newProduct: Product) => {
    if (!editingOverride) return;
    const newCode = newProduct.bansalCode || newProduct.localCode || newProduct.code || '';
    const newName = newProduct.name || newProduct.itemName || '';

    const updated: BarcodeOverride = {
      ...editingOverride,
      targetBansalCode: newCode,
      targetProductName: newName,
      updatedAt: new Date().toISOString()
    };

    await saveBarcodeOverrideDB(updated);
    setEditingOverride(null);
    setSearchPickerQuery('');
    await loadOverrides();
  };

  // Search results for change product picker
  const searchResults = useMemo(() => {
    if (!searchPickerQuery.trim() || products.length === 0) return [];
    return searchProductsFlexible(searchPickerQuery, products, { limit: 10 });
  }, [searchPickerQuery, products]);

  return (
    <div className="space-y-3">
      {/* Header with refresh button */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
            {overrides.length} Saved {overrides.length === 1 ? 'Override' : 'Overrides'}
          </span>
          {overrides.length > 0 && (
            <span className="inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
              Active
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={loadOverrides}
          disabled={isLoading}
          className="p-1 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-md transition-colors cursor-pointer disabled:opacity-50"
          title="Refresh Overrides"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-indigo-600' : ''}`} />
        </button>
      </div>

      {/* List of Overrides */}
      {validatedOverrides.length === 0 ? (
        <div className="p-4 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-center text-xs text-slate-400 dark:text-slate-500">
          No saved barcode overrides yet. When a Barcode Master conflict occurs and you click "Always Use This Product", it will appear here.
        </div>
      ) : (
        <div className="space-y-2 max-h-60 overflow-y-auto pr-0.5">
          {validatedOverrides.map((ov) => {
            const isDeleting = deletingBarcode === ov.scannedBarcode;
            const createdFormatted = ov.createdAt
              ? new Date(ov.createdAt).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric'
                })
              : 'N/A';

            return (
              <div
                key={ov.scannedBarcode}
                className="p-2.5 sm:p-3 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 space-y-2 transition-colors"
              >
                {isDeleting ? (
                  <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-lg p-2.5 space-y-2 animate-fade-in">
                    <div className="flex items-center gap-1.5 text-rose-800 dark:text-rose-200 font-bold text-xs">
                      <Trash2 className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                      <span>Remove Override for {ov.scannedBarcode}?</span>
                    </div>
                    <p className="text-[11px] text-rose-700 dark:text-rose-300 leading-tight">
                      This barcode will return to standard Barcode Master resolution. No stock or master data will be deleted.
                    </p>
                    <div className="flex items-center justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setDeletingBarcode(null)}
                        className="px-2.5 py-1 text-xs font-semibold rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteOverride(ov.scannedBarcode)}
                        className="px-2.5 py-1 text-xs font-bold rounded-md bg-rose-600 text-white hover:bg-rose-700 cursor-pointer"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1 flex-1 min-w-0">
                      {/* Scanned Barcode & Status Badge */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-mono text-xs font-bold text-indigo-700 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 px-1.5 py-0.5 rounded border border-indigo-200 dark:border-indigo-800">
                          {ov.scannedBarcode}
                        </span>

                        {ov.isValid ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                            <CheckCircle2 className="w-3 h-3" />
                            Valid
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                            <AlertTriangle className="w-3 h-3" />
                            Stale
                          </span>
                        )}

                        <span className="text-[10px] text-slate-400 dark:text-slate-500">
                          Added {createdFormatted}
                        </span>
                      </div>

                      {/* Target Product Name & Bansal Code */}
                      <div className="font-bold text-xs text-slate-900 dark:text-white truncate">
                        {ov.targetProductName}
                      </div>

                      <div className="flex items-center gap-2 text-[11px] font-mono text-slate-500 dark:text-slate-400">
                        <span>Target Code: <strong className="text-slate-700 dark:text-slate-200">{ov.targetBansalCode}</strong></span>
                        {ov.targetProduct && (
                          <span>• Stock: {ov.targetProduct.stock ?? ov.targetProduct.closingStock ?? 0}</span>
                        )}
                      </div>
                    </div>

                    {/* Actions: Change Product & Delete */}
                    <div className="flex items-center gap-1 shrink-0 pt-0.5">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingOverride(ov);
                          setSearchPickerQuery('');
                        }}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-200/60 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                        title="Change Target Product"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => setDeletingBarcode(ov.scannedBarcode)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                        title="Remove Override"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Change Product Modal */}
      {editingOverride && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl shadow-2xl border bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 p-4 sm:p-5 space-y-3.5">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h4 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight">
                  Change Override Target Product
                </h4>
                <p className="text-xs font-mono text-indigo-600 dark:text-indigo-400">
                  Barcode: {editingOverride.scannedBarcode}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingOverride(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                autoFocus
                value={searchPickerQuery}
                onChange={(e) => setSearchPickerQuery(e.target.value)}
                placeholder="Search replacement product by name, code or barcode..."
                className="w-full pl-9 pr-4 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="max-h-60 overflow-y-auto space-y-1.5">
              {searchPickerQuery.trim() && searchResults.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-400">
                  No products matching "{searchPickerQuery}".
                </div>
              ) : (
                searchResults.map((p) => {
                  const code = p.bansalCode || p.localCode || p.code || 'N/A';
                  return (
                    <button
                      key={p.id || code}
                      type="button"
                      onClick={() => handleUpdateTargetProduct(p)}
                      className="w-full p-2.5 rounded-xl text-left border border-slate-100 dark:border-slate-800 hover:border-indigo-500 hover:bg-indigo-50/30 dark:hover:bg-indigo-950/30 transition-all cursor-pointer flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                          {p.name || p.itemName}
                        </div>
                        <div className="flex items-center gap-2 text-[10px] font-mono text-slate-500 dark:text-slate-400">
                          <span>Code: {code}</span>
                          <span>• Barcode: {p.barcode}</span>
                          <span>• Stock: {p.stock ?? p.closingStock ?? 0}</span>
                        </div>
                      </div>
                      <ArrowRight className="w-4 h-4 text-indigo-600 shrink-0" />
                    </button>
                  );
                })
              )}
            </div>

            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={() => setEditingOverride(null)}
                className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 cursor-pointer"
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
