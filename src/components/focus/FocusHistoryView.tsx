import React, { useState, useEffect, useMemo } from 'react';
import {
  CheckCircle2,
  Clock,
  ArrowLeft,
  Share2,
  Download,
  Search,
  Eye,
  Trash2,
  ShoppingBag,
  Layers,
  FileText,
  X,
  AlertCircle,
  Check,
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
  deletePhysicalFocusCheck
} from '../../utils/focusStorage';
import { normalizeFocusCode, parseFocusOffer } from '../../utils/focusMatcher';

interface FocusHistoryViewProps {
  coreMaster: FocusMaster | null;
  nonCoreMaster: FocusMaster | null;
  stockProducts: Product[];
  storeId?: string;
  isDarkMode?: boolean;
  onBack: () => void;
  showToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

export const FocusHistoryView: React.FC<FocusHistoryViewProps> = ({
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
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Active session for viewing full report modal
  const [activeReportSession, setActiveReportSession] = useState<PhysicalFocusCheckSession | null>(null);

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

  // Load Sessions
  const loadSessionsData = async () => {
    setIsLoading(true);
    try {
      const all = await loadAllPhysicalFocusChecks(storeId);
      setSessions(all);
    } catch (e) {
      console.warn('Error loading sessions for history view:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSessionsData();
  }, [storeId]);

  // Filter sessions
  const filteredSessions = useMemo(() => {
    return sessions.filter((s) => {
      if (selectedType !== 'all' && s.type !== selectedType) return false;
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase().trim();
        const matchesMonth = s.monthDisplay.toLowerCase().includes(term);
        const matchesFile = s.masterFileName?.toLowerCase().includes(term) || false;
        if (!matchesMonth && !matchesFile) return false;
      }
      return true;
    });
  }, [sessions, selectedType, searchTerm]);

  // Delete session
  const handleDeleteSession = async (checkId: string) => {
    if (!window.confirm('Are you sure you want to delete this check history record?')) return;
    await deletePhysicalFocusCheck(storeId, checkId);
    setSessions((prev) => prev.filter((s) => s.id !== checkId));
    if (activeReportSession?.id === checkId) {
      setActiveReportSession(null);
    }
    if (showToast) showToast('History session deleted.', 'info');
  };

  // WhatsApp Summary Copy
  const handleCopyWhatsApp = async (session: PhysicalFocusCheckSession) => {
    const resultsList: PhysicalCheckItemResult[] = Object.values(session.results);
    const flaggedItems = resultsList.filter((r) => r.status === 'FLAGGED');
    const openFlagged = flaggedItems.filter((r) => !r.isResolved);
    const doneItems = resultsList.filter((r) => r.status === 'DONE');

    const lines = [
      `*BANSAL SUPERMARKET — ${session.type.toUpperCase()} FOCUS PHYSICAL AUDIT REPORT*`,
      `*Month:* ${session.monthDisplay}`,
      `*Status:* ${session.status === 'completed' ? '✅ COMPLETED' : '⏳ IN PROGRESS'}`,
      `*Started:* ${new Date(session.startedAt).toLocaleString()}`,
      session.completedAt ? `*Completed:* ${new Date(session.completedAt).toLocaleString()}` : '',
      `*Total Focus SKUs:* ${session.totalCount}`,
      `*Done / Verified:* ${doneItems.length} (${Math.round((doneItems.length / (session.totalCount || 1)) * 100)}%)`,
      `*Total Flagged Issues:* ${flaggedItems.length} (Open: ${openFlagged.length})`,
      `---------------------------------`,
      `*OPEN FLAGGED ISSUES (${openFlagged.length})*:`
    ];

    if (openFlagged.length === 0) {
      lines.push('✅ No open floor issues flagged!');
    } else {
      openFlagged.forEach((item, idx) => {
        lines.push(
          `${idx + 1}. *[${item.code}] ${item.productName}*`,
          `   • Issue: ${item.issuePreset || item.remark || 'Flagged'}`,
          `   • On Floor: ${item.onFloor} | Facing: ${item.displayFacing} | Board: ${item.focusBoard}`,
          item.focusOffer ? `   • Offer: ${item.focusOffer}` : '',
          item.remark ? `   • Remark: ${item.remark}` : ''
        );
      });
    }

    lines.push(`\n_Generated via Bansal POS & Focus IQ Platform_`);

    try {
      await navigator.clipboard.writeText(lines.filter(Boolean).join('\n'));
      if (showToast) showToast('WhatsApp report copied to clipboard!', 'success');
    } catch {
      if (showToast) showToast('Failed to copy to clipboard.', 'error');
    }
  };

  // Download Excel
  const handleExportExcel = (session: PhysicalFocusCheckSession) => {
    const doExport = () => {
      try {
        const rows = session.productsSnapshot.map((item, idx) => {
          const normCode = normalizeFocusCode(item.code);
          const res = session.results[normCode];
          const stockProd = stockLookup.get(normCode);
          const productName = item.name || (item as any).productName || res?.productName || 'Unknown Product';
          const focusOfferText = item.focusOffer || (item as any).offerDescription || res?.focusOffer || '';
          const applicableMrp = (stockProd?.mrp && stockProd.mrp > 0) ? stockProd.mrp : (item.mrp || res?.focusMrp || 0);
          const parsed = parseFocusOffer(focusOfferText, applicableMrp);

          return {
            'S.No': idx + 1,
            'Focus Type': session.type === 'core' ? 'CORE' : 'NON-CORE',
            'Active Month': session.monthDisplay,
            'Product Code': normCode,
            'Product Name': productName,
            Category: item.category || 'General',
            Brand: item.brand || 'General',
            'Focus Offer': focusOfferText || '—',
            'Focus MRP': item.mrp || res?.focusMrp || 0,
            'Live Stock IQ MRP': stockProd?.mrp || '—',
            'Expected SP': parsed.expectedRetail !== null && !isNaN(parsed.expectedRetail) ? `₹${parsed.expectedRetail}` : '—',
            'Current Retail SP': stockProd?.retailPrice !== undefined ? `₹${stockProd.retailPrice}` : '—',
            'Live Stock': stockProd?.stock ?? '—',
            'Scan Verification': res?.scanVerified ? `VERIFIED (${res.verifiedBarcode})` : res?.scanError ? `WRONG PRODUCT (${res.scannedBarcode})` : (res?.status ? 'NOT SCANNED' : ''),
            'Check Status': res?.status || '',
            'On Floor': res?.onFloor || '',
            'Display / Facing': res?.displayFacing || '',
            'Focus Board': res?.focusBoard || '',
            'Issue Reason / Preset': res?.issuePreset || '',
            'Original Remark': res?.remark || '',
            'Resolution Status': res?.isResolved ? 'RESOLVED' : res?.status === 'FLAGGED' ? 'OPEN' : '',
            'Resolution Remark': res?.resolutionRemark || '',
            'Checked At': res?.checkedAt ? new Date(res.checkedAt).toLocaleString() : ''
          };
        });

        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Focus_Check_Report');

        const fileName = `${session.type.toUpperCase()}_Physical_Check_${session.monthDisplay.replace(/\s+/g, '_')}.xlsx`;
        XLSX.writeFile(wb, fileName);

        if (showToast) showToast('Completed check Excel report downloaded.', 'success');
      } catch (e) {
        console.error('Export error:', e);
        if (showToast) showToast('Failed to export Excel report.', 'error');
      }
    };

    doExport();
  };

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
              <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-indigo-100 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                STAGE 5 • COMPLETED AUDITS
              </span>
            </div>
            <h1 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white truncate">
              FOCUS PHYSICAL CHECKS HISTORY & REPORTS
            </h1>
          </div>
        </div>

        {/* Type Filter */}
        <div className="flex items-center gap-2 shrink-0">
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value as any)}
            className={`px-3 py-1.5 rounded-xl border text-xs font-bold cursor-pointer ${
              isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'
            }`}
          >
            <option value="all">ALL TYPES</option>
            <option value="core">CORE FOCUS</option>
            <option value="non_core">NON-CORE FOCUS</option>
          </select>
        </div>
      </div>

      {/* Main Sessions List */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
        {filteredSessions.length === 0 ? (
          <div className={`p-8 rounded-2xl border text-center max-w-xl mx-auto my-8 ${
            isDarkMode ? 'bg-slate-900/60 border-slate-800' : 'bg-white border-slate-200 shadow-xs'
          }`}>
            <ShoppingBag className="w-12 h-12 text-slate-400 mx-auto mb-3 opacity-50" />
            <h3 className="text-base font-bold text-slate-700 dark:text-slate-300">
              No Physical Check History Found
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Start a physical check session from the Focus IQ Hub or Core/Non-Core Physical Check options.
            </p>
          </div>
        ) : (
          <div className="max-w-5xl mx-auto space-y-3">
            {filteredSessions.map((s) => {
              const isCompleted = s.status === 'completed';
              return (
                <div
                  key={s.id}
                  className={`p-4 sm:p-5 rounded-2xl border transition-all ${
                    isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-xs'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase ${
                          s.type === 'core'
                            ? 'bg-indigo-100 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800'
                            : 'bg-teal-100 dark:bg-teal-950 text-teal-800 dark:text-teal-300 border border-teal-200 dark:border-teal-800'
                        }`}>
                          {s.type === 'core' ? 'CORE FOCUS' : 'NON-CORE FOCUS'}
                        </span>

                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase ${
                          isCompleted
                            ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                            : 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
                        }`}>
                          {isCompleted ? '✓ COMPLETED' : '⏳ IN PROGRESS'}
                        </span>

                        <span className="font-mono text-xs font-bold text-slate-600 dark:text-slate-400">
                          Month: {s.monthDisplay}
                        </span>
                      </div>

                      <h3 className="text-sm font-black text-slate-900 dark:text-white mt-1.5">
                        {s.type === 'core' ? 'CORE FOCUS' : 'NON-CORE FOCUS'} Physical Check Session
                      </h3>

                      <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                        <span>Started: {new Date(s.startedAt).toLocaleString()}</span>
                        {s.completedAt && <span>• Completed: {new Date(s.completedAt).toLocaleString()}</span>}
                        <span>• File: {s.masterFileName || 'Focus Master'}</span>
                      </div>
                    </div>

                    {/* Metrics Badges */}
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-center">
                        <span className="text-[10px] font-bold text-slate-500 block">Total</span>
                        <span className="text-xs font-black text-slate-900 dark:text-white">{s.totalCount}</span>
                      </div>
                      <div className="px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-center">
                        <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 block">Done</span>
                        <span className="text-xs font-black text-emerald-700 dark:text-emerald-300">{s.doneCount}</span>
                      </div>
                      <div className="px-2.5 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 text-center">
                        <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400 block">Flagged</span>
                        <span className="text-xs font-black text-rose-700 dark:text-rose-300">{s.flaggedCount}</span>
                      </div>
                      <div className="px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/60 text-center">
                        <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 block">Complete</span>
                        <span className="text-xs font-black text-indigo-700 dark:text-indigo-300">{s.completionPercentage}%</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions Bar */}
                  <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        onClick={() => setActiveReportSession(s)}
                        className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-xs"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>View Full Report</span>
                      </button>

                      <button
                        onClick={() => handleCopyWhatsApp(s)}
                        className="px-3 py-1.5 rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
                      >
                        <Share2 className="w-3.5 h-3.5" />
                        <span>WhatsApp Summary</span>
                      </button>

                      <button
                        onClick={() => handleExportExcel(s)}
                        className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Download Excel</span>
                      </button>
                    </div>

                    <button
                      onClick={() => handleDeleteSession(s.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-all cursor-pointer"
                      title="Delete History Session"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* MODAL: FULL REPORT VIEW */}
      {activeReportSession && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-6 overflow-hidden">
          <div className={`max-w-6xl w-full max-h-[92vh] rounded-3xl border flex flex-col shadow-2xl overflow-hidden ${
            isDarkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900'
          }`}>
            {/* Modal Header */}
            <div className={`p-4 sm:p-5 border-b shrink-0 flex items-center justify-between gap-3 ${
              isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-slate-50 border-slate-200'
            }`}>
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase bg-indigo-100 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                    {activeReportSession.type.toUpperCase()} FOCUS AUDIT REPORT
                  </span>
                  <span className="font-mono text-xs font-bold text-slate-400">
                    Month: {activeReportSession.monthDisplay}
                  </span>
                </div>
                <h2 className="text-base sm:text-lg font-black mt-1">
                  Physical Floor Check Report — {activeReportSession.monthDisplay}
                </h2>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleExportExcel(activeReportSession)}
                  className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Excel</span>
                </button>
                <button
                  onClick={() => setActiveReportSession(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Table Content */}
            <div className="flex-1 overflow-auto p-4">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className={`border-b text-[11px] font-black uppercase tracking-wider ${
                    isDarkMode ? 'bg-slate-800/80 text-slate-300 border-slate-700' : 'bg-slate-100 text-slate-600 border-slate-200'
                  }`}>
                    <th className="p-2.5">S.No</th>
                    <th className="p-2.5">Code</th>
                    <th className="p-2.5">Product Name</th>
                    <th className="p-2.5">Focus Offer</th>
                    <th className="p-2.5 text-right">Exp SP</th>
                    <th className="p-2.5 text-right">Current SP</th>
                    <th className="p-2.5">Scan Status</th>
                    <th className="p-2.5">On Floor</th>
                    <th className="p-2.5">Facing</th>
                    <th className="p-2.5">Board</th>
                    <th className="p-2.5">Status</th>
                    <th className="p-2.5">Issue / Remark</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {activeReportSession.productsSnapshot.map((item, idx) => {
                    const normCode = normalizeFocusCode(item.code);
                    const res = activeReportSession.results[normCode];
                    const stockProd = stockLookup.get(normCode);
                    const focusOfferText = item.focusOffer || (item as any).offerDescription || res?.focusOffer || '';
                    const applicableMrp = (stockProd?.mrp && stockProd.mrp > 0) ? stockProd.mrp : (item.mrp || res?.focusMrp || 0);
                    const parsed = parseFocusOffer(focusOfferText, applicableMrp);

                    return (
                      <tr
                        key={normCode}
                        className={
                          res?.status === 'FLAGGED'
                            ? isDarkMode ? 'bg-rose-950/20' : 'bg-rose-50/50'
                            : ''
                        }
                      >
                        <td className="p-2.5 font-mono text-slate-400">{idx + 1}</td>
                        <td className="p-2.5 font-mono font-bold text-slate-900 dark:text-white">{normCode}</td>
                        <td className="p-2.5 font-bold">{item.name || (item as any).productName || res?.productName}</td>
                        <td className="p-2.5 font-medium text-indigo-600 dark:text-indigo-400">{focusOfferText || '—'}</td>
                        <td className="p-2.5 text-right font-bold">
                          {parsed.expectedRetail !== null && !isNaN(parsed.expectedRetail) ? `₹${parsed.expectedRetail}` : '—'}
                        </td>
                        <td className="p-2.5 text-right font-bold">
                          {stockProd?.retailPrice !== undefined ? `₹${stockProd.retailPrice}` : '—'}
                        </td>
                        <td className="p-2.5 font-bold">
                          {res?.scanVerified ? 'VERIFIED ✅' : res?.scanError ? 'WRONG ❌' : 'NOT SCANNED'}
                        </td>
                        <td className="p-2.5 font-bold">{res?.onFloor || 'YES'}</td>
                        <td className="p-2.5">{res?.displayFacing || 'GOOD'}</td>
                        <td className="p-2.5">{res?.focusBoard || 'CORRECT'}</td>
                        <td className="p-2.5">
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase ${
                            res?.status === 'DONE'
                              ? 'bg-emerald-100 text-emerald-800'
                              : res?.status === 'FLAGGED'
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}>
                            {res?.status || 'PENDING'}
                          </span>
                        </td>
                        <td className="p-2.5 text-slate-500 italic max-w-xs truncate">
                          {res?.issuePreset || res?.remark || '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
