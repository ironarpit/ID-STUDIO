import React, { useState, useMemo, useEffect } from 'react';
import { 
   X, 
   Search, 
   ArrowUpDown, 
   Package, 
   ChevronLeft,
   ChevronRight,
   Layers,
   Tag,
   Eye,
   ClipboardCheck,
   Copy
} from 'lucide-react';
import { Product, AuditType, StockReportMeta } from '../types';
import { cleanBarcode, formatCleanSalesPeriod } from '../utils/fileParser';
import { getUniqueMainCodes, matchesMainCodeFilter, isExcludedMainCode } from '../utils/mainCode';
import { formatStandardStockProductsText, copyToClipboard } from '../utils/copyUtils';
import { MultiSelectDropdown } from './MultiSelectDropdown';
import { useModalTransition } from '../utils/useModalTransition';
import { computeLinkedClassificationOptions } from '../utils/linkedFilters';
import { ActiveFilterChips } from './ActiveFilterChips';

interface ProductTableModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  onSelectProduct: (product: Product) => void;
  onStartFloorAudit?: (title: string, type: AuditType, products: Product[]) => void;
  isDarkMode?: boolean;
  reportMeta?: StockReportMeta | null;
  storeName?: string;
}

export const ProductTableModal: React.FC<ProductTableModalProps> = ({
  isOpen,
  onClose,
  products,
  onSelectProduct,
  onStartFloorAudit,
  isDarkMode = false,
  reportMeta,
  storeName = 'PATAN'
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMainCodes, setSelectedMainCodes] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [filterLowStock, setFilterLowStock] = useState(false);
  const [sortBy, setSortBy] = useState<'name' | 'mrp' | 'stock'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  const handleCopyFiltered = async () => {
    if (sortedProducts.length === 0) return;

    const activeFilters: string[] = [];
    if (selectedMainCodes.length > 0) {
      activeFilters.push(`MainCodes: ${selectedMainCodes.join(', ')}`);
    }
    if (selectedCategories.length > 0) {
      activeFilters.push(`Categories: ${selectedCategories.join(', ')}`);
    }
    if (filterLowStock) {
      activeFilters.push('Low Stock: Yes');
    }

    const cleanPeriod = reportMeta?.reportPeriodText
      ? formatCleanSalesPeriod(reportMeta.reportPeriodText)
      : 'Not Available';

    const text = formatStandardStockProductsText(sortedProducts, {
      title: 'STOCK IQ CATALOG',
      store: storeName,
      activeFilters: activeFilters.length > 0 ? activeFilters : undefined,
      search: searchTerm.trim() || undefined,
      salesPeriod: cleanPeriod,
    });

    const ok = await copyToClipboard(text);
    if (ok) {
      setCopyFeedback(`Copied ${sortedProducts.length} products`);
      setTimeout(() => setCopyFeedback(null), 2500);
    } else {
      setCopyFeedback('Failed to copy');
      setTimeout(() => setCopyFeedback(null), 2500);
    }
  };

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  // Reset page when search/filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedMainCodes, selectedCategories, filterLowStock, sortBy, sortOrder, pageSize]);

  // Standardized filter logic
  const {
    filteredItems: processedProducts,
    mainCodeOptions,
    categoryOptions,
  } = useMemo(() => {
    return computeLinkedClassificationOptions<Product>(
      products,
      {
        getMainCode: (p) => p.mainCode,
        getCategory: (p) => p.category || 'General',
      },
      {
        mainCodes: selectedMainCodes,
        categories: selectedCategories,
      }
    );
  }, [products, selectedMainCodes, selectedCategories]);

  // Reset page when search/filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedMainCodes, selectedCategories, filterLowStock, sortBy, sortOrder, pageSize]);



  // Filter products efficiently
  const searchedProducts = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const cleanTerm = cleanBarcode(term).toLowerCase();
    return processedProducts.filter(p => {
      if (isExcludedMainCode(p.mainCode)) return false;
      const matchesSearch =
        !term ||
        p.name.toLowerCase().includes(term) ||
        p.barcode.toLowerCase().includes(term) ||
        (cleanTerm && cleanBarcode(p.barcode).toLowerCase().includes(cleanTerm)) ||
        (p.category && p.category.toLowerCase().includes(term)) ||
        (p.mainCode && p.mainCode.toLowerCase().includes(term));
      const matchesMainCode = matchesMainCodeFilter(p.mainCode, selectedMainCodes);
      const matchesCategory =
        selectedCategories.length === 0 ||
        selectedCategories.includes(p.category || 'General');
      const matchesLowStock = !filterLowStock || p.stock <= 10;

      return matchesSearch && matchesMainCode && matchesCategory && matchesLowStock;
    });
  }, [processedProducts, searchTerm, selectedMainCodes, selectedCategories, filterLowStock]);

  // Sort products
  const sortedProducts = useMemo(() => {
    return [...searchedProducts].sort((a, b) => {
      let valA = a[sortBy] ?? 0;
      let valB = b[sortBy] ?? 0;

      if (typeof valA === 'string') valA = valA.toLowerCase();
      if (typeof valB === 'string') valB = valB.toLowerCase();

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }, [searchedProducts, sortBy, sortOrder]);

  // Calculate paginated slice
  const totalPages = Math.ceil(sortedProducts.length / pageSize) || 1;
  const safePage = Math.min(Math.max(1, currentPage), totalPages);
  const paginatedProducts = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return sortedProducts.slice(start, start + pageSize);
  }, [sortedProducts, safePage, pageSize]);

  const { handleClose, backdropClass, panelClass } = useModalTransition({
    onClose,
    isOpen,
    duration: 170
  });

  if (!isOpen) return null;

  const startIdx = sortedProducts.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const endIdx = Math.min(safePage * pageSize, sortedProducts.length);

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-1 sm:p-4 bg-slate-900/60 backdrop-blur-xs font-sans ${backdropClass}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div
        className={`border rounded-2xl sm:rounded-3xl w-full max-w-4xl h-[95vh] sm:h-[88vh] flex flex-col shadow-2xl overflow-hidden mobile-bottom-sheet ${panelClass} ${
          isDarkMode ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-white border-slate-200 text-slate-800'
        }`}
      >
        {/* Header */}
        <div className={`p-3 sm:p-4 border-b flex items-center justify-between shrink-0 ${
          isDarkMode ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-50 border-slate-200'
        }`}>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-600 text-white shadow-xs">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">Stock Items Catalog</h2>
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                  {products.length.toLocaleString('en-IN')} Total SKUs
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                Browsing {searchedProducts.length.toLocaleString('en-IN')} matching items
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopyFiltered}
              disabled={searchedProducts.length === 0}
              className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs px-3 py-1.5 rounded-xl shadow-xs transition-all cursor-pointer active:scale-95 shrink-0"
              title={`Copy ${sortedProducts.length} filtered items`}
            >
              <Copy className="w-3.5 h-3.5" />
              <span>{copyFeedback || `COPY FILTERED PRODUCTS (${sortedProducts.length})`}</span>
            </button>

            {onStartFloorAudit && searchedProducts.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  onStartFloorAudit('Catalog Filtered Floor Audit', 'general', searchedProducts);
                  handleClose();
                }}
                className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3 py-1.5 rounded-xl shadow-xs transition-all cursor-pointer active:scale-95 shrink-0"
                title={`Start Floor Audit for these ${searchedProducts.length} items`}
              >
                <ClipboardCheck className="w-4 h-4 text-emerald-100" />
                <span>Start Floor Audit ({searchedProducts.length})</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleClose}
              className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              title="Close Catalog"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Filter Controls Bar with Multi-Select Dropdowns */}
        <div className={`p-3 border-b flex flex-col gap-2 text-xs shrink-0 ${
          isDarkMode ? 'bg-slate-950/50 border-slate-800' : 'bg-slate-50/80 border-slate-200'
        }`}>
          {/* Quick Presets */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs scrollbar-none">
            <span className="text-[11px] font-extrabold text-slate-500 dark:text-slate-400 shrink-0 mr-1 flex items-center gap-1">
              Presets:
            </span>

            <button
              onClick={() => setSelectedMainCodes([])}
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
              onClick={() => setSelectedMainCodes(['FOOD'])}
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
              onClick={() => setSelectedMainCodes(['GROCERY'])}
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
              onClick={() => setSelectedMainCodes(['NON-FOOD'])}
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
              onClick={() => setSelectedMainCodes(['NON-CORE'])}
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

            {(selectedMainCodes.length > 0 || selectedCategories.length > 0 || searchTerm || filterLowStock) && (
              <button
                onClick={() => {
                  setSelectedMainCodes([]);
                  setSelectedCategories([]);
                  setSearchTerm('');
                  setFilterLowStock(false);
                }}
                className="px-2.5 py-1 rounded-lg font-bold text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 border border-rose-200 dark:border-rose-800 transition-all cursor-pointer shrink-0"
              >
                Clear All
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2.5">
            {/* Search box */}
            <div className="relative flex-1 min-w-[220px]">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search product name, barcode, code..."
                className={`w-full rounded-xl pl-9 pr-8 py-2 text-xs font-semibold outline-none border transition-colors ${
                  isDarkMode
                    ? 'bg-slate-800 border-slate-700 text-slate-100 placeholder:text-slate-500 focus:border-indigo-500'
                    : 'bg-white border-slate-300 text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 shadow-2xs'
                }`}
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Multi-Select MainCode Filter (Separated FOOD, GROCERY, etc.) */}
            <MultiSelectDropdown
              label="MainCode"
              options={mainCodeOptions}
              selectedValues={selectedMainCodes}
              onChange={(vals) => setSelectedMainCodes(vals)}
              placeholder="All Codes"
              searchPlaceholder="Search MainCodes..."
              icon={<Layers className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />}
              isDarkMode={isDarkMode}
              badgeColor="indigo"
            />

            {/* Multi-Select Category Filter */}
            <MultiSelectDropdown
              label="Category"
              options={categoryOptions}
              selectedValues={selectedCategories}
              onChange={(vals) => setSelectedCategories(vals)}
              placeholder="All Categories"
              searchPlaceholder="Search Categories..."
              icon={<Tag className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />}
              isDarkMode={isDarkMode}
              badgeColor="emerald"
            />

            {/* Low Stock Filter Button */}
            <button
              type="button"
              onClick={() => setFilterLowStock(!filterLowStock)}
              className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                filterLowStock
                  ? 'bg-rose-50 dark:bg-rose-950/80 border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 shadow-2xs'
                  : isDarkMode
                  ? 'bg-slate-800/80 hover:bg-slate-800 border-slate-700 text-slate-400'
                  : 'bg-white hover:bg-slate-50 border-slate-300 text-slate-600'
              }`}
            >
              ⚠️ Low Stock (≤10)
            </button>
          </div>
        </div>

        {/* Compact Inventory Data Table */}
        <div className="flex-1 overflow-auto p-2 sm:p-4">
          <table className="w-full text-left text-xs border-collapse">
            <thead className={`sticky top-0 border-b z-10 font-bold ${
              isDarkMode ? 'bg-slate-800 text-slate-300 border-slate-700' : 'bg-slate-100 text-slate-700 border-slate-200'
            }`}>
              <tr>
                <th 
                  className="py-2 px-2.5 sm:py-3 sm:px-4 font-bold cursor-pointer hover:text-indigo-600 select-none" 
                  onClick={() => { setSortBy('name'); setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc'); }}
                >
                  Product SKU Details <ArrowUpDown className="w-3 h-3 inline ml-1 opacity-70" />
                </th>
                <th 
                  className="py-2 px-2 sm:py-3 sm:px-3 font-bold text-center w-28 sm:w-36 hidden sm:table-cell cursor-pointer hover:text-indigo-600 select-none"
                  onClick={() => { setSortBy('stock'); setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc'); }}
                >
                  Stock Level <ArrowUpDown className="w-3 h-3 inline ml-1 opacity-70" />
                </th>
                <th 
                  className="py-2 px-2 sm:py-3 sm:px-3 font-bold text-right w-20 sm:w-28 cursor-pointer hover:text-indigo-600 select-none" 
                  onClick={() => { setSortBy('mrp'); setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc'); }}
                >
                  MRP <ArrowUpDown className="w-3 h-3 inline ml-1 opacity-70" />
                </th>
                <th className="py-2 px-2 sm:py-3 sm:px-3 font-bold text-center w-24 sm:w-28">Action</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${
              isDarkMode ? 'divide-slate-800 text-slate-200' : 'divide-slate-200 text-slate-800'
            }`}>
              {paginatedProducts.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-16 text-center text-slate-400 font-medium">
                    No matching products found. Try adjusting filters or search.
                  </td>
                </tr>
              ) : (
                paginatedProducts.map((p) => {
                  const stock = p.stock || 0;
                  const isOut = stock <= 0;
                  const isLow = !isOut && stock <= 10;

                  return (
                    <tr 
                      key={p.id} 
                      className={`transition-colors cursor-pointer ${
                        p.stockVariation
                          ? 'bg-amber-50/50 dark:bg-amber-950/20 hover:bg-amber-50/90 dark:hover:bg-amber-950/40'
                          : isDarkMode
                          ? 'hover:bg-slate-800/60'
                          : 'hover:bg-indigo-50/40'
                      }`}
                      onClick={() => onSelectProduct(p)}
                    >
                      <td className="py-2 px-2.5 sm:py-2.5 sm:px-4 font-semibold">
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-extrabold text-slate-900 dark:text-white">{p.name}</span>
                            {p.unit && (
                              <span className="text-[10px] font-black text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/80 border border-emerald-200 dark:border-emerald-800 px-1.5 py-0.2 rounded-sm shrink-0">
                                {p.unit}
                              </span>
                            )}
                            {p.stockVariation && (
                              <span className="text-[9px] font-black uppercase px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                                Var
                              </span>
                            )}
                          </div>
                          
                          <div className="flex items-center gap-2 text-[10px] text-slate-400 font-medium flex-wrap">
                            <span>BC: <strong className="font-mono text-slate-600 dark:text-slate-300">{p.barcode}</strong></span>
                            {p.mainCode && (
                              <span className="px-1.5 py-0.2 rounded bg-indigo-50 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 font-black">
                                {p.mainCode}
                              </span>
                            )}
                            {p.category && (
                              <span className="px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-bold">
                                {p.category}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="py-2 px-2 sm:py-2.5 sm:px-3 text-center hidden sm:table-cell">
                        <span className={`inline-flex flex-col items-center gap-0.5 px-2 py-0.5 rounded-xl text-[11px] font-black border ${
                          p.stockVariation
                            ? 'bg-amber-50 dark:bg-amber-950 text-amber-800 dark:text-amber-200 border-amber-300 dark:border-amber-700'
                            : isOut
                            ? 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/80 dark:text-rose-300 dark:border-rose-800'
                            : isLow
                            ? 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/80 dark:text-amber-300 dark:border-amber-800'
                            : 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/80 dark:text-emerald-300 dark:border-emerald-800'
                        }`}>
                          <span>{stock.toLocaleString('en-IN')} units</span>
                          {p.stockVariation && p.systemStock !== undefined && (
                            <span className="text-[9px] font-bold text-amber-700 dark:text-amber-300">
                              Sys: {p.systemStock} (Var: {p.stockVariation.adjustment > 0 ? `+${p.stockVariation.adjustment}` : p.stockVariation.adjustment})
                            </span>
                          )}
                        </span>
                      </td>

                      <td className="py-2 px-2 sm:py-2.5 sm:px-3 text-right font-black text-slate-900 dark:text-white">
                        ₹{(p.mrp || p.retailPrice || 0).toLocaleString('en-IN')}
                      </td>

                      <td className="py-2 px-2 sm:py-2.5 sm:px-3 text-center">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectProduct(p);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg text-xs transition-all shadow-2xs cursor-pointer active:scale-95"
                        >
                          <Eye className="w-3 h-3" />
                          <span>Inspect</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className={`p-3 border-t flex flex-wrap items-center justify-between gap-3 text-xs shrink-0 ${
          isDarkMode ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-50 border-slate-200'
        }`}>
          <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 font-medium">
            <span>Showing <strong className="text-slate-900 dark:text-white">{startIdx} - {endIdx}</strong> of <strong className="text-indigo-600 dark:text-indigo-400">{sortedProducts.length.toLocaleString('en-IN')}</strong></span>
            <span>•</span>
            <div className="flex items-center gap-1">
              <span>Per page:</span>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className={`border rounded-lg px-2 py-1 font-bold ${
                  isDarkMode ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-white border-slate-300 text-slate-800'
                }`}
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={safePage <= 1}
              className={`p-1.5 rounded-lg border transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${
                isDarkMode ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200' : 'bg-white hover:bg-slate-100 border-slate-300 text-slate-700'
              }`}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <span className="text-slate-700 dark:text-slate-300 font-bold px-1">
              Page {safePage} of {totalPages}
            </span>

            <button
              type="button"
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={safePage >= totalPages}
              className={`p-1.5 rounded-lg border transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${
                isDarkMode ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200' : 'bg-white hover:bg-slate-100 border-slate-300 text-slate-700'
              }`}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
