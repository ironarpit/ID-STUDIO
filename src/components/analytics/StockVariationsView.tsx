import React, { useState, useMemo, useEffect } from 'react';
import { Product, ComputedProductAnalytics, StockVariation } from '../../types';
import {
  loadStockVariations,
  deleteStockVariation,
  upsertStockVariation,
  getSystemStock,
  checkDuplicateCodesInCatalog,
  notifyStockVariationsChanged
} from '../../utils/stockVariations';
import {
  Layers,
  Search,
  RefreshCw,
  Trash2,
  Edit3,
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
  X,
  Building2,
  Check
} from 'lucide-react';

interface StockVariationsViewProps {
  products: Product[];
  analyticsMap: Map<string, ComputedProductAnalytics>;
  onSelectProduct: (p: Product) => void;
  isDarkMode?: boolean;
  onUpdateStockVariations?: (variations: Record<string, StockVariation>) => void;
}

export interface EnrichedStockVariation extends StockVariation {
  liveProduct?: Product;
  isMissing: boolean;
  isDuplicateReview: boolean;
  computedStatus: 'active' | 'missing_from_upload' | 'needs_review';
  currentSystemStock: number | null;
  adjustedStock: number | null;
}

export const StockVariationsView: React.FC<StockVariationsViewProps> = ({
  products,
  analyticsMap,
  onSelectProduct,
  isDarkMode = false,
  onUpdateStockVariations
}) => {
  const [variationsMap, setVariationsMap] = useState<Record<string, StockVariation>>(loadStockVariations);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'missing' | 'review'>('all');
  const [editingVariation, setEditingVariation] = useState<EnrichedStockVariation | null>(null);
  const [editPhysicalCount, setEditPhysicalCount] = useState<string>('');
  const [editRemark, setEditRemark] = useState<string>('');
  const [editError, setEditError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const reloadVariations = () => {
    const updated = loadStockVariations();
    setVariationsMap(updated);
    onUpdateStockVariations?.(updated);
  };

  useEffect(() => {
    const handleVarChange = () => {
      setVariationsMap(loadStockVariations());
    };
    window.addEventListener('bsm_stock_variations_changed', handleVarChange);
    return () => window.removeEventListener('bsm_stock_variations_changed', handleVarChange);
  }, []);

  // Build variations list with enriched status
  const variationsList = useMemo((): EnrichedStockVariation[] => {
    const list = Object.values(variationsMap) as StockVariation[];

    // Map current products by codes
    const bansalMap = new Map<string, Product[]>();
    const barcodeMap = new Map<string, Product[]>();
    const idMap = new Map<string, Product>();

    products.forEach((p) => {
      if (p.id) idMap.set(p.id.trim(), p);
      const bCode = (p.bansalCode || p.localCode || p.code || '').trim().toLowerCase();
      if (bCode) {
        const arr = bansalMap.get(bCode) || [];
        arr.push(p);
        bansalMap.set(bCode, arr);
      }
      const bar = (p.barcode || '').trim().toLowerCase();
      if (bar) {
        const arr = barcodeMap.get(bar) || [];
        arr.push(p);
        barcodeMap.set(bar, arr);
      }
    });

    return list.map((v) => {
      const vKey = (v.productKey || '').trim().toLowerCase();
      const vBansal = (v.bansalCode || v.localCode || '').trim().toLowerCase();
      const vBarcode = (v.barcode || '').trim().toLowerCase();

      const matchingBansal = (vBansal && bansalMap.get(vBansal)) || (vKey && bansalMap.get(vKey)) || [];
      const matchingBarcode = (vBarcode && barcodeMap.get(vBarcode)) || [];

      // Duplicate/reused code detection
      const isDuplicateReview = matchingBansal.length > 1 || matchingBarcode.length > 1;

      let liveProduct: Product | undefined = undefined;
      if (!isDuplicateReview) {
        if (matchingBansal.length === 1) liveProduct = matchingBansal[0];
        else if (matchingBarcode.length === 1) liveProduct = matchingBarcode[0];
        else if (v.productKey && idMap.has(v.productKey)) liveProduct = idMap.get(v.productKey);
      }

      const isMissing = !liveProduct && !isDuplicateReview;

      let computedStatus: 'active' | 'missing_from_upload' | 'needs_review' = 'active';
      if (isDuplicateReview) computedStatus = 'needs_review';
      else if (isMissing) computedStatus = 'missing_from_upload';

      const currentSystemStock = liveProduct ? getSystemStock(liveProduct) : v.systemStock;
      const adjustedStock = currentSystemStock !== null ? currentSystemStock + v.adjustment : null;

      return {
        ...v,
        liveProduct,
        isMissing,
        isDuplicateReview,
        computedStatus,
        currentSystemStock,
        adjustedStock,
        recountNeeded: adjustedStock !== null ? adjustedStock < 0 : false
      };
    });
  }, [variationsMap, products]);

  // Counts for tabs
  const activeCount = useMemo(() => variationsList.filter((v) => v.computedStatus === 'active').length, [variationsList]);
  const missingCount = useMemo(() => variationsList.filter((v) => v.computedStatus === 'missing_from_upload').length, [variationsList]);
  const reviewCount = useMemo(() => variationsList.filter((v) => v.computedStatus === 'needs_review').length, [variationsList]);

  // Filtered variations based on status and search
  const filteredVariations = useMemo(() => {
    let result = variationsList;

    if (statusFilter === 'active') {
      result = result.filter((v) => v.computedStatus === 'active');
    } else if (statusFilter === 'missing') {
      result = result.filter((v) => v.computedStatus === 'missing_from_upload');
    } else if (statusFilter === 'review') {
      result = result.filter((v) => v.computedStatus === 'needs_review');
    }

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      result = result.filter(
        (v) =>
          v.productName.toLowerCase().includes(q) ||
          v.productKey.toLowerCase().includes(q) ||
          (v.localCode && v.localCode.toLowerCase().includes(q)) ||
          (v.bansalCode && v.bansalCode.toLowerCase().includes(q)) ||
          (v.barcode && v.barcode.toLowerCase().includes(q)) ||
          (v.remark && v.remark.toLowerCase().includes(q))
      );
    }

    return result;
  }, [variationsList, statusFilter, searchTerm]);

  const handleOpenEdit = (v: EnrichedStockVariation) => {
    setEditingVariation(v);
    setEditPhysicalCount(String(v.physicalStock));
    setEditRemark(v.remark || '');
    setEditError(null);
  };

  const handleSaveEdit = async () => {
    if (!editingVariation) return;

    if (editPhysicalCount.trim() === '') {
      setEditError('Physical count cannot be blank. Enter a valid non-negative number.');
      return;
    }

    const count = parseFloat(editPhysicalCount);
    if (isNaN(count) || !isFinite(count)) {
      setEditError('Physical count must be a valid finite number.');
      return;
    }

    if (count < 0) {
      setEditError('Physical count cannot be negative.');
      return;
    }

    const targetProduct =
      editingVariation.liveProduct ||
      products.find(
        (p) =>
          p.id === editingVariation.productKey ||
          p.bansalCode === editingVariation.productKey ||
          p.localCode === editingVariation.productKey ||
          p.barcode === editingVariation.barcode
      );

    if (!targetProduct) {
      setEditError('Product is missing from current catalog upload. Cannot recalculate without original system stock.');
      return;
    }

    const res = await upsertStockVariation(
      targetProduct,
      count,
      editRemark,
      targetProduct.storeId || editingVariation.storeId || 'PATAN',
      products
    );

    if (res.success) {
      reloadVariations();
      setEditingVariation(null);
      setEditError(null);
      setFeedback(
        res.variation
          ? 'Physical stock adjustment updated successfully.'
          : 'Physical count matches system stock. Adjustment cleared.'
      );
      setTimeout(() => setFeedback(null), 3000);
    } else {
      setEditError(res.error || 'Failed to update variation.');
    }
  };

  const handleRemove = async (v: EnrichedStockVariation) => {
    if (!window.confirm(`Remove stock variation for "${v.productName}" and restore original system stock?`)) {
      return;
    }

    if (v.liveProduct) {
      await deleteStockVariation(v.liveProduct);
    } else {
      const vars = loadStockVariations();
      delete vars[v.productKey];
      localStorage.setItem('bsm_stock_variations_v1', JSON.stringify(vars));
      notifyStockVariationsChanged(vars);
    }

    reloadVariations();
    setFeedback('Stock variation removed successfully. System stock restored.');
    setTimeout(() => setFeedback(null), 3000);
  };

  // Preview calculation in edit modal
  const editPreview = useMemo(() => {
    if (!editingVariation) return null;
    const sysStock = editingVariation.currentSystemStock;
    if (sysStock === null) return null;
    const count = parseFloat(editPhysicalCount);
    if (isNaN(count) || !isFinite(count) || count < 0 || editPhysicalCount.trim() === '') return null;
    const adj = count - sysStock;
    return {
      adjustment: adj,
      adjustedStock: sysStock + adj
    };
  }, [editingVariation, editPhysicalCount]);

  return (
    <div className="space-y-4">
      {/* Header & Status KPI Strip */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200 border border-amber-300 dark:border-amber-800">
                Stock Variations Management
              </span>
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                {variationsList.length} Total Saved Variations
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Adjustments remain active across new stock uploads until edited or removed. Recounts always calculate against original imported system stock.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Search */}
            <div className="relative flex items-center bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-1.5 w-full sm:w-64">
              <Search className="w-3.5 h-3.5 text-slate-400 mr-2 shrink-0" />
              <input
                type="text"
                placeholder="Search by name, code, remark..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="bg-transparent text-xs text-slate-800 dark:text-slate-200 focus:outline-none w-full font-medium"
              />
              {searchTerm && (
                <button onClick={() => setSearchTerm('')} className="p-0.5 text-slate-400 hover:text-slate-600">
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={reloadVariations}
              className="p-2 text-slate-500 hover:text-indigo-600 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl cursor-pointer transition-colors"
              title="Refresh variations"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Filter Tabs: All / Active / Missing / Needs Review */}
        <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer ${
              statusFilter === 'all'
                ? 'bg-indigo-600 text-white shadow-2xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
            }`}
          >
            All Variations ({variationsList.length})
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('active')}
            className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              statusFilter === 'active'
                ? 'bg-emerald-600 text-white shadow-2xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            <span>Active in Stock ({activeCount})</span>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('missing')}
            className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              statusFilter === 'missing'
                ? 'bg-amber-600 text-white shadow-2xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-amber-400"></span>
            <span>Missing from Current Stock ({missingCount})</span>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('review')}
            className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              statusFilter === 'review'
                ? 'bg-rose-600 text-white shadow-2xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-rose-400"></span>
            <span>Needs Review ({reviewCount})</span>
          </button>
        </div>
      </div>

      {feedback && (
        <div className="p-3 bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 rounded-xl text-xs font-bold text-indigo-700 dark:text-indigo-300 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-indigo-500 shrink-0" />
          {feedback}
        </div>
      )}

      {/* Variations Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-950 text-[10px] font-black uppercase text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                <th className="p-3">Product Name & Identifiers</th>
                <th className="p-3 text-right">Original System Stock</th>
                <th className="p-3 text-right">Physical Count</th>
                <th className="p-3 text-right">Signed Adjustment</th>
                <th className="p-3 text-right">Adjusted Stock</th>
                <th className="p-3">Status / Date</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs font-medium text-slate-800 dark:text-slate-200">
              {filteredVariations.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-slate-400">
                    No stock variations found in this view. Use "Set / Edit Physical Stock" in the Product Inspector to create adjustments.
                  </td>
                </tr>
              ) : (
                filteredVariations.map((v) => {
                  const adjFormatted = v.adjustment > 0 ? `+${v.adjustment}` : `${v.adjustment}`;
                  return (
                    <tr
                      key={v.id}
                      className={`hover:bg-slate-50/50 dark:hover:bg-slate-950/50 transition-colors ${
                        v.recountNeeded ? 'bg-rose-50/20 dark:bg-rose-950/20' : ''
                      }`}
                    >
                      <td className="p-3">
                        <div className="font-bold text-slate-900 dark:text-white">
                          {v.productName}
                        </div>
                        <div className="flex items-center gap-2 text-[11px] font-mono text-indigo-600 dark:text-indigo-400 mt-0.5">
                          <span>Code: {v.productKey}</span>
                          {v.barcode && <span className="text-slate-400">| EAN: {v.barcode}</span>}
                        </div>
                        {v.remark && (
                          <div className="text-[11px] text-slate-500 italic mt-0.5">
                            Remark: {v.remark}
                          </div>
                        )}
                      </td>
                      <td className="p-3 text-right font-mono font-semibold text-slate-600 dark:text-slate-400">
                        {v.currentSystemStock !== null ? v.currentSystemStock : '—'}
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-slate-900 dark:text-white">
                        {v.physicalStock}
                      </td>
                      <td
                        className={`p-3 text-right font-mono font-black ${
                          v.adjustment > 0
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : v.adjustment < 0
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        {adjFormatted}
                      </td>
                      <td className="p-3 text-right font-mono font-black text-indigo-600 dark:text-indigo-400">
                        {v.adjustedStock !== null ? v.adjustedStock : '—'}
                        {v.recountNeeded && (
                          <div className="text-[10px] text-rose-600 font-black animate-pulse">
                            ⚠️ Recount needed
                          </div>
                        )}
                      </td>
                      <td className="p-3">
                        {v.computedStatus === 'needs_review' ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border border-rose-300 dark:border-rose-800">
                            Needs Review: Reused Code
                          </span>
                        ) : v.computedStatus === 'missing_from_upload' ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                            Missing from Current Stock
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                            Active in Stock
                          </span>
                        )}
                        <div className="text-[10px] text-slate-400 mt-1">
                          {new Date(v.timestamp).toLocaleDateString('en-GB')}
                        </div>
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {v.liveProduct && (
                            <button
                              type="button"
                              onClick={() => onSelectProduct(v.liveProduct!)}
                              className="px-2 py-1 rounded-lg text-xs font-bold bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 cursor-pointer"
                            >
                              Inspect
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(v)}
                            className="p-1 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                            title="Edit Physical Stock"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemove(v)}
                            className="p-1 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/50 cursor-pointer"
                            title="Remove Variation"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Physical Count Modal */}
      {editingVariation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b pb-2 border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-indigo-600" />
                <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">
                  Recount / Edit Physical Stock
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingVariation(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-600 dark:text-slate-300">
              <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded-xl space-y-1">
                <div className="font-bold text-slate-900 dark:text-white">{editingVariation.productName}</div>
                <div className="font-mono text-indigo-600">Code: {editingVariation.productKey}</div>
                <div className="flex items-center justify-between pt-1 text-slate-700 dark:text-slate-300 font-semibold">
                  <span>Latest Original System Stock:</span>
                  <span className="font-mono font-black text-sm text-slate-900 dark:text-white">
                    {editingVariation.currentSystemStock !== null ? editingVariation.currentSystemStock : '—'}
                  </span>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Total Physical Count (Floor + Warehouse) *
                </label>
                <input
                  type="number"
                  step="any"
                  value={editPhysicalCount}
                  onChange={(e) => {
                    setEditPhysicalCount(e.target.value);
                    setEditError(null);
                  }}
                  placeholder="Enter total physical count"
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-950 font-mono font-bold text-base text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  autoFocus
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Remark (Optional)
                </label>
                <input
                  type="text"
                  value={editRemark}
                  onChange={(e) => setEditRemark(e.target.value)}
                  placeholder="e.g. Physical recount verified"
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Preview calculation */}
              {editPreview && (
                <div className="p-2.5 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 text-xs space-y-1">
                  <div className="flex items-center justify-between font-bold">
                    <span className="text-indigo-800 dark:text-indigo-300">Adjustment:</span>
                    <span
                      className={`font-mono text-sm font-black ${
                        editPreview.adjustment > 0
                          ? 'text-emerald-600'
                          : editPreview.adjustment < 0
                          ? 'text-rose-600'
                          : 'text-slate-600'
                      }`}
                    >
                      {editPreview.adjustment > 0 ? `+${editPreview.adjustment}` : editPreview.adjustment}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span>Resulting Adjusted Stock:</span>
                    <span className="font-mono font-bold text-slate-900 dark:text-white">
                      {editPreview.adjustedStock}
                    </span>
                  </div>
                  {editPreview.adjustment === 0 && (
                    <p className="text-[11px] text-amber-600 dark:text-amber-400 font-semibold">
                      Count matches original system stock. Saving will clear the variation.
                    </p>
                  )}
                  {editPreview.adjustedStock < 0 && (
                    <p className="text-[11px] text-rose-600 dark:text-rose-400 font-bold">
                      ⚠️ Resulting adjusted stock is negative. Recount needed will be flagged.
                    </p>
                  )}
                </div>
              )}

              {editError && (
                <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-xs font-bold text-rose-700 dark:text-rose-300 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{editError}</span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setEditingVariation(null)}
                className="px-3 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 active:scale-95 transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>Save Physical Stock</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
