import React from 'react';
import { Scan, History } from 'lucide-react';
import { ScannerContextMode } from '../../utils/hardwareScanner';

interface ScannerModeIndicatorProps {
  mode: ScannerContextMode;
  recentScanCount: number;
  onOpenHistory: () => void;
  isDarkMode?: boolean;
}

export const ScannerModeIndicator: React.FC<ScannerModeIndicatorProps> = ({
  mode,
  recentScanCount,
  onOpenHistory,
  isDarkMode = false
}) => {
  const modeConfig = {
    floor_audit: {
      label: 'Scanner: Floor Audit',
      dotColor: 'bg-emerald-500',
      textColor: isDarkMode ? 'text-emerald-300' : 'text-emerald-700',
      bgColor: isDarkMode ? 'bg-emerald-950/70 border-emerald-800/60' : 'bg-emerald-50 border-emerald-200',
    },
    focus_iq: {
      label: 'Scanner: Focus IQ',
      dotColor: 'bg-indigo-500',
      textColor: isDarkMode ? 'text-indigo-300' : 'text-indigo-700',
      bgColor: isDarkMode ? 'bg-indigo-950/70 border-indigo-800/60' : 'bg-indigo-50 border-indigo-200',
    },
    global_search: {
      label: 'Scanner: Product Search',
      dotColor: 'bg-blue-500',
      textColor: isDarkMode ? 'text-blue-300' : 'text-blue-700',
      bgColor: isDarkMode ? 'bg-slate-900/90 border-slate-750' : 'bg-white border-slate-200',
    },
  }[mode];

  return (
    <div className="inline-flex items-center gap-1.5 select-none">
      <button
        type="button"
        onClick={onOpenHistory}
        title={`Hardware Barcode Scanner Active (${modeConfig.label}). Tap to view recent scans.`}
        className={`flex items-center gap-1.5 px-2 py-1 rounded-full border text-[11px] font-bold shadow-2xs transition-all hover:scale-105 active:scale-95 cursor-pointer ${modeConfig.bgColor} ${modeConfig.textColor}`}
      >
        <span className="relative flex h-2 w-2">
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${modeConfig.dotColor}`} />
          <span className={`relative inline-flex rounded-full h-2 w-2 ${modeConfig.dotColor}`} />
        </span>

        <Scan className="w-3 h-3 shrink-0" />
        <span className="whitespace-nowrap font-sans">{modeConfig.label}</span>

        {recentScanCount > 0 && (
          <span className="ml-0.5 px-1 py-0.2 rounded-full bg-black/10 dark:bg-white/10 text-[9px] font-mono font-black flex items-center gap-0.5">
            <History className="w-2.5 h-2.5" />
            {recentScanCount}
          </span>
        )}
      </button>
    </div>
  );
};
