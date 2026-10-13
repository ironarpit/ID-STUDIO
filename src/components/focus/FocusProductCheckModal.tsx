import React, { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import {
  X,
  CheckCircle2,
  Tag,
  ShoppingBag,
  ArrowRight,
  AlertCircle,
  AlertTriangle,
  Package
} from 'lucide-react';
import { Product, AuditProductResult, AuditCheckFormHandle } from '../../types';
import { formatCleanSalesPeriod } from '../../utils/fileParser';
import { useModalTransition } from '../../utils/useModalTransition';

interface FocusProductCheckModalProps {
  isOpen: boolean;
  result: AuditProductResult | null;
  liveProduct?: Product | null;
  isAmbiguousMatch?: boolean;
  salesPeriodText?: string;
  currentCategory?: string;
  remainingInCategoryCount?: number;
  onClose: () => void;
  onDirtyChange?: (isDirty: boolean) => void;
  onSaveAndNext: (
    fields: {
      display: 'YES' | 'NO';
      board: 'YES' | 'NO';
      boardType: 'B1G1' | 'OFF' | 'ONLY';
    },
    advanceToNext: boolean
  ) => Promise<boolean>;
  onViewStockIqDetails?: () => void;
  isDarkMode?: boolean;
}

export const FocusProductCheckModal = forwardRef<AuditCheckFormHandle, FocusProductCheckModalProps>(({
  isOpen,
  result,
  liveProduct,
  isAmbiguousMatch = false,
  salesPeriodText,
  currentCategory,
  remainingInCategoryCount,
  onClose,
  onDirtyChange,
  onSaveAndNext,
  onViewStockIqDetails,
  isDarkMode = false,
}, ref) => {
  const { handleClose, backdropClass, panelClass } = useModalTransition({
    onClose,
    isOpen: isOpen && !!result,
    duration: 170
  });

  // Local form state
  const [display, setDisplay] = useState<'YES' | 'NO' | null>(null);
  const [board, setBoard] = useState<'YES' | 'NO' | null>(null);
  const [boardType, setBoardType] = useState<'B1G1' | 'OFF' | 'ONLY' | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Dirty tracking
  useEffect(() => {
    if (!result) {
      onDirtyChange?.(false);
      return;
    }
    const initDisplay = result.display || (result.isOnFloor === 'yes' || result.isOnFloor === true ? 'YES' : result.isOnFloor === 'no' || result.isOnFloor === false ? 'NO' : null);
    const initBoard = result.board || (result.boardStatus === 'board_correct' || result.boardStatus === 'correct' ? 'YES' : result.boardStatus ? 'NO' : null);
    const initBoardType = result.boardType || null;

    const dirty = (display !== null && display !== initDisplay) ||
                  (board !== null && board !== initBoard) ||
                  (boardType !== null && boardType !== initBoardType);
    onDirtyChange?.(dirty);
  }, [display, board, boardType, result, onDirtyChange]);

  // Initialize or reset when a new product is selected
  useEffect(() => {
    if (result) {
      setDisplay(
        result.display ||
        (result.isOnFloor === 'yes' || result.isOnFloor === true ? 'YES' : result.isOnFloor === 'no' || result.isOnFloor === false ? 'NO' : null)
      );
      setBoard(
        result.board ||
        (result.boardStatus === 'board_correct' || result.boardStatus === 'correct' ? 'YES' : result.boardStatus ? 'NO' : null)
      );
      setBoardType(result.boardType || null);
      setErrorMessage(null);
    }
  }, [result?.id, result?.productId]);

  if (!isOpen || !result) return null;

  const isCore = result.focusType === 'core' || (result.mainCode || '').toUpperCase().includes('CORE');

  const handleSave = async (advanceToNext: boolean): Promise<boolean> => {
    if (!display) {
      setErrorMessage('Please indicate if Stock / Display is on floor (YES or NO).');
      return false;
    }
    if (!board) {
      setErrorMessage('Please indicate if Board is available / correct (YES or NO).');
      return false;
    }
    if (!boardType) {
      setErrorMessage('Please select Board Type (B1G1, OFF, or ONLY).');
      return false;
    }

    setErrorMessage(null);
    setIsSubmitting(true);
    try {
      const saved = await onSaveAndNext(
        {
          display,
          board,
          boardType,
        },
        advanceToNext
      );
      if (saved === false) {
        return false;
      }
      return true;
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to save check result.');
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  useImperativeHandle(ref, () => ({
    submitValidated: async (advanceToNext: boolean) => {
      return await handleSave(advanceToNext);
    }
  }));

  const codeStr = String(result.bansalCode || result.code || result.localCode || '');

  const isAmbiguous = isAmbiguousMatch || Boolean(result.isAmbiguousMatch);

  // Live Stock Display Values (Exact source fields matching Stock IQ Product Inspector)
  // Preserves 0 and negative quantities. Missing stock or sales must not become zero.
  const liveClosingDisplay = (() => {
    if (isAmbiguous) return 'Ambiguous Match';
    if (!liveProduct) return 'Not Available';
    const val = liveProduct.stock ?? liveProduct.closingQty ?? liveProduct.closingStock;
    if (val !== undefined && val !== null && !isNaN(Number(val))) {
      return String(Number(val));
    }
    return 'Not Available';
  })();

  const liveSalesDisplay = (() => {
    if (isAmbiguous) return 'Ambiguous Match';
    if (!liveProduct) return 'Not Available';
    const val = liveProduct.salesCount ?? liveProduct.salesQty;
    if (val !== undefined && val !== null && !isNaN(Number(val))) {
      return String(Number(val));
    }
    return 'Not Available';
  })();

  const liveMrpDisplay = (() => {
    if (isAmbiguous) return 'Ambiguous Match';
    if (!liveProduct) return 'Not Available';
    const val = liveProduct.mrp;
    if (val !== undefined && val !== null && !isNaN(Number(val))) {
      return `₹${Number(val)}`;
    }
    return 'Not Available';
  })();

  const liveSpDisplay = (() => {
    if (isAmbiguous) return 'Ambiguous Match';
    if (!liveProduct) return 'Not Available';
    const val = liveProduct.retailPrice ?? liveProduct.salePrice;
    if (val !== undefined && val !== null && !isNaN(Number(val))) {
      return `₹${Number(val)}`;
    }
    return 'Not Available';
  })();

  const cleanSalesPeriod = formatCleanSalesPeriod(salesPeriodText);

  const mrpFormatted = typeof result.mrp === 'number' && !isNaN(result.mrp)
    ? `₹${result.mrp.toFixed(2)}`
    : result.mrp
    ? `₹${result.mrp}`
    : '—';

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs overflow-y-auto ${backdropClass}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div
        className={`w-full max-w-lg rounded-2xl border shadow-2xl overflow-hidden my-auto mobile-bottom-sheet ${panelClass} ${
          isDarkMode
            ? 'bg-slate-900 border-slate-800 text-slate-100'
            : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        {/* Header Bar */}
        <div
          className={`px-4 sm:px-5 py-3.5 border-b flex items-center justify-between ${
            isCore
              ? 'bg-indigo-50/80 dark:bg-indigo-950/40 border-indigo-100 dark:border-indigo-900/60'
              : 'bg-teal-50/80 dark:bg-teal-950/40 border-teal-100 dark:border-teal-900/60'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <span
              className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${
                isCore
                  ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/80 dark:text-indigo-200 border-indigo-200 dark:border-indigo-800'
                  : 'bg-teal-100 text-teal-800 dark:bg-teal-900/80 dark:text-teal-200 border-teal-200 dark:border-teal-800'
              }`}
            >
              {isCore ? 'CORE FOCUS CHECK' : 'NON-CORE FOCUS CHECK'}
            </span>
            {currentCategory && currentCategory !== 'all' && (
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 truncate max-w-[140px] sm:max-w-[180px]">
                {currentCategory}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {remainingInCategoryCount !== undefined && remainingInCategoryCount > 0 && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                {remainingInCategoryCount} Pending in Category
              </span>
            )}
            <button
              type="button"
              onClick={handleClose}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Product Snapshot Box (Frozen Details) */}
        <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 space-y-3">
          {/* Metadata Row: Main Code & Category & Code */}
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <span className="font-semibold text-slate-500 dark:text-slate-400">
              MAIN CODE:
            </span>
            <span className="font-bold text-slate-800 dark:text-slate-200">
              {result.mainCode || (isCore ? 'CORE' : 'NON-CORE')}
            </span>

            <span className="text-slate-300 dark:text-slate-600">•</span>

            <span className="font-semibold text-slate-500 dark:text-slate-400">
              CATEGORY:
            </span>
            <span className="font-bold text-slate-800 dark:text-slate-200">
              {result.category || 'General'}
            </span>

            <span className="text-slate-300 dark:text-slate-600">•</span>

            <span className="font-semibold text-slate-500 dark:text-slate-400">
              CODE:
            </span>
            <span className="font-mono font-black text-slate-900 dark:text-white bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-xs">
              {codeStr}
            </span>
          </div>

          {/* Item Name */}
          <div>
            <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white leading-snug">
              {result.productName}
            </h3>
          </div>

          {/* Focus Master Offer & Focus Snapshot MRP Row */}
          <div className="grid grid-cols-2 gap-2 pt-0.5">
            <div className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                FOCUS MRP
              </span>
              <span className="text-sm font-black text-slate-900 dark:text-white font-mono">
                {mrpFormatted}
              </span>
            </div>
            <div className="p-2 rounded-xl border border-indigo-100 dark:border-indigo-900/60 bg-indigo-50/50 dark:bg-indigo-950/30">
              <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider block">
                FOCUS OFFER
              </span>
              <span className="text-xs font-bold text-indigo-900 dark:text-indigo-200 truncate block" title={result.focusOffer || result.issueReason || 'No special offer'}>
                {result.focusOffer || result.issueReason || '—'}
              </span>
            </div>
          </div>

          {/* Live Pricing & Stock Highlights (Compact Grid: MRP, SP, Closing, Sales) */}
          <div className="space-y-1.5 pt-1 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">
                CURRENT STOCK IQ METRICS
              </span>
              {isAmbiguous && (
                <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> Ambiguous Match
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 font-mono text-xs">
              {/* Live MRP */}
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 shadow-2xs">
                <span className="text-[10px] text-slate-400 font-sans uppercase font-bold block">MRP</span>
                <span className={`font-bold text-sm ${isAmbiguous ? 'text-amber-600 text-xs' : 'text-slate-900 dark:text-white'}`}>
                  {liveMrpDisplay}
                </span>
              </div>
              {/* Live SP (Selling Price) */}
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 shadow-2xs">
                <span className="text-[10px] text-slate-400 font-sans uppercase font-bold block">SP</span>
                <span className={`font-bold text-sm ${isAmbiguous ? 'text-amber-600 text-xs' : 'text-emerald-600 dark:text-emerald-400'}`}>
                  {liveSpDisplay}
                </span>
              </div>
              {/* Closing Stock */}
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 shadow-2xs">
                <span className="text-[10px] text-slate-400 font-sans uppercase font-bold block">Closing</span>
                <span className={`font-bold text-sm ${isAmbiguous ? 'text-amber-600 text-xs' : 'text-indigo-600 dark:text-indigo-400'}`}>
                  {liveClosingDisplay}
                </span>
              </div>
              {/* Sales Qty */}
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 shadow-2xs">
                <span className="text-[10px] text-slate-400 font-sans uppercase font-bold block">Sales</span>
                <span className={`font-bold text-sm ${isAmbiguous ? 'text-amber-600 text-xs' : 'text-slate-800 dark:text-slate-200'}`}>
                  {liveSalesDisplay}
                </span>
              </div>
            </div>

            {/* Stock Report Period footer */}
            <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 pt-0.5 px-0.5">
              <span>
                {cleanSalesPeriod !== 'Period unavailable'
                  ? <>Stock Report: <strong className="text-slate-700 dark:text-slate-300 font-semibold">{cleanSalesPeriod}</strong></>
                  : 'Stock Report Period: Not Available'}
              </span>
            </div>
          </div>

          {/* View Stock IQ Details Button */}
          {onViewStockIqDetails && (
            <button
              type="button"
              onClick={onViewStockIqDetails}
              className="w-full mt-2.5 py-2 px-3 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50/70 hover:bg-indigo-100 dark:bg-indigo-950/50 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs active:scale-98 min-h-[40px]"
              title="Open Stock IQ Product Inspector"
            >
              <Package className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>VIEW STOCK IQ DETAILS</span>
            </button>
          )}
        </div>

        {/* 3 Physical Check Fields */}
        <div className="p-4 sm:p-5 space-y-4">
          {errorMessage && (
            <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 flex items-center gap-2 text-xs text-rose-700 dark:text-rose-300">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* FIELD 1: DISPLAY */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-black tracking-wide text-slate-800 dark:text-slate-200 uppercase">
                1. DISPLAY
              </label>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                STOCK / DISPLAY ON FLOOR?
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setDisplay('YES')}
                className={`py-2.5 px-4 rounded-xl font-black text-xs transition-all flex items-center justify-center gap-1.5 border min-h-[44px] cursor-pointer active:scale-95 ${
                  display === 'YES'
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                    : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-750'
                }`}
              >
                <CheckCircle2 className={`w-4 h-4 ${display === 'YES' ? 'text-white' : 'text-slate-400'}`} />
                <span>YES</span>
              </button>

              <button
                type="button"
                onClick={() => setDisplay('NO')}
                className={`py-2.5 px-4 rounded-xl font-black text-xs transition-all flex items-center justify-center gap-1.5 border min-h-[44px] cursor-pointer active:scale-95 ${
                  display === 'NO'
                    ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                    : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-750'
                }`}
              >
                <X className={`w-4 h-4 ${display === 'NO' ? 'text-white' : 'text-slate-400'}`} />
                <span>NO</span>
              </button>
            </div>
          </div>

          {/* FIELD 2: BOARD */}
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-black tracking-wide text-slate-800 dark:text-slate-200 uppercase">
                2. BOARD
              </label>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                BOARD AVAILABLE / CORRECT?
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setBoard('YES')}
                className={`py-2.5 px-4 rounded-xl font-black text-xs transition-all flex items-center justify-center gap-1.5 border min-h-[44px] cursor-pointer active:scale-95 ${
                  board === 'YES'
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                    : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-750'
                }`}
              >
                <CheckCircle2 className={`w-4 h-4 ${board === 'YES' ? 'text-white' : 'text-slate-400'}`} />
                <span>YES</span>
              </button>

              <button
                type="button"
                onClick={() => setBoard('NO')}
                className={`py-2.5 px-4 rounded-xl font-black text-xs transition-all flex items-center justify-center gap-1.5 border min-h-[44px] cursor-pointer active:scale-95 ${
                  board === 'NO'
                    ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                    : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-750'
                }`}
              >
                <X className={`w-4 h-4 ${board === 'NO' ? 'text-white' : 'text-slate-400'}`} />
                <span>NO</span>
              </button>
            </div>
          </div>

          {/* FIELD 3: BOARD TYPE */}
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-black tracking-wide text-slate-800 dark:text-slate-200 uppercase">
                3. BOARD TYPE
              </label>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                Physical observation: select one
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {(['B1G1', 'OFF', 'ONLY'] as const).map((typeOpt) => {
                const isSelected = boardType === typeOpt;
                return (
                  <button
                    key={typeOpt}
                    type="button"
                    onClick={() => setBoardType(typeOpt)}
                    className={`py-2.5 px-2 rounded-xl font-black text-xs transition-all flex items-center justify-center border min-h-[44px] cursor-pointer active:scale-95 ${
                      isSelected
                        ? isCore
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                          : 'bg-teal-600 text-white border-teal-600 shadow-xs'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-750'
                    }`}
                  >
                    <span>{typeOpt}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer with Main Action Button: SAVE & CLOSE (Primary) and SAVE & NEXT (Secondary) */}
        <div
          className={`p-4 border-t flex flex-col sm:flex-row items-center justify-between gap-2.5 ${
            isDarkMode ? 'bg-slate-900/80 border-slate-800' : 'bg-slate-50 border-slate-100'
          }`}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer min-h-[44px]"
          >
            Cancel
          </button>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={() => handleSave(true)}
              disabled={isSubmitting}
              className={`flex-1 sm:flex-initial px-4 py-2.5 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50/80 dark:bg-indigo-950/60 hover:bg-indigo-100 text-indigo-700 dark:text-indigo-300 font-bold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 disabled:opacity-50 min-h-[44px]`}
            >
              <span>SAVE & NEXT</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => handleSave(false)}
              disabled={isSubmitting}
              className={`flex-1 sm:flex-initial px-5 py-2.5 rounded-xl font-bold text-xs text-white shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 disabled:opacity-50 min-h-[44px] ${
                isCore
                  ? 'bg-indigo-600 hover:bg-indigo-700'
                  : 'bg-teal-600 hover:bg-teal-700'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>SAVE & CLOSE</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});

FocusProductCheckModal.displayName = 'FocusProductCheckModal';
