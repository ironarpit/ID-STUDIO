import React, { useState, useMemo, useEffect } from 'react';
import { 
  ArrowLeft, 
  Search, 
  Filter, 
  CheckCircle2, 
  XCircle, 
  Upload, 
  Calendar, 
  Tag, 
  Sparkles, 
  Package, 
  ShoppingBag, 
  Layers, 
  Info, 
  ChevronRight,
  Truck,
  Eye,
  X,
  AlertCircle,
  AlertTriangle,
  ClipboardCheck,
  Copy,
  Check
} from 'lucide-react';
import { FocusMaster, FocusType, Product, MatchedFocusProduct, EvaluatedFocusProduct } from '../../types';
import { 
  evaluateFocusProductsWithLiveStock, 
  calculateFocusIQStats, 
  formatCleanOfferBadge,
  generateFocusNotMatchedWhatsAppText,
  generateSingleNotMatchedWhatsAppText
} from '../../utils/focusMatcher';
import { FocusStartAuditModal } from './FocusStartAuditModal';

interface FocusProductListViewProps {
  master: FocusMaster | null;
  focusType: FocusType;
  stockProducts: Product[];
  reportDays?: number | null;
  initialFilter?: 'all' | 'matched' | 'not_matched' | 'out_of_stock' | 'low_stock' | 'available';
  onBackToHome: () => void;
  onOpenFocusIssues?: (type: FocusType, filter?: 'all' | 'out_of_stock' | 'low_stock') => void;
  onOpenOfferMismatch?: (type: FocusType) => void;
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

export const FocusProductListView: React.FC<FocusProductListViewProps> = ({
  master,
  focusType,
  stockProducts,
  reportDays,
  initialFilter = 'all',
  onBackToHome,
  onOpenFocusIssues,
  onOpenOfferMismatch,
  onOpenUploadModal,
  onSelectProduct,
  onStartFocusAudit,
  isDarkMode = false
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'matched' | 'not_matched' | 'out_of_stock' | 'low_stock' | 'available'>(initialFilter);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedBrand, setSelectedBrand] = useState<string>('all');
  const [inspectItem, setInspectItem] = useState<EvaluatedFocusProduct | null>(null);
  const [showStartAuditModal, setShowStartAuditModal] = useState(false);
  const [isCopiedNotMatched, setIsCopiedNotMatched] = useState(false);
  const [copiedItemId, setCopiedItemId] = useState<string | null>(null);

  // Dynamic Stage 2 evaluation against CURRENT Stock IQ inventory
  const evaluatedProducts: EvaluatedFocusProduct[] = useMemo(() => {
    if (!master || !master.items) return [];
    return evaluateFocusProductsWithLiveStock(master.items, stockProducts, reportDays);
  }, [master, stockProducts, reportDays]);

  const stats = useMemo(() => {
    return calculateFocusIQStats(
      evaluatedProducts,
      master?.monthDisplay || 'Current Month',
      reportDays,
      master?.uploadedAt,
      master?.fileName
    );
  }, [evaluatedProducts, master, reportDays]);

  // Unmatched items list
  const notMatchedItems = useMemo(() => {
    return evaluatedProducts.filter(p => !p.isMatched || p.status === 'NOT_MATCHED');
  }, [evaluatedProducts]);

  // Handle WhatsApp Copy for all unmatched items
  const handleCopyNotMatchedWhatsApp = async () => {
    const text = generateFocusNotMatchedWhatsAppText(
      notMatchedItems,
      focusType,
      master?.monthDisplay || 'Current Month'
    );
    try {
      await navigator.clipboard.writeText(text);
      setIsCopiedNotMatched(true);
      setTimeout(() => setIsCopiedNotMatched(false), 2500);
    } catch (err) {
      console.error('Failed to copy text:', err);
    }
  };

  // Handle WhatsApp Copy for single unmatched item
  const handleCopySingleNotMatchedWhatsApp = async (item: EvaluatedFocusProduct) => {
    const text = generateSingleNotMatchedWhatsAppText(item, focusType);
    const key = item.code || item.focusItem.id;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedItemId(key);
      setTimeout(() => setCopiedItemId(null), 2500);
    } catch (err) {
      console.error('Failed to copy text:', err);
    }
  };

  // Bidirectional linked categories (filtered by selectedBrand if active)
  const categories = useMemo(() => {
    const set = new Set<string>();
    evaluatedProducts.forEach(m => {
      if (selectedBrand !== 'all' && (m.brand || '').trim().toLowerCase() !== selectedBrand.trim().toLowerCase()) return;
      if (m.category) set.add(m.category.trim());
    });
    if (selectedCategory !== 'all' && !set.has(selectedCategory)) {
      set.add(selectedCategory);
    }
    return Array.from(set).sort();
  }, [evaluatedProducts, selectedBrand, selectedCategory]);

  // Bidirectional linked brands (filtered by selectedCategory if active)
  const brands = useMemo(() => {
    const set = new Set<string>();
    evaluatedProducts.forEach(m => {
      if (selectedCategory !== 'all' && (m.category || '').trim().toLowerCase() !== selectedCategory.trim().toLowerCase()) return;
      if (m.brand) set.add(m.brand.trim());
    });
    if (selectedBrand !== 'all' && !set.has(selectedBrand)) {
      set.add(selectedBrand);
    }
    return Array.from(set).sort();
  }, [evaluatedProducts, selectedCategory, selectedBrand]);

  // Filtered product items
  const filteredProducts = useMemo(() => {
    return evaluatedProducts.filter((item) => {
      // Status filter
      if (statusFilter === 'out_of_stock' && item.status !== 'OUT_OF_STOCK') return false;
      if (statusFilter === 'low_stock' && item.status !== 'LOW_STOCK') return false;
      if (statusFilter === 'available' && item.status !== 'AVAILABLE') return false;
      if (statusFilter === 'not_matched' && item.status !== 'NOT_MATCHED') return false;
      if (statusFilter === 'matched' && !item.isMatched) return false;

      // Category filter
      if (selectedCategory !== 'all') {
        const itemCat = item.category || '';
        if (itemCat !== selectedCategory) return false;
      }

      // Brand filter
      if (selectedBrand !== 'all') {
        const itemBrand = item.brand || '';
        if (itemBrand !== selectedBrand) return false;
      }

      // Search term filter
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase().trim();
        const code = (item.code || '').toLowerCase();
        const name = (item.productName || '').toLowerCase();
        const offer = (item.focusOffer || '').toLowerCase();
        const cat = (item.category || '').toLowerCase();
        const brand = (item.brand || '').toLowerCase();

        return (
          code.includes(q) ||
          name.includes(q) ||
          offer.includes(q) ||
          cat.includes(q) ||
          brand.includes(q)
        );
      }

      return true;
    });
  }, [evaluatedProducts, statusFilter, selectedCategory, selectedBrand, searchTerm]);

  // Context-aware hardware / camera barcode scanner listener: locate & highlight Focus card
  useEffect(() => {
    const handleLocateEvent = (e: Event) => {
      const customEv = e as CustomEvent<{ code?: string; bansalCode?: string; barcode?: string; productId?: string }>;
      if (!customEv.detail) return;
      const { code, bansalCode, barcode, productId } = customEv.detail;

      const match = evaluatedProducts.find((item) => {
        const c = item.code || item.focusItem.code || item.focusItem.bansalCode;
        const b = item.focusItem.barcode || item.stockProduct?.barcode;
        const pId = item.stockProduct?.id;

        return (
          (code && c === code) ||
          (bansalCode && c === bansalCode) ||
          (barcode && b && b.toLowerCase() === barcode.toLowerCase()) ||
          (productId && pId === productId)
        );
      });

      if (!match) return;

      const itemCode = match.code || match.focusItem.code || match.focusItem.bansalCode;

      const isVisible = filteredProducts.some(
        (item) => (item.code || item.focusItem.code || item.focusItem.bansalCode) === itemCode
      );

      if (!isVisible) {
        setStatusFilter('all');
        setSelectedCategory('all');
        setSelectedBrand('all');
        setSearchTerm('');
      }

      setTimeout(
        () => {
          const el =
            document.getElementById(`focus-card-${itemCode}`) ||
            document.querySelector(`[data-focus-code="${itemCode}"]`);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.classList.add('scanner-matched-pulse');
            setTimeout(() => {
              el.classList.remove('scanner-matched-pulse');
            }, 2500);
          }
        },
        isVisible ? 15 : 90
      );
    };

    window.addEventListener('focus-scan-locate', handleLocateEvent);
    return () => {
      window.removeEventListener('focus-scan-locate', handleLocateEvent);
    };
  }, [evaluatedProducts, filteredProducts]);

  const title = focusType === 'core' ? 'CORE FOCUS' : 'NON-CORE FOCUS';
  const totalIssuesCount = stats.outOfStockCount + stats.lowStockCount;

  if (!master || master.items.length === 0) {
    return (
      <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <button
            onClick={onBackToHome}
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer"
            title="Back to Focus IQ Hub"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
              {title}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              No active Focus Master uploaded for this type yet
            </p>
          </div>
        </div>

        <div className={`p-10 text-center rounded-2xl border ${
          isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
        }`}>
          <div className="w-16 h-16 rounded-2xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto mb-4 border border-indigo-200 dark:border-indigo-800">
            <ShoppingBag className="w-8 h-8" />
          </div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-1">
            No {title} List Active
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto mb-6">
            Upload the monthly Focus Excel for {title} to track focus products and schemes matched with live Stock IQ inventory.
          </p>
          <button
            onClick={() => onOpenUploadModal(focusType)}
            className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md transition-all cursor-pointer active:scale-95 inline-flex items-center gap-2"
          >
            <Upload className="w-4 h-4" />
            <span>Upload {title} Excel</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-2 sm:p-4 max-w-6xl mx-auto space-y-3 pb-20">
      {/* 1. COMPACT STICKY HEADER */}
      <div className={`sticky top-0 z-30 px-3 py-2 rounded-2xl border backdrop-blur-md shadow-xs flex items-center justify-between gap-2 ${
        isDarkMode ? 'bg-slate-900/95 border-slate-800 text-slate-100' : 'bg-white/95 border-slate-200 text-slate-900'
      }`}>
        {/* Left: Back */}
        <button
          type="button"
          onClick={onBackToHome}
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
              {title}
            </h1>
          </div>
          <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400 truncate max-w-full">
            {master.monthDisplay} • {master.totalProducts} Focus Products
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          {onStartFocusAudit && (
            <button
              type="button"
              onClick={() => setShowStartAuditModal(true)}
              disabled={filteredProducts.length === 0}
              className={`min-h-[44px] px-3 py-1.5 rounded-xl font-bold text-xs shadow-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-40 active:scale-95 ${
                focusType === 'core'
                  ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                  : 'bg-teal-600 hover:bg-teal-700 text-white'
              }`}
              title="Start audit for filtered items"
            >
              <ClipboardCheck className="w-4 h-4" />
              <span className="hidden xs:inline">Audit</span>
            </button>
          )}
        </div>
      </div>

      {/* Action Shortcuts Bar */}
      <div className="flex items-center gap-2 flex-wrap">
        {notMatchedItems.length > 0 && (
          <button
            type="button"
            onClick={handleCopyNotMatchedWhatsApp}
            className="min-h-[44px] px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition-all cursor-pointer active:scale-95 flex items-center gap-1.5"
            title="Copy all Not Matched in Stock IQ products formatted for WhatsApp"
          >
            {isCopiedNotMatched ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            <span>{isCopiedNotMatched ? 'COPIED!' : `COPY NOT MATCHED (${notMatchedItems.length})`}</span>
          </button>
        )}
        {onOpenOfferMismatch && (
          <button
            type="button"
            onClick={() => onOpenOfferMismatch(focusType)}
            className="min-h-[44px] px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-xs transition-all cursor-pointer active:scale-95 flex items-center gap-1.5"
            title="Open Stage 3 Offer Mismatch & GRN Action Screen"
          >
            <Tag className="w-4 h-4" />
            <span>OFFER MISMATCH</span>
          </button>
        )}
        {onOpenFocusIssues && (
          <button
            type="button"
            onClick={() => onOpenFocusIssues(focusType, 'all')}
            className="min-h-[44px] px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-xs transition-all cursor-pointer active:scale-95 flex items-center gap-1.5"
            title="Open Stage 2 No Stock & Low Stock Action Screen"
          >
            <AlertCircle className="w-4 h-4" />
            <span>NO / LOW STOCK ({totalIssuesCount})</span>
          </button>
        )}
      </div>

      {/* 5 STAGE 2 LIVE STATUS CARDS */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 sm:gap-3">
        {/* CARD 1: TOTAL FOCUS */}
        <button
          onClick={() => setStatusFilter('all')}
          className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
            statusFilter === 'all'
              ? 'ring-2 ring-indigo-500 border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/40'
              : isDarkMode ? 'bg-slate-900 border-slate-800 hover:bg-slate-800/80' : 'bg-white border-slate-200 hover:bg-slate-50'
          }`}
        >
          <span className="text-[10px] font-extrabold uppercase text-slate-500 dark:text-slate-400 block tracking-wider">
            Total Focus
          </span>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
              {stats.totalProducts}
            </span>
            <span className="text-[10px] text-slate-400 font-semibold">SKUs</span>
          </div>
          <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-bold block mt-0.5">
            100% Master
          </span>
        </button>

        {/* CARD 2: OUT OF STOCK (CLICKABLE) */}
        <button
          onClick={() => {
            if (onOpenFocusIssues) {
              onOpenFocusIssues(focusType, 'out_of_stock');
            } else {
              setStatusFilter('out_of_stock');
            }
          }}
          className={`p-3 rounded-xl border text-left transition-all cursor-pointer group ${
            statusFilter === 'out_of_stock'
              ? 'ring-2 ring-rose-500 border-rose-500 bg-rose-50 dark:bg-rose-950/50'
              : stats.outOfStockCount > 0
              ? isDarkMode ? 'bg-rose-950/20 border-rose-900/60 hover:bg-rose-950/40' : 'bg-rose-50/80 border-rose-200 hover:bg-rose-100/70'
              : isDarkMode ? 'bg-slate-900 border-slate-800 opacity-60' : 'bg-white border-slate-200 opacity-60'
          }`}
          title="Click to view Out of Stock issues requiring Purchase Action"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold uppercase text-rose-700 dark:text-rose-400 block tracking-wider">
              Out of Stock
            </span>
            <span className="text-xs">🔴</span>
          </div>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-xl sm:text-2xl font-black text-rose-700 dark:text-rose-300">
              {stats.outOfStockCount}
            </span>
            <span className="text-[10px] text-rose-600 dark:text-rose-400 font-bold">SKUs</span>
          </div>
          <span className="text-[10px] text-rose-600 dark:text-rose-400 font-bold block mt-0.5 group-hover:underline">
            Stock ≤ 0 (Action) →
          </span>
        </button>

        {/* CARD 3: LOW STOCK (CLICKABLE) */}
        <button
          onClick={() => {
            if (onOpenFocusIssues) {
              onOpenFocusIssues(focusType, 'low_stock');
            } else {
              setStatusFilter('low_stock');
            }
          }}
          className={`p-3 rounded-xl border text-left transition-all cursor-pointer group ${
            statusFilter === 'low_stock'
              ? 'ring-2 ring-amber-500 border-amber-500 bg-amber-50 dark:bg-amber-950/50'
              : stats.lowStockCount > 0
              ? isDarkMode ? 'bg-amber-950/20 border-amber-900/60 hover:bg-amber-950/40' : 'bg-amber-50/80 border-amber-200 hover:bg-amber-100/70'
              : isDarkMode ? 'bg-slate-900 border-slate-800 opacity-60' : 'bg-white border-slate-200 opacity-60'
          }`}
          title="Click to view Low Stock issues requiring Purchase Action"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold uppercase text-amber-700 dark:text-amber-400 block tracking-wider">
              Low Stock
            </span>
            <span className="text-xs">🟠</span>
          </div>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-xl sm:text-2xl font-black text-amber-700 dark:text-amber-300">
              {stats.lowStockCount}
            </span>
            <span className="text-[10px] text-amber-600 dark:text-amber-400 font-bold">SKUs</span>
          </div>
          <span className="text-[10px] text-amber-600 dark:text-amber-400 font-bold block mt-0.5 group-hover:underline">
            Cover ≤ 7d (Action) →
          </span>
        </button>

        {/* CARD 4: AVAILABLE */}
        <button
          onClick={() => setStatusFilter('available')}
          className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
            statusFilter === 'available'
              ? 'ring-2 ring-emerald-500 border-emerald-500 bg-emerald-50 dark:bg-emerald-950/50'
              : isDarkMode ? 'bg-emerald-950/20 border-emerald-900/40 hover:bg-emerald-950/30' : 'bg-emerald-50/50 border-emerald-200 hover:bg-emerald-100/50'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold uppercase text-emerald-700 dark:text-emerald-400 block tracking-wider">
              Available
            </span>
            <span className="text-xs">🟢</span>
          </div>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-xl sm:text-2xl font-black text-emerald-700 dark:text-emerald-300">
              {stats.availableCount}
            </span>
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">SKUs</span>
          </div>
          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold block mt-0.5">
            Healthy Stock
          </span>
        </button>

        {/* CARD 5: NOT MATCHED */}
        <button
          onClick={() => setStatusFilter('not_matched')}
          className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
            statusFilter === 'not_matched'
              ? 'ring-2 ring-rose-500 border-rose-500 bg-rose-50 dark:bg-rose-950/50'
              : stats.notMatchedCount > 0
              ? isDarkMode ? 'bg-rose-950/20 border-rose-900/50 hover:bg-rose-950/30' : 'bg-rose-50 border-rose-200 hover:bg-rose-100/50'
              : isDarkMode ? 'bg-slate-900 border-slate-800 opacity-60' : 'bg-white border-slate-200 opacity-60'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold uppercase text-slate-500 dark:text-slate-400 block tracking-wider">
              Not Matched
            </span>
            <span className="text-xs">⚪</span>
          </div>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-xl sm:text-2xl font-black text-slate-800 dark:text-slate-200">
              {stats.notMatchedCount}
            </span>
            <span className="text-[10px] text-slate-400 font-semibold">SKUs</span>
          </div>
          <span className="text-[10px] text-slate-400 font-medium block mt-0.5">
            CODE Not Found
          </span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className={`p-3 rounded-xl border space-y-3 ${
        isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
      }`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by Code (e.g. 013006849), Description, Scheme, Brand..."
              className={`w-full pl-9 pr-8 py-2 rounded-xl text-xs sm:text-sm font-medium border transition-colors focus:ring-2 focus:ring-indigo-500 focus:outline-hidden ${
                isDarkMode ? 'bg-slate-800 border-slate-700 text-white placeholder-slate-500' : 'bg-slate-50 border-slate-200 text-slate-800 placeholder-slate-400'
              }`}
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Status Filter Tabs */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl shrink-0 flex-wrap">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                statusFilter === 'all'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              All ({evaluatedProducts.length})
            </button>
            <button
              onClick={() => setStatusFilter('out_of_stock')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                statusFilter === 'out_of_stock'
                  ? 'bg-rose-600 text-white shadow-2xs'
                  : 'text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40'
              }`}
            >
              <span>🔴 Out of Stock ({stats.outOfStockCount})</span>
            </button>
            <button
              onClick={() => setStatusFilter('low_stock')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                statusFilter === 'low_stock'
                  ? 'bg-amber-600 text-white shadow-2xs'
                  : 'text-amber-800 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/40'
              }`}
            >
              <span>🟠 Low Stock ({stats.lowStockCount})</span>
            </button>
            <button
              onClick={() => setStatusFilter('available')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                statusFilter === 'available'
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : 'text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
              }`}
            >
              <span>🟢 Available ({stats.availableCount})</span>
            </button>
            <button
              onClick={() => setStatusFilter('not_matched')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                statusFilter === 'not_matched'
                  ? 'bg-slate-700 text-white shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              <span>⚪ Not Matched ({stats.notMatchedCount})</span>
            </button>
          </div>
        </div>

        {/* Dropdowns for Category & Brand */}
        {(categories.length > 0 || brands.length > 0) && (
          <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-slate-100 dark:border-slate-800 text-xs">
            <span className="text-slate-400 font-bold uppercase text-[10px] tracking-wider mr-1">
              Filters:
            </span>
            {categories.length > 0 && (
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold ${
                  isDarkMode ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-700'
                }`}
              >
                <option value="all">All Categories ({categories.length})</option>
                {categories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            )}

            {brands.length > 0 && (
              <select
                value={selectedBrand}
                onChange={(e) => setSelectedBrand(e.target.value)}
                className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold ${
                  isDarkMode ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-700'
                }`}
              >
                <option value="all">All Brands ({brands.length})</option>
                {brands.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            )}

            {(selectedCategory !== 'all' || selectedBrand !== 'all') && (
              <button
                onClick={() => {
                  setSelectedCategory('all');
                  setSelectedBrand('all');
                }}
                className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer ml-auto"
              >
                Reset Filters
              </button>
            )}
          </div>
        )}
      </div>

      {/* Product List Items */}
      {filteredProducts.length === 0 ? (
        <div className={`p-8 text-center rounded-2xl border ${
          isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
        }`}>
          <Info className="w-8 h-8 text-slate-400 mx-auto mb-2" />
          <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
            No Focus Products Match Your Search / Filter
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Try adjusting search terms or resetting filters.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filteredProducts.map((item, idx) => {
            const { focusItem, isMatched, stockProduct, status, stockQty, salesQty, stockCoverDays } = item;

            return (
              <div
                key={focusItem.id || idx}
                id={`focus-card-${item.code || focusItem.code || focusItem.bansalCode || idx}`}
                data-focus-code={item.code || focusItem.code || focusItem.bansalCode}
                data-focus-barcode={focusItem.barcode || stockProduct?.barcode}
                className={`p-3.5 sm:p-4 rounded-xl border transition-all ${
                  status === 'OUT_OF_STOCK'
                    ? isDarkMode ? 'bg-rose-950/20 border-rose-900/60' : 'bg-rose-50/40 border-rose-200'
                    : status === 'LOW_STOCK'
                    ? isDarkMode ? 'bg-amber-950/20 border-amber-900/60' : 'bg-amber-50/40 border-amber-200'
                    : isMatched
                    ? isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-2xs'
                    : isDarkMode ? 'bg-slate-900/60 border-slate-800' : 'bg-slate-50/60 border-slate-200'
                }`}
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  {/* Left Column: CODE, Product Description, Category & Brand */}
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* BANSAL / LOCAL CODE (Strictly preserved leading zeros) */}
                      <span className="font-mono text-xs font-extrabold px-2 py-0.5 rounded-md bg-indigo-100 dark:bg-indigo-900/70 text-indigo-900 dark:text-indigo-200 border border-indigo-200 dark:border-indigo-800 shrink-0">
                        CODE: {item.code || 'NO-CODE'}
                      </span>

                      {/* Stage 2 Live Stock Status Badge */}
                      {status === 'OUT_OF_STOCK' && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-black px-2.5 py-0.5 rounded-md bg-rose-600 text-white shadow-2xs">
                          <span>🔴 OUT OF STOCK</span>
                        </span>
                      )}
                      {status === 'LOW_STOCK' && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-black px-2.5 py-0.5 rounded-md bg-amber-500 text-white shadow-2xs">
                          <span>🟠 LOW STOCK ({stockCoverDays !== null ? `${stockCoverDays.toFixed(1)}d` : 'Cover ≤ 7d'})</span>
                        </span>
                      )}
                      {status === 'AVAILABLE' && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                          <span>🟢 AVAILABLE</span>
                        </span>
                      )}
                      {status === 'NOT_MATCHED' && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-md bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                          <span>⚪ NOT MATCHED</span>
                        </span>
                      )}

                      {item.category && (
                        <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 rounded">
                          {item.category}
                        </span>
                      )}

                      {item.brand && (
                        <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 rounded">
                          {item.brand}
                        </span>
                      )}
                    </div>

                    {/* Product Name / Description */}
                    <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white leading-tight">
                      {item.productName}
                    </h3>

                    {/* Focus Offer Scheme Details - Clean Badge & Verbatim Original Offer */}
                    {item.focusOffer && (
                      <div className="pt-1 flex items-center gap-1.5 flex-wrap">
                        <span className="inline-flex items-center gap-1.5 text-xs font-extrabold px-3 py-1 rounded-lg bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-200 border border-amber-300 dark:border-amber-700/80 shadow-2xs">
                          <Sparkles className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                          <span>Focus Offer: {formatCleanOfferBadge(item.focusOffer)}</span>
                        </span>
                        {item.focusOffer.trim().toUpperCase() !== formatCleanOfferBadge(item.focusOffer).toUpperCase() && (
                          <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                            Original: {item.focusOffer}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Right Column: Live Stock IQ Intelligence & Status */}
                  <div className="lg:w-80 shrink-0 pt-2 lg:pt-0 lg:border-l lg:pl-4 border-slate-100 dark:border-slate-800 space-y-1.5">
                    {isMatched && stockProduct ? (
                      <div>
                        <div className="flex items-center justify-between text-xs font-bold mb-1">
                          <span className="text-slate-500 dark:text-slate-400">Stock IQ Live Stock:</span>
                          <span className={`px-2 py-0.5 rounded-md font-mono text-xs font-extrabold border ${
                            status === 'OUT_OF_STOCK'
                              ? 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950 dark:text-rose-200'
                              : status === 'LOW_STOCK'
                              ? 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-200'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white border-slate-200 dark:border-slate-700'
                          }`}>
                            {stockQty} Units
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-1 text-[11px] text-slate-600 dark:text-slate-400">
                          <div>
                            <span className="text-slate-400">Sales ({reportDays || 30}d): </span>
                            <span className="font-semibold text-slate-800 dark:text-slate-200">
                              {salesQty} Units
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-400">Stock Cover: </span>
                            <span className={`font-bold ${
                              status === 'OUT_OF_STOCK' ? 'text-rose-600 dark:text-rose-400' : status === 'LOW_STOCK' ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'
                            }`}>
                              {stockCoverDays !== null ? `${stockCoverDays.toFixed(1)} Days` : '—'}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-400">MRP: </span>
                            <span className="font-semibold text-slate-800 dark:text-slate-200">
                              ₹{item.mrp || '—'}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-400">Retail SP: </span>
                            <span className="font-semibold text-slate-800 dark:text-slate-200">
                              ₹{item.retailPrice || '—'}
                            </span>
                          </div>
                        </div>

                        {onSelectProduct && (
                          <button
                            onClick={() => onSelectProduct(stockProduct)}
                            className="mt-1.5 text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer flex items-center gap-1"
                          >
                            <span>Inspect Full Stock IQ Details</span>
                            <ChevronRight className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-xs space-y-2">
                        <div>
                          <p className="font-bold text-rose-800 dark:text-rose-300">
                            NOT MATCHED IN STOCK IQ
                          </p>
                          <p className="text-[11px] text-rose-700 dark:text-rose-400 mt-0.5">
                            Code <span className="font-mono font-bold">{item.code}</span> not matched with current inventory codes.
                          </p>
                        </div>
                        <button
                          onClick={() => handleCopySingleNotMatchedWhatsApp(item)}
                          className="w-full py-1 px-2.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] shadow-2xs transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-95"
                          title="Copy single product details formatted for WhatsApp"
                        >
                          {copiedItemId === (item.code || item.focusItem.id) ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-white" />
                              <span>COPIED FOR WHATSAPP!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5 text-white" />
                              <span>Copy for WhatsApp</span>
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Start Focus Audit Confirmation Modal */}
      <FocusStartAuditModal
        isOpen={showStartAuditModal}
        focusType={focusType}
        monthDisplay={master?.monthDisplay || 'Current Month'}
        sourceTitle={focusType === 'core' ? 'Core Focus Master' : 'Non-Core Focus Master'}
        productCount={filteredProducts.length}
        onClose={() => setShowStartAuditModal(false)}
        onConfirm={() => {
          setShowStartAuditModal(false);
          onStartFocusAudit?.({
            focusType,
            monthDisplay: master?.monthDisplay || 'Current Month',
            sourceTitle: focusType === 'core' ? 'Core Focus Master' : 'Non-Core Focus Master',
            items: filteredProducts,
            categoryFilter: selectedCategory !== 'all' ? selectedCategory : undefined
          });
        }}
        isDarkMode={isDarkMode}
      />
    </div>
  );
};

