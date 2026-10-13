import React, { useState, useMemo } from 'react';
import { Truck, Zap, Turtle, EyeOff, PackageX, Layers, Tags, X } from 'lucide-react';
import { Product, ComputedProductAnalytics } from '../../types';
import { computeSupplierSummaries } from '../../utils/analytics';
import { MultiSelectDropdown } from '../MultiSelectDropdown';
import { ActiveFilterChips } from '../ActiveFilterChips';
import { computeLinkedClassificationOptions } from '../../utils/linkedFilters';

interface SupplierDashboardViewProps {
  products: Product[];
  analyticsMap: Map<string, ComputedProductAnalytics>;
  isDarkMode?: boolean;
}

export const SupplierDashboardView: React.FC<SupplierDashboardViewProps> = ({
  products,
  analyticsMap,
  isDarkMode
}) => {
  const [selectedMainCodes, setSelectedMainCodes] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

  // Bidirectional linked options computation
  const linkedResult = useMemo(() => {
    return computeLinkedClassificationOptions(
      products,
      {
        getMainCode: (p) => p.mainCode,
        getCategory: (p) => p.category
      },
      {
        mainCodes: selectedMainCodes,
        categories: selectedCategories
      }
    );
  }, [products, selectedMainCodes, selectedCategories]);

  const filteredProducts = linkedResult.filteredItems;
  const mainCodesList = linkedResult.mainCodeOptions;
  const categoriesList = linkedResult.categoryOptions;

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

  const suppliers = useMemo(() => {
    return computeSupplierSummaries(filteredProducts, analyticsMap);
  }, [filteredProducts, analyticsMap]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-black tracking-tight dark:text-white">Supplier Performance Dashboard</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Unified stock, sales, valuation, and velocity breakdown across {suppliers.length} suppliers ({filteredProducts.length} filtered products of {products.length} total)
          </p>
        </div>
      </div>

      {/* Multi-Select Filters Bar & Presets */}
      <div className={`p-3 rounded-2xl border space-y-2.5 ${
        isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'
      } shadow-2xs`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 text-xs scrollbar-none">
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
                  ? 'bg-slate-900 border border-slate-700 text-slate-300 hover:border-indigo-400'
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
                  ? 'bg-slate-900 border border-slate-700 text-emerald-400 hover:border-emerald-500'
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
                  ? 'bg-slate-900 border border-slate-700 text-amber-400 hover:border-amber-500'
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
                  ? 'bg-slate-900 border border-slate-700 text-blue-400 hover:border-blue-500'
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
                  ? 'bg-slate-900 border border-slate-700 text-purple-400 hover:border-purple-500'
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

        {/* Active Filter Chips */}
        <ActiveFilterChips
          groups={[
            {
              label: 'MainCode',
              values: selectedMainCodes,
              onRemove: (v) => setSelectedMainCodes(selectedMainCodes.filter((c) => c !== v)),
              onClear: () => setSelectedMainCodes([]),
              badgeColor: 'indigo',
              incompatibleValues: mainCodesList.filter((o) => o.incompatible).map((o) => o.value)
            },
            {
              label: 'Category',
              values: selectedCategories,
              onRemove: (v) => setSelectedCategories(selectedCategories.filter((c) => c !== v)),
              onClear: () => setSelectedCategories([]),
              badgeColor: 'emerald',
              incompatibleValues: categoriesList.filter((o) => o.incompatible).map((o) => o.value)
            }
          ]}
          onResetAll={handleResetFilters}
          totalFilteredCount={filteredProducts.length}
          totalItemCount={products.length}
          isDarkMode={isDarkMode}
        />
      </div>

      {suppliers.length === 0 ? (
        <div className={`p-12 text-center rounded-2xl border ${
          isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'
        }`}>
          <Truck className="w-12 h-12 text-slate-400 mx-auto mb-3 opacity-60" />
          <h3 className="text-base font-extrabold dark:text-white">No products match these filters.</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Try adjusting your MainCode or Category selections.
          </p>
          <button
            type="button"
            onClick={handleResetFilters}
            className="mt-4 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs cursor-pointer shadow-2xs"
          >
            Reset All Filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {suppliers.map((s) => (
          <div
            key={s.supplierName}
            className={`p-4 rounded-2xl border transition-all ${
              isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'
            } shadow-2xs space-y-3`}
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-700">
              <div className="flex items-center gap-2 min-w-0">
                <div className="p-2 rounded-xl bg-cyan-50 text-cyan-600 border border-cyan-200 shrink-0">
                  <Truck className="w-4 h-4" />
                </div>
                <h3 className="font-extrabold text-sm truncate">{s.supplierName}</h3>
              </div>
              <span className="text-xs font-bold text-cyan-600 bg-cyan-50 px-2.5 py-0.5 rounded-full border border-cyan-200">
                {s.productCount} SKUs
              </span>
            </div>

            {/* 6 Key Financial Metrics Grid */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-700">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Closing Stock</span>
                <span className="font-black text-sm text-slate-900 dark:text-white block mt-0.5">
                  {s.closingStock.toLocaleString('en-IN')} Qty
                </span>
              </div>

              <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-700">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Sales Quantity</span>
                <span className="font-black text-sm text-indigo-600 dark:text-indigo-400 block mt-0.5">
                  {s.salesQuantity.toLocaleString('en-IN')} Sold
                </span>
              </div>

              <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-700">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Inventory Value (Cost)</span>
                <span className="font-black text-sm text-emerald-600 dark:text-emerald-400 block mt-0.5">
                  ₹{s.inventoryValue.toLocaleString('en-IN')}
                </span>
              </div>

              <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-700">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Retail Stock Value</span>
                <span className="font-black text-sm text-purple-600 dark:text-purple-400 block mt-0.5">
                  ₹{s.retailValue.toLocaleString('en-IN')}
                </span>
              </div>

              <div className="p-2 col-span-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-700 flex justify-between items-center">
                <span className="text-[10px] uppercase font-bold text-slate-400">Total Sales Value</span>
                <span className="font-black text-sm text-emerald-700 dark:text-emerald-300">
                  ₹{s.salesValue.toLocaleString('en-IN')}
                </span>
              </div>
            </div>

            {/* 4 Classification Counters */}
            <div className="grid grid-cols-4 gap-1 text-[10px] pt-1 text-center font-bold">
              <div className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300">
                <Zap className="w-3 h-3 mx-auto mb-0.5" />
                <span>{s.fastMovers} Fast</span>
              </div>
              <div className="p-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300">
                <Turtle className="w-3 h-3 mx-auto mb-0.5" />
                <span>{s.slowMovers} Slow</span>
              </div>
              <div className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-300">
                <EyeOff className="w-3 h-3 mx-auto mb-0.5" />
                <span>{s.zeroSales} Unsold</span>
              </div>
              <div className="p-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300">
                <PackageX className="w-3 h-3 mx-auto mb-0.5" />
                <span>{s.outOfStock} OOS</span>
              </div>
            </div>
          </div>
        ))}
      </div>
      )}
    </div>
  );
};
