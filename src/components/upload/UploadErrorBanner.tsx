import React from 'react';
import { AlertCircle, HelpCircle, X } from 'lucide-react';

interface UploadErrorBannerProps {
  whatWentWrong: string;
  whatToDo?: string;
  onDismiss?: () => void;
  isDarkMode?: boolean;
}

export const UploadErrorBanner: React.FC<UploadErrorBannerProps> = ({
  whatWentWrong,
  whatToDo,
  onDismiss,
  isDarkMode = false
}) => {
  if (!whatWentWrong) return null;

  return (
    <div 
      className={`p-3.5 rounded-xl border text-xs space-y-2 animate-fade-in ${
        isDarkMode 
          ? 'bg-rose-950/40 border-rose-800/80 text-rose-200' 
          : 'bg-rose-50 border-rose-200 text-rose-900'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2.5 min-w-0">
          <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="font-bold text-rose-900 dark:text-rose-200">
              What went wrong:
            </p>
            <p className="text-rose-700 dark:text-rose-300 mt-0.5 leading-relaxed">
              {whatWentWrong}
            </p>
          </div>
        </div>

        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="text-rose-400 hover:text-rose-700 dark:hover:text-rose-200 p-1 rounded-md transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {whatToDo && (
        <div className="pl-6 pt-1 border-t border-rose-200/60 dark:border-rose-900/60 flex items-start gap-1.5 text-[11px] text-rose-600 dark:text-rose-400">
          <HelpCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <div>
            <strong className="font-semibold text-rose-800 dark:text-rose-300">Action: </strong>
            <span>{whatToDo}</span>
          </div>
        </div>
      )}
    </div>
  );
};
