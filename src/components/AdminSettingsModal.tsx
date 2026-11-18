import React, { useState, useEffect, useCallback } from 'react';
import { 
  X, 
  Shield, 
  Upload, 
  Trash2, 
  Server, 
  CheckCircle2, 
  Barcode, 
  RefreshCw, 
  FileSpreadsheet, 
  AlertCircle, 
  AlertTriangle,
  Loader2,
  Sparkles,
  ShoppingBag,
  Layers,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  BookmarkCheck,
  Users
} from 'lucide-react';
import { BarcodeMasterUploadModal } from './BarcodeMasterUploadModal';
import { BarcodeOverridesManager } from './BarcodeOverridesManager';
import { PurchaseResponsibilityUploadModal } from './PurchaseResponsibilityUploadModal';
import { usePurchaseContact } from '../context/PurchaseContactContext';
import { StoreInfo, fetchBarcodeMasterStatus } from '../utils/api';
import { BarcodeMasterStatus, StockReportMeta, FocusMaster, FocusType, Product } from '../types';
import { clearBarcodeMasterDB } from '../utils/indexedDB';
import { useModalTransition } from '../utils/useModalTransition';

// ============================================================================
// 1. COMPACT REUSABLE UNIFORM UPLOAD CARD
// ============================================================================

export type BadgeVariant = 'active' | 'inactive' | 'warning' | 'neutral' | 'loading';

export interface UniformUploadCardProps {
  id?: string;
  // Header
  icon: React.ReactNode;
  iconBgColor: string;
  title: string;
  subtitle?: string;
  badge: {
    label: string;
    variant: BadgeVariant;
  };
  headerAction?: React.ReactNode;

  // File / Status row
  isLoaded: boolean;
  fileName?: string | null;
  summaryCount?: React.ReactNode;
  emptyText?: string;

  // Optional expanded details (e.g. for Barcode Master)
  expandedDetails?: React.ReactNode;
  detailsToggle?: {
    isOpen: boolean;
    onToggle: () => void;
    label: string;
  };

  // Actions
  leftAction?: React.ReactNode;
  primaryAction?: {
    label: string;
    icon?: React.ReactNode;
    onClick: () => void;
    variant?: 'primary' | 'destructive' | 'teal';
    disabled?: boolean;
    title?: string;
  };
  secondaryAction?: {
    icon: React.ReactNode;
    onClick: () => void;
    title: string;
    disabled?: boolean;
  };

  // Inline confirmation
  confirmPrompt?: {
    isOpen: boolean;
    title: string;
    description: string;
    confirmLabel: string;
    onCancel: () => void;
    onConfirm: () => void;
  };

  // Optional banner
  banner?: React.ReactNode;
  children?: React.ReactNode;
}

const getBadgeStyles = (variant: BadgeVariant): string => {
  switch (variant) {
    case 'active':
      return 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/80';
    case 'warning':
      return 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/80';
    case 'inactive':
      return 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700';
    case 'loading':
      return 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800/80';
    case 'neutral':
    default:
      return 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700';
  }
};

const getPrimaryButtonStyles = (variant?: 'primary' | 'destructive' | 'teal'): string => {
  switch (variant) {
    case 'destructive':
      return 'bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white shadow-2xs';
    case 'teal':
      return 'bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white shadow-2xs';
    case 'primary':
    default:
      return 'bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white shadow-2xs';
  }
};

export const UniformUploadCard: React.FC<UniformUploadCardProps> = ({
  id,
  icon,
  iconBgColor,
  title,
  badge,
  headerAction,
  isLoaded,
  fileName,
  summaryCount,
  expandedDetails,
  detailsToggle,
  leftAction,
  primaryAction,
  secondaryAction,
  confirmPrompt,
  banner,
  children
}) => {
  return (
    <div
      id={id}
      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-2.5 sm:p-3 shadow-xs space-y-2 transition-colors text-slate-800 dark:text-slate-100"
    >
      {/* 1) HEADER ROW */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className={`p-1.5 rounded-lg border shrink-0 flex items-center justify-center ${iconBgColor}`}>
            {icon}
          </div>
          <h3 className="text-xs sm:text-[13px] font-black tracking-wide text-slate-900 dark:text-white uppercase whitespace-nowrap">
            {title}
          </h3>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {headerAction}
          <span
            className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${getBadgeStyles(
              badge.variant
            )}`}
          >
            {badge.variant === 'active' && (
              <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
            )}
            {badge.variant === 'loading' && (
              <Loader2 className="w-3 h-3 text-indigo-600 dark:text-indigo-400 animate-spin shrink-0" />
            )}
            {badge.variant === 'warning' && (
              <AlertTriangle className="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0" />
            )}
            {badge.variant === 'inactive' && (
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-slate-500 shrink-0" />
            )}
            <span>{badge.label}</span>
          </span>
        </div>
      </div>

      {/* Inline Confirmation Prompt */}
      {confirmPrompt && confirmPrompt.isOpen && (
        <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/80 rounded-xl p-2.5 sm:p-3 space-y-1.5 animate-fade-in">
          <div className="flex items-center gap-1.5 text-rose-800 dark:text-rose-200 font-bold text-xs">
            <Trash2 className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
            <span>{confirmPrompt.title}</span>
          </div>
          <p className="text-[11px] text-rose-700 dark:text-rose-300 font-medium leading-relaxed">
            {confirmPrompt.description}
          </p>
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={confirmPrompt.onCancel}
              className="px-3 py-1.5 min-h-[38px] sm:min-h-[32px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-semibold cursor-pointer transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmPrompt.onConfirm}
              className="px-3.5 py-1.5 min-h-[38px] sm:min-h-[32px] bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold cursor-pointer transition-colors shadow-2xs"
            >
              {confirmPrompt.confirmLabel}
            </button>
          </div>
        </div>
      )}

      {/* Optional Banner (e.g. error or notice) */}
      {banner}

      {/* 2) COMPACT FILE / STATUS ROW (Summary Only) */}
      <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 rounded-xl px-2.5 py-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div
            className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 border ${
              isLoaded
                ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 border-slate-200 dark:border-slate-700'
                : 'bg-slate-100 dark:bg-slate-800/80 text-slate-400 dark:text-slate-500 border-slate-200/60 dark:border-slate-700/60'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
          </div>
          <p
            className={`text-xs font-bold truncate ${
              isLoaded ? 'text-slate-900 dark:text-white' : 'text-slate-400 dark:text-slate-500 italic'
            }`}
            title={fileName || undefined}
          >
            {isLoaded ? fileName || 'Active File' : 'No file loaded'}
          </p>
        </div>

        {summaryCount ? (
          <div className="shrink-0">
            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-black font-mono bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 border border-indigo-200/70 dark:border-indigo-800/60">
              {summaryCount}
            </span>
          </div>
        ) : (
          <div className="shrink-0">
            <span className="text-xs text-slate-400 dark:text-slate-500 font-mono">—</span>
          </div>
        )}
      </div>

      {/* Optional Expanded Details View */}
      {expandedDetails}

      {/* Children content */}
      {children}

      {/* 3) COMPACT ACTION ROW */}
      {(primaryAction || secondaryAction || detailsToggle || leftAction) && (
        <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 pt-1 border-t border-slate-100 dark:border-slate-800/80">
          <div className="flex items-center gap-1.5">
            {leftAction}
            {detailsToggle && (
              <button
                type="button"
                onClick={detailsToggle.onToggle}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 cursor-pointer transition-colors p-1 rounded-md"
              >
                <span>{detailsToggle.label}</span>
                {detailsToggle.isOpen ? (
                  <ChevronUp className="w-3 h-3" />
                ) : (
                  <ChevronDown className="w-3 h-3" />
                )}
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 justify-end ml-auto">
            {primaryAction && (
              <button
                type="button"
                onClick={primaryAction.onClick}
                disabled={primaryAction.disabled}
                title={primaryAction.title}
                className={`min-h-[38px] sm:min-h-[34px] px-3 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 select-none ${getPrimaryButtonStyles(
                  primaryAction.variant
                )}`}
              >
                {primaryAction.icon || <Upload className="w-3.5 h-3.5" />}
                <span>{primaryAction.label}</span>
              </button>
            )}

            {secondaryAction && (
              <button
                type="button"
                onClick={secondaryAction.onClick}
                disabled={secondaryAction.disabled}
                title={secondaryAction.title}
                className="min-h-[38px] min-w-[38px] sm:min-h-[34px] sm:min-w-[34px] p-2 rounded-xl text-xs font-semibold inline-flex items-center justify-center transition-all cursor-pointer disabled:opacity-50 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/50 border border-rose-200 dark:border-rose-800/80 text-rose-600 dark:text-rose-400"
              >
                {secondaryAction.icon}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// 2. MOBILE ACCORDION ROW COMPONENT
// ============================================================================

interface MobileAccordionRowProps {
  id: string;
  icon: React.ReactNode;
  iconBgColor: string;
  title: string;
  badge?: {
    label: string;
    variant: BadgeVariant;
  };
  count?: string | null;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

export const MobileAccordionRow: React.FC<MobileAccordionRowProps> = ({
  id,
  icon,
  iconBgColor,
  title,
  badge,
  count,
  isOpen,
  onToggle,
  children
}) => {
  return (
    <div
      id={id}
      className={`bg-white dark:bg-slate-900 border rounded-xl overflow-hidden shadow-xs transition-colors ${
        isOpen
          ? 'border-indigo-300 dark:border-indigo-700/80 ring-1 ring-indigo-500/20'
          : 'border-slate-200 dark:border-slate-800'
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-2 p-2.5 sm:p-3 text-left hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors cursor-pointer min-h-[48px] select-none"
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className={`p-1.5 rounded-lg border shrink-0 flex items-center justify-center ${iconBgColor}`}>
            {icon}
          </div>
          <span className="text-xs sm:text-[13px] font-black tracking-wide text-slate-900 dark:text-white uppercase whitespace-nowrap">
            {title}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {badge && (
            <span
              className={`inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${getBadgeStyles(
                badge.variant
              )}`}
            >
              {badge.label}
            </span>
          )}
          {count && (
            <span className="text-[10px] font-mono font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/70 px-1.5 py-0.5 rounded border border-indigo-200/70 dark:border-indigo-800/60 shrink-0">
              {count}
            </span>
          )}
          <ChevronRight
            className={`w-4 h-4 text-slate-400 dark:text-slate-500 transition-transform duration-200 shrink-0 ${
              isOpen ? 'rotate-90 text-indigo-600 dark:text-indigo-400' : ''
            }`}
          />
        </div>
      </button>

      {isOpen && (
        <div className="px-2.5 pb-2.5 pt-1 space-y-2 border-t border-slate-100 dark:border-slate-800/80 animate-fade-in">
          {children}
        </div>
      )}
    </div>
  );
};

// ============================================================================
// 3. MAIN ADMIN SETTINGS MODAL
// ============================================================================

interface AdminSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  reportMeta: StockReportMeta | null;
  productCount: number;
  products?: Product[];
  onClearStoreStock: (storeId: string) => void;
  storesList: StoreInfo[];
  onOpenUploadForStore: (storeId: string, storeName: string) => void;
  coreMaster?: FocusMaster | null;
  nonCoreMaster?: FocusMaster | null;
  onOpenFocusUpload?: (type: FocusType) => void;
  onClearFocusMaster?: (type: FocusType) => Promise<void>;
  onResetOfflineAppData?: () => Promise<void>;
  onReloadStock?: () => void;
}

export const AdminSettingsModal: React.FC<AdminSettingsModalProps> = ({
  isOpen,
  onClose,
  reportMeta,
  productCount,
  products = [],
  onClearStoreStock,
  storesList,
  onOpenUploadForStore,
  coreMaster,
  nonCoreMaster,
  onOpenFocusUpload,
  onClearFocusMaster,
  onResetOfflineAppData,
  onReloadStock
}) => {
  const [confirmClearStock, setConfirmClearStock] = useState(false);
  const [confirmClearBarcode, setConfirmClearBarcode] = useState(false);
  const [confirmClearPurchase, setConfirmClearPurchase] = useState(false);
  const [confirmClearCoreFocus, setConfirmClearCoreFocus] = useState(false);
  const [confirmClearNonCoreFocus, setConfirmClearNonCoreFocus] = useState(false);
  const [confirmResetApp, setConfirmResetApp] = useState(false);

  // Mobile Accordion State (all collapsed by default, only one open at a time)
  type MobileSectionKey = 'stock' | 'barcode' | 'purchase' | 'overrides' | 'core' | 'non_core' | 'offline' | null;
  const [mobileExpandedSection, setMobileExpandedSection] = useState<MobileSectionKey>(null);

  const toggleMobileSection = (section: MobileSectionKey) => {
    setMobileExpandedSection(prev => (prev === section ? null : section));
  };

  // Purchase Responsibility Master State
  const {
    meta: purchaseMeta,
    isLoading: isLoadingPurchase,
    storageError: purchaseStorageError,
    clearStorageError: clearPurchaseStorageError,
    reloadMaster: reloadPurchaseMaster,
    removeMaster: removePurchaseMaster
  } = usePurchaseContact();
  const [isPurchaseUploadModalOpen, setIsPurchaseUploadModalOpen] = useState<boolean>(false);

  // Barcode Master State
  const [barcodeMaster, setBarcodeMaster] = useState<BarcodeMasterStatus | null>(null);
  const [isLoadingMaster, setIsLoadingMaster] = useState<boolean>(false);
  const [masterError, setMasterError] = useState<string | null>(null);
  const [isBarcodeUploadModalOpen, setIsBarcodeUploadModalOpen] = useState<boolean>(false);

  const loadBarcodeMaster = useCallback(async () => {
    setIsLoadingMaster(true);
    setMasterError(null);
    try {
      const status = await fetchBarcodeMasterStatus();
      setBarcodeMaster(status);
    } catch (err: any) {
      setMasterError(err.message || 'Failed to fetch Barcode Master status');
    } finally {
      setIsLoadingMaster(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadBarcodeMaster();
    }
  }, [isOpen, loadBarcodeMaster]);

  const { handleClose, backdropClass, panelClass } = useModalTransition({
    onClose,
    isOpen,
    duration: 170
  });

  if (!isOpen) return null;

  const store1 = storesList.find(s => s.id === 'store_1') || {
    id: 'store_1',
    name: 'Store 1',
    active: true,
    productCount: productCount || 0,
    stockVersion: 1,
    lastUploadedAt: reportMeta?.uploadedAt || null,
    lastFileName: reportMeta?.fileName || null
  };

  const hasActiveBarcodeMaster = Boolean(
    barcodeMaster && (
      (barcodeMaster.totalMappings && barcodeMaster.totalMappings > 0) ||
      Boolean(barcodeMaster.filename) ||
      Boolean(barcodeMaster.version)
    )
  );

  const handleClearBarcodeMaster = async () => {
    try {
      await clearBarcodeMasterDB();
      await loadBarcodeMaster();
      setConfirmClearBarcode(false);
    } catch (err) {
      console.error('Failed to clear Barcode Master:', err);
    }
  };

  return (
    <>
      <div
        className={`fixed inset-0 bg-slate-900/60 dark:bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-2.5 sm:p-4 ${backdropClass}`}
        onClick={(e) => {
          if (e.target === e.currentTarget) handleClose();
        }}
      >
        <div className={`bg-white dark:bg-slate-900 border border-indigo-500/80 dark:border-indigo-500/60 rounded-2xl p-3 sm:p-4 max-w-2xl w-full shadow-2xl relative max-h-[92vh] flex flex-col mobile-bottom-sheet ${panelClass}`}>
          {/* Close Button */}
          <button
            type="button"
            onClick={handleClose}
            className="absolute top-3.5 right-3.5 p-2 text-slate-400 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer min-w-[44px] min-h-[44px] flex items-center justify-center z-10"
            title="Close Settings"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Compact Modal Header */}
          <div className="flex items-center gap-2.5 border-b border-slate-200 dark:border-slate-800 pb-2 shrink-0 pr-10">
            <div className="p-1.5 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 rounded-lg border border-indigo-200 dark:border-indigo-800/60 shadow-2xs shrink-0">
              <Shield className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div className="flex items-center gap-2 min-w-0 flex-wrap">
              <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-white tracking-tight">
                Settings & Offline Data
              </h2>
              <span className="text-[9px] font-bold text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 px-1.5 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800/60">
                Offline Engine
              </span>
            </div>
          </div>

          {/* Modal Scrollable Body */}
          <div className="overflow-y-auto pr-0.5 sm:pr-1 space-y-2.5 py-2.5 flex-1 min-h-0">
            {/* ======================================================== */}
            {/* MOBILE ACCORDION VIEW (Devices < 768px) */}
            {/* ======================================================== */}
            <div className="block md:hidden space-y-2">
              {/* 1. STOCK DATA ACCORDION */}
              <MobileAccordionRow
                id="mobile-stock-accordion"
                icon={<Server className="w-3.5 h-3.5" />}
                iconBgColor="bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border-indigo-100 dark:border-indigo-800/60"
                title="Stock Data"
                badge={{
                  label: productCount > 0 ? 'Active' : 'Not Loaded',
                  variant: productCount > 0 ? 'active' : 'inactive'
                }}
                count={productCount > 0 ? `${productCount.toLocaleString()} SKUs` : null}
                isOpen={mobileExpandedSection === 'stock'}
                onToggle={() => toggleMobileSection('stock')}
              >
                {/* File Row */}
                <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 rounded-xl px-2.5 py-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 border ${productCount > 0 ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 border-slate-200 dark:border-slate-700' : 'bg-slate-100 dark:bg-slate-800/80 text-slate-400 dark:text-slate-500 border-slate-200/60 dark:border-slate-700/60'}`}>
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                    </div>
                    <p className={`text-xs font-bold truncate ${productCount > 0 ? 'text-slate-900 dark:text-white' : 'text-slate-400 dark:text-slate-500 italic'}`}>
                      {productCount > 0 ? store1.lastFileName || reportMeta?.fileName || 'REG-STAT Stock Report' : 'No file loaded'}
                    </p>
                  </div>
                  {productCount > 0 && (
                    <div className="shrink-0">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-black font-mono bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 border border-indigo-200/70 dark:border-indigo-800/60">
                        {productCount.toLocaleString()} SKUs
                      </span>
                    </div>
                  )}
                </div>

                {/* Inline Confirmation Prompt */}
                {confirmClearStock && (
                  <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/80 rounded-xl p-2.5 space-y-1.5 animate-fade-in">
                    <div className="flex items-center gap-1.5 text-rose-800 dark:text-rose-200 font-bold text-xs">
                      <Trash2 className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
                      <span>Clear Stock Data?</span>
                    </div>
                    <p className="text-[11px] text-rose-700 dark:text-rose-300 font-medium leading-relaxed">
                      Are you sure you want to remove all loaded stock data ({store1.productCount.toLocaleString()} SKUs)?
                    </p>
                    <div className="flex items-center justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setConfirmClearStock(false)}
                        className="px-3 py-1.5 min-h-[36px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-semibold cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onClearStoreStock('store_1');
                          setConfirmClearStock(false);
                        }}
                        className="px-3.5 py-1.5 min-h-[36px] bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold cursor-pointer shadow-2xs"
                      >
                        Clear Stock
                      </button>
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center justify-between gap-2 pt-1">
                  <div>
                    {onReloadStock && productCount > 0 && (
                      <button
                        type="button"
                        onClick={onReloadStock}
                        className="px-2.5 py-1.5 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 transition-colors inline-flex items-center gap-1.5 cursor-pointer min-h-[38px]"
                        title="Reload active inventory from local IndexedDB storage"
                      >
                        <RefreshCw className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
                        <span>Reload Storage</span>
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 justify-end">
                    <button
                      type="button"
                      onClick={() => onOpenUploadForStore('store_1', 'Store 1')}
                      className="min-h-[38px] px-3.5 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white shadow-2xs cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>Upload / Replace</span>
                    </button>
                    {productCount > 0 && (
                      <button
                        type="button"
                        onClick={() => setConfirmClearStock(true)}
                        className="min-h-[38px] min-w-[38px] p-2 rounded-xl text-xs font-semibold inline-flex items-center justify-center cursor-pointer bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/50 border border-rose-200 dark:border-rose-800/80 text-rose-600 dark:text-rose-400"
                        title="Clear Loaded Stock Data"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </MobileAccordionRow>

              {/* 2. BARCODE MASTER ACCORDION */}
              <MobileAccordionRow
                id="mobile-barcode-master-accordion"
                icon={<Barcode className="w-3.5 h-3.5" />}
                iconBgColor="bg-violet-50 dark:bg-violet-950/60 text-violet-600 dark:text-violet-400 border-violet-100 dark:border-violet-800/60"
                title="Barcode Master"
                badge={{
                  label: isLoadingMaster && !barcodeMaster ? 'Checking...' : masterError ? 'Error' : hasActiveBarcodeMaster ? 'Active' : 'Not Loaded',
                  variant: isLoadingMaster && !barcodeMaster ? 'loading' : masterError ? 'warning' : hasActiveBarcodeMaster ? 'active' : 'inactive'
                }}
                count={hasActiveBarcodeMaster ? `${(barcodeMaster?.totalMappings ?? 0).toLocaleString()} Maps` : null}
                isOpen={mobileExpandedSection === 'barcode'}
                onToggle={() => toggleMobileSection('barcode')}
              >
                {/* File Row */}
                <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 rounded-xl px-2.5 py-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 border ${hasActiveBarcodeMaster ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 border-slate-200 dark:border-slate-700' : 'bg-slate-100 dark:bg-slate-800/80 text-slate-400 dark:text-slate-500 border-slate-200/60 dark:border-slate-700/60'}`}>
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                    </div>
                    <p className={`text-xs font-bold truncate ${hasActiveBarcodeMaster ? 'text-slate-900 dark:text-white' : 'text-slate-400 dark:text-slate-500 italic'}`}>
                      {hasActiveBarcodeMaster ? barcodeMaster?.filename || 'Active Barcode Master' : 'No file loaded'}
                    </p>
                  </div>
                  {hasActiveBarcodeMaster && (
                    <div className="shrink-0">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-black font-mono bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 border border-indigo-200/70 dark:border-indigo-800/60">
                        {(barcodeMaster?.totalMappings ?? 0).toLocaleString()} Maps
                      </span>
                    </div>
                  )}
                </div>

                {/* Error Banner */}
                {masterError && (
                  <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/80 rounded-lg p-2 text-xs text-rose-700 dark:text-rose-300 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <AlertCircle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
                      <span className="truncate text-[10.5px]">{masterError}</span>
                    </div>
                    <button
                      type="button"
                      onClick={loadBarcodeMaster}
                      className="text-[11px] font-bold text-rose-700 dark:text-rose-300 underline cursor-pointer shrink-0"
                    >
                      Retry
                    </button>
                  </div>
                )}

                {/* Inline Confirmation Prompt */}
                {confirmClearBarcode && (
                  <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/80 rounded-xl p-2.5 space-y-1.5 animate-fade-in">
                    <div className="flex items-center gap-1.5 text-rose-800 dark:text-rose-200 font-bold text-xs">
                      <Trash2 className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
                      <span>Clear Barcode Master?</span>
                    </div>
                    <p className="text-[11px] text-rose-700 dark:text-rose-300 font-medium leading-relaxed">
                      Are you sure you want to clear the Barcode Master database? Cross-reference code-to-EAN mappings will be removed from offline storage.
                    </p>
                    <div className="flex items-center justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setConfirmClearBarcode(false)}
                        className="px-3 py-1.5 min-h-[36px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-semibold cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleClearBarcodeMaster}
                        className="px-3.5 py-1.5 min-h-[36px] bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold cursor-pointer shadow-2xs"
                      >
                        Clear Barcode Master
                      </button>
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center justify-between gap-2 pt-1">
                  <button
                    type="button"
                    onClick={loadBarcodeMaster}
                    disabled={isLoadingMaster}
                    className="p-2 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer min-h-[38px] min-w-[38px] flex items-center justify-center"
                    title="Refresh Barcode Master Status"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoadingMaster ? 'animate-spin text-indigo-600 dark:text-indigo-400' : ''}`} />
                  </button>
                  <div className="flex items-center gap-1.5 justify-end">
                    <button
                      type="button"
                      onClick={() => setIsBarcodeUploadModalOpen(true)}
                      className="min-h-[38px] px-3.5 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white shadow-2xs cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>Upload / Replace</span>
                    </button>
                    {hasActiveBarcodeMaster && (
                      <button
                        type="button"
                        onClick={() => setConfirmClearBarcode(true)}
                        className="min-h-[38px] min-w-[38px] p-2 rounded-xl text-xs font-semibold inline-flex items-center justify-center cursor-pointer bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/50 border border-rose-200 dark:border-rose-800/80 text-rose-600 dark:text-rose-400"
                        title="Clear Barcode Master Database"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </MobileAccordionRow>

              {/* 2B. PURCHASE RESPONSIBILITY MASTER ACCORDION */}
              <MobileAccordionRow
                id="mobile-purchase-responsibility-accordion"
                icon={<Users className="w-3.5 h-3.5" />}
                iconBgColor="bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-800/60"
                title="Purchase Responsibility Master"
                badge={{
                  label: isLoadingPurchase && !purchaseMeta ? 'Checking...' : purchaseStorageError ? 'Attention' : purchaseMeta ? 'Active' : 'Not Loaded',
                  variant: isLoadingPurchase && !purchaseMeta ? 'loading' : purchaseStorageError ? 'warning' : purchaseMeta ? 'active' : 'inactive'
                }}
                count={purchaseMeta ? `${purchaseMeta.uniqueProductCodesCount.toLocaleString('en-IN')} Codes` : null}
                isOpen={mobileExpandedSection === 'purchase'}
                onToggle={() => toggleMobileSection('purchase')}
              >
                <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 rounded-xl px-2.5 py-2 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 border ${purchaseMeta ? 'bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 border-slate-200 dark:border-slate-700' : 'bg-slate-100 dark:bg-slate-800/80 text-slate-400 dark:text-slate-500 border-slate-200/60 dark:border-slate-700/60'}`}>
                        <FileSpreadsheet className="w-3.5 h-3.5" />
                      </div>
                      <p className={`text-xs font-bold truncate ${purchaseMeta ? 'text-slate-900 dark:text-white' : 'text-slate-400 dark:text-slate-500 italic'}`}>
                        {purchaseMeta ? purchaseMeta.fileName : 'No master uploaded'}
                      </p>
                    </div>
                    {purchaseMeta && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-black font-mono bg-emerald-50 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-200/70 dark:border-emerald-800/60 shrink-0">
                        {purchaseMeta.uniqueProductCodesCount.toLocaleString('en-IN')} Codes
                      </span>
                    )}
                  </div>
                  {purchaseMeta && (
                    <div className="text-[10.5px] text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-x-2 gap-y-0.5 pl-8">
                      <span>Sheet: {purchaseMeta.sheetName}</span>
                      <span>•</span>
                      <span>Imported: {new Date(purchaseMeta.importedAt).toLocaleString()}</span>
                      <span>•</span>
                      <span>{purchaseMeta.validAssignmentsCount.toLocaleString('en-IN')} assignments</span>
                    </div>
                  )}
                </div>

                {purchaseStorageError && (
                  <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/80 rounded-lg p-2 text-xs text-rose-700 dark:text-rose-300 flex items-center justify-between gap-2">
                    <div className="flex items-start gap-1.5 min-w-0">
                      <AlertCircle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                      <span className="text-[10.5px] leading-snug">{purchaseStorageError}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        clearPurchaseStorageError();
                        reloadPurchaseMaster();
                      }}
                      className="text-[11px] font-bold text-rose-700 dark:text-rose-300 underline cursor-pointer shrink-0"
                    >
                      Retry
                    </button>
                  </div>
                )}

                {purchaseMeta && (purchaseMeta.conflictingCodesCount > 0 || purchaseMeta.missingOrInvalidPhoneCount > 0) && (
                  <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/70 rounded-lg px-2.5 py-1.5 text-[11px] text-amber-900 dark:text-amber-200 flex items-start gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <span>
                      {purchaseMeta.conflictingCodesCount > 0 ? `${purchaseMeta.conflictingCodesCount} code conflict(s)` : ''}
                      {purchaseMeta.conflictingCodesCount > 0 && purchaseMeta.missingOrInvalidPhoneCount > 0 ? ' • ' : ''}
                      {purchaseMeta.missingOrInvalidPhoneCount > 0 ? `${purchaseMeta.missingOrInvalidPhoneCount} missing/invalid phone(s)` : ''}
                    </span>
                  </div>
                )}

                <p className="text-[10.5px] text-slate-500 dark:text-slate-400 leading-snug">
                  Saved on this device/browser only. Stock Report uploads never overwrite purchase contacts.
                </p>

                {confirmClearPurchase && (
                  <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/80 rounded-xl p-2.5 space-y-1.5 animate-fade-in">
                    <div className="flex items-center gap-1.5 text-rose-800 dark:text-rose-200 font-bold text-xs">
                      <Trash2 className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
                      <span>Remove Purchase Responsibility Master?</span>
                    </div>
                    <p className="text-[11px] text-rose-700 dark:text-rose-300 font-medium leading-relaxed">
                      All saved purchase contacts on this device will be removed immediately and product cards will show &ldquo;Purchase contact not assigned.&rdquo;
                    </p>
                    <div className="flex items-center justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setConfirmClearPurchase(false)}
                        className="px-3 py-1.5 min-h-[36px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-semibold cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          await removePurchaseMaster();
                          setConfirmClearPurchase(false);
                        }}
                        className="px-3.5 py-1.5 min-h-[36px] bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold cursor-pointer shadow-2xs"
                      >
                        Remove Master
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between gap-2 pt-1">
                  <button
                    type="button"
                    onClick={reloadPurchaseMaster}
                    disabled={isLoadingPurchase}
                    className="p-2 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer min-h-[38px] min-w-[38px] flex items-center justify-center"
                    title="Refresh Purchase Master Status"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoadingPurchase ? 'animate-spin text-indigo-600 dark:text-indigo-400' : ''}`} />
                  </button>
                  <div className="flex items-center gap-1.5 justify-end">
                    <button
                      type="button"
                      onClick={() => setIsPurchaseUploadModalOpen(true)}
                      className="min-h-[38px] px-3.5 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white shadow-2xs cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>{purchaseMeta ? 'Replace Master' : 'Upload Master'}</span>
                    </button>
                    {purchaseMeta && (
                      <button
                        type="button"
                        onClick={() => setConfirmClearPurchase(true)}
                        className="min-h-[38px] min-w-[38px] p-2 rounded-xl text-xs font-semibold inline-flex items-center justify-center cursor-pointer bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/50 border border-rose-200 dark:border-rose-800/80 text-rose-600 dark:text-rose-400"
                        title="Remove Purchase Responsibility Master"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </MobileAccordionRow>

              {/* 3. BARCODE OVERRIDES ACCORDION */}
              <MobileAccordionRow
                id="mobile-barcode-overrides-accordion"
                icon={<BookmarkCheck className="w-3.5 h-3.5" />}
                iconBgColor="bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border-indigo-100 dark:border-indigo-800/60"
                title="Barcode Overrides"
                badge={{
                  label: 'Offline DB',
                  variant: 'neutral'
                }}
                isOpen={mobileExpandedSection === 'overrides'}
                onToggle={() => toggleMobileSection('overrides')}
              >
                <div className="pt-1">
                  <BarcodeOverridesManager products={products} isDarkMode={false} />
                </div>
              </MobileAccordionRow>

              {/* 4. CORE FOCUS ACCORDION */}
              <MobileAccordionRow
                id="mobile-core-focus-accordion"
                icon={<ShoppingBag className="w-3.5 h-3.5" />}
                iconBgColor="bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border-indigo-100 dark:border-indigo-800/60"
                title="Core Focus"
                badge={{
                  label: coreMaster ? 'Active' : 'Not Loaded',
                  variant: coreMaster ? 'active' : 'inactive'
                }}
                count={coreMaster ? `${coreMaster.items.length.toLocaleString()} Items` : null}
                isOpen={mobileExpandedSection === 'core'}
                onToggle={() => toggleMobileSection('core')}
              >
                {/* File Row */}
                <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 rounded-xl px-2.5 py-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 border ${coreMaster ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 border-slate-200 dark:border-slate-700' : 'bg-slate-100 dark:bg-slate-800/80 text-slate-400 dark:text-slate-500 border-slate-200/60 dark:border-slate-700/60'}`}>
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                    </div>
                    <p className={`text-xs font-bold truncate ${coreMaster ? 'text-slate-900 dark:text-white' : 'text-slate-400 dark:text-slate-500 italic'}`}>
                      {coreMaster?.fileName || (coreMaster ? 'Active Core Focus' : 'No file loaded')}
                    </p>
                  </div>
                  {coreMaster && (
                    <div className="shrink-0">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-black font-mono bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 border border-indigo-200/70 dark:border-indigo-800/60">
                        {coreMaster.items.length.toLocaleString()} Items
                      </span>
                    </div>
                  )}
                </div>

                {/* Inline Confirmation Prompt */}
                {confirmClearCoreFocus && (
                  <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/80 rounded-xl p-2.5 space-y-1.5 animate-fade-in">
                    <div className="flex items-center gap-1.5 text-rose-800 dark:text-rose-200 font-bold text-xs">
                      <Trash2 className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
                      <span>Clear Core Focus?</span>
                    </div>
                    <p className="text-[11px] text-rose-700 dark:text-rose-300 font-medium leading-relaxed">
                      Are you sure you want to remove the active Core Focus master dataset?
                    </p>
                    <div className="flex items-center justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setConfirmClearCoreFocus(false)}
                        className="px-3 py-1.5 min-h-[36px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-semibold cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          if (onClearFocusMaster) await onClearFocusMaster('core');
                          setConfirmClearCoreFocus(false);
                        }}
                        className="px-3.5 py-1.5 min-h-[36px] bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold cursor-pointer shadow-2xs"
                      >
                        Clear Core Master
                      </button>
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center justify-end gap-1.5 pt-1">
                  <button
                    type="button"
                    onClick={() => onOpenFocusUpload?.('core')}
                    className="min-h-[38px] px-3.5 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white shadow-2xs cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload / Replace</span>
                  </button>
                  {coreMaster && onClearFocusMaster && (
                    <button
                      type="button"
                      onClick={() => setConfirmClearCoreFocus(true)}
                      className="min-h-[38px] min-w-[38px] p-2 rounded-xl text-xs font-semibold inline-flex items-center justify-center cursor-pointer bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/50 border border-rose-200 dark:border-rose-800/80 text-rose-600 dark:text-rose-400"
                      title="Clear Core Focus"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </MobileAccordionRow>

              {/* 4. NON-CORE FOCUS ACCORDION */}
              <MobileAccordionRow
                id="mobile-non-core-focus-accordion"
                icon={<Layers className="w-3.5 h-3.5" />}
                iconBgColor="bg-teal-50 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400 border-teal-100 dark:border-teal-800/60"
                title="Non-Core Focus"
                badge={{
                  label: nonCoreMaster ? 'Active' : 'Not Loaded',
                  variant: nonCoreMaster ? 'active' : 'inactive'
                }}
                count={nonCoreMaster ? `${nonCoreMaster.items.length.toLocaleString()} Items` : null}
                isOpen={mobileExpandedSection === 'non_core'}
                onToggle={() => toggleMobileSection('non_core')}
              >
                {/* File Row */}
                <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 rounded-xl px-2.5 py-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 border ${nonCoreMaster ? 'bg-white dark:bg-slate-800 text-teal-600 dark:text-teal-400 border-slate-200 dark:border-slate-700' : 'bg-slate-100 dark:bg-slate-800/80 text-slate-400 dark:text-slate-500 border-slate-200/60 dark:border-slate-700/60'}`}>
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                    </div>
                    <p className={`text-xs font-bold truncate ${nonCoreMaster ? 'text-slate-900 dark:text-white' : 'text-slate-400 dark:text-slate-500 italic'}`}>
                      {nonCoreMaster?.fileName || (nonCoreMaster ? 'Active Non-Core Focus' : 'No file loaded')}
                    </p>
                  </div>
                  {nonCoreMaster && (
                    <div className="shrink-0">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-black font-mono bg-teal-50 dark:bg-teal-950/70 text-teal-700 dark:text-teal-300 border border-teal-200/70 dark:border-teal-800/60">
                        {nonCoreMaster.items.length.toLocaleString()} Items
                      </span>
                    </div>
                  )}
                </div>

                {/* Inline Confirmation Prompt */}
                {confirmClearNonCoreFocus && (
                  <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/80 rounded-xl p-2.5 space-y-1.5 animate-fade-in">
                    <div className="flex items-center gap-1.5 text-rose-800 dark:text-rose-200 font-bold text-xs">
                      <Trash2 className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
                      <span>Clear Non-Core Focus?</span>
                    </div>
                    <p className="text-[11px] text-rose-700 dark:text-rose-300 font-medium leading-relaxed">
                      Are you sure you want to remove the active Non-Core Focus master dataset?
                    </p>
                    <div className="flex items-center justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setConfirmClearNonCoreFocus(false)}
                        className="px-3 py-1.5 min-h-[36px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-semibold cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          if (onClearFocusMaster) await onClearFocusMaster('non_core');
                          setConfirmClearNonCoreFocus(false);
                        }}
                        className="px-3.5 py-1.5 min-h-[36px] bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold cursor-pointer shadow-2xs"
                      >
                        Clear Non-Core Master
                      </button>
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center justify-end gap-1.5 pt-1">
                  <button
                    type="button"
                    onClick={() => onOpenFocusUpload?.('non_core')}
                    className="min-h-[38px] px-3.5 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5 bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white shadow-2xs cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload / Replace</span>
                  </button>
                  {nonCoreMaster && onClearFocusMaster && (
                    <button
                      type="button"
                      onClick={() => setConfirmClearNonCoreFocus(true)}
                      className="min-h-[38px] min-w-[38px] p-2 rounded-xl text-xs font-semibold inline-flex items-center justify-center cursor-pointer bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/50 border border-rose-200 dark:border-rose-800/80 text-rose-600 dark:text-rose-400"
                      title="Clear Non-Core Focus"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </MobileAccordionRow>

              {/* 5. OFFLINE APP DATA ACCORDION */}
              <MobileAccordionRow
                id="mobile-offline-data-accordion"
                icon={<RotateCcw className="w-3.5 h-3.5" />}
                iconBgColor="bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 border-rose-100 dark:border-rose-800/60"
                title="Offline App Data"
                isOpen={mobileExpandedSection === 'offline'}
                onToggle={() => toggleMobileSection('offline')}
              >
                {/* Inline Confirmation Prompt */}
                {confirmResetApp && (
                  <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/80 rounded-xl p-2.5 space-y-1.5 animate-fade-in">
                    <div className="flex items-center gap-1.5 text-rose-800 dark:text-rose-200 font-bold text-xs">
                      <Trash2 className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
                      <span>Reset Offline App Data?</span>
                    </div>
                    <p className="text-[11px] text-rose-700 dark:text-rose-300 font-medium leading-relaxed">
                      This will permanently delete all offline stock datasets, Barcode Master, Focus lists, and floor check records stored in IndexedDB.
                    </p>
                    <div className="flex items-center justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setConfirmResetApp(false)}
                        className="px-3 py-1.5 min-h-[36px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-semibold cursor-pointer transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          if (onResetOfflineAppData) {
                            await onResetOfflineAppData();
                          }
                          setConfirmResetApp(false);
                        }}
                        className="px-3.5 py-1.5 min-h-[36px] bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold cursor-pointer transition-colors shadow-2xs"
                      >
                        Yes, Reset All Data
                      </button>
                    </div>
                  </div>
                )}

                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  Deletes all locally stored app data.
                </p>

                <div className="flex items-center justify-end pt-1">
                  <button
                    type="button"
                    onClick={() => setConfirmResetApp(true)}
                    className="min-h-[38px] px-3.5 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-all cursor-pointer bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white shadow-2xs w-full sm:w-auto"
                    title="Permanently wipe local IndexedDB database and reset app"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reset Offline App Data</span>
                  </button>
                </div>
              </MobileAccordionRow>
            </div>

            {/* ======================================================== */}
            {/* DESKTOP EXPANDED CARDS VIEW (Devices >= 768px) */}
            {/* ======================================================== */}
            <div className="hidden md:block space-y-2.5">
              {/* 1. STOCK DATA */}
              <UniformUploadCard
                id="admin-stock-card"
                icon={<Server className="w-3.5 h-3.5" />}
                iconBgColor="bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border-indigo-100 dark:border-indigo-800/60"
                title="Stock Data"
                badge={{
                  label: productCount > 0 ? 'Active' : 'Not Loaded',
                  variant: productCount > 0 ? 'active' : 'inactive'
                }}
                leftAction={
                  onReloadStock && productCount > 0 ? (
                    <button
                      type="button"
                      onClick={onReloadStock}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 transition-colors inline-flex items-center gap-1.5 cursor-pointer min-h-[36px] sm:min-h-[32px]"
                      title="Reload active inventory from local IndexedDB storage"
                    >
                      <RefreshCw className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
                      <span>Reload Storage</span>
                    </button>
                  ) : undefined
                }
                isLoaded={productCount > 0}
                fileName={store1.lastFileName || reportMeta?.fileName || (productCount > 0 ? 'REG-STAT Stock Report' : null)}
                summaryCount={productCount > 0 ? `${productCount.toLocaleString()} SKUs` : null}
                primaryAction={{
                  label: 'Upload / Replace',
                  icon: <Upload className="w-3.5 h-3.5" />,
                  onClick: () => onOpenUploadForStore('store_1', 'Store 1'),
                  title: 'Upload or Replace Stock File'
                }}
                secondaryAction={
                  productCount > 0
                    ? {
                        icon: <Trash2 className="w-3.5 h-3.5" />,
                        onClick: () => setConfirmClearStock(true),
                        title: 'Clear Loaded Stock Data'
                      }
                    : undefined
                }
                confirmPrompt={{
                  isOpen: confirmClearStock,
                  title: 'Clear Stock Data?',
                  description: `Are you sure you want to remove all loaded stock data (${store1.productCount.toLocaleString()} SKUs)? Stock search and floor audit will be reset until re-uploaded.`,
                  confirmLabel: 'Clear Stock',
                  onCancel: () => setConfirmClearStock(false),
                  onConfirm: () => {
                    onClearStoreStock('store_1');
                    setConfirmClearStock(false);
                  }
                }}
              />

              {/* 2. BARCODE MASTER */}
              <UniformUploadCard
                id="admin-barcode-master-card"
                icon={<Barcode className="w-3.5 h-3.5" />}
                iconBgColor="bg-violet-50 dark:bg-violet-950/60 text-violet-600 dark:text-violet-400 border-violet-100 dark:border-violet-800/60"
                title="Barcode Master"
                headerAction={
                  <button
                    type="button"
                    onClick={loadBarcodeMaster}
                    disabled={isLoadingMaster}
                    className="p-1 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors cursor-pointer disabled:opacity-50"
                    title="Refresh Barcode Master Status"
                  >
                    <RefreshCw className={`w-3 h-3 ${isLoadingMaster ? 'animate-spin text-indigo-600 dark:text-indigo-400' : ''}`} />
                  </button>
                }
                badge={{
                  label: isLoadingMaster && !barcodeMaster ? 'Checking...' : masterError ? 'Error' : hasActiveBarcodeMaster ? 'Active' : 'Not Loaded',
                  variant: isLoadingMaster && !barcodeMaster ? 'loading' : masterError ? 'warning' : hasActiveBarcodeMaster ? 'active' : 'inactive'
                }}
                isLoaded={hasActiveBarcodeMaster}
                fileName={barcodeMaster?.filename || (hasActiveBarcodeMaster ? 'Active Barcode Master' : null)}
                summaryCount={
                  hasActiveBarcodeMaster
                    ? `${(barcodeMaster?.totalMappings ?? 0).toLocaleString()} Mappings`
                    : null
                }
                banner={
                  masterError ? (
                    <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/80 rounded-lg p-2 text-xs text-rose-700 dark:text-rose-300 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <AlertCircle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
                        <span className="truncate text-[10.5px]">{masterError}</span>
                      </div>
                      <button
                        type="button"
                        onClick={loadBarcodeMaster}
                        className="text-[11px] font-bold text-rose-700 dark:text-rose-300 underline cursor-pointer shrink-0"
                      >
                        Retry
                      </button>
                    </div>
                  ) : null
                }
                primaryAction={{
                  label: 'Upload / Replace',
                  icon: <Upload className="w-3.5 h-3.5" />,
                  onClick: () => setIsBarcodeUploadModalOpen(true),
                  title: 'Upload or Replace Barcode Master Excel sheet'
                }}
                secondaryAction={
                  hasActiveBarcodeMaster
                    ? {
                        icon: <Trash2 className="w-3.5 h-3.5" />,
                        onClick: () => setConfirmClearBarcode(true),
                        title: 'Clear Barcode Master Database'
                      }
                    : undefined
                }
                confirmPrompt={{
                  isOpen: confirmClearBarcode,
                  title: 'Clear Barcode Master?',
                  description: 'Are you sure you want to clear the Barcode Master database? Cross-reference code-to-EAN mappings will be removed from offline storage.',
                  confirmLabel: 'Clear Barcode Master',
                  onCancel: () => setConfirmClearBarcode(false),
                  onConfirm: handleClearBarcodeMaster
                }}
              />

              {/* 2B. PURCHASE RESPONSIBILITY MASTER */}
              <UniformUploadCard
                id="admin-purchase-responsibility-card"
                icon={<Users className="w-3.5 h-3.5" />}
                iconBgColor="bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-800/60"
                title="Purchase Responsibility Master"
                headerAction={
                  <button
                    type="button"
                    onClick={reloadPurchaseMaster}
                    disabled={isLoadingPurchase}
                    className="p-1 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors cursor-pointer disabled:opacity-50"
                    title="Refresh Purchase Master Status"
                  >
                    <RefreshCw className={`w-3 h-3 ${isLoadingPurchase ? 'animate-spin text-indigo-600 dark:text-indigo-400' : ''}`} />
                  </button>
                }
                badge={{
                  label: isLoadingPurchase && !purchaseMeta ? 'Checking...' : purchaseStorageError ? 'Attention' : purchaseMeta ? 'Active' : 'Not Loaded',
                  variant: isLoadingPurchase && !purchaseMeta ? 'loading' : purchaseStorageError ? 'warning' : purchaseMeta ? 'active' : 'inactive'
                }}
                isLoaded={Boolean(purchaseMeta)}
                fileName={purchaseMeta?.fileName || null}
                summaryCount={
                  purchaseMeta
                    ? `${purchaseMeta.uniqueProductCodesCount.toLocaleString('en-IN')} Codes`
                    : null
                }
                banner={
                  purchaseStorageError || (purchaseMeta && (purchaseMeta.conflictingCodesCount > 0 || purchaseMeta.missingOrInvalidPhoneCount > 0)) ? (
                    <div className="space-y-1.5">
                      {purchaseStorageError && (
                        <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/80 rounded-lg p-2 text-xs text-rose-700 dark:text-rose-300 flex items-center justify-between gap-2">
                          <div className="flex items-start gap-1.5 min-w-0">
                            <AlertCircle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                            <span className="text-[10.5px] leading-snug">{purchaseStorageError}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              clearPurchaseStorageError();
                              reloadPurchaseMaster();
                            }}
                            className="text-[11px] font-bold text-rose-700 dark:text-rose-300 underline cursor-pointer shrink-0"
                          >
                            Retry
                          </button>
                        </div>
                      )}
                      {purchaseMeta && (purchaseMeta.conflictingCodesCount > 0 || purchaseMeta.missingOrInvalidPhoneCount > 0) && (
                        <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/70 rounded-lg px-2.5 py-1.5 text-[11px] text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                          <span>
                            {purchaseMeta.conflictingCodesCount > 0 ? `${purchaseMeta.conflictingCodesCount} code conflict(s)` : ''}
                            {purchaseMeta.conflictingCodesCount > 0 && purchaseMeta.missingOrInvalidPhoneCount > 0 ? ' • ' : ''}
                            {purchaseMeta.missingOrInvalidPhoneCount > 0 ? `${purchaseMeta.missingOrInvalidPhoneCount} missing/invalid phone(s)` : ''}
                          </span>
                        </div>
                      )}
                    </div>
                  ) : null
                }
                primaryAction={{
                  label: purchaseMeta ? 'Replace Master' : 'Upload Master',
                  icon: <Upload className="w-3.5 h-3.5" />,
                  onClick: () => setIsPurchaseUploadModalOpen(true),
                  title: 'Upload or Replace Purchase Responsibility Master'
                }}
                secondaryAction={
                  purchaseMeta
                    ? {
                        icon: <Trash2 className="w-3.5 h-3.5" />,
                        onClick: () => setConfirmClearPurchase(true),
                        title: 'Remove Purchase Responsibility Master'
                      }
                    : undefined
                }
                confirmPrompt={{
                  isOpen: confirmClearPurchase,
                  title: 'Remove Purchase Responsibility Master?',
                  description: 'All saved purchase contacts on this device will be deleted immediately and products will show "Purchase contact not assigned."',
                  confirmLabel: 'Remove Master',
                  onCancel: () => setConfirmClearPurchase(false),
                  onConfirm: async () => {
                    await removePurchaseMaster();
                    setConfirmClearPurchase(false);
                  }
                }}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 text-[10.5px] text-slate-500 dark:text-slate-400 px-0.5">
                  <span>
                    {purchaseMeta
                      ? `Sheet: ${purchaseMeta.sheetName} • Imported: ${new Date(purchaseMeta.importedAt).toLocaleString()} • ${purchaseMeta.validAssignmentsCount.toLocaleString('en-IN')} assignments`
                      : 'Upload Excel/CSV with BANSAL CODE, ITEM NAME, PURCHASE NAME, PUCHASE NB'}
                  </span>
                  <span className="font-medium text-slate-600 dark:text-slate-300">
                    Saved on this device/browser
                  </span>
                </div>
              </UniformUploadCard>

              {/* 3. BARCODE OVERRIDES SECTION */}
              <div
                id="admin-barcode-overrides-card"
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-2.5 sm:p-3 shadow-xs space-y-2 transition-colors"
              >
                <div className="flex items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="p-1.5 rounded-lg border shrink-0 flex items-center justify-center bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border-indigo-100 dark:border-indigo-800/60">
                      <BookmarkCheck className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <h3 className="text-xs sm:text-[13px] font-black tracking-wide text-slate-900 dark:text-white uppercase whitespace-nowrap">
                        Barcode Overrides
                      </h3>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Saved conflict mapping overrides for store scanning
                      </p>
                    </div>
                  </div>

                  <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full border bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800/80 shrink-0">
                    IndexedDB
                  </span>
                </div>

                <BarcodeOverridesManager products={products} isDarkMode={false} />
              </div>

              {/* 4. FOCUS SECTION (CORE FOCUS & NON-CORE FOCUS) */}
              <div className="grid grid-cols-2 gap-2.5">
                {/* CORE FOCUS */}
                <UniformUploadCard
                  id="admin-core-focus-card"
                  icon={<ShoppingBag className="w-3.5 h-3.5" />}
                  iconBgColor="bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border-indigo-100 dark:border-indigo-800/60"
                  title="Core Focus"
                  badge={{
                    label: coreMaster ? 'Active' : 'Not Loaded',
                    variant: coreMaster ? 'active' : 'inactive'
                  }}
                  isLoaded={Boolean(coreMaster)}
                  fileName={coreMaster?.fileName || null}
                  summaryCount={coreMaster ? `${coreMaster.items.length.toLocaleString()} Items` : null}
                  primaryAction={{
                    label: 'Upload / Replace',
                    icon: <Upload className="w-3.5 h-3.5" />,
                    onClick: () => onOpenFocusUpload?.('core'),
                    title: 'Upload or Replace Core Focus file'
                  }}
                  secondaryAction={
                    coreMaster && onClearFocusMaster
                      ? {
                          icon: <Trash2 className="w-3.5 h-3.5" />,
                          onClick: () => setConfirmClearCoreFocus(true),
                          title: 'Clear Core Focus'
                        }
                      : undefined
                  }
                  confirmPrompt={{
                    isOpen: confirmClearCoreFocus,
                    title: 'Clear Core Focus?',
                    description: 'Are you sure you want to remove the active Core Focus master dataset?',
                    confirmLabel: 'Clear Core Master',
                    onCancel: () => setConfirmClearCoreFocus(false),
                    onConfirm: async () => {
                      if (onClearFocusMaster) await onClearFocusMaster('core');
                      setConfirmClearCoreFocus(false);
                    }
                  }}
                />

                {/* NON-CORE FOCUS */}
                <UniformUploadCard
                  id="admin-non-core-focus-card"
                  icon={<Layers className="w-3.5 h-3.5" />}
                  iconBgColor="bg-teal-50 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400 border-teal-100 dark:border-teal-800/60"
                  title="Non-Core Focus"
                  badge={{
                    label: nonCoreMaster ? 'Active' : 'Not Loaded',
                    variant: nonCoreMaster ? 'active' : 'inactive'
                  }}
                  isLoaded={Boolean(nonCoreMaster)}
                  fileName={nonCoreMaster?.fileName || null}
                  summaryCount={nonCoreMaster ? `${nonCoreMaster.items.length.toLocaleString()} Items` : null}
                  primaryAction={{
                    label: 'Upload / Replace',
                    icon: <Upload className="w-3.5 h-3.5" />,
                    onClick: () => onOpenFocusUpload?.('non_core'),
                    title: 'Upload or Replace Non-Core Focus file'
                  }}
                  secondaryAction={
                    nonCoreMaster && onClearFocusMaster
                      ? {
                          icon: <Trash2 className="w-3.5 h-3.5" />,
                          onClick: () => setConfirmClearNonCoreFocus(true),
                          title: 'Clear Non-Core Focus'
                        }
                      : undefined
                  }
                  confirmPrompt={{
                    isOpen: confirmClearNonCoreFocus,
                    title: 'Clear Non-Core Focus?',
                    description: 'Are you sure you want to remove the active Non-Core Focus master dataset?',
                    confirmLabel: 'Clear Non-Core Master',
                    onCancel: () => setConfirmClearNonCoreFocus(false),
                    onConfirm: async () => {
                      if (onClearFocusMaster) await onClearFocusMaster('non_core');
                      setConfirmClearNonCoreFocus(false);
                    }
                  }}
                />
              </div>

              {/* 4. OFFLINE APP DATA */}
              <div
                id="admin-offline-data-card"
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-2.5 sm:p-3 shadow-xs space-y-2 transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="p-1.5 rounded-lg border shrink-0 flex items-center justify-center bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 border-rose-100 dark:border-rose-800/60">
                      <RotateCcw className="w-3.5 h-3.5" />
                    </div>
                    <h3 className="text-xs sm:text-[13px] font-black tracking-wide text-slate-900 dark:text-white uppercase whitespace-nowrap">
                      Offline App Data
                    </h3>
                  </div>

                  <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full border bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/80 shrink-0">
                    Local Storage
                  </span>
                </div>

                {/* Inline Confirmation Prompt */}
                {confirmResetApp && (
                  <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/80 rounded-xl p-2.5 sm:p-3 space-y-1.5 animate-fade-in">
                    <div className="flex items-center gap-1.5 text-rose-800 dark:text-rose-200 font-bold text-xs">
                      <Trash2 className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
                      <span>Reset Offline App Data?</span>
                    </div>
                    <p className="text-[11px] text-rose-700 dark:text-rose-300 font-medium leading-relaxed">
                      This will permanently delete all offline stock datasets, Barcode Master, Focus lists, and floor check records stored in IndexedDB.
                    </p>
                    <div className="flex items-center justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setConfirmResetApp(false)}
                        className="px-3 py-1.5 min-h-[38px] sm:min-h-[32px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-semibold cursor-pointer transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          if (onResetOfflineAppData) {
                            await onResetOfflineAppData();
                          }
                          setConfirmResetApp(false);
                        }}
                        className="px-3.5 py-1.5 min-h-[38px] sm:min-h-[32px] bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold cursor-pointer transition-colors shadow-2xs"
                      >
                        Yes, Reset All Data
                      </button>
                    </div>
                  </div>
                )}

                {/* Short Warning */}
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  Deletes all locally stored app data.
                </p>

                {/* Action */}
                <div className="flex items-center justify-end pt-1 border-t border-slate-100 dark:border-slate-800/80">
                  <button
                    type="button"
                    onClick={() => setConfirmResetApp(true)}
                    className="min-h-[38px] sm:min-h-[34px] px-3.5 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-all cursor-pointer bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white shadow-2xs"
                    title="Permanently wipe local IndexedDB database and reset app"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reset Offline App Data</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Compact Modal Footer */}
          <div className="pt-2 border-t border-slate-200 dark:border-slate-800 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="w-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold py-2 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 text-xs min-h-[44px] sm:min-h-[38px]"
            >
              <span>Close Settings</span>
            </button>
          </div>
        </div>
      </div>

      <BarcodeMasterUploadModal
        isOpen={isBarcodeUploadModalOpen}
        onClose={() => setIsBarcodeUploadModalOpen(false)}
        onSuccess={() => {
          loadBarcodeMaster();
        }}
      />

      <PurchaseResponsibilityUploadModal
        isOpen={isPurchaseUploadModalOpen}
        onClose={() => setIsPurchaseUploadModalOpen(false)}
      />
    </>
  );
};
