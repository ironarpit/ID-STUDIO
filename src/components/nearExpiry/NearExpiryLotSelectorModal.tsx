import React from 'react';
import { X, Layers, Calendar, ChevronRight } from 'lucide-react';
import { NearExpiryItem } from '../../types';
import {
  formatDateDDMMYYYY,
  calculateShelfLife,
  formatDisplayDays,
  formatDisplayPct
} from '../../utils/nearExpiryEngine';

interface NearExpiryLotSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  productName: string;
  barcode: string;
  bansalCode: string;
  items: NearExpiryItem[];
  onSelectLot: (item: NearExpiryItem) => void;
  isDarkMode?: boolean;
}

export const NearExpiryLotSelectorModal: React.FC<NearExpiryLotSelectorModalProps> = ({
  isOpen,
  onClose,
  productName,
  barcode,
  bansalCode,
  items,
  onSelectLot,
  isDarkMode = false
}) => {
  if (!isOpen || items.length === 0) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className={`w-full max-w-md rounded-2xl border shadow-xl overflow-hidden ${
          isDarkMode
            ? 'bg-slate-900 border-slate-800 text-slate-100'
            : 'bg-white border-slate-200 text-slate-900'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-3.5 border-b border-slate-200 dark:border-slate-800 bg-amber-50 dark:bg-amber-950/40">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-1.5 text-xs font-bold text-amber-800 dark:text-amber-300">
                <Layers className="w-4 h-4" />
                <span>Multiple Expiry Lots Found</span>
              </div>
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-white mt-1 leading-tight">
                {productName}
              </h3>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Code: {bansalCode} • Barcode: {barcode}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-[11px] text-amber-900/80 dark:text-amber-300/80 mt-2 font-medium">
            Please select the specific lot/expiry date matching the item in hand:
          </p>
        </div>

        {/* Lot Options */}
        <div className="p-3 space-y-2 max-h-72 overflow-y-auto">
          {items.map((item, idx) => {
            const shelf = calculateShelfLife(item.mfgDate, item.expiryDate);
            const isRemoved = Boolean(item.floorRemovalRemovedAt || item.floorRemovalStatus === 'REMOVED');
            const isSent = Boolean(item.floorRemovalSentAt || item.floorRemovalStatus === 'SENT');

            let statusLabel = 'On Floor';
            let statusColor = 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
            if (isRemoved) {
              statusLabel = 'Removed';
              statusColor = 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300';
            } else if (isSent) {
              statusLabel = 'Sent';
              statusColor = 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300';
            } else if (shelf.pendingPct <= 5 || shelf.isExpired) {
              statusLabel = 'Due Today';
              statusColor = 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300';
            }

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onSelectLot(item);
                  onClose();
                }}
                className={`w-full text-left p-3 rounded-xl border text-xs flex items-center justify-between gap-3 transition-all cursor-pointer ${
                  isDarkMode
                    ? 'bg-slate-800/60 border-slate-700/80 hover:bg-slate-800 hover:border-indigo-500'
                    : 'bg-white border-slate-200 hover:bg-slate-50 hover:border-indigo-500 shadow-2xs'
                }`}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-sm text-slate-900 dark:text-white">
                      Expiry: {formatDateDDMMYYYY(item.expiryDate)}
                    </span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${statusColor}`}>
                      {statusLabel}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                    <span>Qty: <strong className="text-slate-700 dark:text-slate-200">{item.nearExpiryStock}</strong></span>
                    <span>•</span>
                    <span>Left: <strong className={shelf.isExpired ? 'text-rose-600' : 'text-slate-700 dark:text-slate-200'}>{formatDisplayDays(shelf.pendingDays)}</strong> ({formatDisplayPct(shelf.pendingPct)})</span>
                    {item.mfgDate && (
                      <>
                        <span>•</span>
                        <span>MFG: {formatDateDDMMYYYY(item.mfgDate)}</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="p-1 rounded-lg bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 shrink-0">
                  <ChevronRight className="w-4 h-4" />
                </div>
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="p-2.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
