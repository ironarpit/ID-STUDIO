import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Zap,
  Turtle,
  AlertOctagon,
  EyeOff,
  PackagePlus,
  AlertTriangle,
  AlertCircle,
  PackageX,
  Coins,
  Tags,
  Briefcase,
  Truck,
  PieChart,
  Percent,
  Clock,
  Sparkles,
  ListFilter,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  Sun,
  Moon,
  X,
  RefreshCw,
  FileText,
  ClipboardCheck,
  PlayCircle,
  Flag,
  CheckCircle2,
  Layers,
  ShoppingBag,
  Trophy,
  Download,
  Tag,
  Home,
  ArrowLeft,
  Calendar
} from 'lucide-react';
import { AnalyticsViewType, AppMode, StockReportMeta } from '../types';
import { RetailDashboardSummary } from '../utils/analytics';
import { forceAppUpdate } from '../utils/appUpdater';
import idStudioIcon from '../assets/images/id_studio_icon.png';

interface SidebarProps {
  appMode: AppMode;
  onToggleAppMode?: () => void;
  currentView: AnalyticsViewType;
  onSelectView: (view: AnalyticsViewType) => void;
  summary: RetailDashboardSummary;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  isMobileOpen: boolean;
  onCloseMobile: () => void;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
  onOpenAdminConsole: () => void;
  reportMeta: StockReportMeta | null;
  flaggedCount?: number;
  hasActiveAudit?: boolean;
  coreIssuesCount?: number;
  nonCoreIssuesCount?: number;
  coreOfferMismatchCount?: number;
  nonCoreOfferMismatchCount?: number;
  coreCheckStatus?: 'in_progress' | 'completed' | 'none';
  nonCoreCheckStatus?: 'in_progress' | 'completed' | 'none';
}

interface NavGroup {
  groupName: string;
  items: {
    id: AnalyticsViewType;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: string | number | null;
    badgeColor?: string;
    pill?: string;
    pillColor?: string;
    activeBg?: string;
  }[];
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  onSelectView,
  summary,
  isCollapsed,
  onToggleCollapse,
  isMobileOpen,
  onCloseMobile,
  isDarkMode,
  onToggleDarkMode,
  onOpenAdminConsole,
  flaggedCount = 0,
  hasActiveAudit = false,
  coreIssuesCount = 0,
  nonCoreIssuesCount = 0,
  coreOfferMismatchCount = 0,
  nonCoreOfferMismatchCount = 0,
  coreCheckStatus = 'none',
  nonCoreCheckStatus = 'none'
}) => {
  // PWA Install Prompt State
  const [deferredPrompt, setDeferredPrompt] = useState<any>((window as any).deferredPWAInstallPrompt || null);
  const [isAppInstalled, setIsAppInstalled] = useState(false);
  const [showiOSInstructions, setShowiOSInstructions] = useState(false);
  const [isUpdatingApp, setIsUpdatingApp] = useState(false);

  const handleUpdateApp = async () => {
    setIsUpdatingApp(true);
    await forceAppUpdate();
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true;
      if (isStandalone) {
        setIsAppInstalled(true);
      }
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      (window as any).deferredPWAInstallPrompt = e;
      setDeferredPrompt(e);
    };

    const handleAppInstalled = () => {
      setIsAppInstalled(true);
      setDeferredPrompt(null);
      (window as any).deferredPWAInstallPrompt = null;
      setShowiOSInstructions(false);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    const promptEvent = deferredPrompt || (window as any).deferredPWAInstallPrompt;
    if (promptEvent) {
      promptEvent.prompt();
      const { outcome } = await promptEvent.userChoice;
      if (outcome === 'accepted') {
        setDeferredPrompt(null);
        (window as any).deferredPWAInstallPrompt = null;
        setIsAppInstalled(true);
      }
    } else if (isAppInstalled) {
      alert('ID STUDIO is already installed on this device.');
    } else {
      setShowiOSInstructions(true);
    }
  };

  const formatSidebarCurrency = (val: number) => {
    if (!val || val === 0) return null;
    if (val >= 10000000) return `₹${(val / 10000000).toFixed(1)}Cr`;
    if (val >= 100000) return `₹${(val / 100000).toFixed(0)}L`;
    return `₹${Math.round(val).toLocaleString('en-IN')}`;
  };

  // Determine active section
  const isHomeView = currentView === 'bsmiq_home';

  const isFocusView = 
    currentView === 'focus_home' ||
    currentView === 'core_focus' ||
    currentView === 'non_core_focus' ||
    currentView === 'core_focus_issues' ||
    currentView === 'non_core_focus_issues' ||
    currentView === 'core_focus_offers' ||
    currentView === 'non_core_focus_offers' ||
    currentView === 'core_focus_check' ||
    currentView === 'non_core_focus_check' ||
    currentView === 'focus_flagged_issues' ||
    currentView === 'focus_history';

  const isFloorView =
    currentView === 'floor_audit' ||
    currentView === 'floor_audit_runner' ||
    currentView === 'flagged_followup' ||
    currentView === 'near_expiry';

  const isStockView = !isHomeView && !isFocusView && !isFloorView;

  // Stock IQ Navigation Groups
  const stockIqGroups: NavGroup[] = [
    {
      groupName: 'Overview',
      items: [
        { id: 'dashboard', label: 'Home Dashboard', icon: LayoutDashboard },
        { 
          id: 'replenishment', 
          label: 'Replenishment Needs', 
          icon: RefreshCw, 
          badge: (summary.lowStockCount + summary.outOfStockCount) || null,
          badgeColor: 'bg-rose-500 text-white'
        },
        { 
          id: 'inventory_value', 
          label: 'Inventory Valuation', 
          icon: Coins, 
          badge: formatSidebarCurrency(summary.totalInventoryValue) 
        }
      ]
    },
    {
      groupName: 'Movement & Velocity',
      items: [
        { id: 'fast_moving', label: 'Fast Moving SKUs', icon: Zap, badge: summary.fastMovingCount || null },
        { id: 'slow_moving', label: 'Slow Moving SKUs', icon: Turtle, badge: summary.slowMovingCount || null },
        { id: 'dead_stock', label: 'Dead Stock SKUs', icon: AlertOctagon, badge: summary.deadStockCount || null, badgeColor: 'bg-rose-500 text-white' },
        { id: 'zero_sales', label: 'Zero Sales SKUs', icon: EyeOff, badge: summary.zeroSalesCount || null }
      ]
    },
    {
      groupName: 'Stock Levels',
      items: [
        { id: 'low_stock', label: 'Low Stock SKUs', icon: AlertTriangle, badge: summary.lowStockCount || null, badgeColor: 'bg-amber-500 text-white' },
        { id: 'out_of_stock', label: 'Out of Stock SKUs', icon: PackageX, badge: summary.outOfStockCount || null, badgeColor: 'bg-rose-500 text-white' },
        { id: 'overstock', label: 'Overstock SKUs', icon: PackagePlus, badge: summary.overstockCount || null },
        { id: 'stock_variations', label: 'Stock Variations', icon: Layers }
      ]
    },
    {
      groupName: 'Catalog & Structure',
      items: [
        { id: 'all_products', label: 'Product Catalog', icon: ListFilter, badge: summary.totalProducts || null },
        { id: 'top_sales', label: 'Top 100 Performance', icon: Trophy },
        { id: 'category_dash', label: 'Categories', icon: Tags, badge: summary.categoriesCount || null },
        { id: 'brand_dash', label: 'Brands', icon: Briefcase, badge: summary.brandsCount || null },
        { id: 'supplier_dash', label: 'Suppliers', icon: Truck, badge: summary.suppliersCount || null }
      ]
    },
    {
      groupName: 'Analysis & Reports',
      items: [
        { id: 'abc_analysis', label: 'ABC Analysis', icon: PieChart },
        { id: 'margin_analysis', label: 'Margin Analysis', icon: Percent },
        { id: 'stock_age', label: 'Stock Ageing', icon: Clock },
        { id: 'ai_recommendations', label: 'AI Recommendations', icon: Sparkles },
        { id: 'reports', label: 'Reports & Export', icon: FileText }
      ]
    }
  ];

  // Floor IQ Navigation Groups
  const floorIqGroups: NavGroup[] = [
    {
      groupName: 'Floor IQ',
      items: [
        { id: 'floor_audit', label: 'Floor IQ Home', icon: ClipboardCheck },
        { 
          id: 'floor_audit_runner', 
          label: 'Active Audits', 
          icon: PlayCircle, 
          badge: hasActiveAudit ? 'Active' : null,
          badgeColor: 'bg-indigo-600 text-white'
        },
        { 
          id: 'flagged_followup', 
          label: 'Action Required', 
          icon: Flag, 
          badge: flaggedCount > 0 ? flaggedCount : null,
          badgeColor: 'bg-rose-500 text-white'
        },
        {
          id: 'floor_audit',
          label: 'Completed Audits',
          icon: CheckCircle2
        },
        {
          id: 'near_expiry',
          label: 'Near Expiry',
          icon: Calendar
        }
      ]
    }
  ];

  // Focus IQ Navigation Groups - 5 Clear Sections with Core (indigo) & Non-Core (teal) accents
  const focusIqGroups: NavGroup[] = [
    {
      groupName: 'FOCUS IQ',
      items: [
        { id: 'focus_home', label: 'Focus IQ Hub', icon: Sparkles }
      ]
    },
    {
      groupName: 'FOCUS MASTERS',
      items: [
        {
          id: 'core_focus',
          label: 'Core Focus Master',
          icon: ShoppingBag,
          pill: 'CORE',
          pillColor: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/80 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800',
          activeBg: 'bg-indigo-600 text-white shadow-xs'
        },
        {
          id: 'non_core_focus',
          label: 'Non-Core Focus Master',
          icon: Layers,
          pill: 'NON-CORE',
          pillColor: 'bg-teal-100 text-teal-700 dark:bg-teal-950/80 dark:text-teal-300 border border-teal-200 dark:border-teal-800',
          activeBg: 'bg-teal-600 text-white shadow-xs'
        }
      ]
    },
    {
      groupName: 'NO / LOW STOCK',
      items: [
        {
          id: 'core_focus_issues',
          label: 'Core No / Low Stock',
          icon: AlertCircle,
          pill: 'CORE',
          pillColor: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/80 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800',
          activeBg: 'bg-indigo-600 text-white shadow-xs',
          badge: coreIssuesCount > 0 ? coreIssuesCount : null,
          badgeColor: 'bg-rose-500 text-white font-bold'
        },
        {
          id: 'non_core_focus_issues',
          label: 'Non-Core No / Low Stock',
          icon: AlertTriangle,
          pill: 'NON-CORE',
          pillColor: 'bg-teal-100 text-teal-700 dark:bg-teal-950/80 dark:text-teal-300 border border-teal-200 dark:border-teal-800',
          activeBg: 'bg-teal-600 text-white shadow-xs',
          badge: nonCoreIssuesCount > 0 ? nonCoreIssuesCount : null,
          badgeColor: 'bg-rose-500 text-white font-bold'
        }
      ]
    },
    {
      groupName: 'OFFER VALIDATION',
      items: [
        {
          id: 'core_focus_offers',
          label: 'Core Offer Mismatch',
          icon: Tag,
          pill: 'CORE',
          pillColor: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/80 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800',
          activeBg: 'bg-indigo-600 text-white shadow-xs',
          badge: coreOfferMismatchCount > 0 ? coreOfferMismatchCount : null,
          badgeColor: 'bg-indigo-600 text-white font-bold'
        },
        {
          id: 'non_core_focus_offers',
          label: 'Non-Core Offer Mismatch',
          icon: Tag,
          pill: 'NON-CORE',
          pillColor: 'bg-teal-100 text-teal-700 dark:bg-teal-950/80 dark:text-teal-300 border border-teal-200 dark:border-teal-800',
          activeBg: 'bg-teal-600 text-white shadow-xs',
          badge: nonCoreOfferMismatchCount > 0 ? nonCoreOfferMismatchCount : null,
          badgeColor: 'bg-teal-600 text-white font-bold'
        }
      ]
    },
    {
      groupName: 'FOLLOW-UP & REPORTS',
      items: [
        { id: 'focus_flagged_issues', label: 'Flagged Follow-Up', icon: Flag },
        { id: 'focus_history', label: 'Check History & Reports', icon: FileText }
      ]
    }
  ];

  const activeGroups = isFocusView ? focusIqGroups : isFloorView ? floorIqGroups : stockIqGroups;

  if (isHomeView) {
    return null;
  }

  return (
    <>
      {/* Mobile Backdrop */}
      {isMobileOpen && (
        <div
          onClick={onCloseMobile}
          className="fixed inset-0 bg-slate-950/50 backdrop-blur-xs z-40 lg:hidden transition-opacity"
        />
      )}

      {/* Main Sidebar Drawer */}
      <aside
        className={`fixed lg:static top-0 left-0 bottom-0 z-50 flex flex-col transition-all duration-200 border-r ${
          isDarkMode
            ? 'bg-slate-900 border-slate-800 text-slate-100'
            : 'bg-white border-slate-200 text-slate-800'
        } ${isCollapsed ? 'lg:w-16' : 'lg:w-64'} ${
          isMobileOpen ? 'translate-x-0 w-80 max-w-[85vw] pt-safe pb-safe' : '-translate-x-full lg:translate-x-0'
        } h-full select-none shrink-0 overflow-hidden shadow-lg lg:shadow-none`}
      >
        {/* Mobile Header */}
        {isMobileOpen && (
          <div className={`p-3.5 flex items-center justify-between border-b ${isDarkMode ? 'border-slate-800' : 'border-slate-100'} lg:hidden`}>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-950 shadow-2xs flex items-center justify-center shrink-0">
                <img 
                  src={idStudioIcon} 
                  alt="ID STUDIO" 
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              </div>
              <div>
                <span className="font-bold text-sm text-slate-900 dark:text-white">ID STUDIO</span>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-none">Greer Genius</p>
              </div>
            </div>
            <button
              onClick={onCloseMobile}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              title="Close menu"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* PRIMARY MODULE DESTINATION BAR */}
        <div className={`p-2.5 border-b ${isDarkMode ? 'border-slate-800' : 'border-slate-100'} shrink-0`}>
          {(!isCollapsed || isMobileOpen) ? (
            <div className="space-y-1.5">
              <button
                onClick={() => {
                  onSelectView('bsmiq_home');
                  if (isMobileOpen) onCloseMobile();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold bg-indigo-50 dark:bg-slate-800/90 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-slate-700 transition-all border border-indigo-200/80 dark:border-slate-700 cursor-pointer shadow-2xs active:scale-98"
              >
                <ArrowLeft className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                <span className="truncate">ID STUDIO Home</span>
              </button>
              {isStockView && (
                <button
                  onClick={() => {
                    onOpenAdminConsole();
                    if (isMobileOpen) onCloseMobile();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer"
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                  <span className="truncate">Settings & Offline Data</span>
                </button>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1.5 py-1">
              <button
                onClick={() => onSelectView('bsmiq_home')}
                className="w-10 h-10 flex items-center justify-center rounded-xl bg-indigo-50 dark:bg-slate-800 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-slate-700 transition-all border border-indigo-200/80 dark:border-slate-700 cursor-pointer"
                title="Return to ID STUDIO Home"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Navigation Sub-Items Scroll Area */}
        <div className="flex-1 overflow-y-auto px-2 py-2 space-y-4 custom-scrollbar">
          {activeGroups.map((group, groupIdx) => (
            <div key={`group_${groupIdx}`} className="space-y-1">
              {(!isCollapsed || isMobileOpen) && (
                <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  {group.groupName}
                </div>
              )}
              <div className="space-y-0.5">
                {group.items.map((item, itemIdx) => {
                  const Icon = item.icon;
                  const isActive = currentView === item.id;
                  return (
                    <button
                      key={`${item.id}_${itemIdx}`}
                      onClick={() => {
                        onSelectView(item.id);
                        if (isMobileOpen) onCloseMobile();
                      }}
                      className={`w-full flex items-center ${
                        isCollapsed && !isMobileOpen ? 'justify-center p-2.5' : 'justify-between px-2.5 py-2'
                      } rounded-xl text-xs font-medium transition-all cursor-pointer group min-h-[38px] ${
                        isActive
                          ? item.activeBg || 'bg-indigo-600 text-white font-semibold shadow-xs'
                          : isDarkMode
                          ? 'text-slate-300 hover:bg-slate-800 hover:text-white'
                          : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                      }`}
                      title={item.label}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Icon className={`w-4 h-4 shrink-0 ${
                          isActive
                            ? 'text-white'
                            : isDarkMode
                            ? 'text-slate-400 group-hover:text-slate-200'
                            : 'text-slate-500 group-hover:text-slate-800'
                        }`} />
                        {(!isCollapsed || isMobileOpen) && (
                          <span className="truncate">{item.label}</span>
                        )}
                      </div>

                      {(!isCollapsed || isMobileOpen) && (
                        <div className="flex items-center gap-1.5 shrink-0">
                          {item.pill && (
                            <span className={`text-[8.5px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded ${item.pillColor || (isDarkMode ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-700')}`}>
                              {item.pill}
                            </span>
                          )}

                          {item.badge !== undefined && item.badge !== null && (
                            <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
                              item.badgeColor || (isActive ? 'bg-black/20 text-white font-bold' : isDarkMode ? 'bg-slate-800 text-slate-300' : 'bg-slate-200 text-slate-700')
                            }`}>
                              {item.badge}
                            </span>
                          )}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Footer Settings & Offline Data Button */}
        <div className={`p-2 border-t ${isDarkMode ? 'border-slate-800' : 'border-slate-100'} shrink-0 space-y-1.5`}>
          {(!isCollapsed || isMobileOpen) ? (
            <button
              onClick={() => {
                onOpenAdminConsole();
                if (isMobileOpen) onCloseMobile();
              }}
              className={`w-full flex items-center justify-between p-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                isDarkMode
                  ? 'bg-slate-800/80 hover:bg-slate-800 text-slate-200 border-slate-700'
                  : 'bg-slate-50 hover:bg-slate-100 text-slate-800 border-slate-200 shadow-2xs'
              }`}
            >
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <span>Settings & Offline Data</span>
              </div>
              <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold">Open</span>
            </button>
          ) : (
            <button
              onClick={() => {
                onOpenAdminConsole();
                if (isMobileOpen) onCloseMobile();
              }}
              className={`w-10 h-10 mx-auto flex items-center justify-center rounded-xl transition-colors cursor-pointer border ${
                isDarkMode
                  ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
              }`}
              title="Settings & Offline Data"
            >
              <ShieldCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            </button>
          )}

          {/* Theme & PWA & Update */}
          <div className="flex items-center justify-between gap-1 pt-0.5">
            {(!isCollapsed || isMobileOpen) ? (
              <>
                <button
                  onClick={handleUpdateApp}
                  disabled={isUpdatingApp}
                  className={`flex-1 flex items-center justify-center gap-1 py-1.5 px-1.5 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                    isDarkMode ? 'text-indigo-400 bg-indigo-950/40 hover:bg-indigo-950/70 border border-indigo-900/60' : 'text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200'
                  }`}
                  title="Force Update App (Fetches latest published changes without deleting your uploaded data)"
                >
                  <RefreshCw className={`w-3 h-3 ${isUpdatingApp ? 'animate-spin' : ''}`} />
                  <span>{isUpdatingApp ? '...' : 'Update'}</span>
                </button>

                <button
                  onClick={onToggleDarkMode}
                  className={`p-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    isDarkMode ? 'text-amber-400 hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                  title={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                >
                  {isDarkMode ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
                </button>

                <button
                  onClick={handleInstallClick}
                  className={`p-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    isDarkMode ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                  title="Install Standalone App"
                >
                  <Download className="w-3.5 h-3.5" />
                </button>

                <button
                  onClick={onToggleCollapse}
                  className="hidden lg:flex p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                  title="Collapse Sidebar"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
              </>
            ) : (
              <div className="w-full flex flex-col items-center gap-1">
                <button
                  onClick={handleUpdateApp}
                  disabled={isUpdatingApp}
                  className={`w-10 h-8 flex items-center justify-center rounded-lg transition-colors cursor-pointer ${
                    isDarkMode ? 'text-indigo-400 hover:bg-slate-800' : 'text-indigo-600 hover:bg-slate-100'
                  }`}
                  title="Force Update App (Hard Refresh)"
                >
                  <RefreshCw className={`w-4 h-4 ${isUpdatingApp ? 'animate-spin' : ''}`} />
                </button>

                <button
                  onClick={onToggleDarkMode}
                  className={`w-10 h-8 flex items-center justify-center rounded-lg transition-colors cursor-pointer ${
                    isDarkMode ? 'text-amber-400 hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                  title={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                >
                  {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                </button>

                <button
                  onClick={onToggleCollapse}
                  className="hidden lg:flex w-10 h-8 items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                  title="Expand Sidebar"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* PWA Modal */}
      {showiOSInstructions && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-55 flex items-center justify-center p-4">
          <div className={`p-5 sm:p-6 rounded-2xl max-w-sm w-full border shadow-xl space-y-4 relative ${
            isDarkMode ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-800'
          }`}>
            <button
              onClick={() => setShowiOSInstructions(false)}
              className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="text-center space-y-2">
              <div className="w-14 h-14 mx-auto rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 shadow-sm flex items-center justify-center bg-slate-950">
                <img 
                  src={idStudioIcon} 
                  alt="ID STUDIO" 
                  className="w-full h-full object-cover"
                />
              </div>
              <h3 className="font-bold text-base text-slate-900 dark:text-white">
                Install ID STUDIO App
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-normal">
                Install as a standalone web application on your home screen for rapid scanning and multi-store inventory.
              </p>
            </div>

            <div className="space-y-2.5 pt-1 text-xs">
              <div className="flex gap-2.5 items-start bg-slate-50 dark:bg-slate-800/40 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-indigo-600 text-white font-bold text-[10px] shrink-0 mt-0.5">
                  1
                </span>
                <div>
                  <p className="font-semibold text-slate-900 dark:text-white">For iPhone (Safari):</p>
                  <p className="text-slate-500 dark:text-slate-400 mt-0.5">
                    Tap <strong className="text-indigo-600 dark:text-indigo-400">Share</strong> in Safari, then select <strong className="text-slate-900 dark:text-white">"Add to Home Screen"</strong>.
                  </p>
                </div>
              </div>

              <div className="flex gap-2.5 items-start bg-slate-50 dark:bg-slate-800/40 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-indigo-600 text-white font-bold text-[10px] shrink-0 mt-0.5">
                  2
                </span>
                <div>
                  <p className="font-semibold text-slate-900 dark:text-white">For Android (Chrome):</p>
                  <p className="text-slate-500 dark:text-slate-400 mt-0.5">
                    Tap <strong className="text-indigo-600 dark:text-indigo-400">Menu (⋮)</strong> in Chrome, then select <strong className="text-slate-900 dark:text-white">"Install app"</strong>.
                  </p>
                </div>
              </div>
            </div>

            <button
              onClick={() => setShowiOSInstructions(false)}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 rounded-xl transition-all shadow-xs cursor-pointer text-xs"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </>
  );
};
