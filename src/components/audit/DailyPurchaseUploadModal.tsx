import React, { useState, useRef } from 'react';
import {
  Upload,
  X,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  Calendar,
  Layers,
  ArrowRight,
  Package,
  AlertCircle,
  Truck,
  Building,
  Sparkles
} from 'lucide-react';
import { Product, AuditSession, AuditProductResult } from '../../types';
import { parsePurchaseReport, PurchaseReportParseResult } from '../../utils/purchaseReportParser';
import { createSession, checkDuplicatePurchaseReport } from '../../utils/auditStorage';

interface DailyPurchaseUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedStoreId: string;
  stockProducts: Product[];
  onAuditCreated: (session: AuditSession, results: AuditProductResult[]) => void;
  isDarkMode?: boolean;
}

export const DailyPurchaseUploadModal: React.FC<DailyPurchaseUploadModalProps> = ({
  isOpen,
  onClose,
  selectedStoreId,
  stockProducts,
  onAuditCreated,
  isDarkMode = false
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [parseResult, setParseResult] = useState<PurchaseReportParseResult | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  // Editable confirmation fields
  const [storeName, setStoreName] = useState('PATAN');
  const [reportPeriod, setReportPeriod] = useState('');
  const [auditDate, setAuditDate] = useState('');
  const [duplicateWarning, setDuplicateWarning] = useState<AuditSession | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const handleFileChange = async (selectedFile: File) => {
    setFile(selectedFile);
    setIsParsing(true);
    setParseError(null);
    setParseResult(null);
    setDuplicateWarning(null);

    try {
      const result = await parsePurchaseReport(selectedFile);
      setParseResult(result);
      setStoreName(result.detectedStore || 'PATAN');
      setReportPeriod(result.detectedPeriod || 'Current Period');
      setAuditDate(result.detectedDate || new Date().toLocaleDateString('en-GB'));

      // Check if duplicate report period exists
      const duplicate = await checkDuplicatePurchaseReport(
        selectedStoreId,
        result.detectedPeriod,
        selectedFile.name
      );
      if (duplicate) {
        setDuplicateWarning(duplicate);
      }
    } catch (err: any) {
      console.error('Failed to parse purchase summary file:', err);
      setParseError(err.message || 'Failed to read the purchase summary report.');
    } finally {
      setIsParsing(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  const handleCreateAudit = async () => {
    if (!parseResult || parseResult.validProducts.length === 0) return;
    setIsCreating(true);

    try {
      // Map parsed products into Product model for createSession
      const productsToAudit: Product[] = parseResult.validProducts.map((p) => {
        // Resolve current stock product barcode if safely matched by normalized code
        const matchedStock = stockProducts.find((sp) => {
          const spCode = (sp.bansalCode || sp.localCode || sp.code || '').trim();
          return spCode && spCode.toLowerCase() === p.code.toLowerCase();
        });

        const barcode = matchedStock?.barcode || '';

        return {
          id: p.id,
          barcode,
          name: p.name,
          itemName: p.name,
          bansalCode: p.code,
          localCode: p.code,
          code: p.code,
          mainCode: p.mainCode || matchedStock?.mainCode || 'General',
          category: p.category || matchedStock?.category || 'General',
          brand: p.brand || matchedStock?.brand || '',
          mrp: p.mrp || matchedStock?.mrp || 0,
          costPrice: p.costPrice || matchedStock?.costPrice || 0,
          cost: p.costPrice || matchedStock?.costPrice || 0,
          retailPrice: p.retailPrice || matchedStock?.retailPrice || (p.mrp || 0),
          stock: matchedStock?.stock ?? 0,
          closingStock: matchedStock?.stock ?? 0,
          salesCount: matchedStock?.salesCount ?? 0,
          purchaseQty: p.purchaseQty,
          purchasedQty: p.purchasedQty,
          freeQty: p.freeQty,
          supplierName: p.supplierName,
          supplier: p.supplierName,
          supplierEntries: p.supplierEntries,
          rawRowData: p.rawRowData
        } as any;
      });

      const cleanPeriod = reportPeriod.trim() || parseResult.detectedPeriod;
      const title = `Daily Purchase Audit — ${storeName} (${cleanPeriod})`;

      const { session, results } = await createSession({
        storeId: selectedStoreId,
        type: 'daily_purchase',
        title,
        products: productsToAudit,
        reportPeriod: cleanPeriod,
        purchaseMeta: {
          storeName: storeName.trim() || 'PATAN',
          periodStr: cleanPeriod,
          auditDateStr: auditDate.trim() || new Date().toLocaleDateString('en-GB'),
          totalRowsRead: parseResult.totalRowsRead,
          uniqueProductsCount: parseResult.uniqueProductsCount,
          invalidRowsCount: parseResult.invalidRowsCount,
          fileName: parseResult.fileName
        }
      });

      onAuditCreated(session, results);
      onClose();
    } catch (err: any) {
      console.error('Failed to create daily purchase audit session:', err);
      alert('Error creating audit session: ' + (err.message || String(err)));
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
      <div
        className={`w-full max-w-2xl rounded-2xl border shadow-2xl overflow-hidden flex flex-col max-h-[92vh] ${
          isDarkMode ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        {/* Header */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/80 dark:bg-slate-800/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-600 text-white shadow-xs">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black tracking-tight text-slate-900 dark:text-white">
                Daily Purchase Audit Import
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Support for Purchase Summary – Item Wise (PATAN)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
          {/* File Upload Box (if no file parsed yet or want to re-upload) */}
          {!parseResult ? (
            <div
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`p-6 sm:p-8 rounded-2xl border-2 border-dashed text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-3 ${
                isParsing
                  ? 'border-indigo-500 bg-indigo-50/30 dark:bg-indigo-950/20'
                  : 'border-slate-300 dark:border-slate-700 hover:border-indigo-500 dark:hover:border-indigo-400 bg-slate-50/50 dark:bg-slate-800/30'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFileChange(e.target.files[0]);
                  }
                }}
                className="hidden"
              />

              <div className="w-12 h-12 rounded-2xl bg-indigo-100 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                <FileSpreadsheet className="w-6 h-6" />
              </div>

              <div className="space-y-1 max-w-sm">
                <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                  {isParsing ? 'Reading Purchase Summary File...' : 'Upload PURCHASE_ITEM_SUMMARY.XLS'}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Drag & drop or click to browse (.xlsx, .xls, .csv)
                </p>
              </div>

              {isParsing && (
                <div className="flex items-center gap-2 text-xs text-indigo-600 dark:text-indigo-400 font-semibold animate-pulse">
                  <span>Parsing rows, items, quantities & suppliers...</span>
                </div>
              )}
            </div>
          ) : (
            /* Parsed File Preview & Confirmation Screen */
            <div className="space-y-4">
              {/* File details banner */}
              <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="font-bold text-slate-800 dark:text-slate-200 truncate">
                    {parseResult.fileName}
                  </span>
                </div>
                <button
                  onClick={() => {
                    setParseResult(null);
                    setFile(null);
                  }}
                  className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                >
                  Change File
                </button>
              </div>

              {/* 3 Preview Counts */}
              <div className="grid grid-cols-3 gap-2.5">
                <div className="p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-900 text-center">
                  <span className="text-[11px] font-bold text-indigo-700 dark:text-indigo-300 block">Rows Read</span>
                  <span className="text-lg font-black text-indigo-900 dark:text-indigo-100">{parseResult.totalRowsRead}</span>
                </div>
                <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-center">
                  <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 block">Unique Products</span>
                  <span className="text-lg font-black text-emerald-900 dark:text-emerald-100">{parseResult.uniqueProductsCount}</span>
                </div>
                <div className={`p-3 rounded-xl border text-center ${
                  parseResult.invalidRowsCount > 0 
                    ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900' 
                    : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                }`}>
                  <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block">Invalid Rows</span>
                  <span className={`text-lg font-black ${parseResult.invalidRowsCount > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-slate-700 dark:text-slate-300'}`}>
                    {parseResult.invalidRowsCount}
                  </span>
                </div>
              </div>

              {/* Duplicate Warning Banner if already imported */}
              {duplicateWarning && (
                <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-xs flex items-start gap-2.5">
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <p className="font-bold">Identical Report Period Already Imported</p>
                    <p className="text-[11px] text-amber-800 dark:text-amber-300">
                      An audit for period <span className="font-semibold">"{duplicateWarning.reportPeriod}"</span> already exists (created on {new Date(duplicateWarning.createdAt).toLocaleDateString('en-IN')}). Proceeding will create a separate audit session.
                    </p>
                  </div>
                </div>
              )}

              {/* Period and Audit Date Confirmation */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-850">
                <div>
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                    Store Location
                  </label>
                  <input
                    type="text"
                    value={storeName}
                    onChange={(e) => setStoreName(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold"
                    placeholder="e.g. PATAN"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                    Report Period
                  </label>
                  <input
                    type="text"
                    value={reportPeriod}
                    onChange={(e) => setReportPeriod(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold"
                    placeholder="e.g. 01/10/2026 To 03/10/2026"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                    Audit Date
                  </label>
                  <input
                    type="text"
                    value={auditDate}
                    onChange={(e) => setAuditDate(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold"
                    placeholder="e.g. 03/10/2026"
                  />
                </div>
              </div>

              {/* Top Products Preview List */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
                  <span>Imported SKUs Preview (Top 5 of {parseResult.validProducts.length}):</span>
                  <span className="text-[11px] text-slate-500 font-normal">Codes preserved as text</span>
                </div>

                <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {parseResult.validProducts.slice(0, 5).map((p, idx) => (
                    <div key={p.id || idx} className="p-2.5 flex items-center justify-between gap-2 bg-white dark:bg-slate-900/50">
                      <div className="min-w-0">
                        <p className="font-bold text-slate-900 dark:text-white truncate">
                          {p.name}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                          Code: <strong className="text-slate-700 dark:text-slate-300">{p.code}</strong> • {p.mainCode} &gt; {p.category}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="px-2 py-0.5 rounded font-mono font-bold bg-indigo-100 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-200 text-xs">
                          {p.purchasedQty} Qty
                        </span>
                        {p.freeQty > 0 && (
                          <span className="ml-1 px-1.5 py-0.5 rounded font-mono text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-200">
                            +{p.freeQty} Free
                          </span>
                        )}
                        <p className="text-[10px] text-slate-400 truncate max-w-[140px] mt-0.5">
                          {p.supplierName}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Parse error alert */}
          {parseError && (
            <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-300 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Failed to import Purchase Summary</p>
                <p className="text-[11px] mt-0.5">{parseError}</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/60 flex items-center justify-between gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all cursor-pointer"
          >
            Cancel
          </button>

          {parseResult && (
            <button
              onClick={handleCreateAudit}
              disabled={isCreating || parseResult.validProducts.length === 0}
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs shadow-md transition-all cursor-pointer active:scale-95 flex items-center gap-2 disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>
                {isCreating ? 'Creating Audit Session...' : `START PURCHASE AUDIT (${parseResult.validProducts.length} SKUs)`}
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
