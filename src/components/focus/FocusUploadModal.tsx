import React, { useState } from 'react';
import { 
  CheckCircle2, 
  Calendar, 
  ArrowRight,
  Info,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Target
} from 'lucide-react';
import { FocusMaster, FocusType } from '../../types';
import { parseFocusFile, FocusParsedFileResult } from '../../utils/focusParser';
import { 
  UploadModalShell, 
  UploadDropZone, 
  UploadProgressView, 
  UploadSuccessView, 
  UploadErrorBanner 
} from '../upload';

interface FocusUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveMaster: (master: FocusMaster) => Promise<void>;
  initialType?: FocusType;
  focusType?: FocusType;
  storeId?: string;
  isDarkMode?: boolean;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export const FocusUploadModal: React.FC<FocusUploadModalProps> = ({
  isOpen,
  onClose,
  onSaveMaster,
  initialType,
  focusType,
  storeId = 'store_1',
  isDarkMode = false
}) => {
  const targetType: FocusType = focusType || initialType || 'core';
  const isCore = targetType === 'core';
  const focusTypeName = isCore ? 'Core Focus' : 'Non-Core Focus';

  const [file, setFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [error, setError] = useState<{ what: string; action?: string } | null>(null);
  const [parsedResult, setParsedResult] = useState<FocusParsedFileResult | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string>(
    MONTHS[new Date().getMonth()]
  );
  const [selectedYear, setSelectedYear] = useState<number>(
    new Date().getFullYear()
  );
  const [showValidationDetails, setShowValidationDetails] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savedMaster, setSavedMaster] = useState<FocusMaster | null>(null);

  if (!isOpen) return null;

  const handleReset = () => {
    setFile(null);
    setParsedResult(null);
    setError(null);
    setIsSaving(false);
    setIsParsing(false);
    setSavedMaster(null);
  };

  const handleFinish = () => {
    handleReset();
    onClose();
  };

  const handleFileChange = async (selectedFile: File) => {
    if (!selectedFile) return;
    setFile(selectedFile);
    setIsParsing(true);
    setError(null);
    setParsedResult(null);
    setSavedMaster(null);

    try {
      const result = await parseFocusFile(selectedFile);
      if (!result.items || result.items.length === 0) {
        throw new Error('No valid Focus product rows found in this sheet.');
      }
      setParsedResult(result);
    } catch (err: any) {
      setError({
        what: err.message || 'Failed to parse Focus Excel file.',
        action: 'Ensure the workbook has a "PRINT" sheet with CODE, ITEM, MRP, and OFFER columns.'
      });
      setFile(null);
    } finally {
      setIsParsing(false);
    }
  };

  const handleSave = async () => {
    if (!parsedResult || !file) return;

    setIsSaving(true);
    setError(null);

    try {
      const monthIdx = MONTHS.indexOf(selectedMonth) + 1;
      const monthKey = `${selectedYear}-${String(monthIdx).padStart(2, '0')}`;
      const monthDisplay = `${selectedMonth} ${selectedYear}`;

      const master: FocusMaster = {
        id: `${storeId}_${targetType}_${monthKey.replace('-', '_')}`,
        storeId,
        type: targetType,
        monthKey,
        monthDisplay,
        fileName: file.name,
        uploadedAt: new Date().toISOString(),
        totalProducts: parsedResult.items.length,
        items: parsedResult.items,
        isActive: true
      };

      await onSaveMaster(master);
      setSavedMaster(master);
    } catch (err: any) {
      setError({
        what: err.message || 'Failed to save and activate Focus Master.',
        action: 'Existing focus master is preserved. Please try again.'
      });
    } finally {
      setIsSaving(false);
    }
  };

  const val = parsedResult?.validation;

  const getCurrentStepNumber = (): 1 | 2 | 3 | 4 => {
    if (savedMaster) return 4;
    if (isSaving) return 4;
    if (parsedResult) return 3;
    if (isParsing) return 2;
    return 1;
  };

  return (
    <UploadModalShell
      isOpen={isOpen}
      onClose={savedMaster ? handleFinish : onClose}
      icon={<Target className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
      title={
        savedMaster
          ? `${focusTypeName} Activated`
          : isSaving
          ? `Activating ${focusTypeName}`
          : parsedResult
          ? `Review ${focusTypeName} Items`
          : `Upload / Replace ${focusTypeName}`
      }
      subtitle={
        savedMaster
          ? `${selectedMonth} ${selectedYear} active offline`
          : isSaving
          ? `Saving ${parsedResult?.items.length.toLocaleString('en-IN') || ''} items to local device`
          : parsedResult
          ? `${parsedResult.items.length.toLocaleString('en-IN')} products in "${parsedResult.detectedSheetName}"`
          : `${isCore ? 'High-velocity' : 'Specialty'} items tracking`
      }
      badge={{
        text: focusTypeName,
        variant: isCore ? 'indigo' : 'amber'
      }}
      currentStep={getCurrentStepNumber()}
      stepLabels={['Select File', 'Validate', 'Review', 'Complete']}
      isProcessing={isSaving}
      isDarkMode={isDarkMode}
      footerLeft={
        parsedResult && !isSaving && !savedMaster ? (
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
        savedMaster ? null : parsedResult && !isSaving ? (
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
              onClick={handleSave}
              className="px-3.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-xs transition-all flex items-center gap-1 cursor-pointer active:scale-98"
            >
              <span>Activate ({parsedResult.items.length.toLocaleString('en-IN')})</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </>
        ) : !isSaving ? (
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
      {error && !isSaving && (
        <UploadErrorBanner
          whatWentWrong={error.what}
          whatToDo={error.action}
          onDismiss={() => setError(null)}
          isDarkMode={isDarkMode}
        />
      )}

      {/* STEP 4: SUCCESS VIEW */}
      {savedMaster && (
        <UploadSuccessView
          title={`✓ ${focusTypeName.toUpperCase()} ACTIVATED`}
          subtitle={`${savedMaster.monthDisplay} items normalized & active offline.`}
          datasetName={`${focusTypeName} Master`}
          fileName={savedMaster.fileName}
          metrics={[
            { label: 'Type', value: focusTypeName, highlight: isCore ? 'indigo' : 'amber' },
            { label: 'Period', value: savedMaster.monthDisplay, highlight: 'default' },
            { label: 'Valid Items', value: savedMaster.totalProducts, highlight: 'emerald' },
            { label: 'Duplicates', value: val?.duplicateCodesCount || 0, highlight: 'default' }
          ]}
          activatedTime={savedMaster.uploadedAt}
          onDone={handleFinish}
          isDarkMode={isDarkMode}
        />
      )}

      {/* STEP 4: PROCESSING VIEW */}
      {isSaving && (
        <UploadProgressView
          stage="Saving to Device"
          percent={85}
          totalProducts={parsedResult?.items.length}
          datasetName={`${focusTypeName} Master`}
          stages={[
            { key: 'reading', label: 'Reading' },
            { key: 'validating', label: 'Normalizing' },
            { key: 'saving', label: 'Saving' },
            { key: 'complete', label: 'Complete' }
          ]}
          isDarkMode={isDarkMode}
        />
      )}

      {/* STEP 1: COMPACT MONTH/YEAR ROW + DROP ZONE */}
      {!parsedResult && !savedMaster && !isSaving && (
        <div className="space-y-2">
          {/* Dense inline Month/Year picker */}
          <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border bg-slate-50/80 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-1.5 min-w-0">
              <Calendar className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 truncate">
                Target Period
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className={`px-2 py-0.5 rounded-md border text-xs font-semibold ${
                  isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-800'
                }`}
              >
                {MONTHS.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
              <input
                type="number"
                min={2020}
                max={2035}
                value={selectedYear}
                onChange={(e) => setSelectedYear(parseInt(e.target.value, 10) || 2026)}
                className={`w-14 px-1.5 py-0.5 rounded-md border text-xs font-semibold text-center ${
                  isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-800'
                }`}
              />
            </div>
          </div>

          {/* Ultra-dense Drop Zone */}
          <UploadDropZone
            onFileSelected={handleFileChange}
            acceptedExtensions=".xlsx,.xls,.csv"
            acceptedFormatsText=".xlsx / .xls / .csv"
            title={`Tap to select or drop ${focusTypeName} Excel`}
            subtitle="Worksheet PRINT: CODE, CATEGORY, ITEM, MRP, OFFER"
            expectedColumns={['CODE', 'CATEGORY', 'ITEM', 'MRP', 'OFFER']}
            isParsing={isParsing}
            parsingText="Normalizing CODEs to 9 digits..."
            isDarkMode={isDarkMode}
            selectedFile={file}
          />
        </div>
      )}

      {/* STEP 3: REVIEW & VALIDATION MATRIX */}
      {parsedResult && !savedMaster && !isSaving && val && (
        <div className="space-y-2">
          {/* Header Details */}
          <div className="px-2.5 py-1 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-1 min-w-0">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span className="font-bold text-slate-900 dark:text-white truncate">
                Sheet: <span className="text-indigo-600 dark:text-indigo-400 font-mono">{parsedResult.detectedSheetName}</span>
              </span>
            </div>
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-indigo-100 dark:bg-indigo-900/60 text-indigo-800 dark:text-indigo-300 font-bold shrink-0">
              {selectedMonth.slice(0, 3)} {selectedYear}
            </span>
          </div>

          {/* Validation Summary Matrix - 4 in a row */}
          <div className="grid grid-cols-4 gap-1 text-center">
            <div className="p-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xs">
              <span className="text-[8.5px] font-bold text-slate-400 block uppercase truncate">Total</span>
              <span className="text-xs font-black text-slate-800 dark:text-white block font-mono">{val.totalRows}</span>
            </div>

            <div className="p-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 shadow-2xs">
              <span className="text-[8.5px] font-bold text-emerald-700 dark:text-emerald-400 block uppercase truncate">Valid</span>
              <span className="text-xs font-black text-emerald-700 dark:text-emerald-300 block font-mono">{val.validProductsCount}</span>
            </div>

            <div className={`p-1 rounded-lg border shadow-2xs ${
              val.duplicateCodesCount > 0 
                ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200' 
                : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
            }`}>
              <span className="text-[8.5px] font-bold block uppercase truncate">Dupes</span>
              <span className="text-xs font-black block font-mono">{val.duplicateCodesCount}</span>
            </div>

            <div className={`p-1 rounded-lg border shadow-2xs ${
              val.missingOrInvalidCodeCount > 0 
                ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-200' 
                : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
            }`}>
              <span className="text-[8.5px] font-bold block uppercase truncate">Invalid</span>
              <span className="text-xs font-black block font-mono">{val.missingOrInvalidCodeCount}</span>
            </div>
          </div>

          {/* Sample Product Codes Preview */}
          <div className="space-y-0.5">
            <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1">
              <Info className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
              <span>Preview (Normalized 9-Digit CODEs):</span>
            </p>
            <div className="max-h-20 overflow-y-auto divide-y divide-slate-200 dark:divide-slate-700 text-xs bg-slate-50 dark:bg-slate-800/40 rounded-lg px-2 py-0.5 border border-slate-200 dark:border-slate-700">
              {parsedResult.items.slice(0, 4).map((item, idx) => (
                <div key={idx} className="py-0.5 flex items-center justify-between gap-1.5">
                  <div className="min-w-0 flex items-center gap-1">
                    <span className="font-mono font-extrabold text-indigo-600 dark:text-indigo-400 text-[9.5px] bg-white dark:bg-slate-800 px-1 rounded border border-slate-200 dark:border-slate-700">
                      {item.code || 'NO-CODE'}
                    </span>
                    <span className="text-slate-800 dark:text-slate-200 font-medium truncate text-[10.5px]">
                      {item.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 text-[10px]">
                    {item.mrp && <span className="text-slate-500">₹{item.mrp}</span>}
                    {item.focusOffer && (
                      <span className="font-bold text-amber-800 dark:text-amber-200 bg-amber-100 dark:bg-amber-950/80 px-1 rounded truncate max-w-[100px]">
                        {item.focusOffer}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </UploadModalShell>
  );
};
