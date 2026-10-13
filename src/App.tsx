import React, { useState, useEffect, useMemo, useRef } from 'react';
import { CheckCircle2, AlertCircle, X } from 'lucide-react';
import { Header } from './components/Header';
import { SearchInput } from './components/SearchInput';
import { ProductCard } from './components/ProductCard';
import { UploadModal } from './components/UploadModal';
import { BarcodeScannerModal } from './components/BarcodeScannerModal';
import { ProductTableModal } from './components/ProductTableModal';
import { ScanHistory } from './components/ScanHistory';
import { BarcodeLabelModal } from './components/BarcodeLabelModal';
import { MatchingProductsList } from './components/MatchingProductsList';
import { AdminSettingsModal } from './components/AdminSettingsModal';
import { AiScannerModal } from './components/AiScannerModal';
import { Sidebar } from './components/Sidebar';
import { Breadcrumbs, VIEW_TITLES } from './components/Breadcrumbs';
import { ProductDetailModal } from './components/ProductDetailModal';
import {
  resolveOfflineBarcode,
  resolveScannedBarcode,
  resolveScannedBarcodeStrict,
  searchProductsFlexible,
  findExactMatchingProductsInStock,
  normalizeLocalCode,
  normalizeScannedBarcode,
  BarcodeCandidateProduct,
  BarcodeMasterIdentity,
  BarcodeOverride
} from './utils/barcodeResolver';
import { BarcodeConflictModal } from './components/BarcodeConflictModal';
import { useHardwareBarcodeScanner, ScannerFeedbackData, SessionScanItem, ScannerContextMode } from './utils/hardwareScanner';
import { ScannerFeedbackBanner } from './components/scanner/ScannerFeedbackBanner';
import { ScannerModeIndicator } from './components/scanner/ScannerModeIndicator';
import { SessionScanHistoryModal } from './components/scanner/SessionScanHistoryModal';

// Analytics Module Views
import { DashboardView } from './components/analytics/DashboardView';
import { FastMovingView } from './components/analytics/FastMovingView';
import { SlowMovingView } from './components/analytics/SlowMovingView';
import { DeadStockView } from './components/analytics/DeadStockView';
import { ZeroSalesView } from './components/analytics/ZeroSalesView';
import { OverstockView } from './components/analytics/OverstockView';
import { LowStockView } from './components/analytics/LowStockView';
import { OutOfStockView } from './components/analytics/OutOfStockView';
import { InventoryValueView } from './components/analytics/InventoryValueView';
import { CategoryDashboardView } from './components/analytics/CategoryDashboardView';
import { BrandDashboardView } from './components/analytics/BrandDashboardView';
import { SupplierDashboardView } from './components/analytics/SupplierDashboardView';
import { CategoryBrandSupplierIntelligenceView } from './components/analytics/CategoryBrandSupplierIntelligenceView';
import { AbcAnalysisView } from './components/analytics/AbcAnalysisView';
import { MarginAnalysisView } from './components/analytics/MarginAnalysisView';
import { StockAgeView } from './components/analytics/StockAgeView';
import { AiRecommendationsView } from './components/analytics/AiRecommendationsView';
import { ReplenishmentView } from './components/analytics/ReplenishmentView';
import { TopSalesSection } from './components/analytics/TopSalesSection';
import { ReportsExportCenterView } from './components/reports/ReportsExportCenterView';
import { AnalyticsTable } from './components/analytics/AnalyticsTable';
import { StockVariationsView } from './components/analytics/StockVariationsView';
import { loadStockVariations, enrichProductsWithVariations, StockVariation } from './utils/stockVariations';
import { FloorAuditHub } from './components/audit/FloorAuditHub';
import { FloorAuditRunner } from './components/audit/FloorAuditRunner';
import { FlaggedFollowUpView } from './components/audit/FlaggedFollowUpView';
import { NearExpiryHub } from './components/nearExpiry/NearExpiryHub';
import { BsmiqHome } from './components/BsmiqHome';
import { FocusIQHub } from './components/focus/FocusIQHub';
import { FocusProductListView } from './components/focus/FocusProductListView';
import { FocusIssuesView } from './components/focus/FocusIssuesView';
import { FocusOfferMismatchView } from './components/focus/FocusOfferMismatchView';
import { FocusFlaggedIssuesView } from './components/focus/FocusFlaggedIssuesView';
import { FocusHistoryView } from './components/focus/FocusHistoryView';
import { FocusUploadModal } from './components/focus/FocusUploadModal';
import { evaluateFocusProductsWithLiveStock, evaluateFocusOfferProducts } from './utils/focusMatcher';

import { Product, StockReportMeta, ScanHistoryItem, AnalyticsViewType, AppMode, ComputedProductAnalytics, AuditSession, AuditProductResult, AuditType, UploadProgressData, FocusMaster, FocusType } from './types';
import { createSession } from './utils/auditStorage';
import { loadAllFocusMasters, saveFocusMaster, setActiveFocusMaster, deleteFocusMaster } from './utils/focusStorage';
import { playSuccessBeep, playErrorBeep, playWarningBeep, triggerVibration } from './utils/audio';
import { cleanBarcode } from './utils/fileParser';
import {
  computeAllProductAnalytics,
  computeDashboardSummary
} from './utils/analytics';
import {
  fetchServerStock,
  fetchStockVersion,
  uploadServerStock,
  updateServerStockItem,
  deleteServerStockItems,
  clearServerStock,
  fetchStoresList,
  toggleStoreActive,
  StoreInfo
} from './utils/api';
import {
  getProductsDB,
  saveProductsDB,
  getMetaDB,
  saveMetaDB,
  getHistoryDB,
  saveHistoryDB,
  clearAllDB,
  clearAllOfflineDataDB,
  deleteProductDB,
  clearStoreDB,
  saveBarcodeOverrideDB
} from './utils/indexedDB';

import { Sparkles, ScanLine, Camera, Upload, Layers, Flame, ListFilter, Plus, ShieldCheck, Lock } from 'lucide-react';

const STORAGE_KEY_CLEARED = 'stockscan_cleared_v1';

export default function App() {
  const [products, setProducts] = useState<Product[]>([]);
  const [stockVariations, setStockVariations] = useState<Record<string, StockVariation>>(loadStockVariations);

  const effectiveProducts = useMemo(() => {
    return enrichProductsWithVariations(products, stockVariations);
  }, [products, stockVariations]);
  const [reportMeta, setReportMeta] = useState<StockReportMeta | null>(null);
  const [scanHistory, setScanHistory] = useState<ScanHistoryItem[]>([]);
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Single Store State (store_1)
  const selectedStoreId = 'store_1';
  const [storesList, setStoresList] = useState<StoreInfo[]>([]);
  const [uploadStoreTarget, setUploadStoreTarget] = useState<{ id: string; name: string } | null>(null);

  // Navigation & Theme
  const [appMode, setAppMode] = useState<AppMode>('stock_iq');
  const [currentView, setCurrentView] = useState<AnalyticsViewType>('bsmiq_home');
  const [viewHistory, setViewHistory] = useState<AnalyticsViewType[]>([]);
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    return localStorage.getItem('stockscan_theme') === 'dark';
  });
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // Focus IQ State & Active Masters
  const [focusScope, setFocusScope] = useState<FocusType>('core');
  const [allFocusMasters, setAllFocusMasters] = useState<FocusMaster[]>([]);
  const [isFocusUploadOpen, setIsFocusUploadOpen] = useState(false);
  const [focusUploadType, setFocusUploadType] = useState<FocusType>('core');
  const [focusIssueFilter, setFocusIssueFilter] = useState<'all' | 'out_of_stock' | 'low_stock'>('all');
  const [focusListFilter, setFocusListFilter] = useState<'all' | 'matched' | 'not_matched'>('all');
  const [focusOfferFilter, setFocusOfferFilter] = useState<'mismatch' | 'all' | 'mrp_changed' | 'manual_check' | 'unrecognized' | 'below_cost'>('mismatch');

  const coreMaster = useMemo(() => {
    const list = allFocusMasters.filter(m => m.type === 'core');
    if (list.length === 0) return null;
    const active = list.find(m => m.isActive);
    if (active) return active;
    list.sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
    return list[0];
  }, [allFocusMasters]);

  const nonCoreMaster = useMemo(() => {
    const list = allFocusMasters.filter(m => m.type === 'non_core');
    if (list.length === 0) return null;
    const active = list.find(m => m.isActive);
    if (active) return active;
    list.sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
    return list[0];
  }, [allFocusMasters]);

  const coreCheckStatus = useMemo<'in_progress' | 'completed' | 'none'>(() => {
    if (!coreMaster) return 'none';
    return 'in_progress';
  }, [coreMaster]);

  const nonCoreCheckStatus = useMemo<'in_progress' | 'completed' | 'none'>(() => {
    if (!nonCoreMaster) return 'none';
    return 'in_progress';
  }, [nonCoreMaster]);

  const coreIssuesCount = useMemo(() => {
    if (!coreMaster?.items || products.length === 0) return 0;
    const evaluated = evaluateFocusProductsWithLiveStock(coreMaster.items, products, reportMeta?.reportDays);
    return evaluated.filter(p => p.status === 'OUT_OF_STOCK' || p.status === 'LOW_STOCK').length;
  }, [coreMaster, products, reportMeta?.reportDays]);

  const nonCoreIssuesCount = useMemo(() => {
    if (!nonCoreMaster?.items || products.length === 0) return 0;
    const evaluated = evaluateFocusProductsWithLiveStock(nonCoreMaster.items, products, reportMeta?.reportDays);
    return evaluated.filter(p => p.status === 'OUT_OF_STOCK' || p.status === 'LOW_STOCK').length;
  }, [nonCoreMaster, products, reportMeta?.reportDays]);

  const coreOfferMismatchCount = useMemo(() => {
    if (!coreMaster?.items || products.length === 0) return 0;
    const evaluated = evaluateFocusOfferProducts(coreMaster.items, products);
    return evaluated.filter(p => p.offerStatus === 'MISMATCH').length;
  }, [coreMaster, products]);

  const nonCoreOfferMismatchCount = useMemo(() => {
    if (!nonCoreMaster?.items || products.length === 0) return 0;
    const evaluated = evaluateFocusOfferProducts(nonCoreMaster.items, products);
    return evaluated.filter(p => p.offerStatus === 'MISMATCH').length;
  }, [nonCoreMaster, products]);

  const loadFocusMastersData = async () => {
    try {
      const masters = await loadAllFocusMasters(selectedStoreId);
      setAllFocusMasters(masters);
    } catch (e) {
      console.warn('Error loading focus masters:', e);
    }
  };

  useEffect(() => {
    loadFocusMastersData();
  }, [selectedStoreId]);

  // App Mode Switch Handler (Cycles between BSM Stock IQ, BSM Floor IQ, and BSM Focus IQ)
  const handleToggleAppMode = () => {
    setAppMode((prevMode) => {
      let nextMode: AppMode = 'stock_iq';
      if (prevMode === 'stock_iq') {
        nextMode = 'floor_iq';
      } else if (prevMode === 'floor_iq') {
        nextMode = 'focus_iq';
      } else {
        nextMode = 'stock_iq';
      }

      if (nextMode === 'floor_iq') {
        setCurrentView((prevView) => {
          const isFloorView = prevView === 'floor_audit' || prevView === 'floor_audit_runner' || prevView === 'flagged_followup' || prevView === 'near_expiry';
          return isFloorView ? prevView : 'floor_audit';
        });
        setToast({ message: 'Switched mode to Floor IQ', type: 'info' });
      } else if (nextMode === 'focus_iq') {
        setCurrentView((prevView) => {
          const isFocusView = prevView === 'focus_home' || prevView === 'core_focus' || prevView === 'non_core_focus' || prevView === 'core_focus_issues' || prevView === 'non_core_focus_issues' || prevView === 'core_focus_offers' || prevView === 'non_core_focus_offers';
          return isFocusView ? prevView : 'focus_home';
        });
        setToast({ message: 'Switched mode to Focus IQ', type: 'info' });
      } else {
        setCurrentView((prevView) => {
          const isStockView = prevView !== 'floor_audit' && prevView !== 'floor_audit_runner' && prevView !== 'flagged_followup' && prevView !== 'near_expiry' && prevView !== 'focus_home' && prevView !== 'core_focus' && prevView !== 'non_core_focus' && prevView !== 'core_focus_issues' && prevView !== 'non_core_focus_issues' && prevView !== 'core_focus_offers' && prevView !== 'non_core_focus_offers';
          return isStockView ? prevView : 'dashboard';
        });
        setToast({ message: 'Switched mode to Stock IQ', type: 'info' });
      }
      return nextMode;
    });
  };

  // Active product selection & search
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [lastSearchedProduct, setLastSearchedProduct] = useState<Product | null>(null);
  const [inspectProduct, setInspectProduct] = useState<Product | null>(null);
  const [matchingProducts, setMatchingProducts] = useState<Product[]>([]);
  const [activeBarcode, setActiveBarcode] = useState<string>('');
  const [noProductFoundQuery, setNoProductFoundQuery] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Settings & Modals State
  const [isAdminSettingsOpen, setIsAdminSettingsOpen] = useState(false);

  // Modals state
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isAiScannerOpen, setIsAiScannerOpen] = useState(false);
  const [isTableOpen, setIsTableOpen] = useState(false);
  const [labelProduct, setLabelProduct] = useState<Product | null>(null);
  const [conflictModalData, setConflictModalData] = useState<{
    isOpen: boolean;
    barcode: string;
    candidates: Product[];
    candidateDetails?: BarcodeCandidateProduct[];
    masterIdentity?: BarcodeMasterIdentity;
    overrideIdentity?: BarcodeOverride;
    isStaleOverride?: boolean;
    context?: 'main' | 'focus' | 'near_expiry' | 'audit';
    sourceCallback?: (selectedProduct: Product) => void;
  }>({
    isOpen: false,
    barcode: '',
    candidates: []
  });
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Hardware / Context-Aware Barcode Scanner State
  const [scannerFeedback, setScannerFeedback] = useState<ScannerFeedbackData | null>(null);
  const [sessionScans, setSessionScans] = useState<SessionScanItem[]>([]);
  const [isScanHistoryOpen, setIsScanHistoryOpen] = useState<boolean>(false);

  const addSessionScan = (item: Omit<SessionScanItem, 'id' | 'timestamp'>) => {
    const newScan: SessionScanItem = {
      ...item,
      id: `scan-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toLocaleTimeString(),
    };
    setSessionScans((prev) => [newScan, ...prev.slice(0, 9)]);
  };

  const isFocusView = (view: AnalyticsViewType): boolean => {
    return (
      view === 'focus_home' ||
      view === 'core_focus' ||
      view === 'non_core_focus' ||
      view === 'core_focus_issues' ||
      view === 'non_core_focus_issues' ||
      view === 'core_focus_offers' ||
      view === 'non_core_focus_offers' ||
      view === 'core_focus_check' ||
      view === 'non_core_focus_check' ||
      view === 'focus_flagged_issues' ||
      view === 'focus_history'
    );
  };

  // Floor Audit State
  const [activeAuditData, setActiveAuditData] = useState<{
    session: AuditSession;
    results: AuditProductResult[];
  } | null>(null);

  const scannerMode: ScannerContextMode =
    currentView === 'floor_audit_runner' && !!activeAuditData
      ? 'floor_audit'
      : isFocusView(currentView)
      ? 'focus_iq'
      : 'global_search';

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => {
        setToast(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const handleStartAuditSession = (session: AuditSession, results: AuditProductResult[]) => {
    setActiveAuditData({ session, results });
    handleNavigateView('floor_audit_runner');
  };

  const handleStartAuditFromAnalytics = async (
    title: string | Product[],
    type?: AuditType | any,
    productsToAudit?: Product[],
    categoryFilter?: string,
    meta?: {
      categoryFilter?: string | string[];
      mainCodeFilter?: string | string[];
      rankRange?: string;
      filterConditions?: string;
      reportPeriod?: string;
      datasetVersion?: string;
    }
  ) => {
    // Handle overloaded call signature from AnalyticsTable (products, meta) vs standard signature
    let auditTitle = 'Floor IQ Audit';
    let auditType: AuditType = 'custom';
    let listToAudit: Product[] = [];
    let catFilter: string | undefined = categoryFilter;
    let auditMeta: any = meta;

    if (Array.isArray(title)) {
      listToAudit = title;
      auditTitle = `Floor Audit (${listToAudit.length} SKUs)`;
      auditType = 'custom';
      auditMeta = type as any;
    } else {
      auditTitle = title;
      auditType = type as AuditType;
      listToAudit = productsToAudit || [];
    }

    if (!listToAudit || listToAudit.length === 0) {
      showToast('No products available or filtered to audit.', 'error');
      return;
    }

    try {
      const reportPeriod = auditMeta?.reportPeriod || auditMeta?.periodText || auditMeta?.lastUpdated || undefined;
      const datasetVersion = auditMeta?.datasetVersion || (reportMeta?.version ? String(reportMeta.version) : undefined);
      const resolvedCatFilter = catFilter || (Array.isArray(auditMeta?.categoryFilter) ? auditMeta.categoryFilter.join(', ') : auditMeta?.categoryFilter);

      const { session, results } = await createSession({
        storeId: selectedStoreId,
        type: auditType,
        title: auditTitle,
        products: listToAudit,
        categoryFilter: resolvedCatFilter,
        mainCodeFilter: auditMeta?.mainCodeFilter,
        rankRange: auditMeta?.rankRange,
        filterConditions: auditMeta?.filterConditions,
        reportPeriod,
        datasetVersion,
      });
      handleStartAuditSession(session, results);
      showToast(`Started Floor Audit: "${auditTitle}" (${listToAudit.length} items)`, 'success');
    } catch (err) {
      console.error('Failed to start floor audit session:', err);
      showToast('Error creating floor audit session.', 'error');
    }
  };

  const handleStartFocusAudit = async (params: {
    focusType: FocusType;
    monthDisplay: string;
    sourceTitle: string;
    items: any[];
    categoryFilter?: string;
  }) => {
    const { focusType, monthDisplay, sourceTitle, items, categoryFilter } = params;
    if (!items || items.length === 0) {
      showToast('No items available to audit.', 'error');
      return;
    }

    try {
      const mappedProducts: Product[] = items.map((item, idx) => {
        const id = item.code || item.bansalCode || item.barcode || `focus_${focusType}_${idx}_${Date.now()}`;
        return {
          id: String(id),
          barcode: item.barcode || '',
          name: item.name || item.productName || item.itemName || 'Focus Item',
          code: item.code || item.bansalCode || '',
          bansalCode: item.code || item.bansalCode || '',
          localCode: item.code || item.bansalCode || '',
          mainCode: item.mainCode || '',
          category: item.category || 'Focus Category',
          brand: item.brand || '',
          stock: typeof item.stockQty === 'number' ? item.stockQty : 0,
          salesCount: typeof item.salesQty === 'number' ? item.salesQty : 0,
          retailPrice: typeof item.retailPrice === 'number' ? item.retailPrice : (typeof item.currentRetail === 'number' ? item.currentRetail : 0),
          mrp: typeof item.mrp === 'number' ? item.mrp : (typeof item.focusMrp === 'number' ? item.focusMrp : (typeof item.currentMrp === 'number' ? item.currentMrp : 0)),
          focusOffer: item.offer || item.focusOffer || '',
          focusMrp: typeof item.focusMrp === 'number' ? item.focusMrp : (typeof item.mrp === 'number' ? item.mrp : 0),
        } as any;
      });

      const auditType: AuditType = focusType === 'core' ? 'core_focus' : 'non_core_focus';
      const auditTitle = `${focusType === 'core' ? 'Core Focus' : 'Non-Core Focus'} Audit — ${monthDisplay}`;

      const { session, results } = await createSession({
        storeId: selectedStoreId,
        type: auditType,
        title: auditTitle,
        products: mappedProducts,
        categoryFilter,
        focusMonth: monthDisplay,
        sourceList: sourceTitle,
      });

      handleStartAuditSession(session, results);
      showToast(`Started ${focusType === 'core' ? 'Core' : 'Non-Core'} Focus Audit (${mappedProducts.length} products)`, 'success');
    } catch (err) {
      console.error('Failed to create focus audit session:', err);
      showToast('Error creating focus audit session.', 'error');
    }
  };

  // --- Centralized Back-Stack Navigation Management ---
  const isFloorViewType = (view: AnalyticsViewType) =>
    view === 'floor_audit' || view === 'floor_audit_runner' || view === 'flagged_followup' || view === 'near_expiry';

  const isFocusViewType = (view: AnalyticsViewType) =>
    view === 'focus_home' ||
    view === 'core_focus' ||
    view === 'non_core_focus' ||
    view === 'core_focus_issues' ||
    view === 'non_core_focus_issues' ||
    view === 'core_focus_offers' ||
    view === 'non_core_focus_offers' ||
    view === 'core_focus_check' ||
    view === 'non_core_focus_check' ||
    view === 'focus_flagged_issues' ||
    view === 'focus_history';

  const handleNavigateView = (newView: AnalyticsViewType, replace: boolean = false) => {
    if (newView === currentView) return;
    if (!replace) {
      setViewHistory((prev) => [...prev, currentView]);
    }
    const isFloorView = isFloorViewType(newView);
    const isFocusView = isFocusViewType(newView);
    
    if (isFloorView && appMode !== 'floor_iq') {
      setAppMode('floor_iq');
    } else if (isFocusView && appMode !== 'focus_iq') {
      setAppMode('focus_iq');
    } else if (!isFloorView && !isFocusView && appMode !== 'stock_iq') {
      setAppMode('stock_iq');
    }

    if (
      newView === 'core_focus' ||
      newView === 'core_focus_issues' ||
      newView === 'core_focus_offers' ||
      newView === 'core_focus_check'
    ) {
      setFocusScope('core');
    } else if (
      newView === 'non_core_focus' ||
      newView === 'non_core_focus_issues' ||
      newView === 'non_core_focus_offers' ||
      newView === 'non_core_focus_check'
    ) {
      setFocusScope('non_core');
    }

    setCurrentView(newView);
  };

  const handleGoBack = () => {
    if (isFocusUploadOpen) {
      setIsFocusUploadOpen(false);
      return;
    }
    if (labelProduct) {
      setLabelProduct(null);
      return;
    }
    if (inspectProduct) {
      setInspectProduct(null);
      setMatchingProducts([]);
      return;
    }
    if (isTableOpen) {
      setIsTableOpen(false);
      return;
    }
    if (isScannerOpen) {
      setIsScannerOpen(false);
      return;
    }
    if (isAiScannerOpen) {
      setIsAiScannerOpen(false);
      return;
    }
    if (isAdminSettingsOpen) {
      setIsAdminSettingsOpen(false);
      return;
    }
    if (isUploadOpen) {
      setIsUploadOpen(false);
      return;
    }
    if (viewHistory.length > 0) {
      const nextHistory = [...viewHistory];
      const targetView = nextHistory.pop()!;
      setViewHistory(nextHistory);
      const isFloor = isFloorViewType(targetView);
      const isFocus = isFocusViewType(targetView);
      if (isFloor && appMode !== 'floor_iq') {
        setAppMode('floor_iq');
      } else if (isFocus && appMode !== 'focus_iq') {
        setAppMode('focus_iq');
      } else if (!isFloor && !isFocus && appMode !== 'stock_iq') {
        setAppMode('stock_iq');
      }
      setCurrentView(targetView);
      return;
    }

    // Fallback back navigation strictly within active module hierarchy:
    if (isFocusViewType(currentView) && currentView !== 'focus_home') {
      setCurrentView('focus_home');
      return;
    }
    if (isFloorViewType(currentView) && currentView !== 'floor_audit') {
      setCurrentView('floor_audit');
      return;
    }
    if (!isFocusViewType(currentView) && !isFloorViewType(currentView) && currentView !== 'dashboard' && currentView !== 'bsmiq_home') {
      setCurrentView('dashboard');
      return;
    }
    if (currentView !== 'bsmiq_home') {
      setCurrentView('bsmiq_home');
      return;
    }
  };

  const inspectHistoryPushedRef = useRef(false);

  // Sync browser/device history when Product Inspector modal is opened or closed
  useEffect(() => {
    if (inspectProduct) {
      if (!inspectHistoryPushedRef.current) {
        window.history.pushState({ modal: 'product-inspector' }, '');
        inspectHistoryPushedRef.current = true;
      }
    } else {
      if (inspectHistoryPushedRef.current) {
        inspectHistoryPushedRef.current = false;
        if (window.history.state?.modal === 'product-inspector') {
          (window as any).__skipNextPopState = true;
          window.history.back();
        }
      }
    }
  }, [inspectProduct]);

  // Browser / Phone Back Navigation sync
  useEffect(() => {
    const onPopState = () => {
      if ((window as any).__skipNextPopState) {
        (window as any).__skipNextPopState = false;
        return;
      }
      handleGoBack();
    };
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
    };
  }, [
    isFocusUploadOpen,
    labelProduct,
    inspectProduct,
    isTableOpen,
    isScannerOpen,
    isAiScannerOpen,
    isAdminSettingsOpen,
    isUploadOpen,
    viewHistory,
    currentView
  ]);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast((curr) => (curr?.message === message ? null : curr));
    }, 4500);
  };

  const productsRef = useRef<Product[]>([]);
  const lastSyncTimeRef = useRef<string | null>(null);
  const lastSyncVersionRef = useRef<number | string | null>(null);
  const lastSyncUploadedRef = useRef<string | null>(null);
  const lastSyncProductCountRef = useRef<number | null>(null);

  // Keep productsRef synchronized with current products state to prevent stale closure reads
  useEffect(() => {
    productsRef.current = products;
  }, [products]);

  useEffect(() => {
    async function loadStores() {
      try {
        const list = await fetchStoresList();
        setStoresList(list);
      } catch (err) {
        console.warn('Failed to load stores list:', err);
      }
    }
    loadStores();
  }, []);

  useEffect(() => {
    localStorage.setItem('stockscan_selected_store', selectedStoreId);
  }, [selectedStoreId]);

  useEffect(() => {
    localStorage.setItem('stockscan_theme', isDarkMode ? 'dark' : 'light');
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  // Fast O(1) Barcode lookup map for 10,000+ SKUs
  const productMap = useMemo(() => {
    const map = new Map<string, Product>();
    for (let i = 0; i < products.length; i++) {
      const p = products[i];
      if (p.barcode) {
        const raw = p.barcode.toLowerCase();
        const cleaned = cleanBarcode(p.barcode).toLowerCase();
        map.set(raw, p);
        map.set(cleaned, p);
      }
      if (p.localCode) {
        const rawLocal = p.localCode.toLowerCase();
        const cleanedLocal = cleanBarcode(p.localCode).toLowerCase();
        map.set(rawLocal, p);
        if (cleanedLocal) map.set(cleanedLocal, p);
      }
    }
    return map;
  }, [products]);

  // Compute Analytics Map for all SKUs using centralized engine
  const analyticsEngineResult = useMemo(() => {
    return computeAllProductAnalytics(effectiveProducts, reportMeta);
  }, [products, reportMeta]);

  const analyticsMap = analyticsEngineResult.analyticsMap;

  // Dashboard summary metrics
  const dashboardSummary = useMemo(() => {
    return computeDashboardSummary(effectiveProducts, analyticsMap);
  }, [products, analyticsMap]);

  // Lightweight Version Check & Server Stock Sync (Server JSON is Single Source of Truth)
  useEffect(() => {
    let isMounted = true;
    
    // Reset sync refs on store change so fresh store data is fetched immediately
    lastSyncTimeRef.current = null;
    lastSyncVersionRef.current = null;
    lastSyncUploadedRef.current = null;
    lastSyncProductCountRef.current = null;

    // Reset selected product details when switching store
    setSelectedProduct(null);
    setInspectProduct(null);
    setMatchingProducts([]);
    setActiveBarcode('');

    async function initialLoad() {
      try {
        // Fast startup: load cached IndexedDB data immediately
        const cachedProds = await getProductsDB(selectedStoreId);
        const cachedMeta = await getMetaDB(selectedStoreId);
        const savedVersion = localStorage.getItem(`stockscan_version_${selectedStoreId}`);

        if (isMounted && cachedProds && cachedProds.length > 0) {
          productsRef.current = cachedProds;
          setProducts(cachedProds);
          if (cachedMeta) setReportMeta(cachedMeta);
          if (savedVersion) {
            lastSyncVersionRef.current = savedVersion;
          }
        }

        const dbHistory = await getHistoryDB();
        if (isMounted && dbHistory && dbHistory.length > 0) {
          const seenIds = new Set<string>();
          const sanitizedHistory = dbHistory.map((item, idx) => {
            let itemId = item.id;
            if (!itemId || seenIds.has(itemId)) {
              itemId = `scan-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 7)}`;
            }
            seenIds.add(itemId);
            return { ...item, id: itemId };
          });
          setScanHistory(sanitizedHistory);
        }

        const sList = await fetchStoresList();
        if (isMounted && sList.length > 0) {
          setStoresList(sList);
        }
      } catch (err) {
        console.warn('Initial load error:', err);
      }
    }

    initialLoad();

    return () => {
      isMounted = false;
    };
  }, []);

  // Local Refresh handler - reloads from local IndexedDB
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const list = await fetchStoresList().catch(() => []);
      if (list && list.length > 0) {
        setStoresList(list);
      }

      const localStock = await fetchServerStock('store_1');
      if (localStock && Array.isArray(localStock.products)) {
        productsRef.current = localStock.products;
        setProducts(localStock.products);
        setReportMeta(localStock.meta || null);
        showToast(
          `Local inventory reloaded: ${localStock.products.length.toLocaleString('en-IN')} products active.`,
          'success'
        );
      }
    } catch (error: any) {
      console.error('Refresh error:', error);
      showToast('Could not reload local inventory.', 'error');
    } finally {
      setIsRefreshing(false);
    }
  };

  // Handle searched code or text (manual typing, paste, or search submit)
  const handleSearchCode = async (scannedCode: string) => {
    if (!scannedCode || !scannedCode.trim()) {
      setSelectedProduct(null);
      setLastSearchedProduct(null);
      setInspectProduct(null);
      setMatchingProducts([]);
      setNoProductFoundQuery(null);
      setActiveBarcode('');
      setConflictModalData({ isOpen: false, barcode: '', candidates: [] });
      return;
    }

    // 1. Immediately reset/clear old product states before starting resolution
    setSelectedProduct(null);
    setLastSearchedProduct(null);
    setInspectProduct(null);
    setMatchingProducts([]);
    setNoProductFoundQuery(null);
    setActiveBarcode('');
    setConflictModalData({ isOpen: false, barcode: '', candidates: [] });

    try {
      // 1. First try exact barcode / local code / Barcode Master resolver
      const result = await resolveOfflineBarcode(scannedCode, products);

      // Successfully resolved via exact stock, saved override, Barcode Master, or store label fallback
      if (
        result.resolution === 'current_stock' ||
        result.resolution === 'saved_override' ||
        result.resolution === 'barcode_master' ||
        result.resolution === 'store_label_fallback'
      ) {
        const prod = result.product;
        if (prod) {
          if (soundEnabled) playSuccessBeep();
          setSelectedProduct(prod);
          setLastSearchedProduct(prod);
          setInspectProduct(null);
          setActiveBarcode(prod.barcode);
          setMatchingProducts([prod]);
          setNoProductFoundQuery(null);

          const historyItem: ScanHistoryItem = {
            id: `scan-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
            barcode: scannedCode,
            productName: prod.name,
            timestamp: new Date().toLocaleTimeString(),
            found: true,
            product: prod
          };
          setScanHistory(prev => {
            const next = [historyItem, ...prev.slice(0, 49)];
            saveHistoryDB(next).catch(() => {});
            return next;
          });

          if (result.resolution === 'saved_override') {
            showToast(result.message || 'Resolved via Saved Barcode Override 📌', 'success');
          } else if (result.resolution === 'store_label_fallback') {
            showToast(result.message || `Store Label • Code: ${result.storeLabelCode || prod.bansalCode || prod.code}`, 'success');
          } else if (result.resolution === 'barcode_master') {
            showToast('Resolved via Barcode Master ✅', 'success');
          }
          return;
        }
      }

      // True exact duplicate or identity conflict -> Show candidate choice modal
      if (
        result.resolution === 'barcode_identity_conflict' ||
        result.resolution === 'barcode_master_conflict' ||
        result.resolution === 'stale_override_conflict' ||
        result.resolution === 'current_stock_conflict' ||
        result.resolution === 'store_label_conflict' ||
        result.ambiguous
      ) {
        setConflictModalData({
          isOpen: true,
          barcode: scannedCode,
          candidates: result.candidates,
          candidateDetails: result.candidateDetails,
          masterIdentity: result.masterIdentity,
          overrideIdentity: result.overrideIdentity,
          isStaleOverride: result.isStaleOverride,
          context: 'main'
        });
        return;
      }

      // 2. Manual Search Fallback: For manual typing, support flexible text search
      const textMatches = searchProductsFlexible(scannedCode, products);

      if (textMatches.length === 1) {
        const prod = textMatches[0];
        if (soundEnabled) playSuccessBeep();
        setSelectedProduct(prod);
        setLastSearchedProduct(prod);
        setInspectProduct(null);
        setActiveBarcode(prod.barcode);
        setMatchingProducts([prod]);
        setNoProductFoundQuery(null);

        const historyItem: ScanHistoryItem = {
          id: `scan-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          barcode: scannedCode,
          productName: prod.name,
          timestamp: new Date().toLocaleTimeString(),
          found: true,
          product: prod
        };
        setScanHistory(prev => {
          const next = [historyItem, ...prev.slice(0, 49)];
          saveHistoryDB(next).catch(() => {});
          return next;
        });
        return;
      }

      if (textMatches.length > 1) {
        // When multiple text matches exist during manual search typing,
        // populate matching list for dropdown suggestions and keep active card cleared
        setMatchingProducts(textMatches);
        setNoProductFoundQuery(null);
        return;
      }

      // 3. Not found
      if (soundEnabled) playErrorBeep();
      setSelectedProduct(null);
      setInspectProduct(null);
      setMatchingProducts([]);
      setNoProductFoundQuery(scannedCode.trim());

      const historyItem: ScanHistoryItem = {
        id: `scan-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        barcode: scannedCode,
        productName: 'Unknown Product',
        timestamp: new Date().toLocaleTimeString(),
        found: false
      };
      setScanHistory(prev => {
        const next = [historyItem, ...prev.slice(0, 49)];
        saveHistoryDB(next).catch(() => {});
        return next;
      });

      if (result.resolution === 'mapped_product_not_in_current_stock') {
        showToast('Barcode mapped, but product is not in current stock.', 'error');
      } else if (result.resolution === 'mapped_but_no_stock') {
        showToast('Barcode is mapped, but no current stock file is loaded.', 'error');
      }
    } catch (err) {
      console.warn('Barcode master search lookup warning:', err);
    }
  };

  // Dedicated context-aware scanner resolution for CAMERA and HARDWARE HID BARCODE SCANNERS
  const dispatchScan = async (scannedCode: string) => {
    if (!scannedCode || !scannedCode.trim()) return;
    const rawCode = scannedCode.trim();

    // ==========================================
    // Priority Near Expiry: Stay inside Near Expiry Hub
    // ==========================================
    if (currentView === 'near_expiry') {
      window.dispatchEvent(
        new CustomEvent('near-expiry-scan', {
          detail: { barcode: rawCode },
        })
      );
      return;
    }

    // ==========================================
    // Priority A: Floor Audit (Active Runner)
    // ==========================================
    if (currentView === 'floor_audit_runner' && activeAuditData) {
      const resolved = await resolveScannedBarcodeStrict(rawCode, products);
      const auditResults = activeAuditData.results || [];

      let matchedResult: AuditProductResult | undefined;
      let resolvedProduct: Product | null = null;

      if (resolved.ok && resolved.product) {
        resolvedProduct = resolved.product;
        const pNormCode = normalizeLocalCode(resolvedProduct.bansalCode || resolvedProduct.localCode || resolvedProduct.code);
        matchedResult = auditResults.find(
          (r) =>
            r.productId === resolvedProduct!.id ||
            (pNormCode && normalizeLocalCode(r.bansalCode || r.code) === pNormCode) ||
            (r.bansalCode && resolvedProduct!.bansalCode && r.bansalCode === resolvedProduct!.bansalCode) ||
            (r.barcode && resolvedProduct!.barcode && r.barcode.toLowerCase() === resolvedProduct!.barcode.toLowerCase())
        );
      } else {
        const normCode = normalizeLocalCode(rawCode);
        const normBar = normalizeScannedBarcode(rawCode);
        matchedResult = auditResults.find((r) => {
          const rCode = normalizeLocalCode(r.bansalCode || r.code);
          const rBar = normalizeScannedBarcode(r.barcode);
          return (normCode && rCode === normCode) || (normBar && rBar === normBar) || r.productId === rawCode;
        });
        if (matchedResult) {
          resolvedProduct = products.find((p) => p.id === matchedResult!.productId) || null;
        }
      }

      // Result A1: MATCHED in this Floor Audit
      if (matchedResult) {
        const prodName = resolvedProduct?.name || matchedResult.productName || 'Audit SKU';
        const bansalCode = matchedResult.bansalCode || resolvedProduct?.bansalCode || matchedResult.code || '';

        if (soundEnabled) {
          playSuccessBeep();
          triggerVibration(80);
        }

        setScannerFeedback({
          id: `feedback-${Date.now()}`,
          type: 'matched',
          title: '✓ MATCHED',
          productName: prodName,
          bansalCode,
          barcode: rawCode,
          message: 'Item located in Floor Audit',
          timestamp: Date.now(),
        });

        addSessionScan({
          barcode: rawCode,
          productName: prodName,
          bansalCode,
          result: 'MATCHED',
          context: 'floor_audit',
        });

        window.dispatchEvent(
          new CustomEvent('floor-audit-scan-locate', {
            detail: {
              productId: matchedResult.productId,
              bansalCode,
              barcode: rawCode,
            },
          })
        );
        return;
      }

      // Result A2: NOT IN THIS AUDIT (Product exists in stock / Barcode Master, but not in this audit scope)
      if (resolved.ok && resolved.product) {
        const prodName = resolved.product.name;
        const bansalCode = resolved.product.bansalCode || resolved.product.localCode || '';
        const isDailyPur = activeAuditData.session.type === 'daily_purchase';

        if (soundEnabled) {
          playWarningBeep();
          triggerVibration([100, 50, 100]);
        }

        setScannerFeedback({
          id: `feedback-${Date.now()}`,
          type: 'not_in_audit',
          title: isDailyPur ? 'NOT IN THIS PURCHASE AUDIT' : 'NOT IN THIS AUDIT',
          productName: prodName,
          bansalCode,
          barcode: rawCode,
          message: isDailyPur ? 'Valid product, but not in this daily purchase audit' : 'Valid product, but not in current audit scope',
          timestamp: Date.now(),
        });

        addSessionScan({
          barcode: rawCode,
          productName: prodName,
          bansalCode,
          result: 'NOT_IN_AUDIT',
          context: 'floor_audit',
        });

        window.dispatchEvent(
          new CustomEvent('floor-audit-scan-not-in-audit', {
            detail: {
              productName: prodName,
              bansalCode,
              barcode: rawCode,
            },
          })
        );
        return;
      }

      // Result A3: BARCODE NOT FOUND
      if (soundEnabled) {
        playErrorBeep();
        triggerVibration(200);
      }

      setScannerFeedback({
        id: `feedback-${Date.now()}`,
        type: 'not_found',
        title: 'BARCODE NOT FOUND',
        barcode: rawCode,
        message: 'Barcode not found in stock or Barcode Master',
        timestamp: Date.now(),
      });

      addSessionScan({
        barcode: rawCode,
        result: 'NOT_FOUND',
        context: 'floor_audit',
      });

      window.dispatchEvent(
        new CustomEvent('floor-audit-scan-not-found', {
          detail: {
            barcode: rawCode,
          },
        })
      );
      return;
    }

    // ==========================================
    // Priority B: Focus IQ Screen
    // ==========================================
    if (isFocusView(currentView)) {
      const resolved = await resolveScannedBarcodeStrict(rawCode, products);

      const isNonCore =
        currentView === 'non_core_focus' ||
        currentView === 'non_core_focus_issues' ||
        currentView === 'non_core_focus_offers' ||
        currentView === 'non_core_focus_check';
      const targetMaster = isNonCore ? nonCoreMaster : coreMaster;
      const focusItems =
        targetMaster?.items && targetMaster.items.length > 0
          ? targetMaster.items
          : [...(coreMaster?.items || []), ...(nonCoreMaster?.items || [])];

      let matchedFocusItem: any = null;
      let matchedProduct: Product | null = null;

      if (resolved.ok && resolved.product) {
        matchedProduct = resolved.product;
        const prodCode = normalizeLocalCode(matchedProduct.bansalCode || matchedProduct.localCode || matchedProduct.code);
        const prodBarcode = normalizeScannedBarcode(matchedProduct.barcode);

        matchedFocusItem = focusItems.find((item: any) => {
          const itemCode = normalizeLocalCode(item.code || item.bansalCode);
          const itemBarcode = normalizeScannedBarcode(item.barcode);
          return (prodCode && itemCode === prodCode) || (prodBarcode && itemBarcode === prodBarcode);
        });
      } else {
        const normCode = normalizeLocalCode(rawCode);
        const normBar = normalizeScannedBarcode(rawCode);
        matchedFocusItem = focusItems.find((item: any) => {
          const itemCode = normalizeLocalCode(item.code || item.bansalCode);
          const itemBarcode = normalizeScannedBarcode(item.barcode);
          return (normCode && itemCode === normCode) || (normBar && itemBarcode === normBar);
        });
      }

      // Result B1: MATCHED in Focus IQ
      if (matchedFocusItem) {
        const prodName = matchedProduct?.name || matchedFocusItem.name || matchedFocusItem.productName || 'Focus Item';
        const bansalCode = matchedFocusItem.code || matchedFocusItem.bansalCode || matchedProduct?.bansalCode || '';

        if (soundEnabled) {
          playSuccessBeep();
          triggerVibration(80);
        }

        setScannerFeedback({
          id: `feedback-${Date.now()}`,
          type: 'matched',
          title: '✓ MATCHED',
          productName: prodName,
          bansalCode,
          barcode: rawCode,
          message: 'Item located in Focus IQ',
          timestamp: Date.now(),
        });

        addSessionScan({
          barcode: rawCode,
          productName: prodName,
          bansalCode,
          result: 'MATCHED',
          context: 'focus_iq',
        });

        window.dispatchEvent(
          new CustomEvent('focus-scan-locate', {
            detail: {
              code: bansalCode,
              bansalCode,
              barcode: rawCode,
              productId: matchedProduct?.id,
            },
          })
        );
        return;
      }

      // Result B2: NOT IN THIS FOCUS LIST
      if (resolved.ok && resolved.product) {
        const prodName = resolved.product.name;
        const bansalCode = resolved.product.bansalCode || resolved.product.localCode || '';

        if (soundEnabled) {
          playWarningBeep();
          triggerVibration([100, 50, 100]);
        }

        setScannerFeedback({
          id: `feedback-${Date.now()}`,
          type: 'not_in_focus',
          title: 'NOT IN THIS FOCUS LIST',
          productName: prodName,
          bansalCode,
          barcode: rawCode,
          message: 'Valid product, but not in current Focus master',
          timestamp: Date.now(),
        });

        addSessionScan({
          barcode: rawCode,
          productName: prodName,
          bansalCode,
          result: 'NOT_IN_FOCUS',
          context: 'focus_iq',
        });

        window.dispatchEvent(
          new CustomEvent('focus-scan-not-in-focus', {
            detail: {
              productName: prodName,
              bansalCode,
              barcode: rawCode,
            },
          })
        );
        return;
      }

      // Result B3: BARCODE NOT FOUND
      if (soundEnabled) {
        playErrorBeep();
        triggerVibration(200);
      }

      setScannerFeedback({
        id: `feedback-${Date.now()}`,
        type: 'not_found',
        title: 'BARCODE NOT FOUND',
        barcode: rawCode,
        message: 'Barcode not found in stock or Barcode Master',
        timestamp: Date.now(),
      });

      addSessionScan({
        barcode: rawCode,
        result: 'NOT_FOUND',
        context: 'focus_iq',
      });

      window.dispatchEvent(
        new CustomEvent('focus-scan-not-found', {
          detail: {
            barcode: rawCode,
          },
        })
      );
      return;
    }

    // ==========================================
    // Priority C: Global Product Search
    // ==========================================
    // 1. Immediately reset previous search states
    setSelectedProduct(null);
    setLastSearchedProduct(null);
    setInspectProduct(null);
    setMatchingProducts([]);
    setNoProductFoundQuery(null);
    setActiveBarcode('');
    setConflictModalData({ isOpen: false, barcode: '', candidates: [] });

    try {
      const result = await resolveScannedBarcode(rawCode, products);

      // Successfully resolved (1 exact product: current stock, saved override, Barcode Master, or store label fallback)
      if (
        result.resolution === 'current_stock' ||
        result.resolution === 'saved_override' ||
        result.resolution === 'barcode_master' ||
        result.resolution === 'store_label_fallback'
      ) {
        const prod = result.product;
        if (prod) {
          if (soundEnabled) {
            playSuccessBeep();
            triggerVibration(80);
          }
          // Normal Home / Stock IQ screens: valid scan immediately opens Product Inspector (do not show compact result first)
          setSelectedProduct(null);
          setLastSearchedProduct(prod);
          setInspectProduct(prod);
          setActiveBarcode(prod.barcode);
          setMatchingProducts([prod]);
          setNoProductFoundQuery(null);

          const feedbackMsg =
            result.resolution === 'saved_override'
              ? (result.message || 'Resolved via Saved Barcode Override')
              : result.resolution === 'store_label_fallback'
              ? (result.message || `Store Label • Code: ${result.storeLabelCode || prod.bansalCode || prod.code}`)
              : result.resolution === 'barcode_master'
              ? 'Resolved via Barcode Master'
              : 'Verified in stock';

          setScannerFeedback({
            id: `feedback-${Date.now()}`,
            type: 'found',
            title: '✓ FOUND',
            productName: prod.name,
            bansalCode: prod.bansalCode || prod.code,
            barcode: rawCode,
            message: feedbackMsg,
            timestamp: Date.now(),
          });

          addSessionScan({
            barcode: rawCode,
            productName: prod.name,
            bansalCode: prod.bansalCode || prod.code,
            result: 'FOUND',
            context: 'global_search',
          });

          const historyItem: ScanHistoryItem = {
            id: `scan-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
            barcode: rawCode,
            productName: prod.name,
            timestamp: new Date().toLocaleTimeString(),
            found: true,
            product: prod,
          };
          setScanHistory((prev) => {
            const next = [historyItem, ...prev.slice(0, 49)];
            saveHistoryDB(next).catch(() => {});
            return next;
          });

          if (result.resolution === 'saved_override') {
            showToast(result.message || 'Resolved via Saved Barcode Override 📌', 'success');
          } else if (result.resolution === 'store_label_fallback') {
            showToast(result.message || `Store Label • Code: ${result.storeLabelCode || prod.bansalCode || prod.code}`, 'success');
          } else if (result.resolution === 'barcode_master') {
            showToast('Resolved via Barcode Master ✅', 'success');
          }
          return;
        }
      }

      // Conflict (Identity Mismatch, Multiple Candidates, Stale Override)
      if (
        result.resolution === 'barcode_identity_conflict' ||
        result.resolution === 'barcode_master_conflict' ||
        result.resolution === 'stale_override_conflict' ||
        result.resolution === 'current_stock_conflict' ||
        result.resolution === 'store_label_conflict' ||
        result.ambiguous
      ) {
        setConflictModalData({
          isOpen: true,
          barcode: rawCode,
          candidates: result.candidates,
          candidateDetails: result.candidateDetails,
          masterIdentity: result.masterIdentity,
          overrideIdentity: result.overrideIdentity,
          isStaleOverride: result.isStaleOverride,
          context: 'main'
        });
        return;
      }

      // Zero exact matches -> NOT FOUND
      if (soundEnabled) {
        playErrorBeep();
        triggerVibration(200);
      }
      setSelectedProduct(null);
      setInspectProduct(null);
      setMatchingProducts([]);
      setNoProductFoundQuery(rawCode);

      setScannerFeedback({
        id: `feedback-${Date.now()}`,
        type: 'not_found',
        title: 'BARCODE NOT FOUND',
        barcode: rawCode,
        message: 'No matching product found',
        timestamp: Date.now(),
      });

      addSessionScan({
        barcode: rawCode,
        result: 'NOT_FOUND',
        context: 'global_search',
      });

      const historyItem: ScanHistoryItem = {
        id: `scan-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        barcode: rawCode,
        productName: 'Unknown Product',
        timestamp: new Date().toLocaleTimeString(),
        found: false,
      };
      setScanHistory((prev) => {
        const next = [historyItem, ...prev.slice(0, 49)];
        saveHistoryDB(next).catch(() => {});
        return next;
      });

      if (result.resolution === 'mapped_product_not_in_current_stock') {
        showToast('Barcode mapped, but product is not in current stock.', 'error');
      } else if (result.resolution === 'mapped_but_no_stock') {
        showToast('Barcode is mapped, but no current stock file is loaded.', 'error');
      } else if (result.resolution === 'not_mapped') {
        showToast('Barcode not mapped.', 'error');
      } else if (result.message) {
        showToast(result.message, 'error');
      }
    } catch (err: any) {
      console.error('Barcode scan resolution error:', err);
      showToast(err?.message || 'Barcode lookup failed', 'error');
    }
  };

  const handleBarcodeScan = dispatchScan;

  // Global Hardware Bluetooth HID scanner listener
  useHardwareBarcodeScanner({
    onScan: (code) => {
      dispatchScan(code);
    },
    enabled: true,
  });

  const handleSelectConflictCandidate = async (candidate: Product, alwaysUse: boolean = false) => {
    const rawBarcode = conflictModalData.barcode || candidate.barcode;
    const currentContext = conflictModalData.context || 'main';
    const callback = conflictModalData.sourceCallback;

    setConflictModalData({ isOpen: false, barcode: '', candidates: [] });

    if (alwaysUse && rawBarcode) {
      try {
        await saveBarcodeOverrideDB({
          scannedBarcode: rawBarcode,
          targetBansalCode: candidate.bansalCode || candidate.localCode || candidate.code || '',
          targetProductName: candidate.name || candidate.itemName || '',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        showToast(`Saved default match for barcode ${rawBarcode} 📌`, 'success');
      } catch (err) {
        console.warn('Failed to save barcode override:', err);
      }
    }

    if (soundEnabled) playSuccessBeep();

    if (callback) {
      callback(candidate);
      return;
    }

    if (currentContext === 'focus') {
      const bansalCode = candidate.bansalCode || candidate.localCode || candidate.code || '';
      setScannerFeedback({
        id: `feedback-${Date.now()}`,
        type: 'matched',
        title: '✓ MATCHED',
        productName: candidate.name,
        bansalCode,
        barcode: rawBarcode,
        message: 'Conflict resolved in Focus IQ',
        timestamp: Date.now(),
      });
      addSessionScan({
        barcode: rawBarcode,
        productName: candidate.name,
        bansalCode,
        result: 'MATCHED',
        context: 'focus_iq',
      });
      window.dispatchEvent(
        new CustomEvent('focus-scan-locate', {
          detail: {
            code: bansalCode,
            bansalCode,
            barcode: rawBarcode,
            productId: candidate.id,
          },
        })
      );
      return;
    }

    if (currentContext === 'audit' && activeAuditData) {
      showToast(`Selected: ${candidate.name}`, 'success');
    }

    // Default Main / Product Search context
    setSelectedProduct(null);
    setLastSearchedProduct(candidate);
    setInspectProduct(candidate);
    setActiveBarcode(candidate.barcode);
    setMatchingProducts([candidate]);
    setNoProductFoundQuery(null);

    setScannerFeedback({
      id: `feedback-${Date.now()}`,
      type: 'found',
      title: '✓ RESOLVED',
      productName: candidate.name,
      bansalCode: candidate.bansalCode || candidate.code,
      barcode: rawBarcode,
      message: alwaysUse ? 'Saved override and opened' : 'Conflict resolved',
      timestamp: Date.now(),
    });

    addSessionScan({
      barcode: rawBarcode,
      productName: candidate.name,
      bansalCode: candidate.bansalCode || candidate.code,
      result: 'FOUND',
      context: 'global_search',
    });

    const historyItem: ScanHistoryItem = {
      id: `scan-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      barcode: rawBarcode,
      productName: candidate.name,
      timestamp: new Date().toLocaleTimeString(),
      found: true,
      product: candidate
    };
    setScanHistory(prev => {
      const next = [historyItem, ...prev.slice(0, 49)];
      saveHistoryDB(next).catch(() => {});
      return next;
    });
  };

  // Stock update handler (Routes to store_1)
  const handleUpdateStock = async (productId: string, newStock: number) => {
    try {
      const res = await updateServerStockItem(productId, newStock, 'store_1');
      if (res && res.success) {
        setProducts(prev => {
          const next = prev.map(p => p.id === productId ? { ...p, stock: newStock } : p);
          productsRef.current = next;
          saveProductsDB(next, 'store_1').catch(() => {});
          return next;
        });

        if (selectedProduct && selectedProduct.id === productId) {
          setSelectedProduct(prev => prev ? { ...prev, stock: newStock } : null);
        }
        if (inspectProduct && inspectProduct.id === productId) {
          setInspectProduct(prev => prev ? { ...prev, stock: newStock } : null);
        }

        try {
          if (typeof BroadcastChannel !== 'undefined') {
            const bc = new BroadcastChannel('bsm_stock_sync_channel');
            bc.postMessage({ type: 'STOCK_UPDATED', productId, newStock, storeId: 'store_1' });
            bc.close();
          }
        } catch (e) {}

        showToast('Stock quantity updated on server.', 'success');
      }
    } catch (err: any) {
      console.error('Stock update failed:', err);
      showToast(err.message || 'Failed to update stock on server.', 'error');
    }
  };

  // Stock report upload (Only succeeds on server confirmation, atomic safe replacement)
  const handleUploadStock = async (
    newProducts: Product[],
    meta: StockReportMeta,
    _storeId?: string,
    onProgress?: (progress: UploadProgressData) => void,
    fallbackToLocal?: boolean
  ) => {
    const targetStore = 'store_1';
    const safeFilename = meta?.filename || meta?.fileName || 'REG-STAT.CSV';
    const safeMeta: StockReportMeta = {
      ...meta,
      fileName: safeFilename,
      filename: safeFilename
    };

    try {
      const response = await uploadServerStock(newProducts, safeMeta, targetStore, onProgress, fallbackToLocal);
      if (!response || !response.success) {
        throw new Error(response?.message || 'Failed to save stock data.');
      }

      // Fetch the saved authoritative dataset
      const serverStock = await fetchServerStock(targetStore);
      const savedProducts = serverStock && Array.isArray(serverStock.products) ? serverStock.products : newProducts;
      const savedMeta = serverStock?.meta || meta;

      // 1. Save authoritative dataset to local IndexedDB for store_1
      await saveProductsDB(savedProducts, targetStore);
      await saveMetaDB(savedMeta, targetStore);

      // Persist active version locally
      const newVersionKey = String(response.version || serverStock?.version || '');
      if (newVersionKey) {
        localStorage.setItem(`stockscan_version_${targetStore}`, newVersionKey);
      }

      // 2. Broadcast to all other open tabs on this device
      try {
        if (typeof BroadcastChannel !== 'undefined') {
          const bc = new BroadcastChannel('bsm_stock_sync_channel');
          bc.postMessage({ type: 'STOCK_UPLOADED', storeId: targetStore, version: response.version });
          bc.close();
        }
      } catch (e) {}

      // 3. Update active UI view with authoritative dataset
      productsRef.current = savedProducts;
      setProducts(savedProducts);
      setReportMeta(savedMeta);
      lastSyncVersionRef.current = response.version || serverStock?.version || (newVersionKey ? Number(newVersionKey) : null);
      if (savedProducts.length > 0) {
        setSelectedProduct(savedProducts[0]);
      }

      lastSyncUploadedRef.current = response.lastUpdated || new Date().toISOString();
      lastSyncProductCountRef.current = savedProducts.length;
      lastSyncTimeRef.current = response.lastUpdated || new Date().toISOString();

      showToast(
        `Successfully uploaded ${savedProducts.length.toLocaleString('en-IN')} products to PATAN! File: "${savedMeta.fileName}"`,
        'success'
      );

      const list = await fetchStoresList().catch(() => []);
      if (list.length > 0) setStoresList(list);
    } catch (err: any) {
      console.error('Stock upload fail:', err);
      showToast(`Stock Upload Failed: ${err.message || 'Please check the file format.'}`, 'error');
      throw err; // Re-throw so UploadModal catches and stays open with error
    }
  };

  // Clear all data
  const handleClearData = async (_storeId?: string) => {
    const targetId = 'store_1';
    try {
      await clearServerStock(targetId);

      productsRef.current = [];
      setProducts([]);
      setReportMeta(null);
      setSelectedProduct(null);
      setInspectProduct(null);
      setMatchingProducts([]);
      setActiveBarcode('');
      localStorage.removeItem(`stockscan_version_${targetId}`);
      lastSyncVersionRef.current = null;

      await clearStoreDB(targetId).catch(() => {});

      try {
        if (typeof BroadcastChannel !== 'undefined') {
          const bc = new BroadcastChannel('bsm_stock_sync_channel');
          bc.postMessage({ type: 'STOCK_CLEARED', storeId: targetId });
          bc.close();
        }
      } catch (e) {}

      const list = await fetchStoresList().catch(() => []);
      if (list.length > 0) setStoresList(list);
      showToast(`Cleared stock database for PATAN.`, 'info');
    } catch (err: any) {
      console.warn('Clear stock failed:', err);
      showToast(err.message || 'Failed to clear stock data.', 'error');
    }
  };

  const handleToggleStoreActive = async (storeId: string) => {
    try {
      const updatedList = await toggleStoreActive(storeId);
      setStoresList(updatedList);
      showToast(`Store status updated.`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to toggle store status.', 'error');
    }
  };

  const handleClearStoreStock = async (storeId: string) => {
    try {
      await handleClearData(storeId);
    } catch (err: any) {
      showToast(err.message || 'Failed to clear store stock.', 'error');
    }
  };

  // Delete product (Routes to store_1)
  const handleDeleteProduct = async (productId: string) => {
    const targetStoreId = 'store_1';
    try {
      await deleteServerStockItems(productId, targetStoreId);

      setProducts(prev => {
        const next = prev.filter(p => p.id !== productId);
        productsRef.current = next;
        saveProductsDB(next, targetStoreId).catch(() => {});
        return next;
      });

      if (selectedProduct && selectedProduct.id === productId) {
        setSelectedProduct(null);
      }
      if (inspectProduct && inspectProduct.id === productId) {
        setInspectProduct(null);
      }

      await deleteProductDB(productId).catch(() => {});

      try {
        if (typeof BroadcastChannel !== 'undefined') {
          const bc = new BroadcastChannel('bsm_stock_sync_channel');
          bc.postMessage({ type: 'STOCK_DELETED', productId, storeId: targetStoreId });
          bc.close();
        }
      } catch (e) {}

      showToast('Product deleted from stock.', 'info');
    } catch (err: any) {
      console.error('Delete error:', err);
      showToast(err.message || 'Failed to delete product.', 'error');
    }
  };

  return (
    <div className={`h-screen flex flex-col font-sans antialiased overflow-hidden transition-colors ${
      isDarkMode ? 'bg-slate-950 text-slate-100' : 'bg-slate-100 text-slate-900'
    }`}>
      {/* Top Main Header */}
      <Header
        appMode={appMode}
        currentView={currentView}
        onToggleAppMode={handleToggleAppMode}
        reportMeta={reportMeta}
        productCount={products.length}
        isAdmin={true}
        onOpenTable={() => setIsTableOpen(true)}
        onOpenAdminAuth={() => setIsAdminSettingsOpen(true)}
        onOpenAdminSettings={() => setIsAdminSettingsOpen(true)}
        onClearData={() => handleClearData('store_1')}
        onOpenAiScanner={() => setIsAiScannerOpen(true)}
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
        isSidebarCollapsed={isSidebarCollapsed}
        onToggleSidebar={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        isDarkMode={isDarkMode}
        onToggleDarkMode={() => setIsDarkMode(!isDarkMode)}
        onOpenMobileSidebar={() => setIsMobileSidebarOpen(true)}
      />

      {/* Main Retail Layout (Sidebar + Content Canvas) */}
      <div className="flex-1 flex overflow-hidden w-full h-[calc(100vh-3.5rem)]">
        {/* Navigation Sidebar */}
        <Sidebar
          appMode={appMode}
          onToggleAppMode={handleToggleAppMode}
          currentView={currentView}
          onSelectView={handleNavigateView}
          summary={dashboardSummary}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          isMobileOpen={isMobileSidebarOpen}
          onCloseMobile={() => setIsMobileSidebarOpen(false)}
          isDarkMode={isDarkMode}
          onToggleDarkMode={() => setIsDarkMode(!isDarkMode)}
          onOpenAdminConsole={() => setIsAdminSettingsOpen(true)}
          reportMeta={reportMeta}
          hasActiveAudit={!!activeAuditData}
          coreIssuesCount={coreIssuesCount}
          nonCoreIssuesCount={nonCoreIssuesCount}
          coreOfferMismatchCount={coreOfferMismatchCount}
          nonCoreOfferMismatchCount={nonCoreOfferMismatchCount}
        />

        {/* Content Canvas */}
        <main className="flex-1 flex flex-col min-w-0 overflow-y-auto overflow-x-hidden h-full">
          {/* Breadcrumb Navigation (Hidden in Floor IQ and Focus IQ dedicated flows) */}
          {!isFloorViewType(currentView) && !isFocusViewType(currentView) && (
            <Breadcrumbs
              appMode={appMode}
              currentView={currentView}
              onSelectView={handleNavigateView}
              onOpenMobileSidebar={() => setIsMobileSidebarOpen(true)}
              isDarkMode={isDarkMode}
              canGoBack={viewHistory.length > 0 || currentView !== 'dashboard'}
              onGoBack={handleGoBack}
              previousViewTitle={viewHistory.length > 0 ? (VIEW_TITLES[viewHistory[viewHistory.length - 1]] || 'Previous') : 'Home Dashboard'}
            />
          )}

          {/* Persistent Store Floor Barcode Search & Quick Actions Bar */}
          {!isFloorViewType(currentView) && !isFocusViewType(currentView) && (
            <div className={`p-3 border-b shadow-2xs ${
              isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
            }`}>
              <SearchInput
                products={products}
                onSelectProduct={(p) => {
                  setSelectedProduct(p);
                  setLastSearchedProduct(p);
                  setInspectProduct(null);
                  setActiveBarcode(p.barcode);
                  setSearchTerm(p.barcode || p.code || p.bansalCode || p.name);
                  setMatchingProducts([p]);
                  setNoProductFoundQuery(null);
                }}
                onOpenScanner={() => setIsScannerOpen(true)}
                onOpenPhotoScanner={() => setIsAiScannerOpen(true)}
                currentSearchTerm={searchTerm}
                onSearchTermChange={(term) => {
                  setSearchTerm(term);
                  handleSearchCode(term);
                }}
                onBarcodeScan={(code) => {
                  setSearchTerm(code);
                  handleBarcodeScan(code);
                }}
                activeProductBarcode={activeBarcode}
              />

              {/* Scanned / Searched Product Card Display OR No Match Popup */}
              {selectedProduct ? (
                <div className="mt-2 relative animate-fade-in">
                  <ProductCard
                    product={selectedProduct}
                    analytics={analyticsMap.get(selectedProduct.id)}
                    onOpenLabelModal={(p) => setLabelProduct(p)}
                    onDeleteProduct={handleDeleteProduct}
                    matchingCount={matchingProducts.length}
                    onViewAllMatching={() => setInspectProduct(selectedProduct)}
                    onDismiss={() => {
                      setSelectedProduct(null);
                      setLastSearchedProduct(null);
                      setSearchTerm('');
                      setActiveBarcode('');
                      setMatchingProducts([]);
                      setInspectProduct(null);
                      setNoProductFoundQuery(null);
                    }}
                    isDarkMode={isDarkMode}
                  />
                </div>
              ) : noProductFoundQuery ? (
                <div className="mt-3 p-4 sm:p-5 rounded-2xl border bg-rose-50/80 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800/80 shadow-md animate-fade-in relative">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="p-2.5 rounded-2xl bg-rose-100 dark:bg-rose-900/60 text-rose-600 dark:text-rose-400 border border-rose-300 dark:border-rose-700/60 shrink-0">
                        <AlertCircle className="w-6 h-6" />
                      </div>
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-sm sm:text-base font-black text-rose-900 dark:text-rose-200 leading-tight">
                            No Matching Barcode / Item Found
                          </h3>
                          <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded-lg bg-rose-200/80 dark:bg-rose-900/90 text-rose-900 dark:text-rose-100 border border-rose-300 dark:border-rose-700 truncate max-w-xs">
                            "{noProductFoundQuery}"
                          </span>
                        </div>

                        <p className="text-xs text-rose-800 dark:text-rose-300 leading-relaxed font-medium">
                          This barcode or product code is not present in the active inventory database ({products.length.toLocaleString('en-IN')} total active items).
                        </p>

                        <div className="pt-2 flex items-center gap-2 flex-wrap text-xs">
                          <button
                            onClick={() => {
                              setSearchTerm('');
                              setNoProductFoundQuery(null);
                            }}
                            className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl shadow-xs cursor-pointer active:scale-95 transition-all"
                          >
                            Clear Search
                          </button>
                          <button
                            onClick={() => {
                              setIsScannerOpen(true);
                              setNoProductFoundQuery(null);
                            }}
                            className="px-3 py-1.5 bg-white dark:bg-slate-900 hover:bg-rose-100/50 dark:hover:bg-slate-800 text-rose-800 dark:text-rose-200 font-bold rounded-xl border border-rose-300 dark:border-rose-800 cursor-pointer active:scale-95 transition-all"
                          >
                            Scan Camera Barcode
                          </button>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        setNoProductFoundQuery(null);
                        setSearchTerm('');
                      }}
                      className="p-1.5 rounded-xl text-rose-400 hover:text-rose-700 dark:hover:text-rose-200 hover:bg-rose-200/50 dark:hover:bg-rose-900/50 cursor-pointer shrink-0 transition-colors"
                      title="Dismiss"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          )}

          {/* View Container */}
          <div
            key={currentView}
            className={`flex-1 max-w-7xl w-full mx-auto page-transition ${
              currentView === 'bsmiq_home' ? 'p-1 sm:p-3.5' : 'p-2 sm:p-3.5 space-y-3'
            }`}
          >
            {/* Dynamic View Router */}
            {currentView === 'bsmiq_home' && (
              <BsmiqHome
                onOpenStockIq={() => handleNavigateView('dashboard')}
                onOpenFloorIq={() => handleNavigateView('floor_audit')}
                onOpenFocusIq={() => handleNavigateView('focus_home')}
                summary={dashboardSummary}
                reportMeta={reportMeta}
                coreCheckStatus={coreCheckStatus}
                nonCoreCheckStatus={nonCoreCheckStatus}
                hasActiveFloorAudit={Boolean(activeAuditData)}
                isDarkMode={isDarkMode}
                onOpenSettings={() => setIsAdminSettingsOpen(true)}
              />
            )}

            {currentView === 'dashboard' && (
              <DashboardView
                summary={dashboardSummary}
                onSelectView={handleNavigateView}
                products={products}
                analyticsMap={analyticsMap}
                reportMeta={reportMeta}
                onSelectProduct={(p) => setInspectProduct(p)}
                onInspectProducts={() => setIsTableOpen(true)}
                onStartFloorAudit={handleStartAuditFromAnalytics}
                isDarkMode={isDarkMode}
              />
            )}

            {currentView === 'replenishment' && (
              <ReplenishmentView
                products={products}
                analyticsMap={analyticsMap}
                onSelectProduct={(p) => setInspectProduct(p)}
                isDarkMode={isDarkMode}
                reportMeta={reportMeta}
              />
            )}

            {currentView === 'fast_moving' && (
              <FastMovingView
                products={products}
                analyticsMap={analyticsMap}
                onSelectProduct={(p) => setInspectProduct(p)}
                onStartFloorAudit={handleStartAuditFromAnalytics}
                isDarkMode={isDarkMode}
              />
            )}

            {currentView === 'slow_moving' && (
              <SlowMovingView
                products={products}
                analyticsMap={analyticsMap}
                onSelectProduct={(p) => setInspectProduct(p)}
                onStartFloorAudit={handleStartAuditFromAnalytics}
                isDarkMode={isDarkMode}
              />
            )}

            {currentView === 'dead_stock' && (
              <DeadStockView
                products={products}
                analyticsMap={analyticsMap}
                onSelectProduct={(p) => setInspectProduct(p)}
                onStartFloorAudit={handleStartAuditFromAnalytics}
                isDarkMode={isDarkMode}
              />
            )}

            {currentView === 'zero_sales' && (
              <ZeroSalesView
                products={products}
                analyticsMap={analyticsMap}
                onSelectProduct={(p) => setInspectProduct(p)}
                onStartFloorAudit={handleStartAuditFromAnalytics}
                isDarkMode={isDarkMode}
              />
            )}

            {currentView === 'overstock' && (
              <OverstockView
                products={products}
                analyticsMap={analyticsMap}
                onSelectProduct={(p) => setInspectProduct(p)}
                onStartFloorAudit={handleStartAuditFromAnalytics}
                isDarkMode={isDarkMode}
              />
            )}

            {currentView === 'low_stock' && (
              <LowStockView
                products={products}
                analyticsMap={analyticsMap}
                onSelectProduct={(p) => setInspectProduct(p)}
                onStartFloorAudit={handleStartAuditFromAnalytics}
                isDarkMode={isDarkMode}
              />
            )}

            {currentView === 'out_of_stock' && (
              <OutOfStockView
                products={products}
                analyticsMap={analyticsMap}
                onSelectProduct={(p) => setInspectProduct(p)}
                onStartFloorAudit={handleStartAuditFromAnalytics}
                isDarkMode={isDarkMode}
              />
            )}

            {currentView === 'inventory_value' && (
              <InventoryValueView
                products={products}
                analyticsMap={analyticsMap}
                onSelectProduct={(p) => setInspectProduct(p)}
                onStartFloorAudit={handleStartAuditFromAnalytics}
                isDarkMode={isDarkMode}
              />
            )}

            {currentView === 'category_dash' && (
              <CategoryBrandSupplierIntelligenceView
                products={products}
                analyticsMap={analyticsMap}
                initialTab="category"
                onSelectProduct={(p) => setInspectProduct(p)}
                onStartFloorAudit={handleStartAuditFromAnalytics}
                isDarkMode={isDarkMode}
              />
            )}

            {currentView === 'brand_dash' && (
              <CategoryBrandSupplierIntelligenceView
                products={products}
                analyticsMap={analyticsMap}
                initialTab="brand"
                onSelectProduct={(p) => setInspectProduct(p)}
                onStartFloorAudit={handleStartAuditFromAnalytics}
                isDarkMode={isDarkMode}
              />
            )}

            {currentView === 'supplier_dash' && (
              <CategoryBrandSupplierIntelligenceView
                products={products}
                analyticsMap={analyticsMap}
                initialTab="supplier"
                onSelectProduct={(p) => setInspectProduct(p)}
                onStartFloorAudit={handleStartAuditFromAnalytics}
                isDarkMode={isDarkMode}
              />
            )}

            {currentView === 'abc_analysis' && (
              <AbcAnalysisView
                products={products}
                analyticsMap={analyticsMap}
                onSelectProduct={(p) => setInspectProduct(p)}
                onStartFloorAudit={handleStartAuditFromAnalytics}
                isDarkMode={isDarkMode}
              />
            )}

            {currentView === 'margin_analysis' && (
              <MarginAnalysisView
                products={products}
                analyticsMap={analyticsMap}
                onSelectProduct={(p) => setInspectProduct(p)}
                onStartFloorAudit={handleStartAuditFromAnalytics}
                isDarkMode={isDarkMode}
              />
            )}

            {currentView === 'stock_age' && (
              <StockAgeView
                products={products}
                analyticsMap={analyticsMap}
                onSelectProduct={(p) => setInspectProduct(p)}
                onStartFloorAudit={handleStartAuditFromAnalytics}
                isDarkMode={isDarkMode}
              />
            )}

            {currentView === 'ai_recommendations' && (
              <AiRecommendationsView
                products={products}
                analyticsMap={analyticsMap}
                onSelectProduct={(p) => setInspectProduct(p)}
                onStartFloorAudit={handleStartAuditFromAnalytics}
                isDarkMode={isDarkMode}
              />
            )}

            {currentView === 'stock_variations' && (
  <StockVariationsView
    products={effectiveProducts}
    analyticsMap={analyticsMap}
    onSelectProduct={(p) => setInspectProduct(p)}
    isDarkMode={isDarkMode}
  />
)}

{currentView === 'all_products' && (
              <AnalyticsTable
                title="Full Product Catalog Table"
                description={`Total ${products.length.toLocaleString('en-IN')} SKUs in active stock memory`}
                products={products}
                analyticsMap={analyticsMap}
                onSelectProduct={(p) => setInspectProduct(p)}
                onStartFloorAudit={(prods) => handleStartAuditFromAnalytics('Full Catalog Floor Audit', 'random', prods)}
                isDarkMode={isDarkMode}
              />
            )}

            {currentView === 'reports' && (
              <ReportsExportCenterView
                products={products}
                analyticsMap={analyticsMap}
                reportMeta={reportMeta}
                onSelectProduct={(p) => setInspectProduct(p)}
                isDarkMode={isDarkMode}
              />
            )}

            {currentView === 'top_sales' && (
              <TopSalesSection
                products={products}
                analyticsMap={analyticsMap}
                onSelectProduct={(p) => setInspectProduct(p)}
                onSelectView={handleNavigateView}
                onStartFloorAudit={handleStartAuditFromAnalytics}
                isDarkMode={isDarkMode}
              />
            )}

            {currentView === 'floor_audit' && (
              <FloorAuditHub
                products={products}
                selectedStoreId={selectedStoreId}
                isDarkMode={isDarkMode}
                onStartAudit={handleStartAuditSession}
                onResumeAudit={handleStartAuditSession}
                onOpenFlagged={() => handleNavigateView('flagged_followup')}
                onNavigateToStockIQ={() => handleNavigateView('dashboard')}
                onOpenNearExpiry={() => handleNavigateView('near_expiry')}
              />
            )}

            {currentView === 'floor_audit_runner' && activeAuditData && (
              <FloorAuditRunner
                session={activeAuditData.session}
                results={activeAuditData.results}
                products={products}
                stockReportMeta={reportMeta}
                isDarkMode={isDarkMode}
                onOpenScanner={() => setIsScannerOpen(true)}
                onBackToHub={() => {
                  if (activeAuditData.session.type === 'core_focus') {
                    handleNavigateView('core_focus');
                  } else if (activeAuditData.session.type === 'non_core_focus') {
                    handleNavigateView('non_core_focus');
                  } else {
                    handleNavigateView('floor_audit');
                  }
                }}
                onOpenFlagged={() => handleNavigateView('flagged_followup')}
              />
            )}

            {currentView === 'flagged_followup' && (
              <FlaggedFollowUpView
                selectedStoreId={selectedStoreId}
                isDarkMode={isDarkMode}
                onBackToHub={() => handleNavigateView('floor_audit')}
              />
            )}

            {currentView === 'near_expiry' && (
              <NearExpiryHub
                products={products}
                onBack={() => handleNavigateView('floor_audit')}
                isDarkMode={isDarkMode}
              />
            )}

            {/* Focus IQ Views */}
            {currentView === 'focus_home' && (
              <FocusIQHub
                coreMaster={coreMaster}
                nonCoreMaster={nonCoreMaster}
                allMasters={allFocusMasters}
                stockProducts={products}
                reportDays={reportMeta?.reportDays}
                initialScope={focusScope}
                onScopeChange={(scope) => setFocusScope(scope)}
                onOpenFocusIssues={(type, filter) => {
                  setFocusIssueFilter(filter || 'all');
                  handleNavigateView(type === 'core' ? 'core_focus_issues' : 'non_core_focus_issues');
                }}
                onOpenOfferMismatch={(type, filter) => {
                  setFocusOfferFilter((filter as any) || 'mismatch');
                  handleNavigateView(type === 'core' ? 'core_focus_offers' : 'non_core_focus_offers');
                }}
                onOpenPhysicalCheck={(type) => {
                  const master = type === 'core' ? coreMaster : nonCoreMaster;
                  if (!master || !master.items || master.items.length === 0) {
                    showToast('No focus master items available for physical check.', 'error');
                    return;
                  }
                  handleStartFocusAudit({
                    focusType: type,
                    monthDisplay: master.monthDisplay || 'Current Month',
                    sourceTitle: type === 'core' ? 'Core Focus Physical Check' : 'Non-Core Focus Physical Check',
                    items: master.items
                  });
                }}
                onOpenFocusList={(type, filter) => {
                  setFocusListFilter((filter as any) || 'all');
                  handleNavigateView(type === 'core' ? 'core_focus' : 'non_core_focus');
                }}
                onOpenUploadModal={(type) => {
                  setFocusUploadType(type);
                  setIsFocusUploadOpen(true);
                }}
                onReloadMasters={loadFocusMastersData}
                onSelectActiveMaster={async (type, masterId) => {
                  await setActiveFocusMaster(selectedStoreId, type, masterId);
                  await loadFocusMastersData();
                }}
                selectedStoreId={selectedStoreId}
                isDarkMode={isDarkMode}
                onOpenAdminSettings={() => setIsAdminSettingsOpen(true)}
              />
            )}

            {currentView === 'core_focus_issues' && (
              <FocusIssuesView
                master={coreMaster}
                focusType="core"
                stockProducts={products}
                reportDays={reportMeta?.reportDays}
                initialFilter={focusIssueFilter}
                onBackToHub={() => handleNavigateView('focus_home')}
                onOpenOfferMismatch={() => {
                  setFocusOfferFilter('mismatch');
                  handleNavigateView('core_focus_offers');
                }}
                onOpenFullList={() => handleNavigateView('core_focus')}
                onOpenUploadModal={(type) => {
                  setFocusUploadType(type);
                  setIsFocusUploadOpen(true);
                }}
                onSelectProduct={(p) => {
                  setInspectProduct(p);
                  setSelectedProduct(p);
                  setActiveBarcode(p.barcode);
                }}
                onStartFocusAudit={handleStartFocusAudit}
                isDarkMode={isDarkMode}
              />
            )}

            {currentView === 'non_core_focus_issues' && (
              <FocusIssuesView
                master={nonCoreMaster}
                focusType="non_core"
                stockProducts={products}
                reportDays={reportMeta?.reportDays}
                initialFilter={focusIssueFilter}
                onBackToHub={() => handleNavigateView('focus_home')}
                onOpenOfferMismatch={() => {
                  setFocusOfferFilter('mismatch');
                  handleNavigateView('non_core_focus_offers');
                }}
                onOpenFullList={() => handleNavigateView('non_core_focus')}
                onOpenUploadModal={(type) => {
                  setFocusUploadType(type);
                  setIsFocusUploadOpen(true);
                }}
                onSelectProduct={(p) => {
                  setInspectProduct(p);
                  setSelectedProduct(p);
                  setActiveBarcode(p.barcode);
                }}
                onStartFocusAudit={handleStartFocusAudit}
                isDarkMode={isDarkMode}
              />
            )}

            {currentView === 'core_focus' && (
              <FocusProductListView
                master={coreMaster}
                focusType="core"
                stockProducts={products}
                reportDays={reportMeta?.reportDays}
                initialFilter={focusListFilter}
                onBackToHome={() => handleNavigateView('focus_home')}
                onOpenFocusIssues={(type, filter) => {
                  setFocusIssueFilter(filter || 'all');
                  handleNavigateView(type === 'core' ? 'core_focus_issues' : 'non_core_focus_issues');
                }}
                onOpenOfferMismatch={(type) => {
                  setFocusOfferFilter('mismatch');
                  handleNavigateView(type === 'core' ? 'core_focus_offers' : 'non_core_focus_offers');
                }}
                onOpenUploadModal={(type) => {
                  setFocusUploadType(type);
                  setIsFocusUploadOpen(true);
                }}
                onSelectProduct={(p) => {
                  setInspectProduct(p);
                  setSelectedProduct(p);
                  setActiveBarcode(p.barcode);
                }}
                onStartFocusAudit={handleStartFocusAudit}
                isDarkMode={isDarkMode}
              />
            )}

            {currentView === 'non_core_focus' && (
              <FocusProductListView
                master={nonCoreMaster}
                focusType="non_core"
                stockProducts={products}
                reportDays={reportMeta?.reportDays}
                initialFilter={focusListFilter}
                onBackToHome={() => handleNavigateView('focus_home')}
                onOpenFocusIssues={(type, filter) => {
                  setFocusIssueFilter(filter || 'all');
                  handleNavigateView(type === 'core' ? 'core_focus_issues' : 'non_core_focus_issues');
                }}
                onOpenOfferMismatch={(type) => {
                  setFocusOfferFilter('mismatch');
                  handleNavigateView(type === 'core' ? 'core_focus_offers' : 'non_core_focus_offers');
                }}
                onOpenUploadModal={(type) => {
                  setFocusUploadType(type);
                  setIsFocusUploadOpen(true);
                }}
                onSelectProduct={(p) => {
                  setInspectProduct(p);
                  setSelectedProduct(p);
                  setActiveBarcode(p.barcode);
                }}
                onStartFocusAudit={handleStartFocusAudit}
                isDarkMode={isDarkMode}
              />
            )}

            {currentView === 'core_focus_offers' && (
              <FocusOfferMismatchView
                master={coreMaster}
                focusType="core"
                stockProducts={products}
                initialFilter={focusOfferFilter}
                onBackToHub={() => handleNavigateView('focus_home')}
                onOpenIssuesView={() => {
                  setFocusIssueFilter('all');
                  handleNavigateView('core_focus_issues');
                }}
                onOpenFullList={() => handleNavigateView('core_focus')}
                onOpenUploadModal={(type) => {
                  setFocusUploadType(type);
                  setIsFocusUploadOpen(true);
                }}
                onSelectProduct={(p) => {
                  setInspectProduct(p);
                  setSelectedProduct(p);
                  setActiveBarcode(p.barcode);
                }}
                onStartFocusAudit={handleStartFocusAudit}
                isDarkMode={isDarkMode}
              />
            )}

            {currentView === 'non_core_focus_offers' && (
              <FocusOfferMismatchView
                master={nonCoreMaster}
                focusType="non_core"
                stockProducts={products}
                initialFilter={focusOfferFilter}
                onBackToHub={() => handleNavigateView('focus_home')}
                onOpenIssuesView={() => {
                  setFocusIssueFilter('all');
                  handleNavigateView('non_core_focus_issues');
                }}
                onOpenFullList={() => handleNavigateView('non_core_focus')}
                onOpenUploadModal={(type) => {
                  setFocusUploadType(type);
                  setIsFocusUploadOpen(true);
                }}
                onSelectProduct={(p) => {
                  setInspectProduct(p);
                  setSelectedProduct(p);
                  setActiveBarcode(p.barcode);
                }}
                onStartFocusAudit={handleStartFocusAudit}
                isDarkMode={isDarkMode}
              />
            )}

            {(currentView === 'core_focus_check' || currentView === 'non_core_focus_check') && (() => {
              const fType = currentView === 'core_focus_check' ? 'core' : 'non_core';
              const master = fType === 'core' ? coreMaster : nonCoreMaster;
              return (
                <div className="p-8 text-center space-y-4">
                  <h3 className="text-base font-bold">Launching Unified Focus Physical Check...</h3>
                  {master && master.items && master.items.length > 0 ? (
                    <button
                      onClick={() => {
                        handleStartFocusAudit({
                          focusType: fType,
                          monthDisplay: master.monthDisplay || 'Current Month',
                          sourceTitle: fType === 'core' ? 'Core Focus Physical Check' : 'Non-Core Focus Physical Check',
                          items: master.items
                        });
                      }}
                      className="px-4 py-2 bg-indigo-600 text-white font-bold text-xs rounded-xl cursor-pointer"
                    >
                      Start Check Now
                    </button>
                  ) : (
                    <div>
                      <p className="text-xs text-slate-500 mb-2">No focus master uploaded.</p>
                      <button
                        onClick={() => handleNavigateView('focus_home')}
                        className="px-4 py-2 bg-slate-800 text-white font-bold text-xs rounded-xl cursor-pointer"
                      >
                        Back to Focus IQ Hub
                      </button>
                    </div>
                  )}
                </div>
              );
            })()}

            {currentView === 'focus_flagged_issues' && (
              <FocusFlaggedIssuesView
                coreMaster={coreMaster}
                nonCoreMaster={nonCoreMaster}
                stockProducts={products}
                storeId={selectedStoreId}
                isDarkMode={isDarkMode}
                onBack={() => handleNavigateView('focus_home')}
                showToast={(msg, type) => {
                  if (type === 'error') playErrorBeep();
                  else if (type === 'success') playSuccessBeep();
                }}
              />
            )}

            {currentView === 'focus_history' && (
              <FocusHistoryView
                coreMaster={coreMaster}
                nonCoreMaster={nonCoreMaster}
                stockProducts={products}
                storeId={selectedStoreId}
                isDarkMode={isDarkMode}
                onBack={() => handleNavigateView('focus_home')}
                showToast={(msg, type) => {
                  if (type === 'error') playErrorBeep();
                  else if (type === 'success') playSuccessBeep();
                }}
              />
            )}

            {/* Scan History Strip */}
            {scanHistory.length > 0 && (
              <ScanHistory
                history={scanHistory}
                onSelectHistoryProduct={(p) => {
                  setSelectedProduct(p);
                  setInspectProduct(p);
                  setActiveBarcode(p.barcode);
                }}
                onClearHistory={() => setScanHistory([])}
              />
            )}
          </div>
        </main>
      </div>

      {/* --- ALL SYSTEM MODALS --- */}

      {/* 1. Stock Upload Modal */}
      {isUploadOpen && (
        <UploadModal
          isOpen={isUploadOpen}
          onClose={() => {
            setIsUploadOpen(false);
            setUploadStoreTarget(null);
          }}
          onSuccess={handleUploadStock}
          targetStoreId="store_1"
          targetStoreName="PATAN"
        />
      )}

      {/* 2. Barcode Camera Scanner Modal */}
      {isScannerOpen && (
        <BarcodeScannerModal
          isOpen={isScannerOpen}
          onClose={() => setIsScannerOpen(false)}
          onScanResult={(scannedCode) => {
            handleBarcodeScan(scannedCode);
            setIsScannerOpen(false);
          }}
          soundEnabled={soundEnabled}
          onToggleSound={() => setSoundEnabled(!soundEnabled)}
          products={products}
        />
      )}

      {/* Barcode Master Ambiguous Conflict Selection Modal */}
      {conflictModalData.isOpen && (
        <BarcodeConflictModal
          isOpen={conflictModalData.isOpen}
          barcode={conflictModalData.barcode}
          candidates={conflictModalData.candidates}
          candidateDetails={conflictModalData.candidateDetails}
          masterIdentity={conflictModalData.masterIdentity}
          overrideIdentity={conflictModalData.overrideIdentity}
          isStaleOverride={conflictModalData.isStaleOverride}
          onSelectCandidate={handleSelectConflictCandidate}
          onClose={() => setConflictModalData({ isOpen: false, barcode: '', candidates: [] })}
          isDarkMode={isDarkMode}
        />
      )}

      {/* 3. Gemini AI Magic Photo & Bill Scanner Modal */}
      {isAiScannerOpen && (
        <AiScannerModal
          isOpen={isAiScannerOpen}
          onClose={() => setIsAiScannerOpen(false)}
          stockProducts={products}
          onSelectProduct={(p) => {
            setSelectedProduct(p);
            setInspectProduct(p);
            setActiveBarcode(p.barcode);
            setIsAiScannerOpen(false);
          }}
          onOpenLabelModal={(p) => setLabelProduct(p)}
          onAddProductsToStock={(newItems) => {
            handleUploadStock([...newItems, ...products], reportMeta || {
              fileName: 'AI Extracted Invoices.csv',
              filename: 'AI Extracted Invoices.csv',
              uploadedAt: new Date().toISOString(),
              totalProducts: newItems.length + products.length,
              totalCategories: 0,
              totalStockValue: 0
            }, selectedStoreId);
            setIsAiScannerOpen(false);
          }}
        />
      )}

      {/* 4. Full Catalog Product Table Modal */}
      {isTableOpen && (
        <ProductTableModal
          isOpen={isTableOpen}
          products={products}
          onClose={() => setIsTableOpen(false)}
          onSelectProduct={(p) => {
            setSelectedProduct(p);
            setInspectProduct(p);
            setActiveBarcode(p.barcode);
          }}
          onStartFloorAudit={handleStartAuditFromAnalytics}
          reportMeta={reportMeta}
          storeName="PATAN"
        />
      )}

      {/* 5. Settings & Offline Data Modal */}
      {isAdminSettingsOpen && (
        <AdminSettingsModal
          isOpen={isAdminSettingsOpen}
          onClose={() => setIsAdminSettingsOpen(false)}
          reportMeta={reportMeta}
          productCount={products.length}
          products={products}
          onClearStoreStock={handleClearStoreStock}
          storesList={storesList}
          onOpenUploadForStore={(storeId, storeName) => {
            setUploadStoreTarget({ id: storeId, name: storeName });
            setIsUploadOpen(true);
          }}
          coreMaster={coreMaster}
          nonCoreMaster={nonCoreMaster}
          onOpenFocusUpload={(type) => {
            setFocusUploadType(type);
            setIsFocusUploadOpen(true);
          }}
          onClearFocusMaster={async (type) => {
            const masterToClear = type === 'core' ? coreMaster : nonCoreMaster;
            if (masterToClear) {
              await deleteFocusMaster(masterToClear.id);
              await loadFocusMastersData();
              setToast({
                message: `Cleared ${type === 'core' ? 'Core' : 'Non-Core'} Focus Master`,
                type: 'info'
              });
            }
          }}
          onResetOfflineAppData={async () => {
            await clearAllOfflineDataDB();
            setProducts([]);
            setReportMeta(null);
            setScanHistory([]);
            setAllFocusMasters([]);
            setActiveAuditData(null);
            localStorage.setItem(STORAGE_KEY_CLEARED, 'true');
            setToast({
              message: 'Offline app data and storage cleared completely.',
              type: 'info'
            });
            setIsAdminSettingsOpen(false);
          }}
          onReloadStock={handleRefresh}
        />
      )}

      {/* 8. Barcode Sticker Label Printing Modal */}
      {labelProduct && (
        <BarcodeLabelModal
          isOpen={!!labelProduct}
          product={labelProduct}
          onClose={() => setLabelProduct(null)}
          isDarkMode={isDarkMode}
        />
      )}

      {/* 9. Detailed Product Inspector Modal */}
      {inspectProduct && (
        <ProductDetailModal
          key={inspectProduct.id}
          product={inspectProduct}
          analytics={analyticsMap.get(inspectProduct.id)}
          onClose={() => {
            setInspectProduct(null);
            setMatchingProducts([]);
          }}
          onOpenLabelModal={(p) => setLabelProduct(p)}
          isDarkMode={isDarkMode}
          matchingProducts={matchingProducts}
          onSelectProduct={(p) => {
            setInspectProduct(p);
            setSelectedProduct(p);
            setActiveBarcode(p.barcode);
          }}
        />
      )}

      {/* 10. Focus IQ Excel Upload Modal */}
      {isFocusUploadOpen && (
        <FocusUploadModal
          isOpen={isFocusUploadOpen}
          onClose={() => setIsFocusUploadOpen(false)}
          focusType={focusUploadType}
          storeId={selectedStoreId}
          isDarkMode={isDarkMode}
          onSaveMaster={async (master) => {
            await saveFocusMaster(master);
            await loadFocusMastersData();
            setToast({
              message: `Successfully uploaded and activated ${master.type === 'core' ? 'CORE' : 'NON-CORE'} Focus Master (${master.monthDisplay})`,
              type: 'success'
            });
          }}
        />
      )}

      {/* Floating System Toast Notification */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-[90] max-w-sm w-full animate-fade-in pointer-events-auto">
          <div
            className={`p-4 rounded-2xl shadow-2xl border flex items-start gap-3 ${
              toast.type === 'success'
                ? 'bg-emerald-900/95 border-emerald-500 text-white'
                : toast.type === 'error'
                ? 'bg-rose-900/95 border-rose-500 text-white'
                : 'bg-slate-900/95 border-slate-700 text-white'
            }`}
          >
            <div className="shrink-0 mt-0.5">
              {toast.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              ) : (
                <AlertCircle className="w-5 h-5 text-rose-400" />
              )}
            </div>
            <div className="flex-1 text-xs font-semibold leading-relaxed">
              {toast.message}
            </div>
            <button
              onClick={() => setToast(null)}
              className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Floating Compact Scanner Mode Indicator (Hidden on Floor IQ & Focus IQ screens where it's integrated in the compact header) */}
      {!isFloorViewType(currentView) && !isFocusViewType(currentView) && (
        <div className="fixed bottom-3.5 right-3.5 z-40 sm:bottom-4 sm:right-4 no-print pointer-events-auto">
          <ScannerModeIndicator
            mode={scannerMode}
            recentScanCount={sessionScans.length}
            onOpenHistory={() => setIsScanHistoryOpen(true)}
            isDarkMode={isDarkMode}
          />
        </div>
      )}

      {/* Lightweight Auto-Dismissing Scan Feedback Banner */}
      <ScannerFeedbackBanner
        feedback={scannerFeedback}
        onDismiss={() => setScannerFeedback(null)}
        isDarkMode={isDarkMode}
      />

      {/* Recent Scans Session Modal (Last 10 scans) */}
      <SessionScanHistoryModal
        isOpen={isScanHistoryOpen}
        onClose={() => setIsScanHistoryOpen(false)}
        scans={sessionScans}
        onClear={() => setSessionScans([])}
        isDarkMode={isDarkMode}
      />
    </div>
  );
}
