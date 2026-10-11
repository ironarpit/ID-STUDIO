import React, { useState, useMemo } from 'react';
import {
  X,
  Tags,
  Briefcase,
  Truck,
  PieChart as PieChartIcon,
  BarChart3,
  Search,
  Download,
  ArrowUpDown,
  Maximize2,
  Package,
  Coins,
  ShoppingBag,
  Percent,
  Layers,
  ArrowRight,
  TrendingUp
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
  CartesianGrid,
  Line,
  ComposedChart
} from 'recharts';
import { Product, ComputedProductAnalytics } from '../../types';
import {
  computeCategorySummaries,
  computeBrandSummaries,
  computeSupplierSummaries
} from '../../utils/analytics';

interface DetailedDiagramsModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  analyticsMap: Map<string, ComputedProductAnalytics>;
  initialTab?: 'categories' | 'brands' | 'suppliers' | 'abc';
  onInspectProducts?: (products: Product[], title: string) => void;
  isDarkMode?: boolean;
}

type DiagramTab = 'categories' | 'brands' | 'suppliers' | 'abc';
type CategoryMetric = 'inventoryValue' | 'salesValue' | 'salesQuantity' | 'closingStock' | 'margin' | 'productCount';
type BrandMetric = 'inventoryValue' | 'salesValue' | 'salesQuantity' | 'closingStock' | 'productCount';

const CHART_COLORS = [
  '#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', 
  '#ec4899', '#3b82f6', '#14b8a6', '#06b6d4', '#84cc16', 
  '#eab308', '#f97316', '#a855f7', '#64748b'
];

export const DetailedDiagramsModal: React.FC<DetailedDiagramsModalProps> = ({
  isOpen,
  onClose,
  products,
  analyticsMap,
  initialTab = 'categories',
  onInspectProducts = (_prods: Product[], _title: string) => {},
  isDarkMode
}) => {
  const [activeTab, setActiveTab] = useState<DiagramTab>(initialTab);
  const [catMetric, setCatMetric] = useState<CategoryMetric>('inventoryValue');
  const [brandMetric, setBrandMetric] = useState<BrandMetric>('inventoryValue');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [sortBy, setSortBy] = useState<'value-desc' | 'value-asc' | 'name-asc'>('value-desc');
  const [chartViewMode, setChartViewMode] = useState<'bar' | 'pie'>('bar');

  // Sync initial tab when modal opens
  React.useEffect(() => {
    if (isOpen && initialTab) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  // Compute full datasets for all categories, brands, and suppliers
  const allCategories = useMemo(() => {
    return computeCategorySummaries(products, analyticsMap);
  }, [products, analyticsMap]);

  const allBrands = useMemo(() => {
    return computeBrandSummaries(products, analyticsMap);
  }, [products, analyticsMap]);

  const allSuppliers = useMemo(() => {
    return computeSupplierSummaries(products, analyticsMap);
  }, [products, analyticsMap]);

  // ABC Analysis distribution
  const abcDistribution = useMemo(() => {
    let aCount = 0, bCount = 0, cCount = 0;
    let aValue = 0, bValue = 0, cValue = 0;
    let aSales = 0, bSales = 0, cSales = 0;

    const safeProducts = Array.isArray(products) ? products : [];
    if (analyticsMap && typeof analyticsMap.forEach === 'function') {
      analyticsMap.forEach((v, id) => {
        const p = safeProducts.find(prod => prod && prod.id === id);
        const stock = p?.stock || 0;
        const cost = p?.costPrice || p?.retailPrice || 0;
        const invVal = stock * cost;
        const salesVal = v?.totalSalesValue || v?.salesValue || 0;

        if (v?.abcCategory === 'A') {
          aCount++;
          aValue += invVal;
          aSales += salesVal;
        } else if (v?.abcCategory === 'B') {
          bCount++;
          bValue += invVal;
          bSales += salesVal;
        } else {
          cCount++;
          cValue += invVal;
          cSales += salesVal;
        }
      });
    }

    return [
      { name: 'Class A (Top 70% Revenue)', skus: aCount, inventoryValue: aValue, salesValue: aSales, color: '#10b981' },
      { name: 'Class B (Next 20% Revenue)', skus: bCount, inventoryValue: bValue, salesValue: bSales, color: '#f59e0b' },
      { name: 'Class C (Remaining 10% Revenue)', skus: cCount, inventoryValue: cValue, salesValue: cSales, color: '#6366f1' }
    ];
  }, [products, analyticsMap]);

  // Filtered & Sorted Categories
  const filteredCategories = useMemo(() => {
    let list = [...allCategories];
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      list = list.filter(c => c.category.toLowerCase().includes(term));
    }

    list.sort((a, b) => {
      if (sortBy === 'name-asc') {
        return a.category.localeCompare(b.category);
      }
      let valA = a[catMetric] || 0;
      let valB = b[catMetric] || 0;
      if (sortBy === 'value-asc') {
        return Number(valA) - Number(valB);
      }
      return Number(valB) - Number(valA);
    });

    return list;
  }, [allCategories, searchTerm, sortBy, catMetric]);

  // Filtered & Sorted Brands
  const filteredBrands = useMemo(() => {
    let list = [...allBrands];
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      list = list.filter(b => b.brand.toLowerCase().includes(term));
    }

    list.sort((a, b) => {
      if (sortBy === 'name-asc') {
        return a.brand.localeCompare(b.brand);
      }
      let valA = a[brandMetric] || 0;
      let valB = b[brandMetric] || 0;
      if (sortBy === 'value-asc') {
        return Number(valA) - Number(valB);
      }
      return Number(valB) - Number(valA);
    });

    return list;
  }, [allBrands, searchTerm, sortBy, brandMetric]);

  // Filtered & Sorted Suppliers
  const filteredSuppliers = useMemo(() => {
    let list = [...allSuppliers];
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      list = list.filter(s => s.supplier.toLowerCase().includes(term));
    }
    list.sort((a, b) => {
      if (sortBy === 'name-asc') return a.supplier.localeCompare(b.supplier);
      if (sortBy === 'value-asc') return a.inventoryValue - b.inventoryValue;
      return b.inventoryValue - a.inventoryValue;
    });
    return list;
  }, [allSuppliers, searchTerm, sortBy]);

  const textColor = isDarkMode ? '#f1f5f9' : '#1e293b';
  const gridColor = isDarkMode ? '#334155' : '#e2e8f0';
  const tooltipStyle = {
    backgroundColor: isDarkMode ? '#0f172a' : '#ffffff',
    borderColor: isDarkMode ? '#475569' : '#cbd5e1',
    color: isDarkMode ? '#f8fafc' : '#0f172a',
    borderRadius: '12px',
    boxShadow: '0 10px 15px -3px rgba(0,0,0,0.3)',
    fontSize: '12px'
  };

  const handleInspectCategory = (categoryName: string) => {
    const matching = products.filter(p => (p.category || 'General').toLowerCase() === categoryName.toLowerCase());
    onInspectProducts(matching, `Category: ${categoryName} (${matching.length} SKUs)`);
    onClose();
  };

  const handleInspectBrand = (brandName: string) => {
    const matching = products.filter(p => (p.brand || 'Unbranded').toLowerCase() === brandName.toLowerCase());
    onInspectProducts(matching, `Brand: ${brandName} (${matching.length} SKUs)`);
    onClose();
  };

  const handleInspectSupplier = (supplierName: string) => {
    const matching = products.filter(p => (p.supplierName || 'Direct / General').toLowerCase() === supplierName.toLowerCase());
    onInspectProducts(matching, `Supplier: ${supplierName} (${matching.length} SKUs)`);
    onClose();
  };

  const handleExportCSV = () => {
    if (activeTab === 'categories') {
      const headers = ['Category', 'Product Count', 'Closing Stock', 'Inventory Value (₹)', 'Retail Value (₹)', 'Sales Quantity', 'Sales Value (₹)', 'Avg Margin %'];
      const rows = filteredCategories.map(c => [
        `"${c.category}"`,
        c.productCount || 0,
        c.closingStock || 0,
        (c.inventoryValue || 0).toFixed(2),
        (c.retailValue || 0).toFixed(2),
        c.salesQuantity || 0,
        (c.salesValue || 0).toFixed(2),
        (c.margin || 0).toFixed(1)
      ]);
      downloadCSVContent('All_Categories_Detailed_Diagram_Report.csv', headers, rows);
    } else if (activeTab === 'brands') {
      const headers = ['Brand', 'Product Count', 'Closing Stock', 'Inventory Value (₹)', 'Retail Value (₹)', 'Sales Quantity', 'Sales Value (₹)'];
      const rows = filteredBrands.map(b => [
        `"${b.brand}"`,
        b.productCount || 0,
        b.closingStock || 0,
        (b.inventoryValue || 0).toFixed(2),
        (b.retailValue || 0).toFixed(2),
        b.salesQuantity || 0,
        (b.salesValue || 0).toFixed(2)
      ]);
      downloadCSVContent('All_Brands_Detailed_Diagram_Report.csv', headers, rows);
    } else if (activeTab === 'suppliers') {
      const headers = ['Supplier', 'Product Count', 'Closing Stock', 'Inventory Value (₹)', 'Retail Value (₹)', 'Sales Quantity', 'Sales Value (₹)'];
      const rows = filteredSuppliers.map(s => [
        `"${s.supplier}"`,
        s.productCount || 0,
        s.closingStock || 0,
        (s.inventoryValue || 0).toFixed(2),
        (s.retailValue || 0).toFixed(2),
        s.salesQuantity || 0,
        (s.salesValue || 0).toFixed(2)
      ]);
      downloadCSVContent('All_Suppliers_Detailed_Diagram_Report.csv', headers, rows);
    }
  };

  const downloadCSVContent = (filename: string, headers: string[], rows: (string | number)[][]) => {
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/80 backdrop-blur-xs animate-fade-in">
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 w-full max-w-6xl h-[92vh] flex flex-col overflow-hidden">
        
        {/* Modal Header */}
        <div className="px-4 sm:px-6 pt-3.5 pb-3 bg-slate-900 dark:bg-slate-950 border-b border-slate-800 dark:border-slate-850 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1 overflow-x-auto scrollbar-none">
            {/* 1. Categories Tab */}
            <button
              onClick={() => { setActiveTab('categories'); setSearchTerm(''); }}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs sm:text-sm font-extrabold rounded-xl border transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === 'categories'
                  ? 'bg-white dark:bg-slate-900 text-indigo-950 dark:text-indigo-200 border-indigo-300 dark:border-indigo-700 shadow-md scale-[1.02]'
                  : 'bg-indigo-900/60 hover:bg-indigo-800/80 text-indigo-200 border-indigo-800/60'
              }`}
            >
              <Tags className="w-4 h-4 text-teal-400" />
              <span>All Categories Diagram ({allCategories.length})</span>
            </button>

            {/* 2. Brands Tab */}
            <button
              onClick={() => { setActiveTab('brands'); setSearchTerm(''); }}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs sm:text-sm font-extrabold rounded-xl border transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === 'brands'
                  ? 'bg-white dark:bg-slate-900 text-indigo-950 dark:text-indigo-200 border-indigo-300 dark:border-indigo-700 shadow-md scale-[1.02]'
                  : 'bg-indigo-900/60 hover:bg-indigo-800/80 text-indigo-200 border-indigo-800/60'
              }`}
            >
              <Briefcase className="w-4 h-4 text-violet-400" />
              <span>All Brands Diagram ({allBrands.length})</span>
            </button>

            {/* 3. Suppliers Tab */}
            <button
              onClick={() => { setActiveTab('suppliers'); setSearchTerm(''); }}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs sm:text-sm font-extrabold rounded-xl border transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === 'suppliers'
                  ? 'bg-white dark:bg-slate-900 text-indigo-950 dark:text-indigo-200 border-indigo-300 dark:border-indigo-700 shadow-md scale-[1.02]'
                  : 'bg-indigo-900/60 hover:bg-indigo-800/80 text-indigo-200 border-indigo-800/60'
              }`}
            >
              <Truck className="w-4 h-4 text-cyan-400" />
              <span>All Suppliers Diagram ({allSuppliers.length})</span>
            </button>

            {/* 4. ABC Analysis Tab */}
            <button
              onClick={() => { setActiveTab('abc'); setSearchTerm(''); }}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs sm:text-sm font-extrabold rounded-xl border transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === 'abc'
                  ? 'bg-white dark:bg-slate-900 text-indigo-950 dark:text-indigo-200 border-indigo-300 dark:border-indigo-700 shadow-md scale-[1.02]'
                  : 'bg-indigo-900/60 hover:bg-indigo-800/80 text-indigo-200 border-indigo-800/60'
              }`}
            >
              <PieChartIcon className="w-4 h-4 text-emerald-400" />
              <span>ABC Revenue Matrix</span>
            </button>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleExportCSV}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer"
              title="Download Data CSV"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-indigo-200 hover:text-white hover:bg-indigo-800/80 rounded-xl transition-colors cursor-pointer shrink-0"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Filter & Metric Control Sub-Bar */}
        <div className="p-3 bg-slate-50 dark:bg-slate-950/80 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2.5 shrink-0">
          {/* Left: Metric Selectors */}
          <div className="flex items-center gap-2 flex-wrap">
            {activeTab === 'categories' && (
              <div className="flex items-center gap-1.5 bg-white dark:bg-slate-900 border border-teal-200 dark:border-teal-800 rounded-xl px-2.5 py-1 text-xs shadow-2xs">
                <BarChart3 className="w-3.5 h-3.5 text-teal-600" />
                <span className="font-bold text-slate-700 dark:text-slate-200">Diagram Metric:</span>
                <select
                  value={catMetric}
                  onChange={(e) => setCatMetric(e.target.value as CategoryMetric)}
                  className="font-extrabold text-teal-900 dark:text-teal-300 bg-transparent focus:outline-none cursor-pointer text-xs"
                >
                  <option value="inventoryValue">Inventory Stock Value (₹)</option>
                  <option value="salesValue">Total Sales Revenue (₹)</option>
                  <option value="salesQuantity">Sales Volume (Units Sold)</option>
                  <option value="closingStock">Closing Stock Quantity (Units)</option>
                  <option value="margin">Gross Profit Margin (%)</option>
                  <option value="productCount">Product SKU Count</option>
                </select>
              </div>
            )}

            {activeTab === 'brands' && (
              <div className="flex items-center gap-1.5 bg-white dark:bg-slate-900 border border-violet-200 dark:border-violet-800 rounded-xl px-2.5 py-1 text-xs shadow-2xs">
                <BarChart3 className="w-3.5 h-3.5 text-violet-600" />
                <span className="font-bold text-slate-700 dark:text-slate-200">Diagram Metric:</span>
                <select
                  value={brandMetric}
                  onChange={(e) => setBrandMetric(e.target.value as BrandMetric)}
                  className="font-extrabold text-violet-900 dark:text-violet-300 bg-transparent focus:outline-none cursor-pointer text-xs"
                >
                  <option value="inventoryValue">Brand Stock Value (₹)</option>
                  <option value="salesValue">Brand Sales Revenue (₹)</option>
                  <option value="salesQuantity">Units Sold</option>
                  <option value="closingStock">Closing Stock (Units)</option>
                  <option value="productCount">SKU Count</option>
                </select>
              </div>
            )}

            {/* Sort Toggle */}
            <div className="flex items-center gap-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-2.5 py-1 text-xs shadow-2xs">
              <ArrowUpDown className="w-3.5 h-3.5 text-slate-500" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="font-semibold text-slate-700 dark:text-slate-200 bg-transparent focus:outline-none cursor-pointer text-xs"
              >
                <option value="value-desc">Highest First</option>
                <option value="value-asc">Lowest First</option>
                <option value="name-asc">Alphabetical (A - Z)</option>
              </select>
            </div>
          </div>

          {/* Right: Search Input */}
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={`Search ${activeTab}...`}
              className="w-full pl-8 pr-7 py-1 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-800 dark:text-slate-100"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-5 space-y-6">
          {/* TAB 1: ALL CATEGORIES DETAILED DIAGRAMS */}
          {activeTab === 'categories' && (
            <div className="space-y-6">
              {/* Main Expanded Chart Canvas */}
              <div className="p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 shadow-xs space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <h3 className="font-extrabold text-sm sm:text-base text-slate-900 dark:text-white flex items-center gap-2">
                      <Tags className="w-4 h-4 text-teal-600" />
                      Detailed Category Breakdown ({filteredCategories.length} Categories)
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Showing {catMetric === 'inventoryValue' ? 'Inventory Stock Value (₹)' : catMetric === 'salesValue' ? 'Sales Revenue (₹)' : catMetric === 'salesQuantity' ? 'Units Sold' : catMetric === 'margin' ? 'Gross Margin %' : 'Metric'} across all categories.
                    </p>
                  </div>
                  <span className="text-xs font-bold text-teal-600 bg-teal-50 dark:bg-teal-950/80 px-2.5 py-1 rounded-xl border border-teal-200 dark:border-teal-800">
                    Total: {catMetric.includes('Value') ? `₹${filteredCategories.reduce((acc, c) => acc + (c[catMetric] || 0), 0).toLocaleString('en-IN')}` : filteredCategories.reduce((acc, c) => acc + (c[catMetric] || 0), 0).toLocaleString('en-IN')}
                  </span>
                </div>

                <div className="h-80 sm:h-96 w-full pt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={filteredCategories}
                      margin={{ top: 20, right: 20, left: 10, bottom: filteredCategories.length > 10 ? 60 : 30 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                      <XAxis
                        dataKey="category"
                        stroke={textColor}
                        fontSize={10}
                        interval={0}
                        angle={-30}
                        textAnchor="end"
                        tick={{ fill: textColor }}
                      />
                      <YAxis
                        stroke={textColor}
                        fontSize={11}
                        tickFormatter={(val) => (val != null && !isNaN(val)) ? (catMetric.includes('Value') ? `₹${(Number(val) / 1000).toFixed(0)}k` : Number(val).toLocaleString('en-IN')) : ''}
                        tick={{ fill: textColor }}
                      />
                      <Tooltip
                        contentStyle={tooltipStyle}
                        formatter={(value: any) => [
                          catMetric.includes('Value') ? `₹${Number(value || 0).toLocaleString('en-IN')}` : catMetric === 'margin' ? `${Number(value || 0).toFixed(1)}%` : Number(value || 0).toLocaleString('en-IN'),
                          catMetric === 'inventoryValue' ? 'Inventory Value' : catMetric === 'salesValue' ? 'Sales Revenue' : catMetric === 'salesQuantity' ? 'Sales Qty' : catMetric === 'closingStock' ? 'Stock Qty' : catMetric === 'margin' ? 'Margin' : 'SKUs'
                        ]}
                      />
                      <Bar
                        dataKey={catMetric}
                        fill="#0d9488"
                        radius={[6, 6, 0, 0]}
                        onClick={(data: any) => {
                          if (data && data.category) handleInspectCategory(data.category);
                        }}
                        className="cursor-pointer hover:opacity-85"
                      >
                        {filteredCategories.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Comprehensive Category Performance Grid */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-extrabold text-sm text-slate-900 dark:text-white">
                    Category Metrics & Product Deep-Dive ({filteredCategories.length})
                  </h4>
                  <span className="text-xs text-slate-400">Click any card to inspect all products in that category</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {filteredCategories.map((cat, idx) => (
                    <div
                      key={cat.category}
                      onClick={() => handleInspectCategory(cat.category)}
                      className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-teal-500 dark:hover:border-teal-400 hover:bg-teal-50/10 dark:hover:bg-teal-950/20 transition-all cursor-pointer shadow-2xs group flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="w-5 h-5 rounded-lg bg-teal-100 dark:bg-teal-900/80 text-teal-800 dark:text-teal-200 text-[11px] font-black flex items-center justify-center shrink-0">
                              #{idx + 1}
                            </span>
                            <h5 className="font-extrabold text-xs sm:text-sm truncate text-slate-900 dark:text-white group-hover:text-teal-600 dark:group-hover:text-teal-400">
                              {cat.category}
                            </h5>
                          </div>
                          <span className="text-[11px] font-bold text-teal-600 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/80 px-2 py-0.5 rounded-lg border border-teal-200 dark:border-teal-800">
                            {cat.productCount} SKUs
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 mt-2.5 text-xs">
                          <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800">
                            <span className="text-[9px] uppercase font-bold text-slate-400 block">Stock Value</span>
                            <span className="font-black text-xs text-slate-900 dark:text-white block mt-0.5">
                              ₹{cat.inventoryValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                            </span>
                          </div>
                          <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800">
                            <span className="text-[9px] uppercase font-bold text-slate-400 block">Sales Value</span>
                            <span className="font-black text-xs text-emerald-600 dark:text-emerald-400 block mt-0.5">
                              ₹{cat.salesValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                            </span>
                          </div>
                          <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800">
                            <span className="text-[9px] uppercase font-bold text-slate-400 block">Stock Units</span>
                            <span className="font-bold text-xs text-slate-800 dark:text-slate-200 block mt-0.5">
                              {cat.closingStock.toLocaleString('en-IN')}
                            </span>
                          </div>
                          <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800">
                            <span className="text-[9px] uppercase font-bold text-slate-400 block">Gross Margin</span>
                            <span className="font-bold text-xs text-indigo-600 dark:text-indigo-400 block mt-0.5">
                              {(cat.margin || 0).toFixed(1)}%
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="pt-2 mt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-teal-600 dark:text-teal-400 font-bold">
                        <span>View All {cat.productCount} SKUs</span>
                        <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: ALL BRANDS DETAILED DIAGRAMS */}
          {activeTab === 'brands' && (
            <div className="space-y-6">
              {/* Main Expanded Chart Canvas */}
              <div className="p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 shadow-xs space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <h3 className="font-extrabold text-sm sm:text-base text-slate-900 dark:text-white flex items-center gap-2">
                      <Briefcase className="w-4 h-4 text-violet-600" />
                      Detailed Brands Breakdown ({filteredBrands.length} Brands)
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Showing {brandMetric === 'inventoryValue' ? 'Brand Stock Value (₹)' : brandMetric === 'salesValue' ? 'Brand Sales Revenue (₹)' : brandMetric === 'salesQuantity' ? 'Units Sold' : 'Stock Units'} across all brands.
                    </p>
                  </div>
                  <span className="text-xs font-bold text-violet-600 bg-violet-50 dark:bg-violet-950/80 px-2.5 py-1 rounded-xl border border-violet-200 dark:border-violet-800">
                    Total: {brandMetric.includes('Value') ? `₹${filteredBrands.reduce((acc, b) => acc + (b[brandMetric] || 0), 0).toLocaleString('en-IN')}` : filteredBrands.reduce((acc, b) => acc + (b[brandMetric] || 0), 0).toLocaleString('en-IN')}
                  </span>
                </div>

                <div className="h-80 sm:h-96 w-full pt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={filteredBrands}
                      margin={{ top: 20, right: 20, left: 10, bottom: filteredBrands.length > 10 ? 60 : 30 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                      <XAxis
                        dataKey="brand"
                        stroke={textColor}
                        fontSize={10}
                        interval={0}
                        angle={-30}
                        textAnchor="end"
                        tick={{ fill: textColor }}
                      />
                      <YAxis
                        stroke={textColor}
                        fontSize={11}
                        tickFormatter={(val) => (val != null && !isNaN(val)) ? (brandMetric.includes('Value') ? `₹${(Number(val) / 1000).toFixed(0)}k` : Number(val).toLocaleString('en-IN')) : ''}
                        tick={{ fill: textColor }}
                      />
                      <Tooltip
                        contentStyle={tooltipStyle}
                        formatter={(value: any) => [
                          brandMetric.includes('Value') ? `₹${Number(value).toLocaleString('en-IN')}` : Number(value).toLocaleString('en-IN'),
                          brandMetric === 'inventoryValue' ? 'Brand Stock Value' : brandMetric === 'salesValue' ? 'Sales Revenue' : brandMetric === 'salesQuantity' ? 'Sales Qty' : 'SKUs'
                        ]}
                      />
                      <Bar
                        dataKey={brandMetric}
                        fill="#7c3aed"
                        radius={[6, 6, 0, 0]}
                        onClick={(data: any) => {
                          if (data && data.brand) handleInspectBrand(data.brand);
                        }}
                        className="cursor-pointer hover:opacity-85"
                      >
                        {filteredBrands.map((_, index) => (
                          <Cell key={`cell-brand-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Comprehensive Brands Performance Grid */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-extrabold text-sm text-slate-900 dark:text-white">
                    Brand Metrics & Product Deep-Dive ({filteredBrands.length})
                  </h4>
                  <span className="text-xs text-slate-400">Click any card to inspect all products in that brand</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {filteredBrands.map((brand, idx) => (
                    <div
                      key={brand.brand}
                      onClick={() => handleInspectBrand(brand.brand)}
                      className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-violet-500 dark:hover:border-violet-400 hover:bg-violet-50/10 dark:hover:bg-violet-950/20 transition-all cursor-pointer shadow-2xs group flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="w-5 h-5 rounded-lg bg-violet-100 dark:bg-violet-900/80 text-violet-800 dark:text-violet-200 text-[11px] font-black flex items-center justify-center shrink-0">
                              #{idx + 1}
                            </span>
                            <h5 className="font-extrabold text-xs sm:text-sm truncate text-slate-900 dark:text-white group-hover:text-violet-600 dark:group-hover:text-violet-400">
                              {brand.brand}
                            </h5>
                          </div>
                          <span className="text-[11px] font-bold text-violet-600 dark:text-violet-300 bg-violet-50 dark:bg-violet-950/80 px-2 py-0.5 rounded-lg border border-violet-200 dark:border-violet-800">
                            {brand.productCount} SKUs
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 mt-2.5 text-xs">
                          <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800">
                            <span className="text-[9px] uppercase font-bold text-slate-400 block">Stock Value</span>
                            <span className="font-black text-xs text-slate-900 dark:text-white block mt-0.5">
                              ₹{brand.inventoryValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                            </span>
                          </div>
                          <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800">
                            <span className="text-[9px] uppercase font-bold text-slate-400 block">Sales Value</span>
                            <span className="font-black text-xs text-emerald-600 dark:text-emerald-400 block mt-0.5">
                              ₹{brand.salesValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                            </span>
                          </div>
                          <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800">
                            <span className="text-[9px] uppercase font-bold text-slate-400 block">Stock Qty</span>
                            <span className="font-bold text-xs text-slate-800 dark:text-slate-200 block mt-0.5">
                              {brand.closingStock.toLocaleString('en-IN')}
                            </span>
                          </div>
                          <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800">
                            <span className="text-[9px] uppercase font-bold text-slate-400 block">Sold Units</span>
                            <span className="font-bold text-xs text-purple-600 dark:text-purple-400 block mt-0.5">
                              {brand.salesQuantity.toLocaleString('en-IN')}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="pt-2 mt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-violet-600 dark:text-violet-400 font-bold">
                        <span>View All {brand.productCount} SKUs</span>
                        <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: ALL SUPPLIERS DETAILED DIAGRAMS */}
          {activeTab === 'suppliers' && (
            <div className="space-y-6">
              {/* Main Expanded Chart Canvas */}
              <div className="p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 shadow-xs space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <h3 className="font-extrabold text-sm sm:text-base text-slate-900 dark:text-white flex items-center gap-2">
                      <Truck className="w-4 h-4 text-cyan-600" />
                      Detailed Suppliers Breakdown ({filteredSuppliers.length} Vendors)
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Showing Vendor inventory stock value distribution across all registered suppliers.
                    </p>
                  </div>
                </div>

                <div className="h-80 sm:h-96 w-full pt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={filteredSuppliers}
                      margin={{ top: 20, right: 20, left: 10, bottom: filteredSuppliers.length > 10 ? 60 : 30 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                      <XAxis
                        dataKey="supplier"
                        stroke={textColor}
                        fontSize={10}
                        interval={0}
                        angle={-30}
                        textAnchor="end"
                        tick={{ fill: textColor }}
                      />
                      <YAxis
                        stroke={textColor}
                        fontSize={11}
                        tickFormatter={(val) => (val != null && !isNaN(val)) ? `₹${(Number(val) / 1000).toFixed(0)}k` : ''}
                        tick={{ fill: textColor }}
                      />
                      <Tooltip
                        contentStyle={tooltipStyle}
                        formatter={(value: any) => [`₹${Number(value).toLocaleString('en-IN')}`, 'Stock Value']}
                      />
                      <Bar
                        dataKey="inventoryValue"
                        fill="#0891b2"
                        radius={[6, 6, 0, 0]}
                        onClick={(data: any) => {
                          if (data && data.supplier) handleInspectSupplier(data.supplier);
                        }}
                        className="cursor-pointer hover:opacity-85"
                      >
                        {filteredSuppliers.map((_, index) => (
                          <Cell key={`cell-supplier-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Suppliers List Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {filteredSuppliers.map((sup, idx) => (
                  <div
                    key={sup.supplier}
                    onClick={() => handleInspectSupplier(sup.supplier)}
                    className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-cyan-500 hover:bg-cyan-50/10 transition-all cursor-pointer shadow-2xs group flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-5 h-5 rounded-lg bg-cyan-100 dark:bg-cyan-900/80 text-cyan-800 dark:text-cyan-200 text-[11px] font-black flex items-center justify-center shrink-0">
                            #{idx + 1}
                          </span>
                          <h5 className="font-extrabold text-xs sm:text-sm truncate text-slate-900 dark:text-white group-hover:text-cyan-600">
                            {sup.supplier}
                          </h5>
                        </div>
                        <span className="text-[11px] font-bold text-cyan-600 bg-cyan-50 dark:bg-cyan-950/80 px-2 py-0.5 rounded-lg border border-cyan-200 dark:border-cyan-800">
                          {sup.productCount} SKUs
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 mt-2.5 text-xs">
                        <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800">
                          <span className="text-[9px] uppercase font-bold text-slate-400 block">Stock Value</span>
                          <span className="font-black text-xs text-slate-900 dark:text-white block mt-0.5">
                            ₹{sup.inventoryValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                          </span>
                        </div>
                        <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800">
                          <span className="text-[9px] uppercase font-bold text-slate-400 block">Sales Value</span>
                          <span className="font-black text-xs text-emerald-600 dark:text-emerald-400 block mt-0.5">
                            ₹{sup.salesValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="pt-2 mt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-cyan-600 dark:text-cyan-400 font-bold">
                      <span>View All {sup.productCount} SKUs</span>
                      <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 4: ABC REVENUE MATRIX */}
          {activeTab === 'abc' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* ABC Pie Chart */}
                <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50">
                  <h4 className="font-extrabold text-sm text-slate-900 dark:text-white mb-3">
                    ABC SKU Share Breakdown
                  </h4>
                  <div className="h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={abcDistribution}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={95}
                          paddingAngle={5}
                          dataKey="skus"
                        >
                          {abcDistribution.map((entry, index) => (
                            <Cell key={`abc-cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={tooltipStyle}
                          formatter={(value: any) => [`${value} SKUs`, 'Product Count']}
                        />
                        <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: '11px', color: textColor }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* ABC Revenue & Capital Cards */}
                <div className="space-y-3 flex flex-col justify-center">
                  {abcDistribution.map((item) => (
                    <div
                      key={item.name}
                      className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                          <h5 className="font-extrabold text-sm text-slate-900 dark:text-white">{item.name}</h5>
                        </div>
                        <span className="font-black text-xs px-2.5 py-0.5 rounded-full" style={{ backgroundColor: `${item.color}20`, color: item.color }}>
                          {item.skus} SKUs
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-slate-100 dark:border-slate-800">
                        <div>
                          <span className="text-[10px] text-slate-400 font-bold block uppercase">Sales Value</span>
                          <span className="font-black text-sm text-emerald-600 block">
                            ₹{item.salesValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 font-bold block uppercase">Inventory Stock</span>
                          <span className="font-black text-sm text-slate-900 dark:text-white block">
                            ₹{item.inventoryValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-2.5 bg-slate-50 dark:bg-slate-950/90 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 shrink-0">
          <span>Click any category or brand to inspect its products directly.</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 font-bold rounded-xl transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
