import React, { useState, useMemo, useEffect } from 'react';
import { Product, ComputedProductAnalytics, StockReportMeta } from '../../types';
import { getProductBrand } from '../../utils/analytics';
import { getUniqueMainCodes, matchesMainCodeFilter, deriveCategoriesFromProducts, matchesCategoryFilter, getValidSelectedCategories } from '../../utils/mainCode';
import { MultiSelectDropdown } from '../MultiSelectDropdown';
import { ActiveFilterChips } from '../ActiveFilterChips';
import { computeLinkedClassificationOptions } from '../../utils/linkedFilters';
import {
  RefreshCw,
  AlertTriangle,
  PackageX,
  Zap,
  Clock,
  TrendingUp,
  Coins,
  Truck,
  Tags,
  Search,
  Filter,
  SlidersHorizontal,
  ChevronRight,
  Eye,
  Star,
  Layers,
  AlertOctagon,
  CheckCircle2,
  HelpCircle,
  RotateCcw,
  Boxes,
  Info,
  Building2,
  ChevronLeft,
  X
} from 'lucide-react';

interface ReplenishmentViewProps {
  products: Product[];
  analyticsMap: Map<string, ComputedProductAnalytics>;
  onSelectProduct: (product: Product) => void;
  isDarkMode: boolean;
  reportMeta?: StockReportMeta | null;
}

export interface ReplenishmentItem {
  product: Product;
  calc?: ComputedProductAnalytics;
  brand: string;
  supplier: string;
  category: string;
  avgDailySales: number;
  daysCover: number;
  safetyStock: number;
  reorderPoint: number;
  targetStock: number;
  recommendedOrder: number;
  estCostValue: number | null;
  hasCost: boolean;
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'NO ACTION';
  status: 'REORDER NOW' | 'REORDER SOON' | 'MONITOR' | 'STOCK OK' | 'NO SALES';
  maxStockWarning: boolean;
  isOutWithSales: boolean;
  isFastLow: boolean;
  isStockoutRisk: boolean;
}

export const ReplenishmentView: React.FC<ReplenishmentViewProps> = ({
  products,
  analyticsMap,
  onSelectProduct,
  isDarkMode,
  reportMeta
}) => {
  // Manager Configurable Planning Parameters
  const [targetDays, setTargetDays] = useState<number>(30);
  const [leadTimeDays, setLeadTimeDays] = useState<number>(7);
  const [safetyStockDays, setSafetyStockDays] = useState<number>(3);
  const [maxStockDays, setMaxStockDays] = useState<number>(60);
  const [showControls, setShowControls] = useState<boolean>(false);

  // Active Sub-tab View
  const [activeTab, setActiveTab] = useState<
    'all' | 'out_of_stock_sales' | 'fast_low' | 'stockout_risk' | 'supplier' | 'category'
  >('all');

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedMainCodes, setSelectedMainCodes] = useState<string[]>([]);
  const [selectedPriority, setSelectedPriority] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedSuppliers, setSelectedSuppliers] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [watchlist, setWatchlist] = useState<Set<string>>(new Set());
  const [showWatchlistOnly, setShowWatchlistOnly] = useState<boolean>(false);

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
    setPage(1);
  };

  // Pagination for high performance rendering
  const [page, setPage] = useState<number>(1);
  const pageSize = 50;

  useEffect(() => {
    setPage(1);
  }, [searchQuery, selectedMainCodes, selectedPriority, selectedStatus, selectedSuppliers, selectedCategories, activeTab, showWatchlistOnly]);

  // Stock count dialog state
  const [stockCountModalItem, setStockCountModalItem] = useState<ReplenishmentItem | null>(null);

  const periodDays = reportMeta?.reportDays || 30;

  // Compute replenishment metrics for all items
  const replenishmentData = useMemo(() => {
    const safeProducts = Array.isArray(products) ? products : [];
    const safeAnalyticsMap = analyticsMap instanceof Map ? analyticsMap : new Map<string, ComputedProductAnalytics>();

    return safeProducts.map((p): ReplenishmentItem => {
      const calc = safeAnalyticsMap.get(p.id);
      const brand = getProductBrand(p);
      const supplier = p.supplierName || 'Unassigned Supplier';
      const category = p.category || 'General';

      const salesCount = p.salesCount || 0;
      const stock = p.stock || 0;
      const costPrice = p.costPrice || 0;

      const avgDailySales = salesCount / periodDays;
      const daysCover = avgDailySales > 0 ? stock / avgDailySales : stock > 0 ? 9999 : 0;

      const safetyStock = Math.ceil(avgDailySales * safetyStockDays);
      const reorderPoint = Math.ceil(avgDailySales * leadTimeDays + safetyStock);
      const targetStock = Math.ceil(avgDailySales * targetDays);

      const isZeroSalesOrDead = salesCount === 0 || calc?.movementStatus === 'dead' || calc?.movementStatus === 'zero_sales';
      const isOverstock = calc?.stockStatus === 'overstock';

      let recommendedOrder = 0;
      if (!isZeroSalesOrDead && !isOverstock) {
        recommendedOrder = Math.max(0, targetStock - stock);

        // Check for MOQ in raw row data if available
        let moq = 0;
        if (p.rawRowData) {
          for (const key of Object.keys(p.rawRowData)) {
            const normKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
            if (normKey === 'moq' || normKey === 'minorder' || normKey === 'minimumorder') {
              const val = parseInt(String(p.rawRowData[key]), 10);
              if (!isNaN(val) && val > 0) moq = val;
            }
          }
        }
        if (recommendedOrder > 0 && moq > 0) {
          recommendedOrder = Math.max(recommendedOrder, moq);
        }
      }

      const hasCost = costPrice > 0;
      const estCostValue = hasCost ? recommendedOrder * costPrice : null;

      const maxStockWarning = !isZeroSalesOrDead && recommendedOrder > 0 && stock + recommendedOrder > avgDailySales * maxStockDays;

      // Priority logic
      let priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'NO ACTION' = 'NO ACTION';
      if (stock <= 0 && salesCount > 0) {
        priority = 'CRITICAL';
      } else if (!isZeroSalesOrDead) {
        if ((calc?.movementStatus === 'fast' && calc?.stockStatus === 'low_stock') || daysCover < leadTimeDays) {
          priority = 'HIGH';
        } else if (calc?.stockStatus === 'low_stock') {
          priority = 'MEDIUM';
        } else if (stock <= reorderPoint) {
          priority = 'LOW';
        }
      }

      // Replenishment status
      let status: 'REORDER NOW' | 'REORDER SOON' | 'MONITOR' | 'STOCK OK' | 'NO SALES' = 'STOCK OK';
      if (isZeroSalesOrDead) {
        status = 'NO SALES';
      } else if (stock <= reorderPoint || stock <= 0) {
        status = 'REORDER NOW';
      } else if (stock <= reorderPoint * 1.3) {
        status = 'REORDER SOON';
      } else if (daysCover <= targetDays) {
        status = 'MONITOR';
      }

      const isOutWithSales = stock <= 0 && salesCount > 0;
      const isFastLow = calc?.movementStatus === 'fast' && calc?.stockStatus === 'low_stock';
      const isStockoutRisk = salesCount > 0 && daysCover < leadTimeDays;

      return {
        product: p,
        calc,
        brand,
        supplier,
        category,
        avgDailySales,
        daysCover,
        safetyStock,
        reorderPoint,
        targetStock,
        recommendedOrder,
        estCostValue,
        hasCost,
        priority,
        status,
        maxStockWarning,
        isOutWithSales,
        isFastLow,
        isStockoutRisk
      };
    });
  }, [products, analyticsMap, periodDays, targetDays, leadTimeDays, safetyStockDays, maxStockDays]);

  // Base predicate for operational filters (priority, status, watchlist, searchQuery, activeTab)
  const basePredicate = useMemo(() => {
    return (item: ReplenishmentItem) => {
      if (activeTab === 'out_of_stock_sales' && !item.isOutWithSales) return false;
      if (activeTab === 'fast_low' && !item.isFastLow) return false;
      if (activeTab === 'stockout_risk' && !item.isStockoutRisk) return false;
      if (showWatchlistOnly && !watchlist.has(item.product.id)) return false;
      if (selectedPriority !== 'all' && item.priority !== selectedPriority) return false;
      if (selectedStatus !== 'all' && item.status !== selectedStatus) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const nameMatch = item.product.name.toLowerCase().includes(q);
        const codeMatch = item.product.barcode.toLowerCase().includes(q) || (item.product.localCode || '').toLowerCase().includes(q);
        const brandMatch = item.brand.toLowerCase().includes(q);
        const suppMatch = item.supplier.toLowerCase().includes(q);
        const catMatch = item.category.toLowerCase().includes(q);
        if (!nameMatch && !codeMatch && !brandMatch && !suppMatch && !catMatch) return false;
      }

      return true;
    };
  }, [activeTab, showWatchlistOnly, watchlist, selectedPriority, selectedStatus, searchQuery]);

  // Bidirectional linked options computation
  const linkedResult = useMemo(() => {
    return computeLinkedClassificationOptions<ReplenishmentItem>(
      replenishmentData,
      {
        getMainCode: (item) => item.product.mainCode,
        getCategory: (item) => item.category,
        getBrand: (item) => item.brand,
        getSupplier: (item) => item.supplier
      },
      {
        mainCodes: selectedMainCodes,
        categories: selectedCategories,
        suppliers: selectedSuppliers
      },
      basePredicate
    );
  }, [replenishmentData, selectedMainCodes, selectedCategories, selectedSuppliers, basePredicate]);

  const mainCodesList = linkedResult.mainCodeOptions;
  const categoriesList = linkedResult.categoryOptions;
  const suppliersList = linkedResult.supplierOptions;

  // Filtered List sorted by priority
  const filteredItems = useMemo(() => {
    return [...linkedResult.filteredItems].sort((a, b) => {
      // Sort priority: CRITICAL -> HIGH -> MEDIUM -> LOW -> NO ACTION
      const pOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, 'NO ACTION': 4 };
      if (pOrder[a.priority] !== pOrder[b.priority]) {
        return pOrder[a.priority] - pOrder[b.priority];
      }
      return a.daysCover - b.daysCover;
    });
  }, [linkedResult.filteredItems]);

  // Overall Replenishment Dashboard Summary
  const summary = useMemo(() => {
    let totalNeedingReplenishment = 0;
    let criticalCount = 0;
    let highCount = 0;
    let lowStockCount = 0;
    let outOfStockSalesCount = 0;
    let fastLowCount = 0;
    let stockoutRiskCount = 0;

    let totalRecUnits = 0;
    let totalRecValue = 0;
    let missingCostCount = 0;

    let totalDaysCoverSum = 0;
    let validDaysCoverCount = 0;

    replenishmentData.forEach((item) => {
      if (selectedMainCodes.length > 0 && !matchesMainCodeFilter(item.product.mainCode, selectedMainCodes)) return;

      if (item.priority !== 'NO ACTION' && item.recommendedOrder > 0) {
        totalNeedingReplenishment++;
        totalRecUnits += item.recommendedOrder;

        if (item.hasCost && item.estCostValue !== null) {
          totalRecValue += item.estCostValue;
        } else {
          missingCostCount++;
        }

        if (item.daysCover < 9000) {
          totalDaysCoverSum += item.daysCover;
          validDaysCoverCount++;
        }
      }

      if (item.priority === 'CRITICAL') criticalCount++;
      if (item.priority === 'HIGH') highCount++;
      if (item.calc?.stockStatus === 'low_stock' && item.product.salesCount > 0) lowStockCount++;
      if (item.isOutWithSales) outOfStockSalesCount++;
      if (item.isFastLow) fastLowCount++;
      if (item.isStockoutRisk) stockoutRiskCount++;
    });

    const avgDaysCover = validDaysCoverCount > 0 ? (totalDaysCoverSum / validDaysCoverCount).toFixed(1) : '0';

    return {
      totalNeedingReplenishment,
      criticalCount,
      highCount,
      lowStockCount,
      outOfStockSalesCount,
      fastLowCount,
      stockoutRiskCount,
      totalRecUnits,
      totalRecValue,
      missingCostCount,
      avgDaysCover
    };
  }, [replenishmentData, selectedMainCodes]);

  // Paginated Items for Fast DOM Rendering
  const totalPages = Math.ceil(filteredItems.length / pageSize) || 1;
  const currentPage = Math.min(page, totalPages);
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredItems.slice(start, start + pageSize);
  }, [filteredItems, currentPage, pageSize]);

  // Supplier Grouped Analysis
  const supplierGroups = useMemo(() => {
    const map = new Map<
      string,
      {
        supplier: string;
        items: ReplenishmentItem[];
        totalUnits: number;
        totalCost: number;
        criticalCount: number;
        highCount: number;
        missingCost: boolean;
      }
    >();

    replenishmentData.forEach((item) => {
      if (item.priority === 'NO ACTION' || item.recommendedOrder <= 0) return;

      const s = item.supplier;
      if (!map.has(s)) {
        map.set(s, {
          supplier: s,
          items: [],
          totalUnits: 0,
          totalCost: 0,
          criticalCount: 0,
          highCount: 0,
          missingCost: false
        });
      }

      const g = map.get(s)!;
      g.items.push(item);
      g.totalUnits += item.recommendedOrder;

      if (item.hasCost && item.estCostValue !== null) {
        g.totalCost += item.estCostValue;
      } else {
        g.missingCost = true;
      }

      if (item.priority === 'CRITICAL') g.criticalCount++;
      if (item.priority === 'HIGH') g.highCount++;
    });

    return Array.from(map.values()).sort((a, b) => b.totalCost - a.totalCost);
  }, [replenishmentData]);

  // Category Grouped Analysis
  const categoryGroups = useMemo(() => {
    const map = new Map<
      string,
      {
        category: string;
        items: ReplenishmentItem[];
        totalUnits: number;
        totalCost: number;
        criticalCount: number;
      }
    >();

    replenishmentData.forEach((item) => {
      if (item.priority === 'NO ACTION' || item.recommendedOrder <= 0) return;

      const c = item.category;
      if (!map.has(c)) {
        map.set(c, {
          category: c,
          items: [],
          totalUnits: 0,
          totalCost: 0,
          criticalCount: 0
        });
      }

      const g = map.get(c)!;
      g.items.push(item);
      g.totalUnits += item.recommendedOrder;
      if (item.hasCost && item.estCostValue !== null) {
        g.totalCost += item.estCostValue;
      }
      if (item.priority === 'CRITICAL') g.criticalCount++;
    });

    return Array.from(map.values()).sort((a, b) => b.totalUnits - a.totalUnits);
  }, [replenishmentData]);

  const toggleWatchlist = (id: string) => {
    setWatchlist((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleResetControls = () => {
    setTargetDays(30);
    setLeadTimeDays(7);
    setSafetyStockDays(3);
    setMaxStockDays(60);
  };

  return (
    <div className="space-y-5">
      {/* SECTION HEADER & MANAGER CONTROLS TOGGLE */}
      <div className={`p-4 sm:p-5 rounded-3xl border ${isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'} shadow-sm`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-indigo-600/10 text-indigo-600 rounded-2xl dark:bg-indigo-500/20 dark:text-indigo-400">
              <RefreshCw className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-black tracking-tight flex items-center gap-2">
                Replenishment & Stock Planning
                <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                  Module 8
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Centralized reorder engine calculating target stock, reorder points, and recommended order quantities
              </p>
            </div>
          </div>

          <button
            onClick={() => setShowControls(!showControls)}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
              showControls
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                : isDarkMode
                ? 'bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600'
                : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span>Manager Planning Controls</span>
          </button>
        </div>

        {/* EXPANDABLE MANAGER CONTROLS PANEL */}
        {showControls && (
          <div className={`mt-4 pt-4 border-t grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 ${isDarkMode ? 'border-slate-700 bg-slate-900/50 p-4 rounded-2xl' : 'border-slate-100 bg-slate-50 p-4 rounded-2xl'}`}>
            {/* Control 1: Target Days */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center text-xs">
                <span className="font-bold text-slate-700 dark:text-slate-300">Target Days of Stock</span>
                <span className="font-mono font-black text-indigo-600 dark:text-indigo-400">{targetDays} Days</span>
              </div>
              <input
                type="range"
                min="7"
                max="90"
                step="1"
                value={targetDays}
                onChange={(e) => setTargetDays(parseInt(e.target.value, 10))}
                className="w-full accent-indigo-600 cursor-pointer"
              />
              <span className="text-[10px] text-slate-400 block">Target buffer runway for reorder calculation</span>
            </div>

            {/* Control 2: Supplier Lead Time */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center text-xs">
                <span className="font-bold text-slate-700 dark:text-slate-300">Supplier Lead Time</span>
                <span className="font-mono font-black text-teal-600 dark:text-teal-400">{leadTimeDays} Days</span>
              </div>
              <input
                type="range"
                min="1"
                max="30"
                step="1"
                value={leadTimeDays}
                onChange={(e) => setLeadTimeDays(parseInt(e.target.value, 10))}
                className="w-full accent-teal-600 cursor-pointer"
              />
              <span className="text-[10px] text-slate-400 block font-semibold text-amber-600 dark:text-amber-400">
                * Default planning assumption
              </span>
            </div>

            {/* Control 3: Safety Stock Days */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center text-xs">
                <span className="font-bold text-slate-700 dark:text-slate-300">Safety Stock Days</span>
                <span className="font-mono font-black text-purple-600 dark:text-purple-400">{safetyStockDays} Days</span>
              </div>
              <input
                type="range"
                min="0"
                max="14"
                step="1"
                value={safetyStockDays}
                onChange={(e) => setSafetyStockDays(parseInt(e.target.value, 10))}
                className="w-full accent-purple-600 cursor-pointer"
              />
              <span className="text-[10px] text-slate-400 block">Buffer stock for demand spikes</span>
            </div>

            {/* Control 4: Max Stock Days */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center text-xs">
                <span className="font-bold text-slate-700 dark:text-slate-300">Maximum Stock Days Limit</span>
                <span className="font-mono font-black text-rose-600 dark:text-rose-400">{maxStockDays} Days</span>
              </div>
              <input
                type="range"
                min="15"
                max="120"
                step="5"
                value={maxStockDays}
                onChange={(e) => setMaxStockDays(parseInt(e.target.value, 10))}
                className="w-full accent-rose-600 cursor-pointer"
              />
              <div className="flex justify-between items-center pt-1">
                <span className="text-[10px] text-slate-400">Flags excess orders</span>
                <button
                  onClick={handleResetControls}
                  className="text-[10px] font-bold text-indigo-600 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" /> Reset Defaults
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* DASHBOARD SUMMARY KPI CARDS */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        {/* Card 1: Needs Replenishment */}
        <button
          onClick={() => {
            setActiveTab('all');
            setSelectedPriority('all');
          }}
          className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
            isDarkMode ? 'bg-slate-800 border-slate-700 text-white hover:border-indigo-500' : 'bg-white border-slate-200 text-slate-800 hover:border-indigo-300'
          }`}
        >
          <div className="flex items-center gap-1.5 mb-1 text-slate-500 dark:text-slate-400">
            <RefreshCw className="w-3.5 h-3.5 text-indigo-600" />
            <span className="text-[9px] font-black uppercase tracking-wider">Needing Order</span>
          </div>
          <div className="text-xl font-black text-indigo-600 dark:text-indigo-400">
            {summary.totalNeedingReplenishment.toLocaleString('en-IN')}
          </div>
          <span className="text-[9px] text-slate-400">SKUs requiring action</span>
        </button>

        {/* Card 2: Critical */}
        <button
          onClick={() => {
            setActiveTab('all');
            setSelectedPriority('CRITICAL');
          }}
          className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
            isDarkMode ? 'bg-slate-800 border-slate-700 text-white hover:border-rose-500' : 'bg-white border-slate-200 text-slate-800 hover:border-rose-300'
          }`}
        >
          <div className="flex items-center gap-1.5 mb-1 text-slate-500 dark:text-slate-400">
            <AlertOctagon className="w-3.5 h-3.5 text-rose-600" />
            <span className="text-[9px] font-black uppercase tracking-wider">Critical Priority</span>
          </div>
          <div className="text-xl font-black text-rose-600 dark:text-rose-400">
            {summary.criticalCount.toLocaleString('en-IN')}
          </div>
          <span className="text-[9px] text-slate-400">Out of Stock + Active Sales</span>
        </button>

        {/* Card 3: Out of Stock + Sales */}
        <button
          onClick={() => setActiveTab('out_of_stock_sales')}
          className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
            activeTab === 'out_of_stock_sales'
              ? 'ring-2 ring-rose-600'
              : ''
          } ${isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'}`}
        >
          <div className="flex items-center gap-1.5 mb-1 text-slate-500 dark:text-slate-400">
            <PackageX className="w-3.5 h-3.5 text-rose-600" />
            <span className="text-[9px] font-black uppercase tracking-wider">OOS with Sales</span>
          </div>
          <div className="text-xl font-black text-rose-600 dark:text-rose-400">
            {summary.outOfStockSalesCount.toLocaleString('en-IN')}
          </div>
          <span className="text-[9px] text-slate-400">Immediate demand loss</span>
        </button>

        {/* Card 4: Fast Moving + Low Stock */}
        <button
          onClick={() => setActiveTab('fast_low')}
          className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
            activeTab === 'fast_low' ? 'ring-2 ring-amber-600' : ''
          } ${isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'}`}
        >
          <div className="flex items-center gap-1.5 mb-1 text-slate-500 dark:text-slate-400">
            <Zap className="w-3.5 h-3.5 text-amber-600" />
            <span className="text-[9px] font-black uppercase tracking-wider">Fast + Low Stock</span>
          </div>
          <div className="text-xl font-black text-amber-600 dark:text-amber-400">
            {summary.fastLowCount.toLocaleString('en-IN')}
          </div>
          <span className="text-[9px] text-slate-400">High velocity risk</span>
        </button>

        {/* Card 5: Stockout Risk */}
        <button
          onClick={() => setActiveTab('stockout_risk')}
          className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
            activeTab === 'stockout_risk' ? 'ring-2 ring-teal-600' : ''
          } ${isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'}`}
        >
          <div className="flex items-center gap-1.5 mb-1 text-slate-500 dark:text-slate-400">
            <Clock className="w-3.5 h-3.5 text-teal-600" />
            <span className="text-[9px] font-black uppercase tracking-wider">Stockout Risk</span>
          </div>
          <div className="text-xl font-black text-teal-600 dark:text-teal-400">
            {summary.stockoutRiskCount.toLocaleString('en-IN')}
          </div>
          <span className="text-[9px] text-slate-400">Days cover &lt; lead time</span>
        </button>

        {/* Card 6: Average Days Cover */}
        <div className={`p-3.5 rounded-2xl border ${isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'}`}>
          <div className="flex items-center gap-1.5 mb-1 text-slate-500 dark:text-slate-400">
            <Clock className="w-3.5 h-3.5 text-purple-600" />
            <span className="text-[9px] font-black uppercase tracking-wider">Avg Days Cover</span>
          </div>
          <div className="text-xl font-black text-purple-600 dark:text-purple-400">
            {summary.avgDaysCover} Days
          </div>
          <span className="text-[9px] text-slate-400">Items needing reorder</span>
        </div>

        {/* Card 7: Total Recommended Units */}
        <div className={`p-3.5 rounded-2xl border ${isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'}`}>
          <div className="flex items-center gap-1.5 mb-1 text-slate-500 dark:text-slate-400">
            <Boxes className="w-3.5 h-3.5 text-indigo-600" />
            <span className="text-[9px] font-black uppercase tracking-wider">Est. Reorder Units</span>
          </div>
          <div className="text-xl font-black text-indigo-600 dark:text-indigo-400">
            {summary.totalRecUnits.toLocaleString('en-IN')} Qty
          </div>
          <span className="text-[9px] text-slate-400">Total units to order</span>
        </div>

        {/* Card 8: Estimated Reorder Value */}
        <div className={`p-3.5 rounded-2xl border ${isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'}`}>
          <div className="flex items-center gap-1.5 mb-1 text-slate-500 dark:text-slate-400">
            <Coins className="w-3.5 h-3.5 text-emerald-600" />
            <span className="text-[9px] font-black uppercase tracking-wider">Est. Purchase Cost</span>
          </div>
          <div className="text-xl font-black text-emerald-600 dark:text-emerald-400">
            ₹{summary.totalRecValue.toLocaleString('en-IN')}
          </div>
          <span className="text-[9px] text-slate-400">
            {summary.missingCostCount > 0 ? `*${summary.missingCostCount} SKUs rate unavail.` : 'Cost capital required'}
          </span>
        </div>
      </div>

      {/* NAVIGATION TABS */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 custom-scrollbar">
        {[
          { id: 'all', label: 'All Recommendations', icon: Layers, count: summary.totalNeedingReplenishment },
          { id: 'out_of_stock_sales', label: 'Out of Stock with Sales', icon: PackageX, count: summary.outOfStockSalesCount },
          { id: 'fast_low', label: 'Fast Moving — Low Stock', icon: Zap, count: summary.fastLowCount },
          { id: 'stockout_risk', label: 'Stockout Risk', icon: AlertTriangle, count: summary.stockoutRiskCount },
          { id: 'supplier', label: 'Supplier Grouping', icon: Truck, count: supplierGroups.length },
          { id: 'category', label: 'Category Grouping', icon: Tags, count: categoryGroups.length }
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-2xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer shrink-0 ${
                isActive
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : isDarkMode
                  ? 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
              {tab.count > 0 && (
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                    isActive
                      ? 'bg-white/20 text-white'
                      : isDarkMode
                      ? 'bg-slate-700 text-slate-300'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* SEARCH AND FILTERS BAR (Only for table tabs) */}
      {activeTab !== 'supplier' && activeTab !== 'category' && (
        <div className={`p-3.5 rounded-2xl border flex flex-col gap-3 ${
          isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'
        }`}>
          {/* Quick Presets for Food & Grocery */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs scrollbar-none">
            <span className="text-[11px] font-extrabold text-slate-500 dark:text-slate-400 shrink-0 mr-1 flex items-center gap-1">
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

            {(selectedMainCodes.length > 0 || selectedCategories.length > 0 || selectedPriority !== 'all' || selectedStatus !== 'all' || selectedSuppliers.length > 0 || searchQuery.trim() || showWatchlistOnly) && (
              <button
                onClick={() => {
                  setSelectedMainCodes([]);
                  setSelectedCategories([]);
                  setSelectedPriority('all');
                  setSelectedStatus('all');
                  setSelectedSuppliers([]);
                  setSearchQuery('');
                  setShowWatchlistOnly(false);
                  setPage(1);
                }}
                className="px-2.5 py-1 rounded-lg font-bold text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 border border-rose-200 dark:border-rose-800 transition-all cursor-pointer shrink-0"
              >
                Clear Filters
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2.5 items-end">
            {/* Search Box */}
            <div className="sm:col-span-2 lg:col-span-4">
              <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-1">
                Search
              </label>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search product, barcode, supplier..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={`w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                    isDarkMode ? 'bg-slate-900 border-slate-700 text-white placeholder-slate-500' : 'bg-slate-50 border-slate-200 text-slate-900'
                  }`}
                />
              </div>
            </div>

            {/* Multi-Select Main Code Filter */}
            <div className="lg:col-span-2">
              <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-1">
                Main Code
              </label>
              <MultiSelectDropdown
                label="Main Code"
                options={mainCodesList}
                selectedValues={selectedMainCodes}
                onChange={(vals) => {
                  setSelectedMainCodes(vals);
                  setPage(1);
                }}
                placeholder="All Main Codes"
                searchPlaceholder="Search MainCodes..."
                isDarkMode={isDarkMode}
                badgeColor="indigo"
                className="w-full"
              />
            </div>

            {/* Multi-Select Category Filter */}
            <div className="lg:col-span-2">
              <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-1">
                Category
              </label>
              <MultiSelectDropdown
                label="Category"
                options={categoriesList}
                selectedValues={selectedCategories}
                onChange={(vals) => {
                  setSelectedCategories(vals);
                  setPage(1);
                }}
                placeholder="All Categories"
                searchPlaceholder="Search categories..."
                isDarkMode={isDarkMode}
                badgeColor="emerald"
                className="w-full"
              />
            </div>

            {/* Priority Filter */}
            <div className="lg:col-span-2">
              <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-1">
                Priority
              </label>
              <select
                value={selectedPriority}
                onChange={(e) => setSelectedPriority(e.target.value)}
                className={`w-full text-xs rounded-xl px-2.5 py-1.5 border font-semibold focus:outline-none cursor-pointer ${
                  isDarkMode ? 'bg-slate-900 border-slate-700 text-white' : 'bg-slate-50 border-slate-200 text-slate-800'
                }`}
              >
                <option value="all">All Priorities</option>
                <option value="CRITICAL">Critical Only</option>
                <option value="HIGH">High Priority</option>
                <option value="MEDIUM">Medium Priority</option>
                <option value="LOW">Low Priority</option>
                <option value="NO ACTION">No Action</option>
              </select>
            </div>

            {/* Multi-Select Supplier Filter & Watchlist */}
            <div className="lg:col-span-2 flex items-center gap-1.5">
              <div className="flex-1 min-w-0">
                <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-1">
                  Supplier
                </label>
                <MultiSelectDropdown
                  label="Supplier"
                  options={suppliersList}
                  selectedValues={selectedSuppliers}
                  onChange={(vals) => {
                    setSelectedSuppliers(vals);
                    setPage(1);
                  }}
                  placeholder="All Suppliers"
                  searchPlaceholder="Search suppliers..."
                  isDarkMode={isDarkMode}
                  badgeColor="amber"
                  className="w-full"
                />
              </div>

              {/* Watchlist Toggle */}
              <div className="shrink-0">
                <label className="text-[10px] font-extrabold uppercase tracking-wider text-transparent block mb-1 select-none">
                  Watch
                </label>
                <button
                  type="button"
                  onClick={() => setShowWatchlistOnly(!showWatchlistOnly)}
                  className={`flex items-center justify-center p-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    showWatchlistOnly
                      ? 'bg-amber-500 text-white'
                      : isDarkMode
                      ? 'bg-slate-900 border border-slate-700 text-slate-300 hover:bg-slate-800'
                      : 'bg-slate-100 border border-slate-200 text-slate-700 hover:bg-slate-200'
                  }`}
                  title={showWatchlistOnly ? 'Show All Products' : `Show Watchlist Only (${watchlist.size})`}
                >
                  <Star className={`w-3.5 h-3.5 ${showWatchlistOnly ? 'fill-current' : ''}`} />
                </button>
              </div>
            </div>
          </div>

          {/* Reusable Active Filter Chips */}
          <ActiveFilterChips
            groups={[
              {
                label: 'MainCode',
                values: selectedMainCodes,
                onRemove: (v) => {
                  setSelectedMainCodes(selectedMainCodes.filter((c) => c !== v));
                  setPage(1);
                },
                onClear: () => {
                  setSelectedMainCodes([]);
                  setPage(1);
                },
                badgeColor: 'indigo',
                incompatibleValues: mainCodesList.filter((o) => o.incompatible).map((o) => o.value)
              },
              {
                label: 'Category',
                values: selectedCategories,
                onRemove: (v) => {
                  setSelectedCategories(selectedCategories.filter((c) => c !== v));
                  setPage(1);
                },
                onClear: () => {
                  setSelectedCategories([]);
                  setPage(1);
                },
                badgeColor: 'emerald',
                incompatibleValues: categoriesList.filter((o) => o.incompatible).map((o) => o.value)
              },
              {
                label: 'Supplier',
                values: selectedSuppliers,
                onRemove: (v) => {
                  setSelectedSuppliers(selectedSuppliers.filter((c) => c !== v));
                  setPage(1);
                },
                onClear: () => {
                  setSelectedSuppliers([]);
                  setPage(1);
                },
                badgeColor: 'amber',
                incompatibleValues: suppliersList.filter((o) => o.incompatible).map((o) => o.value)
              }
            ]}
            onResetAll={() => {
              setSelectedMainCodes([]);
              setSelectedCategories([]);
              setSelectedSuppliers([]);
              setSelectedPriority('all');
              setSelectedStatus('all');
              setSearchQuery('');
              setShowWatchlistOnly(false);
              setPage(1);
            }}
            totalFilteredCount={filteredItems.length}
            totalItemCount={replenishmentData.length}
            isDarkMode={isDarkMode}
          />
        </div>
      )}

      {/* CONTENT VIEWS */}

      {/* 1. SUPPLIER GROUPING / PURCHASE PLANNING VIEW */}
      {activeTab === 'supplier' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-black text-lg">Purchase Planning by Supplier</h3>
              <p className="text-xs text-slate-500">
                Aggregated reorder requirements grouped by vendor for easy purchase planning
              </p>
            </div>
            <span className="text-xs font-bold text-slate-500">
              {supplierGroups.length} Suppliers with Pending Orders
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {supplierGroups.map((sg) => (
              <div
                key={sg.supplier}
                className={`p-4 rounded-3xl border space-y-3 ${
                  isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-black text-base text-slate-900 dark:text-white flex items-center gap-2">
                      <Truck className="w-4 h-4 text-indigo-600" />
                      {sg.supplier}
                    </h4>
                    <span className="text-xs text-slate-500 font-medium">
                      {sg.items.length} SKUs to Reorder
                    </span>
                  </div>

                  <div className="text-right">
                    <div className="text-base font-black text-emerald-600 dark:text-emerald-400 font-mono">
                      ₹{sg.totalCost.toLocaleString('en-IN')}
                    </div>
                    {sg.missingCost && (
                      <span className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold block">
                        *Some items rate missing
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-2 border-t border-slate-100 dark:border-slate-700 text-xs">
                  <div className="bg-indigo-50 dark:bg-indigo-950 px-2.5 py-1 rounded-xl font-bold text-indigo-700 dark:text-indigo-300">
                    {sg.totalUnits.toLocaleString('en-IN')} Total Order Units
                  </div>
                  {sg.criticalCount > 0 && (
                    <div className="bg-rose-50 dark:bg-rose-950 px-2.5 py-1 rounded-xl font-bold text-rose-700 dark:text-rose-300 flex items-center gap-1">
                      <AlertOctagon className="w-3 h-3" />
                      {sg.criticalCount} Critical
                    </div>
                  )}
                  {sg.highCount > 0 && (
                    <div className="bg-amber-50 dark:bg-amber-950 px-2.5 py-1 rounded-xl font-bold text-amber-700 dark:text-amber-300">
                      {sg.highCount} High
                    </div>
                  )}
                </div>

                {/* Top SKUs Preview */}
                <div className="space-y-1.5 pt-1">
                  {sg.items.slice(0, 4).map((it) => (
                    <div
                      key={it.product.id}
                      onClick={() => onSelectProduct(it.product)}
                      className="flex items-center justify-between text-xs p-2 rounded-xl bg-slate-50 dark:bg-slate-900/60 hover:bg-slate-100 dark:hover:bg-slate-900 cursor-pointer transition-all"
                    >
                      <div className="min-w-0 pr-2">
                        <div className="font-bold truncate text-slate-800 dark:text-slate-200">
                          {it.product.name}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          Stock: {it.product.stock} | Sales: {it.product.salesCount}
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="font-mono font-black text-indigo-600 dark:text-indigo-400">
                          +{it.recommendedOrder} Units
                        </div>
                        <div className="text-[10px] font-mono text-slate-500">
                          {it.hasCost && it.estCostValue !== null
                            ? `₹${it.estCostValue.toLocaleString('en-IN')}`
                            : 'Rate Unavail.'}
                        </div>
                      </div>
                    </div>
                  ))}

                  {sg.items.length > 4 && (
                    <div className="text-[11px] font-bold text-indigo-600 text-center pt-1">
                      + {sg.items.length - 4} more SKUs for this vendor
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 2. CATEGORY GROUPING VIEW */}
      {activeTab === 'category' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-black text-lg">Replenishment Requirements by Category</h3>
              <p className="text-xs text-slate-500">
                Category-level demand throughput and order allocation summary
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {categoryGroups.map((cg) => (
              <div
                key={cg.category}
                className={`p-4 rounded-3xl border space-y-2.5 ${
                  isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <h4 className="font-black text-base text-slate-900 dark:text-white flex items-center gap-2">
                    <Tags className="w-4 h-4 text-purple-600" />
                    {cg.category}
                  </h4>
                  <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950 px-2 py-0.5 rounded-lg">
                    {cg.items.length} SKUs
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-slate-100 dark:border-slate-700">
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-bold block">Recommended Order</span>
                    <span className="font-black text-slate-900 dark:text-white">{cg.totalUnits.toLocaleString('en-IN')} Units</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-bold block">Purchase Cost</span>
                    <span className="font-mono font-black text-emerald-600 dark:text-emerald-400">
                      ₹{cg.totalCost.toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3. MAIN REPLENISHMENT TABLE (Active for Tabs: 'all', 'out_of_stock_sales', 'fast_low', 'stockout_risk') */}
      {activeTab !== 'supplier' && activeTab !== 'category' && (
        <div className={`rounded-3xl border overflow-hidden ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'} shadow-sm`}>
          {/* Desktop Version */}
          <div className="hidden lg:block overflow-x-auto custom-scrollbar">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className={`border-b font-bold uppercase tracking-wider text-[10px] ${
                  isDarkMode ? 'bg-slate-900/60 border-slate-700 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-500'
                }`}>
                  <th className="p-3 w-10 text-center">★</th>
                  <th className="p-3">Priority</th>
                  <th className="p-3">Product Description</th>
                  <th className="p-3">Category / Brand</th>
                  <th className="p-3">Supplier</th>
                  <th className="p-3 text-right">Closing Stock</th>
                  <th className="p-3 text-right">Sales Qty</th>
                  <th className="p-3 text-right">Avg Daily</th>
                  <th className="p-3 text-center">Days Cover</th>
                  <th className="p-3 text-right">Reorder Pt</th>
                  <th className="p-3 text-right">Target Stock</th>
                  <th className="p-3 text-center">Recommended Order</th>
                  <th className="p-3 text-right">Est. Value</th>
                  <th className="p-3 text-center">Status</th>
                  <th className="p-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60 font-medium">
                {filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={15} className="p-12 text-center text-slate-400">
                      <div className="flex flex-col items-center justify-center space-y-2">
                        <p className="font-extrabold text-sm text-slate-600 dark:text-slate-300">
                          No products match these filters.
                        </p>
                        <button
                          onClick={() => {
                            setSelectedMainCodes([]);
                            setSelectedCategories([]);
                            setSelectedSuppliers([]);
                            setSelectedPriority('all');
                            setSelectedStatus('all');
                            setSearchQuery('');
                            setShowWatchlistOnly(false);
                            setPage(1);
                          }}
                          className="px-3 py-1.5 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 cursor-pointer transition-all"
                        >
                          Reset Filters
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedItems.map((item) => {
                    const p = item.product;
                    const isStarred = watchlist.has(p.id);

                    return (
                      <tr
                        key={p.id}
                        className={`hover:bg-indigo-50/40 dark:hover:bg-slate-700/40 transition-colors ${
                          item.priority === 'CRITICAL' ? 'bg-rose-50/20 dark:bg-rose-950/20' : ''
                        }`}
                      >
                        {/* Watchlist Star */}
                        <td className="p-3 text-center">
                          <button
                            onClick={() => toggleWatchlist(p.id)}
                            className="text-slate-300 hover:text-amber-500 transition-all cursor-pointer"
                            title={isStarred ? 'Remove from Watchlist' : 'Add to Watchlist'}
                          >
                            <Star className={`w-4 h-4 ${isStarred ? 'fill-amber-400 text-amber-500' : ''}`} />
                          </button>
                        </td>

                        {/* Priority Badge */}
                        <td className="p-3">
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                              item.priority === 'CRITICAL'
                                ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                                : item.priority === 'HIGH'
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                : item.priority === 'MEDIUM'
                                ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300'
                                : item.priority === 'LOW'
                                ? 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300'
                                : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                            }`}
                          >
                            {item.priority}
                          </span>
                        </td>

                        {/* Product */}
                        <td className="p-3 max-w-[220px]">
                          <button
                            onClick={() => onSelectProduct(p)}
                            className="font-bold text-slate-900 dark:text-white hover:text-indigo-600 text-left truncate block w-full cursor-pointer"
                          >
                            {p.name}
                          </button>
                          <div className="text-[10px] text-slate-400 font-mono">
                            {p.barcode} {p.localCode ? `• ${p.localCode}` : ''}
                          </div>
                        </td>

                        {/* Category / Brand */}
                        <td className="p-3 max-w-[140px]">
                          <div className="truncate font-semibold text-slate-700 dark:text-slate-300">{item.category}</div>
                          <div className="truncate text-[10px] text-slate-400">{item.brand}</div>
                        </td>

                        {/* Supplier */}
                        <td className="p-3 max-w-[130px]">
                          <span className="truncate block font-semibold text-slate-600 dark:text-slate-400">
                            {item.supplier}
                          </span>
                        </td>

                        {/* Closing Stock */}
                        <td className={`p-3 text-right font-bold font-mono ${p.stock <= 0 ? 'text-rose-600' : 'text-slate-800 dark:text-slate-200'}`}>
                          {p.stock.toLocaleString('en-IN')}
                        </td>

                        {/* Sales Qty */}
                        <td className="p-3 text-right font-bold font-mono text-indigo-600 dark:text-indigo-400">
                          {p.salesCount.toLocaleString('en-IN')}
                        </td>

                        {/* Avg Daily Sales */}
                        <td className="p-3 text-right font-mono text-slate-600 dark:text-slate-400">
                          {item.avgDailySales.toFixed(2)}
                        </td>

                        {/* Days Cover */}
                        <td className="p-3 text-center font-mono font-bold">
                          {item.avgDailySales === 0 ? (
                            <span className="text-slate-400 text-[10px]">N/A</span>
                          ) : (
                            <span
                              className={`px-2 py-0.5 rounded-md ${
                                item.daysCover <= leadTimeDays
                                  ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                                  : item.daysCover <= targetDays
                                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                  : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                              }`}
                            >
                              {item.daysCover.toFixed(1)} Days
                            </span>
                          )}
                        </td>

                        {/* Reorder Point */}
                        <td className="p-3 text-right font-mono font-bold text-slate-700 dark:text-slate-300">
                          {item.reorderPoint}
                        </td>

                        {/* Target Stock */}
                        <td className="p-3 text-right font-mono font-bold text-slate-700 dark:text-slate-300">
                          {item.targetStock}
                        </td>

                        {/* Recommended Order */}
                        <td className="p-3 text-center font-mono font-black">
                          {item.recommendedOrder > 0 ? (
                            <div className="flex flex-col items-center">
                              <span className="bg-indigo-600 text-white px-2.5 py-0.5 rounded-lg text-xs font-black shadow-xs">
                                +{item.recommendedOrder} Units
                              </span>
                              {item.maxStockWarning && (
                                <span className="text-[9px] text-amber-600 font-bold mt-0.5" title="Order causes stock to exceed maximum limit">
                                  ⚠️ Review Max Stock
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400 font-normal">0</span>
                          )}
                        </td>

                        {/* Est Value */}
                        <td className="p-3 text-right font-mono font-bold">
                          {item.recommendedOrder > 0 ? (
                            item.hasCost && item.estCostValue !== null ? (
                              <span className="text-emerald-600 dark:text-emerald-400">
                                ₹{item.estCostValue.toLocaleString('en-IN')}
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-400 font-normal" title="Cost rate not in uploaded data">
                                Rate Unavail.
                              </span>
                            )
                          ) : (
                            <span className="text-slate-400 font-normal">₹0</span>
                          )}
                        </td>

                        {/* Replenishment Status */}
                        <td className="p-3 text-center">
                          <span
                            className={`text-[10px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap ${
                              item.status === 'REORDER NOW'
                                ? 'bg-rose-600 text-white font-black'
                                : item.status === 'REORDER SOON'
                                ? 'bg-amber-500 text-white'
                                : item.status === 'MONITOR'
                                ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300'
                                : item.status === 'NO SALES'
                                ? 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                                : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                            }`}
                          >
                            {item.status === 'REORDER NOW' && '🔴 REORDER NOW'}
                            {item.status === 'REORDER SOON' && '🟠 REORDER SOON'}
                            {item.status === 'MONITOR' && '🟡 MONITOR'}
                            {item.status === 'STOCK OK' && '🟢 STOCK OK'}
                            {item.status === 'NO SALES' && '⚪ NO SALES'}
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => onSelectProduct(p)}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-slate-700 transition-all cursor-pointer"
                              title="View Product Details"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setStockCountModalItem(item)}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-teal-600 hover:bg-teal-50 dark:hover:bg-slate-700 transition-all cursor-pointer"
                              title="Count Stock / Quick Calculation Breakdown"
                            >
                              <Info className="w-3.5 h-3.5" />
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

          {/* Mobile Version - Compact cards fitting beautifully on the floor */}
          <div className="block lg:hidden divide-y divide-slate-150 dark:divide-slate-800">
            {filteredItems.length === 0 ? (
              <div className="p-8 text-center text-slate-400 font-semibold bg-white dark:bg-slate-900/50 flex flex-col items-center justify-center space-y-2">
                <p className="font-extrabold text-sm text-slate-600 dark:text-slate-300">
                  No products match these filters.
                </p>
                <button
                  onClick={() => {
                    setSelectedMainCodes([]);
                    setSelectedCategories([]);
                    setSelectedSuppliers([]);
                    setSelectedPriority('all');
                    setSelectedStatus('all');
                    setSearchQuery('');
                    setShowWatchlistOnly(false);
                    setPage(1);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 cursor-pointer transition-all"
                >
                  Reset Filters
                </button>
              </div>
            ) : (
              paginatedItems.map((item) => {
                const p = item.product;
                const isStarred = watchlist.has(p.id);

                return (
                  <div
                    key={p.id}
                    className={`p-3 relative transition-all flex flex-col gap-1.5 ${
                      isDarkMode ? 'bg-slate-900/40' : 'bg-white'
                    } ${
                      item.priority === 'CRITICAL' ? 'border-l-4 border-l-rose-500' : ''
                    }`}
                  >
                    {/* Header Row: Name & Priority Badge */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-1.5 min-w-0">
                        <button
                          onClick={() => toggleWatchlist(p.id)}
                          className="text-slate-300 hover:text-amber-500 transition-all cursor-pointer mt-0.5 shrink-0"
                        >
                          <Star className={`w-3.5 h-3.5 ${isStarred ? 'fill-amber-400 text-amber-500' : ''}`} />
                        </button>
                        <h4
                          onClick={() => onSelectProduct(p)}
                          className="text-xs font-black text-slate-900 dark:text-white leading-tight cursor-pointer hover:text-indigo-600"
                        >
                          {p.name}
                        </h4>
                      </div>
                      <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded shrink-0 ${
                        item.priority === 'CRITICAL' 
                          ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300' 
                          : item.priority === 'HIGH'
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                          : 'bg-slate-100 text-slate-700 dark:bg-slate-700'
                      }`}>
                        {item.priority}
                      </span>
                    </div>

                    {/* Codes Row */}
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono flex items-center gap-1.5 flex-wrap">
                      <span className="font-semibold text-slate-700 dark:text-slate-300">Bar: {p.barcode}</span>
                      {p.localCode && (
                        <>
                          <span className="text-slate-300 dark:text-slate-700">•</span>
                          <span className="font-semibold text-slate-800 dark:text-slate-200">Bansal: {p.localCode}</span>
                        </>
                      )}
                      {p.mainCode && (
                        <>
                          <span className="text-slate-300 dark:text-slate-700">•</span>
                          <span className="text-[9px] uppercase font-bold bg-indigo-50 dark:bg-indigo-950/60 px-1 rounded text-indigo-700">Main: {p.mainCode}</span>
                        </>
                      )}
                    </div>

                    {/* Metadata detail */}
                    <div className="text-[10px] text-slate-400 flex items-center gap-1 flex-wrap">
                      <span className="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded text-[9px] font-semibold">
                        {item.category}
                      </span>
                      <span className="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded text-[9px] font-semibold">
                        {item.brand}
                      </span>
                      <span className="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded text-[9px] font-semibold">
                        Supp: {item.supplier}
                      </span>
                    </div>

                    {/* Grid values */}
                    <div className="grid grid-cols-4 gap-1 text-[10px] bg-slate-50 dark:bg-slate-800/60 p-1.5 rounded-lg border border-slate-150 dark:border-slate-800 font-mono text-center">
                      <div>
                        <span className="text-[8px] text-slate-400 block leading-none uppercase">Stock</span>
                        <span className={`font-bold ${p.stock <= 0 ? 'text-rose-600' : 'text-slate-800 dark:text-slate-200'}`}>
                          {p.stock}
                        </span>
                      </div>
                      <div>
                        <span className="text-[8px] text-slate-400 block leading-none uppercase">Sales</span>
                        <span className="font-bold text-indigo-600">{p.salesCount}</span>
                      </div>
                      <div>
                        <span className="text-[8px] text-slate-400 block leading-none uppercase">Days Cover</span>
                        <span className="font-bold">
                          {item.avgDailySales === 0 ? 'N/A' : `${item.daysCover.toFixed(1)}d`}
                        </span>
                      </div>
                      <div>
                        <span className="text-[8px] text-slate-400 block leading-none uppercase">Reorder Point</span>
                        <span className="font-bold text-slate-700 dark:text-slate-300">{item.reorderPoint}</span>
                      </div>
                    </div>

                    {/* Bottom Status & Recommended Quantity + Actions */}
                    <div className="flex items-center justify-between gap-2 border-t border-dashed border-slate-100 dark:border-slate-800 pt-1.5 mt-0.5">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full ${
                            item.status === 'REORDER NOW'
                              ? 'bg-rose-600 text-white'
                              : item.status === 'REORDER SOON'
                              ? 'bg-amber-500 text-white'
                              : item.status === 'MONITOR'
                              ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300'
                              : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950'
                          }`}
                        >
                          {item.status}
                        </span>
                        {item.recommendedOrder > 0 && (
                          <span className="bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 px-1.5 py-0.5 rounded text-[9px] font-black whitespace-nowrap">
                            Order: +{item.recommendedOrder}
                          </span>
                        )}
                        {item.recommendedOrder > 0 && item.estCostValue !== null && (
                          <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                            ₹{item.estCostValue.toLocaleString('en-IN')}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => onSelectProduct(p)}
                          className="p-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
                          title="Inspect Product"
                        >
                          <Eye className="w-3.5 h-3.5 text-slate-600 dark:text-slate-300" />
                        </button>
                        <button
                          onClick={() => setStockCountModalItem(item)}
                          className="p-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
                          title="Quick Calculation Breakdown"
                        >
                          <Info className="w-3.5 h-3.5 text-slate-600 dark:text-slate-300" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Pagination Controls */}
          {filteredItems.length > 0 && (
            <div className={`p-3 border-t flex flex-col sm:flex-row items-center justify-between gap-2 text-xs ${
              isDarkMode ? 'border-slate-700 bg-slate-900/40 text-slate-400' : 'border-slate-100 bg-slate-50 text-slate-500'
            }`}>
              <div className="font-semibold">
                Showing {((currentPage - 1) * pageSize) + 1} - {Math.min(currentPage * pageSize, filteredItems.length)} of {filteredItems.length} items
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-200 dark:hover:bg-slate-800 transition-all flex items-center gap-1 cursor-pointer font-bold"
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> Previous
                </button>
                <span className="px-2 font-bold text-slate-800 dark:text-slate-200">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                  className="px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-200 dark:hover:bg-slate-800 transition-all flex items-center gap-1 cursor-pointer font-bold"
                >
                  Next <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* QUICK STOCK CALCULATION BREAKDOWN MODAL */}
      {stockCountModalItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className={`max-w-md w-full rounded-3xl p-5 border space-y-4 ${
            isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-900'
          } shadow-xl`}>
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] font-black uppercase text-indigo-600 tracking-wider">
                  Replenishment Calculation Math
                </span>
                <h3 className="font-black text-lg">{stockCountModalItem.product.name}</h3>
                <p className="text-xs text-slate-400 font-mono">{stockCountModalItem.product.barcode}</p>
              </div>
              <button
                onClick={() => setStockCountModalItem(null)}
                className="text-slate-400 hover:text-slate-700 p-1"
              >
                ✕
              </button>
            </div>

            <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-900 space-y-2 text-xs font-mono">
              <div className="flex justify-between">
                <span className="text-slate-500">Sales Quantity:</span>
                <span className="font-bold">{stockCountModalItem.product.salesCount} Units</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Report Period:</span>
                <span className="font-bold">{periodDays} Days</span>
              </div>
              <div className="flex justify-between border-t pt-1 border-slate-200 dark:border-slate-800">
                <span className="text-slate-500">Avg Daily Sales:</span>
                <span className="font-bold text-indigo-600">{stockCountModalItem.avgDailySales.toFixed(2)} / Day</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Lead Time ({leadTimeDays}d) + Safety ({safetyStockDays}d):</span>
                <span className="font-bold text-purple-600">{stockCountModalItem.reorderPoint} Units (Reorder Point)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Target Stock ({targetDays} Days):</span>
                <span className="font-bold text-teal-600">{stockCountModalItem.targetStock} Units</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Current Closing Stock:</span>
                <span className="font-bold text-rose-600">{stockCountModalItem.product.stock} Units</span>
              </div>
              <div className="flex justify-between border-t pt-2 text-sm border-slate-200 dark:border-slate-800">
                <span className="font-sans font-bold">Recommended Order:</span>
                <span className="font-black text-indigo-600">+{stockCountModalItem.recommendedOrder} Units</span>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setStockCountModalItem(null)}
                className="px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
