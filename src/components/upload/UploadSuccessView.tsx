import React from 'react';
import { CheckCircle2, Check, FileSpreadsheet, Clock } from 'lucide-react';

export interface SuccessMetric {
  label: string;
  value: string | number;
  highlight?: 'default' | 'indigo' | 'emerald' | 'amber' | 'rose';
}

interface UploadSuccessViewProps {
  title?: string;
  subtitle?: string;
  datasetName: string;
  fileName: string;
  metrics: SuccessMetric[];
  activatedTime?: string;
  onDone: () => void;
  isDarkMode?: boolean;
}

export const UploadSuccessView: React.FC<UploadSuccessViewProps> = ({
  title,
  subtitle,
  datasetName,
  fileName,
  metrics,
  activatedTime,
  onDone,
  isDarkMode = false
}) => {
  const displayTime = activatedTime 
    ? new Date(activatedTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) 
    : new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const getMetricColor = (highlight?: string) => {
    switch (highlight) {
      case 'emerald':
        return 'text-emerald-600 dark:text-emerald-400';
      case 'indigo':
        return 'text-indigo-600 dark:text-indigo-400';
      case 'amber':
        return 'text-amber-600 dark:text-amber-400';
      case 'rose':
        return 'text-rose-600 dark:text-rose-400';
      default:
        return 'text-slate-900 dark:text-white';
    }
  };

  return (
    <div className="space-y-2 py-0.5 animate-fade-in">
      {/* Dense Banner */}
      <div 
        className={`p-2 sm:p-2.5 rounded-xl border flex items-center gap-2.5 ${
          isDarkMode 
            ? 'bg-emerald-950/30 border-emerald-900/60 text-emerald-200' 
            : 'bg-emerald-50/80 border-emerald-200 text-emerald-900'
        }`}
      >
        <div className="w-8 h-8 bg-emerald-100 dark:bg-emerald-900/60 text-emerald-600 dark:text-emerald-400 rounded-lg flex items-center justify-center shrink-0 shadow-2xs">
          <CheckCircle2 className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <h3 className="text-xs sm:text-sm font-black uppercase tracking-tight text-emerald-950 dark:text-emerald-200 truncate">
            {title || `✓ ${datasetName} ACTIVATED`}
          </h3>
          <p className="text-[10px] text-emerald-700 dark:text-emerald-300/90 truncate">
            {subtitle || 'Verified & stored in offline database.'}
          </p>
        </div>
      </div>

      {/* Dense File Info & Timestamp Card */}
      <div 
        className={`px-2.5 py-1.5 rounded-lg border flex items-center justify-between gap-2 ${
          isDarkMode ? 'bg-slate-800/60 border-slate-700' : 'bg-slate-50 border-slate-200'
        }`}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <FileSpreadsheet className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
          <span className="text-[11px] font-bold text-slate-900 dark:text-white truncate">
            {fileName}
          </span>
        </div>

        <div className="flex items-center gap-1 text-[10px] font-mono text-slate-500 dark:text-slate-400 shrink-0">
          <Clock className="w-3 h-3" />
          <span>{displayTime}</span>
        </div>
      </div>

      {/* Dense Metrics Grid */}
      <div className={`grid grid-cols-2 sm:grid-cols-${Math.min(metrics.length, 4)} gap-1.5`}>
        {metrics.map((m, idx) => (
          <div 
            key={idx}
            className={`p-1.5 rounded-lg border text-center shadow-2xs ${
              isDarkMode 
                ? 'bg-slate-800/80 border-slate-700' 
                : 'bg-white border-slate-200'
            }`}
          >
            <div className="text-[9px] font-medium text-slate-500 dark:text-slate-400 truncate">
              {m.label}
            </div>
            <div className={`text-xs sm:text-sm font-black font-mono ${getMetricColor(m.highlight)}`}>
              {typeof m.value === 'number' ? m.value.toLocaleString('en-IN') : m.value}
            </div>
          </div>
        ))}
      </div>

      {/* Dense Done Action Button */}
      <div className="pt-0.5">
        <button
          type="button"
          onClick={onDone}
          className="w-full py-1.5 sm:py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg text-xs transition-all shadow-xs cursor-pointer flex items-center justify-center gap-1.5 active:scale-98"
        >
          <Check className="w-3.5 h-3.5 stroke-[3]" />
          <span>Done</span>
        </button>
      </div>
    </div>
  );
};
