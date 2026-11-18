import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Check,
  Search,
  FileSpreadsheet,
  Scan,
  UserCheck,
  Calendar,
  X,
  Filter,
  Camera,
  Zap
} from 'lucide-react';
import {
  AuditSession,
  AuditProductResult,
  Product,
  StockReportMeta,
  AuditCheckFormHandle
} from '../../types';
import { saveProductResult, saveAuditSessionDB } from '../../utils/auditStorage';
import {
  exportAuditSessionToExcel,
  exportFocusAuditToExcel,
  exportZeroSaleAuditToExcel,
  exportDailyPurchaseAuditToExcel
} from '../../utils/auditExport';
import { cleanDateOnly, formatCleanSalesPeriod } from '../../utils/fileParser';
import { matchesMainCodeFilter, normalizeMainCode, matchesCategoryFilter } from '../../utils/mainCode';
import { normalizeLocalCode } from '../../utils/barcodeResolver';
import { MultiSelectDropdown } from '../MultiSelectDropdown';
import { ActiveFilterChips } from '../ActiveFilterChips';
import { computeLinkedClassificationOptions } from '../../utils/linkedFilters';
import {
  formatFloorAuditSummaryText,
  formatFloorAuditResultsText,
  formatSingleProductResultText,
  copyToClipboard
} from '../../utils/copyUtils';
import { FloorProductInspectorModal } from './FloorProductInspectorModal';
import { FloorScanVerifyModal, ExpectedProductInfo } from './FloorScanVerifyModal';
import { FocusProductCheckModal } from '../focus/FocusProductCheckModal';
import { DailyPurchaseCheckModal } from './DailyPurchaseCheckModal';
import { ProductDetailModal } from '../ProductDetailModal';
import { BarcodeLabelModal } from '../BarcodeLabelModal';
import { computeAllProductAnalytics } from '../../utils/analytics';
import { formatDailyPurchaseWhatsAppText } from '../../utils/copyUtils';

interface FloorAuditRunnerProps {
  session: AuditSession;
  results: AuditProductResult[];
  products: Product[];
  stockReportMeta?: StockReportMeta | null;
  isDarkMode?: boolean;
  onBackToHub: () => void;
  onOpenFlagged: () => void;
  onOpenScanner?: () => void;
}

export const FloorAuditRunner: React.FC<FloorAuditRunnerProps> = ({
  session: initialSession,
  results: initialResults,
  products,
  stockReportMeta,
  isDarkMode,
  onBackToHub,
  onOpenFlagged,
  onOpenScanner,
}) => {
  const [session, setSession] = useState<AuditSession>(initialSession);
  const [resultsMap, setResultsMap] = useState<Record<string, AuditProductResult>>(() => {
    const map: Record<string, AuditProductResult> = {};
    initialResults.forEach((r) => {
      map[r.productId] = r;
    });
    return map;
  });

  // Active Checker State
  const [activeChecker, setActiveChecker] = useState<string>(() => {
    return (
      initialSession.activeChecker ||
      initialSession.lastChecker ||
      localStorage.getItem('floor_audit_active_checker') ||
      ''
    );
  });
  const [showCheckerPrompt, setShowCheckerPrompt] = useState<boolean>(() => !activeChecker);
  const [checkerInputName, setCheckerInputName] = useState<string>(activeChecker);

  // Filters State: MainCodes, Categories, Status, Search
  const [selectedMainCodes, setSelectedMainCodes] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'checked' | 'not_on_floor' | 'board_incorrect' | 'flagged'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Quick Count Mode State (Normal mode is default)
  const [isQuickCountMode, setIsQuickCountMode] = useState<boolean>(() => {
    if (typeof initialSession.isQuickCountMode === 'boolean') return initialSession.isQuickCountMode;
    return localStorage.getItem(`quick_count_mode_${initialSession.id}`) === 'true';
  });
  const [quickCountFilter, setQuickCountFilter] = useState<'all' | 'scanned' | 'not_scanned'>('all');
  const [duplicateScanCount, setDuplicateScanCount] = useState<number>(() => initialSession.quickCountDuplicateCount || 0);
  const lastScanRef = useRef<{ barcode: string; time: number } | null>(null);

  const isFocusAudit = session.type === 'core_focus' || session.type === 'non_core_focus';
  const isCoreFocus = session.type === 'core_focus';
  const isDailyPurchase = session.type === 'daily_purchase';
  const isZeroSale = session.type === 'zero_sales' || (session.title && session.title.toLowerCase().includes('zero sale'));

  // Pre-indexed map of live Stock IQ products by exact 9-digit normalized Bansal / Local Code
  const liveStockByCodeMap = useMemo(() => {
    const map = new Map<string, Product[]>();
    for (const p of products) {
      const rawCode = p.bansalCode || p.localCode || p.code || '';
      const norm = normalizeLocalCode(rawCode);
      if (norm) {
        const list = map.get(norm) || [];
        list.push(p);
        map.set(norm, list);
      }
    }
    return map;
  }, [products]);

  // Unique Match Resolver by exact Bansal/Local Code (preserves leading zeroes)
  // - Returns product if exactly 1 match exists
  // - Returns isAmbiguous if > 1 matches exist
  // - Returns null / not found if 0 matches exist
  const getLiveProductForAuditResult = (res: AuditProductResult | null | undefined): {
    product: Product | null;
    isAmbiguous: boolean;
    matchCount: number;
  } => {
    if (!res) return { product: null, isAmbiguous: false, matchCount: 0 };
    const rawCode = res.bansalCode || res.localCode || res.code || '';
    const norm = normalizeLocalCode(rawCode);
    if (!norm) return { product: null, isAmbiguous: false, matchCount: 0 };

    const matches = liveStockByCodeMap.get(norm) || [];
    if (matches.length === 1) {
      return { product: matches[0], isAmbiguous: false, matchCount: 1 };
    }
    if (matches.length > 1) {
      return { product: null, isAmbiguous: true, matchCount: matches.length };
    }
    return { product: null, isAmbiguous: false, matchCount: 0 };
  };

  const salesPeriodText = useMemo(() => {
    if (stockReportMeta?.reportPeriodText) return stockReportMeta.reportPeriodText;
    if (stockReportMeta?.detectedDateRangeStr) return stockReportMeta.detectedDateRangeStr;
    if (stockReportMeta?.reportDays) return `${stockReportMeta.reportDays} Days`;
    return undefined;
  }, [stockReportMeta]);

  const cleanStockReportPeriod = useMemo(() => {
    const raw = stockReportMeta?.reportPeriodText ||
      stockReportMeta?.detectedDateRangeStr ||
      session.reportPeriod ||
      session.purchaseMeta?.periodStr ||
      session.auditDate;
    return formatCleanSalesPeriod(raw);
  }, [stockReportMeta, session]);

  // Full Stock IQ Product Inspector overlay state (opened from inside any check form)
  const [stockInspectorProduct, setStockInspectorProduct] = useState<Product | null>(null);
  const [labelProduct, setLabelProduct] = useState<Product | null>(null);
  const [toastNotification, setToastNotification] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const showRunnerToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToastNotification({ message, type });
    setTimeout(() => {
      setToastNotification((curr) => (curr?.message === message ? null : curr));
    }, 4000);
  };

  const { analyticsMap } = useMemo(() => {
    return computeAllProductAnalytics(products, stockReportMeta);
  }, [products, stockReportMeta]);

  // View Stock IQ Details handler: strictly resolves current stock product without guessing
  const handleViewStockIqDetails = (targetRes?: AuditProductResult | null) => {
    const res = targetRes || inspectingResult;
    if (!res) return;

    // 1. Direct match by productId in products
    let liveProd = products.find((p) => p.id === res.productId);

    // 2. Strict unique match via normalized Bansal / Local Code
    if (!liveProd) {
      const match = getLiveProductForAuditResult(res);
      if (match.isAmbiguous) {
        showRunnerToast(`Multiple products share code [${res.bansalCode || res.code}]. Ambiguous stock match.`, 'error');
        return;
      }
      liveProd = match.product;
    }

    // 3. Strict unique match via barcode if still not found
    if (!liveProd && res.barcode) {
      const normBar = res.barcode.trim().toLowerCase();
      const barcodeMatches = products.filter((p) => p.barcode && p.barcode.trim().toLowerCase() === normBar);
      if (barcodeMatches.length === 1) {
        liveProd = barcodeMatches[0];
      } else if (barcodeMatches.length > 1) {
        showRunnerToast(`Multiple products share barcode [${res.barcode}]. Ambiguous stock match.`, 'error');
        return;
      }
    }

    if (liveProd) {
      setStockInspectorProduct(liveProd);
    } else {
      showRunnerToast(`"${res.productName || 'This product'}" was not found in current Stock report (REG-STAT).`, 'error');
    }
  };

  // Section notice (e.g., when all pending items in current filter have been checked)
  const [sectionNotice, setSectionNotice] = useState<string | null>(null);

  // Product Inspector Modal state
  const [inspectingResult, setInspectingResult] = useState<AuditProductResult | null>(null);
  const [isModalDirty, setIsModalDirty] = useState<boolean>(false);

  // Pending scan handling when dirty edits exist
  const [pendingScan, setPendingScan] = useState<{
    type: 'open_product' | 'not_in_audit' | 'not_found' | 'conflict';
    target?: AuditProductResult | null;
    productName?: string;
    bansalCode?: string;
    barcode?: string;
  } | null>(null);
  const [showUnsavedPrompt, setShowUnsavedPrompt] = useState<boolean>(false);
  const [isUnsavedSaving, setIsUnsavedSaving] = useState<boolean>(false);
  const activeFormRef = useRef<AuditCheckFormHandle | null>(null);
  const isSavingRef = useRef<boolean>(false);
  const isSaveAndOpenActiveRef = useRef<boolean>(false);

  // Mobile Filter Drawer state
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState<boolean>(false);

  // Scan to Verify Modal state
  const [verifyingProductInfo, setVerifyingProductInfo] = useState<ExpectedProductInfo | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [copiedCardId, setCopiedCardId] = useState<string | null>(null);

  // Scroll Position Preservation Refs
  const listContainerRef = useRef<HTMLDivElement | null>(null);
  const savedScrollPosRef = useRef<number>(0);
  const savedMainScrollPosRef = useRef<number>(0);

  const captureScrollPosition = () => {
    if (listContainerRef.current) {
      savedScrollPosRef.current = listContainerRef.current.scrollTop;
    }
    const mainEl = document.querySelector('main');
    if (mainEl) {
      savedMainScrollPosRef.current = mainEl.scrollTop;
    }
  };

  const restoreScrollPosition = () => {
    requestAnimationFrame(() => {
      if (listContainerRef.current && savedScrollPosRef.current > 0) {
        listContainerRef.current.scrollTop = savedScrollPosRef.current;
      }
      const mainEl = document.querySelector('main');
      if (mainEl && savedMainScrollPosRef.current > 0) {
        mainEl.scrollTop = savedMainScrollPosRef.current;
      }
    });
  };

  // Persist Active Checker Name
  const handleSaveActiveChecker = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setActiveChecker(trimmed);
    localStorage.setItem('floor_audit_active_checker', trimmed);
    setShowCheckerPrompt(false);

    const updatedS = { ...session, activeChecker: trimmed, lastChecker: trimmed };
    setSession(updatedS);
    saveAuditSessionDB(updatedS).catch(() => {});
  };

  const handleOpenInspector = (res: AuditProductResult) => {
    if (!activeChecker || !activeChecker.trim()) {
      setShowCheckerPrompt(true);
      return;
    }
    captureScrollPosition();
    setSectionNotice(null);
    setInspectingResult(res);
  };

  // Quick Count Mode: Auto-commit current inspecting product as counted
  // Preserves any answers/remarks already entered; never clears or overwrites existing answers
  const commitCurrentProductQuickCount = async (targetToCommit: AuditProductResult): Promise<AuditProductResult> => {
    const draftValues = activeFormRef.current?.getDraftValues ? activeFormRef.current.getDraftValues() : {};
    const checkerToSave = activeChecker || targetToCommit.checkedBy || 'Floor Checker';
    
    // Status is preserved: if user checked boxes, use that status; if pending, it stays pending with isQuickCountScanned=true
    const updatedStatus = draftValues.status || targetToCommit.status;

    const payload: AuditProductResult = {
      ...targetToCommit,
      ...draftValues,
      isQuickCountScanned: true,
      quickCountScannedAt: targetToCommit.quickCountScannedAt || new Date().toISOString(),
      checkedBy: draftValues.checkedBy || checkerToSave,
      status: updatedStatus,
    };

    const { session: updatedS, result: savedR } = await saveProductResult(payload);
    if (updatedS) {
      setSession(updatedS);
    }
    setResultsMap((prev) => ({
      ...prev,
      [savedR.productId]: savedR,
    }));
    setIsModalDirty(false);
    return savedR;
  };

  const handleToggleQuickCountMode = (enabled: boolean) => {
    setIsQuickCountMode(enabled);
    localStorage.setItem(`quick_count_mode_${session.id}`, String(enabled));
    const updated = { ...session, isQuickCountMode: enabled, quickCountDuplicateCount: duplicateScanCount };
    setSession(updated);
    saveAuditSessionDB(updated).catch(() => {});
    showRunnerToast(enabled ? '⚡ Quick Count Mode enabled' : 'Normal Audit Mode enabled', 'info');
  };

  const handleCloseInspector = async () => {
    if (isQuickCountMode && inspectingResult) {
      try {
        await commitCurrentProductQuickCount(inspectingResult);
      } catch (err) {
        console.error('Error auto-committing on close in Quick Count Mode:', err);
      }
    }
    setInspectingResult(null);
    restoreScrollPosition();
  };

  const handleOpenVerify = (expected: ExpectedProductInfo) => {
    captureScrollPosition();
    setVerifyingProductInfo(expected);
  };

  const handleCloseVerify = () => {
    setVerifyingProductInfo(null);
    restoreScrollPosition();
  };

  // List of all results mapped to product objects
  const allResultsList = useMemo(() => {
    return session.productIds.map((pId) => {
      if (resultsMap[pId]) return resultsMap[pId];
      const p = products.find((prod) => prod.id === pId);
      return {
        id: `${session.id}_${pId}`,
        auditId: session.id,
        productId: pId,
        storeId: session.storeId,
        barcode: p?.barcode || '',
        productName: p?.name || 'Unknown Product',
        category: p?.category,
        brand: p?.brand,
        stock: p?.stock,
        salesCount: p?.salesCount,
        retailPrice: p?.retailPrice,
        costPrice: p?.costPrice || p?.cost,
        mrp: p?.mrp || p?.retailPrice,
        mainCode: p?.mainCode || p?.category,
        bansalCode: p?.bansalCode || p?.localCode || p?.code,
        code: p?.bansalCode || p?.localCode || p?.code,
        localCode: p?.bansalCode || p?.localCode || p?.code,
        lastPurchaseDate: p?.lastPurchaseDate || (p?.rawRowData ? (p.rawRowData['Last Pur Date'] || p.rawRowData['Last Purchase Date'] || p.rawRowData['Pur Date']) : undefined),
        status: 'pending' as const,
      };
    });
  }, [session.productIds, resultsMap, products, session.id, session.storeId]);

  // Quick Count Scan Predicate & Totals
  const isProductScanned = useCallback((r: AuditProductResult) => {
    return Boolean(r.isQuickCountScanned || r.status === 'done' || r.status === 'resolved' || r.status === 'flagged');
  }, []);

  const quickCountScannedTotal = useMemo(() => {
    return allResultsList.filter((r) => isProductScanned(r)).length;
  }, [allResultsList, isProductScanned]);

  const quickCountNotScannedTotal = useMemo(() => {
    return allResultsList.length - quickCountScannedTotal;
  }, [allResultsList.length, quickCountScannedTotal]);

  // Base predicate for operational filters (status, search query, quick count filter)
  const baseAuditPredicate = useCallback((r: AuditProductResult) => {
    // Quick Count filter (when Quick Count Mode is active)
    if (isQuickCountMode) {
      const scanned = isProductScanned(r);
      if (quickCountFilter === 'scanned' && !scanned) return false;
      if (quickCountFilter === 'not_scanned' && scanned) return false;
    }

    // Status filter
    if (statusFilter === 'pending' && r.status !== 'pending') return false;
    if (statusFilter === 'checked' && r.status !== 'done' && r.status !== 'resolved') return false;
    if (statusFilter === 'not_on_floor') {
      const isNotFloor = r.isDisplayedOnFloor === 'no' || r.isOnFloor === 'no' || r.isOnFloor === false || r.locationStatus === 'not_found' || r.dailyPurchaseOutcome === 'NOT_ON_FLOOR';
      if (!isNotFloor) return false;
    }
    if (statusFilter === 'board_incorrect') {
      const isBoardInc = r.isBoardCorrect === 'no' || r.boardStatus === 'board_missing' || r.boardStatus === 'wrong_price' || r.boardStatus === 'incorrect' || r.boardStatus === 'missing' || r.dailyPurchaseOutcome === 'BOARD_INCORRECT';
      if (!isBoardInc) return false;
    }
    if (statusFilter === 'flagged' && r.status !== 'flagged') return false;

    // Search query (Product Name, Local/Bansal Code, Barcode)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const prod = products.find((p) => p.id === r.productId);
      const matchesName = (r.productName || '').toLowerCase().includes(q);
      const matchesBarcode = (r.barcode || '').toLowerCase().includes(q);
      const codeVal = (r.bansalCode || r.localCode || r.code || prod?.localCode || '').toLowerCase();
      const matchesCode = codeVal.includes(q);
      if (!matchesName && !matchesBarcode && !matchesCode) return false;
    }

    return true;
  }, [isQuickCountMode, quickCountFilter, isProductScanned, statusFilter, searchQuery, products]);

  // Bidirectional linked options computation
  const linkedAuditResult = useMemo(() => {
    return computeLinkedClassificationOptions<AuditProductResult>(
      allResultsList,
      {
        getMainCode: (r) => {
          const prod = products.find((p) => p.id === r.productId);
          return r.mainCode || prod?.mainCode;
        },
        getCategory: (r) => {
          const prod = products.find((p) => p.id === r.productId);
          return r.category || prod?.category;
        }
      },
      {
        mainCodes: selectedMainCodes,
        categories: selectedCategories
      },
      baseAuditPredicate
    );
  }, [allResultsList, products, selectedMainCodes, selectedCategories, baseAuditPredicate]);

  const filteredResults = linkedAuditResult.filteredItems;
  const availableMainCodes = linkedAuditResult.mainCodeOptions;
  const availableCategories = linkedAuditResult.categoryOptions;

  // Barcode Scanning Auto-Match & Inspector Trigger
  useEffect(() => {
    if (!searchQuery.trim()) return;
    const q = searchQuery.trim().toLowerCase();
    
    // Check for exact barcode match
    const exactMatch = allResultsList.find((r) => r.barcode && r.barcode.toLowerCase() === q);
    if (exactMatch && (!inspectingResult || inspectingResult.id !== exactMatch.id)) {
      handleOpenInspector(exactMatch);
    }
  }, [searchQuery, allResultsList]);

  // Context-aware hardware / camera barcode scanner listener: SCAN -> OPEN -> REPLACE
  useEffect(() => {
    // 1. Matched in active audit
    const handleLocateEvent = async (e: Event) => {
      if (isSavingRef.current) return;
      const customEv = e as CustomEvent<{ productId: string; bansalCode?: string; barcode?: string }>;
      if (!customEv.detail) return;
      const { productId, bansalCode, barcode } = customEv.detail;

      // Debounce burst duplicate scanner events (< 400ms)
      const scanKey = barcode || bansalCode || productId;
      const now = Date.now();
      if (lastScanRef.current && lastScanRef.current.barcode === scanKey && (now - lastScanRef.current.time) < 400) {
        return;
      }
      lastScanRef.current = { barcode: scanKey, time: now };

      const target = allResultsList.find(
        (r) =>
          r.productId === productId ||
          (bansalCode && (r.bansalCode === bansalCode || r.code === bansalCode)) ||
          (barcode && r.barcode && r.barcode.toLowerCase() === barcode.toLowerCase())
      );

      if (!target) return;

      // Always dismiss top Stock IQ inspector on new scan to focus on audit check
      setStockInspectorProduct(null);

      // Pulse the row in background if visible
      const el =
        document.getElementById(`audit-card-${target.productId}`) ||
        document.querySelector(`[data-audit-product-id="${target.productId}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('scanner-matched-pulse');
        setTimeout(() => {
          el.classList.remove('scanner-matched-pulse');
        }, 2500);
      }

      // Quick Count Mode: Auto-commit previous product & immediately open new target
      if (isQuickCountMode) {
        if (inspectingResult && inspectingResult.productId !== target.productId) {
          try {
            await commitCurrentProductQuickCount(inspectingResult);
          } catch (err) {
            console.error('Error auto-committing previous product in Quick Count Mode:', err);
          }
        }

        const currentTargetRes = resultsMap[target.productId] || target;
        const alreadyCounted = isProductScanned(currentTargetRes);
        if (alreadyCounted) {
          setDuplicateScanCount((prev) => {
            const next = prev + 1;
            const updated = { ...session, quickCountDuplicateCount: next };
            setSession(updated);
            saveAuditSessionDB(updated).catch(() => {});
            return next;
          });
          showRunnerToast(`Duplicate scan: "${target.productName}" (already counted).`, 'info');
        } else {
          showRunnerToast(`Counted: "${target.productName}"`, 'success');
        }

        handleOpenInspector(currentTargetRes);
        return;
      }

      // Normal Mode (existing behavior):
      if (inspectingResult && inspectingResult.productId !== target.productId && isModalDirty) {
        setPendingScan({
          type: 'open_product',
          target,
          productName: target.productName,
          bansalCode: target.bansalCode || target.code,
          barcode: target.barcode || barcode
        });
        setShowUnsavedPrompt(true);
        return;
      }

      // No unsaved changes or no modal open: immediately open / replace!
      const currentRes = resultsMap[target.productId] || target;
      handleOpenInspector(currentRes);
    };

    // 2. Valid product outside active audit
    const handleNotInAuditEvent = (e: Event) => {
      if (isSavingRef.current) return;
      const customEv = e as CustomEvent<{ productName?: string; bansalCode?: string; barcode?: string }>;
      const detail = customEv.detail;

      // Always dismiss top Stock IQ inspector
      setStockInspectorProduct(null);

      if (isQuickCountMode) {
        // Do not count products outside active audit list
        showRunnerToast(`"${detail?.productName || detail?.barcode || 'Scanned product'}" is not part of this audit.`, 'error');
        return;
      }

      if (inspectingResult && isModalDirty) {
        setPendingScan({
          type: 'not_in_audit',
          target: null,
          productName: detail?.productName || 'Scanned Product',
          bansalCode: detail?.bansalCode,
          barcode: detail?.barcode
        });
        setShowUnsavedPrompt(true);
        return;
      }

      // If no unsaved edits, clear stale product inspector
      if (inspectingResult && !isModalDirty) {
        setInspectingResult(null);
      }
    };

    // 3. Unknown Barcode
    const handleNotFoundEvent = (e: Event) => {
      if (isSavingRef.current) return;
      const customEv = e as CustomEvent<{ barcode?: string }>;
      const detail = customEv.detail;

      // Always dismiss top Stock IQ inspector
      setStockInspectorProduct(null);

      if (isQuickCountMode) {
        // Do not count unknown barcodes
        showRunnerToast(`Barcode ${detail?.barcode || ''} not found in catalog or audit.`, 'error');
        return;
      }

      if (inspectingResult && isModalDirty) {
        setPendingScan({
          type: 'not_found',
          target: null,
          barcode: detail?.barcode
        });
        setShowUnsavedPrompt(true);
        return;
      }

      // If no unsaved edits, clear stale product inspector
      if (inspectingResult && !isModalDirty) {
        setInspectingResult(null);
      }
    };

    window.addEventListener('floor-audit-scan-locate', handleLocateEvent);
    window.addEventListener('floor-audit-scan-not-in-audit', handleNotInAuditEvent);
    window.addEventListener('floor-audit-scan-not-found', handleNotFoundEvent);

    return () => {
      window.removeEventListener('floor-audit-scan-locate', handleLocateEvent);
      window.removeEventListener('floor-audit-scan-not-in-audit', handleNotInAuditEvent);
      window.removeEventListener('floor-audit-scan-not-found', handleNotFoundEvent);
    };
  }, [allResultsList, resultsMap, inspectingResult, isModalDirty, isQuickCountMode, isProductScanned, session]);

  // Standard Audit Counts
  const totalCount = allResultsList.length;
  const pendingCount = useMemo(() => allResultsList.filter((r) => r.status === 'pending').length, [allResultsList]);
  const checkedCount = useMemo(() => allResultsList.filter((r) => r.status === 'done' || r.status === 'resolved').length, [allResultsList]);
  const notOnFloorCount = useMemo(() => allResultsList.filter((r) => 
    (r.status === 'done' || r.status === 'resolved' || r.status === 'flagged') && 
    (r.isDisplayedOnFloor === 'no' || r.isOnFloor === 'no' || r.isOnFloor === false || r.locationStatus === 'not_found' || r.dailyPurchaseOutcome === 'NOT_ON_FLOOR')
  ).length, [allResultsList]);
  const boardIncorrectCount = useMemo(() => allResultsList.filter((r) => 
    (r.status === 'done' || r.status === 'resolved' || r.status === 'flagged') && 
    (r.isBoardCorrect === 'no' || r.boardStatus === 'board_missing' || r.boardStatus === 'wrong_price' || r.boardStatus === 'incorrect' || r.boardStatus === 'missing' || r.dailyPurchaseOutcome === 'BOARD_INCORRECT')
  ).length, [allResultsList]);
  const actionReqCount = useMemo(() => allResultsList.filter((r) => r.status === 'flagged').length, [allResultsList]);

  const totalChecked = checkedCount + actionReqCount;
  const isCompleted = session.status === 'completed' || session.completedCount >= session.totalItems || pendingCount === 0;
  const progressPct = Math.round((totalChecked / (session.totalItems || 1)) * 100) || 0;

  // Active filter description string for copy header
  const activeFilterDesc = useMemo(() => {
    const parts: string[] = [];
    if (selectedMainCodes.length > 0) parts.push(`MC: ${selectedMainCodes.join(', ')}`);
    if (selectedCategories.length > 0) parts.push(`Cat: ${selectedCategories.join(', ')}`);
    if (statusFilter !== 'all') {
      const sMap: Record<string, string> = {
        pending: 'PENDING',
        checked: 'CHECKED',
        not_on_floor: 'NOT ON FLOOR',
        board_incorrect: 'BOARD INCORRECT',
        flagged: 'ACTION REQUIRED'
      };
      parts.push(sMap[statusFilter] || statusFilter.toUpperCase());
    }
    return parts.join(' • ');
  }, [selectedMainCodes, selectedCategories, statusFilter]);

  // Copy Handlers
  const handleCopySummary = async () => {
    const text = formatFloorAuditSummaryText(session, allResultsList);
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopyStatus('Summary copied');
      setTimeout(() => setCopyStatus(null), 2500);
    }
  };

  const handleCopyAll = async () => {
    let text = '';
    if (isDailyPurchase) {
      text = formatDailyPurchaseWhatsAppText(session, allResultsList, 'All Products', allResultsList);
    } else {
      text = formatFloorAuditResultsText(allResultsList, 'all', session.title, session);
    }
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopyStatus(`Copied All (${allResultsList.length})`);
      setTimeout(() => setCopyStatus(null), 2500);
    }
  };

  const handleCopyFiltered = async () => {
    let text = '';
    if (isDailyPurchase) {
      text = formatDailyPurchaseWhatsAppText(session, filteredResults, activeFilterDesc || undefined, allResultsList);
    } else {
      text = formatFloorAuditResultsText(
        filteredResults,
        'all',
        session.title,
        session,
        activeFilterDesc || undefined
      );
    }
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopyStatus(`Copied Filtered (${filteredResults.length})`);
      setTimeout(() => setCopyStatus(null), 2500);
    }
  };

  const handleCopyChecked = async () => {
    let text = '';
    if (isDailyPurchase) {
      const filtered = allResultsList.filter((r) => r.status === 'done' || r.status === 'resolved');
      text = formatDailyPurchaseWhatsAppText(session, filtered, 'Checked', allResultsList);
    } else {
      text = formatFloorAuditResultsText(allResultsList, 'checked', `${session.title} — Checked`, session);
    }
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopyStatus(`Copied Checked (${checkedCount})`);
      setTimeout(() => setCopyStatus(null), 2500);
    }
  };

  const handleCopyNotOnFloor = async () => {
    let text = '';
    if (isDailyPurchase) {
      const filtered = allResultsList.filter(
        (r) =>
          (r.status === 'done' || r.status === 'resolved' || r.status === 'flagged') &&
          (r.isDisplayedOnFloor === 'no' ||
            r.isOnFloor === 'no' ||
            r.isOnFloor === false ||
            r.locationStatus === 'not_found' ||
            r.dailyPurchaseOutcome === 'NOT_ON_FLOOR')
      );
      text = formatDailyPurchaseWhatsAppText(session, filtered, 'Not On Floor', allResultsList);
    } else {
      text = formatFloorAuditResultsText(allResultsList, 'not_on_floor', `${session.title} — Not On Floor`, session);
    }
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopyStatus(`Copied Not On Floor (${notOnFloorCount})`);
      setTimeout(() => setCopyStatus(null), 2500);
    }
  };

  const handleCopyActionRequired = async () => {
    let text = '';
    if (isDailyPurchase) {
      const filtered = allResultsList.filter((r) => r.status === 'flagged');
      text = formatDailyPurchaseWhatsAppText(session, filtered, 'Action Required', allResultsList);
    } else {
      text = formatFloorAuditResultsText(allResultsList, 'flagged', `${session.title} — Action Required`, session);
    }
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopyStatus(`Copied Action Req (${actionReqCount})`);
      setTimeout(() => setCopyStatus(null), 2500);
    }
  };

  const handleCopySingleProduct = async (res: AuditProductResult, e: React.MouseEvent) => {
    e.stopPropagation();
    const text = formatSingleProductResultText(res);
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopiedCardId(res.productId);
      setTimeout(() => setCopiedCardId(null), 2000);
    }
  };

  // Save product status action from modal
  const handleUpdateProductStatus = async (
    extraFields?: Partial<AuditProductResult>,
    newStatus: 'done' | 'flagged' | 'pending' = 'done',
    isNext: boolean = false,
    suppressClose: boolean = false
  ): Promise<boolean> => {
    if (!inspectingResult) return false;
    setIsSaving(true);
    try {
      const targetResult = inspectingResult;
      const checkerToSave = activeChecker || targetResult.checkedBy;

      const payload: AuditProductResult = {
        ...targetResult,
        ...extraFields,
        checkedBy: checkerToSave,
        status: newStatus,
      };

      const { session: updatedS, result: savedR } = await saveProductResult(payload);
      
      if (updatedS) {
        setSession(updatedS);
      }
      
      const newResultsMap = {
        ...resultsMap,
        [savedR.productId]: savedR,
      };
      setResultsMap(newResultsMap);

      // SAVE CHECK & NEXT MUST ADVANCE TO NEXT PENDING PRODUCT IN THE CURRENT FILTERED SECTION
      if (isNext) {
        // Find next pending product inside the current section filters (selectedMainCodes & selectedCategories & search)
        const pendingInCurrentFilter = allResultsList.filter((r) => {
          if (r.productId === targetResult.productId) return false;
          const currentRes = newResultsMap[r.productId] || r;
          if (currentRes.status !== 'pending') return false;

          const prod = products.find((p) => p.id === r.productId);
          const mc = r.mainCode || prod?.mainCode;
          const cat = r.category || prod?.category;

          if (selectedMainCodes.length > 0 && !matchesMainCodeFilter(mc, selectedMainCodes)) return false;
          if (selectedCategories.length > 0 && !matchesCategoryFilter(cat, selectedCategories)) return false;

          if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase().trim();
            const matchesName = (r.productName || '').toLowerCase().includes(q);
            const matchesBarcode = (r.barcode || '').toLowerCase().includes(q);
            const codeVal = (r.bansalCode || r.localCode || r.code || prod?.localCode || '').toLowerCase();
            if (!matchesName && !matchesBarcode && !codeVal.includes(q)) return false;
          }

          return true;
        });

        if (pendingInCurrentFilter.length > 0) {
          const nextItem = pendingInCurrentFilter[0];
          setInspectingResult(newResultsMap[nextItem.productId] || nextItem);
          setSectionNotice(null);
        } else {
          // No more pending items left in this section
          setInspectingResult(null);
          setSectionNotice("All products in this section are checked. Select another category or review checked items.");
          restoreScrollPosition();
        }
      } else {
        if (!suppressClose) {
          setInspectingResult(null);
          restoreScrollPosition();
        }
      }

      return true;
    } catch (err) {
      console.error('Failed to save audit result:', err);
      alert('Error saving audit result. Please check connection and try again.');
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  // Count remaining pending items in current inspecting item's category
  const remainingInCategoryCount = useMemo(() => {
    if (!inspectingResult) return 0;
    const currentCat = (inspectingResult.category || '').trim().toLowerCase();
    return allResultsList.filter((r) => {
      if (r.productId === inspectingResult.productId) return false;
      const currentRes = resultsMap[r.productId] || r;
      if (currentRes.status !== 'pending') return false;

      const prod = products.find((p) => p.id === r.productId);
      const rCat = (r.category || prod?.category || '').trim().toLowerCase();

      if (selectedCategories.length > 0) {
        return matchesCategoryFilter(rCat, selectedCategories);
      }
      return rCat === currentCat;
    }).length;
  }, [inspectingResult, allResultsList, resultsMap, selectedCategories, products]);

  // Focus Audit Save & Next Handler
  const handleSaveFocusCheckAndNext = async (
    fields: {
      display: 'YES' | 'NO';
      board: 'YES' | 'NO';
      boardType: 'B1G1' | 'OFF' | 'ONLY';
    },
    advanceToNext: boolean,
    suppressClose: boolean = false
  ): Promise<boolean> => {
    if (!inspectingResult) return false;
    setIsSaving(true);
    try {
      const targetResult = inspectingResult;
      const checkerToSave = activeChecker || targetResult.checkedBy || 'Floor Checker';
      const nowIso = new Date().toISOString();

      const payload: AuditProductResult = {
        ...targetResult,
        display: fields.display,
        board: fields.board,
        boardType: fields.boardType,
        isOnFloor: fields.display === 'YES' ? 'yes' : 'no',
        boardStatus: fields.board === 'YES' ? 'board_correct' : 'wrong_price',
        checkedAt: nowIso,
        checkedBy: checkerToSave,
        status: 'done',
      };

      const { session: updatedS, result: savedR } = await saveProductResult(payload);
      if (updatedS) {
        setSession(updatedS);
      }
      const newResultsMap = {
        ...resultsMap,
        [savedR.productId]: savedR,
      };
      setResultsMap(newResultsMap);

      if (advanceToNext) {
        const currentTargetCat = (targetResult.category || '').trim().toLowerCase();
        
        // Find next pending product in CURRENT FILTERED CATEGORY
        const pendingInCurrentCategory = allResultsList.filter((r) => {
          if (r.productId === targetResult.productId) return false;
          const currentRes = newResultsMap[r.productId] || r;
          if (currentRes.status !== 'pending') return false;

          const prod = products.find((p) => p.id === r.productId);
          const rCat = (r.category || prod?.category || '').trim().toLowerCase();

          if (selectedCategories.length > 0) {
            if (!matchesCategoryFilter(rCat, selectedCategories)) return false;
          } else {
            if (rCat !== currentTargetCat) return false;
          }

          if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase().trim();
            const matchesName = (r.productName || '').toLowerCase().includes(q);
            const matchesBarcode = (r.barcode || '').toLowerCase().includes(q);
            const codeVal = (r.bansalCode || r.localCode || r.code || prod?.localCode || '').toLowerCase();
            if (!matchesName && !matchesBarcode && !codeVal.includes(q)) return false;
          }

          return true;
        });

        if (pendingInCurrentCategory.length > 0) {
          const nextItem = pendingInCurrentCategory[0];
          setInspectingResult(newResultsMap[nextItem.productId] || nextItem);
          setSectionNotice(null);
        } else {
          setInspectingResult(null);
          setSectionNotice("All products in this category are checked.");
          restoreScrollPosition();
        }
      } else {
        if (!suppressClose) {
          setInspectingResult(null);
          restoreScrollPosition();
        }
      }

      return true;
    } catch (err) {
      console.error('Failed to save focus check result:', err);
      alert('Error saving check result. Please try again.');
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const handleBackToHub = async () => {
    if (isQuickCountMode && inspectingResult) {
      try {
        await commitCurrentProductQuickCount(inspectingResult);
      } catch (err) {
        console.error('Error auto-committing on back in Quick Count Mode:', err);
      }
    }
    onBackToHub();
  };

  const handleFinishAudit = async () => {
    if (isQuickCountMode && inspectingResult) {
      try {
        await commitCurrentProductQuickCount(inspectingResult);
      } catch (err) {
        console.error('Error auto-committing on finish in Quick Count Mode:', err);
      }
    }

    const confirmed = window.confirm(
      `Finish this audit session? ${checkedCount} of ${totalCount} products have been checked.`
    );
    if (!confirmed) return;

    const updatedS: AuditSession = {
      ...session,
      status: 'completed',
      completedAt: new Date().toISOString(),
      completedCount: checkedCount,
    };
    setSession(updatedS);
    await saveAuditSessionDB(updatedS);
  };

  const handleExportExcel = async () => {
    try {
      if (isZeroSale) {
        await exportZeroSaleAuditToExcel(session, allResultsList);
      } else if (isDailyPurchase) {
        await exportDailyPurchaseAuditToExcel(session, allResultsList);
      } else if (isFocusAudit) {
        await exportFocusAuditToExcel(session, allResultsList);
      } else {
        await exportAuditSessionToExcel(session, allResultsList);
      }
    } catch (err: any) {
      console.error('Failed to export audit to Excel:', err);
      alert('Error exporting Excel: ' + (err?.message || 'Please try again.'));
    }
  };

  // Render Post-Save Compact Card Summary
  const renderCardSummary = (r: AuditProductResult) => {
    if (r.status === 'pending') return null;

    if (isDailyPurchase) {
      const isFloorYes = r.isDisplayedOnFloor === 'yes' || r.isOnFloor === 'yes' || r.isOnFloor === true;
      const isFloorNo = r.isDisplayedOnFloor === 'no' || r.isOnFloor === 'no' || r.isOnFloor === false || r.locationStatus === 'not_found';
      const boardAns = r.isBoardCorrect === 'yes' || r.boardStatus === 'board_correct' || r.boardStatus === 'correct'
        ? 'Correct'
        : r.isBoardCorrect === 'no' || r.boardStatus === 'board_missing' || r.boardStatus === 'wrong_price' || r.boardStatus === 'incorrect' || r.boardStatus === 'missing'
        ? 'Incorrect'
        : r.isBoardCorrect === 'not_applicable' || r.boardStatus === 'not_applicable'
        ? 'N/A'
        : 'Pending';

      return (
        <div className="mt-1.5 p-2 rounded-lg bg-slate-100/90 dark:bg-slate-800/80 border border-slate-200/60 dark:border-slate-700/60 text-xs space-y-1 font-sans font-medium text-slate-700 dark:text-slate-300">
          <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white flex-wrap">
            <span className={isFloorYes ? 'text-emerald-600 dark:text-emerald-400' : isFloorNo ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500'}>
              Floor: <strong>{isFloorYes ? 'YES' : isFloorNo ? 'NO (NOT ON FLOOR)' : 'Pending'}</strong>
            </span>
            <span>•</span>
            <span className={boardAns === 'Correct' ? 'text-emerald-600 dark:text-emerald-400' : boardAns === 'Incorrect' ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500'}>
              Board: <strong>{boardAns}</strong>
            </span>
          </div>

          {r.remarks && (
            <div className="text-[11px] text-slate-600 dark:text-slate-300 italic truncate">
              Remark: {r.remarks}
            </div>
          )}

          {r.status === 'flagged' && (
            <div className="text-[11px] font-bold text-rose-600 dark:text-rose-400 truncate">
              Issue: {r.issueReason || r.remarks || 'Action Required'}
            </div>
          )}

          <div className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center justify-between pt-0.5 border-t border-slate-200/40 dark:border-slate-700/40">
            <span>Checked by {r.checkedBy || activeChecker || 'Floor Team'}</span>
            {r.checkedTime && <span>{r.checkedDate} {r.checkedTime}</span>}
          </div>
        </div>
      );
    }

    if (isFocusAudit) {
      const displayVal = r.display || (r.isOnFloor === 'yes' || r.isOnFloor === true ? 'YES' : 'NO');
      const boardVal = r.board || (r.boardStatus === 'board_correct' || r.boardStatus === 'correct' ? 'YES' : 'NO');
      const boardTypeVal = r.boardType;

      return (
        <div className="mt-1 p-2 rounded-lg bg-slate-100/90 dark:bg-slate-800/80 border border-slate-200/60 dark:border-slate-700/60 text-xs space-y-1 font-sans font-medium text-slate-700 dark:text-slate-300">
          <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white flex-wrap">
            <span className={displayVal === 'YES' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>
              Display: <strong>{displayVal}</strong>
            </span>
            <span>•</span>
            <span className={boardVal === 'YES' ? 'text-indigo-600 dark:text-indigo-400' : 'text-rose-600 dark:text-rose-400'}>
              Board: <strong>{boardVal}</strong>
            </span>
            {boardVal === 'YES' && boardTypeVal && (
              <span className="px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 text-[10px] font-mono">
                {boardTypeVal}
              </span>
            )}
          </div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
            <span>Checked by {r.checkedBy || activeChecker || 'Floor Team'}</span>
            {r.checkedAt && (
              <span>{new Date(r.checkedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            )}
          </div>
        </div>
      );
    }

    const isOnFloorStr = (r.isOnFloor === 'yes' || r.isOnFloor === true) 
      ? 'On Floor' 
      : (r.isOnFloor === 'no' || r.isOnFloor === false || r.locationStatus === 'not_found') 
      ? 'Not On Floor' 
      : (r.locationStatus === 'on_floor' || r.locationStatus === 'both') 
      ? 'On Floor' 
      : 'Not On Floor';
    
    const visLabel = r.visibilityLevel === 'eye_level' ? 'Eye Level' : r.visibilityLevel === 'above_eye' ? 'Above Eye' : r.visibilityLevel === 'below_eye' ? 'Below Eye' : '';
    
    const locsStr = Array.isArray(r.displayLocations) && r.displayLocations.length > 0 ? r.displayLocations.join(', ') : '';

    const boardStr = (r.boardStatus === 'correct' || r.boardStatus === 'board_correct') 
      ? 'Board Correct' 
      : (r.boardStatus === 'incorrect' || r.boardStatus === 'wrong_price') 
      ? 'Board Incorrect' 
      : (r.boardStatus === 'missing' || r.boardStatus === 'board_missing') 
      ? 'Board Missing' 
      : 'Board N/A';

    const checkerName = r.checkedBy || activeChecker || 'Floor Team';

    return (
      <div className="mt-1 p-1.5 rounded-lg bg-slate-100/90 dark:bg-slate-800/80 border border-slate-200/60 dark:border-slate-700/60 text-[10px] space-y-0.5 font-sans font-medium text-slate-700 dark:text-slate-300">
        <div className="flex items-center gap-1.5 flex-wrap font-bold text-slate-900 dark:text-white">
          <span className={isOnFloorStr === 'On Floor' ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}>
            {isOnFloorStr}
          </span>
          {visLabel && <span>• {visLabel}</span>}
          {locsStr && <span>• {locsStr}</span>}
        </div>

        <div className="flex items-center justify-between gap-1 text-[10px] text-slate-500 dark:text-slate-400">
          <span>{boardStr}</span>
          <span className="font-bold text-slate-700 dark:text-slate-200">• {checkerName}</span>
        </div>

        {r.remarks && (
          <div className="text-[10px] text-slate-600 dark:text-slate-300 italic truncate">
            Remark: {r.remarks}
          </div>
        )}

        {r.status === 'flagged' && r.issueReason && (
          <div className="text-[10px] font-bold text-rose-600 dark:text-rose-400 truncate">
            Issue: {r.issueReason}
          </div>
        )}
      </div>
    );
  };

  // Active Filters Count for badge
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (selectedMainCodes.length > 0) count += selectedMainCodes.length;
    if (selectedCategories.length > 0) count += selectedCategories.length;
    if (statusFilter !== 'all') count++;
    if (searchQuery.trim() !== '') count++;
    return count;
  }, [selectedMainCodes, selectedCategories, statusFilter, searchQuery]);

  // Reset all filters
  const handleResetFilters = () => {
    setSelectedMainCodes([]);
    setSelectedCategories([]);
    setStatusFilter('all');
    setQuickCountFilter('all');
    setSearchQuery('');
  };

  // Unsaved Edits Modal actions
  const handleUnsavedDiscardAndProceed = () => {
    if (isSavingRef.current) return;
    setIsModalDirty(false);
    setShowUnsavedPrompt(false);
    const targetToOpen = pendingScan;
    setPendingScan(null);
    if (!targetToOpen) return;
    if (targetToOpen.type === 'open_product' && targetToOpen.target) {
      handleOpenInspector(targetToOpen.target);
    } else {
      setInspectingResult(null);
    }
  };

  const handleUnsavedSaveAndProceed = async () => {
    if (!inspectingResult || isSavingRef.current) return;
    isSavingRef.current = true;
    isSaveAndOpenActiveRef.current = true;
    setIsUnsavedSaving(true);
    try {
      if (!activeFormRef.current) {
        throw new Error('Check form reference is not ready.');
      }
      const savedSuccessfully = await activeFormRef.current.submitValidated(false);
      // Safeguard: Only explicit boolean true confirms persistence; undefined, void or false is NOT success
      if (savedSuccessfully === true) {
        setIsModalDirty(false);
        setShowUnsavedPrompt(false);
        const nextScan = pendingScan;
        setPendingScan(null);
        if (nextScan && nextScan.type === 'open_product' && nextScan.target) {
          handleOpenInspector(nextScan.target);
        } else {
          setInspectingResult(null);
        }
      } else {
        setShowUnsavedPrompt(false);
        showRunnerToast('Please correct validation errors or retry saving Product A.', 'error');
      }
    } catch (err: any) {
      console.error('Error during Save & Open Scanned Product:', err);
      setShowUnsavedPrompt(false);
      showRunnerToast('Save failed: ' + (err?.message || 'Please check connection and retry.'), 'error');
    } finally {
      isSavingRef.current = false;
      isSaveAndOpenActiveRef.current = false;
      setIsUnsavedSaving(false);
    }
  };

  const handleUnsavedCancel = () => {
    if (isSavingRef.current) return;
    setShowUnsavedPrompt(false);
    setPendingScan(null);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-2 pb-24 font-bold relative min-h-screen flex flex-col">
      
      {/* 1. COMPACT STICKY MOBILE-FIRST HEADER BAR */}
      <div className={`sticky top-0 z-30 px-3 py-2 rounded-2xl border backdrop-blur-md transition-all shadow-xs flex items-center justify-between gap-2 ${
        isDarkMode ? 'bg-slate-900/95 border-slate-800 text-slate-100' : 'bg-white/95 border-slate-200 text-slate-900'
      }`}>
        {/* Left: Back Button */}
        <button
          type="button"
          onClick={handleBackToHub}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0 min-h-[44px] min-w-[44px] justify-center"
          title="Back to Previous View"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="hidden xs:inline">Back</span>
        </button>

        {/* Center: Audit Title + Subtitle */}
        <div className="flex flex-col items-center justify-center min-w-0 flex-1 px-1 text-center">
          <h1 className="text-xs sm:text-sm font-black break-words line-clamp-2 max-w-full text-slate-900 dark:text-white leading-tight">
            {session.title}
          </h1>
          <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400 truncate max-w-full">
            {isDailyPurchase
              ? `${session.purchaseMeta?.storeName || session.storeName || 'PATAN'} • ${cleanStockReportPeriod !== 'Period unavailable' ? cleanStockReportPeriod : (session.reportPeriod || session.auditDate || 'Daily Purchase')}`
              : isFocusAudit
              ? `${session.focusMonth || 'Focus'} • ${session.sourceList || 'Focus Audit'}`
              : `${session.storeName || 'PATAN'} • Floor Audit`}
          </div>
        </div>

        {/* Right Actions: Compact Progress Count Pill + Filter Button + Camera */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={`text-[11px] font-bold font-mono px-2 py-1 rounded-lg border whitespace-nowrap hidden xxs:inline-block ${
            isCoreFocus
              ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/80 border-indigo-200 dark:border-indigo-800/60'
              : isFocusAudit
              ? 'text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/80 border-teal-200 dark:border-teal-800/60'
              : 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/80 border-indigo-200 dark:border-indigo-800/60'
          }`}>
            {totalChecked}/{totalCount} · {progressPct}%
          </span>

          {/* Filter Drawer Trigger Button */}
          <button
            type="button"
            onClick={() => setIsFilterDrawerOpen(true)}
            className={`min-h-[44px] px-2.5 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs ${
              activeFiltersCount > 0
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700'
            }`}
            title="Open Filters & Audit Tools"
          >
            <Filter className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Filters</span>
            {activeFiltersCount > 0 && (
              <span className="px-1.5 py-0.2 text-[10px] font-black rounded-full bg-white text-indigo-700">
                {activeFiltersCount}
              </span>
            )}
          </button>

          {onOpenScanner && (
            <button
              type="button"
              onClick={onOpenScanner}
              className="min-h-[44px] min-w-[44px] p-2 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 transition-colors cursor-pointer shrink-0 flex items-center justify-center shadow-2xs"
              title="Open Camera Scanner"
            >
              <Camera className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* 2. SCROLLABLE ACTIVE FILTERS CHIPS BAR */}
      {activeFiltersCount > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap px-1 py-0.5 text-xs animate-fade-in">
          <span className="text-[11px] text-slate-400 font-semibold">Active filters:</span>
          {statusFilter !== 'all' && (
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-200 border border-indigo-200 dark:border-indigo-800 text-[11px] font-bold cursor-pointer hover:bg-indigo-200"
            >
              <span>Status: {statusFilter.replace('_', ' ')}</span>
              <X className="w-3 h-3" />
            </button>
          )}

          {selectedMainCodes.map((mc) => (
            <button
              key={mc}
              type="button"
              onClick={() => setSelectedMainCodes(selectedMainCodes.filter((m) => m !== mc))}
              className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-[11px] font-bold cursor-pointer hover:bg-slate-200"
            >
              <span>MC: {mc}</span>
              <X className="w-3 h-3" />
            </button>
          ))}

          {selectedCategories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategories(selectedCategories.filter((c) => c !== cat))}
              className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-[11px] font-bold cursor-pointer hover:bg-slate-200"
            >
              <span>Cat: {cat}</span>
              <X className="w-3 h-3" />
            </button>
          ))}

          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-[11px] font-bold cursor-pointer hover:bg-slate-200"
            >
              <span>"{searchQuery}"</span>
              <X className="w-3 h-3" />
            </button>
          )}

          <button
            type="button"
            onClick={handleResetFilters}
            className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline ml-1 cursor-pointer"
          >
            Clear all
          </button>
        </div>
      )}

      {/* 3. SCROLLABLE BANNER WITH ACTIVE CHECKER & QUICK TOOLS (Scrolls with page) */}
      <div className={`p-2.5 rounded-2xl border space-y-2 ${
        isDarkMode ? 'bg-slate-900/60 border-slate-800' : 'bg-white border-slate-200'
      } shadow-2xs`}>
        {/* Active Checker row */}
        <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/50 border border-indigo-100 dark:border-indigo-900/60 text-xs">
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <UserCheck className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 truncate">
              Checked by: <strong className="text-slate-900 dark:text-white font-bold">{activeChecker || 'Set Checker Name'}</strong>
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              setCheckerInputName(activeChecker);
              setShowCheckerPrompt(true);
            }}
            className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline shrink-0 min-h-[32px] flex items-center cursor-pointer"
          >
            Change
          </button>
        </div>

        {/* For Daily Purchase: Stock Report Period Banner (Clean, shown once) */}
        {isDailyPurchase && (
          <div className="flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 text-[11px] font-mono">
            <span className="text-slate-600 dark:text-slate-300">
              Stock Report: <strong className="text-indigo-600 dark:text-indigo-400 font-bold">{cleanStockReportPeriod}</strong>
            </span>
            <span className="text-slate-500 dark:text-slate-400">
              Store: <strong className="text-slate-800 dark:text-slate-200 font-bold">{session.purchaseMeta?.storeName || session.storeName || 'PATAN'}</strong>
            </span>
          </div>
        )}

        {/* Quick Count Mode & Filter Bar */}
        <div className={`p-2 sm:p-2.5 rounded-xl border flex flex-col md:flex-row md:items-center justify-between gap-2 text-xs transition-all ${
          isQuickCountMode
            ? isDarkMode
              ? 'bg-emerald-950/30 border-emerald-800 text-emerald-100'
              : 'bg-emerald-50/90 border-emerald-300 text-emerald-950 shadow-2xs'
            : isDarkMode
            ? 'bg-slate-800/60 border-slate-700/80 text-slate-200'
            : 'bg-slate-50 border-slate-200 text-slate-800'
        }`}>
          {/* Toggle Button & Live Counter */}
          <div className="flex items-center justify-between sm:justify-start gap-2.5 flex-wrap">
            <button
              type="button"
              onClick={() => handleToggleQuickCountMode(!isQuickCountMode)}
              className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs min-h-[38px] ${
                isQuickCountMode
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs'
                  : 'bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200'
              }`}
              title="Toggle Quick Count Mode"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Quick Count Mode: {isQuickCountMode ? 'ON' : 'OFF'}</span>
            </button>

            <div className="flex items-center gap-1.5 font-mono text-xs">
              <span className={`font-bold ${isQuickCountMode ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-600 dark:text-slate-400'}`}>
                Products Counted: <strong className="font-black text-slate-900 dark:text-white">{quickCountScannedTotal} / {totalCount}</strong>
              </span>
              {duplicateScanCount > 0 && (
                <span className="text-[11px] text-amber-600 dark:text-amber-400 font-semibold">
                  ({duplicateScanCount} duplicate scan{duplicateScanCount > 1 ? 's' : ''})
                </span>
              )}
            </div>
          </div>

          {/* Quick Count Filter Tabs: All Products (N) | Scanned (X) | Not Scanned (Y) */}
          {isQuickCountMode && (
            <div className="flex items-center gap-1 bg-white/90 dark:bg-slate-900/90 p-1 rounded-xl border border-emerald-300 dark:border-emerald-800/80 shrink-0">
              <button
                type="button"
                onClick={() => setQuickCountFilter('all')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  quickCountFilter === 'all'
                    ? 'bg-emerald-600 text-white shadow-2xs'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                All Products ({totalCount})
              </button>
              <button
                type="button"
                onClick={() => setQuickCountFilter('scanned')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  quickCountFilter === 'scanned'
                    ? 'bg-emerald-600 text-white shadow-2xs'
                    : 'text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100/60 dark:hover:bg-emerald-950/60'
                }`}
              >
                Scanned ({quickCountScannedTotal})
              </button>
              <button
                type="button"
                onClick={() => setQuickCountFilter('not_scanned')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  quickCountFilter === 'not_scanned'
                    ? 'bg-slate-800 text-white dark:bg-slate-700 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                Not Scanned ({quickCountNotScannedTotal})
              </button>
            </div>
          )}
        </div>

        {/* Quick Search and Action Row */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3.5 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search product name, code, or barcode..."
              className="w-full pl-9 pr-8 py-2 rounded-xl border text-xs bg-slate-50 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium min-h-[44px]"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-3 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={handleCopyAll}
            className="min-h-[44px] px-3 py-2 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 cursor-pointer shadow-2xs"
            title="Copy entire audit to WhatsApp"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>Copy</span>
          </button>
        </div>
      </div>

      {/* Section notice when all items in current filter are checked */}
      {sectionNotice && (
        <div className="p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800 text-indigo-900 dark:text-indigo-200 text-xs font-bold flex items-center justify-between gap-2 shadow-xs animate-fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <span>{sectionNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => setSectionNotice(null)}
            className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Completion Notification if completed */}
      {isCompleted && (
        <div className={`p-3 rounded-xl border flex items-center justify-between gap-3 text-xs shadow-xs ${
          isDarkMode ? 'bg-emerald-950/30 border-emerald-800 text-emerald-200' : 'bg-emerald-50 border-emerald-200 text-emerald-900'
        }`}>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span className="font-bold">Audit Completed! ({totalCount} items audited)</span>
          </div>
          <button
            type="button"
            onClick={handleExportExcel}
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3 py-1.5 rounded-lg shadow-xs cursor-pointer active:scale-95 transition-all shrink-0 min-h-[38px]"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Export Excel</span>
          </button>
        </div>
      )}

      {/* 2. COMPACT MOBILE PRODUCT LIST */}
      <div className="flex-1 space-y-2" ref={listContainerRef}>
        {filteredResults.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-xs font-medium rounded-xl border border-dashed border-slate-300 dark:border-slate-800">
            No products found matching your filter.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
            {filteredResults.map((res) => {
              const prod = products.find((p) => p.id === res.productId);
              const isChecked = res.status === 'done' || res.status === 'resolved';
              const isNotOnFloor = isChecked && (res.isOnFloor === 'no' || res.isOnFloor === false || res.locationStatus === 'not_found');
              const isActionRequired = res.status === 'flagged';
              const lpdDisplay = cleanDateOnly(res.lastPurchaseDate || prod?.lastPurchaseDate) || '—';

              return (
                <div
                  key={res.id}
                  id={`audit-card-${res.productId}`}
                  data-audit-product-id={res.productId}
                  data-audit-bansal-code={res.bansalCode || res.code}
                  data-audit-barcode={res.barcode}
                  onClick={() => handleOpenInspector(res)}
                  className={`p-2.5 rounded-xl border transition-all cursor-pointer hover:border-indigo-500 flex flex-col justify-between gap-2 relative group overflow-x-hidden ${
                    isActionRequired
                      ? 'bg-rose-50/40 dark:bg-rose-950/10 border-rose-200 dark:border-rose-900/50'
                      : isNotOnFloor
                      ? 'bg-amber-50/40 dark:bg-amber-950/10 border-amber-200 dark:border-amber-900/50'
                      : isChecked
                      ? 'bg-emerald-50/40 dark:bg-emerald-950/10 border-emerald-200 dark:border-emerald-900/50'
                      : isQuickCountMode && isProductScanned(res)
                      ? 'bg-emerald-50/30 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-800/80 shadow-2xs'
                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                  }`}
                >
                  {/* Card Header & Details */}
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white leading-tight flex-1 break-words">
                        {res.productName}
                      </h4>

                      {/* Status Badges */}
                      <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
                        {isQuickCountMode && (
                          <span
                            className={`text-[9px] font-black uppercase px-2 py-0.5 rounded border shrink-0 flex items-center gap-0.5 ${
                              isProductScanned(res)
                                ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-700'
                                : 'bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
                            }`}
                          >
                            {isProductScanned(res) ? '✓ SCANNED' : 'NOT SCANNED'}
                          </span>
                        )}

                        <span
                          className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded border shrink-0 ${
                            isActionRequired
                              ? 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950 dark:text-rose-200 dark:border-rose-700'
                              : isNotOnFloor
                              ? 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-700'
                              : isChecked
                              ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-700'
                              : 'bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
                          }`}
                        >
                          {isActionRequired
                            ? 'Action Required'
                            : isNotOnFloor
                            ? 'Checked • Not On Floor'
                            : isChecked
                            ? 'Checked'
                            : 'Pending'}
                        </span>
                      </div>
                    </div>

                    {/* Card Metadata Section */}
                    {isDailyPurchase ? (() => {
                      const liveMatch = getLiveProductForAuditResult(res);
                      const liveProd = liveMatch.product;
                      const isAmbiguous = liveMatch.isAmbiguous || Boolean(res.isAmbiguousMatch);

                      // Closing Qty formatting
                      let closingDisplay = 'Not Available';
                      if (isAmbiguous) {
                        closingDisplay = 'Ambiguous Match';
                      } else if (liveProd) {
                        const val = liveProd.stock ?? liveProd.closingQty ?? liveProd.closingStock;
                        if (val !== undefined && val !== null && !isNaN(Number(val))) {
                          closingDisplay = String(Number(val));
                        }
                      }

                      // Sales Qty formatting
                      let salesDisplay = 'Not Available';
                      if (isAmbiguous) {
                        salesDisplay = 'Ambiguous Match';
                      } else if (liveProd) {
                        const val = liveProd.salesCount ?? liveProd.salesQty;
                        if (val !== undefined && val !== null && !isNaN(Number(val))) {
                          salesDisplay = String(Number(val));
                        }
                      }

                      // MRP formatting
                      let mrpDisplay = '—';
                      if (isAmbiguous) {
                        mrpDisplay = 'Ambiguous';
                      } else {
                        const val = liveProd?.mrp ?? res.mrp;
                        if (val !== undefined && val !== null && !isNaN(Number(val)) && Number(val) > 0) {
                          mrpDisplay = `₹${Number(val)}`;
                        }
                      }

                      // SP (Selling Price) formatting
                      let spDisplay = '—';
                      if (isAmbiguous) {
                        spDisplay = 'Ambiguous';
                      } else {
                        const val = liveProd?.retailPrice ?? res.retailPrice ?? res.salePrice ?? liveProd?.mrp ?? res.mrp;
                        if (val !== undefined && val !== null && !isNaN(Number(val)) && Number(val) > 0) {
                          spDisplay = `₹${Number(val)}`;
                        }
                      }

                      // Last Purchase Date
                      const lpdVal = cleanDateOnly(res.lastPurchaseDate || liveProd?.lastPurchaseDate) || 'Not Available';

                      return (
                        <>
                          {/* Bansal Code, Barcode, MainCode, Category, Brand */}
                          <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-600 dark:text-slate-300 flex-wrap">
                            <span className="font-mono text-[11px] font-bold text-indigo-600 dark:text-indigo-400">
                              Code: {res.bansalCode || res.code || '—'}
                            </span>
                            {res.barcode && (
                              <span className="px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[10px] font-mono flex items-center gap-1">
                                <Scan className="w-2.5 h-2.5 text-slate-400" />
                                {res.barcode}
                              </span>
                            )}
                            {res.mainCode && (
                              <span className="px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[10px] font-bold border border-slate-200 dark:border-slate-700">
                                {res.mainCode}
                              </span>
                            )}
                            {res.category && (
                              <span className="px-1.5 py-0.2 rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 text-[10px] font-bold border border-indigo-200 dark:border-indigo-800">
                                {res.category}
                              </span>
                            )}
                            {res.brand && (
                              <span className="text-[10px] font-semibold text-slate-500">
                                Brand: {res.brand}
                              </span>
                            )}
                          </div>

                          {/* Purchased Quantity and Free Quantity (Inward) */}
                          <div className="flex items-center gap-3 text-xs font-mono">
                            <span>Purchased Qty: <strong className="text-slate-900 dark:text-white font-bold text-sm">{res.purchasedQty ?? res.purchaseQty ?? 0}</strong></span>
                            {(res.freeQty ?? 0) > 0 && (
                              <span className="px-1.5 py-0.2 text-[10px] font-extrabold rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                                +{res.freeQty} Free
                              </span>
                            )}
                          </div>

                          {/* COMPACT PRODUCT METRICS GRID: MRP, SP, Closing, Sales */}
                          <div className="grid grid-cols-2 gap-x-3 gap-y-1 p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 font-mono text-xs shadow-2xs">
                            <div className="flex items-center justify-between">
                              <span className="text-slate-500 dark:text-slate-400 font-sans text-[11px]">MRP:</span>
                              <strong className="text-slate-900 dark:text-white font-bold">{mrpDisplay}</strong>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-slate-500 dark:text-slate-400 font-sans text-[11px]">SP:</span>
                              <strong className="text-emerald-600 dark:text-emerald-400 font-bold">{spDisplay}</strong>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-slate-500 dark:text-slate-400 font-sans text-[11px]">Closing:</span>
                              <strong className={`font-bold ${isAmbiguous ? 'text-amber-600' : 'text-indigo-600 dark:text-indigo-400'}`}>{closingDisplay}</strong>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-slate-500 dark:text-slate-400 font-sans text-[11px]">Sales:</span>
                              <strong className={`font-bold ${isAmbiguous ? 'text-amber-600' : 'text-slate-800 dark:text-slate-200'}`}>{salesDisplay}</strong>
                            </div>
                          </div>

                          {/* Supplier information */}
                          <div className="text-[10.5px] text-slate-500 dark:text-slate-400 truncate">
                            Supplier: <strong className="text-slate-700 dark:text-slate-300 font-semibold">{
                              res.suppliersList && res.suppliersList.length > 0
                                ? res.suppliersList.map(s => `${s.supplierName}${s.purchaseQty ? ` (${s.purchaseQty})` : ''}`).join(', ')
                                : res.supplierName || res.supplier || 'Direct Inward'
                            }</strong>
                          </div>

                          {/* Last Purchase Date Display */}
                          <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 font-mono flex-wrap">
                            <div className="flex items-center gap-1.5">
                              <Calendar className="w-3 h-3 text-indigo-500 shrink-0" />
                              <span>
                                Last Purchase: <strong className="text-slate-800 dark:text-slate-200 font-bold">{lpdVal}</strong>
                              </span>
                            </div>
                            {isAmbiguous && (
                              <span className="px-1.5 py-0.2 rounded bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 font-bold text-[9.5px]">
                                Review Match
                              </span>
                            )}
                          </div>
                        </>
                      );
                    })() : isFocusAudit ? (() => {
                      const liveMatch = getLiveProductForAuditResult(res);
                      const liveProd = liveMatch.product;
                      const isAmbiguous = liveMatch.isAmbiguous || Boolean(res.isAmbiguousMatch);

                      let closingDisplay = 'Not Available';
                      if (isAmbiguous) {
                        closingDisplay = 'Ambiguous Match';
                      } else if (liveProd) {
                        const val = liveProd.stock ?? liveProd.closingQty ?? liveProd.closingStock;
                        if (val !== undefined && val !== null && !isNaN(Number(val))) {
                          closingDisplay = String(Number(val));
                        }
                      }

                      let salesDisplay = 'Not Available';
                      if (isAmbiguous) {
                        salesDisplay = 'Ambiguous Match';
                      } else if (liveProd) {
                        const val = liveProd.salesCount ?? liveProd.salesQty;
                        if (val !== undefined && val !== null && !isNaN(Number(val))) {
                          salesDisplay = String(Number(val));
                        }
                      }

                      let mrpDisplay = '—';
                      if (isAmbiguous) {
                        mrpDisplay = 'Ambiguous';
                      } else {
                        const val = liveProd?.mrp ?? res.mrp;
                        if (val !== undefined && val !== null && !isNaN(Number(val)) && Number(val) > 0) {
                          mrpDisplay = `₹${Number(val)}`;
                        }
                      }

                      let spDisplay = '—';
                      if (isAmbiguous) {
                        spDisplay = 'Ambiguous';
                      } else {
                        const val = liveProd?.retailPrice ?? res.retailPrice ?? res.salePrice ?? liveProd?.mrp ?? res.mrp;
                        if (val !== undefined && val !== null && !isNaN(Number(val)) && Number(val) > 0) {
                          spDisplay = `₹${Number(val)}`;
                        }
                      }

                      return (
                        <>
                          {/* Main Code (if available) & Category & Bansal Code */}
                          <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-600 dark:text-slate-300 flex-wrap">
                            {res.mainCode && (
                              <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[10px] font-bold border border-slate-200 dark:border-slate-700">
                                MC: {res.mainCode}
                              </span>
                            )}
                            {res.category && (
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                                isCoreFocus
                                  ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800'
                                  : 'bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 border-teal-200 dark:border-teal-800'
                              }`}>
                                {res.category}
                              </span>
                            )}
                            <span className="font-sans text-slate-500 text-xs">
                              Code: <strong className="font-mono text-slate-800 dark:text-slate-200">{res.bansalCode || res.code || prod?.localCode || '—'}</strong>
                            </span>
                          </div>

                          {/* Focus Offer & Snapshot MRP */}
                          <div className="flex items-center gap-3 text-xs font-mono">
                            <span>Focus MRP: <strong className="text-slate-900 dark:text-white font-bold">₹{res.mrp ?? res.retailPrice ?? prod?.retailPrice ?? 0}</strong></span>
                            {res.focusOffer && (
                              <span className="text-amber-700 dark:text-amber-300 font-bold bg-amber-50 dark:bg-amber-950/50 px-2 py-0.5 rounded border border-amber-200 dark:border-amber-800 text-[11px] truncate max-w-full">
                                Offer: {res.focusOffer}
                              </span>
                            )}
                          </div>

                          {/* Consistent Live Stock Metrics on Card: Closing, Sales, Live SP */}
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 text-[11px] font-mono pt-1">
                            <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300">
                              MRP: <strong className="text-slate-900 dark:text-white font-bold">{mrpDisplay}</strong>
                            </span>
                            <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300">
                              SP: <strong className="text-emerald-600 dark:text-emerald-400 font-bold">{spDisplay}</strong>
                            </span>
                            <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300">
                              Closing: <strong className="text-indigo-600 dark:text-indigo-400 font-bold">{closingDisplay}</strong>
                            </span>
                            <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300">
                              Sales: <strong className="text-slate-800 dark:text-slate-200 font-bold">{salesDisplay}</strong>
                            </span>
                          </div>
                        </>
                      );
                    })() : (
                      <>
                        {/* Standard Stock IQ Barcode, Code, Category */}
                        <div className="flex items-center gap-2 text-[11px] font-mono text-slate-600 dark:text-slate-300 truncate">
                          <span className="text-indigo-600 dark:text-indigo-400 font-bold truncate">
                            {res.barcode || 'N/A'}
                          </span>
                          <span className="text-slate-300 dark:text-slate-700">•</span>
                          <span className="truncate font-sans text-slate-500">
                            Code: <strong className="font-mono text-slate-800 dark:text-slate-200">{res.bansalCode || res.mainCode || prod?.localCode || '—'}</strong>
                          </span>
                          {res.category && (
                            <>
                              <span className="text-slate-300 dark:text-slate-700">•</span>
                              <span className="truncate font-sans text-slate-500">{res.category}</span>
                            </>
                          )}
                        </div>

                        {/* Quantities & Financials */}
                        <div className="flex items-center gap-3 text-[11px] font-mono text-slate-600 dark:text-slate-300">
                          <span>Stock: <strong className="text-slate-900 dark:text-white font-bold">{res.stock ?? prod?.stock ?? 0}</strong></span>
                          <span>Sales: <strong className="text-indigo-600 dark:text-indigo-400 font-bold">{res.salesCount ?? prod?.salesCount ?? 0}</strong></span>
                          <span>MRP: <strong className="text-emerald-600 dark:text-emerald-400 font-bold">₹{res.mrp ?? res.retailPrice ?? prod?.retailPrice ?? 0}</strong></span>
                        </div>

                        {/* Last Purchase Date Display */}
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                          <Calendar className="w-3 h-3 text-indigo-500" />
                          <span>Last Purchase: <strong className="text-slate-800 dark:text-slate-200">{lpdDisplay}</strong></span>
                        </div>
                      </>
                    )}

                    {/* Post-Save Summary Display */}
                    {renderCardSummary(res)}
                  </div>

                  {/* Touch Action Buttons Row (min-h-[44px] touch targets) */}
                  <div className="flex items-center justify-between gap-2 shrink-0 pt-2 border-t border-slate-200/60 dark:border-slate-800" onClick={(e) => e.stopPropagation()}>
                    {isDailyPurchase ? (
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 font-normal">
                        {isChecked ? '✓ Checked' : isActionRequired ? '🚩 Action Req' : 'Tap to check'}
                      </div>
                    ) : isFocusAudit ? (
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 font-normal">
                        {isChecked ? '✓ Checked' : 'Tap to check'}
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleOpenVerify({
                          name: res.productName,
                          barcode: res.barcode,
                          bansalCode: res.bansalCode || res.mainCode || prod?.localCode,
                          mainCode: res.mainCode || prod?.mainCode,
                          category: res.category || prod?.category,
                          brand: res.brand || prod?.brand,
                          id: res.productId
                        })}
                        className="min-h-[44px] px-2.5 py-1.5 rounded-lg text-xs font-bold bg-indigo-50 dark:bg-indigo-950/70 hover:bg-indigo-100 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/80 transition-all cursor-pointer flex items-center gap-1"
                        title="Verify Barcode"
                      >
                        <Scan className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                        <span>Verify</span>
                      </button>
                    )}

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={(e) => handleCopySingleProduct(res, e)}
                        className="min-h-[44px] px-2.5 py-1.5 rounded-lg text-xs font-bold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-all cursor-pointer flex items-center gap-1"
                        title="Copy this product details"
                      >
                        {copiedCardId === res.productId ? (
                          <Check className="w-3.5 h-3.5 text-emerald-500" />
                        ) : (
                          <Copy className="w-3.5 h-3.5 text-slate-500" />
                        )}
                        <span>{copiedCardId === res.productId ? 'Copied' : 'Copy'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleOpenInspector(res)}
                        className={`min-h-[44px] px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                          isChecked
                            ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                            : isActionRequired
                            ? 'bg-rose-100 dark:bg-rose-950/80 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-800'
                            : (isFocusAudit && !isCoreFocus)
                            ? 'bg-teal-600 hover:bg-teal-700 text-white shadow-xs'
                            : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs'
                        }`}
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>{isChecked ? 'Edit Check' : isActionRequired ? 'Edit Issue' : 'Check Product'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 2B. PENDING SCAN RETRY BANNER WHEN UNSAVED EDITS OR RETRY IS PENDING */}
      {inspectingResult && pendingScan && !showUnsavedPrompt && (
        <div className="fixed top-2 left-1/2 -translate-x-1/2 z-[120] max-w-lg w-[95%] sm:w-full px-3 animate-fade-in">
          <div className="p-3 rounded-2xl bg-amber-500/95 dark:bg-amber-600/95 text-white shadow-2xl border border-amber-400 flex items-center justify-between gap-3 text-xs font-bold">
            <div className="flex items-center gap-2 min-w-0">
              <AlertTriangle className="w-4 h-4 shrink-0 text-white" />
              <div className="min-w-0">
                <div className="truncate font-black">
                  Pending Scan: {pendingScan.productName || 'Scanned Product'}
                </div>
                <div className="text-[10px] text-amber-100 font-medium">
                  Fix required inputs or retry saving before opening.
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={handleUnsavedSaveAndProceed}
                disabled={isUnsavedSaving}
                className="px-3 py-1.5 rounded-xl bg-white text-amber-900 hover:bg-amber-100 disabled:opacity-50 text-[11px] font-black shadow-xs cursor-pointer active:scale-95 transition-all flex items-center gap-1"
              >
                {isUnsavedSaving ? 'Saving...' : 'Retry Save & Open'}
              </button>
              <button
                type="button"
                onClick={() => setPendingScan(null)}
                className="p-1 rounded-lg text-white/80 hover:text-white hover:bg-amber-600/60 cursor-pointer min-h-[32px] min-w-[32px] flex items-center justify-center"
                title="Dismiss Pending Scan"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. PRODUCT INSPECTOR MODAL */}
      {inspectingResult && isDailyPurchase ? (() => {
        const liveMatch = getLiveProductForAuditResult(inspectingResult);
        return (
          <DailyPurchaseCheckModal
            ref={activeFormRef}
            isOpen={!!inspectingResult}
            result={inspectingResult}
            liveProduct={liveMatch.product}
            isAmbiguousMatch={liveMatch.isAmbiguous}
            salesPeriodText={salesPeriodText}
            activeCheckerName={activeChecker}
            remainingPendingCount={pendingCount}
            onDirtyChange={(dirty) => setIsModalDirty(dirty)}
            onClose={handleCloseInspector}
            onSave={(extraFields, newStatus, isNext) =>
              handleUpdateProductStatus(extraFields, newStatus, isNext, isSaveAndOpenActiveRef.current)
            }
            onViewStockIqDetails={() => handleViewStockIqDetails(inspectingResult)}
            isDarkMode={isDarkMode}
          />
        );
      })() : inspectingResult && isFocusAudit ? (() => {
        const liveMatch = getLiveProductForAuditResult(inspectingResult);
        return (
          <FocusProductCheckModal
            ref={activeFormRef}
            isOpen={!!inspectingResult}
            result={inspectingResult}
            liveProduct={liveMatch.product}
            isAmbiguousMatch={liveMatch.isAmbiguous}
            salesPeriodText={salesPeriodText}
            currentCategory={selectedCategories.length > 0 ? selectedCategories.join(', ') : (inspectingResult.category || '')}
            remainingInCategoryCount={remainingInCategoryCount}
            onDirtyChange={(dirty) => setIsModalDirty(dirty)}
            onClose={handleCloseInspector}
            onSaveAndNext={(fields, advanceToNext) =>
              handleSaveFocusCheckAndNext(fields, advanceToNext, isSaveAndOpenActiveRef.current)
            }
            onViewStockIqDetails={() => handleViewStockIqDetails(inspectingResult)}
            isDarkMode={isDarkMode}
          />
        );
      })() : inspectingResult ? (
        <FloorProductInspectorModal
          ref={activeFormRef}
          result={inspectingResult}
          product={getLiveProductForAuditResult(inspectingResult).product || products.find((p) => p.id === inspectingResult.productId)}
          activeChecker={activeChecker}
          onChangeActiveChecker={() => {
            setCheckerInputName(activeChecker);
            setShowCheckerPrompt(true);
          }}
          onDirtyChange={(dirty) => setIsModalDirty(dirty)}
          isDarkMode={isDarkMode}
          onClose={handleCloseInspector}
          onSaveResult={(updatedFields, status, isNext) => 
            handleUpdateProductStatus(updatedFields, status, isNext, isSaveAndOpenActiveRef.current)
          }
          onOpenScanVerify={handleOpenVerify}
          onViewStockIqDetails={() => handleViewStockIqDetails(inspectingResult)}
        />
      ) : null}

      {/* 3B. FULL STOCK IQ PRODUCT INSPECTOR OVERLAY (MOUNTED ON TOP OF CHECK FORM) */}
      {stockInspectorProduct && (
        <ProductDetailModal
          key={stockInspectorProduct.id}
          product={stockInspectorProduct}
          analytics={analyticsMap.get(stockInspectorProduct.id)}
          onClose={() => setStockInspectorProduct(null)}
          onOpenLabelModal={(p) => setLabelProduct(p)}
          isDarkMode={isDarkMode}
          zIndexClassName="z-[110]"
          allProducts={products}
        />
      )}

      {/* 3C. BARCODE STICKER LABEL MODAL */}
      {labelProduct && (
        <BarcodeLabelModal
          isOpen={!!labelProduct}
          product={labelProduct}
          onClose={() => setLabelProduct(null)}
          isDarkMode={isDarkMode}
        />
      )}

      {/* 3D. RUNNER NOTIFICATION TOAST */}
      {toastNotification && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[130] max-w-md w-full px-4 pointer-events-none animate-fade-in">
          <div className={`p-3.5 rounded-2xl border shadow-xl flex items-center gap-2.5 text-xs font-bold pointer-events-auto ${
            toastNotification.type === 'error'
              ? 'bg-rose-900/95 text-rose-100 border-rose-700'
              : toastNotification.type === 'success'
              ? 'bg-emerald-900/95 text-emerald-100 border-emerald-700'
              : 'bg-slate-900/95 text-slate-100 border-slate-700'
          }`}>
            <span>{toastNotification.message}</span>
          </div>
        </div>
      )}

      {/* 4. UNSAVED CHANGES PROTECT DIALOG */}
      {showUnsavedPrompt && inspectingResult && (
        <div className="fixed inset-0 z-60 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className={`rounded-2xl border p-5 max-w-md w-full space-y-4 shadow-2xl text-xs font-sans animate-fade-in ${
            isDarkMode ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
          }`}>
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="space-y-1 flex-1">
                <h3 className="font-extrabold text-sm text-slate-900 dark:text-white">
                  Unsaved Changes Detected
                </h3>
                <p className="text-slate-600 dark:text-slate-300 text-xs leading-relaxed">
                  You have unsaved changes on <strong className="text-slate-900 dark:text-white">{inspectingResult.productName}</strong>.
                </p>
                {pendingScan && (
                  <p className="text-[11.5px] text-indigo-600 dark:text-indigo-400 font-semibold pt-1">
                    {pendingScan.type === 'open_product'
                      ? `New scanned product: "${pendingScan.productName || 'Scanned Item'}"`
                      : pendingScan.type === 'not_in_audit'
                      ? 'Scanned product is not part of this audit.'
                      : 'Barcode was not found.'}
                  </p>
                )}
              </div>
            </div>

            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Please choose how you want to proceed before navigating away:
            </p>

            <div className="space-y-2 pt-1">
              {/* Option 1: Save & Open Scanned Product */}
              <button
                type="button"
                onClick={handleUnsavedSaveAndProceed}
                disabled={isUnsavedSaving}
                className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
              >
                {isUnsavedSaving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin shrink-0" />
                    <span>Saving Product A...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Save & Open Scanned Product</span>
                  </>
                )}
              </button>
              {/* Option 2: Discard & Open Scanned Product */}
              <button
                type="button"
                onClick={handleUnsavedDiscardAndProceed}
                disabled={isUnsavedSaving}
                className="w-full min-h-[44px] px-4 py-2.5 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 disabled:opacity-50 disabled:cursor-not-allowed text-rose-700 dark:text-rose-300 font-bold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
              >
                <X className="w-4 h-4" />
                <span>Discard & Open Scanned Product</span>
              </button>
              {/* Option 3: Continue Editing */}
              <button
                type="button"
                onClick={handleUnsavedCancel}
                disabled={isUnsavedSaving}
                className="w-full min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed font-bold text-xs transition-colors cursor-pointer flex items-center justify-center"
              >
                Continue Editing
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. FILTER & TOOLS SLIDE-OVER DRAWER MODAL */}
      {isFilterDrawerOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex justify-end">
          <div className={`w-full max-w-md h-full flex flex-col shadow-2xl border-l animate-fade-in ${
            isDarkMode ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
          }`}>
            {/* Drawer Header */}
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <h3 className="font-extrabold text-sm text-slate-900 dark:text-white">Audit Filters & Tools</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsFilterDrawerOpen(false)}
                className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Drawer Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
              {/* Quick Count Mode in Filter Drawer */}
              <div className="space-y-2 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Zap className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <div>
                      <div className="font-extrabold text-xs text-slate-900 dark:text-white">Quick Count Mode</div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">Auto-count on scan without popup save</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggleQuickCountMode(!isQuickCountMode)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-black cursor-pointer transition-all ${
                      isQuickCountMode ? 'bg-emerald-600 text-white shadow-xs' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {isQuickCountMode ? 'ENABLED' : 'DISABLED'}
                  </button>
                </div>

                {isQuickCountMode && (
                  <div className="space-y-1 pt-1 border-t border-slate-200/60 dark:border-slate-700/60">
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      Quick Count Filter
                    </div>
                    <div className="grid grid-cols-3 gap-1">
                      <button
                        type="button"
                        onClick={() => setQuickCountFilter('all')}
                        className={`p-1.5 rounded-lg text-center font-bold text-[11px] cursor-pointer ${
                          quickCountFilter === 'all'
                            ? 'bg-emerald-600 text-white'
                            : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        All ({totalCount})
                      </button>
                      <button
                        type="button"
                        onClick={() => setQuickCountFilter('scanned')}
                        className={`p-1.5 rounded-lg text-center font-bold text-[11px] cursor-pointer ${
                          quickCountFilter === 'scanned'
                            ? 'bg-emerald-600 text-white'
                            : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-emerald-700 dark:text-emerald-400'
                        }`}
                      >
                        Scanned ({quickCountScannedTotal})
                      </button>
                      <button
                        type="button"
                        onClick={() => setQuickCountFilter('not_scanned')}
                        className={`p-1.5 rounded-lg text-center font-bold text-[11px] cursor-pointer ${
                          quickCountFilter === 'not_scanned'
                            ? 'bg-slate-800 text-white dark:bg-slate-700'
                            : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        Pending ({quickCountNotScannedTotal})
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Status Filters */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-extrabold uppercase text-slate-400 tracking-wider">
                  Filter by Status
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setStatusFilter('all')}
                    className={`p-2.5 rounded-xl border font-bold text-xs transition-all cursor-pointer flex items-center justify-between min-h-[44px] ${
                      statusFilter === 'all'
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <span>Total SKUs</span>
                    <span className="font-mono text-xs opacity-90">{totalCount}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setStatusFilter('pending')}
                    className={`p-2.5 rounded-xl border font-bold text-xs transition-all cursor-pointer flex items-center justify-between min-h-[44px] ${
                      statusFilter === 'pending'
                        ? 'bg-amber-600 text-white border-amber-600'
                        : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <span>Pending</span>
                    <span className="font-mono text-xs opacity-90">{pendingCount}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setStatusFilter('checked')}
                    className={`p-2.5 rounded-xl border font-bold text-xs transition-all cursor-pointer flex items-center justify-between min-h-[44px] ${
                      statusFilter === 'checked'
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <span>Checked</span>
                    <span className="font-mono text-xs opacity-90">{checkedCount}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setStatusFilter('not_on_floor')}
                    className={`p-2.5 rounded-xl border font-bold text-xs transition-all cursor-pointer flex items-center justify-between min-h-[44px] ${
                      statusFilter === 'not_on_floor'
                        ? 'bg-rose-600 text-white border-rose-600'
                        : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <span>Not On Floor</span>
                    <span className="font-mono text-xs opacity-90">{notOnFloorCount}</span>
                  </button>

                  {isDailyPurchase && (
                    <button
                      type="button"
                      onClick={() => setStatusFilter('board_incorrect')}
                      className={`p-2.5 rounded-xl border font-bold text-xs transition-all cursor-pointer flex items-center justify-between min-h-[44px] ${
                        statusFilter === 'board_incorrect'
                          ? 'bg-amber-600 text-white border-amber-600'
                          : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      <span>Board Incorrect</span>
                      <span className="font-mono text-xs opacity-90">{boardIncorrectCount}</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setStatusFilter('flagged')}
                    className={`p-2.5 rounded-xl border font-bold text-xs transition-all cursor-pointer flex items-center justify-between min-h-[44px] ${
                      statusFilter === 'flagged'
                        ? 'bg-rose-600 text-white border-rose-600'
                        : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <span>Action Required</span>
                    <span className="font-mono text-xs opacity-90">{actionReqCount}</span>
                  </button>
                </div>
              </div>

              {/* Category and Main Code selectors */}
              <div className="space-y-2.5 pt-2 border-t border-slate-200 dark:border-slate-800">
                <label className="text-[11px] font-extrabold uppercase text-slate-400 tracking-wider">
                  Category & Department
                </label>
                <div className="space-y-2">
                  <MultiSelectDropdown
                    label="Categories"
                    options={availableCategories}
                    selectedValues={selectedCategories}
                    onChange={(vals) => setSelectedCategories(vals)}
                    placeholder="All Categories"
                    searchPlaceholder="Search categories..."
                    isDarkMode={Boolean(isDarkMode)}
                    badgeColor="indigo"
                  />

                  {availableMainCodes.length > 0 && (
                    <MultiSelectDropdown
                      label="Main Codes"
                      options={availableMainCodes}
                      selectedValues={selectedMainCodes}
                      onChange={(vals) => setSelectedMainCodes(vals)}
                      placeholder="All MainCodes"
                      searchPlaceholder="Search main codes..."
                      isDarkMode={Boolean(isDarkMode)}
                      badgeColor="indigo"
                    />
                  )}
                </div>
              </div>

              {/* WhatsApp Copy Tools */}
              <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                <label className="text-[11px] font-extrabold uppercase text-slate-400 tracking-wider">
                  WhatsApp Sharing Tools
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={handleCopyAll}
                    className="p-2.5 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-bold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer min-h-[44px]"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy All ({totalCount})</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleCopyChecked}
                    className="p-2.5 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-bold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer min-h-[44px]"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Checked ({checkedCount})</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleCopyNotOnFloor}
                    className="p-2.5 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 font-bold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer min-h-[44px]"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>Not On Floor ({notOnFloorCount})</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleCopyActionRequired}
                    className="p-2.5 rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 font-bold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer min-h-[44px]"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>Action Req ({actionReqCount})</span>
                  </button>
                </div>
              </div>

              {/* Excel Export & Finish Audit */}
              <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                <label className="text-[11px] font-extrabold uppercase text-slate-400 tracking-wider">
                  Audit Actions
                </label>
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={handleExportExcel}
                    className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer min-h-[44px]"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span>Export Audit to Excel</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleFinishAudit}
                    disabled={session.status === 'completed' || pendingCount > 0}
                    className="w-full p-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer min-h-[44px]"
                  >
                    <Check className="w-4 h-4" />
                    <span>{session.status === 'completed' ? 'Audit Completed' : `Finish Audit (${checkedCount}/${totalCount})`}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Drawer Footer */}
            <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-850 flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleResetFilters}
                className="flex-1 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer min-h-[44px]"
              >
                Reset Filters
              </button>
              <button
                type="button"
                onClick={() => setIsFilterDrawerOpen(false)}
                className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-xs cursor-pointer min-h-[44px]"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. SCAN VERIFY MODAL */}
      {verifyingProductInfo && (
        <FloorScanVerifyModal
          expectedProduct={verifyingProductInfo}
          catalogProducts={products}
          isDarkMode={isDarkMode}
          onClose={handleCloseVerify}
          onVerifiedSuccess={() => {
            handleCloseVerify();
          }}
        />
      )}

      {/* 7. ACTIVE CHECKER PROMPT MODAL */}
      {showCheckerPrompt && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 max-w-sm w-full space-y-4 shadow-xl text-xs font-sans">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm text-slate-900 dark:text-white">Active Floor Checker</h3>
              {activeChecker && (
                <button
                  type="button"
                  onClick={() => setShowCheckerPrompt(false)}
                  className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <p className="text-slate-500 dark:text-slate-400 leading-relaxed">
              Enter the checker name who is physically checking products on the floor.
            </p>
            <input
              type="text"
              value={checkerInputName}
              onChange={(e) => setCheckerInputName(e.target.value)}
              placeholder="e.g. Arpit, Rahul..."
              autoFocus
              className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-bold text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[44px]"
            />
            <div className="flex gap-2">
              {activeChecker && (
                <button
                  type="button"
                  onClick={() => setShowCheckerPrompt(false)}
                  className="min-h-[44px] flex-1 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
              )}
              <button
                type="button"
                onClick={() => handleSaveActiveChecker(checkerInputName)}
                disabled={!checkerInputName.trim()}
                className="min-h-[44px] flex-1 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold disabled:opacity-50 cursor-pointer"
              >
                Set Checker
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
