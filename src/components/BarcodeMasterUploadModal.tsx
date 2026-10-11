import React, { useState } from 'react';
import { 
  Barcode, 
  ShieldCheck, 
  RotateCcw,
  ArrowRight,
  Upload
} from 'lucide-react';
import { 
  BarcodeMasterActivationResult, 
  BarcodeMasterProgressData 
} from '../types';
import { parseBarcodeMasterExcel, BarcodeMasterParseResult } from '../utils/barcodeMasterParser';
import { uploadBarcodeMaster } from '../utils/api';
import { 
  UploadModalShell, 
  UploadDropZone, 
  UploadProgressView, 
  UploadSuccessView, 
  UploadErrorBanner 
} from './upload';

interface BarcodeMasterUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  isDarkMode?: boolean;
}

export const BarcodeMasterUploadModal: React.FC<BarcodeMasterUploadModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  isDarkMode = false
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parseResult, setParseResult] = useState<BarcodeMasterParseResult | null>(null);
  const [error, setError] = useState<{ what: string; action?: string } | null>(null);

  // Upload & Progress State
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState<BarcodeMasterProgressData | null>(null);
  const [activationResult, setActivationResult] = useState<BarcodeMasterActivationResult | null>(null);

  if (!isOpen) return null;

  const handleReset = () => {
    setFile(null);
    setParseResult(null);
    setError(null);
    setProgress(null);
    setActivationResult(null);
    setIsUploading(false);
    setIsParsing(false);
  };

  const handleFinish = () => {
    handleReset();
    onClose();
  };

  const handleFileSelected = async (selectedFile: File) => {
    if (!selectedFile) return;

    setError(null);
    setParseResult(null);
    setActivationResult(null);
    setProgress(null);
    setFile(selectedFile);
    setIsParsing(true);

    try {
      const result = await parseBarcodeMasterExcel(selectedFile);

      if (!result.items || result.items.length === 0) {
        throw new Error('No valid CODE and EAN rows found in this file.');
      }

      setParseResult(result);
    } catch (err: any) {
      setError({
        what: err.message || 'Failed to parse Excel file.',
        action: 'Ensure the sheet contains CODE (or Item Code) and EAN (or Barcode) columns.'
      });
      setFile(null);
    } finally {
      setIsParsing(false);
    }
  };

  const handleStartUpload = async () => {
    if (!parseResult || !file) return;

    setIsUploading(true);
    setError(null);
    setActivationResult(null);

    try {
      const finalMappings = parseResult.items;

      const result = await uploadBarcodeMaster(
        finalMappings,
        parseResult.filename,
        (p) => setProgress(p),
        parseResult.rejectedRows
      );

      setActivationResult(result);
      onSuccess();
    } catch (err: any) {
      setError({
        what: err.message || 'Barcode Master activation failed.',
        action: 'Active Barcode Master is preserved. Please try uploading again.'
      });
    } finally {
      setIsUploading(false);
    }
  };

  const getCurrentStepNumber = (): 1 | 2 | 3 | 4 => {
    if (activationResult) return 4;
    if (isUploading) return 4;
    if (parseResult) return 3;
    if (isParsing) return 2;
    return 1;
  };

  return (
    <UploadModalShell
      isOpen={isOpen}
      onClose={activationResult ? handleFinish : onClose}
      icon={<Barcode className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
      title={
        activationResult
          ? 'Barcode Master Activated'
          : isUploading
          ? 'Activating Barcode Master'
          : parseResult
          ? 'Review Barcode Mappings'
          : 'Upload / Replace Barcode Master'
      }
      subtitle={
        activationResult
          ? 'Cross-reference database active offline'
          : isUploading
          ? `Saving ${parseResult?.validMappings.toLocaleString('en-IN') || ''} mappings`
          : parseResult
          ? `${parseResult.validMappings.toLocaleString('en-IN')} valid from ${parseResult.totalSourceRows.toLocaleString('en-IN')} rows`
          : 'Cross-reference database for Local Codes and Barcodes'
      }
      badge={{
        text: 'Safe Replace',
        variant: 'indigo'
      }}
      currentStep={getCurrentStepNumber()}
      stepLabels={['Select File', 'Validate', 'Review', 'Complete']}
      isProcessing={isUploading}
      isDarkMode={isDarkMode}
      footerLeft={
        parseResult && !isUploading && !activationResult ? (
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
        activationResult ? null : parseResult && !isUploading ? (
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
              onClick={handleStartUpload}
              className="px-3.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-xs transition-all flex items-center gap-1 cursor-pointer active:scale-98"
            >
              <Upload className="w-3 h-3" />
              <span>Activate ({parseResult.validMappings.toLocaleString('en-IN')})</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </>
        ) : !isUploading ? (
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
      {error && !isUploading && (
        <UploadErrorBanner
          whatWentWrong={error.what}
          whatToDo={error.action}
          onDismiss={() => setError(null)}
          isDarkMode={isDarkMode}
        />
      )}

      {/* Safe Replacement Ultra-Dense Notice */}
      {!activationResult && !isUploading && (
        <div className="bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 rounded-lg px-2.5 py-1.5 flex items-center gap-2 text-[10.5px] text-amber-900 dark:text-amber-200">
          <ShieldCheck className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
          <div className="leading-tight">
            <strong className="font-bold text-amber-800 dark:text-amber-300">SAFE REPLACE: </strong>
            <span>Active master stays untouched until new file is activated.</span>
          </div>
        </div>
      )}

      {/* STEP 4: SUCCESS VIEW */}
      {activationResult && (
        <UploadSuccessView
          title="✓ BARCODE MASTER ACTIVATED"
          subtitle="All code mappings indexed & active offline."
          datasetName="Barcode Master"
          fileName={parseResult?.filename || 'Barcode Master.xlsx'}
          metrics={[
            { label: 'Mappings', value: activationResult.totalMappings, highlight: 'emerald' },
            { label: 'Local Codes', value: activationResult.uniqueLocalCodes, highlight: 'indigo' },
            { label: 'Barcodes', value: activationResult.uniqueBarcodes, highlight: 'default' },
            { label: 'Rejected', value: activationResult.rejectedRows, highlight: activationResult.rejectedRows > 0 ? 'rose' : 'default' }
          ]}
          activatedTime={new Date().toISOString()}
          onDone={handleFinish}
          isDarkMode={isDarkMode}
        />
      )}

      {/* STEP 4: PROCESSING VIEW */}
      {isUploading && progress && (
        <UploadProgressView
          stage={progress.stage}
          percent={progress.percent}
          failed={progress.stage === 'Failed'}
          error={progress.error}
          totalProducts={parseResult?.validMappings || progress.totalItems}
          datasetName="Barcode Master"
          stages={[
            { key: 'reading', label: 'Reading' },
            { key: 'validating', label: 'Validating' },
            { key: 'saving', label: 'Saving' },
            { key: 'complete', label: 'Complete' }
          ]}
          isDarkMode={isDarkMode}
        />
      )}

      {/* STEP 1: DROP ZONE */}
      {!parseResult && !activationResult && !isUploading && (
        <UploadDropZone
          onFileSelected={handleFileSelected}
          acceptedExtensions=".xlsx,.xls"
          acceptedFormatsText=".xlsx / .xls"
          title="Tap to select or drop Barcode Master"
          subtitle="Expected columns: CODE, ITEMNAME, UOM, EAN"
          expectedColumns={['CODE', 'ITEMNAME', 'UOM', 'EAN']}
          isParsing={isParsing}
          parsingText="Reading & validating Barcode Master..."
          isDarkMode={isDarkMode}
          selectedFile={file}
        />
      )}

      {/* STEP 3: REVIEW & VALIDATION SUMMARY */}
      {parseResult && !activationResult && !isUploading && (
        <div className="space-y-2">
          <div className="px-2.5 py-1 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg flex items-center justify-between gap-2 text-xs">
            <span className="font-bold text-slate-900 dark:text-white truncate text-[11px]">
              {parseResult.filename}
            </span>
            <span className="text-emerald-700 dark:text-emerald-300 text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.2 rounded-full border border-emerald-200 dark:border-emerald-800 shrink-0">
              {parseResult.validMappings.toLocaleString('en-IN')} Valid
            </span>
          </div>

          {/* Validation Metrics Grid: 3x2 on mobile */}
          <div className="grid grid-cols-3 gap-1 text-center">
            <div className="bg-white dark:bg-slate-800 p-1 rounded-lg border border-slate-200 dark:border-slate-700 shadow-2xs">
              <div className="text-[8.5px] text-slate-400 font-medium truncate uppercase">Valid</div>
              <div className="font-bold text-slate-900 dark:text-white font-mono text-xs">{parseResult.validMappings.toLocaleString('en-IN')}</div>
            </div>

            <div className="bg-white dark:bg-slate-800 p-1 rounded-lg border border-slate-200 dark:border-slate-700 shadow-2xs">
              <div className="text-[8.5px] text-slate-400 font-medium truncate uppercase">Codes</div>
              <div className="font-bold text-indigo-600 dark:text-indigo-400 font-mono text-xs">{parseResult.uniqueLocalCodes.toLocaleString('en-IN')}</div>
            </div>

            <div className="bg-white dark:bg-slate-800 p-1 rounded-lg border border-slate-200 dark:border-slate-700 shadow-2xs">
              <div className="text-[8.5px] text-slate-400 font-medium truncate uppercase">Barcodes</div>
              <div className="font-bold text-slate-900 dark:text-white font-mono text-xs">{parseResult.uniqueBarcodes.toLocaleString('en-IN')}</div>
            </div>

            <div className="bg-white dark:bg-slate-800 p-1 rounded-lg border border-slate-200 dark:border-slate-700 shadow-2xs">
              <div className="text-[8.5px] text-slate-400 font-medium truncate uppercase">Multi-EAN</div>
              <div className="font-bold text-indigo-600 dark:text-indigo-400 font-mono text-xs">{parseResult.multiBarcodeCodes.toLocaleString('en-IN')}</div>
            </div>

            <div className="bg-white dark:bg-slate-800 p-1 rounded-lg border border-slate-200 dark:border-slate-700 shadow-2xs">
              <div className="text-[8.5px] text-slate-400 font-medium truncate uppercase">Conflicts</div>
              <div className={`font-bold font-mono text-xs ${parseResult.conflictingBarcodes > 0 ? 'text-amber-600' : 'text-slate-900 dark:text-white'}`}>{parseResult.conflictingBarcodes}</div>
            </div>

            <div className="bg-white dark:bg-slate-800 p-1 rounded-lg border border-slate-200 dark:border-slate-700 shadow-2xs">
              <div className="text-[8.5px] text-slate-400 font-medium truncate uppercase">Rejected</div>
              <div className={`font-bold font-mono text-xs ${parseResult.rejectedRows > 0 ? 'text-rose-600' : 'text-slate-900 dark:text-white'}`}>{parseResult.rejectedRows}</div>
            </div>
          </div>
        </div>
      )}
    </UploadModalShell>
  );
};
