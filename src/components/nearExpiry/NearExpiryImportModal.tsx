import React, { useState, useRef } from 'react';
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  X,
  Layers,
  ArrowRight,
  Database,
  Calendar,
  AlertTriangle,
  Info
} from 'lucide-react';
import { NearExpiryBatch, NearExpiryItem, HoImportMatchResult, Product } from '../../types';
import { importHoReturnedExcel } from '../../utils/nearExpiryExcel';
import { saveNearExpiryItemsDB, saveNearExpiryBatchDB } from '../../utils/indexedDB';
import { calculateBatchSummary } from '../../utils/nearExpiryStorage';

interface NearExpiryImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  batch: NearExpiryBatch | null;
  items: NearExpiryItem[];
  stockProducts?: Product[];
  onImportComplete: (updatedItems: NearExpiryItem[], updatedBatch: NearExpiryBatch) => void;
  isDarkMode?: boolean;
}

export const NearExpiryImportModal: React.FC<NearExpiryImportModalProps> = ({
  isOpen,
  onClose,
  batch,
  items,
  stockProducts = [],
  onImportComplete,
  isDarkMode = false
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<HoImportMatchResult | null>(null);
  const [previewTab, setPreviewTab] = useState<'ITEMS' | 'AMBIGUOUS'>('ITEMS');
  const [searchQuery, setSearchQuery] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen || !batch) return null;

  const storeDisplay = batch.storeName && batch.storeName !== 'Store 1' ? batch.storeName : 'PATAN';

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    processFile(selected);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const dropped = e.dataTransfer.files?.[0];
    if (!dropped) return;
    processFile(dropped);
  };

  const processFile = async (selectedFile: File) => {
    setFile(selectedFile);
    setIsParsing(true);
    setParseError(null);
    setImportResult(null);

    try {
      const fileNameLower = selectedFile.name.toLowerCase();
      if (!fileNameLower.endsWith('.xlsx') && !fileNameLower.endsWith('.xlsm')) {
        if (fileNameLower.endsWith('.xls')) {
          throw new Error('Old binary .xls format is not supported. Please save/convert the file as .xlsx in Excel.');
        }
        throw new Error('Please select an Excel workbook (.xlsx).');
      }

      // Run robust Near Expiry Excel importer with exact duplicate safety
      const result = await importHoReturnedExcel(
        selectedFile,
        items,
        storeDisplay,
        stockProducts,
        batch.id
      );

      if (result.importedCount === 0) {
        throw new Error(
          'No valid product rows could be extracted. Ensure the sheet has Item Name, Bansal Code, or EAN.'
        );
      }

      setImportResult(result);
    } catch (err: any) {
      console.error('Import parse error:', err);
      setParseError(err.message || 'Failed to parse Excel file.');
    } finally {
      setIsParsing(false);
    }
  };

  const handleApplyImport = async () => {
    if (!importResult || !batch) return;
    setIsImporting(true);

    try {
      // 1. Build the complete, preserved batch items list
      // Existing items whose ID was not updated by the import are 100% PRESERVED
      const updatedMap = new Map<string, NearExpiryItem>();
      importResult.updatedItems.forEach((it) => updatedMap.set(it.id, it));

      const preservedItems = items.filter((it) => !updatedMap.has(it.id));
      const fullBatchItems = [...preservedItems, ...importResult.updatedItems];

      // 2. Persist to IndexedDB
      await saveNearExpiryItemsDB(importResult.updatedItems);

      // 3. Update batch summary statistics
      const summary = calculateBatchSummary(fullBatchItems);
      const updatedBatch: NearExpiryBatch = {
        ...batch,
        itemCount: summary.totalProducts,
        totalQty: summary.totalQty,
        totalValue: summary.totalValue,
        updatedAt: new Date().toISOString(),
        storeName: storeDisplay
      };

      await saveNearExpiryBatchDB(updatedBatch);

      // 4. Notify hub
      onImportComplete(fullBatchItems, updatedBatch);
      onClose();
    } catch (err: any) {
      console.error('Error applying import:', err);
      setParseError(`Failed to save items to database: ${err.message || err}`);
    } finally {
      setIsImporting(false);
    }
  };

  const handleReset = () => {
    setFile(null);
    setImportResult(null);
    setParseError(null);
    setSearchQuery('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Filter preview items
  const filteredItems = importResult?.updatedItems.filter((it) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      it.itemName.toLowerCase().includes(q) ||
      it.bansalCode.toLowerCase().includes(q) ||
      it.barcode.toLowerCase().includes(q) ||
      (it.hoRemark && it.hoRemark.toLowerCase().includes(q))
    );
  }) || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/70 backdrop-blur-xs overflow-y-auto">
      <div
        className={`w-full max-w-4xl max-h-[92vh] flex flex-col rounded-2xl border shadow-2xl overflow-hidden ${
          isDarkMode
            ? 'bg-slate-900 border-slate-800 text-white'
            : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-950/40">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-600 text-white shadow-xs">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                Import Near Expiry List
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2 mt-0.5">
                <span>Target Batch: <strong className="text-blue-600 dark:text-blue-400">{batch.name}</strong></span>
                <span>•</span>
                <span>Store: <strong>{storeDisplay}</strong></span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {/* Step 1: Upload Zone (when no result yet) */}
          {!importResult && (
            <div className="space-y-4">
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-6 sm:p-10 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
                  isParsing
                    ? 'border-blue-400 bg-blue-50/30 dark:bg-blue-950/20 pointer-events-none'
                    : 'border-slate-300 dark:border-slate-700 hover:border-blue-500 dark:hover:border-blue-500 hover:bg-slate-50/60 dark:hover:bg-slate-800/40'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xlsm"
                  onChange={handleFileChange}
                  className="hidden"
                />

                {isParsing ? (
                  <div className="flex flex-col items-center gap-3">
                    <RefreshCw className="w-10 h-10 text-blue-600 animate-spin" />
                    <p className="font-bold text-sm text-slate-800 dark:text-slate-200">
                      Reading Excel &amp; Validating Lot Expiries...
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Checking Bansal Codes, Expiry Dates, and Stock IQ master mappings
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="w-14 h-14 rounded-2xl bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-3">
                      <FileSpreadsheet className="w-7 h-7" />
                    </div>
                    <p className="font-bold text-sm sm:text-base text-slate-800 dark:text-slate-200">
                      Click to choose or drag &amp; drop Near Expiry Excel
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md">
                      Uploads authoritatively into <strong>{batch.name}</strong>. Existing batch items are kept safe.
                      Supports full lists, HO response files, or store exports (.xlsx).
                    </p>
                    <div className="mt-4 px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                      Target Store: {storeDisplay}
                    </div>
                  </>
                )}
              </div>

              {/* Safety Notice */}
              <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 text-amber-900 dark:text-amber-300 text-xs flex items-start gap-2.5">
                <Info className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <strong className="block font-bold">Multiple Lot Expiry Protection:</strong>
                  <p className="text-[11px] leading-relaxed text-amber-800 dark:text-amber-300/90">
                    The same Bansal Code can have multiple Near Expiry entries with different expiry dates.
                    The engine strictly preserves distinct entries and will never overwrite an item with a different expiry date.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Parse Error Box */}
          {parseError && (
            <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 text-rose-900 dark:text-rose-300 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
              <div>
                <strong className="block font-bold">Import Error</strong>
                <p className="text-[11px] mt-0.5">{parseError}</p>
                <button
                  type="button"
                  onClick={handleReset}
                  className="mt-2 text-xs font-bold underline cursor-pointer text-rose-700 dark:text-rose-400"
                >
                  Try another file
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Validation & Preview (when parsed successfully) */}
          {importResult && (
            <div className="space-y-4">
              {/* Summary KPIs */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Total Rows in File
                  </span>
                  <p className="text-xl font-black text-slate-900 dark:text-white mt-0.5">
                    {importResult.totalRows.toLocaleString()}
                  </p>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">
                    Sheet: {importResult.detectedSheet || 'Near Expiry'}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                    New Items to Add
                  </span>
                  <p className="text-xl font-black text-emerald-800 dark:text-emerald-300 mt-0.5">
                    +{importResult.newHoCount.toLocaleString()}
                  </p>
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400">
                    Unique lot entries
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/60">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-400">
                    Existing Matches
                  </span>
                  <p className="text-xl font-black text-blue-800 dark:text-blue-300 mt-0.5">
                    {importResult.linkedCount.toLocaleString()}
                  </p>
                  <span className="text-[10px] text-blue-600 dark:text-blue-400">
                    Linked &amp; updated
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800/60">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-purple-700 dark:text-purple-400">
                    Final Batch Total
                  </span>
                  <p className="text-xl font-black text-purple-800 dark:text-purple-300 mt-0.5">
                    {(
                      items.filter(
                        (it) => !importResult.updatedItems.some((u) => u.id === it.id)
                      ).length + importResult.updatedItems.length
                    ).toLocaleString()}
                  </p>
                  <span className="text-[10px] text-purple-600 dark:text-purple-400">
                    Items in {batch.name}
                  </span>
                </div>
              </div>

              {/* Safety notice in preview */}
              <div className="px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 text-xs flex items-center justify-between">
                <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>
                    Current batch has <strong>{items.length}</strong> items. All non-conflicting items will be preserved safely.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleReset}
                  className="text-[11px] text-blue-600 dark:text-blue-400 font-bold hover:underline cursor-pointer"
                >
                  Change File
                </button>
              </div>

              {/* Search & Tabs */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 pt-1">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setPreviewTab('ITEMS')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      previewTab === 'ITEMS'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    Items to Import ({importResult.updatedItems.length})
                  </button>
                  {importResult.ambiguousRows.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setPreviewTab('AMBIGUOUS')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                        previewTab === 'AMBIGUOUS'
                          ? 'bg-amber-600 text-white shadow-xs'
                          : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400'
                      }`}
                    >
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>Review Warnings ({importResult.ambiguousRows.length})</span>
                    </button>
                  )}
                </div>

                <input
                  type="text"
                  placeholder="Filter items by code, name, or remark..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="text-xs px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-hidden focus:ring-1 focus:ring-blue-500 w-full sm:w-64"
                />
              </div>

              {/* Preview Table */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                <div className="max-h-60 overflow-y-auto divide-y divide-slate-200 dark:divide-slate-800">
                  {previewTab === 'ITEMS' ? (
                    filteredItems.length === 0 ? (
                      <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400">
                        No items match the filter query.
                      </div>
                    ) : (
                      filteredItems.slice(0, 100).map((it, idx) => (
                        <div
                          key={it.id || idx}
                          className="p-3 flex items-center justify-between text-xs hover:bg-slate-50/70 dark:hover:bg-slate-800/40 gap-3"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-[11px] font-bold text-blue-600 dark:text-blue-400">
                                {it.bansalCode || it.barcode || '—'}
                              </span>
                              <span className="truncate font-semibold text-slate-900 dark:text-white">
                                {it.itemName}
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                              <span>EXP: <strong className="text-slate-700 dark:text-slate-300">{it.expiryDate || 'N/A'}</strong></span>
                              {it.mfgDate && <span>• MFG: {it.mfgDate}</span>}
                              <span>• Qty: <strong>{it.nearExpiryStock}</strong></span>
                              <span>• Value: ₹{Number(it.value || 0).toLocaleString('en-IN')}</span>
                              {it.pendingDays !== undefined && (
                                <span className={it.pendingDays <= 30 ? 'text-rose-600 font-bold' : ''}>
                                  • {it.pendingDays}d left
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="shrink-0 flex items-center gap-2">
                            {it.hoRemark && (
                              <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-[10px] font-semibold text-slate-700 dark:text-slate-300 max-w-[120px] truncate">
                                {it.hoRemark}
                              </span>
                            )}
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                it.status === 'ACTION_REQUIRED'
                                  ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300'
                                  : it.status === 'WAITING'
                                  ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                              }`}
                            >
                              {it.status}
                            </span>
                          </div>
                        </div>
                      ))
                    )
                  ) : (
                    importResult.ambiguousRows.map((amb, idx) => (
                      <div
                        key={idx}
                        className="p-3 text-xs hover:bg-amber-50/40 dark:hover:bg-amber-950/20"
                      >
                        <div className="flex items-center gap-2 font-bold text-amber-700 dark:text-amber-400">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                          <span>Row {amb.rowNumber}: {amb.itemName || amb.bansalCode}</span>
                        </div>
                        <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5">
                          {amb.reason}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {filteredItems.length > 100 && (
                <p className="text-[11px] text-slate-400 text-center">
                  Showing first 100 of {filteredItems.length} items in preview.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-950/40">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] px-4 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>

          {importResult && (
            <button
              type="button"
              onClick={handleApplyImport}
              disabled={isImporting}
              className="min-h-[44px] px-6 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-xs font-bold flex items-center gap-2 shadow-xs cursor-pointer disabled:opacity-50 transition-colors"
            >
              {isImporting ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4" />
              )}
              <span>
                Import {importResult.updatedItems.length} Items into {batch.name}
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
