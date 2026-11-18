import React, { useMemo, useState } from 'react';
import {
  Users,
  ShieldCheck,
  RotateCcw,
  ArrowRight,
  ArrowLeft,
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  Phone,
  GitCompare,
} from 'lucide-react';
import { PurchaseColumnMapping } from '../types';
import {
  ParsedPurchaseWorkbook,
  SheetHeaderAnalysis,
  PurchaseValidationResult,
  analyzePurchaseSheet,
  buildPurchaseMasterMeta,
  buildPurchaseResponsibilityImportPreview,
  parsePurchaseWorkbookFile,
} from '../utils/purchaseResponsibility';
import { usePurchaseContact } from '../context/PurchaseContactContext';
import {
  UploadModalShell,
  UploadDropZone,
  UploadSuccessView,
  UploadErrorBanner,
} from './upload';

interface PurchaseResponsibilityUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  isDarkMode?: boolean;
}

type PreviewFilterTab = 'all' | 'conflicts' | 'issues' | 'changes';

export const PurchaseResponsibilityUploadModal: React.FC<PurchaseResponsibilityUploadModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  isDarkMode = false,
}) => {
  const {
    meta: currentMeta,
    records: currentRecords,
    storageError,
    clearStorageError,
    replaceMaster,
  } = usePurchaseContact();

  const [file, setFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parsedWorkbook, setParsedWorkbook] = useState<ParsedPurchaseWorkbook | null>(null);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [sheetAnalysis, setSheetAnalysis] = useState<SheetHeaderAnalysis | null>(null);
  const [mapping, setMapping] = useState<PurchaseColumnMapping>({
    bansalCode: '',
    itemName: '',
    purchaseName: '',
    phone: '',
  });
  const [isConfirmStep, setIsConfirmStep] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [completedMeta, setCompletedMeta] = useState<{
    fileName: string;
    sheetName: string;
    importedAt: string;
    validAssignmentsCount: number;
    uniqueProductCodesCount: number;
    conflictingCodesCount: number;
    issuesCount: number;
  } | null>(null);
  const [error, setError] = useState<{ what: string; action?: string } | null>(null);
  const [previewTab, setPreviewTab] = useState<PreviewFilterTab>('all');
  const [baselineRecords, setBaselineRecords] = useState(currentRecords);

  // Freeze baseline previousRecords while a file session is open so saving doesn't trigger a redundant full re-diff
  React.useEffect(() => {
    if (isOpen && !parsedWorkbook && !completedMeta) {
      setBaselineRecords(currentRecords);
    }
  }, [isOpen, parsedWorkbook, completedMeta, currentRecords]);

  // Validation preview computed live whenever sheet, header analysis, or mapping changes
  const validation: PurchaseValidationResult | null = useMemo(() => {
    if (!parsedWorkbook || !selectedSheet || !sheetAnalysis || completedMeta) return null;
    const matrix = parsedWorkbook.getSheetMatrix
      ? parsedWorkbook.getSheetMatrix(selectedSheet)
      : parsedWorkbook.sheets[selectedSheet] || [];
    return buildPurchaseResponsibilityImportPreview({
      fileName: parsedWorkbook.fileName,
      sheetName: selectedSheet,
      matrix,
      headerRowIndex: sheetAnalysis.headerRowIndex,
      headers: sheetAnalysis.headers,
      mapping,
      previousRecords: baselineRecords,
    });
  }, [parsedWorkbook, selectedSheet, sheetAnalysis, mapping, baselineRecords, completedMeta]);

  const handleReset = () => {
    setFile(null);
    setIsParsing(false);
    setParsedWorkbook(null);
    setSelectedSheet('');
    setSheetAnalysis(null);
    setMapping({ bansalCode: '', itemName: '', purchaseName: '', phone: '' });
    setIsConfirmStep(false);
    setIsSaving(false);
    setCompletedMeta(null);
    setError(null);
    setPreviewTab('all');
  };

  const handleFinish = () => {
    handleReset();
    onClose();
  };

  const applySheetSelection = (wb: ParsedPurchaseWorkbook, sheetName: string) => {
    const matrix = wb.getSheetMatrix ? wb.getSheetMatrix(sheetName) : wb.sheets[sheetName] || [];
    const analysis = analyzePurchaseSheet(matrix);
    setSelectedSheet(sheetName);
    setSheetAnalysis(analysis);
    setMapping(analysis.mapping);
    setIsConfirmStep(false);
    setPreviewTab('all');
  };

  const handleFileSelected = async (selectedFile: File) => {
    if (!selectedFile) return;

    setError(null);
    setParsedWorkbook(null);
    setCompletedMeta(null);
    setIsConfirmStep(false);
    setFile(selectedFile);
    setIsParsing(true);

    try {
      const wb = await parsePurchaseWorkbookFile(selectedFile);
      setParsedWorkbook(wb);
      applySheetSelection(wb, wb.defaultSheetName);
    } catch (err: any) {
      setError({
        what: err?.message || 'Failed to read the uploaded file.',
        action:
          'Check that the file is a valid .xlsx, .xls, or .csv workbook. Your previous Purchase Responsibility Master was not changed.',
      });
      setFile(null);
    } finally {
      setIsParsing(false);
    }
  };

  const handleSheetChange = (nextSheet: string) => {
    if (!parsedWorkbook) return;
    setError(null);
    applySheetSelection(parsedWorkbook, nextSheet);
  };

  const handleConfirmReplace = async () => {
    if (!validation || !validation.isValidToActivate) {
      setError({
        what: validation?.blockingError || 'Cannot activate because no valid assignments were detected.',
        action: 'Verify the sheet selection and column mappings. Your existing master remains active.',
      });
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const nextMeta = buildPurchaseMasterMeta(validation);
      // Yield a paint frame so "Replacing Master..." renders smoothly before heavy IDB work
      await new Promise((resolve) => setTimeout(resolve, 0));
      await replaceMaster(nextMeta, validation.validRecords);
      setCompletedMeta({
        fileName: nextMeta.fileName,
        sheetName: nextMeta.sheetName,
        importedAt: nextMeta.importedAt,
        validAssignmentsCount: nextMeta.validAssignmentsCount,
        uniqueProductCodesCount: nextMeta.uniqueProductCodesCount,
        conflictingCodesCount: nextMeta.conflictingCodesCount,
        issuesCount: nextMeta.missingNameCount + nextMeta.missingOrInvalidPhoneCount,
      });
      // Release large workbook & sheet arrays immediately once saved
      setParsedWorkbook(null);
      setSheetAnalysis(null);
      setFile(null);
      onSuccess?.();
    } catch (err: any) {
      const message = err?.message || 'Failed to save Purchase Responsibility Master to browser storage.';
      const isBlockedOrVersion = /blocked|other.*tabs|version/i.test(message);
      setError({
        what: message,
        action: isBlockedOrVersion
          ? 'Close or reload all other open ID Studio tabs/windows, then click Confirm & Replace Master again. Existing stock, audit, focus, and purchase data will not be deleted.'
          : 'Your previous Purchase Responsibility Master was retained safely. Please try again.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const getCurrentStepNumber = (): 1 | 2 | 3 | 4 => {
    if (completedMeta) return 4;
    if (isConfirmStep && validation) return 3;
    if (parsedWorkbook && validation) return 2;
    return 1;
  };

  const diffAddedSet = useMemo(
    () => new Set(validation?.diff.addedCodes.map((d) => d.bansalCode) || []),
    [validation]
  );
  const diffChangedSet = useMemo(
    () => new Set(validation?.diff.changedCodes.map((d) => d.bansalCode) || []),
    [validation]
  );

  const { previewSampleRows, previewTotalCount } = useMemo(() => {
    if (!validation) return { previewSampleRows: [] as typeof validation.rowPreviews, previewTotalCount: 0 };
    if (previewTab === 'all') {
      return {
        previewSampleRows: validation.rowPreviews.slice(0, 100),
        previewTotalCount: validation.rowPreviews.length,
      };
    }
    const sample: typeof validation.rowPreviews = [];
    let count = 0;
    for (const r of validation.rowPreviews) {
      const match =
        previewTab === 'conflicts'
          ? Boolean(r.isConflictingCode)
          : diffAddedSet.has(r.bansalCode) || diffChangedSet.has(r.bansalCode);
      if (match) {
        count++;
        if (sample.length < 100) sample.push(r);
      }
    }
    return { previewSampleRows: sample, previewTotalCount: count };
  }, [validation, previewTab, diffAddedSet, diffChangedSet]);

  if (!isOpen) return null;

  return (
    <UploadModalShell
      isOpen={isOpen}
      onClose={completedMeta ? handleFinish : onClose}
      icon={<Users className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
      title={
        completedMeta
          ? 'Purchase Master Activated'
          : isConfirmStep
          ? 'Confirm Full Replacement'
          : parsedWorkbook
          ? 'Map Columns & Preview'
          : 'Upload Purchase Responsibility Master'
      }
      subtitle={
        completedMeta
          ? 'Saved locally on this device/browser'
          : parsedWorkbook
          ? `${parsedWorkbook.fileName} • Sheet: ${selectedSheet}`
          : 'Map BANSAL CODE to Purchase Person & Phone Number'
      }
      badge={{
        text: 'Device Local',
        variant: 'indigo',
      }}
      currentStep={getCurrentStepNumber()}
      stepLabels={['Select File', 'Map & Preview', 'Confirm', 'Complete']}
      isProcessing={isSaving || isParsing}
      maxWidthClass="max-w-2xl"
      isDarkMode={isDarkMode}
      footerLeft={
        parsedWorkbook && !completedMeta && !isSaving ? (
          <button
            type="button"
            onClick={isConfirmStep ? () => setIsConfirmStep(false) : handleReset}
            className="text-[11px] font-semibold text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white flex items-center gap-1 cursor-pointer min-h-[36px] px-1"
          >
            {isConfirmStep ? (
              <>
                <ArrowLeft className="w-3 h-3" />
                <span>Back to Mapping</span>
              </>
            ) : (
              <>
                <RotateCcw className="w-3 h-3" />
                <span>Change File</span>
              </>
            )}
          </button>
        ) : null
      }
      footerRight={
        completedMeta ? null : parsedWorkbook && validation ? (
          isConfirmStep ? (
            <>
              <button
                type="button"
                onClick={onClose}
                disabled={isSaving}
                className="px-3 py-1.5 min-h-[38px] bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-lg transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmReplace}
                disabled={isSaving || !validation.isValidToActivate}
                className="px-4 py-1.5 min-h-[38px] bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{isSaving ? 'Replacing Master...' : 'Confirm & Replace Master'}</span>
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 min-h-[38px] bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => setIsConfirmStep(true)}
                disabled={!validation.isValidToActivate}
                className="px-3.5 py-1.5 min-h-[38px] bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span>Review & Confirm ({validation.uniqueProductCodesCount.toLocaleString('en-IN')} Codes)</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </>
          )
        ) : (
          <button
            type="button"
            onClick={onClose}
            disabled={isParsing}
            className="px-3 py-1.5 min-h-[38px] bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
          >
            Cancel
          </button>
        )
      }
    >
      {/* Error Banner */}
      {(error || storageError) && (
        <UploadErrorBanner
          whatWentWrong={error ? error.what : storageError || ''}
          whatToDo={
            error
              ? error.action
              : 'Close or reload any other open ID Studio tabs/windows, then try saving again. Existing app data will not be deleted.'
          }
          onDismiss={() => {
            setError(null);
            clearStorageError();
          }}
          isDarkMode={isDarkMode}
        />
      )}

      {/* Device-local & Safe Replace Notice */}
      {!completedMeta && (
        <div className="bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 rounded-lg px-2.5 py-2 flex items-start gap-2 text-[11px] text-amber-900 dark:text-amber-200">
          <ShieldCheck className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="leading-snug">
            <strong className="font-bold">FULL REPLACEMENT ON CONFIRM: </strong>
            <span>
              Saved only on this device/browser, independent of Stock Reports and Barcode Master.
              Previous valid assignments remain untouched if validation or saving fails.
            </span>
          </div>
        </div>
      )}

      {/* STEP 4: COMPLETE */}
      {completedMeta && (
        <UploadSuccessView
          title="✓ PURCHASE MASTER ACTIVATED"
          subtitle="All product cards and inspectors now reflect the updated purchase contacts."
          datasetName="Purchase Responsibility Master"
          fileName={`${completedMeta.fileName} (${completedMeta.sheetName})`}
          metrics={[
            { label: 'Assignments', value: completedMeta.validAssignmentsCount, highlight: 'emerald' },
            { label: 'Unique Codes', value: completedMeta.uniqueProductCodesCount, highlight: 'indigo' },
            {
              label: 'Code Conflicts',
              value: completedMeta.conflictingCodesCount,
              highlight: completedMeta.conflictingCodesCount > 0 ? 'amber' : 'default',
            },
            {
              label: 'Row/Phone Issues',
              value: completedMeta.issuesCount,
              highlight: completedMeta.issuesCount > 0 ? 'rose' : 'default',
            },
          ]}
          activatedTime={completedMeta.importedAt}
          onDone={handleFinish}
          isDarkMode={isDarkMode}
        />
      )}

      {/* STEP 1: SELECT FILE */}
      {!parsedWorkbook && !completedMeta && (
        <UploadDropZone
          onFileSelected={handleFileSelected}
          acceptedExtensions=".xlsx,.xls,.csv,.tsv"
          acceptedFormatsText=".xlsx / .xls / .csv"
          title="Tap to select or drop Purchase Responsibility file"
          subtitle="Defaults to Sheet1; recognizes PUCHASE NB and formatting variations"
          expectedColumns={['BANSAL CODE', 'ITEM NAME', 'PURCHASE NAME', 'PUCHASE NB']}
          isParsing={isParsing}
          parsingText="Reading workbook sheets & detecting headers..."
          isDarkMode={isDarkMode}
          selectedFile={file}
        />
      )}

      {/* STEP 2: MAP COLUMNS & VALIDATION PREVIEW */}
      {parsedWorkbook && sheetAnalysis && validation && !isConfirmStep && !completedMeta && (
        <div className="space-y-3">
          {/* Sheet Selector & Detected Header Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
            <div>
              <label
                htmlFor="purchase-sheet-select"
                className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1"
              >
                Worksheet ({parsedWorkbook.sheetNames.length} found)
              </label>
              <select
                id="purchase-sheet-select"
                value={selectedSheet}
                onChange={(e) => handleSheetChange(e.target.value)}
                className="w-full min-h-[38px] px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {parsedWorkbook.sheetNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                    {name.trim().toLowerCase() === 'sheet1' ? ' (Default)' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col justify-center">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Detected Header Row
              </span>
              <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 mt-0.5 flex items-center gap-1.5">
                <FileSpreadsheet className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                <span>
                  Row {sheetAnalysis.headerRowIndex + 1} • {sheetAnalysis.headers.length} columns found
                </span>
              </div>
            </div>
          </div>

          {/* Manual Column Mapping Controls */}
          <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Column Mapping
              </span>
              <span className="text-[10px] text-slate-500 dark:text-slate-400">
                Extra columns are ignored automatically
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label
                  htmlFor="map-bansal-code"
                  className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 mb-0.5"
                >
                  Bansal Code <span className="text-rose-500">*</span>
                </label>
                <select
                  id="map-bansal-code"
                  value={mapping.bansalCode}
                  onChange={(e) => setMapping((m) => ({ ...m, bansalCode: e.target.value }))}
                  className="w-full min-h-[36px] px-2 py-1 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-900 dark:text-white"
                >
                  <option value="">-- Select column --</option>
                  {sheetAnalysis.headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="map-item-name"
                  className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 mb-0.5"
                >
                  Item Name (Preview Reference Only)
                </label>
                <select
                  id="map-item-name"
                  value={mapping.itemName}
                  onChange={(e) => setMapping((m) => ({ ...m, itemName: e.target.value }))}
                  className="w-full min-h-[36px] px-2 py-1 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-900 dark:text-white"
                >
                  <option value="">-- None / Optional --</option>
                  {sheetAnalysis.headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="map-purchase-name"
                  className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 mb-0.5"
                >
                  Purchase Person Name <span className="text-rose-500">*</span>
                </label>
                <select
                  id="map-purchase-name"
                  value={mapping.purchaseName}
                  onChange={(e) => setMapping((m) => ({ ...m, purchaseName: e.target.value }))}
                  className="w-full min-h-[36px] px-2 py-1 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-900 dark:text-white"
                >
                  <option value="">-- Select column --</option>
                  {sheetAnalysis.headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="map-phone"
                  className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 mb-0.5"
                >
                  Phone Number (e.g. PUCHASE NB) <span className="text-rose-500">*</span>
                </label>
                <select
                  id="map-phone"
                  value={mapping.phone}
                  onChange={(e) => setMapping((m) => ({ ...m, phone: e.target.value }))}
                  className="w-full min-h-[36px] px-2 py-1 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-900 dark:text-white"
                >
                  <option value="">-- Select column --</option>
                  {sheetAnalysis.headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Blocking Error if mapping incomplete or zero valid records */}
          {validation.blockingError && (
            <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-800 dark:text-rose-200 font-semibold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
              <span>{validation.blockingError}</span>
            </div>
          )}

          {/* Validation Summary Metrics Grid */}
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 text-center">
            <div className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
              <div className="text-[9px] font-semibold text-slate-500 dark:text-slate-400">Valid Rows</div>
              <div className="font-mono tabular-nums text-xs font-bold text-emerald-600 dark:text-emerald-400">
                {validation.validRecords.length.toLocaleString('en-IN')}
              </div>
            </div>
            <div className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
              <div className="text-[9px] font-semibold text-slate-500 dark:text-slate-400">Unique Codes</div>
              <div className="font-mono tabular-nums text-xs font-bold text-indigo-600 dark:text-indigo-400">
                {validation.uniqueProductCodesCount.toLocaleString('en-IN')}
              </div>
            </div>
            <div className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
              <div className="text-[9px] font-semibold text-slate-500 dark:text-slate-400">Conflicts</div>
              <div
                className={`font-mono tabular-nums text-xs font-bold ${
                  validation.conflictingCodes.length > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-700 dark:text-slate-300'
                }`}
              >
                {validation.conflictingCodes.length}
              </div>
            </div>
            <div className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
              <div className="text-[9px] font-semibold text-slate-500 dark:text-slate-400">Phone Issues</div>
              <div
                className={`font-mono tabular-nums text-xs font-bold ${
                  validation.missingOrInvalidPhoneCount > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-700 dark:text-slate-300'
                }`}
              >
                {validation.missingOrInvalidPhoneCount}
              </div>
            </div>
            <div className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
              <div className="text-[9px] font-semibold text-slate-500 dark:text-slate-400">Missing Name</div>
              <div
                className={`font-mono tabular-nums text-xs font-bold ${
                  validation.missingNameCount > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-700 dark:text-slate-300'
                }`}
              >
                {validation.missingNameCount}
              </div>
            </div>
            <div className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
              <div className="text-[9px] font-semibold text-slate-500 dark:text-slate-400">Deduplicated</div>
              <div className="font-mono tabular-nums text-xs font-bold text-slate-700 dark:text-slate-300">
                {validation.deduplicatedCount}
              </div>
            </div>
          </div>

          {/* Diff vs Current Master */}
          {validation.diff.hasPreviousMaster && (
            <div className="p-2.5 rounded-xl bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800/70 space-y-1.5">
              <div className="flex items-center justify-between gap-2 text-[11px] font-bold text-indigo-950 dark:text-indigo-200">
                <span className="flex items-center gap-1.5">
                  <GitCompare className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  <span>Changes vs Current Master ({currentMeta?.fileName})</span>
                </span>
                <span className="font-mono tabular-nums text-[10px] text-slate-600 dark:text-slate-400">
                  {validation.diff.unchangedCount} unchanged
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1.5 text-center text-[11px]">
                <div className="px-2 py-1 rounded-lg bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800/60">
                  <span className="text-slate-500 dark:text-slate-400 block text-[9px]">Added</span>
                  <span className="font-mono tabular-nums font-bold text-emerald-700 dark:text-emerald-400">
                    +{validation.diff.addedCodes.length}
                  </span>
                </div>
                <div className="px-2 py-1 rounded-lg bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800/60">
                  <span className="text-slate-500 dark:text-slate-400 block text-[9px]">Changed</span>
                  <span className="font-mono tabular-nums font-bold text-amber-700 dark:text-amber-400">
                    {validation.diff.changedCodes.length}
                  </span>
                </div>
                <div className="px-2 py-1 rounded-lg bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-800/60">
                  <span className="text-slate-500 dark:text-slate-400 block text-[9px]">Removed</span>
                  <span className="font-mono tabular-nums font-bold text-rose-700 dark:text-rose-400">
                    -{validation.diff.removedCodes.length}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Filter Tabs & Preview Table */}
          <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-slate-900">
            <div className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => setPreviewTab('all')}
                className={`px-2 py-1 rounded-md text-[11px] font-bold cursor-pointer transition-colors ${
                  previewTab === 'all'
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-700'
                }`}
              >
                Valid ({validation.rowPreviews.length})
              </button>
              <button
                type="button"
                onClick={() => setPreviewTab('conflicts')}
                className={`px-2 py-1 rounded-md text-[11px] font-bold cursor-pointer transition-colors ${
                  previewTab === 'conflicts'
                    ? 'bg-amber-600 text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-700'
                }`}
              >
                Conflicts ({validation.conflictingCodes.length})
              </button>
              <button
                type="button"
                onClick={() => setPreviewTab('issues')}
                className={`px-2 py-1 rounded-md text-[11px] font-bold cursor-pointer transition-colors ${
                  previewTab === 'issues'
                    ? 'bg-rose-600 text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-700'
                }`}
              >
                Issues ({validation.issueRows.length})
              </button>
              {validation.diff.hasPreviousMaster && (
                <button
                  type="button"
                  onClick={() => setPreviewTab('changes')}
                  className={`px-2 py-1 rounded-md text-[11px] font-bold cursor-pointer transition-colors ${
                    previewTab === 'changes'
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-700'
                  }`}
                >
                  Added/Changed ({validation.diff.addedCodes.length + validation.diff.changedCodes.length})
                </button>
              )}
            </div>

            {previewTab === 'issues' ? (
              <div className="max-h-48 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 text-[11px]">
                {validation.issueRows.length === 0 ? (
                  <div className="p-4 text-center text-slate-500 dark:text-slate-400">
                    No missing names, missing codes, or invalid phone numbers detected.
                  </div>
                ) : (
                  validation.issueRows.slice(0, 100).map((issue, idx) => (
                    <div key={`${issue.rowNumber}_${idx}`} className="px-2.5 py-1.5 flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-mono font-bold text-slate-800 dark:text-slate-200">
                          Row {issue.rowNumber} • Code: {issue.bansalCode || '—'}
                        </div>
                        <div className="text-slate-600 dark:text-slate-300 truncate">
                          {issue.purchasePersonName || '(No name)'} {issue.rawPhone ? `• ${issue.rawPhone}` : ''}
                        </div>
                      </div>
                      <span className="text-[10px] font-semibold text-rose-700 dark:text-rose-300 text-right shrink-0 max-w-[200px]">
                        {issue.reason}
                      </span>
                    </div>
                  ))
                )}
              </div>
            ) : (
              <div className="max-h-48 overflow-auto">
                {previewSampleRows.length === 0 ? (
                  <div className="p-4 text-center text-[11px] text-slate-500 dark:text-slate-400">
                    No rows in this filter.
                  </div>
                ) : (
                  <table className="w-full text-left border-collapse text-[11px]">
                    <thead className="bg-slate-50 dark:bg-slate-800/80 sticky top-0 text-[10px] uppercase text-slate-500 dark:text-slate-400">
                      <tr>
                        <th className="px-2 py-1.5 font-bold">Code</th>
                        <th className="px-2 py-1.5 font-bold">Item Name</th>
                        <th className="px-2 py-1.5 font-bold">Purchase Person</th>
                        <th className="px-2 py-1.5 font-bold">Phone</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {previewSampleRows.map((row) => {
                        const phoneValid =
                          row.phoneStatus === 'valid_indian' || row.phoneStatus === 'valid_international';
                        return (
                          <tr key={`${row.rowNumber}_${row.bansalCode}_${row.purchasePersonName}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                            <td className="px-2 py-1.5 font-mono font-bold text-slate-900 dark:text-white whitespace-nowrap">
                              {row.bansalCode}
                              {row.isConflictingCode && (
                                <span className="ml-1 text-[9px] font-bold text-amber-600 dark:text-amber-400">
                                  (Multi)
                                </span>
                              )}
                            </td>
                            <td className="px-2 py-1.5 text-slate-600 dark:text-slate-300 max-w-[140px] truncate" title={row.itemName}>
                              {row.itemName || '—'}
                            </td>
                            <td className="px-2 py-1.5 font-semibold text-slate-800 dark:text-slate-200 max-w-[130px] truncate">
                              {row.purchasePersonName}
                            </td>
                            <td className="px-2 py-1.5 font-mono tabular-nums whitespace-nowrap">
                              {phoneValid ? (
                                <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                                  {row.displayPhone}
                                </span>
                              ) : (
                                <span className="text-rose-600 dark:text-rose-400" title={row.phoneError}>
                                  {row.rawPhone || 'Missing'} ({row.phoneStatus})
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
                {previewTotalCount > 100 && (
                  <div className="px-2.5 py-1 text-[10px] text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/40 border-t border-slate-100 dark:border-slate-800">
                    Showing first 100 of {previewTotalCount.toLocaleString('en-IN')} rows.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* STEP 3: CONFIRM FULL REPLACEMENT */}
      {parsedWorkbook && validation && isConfirmStep && !completedMeta && (
        <div className="space-y-3">
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  New Responsibility Master
                </div>
                <div className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate">
                  {validation.fileName} ({validation.sheetName})
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="font-mono tabular-nums text-sm font-black text-indigo-600 dark:text-indigo-400">
                  {validation.uniqueProductCodesCount.toLocaleString('en-IN')} Codes
                </div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                  {validation.validRecords.length.toLocaleString('en-IN')} assignments
                </div>
              </div>
            </div>

            {validation.conflictingCodes.length > 0 && (
              <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-[11px] text-amber-900 dark:text-amber-200 flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <span>
                  {validation.conflictingCodes.length} product code(s) have multiple contacts assigned. All choices will be shown to the user rather than silently picking one.
                </span>
              </div>
            )}

            {validation.missingOrInvalidPhoneCount > 0 && (
              <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[11px] text-slate-700 dark:text-slate-300 flex items-start gap-2">
                <Phone className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-0.5" />
                <span>
                  {validation.missingOrInvalidPhoneCount} row(s) have missing, invalid, or ambiguous phone numbers. The person&apos;s name will still display with WhatsApp/Call disabled.
                </span>
              </div>
            )}
          </div>

          {validation.diff.hasPreviousMaster && (
            <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
              <div className="text-xs font-bold text-slate-900 dark:text-white">
                Replacement Impact vs Current Master
              </div>
              <ul className="text-xs text-slate-600 dark:text-slate-300 space-y-1">
                <li>
                  • <strong className="text-emerald-700 dark:text-emerald-400">{validation.diff.addedCodes.length}</strong> new product code(s) added
                </li>
                <li>
                  • <strong className="text-amber-700 dark:text-amber-400">{validation.diff.changedCodes.length}</strong> product code(s) updated
                </li>
                <li>
                  • <strong className="text-rose-700 dark:text-rose-400">{validation.diff.removedCodes.length}</strong> product code(s) removed (absent from the new file — will show &ldquo;Purchase contact not assigned.&rdquo;)
                </li>
              </ul>

              {validation.diff.removedCodes.length > 0 && (
                <div className="p-2 rounded-lg bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/70 text-[11px] text-rose-800 dark:text-rose-200">
                  <span className="font-bold">Sample removed codes: </span>
                  <span className="font-mono">
                    {validation.diff.removedCodes
                      .slice(0, 8)
                      .map((r) => r.bansalCode)
                      .join(', ')}
                    {validation.diff.removedCodes.length > 8
                      ? ` (+${validation.diff.removedCodes.length - 8} more)`
                      : ''}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </UploadModalShell>
  );
};
