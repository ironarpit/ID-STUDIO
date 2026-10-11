import React from 'react';
import { ClipboardCheck, X, AlertCircle } from 'lucide-react';
import { FocusType } from '../../types';
import { useModalTransition } from '../../utils/useModalTransition';

interface FocusStartAuditModalProps {
  isOpen: boolean;
  focusType: FocusType;
  monthDisplay: string;
  sourceTitle: string;
  productCount: number;
  onClose: () => void;
  onConfirm: () => void;
  isDarkMode?: boolean;
}

export const FocusStartAuditModal: React.FC<FocusStartAuditModalProps> = ({
  isOpen,
  focusType,
  monthDisplay,
  sourceTitle,
  productCount,
  onClose,
  onConfirm,
  isDarkMode = false,
}) => {
  const { handleClose, backdropClass, panelClass } = useModalTransition({
    onClose,
    isOpen,
    duration: 170
  });

  if (!isOpen) return null;

  const isCore = focusType === 'core';

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs ${backdropClass}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div
        className={`w-full max-w-md rounded-2xl border shadow-2xl overflow-hidden mobile-bottom-sheet ${panelClass} ${
          isDarkMode
            ? 'bg-slate-900 border-slate-800 text-slate-100'
            : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        {/* Header */}
        <div
          className={`px-5 py-4 border-b flex items-center justify-between ${
            isCore
              ? 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-100 dark:border-indigo-900/60'
              : 'bg-teal-50 dark:bg-teal-950/40 border-teal-100 dark:border-teal-900/60'
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center font-black ${
                isCore
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-teal-600 text-white shadow-xs'
              }`}
            >
              <ClipboardCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black tracking-tight text-slate-900 dark:text-white">
                START FOCUS AUDIT?
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Floor IQ physical verification checklist
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Details */}
        <div className="p-5 space-y-4">
          <div
            className={`p-4 rounded-xl border space-y-2.5 ${
              isDarkMode
                ? 'bg-slate-800/60 border-slate-700/80'
                : 'bg-slate-50 border-slate-200'
            }`}
          >
            {/* Focus */}
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500 dark:text-slate-400 font-medium">Focus:</span>
              <span
                className={`px-2.5 py-0.5 rounded-full text-xs font-black tracking-wider uppercase ${
                  isCore
                    ? 'bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800'
                    : 'bg-teal-100 dark:bg-teal-950 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800'
                }`}
              >
                {isCore ? 'CORE' : 'NON-CORE'}
              </span>
            </div>

            {/* Month */}
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500 dark:text-slate-400 font-medium">Month:</span>
              <span className="font-bold text-slate-800 dark:text-slate-200 font-mono">
                {monthDisplay || 'Current Month'}
              </span>
            </div>

            {/* Source */}
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500 dark:text-slate-400 font-medium">Source:</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                {sourceTitle}
              </span>
            </div>

            {/* Products */}
            <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-200 dark:border-slate-700">
              <span className="text-slate-500 dark:text-slate-400 font-medium">Products:</span>
              <span className="text-sm font-black font-mono text-slate-900 dark:text-white">
                {productCount}
              </span>
            </div>
          </div>

          {productCount === 0 && (
            <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 flex items-center gap-2.5 text-xs text-amber-800 dark:text-amber-300">
              <AlertCircle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <span>No products match the current filters. Filter or clear search to start an audit.</span>
            </div>
          )}

          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
            This will create a dedicated Floor IQ audit with the currently filtered {productCount} products and immediately open the floor checking runner.
          </p>
        </div>

        {/* Footer Actions */}
        <div
          className={`px-5 py-3.5 border-t flex items-center justify-end gap-2.5 ${
            isDarkMode ? 'bg-slate-900/80 border-slate-800' : 'bg-slate-50 border-slate-100'
          }`}
        >
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={productCount === 0}
            className={`px-5 py-2 rounded-xl text-xs font-black shadow-md transition-all flex items-center gap-2 cursor-pointer active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none ${
              isCore
                ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                : 'bg-teal-600 hover:bg-teal-700 text-white'
            }`}
          >
            <ClipboardCheck className="w-4 h-4" />
            <span>Start Audit</span>
          </button>
        </div>
      </div>
    </div>
  );
};
