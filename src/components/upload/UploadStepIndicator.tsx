import React from 'react';
import { Check } from 'lucide-react';

interface UploadStepIndicatorProps {
  currentStep: 1 | 2 | 3 | 4;
  stepLabels?: [string, string, string, string];
  isDarkMode?: boolean;
}

export const UploadStepIndicator: React.FC<UploadStepIndicatorProps> = ({
  currentStep,
  stepLabels = ['Select File', 'Validate', 'Review', 'Complete'],
  isDarkMode = false
}) => {
  return (
    <div 
      className={`px-3 py-1 sm:px-4 sm:py-1.5 border-b text-[9.5px] sm:text-[10.5px] select-none ${
        isDarkMode 
          ? 'bg-slate-900/70 border-slate-800' 
          : 'bg-slate-50/70 border-slate-100'
      }`}
    >
      <div className="flex items-center justify-between max-w-lg mx-auto">
        {stepLabels.map((label, idx) => {
          const stepNum = (idx + 1) as 1 | 2 | 3 | 4;
          const isDone = currentStep > stepNum;
          const isActive = currentStep === stepNum;

          return (
            <React.Fragment key={label}>
              <div className="flex items-center gap-1 shrink-0">
                <div 
                  className={`w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full flex items-center justify-center font-bold text-[8px] sm:text-[9px] transition-all ${
                    isDone
                      ? 'bg-emerald-600 text-white'
                      : isActive
                      ? 'bg-indigo-600 text-white shadow-2xs'
                      : isDarkMode
                      ? 'bg-slate-800 text-slate-500 border border-slate-700'
                      : 'bg-slate-200 text-slate-500 border border-slate-300/80'
                  }`}
                >
                  {isDone ? <Check className="w-2 h-2 sm:w-2.5 sm:h-2.5 stroke-[3]" /> : stepNum}
                </div>
                <span 
                  className={`font-semibold tracking-tight transition-colors hidden xs:inline sm:inline ${
                    isActive
                      ? 'text-indigo-600 dark:text-indigo-400 font-bold'
                      : isDone
                      ? 'text-slate-700 dark:text-slate-300'
                      : 'text-slate-400 dark:text-slate-500'
                  }`}
                >
                  {label}
                </span>
              </div>

              {idx < stepLabels.length - 1 && (
                <div 
                  className={`flex-1 mx-1 sm:mx-1.5 h-0.5 rounded-full transition-colors ${
                    isDone 
                      ? 'bg-emerald-500/70' 
                      : isDarkMode 
                      ? 'bg-slate-800' 
                      : 'bg-slate-200'
                  }`}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};
