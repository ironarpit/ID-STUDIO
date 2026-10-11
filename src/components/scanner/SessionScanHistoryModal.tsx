import React from 'react';
import { X, Trash2, Clock, CheckCircle2, AlertTriangle, XCircle, Scan, Tag } from 'lucide-react';
import { SessionScanItem } from '../../utils/hardwareScanner';
import { useModalTransition } from '../../utils/useModalTransition';

interface SessionScanHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  scans: SessionScanItem[];
  onClear: () => void;
  isDarkMode?: boolean;
}

export const SessionScanHistoryModal: React.FC<SessionScanHistoryModalProps> = ({
  isOpen,
  onClose,
  scans,
  onClear,
  isDarkMode = false
}) => {
  const { handleClose, backdropClass, panelClass } = useModalTransition({
    onClose,
    isOpen,
    duration: 170
  });

  if (!isOpen) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs ${backdropClass}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div
        className={`w-full max-w-lg rounded-2xl border shadow-2xl overflow-hidden flex flex-col max-h-[85vh] mobile-bottom-sheet ${panelClass} ${
          isDarkMode ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        {/* Modal Header */}
        <div className="p-3.5 sm:p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
              <Scan className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-black">Recent Scans</h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Current session only · Max 10 scans
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {scans.length > 0 && (
              <button
                type="button"
                onClick={onClear}
                className="px-2.5 py-1.5 rounded-lg text-xs font-bold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors flex items-center gap-1 cursor-pointer"
                title="Clear current session history"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors cursor-pointer min-w-[36px] min-h-[36px] flex items-center justify-center"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scans List */}
        <div className="p-3 sm:p-4 overflow-y-auto space-y-2 flex-1">
          {scans.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs font-medium rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
              No scans recorded in this session yet.
              <p className="mt-1 text-[11px] text-slate-400">
                Trigger your NETUM Bluetooth scanner or use camera to see history here.
              </p>
            </div>
          ) : (
            scans.map((scan) => {
              const isMatched = scan.result === 'MATCHED' || scan.result === 'FOUND';
              const isWarning = scan.result === 'NOT_IN_AUDIT' || scan.result === 'NOT_IN_FOCUS';
              const isError = scan.result === 'NOT_FOUND';

              return (
                <div
                  key={scan.id}
                  className={`p-2.5 rounded-xl border transition-all flex items-start justify-between gap-2.5 ${
                    isMatched
                      ? 'bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/60'
                      : isWarning
                      ? 'bg-amber-50/40 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/60'
                      : 'bg-rose-50/40 dark:bg-rose-950/20 border-rose-200 dark:border-rose-800/60'
                  }`}
                >
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded border ${
                          isMatched
                            ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/60 dark:text-emerald-300 dark:border-emerald-700'
                            : isWarning
                            ? 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/60 dark:text-amber-300 dark:border-amber-700'
                            : 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-900/60 dark:text-rose-300 dark:border-rose-700'
                        }`}
                      >
                        {scan.result.replace(/_/g, ' ')}
                      </span>

                      {scan.bansalCode && (
                        <span className="text-[10px] font-mono font-bold text-slate-600 dark:text-slate-300 flex items-center gap-0.5">
                          <Tag className="w-2.5 h-2.5" />
                          Code: {scan.bansalCode}
                        </span>
                      )}

                      <span className="text-[10px] font-mono text-slate-400 ml-auto flex items-center gap-0.5">
                        <Clock className="w-2.5 h-2.5" />
                        {scan.timestamp}
                      </span>
                    </div>

                    <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                      {scan.productName || 'Unknown SKU'}
                    </p>

                    <p className="text-[10px] font-mono text-slate-500 dark:text-slate-400 flex items-center gap-1">
                      <Scan className="w-2.5 h-2.5" />
                      {scan.barcode}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-850 flex items-center justify-between text-[11px] text-slate-500 shrink-0">
          <span>Target Mode: Hardware NETUM Bluetooth HID</span>
          <button
            type="button"
            onClick={handleClose}
            className="px-3 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
