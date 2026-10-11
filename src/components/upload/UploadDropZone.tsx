import React, { useRef } from 'react';
import { Upload, Loader2, FileSpreadsheet } from 'lucide-react';

interface UploadDropZoneProps {
  onFileSelected: (file: File) => void;
  acceptedExtensions?: string;
  acceptedFormatsText?: string;
  title?: string;
  subtitle?: string;
  expectedColumns?: string[];
  isParsing?: boolean;
  parsingText?: string;
  isDarkMode?: boolean;
  disabled?: boolean;
  selectedFile?: File | null;
}

export const UploadDropZone: React.FC<UploadDropZoneProps> = ({
  onFileSelected,
  acceptedExtensions = '.csv,.xlsx,.xls',
  acceptedFormatsText = '.xlsx / .xls / .csv',
  title = 'Click to select or drag & drop file',
  subtitle,
  expectedColumns,
  isParsing = false,
  parsingText = 'Reading & validating file...',
  isDarkMode = false,
  disabled = false,
  selectedFile
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (disabled || isParsing) return;
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onFileSelected(e.dataTransfer.files[0]);
    }
  };

  const handleClick = () => {
    if (disabled || isParsing) return;
    fileInputRef.current?.click();
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled && !isParsing) e.dataTransfer.dropEffect = 'copy';
      }}
      onDrop={handleDrop}
      onClick={handleClick}
      className={`border-2 border-dashed rounded-xl p-2.5 sm:p-3.5 text-center cursor-pointer transition-all select-none group ${
        disabled
          ? 'opacity-50 cursor-not-allowed border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/40'
          : isParsing
          ? 'border-indigo-400 bg-indigo-50/50 dark:bg-indigo-950/30'
          : selectedFile
          ? 'border-indigo-400 bg-indigo-50/30 dark:bg-indigo-950/20 hover:bg-indigo-50/50'
          : isDarkMode
          ? 'border-slate-700 hover:border-indigo-500 bg-slate-800/30 hover:bg-slate-800/60'
          : 'border-slate-300 hover:border-indigo-500 bg-slate-50/80 hover:bg-indigo-50/30'
      }`}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept={acceptedExtensions}
        className="hidden"
        disabled={disabled || isParsing}
        onChange={(e) => {
          if (e.target.files && e.target.files[0]) {
            onFileSelected(e.target.files[0]);
          }
        }}
      />

      {isParsing ? (
        <div className="flex items-center justify-center gap-2 py-1">
          <div className="w-7 h-7 rounded-lg bg-indigo-100 dark:bg-indigo-900/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 shadow-2xs">
            <Loader2 className="w-4 h-4 animate-spin" />
          </div>
          <div className="text-left">
            <p className="text-xs font-bold text-slate-900 dark:text-white">
              {parsingText}
            </p>
            <p className="text-[10px] text-slate-500 dark:text-slate-400">
              Validating data locally in browser
            </p>
          </div>
        </div>
      ) : selectedFile ? (
        <div className="flex items-center justify-center gap-2 py-1">
          <div className="w-7 h-7 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 shadow-2xs">
            <FileSpreadsheet className="w-4 h-4" />
          </div>
          <div className="text-left min-w-0">
            <p className="text-xs font-bold text-slate-900 dark:text-white truncate max-w-[240px] sm:max-w-md">
              {selectedFile.name}
            </p>
            <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
              {(selectedFile.size / 1024).toFixed(1)} KB — Tap or drop to replace
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-1 py-0.5">
          <div className="flex items-center justify-center gap-2">
            <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200/80 dark:border-indigo-800 flex items-center justify-center shrink-0 transition-transform group-hover:scale-105 shadow-2xs">
              <Upload className="w-3.5 h-3.5" />
            </div>
            <div className="text-left min-w-0">
              <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                {title}
              </p>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                {subtitle || `Accepted: ${acceptedFormatsText}`}
              </p>
            </div>
          </div>

          {expectedColumns && expectedColumns.length > 0 && (
            <div className="flex flex-wrap items-center justify-center gap-1 pt-0.5">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                Columns:
              </span>
              {expectedColumns.map((col) => (
                <span
                  key={col}
                  className={`text-[9.5px] font-semibold px-1 py-0.2 rounded border ${
                    isDarkMode
                      ? 'bg-slate-800 text-indigo-300 border-slate-700'
                      : 'bg-white text-indigo-700 border-slate-200 shadow-2xs'
                  }`}
                >
                  {col}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
