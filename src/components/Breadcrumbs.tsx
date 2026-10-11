import React from 'react';
import { ChevronRight, Home, ArrowLeft, Store } from 'lucide-react';
import { AnalyticsViewType, AppMode } from '../types';

interface BreadcrumbsProps {
  appMode?: AppMode;
  currentView: AnalyticsViewType;
  onSelectView: (view: AnalyticsViewType) => void;
  onOpenMobileSidebar?: () => void;
  isDarkMode?: boolean;
  canGoBack?: boolean;
  onGoBack?: () => void;
  previousViewTitle?: string;
  selectedStoreName?: string;
}

export const VIEW_TITLES: Record<AnalyticsViewType, string> = {
  bsmiq_home: 'ID STUDIO Home',
  dashboard: 'Home Dashboard',
  replenishment: 'Replenishment Needs',
  fast_moving: 'Fast Moving SKUs',
  slow_moving: 'Slow Moving SKUs',
  dead_stock: 'Dead Stock SKUs',
  zero_sales: 'Zero Sales SKUs',
  overstock: 'Overstock SKUs',
  low_stock: 'Low Stock SKUs',
  out_of_stock: 'Out of Stock SKUs',
  inventory_value: 'Inventory Valuation',
  category_dash: 'Category Dashboard',
  brand_dash: 'Brand Dashboard',
  supplier_dash: 'Supplier Dashboard',
  abc_analysis: 'ABC Analysis',
  margin_analysis: 'Margin Analysis',
  stock_age: 'Stock Ageing',
  ai_recommendations: 'AI Recommendations',
  all_products: 'Product Catalog',
  top_sales: 'Top 100 Performance',
  reports: 'Reports & Export',
  product_detail: 'Product Details',
  floor_audit: 'Floor Audit Hub',
  floor_audit_runner: 'Floor Audit Runner',
  flagged_followup: 'Action Follow-Up',
  focus_home: 'Focus IQ Hub',
  core_focus: 'Core Focus Master',
  non_core_focus: 'Non-Core Focus Master',
  core_focus_issues: 'Core No / Low Stock',
  non_core_focus_issues: 'Non-Core No / Low Stock',
  core_focus_offers: 'Core Offer Mismatch',
  non_core_focus_offers: 'Non-Core Offer Mismatch',
  core_focus_check: 'Core Focus Check',
  non_core_focus_check: 'Non-Core Focus Check',
  focus_flagged_issues: 'Flagged Follow-Up',
  focus_history: 'Check History & Reports',
  near_expiry: 'Near Expiry Hub'
};

export const Breadcrumbs: React.FC<BreadcrumbsProps> = ({
  appMode = 'stock_iq',
  currentView,
  onSelectView,
  isDarkMode,
  canGoBack = false,
  onGoBack,
  previousViewTitle,
  selectedStoreName
}) => {
  if (currentView === 'floor_audit_runner' || currentView === 'bsmiq_home') {
    return null;
  }

  const isRootView = currentView === 'bsmiq_home' || currentView === 'dashboard' || currentView === 'floor_audit' || currentView === 'focus_home';
  const showBackButton = (canGoBack || !isRootView) && onGoBack;

  // On mobile: if root screen without back navigation, hide entirely to maximize space
  const mobileContainerClass = (!showBackButton && isRootView) ? 'hidden lg:flex' : 'flex';

  return (
    <nav 
      aria-label="Breadcrumb"
      className={`${mobileContainerClass} items-center justify-between px-3 sm:px-4 py-1.5 border-b text-xs transition-colors shrink-0 ${
        isDarkMode ? 'bg-slate-900/60 border-slate-800 text-slate-400' : 'bg-slate-50/80 border-slate-200 text-slate-500'
      }`}
    >
      {/* MOBILE PRESENTATION: Compact Single Row (← Back  Page Title) */}
      <div className="flex lg:hidden items-center justify-between w-full min-w-0">
        {showBackButton ? (
          <button
            onClick={onGoBack}
            className={`flex items-center gap-1.5 px-2 py-1 rounded-md border text-xs font-semibold transition-all cursor-pointer active:scale-95 shrink-0 ${
              isDarkMode
                ? 'bg-slate-800 hover:bg-slate-750 text-slate-100 border-slate-700'
                : 'bg-white hover:bg-slate-100 text-slate-800 border-slate-200'
            }`}
            title={previousViewTitle ? `Go back to ${previousViewTitle}` : 'Go Back'}
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back</span>
          </button>
        ) : (
          <div />
        )}

        <span className="font-semibold text-slate-900 dark:text-white truncate text-xs text-right pl-2">
          {VIEW_TITLES[currentView] || 'View'}
        </span>
      </div>

      {/* DESKTOP PRESENTATION: Unchanged Full Breadcrumb Trail */}
      <div className="hidden lg:flex items-center gap-1.5 min-w-0 flex-1 overflow-hidden">
        {/* Universal Back Button */}
        {showBackButton && (
          <button
            onClick={onGoBack}
            className={`flex items-center gap-1 px-2 py-0.5 rounded-md border text-xs font-semibold transition-all cursor-pointer active:scale-95 shrink-0 mr-1 ${
              isDarkMode
                ? 'bg-slate-800 hover:bg-slate-750 text-slate-200 border-slate-700'
                : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
            }`}
            title={previousViewTitle ? `Go back to ${previousViewTitle}` : 'Go Back'}
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back</span>
          </button>
        )}

        {/* Home / Hub Root crumb */}
        <button
          onClick={() => onSelectView(appMode === 'floor_iq' ? 'floor_audit' : 'dashboard')}
          className="flex items-center gap-1 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors font-medium shrink-0 cursor-pointer"
        >
          <Home className="w-3.5 h-3.5" />
          <span>{appMode === 'floor_iq' ? 'Floor Hub' : 'Home'}</span>
        </button>

        {/* Store Name crumb */}
        {selectedStoreName && (
          <>
            <ChevronRight className="w-3 h-3 text-slate-400 dark:text-slate-600 shrink-0" />
            <div className="flex items-center gap-1 font-medium truncate shrink-0 max-w-[150px]">
              <Store className="w-3 h-3 text-slate-400 shrink-0" />
              <span className="truncate">{selectedStoreName}</span>
            </div>
          </>
        )}

        {/* Active Page crumb */}
        {!isRootView && (
          <>
            <ChevronRight className="w-3 h-3 text-slate-400 dark:text-slate-600 shrink-0" />
            <span className="font-semibold text-slate-900 dark:text-white truncate">
              {VIEW_TITLES[currentView] || 'View'}
            </span>
          </>
        )}
      </div>
    </nav>
  );
};
