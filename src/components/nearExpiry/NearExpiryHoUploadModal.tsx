import React, { useState } from 'react';
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  X,
  ArrowRight,
  RefreshCw,
  Info,
  Link,
  PlusCircle,
  Database
} from 'lucide-react';
import { NearExpiryBatch, NearExpiryItem, HoImportMatchResult, Product } from '../../types';
import { importHoReturnedExcel } from '../../utils/nearExpiryExcel';
import { saveNearExpiryItemsDB, saveNearExpiryBatchDB } from '../../utils/indexedDB';

interface NearExpiryHoUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  batch: NearExpiryBatch;
  items: NearExpiryItem[];
  stockProducts?: Product[];
  onImportComplete: (updatedItems: NearExpiryItem[], updatedBatch: NearExpiryBatch) => void;
  isDarkMode?: boolean;
}

export const NearExpiryHoUploadModal: React.FC<NearExpiryHoUploadModalProps> = ({
  isOpen,
  onClose,
  batch,
  items,
  stockProducts = [],
  onImportComplete,
  isDarkMode = false
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [matchResult, setMatchResult] = useState<HoImportMatchResult | null>(null);
  const [isApplying, setIsApplying] = useState(false);

  // Action breakdown stats
  const actionBreakdown = React.useMemo(() => {
    if (!matchResult) return {};
    const map: Record<string, number> = {};
    matchResult.updatedItems.forEach((it) => {
      const type = it.actionType || 'PENDING HO RESPONSE';
      map[type] = (map[type] || 0) + 1;
    });
    return map;
  }, [matchResult]);

  if (!isOpen) return null;

  const handleFileChange = async (file: File) => {
    setSelectedFile(file);
    setError(null);
    setMatchResult(null);

    // Guard against legacy binary .xls files
    const fileName = file.name.toLowerCase();
    if (fileName.endsWith('.xls') && !fileName.endsWith('.xlsx')) {
      setError('Old .xls format is not supported. Please save the file as .xlsx and upload again.');
      return;
    }

    setIsProcessing(true);

    try {
      // Standalone import: pass active items (can be empty), target store, stock master products, and batchId
      const result = await importHoReturnedExcel(
        file,
        items || [],
        batch.storeName,
        stockProducts,
        batch.id
      );
      setMatchResult(result);
    } catch (err: any) {
      console.error('HO Import error:', err);
      const msg = err?.message || 'Failed to process HO Excel file.';
      if (
        msg.includes('central directory') ||
        msg.includes('zip file') ||
        msg.toLowerCase().includes('.xls')
      ) {
        setError('Old .xls format is not supported. Please save the file as .xlsx and upload again.');
      } else {
        setError(msg);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleApplyUpdates = async () => {
    if (!matchResult || matchResult.updatedItems.length === 0) return;

    setIsApplying(true);
    try {
      // Create lookup map of imported items
      const importedMap = new Map<string, NearExpiryItem>();
      matchResult.updatedItems.forEach((it) => importedMap.set(it.id, it));

      // Merge: preserve any existing batch items not in the HO update, and add all updated/new HO items
      const fullUpdatedList: NearExpiryItem[] = [];
      const visitedIds = new Set<string>();

      // First add updated existing items
      (items || []).forEach((it) => {
        if (importedMap.has(it.id)) {
          fullUpdatedList.push(importedMap.get(it.id)!);
          visitedIds.add(it.id);
        } else {
          fullUpdatedList.push(it);
        }
      });

      // Next add all new HO-only items
      matchResult.updatedItems.forEach((it) => {
        if (!visitedIds.has(it.id)) {
          fullUpdatedList.push(it);
          visitedIds.add(it.id);
        }
      });

      // Save full list into IndexedDB
      await saveNearExpiryItemsDB(fullUpdatedList);

      // Recalculate batch statistics
      const totalQty = fullUpdatedList.reduce(
        (sum, it) => sum + (Number(it.nearExpiryStock) || 0),
        0
      );
      const totalValue = fullUpdatedList.reduce(
        (sum, it) => sum + (Number(it.value) || 0),
        0
      );

      // Update batch status to HO_RESPONSE_RECEIVED
      const updatedBatch: NearExpiryBatch = {
        ...batch,
        itemCount: fullUpdatedList.length,
        totalQty,
        totalValue,
        status: 'HO_RESPONSE_RECEIVED',
        hoResponseAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      await saveNearExpiryBatchDB(updatedBatch);

      onImportComplete(fullUpdatedList, updatedBatch);
      onClose();
    } catch (err: any) {
      console.error('Failed to apply HO updates:', err);
      setError('Failed to save imported remarks into offline database.');
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-900/60 backdrop-blur-xs">
      <div
        className={`w-full max-w-lg p-4 sm:p-5 rounded-2xl border shadow-2xl overflow-y-auto max-h-[90vh] ${
          isDarkMode
            ? 'bg-slate-900 border-slate-800 text-white'
            : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-indigo-600 text-white">
              <Upload className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                Upload HO Response Excel
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Target Batch: {batch.name} • {batch.storeName && batch.storeName !== 'Store 1' ? batch.storeName : 'PATAN'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Upload Drop Area */}
        <div className="mt-4">
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5">
            Select HO Excel (.xlsx)
          </label>
          <div
            className="relative border-2 border-dashed rounded-xl p-4 text-center transition-colors border-slate-300 dark:border-slate-700 hover:border-indigo-500 bg-slate-50 dark:bg-slate-800/40"
          >
            <input
              type="file"
              accept=".xlsx, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              disabled={isProcessing}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFileChange(f);
              }}
              className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
            />
            <FileSpreadsheet className="w-8 h-8 text-indigo-500 mx-auto mb-2" />
            <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
              {selectedFile ? selectedFile.name : 'Tap to choose or drag HO Excel file here'}
            </div>
            <div className="text-[10px] text-slate-500 mt-1">
              Supports standalone HO workbooks with sheet &quot;NEAR EXPIRY LIST&quot;
            </div>
          </div>
        </div>

        {isProcessing && (
          <div className="mt-4 p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 text-xs text-indigo-700 dark:text-indigo-300 flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin" />
            <span>Processing HO workbook and interpreting remarks...</span>
          </div>
        )}

        {error && (
          <div className="mt-4 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Match Results Summary */}
        {matchResult && (
          <div className="mt-4 space-y-3">
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-2 flex items-center justify-between">
                <div>
                  <span>HO Import Summary</span>
                  {matchResult.detectedSheet && (
                    <span className="ml-2 text-[10px] font-normal lowercase text-slate-500">
                      (Sheet: {matchResult.detectedSheet}, Row {matchResult.detectedHeaderRow})
                    </span>
                  )}
                </div>
                <span className="text-emerald-600 dark:text-emerald-400 font-extrabold">
                  {matchResult.importedCount} Items Ready
                </span>
              </h4>

              {/* 4 Main Core Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700">
                  <span className="text-[10px] text-slate-500 uppercase block">Total HO Rows</span>
                  <span className="font-extrabold text-slate-800 dark:text-slate-200">
                    {matchResult.totalRows}
                  </span>
                </div>
                <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700">
                  <span className="text-[10px] text-slate-500 uppercase block">Imported</span>
                  <span className="font-extrabold text-emerald-600 dark:text-emerald-400">
                    {matchResult.importedCount}
                  </span>
                </div>
                <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700">
                  <span className="text-[10px] text-slate-500 uppercase block">Linked Prepared</span>
                  <span className="font-extrabold text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
                    <Link className="w-3 h-3" />
                    {matchResult.linkedCount}
                  </span>
                </div>
                <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700">
                  <span className="text-[10px] text-slate-500 uppercase block">New HO-Only</span>
                  <span className="font-extrabold text-teal-600 dark:text-teal-400 flex items-center gap-1">
                    <PlusCircle className="w-3 h-3" />
                    {matchResult.newHoCount}
                  </span>
                </div>
              </div>

              {/* Stock IQ Enrichment & Data Quality Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2 pt-2 border-t border-slate-200 dark:border-slate-700 text-xs">
                <div>
                  <span className="text-[10px] text-slate-500 uppercase flex items-center gap-1">
                    <Database className="w-3 h-3 text-emerald-500" />
                    Stock IQ Matched
                  </span>
                  <span className="font-bold text-slate-700 dark:text-slate-300">
                    {matchResult.stockMasterMatchedCount}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 uppercase block">Stock Master Not Found</span>
                  <span className="font-bold text-slate-600 dark:text-slate-400">
                    {matchResult.stockMasterNotFoundCount}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 uppercase block">Ambiguous / Review</span>
                  <span className="font-bold text-amber-600 dark:text-amber-400">
                    {matchResult.ambiguousCount}
                  </span>
                </div>
              </div>
            </div>

            {/* Sample Imported Products with HO Remarks */}
            {matchResult.updatedItems.length > 0 && (
              <div className="p-3 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60">
                <h5 className="text-[11px] font-bold text-emerald-900 dark:text-emerald-200 uppercase tracking-wider mb-2">
                  Sample Imported Products (First {Math.min(3, matchResult.updatedItems.length)})
                </h5>
                <div className="space-y-1.5 text-xs">
                  {matchResult.updatedItems.slice(0, 3).map((item) => (
                    <div key={item.id} className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-emerald-100 dark:border-emerald-900/60">
                      <div className="flex items-center justify-between font-bold text-slate-800 dark:text-slate-200">
                        <span className="truncate">{item.itemName}</span>
                        {item.bansalCode && (
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                            {item.bansalCode}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-slate-500 mt-1">
                        <span className="truncate max-w-[200px]">HO Remark: <strong className="text-slate-700 dark:text-slate-300">{item.hoRemark || 'None'}</strong></span>
                        <span className="font-semibold text-emerald-700 dark:text-emerald-400 shrink-0">{item.actionType}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Action Engine Interpretation Breakdown */}
            <div className="p-3 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/60">
              <h5 className="text-[11px] font-bold text-indigo-900 dark:text-indigo-200 uppercase tracking-wider mb-2">
                Actions Interpreted by Engine
              </h5>
              <div className="space-y-1 text-xs">
                {Object.entries(actionBreakdown).map(([action, count]) => (
                  <div
                    key={action}
                    className="flex items-center justify-between py-1 border-b border-indigo-100 dark:border-indigo-900/60 last:border-b-0"
                  >
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {action}
                    </span>
                    <span className="px-2 py-0.5 text-xs font-extrabold rounded-md bg-white dark:bg-slate-800 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-700">
                      {count} items
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Ambiguous Rows if any */}
            {matchResult.ambiguousRows.length > 0 && (
              <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs">
                <div className="font-bold text-amber-800 dark:text-amber-300 mb-1 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>{matchResult.ambiguousRows.length} ambiguous items requiring manual review</span>
                </div>
                <div className="text-[10px] text-slate-600 dark:text-slate-400 max-h-20 overflow-y-auto space-y-0.5">
                  {matchResult.ambiguousRows.slice(0, 5).map((u, i) => (
                    <div key={i}>
                      Row {u.rowNumber}: {u.itemName || u.bansalCode} — {u.reason}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Footer Buttons */}
        <div className="flex items-center gap-2 mt-5 pt-3 border-t border-slate-200 dark:border-slate-800">
          {matchResult && matchResult.importedCount > 0 && (
            <button
              type="button"
              onClick={handleApplyUpdates}
              disabled={isApplying}
              className="min-h-[44px] flex-1 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-2 shadow-xs cursor-pointer transition-all disabled:opacity-50"
            >
              {isApplying ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4" />
              )}
              <span>Import {matchResult.importedCount} Items & Take Action</span>
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

