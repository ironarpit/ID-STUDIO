import React, { useState, useRef } from 'react';
import {
  Upload,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle2,
  X,
  Calendar,
  Layers,
  ShoppingBag,
  Info,
  Check,
  ChevronDown,
  ChevronUp,
  Tag,
  Store
} from 'lucide-react';
import { AuditSession, AuditProductResult, Product } from '../../types';
import { parsePurchaseReportFile, PurchaseReportParseResult, PurchaseParsedItem } from '../../utils/purchaseParser';
import { saveAuditSessionDB, saveAuditResultsDB } from '../../utils/indexedDB';

interface DailyPurchaseImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  selectedStoreId: string;
  existingSessions: AuditSession[];
  isDarkMode?: boolean;
  onAuditCreated: (session: AuditSession, results: AuditProductResult[]) => void;
}

export const DailyPurchaseImportModal: React.FC<DailyPurchaseImportModalProps> = ({
  isOpen,
  onClose,
  products,
  selectedStoreId,
  existingSessions,
  isDarkMode,
  onAuditCreated,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsedData, setParsedData] = useState<PurchaseReportParseResult | null>(null);

  // Editable Meta
  const [storeName, setStoreName] = useState<string>('PATAN');
  const [reportPeriod, setReportPeriod] = useState<string>('');
  const [auditDate, setAuditDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [customTitle, setCustomTitle] = useState<string>('');
  const [showInvalidDetails, setShowInvalidDetails] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const handleFileChange = async (selectedFile: File) => {
    setFile(selectedFile);
    setIsParsing(true);
    setParseError(null);
    setParsedData(null);

    try {
      const result = await parsePurchaseReportFile(selectedFile, products);
      setParsedData(result);
      setStoreName(result.detectedStore || (selectedStoreId === 'store_1' ? 'PATAN' : 'PATAN'));
      setReportPeriod(result.reportPeriod);
      setAuditDate(result.detectedAuditDate || new Date().toISOString().slice(0, 10));
      setCustomTitle(`Daily Purchase Audit — ${result.detectedStore || 'PATAN'} — ${result.reportPeriod}`);
    } catch (err: any) {
      console.error('Failed to parse purchase file:', err);
      setParseError(err.message || 'Failed to parse purchase report. Please check file format.');
    } finally {
      setIsParsing(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  // Check for duplicate report warnings
  const duplicateWarning = React.useMemo(() => {
    if (!parsedData || !reportPeriod) return null;
    const cleanPeriod = reportPeriod.trim().toLowerCase();
    const existing = existingSessions.find(
      (s) =>
        s.type === 'daily_purchase' &&
        ((s.reportPeriod && s.reportPeriod.trim().toLowerCase() === cleanPeriod) ||
          (s.title && s.title.toLowerCase().includes(cleanPeriod)))
    );
    if (existing) {
      const createdDate = new Date(existing.createdAt).toLocaleDateString('en-GB');
      return `Warning: A Daily Purchase Audit for report period "${existing.reportPeriod || reportPeriod}" was already imported on ${createdDate} ("${existing.title}"). Creating this will add a separate new audit session.`;
    }
    return null;
  }, [parsedData, reportPeriod, existingSessions]);

  const handleConfirmCreate = async () => {
    if (!parsedData || parsedData.items.length === 0) return;
    setIsCreating(true);

    try {
      const storeIdToUse = selectedStoreId || 'store_1';
      const finalTitle = customTitle.trim() || `Daily Purchase Audit — ${storeName} — ${reportPeriod}`;
      const productIds = parsedData.items.map((it) => it.id);
      const sessionId = `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const now = new Date().toISOString();

      const session: AuditSession = {
        id: sessionId,
        storeId: storeIdToUse,
        title: finalTitle,
        type: 'daily_purchase',
        reportPeriod: reportPeriod.trim(),
        auditDate: auditDate.trim(),
        purchaseMeta: {
          reportTitle: parsedData.reportTitle,
          storeName: storeName.trim(),
          periodStr: reportPeriod.trim(),
          auditDateStr: auditDate.trim(),
          totalRowsRead: parsedData.validation.totalRowsRead,
          uniqueProductsCount: parsedData.validation.uniqueProductsCount,
          invalidRowsCount: parsedData.validation.invalidRowsCount,
          fileName: file?.name,
        },
        status: 'in_progress',
        createdAt: now,
        totalItems: parsedData.items.length,
        completedCount: 0,
        flaggedCount: 0,
        doneCount: 0,
        pendingCount: parsedData.items.length,
        resolvedCount: 0,
        productIds,
        currentIndex: 0,
      };

      // Create frozen AuditProductResult snapshots for each item
      const initialResults: AuditProductResult[] = parsedData.items.map((item, idx) => ({
        id: `${sessionId}_${item.id}`,
        auditId: sessionId,
        productId: item.id,
        storeId: storeIdToUse,
        barcode: item.barcode || '',
        productName: item.productName,
        mainCode: item.mainCode,
        bansalCode: item.bansalCode,
        code: item.bansalCode,
        localCode: item.bansalCode,
        category: item.category || 'General',
        brand: item.brand,
        purchaseQty: item.purchaseQty,
        purchasedQty: item.purchaseQty,
        freeQty: item.freeQty,
        suppliersList: item.suppliersList,
        supplierName: item.supplierName || (item.suppliersList[0]?.supplierName),
        supplier: item.supplierName || (item.suppliersList[0]?.supplierName),
        mrp: item.mrp,
        costPrice: item.costPrice,
        retailPrice: item.retailPrice,
        lastPurchaseDate: item.lastPurchaseDate || undefined,
        isAmbiguousMatch: item.isAmbiguousMatch ? true : undefined,
        status: 'pending',
        productOrder: idx + 1,
      }));

      await saveAuditSessionDB(session);
      await saveAuditResultsDB(initialResults);

      onAuditCreated(session, initialResults);
      onClose();
    } catch (err: any) {
      console.error('Failed to create daily purchase audit session:', err);
      alert('Error creating audit session: ' + (err.message || String(err)));
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs overflow-y-auto">
      <div
        className={`w-full max-w-3xl rounded-2xl border shadow-2xl transition-all overflow-hidden my-auto ${
          isDarkMode
            ? 'bg-slate-900 border-slate-800 text-slate-100'
            : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-600 text-white shadow-xs">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-base sm:text-lg text-slate-900 dark:text-white">
                Import Daily Purchase Report
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Support for "Purchase Summary – Item Wise" (PURCHASE_ITEM_SUMMARY.XLS)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-5 max-h-[75vh] overflow-y-auto">
          {/* File Upload Zone */}
          {!parsedData ? (
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
                isParsing
                  ? 'border-indigo-400 bg-indigo-50/20 animate-pulse'
                  : 'border-slate-300 dark:border-slate-700 hover:border-indigo-500 hover:bg-indigo-50/10'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xls,.xlsx,.csv"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFileChange(e.target.files[0]);
                  }
                }}
              />

              <div className="w-12 h-12 mx-auto rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-3">
                <FileSpreadsheet className="w-6 h-6" />
              </div>

              <h3 className="font-bold text-sm sm:text-base text-slate-800 dark:text-slate-200 mb-1">
                {isParsing ? 'Validating & Reading Purchase Summary...' : 'Select or drop PURCHASE_ITEM_SUMMARY.XLS'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                Works with PATAN Item Wise Purchase Summary Excel (.xls, .xlsx) or CSV files.
              </p>
            </div>
          ) : (
            /* Parsed Preview and Audit Configuration */
            <div className="space-y-4">
              {/* File Info Bar */}
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center justify-between flex-wrap gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                  <span className="font-bold text-slate-900 dark:text-white">{file?.name}</span>
                  <span className="text-slate-400">({(file ? file.size / 1024 : 0).toFixed(1)} KB)</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setParsedData(null);
                    setFile(null);
                  }}
                  className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-semibold"
                >
                  Upload different file
                </button>
              </div>

              {/* Duplicate Warning if applicable */}
              {duplicateWarning && (
                <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800/80 text-amber-800 dark:text-amber-300 text-xs flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold block">Previous Import Detected</span>
                    <span>{duplicateWarning}</span>
                  </div>
                </div>
              )}

              {/* Validation Counters (3 KPI Pills) */}
              <div className="grid grid-cols-3 gap-2.5">
                <div className="p-3 rounded-xl bg-indigo-50/60 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/60 text-center">
                  <span className="text-[10.5px] font-semibold text-slate-500 dark:text-slate-400 block uppercase">
                    Rows Read
                  </span>
                  <span className="text-lg sm:text-xl font-extrabold text-indigo-700 dark:text-indigo-300">
                    {parsedData.validation.totalRowsRead}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-900/60 text-center">
                  <span className="text-[10.5px] font-semibold text-slate-500 dark:text-slate-400 block uppercase">
                    Unique Products
                  </span>
                  <span className="text-lg sm:text-xl font-extrabold text-emerald-700 dark:text-emerald-300">
                    {parsedData.validation.uniqueProductsCount}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-center">
                  <span className="text-[10.5px] font-semibold text-slate-500 dark:text-slate-400 block uppercase">
                    Invalid Rows
                  </span>
                  <span className={`text-lg sm:text-xl font-extrabold ${parsedData.validation.invalidRowsCount > 0 ? 'text-rose-600' : 'text-slate-700 dark:text-slate-300'}`}>
                    {parsedData.validation.invalidRowsCount}
                  </span>
                </div>
              </div>

              {/* Invalid Rows expandable details */}
              {parsedData.validation.invalidRowsCount > 0 && (
                <div className="border border-rose-200 dark:border-rose-900/60 rounded-xl p-2.5 bg-rose-50/30 dark:bg-rose-950/20 text-xs space-y-2">
                  <button
                    type="button"
                    onClick={() => setShowInvalidDetails(!showInvalidDetails)}
                    className="flex items-center justify-between w-full font-bold text-rose-700 dark:text-rose-300 cursor-pointer"
                  >
                    <span>View {parsedData.validation.invalidRowsCount} skipped row(s)</span>
                    {showInvalidDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                  {showInvalidDetails && (
                    <div className="max-h-28 overflow-y-auto space-y-1 pt-1 border-t border-rose-200 dark:border-rose-900">
                      {parsedData.validation.invalidRows.map((inv, idx) => (
                        <div key={idx} className="text-[11px] text-slate-600 dark:text-slate-300">
                          <strong>Row {inv.rowNumber}:</strong> {inv.reason} ({inv.rawSnippet})
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Meta Confirmation Form */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3 bg-white dark:bg-slate-900">
                <h4 className="font-bold text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Confirm Report Details & Audit Scope
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Store Name */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Store Name
                    </label>
                    <input
                      type="text"
                      value={storeName}
                      onChange={(e) => setStoreName(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-medium"
                      placeholder="e.g. PATAN"
                    />
                  </div>

                  {/* Report Period */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Report Period
                    </label>
                    <input
                      type="text"
                      value={reportPeriod}
                      onChange={(e) => setReportPeriod(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-medium"
                      placeholder="e.g. 01/10/2026 to 03/10/2026"
                    />
                  </div>

                  {/* Audit Date */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Audit Date
                    </label>
                    <input
                      type="date"
                      value={auditDate}
                      onChange={(e) => setAuditDate(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-medium"
                    />
                  </div>
                </div>

                {/* Audit Title */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Audit Session Title
                  </label>
                  <input
                    type="text"
                    value={customTitle}
                    onChange={(e) => setCustomTitle(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-medium"
                    placeholder="Audit Title"
                  />
                </div>
              </div>

              {/* Product Preview Sample (First 6 items) */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-600 dark:text-slate-300 px-0.5">
                  <span>Imported SKUs Preview ({parsedData.items.length} Total)</span>
                  <span className="text-[11px] text-slate-400">Showing first 6</span>
                </div>

                <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden divide-y divide-slate-100 dark:divide-slate-800 max-h-48 overflow-y-auto">
                  {parsedData.items.slice(0, 6).map((it, idx) => (
                    <div key={idx} className="p-2.5 text-xs flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                          <span className="font-mono text-[11px] font-bold text-indigo-600 dark:text-indigo-400">
                            {it.bansalCode}
                          </span>
                          {it.mainCode && (
                            <span className="px-1.5 py-0.2 text-[9.5px] rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                              {it.mainCode}
                            </span>
                          )}
                          <span className="px-1.5 py-0.2 text-[9.5px] rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                            {it.category}
                          </span>
                        </div>
                        <p className="font-medium text-slate-900 dark:text-white truncate">
                          {it.productName}
                        </p>
                        <div className="flex items-center gap-2 text-[10.5px] text-slate-400 truncate flex-wrap">
                          <span>
                            {it.suppliersList.length > 1
                              ? `${it.suppliersList.length} Suppliers: ${it.suppliersList.map((s) => s.supplierName).join(', ')}`
                              : it.supplierName || 'Direct Inward'}
                          </span>
                          <span>•</span>
                          <span>
                            Last Purchase: <strong className="text-slate-700 dark:text-slate-300 font-bold">{it.lastPurchaseDate ? it.lastPurchaseDate : 'Not Available'}</strong>
                          </span>
                          {it.isAmbiguousMatch && (
                            <span className="px-1.5 py-0.2 rounded bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 font-bold">
                              Ambiguous Stock Match
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="font-bold text-slate-900 dark:text-white">
                          Qty: {it.purchaseQty}
                        </div>
                        {it.freeQty > 0 && (
                          <span className="px-1.5 py-0.2 text-[9.5px] font-extrabold rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                            +{it.freeQty} Free
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Parse Error Box */}
          {parseError && (
            <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-300 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{parseError}</span>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>

          {parsedData && (
            <button
              type="button"
              disabled={isCreating}
              onClick={handleConfirmCreate}
              className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
            >
              {isCreating ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Creating Audit...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>Create Daily Purchase Audit ({parsedData.items.length} SKUs)</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
