import React, { useState, useRef } from 'react';
import { 
  FileSpreadsheet, 
  CheckCircle2, 
  Table,
  Sparkles,
  Calendar,
  RotateCcw,
  ArrowRight
} from 'lucide-react';
import { parseStockReportFile, convertRowsToProducts, cleanBarcode } from '../utils/fileParser';
import { ColumnMapping, Product, StockReportMeta, UploadProgressData } from '../types';
import { getApiBaseUrl, getApiUrl, isAndroidNative, isElectronDesktop } from '../utils/platform';
import { 
  UploadModalShell, 
  UploadDropZone, 
  UploadProgressView, 
  UploadSuccessView, 
  UploadErrorBanner 
} from './upload';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (
    products: Product[],
    meta: StockReportMeta,
    storeId: string,
    onProgress?: (progress: UploadProgressData) => void,
    fallbackToLocal?: boolean
  ) => Promise<void> | void;
  targetStoreId?: string;
  targetStoreName?: string;
  isDarkMode?: boolean;
}

export const UploadModal: React.FC<UploadModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  targetStoreId = 'store_1',
  isDarkMode = false
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [error, setError] = useState<{ what: string; action?: string } | null>(null);
  const [step, setStep] = useState<'select' | 'review' | 'success'>('select');
  const [reportDays, setReportDays] = useState<number>(30);
  const [detectedDateRangeStr, setDetectedDateRangeStr] = useState<string | null>(null);
  
  const [headers, setHeaders] = useState<string[]>([]);
  const [parsedRows, setParsedRows] = useState<Record<string, any>[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({
    barcode: '',
    name: '',
    category: '',
    mainCode: '',
    mrp: '',
    retailPrice: '',
    salePrice: '',
    stock: '',
    salesCount: ''
  });

  const selectedFileNameRef = useRef<string>('REG-STAT.CSV');
  const [isImporting, setIsImporting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgressData | null>(null);
  const [savedMeta, setSavedMeta] = useState<StockReportMeta | null>(null);
  const [savedProductsCount, setSavedProductsCount] = useState<number>(0);

  if (!isOpen) return null;

  const handleReset = () => {
    setFile(null);
    setIsParsing(false);
    setError(null);
    setStep('select');
    setUploadProgress(null);
    setIsImporting(false);
    setSavedMeta(null);
    setSavedProductsCount(0);
    setParsedRows([]);
    setHeaders([]);
  };

  const handleFinish = () => {
    handleReset();
    onClose();
  };

  const handleFileChange = async (selectedFile: File) => {
    if (!selectedFile) return;
    setError(null);
    setUploadProgress(null);
    setFile(selectedFile);
    if (selectedFile.name) {
      selectedFileNameRef.current = selectedFile.name;
    }

    // Image scan via AI
    if (selectedFile.type.startsWith('image/')) {
      await handleAiImageScan(selectedFile);
      return;
    }

    setIsParsing(true);

    try {
      const { headers: parsedHeaders, rows, detectedMapping, detectedReportDays, detectedDateRangeStr } = await parseStockReportFile(selectedFile);
      
      if (!rows || rows.length === 0) {
        throw new Error('No readable data rows found in this file.');
      }

      setHeaders(parsedHeaders);
      setParsedRows(rows);
      setMapping(detectedMapping);
      if (detectedReportDays && detectedReportDays > 0) {
        setReportDays(detectedReportDays);
      } else {
        setReportDays(30);
      }
      setDetectedDateRangeStr(detectedDateRangeStr || null);
      setStep('review');
    } catch (err: any) {
      setError({
        what: err.message || 'Failed to process file.',
        action: 'Please ensure file is an Excel (.xlsx, .xls) or CSV with header columns.'
      });
      setFile(null);
    } finally {
      setIsParsing(false);
    }
  };

  const handleAiImageScan = async (selectedFile: File) => {
    setError(null);
    setIsParsing(true);
    setUploadProgress(null);

    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          if (isAndroidNative() && !getApiBaseUrl()) {
            throw new Error('AI image scanning requires VITE_API_BASE_URL to be configured for the Android build. Please upload CSV/Excel offline instead.');
          }
          if (isElectronDesktop() && !getApiBaseUrl()) {
            throw new Error('AI invoice scanning requires an active server connection. Please connect to a hosted server or upload Excel/CSV files offline instead.');
          }

          const base64Url = e.target?.result as string;
          const base64Data = base64Url.split(',')[1];
          const mimeType = selectedFile.type || 'image/jpeg';

          const res = await fetch(getApiUrl('/api/gemini/scan-invoice'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageBase64: base64Data, mimeType }),
          });

          let data: any = null;
          try {
            data = await res.json();
          } catch {
            if (!res.ok) {
              throw new Error(`AI service error (HTTP ${res.status}). Check server URL or internet connection.`);
            }
            throw new Error('Unexpected response from AI service.');
          }

          if (!res.ok || !data?.success) {
            throw new Error(data?.message || `AI failed to scan invoice (HTTP ${res.status}).`);
          }

          if (!data.products || data.products.length === 0) {
            throw new Error('No items detected in image.');
          }

          const extractedProducts: Product[] = data.products.map((p: any, idx: number) => ({
            id: `ai_${Date.now()}_${idx}`,
            barcode: p.barcode ? cleanBarcode(p.barcode) : `${Math.floor(100000000000 + Math.random() * 900000000000)}`,
            name: p.name || 'Unnamed Item',
            mrp: Number(p.mrp) || Number(p.salePrice) || 0,
            costPrice: Number(p.costPrice) || 0,
            retailPrice: Number(p.retailPrice) || Number(p.salePrice) || Number(p.mrp) || 0,
            salePrice: Number(p.salePrice) || Number(p.retailPrice) || Number(p.mrp) || 0,
            stock: Number(p.stock) > 0 ? Number(p.stock) : 1,
            category: p.category || 'General'
          }));

          let totalVal = 0;
          extractedProducts.forEach(p => { totalVal += p.salePrice * p.stock; });

          const selectedName = selectedFile.name + ' (AI Magic Extracted)';
          const meta: StockReportMeta = {
            fileName: selectedName,
            filename: selectedFile.name || selectedName,
            uploadedAt: new Date().toISOString(),
            totalProducts: extractedProducts.length,
            totalCategories: new Set(extractedProducts.map(p => p.category)).size,
            totalStockValue: totalVal,
            reportDays: 30,
            reportPeriodText: '30 Days Report'
          };

          setIsImporting(true);
          setUploadProgress({
            stage: 'Reading File',
            percent: 30,
            productsProcessed: 0,
            totalProducts: extractedProducts.length,
            chunksUploaded: 1,
            totalChunks: 1,
            batchUploaded: 1,
            totalBatches: 1
          });

          await onSuccess(extractedProducts, meta, targetStoreId, (progress) => {
            setUploadProgress(progress);
            if (progress.failed) {
              setError({
                what: progress.error || 'Failed to save scanned data.',
                action: 'Try again or upload as CSV/Excel.'
              });
            }
          });

          setSavedMeta(meta);
          setSavedProductsCount(extractedProducts.length);
          setStep('success');
          setIsImporting(false);
        } catch (err: any) {
          setError({
            what: err.message || 'AI invoice scan error.',
            action: 'Ensure image has clear lighting and readable table columns.'
          });
          setIsImporting(false);
        } finally {
          setIsParsing(false);
        }
      };
      reader.readAsDataURL(selectedFile);
    } catch (err: any) {
      setError({
        what: err.message || 'Failed to read image file.',
        action: 'Please select a valid image file.'
      });
      setIsParsing(false);
      setIsImporting(false);
    }
  };

  const handleConfirmMapping = async () => {
    if (!mapping.name && !mapping.barcode) {
      setError({
        what: 'Missing required column mapping.',
        action: 'Please select Product Name or Barcode column.'
      });
      return;
    }

    const products = convertRowsToProducts(parsedRows, mapping);
    if (products.length === 0) {
      setError({
        what: 'No valid products could be extracted.',
        action: 'Adjust column mappings to match your file headers.'
      });
      return;
    }

    setIsImporting(true);
    setError(null);
    setUploadProgress({
      stage: 'Reading File',
      percent: 25,
      productsProcessed: 0,
      totalProducts: products.length,
      chunksUploaded: 1,
      totalChunks: 1,
      batchUploaded: 1,
      totalBatches: 1
    });

    try {
      let totalStockVal = 0;
      for (let i = 0; i < products.length; i++) {
        const p = products[i];
        totalStockVal += (p.salePrice || p.mrp || 0) * (p.stock || 0);
      }

      const selectedFileName = file?.name || selectedFileNameRef.current || 'REG-STAT.CSV';
      const meta: StockReportMeta = {
        fileName: selectedFileName,
        filename: selectedFileName,
        uploadedAt: new Date().toISOString(),
        totalProducts: products.length,
        totalCategories: new Set(products.map(p => p.category || 'General')).size,
        totalStockValue: totalStockVal,
        reportDays: reportDays,
        reportPeriodText: `${reportDays} Days Report${detectedDateRangeStr ? ` (${detectedDateRangeStr})` : ''}`
      };

      await onSuccess(products, meta, targetStoreId, (progress) => {
        setUploadProgress(progress);
        if (progress.failed) {
          setError({
            what: progress.error || 'Failed during local stock activation.',
            action: 'Existing active stock remains safe. Please try re-activating.'
          });
        }
      });

      setSavedMeta(meta);
      setSavedProductsCount(products.length);
      setStep('success');
    } catch (err: any) {
      setError({
        what: err.message || 'Error activating stock report.',
        action: 'Please check your file and try again.'
      });
      setUploadProgress(prev => prev ? { ...prev, failed: true, error: err.message } : null);
    } finally {
      setIsImporting(false);
    }
  };

  const getCurrentStepNumber = (): 1 | 2 | 3 | 4 => {
    if (step === 'success') return 4;
    if (isImporting) return 4;
    if (step === 'review') return 3;
    if (isParsing) return 2;
    return 1;
  };

  return (
    <UploadModalShell
      isOpen={isOpen}
      onClose={step === 'success' ? handleFinish : onClose}
      icon={<FileSpreadsheet className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
      title={
        step === 'success'
          ? 'Stock Report Activated'
          : isImporting
          ? 'Activating Stock Report'
          : step === 'review'
          ? 'Review Stock Columns'
          : 'Upload / Replace Stock Report'
      }
      subtitle={
        step === 'success'
          ? 'Inventory active offline for search & checks'
          : isImporting
          ? `Saving ${file?.name || 'stock report'} to device`
          : step === 'review'
          ? `${parsedRows.length.toLocaleString('en-IN')} rows in ${file?.name || 'file'}`
          : 'Upload Excel (.xlsx, .xls) or CSV inventory file'
      }
      badge={{
        text: '100% Offline',
        variant: 'emerald'
      }}
      currentStep={getCurrentStepNumber()}
      stepLabels={['Select File', 'Validate', 'Review', 'Complete']}
      isProcessing={isImporting}
      isDarkMode={isDarkMode}
      footerLeft={
        step === 'review' && !isImporting ? (
          <button
            type="button"
            onClick={handleReset}
            className="text-[11px] font-semibold text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white flex items-center gap-1 cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Change File</span>
          </button>
        ) : null
      }
      footerRight={
        step === 'success' ? null : step === 'review' && !isImporting ? (
          <>
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmMapping}
              disabled={isImporting || parsedRows.length === 0}
              className="px-3.5 py-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg shadow-xs transition-all flex items-center gap-1 cursor-pointer active:scale-98"
            >
              <span>Activate ({parsedRows.length.toLocaleString('en-IN')})</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </>
        ) : !isImporting ? (
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
          >
            Cancel
          </button>
        ) : null
      }
    >
      {/* Error Banner */}
      {error && !isImporting && (
        <UploadErrorBanner
          whatWentWrong={error.what}
          whatToDo={error.action}
          onDismiss={() => setError(null)}
          isDarkMode={isDarkMode}
        />
      )}

      {/* STEP 4 SUCCESS STATE */}
      {step === 'success' && savedMeta && (
        <UploadSuccessView
          title="✓ STOCK REPORT ACTIVATED"
          subtitle="Inventory products & pricing active offline."
          datasetName="Stock Report"
          fileName={savedMeta.fileName || savedMeta.filename || 'REG-STAT.CSV'}
          metrics={[
            { label: 'Products', value: savedProductsCount, highlight: 'emerald' },
            { label: 'Period', value: `${savedMeta.reportDays || reportDays} Days`, highlight: 'indigo' },
            { label: 'Categories', value: savedMeta.totalCategories || 'Auto', highlight: 'default' },
            { label: 'Rejected', value: 0, highlight: 'default' }
          ]}
          activatedTime={savedMeta.uploadedAt}
          onDone={handleFinish}
          isDarkMode={isDarkMode}
        />
      )}

      {/* STEP 4 PROCESSING / PROGRESS VIEW */}
      {isImporting && uploadProgress && (
        <UploadProgressView
          stage={uploadProgress.stage}
          percent={uploadProgress.percent}
          failed={uploadProgress.failed}
          error={uploadProgress.error}
          totalProducts={uploadProgress.totalProducts || parsedRows.length}
          datasetName="Stock Report"
          isDarkMode={isDarkMode}
        />
      )}

      {/* STEP 1: DROP ZONE */}
      {step === 'select' && !isImporting && (
        <div className="space-y-2">
          <UploadDropZone
            onFileSelected={handleFileChange}
            acceptedExtensions=".csv,.xlsx,.xls,.tsv,.txt,image/*"
            acceptedFormatsText=".xlsx / .xls / .csv"
            title="Tap to select or drop Stock Report"
            subtitle="Expected: Barcode/SKU, Name, MRP, Retail, Stock"
            expectedColumns={['Barcode / SKU', 'Name', 'MRP', 'Retail Price', 'Stock']}
            isParsing={isParsing}
            parsingText="Reading & validating Stock Report..."
            isDarkMode={isDarkMode}
            selectedFile={file}
          />
        </div>
      )}

      {/* STEP 3: REVIEW & MAP */}
      {step === 'review' && !isImporting && (
        <div className="space-y-1.5">
          {/* File & Validation Summary Pill */}
          <div className="px-2 py-1 bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-800/60 rounded-lg flex items-center justify-between gap-2 text-xs">
            <span className="font-bold text-emerald-950 dark:text-emerald-200 truncate text-[11px]">
              {file?.name || 'Stock File'}
            </span>
            <span className="bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 text-[10px] font-bold px-1.5 py-0.2 rounded shrink-0">
              {parsedRows.length.toLocaleString('en-IN')} Valid Rows
            </span>
          </div>

          {/* Report Duration Selector */}
          <div className="bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800/60 rounded-lg px-2 py-1 space-y-1">
            <div className="flex items-center justify-between gap-1">
              <div className="flex items-center gap-1">
                <Calendar className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
                <span className="text-[10px] font-bold text-indigo-950 dark:text-indigo-200 uppercase tracking-wide">
                  Duration
                </span>
              </div>

              {detectedDateRangeStr && (
                <span className="bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200 border border-amber-300 dark:border-amber-700 text-[9.5px] font-bold px-1.5 py-0.2 rounded-full flex items-center gap-0.5">
                  <Sparkles className="w-2.5 h-2.5 text-amber-600 dark:text-amber-400" />
                  <span>{detectedDateRangeStr}</span>
                </span>
              )}
            </div>

            <div className="grid grid-cols-6 gap-1">
              {[
                { label: '1d', days: 1 },
                { label: '7d', days: 7 },
                { label: '15d', days: 15 },
                { label: '30d', days: 30 },
                { label: '60d', days: 60 },
                { label: '90d', days: 90 },
              ].map((opt) => (
                <button
                  key={opt.days}
                  type="button"
                  onClick={() => setReportDays(opt.days)}
                  className={`py-0.5 px-0.5 rounded text-[10.5px] font-bold transition-all cursor-pointer border flex items-center justify-center text-center ${
                    reportDays === opt.days
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                      : isDarkMode
                      ? 'bg-slate-800 text-slate-300 border-slate-700 hover:border-indigo-500'
                      : 'bg-white text-slate-700 border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/50'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Mapping Controls Grid */}
          <div className="space-y-0.5">
            <span className="text-[9.5px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
              Column Mapping
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 text-[10px]">
              {/* Barcode / SKU */}
              <div className="bg-slate-50 dark:bg-slate-800/50 px-1.5 py-1 rounded border border-slate-200 dark:border-slate-700">
                <span className="text-slate-700 dark:text-slate-300 font-semibold block truncate">
                  Barcode *
                </span>
                <select
                  value={mapping.barcode}
                  onChange={(e) => setMapping({ ...mapping, barcode: e.target.value })}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded p-0.5 text-[10px] mt-0.5"
                >
                  <option value="">-- Select --</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </div>

              {/* Product Name */}
              <div className="bg-slate-50 dark:bg-slate-800/50 px-1.5 py-1 rounded border border-slate-200 dark:border-slate-700">
                <span className="text-slate-700 dark:text-slate-300 font-semibold block truncate">
                  Name *
                </span>
                <select
                  value={mapping.name}
                  onChange={(e) => setMapping({ ...mapping, name: e.target.value })}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded p-0.5 text-[10px] mt-0.5"
                >
                  <option value="">-- Select --</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </div>

              {/* Category */}
              <div className="bg-slate-50 dark:bg-slate-800/50 px-1.5 py-1 rounded border border-slate-200 dark:border-slate-700">
                <span className="text-slate-700 dark:text-slate-300 font-semibold block truncate">Category</span>
                <select
                  value={mapping.category || ''}
                  onChange={(e) => setMapping({ ...mapping, category: e.target.value })}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded p-0.5 text-[10px] mt-0.5"
                >
                  <option value="">-- None --</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </div>

              {/* MRP */}
              <div className="bg-slate-50 dark:bg-slate-800/50 px-1.5 py-1 rounded border border-slate-200 dark:border-slate-700">
                <span className="text-slate-700 dark:text-slate-300 font-semibold block truncate">MRP</span>
                <select
                  value={mapping.mrp}
                  onChange={(e) => setMapping({ ...mapping, mrp: e.target.value })}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded p-0.5 text-[10px] mt-0.5"
                >
                  <option value="">-- None --</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </div>

              {/* Retail Price */}
              <div className="bg-slate-50 dark:bg-slate-800/50 px-1.5 py-1 rounded border border-slate-200 dark:border-slate-700">
                <span className="text-slate-700 dark:text-slate-300 font-semibold block truncate">Retail</span>
                <select
                  value={mapping.retailPrice}
                  onChange={(e) => setMapping({ ...mapping, retailPrice: e.target.value })}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded p-0.5 text-[10px] mt-0.5"
                >
                  <option value="">-- None --</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </div>

              {/* Stock Quantity */}
              <div className="bg-slate-50 dark:bg-slate-800/50 px-1.5 py-1 rounded border border-slate-200 dark:border-slate-700">
                <span className="text-slate-700 dark:text-slate-300 font-semibold block truncate">Stock</span>
                <select
                  value={mapping.stock}
                  onChange={(e) => setMapping({ ...mapping, stock: e.target.value })}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded p-0.5 text-[10px] mt-0.5"
                >
                  <option value="">-- None --</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Sample Preview Table */}
          {parsedRows.length > 0 && (
            <div>
              <div className="bg-slate-50 dark:bg-slate-800/40 px-1.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 overflow-x-auto text-[9.5px]">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="text-slate-400 border-b border-slate-200 dark:border-slate-700 text-[9px]">
                      <th className="py-0.2 px-1 font-semibold">Barcode</th>
                      <th className="py-0.2 px-1 font-semibold">Name</th>
                      <th className="py-0.2 px-1 font-semibold">MRP</th>
                      <th className="py-0.2 px-1 font-semibold">Retail</th>
                      <th className="py-0.2 px-1 font-semibold">Stock</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-800 dark:text-slate-200 divide-y divide-slate-200/50 dark:divide-slate-700/50">
                    {parsedRows.slice(0, 2).map((row, i) => (
                      <tr key={i}>
                        <td className="py-0.2 px-1 font-mono text-indigo-700 dark:text-indigo-400 font-semibold">{row[mapping.barcode] || 'Auto'}</td>
                        <td className="py-0.2 px-1 font-medium text-slate-900 dark:text-white truncate max-w-[120px]">{row[mapping.name] || 'N/A'}</td>
                        <td className="py-0.2 px-1 text-slate-500">{row[mapping.mrp] || '0'}</td>
                        <td className="py-0.2 px-1 text-slate-700 dark:text-slate-300">{row[mapping.retailPrice] || '0'}</td>
                        <td className="py-0.2 px-1 font-bold text-slate-900 dark:text-white">{row[mapping.stock] || '0'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </UploadModalShell>
  );
};
