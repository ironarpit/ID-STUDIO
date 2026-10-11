import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { loadAllSessions, resumeSession } from '../../utils/auditStorage';
import { exportZeroSaleAuditToExcel } from '../../utils/auditExport';
import { Product, ComputedProductAnalytics, StockReportMeta, AuditSession } from '../../types';
import {
  computeCategorySummaries,
  computeBrandSummaries,
  computeSupplierSummaries,
  getProductBrand
} from '../../utils/analytics';
import { getUniqueMainCodes, matchesMainCodeFilter, isExcludedMainCode } from '../../utils/mainCode';
import { MultiSelectDropdown } from '../MultiSelectDropdown';
import { ActiveFilterChips } from '../ActiveFilterChips';
import { computeLinkedClassificationOptions } from '../../utils/linkedFilters';
import {
  exportToExcel,
  exportToCsvEngine,
  exportToPdfEngine,
  printReportEngine,
  ReportColumn,
  ExportReportOptions
} from '../../utils/exportEngine';
import {
  FileText,
  Download,
  Printer,
  FileSpreadsheet,
  FileCode,
  Filter,
  Search,
  Building2,
  Tags,
  Briefcase,
  Truck,
  ArrowUpDown,
  X,
  Bookmark,
  History,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  EyeOff,
  Zap,
  Turtle,
  PackageX,
  PackagePlus,
  RefreshCw,
  PieChart,
  Trophy,
  ChevronLeft,
  ChevronRight,
  Layers,
  Save,
  Trash2,
  RotateCcw,
  Sparkles,
  Info
} from 'lucide-react';

export type ReportType =
  | 'stock'
  | 'sales'
  | 'zero_sales'
  | 'dead_stock'
  | 'overstock'
  | 'low_stock'
  | 'out_of_stock'
  | 'fast_moving'
  | 'slow_moving'
  | 'replenishment'
  | 'category'
  | 'brand'
  | 'supplier'
  | 'abc'
  | 'top100';

export type Top100Metric =
  | 'salesQty'
  | 'salesValue'
  | 'inventoryValue'
  | 'retailValue'
  | 'margin';

export interface SavedReportPreset {
  id: string;
  name: string;
  reportType: ReportType;
  top100Metric?: Top100Metric;
  filters: {
    mainCodes?: string[];
    mainCode?: string;
    categories?: string[];
    category?: string;
    brand?: string;
    brands?: string[];
    supplier?: string;
    suppliers?: string[];
    stockStatus: string;
    movementStatus: string;
    searchQuery: string;
  };
  sortField: string;
  sortDirection: 'asc' | 'desc';
  createdAt: string;
}

export interface ReportHistoryItem {
  id: string;
  reportName: string;
  reportType: ReportType;
  exportedAt: string;
  format: 'CSV' | 'Excel' | 'PDF' | 'Print';
  itemCount: number;
  filterSummary: string;
}

interface ReportsExportCenterViewProps {
  products: Product[];
  analyticsMap: Map<string, ComputedProductAnalytics>;
  reportMeta?: StockReportMeta | null;
  initialReportType?: ReportType;
  onSelectProduct: (product: Product) => void;
  isDarkMode?: boolean;
}

export const ReportsExportCenterView: React.FC<ReportsExportCenterViewProps> = ({
  products,
  analyticsMap,
  reportMeta,
  initialReportType = 'stock',
  onSelectProduct,
  isDarkMode
}) => {
  // Active Report Type & Sub-options
  const [selectedReport, setSelectedReport] = useState<ReportType>(initialReportType);
  const [top100Metric, setTop100Metric] = useState<Top100Metric>('salesValue');
  const [replenishmentGroupBySupplier, setReplenishmentGroupBySupplier] = useState<boolean>(false);

  // Global Filters State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedMainCodes, setSelectedMainCodes] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [selectedSuppliers, setSelectedSuppliers] = useState<string[]>([]);
  const [selectedStockStatus, setSelectedStockStatus] = useState<string>('all');
  const [selectedMovementStatus, setSelectedMovementStatus] = useState<string>('all');

  // Table Sorting State
  const [sortField, setSortField] = useState<string>('inventoryValue');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Pagination State
  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageSize = 50;

  // Saved Presets & History State
  const [savedPresets, setSavedPresets] = useState<SavedReportPreset[]>([]);
  const [reportHistory, setReportHistory] = useState<ReportHistoryItem[]>([]);
  const [presetModalOpen, setPresetModalOpen] = useState<boolean>(false);
  const [newPresetName, setNewPresetName] = useState<string>('');
  const [showHistoryPanel, setShowHistoryPanel] = useState<boolean>(false);

  // Export Loading Status Notice
  const [exportNotice, setExportNotice] = useState<string | null>(null);
  const [completedAudits, setCompletedAudits] = useState<AuditSession[]>([]);

  // Load Saved Presets & History from LocalStorage & Completed Audits
  useEffect(() => {
    try {
      const storedPresets = localStorage.getItem('retail_report_presets');
      if (storedPresets) setSavedPresets(JSON.parse(storedPresets));

      const storedHistory = localStorage.getItem('retail_report_history');
      if (storedHistory) setReportHistory(JSON.parse(storedHistory));

      loadAllSessions().then((sessions) => {
        setCompletedAudits(sessions.filter((s) => s.status === 'completed' && (s.type === 'zero_sales' || (s.title && s.title.toLowerCase().includes('zero sale')))));
      });
    } catch (e) {
      console.error('Failed to parse report history or presets', e);
    }
  }, []);

  // Base predicate for operational filters (stockStatus, movementStatus, searchQuery)
  const basePredicate = useCallback((p: Product) => {
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
  }, [analyticsMap, selectedStockStatus, selectedMovementStatus, searchQuery]);

  // Bidirectional linked options computation
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

  const masterFilteredProducts = linkedResult.filteredItems;
  const mainCodesList = linkedResult.mainCodeOptions;
  const categoriesList = linkedResult.categoryOptions;
  const brandsList = linkedResult.brandOptions;
  const suppliersList = linkedResult.supplierOptions;

  // Specific Report Filter Application (e.g. Zero Sales, Dead Stock, Overstock, Low Stock, etc.)
  const reportProducts = useMemo(() => {
    let prods = masterFilteredProducts;

    switch (selectedReport) {
      case 'sales':
        return prods.filter(p => (p.salesCount || 0) > 0);
      case 'zero_sales':
        return prods.filter(p => (p.salesCount || 0) === 0);
      case 'dead_stock':
        return prods.filter(p => {
          const calc = analyticsMap.get(p.id);
          return calc?.movementStatus === 'dead';
        });
      case 'overstock':
        return prods.filter(p => {
          const calc = analyticsMap.get(p.id);
          return calc?.stockStatus === 'overstock';
        });
      case 'low_stock':
        return prods.filter(p => {
          const calc = analyticsMap.get(p.id);
          return calc?.stockStatus === 'low_stock';
        });
      case 'out_of_stock':
        return prods.filter(p => {
          const calc = analyticsMap.get(p.id);
          return calc?.stockStatus === 'out_of_stock';
        });
      case 'fast_moving':
        return prods.filter(p => {
          const calc = analyticsMap.get(p.id);
          return calc?.movementStatus === 'fast';
        });
      case 'slow_moving':
        return prods.filter(p => {
          const calc = analyticsMap.get(p.id);
          return calc?.movementStatus === 'slow';
        });
      case 'replenishment':
        return prods.filter(p => {
          const calc = analyticsMap.get(p.id);
          return (calc?.suggestedReorder || 0) > 0 || calc?.stockStatus === 'low_stock' || calc?.stockStatus === 'out_of_stock';
        });
      case 'top100': {
        const sorted = [...prods].sort((a, b) => {
          const calcA = analyticsMap.get(a.id);
          const calcB = analyticsMap.get(b.id);
          if (top100Metric === 'salesQty') return (b.salesCount || 0) - (a.salesCount || 0);
          if (top100Metric === 'salesValue') return (calcB?.salesValue || 0) - (calcA?.salesValue || 0);
          if (top100Metric === 'inventoryValue') return (calcB?.inventoryValueCost || 0) - (calcA?.inventoryValueCost || 0);
          if (top100Metric === 'retailValue') return (calcB?.retailStockValue || 0) - (calcA?.retailStockValue || 0);
          if (top100Metric === 'margin') return (calcB?.marginAmount || 0) - (calcA?.marginAmount || 0);
          return 0;
        });
        return sorted.slice(0, 100);
      }
      default:
        return prods;
    }
  }, [masterFilteredProducts, selectedReport, top100Metric, analyticsMap]);

  // Aggregated Summaries for Category, Brand, Supplier, and ABC Reports
  const categoryReportData = useMemo(() => {
    if (selectedReport !== 'category') return [];
    return computeCategorySummaries(reportProducts, analyticsMap);
  }, [reportProducts, analyticsMap, selectedReport]);

  const brandReportData = useMemo(() => {
    if (selectedReport !== 'brand') return [];
    return computeBrandSummaries(reportProducts, analyticsMap);
  }, [reportProducts, analyticsMap, selectedReport]);

  const supplierReportData = useMemo(() => {
    if (selectedReport !== 'supplier') return [];
    return computeSupplierSummaries(reportProducts, analyticsMap);
  }, [reportProducts, analyticsMap, selectedReport]);

  // Default Sort Configuration when switching report type
  useEffect(() => {
    setCurrentPage(1);
    if (selectedReport === 'zero_sales' || selectedReport === 'dead_stock') {
      setSortField('inventoryValue');
      setSortDirection('desc');
    } else if (selectedReport === 'replenishment') {
      setSortField('priorityRank');
      setSortDirection('asc');
    } else if (selectedReport === 'category' || selectedReport === 'brand' || selectedReport === 'supplier') {
      setSortField('inventoryValue');
      setSortDirection('desc');
    } else {
      setSortField('inventoryValue');
      setSortDirection('desc');
    }
  }, [selectedReport]);

  // Generate Report Rows based on active Report Type
  const reportTableRows = useMemo(() => {
    if (selectedReport === 'category') {
      return categoryReportData.map(c => ({
        id: c.category,
        category: c.category,
        healthStatus: c.healthStatus,
        productCount: c.productCount,
        closingStock: c.closingStock,
        salesQuantity: c.salesQuantity,
        salesValue: c.salesValue,
        inventoryValue: c.inventoryValue,
        retailValue: c.retailValue,
        zeroSales: c.zeroSales,
        deadStock: c.deadStock,
        overstock: c.overstock,
        lowStock: c.lowStock,
        outOfStock: c.outOfStock
      }));
    }

    if (selectedReport === 'brand') {
      return brandReportData.map(b => ({
        id: b.brand,
        brand: b.brand,
        productCount: b.productCount,
        closingStock: b.closingStock,
        salesQuantity: b.salesQuantity,
        salesValue: b.salesValue,
        inventoryValue: b.inventoryValue,
        retailValue: b.retailValue,
        zeroSales: b.zeroSales,
        deadStock: b.deadStock,
        overstock: b.overstock,
        lowStock: b.lowStock,
        outOfStock: b.outOfStock
      }));
    }

    if (selectedReport === 'supplier') {
      return supplierReportData.map(s => ({
        id: s.supplierName,
        supplierName: s.supplierName,
        productCount: s.productCount,
        closingStock: s.closingStock,
        salesQuantity: s.salesQuantity,
        salesValue: s.salesValue,
        inventoryValue: s.inventoryValue,
        zeroSales: s.zeroSales,
        deadStock: s.deadStock,
        overstock: s.overstock,
        outOfStock: s.outOfStock,
        replenishmentCount: s.replenishmentCount,
        estimatedPurchaseValue: s.estimatedPurchaseValue
      }));
    }

    // Individual Product-based Reports
    return reportProducts.map((p, idx) => {
      const calc = analyticsMap.get(p.id);
      const brand = getProductBrand(p) || 'Unknown / Not Available';
      const costVal = calc?.inventoryValueCost || (p.stock * (p.costPrice || 0));
      const retailVal = calc?.retailStockValue || (p.stock * p.retailPrice);
      const salesVal = calc?.salesValue || ((p.salesCount || 0) * p.retailPrice);
      const unitCost = p.costPrice ?? (p.retailPrice ? p.retailPrice * 0.8 : (p.mrp ? p.mrp * 0.8 : 0));

      // Priority ranking for replenishment
      let priorityRank = 3;
      let priorityLabel = 'Medium Priority';
      if (calc?.stockStatus === 'out_of_stock' && (p.salesCount || 0) > 0) {
        priorityRank = 1;
        priorityLabel = 'CRITICAL OOS';
      } else if (calc?.stockStatus === 'low_stock' || calc?.movementStatus === 'fast') {
        priorityRank = 2;
        priorityLabel = 'HIGH PRIORITY';
      }

      const recommendedUnits = calc?.suggestedReorder || (calc?.stockStatus === 'out_of_stock' ? Math.max(10, p.salesCount || 10) : 10);
      const estPurchaseVal = recommendedUnits * unitCost;

      return {
        id: p.id,
        rank: idx + 1,
        priorityRank,
        priorityLabel,
        barcode: p.barcode,
        name: p.name,
        mainCode: p.mainCode || 'Unknown',
        category: (p.category && p.category.trim()) ? p.category.trim() : 'Unknown / Not Available',
        brand,
        supplierName: (p.supplierName && p.supplierName.trim()) ? p.supplierName.trim() : 'Unknown / Not Available',
        openingStock: p.openingStock || p.stock || 0,
        purchaseQty: p.purchaseQty || 0,
        salesCount: p.salesCount || 0,
        stock: p.stock || 0,
        costPrice: unitCost,
        retailPrice: p.retailPrice || 0,
        mrp: p.mrp || 0,
        inventoryValue: costVal,
        retailValue: retailVal,
        salesValue: salesVal,
        avgDailySales: calc?.avgDailySales || 0,
        daysCover: calc?.daysCover || 999,
        reorderPoint: Math.round((calc?.avgDailySales || 0) * 14),
        targetStock: Math.round((calc?.avgDailySales || 0) * 30),
        recommendedUnits,
        estPurchaseVal,
        abcCategory: calc?.abcCategory || 'C',
        stockStatus: calc?.stockStatus || 'normal',
        movementStatus: calc?.movementStatus || 'normal',
        stockAgeGroup: calc?.stockAgeGroup || 'Unknown',
        marginAmount: calc?.marginAmount || 0,
        marginPct: calc?.marginPct || 0,
        productObj: p
      };
    });
  }, [reportProducts, analyticsMap, selectedReport, categoryReportData, brandReportData, supplierReportData]);

  // Sort Table Rows
  const sortedReportRows = useMemo(() => {
    return [...reportTableRows].sort((a, b) => {
      let valA = a[sortField];
      let valB = b[sortField];
      if (typeof valA === 'string') {
        valA = valA.toLowerCase();
        valB = (valB || '').toString().toLowerCase();
        return sortDirection === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      valA = valA ?? 0;
      valB = valB ?? 0;
      return sortDirection === 'asc' ? valA - valB : valB - valA;
    });
  }, [reportTableRows, sortField, sortDirection]);

  // Table Column Definitions by Report Type
  const reportColumns = useMemo<ReportColumn[]>(() => {
    switch (selectedReport) {
      case 'stock':
        return [
          { header: 'Product Name', key: 'name', type: 'text', width: 25 },
          { header: 'Barcode', key: 'barcode', type: 'code', align: 'center', width: 14 },
          { header: 'Main Code', key: 'mainCode', type: 'code', align: 'center', width: 12 },
          { header: 'Category', key: 'category', type: 'text', width: 16 },
          { header: 'Brand', key: 'brand', type: 'text', width: 15 },
          { header: 'Supplier', key: 'supplierName', type: 'text', width: 16 },
          { header: 'Opening', key: 'openingStock', type: 'number', align: 'right', width: 10 },
          { header: 'Purchase', key: 'purchaseQty', type: 'number', align: 'right', width: 10 },
          { header: 'Sales', key: 'salesCount', type: 'number', align: 'right', width: 10 },
          { header: 'Closing Stock', key: 'stock', type: 'number', align: 'right', width: 12 },
          { header: 'Cost Price', key: 'costPrice', type: 'currency', align: 'right', width: 12 },
          { header: 'Inventory Cost', key: 'inventoryValue', type: 'currency', align: 'right', width: 14 },
          { header: 'Retail Price', key: 'retailPrice', type: 'currency', align: 'right', width: 12 },
          { header: 'Retail Value', key: 'retailValue', type: 'currency', align: 'right', width: 14 },
          { header: 'Stock Status', key: 'stockStatus', type: 'text', align: 'center', width: 12 },
          { header: 'Velocity', key: 'movementStatus', type: 'text', align: 'center', width: 12 }
        ];

      case 'top100':
        return [
          { header: 'Rank', key: 'rank', type: 'number', align: 'center', width: 8 },
          { header: 'Product Name', key: 'name', type: 'text', width: 28 },
          { header: 'Barcode', key: 'barcode', type: 'code', align: 'center', width: 14 },
          { header: 'Category', key: 'category', type: 'text', width: 16 },
          { header: 'Brand', key: 'brand', type: 'text', width: 15 },
          { header: 'Stock Qty', key: 'stock', type: 'number', align: 'right', width: 10 },
          { header: 'Sales Qty', key: 'salesCount', type: 'number', align: 'right', width: 10 },
          { header: 'Sales Value', key: 'salesValue', type: 'currency', align: 'right', width: 14 },
          { header: 'Inventory Cost', key: 'inventoryValue', type: 'currency', align: 'right', width: 14 },
          { header: 'Retail Value', key: 'retailValue', type: 'currency', align: 'right', width: 14 },
          { header: 'Margin Amount', key: 'marginAmount', type: 'currency', align: 'right', width: 14 },
          { header: 'Margin %', key: 'marginPct', type: 'percent', align: 'right', width: 10 }
        ];

      case 'zero_sales':
        return [
          { header: 'Product Name', key: 'name', type: 'text', width: 30 },
          { header: 'Barcode', key: 'barcode', type: 'code', align: 'center', width: 14 },
          { header: 'Category', key: 'category', type: 'text', width: 18 },
          { header: 'Brand', key: 'brand', type: 'text', width: 16 },
          { header: 'Supplier', key: 'supplierName', type: 'text', width: 18 },
          { header: 'Closing Stock', key: 'stock', type: 'number', align: 'right', width: 12 },
          { header: 'Cost Price', key: 'costPrice', type: 'currency', align: 'right', width: 12 },
          { header: 'Inventory Cost Value', key: 'inventoryValue', type: 'currency', align: 'right', width: 16 },
          { header: 'Retail Stock Value', key: 'retailValue', type: 'currency', align: 'right', width: 16 },
          { header: 'Sales', key: 'salesCount', type: 'number', align: 'right', width: 10 }
        ];

      case 'dead_stock':
        return [
          { header: 'Product Name', key: 'name', type: 'text', width: 28 },
          { header: 'Barcode', key: 'barcode', type: 'code', align: 'center', width: 14 },
          { header: 'Category', key: 'category', type: 'text', width: 16 },
          { header: 'Brand', key: 'brand', type: 'text', width: 15 },
          { header: 'Supplier', key: 'supplierName', type: 'text', width: 16 },
          { header: 'Stock Qty', key: 'stock', type: 'number', align: 'right', width: 10 },
          { header: 'Sales Qty', key: 'salesCount', type: 'number', align: 'right', width: 10 },
          { header: 'Inventory Cost Value', key: 'inventoryValue', type: 'currency', align: 'right', width: 16 },
          { header: 'Retail Value', key: 'retailValue', type: 'currency', align: 'right', width: 14 },
          { header: 'Stock Age', key: 'stockAgeGroup', type: 'text', align: 'center', width: 12 },
          { header: 'Status', key: 'movementStatus', type: 'text', align: 'center', width: 12 }
        ];

      case 'replenishment':
        return [
          { header: 'Priority', key: 'priorityLabel', type: 'text', align: 'center', width: 14 },
          { header: 'Product Name', key: 'name', type: 'text', width: 26 },
          { header: 'Category', key: 'category', type: 'text', width: 15 },
          { header: 'Brand', key: 'brand', type: 'text', width: 14 },
          { header: 'Supplier', key: 'supplierName', type: 'text', width: 16 },
          { header: 'Closing Stock', key: 'stock', type: 'number', align: 'right', width: 11 },
          { header: 'Total Sales', key: 'salesCount', type: 'number', align: 'right', width: 10 },
          { header: 'Avg Daily Sales', key: 'avgDailySales', type: 'number', align: 'right', width: 12 },
          { header: 'Days Cover', key: 'daysCover', type: 'number', align: 'right', width: 10 },
          { header: 'Reorder Point', key: 'reorderPoint', type: 'number', align: 'right', width: 11 },
          { header: 'Target Stock', key: 'targetStock', type: 'number', align: 'right', width: 11 },
          { header: 'Recommended Order', key: 'recommendedUnits', type: 'number', align: 'right', width: 14 },
          { header: 'Est. Purchase Value', key: 'estPurchaseVal', type: 'currency', align: 'right', width: 16 }
        ];

      case 'category':
        return [
          { header: 'Category Name', key: 'category', type: 'text', width: 22 },
          { header: 'Health Status', key: 'healthStatus', type: 'text', align: 'center', width: 14 },
          { header: 'Total SKUs', key: 'productCount', type: 'number', align: 'right', width: 10 },
          { header: 'Stock Qty', key: 'closingStock', type: 'number', align: 'right', width: 12 },
          { header: 'Sales Qty', key: 'salesQuantity', type: 'number', align: 'right', width: 12 },
          { header: 'Sales Value', key: 'salesValue', type: 'currency', align: 'right', width: 14 },
          { header: 'Inventory Cost', key: 'inventoryValue', type: 'currency', align: 'right', width: 14 },
          { header: 'Retail Value', key: 'retailValue', type: 'currency', align: 'right', width: 14 },
          { header: 'Zero Sales', key: 'zeroSales', type: 'number', align: 'right', width: 10 },
          { header: 'Dead Stock', key: 'deadStock', type: 'number', align: 'right', width: 10 },
          { header: 'Overstock', key: 'overstock', type: 'number', align: 'right', width: 10 },
          { header: 'Low Stock', key: 'lowStock', type: 'number', align: 'right', width: 10 },
          { header: 'Out of Stock', key: 'outOfStock', type: 'number', align: 'right', width: 10 }
        ];

      case 'brand':
        return [
          { header: 'Brand Name', key: 'brand', type: 'text', width: 22 },
          { header: 'Total SKUs', key: 'productCount', type: 'number', align: 'right', width: 10 },
          { header: 'Stock Qty', key: 'closingStock', type: 'number', align: 'right', width: 12 },
          { header: 'Sales Qty', key: 'salesQuantity', type: 'number', align: 'right', width: 12 },
          { header: 'Sales Value', key: 'salesValue', type: 'currency', align: 'right', width: 14 },
          { header: 'Inventory Cost', key: 'inventoryValue', type: 'currency', align: 'right', width: 14 },
          { header: 'Retail Value', key: 'retailValue', type: 'currency', align: 'right', width: 14 },
          { header: 'Zero Sales', key: 'zeroSales', type: 'number', align: 'right', width: 10 },
          { header: 'Dead Stock', key: 'deadStock', type: 'number', align: 'right', width: 10 },
          { header: 'Overstock', key: 'overstock', type: 'number', align: 'right', width: 10 },
          { header: 'Low Stock', key: 'lowStock', type: 'number', align: 'right', width: 10 },
          { header: 'Out of Stock', key: 'outOfStock', type: 'number', align: 'right', width: 10 }
        ];

      case 'supplier':
        return [
          { header: 'Supplier Name', key: 'supplierName', type: 'text', width: 24 },
          { header: 'Total SKUs', key: 'productCount', type: 'number', align: 'right', width: 10 },
          { header: 'Stock Qty', key: 'closingStock', type: 'number', align: 'right', width: 12 },
          { header: 'Sales Qty', key: 'salesQuantity', type: 'number', align: 'right', width: 12 },
          { header: 'Sales Value', key: 'salesValue', type: 'currency', align: 'right', width: 14 },
          { header: 'Inventory Cost', key: 'inventoryValue', type: 'currency', align: 'right', width: 14 },
          { header: 'Zero Sales', key: 'zeroSales', type: 'number', align: 'right', width: 10 },
          { header: 'Dead Stock', key: 'deadStock', type: 'number', align: 'right', width: 10 },
          { header: 'Overstock', key: 'overstock', type: 'number', align: 'right', width: 10 },
          { header: 'Out of Stock', key: 'outOfStock', type: 'number', align: 'right', width: 10 },
          { header: 'Replenish SKUs', key: 'replenishmentCount', type: 'number', align: 'right', width: 12 },
          { header: 'Est Replenish Value', key: 'estimatedPurchaseValue', type: 'currency', align: 'right', width: 16 }
        ];

      case 'abc':
        return [
          { header: 'Product Name', key: 'name', type: 'text', width: 28 },
          { header: 'Barcode', key: 'barcode', type: 'code', align: 'center', width: 14 },
          { header: 'Category', key: 'category', type: 'text', width: 16 },
          { header: 'Brand', key: 'brand', type: 'text', width: 15 },
          { header: 'Sales Qty', key: 'salesCount', type: 'number', align: 'right', width: 10 },
          { header: 'Sales Value', key: 'salesValue', type: 'currency', align: 'right', width: 14 },
          { header: 'Inventory Cost', key: 'inventoryValue', type: 'currency', align: 'right', width: 14 },
          { header: 'ABC Class', key: 'abcCategory', type: 'text', align: 'center', width: 10 }
        ];

      default:
        // Generic fallback columns
        return [
          { header: 'Product Name', key: 'name', type: 'text', width: 28 },
          { header: 'Barcode', key: 'barcode', type: 'code', align: 'center', width: 14 },
          { header: 'Main Code', key: 'mainCode', type: 'code', align: 'center', width: 12 },
          { header: 'Category', key: 'category', type: 'text', width: 16 },
          { header: 'Brand', key: 'brand', type: 'text', width: 15 },
          { header: 'Supplier', key: 'supplierName', type: 'text', width: 16 },
          { header: 'Stock Qty', key: 'stock', type: 'number', align: 'right', width: 10 },
          { header: 'Sales Qty', key: 'salesCount', type: 'number', align: 'right', width: 10 },
          { header: 'Inventory Cost', key: 'inventoryValue', type: 'currency', align: 'right', width: 14 },
          { header: 'Retail Value', key: 'retailValue', type: 'currency', align: 'right', width: 14 },
          { header: 'Status', key: 'stockStatus', type: 'text', align: 'center', width: 12 }
        ];
    }
  }, [selectedReport]);

  // Overall KPI Summary Totals for Active Report
  const kpiSummary = useMemo(() => {
    const totalRecords = sortedReportRows.length;
    const totalStock = sortedReportRows.reduce((acc, r) => acc + (r.stock || r.closingStock || 0), 0);
    const totalSalesQty = sortedReportRows.reduce((acc, r) => acc + (r.salesCount || r.salesQuantity || 0), 0);
    const totalSalesValue = sortedReportRows.reduce((acc, r) => acc + (r.salesValue || 0), 0);
    const totalInventoryValue = sortedReportRows.reduce((acc, r) => acc + (r.inventoryValue || 0), 0);
    const totalRetailValue = sortedReportRows.reduce((acc, r) => acc + (r.retailValue || 0), 0);

    return [
      { label: 'Total Records', value: totalRecords.toLocaleString('en-IN') },
      { label: 'Total Stock Units', value: totalStock.toLocaleString('en-IN') },
      { label: 'Total Sales Qty', value: totalSalesQty.toLocaleString('en-IN') },
      { label: 'Sales Value', value: `₹${totalSalesValue.toLocaleString('en-IN')}` },
      { label: 'Inventory Cost', value: `₹${totalInventoryValue.toLocaleString('en-IN')}` },
      { label: 'Retail Value', value: `₹${totalRetailValue.toLocaleString('en-IN')}` }
    ];
  }, [sortedReportRows]);

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
    setCurrentPage(1);
  };

  // Applied Filter Labels for Display and Header Export
  const appliedFilterPills = useMemo(() => {
    const pills: string[] = [];
    if (selectedMainCodes.length > 0) pills.push(`Main Codes (${selectedMainCodes.length}): ${selectedMainCodes.join(', ')}`);
    if (selectedCategories.length > 0) pills.push(`Categories (${selectedCategories.length}): ${selectedCategories.join(', ')}`);
    if (selectedBrands.length > 0) pills.push(`Brands (${selectedBrands.length}): ${selectedBrands.join(', ')}`);
    if (selectedSuppliers.length > 0) pills.push(`Suppliers (${selectedSuppliers.length}): ${selectedSuppliers.join(', ')}`);
    if (selectedStockStatus !== 'all') pills.push(`Stock Status: ${selectedStockStatus}`);
    if (selectedMovementStatus !== 'all') pills.push(`Velocity: ${selectedMovementStatus}`);
    if (searchQuery.trim()) pills.push(`Search: "${searchQuery}"`);
    return pills;
  }, [selectedMainCodes, selectedCategories, selectedBrands, selectedSuppliers, selectedStockStatus, selectedMovementStatus, searchQuery]);

  // Report Titles Mapping
  const reportTitles: Record<ReportType, string> = {
    stock: 'Complete Stock Catalog Report',
    sales: 'Sales Performance Report',
    zero_sales: 'Zero Sales (Unsold Inventory) Report',
    dead_stock: 'Dead Stock Audit Report',
    overstock: 'Overstock Items Report',
    low_stock: 'Low Stock Alert Report',
    out_of_stock: 'Out of Stock Exception Report',
    fast_moving: 'Fast Moving Products Velocity Report',
    slow_moving: 'Slow Moving Products Report',
    replenishment: 'Inventory Replenishment & Purchase Order Report',
    category: 'Category Performance & Health Summary Report',
    brand: 'Brand Performance Summary Report',
    supplier: 'Supplier Performance & Replenishment Report',
    abc: 'ABC Inventory Classification Report',
    top100: `Top 100 Products (${top100Metric.toUpperCase()}) Report`
  };

  // Log Report Export to History
  const logExportHistory = (format: 'CSV' | 'Excel' | 'PDF' | 'Print') => {
    const newHistoryItem: ReportHistoryItem = {
      id: Date.now().toString(),
      reportName: reportTitles[selectedReport],
      reportType: selectedReport,
      exportedAt: new Date().toLocaleString('en-IN'),
      format,
      itemCount: sortedReportRows.length,
      filterSummary: appliedFilterPills.join(' | ') || 'All Products'
    };

    const updated = [newHistoryItem, ...reportHistory].slice(0, 20); // Keep last 20
    setReportHistory(updated);
    try {
      localStorage.setItem('retail_report_history', JSON.stringify(updated));
    } catch (e) {
      console.error('Failed to write report history', e);
    }
  };

  // Helper to build export options
  const buildExportOptions = (): ExportReportOptions => {
    return {
      title: reportTitles[selectedReport],
      reportType: selectedReport,
      generatedAt: new Date().toLocaleString('en-IN'),
      appliedFilters: appliedFilterPills,
      summaryKPIs: kpiSummary,
      columns: reportColumns,
      rows: sortedReportRows,
      reportMeta
    };
  };

  // Handler: Export CSV
  const handleExportCsv = () => {
    setExportNotice('Preparing CSV report export...');
    setTimeout(() => {
      try {
        exportToCsvEngine(buildExportOptions());
        logExportHistory('CSV');
        setExportNotice('Export complete! CSV downloaded.');
      } catch (err: any) {
        alert(`Export failed: ${err.message}`);
        setExportNotice(null);
      } finally {
        setTimeout(() => setExportNotice(null), 3000);
      }
    }, 100);
  };

  // Handler: Export Excel (.xlsx)
  const handleExportExcel = async () => {
    setExportNotice('Preparing Excel (.xlsx) workbook...');
    setTimeout(async () => {
      try {
        await exportToExcel(buildExportOptions());
        logExportHistory('Excel');
        setExportNotice('Export complete! Excel workbook downloaded.');
      } catch (err: any) {
        alert(`Excel export failed: ${err.message}`);
        setExportNotice(null);
      } finally {
        setTimeout(() => setExportNotice(null), 3000);
      }
    }, 100);
  };

  // Handler: Export PDF
  const handleExportPdf = () => {
    setExportNotice('Generating printable PDF document...');
    setTimeout(() => {
      try {
        exportToPdfEngine(buildExportOptions());
        logExportHistory('PDF');
        setExportNotice('Export complete! PDF document downloaded.');
      } catch (err: any) {
        alert(`PDF export failed: ${err.message}`);
        setExportNotice(null);
      } finally {
        setTimeout(() => setExportNotice(null), 3000);
      }
    }, 100);
  };

  // Handler: Print
  const handlePrint = () => {
    try {
      printReportEngine(buildExportOptions());
      logExportHistory('Print');
    } catch (err: any) {
      alert(`Print error: ${err.message}`);
    }
  };

  // Save Preset Handler
  const handleSavePreset = () => {
    if (!newPresetName.trim()) return;
    const newPreset: SavedReportPreset = {
      id: Date.now().toString(),
      name: newPresetName.trim(),
      reportType: selectedReport,
      top100Metric: selectedReport === 'top100' ? top100Metric : undefined,
      filters: {
        mainCodes: selectedMainCodes,
        categories: selectedCategories,
        brands: selectedBrands,
        suppliers: selectedSuppliers,
        stockStatus: selectedStockStatus,
        movementStatus: selectedMovementStatus,
        searchQuery: searchQuery
      },
      sortField,
      sortDirection,
      createdAt: new Date().toLocaleDateString('en-IN')
    };

    const updated = [newPreset, ...savedPresets];
    setSavedPresets(updated);
    localStorage.setItem('retail_report_presets', JSON.stringify(updated));
    setNewPresetName('');
    setPresetModalOpen(false);
  };

  // Load Preset
  const handleApplyPreset = (preset: SavedReportPreset) => {
    setSelectedReport(preset.reportType);
    if (preset.top100Metric) setTop100Metric(preset.top100Metric);
    if (preset.filters.mainCodes) {
      setSelectedMainCodes(preset.filters.mainCodes);
    } else if (preset.filters.mainCode && preset.filters.mainCode !== 'all') {
      setSelectedMainCodes([preset.filters.mainCode]);
    } else {
      setSelectedMainCodes([]);
    }

    if (preset.filters.categories) {
      setSelectedCategories(preset.filters.categories);
    } else if (preset.filters.category && preset.filters.category !== 'all') {
      setSelectedCategories([preset.filters.category]);
    } else {
      setSelectedCategories([]);
    }

    if (preset.filters.brands) {
      setSelectedBrands(preset.filters.brands);
    } else if (preset.filters.brand && preset.filters.brand !== 'all') {
      setSelectedBrands([preset.filters.brand]);
    } else {
      setSelectedBrands([]);
    }

    if (preset.filters.suppliers) {
      setSelectedSuppliers(preset.filters.suppliers);
    } else if (preset.filters.supplier && preset.filters.supplier !== 'all') {
      setSelectedSuppliers([preset.filters.supplier]);
    } else {
      setSelectedSuppliers([]);
    }

    setSelectedStockStatus(preset.filters.stockStatus);
    setSelectedMovementStatus(preset.filters.movementStatus);
    setSearchQuery(preset.filters.searchQuery);
    setSortField(preset.sortField);
    setSortDirection(preset.sortDirection);
    setCurrentPage(1);
  };

  // Delete Preset
  const handleDeletePreset = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = savedPresets.filter(p => p.id !== id);
    setSavedPresets(updated);
    localStorage.setItem('retail_report_presets', JSON.stringify(updated));
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
    setCurrentPage(1);
  };

  // Handle Sort Toggle
  const handleSort = (key: string) => {
    if (sortField === key) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(key);
      setSortDirection('desc');
    }
  };

  return (
    <div className="space-y-4">
      {/* Module 10 Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
              Module 10 Reports & Export Center
            </span>
            {reportMeta?.reportPeriodText && (
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                Period: {reportMeta.reportPeriodText}
              </span>
            )}
          </div>
          <h1 className="text-xl font-black tracking-tight dark:text-white mt-1">
            Store Intelligence Report Center
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Generate, filter, print, and export high-precision commercial reports in CSV, Excel (.xlsx), and PDF formats
          </p>
        </div>

        {/* Action Controls: Presets & History */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPresetModalOpen(true)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              isDarkMode ? 'bg-slate-800 text-slate-200 hover:bg-slate-700' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Bookmark className="w-3.5 h-3.5 text-indigo-500" />
            <span>Saved Presets ({savedPresets.length})</span>
          </button>

          <button
            onClick={() => setShowHistoryPanel(!showHistoryPanel)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              showHistoryPanel
                ? 'bg-indigo-600 text-white'
                : isDarkMode
                ? 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Export History ({reportHistory.length})</span>
          </button>
        </div>
      </div>

      {/* Export Status Notification Banner */}
      {exportNotice && (
        <div className="p-3 rounded-2xl bg-indigo-600 text-white text-xs font-extrabold flex items-center justify-between shadow-md animate-fade-in">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-300 animate-spin" />
            <span>{exportNotice}</span>
          </div>
          <button onClick={() => setExportNotice(null)} className="cursor-pointer">
            <X className="w-4 h-4 text-white/80" />
          </button>
        </div>
      )}

      {/* Saved Presets Drawer / Quick Selector */}
      {savedPresets.length > 0 && (
        <div className={`p-3 rounded-2xl border ${
          isDarkMode ? 'bg-slate-800/80 border-slate-700' : 'bg-indigo-50/50 border-indigo-100'
        } flex items-center gap-2 overflow-x-auto custom-scrollbar`}>
          <span className="text-[10px] font-black uppercase text-indigo-600 dark:text-indigo-400 shrink-0">Quick Presets:</span>
          {savedPresets.map((preset) => (
            <div
              key={preset.id}
              onClick={() => handleApplyPreset(preset)}
              className="group flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-800 dark:text-slate-200 hover:border-indigo-500 cursor-pointer transition-all shrink-0"
            >
              <span>{preset.name}</span>
              <button
                onClick={(e) => handleDeletePreset(preset.id, e)}
                className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-500 cursor-pointer ml-1"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Export History Panel */}
      {showHistoryPanel && (
        <div className={`p-4 rounded-2xl border ${
          isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'
        } space-y-3 shadow-md`}>
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-black uppercase tracking-wider dark:text-white flex items-center gap-2">
              <History className="w-4 h-4 text-indigo-500" />
              Recent Export Activity Log
            </h3>
            <button onClick={() => setShowHistoryPanel(false)} className="text-xs text-slate-400 hover:text-slate-600 cursor-pointer">
              Close Panel
            </button>
          </div>

          {reportHistory.length === 0 ? (
            <p className="text-xs text-slate-400 italic">No exports recorded in this session.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-48 overflow-y-auto custom-scrollbar">
              {reportHistory.map((item) => (
                <div key={item.id} className="p-2.5 rounded-xl border border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs space-y-1">
                  <div className="flex items-center justify-between font-bold text-slate-900 dark:text-white">
                    <span className="truncate">{item.reportName}</span>
                    <span className="px-1.5 py-0.2 rounded-md bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 text-[10px] font-black">{item.format}</span>
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
                    <span>{item.itemCount} items exported</span>
                    <span>{item.exportedAt}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 1. Report Category / Type Selector Bar */}
      <div className={`p-3.5 rounded-2xl border ${
        isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'
      } shadow-2xs space-y-2.5`}>
        <div className="flex items-center justify-between">
          <span className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
            <FileText className="w-4 h-4 text-indigo-500" />
            Select Commercial Report Type
          </span>
          <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400">
            {sortedReportRows.length.toLocaleString('en-IN')} Records Ready
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-8 gap-1.5">
          {[
            { id: 'stock', label: 'Stock Catalog', icon: Layers },
            { id: 'sales', label: 'Sales Report', icon: Zap },
            { id: 'zero_sales', label: 'Zero Sales', icon: EyeOff },
            { id: 'dead_stock', label: 'Dead Stock', icon: AlertOctagon },
            { id: 'overstock', label: 'Overstock', icon: PackagePlus },
            { id: 'low_stock', label: 'Low Stock', icon: AlertTriangle },
            { id: 'out_of_stock', label: 'Out of Stock', icon: PackageX },
            { id: 'fast_moving', label: 'Fast Moving', icon: Zap },
            { id: 'slow_moving', label: 'Slow Moving', icon: Turtle },
            { id: 'replenishment', label: 'Replenishment', icon: RefreshCw },
            { id: 'category', label: 'Category Summary', icon: Tags },
            { id: 'brand', label: 'Brand Summary', icon: Briefcase },
            { id: 'supplier', label: 'Supplier Summary', icon: Truck },
            { id: 'abc', label: 'ABC Analysis', icon: PieChart },
            { id: 'top100', label: 'Top 100 Report', icon: Trophy }
          ].map((rep) => {
            const Icon = rep.icon;
            const isActive = selectedReport === rep.id;
            return (
              <button
                key={rep.id}
                onClick={() => setSelectedReport(rep.id as ReportType)}
                className={`flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-xs font-extrabold transition-all text-left truncate cursor-pointer ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : isDarkMode
                    ? 'bg-slate-900 text-slate-300 hover:bg-slate-700'
                    : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{rep.label}</span>
              </button>
            );
          })}
        </div>

        {/* Sub-options for Top 100 and Replenishment */}
        {selectedReport === 'top100' && (
          <div className="pt-2 border-t border-slate-100 dark:border-slate-700 flex items-center gap-2 overflow-x-auto">
            <span className="text-[10px] font-black uppercase text-slate-500 shrink-0">Rank By Metric:</span>
            {[
              { id: 'salesValue', label: 'Top 100 Sales Value (₹)' },
              { id: 'salesQty', label: 'Top 100 Sales Qty' },
              { id: 'inventoryValue', label: 'Top 100 Inventory Cost' },
              { id: 'retailValue', label: 'Top 100 Retail Value' },
              { id: 'margin', label: 'Top 100 Profit Margin (₹)' }
            ].map((m) => (
              <button
                key={m.id}
                onClick={() => setTop100Metric(m.id as Top100Metric)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                  top100Metric === m.id
                    ? 'bg-amber-500 text-white'
                    : 'bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-300'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 2. Interactive Multi-Filters Bar */}
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

          {appliedFilterPills.length > 0 && (
            <button
              onClick={handleResetFilters}
              className="text-xs text-rose-600 dark:text-rose-400 font-bold hover:bg-rose-50 dark:hover:bg-rose-950/50 border border-rose-200 dark:border-rose-800 px-2.5 py-1 rounded-lg flex items-center gap-1 cursor-pointer shrink-0"
            >
              <X className="w-3 h-3" /> Reset Filters
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-2 items-center">
          {/* Search */}
          <div className="relative flex items-center bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1.5">
            <Search className="w-3.5 h-3.5 text-slate-400 mr-2 shrink-0" />
            <input
              type="text"
              placeholder="Search SKU / Code..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent text-xs text-slate-800 dark:text-slate-200 focus:outline-none w-full font-medium"
            />
          </div>

          {/* Main Code Multi-Select */}
          <MultiSelectDropdown
            label="Main Code"
            options={mainCodesList}
            selectedValues={selectedMainCodes}
            onChange={(vals) => {
              setSelectedMainCodes(vals);
              setCurrentPage(1);
            }}
            placeholder="All"
            searchPlaceholder="Search MainCodes..."
            icon={<Building2 className="w-3.5 h-3.5 text-indigo-500 mr-1 shrink-0" />}
            isDarkMode={isDarkMode}
            badgeColor="indigo"
          />

          {/* Category Multi-Select */}
          <MultiSelectDropdown
            label="Category"
            options={categoriesList}
            selectedValues={selectedCategories}
            onChange={(vals) => {
              setSelectedCategories(vals);
              setCurrentPage(1);
            }}
            placeholder="All"
            searchPlaceholder="Search categories..."
            icon={<Tags className="w-3.5 h-3.5 text-teal-500 mr-1 shrink-0" />}
            isDarkMode={isDarkMode}
            badgeColor="emerald"
          />

          {/* Brand Multi-Select */}
          <MultiSelectDropdown
            label="Brand"
            options={brandsList}
            selectedValues={selectedBrands}
            onChange={(vals) => {
              setSelectedBrands(vals);
              setCurrentPage(1);
            }}
            placeholder="All"
            searchPlaceholder="Search brands..."
            icon={<Briefcase className="w-3.5 h-3.5 text-purple-500 mr-1 shrink-0" />}
            isDarkMode={isDarkMode}
            badgeColor="purple"
          />

          {/* Supplier Multi-Select */}
          <MultiSelectDropdown
            label="Supplier"
            options={suppliersList}
            selectedValues={selectedSuppliers}
            onChange={(vals) => {
              setSelectedSuppliers(vals);
              setCurrentPage(1);
            }}
            placeholder="All"
            searchPlaceholder="Search suppliers..."
            icon={<Truck className="w-3.5 h-3.5 text-amber-500 mr-1 shrink-0" />}
            isDarkMode={isDarkMode}
            badgeColor="amber"
          />

          {/* Stock Status */}
          <div className="flex items-center bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1.5">
            <Layers className="w-3.5 h-3.5 text-slate-400 mr-1.5 shrink-0" />
            <select
              value={selectedStockStatus}
              onChange={(e) => {
                setSelectedStockStatus(e.target.value);
                setCurrentPage(1);
              }}
              className="bg-transparent text-xs text-slate-800 dark:text-slate-200 focus:outline-none w-full font-semibold truncate cursor-pointer"
            >
              <option value="all">Stock Status: All</option>
              <option value="out_of_stock">Out of Stock</option>
              <option value="low_stock">Low Stock</option>
              <option value="overstock">Overstock</option>
              <option value="normal">Normal</option>
            </select>
          </div>

          {/* Movement Status */}
          <div className="flex items-center bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1.5">
            <Zap className="w-3.5 h-3.5 text-slate-400 mr-1.5 shrink-0" />
            <select
              value={selectedMovementStatus}
              onChange={(e) => {
                setSelectedMovementStatus(e.target.value);
                setCurrentPage(1);
              }}
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

        {/* Reusable Active Filter Chips */}
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
            },
            {
              label: 'Brand',
              values: selectedBrands,
              onRemove: (v) => setSelectedBrands(selectedBrands.filter((c) => c !== v)),
              onClear: () => setSelectedBrands([]),
              badgeColor: 'purple',
              incompatibleValues: brandsList.filter((o) => o.incompatible).map((o) => o.value)
            },
            {
              label: 'Supplier',
              values: selectedSuppliers,
              onRemove: (v) => setSelectedSuppliers(selectedSuppliers.filter((c) => c !== v)),
              onClear: () => setSelectedSuppliers([]),
              badgeColor: 'amber',
              incompatibleValues: suppliersList.filter((o) => o.incompatible).map((o) => o.value)
            }
          ]}
          onResetAll={handleResetFilters}
          totalFilteredCount={masterFilteredProducts.length}
          totalItemCount={products.length}
          isDarkMode={isDarkMode}
        />
      </div>

      {/* 3. Export Action Bar & KPI Summary Header */}
      <div className={`p-4 rounded-2xl border ${
        isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'
      } shadow-2xs space-y-3`}>
        {/* Title & Download Options */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 dark:border-slate-700 pb-3">
          <div>
            <h2 className="font-black text-sm text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
              <FileText className="w-4 h-4 text-indigo-600" />
              {reportTitles[selectedReport]}
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Generated: {new Date().toLocaleString('en-IN')} | {sortedReportRows.length.toLocaleString('en-IN')} Records
            </p>
          </div>

          {/* Export Format Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleExportCsv}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-200 hover:bg-slate-200 text-xs font-extrabold cursor-pointer transition-all"
            >
              <FileCode className="w-3.5 h-3.5 text-teal-600" />
              <span>Export CSV</span>
            </button>

            <button
              onClick={handleExportExcel}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold shadow-xs cursor-pointer transition-all"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Export Excel (.xlsx)</span>
            </button>

            <button
              onClick={handleExportPdf}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold shadow-xs cursor-pointer transition-all"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export PDF</span>
            </button>

            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 text-white text-xs font-extrabold cursor-pointer transition-all"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Report</span>
            </button>
          </div>
        </div>

        {/* KPI Summary Block */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {kpiSummary.map((kpi, idx) => (
            <div key={idx} className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800">
              <span className="text-[10px] font-extrabold uppercase text-slate-400 block truncate">{kpi.label}</span>
              <span className="text-xs sm:text-sm font-black text-slate-900 dark:text-white mt-0.5 block truncate">
                {kpi.value}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Completed Zero Sale Floor Audits Export Section */}
      {selectedReport === 'zero_sales' && completedAudits.length > 0 && (
        <div className={`p-4 rounded-2xl border ${
          isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-emerald-50/60 border-emerald-200'
        } space-y-3`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              <h3 className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white uppercase tracking-wider">
                Completed Floor Audits ({completedAudits.length} Saved Audits Available for Download)
              </h3>
            </div>
            <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
              Frozen Audit Snapshots
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {completedAudits.map((aud) => (
              <div key={aud.id} className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 shadow-2xs">
                <div className="min-w-0 space-y-0.5">
                  <h4 className="font-bold text-xs truncate text-slate-900 dark:text-white">{aud.title}</h4>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">
                    {aud.completedAt ? new Date(aud.completedAt).toLocaleDateString('en-IN') : 'Completed'} • {aud.totalItems} items
                  </p>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    const { session, results } = await resumeSession(aud.id);
                    if (session && results) {
                      await exportZeroSaleAuditToExcel(session, results);
                    } else {
                      alert('Could not retrieve audit results.');
                    }
                  }}
                  className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shrink-0 cursor-pointer flex items-center gap-1.5 shadow-xs transition-all active:scale-95"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>Download Excel</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. Report Data Table */}
      <div className={`rounded-2xl border overflow-hidden ${
        isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'
      } shadow-2xs`}>
        {sortedReportRows.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <Info className="w-10 h-10 text-slate-300 mx-auto" />
            <h3 className="text-sm font-black text-slate-700 dark:text-slate-300">No products match these filters.</h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              Try resetting your search query, classification, or operational filters to view active inventory records.
            </p>
            <button
              onClick={handleResetFilters}
              className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 cursor-pointer"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left text-xs">
                <thead className={`text-[10px] uppercase font-black tracking-wider border-b ${
                  isDarkMode ? 'bg-slate-900/80 text-slate-300 border-slate-700' : 'bg-slate-50 text-slate-600 border-slate-200'
                }`}>
                  <tr>
                    {reportColumns.map((col) => (
                      <th
                        key={col.key}
                        onClick={() => handleSort(col.key)}
                        className={`p-2.5 cursor-pointer hover:text-indigo-600 ${
                          col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'
                        }`}
                      >
                        <div className={`flex items-center gap-1 ${col.align === 'right' ? 'justify-end' : col.align === 'center' ? 'justify-center' : 'justify-start'}`}>
                          <span>{col.header}</span>
                          <ArrowUpDown className="w-3 h-3 text-slate-400" />
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60 font-medium">
                  {sortedReportRows.slice((currentPage - 1) * pageSize, currentPage * pageSize).map((row, idx) => (
                    <tr
                      key={row.id || idx}
                      onClick={() => row.productObj && onSelectProduct(row.productObj)}
                      className={`hover:bg-indigo-50/50 dark:hover:bg-slate-700/50 transition-colors ${
                        row.productObj ? 'cursor-pointer' : ''
                      }`}
                    >
                      {reportColumns.map((col) => {
                        const val = row[col.key];
                        let content: React.ReactNode = val !== null && val !== undefined ? String(val) : '-';

                        if (col.type === 'currency' && typeof val === 'number') {
                          content = <span className="font-black text-slate-900 dark:text-white">₹{val.toLocaleString('en-IN')}</span>;
                        } else if (col.type === 'number' && typeof val === 'number') {
                          content = <span className="font-bold">{val.toLocaleString('en-IN')}</span>;
                        } else if (col.type === 'percent' && typeof val === 'number') {
                          content = <span className="font-bold text-emerald-600">{val.toFixed(1)}%</span>;
                        } else if (col.type === 'code') {
                          content = <span className="font-mono text-slate-600 dark:text-slate-300 font-bold">{val}</span>;
                        } else if (col.key === 'priorityLabel') {
                          if (val === 'CRITICAL OOS') {
                            content = <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">🔴 CRITICAL</span>;
                          } else if (val === 'HIGH PRIORITY') {
                            content = <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">🟡 HIGH</span>;
                          } else {
                            content = <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">MEDIUM</span>;
                          }
                        } else if (col.key === 'healthStatus') {
                          if (val === 'healthy') content = <span className="text-emerald-600 font-black">🟢 Healthy</span>;
                          if (val === 'attention') content = <span className="text-amber-600 font-black">🟡 Watch</span>;
                          if (val === 'risk') content = <span className="text-rose-600 font-black">🔴 Risk</span>;
                        }

                        return (
                          <td
                            key={col.key}
                            className={`p-2.5 ${
                              col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'
                            }`}
                          >
                            {content}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div className="p-3 border-t border-slate-100 dark:border-slate-700 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs font-bold text-slate-500">
              <span>
                Showing {((currentPage - 1) * pageSize) + 1} - {Math.min(currentPage * pageSize, sortedReportRows.length)} of {sortedReportRows.length} Records
              </span>
              <div className="flex items-center gap-1">
                <button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(p => p - 1)}
                  className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-30 cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="px-2">
                  Page {currentPage} of {Math.ceil(sortedReportRows.length / pageSize) || 1}
                </span>
                <button
                  disabled={currentPage >= Math.ceil(sortedReportRows.length / pageSize)}
                  onClick={() => setCurrentPage(p => p + 1)}
                  className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-30 cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Save Preset Modal */}
      {presetModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className={`w-full max-w-md p-5 rounded-2xl border ${
            isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-900'
          } space-y-4 shadow-xl`}>
            <div className="flex items-center justify-between">
              <h3 className="font-black text-sm uppercase tracking-wider flex items-center gap-2">
                <Bookmark className="w-4 h-4 text-indigo-500" />
                Save Report Preset Configuration
              </h3>
              <button onClick={() => setPresetModalOpen(false)} className="cursor-pointer text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400">
              Save current filter selections and sort settings for quick 1-click loading in future sessions.
            </p>

            <input
              type="text"
              placeholder="e.g. Weekly Dead Stock Report, Daily Low Stock..."
              value={newPresetName}
              onChange={(e) => setNewPresetName(e.target.value)}
              className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs font-bold focus:outline-none focus:border-indigo-500"
            />

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setPresetModalOpen(false)}
                className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSavePreset}
                disabled={!newPresetName.trim()}
                className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold disabled:opacity-40 cursor-pointer"
              >
                Save Preset
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
