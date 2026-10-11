import React, { useState, useEffect } from 'react';
import {
  Flag,
  CheckCircle2,
  Search,
  ArrowLeft,
  Clock,
  MapPin,
  Eye,
  RefreshCw,
  Tag,
  AlertTriangle,
  FileText,
  Check,
  Package,
  Copy
} from 'lucide-react';
import { AuditProductResult, AuditSession } from '../../types';
import { getFlaggedItems, resolveFlaggedItem, loadAllSessions } from '../../utils/auditStorage';
import { getAllFlaggedResultsDB } from '../../utils/indexedDB';
import { formatFloorAuditResultsText, formatSingleProductResultText, copyToClipboard } from '../../utils/copyUtils';
import { cleanDateOnly } from '../../utils/fileParser';

interface FlaggedFollowUpViewProps {
  selectedStoreId: string;
  isDarkMode?: boolean;
  onBackToHub: () => void;
}

export const FlaggedFollowUpView: React.FC<FlaggedFollowUpViewProps> = ({
  selectedStoreId,
  isDarkMode,
  onBackToHub,
}) => {
  const [flaggedItems, setFlaggedItems] = useState<AuditProductResult[]>([]);
  const [sessionMap, setSessionMap] = useState<Record<string, AuditSession>>({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'unresolved' | 'resolved'>('unresolved');

  // Resolving state modal/inline
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [resolutionRemark, setResolutionRemark] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [copiedItemId, setCopiedItemId] = useState<string | null>(null);

  const handleCopyItems = async () => {
    const title = viewMode === 'unresolved' ? 'Action Required Follow-Up' : 'Resolved Follow-Up';
    const text = formatFloorAuditResultsText(filteredItems, viewMode === 'unresolved' ? 'flagged' : 'all', title);
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopyFeedback(`Copied (${filteredItems.length})`);
      setTimeout(() => setCopyFeedback(null), 2500);
    }
  };

  useEffect(() => {
    loadAllSessions(selectedStoreId).then((sessions) => {
      const map: Record<string, AuditSession> = {};
      sessions.forEach((s) => {
        map[s.id] = s;
      });
      setSessionMap(map);
    });
  }, [selectedStoreId]);

  const getAuditTypeLabel = (auditId: string): string => {
    const s = sessionMap[auditId];
    if (!s) return 'Floor Audit';
    switch (s.type) {
      case 'top_100': return 'Full Floor Audit';
      case 'zero_sales': return 'Zero Sales Audit';
      case 'category': return s.categoryFilter ? `Category: ${s.categoryFilter}` : 'Category Audit';
      case 'random': return 'Random Sampling';
      case 'shelf_board': return 'Shelf & Price Board Audit';
      case 'low_stock': return 'Low Stock Audit';
      case 'out_of_stock': return 'Out of Stock Audit';
      case 'overstock': return 'Overstock Audit';
      case 'dead_stock': return 'Dead Stock Audit';
      default: return s.title || 'Floor Audit';
    }
  };

  const fetchFlagged = async () => {
    setLoading(true);
    try {
      const all = await getFlaggedItems(selectedStoreId, true);
      if (viewMode === 'unresolved') {
        setFlaggedItems(all.filter((r) => r.status === 'flagged'));
      } else {
        setFlaggedItems(all.filter((r) => r.status === 'resolved'));
      }
    } catch (err) {
      console.error('Failed to load flagged items:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFlagged();
  }, [selectedStoreId, viewMode]);

  const handleResolveSubmit = async (resultId: string) => {
    if (!resolutionRemark.trim()) {
      alert('Please enter a short resolution remark before confirming.');
      return;
    }
    setIsSubmitting(true);
    try {
      await resolveFlaggedItem(resultId, resolutionRemark.trim());
      setResolvingId(null);
      setResolutionRemark('');
      await fetchFlagged();
    } catch (err) {
      console.error('Error resolving flagged item:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredItems = flaggedItems.filter((item) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    const bansalCode = item.bansalCode || item.code || item.localCode || '';
    return (
      item.productName.toLowerCase().includes(term) ||
      item.barcode.toLowerCase().includes(term) ||
      bansalCode.toLowerCase().includes(term) ||
      (item.issueReason && item.issueReason.toLowerCase().includes(term)) ||
      (item.category && item.category.toLowerCase().includes(term))
    );
  });

  return (
    <div className="space-y-4 pb-16 max-w-5xl mx-auto">
      {/* Top Banner & Queue Header */}
      <div className={`p-4 sm:p-5 rounded-2xl border transition-all ${
        isDarkMode ? 'bg-slate-900 border-slate-800 text-slate-100 shadow-xs' : 'bg-white border-slate-200 text-slate-900 shadow-xs'
      }`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onBackToHub}
              className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-slate-600 dark:text-slate-300 cursor-pointer"
              title="Return to Hub"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>

            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-bold tracking-tight text-slate-900 dark:text-white">
                  Flagged Follow-Up Queue
                </h1>
                <span className={`px-2 py-0.5 text-[10px] font-bold rounded-md border ${
                  viewMode === 'unresolved'
                    ? 'bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800'
                    : 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                }`}>
                  {filteredItems.length} {viewMode === 'unresolved' ? 'Unresolved Flags' : 'Resolved'}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                Manager action queue for shop floor discrepancies & resolution tracking
              </p>
            </div>
          </div>

          {/* Toggle Unresolved vs Resolved + Copy Button */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleCopyItems}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-xs transition-all active:scale-95 cursor-pointer"
              title="Copy current flagged items list to clipboard"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>{copyFeedback || 'Copy List'}</span>
            </button>

            <div className="flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setViewMode('unresolved')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  viewMode === 'unresolved'
                    ? 'bg-rose-600 text-white shadow-xs font-bold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Unresolved Flagged
              </button>
              <button
                type="button"
                onClick={() => setViewMode('resolved')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  viewMode === 'resolved'
                    ? 'bg-emerald-600 text-white shadow-xs font-bold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Resolved History
              </button>
            </div>
          </div>
        </div>

        {/* Search Bar */}
        <div className="mt-3.5 relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search flagged queue by product name, barcode, Bansal code, or issue..."
            className={`w-full pl-9 pr-3.5 py-2 rounded-xl border text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
              isDarkMode ? 'bg-slate-800/80 border-slate-700 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'
            }`}
          />
        </div>
      </div>

      {/* Flagged Items List */}
      {filteredItems.length === 0 ? (
        <div className={`p-8 text-center rounded-2xl border ${
          isDarkMode ? 'bg-slate-900 border-slate-800 text-slate-400' : 'bg-white border-slate-200 text-slate-600'
        } shadow-xs`}>
          <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2 opacity-80" />
          <h3 className="font-bold text-sm text-slate-900 dark:text-white">No {viewMode} flagged items</h3>
          <p className="text-xs text-slate-500 mt-1">
            {viewMode === 'unresolved'
              ? 'All floor audit flags for this store have been resolved.'
              : 'No resolved history recorded yet.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredItems.map((item) => (
            <div
              key={item.id}
              className={`p-4 sm:p-4.5 rounded-xl border transition-all ${
                isDarkMode ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900 shadow-xs'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="space-y-1 min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {/* Status Badge: Red for Flagged, Green for Resolved */}
                    <span className={`px-2 py-0.5 text-[10px] font-bold rounded-md border ${
                      item.status === 'resolved'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
                        : 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800'
                    }`}>
                      {item.status === 'resolved' ? '✓ Resolved' : '🚩 Unresolved Flag'}
                    </span>

                    <span className="px-2 py-0.5 text-[10px] font-semibold rounded-md bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/60">
                      Audit: {getAuditTypeLabel(item.auditId)}
                    </span>

                    {item.issueReason && (
                      <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-rose-50 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                        Issue: {item.issueReason}
                      </span>
                    )}

                    {item.category && (
                      <span className="px-2 py-0.5 text-[10px] font-medium rounded-md bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        {item.category}
                      </span>
                    )}
                  </div>

                  <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white truncate">
                    {item.productName}
                  </h3>

                  <div className="text-xs font-mono text-slate-600 dark:text-slate-300 flex items-center gap-3 flex-wrap">
                    <span>Barcode: <strong className="text-indigo-600 dark:text-indigo-400 font-bold">{item.barcode || 'N/A'}</strong></span>
                    <span>•</span>
                    <span>Bansal Code: <strong className="text-slate-800 dark:text-slate-200 font-bold">{item.bansalCode || item.code || item.localCode || 'N/A'}</strong></span>
                    {item.lastPurchaseDate && (
                      <>
                        <span>•</span>
                        <span className="font-sans text-slate-500">Last Purchase: <strong>{cleanDateOnly(item.lastPurchaseDate)}</strong></span>
                      </>
                    )}
                    <span>•</span>
                    <span className="font-sans text-slate-500">Audit Date: <strong>{item.checkedDate || (item.flaggedAt ? new Date(item.flaggedAt).toLocaleDateString() : 'N/A')}</strong></span>
                  </div>
                </div>

                {/* Stock & Price Pill + Quick Copy */}
                <div className="flex items-center gap-2 self-start shrink-0">
                  <button
                    type="button"
                    onClick={async () => {
                      const text = formatSingleProductResultText(item);
                      const ok = await copyToClipboard(text);
                      if (ok) {
                        setCopiedItemId(item.id);
                        setTimeout(() => setCopiedItemId(null), 2000);
                      }
                    }}
                    className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors flex items-center gap-1 cursor-pointer text-xs font-semibold"
                    title="Copy details of this item to clipboard"
                  >
                    {copiedItemId === item.id ? (
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    <span className="hidden sm:inline">{copiedItemId === item.id ? 'Copied' : 'Copy'}</span>
                  </button>

                  <div className="flex items-center gap-3 text-xs bg-slate-50 dark:bg-slate-800/60 px-3 py-2 rounded-xl border border-slate-100 dark:border-slate-800">
                    <div>
                      <span className="text-[10px] font-semibold text-slate-400 block">Stock</span>
                      <span className="font-bold text-slate-900 dark:text-white">{item.stock ?? 0}</span>
                    </div>
                    <div className="w-px h-5 bg-slate-200 dark:bg-slate-700" />
                    <div>
                      <span className="text-[10px] font-semibold text-slate-400 block">Retail Price</span>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">₹{item.retailPrice ?? 0}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Observed Floor Details */}
              <div className="mt-3 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                <div>
                  <span className="text-[10px] font-semibold text-slate-400 block flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-indigo-500" /> Location
                  </span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {item.locationStatus ? item.locationStatus.replace('_', ' ') : 'Not Recorded'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-semibold text-slate-400 block flex items-center gap-1">
                    <Eye className="w-3 h-3 text-indigo-500" /> Display
                  </span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {item.displayPosition ? item.displayPosition.replace('_', ' ') : 'Not Recorded'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-semibold text-slate-400 block flex items-center gap-1">
                    <RefreshCw className="w-3 h-3 text-indigo-500" /> Refill
                  </span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {item.refillStatus ? item.refillStatus.replace('_', ' ') : 'Not Recorded'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-semibold text-slate-400 block flex items-center gap-1">
                    <Tag className="w-3 h-3 text-indigo-500" /> Board Status
                  </span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {item.boardStatus ? item.boardStatus.replace('_', ' ') : 'Not Recorded'}
                  </span>
                </div>
              </div>

              {/* Original Remark */}
              {item.remark && (
                <div className="mt-2 text-xs text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/60 p-2.5 rounded-lg border border-slate-200/80 dark:border-slate-800">
                  <span className="font-bold text-slate-900 dark:text-white">Original Remark:</span> {item.remark}
                </div>
              )}

              {/* Resolution Remark & Resolved Date/Time if Resolved */}
              {item.status === 'resolved' && (
                <div className="mt-2.5 text-xs bg-emerald-50 dark:bg-emerald-950/30 p-2.5 rounded-lg border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 space-y-1">
                  <div className="font-bold flex items-center gap-1.5 flex-wrap">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span>Status: Resolved</span>
                    <span>•</span>
                    <span>Resolved At: {item.resolvedAt ? new Date(item.resolvedAt).toLocaleString() : 'N/A'}</span>
                  </div>
                  <div><span className="font-bold">Resolution Note:</span> {item.resolutionRemark || 'Issue resolved.'}</div>
                </div>
              )}

              {/* Action: Mark Resolved (Only for unresolved) */}
              {item.status === 'flagged' && (
                <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                  <span className="text-[11px] text-slate-400 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    Flagged: {item.flaggedAt ? new Date(item.flaggedAt).toLocaleString() : (item.checkedAt ? new Date(item.checkedAt).toLocaleString() : 'N/A')}
                  </span>

                  {resolvingId === item.id ? (
                    <div className="flex-1 space-y-2">
                      <input
                        type="text"
                        value={resolutionRemark}
                        onChange={(e) => setResolutionRemark(e.target.value)}
                        placeholder="Resolution remark (e.g. Refilled 10 units on floor, corrected price tag)..."
                        className={`w-full px-3 py-1.5 rounded-lg border text-xs ${
                          isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'
                        } focus:outline-none focus:ring-1 focus:ring-indigo-500`}
                        autoFocus
                      />
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setResolvingId(null)}
                          className="px-3 py-1 rounded-lg border text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => handleResolveSubmit(item.id)}
                          disabled={isSubmitting}
                          className="px-3.5 py-1 rounded-lg bg-indigo-600 text-white text-xs font-bold shadow-2xs hover:bg-indigo-700 cursor-pointer"
                        >
                          Confirm Resolution
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setResolvingId(item.id)}
                      className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-2xs transition-all cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Resolve Flag</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
