import React, { useState, useMemo } from 'react';
import { 
  ArrowLeft, 
  Search, 
  Filter, 
  AlertCircle, 
  AlertTriangle, 
  Copy, 
  Check, 
  Download, 
  Layers, 
  ShoppingBag, 
  Calendar, 
  Tag, 
  TrendingDown, 
  Package, 
  Info, 
  Clock, 
  ArrowUpDown, 
  ExternalLink, 
  Sparkles,
  X,
  ChevronRight,
  ClipboardCheck
} from 'lucide-react';
import { FocusMaster, FocusType, Product, EvaluatedFocusProduct } from '../../types';
import { 
  evaluateFocusProductsWithLiveStock, 
  calculateFocusIQStats, 
  sortFocusIssues, 
  generateFocusWhatsAppText, 
  exportFocusIssuesToExcel 
} from '../../utils/focusMatcher';
import { FocusStartAuditModal } from './FocusStartAuditModal';

interface FocusIssuesViewProps {
  master: FocusMaster | null;
  focusType: FocusType;
  stockProducts: Product[];
  reportDays?: number | null;
  initialFilter?: 'all' | 'out_of_stock' | 'low_stock';
  onBackToHub: () => void;
  onOpenOfferMismatch?: () => void;
  onOpenFullList?: () => void;
  onOpenUploadModal: (type: FocusType) => void;
  onSelectProduct?: (product: Product) => void;
  onStartFocusAudit?: (params: {
    focusType: FocusType;
    monthDisplay: string;
    sourceTitle: string;
    items: EvaluatedFocusProduct[];
    categoryFilter?: string;
  }) => void;
  isDarkMode?: boolean;
}

export const FocusIssuesView: React.FC<FocusIssuesViewProps> = ({
  master,
  focusType,
  stockProducts,
  reportDays,
  initialFilter = 'all',
  onBackToHub,
  onOpenOfferMismatch,
  onOpenFullList,
  onOpenUploadModal,
  onSelectProduct,
  onStartFocusAudit,
  isDarkMode = false
}) => {
  const [issueFilter, setIssueFilter] = useState<'all' | 'out_of_stock' | 'low_stock'>(initialFilter);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedBrand, setSelectedBrand] = useState<string>('all');
  const [isCopied, setIsCopied] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [showStartAuditModal, setShowStartAuditModal] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);

  // Live evaluation against current Stock IQ dataset
  const evaluatedProducts: EvaluatedFocusProduct[] = useMemo(() => {
    if (!master || !master.items) return [];
    return evaluateFocusProductsWithLiveStock(master.items, stockProducts, reportDays);
  }, [master, stockProducts, reportDays]);

  // Focus IQ live stats
  const stats = useMemo(() => {
    return calculateFocusIQStats(
      evaluatedProducts,
      master?.monthDisplay || 'Current Month',
      reportDays,
      master?.uploadedAt,
      master?.fileName
    );
  }, [evaluatedProducts, master, reportDays]);

  // Extract only OUT OF STOCK and LOW STOCK products
  const allIssues = useMemo(() => {
    return evaluatedProducts.filter(p => p.status === 'OUT_OF_STOCK' || p.status === 'LOW_STOCK');
  }, [evaluatedProducts]);

  // Bidirectional linked categories (filtered by selectedBrand if active)
  const categories = useMemo(() => {
    const set = new Set<string>();
    allIssues.forEach(item => {
      if (selectedBrand !== 'all' && (item.brand || '').trim().toLowerCase() !== selectedBrand.trim().toLowerCase()) return;
      if (item.category) set.add(item.category.trim());
    });
    if (selectedCategory !== 'all' && !set.has(selectedCategory)) {
      set.add(selectedCategory);
    }
    return Array.from(set).sort();
  }, [allIssues, selectedBrand, selectedCategory]);

  // Bidirectional linked brands (filtered by selectedCategory if active)
  const brands = useMemo(() => {
    const set = new Set<string>();
    allIssues.forEach(item => {
      if (selectedCategory !== 'all' && (item.category || '').trim().toLowerCase() !== selectedCategory.trim().toLowerCase()) return;
      if (item.brand) set.add(item.brand.trim());
    });
    if (selectedBrand !== 'all' && !set.has(selectedBrand)) {
      set.add(selectedBrand);
    }
    return Array.from(set).sort();
  }, [allIssues, selectedCategory, selectedBrand]);

  const activeFiltersCount = (selectedCategory !== 'all' ? 1 : 0) + (selectedBrand !== 'all' ? 1 : 0);

  // Filtered issue list
  const filteredIssues = useMemo(() => {
    let list = allIssues.filter(item => {
      // 1. Issue status filter
      if (issueFilter === 'out_of_stock' && item.status !== 'OUT_OF_STOCK') return false;
      if (issueFilter === 'low_stock' && item.status !== 'LOW_STOCK') return false;

      // 2. Category filter
      if (selectedCategory !== 'all' && item.category !== selectedCategory) return false;

      // 3. Brand filter
      if (selectedBrand !== 'all' && item.brand !== selectedBrand) return false;

      // 4. Search query
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase().trim();
        const code = (item.code || '').toLowerCase();
        const name = (item.productName || '').toLowerCase();
        const offer = (item.focusOffer || '').toLowerCase();
        const cat = (item.category || '').toLowerCase();
        const brand = (item.brand || '').toLowerCase();

        return code.includes(q) || name.includes(q) || offer.includes(q) || cat.includes(q) || brand.includes(q);
      }

      return true;
    });

    // Default Purchase Action sort
    return sortFocusIssues(list);
  }, [allIssues, issueFilter, selectedCategory, selectedBrand, searchTerm]);

  // Copy to WhatsApp Handler
  const handleCopyWhatsApp = async () => {
    try {
      const text = generateFocusWhatsAppText(filteredIssues, focusType, issueFilter);
      await navigator.clipboard.writeText(text);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2500);
    } catch (err) {
      console.error('Failed to copy text to clipboard:', err);
    }
  };

  // Download Genuine Excel Handler
  const handleDownloadExcel = async () => {
    setIsExporting(true);
    try {
      const filterLabel = issueFilter === 'all' ? 'All_Issues' : issueFilter === 'out_of_stock' ? 'Out_Of_Stock' : 'Low_Stock';
      await exportFocusIssuesToExcel(
        filteredIssues,
        focusType,
        master?.monthDisplay || 'Current',
        filterLabel
      );
    } catch (err) {
      console.error('Failed to export Excel file:', err);
    } finally {
      setIsExporting(false);
    }
  };

  const isCore = focusType === 'core';
  const titleScope = isCore ? 'Core' : 'Non-Core';

  return (
    <div className="p-2 sm:p-4 max-w-6xl mx-auto space-y-2.5 pb-20 font-sans animate-fade-in">
      {/* 1. COMPACT CONSOLIDATED HEADER ROW */}
      <div className={`sticky top-0 z-30 px-3 py-2 rounded-2xl border backdrop-blur-md shadow-xs flex items-center justify-between gap-2 ${
        isDarkMode ? 'bg-slate-900/95 border-slate-800 text-slate-100' : 'bg-white/95 border-slate-200 text-slate-900'
      }`}>
        {/* Left: Back Button */}
        <button
          type="button"
          onClick={onBackToHub}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0 min-h-[44px] min-w-[44px] justify-center"
          title="Back to Focus IQ Hub"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="hidden xs:inline">Back</span>
        </button>

        {/* Center: Title & Subtitle */}
        <div className="flex flex-col items-center justify-center min-w-0 flex-1 px-1 text-center">
          <div className="flex items-center gap-1.5 max-w-full">
            <span className={`w-2 h-2 rounded-full ${isCore ? 'bg-indigo-500' : 'bg-teal-500'}`} />
            <h1 className="text-xs sm:text-sm font-black truncate max-w-full text-slate-900 dark:text-white leading-tight">
              {titleScope} · No/Low Stock
            </h1>
          </div>
          <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400 truncate max-w-full">
            {master?.monthDisplay || 'Current Month'} • {reportDays ? `${reportDays} Days Sales Window` : 'Live Inventory'}
          </div>
        </div>

        {/* Right: Info & Full Master Shortcut */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setShowInfo(!showInfo)}
            className={`min-h-[44px] min-w-[44px] flex items-center justify-center p-2 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
              showInfo
                ? 'bg-indigo-100 dark:bg-indigo-900/60 border-indigo-300 dark:border-indigo-700 text-indigo-800 dark:text-indigo-200'
                : isDarkMode
                ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300'
                : 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700'
            }`}
            title="Toggle Info"
          >
            <Info className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Info Help Collapsible */}
      {showInfo && (
        <div className={`p-3 rounded-2xl border text-xs space-y-1.5 animate-fade-in ${
          isDarkMode ? 'bg-slate-900 border-slate-800 text-slate-300' : 'bg-indigo-50/70 border-indigo-200 text-slate-700'
        }`}>
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              <Info className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span>Priority & Classification</span>
            </h3>
            <button
              type="button"
              onClick={() => setShowInfo(false)}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="leading-relaxed text-[11px]">
            <strong>🔴 Out of Stock:</strong> Closing Stock ≤ 0. Highest purchase action priority.<br />
            <strong>🟠 Low Stock:</strong> Stock Cover ≤ 7 Days based on recent sales rate.<br />
            Sorted by Out of Stock → Lowest Cover Days → Higher Sales.
          </p>
          {onOpenFullList && (
            <div className="pt-1">
              <button
                type="button"
                onClick={onOpenFullList}
                className="text-indigo-600 dark:text-indigo-400 hover:underline font-bold text-xs flex items-center gap-1"
              >
                <span>View Full {titleScope} Master ({stats.totalProducts} items)</span>
                <ExternalLink className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* 2. COMPACT ACTION BUTTONS ROW */}
      <div className="grid grid-cols-3 gap-2">
        {onStartFocusAudit && (
          <button
            type="button"
            onClick={() => setShowStartAuditModal(true)}
            disabled={filteredIssues.length === 0}
            className={`min-h-[44px] px-2 py-2 rounded-xl font-bold text-xs shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40 active:scale-95 ${
              isCore
                ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                : 'bg-teal-600 hover:bg-teal-700 text-white'
            }`}
            title="Start a physical floor audit for filtered stock issues"
          >
            <ClipboardCheck className="w-4 h-4 shrink-0" />
            <span className="truncate">Start Audit ({filteredIssues.length})</span>
          </button>
        )}

        <button
          type="button"
          onClick={handleCopyWhatsApp}
          disabled={filteredIssues.length === 0}
          className={`min-h-[44px] px-2 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-40 active:scale-95 ${
            isCopied
              ? 'bg-emerald-700 text-white'
              : 'bg-emerald-600 hover:bg-emerald-700 text-white'
          }`}
          title="Copy formatted text for WhatsApp"
        >
          {isCopied ? <Check className="w-4 h-4 shrink-0" /> : <Copy className="w-4 h-4 shrink-0" />}
          <span className="truncate">{isCopied ? 'Copied!' : 'Copy WhatsApp'}</span>
        </button>

        <button
          type="button"
          onClick={handleDownloadExcel}
          disabled={filteredIssues.length === 0 || isExporting}
          className="min-h-[44px] px-2 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-xs font-bold shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-95"
          title="Download Excel spreadsheet"
        >
          <Download className="w-4 h-4 shrink-0" />
          <span className="truncate">{isExporting ? 'Exporting...' : 'Excel'}</span>
        </button>
      </div>

      {/* 3. COMPACT SUMMARY STRIP */}
      <div className="grid grid-cols-4 gap-1.5">
        <button
          type="button"
          onClick={() => setIssueFilter('all')}
          className={`p-2 rounded-xl border text-center transition-all cursor-pointer ${
            issueFilter === 'all'
              ? 'ring-2 ring-indigo-500 bg-indigo-50 dark:bg-indigo-950/60 border-indigo-300 dark:border-indigo-800 shadow-2xs'
              : isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
          }`}
        >
          <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold block truncate">Total Issues</span>
          <span className="font-mono text-xs sm:text-sm font-black text-slate-900 dark:text-white block mt-0.5">
            {stats.outOfStockCount + stats.lowStockCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setIssueFilter('out_of_stock')}
          className={`p-2 rounded-xl border text-center transition-all cursor-pointer ${
            issueFilter === 'out_of_stock'
              ? 'ring-2 ring-rose-500 bg-rose-50 dark:bg-rose-950/60 border-rose-300 dark:border-rose-800 shadow-2xs'
              : isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
          }`}
        >
          <span className="text-[10px] text-rose-600 dark:text-rose-400 font-bold block truncate">Out of Stock</span>
          <span className="font-mono text-xs sm:text-sm font-black text-rose-600 dark:text-rose-400 block mt-0.5">
            {stats.outOfStockCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setIssueFilter('low_stock')}
          className={`p-2 rounded-xl border text-center transition-all cursor-pointer ${
            issueFilter === 'low_stock'
              ? 'ring-2 ring-amber-500 bg-amber-50 dark:bg-amber-950/60 border-amber-300 dark:border-amber-800 shadow-2xs'
              : isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
          }`}
        >
          <span className="text-[10px] text-amber-600 dark:text-amber-400 font-bold block truncate">Low Stock</span>
          <span className="font-mono text-xs sm:text-sm font-black text-amber-600 dark:text-amber-400 block mt-0.5">
            {stats.lowStockCount}
          </span>
        </button>

        <div className={`p-2 rounded-xl border text-center ${
          isDarkMode ? 'bg-slate-900/60 border-slate-800' : 'bg-slate-50 border-slate-200'
        }`}>
          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold block truncate">Available</span>
          <span className="font-mono text-xs sm:text-sm font-black text-emerald-600 dark:text-emerald-400 block mt-0.5">
            {stats.availableCount}
          </span>
        </div>
      </div>

      {/* 4. SEARCH & FILTER DRAWER BAR */}
      <div className={`p-2.5 rounded-2xl border space-y-2 ${
        isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-2xs'
      }`}>
        <div className="flex items-center gap-2">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search product name, code, offer..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`w-full pl-9 pr-7 py-2 text-xs rounded-xl border focus:outline-hidden min-h-[44px] font-medium transition-all ${
                isDarkMode 
                  ? 'bg-slate-800 border-slate-700 text-white placeholder-slate-500 focus:border-indigo-500' 
                  : 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400 focus:border-indigo-500'
              }`}
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Filters Toggle Button */}
          <button
            type="button"
            onClick={() => setIsFiltersOpen(!isFiltersOpen)}
            className={`min-h-[44px] px-3 py-2 rounded-xl border text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
              activeFiltersCount > 0
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                : isDarkMode
                ? 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
                : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
            }`}
            title="Open Category & Brand Filters"
          >
            <Filter className="w-3.5 h-3.5" />
            <span className="hidden xs:inline">Filters</span>
            {activeFiltersCount > 0 && (
              <span className="px-1.5 py-0.2 text-[10px] font-black rounded-full bg-white text-indigo-700">
                {activeFiltersCount}
              </span>
            )}
          </button>
        </div>

        {/* Collapsible Filter Drawer */}
        {isFiltersOpen && (
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-2 animate-fade-in">
            {categories.length > 0 && (
              <div>
                <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                  Category ({categories.length})
                </label>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className={`w-full px-3 py-2 text-xs rounded-xl border min-h-[40px] font-medium ${
                    isDarkMode 
                      ? 'bg-slate-800 border-slate-700 text-white' 
                      : 'bg-slate-50 border-slate-200 text-slate-900'
                  }`}
                >
                  <option value="all">All Categories ({categories.length})</option>
                  {categories.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            )}

            {brands.length > 0 && (
              <div>
                <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                  Brand ({brands.length})
                </label>
                <select
                  value={selectedBrand}
                  onChange={(e) => setSelectedBrand(e.target.value)}
                  className={`w-full px-3 py-2 text-xs rounded-xl border min-h-[40px] font-medium ${
                    isDarkMode 
                      ? 'bg-slate-800 border-slate-700 text-white' 
                      : 'bg-slate-50 border-slate-200 text-slate-900'
                  }`}
                >
                  <option value="all">All Brands ({brands.length})</option>
                  {brands.map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </div>
            )}

            {activeFiltersCount > 0 && (
              <div className="sm:col-span-2 flex justify-end pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCategory('all');
                    setSelectedBrand('all');
                  }}
                  className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  Reset Filters
                </button>
              </div>
            )}
          </div>
        )}

        {/* Filtered Count indicator */}
        <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 px-0.5">
          <span>
            Showing <strong>{filteredIssues.length}</strong> items with stock issues
          </span>
          {onOpenOfferMismatch && (
            <button
              type="button"
              onClick={onOpenOfferMismatch}
              className="text-indigo-600 dark:text-indigo-400 font-bold hover:underline flex items-center gap-1"
            >
              <Tag className="w-3 h-3" />
              <span>Offer Review</span>
            </button>
          )}
        </div>
      </div>

      {/* 5. PRODUCT LIST: RESPONSIVE CARDS (MOBILE < 640px) + TABLE (DESKTOP >= 640px) */}
      {filteredIssues.length === 0 ? (
        <div className={`p-8 text-center rounded-2xl border ${
          isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
        }`}>
          <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto mb-2">
            <Sparkles className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            No Stock Issues Found
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
            {searchTerm || selectedCategory !== 'all' || selectedBrand !== 'all'
              ? 'No products match your search or filters.'
              : 'All focus items in this master list have healthy inventory levels.'}
          </p>
        </div>
      ) : (
        <>
          {/* MOBILE VIEW: Compact Product Cards (Visible on screens < 640px) */}
          <div className="block sm:hidden space-y-2">
            {filteredIssues.map((item, idx) => {
              const isOOS = item.status === 'OUT_OF_STOCK';

              return (
                <div
                  key={item.code + '-' + idx}
                  onClick={() => item.stockProduct && onSelectProduct && onSelectProduct(item.stockProduct)}
                  className={`p-3 rounded-2xl border transition-all flex flex-col gap-2 ${
                    item.stockProduct && onSelectProduct ? 'cursor-pointer active:scale-[0.99]' : ''
                  } ${
                    isOOS
                      ? isDarkMode ? 'bg-rose-950/20 border-rose-900/60' : 'bg-rose-50/50 border-rose-200'
                      : isDarkMode ? 'bg-amber-950/15 border-amber-900/50' : 'bg-amber-50/40 border-amber-200'
                  }`}
                >
                  {/* Card Header: Code, Category, Brand & Status Badge */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-mono font-bold text-[11px] px-2 py-0.5 rounded-md bg-white dark:bg-slate-800 text-indigo-700 dark:text-indigo-400 border border-slate-200 dark:border-slate-700">
                          {item.code}
                        </span>
                        {item.category && (
                          <span className="text-[10.5px] font-semibold text-slate-600 dark:text-slate-400">
                            {item.category}
                          </span>
                        )}
                        {item.brand && (
                          <span className="text-[10px] text-slate-400">
                            • {item.brand}
                          </span>
                        )}
                      </div>

                      {/* Full Product Name (wraps without clipping) */}
                      <h3 className="font-bold text-xs leading-snug text-slate-900 dark:text-white break-words">
                        {item.productName}
                      </h3>
                    </div>

                    {/* Status Badge */}
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black shrink-0 uppercase border ${
                      isOOS
                        ? 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950 dark:text-rose-200 dark:border-rose-800'
                        : 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-800'
                    }`}>
                      {isOOS ? '🔴 Out of Stock' : '🟠 Low Stock'}
                    </span>
                  </div>

                  {/* Focus Offer Badge if available */}
                  {item.focusOffer && (
                    <div className="text-[11px] font-bold text-amber-900 dark:text-amber-200 bg-amber-100/80 dark:bg-amber-950/80 px-2 py-1 rounded-lg border border-amber-200 dark:border-amber-800 truncate">
                      Offer: {item.focusOffer}
                    </div>
                  )}

                  {/* Compact Metrics Grid: Closing, Sales, Cover, MRP/SP */}
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 p-2 rounded-xl bg-white/80 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 font-mono text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 dark:text-slate-400 font-sans text-[11px]">Closing:</span>
                      <strong className={`font-black ${isOOS ? 'text-rose-600 dark:text-rose-400' : 'text-amber-600 dark:text-amber-400'}`}>
                        {item.stockQty.toLocaleString()}
                      </strong>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 dark:text-slate-400 font-sans text-[11px]">Sales:</span>
                      <strong className="text-slate-800 dark:text-slate-200 font-bold">
                        {item.salesQty.toLocaleString()}
                      </strong>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 dark:text-slate-400 font-sans text-[11px]">Cover:</span>
                      <strong className="font-bold text-slate-800 dark:text-slate-200">
                        {isOOS ? '0 Days' : item.stockCoverDays !== null ? `${Number(item.stockCoverDays.toFixed(1))} Days` : '—'}
                      </strong>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 dark:text-slate-400 font-sans text-[11px]">MRP / SP:</span>
                      <strong className="text-slate-800 dark:text-slate-200 font-bold">
                        ₹{item.mrp || 0} / ₹{item.retailPrice || 0}
                      </strong>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* DESKTOP VIEW: Full Data Table (Visible on screens >= 640px) */}
          <div className={`hidden sm:block rounded-2xl border overflow-hidden ${
            isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-xs'
          }`}>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className={`border-b text-[11px] font-bold uppercase tracking-wider ${
                    isDarkMode 
                      ? 'bg-slate-800/80 border-slate-700/80 text-slate-300' 
                      : 'bg-slate-50 border-slate-200 text-slate-600'
                  }`}>
                    <th className="py-3 px-3 w-10 text-center">#</th>
                    <th className="py-3 px-3 w-28">Status</th>
                    <th className="py-3 px-3 w-28 font-mono">CODE</th>
                    <th className="py-3 px-3 min-w-[200px]">Product Name</th>
                    <th className="py-3 px-3 min-w-[140px]">Focus Offer</th>
                    <th className="py-3 px-3 text-right">Sales</th>
                    <th className="py-3 px-3 text-right">Closing</th>
                    <th className="py-3 px-3 text-right">Cover</th>
                    <th className="py-3 px-3 text-right">MRP</th>
                    <th className="py-3 px-3 text-right">SP</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredIssues.map((item, idx) => {
                    const isOOS = item.status === 'OUT_OF_STOCK';
                    const isLow = item.status === 'LOW_STOCK';

                    return (
                      <tr 
                        key={item.code + '-' + idx}
                        onClick={() => item.stockProduct && onSelectProduct && onSelectProduct(item.stockProduct)}
                        className={`transition-colors ${
                          item.stockProduct && onSelectProduct ? 'cursor-pointer' : ''
                        } ${
                          isOOS
                            ? isDarkMode 
                              ? 'bg-rose-950/10 hover:bg-rose-950/20' 
                              : 'bg-rose-50/40 hover:bg-rose-50/70'
                            : isDarkMode 
                              ? 'hover:bg-slate-800/50' 
                              : 'hover:bg-amber-50/30'
                        }`}
                      >
                        {/* # */}
                        <td className="py-3 px-3 text-center text-slate-400 font-mono text-[11px]">
                          {idx + 1}
                        </td>

                        {/* Status */}
                        <td className="py-3 px-3 whitespace-nowrap">
                          {isOOS ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-800">
                              <span>🔴</span>
                              <span>OUT OF STOCK</span>
                            </span>
                          ) : isLow ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                              <span>🟠</span>
                              <span>LOW STOCK</span>
                            </span>
                          ) : null}
                        </td>

                        {/* CODE */}
                        <td className="py-3 px-3 whitespace-nowrap">
                          <span className="font-mono font-extrabold text-xs bg-slate-100 dark:bg-slate-800 text-indigo-700 dark:text-indigo-400 px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 inline-block">
                            {item.code}
                          </span>
                        </td>

                        {/* Product Name */}
                        <td className="py-3 px-3">
                          <div className="space-y-0.5">
                            <p className="font-bold text-slate-900 dark:text-white leading-snug">
                              {item.productName}
                            </p>
                            <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                              {item.brand && (
                                <span className="font-medium text-slate-600 dark:text-slate-300">
                                  {item.brand}
                                </span>
                              )}
                              {item.category && <span>• {item.category}</span>}
                            </div>
                          </div>
                        </td>

                        {/* Focus Offer */}
                        <td className="py-3 px-3">
                          {item.focusOffer ? (
                            <span className="inline-block text-[11px] font-bold text-amber-900 dark:text-amber-200 bg-amber-100 dark:bg-amber-950/80 px-2 py-0.5 rounded-lg border border-amber-300 dark:border-amber-700 max-w-[180px] truncate" title={item.focusOffer}>
                              {item.focusOffer}
                            </span>
                          ) : (
                            <span className="text-slate-400 italic text-[11px]">—</span>
                          )}
                        </td>

                        {/* Sales */}
                        <td className="py-3 px-3 text-right font-mono font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                          {item.salesQty.toLocaleString()}
                        </td>

                        {/* Closing */}
                        <td className="py-3 px-3 text-right whitespace-nowrap">
                          <span className={`font-mono font-black text-xs px-2 py-0.5 rounded-md ${
                            isOOS
                              ? 'text-rose-700 dark:text-rose-300 bg-rose-100 dark:bg-rose-950/80'
                              : 'text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/80'
                          }`}>
                            {item.stockQty.toLocaleString()}
                          </span>
                        </td>

                        {/* Cover Days */}
                        <td className="py-3 px-3 text-right whitespace-nowrap">
                          {isOOS ? (
                            <span className="text-rose-600 dark:text-rose-400 font-bold font-mono">
                              0 Days
                            </span>
                          ) : item.stockCoverDays !== null ? (
                            <span className="text-amber-700 dark:text-amber-300 font-bold font-mono bg-amber-50 dark:bg-amber-950/50 px-1.5 py-0.5 rounded border border-amber-200 dark:border-amber-800">
                              {Number(item.stockCoverDays.toFixed(1))} Days
                            </span>
                          ) : (
                            <span className="text-slate-400 font-mono">—</span>
                          )}
                        </td>

                        {/* MRP */}
                        <td className="py-3 px-3 text-right font-mono text-slate-700 dark:text-slate-300 whitespace-nowrap">
                          ₹{item.mrp ? item.mrp.toFixed(2) : '0.00'}
                        </td>

                        {/* Retail */}
                        <td className="py-3 px-3 text-right font-mono font-bold text-slate-900 dark:text-white whitespace-nowrap">
                          ₹{item.retailPrice ? item.retailPrice.toFixed(2) : '0.00'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Start Focus Audit Confirmation Modal */}
      <FocusStartAuditModal
        isOpen={showStartAuditModal}
        focusType={focusType}
        monthDisplay={master?.monthDisplay || 'Current Month'}
        sourceTitle={focusType === 'core' ? 'Core No / Low Stock' : 'Non-Core No / Low Stock'}
        productCount={filteredIssues.length}
        onClose={() => setShowStartAuditModal(false)}
        onConfirm={() => {
          setShowStartAuditModal(false);
          onStartFocusAudit?.({
            focusType,
            monthDisplay: master?.monthDisplay || 'Current Month',
            sourceTitle: focusType === 'core' ? 'Core No / Low Stock' : 'Non-Core No / Low Stock',
            items: filteredIssues,
            categoryFilter: selectedCategory !== 'all' ? selectedCategory : undefined
          });
        }}
        isDarkMode={isDarkMode}
      />
    </div>
  );
};
