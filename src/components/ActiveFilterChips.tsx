import React from 'react';
import { X, RotateCcw, AlertTriangle, Layers } from 'lucide-react';

export interface ActiveFilterGroup {
  label: string;
  values: string[];
  onRemove: (val: string) => void;
  onClear: () => void;
  badgeColor?: 'indigo' | 'emerald' | 'amber' | 'blue' | 'purple';
  incompatibleValues?: string[];
}

export interface ActiveFilterChipsProps {
  groups: ActiveFilterGroup[];
  onResetAll: () => void;
  totalFilteredCount?: number;
  totalItemCount?: number;
  isDarkMode?: boolean;
  className?: string;
  countLabel?: string;
}

export const ActiveFilterChips: React.FC<ActiveFilterChipsProps> = ({
  groups,
  onResetAll,
  totalFilteredCount,
  totalItemCount,
  isDarkMode = false,
  className = '',
  countLabel = 'products'
}) => {
  const activeGroups = groups.filter((g) => g.values && g.values.length > 0);
  const totalActiveValues = activeGroups.reduce((acc, g) => acc + g.values.length, 0);

  if (totalActiveValues === 0) return null;

  const colorStyles: Record<string, string> = {
    indigo: isDarkMode
      ? 'bg-indigo-950/70 border-indigo-700/60 text-indigo-300'
      : 'bg-indigo-50 border-indigo-200 text-indigo-800',
    emerald: isDarkMode
      ? 'bg-emerald-950/70 border-emerald-700/60 text-emerald-300'
      : 'bg-emerald-50 border-emerald-200 text-emerald-800',
    amber: isDarkMode
      ? 'bg-amber-950/70 border-amber-700/60 text-amber-300'
      : 'bg-amber-50 border-amber-200 text-amber-800',
    blue: isDarkMode
      ? 'bg-blue-950/70 border-blue-700/60 text-blue-300'
      : 'bg-blue-50 border-blue-200 text-blue-800',
    purple: isDarkMode
      ? 'bg-purple-950/70 border-purple-700/60 text-purple-300'
      : 'bg-purple-50 border-purple-200 text-purple-800'
  };

  const incompatibleStyle = isDarkMode
    ? 'bg-rose-950/70 border-rose-700/70 text-rose-300'
    : 'bg-rose-50 border-rose-200 text-rose-800';

  const hasZeroResults = totalFilteredCount !== undefined && totalFilteredCount === 0;

  return (
    <div className={`space-y-2 ${className}`}>
      {/* Zero matches warning alert */}
      {hasZeroResults && (
        <div className="flex items-center justify-between gap-3 p-3 rounded-xl border border-rose-300 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 text-rose-900 dark:text-rose-200 text-xs animate-fade-in">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
            <span className="font-extrabold">No products match these filters.</span>
            <span className="text-slate-500 dark:text-slate-400 hidden sm:inline">
              Try removing conflicting filter selections or reset all filters.
            </span>
          </div>
          <button
            type="button"
            onClick={onResetAll}
            className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shrink-0 cursor-pointer shadow-2xs"
          >
            Reset All Filters
          </button>
        </div>
      )}

      {/* Chips bar */}
      <div className="flex items-center gap-1.5 flex-wrap text-xs">
        <span className="text-[11px] font-extrabold uppercase text-slate-400 tracking-wider mr-1 flex items-center gap-1">
          <Layers className="w-3 h-3 text-slate-400" />
          Active:
        </span>

        {activeGroups.map((group) => {
          const style = colorStyles[group.badgeColor || 'indigo'];

          return (
            <React.Fragment key={group.label}>
              {group.values.map((val) => {
                const isIncompatible =
                  group.incompatibleValues &&
                  group.incompatibleValues.some((iv) => iv.toLowerCase() === val.toLowerCase());

                return (
                  <span
                    key={`${group.label}-${val}`}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold border transition-all ${
                      isIncompatible ? incompatibleStyle : style
                    } shadow-2xs`}
                  >
                    <span className="opacity-75 font-normal">{group.label}:</span>
                    <span className={isIncompatible ? 'line-through' : ''}>{val}</span>
                    {isIncompatible && (
                      <span className="text-[9px] font-black px-1 rounded-md bg-rose-200 dark:bg-rose-900 text-rose-800 dark:text-rose-200">
                        0 matches
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => group.onRemove(val)}
                      className="p-0.5 hover:bg-black/10 dark:hover:bg-white/10 rounded-full transition-colors cursor-pointer"
                      title={`Remove ${val}`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                );
              })}
            </React.Fragment>
          );
        })}

        {/* Reset All button */}
        <button
          type="button"
          onClick={onResetAll}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-rose-200 dark:border-rose-900 transition-colors cursor-pointer"
          title="Reset All Filters"
        >
          <RotateCcw className="w-3 h-3" />
          <span>Reset All</span>
        </button>

        {/* Summary count info if provided */}
        {totalFilteredCount !== undefined && totalItemCount !== undefined && (
          <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 ml-auto pl-2">
            Showing <strong className="text-slate-800 dark:text-slate-200">{totalFilteredCount}</strong> of {totalItemCount} {countLabel}
          </span>
        )}
      </div>
    </div>
  );
};
