import React, { useState, useEffect, useMemo } from 'react';
import {
  Flag,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  ArrowLeft,
  Share2,
  Download,
  AlertCircle,
  RefreshCw,
  ShoppingBag,
  Layers,
  Check,
  RotateCcw,
  Tag
} from 'lucide-react';
import * as XLSX from 'xlsx';
import {
  FocusType,
  FocusMaster,
  Product,
  PhysicalFocusCheckSession,
  PhysicalCheckItemResult
} from '../../types';
import {
  loadAllPhysicalFocusChecks,
  savePhysicalFocusCheck
} from '../../utils/focusStorage';
import { normalizeFocusCode, parseFocusOffer } from '../../utils/focusMatcher';

interface FlaggedIssueItem {
  session: PhysicalFocusCheckSession;
  item: PhysicalCheckItemResult;
  stockProd?: Product;
}

interface FocusFlaggedIssuesViewProps {
  coreMaster: FocusMaster | null;
  nonCoreMaster: FocusMaster | null;
  stockProducts: Product[];
  storeId?: string;
  isDarkMode?: boolean;
  onBack: () => void;
  showToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

export const FocusFlaggedIssuesView: React.FC<FocusFlaggedIssuesViewProps> = ({
  coreMaster,
  nonCoreMaster,
  stockProducts,
  storeId = 'store_1',
  isDarkMode = false,
  onBack,
  showToast
}) => {
  const [sessions, setSessions] = useState<PhysicalFocusCheckSession[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Filters
  const [selectedType, setSelectedType] = useState<'all' | 'core' | 'non_core'>('all');
  const [statusFilter, setStatusFilter] = useState<'open' | 'resolved' | 'all'>('open');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Editing resolution remark inline
  const [resolutionRemarks, setResolutionRemarks] = useState<Record<string, string>>({});

  // High performance lookup map for Live Stock IQ data
  const stockLookup = useMemo(() => {
    const map = new Map<string, Product>();
    for (const p of stockProducts) {
      if (p.code) map.set(normalizeFocusCode(p.code), p);
      if (p.localCode) map.set(normalizeFocusCode(p.localCode), p);
      if (p.bansalCode) map.set(normalizeFocusCode(p.bansalCode), p);
    }
    return map;
  }, [stockProducts]);

  // Load all sessions & extract flagged items
  const loadData = async () => {
    setIsLoading(true);
    try {
      const all = await loadAllPhysicalFocusChecks(storeId);
      setSessions(all);
    } catch (e) {
      console.warn('Error loading sessions for flagged issues:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [storeId]);

  // Aggregate all FLAGGED items across sessions
  const flaggedItemsList = useMemo(() => {
    const list: FlaggedIssueItem[] = [];

    sessions.forEach((s) => {
      if (selectedType !== 'all' && s.type !== selectedType) return;

      (Object.values(s.results || {}) as PhysicalCheckItemResult[]).forEach((res) => {
        if (res && res.status === 'FLAGGED') {
          const normCode = normalizeFocusCode(res.code);
          const stockProd = stockLookup.get(normCode);
          list.push({
            session: s,
            item: res,
            stockProd
          });
        }
      });
    });

    return list;
  }, [sessions, selectedType, stockLookup]);

  // Apply status & search filters
  const filteredList = useMemo(() => {
    return flaggedItemsList.filter(({ item }) => {
      // Status filter
      const isResolved = Boolean(item.isResolved);
      if (statusFilter === 'open' && isResolved) return false;
      if (statusFilter === 'resolved' && !isResolved) return false;

      // Search term
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase().trim();
        const matchesCode = item.code.toLowerCase().includes(term);
        const matchesName = item.productName.toLowerCase().includes(term);
        const matchesRemark = item.remark?.toLowerCase().includes(term) || false;
        const matchesPreset = item.issuePreset?.toLowerCase().includes(term) || false;
        if (!matchesCode && !matchesName && !matchesRemark && !matchesPreset) return false;
      }

      return true;
    });
  }, [flaggedItemsList, statusFilter, searchTerm]);

  // Resolve an issue
  const handleResolveIssue = async (session: PhysicalFocusCheckSession, code: string) => {
    const key = `${session.id}_${code}`;
    const remark = resolutionRemarks[key] || 'Resolved on floor';

    const existingResult = session.results[code];
    if (!existingResult) return;

    const updatedResult: PhysicalCheckItemResult = {
      ...existingResult,
      isResolved: true,
      resolutionRemark: remark.trim(),
      resolvedAt: new Date().toISOString()
    };

    const updatedSession: PhysicalFocusCheckSession = {
      ...session,
      results: {
        ...session.results,
        [code]: updatedResult
      }
    };

    await savePhysicalFocusCheck(updatedSession);

    // Update local state
    setSessions((prev) =>
      prev.map((s) => (s.id === session.id ? updatedSession : s))
    );

    if (showToast) showToast(`Issue for [${code}] marked RESOLVED`, 'success');
  };

  // Re-open a resolved issue
  const handleReopenIssue = async (session: PhysicalFocusCheckSession, code: string) => {
    const existingResult = session.results[code];
    if (!existingResult) return;

    const updatedResult: PhysicalCheckItemResult = {
      ...existingResult,
      isResolved: false,
      resolutionRemark: undefined,
      resolvedAt: undefined
    };

    const updatedSession: PhysicalFocusCheckSession = {
      ...session,
      results: {
        ...session.results,
        [code]: updatedResult
      }
    };

    await savePhysicalFocusCheck(updatedSession);

    setSessions((prev) =>
      prev.map((s) => (s.id === session.id ? updatedSession : s))
    );

    if (showToast) showToast(`Issue for [${code}] re-opened`, 'info');
  };

  // Export Flagged Issues Excel
  const handleExportExcel = () => {
    const doExport = () => {
      try {
        const rows = filteredList.map(({ session, item, stockProd }, idx) => {
          const normCode = normalizeFocusCode(item.code);
          const focusOfferText = item.focusOffer || '';
          const applicableMrp = (stockProd?.mrp && stockProd.mrp > 0) ? stockProd.mrp : (item.focusMrp || 0);
          const parsed = parseFocusOffer(focusOfferText, applicableMrp);

          return {
            'S.No': idx + 1,
            'Focus Type': session.type === 'core' ? 'CORE' : 'NON-CORE',
            'Active Month': session.monthDisplay,
            'Product Code': normCode,
            'Product Name': item.productName,
            Category: item.category || 'General',
            Brand: item.brand || 'General',
            'Focus Offer': focusOfferText || '—',
            'Expected SP': parsed.expectedRetail !== null && !isNaN(parsed.expectedRetail) ? `₹${parsed.expectedRetail}` : '—',
            'Current SP': stockProd?.retailPrice !== undefined ? `₹${stockProd.retailPrice}` : '—',
            'Scan Verification': item.scanVerified ? `VERIFIED (${item.verifiedBarcode})` : item.scanError ? `WRONG PRODUCT (${item.scannedBarcode})` : 'NOT SCANNED',
            'On Floor': item.onFloor || 'NO',
            'Display / Facing': item.displayFacing || 'NEED_REFILL',
            'Focus Board': item.focusBoard || 'INCORRECT',
            'Issue Reason / Preset': item.issuePreset || item.remark || 'Flagged Issue',
            'Original Remark': item.remark || '—',
            'Resolution Status': item.isResolved ? 'RESOLVED' : 'OPEN',
            'Resolution Remark': item.resolutionRemark || '—',
            'Resolved At': item.resolvedAt ? new Date(item.resolvedAt).toLocaleString() : '—'
          };
        });

        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Flagged_Issues');
        XLSX.writeFile(wb, `Focus_IQ_Flagged_Issues_${new Date().toISOString().slice(0, 10)}.xlsx`);

        if (showToast) showToast('Flagged issues Excel report exported.', 'success');
      } catch (e) {
        console.error('Export error:', e);
        if (showToast) showToast('Failed to export Excel report.', 'error');
      }
    };

    doExport();
  };

  // WhatsApp Summary Copy
  const handleCopyWhatsApp = async () => {
    const openItems = flaggedItemsList.filter(({ item }) => !item.isResolved);
    const resolvedItems = flaggedItemsList.filter(({ item }) => item.isResolved);

    const lines = [
      `*FOCUS IQ — FLAGGED ISSUES ACTION REPORT*`,
      `*Total Flagged:* ${flaggedItemsList.length}`,
      `*Open Issues:* ${openItems.length}`,
      `*Resolved:* ${resolvedItems.length}`,
      `---------------------------------`,
      `*OPEN FLAGGED ISSUES:*`
    ];

    if (openItems.length === 0) {
      lines.push('✅ All flagged issues have been resolved!');
    } else {
      openItems.forEach(({ session, item }, idx) => {
        lines.push(
          `${idx + 1}. *[${session.type.toUpperCase()}] [${item.code}] ${item.productName}*`,
          `   • Month: ${session.monthDisplay}`,
          `   • Issue: ${item.issuePreset || item.remark || 'Flagged'}`,
          `   • Floor: ${item.onFloor} | Facing: ${item.displayFacing} | Board: ${item.focusBoard}`,
          item.remark ? `   • Remark: ${item.remark}` : ''
        );
      });
    }

    lines.push(`\n_Generated via Bansal POS & Focus IQ Platform_`);

    try {
      await navigator.clipboard.writeText(lines.filter(Boolean).join('\n'));
      if (showToast) showToast('WhatsApp Flagged Issues report copied!', 'success');
    } catch {
      if (showToast) showToast('Failed to copy to clipboard.', 'error');
    }
  };

  const openCount = flaggedItemsList.filter(({ item }) => !item.isResolved).length;
  const resolvedCount = flaggedItemsList.filter(({ item }) => item.isResolved).length;

  return (
    <div className={`h-full flex flex-col overflow-hidden ${isDarkMode ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
      {/* Top Banner */}
      <div className={`px-4 sm:px-6 py-3 border-b shrink-0 flex items-center justify-between gap-3 ${
        isDarkMode ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200 shadow-xs'
      }`}>
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onBack}
            className={`p-2 rounded-xl border transition-all cursor-pointer ${
              isDarkMode ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300' : 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700'
            }`}
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-800">
                STAGE 5 • FLAGGED FOLLOW-UP
              </span>
            </div>
            <h1 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white truncate">
              FLAGGED ISSUES RESOLUTION HUB
            </h1>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleCopyWhatsApp}
            className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-xs"
          >
            <Share2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">WhatsApp Report</span>
          </button>

          <button
            onClick={handleExportExcel}
            className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Download Excel</span>
          </button>
        </div>
      </div>

      {/* Filter & Metric Bar */}
      <div className={`px-4 sm:px-6 py-3 border-b shrink-0 ${
        isDarkMode ? 'bg-slate-900/60 border-slate-800' : 'bg-slate-50 border-slate-200'
      }`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Status Metric Tabs */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setStatusFilter('open')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center gap-1.5 ${
                statusFilter === 'open'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : isDarkMode ? 'bg-slate-800 text-slate-400 hover:bg-slate-700' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}
            >
              <AlertCircle className="w-3.5 h-3.5" />
              <span>OPEN ISSUES ({openCount})</span>
            </button>

            <button
              onClick={() => setStatusFilter('resolved')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center gap-1.5 ${
                statusFilter === 'resolved'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : isDarkMode ? 'bg-slate-800 text-slate-400 hover:bg-slate-700' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>RESOLVED ({resolvedCount})</span>
            </button>

            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
                statusFilter === 'all'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : isDarkMode ? 'bg-slate-800 text-slate-400 hover:bg-slate-700' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}
            >
              <span>ALL ({flaggedItemsList.length})</span>
            </button>
          </div>

          {/* Type Selector & Search Input */}
          <div className="flex items-center gap-2 flex-1 max-w-md">
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value as any)}
              className={`px-3 py-1.5 rounded-xl border text-xs font-bold cursor-pointer shrink-0 ${
                isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'
              }`}
            >
              <option value="all">CORE & NON-CORE</option>
              <option value="core">CORE FOCUS ONLY</option>
              <option value="non_core">NON-CORE FOCUS ONLY</option>
            </select>

            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search code, product, remark..."
                className={`w-full pl-8 pr-3 py-1.5 rounded-xl border text-xs font-medium ${
                  isDarkMode ? 'bg-slate-800 border-slate-700 text-white placeholder:text-slate-500' : 'bg-white border-slate-200 text-slate-800 placeholder:text-slate-400'
                }`}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Main Flagged Cards List */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3">
        {isLoading ? (
          <div className="p-8 text-center text-slate-400 font-bold text-xs flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-indigo-500" />
            <span>Loading flagged issues...</span>
          </div>
        ) : filteredList.length === 0 ? (
          <div className={`p-8 rounded-2xl border text-center ${
            isDarkMode ? 'bg-slate-900/60 border-slate-800' : 'bg-white border-slate-200 shadow-xs'
          }`}>
            <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3 opacity-60" />
            <h3 className="text-base font-black text-slate-800 dark:text-slate-200">
              No {statusFilter === 'open' ? 'Open' : statusFilter === 'resolved' ? 'Resolved' : ''} Flagged Issues
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              All physical floor checks are clean or match the selected filters.
            </p>
          </div>
        ) : (
          filteredList.map(({ session, item, stockProd }) => {
            const normCode = normalizeFocusCode(item.code);
            const key = `${session.id}_${normCode}`;
            const isResolved = Boolean(item.isResolved);
            const focusOfferText = item.focusOffer || '';
            const applicableMrp = (stockProd?.mrp && stockProd.mrp > 0) ? stockProd.mrp : (item.focusMrp || 0);
            const parsedOffer = parseFocusOffer(focusOfferText, applicableMrp);

            return (
              <div
                key={key}
                className={`rounded-2xl border p-4 transition-all ${
                  isResolved
                    ? isDarkMode
                      ? 'bg-slate-900/40 border-slate-800 opacity-80'
                      : 'bg-slate-50 border-slate-200 opacity-90'
                    : isDarkMode
                    ? 'bg-slate-900 border-rose-900/50 shadow-md'
                    : 'bg-white border-rose-200 shadow-xs'
                }`}
              >
                {/* Header Row */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase ${
                      session.type === 'core'
                        ? 'bg-indigo-100 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800'
                        : 'bg-teal-100 dark:bg-teal-950 text-teal-800 dark:text-teal-300 border border-teal-200 dark:border-teal-800'
                    }`}>
                      {session.type === 'core' ? 'CORE' : 'NON-CORE'} FOCUS
                    </span>
                    <span className="font-mono text-xs font-black px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700">
                      [{normCode}]
                    </span>
                    <span className="text-xs text-slate-400 font-bold">
                      • {session.monthDisplay}
                    </span>
                  </div>

                  {/* Resolution Status Badge */}
                  <span className={`px-2.5 py-1 rounded-lg text-xs font-black uppercase inline-flex items-center gap-1.5 self-start sm:self-auto ${
                    isResolved
                      ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                      : 'bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-800'
                  }`}>
                    {isResolved ? <Check className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                    <span>{isResolved ? 'RESOLVED' : 'OPEN FLAGGED'}</span>
                  </span>
                </div>

                {/* Product Name & Issue Reason */}
                <div className="mt-2">
                  <h3 className="text-sm font-black text-slate-900 dark:text-white leading-tight">
                    {item.productName}
                  </h3>
                  <div className="mt-1 flex items-center gap-2 flex-wrap text-xs">
                    <span className="font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/60 px-2 py-0.5 rounded-md border border-rose-200 dark:border-rose-800">
                      Issue: {item.issuePreset || item.remark || 'Flagged Issue'}
                    </span>
                    {item.remark && item.remark !== item.issuePreset && (
                      <span className="text-slate-500 dark:text-slate-400 italic">
                        "{item.remark}"
                      </span>
                    )}
                  </div>
                </div>

                {/* Grid metrics: Floor fields & scan status */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 text-xs">
                  {/* On Floor */}
                  <div className="p-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/40">
                    <span className="text-[9px] uppercase font-bold text-slate-400 block">On Floor</span>
                    <span className={`font-bold ${item.onFloor === 'NO' ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {item.onFloor || 'NO'}
                    </span>
                  </div>

                  {/* Display / Facing */}
                  <div className="p-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/40">
                    <span className="text-[9px] uppercase font-bold text-slate-400 block">Display / Facing</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">
                      {item.displayFacing || 'NEED_REFILL'}
                    </span>
                  </div>

                  {/* Focus Board */}
                  <div className="p-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/40">
                    <span className="text-[9px] uppercase font-bold text-slate-400 block">Focus Board</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">
                      {item.focusBoard || 'INCORRECT'}
                    </span>
                  </div>

                  {/* Scan Status */}
                  <div className="p-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/40">
                    <span className="text-[9px] uppercase font-bold text-slate-400 block">Scan Verified</span>
                    <span className={`font-bold ${
                      item.scanVerified ? 'text-emerald-600' : item.scanError ? 'text-rose-600' : 'text-slate-400'
                    }`}>
                      {item.scanVerified ? 'VERIFIED ✅' : item.scanError ? 'WRONG BARCODE ❌' : 'NOT SCANNED'}
                    </span>
                  </div>

                  {/* Focus Offer */}
                  <div className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/40">
                    <span className="text-[9px] uppercase font-bold text-indigo-500 block">Focus Offer</span>
                    <span className="font-bold text-indigo-900 dark:text-indigo-200 truncate block">
                      {focusOfferText || '—'}
                    </span>
                  </div>
                </div>

                {/* Resolution Action Box */}
                <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
                  {!isResolved ? (
                    <>
                      <input
                        type="text"
                        value={resolutionRemarks[key] !== undefined ? resolutionRemarks[key] : ''}
                        onChange={(e) =>
                          setResolutionRemarks((prev) => ({ ...prev, [key]: e.target.value }))
                        }
                        placeholder="Action taken remark (e.g. Refilled on shelf, Board replaced)..."
                        className={`flex-1 px-3 py-1.5 rounded-xl border text-xs font-medium ${
                          isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'
                        }`}
                      />
                      <button
                        onClick={() => handleResolveIssue(session, normCode)}
                        className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition-all cursor-pointer flex items-center justify-center gap-1.5 shrink-0"
                      >
                        <Check className="w-4 h-4 stroke-[3]" />
                        <span>Resolve Issue</span>
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        <strong className="text-emerald-600 dark:text-emerald-400 font-bold">Resolved: </strong>
                        <span>{item.resolutionRemark || 'Resolved on floor'}</span>
                        {item.resolvedAt && (
                          <span className="ml-2 font-mono text-[11px] text-slate-400">
                            ({new Date(item.resolvedAt).toLocaleString()})
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => handleReopenIssue(session, normCode)}
                        className="px-3 py-1.5 rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 hover:bg-rose-100 text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 shrink-0"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Re-open Issue</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
