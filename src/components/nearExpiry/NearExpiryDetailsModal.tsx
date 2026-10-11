import React from 'react';
import { X, Calendar, AlertTriangle, Clock, CheckCircle2, ShieldAlert } from 'lucide-react';
import { NearExpiryItem } from '../../types';
import {
  formatDateDDMMYYYY,
  calculateShelfLife,
  formatDisplayDays,
  formatDisplayPct,
  getActionNowLabel,
  evaluateItemStatus
} from '../../utils/nearExpiryEngine';

interface NearExpiryDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: NearExpiryItem | null;
  isDarkMode?: boolean;
}

export const NearExpiryDetailsModal: React.FC<NearExpiryDetailsModalProps> = ({
  isOpen,
  onClose,
  item,
  isDarkMode = false
}) => {
  if (!isOpen || !item) return null;

  const shelfLife = calculateShelfLife(item.mfgDate || item.hoMfgDate, item.expiryDate || item.hoExpiryDate);
  const evaluation = evaluateItemStatus(item);

  // Determine floor status display
  let floorStatusText = 'Not Removed / On Floor';
  let floorBadgeColor = 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
  if (item.floorRemovalStatus === 'REMOVED' || item.floorRemovalRemovedAt) {
    floorStatusText = `Physically Removed on ${item.floorRemovalRemovedAt ? new Date(item.floorRemovalRemovedAt).toLocaleString('en-GB') : 'Unknown'}`;
    floorBadgeColor = 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300';
  } else if (item.floorRemovalStatus === 'SENT' || item.floorRemovalSentAt) {
    floorStatusText = `Sent to Floor Team on ${item.floorRemovalSentAt ? new Date(item.floorRemovalSentAt).toLocaleString('en-GB') : 'Unknown'}`;
    floorBadgeColor = 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300';
  } else if (shelfLife.pendingPct <= 5 || shelfLife.isExpired) {
    floorStatusText = 'Due for Floor Removal (≤ 5% Shelf Life)';
    floorBadgeColor = 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300';
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className={`w-full max-w-lg rounded-2xl border shadow-xl overflow-hidden ${
          isDarkMode
            ? 'bg-slate-900 border-slate-800 text-slate-100'
            : 'bg-white border-slate-200 text-slate-900'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60">
          <div className="min-w-0 pr-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Product Details
            </span>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white break-words">
              {item.itemName || item.hoItemName}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer shrink-0"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Compact Content */}
        <div className="p-3.5 space-y-3 text-xs">
          {/* Identity & Basic Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Bansal Code</span>
              <span className="font-mono font-bold text-slate-900 dark:text-white">
                {item.bansalCode || item.hoBansalCode || 'N/A'}
              </span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Barcode</span>
              <span className="font-mono text-slate-700 dark:text-slate-300">
                {item.barcode || item.hoEanCode || 'N/A'}
              </span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Quantity</span>
              <span className="font-bold text-slate-900 dark:text-white">
                {item.nearExpiryStock ?? item.hoNearExpiryStock ?? 0} units
              </span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block">MRP / Cost</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                ₹{Number(item.mrp || 0).toFixed(2)} / ₹{Number(item.cost || 0).toFixed(2)}
              </span>
            </div>
          </div>

          {/* Shelf Life & Dates */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block">MFG Date</span>
              <span className="font-medium text-slate-800 dark:text-slate-200">
                {formatDateDDMMYYYY(item.mfgDate || item.hoMfgDate) || 'N/A'}
              </span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Expiry Date</span>
              <span className="font-bold text-slate-900 dark:text-white">
                {formatDateDDMMYYYY(item.expiryDate || item.hoExpiryDate)}
              </span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Days Left</span>
              <span
                className={`font-bold ${
                  shelfLife.isExpired
                    ? 'text-rose-600 dark:text-rose-400'
                    : shelfLife.pendingDays <= 5
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-slate-800 dark:text-slate-200'
                }`}
              >
                {formatDisplayDays(shelfLife.pendingDays)}
              </span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Pending %</span>
              <span
                className={`font-bold ${
                  shelfLife.pendingPct <= 5
                    ? 'text-rose-600 dark:text-rose-400'
                    : 'text-slate-800 dark:text-slate-200'
                }`}
              >
                {formatDisplayPct(shelfLife.pendingPct)}
              </span>
            </div>
          </div>

          {/* Floor Removal Status */}
          <div className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700/60 flex flex-col gap-1">
            <span className="text-[10px] uppercase font-bold text-slate-400">Floor Status</span>
            <div className="flex items-center justify-between">
              <span className={`px-2 py-0.5 rounded-md font-bold text-[11px] ${floorBadgeColor}`}>
                {floorStatusText}
              </span>
              {item.returnedToFloorAt && (
                <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold">
                  Returned to floor on {new Date(item.returnedToFloorAt).toLocaleDateString('en-GB')}
                </span>
              )}
            </div>
          </div>

          {/* HO Remark & Interpretation */}
          <div className="p-2.5 rounded-xl border border-indigo-100 dark:border-indigo-900/60 bg-indigo-50/50 dark:bg-indigo-950/30 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold text-indigo-600 dark:text-indigo-400">
                HO Response
              </span>
              <span className="text-[10px] font-bold text-slate-500">
                Status: {item.status || evaluation.status}
              </span>
            </div>

            <div>
              <span className="text-[10px] text-slate-400 block">Original Remark:</span>
              <div className="font-semibold text-slate-900 dark:text-white">
                {item.hoRemark ? `"${item.hoRemark}"` : 'Pending Head Office Response'}
              </div>
            </div>

            {item.hoRemark && (
              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-indigo-100 dark:border-indigo-900/60">
                <div>
                  <span className="text-[10px] text-slate-400 block">Interpreted Action:</span>
                  <span className="font-bold text-indigo-700 dark:text-indigo-300">
                    {getActionNowLabel(item.actionType || evaluation.effectiveActionType || 'PENDING')}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block">Due Condition / Date:</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {evaluation.actionDueFormatted || 'Immediately due upon condition'}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Completion status if completed */}
          {item.completedAt && (
            <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-[11px] flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-bold text-emerald-800 dark:text-emerald-300">
                  HO Action Completed
                </div>
                <div className="text-emerald-700 dark:text-emerald-400">
                  Completed on {new Date(item.completedAt).toLocaleString('en-GB')}
                  {item.notes ? ` • Note: ${item.notes}` : ''}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-slate-200 dark:border-slate-800 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[88px] px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer flex items-center justify-center transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
