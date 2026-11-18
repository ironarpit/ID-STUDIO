import React, { useState, useRef, useEffect } from 'react';
import { 
  RefreshCw,
  Store,
  Menu,
  Sun,
  Moon,
  MoreVertical,
  X,
  RotateCcw,
  Sparkles
} from 'lucide-react';
import { AppMode, StockReportMeta, AnalyticsViewType } from '../types';
import { StoreInfo } from '../utils/api';
import { forceAppUpdate } from '../utils/appUpdater';
import { isAndroidNative } from '../utils/platform';
import idStudioIcon from '../assets/images/id_studio_icon.png';

interface HeaderProps {
  appMode: AppMode;
  currentView?: AnalyticsViewType;
  onToggleAppMode: () => void;
  reportMeta: StockReportMeta | null;
  productCount: number;
  isAdmin: boolean;
  onOpenTable: () => void;
  onOpenAdminAuth: () => void;
  onOpenAdminSettings: () => void;
  onClearData?: () => void;
  onOpenAiScanner?: () => void;
  selectedStoreId?: string;
  setSelectedStoreId?: (storeId: string) => void;
  storesList?: StoreInfo[];
  onRefresh?: () => void;
  isRefreshing?: boolean;
  isSidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
  isDarkMode?: boolean;
  onToggleDarkMode?: () => void;
  onOpenMobileSidebar?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  appMode,
  currentView,
  onRefresh,
  isRefreshing = false,
  isDarkMode = false,
  onToggleDarkMode,
  onOpenMobileSidebar
}) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isUpdatingApp, setIsUpdatingApp] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const isNativeAndroid = isAndroidNative();

  const handleUpdateApp = async () => {
    if (isNativeAndroid) return;
    setIsUpdatingApp(true);
    await forceAppUpdate();
  };

  // Close 3-dot menu on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMobileMenuOpen(false);
      }
    };
    if (isMobileMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isMobileMenuOpen]);

  return (
    <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100 shrink-0 z-30 shadow-xs w-full transition-colors relative pt-safe">
      <div className="max-w-7xl mx-auto px-2.5 sm:px-4 h-12 sm:h-14 flex items-center justify-between gap-1.5 sm:gap-2">
        {/* Left: Mobile Menu (☰) + Logo + ID STUDIO Brand */}
        <div className="flex items-center gap-1.5 sm:gap-3 min-w-0">
          {/* Single Mobile Menu Trigger (☰) - hidden on Home */}
          {onOpenMobileSidebar && currentView !== 'bsmiq_home' && (
            <button
              onClick={onOpenMobileSidebar}
              className="lg:hidden p-2 -ml-1 rounded-xl text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center"
              title="Open Navigation"
              aria-label="Open Navigation"
            >
              <Menu className="w-5 h-5" />
            </button>
          )}

          {/* Master ID STUDIO Brand */}
          <div className="flex items-center gap-2 sm:gap-2.5 select-none min-w-0">
            <div className="w-8 h-8 sm:w-[38px] sm:h-[38px] rounded-xl overflow-hidden border border-slate-200/80 dark:border-slate-700/80 bg-slate-950 shadow-2xs shrink-0 flex items-center justify-center">
              <img 
                src={idStudioIcon} 
                alt="ID STUDIO" 
                className="w-full h-full object-cover pointer-events-none"
                referrerPolicy="no-referrer"
              />
            </div>
            <div className="min-w-0 flex items-center gap-1.5 sm:gap-2">
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-sm sm:text-base tracking-tight text-slate-900 dark:text-white whitespace-nowrap">
                    ID STUDIO
                  </span>
                  {/* Module Pill hidden on mobile, shown on tablet/desktop, omitted on ID STUDIO Home */}
                  {currentView !== 'bsmiq_home' && (
                    <span className="hidden sm:inline-flex text-[10px] font-semibold px-1.5 py-0.5 rounded-md border bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800/60">
                      {appMode === 'floor_iq' ? 'Floor IQ' : appMode === 'focus_iq' ? 'Focus IQ' : 'Stock IQ'}
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight truncate">
                  Greer Genius
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Center/Right: Right Utilities (Available across all views) */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Desktop Right Utilities (Hidden on mobile) */}
          <div className="hidden md:flex items-center gap-1.5 shrink-0">
            {/* Force Update App Button (Hard Refresh without data loss - Web/PWA only) */}
            {!isNativeAndroid && (
              <button
                onClick={handleUpdateApp}
                disabled={isUpdatingApp}
                className="px-2.5 py-1.5 bg-indigo-50 dark:bg-indigo-950/70 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 border border-indigo-200 dark:border-indigo-800/80 text-indigo-700 dark:text-indigo-300 rounded-lg text-xs font-bold transition-all cursor-pointer active:scale-95 flex items-center gap-1.5 disabled:opacity-50"
                title="Force Update App (Fetches latest published changes without deleting your uploaded data)"
              >
                <RotateCcw className={`w-3.5 h-3.5 ${isUpdatingApp ? 'animate-spin text-indigo-500' : ''}`} />
                <span>{isUpdatingApp ? 'Updating...' : 'Update App'}</span>
              </button>
            )}

            {/* Live Sync / Refresh Button */}
            {onRefresh && (
              <button
                onClick={onRefresh}
                disabled={isRefreshing}
                className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-semibold transition-all cursor-pointer active:scale-95 flex items-center gap-1.5 disabled:opacity-50"
                title="Refresh Live Stock & Sync Data"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 ${isRefreshing ? 'animate-spin text-indigo-500' : ''}`} />
                <span>{isRefreshing ? 'Syncing...' : 'Sync'}</span>
              </button>
            )}

            {/* Theme Toggle */}
            {onToggleDarkMode && (
              <button
                onClick={onToggleDarkMode}
                className="p-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white bg-slate-50 dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors cursor-pointer"
                title={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                aria-label="Toggle Dark Mode"
              >
                {isDarkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-600" />}
              </button>
            )}
          </div>

          {/* Mobile 3-Dot Utility Menu Button (⋮) */}
          <div className="md:hidden relative" ref={menuRef}>
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="p-1.5 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              title="More options"
              aria-label="More options"
            >
              <MoreVertical className="w-4 h-4" />
            </button>

            {/* Mobile 3-Dot Floating Dropdown */}
            {isMobileMenuOpen && (
              <div className="absolute right-0 top-full mt-1 w-52 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl py-1.5 z-50 text-xs font-medium space-y-0.5 animate-in fade-in zoom-in-95 duration-100">
                {!isNativeAndroid && (
                  <button
                    onClick={() => {
                      setIsMobileMenuOpen(false);
                      handleUpdateApp();
                    }}
                    disabled={isUpdatingApp}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 text-left transition-colors cursor-pointer disabled:opacity-50 font-bold"
                  >
                    <RotateCcw className={`w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0 ${isUpdatingApp ? 'animate-spin' : ''}`} />
                    <span>{isUpdatingApp ? 'Updating App...' : 'Update App (Hard Refresh)'}</span>
                  </button>
                )}

                {onRefresh && (
                  <button
                    onClick={() => {
                      setIsMobileMenuOpen(false);
                      onRefresh();
                    }}
                    disabled={isRefreshing}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 text-left transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-4 h-4 text-slate-600 dark:text-slate-400 shrink-0 ${isRefreshing ? 'animate-spin' : ''}`} />
                    <span>{isRefreshing ? 'Syncing...' : 'Sync Stock Data'}</span>
                  </button>
                )}

                {onToggleDarkMode && (
                  <button
                    onClick={() => {
                      setIsMobileMenuOpen(false);
                      onToggleDarkMode();
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 text-left transition-colors cursor-pointer"
                  >
                    {isDarkMode ? (
                      <>
                        <Sun className="w-4 h-4 text-amber-400 shrink-0" />
                        <span>Light Mode</span>
                      </>
                    ) : (
                      <>
                        <Moon className="w-4 h-4 text-slate-600 shrink-0" />
                        <span>Dark Mode</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
