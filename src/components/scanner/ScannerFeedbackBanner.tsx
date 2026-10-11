import React, { useEffect } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, X, Scan } from 'lucide-react';
import { ScannerFeedbackData } from '../../utils/hardwareScanner';

interface ScannerFeedbackBannerProps {
  feedback: ScannerFeedbackData | null;
  onDismiss: () => void;
  isDarkMode?: boolean;
}

export const ScannerFeedbackBanner: React.FC<ScannerFeedbackBannerProps> = ({
  feedback,
  onDismiss,
  isDarkMode = false
}) => {
  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => {
      onDismiss();
    }, 3800);
    return () => clearTimeout(timer);
  }, [feedback, onDismiss]);

  if (!feedback) return null;

  const isMatched = feedback.type === 'matched' || feedback.type === 'found';
  const isWarning = feedback.type === 'not_in_audit' || feedback.type === 'not_in_focus';
  const isError = feedback.type === 'not_found';

  return (
    <div
      role="alert"
      className="fixed top-14 sm:top-16 left-1/2 -translate-x-1/2 z-50 w-[94%] max-w-lg animate-in fade-in slide-in-from-top-3 duration-200"
    >
      <div
        className={`p-2.5 sm:p-3 rounded-2xl shadow-xl border flex items-start justify-between gap-2.5 backdrop-blur-md transition-all ${
          isMatched
            ? isDarkMode
              ? 'bg-emerald-950/95 border-emerald-500/60 text-emerald-100 shadow-emerald-950/40'
              : 'bg-emerald-600 text-white border-emerald-500 shadow-emerald-600/30'
            : isWarning
            ? isDarkMode
              ? 'bg-amber-950/95 border-amber-500/60 text-amber-100 shadow-amber-950/40'
              : 'bg-amber-600 text-white border-amber-500 shadow-amber-600/30'
            : isDarkMode
            ? 'bg-rose-950/95 border-rose-500/60 text-rose-100 shadow-rose-950/40'
            : 'bg-rose-600 text-white border-rose-500 shadow-rose-600/30'
        }`}
      >
        <div className="flex items-start gap-2.5 min-w-0 flex-1">
          <div className="mt-0.5 shrink-0">
            {isMatched ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-200" />
            ) : isWarning ? (
              <AlertTriangle className="w-5 h-5 text-amber-200" />
            ) : (
              <XCircle className="w-5 h-5 text-rose-200" />
            )}
          </div>

          <div className="min-w-0 flex-1 space-y-0.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-black text-xs sm:text-sm tracking-wider uppercase">
                {feedback.title}
              </span>
              {feedback.bansalCode && (
                <span className="px-1.5 py-0.2 rounded bg-black/20 text-[10px] font-mono font-bold">
                  Code: {feedback.bansalCode}
                </span>
              )}
            </div>

            {feedback.productName && (
              <p className="text-xs sm:text-sm font-bold truncate leading-tight">
                {feedback.productName}
              </p>
            )}

            <div className="flex items-center gap-2 text-[10px] opacity-90 font-mono">
              <span className="flex items-center gap-1">
                <Scan className="w-3 h-3" />
                {feedback.barcode}
              </span>
              {feedback.message && <span>• {feedback.message}</span>}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onDismiss}
          className="p-1 rounded-lg hover:bg-black/20 text-white/90 hover:text-white transition-colors cursor-pointer shrink-0 min-w-[36px] min-h-[36px] flex items-center justify-center"
          title="Dismiss banner"
          aria-label="Close notification"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
