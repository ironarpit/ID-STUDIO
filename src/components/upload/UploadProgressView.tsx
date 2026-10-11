import React from 'react';
import { Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';

export interface ProgressStageItem {
  key: string;
  label: string;
}

export const STANDARD_OFFLINE_STAGES: ProgressStageItem[] = [
  { key: 'reading', label: 'Reading' },
  { key: 'validating', label: 'Validating' },
  { key: 'preparing', label: 'Preparing' },
  { key: 'saving', label: 'Saving' },
  { key: 'complete', label: 'Complete' }
];

interface UploadProgressViewProps {
  stage: string;
  percent: number;
  stages?: ProgressStageItem[];
  failed?: boolean;
  error?: string;
  productsProcessed?: number;
  totalProducts?: number;
  isDarkMode?: boolean;
  datasetName?: string;
}

export const UploadProgressView: React.FC<UploadProgressViewProps> = ({
  stage,
  percent,
  stages = STANDARD_OFFLINE_STAGES,
  failed = false,
  error,
  productsProcessed,
  totalProducts,
  isDarkMode = false,
  datasetName = 'Inventory Data'
}) => {
  const isComplete = percent >= 100 && !failed;

  // Map legacy stage strings to friendly offline names
  const getCleanStageName = (rawStage: string): string => {
    const s = (rawStage || '').toLowerCase();
    if (s.includes('chunk') || s.includes('cloud') || s.includes('upload') || s.includes('sync')) {
      return percent < 40 ? 'Reading File' : percent < 70 ? 'Validating Data' : percent < 95 ? 'Saving to Device' : 'Complete';
    }
    return rawStage;
  };

  const cleanStage = getCleanStageName(stage);

  return (
    <div 
      className={`rounded-xl p-2.5 sm:p-3.5 border space-y-2 animate-fade-in ${
        isDarkMode 
          ? 'bg-slate-950 border-slate-800 text-white' 
          : 'bg-slate-900 border-slate-800 text-white'
      }`}
    >
      {/* Top Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {failed ? (
            <div className="w-6 h-6 rounded-lg bg-rose-500/20 border border-rose-500/40 text-rose-400 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-3.5 h-3.5" />
            </div>
          ) : isComplete ? (
            <div className="w-6 h-6 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-3.5 h-3.5" />
            </div>
          ) : (
            <div className="w-6 h-6 rounded-lg bg-indigo-500/20 border border-indigo-500/40 text-indigo-400 flex items-center justify-center shrink-0">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            </div>
          )}

          <div className="min-w-0">
            <h3 className="text-xs font-bold text-white tracking-tight truncate">
              {failed
                ? 'Processing Failed'
                : isComplete
                ? 'Activation Complete'
                : cleanStage || 'Processing on Device...'}
            </h3>
            <p className="text-[10px] text-slate-400 truncate">
              {failed
                ? 'Existing data preserved.'
                : isComplete
                ? `${datasetName} activated offline.`
                : totalProducts && totalProducts > 0
                ? `Indexing ${totalProducts.toLocaleString('en-IN')} records offline...`
                : 'Saving data offline...'}
            </p>
          </div>
        </div>

        <div className="text-right shrink-0">
          <span
            className={`text-base sm:text-lg font-black tabular-nums font-mono ${
              failed
                ? 'text-rose-400'
                : isComplete
                ? 'text-emerald-400'
                : 'text-indigo-400'
            }`}
          >
            {percent}%
          </span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="space-y-0.5">
        <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800 p-0.5 shadow-inner">
          <div
            className={`h-full rounded-full transition-all duration-300 ease-out ${
              failed
                ? 'bg-rose-500'
                : isComplete
                ? 'bg-emerald-500'
                : 'bg-indigo-500'
            }`}
            style={{
              width: `${Math.min(100, Math.max(percent, failed ? percent : 5))}%`
            }}
          />
        </div>
      </div>

      {/* Real Record Count Stats if available */}
      {typeof totalProducts === 'number' && totalProducts > 0 && (
        <div className="grid grid-cols-2 gap-1.5 pt-0.5">
          <div className="bg-slate-950/80 border border-slate-800 rounded-lg px-2 py-1 flex items-center justify-between">
            <span className="text-[9px] uppercase font-bold text-slate-400">Records</span>
            <span className="text-xs font-bold text-white font-mono">{totalProducts.toLocaleString('en-IN')}</span>
          </div>

          <div className="bg-slate-950/80 border border-slate-800 rounded-lg px-2 py-1 flex items-center justify-between">
            <span className="text-[9px] uppercase font-bold text-slate-400">Mode</span>
            <span className="text-xs font-bold text-emerald-400 font-mono">100% Offline</span>
          </div>
        </div>
      )}

      {/* Stage Pipeline Step Pills */}
      <div className="pt-0.5">
        <div className="grid grid-cols-4 sm:grid-cols-5 gap-1 text-[9px]">
          {stages.map((stg, idx) => {
            const currentIdx = Math.min(stages.length - 1, Math.floor((percent / 100) * stages.length));
            const isDone = isComplete || (!failed && percent >= ((idx + 1) / stages.length) * 100);
            const isCurrent = !failed && !isComplete && idx === currentIdx;
            const isStgFailed = failed && idx === currentIdx;

            return (
              <div
                key={stg.key}
                className={`px-1 py-0.5 rounded border flex items-center justify-center gap-1 transition-colors truncate ${
                  isStgFailed
                    ? 'bg-rose-950/70 border-rose-500/80 text-rose-200 font-bold'
                    : isDone
                    ? 'bg-emerald-950/40 border-emerald-700/60 text-emerald-300'
                    : isCurrent
                    ? 'bg-indigo-950/70 border-indigo-500 text-indigo-200 font-bold shadow-2xs'
                    : 'bg-slate-950/40 border-slate-800/60 text-slate-500'
                }`}
              >
                {isStgFailed ? (
                  <AlertTriangle className="w-2 h-2 text-rose-400 shrink-0" />
                ) : isDone ? (
                  <CheckCircle2 className="w-2 h-2 text-emerald-400 shrink-0" />
                ) : isCurrent ? (
                  <Loader2 className="w-2 h-2 text-indigo-400 animate-spin shrink-0" />
                ) : null}
                <span className="truncate">{stg.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Failure Message */}
      {failed && (
        <div className="p-2 bg-rose-950/90 border border-rose-700 rounded-lg text-rose-200 text-[10.5px] flex items-start gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-rose-100">Processing Error</p>
            <p className="text-rose-300 mt-0.5">
              {error || 'An unexpected error occurred while saving data locally.'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
