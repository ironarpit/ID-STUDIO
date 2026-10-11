import React, { useState, useMemo, useEffect } from 'react';
import { 
  X, 
  ArrowLeft, 
  MapPin, 
  Eye, 
  Tag, 
  AlertTriangle, 
  FileText, 
  CheckCircle2, 
  Package, 
  Check, 
  Copy, 
  ChevronDown, 
  ChevronUp, 
  Scan, 
  UserCheck, 
  RefreshCw, 
  Calendar,
  LayoutGrid,
  Image as ImageIcon,
  ExternalLink
} from 'lucide-react';
import { 
  AuditProductResult, 
  Product 
} from '../../types';
import { cleanDateOnly } from '../../utils/fileParser';
import { formatSingleProductResultText, copyToClipboard } from '../../utils/copyUtils';

interface FloorProductInspectorModalProps {
  result: AuditProductResult;
  product?: Product;
  activeChecker: string;
  onChangeActiveChecker: () => void;
  issuePresets?: string[];
  isDarkMode?: boolean;
  onClose: () => void;
  onDirtyChange?: (isDirty: boolean) => void;
  onSaveResult: (
    updatedFields: Partial<AuditProductResult>,
    status: 'done' | 'flagged' | 'pending',
    isNext?: boolean
  ) => Promise<boolean | void> | void;
  onOpenScanVerify?: (expected: {
    name: string;
    barcode: string;
    bansalCode?: string;
    mainCode?: string;
    category?: string;
    brand?: string;
    id?: string;
  }) => void;
  onViewStockIqDetails?: () => void;
}

export const DISPLAY_LOCATION_OPTIONS = [
  'Rack',
  'Floor Display',
  'Impulse',
  'FSU',
  'Endcap',
  'Bin'
];

export const FloorProductInspectorModal: React.FC<FloorProductInspectorModalProps> = ({
  result,
  product,
  activeChecker,
  onChangeActiveChecker,
  isDarkMode = false,
  onClose,
  onDirtyChange,
  onSaveResult,
  onOpenScanVerify,
  onViewStockIqDetails
}) => {
  // 1. Form state fields
  const [isOnFloor, setIsOnFloor] = useState<'yes' | 'no' | undefined>(() => {
    if (result.isOnFloor === true || result.isOnFloor === 'yes') return 'yes';
    if (result.isOnFloor === false || result.isOnFloor === 'no') return 'no';
    if (result.locationStatus === 'on_floor' || result.locationStatus === 'both') return 'yes';
    if (result.locationStatus === 'not_found') return 'no';
    return undefined;
  });

  const [visibilityLevel, setVisibilityLevel] = useState<'eye_level' | 'above_eye' | 'below_eye' | undefined>(() => {
    if (result.visibilityLevel) return result.visibilityLevel;
    if (result.displayPosition === 'eye_level') return 'eye_level';
    if (result.displayPosition === 'above_eye') return 'above_eye';
    if (result.displayPosition === 'below_eye') return 'below_eye';
    return undefined;
  });

  const [displayLocations, setDisplayLocations] = useState<string[]>(() => {
    if (Array.isArray(result.displayLocations)) return result.displayLocations;
    return [];
  });

  const [boardStatus, setBoardStatus] = useState<'correct' | 'incorrect' | 'missing' | 'not_applicable' | undefined>(() => {
    if (result.boardStatus === 'correct' || result.boardStatus === 'board_correct') return 'correct';
    if (result.boardStatus === 'incorrect' || result.boardStatus === 'wrong_price') return 'incorrect';
    if (result.boardStatus === 'missing' || result.boardStatus === 'board_missing') return 'missing';
    if (result.boardStatus === 'not_applicable') return 'not_applicable';
    return undefined;
  });

  // Explicit Report Issue Toggle (Action Required ONLY when this is active)
  const [reportIssueActive, setReportIssueActive] = useState<boolean>(() => {
    return Boolean(result.status === 'flagged');
  });

  const [issueRemark, setIssueRemark] = useState<string>(() => {
    return result.issueReason || '';
  });

  const [remarks, setRemarks] = useState<string>(result.remarks || result.remark || '');
  const [isCustomRemark, setIsCustomRemark] = useState<boolean>(Boolean(result.remarks || result.remark));

  // UI helpers
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showExtraCols, setShowExtraCols] = useState<boolean>(false);
  const [isNameExpanded, setIsNameExpanded] = useState<boolean>(false);

  // Track if current modal has unsaved modifications
  const isDirty = useMemo(() => {
    const initialFloor = (result.isOnFloor === true || result.isOnFloor === 'yes') ? 'yes' : (result.isOnFloor === false || result.isOnFloor === 'no') ? 'no' : undefined;
    const initialVis = result.visibilityLevel;
    const initialLocs = Array.isArray(result.displayLocations) ? result.displayLocations : [];
    const initialBoard = (result.boardStatus === 'correct' || result.boardStatus === 'board_correct') ? 'correct' : (result.boardStatus === 'incorrect' || result.boardStatus === 'wrong_price') ? 'incorrect' : (result.boardStatus === 'missing' || result.boardStatus === 'board_missing') ? 'missing' : (result.boardStatus === 'not_applicable') ? 'not_applicable' : undefined;
    const initialReporting = Boolean(result.status === 'flagged');
    const initialIssue = result.issueReason || '';
    const initialRemarks = result.remarks || result.remark || '';

    if (isOnFloor !== initialFloor && isOnFloor !== undefined) return true;
    if (visibilityLevel !== initialVis && visibilityLevel !== undefined) return true;
    if (JSON.stringify(displayLocations) !== JSON.stringify(initialLocs)) return true;
    if (boardStatus !== initialBoard && boardStatus !== undefined) return true;
    if (reportIssueActive !== initialReporting) return true;
    if (issueRemark !== initialIssue && issueRemark.trim() !== '') return true;
    if (isCustomRemark && remarks !== initialRemarks) return true;

    return false;
  }, [isOnFloor, visibilityLevel, displayLocations, boardStatus, reportIssueActive, issueRemark, remarks, isCustomRemark, result]);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  // Google Images Search URL using the inspected product's full name only
  const inspectedProductName = useMemo(() => {
    return (result.productName || product?.name || '').trim();
  }, [result.productName, product?.name]);

  const searchImagesUrl = useMemo(() => {
    if (!inspectedProductName) return '';
    return `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(inspectedProductName)}`;
  }, [inspectedProductName]);

  // Synchronize state when result prop changes (when switching to next product)
  useEffect(() => {
    setIsNameExpanded(false);
    const floorVal = (result.isOnFloor === true || result.isOnFloor === 'yes') 
      ? 'yes' 
      : (result.isOnFloor === false || result.isOnFloor === 'no') 
      ? 'no' 
      : (result.locationStatus === 'on_floor' || result.locationStatus === 'both') 
      ? 'yes' 
      : (result.locationStatus === 'not_found') 
      ? 'no' 
      : undefined;
    setIsOnFloor(floorVal);

    const visVal = result.visibilityLevel || (result.displayPosition === 'eye_level' ? 'eye_level' : result.displayPosition === 'above_eye' ? 'above_eye' : result.displayPosition === 'below_eye' ? 'below_eye' : undefined);
    setVisibilityLevel(visVal);

    setDisplayLocations(Array.isArray(result.displayLocations) ? result.displayLocations : []);

    const bVal = (result.boardStatus === 'correct' || result.boardStatus === 'board_correct') 
      ? 'correct' 
      : (result.boardStatus === 'incorrect' || result.boardStatus === 'wrong_price') 
      ? 'incorrect' 
      : (result.boardStatus === 'missing' || result.boardStatus === 'board_missing') 
      ? 'missing' 
      : (result.boardStatus === 'not_applicable') 
      ? 'not_applicable' 
      : undefined;
    setBoardStatus(bVal);

    setReportIssueActive(Boolean(result.status === 'flagged'));
    setIssueRemark(result.issueReason || '');
    setRemarks(result.remarks || result.remark || '');
    setIsCustomRemark(Boolean(result.remarks || result.remark));
    setValidationError(null);
  }, [result]);

  // Handle On Floor change: reset visibility and locations if On Floor = No
  const handleOnFloorChange = (val: 'yes' | 'no') => {
    setIsOnFloor(val);
    setValidationError(null);
    if (val === 'no') {
      setVisibilityLevel(undefined);
      setDisplayLocations([]);
    }
  };

  // Auto-generate suggested remark
  const suggestedRemark = useMemo(() => {
    if (isOnFloor === 'no') {
      if (boardStatus === 'missing') return 'Product and board not found on floor.';
      return 'Product not on floor.';
    }
    if (isOnFloor === 'yes') {
      const visStr = visibilityLevel === 'eye_level' ? 'at Eye Level' : visibilityLevel === 'above_eye' ? 'Above Eye Level' : visibilityLevel === 'below_eye' ? 'Below Eye Level' : '';
      const locStr = displayLocations.length > 0 ? `on ${displayLocations.join(', ')}` : '';
      let boardStr = '';
      if (boardStatus === 'correct') boardStr = 'board correct.';
      else if (boardStatus === 'incorrect') boardStr = 'board incorrect.';
      else if (boardStatus === 'missing') boardStr = 'board missing.';
      else if (boardStatus === 'not_applicable') boardStr = 'board N/A.';

      const parts = ['Product on floor', visStr, locStr].filter(Boolean).join(' ');
      if (boardStr) {
        return `${parts}; ${boardStr}`;
      }
      return `${parts}.`;
    }
    return '';
  }, [isOnFloor, visibilityLevel, displayLocations, boardStatus]);

  // Keep remarks auto-updated unless user entered custom remark
  useEffect(() => {
    if (!isCustomRemark && suggestedRemark) {
      setRemarks(suggestedRemark);
    }
  }, [suggestedRemark, isCustomRemark]);

  const toggleDisplayLocation = (loc: string) => {
    setValidationError(null);
    setDisplayLocations((prev) => 
      prev.includes(loc) ? prev.filter((item) => item !== loc) : [...prev, loc]
    );
  };

  // Field Resolvers
  const bansalCode = useMemo(() => {
    return product?.bansalCode || product?.localCode || product?.code || result.bansalCode || result.code || result.localCode || 
      (product?.rawRowData ? (
        product.rawRowData['Code'] || 
        product.rawRowData['Bansal Code'] || 
        product.rawRowData['BANSAL CODE'] || 
        product.rawRowData['Item Code'] || 
        product.rawRowData['Local Code'] ||
        product.rawRowData['CODE']
      ) : '') || '—';
  }, [product, result]);

  const lastPurchaseDateDisplay = useMemo(() => {
    const raw = result.lastPurchaseDate || product?.lastPurchaseDate || (product?.rawRowData ? (product.rawRowData['Last Pur Date'] || product.rawRowData['Last Purchase Date'] || product.rawRowData['Pur Date']) : '');
    return cleanDateOnly(raw) || '—';
  }, [result.lastPurchaseDate, product]);

  const mainCode = useMemo(() => {
    return product?.mainCode || result.mainCode || 
      (product?.rawRowData ? (
        product.rawRowData['Main Code'] || 
        product.rawRowData['MainCode'] || 
        product.rawRowData['MAIN CODE'] || 
        product.rawRowData['Department'] ||
        product.rawRowData['Group']
      ) : '') || '—';
  }, [product, result]);

  const costPrice = useMemo(() => {
    if (product?.costPrice && product.costPrice > 0) return product.costPrice;
    if (product?.cost && product.cost > 0) return product.cost;
    if (result.costPrice && result.costPrice > 0) return result.costPrice;
    if (result.cost && result.cost > 0) return result.cost;
    return 0;
  }, [product, result]);

  const mrp = useMemo(() => {
    if (product?.mrp && product.mrp > 0) return product.mrp;
    return result.retailPrice || product?.retailPrice || 0;
  }, [product, result]);

  const retailPrice = useMemo(() => {
    if (result.retailPrice && result.retailPrice > 0) return result.retailPrice;
    if (product?.retailPrice && product.retailPrice > 0) return product.retailPrice;
    return mrp || 0;
  }, [product, result, mrp]);

  // Extra columns from rawRowData
  const extraColumns = useMemo(() => {
    if (!product?.rawRowData) return [];
    return Object.entries(product.rawRowData).filter(([k]) => {
      const lower = k.toLowerCase().trim();
      return (
        lower !== 'barcode' &&
        lower !== 'name' &&
        lower !== 'item name' &&
        lower !== 'category' &&
        lower !== 'maincode' &&
        lower !== 'main code' &&
        lower !== 'mrp' &&
        lower !== 'cost' &&
        lower !== 'costprice' &&
        lower !== 'retail' &&
        lower !== 'retailprice' &&
        lower !== 'stock' &&
        lower !== 'sales' &&
        lower !== 'salescount' &&
        lower !== 'localcode' &&
        lower !== 'bansalcode' &&
        lower !== 'last purchase date' &&
        lower !== 'last pur date' &&
        lower !== 'pur date'
      );
    });
  }, [product]);

  const handleCopySingle = async () => {
    const text = formatSingleProductResultText(result);
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopiedKey('single');
      setTimeout(() => setCopiedKey(null), 2000);
    }
  };

  // Form Validation Engine
  const validateForm = (): string | null => {
    if (!activeChecker || !activeChecker.trim()) {
      return 'Active Checker name is required. Please set active checker name.';
    }

    if (!isOnFloor) {
      return 'Please specify whether the product is On Floor (Yes / No).';
    }

    if (isOnFloor === 'yes') {
      if (!visibilityLevel) {
        return 'Please select Visibility level (Eye Level, Above, or Below).';
      }
      if (!displayLocations || displayLocations.length === 0) {
        return 'Please select at least one Display Location (Rack, Floor Display, etc.).';
      }
    }

    if (!boardStatus) {
      return 'Please select Price Board Status.';
    }

    return null;
  };

  const handleSaveAction = async (isNext: boolean) => {
    const errorMsg = validateForm();
    if (errorMsg) {
      setValidationError(errorMsg);
      return;
    }

    setValidationError(null);
    setIsSaving(true);

    try {
      // ONLY reportIssueActive sets status to 'flagged' (Action Required).
      // Otherwise, status is ALWAYS 'done' (Checked), even if On Floor = No or Board = Incorrect/Missing!
      const targetStatus: 'done' | 'flagged' = reportIssueActive ? 'flagged' : 'done';

      const finalRemark = remarks || suggestedRemark;
      const finalIssue = reportIssueActive 
        ? (issueRemark.trim() || finalRemark || 'Action Required on floor')
        : undefined;

      const updatedFields: Partial<AuditProductResult> = {
        isOnFloor,
        visibilityLevel: isOnFloor === 'yes' ? visibilityLevel : undefined,
        displayLocations: isOnFloor === 'yes' ? displayLocations : [],
        boardStatus,
        issueReason: finalIssue,
        remarks: finalRemark,
        remark: finalRemark,
        checkedBy: activeChecker,
        locationStatus: isOnFloor === 'yes' ? 'on_floor' : 'not_found',
        displayPosition: visibilityLevel === 'eye_level' ? 'eye_level' : visibilityLevel === 'above_eye' ? 'above_eye' : visibilityLevel === 'below_eye' ? 'below_eye' : 'not_displayed',
      };

      await onSaveResult(updatedFields, targetStatus, isNext);
    } catch (err: any) {
      console.error('Error in handleSaveAction:', err);
      setValidationError(err?.message || 'Failed to save audit result. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white dark:bg-slate-900 w-full h-full sm:h-auto sm:max-h-[92vh] sm:max-w-2xl sm:mx-auto sm:my-auto sm:rounded-2xl sm:border sm:border-slate-300 sm:dark:border-slate-700 sm:shadow-2xl overflow-hidden font-sans">
      
      {/* 1. STICKY TOP HEADER */}
      <div className="px-3.5 py-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/90 space-y-1.5 shrink-0">
        {/* Row 1: Back Button | Centered Title: Product Check | Copy | Close Button */}
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-200/80 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold cursor-pointer transition-all min-h-[44px] shrink-0"
            title="Back to List"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </button>

          <h2 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white text-center flex-1 truncate">
            Product Check
          </h2>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={handleCopySingle}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold hover:bg-slate-100 min-h-[44px] cursor-pointer"
              title="Copy this product details for WhatsApp"
            >
              {copiedKey === 'single' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5 text-slate-500" />}
              <span className="hidden sm:inline">{copiedKey === 'single' ? 'Copied' : 'Copy'}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center shrink-0"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Row 2: Active Checker Bar */}
        <div className="flex items-center justify-between gap-2 px-2.5 py-1 rounded-lg bg-indigo-50/80 dark:bg-indigo-950/60 border border-indigo-100 dark:border-indigo-900/60 text-xs">
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <UserCheck className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 truncate">
              Checked by: <strong className="text-slate-900 dark:text-white font-bold">{activeChecker || 'Set Name'}</strong>
            </span>
          </div>
          <button
            type="button"
            onClick={onChangeActiveChecker}
            className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline shrink-0 min-h-[32px] flex items-center cursor-pointer"
            title="Change Active Checker"
          >
            Change
          </button>
        </div>
      </div>

      {/* 2. SCROLLABLE COMPACT FORM BODY */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5 custom-scrollbar text-xs">
        
        {/* Compact Product Details Header Card */}
        <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 space-y-1.5">
          {/* Header Row: Product Status & Verify Barcode */}
          <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-500 pb-1 border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-1.5">
              <span className={`text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                result.status === 'flagged'
                  ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200'
                  : (result.status === 'done' || result.status === 'resolved')
                  ? (result.isOnFloor === 'no' || result.isOnFloor === false || result.locationStatus === 'not_found')
                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200'
                    : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
                  : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
              }`}>
                {result.status === 'flagged'
                  ? 'Action Required'
                  : (result.status === 'done' || result.status === 'resolved')
                  ? (result.isOnFloor === 'no' || result.isOnFloor === false || result.locationStatus === 'not_found')
                    ? 'Checked • Not On Floor'
                    : 'Checked'
                  : 'Pending'}
              </span>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {searchImagesUrl ? (
                <a
                  href={searchImagesUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-sky-50 hover:bg-sky-100 dark:bg-sky-950/70 dark:hover:bg-sky-900 border border-sky-200 dark:border-sky-800 text-sky-700 dark:text-sky-300 font-bold text-[10px] transition-all shadow-2xs active:scale-95 cursor-pointer"
                  title={`Search Google Images for "${inspectedProductName}"`}
                  aria-label="Search Images"
                >
                  <ImageIcon className="w-3 h-3 text-sky-600 dark:text-sky-400 shrink-0" />
                  <span>Search Images</span>
                  <ExternalLink className="w-2.5 h-2.5 text-sky-500 opacity-70 shrink-0" />
                </a>
              ) : (
                <button
                  type="button"
                  disabled
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500 font-bold text-[10px] cursor-not-allowed opacity-60"
                  title="Product name is empty"
                  aria-label="Search Images"
                >
                  <ImageIcon className="w-3 h-3 shrink-0" />
                  <span>Search Images</span>
                </button>
              )}

              {onOpenScanVerify && (
                <button
                  type="button"
                  onClick={() => onOpenScanVerify({
                    name: result.productName || product?.name || 'Product',
                    barcode: result.barcode || product?.barcode || '',
                    bansalCode,
                    mainCode,
                    category: product?.category || result.category,
                    brand: product?.brand || result.brand,
                    id: result.productId
                  })}
                  className="flex items-center gap-1 text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                >
                  <Scan className="w-3.5 h-3.5" />
                  <span>Verify Barcode</span>
                </button>
              )}
            </div>
          </div>

          {/* Product Title */}
          <h2 className={`text-xs sm:text-sm font-bold text-slate-900 dark:text-white leading-snug break-words whitespace-normal ${
            !isNameExpanded && (result.productName || product?.name || '').length > 90 ? 'line-clamp-2' : ''
          }`}>
            {result.productName || product?.name || 'Product'}
          </h2>

          {(result.productName || product?.name || '').length > 90 && (
            <button
              type="button"
              onClick={() => setIsNameExpanded(!isNameExpanded)}
              className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-0.5 cursor-pointer"
            >
              {isNameExpanded ? (
                <><span>Show Less</span><ChevronUp className="w-3 h-3" /></>
              ) : (
                <><span>Show Full Name</span><ChevronDown className="w-3 h-3" /></>
              )}
            </button>
          )}

          {/* Compact Attribute Grid: Code | Category | Stock | Sales | MRP | Last Purchase Date */}
          <div className="space-y-1 pt-1">
            <div className="flex items-center justify-between text-[10px] text-slate-500 font-bold uppercase tracking-wider">
              <span className="flex items-center gap-1 text-indigo-600 dark:text-indigo-400">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                LIVE STOCK REPORT DATA
              </span>
              <span className="text-[9.5px] text-slate-400 font-normal">Current System Values</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 font-mono text-[11px]">
              <div className="p-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs">
                <span className="text-[9px] text-slate-400 font-sans uppercase font-bold block">Code</span>
                <span className="font-bold text-slate-800 dark:text-slate-200 block truncate">{bansalCode}</span>
              </div>

              <div className="p-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs">
                <span className="text-[9px] text-slate-400 font-sans uppercase font-bold block">Category</span>
                <span className="font-bold text-slate-700 dark:text-slate-300 font-sans block truncate">{product?.category || result.category || 'General'}</span>
              </div>

              <div className="p-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs">
                <span className="text-[9px] text-slate-400 font-sans uppercase font-bold block">Closing Stock</span>
                <span className="font-bold text-sm text-indigo-600 dark:text-indigo-400 block truncate">
                  {product?.stock !== undefined && product?.stock !== null ? product.stock : result.stock !== undefined && result.stock !== null ? result.stock : 'Not Available'}
                </span>
              </div>

              <div className="p-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs">
                <span className="text-[9px] text-slate-400 font-sans uppercase font-bold block">Sales Qty</span>
                <span className="font-bold text-sm text-slate-800 dark:text-slate-200 block truncate">
                  {product?.salesCount !== undefined && product?.salesCount !== null ? product.salesCount : result.salesCount !== undefined && result.salesCount !== null ? result.salesCount : 'Not Available'}
                </span>
              </div>

              <div className="p-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs">
                <span className="text-[9px] text-slate-400 font-sans uppercase font-bold block">MRP / Retail</span>
                <span className="font-bold text-sm text-emerald-600 dark:text-emerald-400 block truncate">₹{(retailPrice || 0).toLocaleString('en-IN')}</span>
              </div>

              {/* LAST PURCHASE DATE DISPLAY */}
              <div className="p-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs">
                <span className="text-[9px] text-slate-400 font-sans uppercase font-bold flex items-center gap-1">
                  <Calendar className="w-2.5 h-2.5 text-indigo-500" />
                  <span>Last Purchase</span>
                </span>
                <span className="font-bold text-slate-900 dark:text-slate-100 block truncate font-mono">
                  {lastPurchaseDateDisplay}
                </span>
              </div>
            </div>

            {/* View Stock IQ Details Button */}
            {onViewStockIqDetails && (
              <button
                type="button"
                onClick={onViewStockIqDetails}
                className="w-full mt-2 py-2 px-3 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50/70 hover:bg-indigo-100 dark:bg-indigo-950/50 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs active:scale-98 min-h-[40px]"
                title="Open Stock IQ Product Inspector"
              >
                <Package className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                <span>VIEW STOCK IQ DETAILS</span>
              </button>
            )}
          </div>

          {/* Extra uploaded columns drawer if any */}
          {extraColumns.length > 0 && (
            <div className="pt-0.5">
              <button
                type="button"
                onClick={() => setShowExtraCols(!showExtraCols)}
                className="w-full flex items-center justify-between text-[10px] font-bold uppercase text-slate-500 p-1 rounded-md bg-slate-200/50 dark:bg-slate-900 hover:bg-slate-200 cursor-pointer"
              >
                <span className="flex items-center gap-1">
                  <Package className="w-3 h-3 text-indigo-500" />
                  <span>Extra Fields ({extraColumns.length})</span>
                </span>
                {showExtraCols ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>

              {showExtraCols && (
                <div className="grid grid-cols-2 gap-1 max-h-32 overflow-y-auto custom-scrollbar pt-1">
                  {extraColumns.map(([k, val]) => (
                    <div key={k} className="p-1 bg-white dark:bg-slate-900 rounded border border-slate-200 dark:border-slate-800">
                      <span className="text-[8px] text-slate-400 uppercase font-bold block truncate">{k}</span>
                      <span className="font-mono text-[10px] font-bold text-slate-800 dark:text-slate-200 block truncate">
                        {val !== null && val !== undefined && String(val).trim() !== '' ? String(val) : '—'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* --- AUDIT CONTROLS --- */}

        {/* 1. ON FLOOR? (Yes / No) */}
        <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 space-y-1.5">
          <label className="text-xs font-bold text-slate-900 dark:text-white flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span>1. On Floor?</span>
              <span className="text-rose-500 font-bold">*</span>
            </span>
            {isOnFloor && (
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                isOnFloor === 'yes' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
              }`}>
                {isOnFloor === 'yes' ? 'On Floor' : 'Not On Floor'}
              </span>
            )}
          </label>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => handleOnFloorChange('yes')}
              className={`min-h-[44px] px-3 py-2 rounded-xl border text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                isOnFloor === 'yes'
                  ? 'bg-emerald-600 border-emerald-600 text-white shadow-xs'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Yes (On Floor)</span>
            </button>

            <button
              type="button"
              onClick={() => handleOnFloorChange('no')}
              className={`min-h-[44px] px-3 py-2 rounded-xl border text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                isOnFloor === 'no'
                  ? 'bg-amber-600 border-amber-600 text-white shadow-xs'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <X className="w-4 h-4" />
              <span>No (Not On Floor)</span>
            </button>
          </div>
        </div>

        {/* 2. VISIBILITY (Required ONLY when On Floor = Yes) */}
        {isOnFloor === 'yes' && (
          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 space-y-1.5 animate-fade-in">
            <label className="text-xs font-bold text-slate-900 dark:text-white flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Eye className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <span>2. Visibility Level</span>
                <span className="text-rose-500 font-bold">*</span>
              </span>
            </label>

            <div className="grid grid-cols-3 gap-1.5">
              {[
                { val: 'eye_level', label: 'Eye Level' },
                { val: 'above_eye', label: 'Above Eye' },
                { val: 'below_eye', label: 'Below Eye' }
              ].map((item) => (
                <button
                  key={item.val}
                  type="button"
                  onClick={() => {
                    setVisibilityLevel(item.val as any);
                    setValidationError(null);
                  }}
                  className={`min-h-[44px] px-2 py-2 rounded-xl border text-[11px] font-bold transition-all cursor-pointer text-center flex items-center justify-center leading-tight ${
                    visibilityLevel === item.val
                      ? 'bg-indigo-600 border-indigo-600 text-white shadow-xs'
                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 3. DISPLAY LOCATION (Required ONLY when On Floor = Yes) */}
        {isOnFloor === 'yes' && (
          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 space-y-1.5 animate-fade-in">
            <label className="text-xs font-bold text-slate-900 dark:text-white flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <LayoutGrid className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <span>3. Display Location</span>
                <span className="text-rose-500 font-bold">*</span>
              </span>
              <span className="text-[10px] text-slate-500 font-normal">Select all that apply</span>
            </label>

            <div className="grid grid-cols-3 gap-1.5">
              {DISPLAY_LOCATION_OPTIONS.map((loc) => {
                const isSelected = displayLocations.includes(loc);
                return (
                  <button
                    key={loc}
                    type="button"
                    onClick={() => toggleDisplayLocation(loc)}
                    className={`min-h-[44px] px-2 py-1.5 rounded-xl border text-[11px] font-bold transition-all cursor-pointer flex items-center justify-center gap-1 text-center ${
                      isSelected
                        ? 'bg-indigo-600 border-indigo-600 text-white shadow-xs'
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <span>{loc}</span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-white shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 4. BOARD STATUS (Required) */}
        <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 space-y-1.5">
          <label className="text-xs font-bold text-slate-900 dark:text-white flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Tag className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span>4. Price Board Status</span>
              <span className="text-rose-500 font-bold">*</span>
            </span>
          </label>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
            {[
              { val: 'correct', label: 'Correct' },
              { val: 'incorrect', label: 'Incorrect' },
              { val: 'missing', label: 'Missing' },
              { val: 'not_applicable', label: 'N/A' }
            ].map((opt) => (
              <button
                key={opt.val}
                type="button"
                onClick={() => {
                  setBoardStatus(opt.val as any);
                  setValidationError(null);
                }}
                className={`min-h-[44px] px-2 py-1.5 rounded-xl border text-[11px] font-bold transition-all cursor-pointer text-center flex items-center justify-center ${
                  boardStatus === opt.val
                    ? 'bg-indigo-600 border-indigo-600 text-white shadow-xs'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <span>{opt.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 5. EXPLICIT REPORT ISSUE TOGGLE (ONLY THIS CREATES ACTION REQUIRED) */}
        <div className={`p-2.5 rounded-xl border transition-all space-y-2 ${
          reportIssueActive
            ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800'
            : 'bg-slate-50 dark:bg-slate-950/80 border-slate-200 dark:border-slate-800'
        }`}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <AlertTriangle className={`w-4 h-4 ${reportIssueActive ? 'text-rose-600' : 'text-slate-400'}`} />
              <span className="text-xs font-bold text-slate-900 dark:text-white">
                5. Report Issue (Optional)
              </span>
            </div>

            <button
              type="button"
              onClick={() => {
                const next = !reportIssueActive;
                setReportIssueActive(next);
                setValidationError(null);
              }}
              className={`min-h-[44px] px-3.5 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
                reportIssueActive
                  ? 'bg-rose-600 border-rose-600 text-white shadow-xs'
                  : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-rose-300'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>{reportIssueActive ? 'Issue Reported (Action Req)' : 'Report Issue'}</span>
            </button>
          </div>

          {reportIssueActive && (
            <div className="space-y-1.5 animate-fade-in pt-1 border-t border-rose-200 dark:border-rose-800/60">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-rose-700 dark:text-rose-300">
                  Enter Issue / Action Remark:
                </span>
                <span className="text-[10px] text-rose-500">Item will be flagged Action Required</span>
              </div>
              <input
                type="text"
                value={issueRemark}
                onChange={(e) => setIssueRemark(e.target.value)}
                placeholder="e.g., Stock mismatch, refill needed from godown, damaged pack..."
                className="w-full px-3 py-2 rounded-xl border text-xs font-medium bg-white dark:bg-slate-900 border-rose-300 dark:border-rose-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500 min-h-[40px]"
              />
            </div>
          )}
        </div>

        {/* 6. REMARKS (Compact Auto-suggested + Free-text) */}
        <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span>6. Remarks</span>
            </label>
            {isCustomRemark && suggestedRemark && (
              <button
                type="button"
                onClick={() => {
                  setRemarks(suggestedRemark);
                  setIsCustomRemark(false);
                }}
                className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
              >
                Reset to Suggested
              </button>
            )}
          </div>

          <textarea
            rows={2}
            value={remarks}
            onChange={(e) => {
              setRemarks(e.target.value);
              setIsCustomRemark(true);
            }}
            placeholder="Auto-generated check remark or add custom notes..."
            className="w-full px-3 py-2 rounded-xl border text-xs font-medium bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      {/* 3. STICKY BOTTOM ACTIONS BAR */}
      <div className="p-2.5 sm:p-3 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/95 space-y-2 shrink-0 pb-safe">
        
        {/* Validation Error Banner */}
        {validationError && (
          <div className="p-2 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs font-bold flex items-center gap-2 animate-fade-in">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span className="flex-1">{validationError}</span>
          </div>
        )}

        {/* Action Buttons: Cancel, Secondary SAVE & NEXT, Primary SAVE & CLOSE */}
        <div className="flex items-center justify-between gap-2 w-full">
          {/* Small Secondary Close / Cancel Button */}
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold cursor-pointer transition-all shrink-0"
          >
            Cancel
          </button>

          <div className="flex items-center gap-2 flex-1 justify-end">
            {/* Secondary Action Option: SAVE & NEXT */}
            <button
              type="button"
              onClick={() => handleSaveAction(true)}
              disabled={isSaving || !activeChecker || !activeChecker.trim()}
              className="min-h-[44px] px-3.5 py-2.5 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50/80 dark:bg-indigo-950/60 hover:bg-indigo-100 text-indigo-700 dark:text-indigo-300 font-bold text-xs shadow-xs cursor-pointer transition-all flex items-center justify-center gap-1.5 active:scale-95 disabled:opacity-50 shrink-0"
            >
              <span>SAVE & NEXT</span>
              <Check className="w-3.5 h-3.5" />
            </button>

            {/* Primary Action Button: SAVE & CLOSE */}
            <button
              type="button"
              onClick={() => handleSaveAction(false)}
              disabled={isSaving || !activeChecker || !activeChecker.trim()}
              className={`min-h-[44px] flex-1 max-w-xs px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm shadow-md cursor-pointer transition-all flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50 text-center leading-tight ${
                reportIssueActive
                  ? 'bg-rose-600 hover:bg-rose-700 text-white'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white'
              }`}
            >
              {isSaving ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-white shrink-0" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-white" />
                  <span>SAVE & CLOSE</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
