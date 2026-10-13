import React, { useState, useMemo } from 'react';
import { Product, ComputedProductAnalytics } from '../../types';
import { StockVariation, loadStockVariations, deleteStockVariation, upsertStockVariation, getSystemStock, getAdjustedStock } from '../../utils/stockVariations';
import { Layers, Search, RefreshCw, Trash2, Edit3, AlertTriangle, CheckCircle2, ShieldAlert, X, Building2 } from 'lucide-react';
import { formatIndianCurrency } from '../../utils/copyUtils';

interface StockVariationsViewProps {
  products: Product[];
  analyticsMap: Map<string, ComputedProductAnalytics>;
  onSelectProduct: (p: Product) => void;
  isDarkMode?: boolean;
}

export const StockVariationsView: React.FC<StockVariationsViewProps> = ({
  products,
  analyticsMap,
  onSelectProduct,
  isDarkMode = false
}) => {
  const [variationsMap, setVariationsMap] = useState<Record<string, StockVariation>>(loadStockVariations);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingVariation, setEditingVariation] = useState<StockVariation | null>(null);
  const [editPhysicalCount, setEditPhysicalCount] = useState<string>('');
  const [editRemark, setEditRemark] = useState<string>('');
  const [feedback, setFeedback] = useState<string | null>(null);

  const reloadVariations = () => {
    setVariationsMap(loadStockVariations());
  };

  const variationsList = useMemo(() => {
    const list = Object.values(variationsMap);
    const productKeyMap = new Map<string, Product>();
    products.forEach((p) => {
      if (p.bansalCode) productKeyMap.set(p.bansalCode.trim(), p);
      if (p.localCode) productKeyMap.set(p.localCode.trim(), p);
      if (p.barcode) productKeyMap.set(p.barcode.trim(), p);
      if (p.id) productKeyMap.set(p.id.trim(), p);
    });

    return list.map((v) => {
      const liveProduct = productKeyMap.get(v.productKey) || productKeyMap.get(v.bansalCode || '') || productKeyMap.get(v.localCode || '');
      const isMissing = !liveProduct;
      const currentSystemStock = liveProduct ? getSystemStock(liveProduct) : v.systemStock;
      const adjustedStock = currentSystemStock + v.adjustment;

      return {
        ...v,
        liveProduct,
        isMissing,
        currentSystemStock,
        adjustedStock
      };
    });
  }, [variationsMap, products]);

  const filteredVariations = useMemo(() => {
    if (!searchTerm.trim()) return variationsList;
    const q = searchTerm.toLowerCase().trim();
    return variationsList.filter(
      (v) =>
        v.productName.toLowerCase().includes(q) ||
        v.productKey.toLowerCase().includes(q) ||
        (v.localCode && v.localCode.toLowerCase().includes(q)) ||
        (v.bansalCode && v.bansalCode.toLowerCase().includes(q))
    );
  }, [variationsList, searchTerm]);

  const handleOpenEdit = (v: StockVariation) => {
    setEditingVariation(v);
    setEditPhysicalCount(String(v.physicalStock));
    setEditRemark(v.remark || '');
  };

  const handleSaveEdit = () => {
    if (!editingVariation) return;
    const count = parseFloat(editPhysicalCount);
    if (isNaN(count) || count < 0) {
      setFeedback('Please enter a valid non-negative physical count.');
      setTimeout(() => setFeedback(null), 3000);
      return;
    }

    const targetProduct = editingVariation.liveProduct || products.find((p) => p.id === editingVariation.productKey || p.bansalCode === editingVariation.productKey || p.localCode === editingVariation.productKey);

    if (!targetProduct) {
      setFeedback('Cannot update: product is missing from current stock upload.');
      setTimeout(() => setFeedback(null), 3000);
      return;
    }

    const res = upsertStockVariation(targetProduct, count, editRemark);
    if (res.success) {
      reloadVariations();
      setEditingVariation(null);
      setFeedback('Stock variation updated successfully.');
      setTimeout(() => setFeedback(null), 2500);
    } else {
      setFeedback(res.error || 'Failed to update variation.');
      setTimeout(() => setFeedback(null), 3000);
    }
  };

  const handleRemove = (v: StockVariation) => {
    if (v.liveProduct) {
      deleteStockVariation(v.liveProduct);
    } else {
      const vars = loadStockVariations();
      delete vars[v.productKey];
      localStorage.setItem('bsm_stock_variations_v1', JSON.stringify(vars));
    }
    reloadVariations();
    setFeedback('Stock variation removed successfully.');
    setTimeout(() => setFeedback(null), 2500);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
              Stock Variations Management
            </span>
            <span className="text-xs font-bold text-slate-400">
              {variationsList.length} Active Variations
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Manage manual physical stock counts and signed adjustments across stock uploads.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative flex items-center bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-1.5 w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 mr-2 shrink-0" />
            <input
              type="text"
              placeholder="Search by name or code..."
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
        </div>
      </div>

      {feedback && (
        <div className="p-3 bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 rounded-xl text-xs font-bold text-indigo-700 dark:text-indigo-300 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-indigo-500 shrink-0" />
          {feedback}
        </div>
      )}

      {/* Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-950 text-[10px] font-black uppercase text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                <th className="p-3">Product Name & Code</th>
                <th className="p-3 text-right">System Stock</th>
                <th className="p-3 text-right">Signed Adjustment</th>
                <th className="p-3 text-right">Adjusted Stock</th>
                <th className="p-3">Status / Date</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs font-medium text-slate-800 dark:text-slate-200">
              {filteredVariations.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-slate-400">
                    No stock variations found. Set physical stock from the Product Inspector to create adjustments.
                  </td>
                </tr>
              ) : (
                filteredVariations.map((v) => {
                  const adjFormatted = v.adjustment > 0 ? `+${v.adjustment}` : `${v.adjustment}`;
                  return (
                    <tr key={v.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-950/50 transition-colors">
                      <td className="p-3">
                        <div className="font-bold text-slate-900 dark:text-white">
                          {v.productName}
                        </div>
                        <div className="font-mono text-[11px] text-indigo-600 dark:text-indigo-400 mt-0.5">
                          {v.productKey}
                        </div>
                        {v.remark && (
                          <div className="text-[11px] text-slate-500 italic mt-0.5">
                            Remark: {v.remark}
                          </div>
                        )}
                      </td>
                      <td className="p-3 text-right font-semibold text-slate-600 dark:text-slate-400">
                        {v.currentSystemStock}
                      </td>
                      <td className={`p-3 text-right font-black ${v.adjustment > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                        {adjFormatted}
                      </td>
                      <td className="p-3 text-right font-bold text-indigo-600 dark:text-indigo-400">
                        {v.adjustedStock}
                        {v.adjustedStock < 0 && (
                          <div className="text-[10px] text-rose-500 font-bold">Recount needed</div>
                        )}
                      </td>
                      <td className="p-3">
                        {v.isMissing ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                            Missing from Current Upload
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
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

      {/* Edit Modal */}
      {editingVariation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-slate-900 dark:text-white">
                Edit Physical Stock Count
              </h3>
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
                <div>Original System Stock: <strong>{editingVariation.systemStock}</strong></div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  New Physical Count (Floor + Warehouse)
                </label>
                <input
                  type="number"
                  step="any"
                  value={editPhysicalCount}
                  onChange={(e) => setEditPhysicalCount(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl bg-transparent font-bold text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl bg-transparent text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingVariation(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 shadow-xs"
              >
                Save Physical Stock
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
