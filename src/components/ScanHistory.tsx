import React from 'react';
import { History, ArrowRight, Trash2, CheckCircle2, AlertCircle } from 'lucide-react';
import { ScanHistoryItem } from '../types';

interface ScanHistoryProps {
  history: ScanHistoryItem[];
  onSelectBarcode: (barcode: string) => void;
  onClearHistory: () => void;
  activeBarcode?: string;
}

export const ScanHistory: React.FC<ScanHistoryProps> = ({
  history,
  onSelectBarcode,
  onClearHistory,
  activeBarcode
}) => {
  if (history.length === 0) return null;

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-1.5 shadow-2xs flex items-center gap-2 overflow-hidden">
      <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 shrink-0">
        <History className="w-3 h-3 text-indigo-600" />
        <span className="hidden sm:inline">Recent</span>
      </div>

      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar flex-1 py-0.5">
        {history.map((item, index) => {
          const isActive = activeBarcode === item.barcode;
          const uniqueKey = item.id ? `${item.id}-${index}` : `scan-${item.barcode || 'item'}-${index}`;
          return (
            <button
              key={uniqueKey}
              onClick={() => onSelectBarcode(item.barcode)}
              className={`shrink-0 px-2 py-0.5 rounded border text-left transition-all cursor-pointer flex items-center gap-1 text-[11px] ${
                isActive
                  ? 'bg-indigo-50 border-indigo-300 text-indigo-900 font-bold shadow-2xs'
                  : 'bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-700'
              }`}
            >
              {item.found ? (
                <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="w-2.5 h-2.5 text-rose-600 shrink-0" />
              )}
              <span className="truncate max-w-[100px]">{item.productName || item.barcode}</span>
            </button>
          );
        })}
      </div>

      <button
        onClick={onClearHistory}
        className="text-[10px] text-slate-400 hover:text-rose-600 p-0.5 shrink-0 cursor-pointer"
        title="Clear history"
      >
        <Trash2 className="w-3 h-3" />
      </button>
    </div>
  );
};
