import React from 'react';
import { X } from 'lucide-react';
import { UploadStepIndicator } from './UploadStepIndicator';
import { useModalTransition } from '../../utils/useModalTransition';

export interface UploadModalShellProps {
  isOpen: boolean;
  onClose: () => void;
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  badge?: {
    text: string;
    variant?: 'indigo' | 'emerald' | 'amber' | 'slate';
  };
  currentStep: 1 | 2 | 3 | 4;
  stepLabels?: [string, string, string, string];
  isProcessing?: boolean;
  children: React.ReactNode;
  footerLeft?: React.ReactNode;
  footerRight?: React.ReactNode;
  maxWidthClass?: string;
  isDarkMode?: boolean;
}

export const UploadModalShell: React.FC<UploadModalShellProps> = ({
  isOpen,
  onClose,
  icon,
  title,
  subtitle,
  badge,
  currentStep,
  stepLabels = ['Select File', 'Validate', 'Review', 'Complete'],
  isProcessing = false,
  children,
  footerLeft,
  footerRight,
  maxWidthClass = 'max-w-xl',
  isDarkMode = false
}) => {
  const { handleClose, backdropClass, panelClass } = useModalTransition({
    onClose,
    isOpen,
    duration: 170
  });

  if (!isOpen) return null;

  const getBadgeStyle = (variant?: 'indigo' | 'emerald' | 'amber' | 'slate') => {
    switch (variant) {
      case 'emerald':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800';
      case 'amber':
        return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800';
      case 'slate':
        return 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700';
      case 'indigo':
      default:
        return 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/50 dark:text-indigo-300 dark:border-indigo-800';
    }
  };

  return (
    <div
      className={`fixed inset-0 z-60 flex items-center justify-center p-2 sm:p-3 bg-slate-950/60 backdrop-blur-xs ${backdropClass}`}
      onClick={(e) => {
        if (!isProcessing && e.target === e.currentTarget) handleClose();
      }}
    >
      <div 
        className={`w-full ${maxWidthClass} rounded-xl sm:rounded-2xl border shadow-2xl flex flex-col max-h-[96dvh] overflow-hidden my-auto mobile-bottom-sheet ${panelClass} ${
          isDarkMode ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-800'
        }`}
      >
        {/* Ultra-Dense Header */}
        <div 
          className={`px-3 py-2 sm:px-4 sm:py-2.5 border-b flex items-center justify-between shrink-0 ${
            isDarkMode ? 'border-slate-800 bg-slate-900/95' : 'border-slate-100 bg-slate-50/90'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <div className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200/80 dark:border-indigo-800 shadow-2xs shrink-0 flex items-center justify-center">
              {icon}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <h2 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate">
                  {title}
                </h2>
                {badge && (
                  <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded border ${getBadgeStyle(badge.variant)}`}>
                    {badge.text}
                  </span>
                )}
              </div>
              {subtitle && (
                <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                  {subtitle}
                </p>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={handleClose}
            disabled={isProcessing}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed shrink-0 ml-1"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Ultra-Dense 4-Step Indicator */}
        <UploadStepIndicator 
          currentStep={currentStep} 
          stepLabels={stepLabels} 
          isDarkMode={isDarkMode} 
        />

        {/* Dense Content Body */}
        <div className="p-2.5 sm:p-3.5 overflow-y-auto flex-1 space-y-2 sm:space-y-2.5">
          {children}
        </div>

        {/* Ultra-Dense Bottom Action Bar */}
        {(footerLeft || footerRight) && (
          <div 
            className={`px-3 py-2 sm:px-4 sm:py-2.5 border-t flex items-center justify-between gap-2 shrink-0 ${
              isDarkMode ? 'border-slate-800 bg-slate-900/95' : 'border-slate-100 bg-slate-50/90'
            }`}
          >
            <div className="min-w-0">{footerLeft}</div>
            <div className="flex items-center gap-1.5 shrink-0">{footerRight}</div>
          </div>
        )}
      </div>
    </div>
  );
};
