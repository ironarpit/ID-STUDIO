import React, { useState, useMemo, useEffect } from 'react';
import { Product, ComputedProductAnalytics, AuditType } from '../../types';
import {
  CategorySummary,
  BrandSummary,
  SupplierSummary,
  computeCategorySummaries,
  computeBrandSummaries,
  computeSupplierSummaries,
  computeSalesVsInventoryMatrix,
  getProductBrand
} from '../../utils/analytics';
import { getUniqueMainCodes, matchesMainCodeFilter, deriveCategoriesFromProducts, matchesCategoryFilter, getValidSelectedCategories } from '../../utils/mainCode';
import { MultiSelectDropdown } from '../MultiSelectDropdown';
import { ActiveFilterChips } from '../ActiveFilterChips';
import { computeLinkedClassificationOptions } from '../../utils/linkedFilters';
import {
  Tags,
  Briefcase,
  Truck,
  BarChart3,
  Grid2X2,
  Coins,
  Search,
  Filter,
  Building2,
  ArrowUpDown,
  AlertTriangle,
  CheckCircle2,
  AlertOctagon,
  Eye,
  RefreshCw,
  Zap,
  Turtle,
  EyeOff,
  PackageX,
  ChevronLeft,
  ChevronRight,
  X,
  Layers,
  ArrowUpRight,
  PieChart,
  ClipboardCheck,
  Copy
} from 'lucide-react';
import { StockReportMeta } from '../../types';
import { formatStandardStockProductsText, copyToClipboard } from '../../utils/copyUtils';
import { formatCleanSalesPeriod } from '../../utils/fileParser';

interface CategoryBrandSupplierIntelligenceViewProps {
  products: Product[];
  analyticsMap: Map<string, ComputedProductAnalytics>;
  initialTab?: 'category' | 'brand' | 'supplier' | 'comparison' | 'matrix' | 'money_tied_up';
  onSelectProduct: (product: Product) => void;
  onStartFloorAudit?: (title: string, type: AuditType, products: Product[], categoryFilter?: string) => void;
  isDarkMode?: boolean;
  reportMeta?: StockReportMeta | null;
  storeName?: string;
}

export const CategoryBrandSupplierIntelligenceView: React.FC<CategoryBrandSupplierIntelligenceViewProps> = ({
  products,
  analyticsMap,
  initialTab = 'category',
  onSelectProduct,
  onStartFloorAudit,
  isDarkMode,
  reportMeta,
  storeName = 'PATAN'
}) => {
  // Navigation tab state
  const [activeTab, setActiveTab] = useState<'category' | 'brand' | 'supplier' | 'comparison' | 'matrix' | 'money_tied_up'>(initialTab);

  // Global filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedMainCodes, setSelectedMainCodes] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [selectedSuppliers, setSelectedSuppliers] = useState<string[]>([]);
  const [selectedStockStatus, setSelectedStockStatus] = useState<string>('all');
  const [selectedMovementStatus, setSelectedMovementStatus] = useState<string>('all');

  // Quick preset handlers for MainCodes
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
    setTablePage(1);
  };

  // Sorting state for tables
  const [sortField, setSortField] = useState<string>('inventoryValue');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Comparison Tab state
  const [compGroup, setCompGroup] = useState<'category' | 'brand' | 'supplier'>('category');
  const [compMetric, setCompMetric] = useState<
    'salesValue' | 'salesQuantity' | 'inventoryValue' | 'closingStock' | 'zeroSalesValue' | 'deadStockValue' | 'outOfStock'
  >('salesValue');

  // Drill-down Modal State
  const [drillDownTitle, setDrillDownTitle] = useState<string | null>(null);
  const [drillDownProducts, setDrillDownProducts] = useState<Product[] | null>(null);
  const [drillDownSearch, setDrillDownSearch] = useState<string>('');
  const [drillDownPage, setDrillDownPage] = useState<number>(1);
  const [drillDownCopyFeedback, setDrillDownCopyFeedback] = useState<string | null>(null);

  const handleCopyDrillDown = async (filteredList: Product[]) => {
    if (!filteredList || filteredList.length === 0) return;

    const cleanPeriod = reportMeta?.reportPeriodText
      ? formatCleanSalesPeriod(reportMeta.reportPeriodText)
      : 'Not Available';

    // Parse screen title and scope from drillDownTitle if formatted like "Supplier: ..." or "Brand: ..."
    const rawTitle = drillDownTitle || 'Product Drill-Down';
    let titleStr = rawTitle;
    let scopeStr = '';

    if (rawTitle.includes(':')) {
      const parts = rawTitle.split(':');
      titleStr = parts[0].trim();
      scopeStr = parts.slice(1).join(':').trim();
    }

    const text = formatStandardStockProductsText(filteredList, {
      title: titleStr,
      store: storeName,
      scope: scopeStr ? `${titleStr}: ${scopeStr}` : undefined,
      search: drillDownSearch.trim() || undefined,
      salesPeriod: cleanPeriod,
      analyticsMap,
    });

    const ok = await copyToClipboard(text);
    if (ok) {
      setDrillDownCopyFeedback(`Copied ${filteredList.length} products`);
      setTimeout(() => setDrillDownCopyFeedback(null), 2500);
    } else {
      setDrillDownCopyFeedback('Failed to copy');
      setTimeout(() => setDrillDownCopyFeedback(null), 2500);
    }
  };

  // Pagination for main tables
  const [tablePage, setTablePage] = useState<number>(1);
  const pageSize = 25;

  // Base predicate for search, stock status, and movement velocity
  const basePredicate = useMemo(() => {
    return (p: Product) => {
      const calc = analyticsMap.get(p.id);
      if (selectedStockStatus !== 'all') {
        if (!calc || calc.stockStatus !== selectedStockStatus) return false;
      }
      if (selectedMovementStatus !== 'all') {
        if (!calc || calc.movementStatus !== selectedMovementStatus) return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const pCat = (p.category && p.category.trim()) ? p.category.trim() : 'Unknown / Not Available';
        const pBrand = getProductBrand(p) || 'Unknown / Not Available';
        const pSupp = (p.supplierName && p.supplierName.trim()) ? p.supplierName.trim() : 'Unknown / Not Available';
        const matchName = p.name.toLowerCase().includes(q);
        const matchCode = (p.barcode && p.barcode.toLowerCase().includes(q)) || (p.localCode && p.localCode.toLowerCase().includes(q));
        const matchCat = pCat.toLowerCase().includes(q);
        const matchBrand = pBrand.toLowerCase().includes(q);
        const matchSupp = pSupp.toLowerCase().includes(q);
        if (!matchName && !matchCode && !matchCat && !matchBrand && !matchSupp) return false;
      }
      return true;
    };
  }, [analyticsMap, selectedStockStatus, selectedMovementStatus, searchQuery]);

  // Bidirectional linked options computation: MainCode, Category, Brand, Supplier
  const linkedResult = useMemo(() => {
    return computeLinkedClassificationOptions(
      products,
      {
        getMainCode: (p) => p.mainCode,
        getCategory: (p) => p.category,
        getBrand: (p) => getProductBrand(p) || 'Unknown / Not Available',
        getSupplier: (p) => p.supplierName || 'Unknown / Not Available'
      },
      {
        mainCodes: selectedMainCodes,
        categories: selectedCategories,
        brands: selectedBrands,
        suppliers: selectedSuppliers
      },
      basePredicate
    );
  }, [products, selectedMainCodes, selectedCategories, selectedBrands, selectedSuppliers, basePredicate]);

  const filteredProducts = linkedResult.filteredItems;
  const mainCodesList = linkedResult.mainCodeOptions;
  const categoriesList = linkedResult.categoryOptions;
  const brandsList = linkedResult.brandOptions;
  const suppliersList = linkedResult.supplierOptions;

  // 1. Category Summaries Computation
  const categorySummaries = useMemo(() => {
    return computeCategorySummaries(filteredProducts, analyticsMap);
  }, [filteredProducts, analyticsMap]);

  // 2. Brand Summaries Computation
  const brandSummaries = useMemo(() => {
    return computeBrandSummaries(filteredProducts, analyticsMap);
  }, [filteredProducts, analyticsMap]);

  // 3. Supplier Summaries Computation
  const supplierSummaries = useMemo(() => {
    return computeSupplierSummaries(filteredProducts, analyticsMap);
  }, [filteredProducts, analyticsMap]);

  // Sorting Helper
  const sortData = <T extends Record<string, any>>(data: T[]): T[] => {
    return [...data].sort((a, b) => {
      let valA = a[sortField];
      let valB = b[sortField];
      if (typeof valA === 'string') {
        valA = valA.toLowerCase();
        valB = (valB || '').toString().toLowerCase();
        return sortDirection === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      valA = valA || 0;
      valB = valB || 0;
      return sortDirection === 'asc' ? valA - valB : valB - valA;
    });
  };

  const sortedCategories = useMemo(() => sortData(categorySummaries), [categorySummaries, sortField, sortDirection]);
  const sortedBrands = useMemo(() => sortData(brandSummaries), [brandSummaries, sortField, sortDirection]);
  const sortedSuppliers = useMemo(() => sortData(supplierSummaries), [supplierSummaries, sortField, sortDirection]);

  // 4. Sales vs Inventory Matrix (Quadrant Analysis)
  const matrixData = useMemo(() => {
    return computeSalesVsInventoryMatrix(filteredProducts, analyticsMap);
  }, [filteredProducts, analyticsMap]);

  // Highlights for Category
  const categoryHighlights = useMemo(() => {
    if (categorySummaries.length === 0) return null;
    const sortedBySales = [...categorySummaries].sort((a, b) => b.salesValue - a.salesValue);
    const sortedByInv = [...categorySummaries].sort((a, b) => b.inventoryValue - a.inventoryValue);
    const sortedByZero = [...categorySummaries].sort((a, b) => b.zeroSalesValue - a.zeroSalesValue);
    const sortedByDead = [...categorySummaries].sort((a, b) => b.deadStockValue - a.deadStockValue);

    return {
      topSales: sortedBySales[0],
      worstSales: sortedBySales[sortedBySales.length - 1],
      topInventory: sortedByInv[0],
      topZeroSales: sortedByZero[0],
      topDeadStock: sortedByDead[0]
    };
  }, [categorySummaries]);

  // Highlights for Brand
  const brandHighlights = useMemo(() => {
    if (brandSummaries.length === 0) return null;
    const sortedBySales = [...brandSummaries].sort((a, b) => b.salesValue - a.salesValue);
    const sortedBySalesQty = [...brandSummaries].sort((a, b) => b.salesQuantity - a.salesQuantity);
    const sortedByInv = [...brandSummaries].sort((a, b) => b.inventoryValue - a.inventoryValue);
    const sortedByZero = [...brandSummaries].sort((a, b) => b.zeroSalesValue - a.zeroSalesValue);
    const sortedByDead = [...brandSummaries].sort((a, b) => b.deadStockValue - a.deadStockValue);
    const sortedByOos = [...brandSummaries].sort((a, b) => b.outOfStock - a.outOfStock);

    return {
      topSalesValue: sortedBySales[0],
      topSalesQty: sortedBySalesQty[0],
      topInventory: sortedByInv[0],
      topZeroSales: sortedByZero[0],
      topDeadStock: sortedByDead[0],
      topOos: sortedByOos[0]
    };
  }, [brandSummaries]);

  // Highlights for Supplier
  const supplierHighlights = useMemo(() => {
    if (supplierSummaries.length === 0) return null;
    const sortedBySales = [...supplierSummaries].sort((a, b) => b.salesValue - a.salesValue);
    const sortedByInv = [...supplierSummaries].sort((a, b) => b.inventoryValue - a.inventoryValue);
    const sortedByOverstock = [...supplierSummaries].sort((a, b) => b.overstockValue - a.overstockValue);
    const sortedByDead = [...supplierSummaries].sort((a, b) => b.deadStockValue - a.deadStockValue);
    const sortedByReplenish = [...supplierSummaries].sort((a, b) => b.replenishmentCount - a.replenishmentCount);

    return {
      topSales: sortedBySales[0],
      topInventory: sortedByInv[0],
      topOverstock: sortedByOverstock[0],
      topDeadStock: sortedByDead[0],
      topReplenishment: sortedByReplenish[0]
    };
  }, [supplierSummaries]);

  // Toggle Sorting
  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  // Open Drill-Down Modal
  const openDrillDown = (title: string, prods: Product[]) => {
    setDrillDownTitle(title);
    setDrillDownProducts(prods);
    setDrillDownSearch('');
    setDrillDownPage(1);
  };

  // Reset Filters
  const handleResetFilters = () => {
    setSearchQuery('');
    setSelectedMainCodes([]);
    setSelectedCategories([]);
    setSelectedBrands([]);
    setSelectedSuppliers([]);
    setSelectedStockStatus('all');
    setSelectedMovementStatus('all');
    setTablePage(1);
  };

  return (
    <div className="space-y-4">
      {/* Module Title Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
              Module 9 Intelligence
            </span>
            <span className="text-xs font-bold text-slate-400">
              {filteredProducts.length.toLocaleString('en-IN')} SKUs Evaluated
            </span>
            {onStartFloorAudit && (
              <button
                type="button"
                onClick={() => {
                  const catName = selectedCategories.length === 1 ? selectedCategories[0] : (selectedCategories.length > 1 ? `${selectedCategories.length} Categories` : 'Category');
                  onStartFloorAudit(
                    `Category Audit - ${catName}`,
                    'category',
                    filteredProducts,
                    selectedCategories.length === 1 ? selectedCategories[0] : undefined
                  );
                }}
                className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3 py-1 rounded-xl shadow-xs transition-all cursor-pointer active:scale-95 shrink-0 ml-1"
                title={`Start Floor Audit using currently filtered category items (${filteredProducts.length} SKUs)`}
              >
                <ClipboardCheck className="w-4 h-4 text-emerald-100" />
                <span>Start Floor Audit ({filteredProducts.length})</span>
              </button>
            )}
          </div>
          <h1 className="text-xl font-black tracking-tight dark:text-white mt-1">
            Category, Brand & Supplier Intelligence Console
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Multi-dimensional commercial analytics, risk matrices, money tied-up audit, and supplier replenishment
          </p>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 custom-scrollbar">
          {[
            { id: 'category', label: 'Categories', icon: Tags, badge: categorySummaries.length },
            { id: 'brand', label: 'Brands', icon: Briefcase, badge: brandSummaries.length },
            { id: 'supplier', label: 'Suppliers', icon: Truck, badge: supplierSummaries.length },
            { id: 'comparison', label: 'Comparison', icon: BarChart3 },
            { id: 'matrix', label: 'Sales vs Stock', icon: Grid2X2 },
            { id: 'money_tied_up', label: 'Money Tied Up', icon: Coins }
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id as any);
                  setTablePage(1);
                }}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : isDarkMode
                    ? 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
                    : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span>{tab.label}</span>
                {tab.badge !== undefined && (
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                    isActive ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                  }`}>
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Global Multi-Filter Bar */}
      <div className={`p-3.5 rounded-2xl border ${
        isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'
      } shadow-2xs space-y-2.5`}>
        {/* Quick Presets for Food & Grocery */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs scrollbar-none">
          <span className="text-[11px] font-extrabold text-slate-500 dark:text-slate-400 shrink-0 mr-1 flex items-center gap-1">
            <Building2 className="w-3 h-3 text-indigo-500" />
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

          {(selectedMainCodes.length > 0 || selectedCategories.length > 0 || selectedBrands.length > 0 || selectedSuppliers.length > 0 || selectedStockStatus !== 'all' || selectedMovementStatus !== 'all' || searchQuery.trim()) && (
            <button
              onClick={handleResetFilters}
              className="text-xs text-rose-600 dark:text-rose-400 font-bold hover:bg-rose-50 dark:hover:bg-rose-950/50 border border-rose-200 dark:border-rose-800 px-2.5 py-1 rounded-lg flex items-center gap-1 cursor-pointer shrink-0"
            >
              <X className="w-3 h-3" /> Reset Filters
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-2 items-center">
          {/* 1. Search */}
          <div className="relative flex items-center bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1.5">
            <Search className="w-3.5 h-3.5 text-slate-400 mr-2 shrink-0" />
            <input
              type="text"
              placeholder="Search SKUs / Brand..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent text-xs text-slate-800 dark:text-slate-200 focus:outline-none w-full font-medium"
            />
          </div>

          {/* 2. Main Code (MultiSelect) */}
          <MultiSelectDropdown
            label="MainCode"
            options={mainCodesList}
            selectedValues={selectedMainCodes}
            onChange={(vals) => {
              setSelectedMainCodes(vals);
              setTablePage(1);
            }}
            placeholder="All"
            searchPlaceholder="Search MainCodes..."
            icon={<Building2 className="w-3.5 h-3.5 text-indigo-500 shrink-0" />}
            isDarkMode={isDarkMode}
            badgeColor="indigo"
          />

          {/* 3. Category (MultiSelect) */}
          <MultiSelectDropdown
            label="Category"
            options={categoriesList}
            selectedValues={selectedCategories}
            onChange={(vals) => {
              setSelectedCategories(vals);
              setTablePage(1);
            }}
            placeholder="All"
            searchPlaceholder="Search categories..."
            icon={<Tags className="w-3.5 h-3.5 text-teal-500 shrink-0" />}
            isDarkMode={isDarkMode}
            badgeColor="emerald"
          />

          {/* 4. Brand (MultiSelect) */}
          <MultiSelectDropdown
            label="Brand"
            options={brandsList}
            selectedValues={selectedBrands}
            onChange={(vals) => {
              setSelectedBrands(vals);
              setTablePage(1);
            }}
            placeholder="All"
            searchPlaceholder="Search brands..."
            icon={<Briefcase className="w-3.5 h-3.5 text-purple-500 mr-1 shrink-0" />}
            isDarkMode={isDarkMode}
            badgeColor="purple"
          />

          {/* 5. Supplier (MultiSelect) */}
          <MultiSelectDropdown
            label="Supplier"
            options={suppliersList}
            selectedValues={selectedSuppliers}
            onChange={(vals) => {
              setSelectedSuppliers(vals);
              setTablePage(1);
            }}
            placeholder="All"
            searchPlaceholder="Search suppliers..."
            icon={<Truck className="w-3.5 h-3.5 text-amber-500 mr-1 shrink-0" />}
            isDarkMode={isDarkMode}
            badgeColor="amber"
          />

          {/* 6. Stock Status */}
          <div className="flex items-center bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1.5">
            <Layers className="w-3.5 h-3.5 text-slate-400 mr-1.5 shrink-0" />
            <select
              value={selectedStockStatus}
              onChange={(e) => setSelectedStockStatus(e.target.value)}
              className="bg-transparent text-xs text-slate-800 dark:text-slate-200 focus:outline-none w-full font-semibold truncate cursor-pointer"
            >
              <option value="all">Stock Status: All</option>
              <option value="out_of_stock">Out of Stock</option>
              <option value="low_stock">Low Stock</option>
              <option value="overstock">Overstock</option>
              <option value="normal">Normal</option>
            </select>
          </div>

          {/* 7. Movement Status */}
          <div className="flex items-center bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1.5">
            <Zap className="w-3.5 h-3.5 text-slate-400 mr-1.5 shrink-0" />
            <select
              value={selectedMovementStatus}
              onChange={(e) => setSelectedMovementStatus(e.target.value)}
              className="bg-transparent text-xs text-slate-800 dark:text-slate-200 focus:outline-none w-full font-semibold truncate cursor-pointer"
            >
              <option value="all">Velocity: All</option>
              <option value="fast">Fast Moving</option>
              <option value="slow">Slow Moving</option>
              <option value="zero_sales">Zero Sales</option>
              <option value="dead">Dead Stock</option>
            </select>
          </div>
        </div>

        {/* Reusable Linked Active Filter Chips */}
        <ActiveFilterChips
          groups={[
            {
              label: 'MainCode',
              values: selectedMainCodes,
              onRemove: (v) => {
                setSelectedMainCodes(selectedMainCodes.filter((c) => c !== v));
                setTablePage(1);
              },
              onClear: () => {
                setSelectedMainCodes([]);
                setTablePage(1);
              },
              badgeColor: 'indigo',
              incompatibleValues: mainCodesList.filter((o) => o.incompatible).map((o) => o.value)
            },
            {
              label: 'Category',
              values: selectedCategories,
              onRemove: (v) => {
                setSelectedCategories(selectedCategories.filter((c) => c !== v));
                setTablePage(1);
              },
              onClear: () => {
                setSelectedCategories([]);
                setTablePage(1);
              },
              badgeColor: 'emerald',
              incompatibleValues: categoriesList.filter((o) => o.incompatible).map((o) => o.value)
            },
            {
              label: 'Brand',
              values: selectedBrands,
              onRemove: (v) => {
                setSelectedBrands(selectedBrands.filter((b) => b !== v));
                setTablePage(1);
              },
              onClear: () => {
                setSelectedBrands([]);
                setTablePage(1);
              },
              badgeColor: 'purple',
              incompatibleValues: brandsList.filter((o) => o.incompatible).map((o) => o.value)
            },
            {
              label: 'Supplier',
              values: selectedSuppliers,
              onRemove: (v) => {
                setSelectedSuppliers(selectedSuppliers.filter((s) => s !== v));
                setTablePage(1);
              },
              onClear: () => {
                setSelectedSuppliers([]);
                setTablePage(1);
              },
              badgeColor: 'amber',
              incompatibleValues: suppliersList.filter((o) => o.incompatible).map((o) => o.value)
            }
          ]}
          onResetAll={handleResetFilters}
          totalFilteredCount={filteredProducts.length}
          totalItemCount={products.length}
          isDarkMode={isDarkMode}
        />
      </div>

      {/* ======================================================== */}
      {/* 1. CATEGORY INTELLIGENCE & HEALTH TAB */}
      {/* ======================================================== */}
      {activeTab === 'category' && (
        <div className="space-y-4">
          {/* Top Highlights Cards */}
          {categoryHighlights && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-2.5">
              <div
                onClick={() => categoryHighlights.topSales && openDrillDown(`Top Category Sales: ${categoryHighlights.topSales.category}`, categoryHighlights.topSales.products)}
                className="p-3 rounded-2xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-950/30 cursor-pointer hover:border-emerald-400 transition-all"
              >
                <span className="text-[10px] font-extrabold uppercase text-emerald-700 dark:text-emerald-400 block">Top Sales Category</span>
                <span className="font-extrabold text-sm text-slate-900 dark:text-white truncate block mt-0.5">
                  {categoryHighlights.topSales?.category}
                </span>
                <span className="text-xs font-black text-emerald-600 dark:text-emerald-300 block">
                  ₹{categoryHighlights.topSales?.salesValue.toLocaleString('en-IN')}
                </span>
              </div>

              <div
                onClick={() => categoryHighlights.topInventory && openDrillDown(`Highest Inventory Value Category: ${categoryHighlights.topInventory.category}`, categoryHighlights.topInventory.products)}
                className="p-3 rounded-2xl border border-indigo-200 dark:border-indigo-900/50 bg-indigo-50/50 dark:bg-indigo-950/30 cursor-pointer hover:border-indigo-400 transition-all"
              >
                <span className="text-[10px] font-extrabold uppercase text-indigo-700 dark:text-indigo-400 block">Highest Inventory</span>
                <span className="font-extrabold text-sm text-slate-900 dark:text-white truncate block mt-0.5">
                  {categoryHighlights.topInventory?.category}
                </span>
                <span className="text-xs font-black text-indigo-600 dark:text-indigo-300 block">
                  ₹{categoryHighlights.topInventory?.inventoryValue.toLocaleString('en-IN')}
                </span>
              </div>

              <div
                onClick={() => categoryHighlights.topZeroSales && openDrillDown(`Highest Zero Sales Category: ${categoryHighlights.topZeroSales.category}`, categoryHighlights.topZeroSales.products)}
                className="p-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-100/50 dark:bg-slate-900/50 cursor-pointer hover:border-slate-400 transition-all"
              >
                <span className="text-[10px] font-extrabold uppercase text-slate-600 dark:text-slate-400 block">Highest Zero-Sales</span>
                <span className="font-extrabold text-sm text-slate-900 dark:text-white truncate block mt-0.5">
                  {categoryHighlights.topZeroSales?.category}
                </span>
                <span className="text-xs font-black text-slate-700 dark:text-slate-300 block">
                  ₹{categoryHighlights.topZeroSales?.zeroSalesValue.toLocaleString('en-IN')}
                </span>
              </div>

              <div
                onClick={() => categoryHighlights.topDeadStock && openDrillDown(`Highest Dead Stock Category: ${categoryHighlights.topDeadStock.category}`, categoryHighlights.topDeadStock.products)}
                className="p-3 rounded-2xl border border-rose-200 dark:border-rose-900/50 bg-rose-50/50 dark:bg-rose-950/30 cursor-pointer hover:border-rose-400 transition-all"
              >
                <span className="text-[10px] font-extrabold uppercase text-rose-700 dark:text-rose-400 block">Highest Dead Stock</span>
                <span className="font-extrabold text-sm text-slate-900 dark:text-white truncate block mt-0.5">
                  {categoryHighlights.topDeadStock?.category}
                </span>
                <span className="text-xs font-black text-rose-600 dark:text-rose-300 block">
                  ₹{categoryHighlights.topDeadStock?.deadStockValue.toLocaleString('en-IN')}
                </span>
              </div>

              <div
                onClick={() => categoryHighlights.worstSales && openDrillDown(`Lowest Sales Category: ${categoryHighlights.worstSales.category}`, categoryHighlights.worstSales.products)}
                className="p-3 rounded-2xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/30 cursor-pointer hover:border-amber-400 transition-all"
              >
                <span className="text-[10px] font-extrabold uppercase text-amber-700 dark:text-amber-400 block">Lowest Sales Category</span>
                <span className="font-extrabold text-sm text-slate-900 dark:text-white truncate block mt-0.5">
                  {categoryHighlights.worstSales?.category}
                </span>
                <span className="text-xs font-black text-amber-700 dark:text-amber-300 block">
                  ₹{categoryHighlights.worstSales?.salesValue.toLocaleString('en-IN')}
                </span>
              </div>

              <div className="p-3 rounded-2xl border border-purple-200 dark:border-purple-900/50 bg-purple-50/50 dark:bg-purple-950/30">
                <span className="text-[10px] font-extrabold uppercase text-purple-700 dark:text-purple-400 block">Category Health</span>
                <div className="flex items-center gap-1.5 mt-1 font-extrabold text-xs">
                  <span className="text-emerald-600 dark:text-emerald-400">🟢 {categorySummaries.filter(c => c.healthStatus === 'healthy').length}</span>
                  <span className="text-amber-600 dark:text-amber-400">🟡 {categorySummaries.filter(c => c.healthStatus === 'attention').length}</span>
                  <span className="text-rose-600 dark:text-rose-400">🔴 {categorySummaries.filter(c => c.healthStatus === 'risk').length}</span>
                </div>
              </div>
            </div>
          )}

          {/* Category Table */}
          <div className={`rounded-2xl border overflow-hidden ${
            isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'
          } shadow-2xs`}>
            <div className="p-3 border-b flex items-center justify-between border-slate-100 dark:border-slate-700">
              <h3 className="text-xs font-black uppercase tracking-wider dark:text-white flex items-center gap-2">
                <Tags className="w-4 h-4 text-teal-500" />
                Category Performance Breakdown ({categorySummaries.length})
              </h3>
              <span className="text-[10px] text-slate-400 font-medium">Click any row to view exact products</span>
            </div>

            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left text-xs">
                <thead className={`text-[10px] uppercase font-black tracking-wider border-b ${
                  isDarkMode ? 'bg-slate-900/80 text-slate-300 border-slate-700' : 'bg-slate-50 text-slate-600 border-slate-200'
                }`}>
                  <tr>
                    <th className="p-2.5 cursor-pointer" onClick={() => handleSort('category')}>
                      Category <ArrowUpDown className="w-3 h-3 inline text-slate-400" />
                    </th>
                    <th className="p-2.5 cursor-pointer" onClick={() => handleSort('healthStatus')}>
                      Health <ArrowUpDown className="w-3 h-3 inline text-slate-400" />
                    </th>
                    <th className="p-2.5 text-right cursor-pointer" onClick={() => handleSort('productCount')}>
                      SKUs <ArrowUpDown className="w-3 h-3 inline text-slate-400" />
                    </th>
                    <th className="p-2.5 text-right cursor-pointer" onClick={() => handleSort('closingStock')}>
                      Stock Qty <ArrowUpDown className="w-3 h-3 inline text-slate-400" />
                    </th>
                    <th className="p-2.5 text-right cursor-pointer" onClick={() => handleSort('salesQuantity')}>
                      Sales Qty <ArrowUpDown className="w-3 h-3 inline text-slate-400" />
                    </th>
                    <th className="p-2.5 text-right cursor-pointer" onClick={() => handleSort('salesValue')}>
                      Sales Value <ArrowUpDown className="w-3 h-3 inline text-slate-400" />
                    </th>
                    <th className="p-2.5 text-right cursor-pointer" onClick={() => handleSort('inventoryValue')}>
                      Inventory Cost <ArrowUpDown className="w-3 h-3 inline text-slate-400" />
                    </th>
                    <th className="p-2.5 text-right cursor-pointer" onClick={() => handleSort('retailValue')}>
                      Retail Value <ArrowUpDown className="w-3 h-3 inline text-slate-400" />
                    </th>
                    <th className="p-2.5 text-right cursor-pointer" onClick={() => handleSort('fastMovers')}>
                      Fast <ArrowUpDown className="w-3 h-3 inline text-slate-400" />
                    </th>
                    <th className="p-2.5 text-right cursor-pointer" onClick={() => handleSort('slowMovers')}>
                      Slow <ArrowUpDown className="w-3 h-3 inline text-slate-400" />
                    </th>
                    <th className="p-2.5 text-right cursor-pointer" onClick={() => handleSort('zeroSales')}>
                      Unsold <ArrowUpDown className="w-3 h-3 inline text-slate-400" />
                    </th>
                    <th className="p-2.5 text-right cursor-pointer" onClick={() => handleSort('deadStock')}>
                      Dead <ArrowUpDown className="w-3 h-3 inline text-slate-400" />
                    </th>
                    <th className="p-2.5 text-right cursor-pointer" onClick={() => handleSort('outOfStock')}>
                      OOS <ArrowUpDown className="w-3 h-3 inline text-slate-400" />
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60 font-medium">
                  {sortedCategories.slice((tablePage - 1) * pageSize, tablePage * pageSize).map((cat) => (
                    <tr
                      key={cat.category}
                      onClick={() => openDrillDown(`Category: ${cat.category}`, cat.products)}
                      className="hover:bg-indigo-50/50 dark:hover:bg-slate-700/50 cursor-pointer transition-colors"
                    >
                      <td className="p-2.5 font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <Tags className="w-3.5 h-3.5 text-teal-500 shrink-0" />
                        <span>{cat.category}</span>
                      </td>
                      <td className="p-2.5">
                        {cat.healthStatus === 'healthy' && <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">🟢 Healthy</span>}
                        {cat.healthStatus === 'attention' && <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">🟡 Needs Attention</span>}
                        {cat.healthStatus === 'risk' && <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">🔴 High Risk</span>}
                      </td>
                      <td className="p-2.5 text-right font-bold text-slate-800 dark:text-slate-200">{cat.productCount}</td>
                      <td className="p-2.5 text-right font-bold text-slate-800 dark:text-slate-200">{cat.closingStock.toLocaleString('en-IN')}</td>
                      <td className="p-2.5 text-right font-bold text-indigo-600 dark:text-indigo-400">{cat.salesQuantity.toLocaleString('en-IN')}</td>
                      <td className="p-2.5 text-right font-black text-emerald-600 dark:text-emerald-400">₹{cat.salesValue.toLocaleString('en-IN')}</td>
                      <td className="p-2.5 text-right font-black text-slate-900 dark:text-white">₹{cat.inventoryValue.toLocaleString('en-IN')}</td>
                      <td className="p-2.5 text-right font-bold text-purple-600 dark:text-purple-400">₹{cat.retailValue.toLocaleString('en-IN')}</td>
                      <td className="p-2.5 text-right font-bold text-emerald-600">{cat.fastMovers}</td>
                      <td className="p-2.5 text-right font-bold text-amber-600">{cat.slowMovers}</td>
                      <td className="p-2.5 text-right font-bold text-slate-500">{cat.zeroSales}</td>
                      <td className="p-2.5 text-right font-bold text-rose-600">{cat.deadStock}</td>
                      <td className="p-2.5 text-right font-bold text-rose-700">{cat.outOfStock}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {categorySummaries.length > pageSize && (
              <div className="p-2.5 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between text-xs font-bold text-slate-500">
                <span>Showing {((tablePage - 1) * pageSize) + 1} - {Math.min(tablePage * pageSize, categorySummaries.length)} of {categorySummaries.length} Categories</span>
                <div className="flex items-center gap-1">
                  <button
                    disabled={tablePage === 1}
                    onClick={() => setTablePage(p => p - 1)}
                    className="p-1 rounded-lg border disabled:opacity-30 cursor-pointer"
                  ><ChevronLeft className="w-4 h-4" /></button>
                  <span>Page {tablePage} of {Math.ceil(categorySummaries.length / pageSize)}</span>
                  <button
                    disabled={tablePage >= Math.ceil(categorySummaries.length / pageSize)}
                    onClick={() => setTablePage(p => p + 1)}
                    className="p-1 rounded-lg border disabled:opacity-30 cursor-pointer"
                  ><ChevronRight className="w-4 h-4" /></button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 2. BRAND INTELLIGENCE TAB */}
      {/* ======================================================== */}
      {activeTab === 'brand' && (
        <div className="space-y-4">
          {/* Brand Highlights */}
          {brandHighlights && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-2.5">
              <div
                onClick={() => brandHighlights.topSalesValue && openDrillDown(`Top Brand by Sales Value: ${brandHighlights.topSalesValue.brand}`, brandHighlights.topSalesValue.products)}
                className="p-3 rounded-2xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-950/30 cursor-pointer hover:border-emerald-400 transition-all"
              >
                <span className="text-[10px] font-extrabold uppercase text-emerald-700 dark:text-emerald-400 block">Top Sales Value Brand</span>
                <span className="font-extrabold text-sm text-slate-900 dark:text-white truncate block mt-0.5">{brandHighlights.topSalesValue?.brand}</span>
                <span className="text-xs font-black text-emerald-600 dark:text-emerald-300 block">₹{brandHighlights.topSalesValue?.salesValue.toLocaleString('en-IN')}</span>
              </div>

              <div
                onClick={() => brandHighlights.topSalesQty && openDrillDown(`Top Brand by Sales Volume: ${brandHighlights.topSalesQty.brand}`, brandHighlights.topSalesQty.products)}
                className="p-3 rounded-2xl border border-blue-200 dark:border-blue-900/50 bg-blue-50/50 dark:bg-blue-950/30 cursor-pointer hover:border-blue-400 transition-all"
              >
                <span className="text-[10px] font-extrabold uppercase text-blue-700 dark:text-blue-400 block">Top Volume Brand</span>
                <span className="font-extrabold text-sm text-slate-900 dark:text-white truncate block mt-0.5">{brandHighlights.topSalesQty?.brand}</span>
                <span className="text-xs font-black text-blue-600 dark:text-blue-300 block">{brandHighlights.topSalesQty?.salesQuantity.toLocaleString('en-IN')} Units</span>
              </div>

              <div
                onClick={() => brandHighlights.topInventory && openDrillDown(`Highest Inventory Brand: ${brandHighlights.topInventory.brand}`, brandHighlights.topInventory.products)}
                className="p-3 rounded-2xl border border-indigo-200 dark:border-indigo-900/50 bg-indigo-50/50 dark:bg-indigo-950/30 cursor-pointer hover:border-indigo-400 transition-all"
              >
                <span className="text-[10px] font-extrabold uppercase text-indigo-700 dark:text-indigo-400 block">Highest Inventory</span>
                <span className="font-extrabold text-sm text-slate-900 dark:text-white truncate block mt-0.5">{brandHighlights.topInventory?.brand}</span>
                <span className="text-xs font-black text-indigo-600 dark:text-indigo-300 block">₹{brandHighlights.topInventory?.inventoryValue.toLocaleString('en-IN')}</span>
              </div>

              <div
                onClick={() => brandHighlights.topDeadStock && openDrillDown(`Highest Dead Stock Brand: ${brandHighlights.topDeadStock.brand}`, brandHighlights.topDeadStock.products)}
                className="p-3 rounded-2xl border border-rose-200 dark:border-rose-900/50 bg-rose-50/50 dark:bg-rose-950/30 cursor-pointer hover:border-rose-400 transition-all"
              >
                <span className="text-[10px] font-extrabold uppercase text-rose-700 dark:text-rose-400 block">Highest Dead Stock</span>
                <span className="font-extrabold text-sm text-slate-900 dark:text-white truncate block mt-0.5">{brandHighlights.topDeadStock?.brand}</span>
                <span className="text-xs font-black text-rose-600 dark:text-rose-300 block">₹{brandHighlights.topDeadStock?.deadStockValue.toLocaleString('en-IN')}</span>
              </div>

              <div
                onClick={() => brandHighlights.topZeroSales && openDrillDown(`Highest Zero Sales Brand: ${brandHighlights.topZeroSales.brand}`, brandHighlights.topZeroSales.products)}
                className="p-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-100/50 dark:bg-slate-900/50 cursor-pointer hover:border-slate-400 transition-all"
              >
                <span className="text-[10px] font-extrabold uppercase text-slate-600 dark:text-slate-400 block">Highest Zero Sales</span>
                <span className="font-extrabold text-sm text-slate-900 dark:text-white truncate block mt-0.5">{brandHighlights.topZeroSales?.brand}</span>
                <span className="text-xs font-black text-slate-700 dark:text-slate-300 block">₹{brandHighlights.topZeroSales?.zeroSalesValue.toLocaleString('en-IN')}</span>
              </div>

              <div
                onClick={() => brandHighlights.topOos && openDrillDown(`Highest Out of Stock Brand: ${brandHighlights.topOos.brand}`, brandHighlights.topOos.products)}
                className="p-3 rounded-2xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/30 cursor-pointer hover:border-amber-400 transition-all"
              >
                <span className="text-[10px] font-extrabold uppercase text-amber-700 dark:text-amber-400 block">Most Out of Stock</span>
                <span className="font-extrabold text-sm text-slate-900 dark:text-white truncate block mt-0.5">{brandHighlights.topOos?.brand}</span>
                <span className="text-xs font-black text-amber-700 dark:text-amber-300 block">{brandHighlights.topOos?.outOfStock} OOS SKUs</span>
              </div>
            </div>
          )}

          {/* Brand Table */}
          <div className={`rounded-2xl border overflow-hidden ${
            isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'
          } shadow-2xs`}>
            <div className="p-3 border-b flex items-center justify-between border-slate-100 dark:border-slate-700">
              <h3 className="text-xs font-black uppercase tracking-wider dark:text-white flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-purple-500" />
                Brand Intelligence Catalog ({brandSummaries.length})
              </h3>
              <span className="text-[10px] text-slate-400 font-medium">Click any row to drill down</span>
            </div>

            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left text-xs">
                <thead className={`text-[10px] uppercase font-black tracking-wider border-b ${
                  isDarkMode ? 'bg-slate-900/80 text-slate-300 border-slate-700' : 'bg-slate-50 text-slate-600 border-slate-200'
                }`}>
                  <tr>
                    <th className="p-2.5 cursor-pointer" onClick={() => handleSort('brand')}>
                      Brand <ArrowUpDown className="w-3 h-3 inline text-slate-400" />
                    </th>
                    <th className="p-2.5 text-right cursor-pointer" onClick={() => handleSort('productCount')}>
                      SKUs <ArrowUpDown className="w-3 h-3 inline text-slate-400" />
                    </th>
                    <th className="p-2.5 text-right cursor-pointer" onClick={() => handleSort('closingStock')}>
                      Stock Qty <ArrowUpDown className="w-3 h-3 inline text-slate-400" />
                    </th>
                    <th className="p-2.5 text-right cursor-pointer" onClick={() => handleSort('salesQuantity')}>
                      Sales Qty <ArrowUpDown className="w-3 h-3 inline text-slate-400" />
                    </th>
                    <th className="p-2.5 text-right cursor-pointer" onClick={() => handleSort('salesValue')}>
                      Sales Value <ArrowUpDown className="w-3 h-3 inline text-slate-400" />
                    </th>
                    <th className="p-2.5 text-right cursor-pointer" onClick={() => handleSort('inventoryValue')}>
                      Inventory Cost <ArrowUpDown className="w-3 h-3 inline text-slate-400" />
                    </th>
                    <th className="p-2.5 text-right cursor-pointer" onClick={() => handleSort('retailValue')}>
                      Retail Value <ArrowUpDown className="w-3 h-3 inline text-slate-400" />
                    </th>
                    <th className="p-2.5 text-right cursor-pointer" onClick={() => handleSort('fastMovers')}>
                      Fast <ArrowUpDown className="w-3 h-3 inline text-slate-400" />
                    </th>
                    <th className="p-2.5 text-right cursor-pointer" onClick={() => handleSort('slowMovers')}>
                      Slow <ArrowUpDown className="w-3 h-3 inline text-slate-400" />
                    </th>
                    <th className="p-2.5 text-right cursor-pointer" onClick={() => handleSort('zeroSales')}>
                      Unsold <ArrowUpDown className="w-3 h-3 inline text-slate-400" />
                    </th>
                    <th className="p-2.5 text-right cursor-pointer" onClick={() => handleSort('deadStock')}>
                      Dead <ArrowUpDown className="w-3 h-3 inline text-slate-400" />
                    </th>
                    <th className="p-2.5 text-right cursor-pointer" onClick={() => handleSort('outOfStock')}>
                      OOS <ArrowUpDown className="w-3 h-3 inline text-slate-400" />
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60 font-medium">
                  {sortedBrands.slice((tablePage - 1) * pageSize, tablePage * pageSize).map((b) => (
                    <tr
                      key={b.brand}
                      onClick={() => openDrillDown(`Brand: ${b.brand}`, b.products)}
                      className="hover:bg-purple-50/50 dark:hover:bg-slate-700/50 cursor-pointer transition-colors"
                    >
                      <td className="p-2.5 font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <Briefcase className="w-3.5 h-3.5 text-purple-500 shrink-0" />
                        <span>{b.brand}</span>
                      </td>
                      <td className="p-2.5 text-right font-bold text-slate-800 dark:text-slate-200">{b.productCount}</td>
                      <td className="p-2.5 text-right font-bold text-slate-800 dark:text-slate-200">{b.closingStock.toLocaleString('en-IN')}</td>
                      <td className="p-2.5 text-right font-bold text-indigo-600 dark:text-indigo-400">{b.salesQuantity.toLocaleString('en-IN')}</td>
                      <td className="p-2.5 text-right font-black text-emerald-600 dark:text-emerald-400">₹{b.salesValue.toLocaleString('en-IN')}</td>
                      <td className="p-2.5 text-right font-black text-slate-900 dark:text-white">₹{b.inventoryValue.toLocaleString('en-IN')}</td>
                      <td className="p-2.5 text-right font-bold text-purple-600 dark:text-purple-400">₹{b.retailValue.toLocaleString('en-IN')}</td>
                      <td className="p-2.5 text-right font-bold text-emerald-600">{b.fastMovers}</td>
                      <td className="p-2.5 text-right font-bold text-amber-600">{b.slowMovers}</td>
                      <td className="p-2.5 text-right font-bold text-slate-500">{b.zeroSales}</td>
                      <td className="p-2.5 text-right font-bold text-rose-600">{b.deadStock}</td>
                      <td className="p-2.5 text-right font-bold text-rose-700">{b.outOfStock}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {brandSummaries.length > pageSize && (
              <div className="p-2.5 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between text-xs font-bold text-slate-500">
                <span>Showing {((tablePage - 1) * pageSize) + 1} - {Math.min(tablePage * pageSize, brandSummaries.length)} of {brandSummaries.length} Brands</span>
                <div className="flex items-center gap-1">
                  <button
                    disabled={tablePage === 1}
                    onClick={() => setTablePage(p => p - 1)}
                    className="p-1 rounded-lg border disabled:opacity-30 cursor-pointer"
                  ><ChevronLeft className="w-4 h-4" /></button>
                  <span>Page {tablePage} of {Math.ceil(brandSummaries.length / pageSize)}</span>
                  <button
                    disabled={tablePage >= Math.ceil(brandSummaries.length / pageSize)}
                    onClick={() => setTablePage(p => p + 1)}
                    className="p-1 rounded-lg border disabled:opacity-30 cursor-pointer"
                  ><ChevronRight className="w-4 h-4" /></button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 3. SUPPLIER INTELLIGENCE & REPLENISHMENT TAB */}
      {/* ======================================================== */}
      {activeTab === 'supplier' && (
        <div className="space-y-4">
          {/* Supplier Highlights */}
          {supplierHighlights && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-2.5">
              <div
                onClick={() => supplierHighlights.topInventory && openDrillDown(`Highest Inventory Supplier: ${supplierHighlights.topInventory.supplierName}`, supplierHighlights.topInventory.products)}
                className="p-3 rounded-2xl border border-indigo-200 dark:border-indigo-900/50 bg-indigo-50/50 dark:bg-indigo-950/30 cursor-pointer hover:border-indigo-400 transition-all"
              >
                <span className="text-[10px] font-extrabold uppercase text-indigo-700 dark:text-indigo-400 block">Highest Inventory Supplier</span>
                <span className="font-extrabold text-sm text-slate-900 dark:text-white truncate block mt-0.5">{supplierHighlights.topInventory?.supplierName}</span>
                <span className="text-xs font-black text-indigo-600 dark:text-indigo-300 block">₹{supplierHighlights.topInventory?.inventoryValue.toLocaleString('en-IN')}</span>
              </div>

              <div
                onClick={() => supplierHighlights.topSales && openDrillDown(`Highest Sales Supplier: ${supplierHighlights.topSales.supplierName}`, supplierHighlights.topSales.products)}
                className="p-3 rounded-2xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-950/30 cursor-pointer hover:border-emerald-400 transition-all"
              >
                <span className="text-[10px] font-extrabold uppercase text-emerald-700 dark:text-emerald-400 block">Top Sales Supplier</span>
                <span className="font-extrabold text-sm text-slate-900 dark:text-white truncate block mt-0.5">{supplierHighlights.topSales?.supplierName}</span>
                <span className="text-xs font-black text-emerald-600 dark:text-emerald-300 block">₹{supplierHighlights.topSales?.salesValue.toLocaleString('en-IN')}</span>
              </div>

              <div
                onClick={() => supplierHighlights.topOverstock && openDrillDown(`Highest Overstock Supplier: ${supplierHighlights.topOverstock.supplierName}`, supplierHighlights.topOverstock.products)}
                className="p-3 rounded-2xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/30 cursor-pointer hover:border-amber-400 transition-all"
              >
                <span className="text-[10px] font-extrabold uppercase text-amber-700 dark:text-amber-400 block">Highest Overstock</span>
                <span className="font-extrabold text-sm text-slate-900 dark:text-white truncate block mt-0.5">{supplierHighlights.topOverstock?.supplierName}</span>
                <span className="text-xs font-black text-amber-700 dark:text-amber-300 block">₹{supplierHighlights.topOverstock?.overstockValue.toLocaleString('en-IN')}</span>
              </div>

              <div
                onClick={() => supplierHighlights.topDeadStock && openDrillDown(`Highest Dead Stock Supplier: ${supplierHighlights.topDeadStock.supplierName}`, supplierHighlights.topDeadStock.products)}
                className="p-3 rounded-2xl border border-rose-200 dark:border-rose-900/50 bg-rose-50/50 dark:bg-rose-950/30 cursor-pointer hover:border-rose-400 transition-all"
              >
                <span className="text-[10px] font-extrabold uppercase text-rose-700 dark:text-rose-400 block">Highest Dead Stock</span>
                <span className="font-extrabold text-sm text-slate-900 dark:text-white truncate block mt-0.5">{supplierHighlights.topDeadStock?.supplierName}</span>
                <span className="text-xs font-black text-rose-600 dark:text-rose-300 block">₹{supplierHighlights.topDeadStock?.deadStockValue.toLocaleString('en-IN')}</span>
              </div>

              <div
                onClick={() => supplierHighlights.topReplenishment && openDrillDown(`Most Replenishment Needs: ${supplierHighlights.topReplenishment.supplierName}`, supplierHighlights.topReplenishment.products)}
                className="p-3 rounded-2xl border border-purple-200 dark:border-purple-900/50 bg-purple-50/50 dark:bg-purple-950/30 cursor-pointer hover:border-purple-400 transition-all"
              >
                <span className="text-[10px] font-extrabold uppercase text-purple-700 dark:text-purple-400 block">Top Reorder Supplier</span>
                <span className="font-extrabold text-sm text-slate-900 dark:text-white truncate block mt-0.5">{supplierHighlights.topReplenishment?.supplierName}</span>
                <span className="text-xs font-black text-purple-600 dark:text-purple-300 block">{supplierHighlights.topReplenishment?.replenishmentCount} SKUs to Reorder</span>
              </div>
            </div>
          )}

          {/* Supplier Table with Replenishment Integrations */}
          <div className={`rounded-2xl border overflow-hidden ${
            isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'
          } shadow-2xs`}>
            <div className="p-3 border-b flex items-center justify-between border-slate-100 dark:border-slate-700">
              <h3 className="text-xs font-black uppercase tracking-wider dark:text-white flex items-center gap-2">
                <Truck className="w-4 h-4 text-amber-500" />
                Supplier Intelligence & Replenishment Audit ({supplierSummaries.length})
              </h3>
              <span className="text-[10px] text-slate-400 font-medium">Click supplier to view replenishment products</span>
            </div>

            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left text-xs">
                <thead className={`text-[10px] uppercase font-black tracking-wider border-b ${
                  isDarkMode ? 'bg-slate-900/80 text-slate-300 border-slate-700' : 'bg-slate-50 text-slate-600 border-slate-200'
                }`}>
                  <tr>
                    <th className="p-2.5 cursor-pointer" onClick={() => handleSort('supplierName')}>
                      Supplier <ArrowUpDown className="w-3 h-3 inline text-slate-400" />
                    </th>
                    <th className="p-2.5 text-right cursor-pointer" onClick={() => handleSort('productCount')}>
                      SKUs <ArrowUpDown className="w-3 h-3 inline text-slate-400" />
                    </th>
                    <th className="p-2.5 text-right cursor-pointer" onClick={() => handleSort('salesValue')}>
                      Sales Value <ArrowUpDown className="w-3 h-3 inline text-slate-400" />
                    </th>
                    <th className="p-2.5 text-right cursor-pointer" onClick={() => handleSort('inventoryValue')}>
                      Inventory Cost <ArrowUpDown className="w-3 h-3 inline text-slate-400" />
                    </th>
                    <th className="p-2.5 text-right cursor-pointer" onClick={() => handleSort('replenishmentCount')}>
                      Reorder SKUs <ArrowUpDown className="w-3 h-3 inline text-slate-400" />
                    </th>
                    <th className="p-2.5 text-right cursor-pointer" onClick={() => handleSort('criticalReplenishmentCount')}>
                      Critical <ArrowUpDown className="w-3 h-3 inline text-slate-400" />
                    </th>
                    <th className="p-2.5 text-right cursor-pointer" onClick={() => handleSort('recommendedUnits')}>
                      Reorder Units <ArrowUpDown className="w-3 h-3 inline text-slate-400" />
                    </th>
                    <th className="p-2.5 text-right cursor-pointer" onClick={() => handleSort('estimatedPurchaseValue')}>
                      Est. Purchase <ArrowUpDown className="w-3 h-3 inline text-slate-400" />
                    </th>
                    <th className="p-2.5 text-right cursor-pointer" onClick={() => handleSort('deadStockValue')}>
                      Dead Stock (₹) <ArrowUpDown className="w-3 h-3 inline text-slate-400" />
                    </th>
                    <th className="p-2.5 text-right cursor-pointer" onClick={() => handleSort('outOfStock')}>
                      OOS <ArrowUpDown className="w-3 h-3 inline text-slate-400" />
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60 font-medium">
                  {sortedSuppliers.slice((tablePage - 1) * pageSize, tablePage * pageSize).map((s) => (
                    <tr
                      key={s.supplierName}
                      onClick={() => openDrillDown(`Supplier: ${s.supplierName}`, s.products)}
                      className="hover:bg-amber-50/50 dark:hover:bg-slate-700/50 cursor-pointer transition-colors"
                    >
                      <td className="p-2.5 font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <Truck className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                        <span>{s.supplierName}</span>
                      </td>
                      <td className="p-2.5 text-right font-bold text-slate-800 dark:text-slate-200">{s.productCount}</td>
                      <td className="p-2.5 text-right font-black text-emerald-600 dark:text-emerald-400">₹{s.salesValue.toLocaleString('en-IN')}</td>
                      <td className="p-2.5 text-right font-black text-slate-900 dark:text-white">₹{s.inventoryValue.toLocaleString('en-IN')}</td>
                      <td className="p-2.5 text-right font-extrabold text-indigo-600 dark:text-indigo-400">{s.replenishmentCount}</td>
                      <td className="p-2.5 text-right font-extrabold text-rose-600">{s.criticalReplenishmentCount}</td>
                      <td className="p-2.5 text-right font-bold text-slate-800 dark:text-slate-200">{s.recommendedUnits.toLocaleString('en-IN')}</td>
                      <td className="p-2.5 text-right font-black text-purple-600 dark:text-purple-400">₹{s.estimatedPurchaseValue.toLocaleString('en-IN')}</td>
                      <td className="p-2.5 text-right font-bold text-rose-600">₹{s.deadStockValue.toLocaleString('en-IN')}</td>
                      <td className="p-2.5 text-right font-bold text-rose-700">{s.outOfStock}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {supplierSummaries.length > pageSize && (
              <div className="p-2.5 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between text-xs font-bold text-slate-500">
                <span>Showing {((tablePage - 1) * pageSize) + 1} - {Math.min(tablePage * pageSize, supplierSummaries.length)} of {supplierSummaries.length} Suppliers</span>
                <div className="flex items-center gap-1">
                  <button
                    disabled={tablePage === 1}
                    onClick={() => setTablePage(p => p - 1)}
                    className="p-1 rounded-lg border disabled:opacity-30 cursor-pointer"
                  ><ChevronLeft className="w-4 h-4" /></button>
                  <span>Page {tablePage} of {Math.ceil(supplierSummaries.length / pageSize)}</span>
                  <button
                    disabled={tablePage >= Math.ceil(supplierSummaries.length / pageSize)}
                    onClick={() => setTablePage(p => p + 1)}
                    className="p-1 rounded-lg border disabled:opacity-30 cursor-pointer"
                  ><ChevronRight className="w-4 h-4" /></button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 4. PERFORMANCE COMPARISON TAB */}
      {/* ======================================================== */}
      {activeTab === 'comparison' && (
        <div className="space-y-4">
          <div className={`p-4 rounded-2xl border ${
            isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'
          } shadow-2xs space-y-4`}>
            {/* Comparison Controls */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-700">
              <div>
                <h3 className="text-sm font-extrabold dark:text-white flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-indigo-500" />
                  Comparative Performance Ranking
                </h3>
                <p className="text-xs text-slate-400">Benchmarking entities across commercial metrics</p>
              </div>

              <div className="flex items-center gap-2">
                {/* Group By Selector */}
                <select
                  value={compGroup}
                  onChange={(e) => setCompGroup(e.target.value as any)}
                  className="px-2.5 py-1.5 rounded-xl border text-xs font-extrabold bg-slate-50 dark:bg-slate-900 dark:border-slate-700"
                >
                  <option value="category">Group By Category</option>
                  <option value="brand">Group By Brand</option>
                  <option value="supplier">Group By Supplier</option>
                </select>

                {/* Metric Selector */}
                <select
                  value={compMetric}
                  onChange={(e) => setCompMetric(e.target.value as any)}
                  className="px-2.5 py-1.5 rounded-xl border text-xs font-extrabold bg-indigo-50 border-indigo-200 text-indigo-900 dark:bg-indigo-950 dark:text-indigo-300 dark:border-indigo-800"
                >
                  <option value="salesValue">Sales Value (₹)</option>
                  <option value="salesQuantity">Sales Quantity (Units)</option>
                  <option value="inventoryValue">Inventory Cost (₹)</option>
                  <option value="closingStock">Stock Units</option>
                  <option value="zeroSalesValue">Zero Sales Value (₹)</option>
                  <option value="deadStockValue">Dead Stock Value (₹)</option>
                  <option value="outOfStock">Out of Stock Count</option>
                </select>
              </div>
            </div>

            {/* Comparison Ranking Visual Bars */}
            {(() => {
              const dataset = compGroup === 'category' ? categorySummaries : compGroup === 'brand' ? brandSummaries : supplierSummaries;
              const nameKey = compGroup === 'category' ? 'category' : compGroup === 'brand' ? 'brand' : 'supplierName';

              const sorted = [...dataset].sort((a: any, b: any) => (b[compMetric] || 0) - (a[compMetric] || 0));
              const top15 = sorted.slice(0, 15);
              const maxVal = Math.max(1, ...(top15.map((i: any) => i[compMetric] || 0)));

              return (
                <div className="space-y-2.5">
                  {top15.map((item: any, idx) => {
                    const name = item[nameKey];
                    const rawVal = item[compMetric] || 0;
                    const pct = (rawVal / maxVal) * 100;

                    const formattedVal = typeof rawVal === 'number' && compMetric.toLowerCase().includes('value')
                      ? `₹${rawVal.toLocaleString('en-IN')}`
                      : rawVal.toLocaleString('en-IN');

                    return (
                      <div
                        key={name}
                        onClick={() => openDrillDown(`${compGroup.toUpperCase()}: ${name}`, item.products)}
                        className="p-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer transition-all space-y-1"
                      >
                        <div className="flex items-center justify-between text-xs font-extrabold">
                          <span className="flex items-center gap-2 dark:text-white">
                            <span className="w-5 text-center text-slate-400 font-mono text-[10px]">#{idx + 1}</span>
                            <span>{name}</span>
                            <span className="text-[10px] text-slate-400 font-normal">({item.productCount} SKUs)</span>
                          </span>
                          <span className="text-indigo-600 dark:text-indigo-400 font-black">{formattedVal}</span>
                        </div>
                        <div className="w-full bg-slate-100 dark:bg-slate-900 rounded-full h-2.5 overflow-hidden">
                          <div
                            className="bg-indigo-600 h-2.5 rounded-full transition-all duration-300"
                            style={{ width: `${Math.max(2, pct)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 5. SALES VS INVENTORY MATRIX (2x2 QUADRANT) TAB */}
      {/* ======================================================== */}
      {activeTab === 'matrix' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-extrabold dark:text-white flex items-center gap-2">
                <Grid2X2 className="w-4 h-4 text-emerald-500" />
                Sales vs Inventory Matrix (4-Quadrant Portfolio Analysis)
              </h3>
              <p className="text-xs text-slate-400">Classifying products by sales velocity and capital footprint</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[matrixData.q1, matrixData.q2, matrixData.q3, matrixData.q4].map((quad, idx) => (
              <div
                key={quad.name}
                onClick={() => openDrillDown(quad.name, quad.products)}
                className={`p-4 rounded-2xl border ${quad.badgeColor} shadow-2xs hover:shadow-md cursor-pointer transition-all space-y-3`}
              >
                <div className="flex items-center justify-between pb-2 border-b border-current/20">
                  <span className="font-extrabold text-sm uppercase tracking-wider">
                    Quadrant {idx + 1}: {quad.name}
                  </span>
                  <span className="text-xs font-black px-2.5 py-0.5 rounded-full bg-white/40 dark:bg-black/30">
                    {quad.count} SKUs
                  </span>
                </div>

                <p className="text-xs opacity-90 leading-relaxed font-medium">
                  {quad.description}
                </p>

                <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                  <div className="p-2 rounded-xl bg-white/50 dark:bg-black/20 border border-current/10">
                    <span className="text-[10px] uppercase font-bold opacity-75 block">Total Inventory Value</span>
                    <span className="font-black text-sm block mt-0.5">₹{quad.totalInventoryValue.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="p-2 rounded-xl bg-white/50 dark:bg-black/20 border border-current/10">
                    <span className="text-[10px] uppercase font-bold opacity-75 block">Total Sales Value</span>
                    <span className="font-black text-sm block mt-0.5">₹{quad.totalSalesValue.toLocaleString('en-IN')}</span>
                  </div>
                </div>

                <div className="flex items-center justify-end text-[10px] font-bold gap-1 pt-1 opacity-80">
                  <span>Drill down quadrant products</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 6. MONEY TIED UP ANALYSIS TAB */}
      {/* ======================================================== */}
      {activeTab === 'money_tied_up' && (
        <div className="space-y-4">
          <div className={`p-4 rounded-2xl border ${
            isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'
          } shadow-2xs space-y-4`}>
            <div>
              <h3 className="text-sm font-extrabold dark:text-white flex items-center gap-2">
                <Coins className="w-4 h-4 text-rose-500" />
                Capital Blocked & Inventory Money Tied Up Audit
              </h3>
              <p className="text-xs text-slate-400">Pinpointing exact categories, brands, and suppliers holding idle working capital</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div className="p-3.5 rounded-2xl bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800 text-indigo-900 dark:text-indigo-200">
                <span className="text-[10px] uppercase font-bold block">Total Stock Inventory Value</span>
                <span className="text-lg font-black block mt-0.5">
                  ₹{filteredProducts.reduce((sum, p) => sum + (analyticsMap.get(p.id)?.inventoryValueCost || 0), 0).toLocaleString('en-IN')}
                </span>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200">
                <span className="text-[10px] uppercase font-bold block">Zero Sales Locked Value</span>
                <span className="text-lg font-black block mt-0.5">
                  ₹{categorySummaries.reduce((sum, c) => sum + c.zeroSalesValue, 0).toLocaleString('en-IN')}
                </span>
              </div>

              <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-200">
                <span className="text-[10px] uppercase font-bold block">Dead Stock Value</span>
                <span className="text-lg font-black block mt-0.5">
                  ₹{categorySummaries.reduce((sum, c) => sum + c.deadStockValue, 0).toLocaleString('en-IN')}
                </span>
              </div>

              <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200">
                <span className="text-[10px] uppercase font-bold block">Overstock Value (&gt;60 Days)</span>
                <span className="text-lg font-black block mt-0.5">
                  ₹{categorySummaries.reduce((sum, c) => sum + c.overstockValue, 0).toLocaleString('en-IN')}
                </span>
              </div>
            </div>

            {/* Top 5 Categories with Money Tied Up */}
            <div className="pt-2 space-y-2">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-600 dark:text-slate-300">
                Top Categories with Most Blocked Capital (Dead + Unsold)
              </h4>
              <div className="space-y-1.5">
                {[...categorySummaries]
                  .sort((a, b) => (b.deadStockValue + b.zeroSalesValue) - (a.deadStockValue + a.zeroSalesValue))
                  .slice(0, 8)
                  .map((cat) => {
                    const blocked = cat.deadStockValue + cat.zeroSalesValue;
                    return (
                      <div
                        key={cat.category}
                        onClick={() => openDrillDown(`Blocked Capital Category: ${cat.category}`, cat.products)}
                        className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800 flex items-center justify-between hover:bg-slate-100 cursor-pointer transition-all text-xs"
                      >
                        <div>
                          <span className="font-extrabold text-slate-900 dark:text-white block">{cat.category}</span>
                          <span className="text-[10px] text-slate-400">Total Inventory: ₹{cat.inventoryValue.toLocaleString('en-IN')}</span>
                        </div>
                        <div className="text-right">
                          <span className="font-black text-rose-600 dark:text-rose-400 block">₹{blocked.toLocaleString('en-IN')}</span>
                          <span className="text-[10px] font-bold text-slate-400">
                            {cat.inventoryValue > 0 ? ((blocked / cat.inventoryValue) * 100).toFixed(1) : 0}% of Category Value
                          </span>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* DRILL DOWN PRODUCTS LIST MODAL */}
      {/* ======================================================== */}
      {drillDownProducts && drillDownTitle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-900/60 backdrop-blur-xs">
          <div className={`w-full max-w-5xl max-h-[90vh] flex flex-col rounded-2xl border ${
            isDarkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-800'
          } shadow-2xl overflow-hidden`}>
            {/* Modal Header */}
            <div className="p-4 border-b flex items-center justify-between border-slate-100 dark:border-slate-800">
              <div>
                <span className="text-[10px] uppercase font-black text-indigo-500 tracking-wider">Product Drill-Down</span>
                <h3 className="font-black text-base truncate">{drillDownTitle}</h3>
                <span className="text-xs font-semibold text-slate-400">
                  {drillDownProducts.length.toLocaleString('en-IN')} matching products in dataset
                </span>
              </div>
              <button
                onClick={() => {
                  setDrillDownProducts(null);
                  setDrillDownTitle(null);
                }}
                className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Search Bar & Copy Action */}
            <div className="p-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
              <div className="relative flex-1 flex items-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5">
                <Search className="w-4 h-4 text-slate-400 mr-2 shrink-0" />
                <input
                  type="text"
                  placeholder="Filter drill-down products by name, barcode..."
                  value={drillDownSearch}
                  onChange={(e) => {
                    setDrillDownSearch(e.target.value);
                    setDrillDownPage(1);
                  }}
                  className="bg-transparent text-xs text-slate-800 dark:text-slate-200 focus:outline-none w-full font-medium"
                />
              </div>

              {(() => {
                const searchFilteredCount = drillDownProducts.filter((p) => {
                  if (!drillDownSearch.trim()) return true;
                  const q = drillDownSearch.toLowerCase().trim();
                  return p.name.toLowerCase().includes(q) || (p.barcode && p.barcode.toLowerCase().includes(q));
                }).length;

                return (
                  <button
                    type="button"
                    onClick={() => {
                      const searchFiltered = drillDownProducts.filter((p) => {
                        if (!drillDownSearch.trim()) return true;
                        const q = drillDownSearch.toLowerCase().trim();
                        return p.name.toLowerCase().includes(q) || (p.barcode && p.barcode.toLowerCase().includes(q));
                      });
                      handleCopyDrillDown(searchFiltered);
                    }}
                    disabled={searchFilteredCount === 0}
                    className="flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs px-3.5 py-2 rounded-xl shadow-2xs transition-all active:scale-95 cursor-pointer shrink-0"
                    title={`Copy ${searchFilteredCount} filtered products`}
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>{drillDownCopyFeedback || `COPY FILTERED PRODUCTS (${searchFilteredCount})`}</span>
                  </button>
                );
              })()}
            </div>

            {/* Modal Table Content */}
            <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
              {(() => {
                const searchFiltered = drillDownProducts.filter((p) => {
                  if (!drillDownSearch.trim()) return true;
                  const q = drillDownSearch.toLowerCase().trim();
                  return p.name.toLowerCase().includes(q) || (p.barcode && p.barcode.toLowerCase().includes(q));
                });

                const modalTotalPages = Math.ceil(searchFiltered.length / 20) || 1;
                const modalPaginated = searchFiltered.slice((drillDownPage - 1) * 20, drillDownPage * 20);

                return (
                  <div className="space-y-2">
                    {/* Desktop Version */}
                    <div className="hidden md:block overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                      <table className="w-full text-left text-xs">
                        <thead className={`text-[10px] uppercase font-black tracking-wider border-b ${
                          isDarkMode ? 'bg-slate-800 text-slate-300 border-slate-700' : 'bg-slate-100 text-slate-600 border-slate-200'
                        }`}>
                          <tr>
                            <th className="p-2">Product Name</th>
                            <th className="p-2">Barcode</th>
                            <th className="p-2">Brand</th>
                            <th className="p-2 text-right">Stock</th>
                            <th className="p-2 text-right">Sales</th>
                            <th className="p-2 text-right">Cost Price</th>
                            <th className="p-2 text-right">Retail Price</th>
                            <th className="p-2 text-right">Inventory Cost</th>
                            <th className="p-2 text-center">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                          {modalPaginated.map((p) => {
                            const calc = analyticsMap.get(p.id);
                            return (
                              <tr key={p.id} className="hover:bg-indigo-50/50 dark:hover:bg-slate-800/60">
                                <td className="p-2 font-bold text-slate-900 dark:text-white max-w-[200px] truncate">{p.name}</td>
                                <td className="p-2 font-mono text-[11px] text-slate-500">{p.barcode || '—'}</td>
                                <td className="p-2 text-slate-600 dark:text-slate-300">{getProductBrand(p)}</td>
                                <td className="p-2 text-right font-bold">{p.stock || 0}</td>
                                <td className="p-2 text-right font-bold text-indigo-600 dark:text-indigo-400">{p.salesCount || 0}</td>
                                <td className="p-2 text-right">₹{(p.costPrice || 0).toLocaleString('en-IN')}</td>
                                <td className="p-2 text-right">₹{(p.retailPrice || p.mrp || 0).toLocaleString('en-IN')}</td>
                                <td className="p-2 text-right font-black text-emerald-600">₹{(calc?.inventoryValueCost || 0).toLocaleString('en-IN')}</td>
                                <td className="p-2 text-center">
                                  <button
                                    onClick={() => {
                                      onSelectProduct(p);
                                    }}
                                    className="px-2 py-1 rounded-lg bg-indigo-600 text-white font-extrabold text-[10px] hover:bg-indigo-700 cursor-pointer flex items-center justify-center gap-1 mx-auto"
                                  >
                                    <Eye className="w-3 h-3" /> Inspect
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Mobile Version - Compact layout fitting beautifully */}
                    <div className="block md:hidden space-y-2">
                      {modalPaginated.map((p) => {
                        const calc = analyticsMap.get(p.id);
                        const pBrand = getProductBrand(p);
                        const avgDailySales = (p.salesCount || 0) / 30;
                        const daysCover = avgDailySales > 0 ? (p.stock / avgDailySales) : (p.stock <= 0 ? 0 : null);
                        
                        return (
                          <div
                            key={p.id}
                            onClick={() => {
                              onSelectProduct(p);
                            }}
                            className={`p-2.5 rounded-xl border cursor-pointer ${
                              isDarkMode ? 'bg-slate-900/50 border-slate-800' : 'bg-slate-50 border-slate-200'
                            } flex flex-col gap-1`}
                          >
                            <div className="flex justify-between items-start gap-1">
                              <h4 className="text-xs font-black text-slate-900 dark:text-white leading-tight">
                                {p.name}
                              </h4>
                              <span className="text-[9px] font-bold uppercase bg-indigo-100 text-indigo-800 dark:bg-indigo-950 px-1 rounded whitespace-nowrap shrink-0">
                                ABC: {calc?.abcCategory || 'C'}
                              </span>
                            </div>
                            <div className="text-[10px] text-slate-500 font-mono">
                              Bar: {p.barcode} {p.localCode && `• Bansal: ${p.localCode}`}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              Cat: {p.category || 'General'} {pBrand && `• Brand: ${pBrand}`}
                            </div>
                            <div className="grid grid-cols-4 gap-1 text-[10px] mt-1 bg-white dark:bg-slate-800 p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 font-mono text-center">
                              <div>
                                <span className="text-[8px] text-slate-400 block leading-none uppercase">Stock</span>
                                <span className="font-bold">{p.stock || 0}</span>
                              </div>
                              <div>
                                <span className="text-[8px] text-slate-400 block leading-none uppercase">Sales</span>
                                <span className="font-bold text-indigo-600">{p.salesCount || 0}</span>
                              </div>
                              <div>
                                <span className="text-[8px] text-slate-400 block leading-none uppercase">Days</span>
                                <span className="font-bold">{daysCover !== null ? `${daysCover.toFixed(1)}d` : '—'}</span>
                              </div>
                              <div>
                                <span className="text-[8px] text-slate-400 block leading-none uppercase">Val</span>
                                <span className="font-bold text-emerald-600">₹{(calc?.inventoryValueCost || 0).toLocaleString('en-IN')}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Pagination for Modal */}
                    {searchFiltered.length > 20 && (
                      <div className="p-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs font-bold text-slate-500">
                        <span>Showing {((drillDownPage - 1) * 20) + 1} - {Math.min(drillDownPage * 20, searchFiltered.length)} of {searchFiltered.length}</span>
                        <div className="flex items-center gap-1">
                          <button
                            disabled={drillDownPage === 1}
                            onClick={() => setDrillDownPage(p => p - 1)}
                            className="p-1 rounded-lg border disabled:opacity-30 cursor-pointer"
                          ><ChevronLeft className="w-3.5 h-3.5" /></button>
                          <span>Page {drillDownPage} of {modalTotalPages}</span>
                          <button
                            disabled={drillDownPage >= modalTotalPages}
                            onClick={() => setDrillDownPage(p => p + 1)}
                            className="p-1 rounded-lg border disabled:opacity-30 cursor-pointer"
                          ><ChevronRight className="w-3.5 h-3.5" /></button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
