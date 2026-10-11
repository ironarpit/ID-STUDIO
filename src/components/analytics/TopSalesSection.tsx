import React, { useState, useMemo, useEffect } from 'react';
import { Trophy, ArrowUpRight, Eye, Layers, Tags, X, ClipboardCheck } from 'lucide-react';
import { Product, ComputedProductAnalytics, AnalyticsViewType, AuditType } from '../../types';
import { getProductBrand } from '../../utils/analytics';
import { getUniqueMainCodes, matchesMainCodeFilter, deriveCategoriesFromProducts, matchesCategoryFilter, getValidSelectedCategories } from '../../utils/mainCode';
import { MultiSelectDropdown } from '../MultiSelectDropdown';

interface TopSalesSectionProps {
  products: Product[];
  analyticsMap: Map<string, ComputedProductAnalytics>;
  onSelectProduct: (p: Product) => void;
  onSelectView: (view: AnalyticsViewType) => void;
  onStartFloorAudit?: (title: string, type: AuditType, products: Product[]) => void;
  isDarkMode?: boolean;
}

type TabType = 'qty' | 'salesValue' | 'inventoryValue' | 'retailValue' | 'margin';

export const TopSalesSection: React.FC<TopSalesSectionProps> = ({
  products,
  analyticsMap,
  onSelectProduct,
  onSelectView,
  onStartFloorAudit,
  isDarkMode
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('salesValue');
  const [selectedMainCodes, setSelectedMainCodes] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

  // Unique options
  const mainCodesList = useMemo(() => getUniqueMainCodes(products), [products]);

  const categoriesList = useMemo(() => {
    return deriveCategoriesFromProducts(products, selectedMainCodes);
  }, [products, selectedMainCodes]);

  // Purge selected categories if no longer available under selected MainCodes
  useEffect(() => {
    if (selectedCategories.length > 0) {
      const valid = getValidSelectedCategories(selectedCategories, categoriesList);
      if (valid.length !== selectedCategories.length) {
        setSelectedCategories(valid);
      }
    }
  }, [categoriesList, selectedCategories]);

  const handleSetMainCodePreset = (preset: 'all' | 'food' | 'grocery' | 'nonfood' | 'noncore') => {
    if (preset === 'all') {
      setSelectedMainCodes([]);
    } else if (preset === 'food') {
      setSelectedMainCodes(['FOOD']);
    } else if (preset === 'grocery') {
      setSelectedMainCodes(['GROCERY']);
    } else if (preset === 'nonfood') {
      setSelectedMainCodes(['NON-FOOD']);
    } else if (preset === 'noncore') {
      setSelectedMainCodes(['NON-CORE']);
    }
  };

  const handleResetFilters = () => {
    setSelectedMainCodes([]);
    setSelectedCategories([]);
  };

  const topProducts = useMemo(() => {
    let list = [...products];

    // Filter by MainCodes
    if (selectedMainCodes.length > 0) {
      list = list.filter((p) => matchesMainCodeFilter(p.mainCode, selectedMainCodes));
    }

    // Filter by Categories
    if (selectedCategories.length > 0) {
      list = list.filter((p) => matchesCategoryFilter(p.category, selectedCategories));
    }

    list.sort((a, b) => {
      const calcA = analyticsMap.get(a.id);
      const calcB = analyticsMap.get(b.id);

      if (activeTab === 'qty') {
        return (b.salesCount || 0) - (a.salesCount || 0);
      } else if (activeTab === 'salesValue') {
        const valA = calcA ? calcA.salesValue : 0;
        const valB = calcB ? calcB.salesValue : 0;
        return valB - valA;
      } else if (activeTab === 'inventoryValue') {
        const valA = calcA ? calcA.inventoryValueCost : 0;
        const valB = calcB ? calcB.inventoryValueCost : 0;
        return valB - valA;
      } else if (activeTab === 'retailValue') {
        const valA = calcA ? calcA.retailStockValue : 0;
        const valB = calcB ? calcB.retailStockValue : 0;
        return valB - valA;
      } else if (activeTab === 'margin') {
        const valA = calcA ? calcA.marginAmount : 0;
        const valB = calcB ? calcB.marginAmount : 0;
        return valB - valA;
      }
      return 0;
    });

    return list.slice(0, 100);
  }, [products, analyticsMap, activeTab, selectedMainCodes, selectedCategories]);

  return (
    <div className={`p-5 rounded-2xl border ${isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'} shadow-2xs space-y-4`}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-3 border-slate-100 dark:border-slate-700">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
            <Trophy className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-black tracking-tight">Top 100 Performance Rankings</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Leaderboard across sales volume, revenue value, capital tied up, and profit contribution
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {onStartFloorAudit && (
            <button
              type="button"
              onClick={() => onStartFloorAudit('Top 100 Sales Audit', 'top_100', topProducts)}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3 py-1.5 rounded-xl shadow-xs transition-all cursor-pointer active:scale-95 shrink-0"
              title={`Start Floor Audit for these ${topProducts.length} Top Sales items`}
            >
              <ClipboardCheck className="w-4 h-4 text-emerald-100" />
              <span>Start Floor Audit ({topProducts.length})</span>
            </button>
          )}

          <button
            onClick={() => onSelectView('all_products')}
            className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer shrink-0"
          >
            <span>View All Products</span>
            <ArrowUpRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Multi-Select Filters Bar & Presets */}
      <div className={`p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${
        isDarkMode ? 'bg-slate-900/70 border-slate-750' : 'bg-slate-50 border-slate-200'
      }`}>
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs scrollbar-none">
          <span className="text-[11px] font-extrabold text-slate-500 dark:text-slate-400 shrink-0 mr-1 flex items-center gap-1">
            <Layers className="w-3 h-3 text-indigo-500" />
            Presets:
          </span>

          <button
            onClick={() => handleSetMainCodePreset('all')}
            className={`px-2.5 py-1 rounded-lg font-bold text-xs transition-all cursor-pointer shrink-0 ${
              selectedMainCodes.length === 0
                ? 'bg-indigo-600 text-white shadow-2xs'
                : isDarkMode
                ? 'bg-slate-800 border border-slate-700 text-slate-300 hover:border-indigo-400'
                : 'bg-white border border-slate-200 text-slate-700 hover:border-indigo-400'
            }`}
          >
            All MainCodes
          </button>

          <button
            onClick={() => handleSetMainCodePreset('food')}
            className={`px-2.5 py-1 rounded-lg font-bold text-xs transition-all cursor-pointer shrink-0 ${
              selectedMainCodes.length === 1 && selectedMainCodes[0] === 'FOOD'
                ? 'bg-emerald-600 text-white shadow-2xs'
                : isDarkMode
                ? 'bg-slate-800 border border-slate-700 text-emerald-400 hover:border-emerald-500'
                : 'bg-white border border-slate-200 text-emerald-800 hover:border-emerald-500'
            }`}
          >
            Food
          </button>

          <button
            onClick={() => handleSetMainCodePreset('grocery')}
            className={`px-2.5 py-1 rounded-lg font-bold text-xs transition-all cursor-pointer shrink-0 ${
              selectedMainCodes.length === 1 && selectedMainCodes[0] === 'GROCERY'
                ? 'bg-amber-600 text-white shadow-2xs'
                : isDarkMode
                ? 'bg-slate-800 border border-slate-700 text-amber-400 hover:border-amber-500'
                : 'bg-white border border-slate-200 text-amber-800 hover:border-amber-500'
            }`}
          >
            Grocery
          </button>

          <button
            onClick={() => handleSetMainCodePreset('nonfood')}
            className={`px-2.5 py-1 rounded-lg font-bold text-xs transition-all cursor-pointer shrink-0 ${
              selectedMainCodes.length === 1 && selectedMainCodes[0] === 'NON-FOOD'
                ? 'bg-blue-600 text-white shadow-2xs'
                : isDarkMode
                ? 'bg-slate-800 border border-slate-700 text-blue-400 hover:border-blue-500'
                : 'bg-white border border-slate-200 text-blue-800 hover:border-blue-500'
            }`}
          >
            Non-Food
          </button>

          <button
            onClick={() => handleSetMainCodePreset('noncore')}
            className={`px-2.5 py-1 rounded-lg font-bold text-xs transition-all cursor-pointer shrink-0 ${
              selectedMainCodes.length === 1 && selectedMainCodes[0] === 'NON-CORE'
                ? 'bg-purple-600 text-white shadow-2xs'
                : isDarkMode
                ? 'bg-slate-800 border border-slate-700 text-purple-400 hover:border-purple-500'
                : 'bg-white border border-slate-200 text-purple-800 hover:border-purple-500'
            }`}
          >
            Non-Core
          </button>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <MultiSelectDropdown
            label="MainCode"
            options={mainCodesList}
            selectedValues={selectedMainCodes}
            onChange={setSelectedMainCodes}
            placeholder="All"
            searchPlaceholder="Search MainCodes..."
            icon={<Layers className="w-3.5 h-3.5 text-indigo-500 mr-1 shrink-0" />}
            isDarkMode={isDarkMode}
            badgeColor="indigo"
          />

          <MultiSelectDropdown
            label="Category"
            options={categoriesList}
            selectedValues={selectedCategories}
            onChange={setSelectedCategories}
            placeholder="All"
            searchPlaceholder="Search categories..."
            icon={<Tags className="w-3.5 h-3.5 text-teal-500 mr-1 shrink-0" />}
            isDarkMode={isDarkMode}
            badgeColor="emerald"
          />

          {(selectedMainCodes.length > 0 || selectedCategories.length > 0) && (
            <button
              onClick={handleResetFilters}
              className="p-1.5 rounded-lg text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 border border-rose-200 dark:border-rose-800 cursor-pointer"
              title="Reset Filters"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1 text-xs scrollbar-none">
        <button
          onClick={() => setActiveTab('salesValue')}
          className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all cursor-pointer ${
            activeTab === 'salesValue'
              ? 'bg-indigo-600 text-white shadow-2xs'
              : isDarkMode ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
        >
          Top 100 by Sales Value
        </button>

        <button
          onClick={() => setActiveTab('qty')}
          className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all cursor-pointer ${
            activeTab === 'qty'
              ? 'bg-indigo-600 text-white shadow-2xs'
              : isDarkMode ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
        >
          Top 100 by Sales Qty
        </button>

        <button
          onClick={() => setActiveTab('inventoryValue')}
          className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all cursor-pointer ${
            activeTab === 'inventoryValue'
              ? 'bg-indigo-600 text-white shadow-2xs'
              : isDarkMode ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
        >
          Top 100 by Inventory Cost Value
        </button>

        <button
          onClick={() => setActiveTab('retailValue')}
          className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all cursor-pointer ${
            activeTab === 'retailValue'
              ? 'bg-indigo-600 text-white shadow-2xs'
              : isDarkMode ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
        >
          Top 100 by Retail Value
        </button>

        <button
          onClick={() => setActiveTab('margin')}
          className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all cursor-pointer ${
            activeTab === 'margin'
              ? 'bg-indigo-600 text-white shadow-2xs'
              : isDarkMode ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
        >
          Top 100 by Profit Margin
        </button>
      </div>

      {/* Leaderboard Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
        <table className="w-full text-left text-xs">
          <thead className={`uppercase text-[10px] font-black tracking-wider ${isDarkMode ? 'bg-slate-900 text-slate-400' : 'bg-slate-100 text-slate-500'}`}>
            <tr>
              <th className="p-2.5 w-12 text-center">Rank</th>
              <th className="p-2.5">Product</th>
              <th className="p-2.5">Category</th>
              <th className="p-2.5">Brand</th>
              <th className="p-2.5 text-right">Closing Stock</th>
              <th className="p-2.5 text-right">Sales Qty</th>
              <th className="p-2.5 text-right">Sales Value</th>
              <th className="p-2.5 text-right">Inventory Value</th>
              <th className="p-2.5 text-right">Retail Price</th>
              <th className="p-2.5 text-center">Status</th>
              <th className="p-2.5 text-center">Movement</th>
              <th className="p-2.5 text-center">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700 font-medium">
            {topProducts.map((p, idx) => {
              const calc = analyticsMap.get(p.id);
              const brand = getProductBrand(p);
              const rank = idx + 1;

              return (
                <tr
                  key={p.id}
                  onClick={() => onSelectProduct(p)}
                  className="hover:bg-indigo-50/50 dark:hover:bg-slate-700/50 transition-colors cursor-pointer"
                >
                  <td className="p-2.5 text-center font-black font-mono">
                    <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] ${
                      rank === 1 ? 'bg-amber-400 text-slate-900 font-black' :
                      rank === 2 ? 'bg-slate-300 text-slate-900 font-black' :
                      rank === 3 ? 'bg-amber-600 text-white font-black' : 'text-slate-400'
                    }`}>
                      #{rank}
                    </span>
                  </td>
                  <td className="p-2.5 max-w-xs">
                    <div className="font-bold text-slate-900 dark:text-white truncate">{p.name}</div>
                    <div className="text-[10px] text-slate-400 font-mono">{p.barcode} {p.localCode ? `• ${p.localCode}` : ''}</div>
                  </td>
                  <td className="p-2.5 text-slate-600 dark:text-slate-300 font-semibold truncate max-w-[120px]">
                    {p.category || 'General'}
                  </td>
                  <td className="p-2.5 text-slate-500 dark:text-slate-400 truncate max-w-[120px]">
                    {brand}
                  </td>
                  <td className={`p-2.5 text-right font-bold ${p.stock <= 0 ? 'text-rose-600' : 'text-slate-800 dark:text-slate-200'}`}>
                    {(p.stock || 0).toLocaleString('en-IN')}
                  </td>
                  <td className="p-2.5 text-right font-bold text-indigo-600 dark:text-indigo-400">
                    {(p.salesCount || 0).toLocaleString('en-IN')}
                  </td>
                  <td className="p-2.5 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                    ₹{(calc?.salesValue || 0).toLocaleString('en-IN')}
                  </td>
                  <td className="p-2.5 text-right font-mono font-black text-slate-900 dark:text-white">
                    ₹{(calc?.inventoryValueCost || 0).toLocaleString('en-IN')}
                  </td>
                  <td className="p-2.5 text-right font-mono font-bold text-slate-700 dark:text-slate-300">
                    ₹{(p.retailPrice || 0).toLocaleString('en-IN')}
                  </td>
                  <td className="p-2.5 text-center">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      calc?.stockStatus === 'out_of_stock' ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300' :
                      calc?.stockStatus === 'low_stock' ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' :
                      calc?.stockStatus === 'overstock' ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300' :
                      'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                    }`}>
                      {calc?.stockStatus.replace(/_/g, ' ') || 'normal'}
                    </span>
                  </td>
                  <td className="p-2.5 text-center">
                    <span className={`text-[10px] font-bold uppercase ${
                      calc?.movementStatus === 'fast' ? 'text-emerald-600 dark:text-emerald-400' :
                      calc?.movementStatus === 'slow' ? 'text-amber-600 dark:text-amber-400' :
                      calc?.movementStatus === 'dead' ? 'text-rose-600 dark:text-rose-400' :
                      'text-slate-400'
                    }`}>
                      {calc?.movementStatus.replace(/_/g, ' ') || 'normal'}
                    </span>
                  </td>
                  <td className="p-2.5 text-center">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectProduct(p);
                      }}
                      className="p-1 rounded bg-indigo-50 dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
