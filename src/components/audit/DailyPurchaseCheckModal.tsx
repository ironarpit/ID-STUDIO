import React, { useState, useEffect, useMemo, forwardRef, useImperativeHandle } from 'react';
import {
  X,
  CheckCircle2,
  AlertTriangle,
  Flag,
  ArrowRight,
  ShoppingBag,
  Store,
  Tag,
  Scan,
  Info,
  Check,
  Building,
  Layers,
  AlertCircle,
  Calendar,
  Package
} from 'lucide-react';
import { AuditProductResult, DailyPurchaseSupplierEntry, Product, AuditCheckFormHandle } from '../../types';
import { cleanDateOnly, formatCleanSalesPeriod } from '../../utils/fileParser';

interface DailyPurchaseCheckModalProps {
  isOpen: boolean;
  result: AuditProductResult | null;
  liveProduct?: Product | null;
  isAmbiguousMatch?: boolean;
  salesPeriodText?: string;
  activeCheckerName: string;
  isDarkMode?: boolean;
  remainingPendingCount?: number;
  onClose: () => void;
  onDirtyChange?: (isDirty: boolean) => void;
  onSave: (
    extraFields: Partial<AuditProductResult>,
    newStatus: 'done' | 'flagged' | 'pending',
    isNext: boolean
  ) => Promise<boolean>;
  onViewStockIqDetails?: () => void;
}

export const DailyPurchaseCheckModal = forwardRef<AuditCheckFormHandle, DailyPurchaseCheckModalProps>(({
  isOpen,
  result,
  liveProduct,
  isAmbiguousMatch = false,
  salesPeriodText,
  activeCheckerName,
  isDarkMode,
  remainingPendingCount = 0,
  onClose,
  onDirtyChange,
  onSave,
  onViewStockIqDetails
}, ref) => {
  if (!isOpen || !result) return null;

  // Answers State (Do not preselect Yes!)
  const [displayedOnFloor, setDisplayedOnFloor] = useState<'yes' | 'no' | undefined>(() => {
    if (result.isDisplayedOnFloor) return result.isDisplayedOnFloor;
    if (result.status === 'done' || result.status === 'resolved') {
      return result.isOnFloor === 'no' || result.isOnFloor === false ? 'no' : 'yes';
    }
    return undefined;
  });

  const [boardCorrect, setBoardCorrect] = useState<'yes' | 'no' | 'not_applicable' | undefined>(() => {
    if (result.isBoardCorrect) return result.isBoardCorrect;
    if (result.status === 'done' || result.status === 'resolved') {
      if (result.boardStatus === 'board_missing' || result.boardStatus === 'wrong_price' || result.boardStatus === 'incorrect' || result.boardStatus === 'missing') {
        return 'no';
      }
      if (result.boardStatus === 'not_applicable') return 'not_applicable';
      if (result.boardStatus === 'board_correct' || result.boardStatus === 'correct') return 'yes';
    }
    return undefined;
  });

  const [remarks, setRemarks] = useState<string>(() => result.remarks || result.remark || '');
  const [isReportingIssue, setIsReportingIssue] = useState<boolean>(() => result.status === 'flagged');
  const [issueReason, setIssueReason] = useState<string>(() => result.issueReason || '');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Track if current modal has unsaved modifications
  const isDirty = useMemo(() => {
    const initFloor = result.isDisplayedOnFloor;
    const initBoard = result.isBoardCorrect;
    const initRemarks = result.remarks || result.remark || '';
    const initIssue = result.issueReason || '';
    const initFlag = result.status === 'flagged';

    if (displayedOnFloor !== initFloor && displayedOnFloor !== undefined) return true;
    if (boardCorrect !== initBoard && boardCorrect !== undefined) return true;
    if (remarks !== initRemarks && remarks.trim() !== '') return true;
    if (isReportingIssue !== initFlag) return true;
    if (issueReason !== initIssue && issueReason.trim() !== '') return true;
    return false;
  }, [displayedOnFloor, boardCorrect, remarks, isReportingIssue, issueReason, result]);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  // Re-sync when result changes (e.g. Next Item loaded)
  useEffect(() => {
    if (result) {
      if (result.isDisplayedOnFloor) {
        setDisplayedOnFloor(result.isDisplayedOnFloor);
      } else if (result.status === 'done' || result.status === 'resolved') {
        setDisplayedOnFloor(result.isOnFloor === 'no' || result.isOnFloor === false ? 'no' : 'yes');
      } else {
        setDisplayedOnFloor(undefined);
      }

      if (result.isBoardCorrect) {
        setBoardCorrect(result.isBoardCorrect);
      } else if (result.status === 'done' || result.status === 'resolved') {
        if (result.boardStatus === 'board_missing' || result.boardStatus === 'wrong_price' || result.boardStatus === 'incorrect' || result.boardStatus === 'missing') {
          setBoardCorrect('no');
        } else if (result.boardStatus === 'not_applicable') {
          setBoardCorrect('not_applicable');
        } else if (result.boardStatus === 'board_correct' || result.boardStatus === 'correct') {
          setBoardCorrect('yes');
        } else {
          setBoardCorrect(undefined);
        }
      } else {
        setBoardCorrect(undefined);
      }

      setRemarks(result.remarks || result.remark || '');
      setIsReportingIssue(result.status === 'flagged');
      setIssueReason(result.issueReason || '');
      setValidationError(null);
    }
  }, [result?.id]);

  const validateAnswers = (): boolean => {
    if (displayedOnFloor === undefined) {
      setValidationError('Please answer: Is this product DISPLAYED ON FLOOR?');
      return false;
    }
    if (boardCorrect === undefined) {
      setValidationError('Please answer: Is the PRICE BOARD CORRECT?');
      return false;
    }
    setValidationError(null);
    return true;
  };

  const handleSaveCheck = async (isNext: boolean): Promise<boolean> => {
    if (!validateAnswers()) return false;

    setIsSaving(true);
    try {
      const now = new Date();
      const checkedDate = now.toLocaleDateString('en-GB');
      const checkedTime = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const checkedAt = now.toISOString();

      // Compute Outcomes
      const isNotOnFloor = displayedOnFloor === 'no';
      const isIncorrectBoard = boardCorrect === 'no';

      let newStatus: 'done' | 'flagged' | 'pending' = 'done';
      let outcome: 'OK' | 'NOT_ON_FLOOR' | 'BOARD_INCORRECT' | 'ACTION_REQUIRED' = 'OK';
      let outcomeLabel = 'Audited - On Floor & Price OK';

      if (isReportingIssue && issueReason.trim()) {
        newStatus = 'flagged';
        outcome = 'ACTION_REQUIRED';
        outcomeLabel = `Issue Reported: ${issueReason.trim()}`;
      } else if (isNotOnFloor && isIncorrectBoard) {
        newStatus = 'flagged';
        outcome = 'NOT_ON_FLOOR';
        outcomeLabel = 'Not On Floor & Board Incorrect';
      } else if (isNotOnFloor) {
        newStatus = 'flagged';
        outcome = 'NOT_ON_FLOOR';
        outcomeLabel = 'Product Not On Floor';
      } else if (isIncorrectBoard) {
        newStatus = 'flagged';
        outcome = 'BOARD_INCORRECT';
        outcomeLabel = 'Price Board Incorrect';
      }

      const extraFields: Partial<AuditProductResult> = {
        isDisplayedOnFloor: displayedOnFloor,
        isOnFloor: displayedOnFloor,
        isBoardCorrect: boardCorrect,
        dailyPurchaseOutcome: outcome,
        boardStatus: boardCorrect === 'yes' ? 'board_correct' : boardCorrect === 'no' ? 'wrong_price' : 'not_applicable',
        locationStatus: displayedOnFloor === 'yes' ? 'on_floor' : 'not_found',
        remarks: remarks.trim() || undefined,
        remark: remarks.trim() || undefined,
        checkedBy: activeCheckerName || 'Floor Auditor',
        checkedAt,
        checkedDate,
        checkedTime,
        status: newStatus,
        issueReason: isReportingIssue ? (issueReason.trim() || outcomeLabel) : (newStatus === 'flagged' ? outcomeLabel : undefined),
      };

      const saved = await onSave(extraFields, newStatus, isNext);
      if (saved) {
        onDirtyChange?.(false);
        return true;
      }
      return false;
    } catch (err: any) {
      console.error('Failed to save check result:', err);
      setValidationError(err?.message || 'Failed to save. Please try again.');
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  useImperativeHandle(ref, () => ({
    submitValidated: async (advanceToNext: boolean) => {
      return await handleSaveCheck(advanceToNext);
    },
    getDraftValues: () => {
      const now = new Date();
      const isNotOnFloor = displayedOnFloor === 'no';
      const isIncorrectBoard = boardCorrect === 'no';

      let newStatus: 'done' | 'flagged' | 'pending' = result.status;
      let outcome = result.dailyPurchaseOutcome;
      let outcomeLabel = '';

      if (isReportingIssue && issueReason.trim()) {
        newStatus = 'flagged';
        outcome = 'ACTION_REQUIRED';
        outcomeLabel = `Issue Reported: ${issueReason.trim()}`;
      } else if (isNotOnFloor && isIncorrectBoard) {
        newStatus = 'flagged';
        outcome = 'NOT_ON_FLOOR';
        outcomeLabel = 'Not On Floor & Board Incorrect';
      } else if (isNotOnFloor) {
        newStatus = 'flagged';
        outcome = 'NOT_ON_FLOOR';
        outcomeLabel = 'Not On Floor';
      } else if (isIncorrectBoard) {
        newStatus = 'flagged';
        outcome = 'BOARD_INCORRECT';
        outcomeLabel = 'Board Incorrect / Missing';
      } else if (displayedOnFloor === 'yes' && boardCorrect === 'yes') {
        newStatus = 'done';
        outcome = 'OK';
        outcomeLabel = 'Audited - On Floor & Price OK';
      }

      return {
        isOnFloor: displayedOnFloor,
        isBoardCorrect: boardCorrect,
        dailyPurchaseOutcome: outcome,
        boardStatus: boardCorrect === 'yes' ? 'board_correct' : boardCorrect === 'no' ? 'wrong_price' : boardCorrect === 'not_applicable' ? 'not_applicable' : undefined,
        locationStatus: displayedOnFloor === 'yes' ? 'on_floor' : displayedOnFloor === 'no' ? 'not_found' : undefined,
        remarks: remarks.trim() || undefined,
        remark: remarks.trim() || undefined,
        checkedBy: activeCheckerName || result.checkedBy || 'Floor Auditor',
        checkedAt: now.toISOString(),
        checkedDate: now.toLocaleDateString('en-GB'),
        checkedTime: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        status: newStatus,
        issueReason: isReportingIssue ? (issueReason.trim() || outcomeLabel) : (newStatus === 'flagged' ? outcomeLabel : undefined),
      };
    }
  }));

  const purQty = result.purchasedQty ?? result.purchaseQty ?? 0;
  const freeQty = result.freeQty ?? 0;
  const suppliers: DailyPurchaseSupplierEntry[] = result.suppliersList && result.suppliersList.length > 0
    ? result.suppliersList
    : [{
        supplierName: result.supplierName || result.supplier || 'Primary Supplier',
        supplierCode: result.supplierCode,
        purchaseQty: purQty,
        freeQty: freeQty > 0 ? freeQty : undefined
      }];

  const isAmbiguous = isAmbiguousMatch || Boolean(result.isAmbiguousMatch);

  // Live Stock Display Values (Preserves 0 and negative values)
  const closingQtyDisplay = useMemo(() => {
    if (isAmbiguous) return 'Ambiguous Match';
    if (!liveProduct) return 'Not Available';
    const val = liveProduct.stock ?? liveProduct.closingQty ?? liveProduct.closingStock;
    if (val !== undefined && val !== null && !isNaN(Number(val))) {
      return String(Number(val));
    }
    return 'Not Available';
  }, [liveProduct, isAmbiguous]);

  const salesQtyDisplay = useMemo(() => {
    if (isAmbiguous) return 'Ambiguous Match';
    if (!liveProduct) return 'Not Available';
    const val = liveProduct.salesCount ?? liveProduct.salesQty;
    if (val !== undefined && val !== null && !isNaN(Number(val))) {
      return String(Number(val));
    }
    return 'Not Available';
  }, [liveProduct, isAmbiguous]);

  const mrpDisplay = useMemo(() => {
    if (isAmbiguous) return 'Ambiguous Match';
    const val = liveProduct?.mrp ?? result.mrp;
    if (val !== undefined && val !== null && !isNaN(Number(val)) && Number(val) > 0) {
      return `₹${Number(val)}`;
    }
    return 'Not Available';
  }, [liveProduct?.mrp, result.mrp, isAmbiguous]);

  const sellingPriceDisplay = useMemo(() => {
    if (isAmbiguous) return 'Ambiguous Match';
    const val = liveProduct?.retailPrice ?? result.retailPrice ?? result.salePrice ?? liveProduct?.mrp ?? result.mrp;
    if (val !== undefined && val !== null && !isNaN(Number(val)) && Number(val) > 0) {
      return `₹${Number(val)}`;
    }
    return 'Not Available';
  }, [liveProduct, result, isAmbiguous]);

  const lastPurchaseDateDisplay = useMemo(() => {
    return cleanDateOnly(result.lastPurchaseDate || liveProduct?.lastPurchaseDate) || 'Not Available';
  }, [result.lastPurchaseDate, liveProduct?.lastPurchaseDate]);

  const cleanSalesPeriod = useMemo(() => {
    return formatCleanSalesPeriod(salesPeriodText);
  }, [salesPeriodText]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-xs">
      <div
        className={`w-full max-w-xl rounded-2xl border shadow-2xl transition-all flex flex-col max-h-[92vh] sm:max-h-[90vh] overflow-hidden my-auto ${
          isDarkMode
            ? 'bg-slate-900 border-slate-800 text-slate-100'
            : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        {/* Modal Top Header */}
        <div className="shrink-0 px-4 sm:px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-850">
          <div className="flex items-center gap-2 min-w-0">
            <span className="px-2 py-0.5 text-[10.5px] font-bold rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 shrink-0">
              Daily Purchase Check
            </span>
            {remainingPendingCount > 0 && (
              <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium truncate">
                {remainingPendingCount} more pending in filter
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body (Scrolls internally so footer is never clipped) */}
        <div className="flex-1 p-4 sm:p-5 space-y-3.5 overflow-y-auto min-h-0 custom-scrollbar">
          {/* 1. Product Identity Block */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-mono text-xs font-extrabold px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                Code: {result.bansalCode || result.localCode || result.code || 'N/A'}
              </span>

              {result.barcode && (
                <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center gap-1">
                  <Scan className="w-3 h-3 text-slate-400" />
                  {result.barcode}
                </span>
              )}

              {result.mainCode && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                  {result.mainCode}
                </span>
              )}

              {result.category && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                  {result.category}
                </span>
              )}

              {result.brand && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                  Brand: {result.brand}
                </span>
              )}
            </div>

            <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white leading-snug break-words">
              {result.productName}
            </h3>

            {/* Live Pricing & Stock Highlights (Compact Grid: MRP, SP, Closing, Sales) */}
            <div className="space-y-1.5 pt-1">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 font-mono text-xs">
                {/* MRP */}
                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 shadow-2xs">
                  <span className="text-[10px] text-slate-400 font-sans uppercase font-bold block">MRP</span>
                  <span className={`font-bold text-sm ${isAmbiguous ? 'text-amber-600 text-xs' : 'text-slate-900 dark:text-white'}`}>
                    {mrpDisplay}
                  </span>
                </div>

                {/* SP */}
                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 shadow-2xs">
                  <span className="text-[10px] text-slate-400 font-sans uppercase font-bold block">SP</span>
                  <span className={`font-bold text-sm ${isAmbiguous ? 'text-amber-600 text-xs' : 'text-emerald-600 dark:text-emerald-400'}`}>
                    {sellingPriceDisplay}
                  </span>
                </div>

                {/* Closing */}
                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 shadow-2xs">
                  <span className="text-[10px] text-slate-400 font-sans uppercase font-bold block">Closing</span>
                  <span className={`font-bold text-sm ${isAmbiguous ? 'text-amber-600 text-xs' : 'text-indigo-600 dark:text-indigo-400'}`}>
                    {closingQtyDisplay}
                  </span>
                </div>

                {/* Sales */}
                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 shadow-2xs">
                  <span className="text-[10px] text-slate-400 font-sans uppercase font-bold block">Sales</span>
                  <span className={`font-bold text-sm ${isAmbiguous ? 'text-amber-600 text-xs' : 'text-slate-800 dark:text-slate-200'}`}>
                    {salesQtyDisplay}
                  </span>
                </div>
              </div>

              {/* Clean Stock Period & Last Purchase Date */}
              <div className="flex items-center justify-between text-[11px] font-mono text-slate-500 dark:text-slate-400 pt-0.5 flex-wrap gap-1.5 px-0.5">
                <span>
                  Stock Report: <strong className="text-slate-700 dark:text-slate-300 font-semibold">{cleanSalesPeriod}</strong>
                </span>
                <div className="flex items-center gap-1.5">
                  <Calendar className="w-3 h-3 text-indigo-500 shrink-0" />
                  <span>
                    Last Purchase Date: <strong className="text-slate-900 dark:text-white font-bold">{lastPurchaseDateDisplay}</strong>
                  </span>
                </div>
              </div>

              {isAmbiguous && (
                <div className="p-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-amber-800 dark:text-amber-300 text-[11px] font-semibold flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span>Ambiguous stock match for this code. Please review stock master.</span>
                </div>
              )}

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
          </div>

          {/* 2. Purchased Quantities & Supplier Breakdown */}
          <div className="p-3 rounded-xl border border-indigo-100 dark:border-indigo-900/60 bg-indigo-50/40 dark:bg-indigo-950/20 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <span className="text-xs font-bold text-indigo-950 dark:text-indigo-200 uppercase tracking-wide">
                  Purchased Inward
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-extrabold text-indigo-700 dark:text-indigo-300">
                  Qty: {purQty}
                </span>
                {freeQty > 0 && (
                  <span className="px-2 py-0.5 text-xs font-extrabold rounded-md bg-emerald-500 text-white shadow-2xs">
                    +{freeQty} Free
                  </span>
                )}
              </div>
            </div>

            {/* Supplier list */}
            <div className="text-xs text-slate-600 dark:text-slate-300 pt-1 border-t border-indigo-100 dark:border-indigo-900/40 space-y-1">
              <span className="text-[10.5px] font-semibold text-slate-400 block uppercase tracking-wider">
                Supplier Information ({suppliers.length}):
              </span>
              {suppliers.map((s, idx) => (
                <div key={idx} className="flex items-center justify-between text-xs py-0.5">
                  <span className="font-medium truncate pr-2">
                    {s.supplierName} {s.supplierCode ? `(${s.supplierCode})` : ''}
                  </span>
                  <span className="font-bold text-slate-700 dark:text-slate-300 shrink-0">
                    {s.purchaseQty} units {s.freeQty ? `(+${s.freeQty} free)` : ''}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* 3. Mandatory Check Questions */}
          <div className="space-y-3.5 pt-1">
            {/* Check Question 1: DISPLAYED ON FLOOR? */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-extrabold tracking-wide uppercase text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <span>1. Displayed on Floor?</span>
                  <span className="text-rose-500">*</span>
                </label>
                {displayedOnFloor !== undefined && (
                  <span className={`text-[11px] font-bold ${displayedOnFloor === 'yes' ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {displayedOnFloor === 'yes' ? '✓ Displayed' : '✗ NOT ON FLOOR'}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setDisplayedOnFloor('yes');
                    setValidationError(null);
                  }}
                  className={`min-h-[44px] p-2.5 rounded-xl border-2 font-bold text-xs sm:text-sm transition-all cursor-pointer flex items-center justify-center gap-2 ${
                    displayedOnFloor === 'yes'
                      ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 shadow-sm'
                      : 'border-slate-200 dark:border-slate-700 hover:border-emerald-300 bg-slate-50/50 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <Check className={`w-4 h-4 ${displayedOnFloor === 'yes' ? 'text-emerald-600' : 'text-slate-400'}`} />
                  <span>YES, Displayed</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setDisplayedOnFloor('no');
                    setValidationError(null);
                  }}
                  className={`min-h-[44px] p-2.5 rounded-xl border-2 font-bold text-xs sm:text-sm transition-all cursor-pointer flex items-center justify-center gap-2 ${
                    displayedOnFloor === 'no'
                      ? 'border-rose-500 bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 shadow-sm'
                      : 'border-slate-200 dark:border-slate-700 hover:border-rose-300 bg-slate-50/50 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <X className={`w-4 h-4 ${displayedOnFloor === 'no' ? 'text-rose-600' : 'text-slate-400'}`} />
                  <span>NO, Not on Floor</span>
                </button>
              </div>
            </div>

            {/* Check Question 2: BOARD CORRECT? */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-extrabold tracking-wide uppercase text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <span>2. Price Board Correct?</span>
                  <span className="text-rose-500">*</span>
                </label>
                {boardCorrect !== undefined && (
                  <span className={`text-[11px] font-bold ${
                    boardCorrect === 'yes'
                      ? 'text-emerald-600'
                      : boardCorrect === 'no'
                      ? 'text-rose-600'
                      : 'text-slate-500'
                  }`}>
                    {boardCorrect === 'yes' ? '✓ Correct Board' : boardCorrect === 'no' ? '✗ BOARD INCORRECT' : 'N/A'}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setBoardCorrect('yes');
                    setValidationError(null);
                  }}
                  className={`min-h-[44px] p-2 rounded-xl border-2 font-bold text-xs transition-all cursor-pointer flex flex-col items-center justify-center gap-0.5 ${
                    boardCorrect === 'yes'
                      ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 shadow-sm'
                      : 'border-slate-200 dark:border-slate-700 hover:border-emerald-300 bg-slate-50/50 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <Check className={`w-3.5 h-3.5 ${boardCorrect === 'yes' ? 'text-emerald-600' : 'text-slate-400'}`} />
                  <span>YES, Correct</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setBoardCorrect('no');
                    setValidationError(null);
                  }}
                  className={`min-h-[44px] p-2 rounded-xl border-2 font-bold text-xs transition-all cursor-pointer flex flex-col items-center justify-center gap-0.5 ${
                    boardCorrect === 'no'
                      ? 'border-rose-500 bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 shadow-sm'
                      : 'border-slate-200 dark:border-slate-700 hover:border-rose-300 bg-slate-50/50 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <X className={`w-3.5 h-3.5 ${boardCorrect === 'no' ? 'text-rose-600' : 'text-slate-400'}`} />
                  <span>NO, Incorrect</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setBoardCorrect('not_applicable');
                    setValidationError(null);
                  }}
                  className={`min-h-[44px] p-2 rounded-xl border-2 font-bold text-xs transition-all cursor-pointer flex flex-col items-center justify-center gap-0.5 ${
                    boardCorrect === 'not_applicable'
                      ? 'border-slate-500 bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-sm'
                      : 'border-slate-200 dark:border-slate-700 hover:border-slate-400 bg-slate-50/50 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <span className="text-[10px] font-mono font-bold">N/A</span>
                  <span>Not Applicable</span>
                </button>
              </div>
            </div>

            {/* Optional Remarks */}
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Remarks / Floor Notes (Optional)
              </label>
              <input
                type="text"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="e.g. Needs board replacement, stock in backroom"
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white min-h-[40px]"
              />
            </div>

            {/* Explicit Report Issue Section */}
            <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setIsReportingIssue(!isReportingIssue)}
                  className={`text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
                    isReportingIssue ? 'text-rose-600 dark:text-rose-400' : 'text-amber-600 dark:text-amber-400 hover:underline'
                  }`}
                >
                  <Flag className="w-3.5 h-3.5" />
                  <span>{isReportingIssue ? 'Cancel Issue Report' : '🚩 Report Issue (Action Required)'}</span>
                </button>
                {isReportingIssue && (
                  <span className="px-2 py-0.2 text-[10px] font-bold rounded bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300">
                    Flagged for Action
                  </span>
                )}
              </div>

              {isReportingIssue && (
                <div className="mt-2 p-3 rounded-xl bg-rose-50/50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60 space-y-1.5">
                  <label className="block text-xs font-bold text-rose-800 dark:text-rose-300">
                    Issue Description
                  </label>
                  <input
                    type="text"
                    value={issueReason}
                    onChange={(e) => setIssueReason(e.target.value)}
                    placeholder="Describe issue (e.g. damaged inward, missing barcode, board missing)"
                    className="w-full px-3 py-2 text-xs rounded-lg border border-rose-300 dark:border-rose-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-medium min-h-[40px]"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Validation Error Banner */}
          {validationError && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-300 text-xs font-bold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{validationError}</span>
            </div>
          )}
        </div>

        {/* Modal Bottom Actions - Pinned, Never Clipped, Safe Area Support */}
        <div className="shrink-0 px-4 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-900/90 pb-safe flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors min-h-[44px] cursor-pointer"
          >
            Cancel
          </button>

          <div className="flex items-center gap-2">
            {/* Secondary Option: SAVE & NEXT */}
            <button
              type="button"
              disabled={isSaving}
              onClick={() => handleSaveCheck(true)}
              className="px-3.5 py-2 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50/80 dark:bg-indigo-950/60 hover:bg-indigo-100 text-indigo-700 dark:text-indigo-300 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer min-h-[44px] active:scale-95 disabled:opacity-50"
            >
              <span>SAVE & NEXT</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>

            {/* Primary Action: SAVE & CLOSE */}
            <button
              type="button"
              disabled={isSaving}
              onClick={() => handleSaveCheck(false)}
              className="px-4.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md transition-all flex items-center gap-1.5 cursor-pointer min-h-[44px] active:scale-95 disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>SAVE & CLOSE</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});

DailyPurchaseCheckModal.displayName = 'DailyPurchaseCheckModal';
