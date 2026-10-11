import React, { useState, useMemo } from 'react';
import { 
  ArrowLeft, 
  Search, 
  Filter, 
  Copy, 
  Check, 
  Download, 
  Tag, 
  AlertTriangle, 
  CheckCircle2, 
  AlertCircle, 
  HelpCircle, 
  TrendingDown, 
  ShoppingBag, 
  Layers, 
  Sparkles, 
  ExternalLink,
  ShieldAlert,
  Info
} from 'lucide-react';
import { FocusMaster, FocusType, Product, EvaluatedFocusOfferProduct, FocusOfferStatus } from '../../types';
import { 
  evaluateFocusOfferProducts, 
  calculateFocusOfferStats, 
  generateFocusOfferWhatsAppText, 
  exportFocusOfferToExcel,
  formatCleanOfferBadge 
} from '../../utils/focusMatcher';
import { FocusStartAuditModal } from './FocusStartAuditModal';
import { ClipboardCheck } from 'lucide-react';

interface FocusOfferMismatchViewProps {
  master: FocusMaster | null;
  focusType: FocusType;
  stockProducts: Product[];
  initialFilter?: 'mismatch' | 'all' | 'mrp_changed' | 'manual_check' | 'unrecognized' | 'below_cost';
  onBackToHub: () => void;
  onOpenIssuesView?: () => void;
  onOpenFullList?: () => void;
  onOpenUploadModal: (type: FocusType) => void;
  onSelectProduct?: (product: Product) => void;
  onStartFocusAudit?: (params: {
    focusType: FocusType;
    monthDisplay: string;
    sourceTitle: string;
    items: any[];
    categoryFilter?: string;
  }) => void;
  isDarkMode?: boolean;
}

export const FocusOfferMismatchView: React.FC<FocusOfferMismatchViewProps> = ({
  master,
  focusType,
  stockProducts,
  initialFilter = 'mismatch',
  onBackToHub,
  onOpenIssuesView,
  onOpenFullList,
  onOpenUploadModal,
  onSelectProduct,
  onStartFocusAudit,
  isDarkMode = false
}) => {
  const [filterType, setFilterType] = useState<'mismatch' | 'all' | 'mrp_changed' | 'manual_check' | 'unrecognized' | 'below_cost'>(initialFilter);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [isCopied, setIsCopied] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [showStartAuditModal, setShowStartAuditModal] = useState(false);

  // Compute live evaluated offers using current active Stock IQ dataset
  const evaluatedProducts: EvaluatedFocusOfferProduct[] = useMemo(() => {
    if (!master || !master.items) return [];
    return evaluateFocusOfferProducts(master.items, stockProducts);
  }, [master, stockProducts]);

  // Compute live Stage 3 summary stats
  const stats = useMemo(() => {
    return calculateFocusOfferStats(
      evaluatedProducts,
      master?.monthDisplay || 'Current Month',
      master?.uploadedAt,
      master?.fileName
    );
  }, [evaluatedProducts, master]);

  // Categories list for dropdown
  const categories = useMemo(() => {
    const set = new Set<string>();
    evaluatedProducts.forEach(item => {
      if (item.category) set.add(item.category);
    });
    return Array.from(set).sort();
  }, [evaluatedProducts]);

  // Filter items based on active tabs, category, and search query
  const filteredItems = useMemo(() => {
    return evaluatedProducts.filter(item => {
      // 1. Status Filter
      if (filterType === 'mismatch') {
        if (item.offerStatus !== 'MISMATCH') return false;
      } else if (filterType === 'mrp_changed') {
        if (!item.isMrpChanged) return false;
      } else if (filterType === 'manual_check') {
        if (item.offerStatus !== 'MANUAL_CHECK') return false;
      } else if (filterType === 'unrecognized') {
        if (item.offerStatus !== 'UNRECOGNIZED') return false;
      } else if (filterType === 'below_cost') {
        if (!item.isBelowCost) return false;
      }
      // 'all' passes all items

      // 2. Category Filter
      if (selectedCategory !== 'all' && item.category !== selectedCategory) {
        return false;
      }

      // 3. Search query
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase().trim();
        const code = (item.code || '').toLowerCase();
        const name = (item.productName || '').toLowerCase();
        const cat = (item.category || '').toLowerCase();
        const offer = (item.focusOffer || '').toLowerCase();
        return code.includes(q) || name.includes(q) || cat.includes(q) || offer.includes(q);
      }

      return true;
    });
  }, [evaluatedProducts, filterType, selectedCategory, searchTerm]);

  // Handle WhatsApp copy
  const handleCopyWhatsApp = async () => {
    const filterLabelMap = {
      mismatch: 'Offer Mismatch',
      all: 'All Review Items',
      mrp_changed: 'MRP Changed',
      manual_check: 'Multi-Buy Manual Check',
      unrecognized: 'Unrecognized Offers',
      below_cost: 'Below Cost Items'
    };
    const filterLabel = filterLabelMap[filterType] || 'Offer Mismatch';
    const text = generateFocusOfferWhatsAppText(filteredItems, focusType, filterLabel);

    try {
      await navigator.clipboard.writeText(text);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 3000);
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
    }
  };

  // Handle Excel Export
  const handleExportExcel = async () => {
    try {
      setIsExporting(true);
      const filterLabelMap = {
        mismatch: 'Offer_Mismatch',
        all: 'All_Offers_Review',
        mrp_changed: 'MRP_Changed',
        manual_check: 'Multi_Buy_Check',
        unrecognized: 'Unrecognized_Offers',
        below_cost: 'Below_Cost'
      };
      const filterLabel = filterLabelMap[filterType] || 'Offer_Review';
      await exportFocusOfferToExcel(filteredItems, focusType, master?.monthDisplay || 'Current_Month', filterLabel);
    } catch (err) {
      console.error('Failed to export Excel:', err);
    } finally {
      setIsExporting(false);
    }
  };

  const titlePrefix = focusType === 'core' ? 'CORE FOCUS' : 'NON-CORE FOCUS';

  return (
    <div className="space-y-3 pb-16 max-w-6xl mx-auto p-2 sm:p-4">
      {/* 1. COMPACT STICKY HEADER */}
      <div className={`sticky top-0 z-30 px-3 py-2 rounded-2xl border backdrop-blur-md shadow-xs flex items-center justify-between gap-2 ${
        isDarkMode ? 'bg-slate-900/95 border-slate-800 text-slate-100' : 'bg-white/95 border-slate-200 text-slate-900'
      }`}>
        {/* Left: Back */}
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
            <span className={`w-2 h-2 rounded-full ${focusType === 'core' ? 'bg-indigo-500' : 'bg-teal-500'}`} />
            <h1 className="text-xs sm:text-sm font-black truncate max-w-full text-slate-900 dark:text-white leading-tight">
              {focusType === 'core' ? 'Core' : 'Non-Core'} · Offer Review
            </h1>
          </div>
          <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400 truncate max-w-full">
            {master?.monthDisplay || 'Current Month'} • Pricing & Offers Validation
          </div>
        </div>

        {/* Right: Issues Link */}
        {onOpenIssuesView && (
          <button
            type="button"
            onClick={onOpenIssuesView}
            className={`min-h-[44px] px-2.5 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer flex items-center gap-1 shrink-0 ${
              isDarkMode ? 'bg-slate-800 border-slate-700 text-rose-400' : 'bg-rose-50 border-rose-200 text-rose-700'
            }`}
            title="Go to No/Low Stock Issues"
          >
            <AlertCircle className="w-3.5 h-3.5" />
            <span className="hidden xs:inline">No/Low Stock</span>
          </button>
        )}
      </div>

      {/* 2. COMPACT ACTION BUTTONS ROW */}
      <div className="grid grid-cols-3 gap-2">
        {onStartFocusAudit && (
          <button
            type="button"
            onClick={() => setShowStartAuditModal(true)}
            disabled={filteredItems.length === 0}
            className={`min-h-[44px] px-2 py-2 rounded-xl font-bold text-xs shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40 active:scale-95 ${
              focusType === 'core'
                ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                : 'bg-teal-600 hover:bg-teal-700 text-white'
            }`}
            title="Start physical audit for filtered offers"
          >
            <ClipboardCheck className="w-4 h-4 shrink-0" />
            <span className="truncate">Start Audit ({filteredItems.length})</span>
          </button>
        )}

        <button
          type="button"
          onClick={handleCopyWhatsApp}
          disabled={filteredItems.length === 0}
          className={`min-h-[44px] px-2 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-40 active:scale-95 ${
            isCopied 
              ? 'bg-emerald-700 text-white' 
              : 'bg-emerald-600 hover:bg-emerald-700 text-white'
          }`}
        >
          {isCopied ? <Check className="w-4 h-4 shrink-0" /> : <Copy className="w-4 h-4 shrink-0" />}
          <span className="truncate">{isCopied ? 'Copied!' : 'Copy WhatsApp'}</span>
        </button>

        <button
          type="button"
          onClick={handleExportExcel}
          disabled={filteredItems.length === 0 || isExporting}
          className="min-h-[44px] px-2 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs disabled:opacity-40 active:scale-95"
        >
          <Download className="w-4 h-4 shrink-0" />
          <span className="truncate">{isExporting ? 'Exporting...' : 'Excel'}</span>
        </button>
      </div>

      {/* Live Stage 3 Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {/* Mismatch Card (Default & Most Important) */}
          <button
            onClick={() => setFilterType('mismatch')}
            className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
              filterType === 'mismatch'
                ? 'ring-2 ring-rose-500 bg-rose-50 dark:bg-rose-950/50 border-rose-300 dark:border-rose-800'
                : isDarkMode ? 'bg-slate-800/60 border-slate-700 hover:bg-slate-800' : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold text-rose-700 dark:text-rose-400">Offer Mismatch</span>
              <span className="text-xs">🔴</span>
            </div>
            <span className="text-xl font-black text-rose-700 dark:text-rose-300 block mt-1">
              {stats.mismatchCount}
            </span>
            <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400">Diff &gt; ₹0.50</span>
          </button>

          {/* Correct Card */}
          <div
            className={`p-3 rounded-xl border text-left ${
              isDarkMode ? 'bg-emerald-950/20 border-emerald-900/40' : 'bg-emerald-50/60 border-emerald-200'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold text-emerald-700 dark:text-emerald-400">Offer Correct</span>
              <span className="text-xs">🟢</span>
            </div>
            <span className="text-xl font-black text-emerald-700 dark:text-emerald-300 block mt-1">
              {stats.correctCount}
            </span>
            <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">Retail Matches</span>
          </div>

          {/* MRP Changed Card */}
          <button
            onClick={() => setFilterType('mrp_changed')}
            className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
              filterType === 'mrp_changed'
                ? 'ring-2 ring-amber-500 bg-amber-50 dark:bg-amber-950/50 border-amber-300 dark:border-amber-800'
                : isDarkMode ? 'bg-slate-800/60 border-slate-700 hover:bg-slate-800' : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold text-amber-700 dark:text-amber-400">MRP Changed</span>
              <span className="text-xs">⚠️</span>
            </div>
            <span className="text-xl font-black text-amber-700 dark:text-amber-300 block mt-1">
              {stats.mrpChangedCount}
            </span>
            <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400">POS MRP Shift</span>
          </button>

          {/* Manual Check Card */}
          <button
            onClick={() => setFilterType('manual_check')}
            className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
              filterType === 'manual_check'
                ? 'ring-2 ring-indigo-500 bg-indigo-50 dark:bg-indigo-950/50 border-indigo-300 dark:border-indigo-800'
                : isDarkMode ? 'bg-slate-800/60 border-slate-700 hover:bg-slate-800' : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold text-indigo-700 dark:text-indigo-400">Manual Check</span>
              <span className="text-xs">🤝</span>
            </div>
            <span className="text-xl font-black text-indigo-700 dark:text-indigo-300 block mt-1">
              {stats.manualCheckCount}
            </span>
            <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400">Ambiguous Schemes</span>
          </button>

          {/* Below Cost Warning Card */}
          <button
            onClick={() => setFilterType('below_cost')}
            className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
              filterType === 'below_cost'
                ? 'ring-2 ring-rose-500 bg-rose-50 dark:bg-rose-950/50 border-rose-300 dark:border-rose-800'
                : isDarkMode ? 'bg-slate-800/60 border-slate-700 hover:bg-slate-800' : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold text-rose-700 dark:text-rose-400">Below Cost</span>
              <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
            </div>
            <span className="text-xl font-black text-rose-700 dark:text-rose-300 block mt-1">
              {stats.belowCostCount}
            </span>
            <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400">Expected &lt; Cost</span>
          </button>

          {/* All Review Items */}
          <button
            onClick={() => setFilterType('all')}
            className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
              filterType === 'all'
                ? 'ring-2 ring-slate-500 bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-600'
                : isDarkMode ? 'bg-slate-800/60 border-slate-700 hover:bg-slate-800' : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">All Items</span>
              <span className="text-xs">📋</span>
            </div>
            <span className="text-xl font-black text-slate-900 dark:text-white block mt-1">
              {stats.totalProducts}
            </span>
            <span className="text-[10px] text-slate-400 font-medium">100% Focus Master</span>
          </button>
        </div>

      {/* Filter and Search Controls */}
      <div className={`p-4 rounded-2xl border shadow-xs transition-colors space-y-3 ${
        isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
      }`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Status Filter Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
            <button
              onClick={() => setFilterType('mismatch')}
              className={`px-3 py-1.5 rounded-lg text-xs font-black whitespace-nowrap transition-all cursor-pointer ${
                filterType === 'mismatch'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              Mismatch ({stats.mismatchCount})
            </button>

            <button
              onClick={() => setFilterType('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                filterType === 'all'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              All Review Items ({stats.totalProducts})
            </button>

            <button
              onClick={() => setFilterType('mrp_changed')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                filterType === 'mrp_changed'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              MRP Changed ({stats.mrpChangedCount})
            </button>

            <button
              onClick={() => setFilterType('manual_check')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                filterType === 'manual_check'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              Manual Check ({stats.manualCheckCount})
            </button>

            <button
              onClick={() => setFilterType('below_cost')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                filterType === 'below_cost'
                  ? 'bg-rose-700 text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              Below Cost ({stats.belowCostCount})
            </button>

            <button
              onClick={() => setFilterType('unrecognized')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                filterType === 'unrecognized'
                  ? 'bg-slate-700 text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              Unrecognized ({stats.unrecognizedCount})
            </button>
          </div>

          {/* Category Dropdown Filter */}
          {categories.length > 0 && (
            <div className="flex items-center gap-1.5 shrink-0">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className={`text-xs font-semibold py-1.5 px-2.5 rounded-lg border cursor-pointer outline-hidden ${
                  isDarkMode 
                    ? 'bg-slate-800 border-slate-700 text-slate-200' 
                    : 'bg-white border-slate-200 text-slate-700'
                }`}
              >
                <option value="all">All Categories ({categories.length})</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by product name, 9-digit code, category, or offer text..."
            className={`w-full pl-9 pr-4 py-2 rounded-xl text-xs border outline-hidden transition-all ${
              isDarkMode 
                ? 'bg-slate-800/80 border-slate-700 text-white placeholder-slate-500 focus:border-indigo-500' 
                : 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400 focus:border-indigo-500'
            }`}
          />
        </div>
      </div>

      {/* Products List Section */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 px-1">
          <span>Showing <strong>{filteredItems.length}</strong> items</span>
          <span className="text-[11px]">Sorted by Focus Master Order</span>
        </div>

        {filteredItems.length === 0 ? (
          <div className={`p-12 text-center rounded-2xl border ${
            isDarkMode ? 'bg-slate-900 border-slate-800 text-slate-400' : 'bg-white border-slate-200 text-slate-500'
          }`}>
            <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3 opacity-80" />
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">No items match this filter</h3>
            <p className="text-xs mt-1 text-slate-400 max-w-sm mx-auto">
              {filterType === 'mismatch'
                ? 'Great news! All supported Focus Offers are matching current Stock IQ pricing.'
                : 'Try adjusting your search or category filter to view other products.'}
            </p>
          </div>
        ) : (
          filteredItems.map((item) => {
            const isMismatch = item.offerStatus === 'MISMATCH';
            const isManual = item.offerStatus === 'MANUAL_CHECK';
            const isUnrec = item.offerStatus === 'UNRECOGNIZED';
            const isNotMatched = item.offerStatus === 'NOT_MATCHED';
            const isCorrect = item.offerStatus === 'CORRECT';

            return (
              <div
                key={item.code}
                className={`p-4 rounded-2xl border transition-all ${
                  isMismatch
                    ? isDarkMode ? 'bg-rose-950/20 border-rose-900/60' : 'bg-rose-50/40 border-rose-200'
                    : isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
                }`}
              >
                {/* Top Row: Title, Code, Status & Warning Badges */}
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2.5">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Code */}
                      <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                        {item.code}
                      </span>

                      {/* Category */}
                      {item.category && (
                        <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                          {item.category}
                        </span>
                      )}

                      {/* Brand */}
                      {item.brand && (
                        <span className="text-[11px] font-medium text-slate-400">
                          • {item.brand}
                        </span>
                      )}
                    </div>

                    {/* Product Name */}
                    <h3 
                      onClick={() => item.stockProduct && onSelectProduct && onSelectProduct(item.stockProduct)}
                      className={`text-sm sm:text-base font-bold text-slate-900 dark:text-white leading-snug ${
                        item.stockProduct && onSelectProduct ? 'cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400' : ''
                      }`}
                    >
                      {item.productName}
                    </h3>
                  </div>

                  {/* Badges */}
                  <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                    {/* Offer Status Badge */}
                    {isMismatch && (
                      <span className="px-2.5 py-1 rounded-lg text-xs font-black bg-rose-600 text-white shadow-xs">
                        MISMATCH {item.difference !== null ? `₹${Math.abs(item.difference)}` : ''}
                      </span>
                    )}
                    {isCorrect && (
                      <span className="px-2.5 py-1 rounded-lg text-xs font-black bg-emerald-600 text-white shadow-xs">
                        CORRECT
                      </span>
                    )}
                    {isManual && (
                      <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-indigo-600 text-white shadow-xs">
                        MANUAL CHECK
                      </span>
                    )}
                    {isUnrec && (
                      <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-600 text-white shadow-xs">
                        UNRECOGNIZED OFFER
                      </span>
                    )}
                    {isNotMatched && (
                      <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-rose-700 text-white shadow-xs">
                        NOT MATCHED
                      </span>
                    )}

                    {/* Warning Badges */}
                    {item.isMrpChanged && (
                      <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                        MRP CHANGED ₹{item.focusMrp} → ₹{item.currentMrp}
                      </span>
                    )}
                    {item.isBelowCost && (
                      <span className="px-2 py-0.5 rounded-md text-[11px] font-black bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-800">
                        ⚠ BELOW COST
                      </span>
                    )}
                  </div>
                </div>

                {/* Offer Pill & Explanation - Clean Single Focus Offer Badge */}
                <div className="mt-3 flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-extrabold bg-amber-100 dark:bg-amber-950/80 text-amber-900 dark:text-amber-200 border border-amber-300 dark:border-amber-700/80 shadow-2xs">
                    <Sparkles className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                    <span>Focus Offer: {formatCleanOfferBadge(item.focusOffer) || item.focusOffer || 'No offer specified'}</span>
                  </span>
                  {item.calculationExplanation && (
                    <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                      ({item.calculationExplanation})
                    </span>
                  )}
                </div>

                {/* Pricing & Stock Metrics Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-center">
                  {/* Focus MRP */}
                  <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Focus MRP</span>
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      {item.focusMrp > 0 ? `₹${item.focusMrp}` : '—'}
                    </span>
                  </div>

                  {/* Current MRP */}
                  <div className={`p-2 rounded-xl ${
                    item.isMrpChanged 
                      ? 'bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800' 
                      : 'bg-slate-50 dark:bg-slate-800/50'
                  }`}>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Current MRP</span>
                    <span className="text-xs font-bold text-slate-900 dark:text-white">
                      ₹{item.currentMrp}
                    </span>
                  </div>

                  {/* Expected SP */}
                  <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800">
                    <span className="text-[10px] uppercase font-bold text-indigo-700 dark:text-indigo-300 block">
                      Expected SP
                    </span>
                    <span className="text-xs sm:text-sm font-black text-indigo-700 dark:text-indigo-300">
                      {item.expectedRetail !== null ? `₹${item.expectedRetail}` : 'Manual'}
                    </span>
                  </div>

                  {/* Current SP */}
                  <div className={`p-2 rounded-xl ${
                    isMismatch 
                      ? 'bg-rose-100/60 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-800' 
                      : 'bg-slate-50 dark:bg-slate-800/50'
                  }`}>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Current SP</span>
                    <span className={`text-xs sm:text-sm font-black ${
                      isMismatch ? 'text-rose-700 dark:text-rose-300' : 'text-slate-900 dark:text-white'
                    }`}>
                      ₹{item.currentRetail}
                    </span>
                  </div>

                  {/* Mismatch / Difference */}
                  <div className={`p-2 rounded-xl ${
                    item.difference !== null && Math.abs(item.difference) > 0.50
                      ? 'bg-rose-100 dark:bg-rose-950/80 border border-rose-300 dark:border-rose-800'
                      : 'bg-emerald-50 dark:bg-emerald-950/40'
                  }`}>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">
                      {isMismatch ? 'Mismatch' : 'Difference'}
                    </span>
                    <span className={`text-xs sm:text-sm font-black ${
                      item.difference !== null && Math.abs(item.difference) > 0.50
                        ? 'text-rose-700 dark:text-rose-300'
                        : 'text-emerald-700 dark:text-emerald-300'
                    }`}>
                      {item.difference !== null 
                        ? (isMismatch ? `₹${Math.abs(item.difference)}` : '₹0')
                        : '—'}
                    </span>
                  </div>

                  {/* Cost Price */}
                  <div className={`p-2 rounded-xl ${
                    item.isBelowCost 
                      ? 'bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800' 
                      : 'bg-slate-50 dark:bg-slate-800/50'
                  }`}>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Cost</span>
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      ₹{item.costPrice}
                    </span>
                  </div>

                  {/* Stock */}
                  <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Stock</span>
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      {item.stockQty}
                    </span>
                  </div>

                  {/* Sales */}
                  <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Sales</span>
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      {item.salesQty}
                    </span>
                  </div>
                </div>

                {/* Additional Note or Warnings Bar if applicable */}
                {(item.isMrpChanged || item.isBelowCost) && (
                  <div className="mt-2.5 p-2 rounded-xl text-xs flex items-center justify-between gap-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200">
                    <div className="flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <span>
                        {item.isMrpChanged && (
                          <strong>MRP shifted in POS: Focus was ₹{item.focusMrp}, Current is ₹{item.currentMrp}. </strong>
                        )}
                        {item.isBelowCost && (
                          <strong className="text-rose-600 dark:text-rose-400">⚠ Expected Retail (₹{item.expectedRetail}) is below cost (₹{item.costPrice})! </strong>
                        )}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Start Focus Audit Confirmation Modal */}
      <FocusStartAuditModal
        isOpen={showStartAuditModal}
        focusType={focusType}
        monthDisplay={master?.monthDisplay || 'Current Month'}
        sourceTitle={focusType === 'core' ? 'Core Offer Mismatch' : 'Non-Core Offer Mismatch'}
        productCount={filteredItems.length}
        onClose={() => setShowStartAuditModal(false)}
        onConfirm={() => {
          setShowStartAuditModal(false);
          const mappedItems = filteredItems.map(item => ({
            ...item,
            status: 'OFFER_MISMATCH' as any,
            issueReason: item.mismatchReason || item.focusOffer,
            isMatched: true,
            stockQty: item.stockQty || 0,
            salesQty: 0,
            mrp: item.currentMrp || item.focusMrp,
            retailPrice: item.currentRetail,
            offerPrice: item.expectedRetail
          }));
          onStartFocusAudit?.({
            focusType,
            monthDisplay: master?.monthDisplay || 'Current Month',
            sourceTitle: focusType === 'core' ? 'Core Offer Mismatch' : 'Non-Core Offer Mismatch',
            items: mappedItems,
            categoryFilter: selectedCategory !== 'all' ? selectedCategory : undefined
          });
        }}
        isDarkMode={isDarkMode}
      />
    </div>
  );
};
