import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, Search, Check, X, Filter, AlertTriangle } from 'lucide-react';

export interface OptionItem {
  value: string;
  label?: string;
  count?: number;
  incompatible?: boolean;
}

export interface MultiSelectDropdownProps {
  label: string;
  options: (string | OptionItem)[];
  selectedValues: string[];
  onChange: (newSelected: string[]) => void;
  onResetAll?: () => void;
  placeholder?: string;
  searchPlaceholder?: string;
  icon?: React.ReactNode;
  isDarkMode?: boolean;
  className?: string;
  badgeColor?: 'indigo' | 'emerald' | 'amber' | 'blue' | 'purple';
  showChipsInDropdown?: boolean;
}

export const MultiSelectDropdown: React.FC<MultiSelectDropdownProps> = ({
  label,
  options,
  selectedValues,
  onChange,
  onResetAll,
  placeholder = 'All',
  searchPlaceholder = 'Search...',
  icon,
  isDarkMode = false,
  className = '',
  badgeColor = 'indigo',
  showChipsInDropdown = true
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      // Auto-focus search input when opened
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Normalize options
  const normalizedOptions = useMemo<OptionItem[]>(() => {
    return options.map((opt) => {
      if (typeof opt === 'string') {
        return { value: opt, label: opt };
      }
      return {
        value: opt.value,
        label: opt.label || opt.value,
        count: opt.count,
        incompatible: opt.incompatible ?? (opt.count === 0 && selectedValues.includes(opt.value))
      };
    });
  }, [options, selectedValues]);

  // Filtered options by search
  const filteredOptions = useMemo(() => {
    if (!searchQuery.trim()) return normalizedOptions;
    const q = searchQuery.toLowerCase().trim();
    return normalizedOptions.filter((opt) =>
      (opt.label || opt.value).toLowerCase().includes(q) || opt.value.toLowerCase().includes(q)
    );
  }, [normalizedOptions, searchQuery]);

  const toggleOption = (val: string) => {
    const isSelected = selectedValues.some((v) => v.toLowerCase() === val.toLowerCase());
    if (isSelected) {
      onChange(selectedValues.filter((v) => v.toLowerCase() !== val.toLowerCase()));
    } else {
      onChange([...selectedValues, val]);
    }
  };

  const removeSingleValue = (val: string) => {
    onChange(selectedValues.filter((v) => v.toLowerCase() !== val.toLowerCase()));
  };

  // Select all SHOWN eligible options
  const handleSelectAllShown = () => {
    // Only select eligible options: count > 0 or not incompatible
    const eligibleVals = filteredOptions
      .filter((o) => !o.incompatible && (o.count === undefined || o.count > 0))
      .map((o) => o.value);

    const currentLower = new Set(selectedValues.map((s) => s.toLowerCase()));
    const toAdd = eligibleVals.filter((v) => !currentLower.has(v.toLowerCase()));
    onChange([...selectedValues, ...toAdd]);
  };

  const handleClear = () => {
    if (searchQuery.trim()) {
      // Clear only filtered
      const filteredLower = new Set(filteredOptions.map((o) => o.value.toLowerCase()));
      onChange(selectedValues.filter((v) => !filteredLower.has(v.toLowerCase())));
    } else {
      onChange([]);
    }
  };

  const badgeStyles = {
    indigo: 'bg-indigo-600 text-white',
    emerald: 'bg-emerald-600 text-white',
    amber: 'bg-amber-600 text-white',
    blue: 'bg-blue-600 text-white',
    purple: 'bg-purple-600 text-white'
  };

  const hasSelected = selectedValues.length > 0;

  // Selected Option Items for chips
  const selectedItems = useMemo(() => {
    return selectedValues.map((val) => {
      const match = normalizedOptions.find((o) => o.value.toLowerCase() === val.toLowerCase());
      return {
        value: val,
        label: match?.label || val,
        incompatible: match?.incompatible || (match && match.count === 0)
      };
    });
  }, [selectedValues, normalizedOptions]);

  return (
    <div className={`relative inline-block text-left ${className}`} ref={containerRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center justify-between gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold w-full min-h-[38px] transition-all cursor-pointer select-none active:scale-[0.98] ${
          hasSelected
            ? isDarkMode
              ? 'bg-indigo-950/70 border-indigo-500/60 text-indigo-300 shadow-xs'
              : 'bg-indigo-50 border-indigo-300 text-indigo-800 shadow-xs'
            : isDarkMode
            ? 'bg-slate-800/90 hover:bg-slate-800 border-slate-700 text-slate-300'
            : 'bg-white hover:bg-slate-50 border-slate-300 text-slate-700'
        }`}
        title={`${label}: ${hasSelected ? selectedValues.join(', ') : 'All'}`}
      >
        <div className="flex items-center gap-1.5 truncate max-w-[190px] sm:max-w-[240px]">
          {icon || <Filter className="w-3.5 h-3.5 opacity-70 shrink-0" />}
          <span className="truncate">
            {label}:{' '}
            <span className="font-extrabold">
              {!hasSelected
                ? placeholder
                : selectedValues.length === 1
                ? selectedValues[0]
                : `${selectedValues.length} Selected`}
            </span>
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {hasSelected && (
            <span
              className={`text-[10px] font-black px-1.5 py-0.2 rounded-full ${badgeStyles[badgeColor]}`}
            >
              {selectedValues.length}
            </span>
          )}
          <ChevronDown
            className={`w-3.5 h-3.5 opacity-60 transition-transform duration-200 ${
              isOpen ? 'rotate-180' : ''
            }`}
          />
        </div>
      </button>

      {/* Dropdown Panel / Mobile Drawer */}
      {isOpen && (
        <>
          {/* Mobile backdrop */}
          <div
            className="fixed inset-0 bg-slate-950/40 z-40 sm:hidden"
            onClick={() => setIsOpen(false)}
          />

          <div
            className={`fixed inset-x-3 bottom-3 sm:inset-auto sm:absolute sm:left-0 sm:mt-1.5 w-auto sm:w-72 md:w-80 max-h-[85vh] sm:max-h-96 rounded-2xl border shadow-2xl z-50 flex flex-col overflow-hidden animate-fade-in ${
              isDarkMode
                ? 'bg-slate-900 border-slate-700 text-slate-100'
                : 'bg-white border-slate-200 text-slate-900'
            }`}
          >
            {/* Header & Search */}
            <div
              className={`p-2.5 border-b shrink-0 flex flex-col gap-2 ${
                isDarkMode ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-100'
              }`}
            >
              <div className="flex items-center justify-between px-1">
                <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">
                  Filter by {label}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSelectAllShown}
                    className="text-[11px] font-bold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 cursor-pointer min-h-[30px] flex items-center"
                    title="Select All Shown Eligible Options"
                  >
                    Select All Shown
                  </button>
                  <span className="text-slate-300 dark:text-slate-700">•</span>
                  <button
                    type="button"
                    onClick={handleClear}
                    className="text-[11px] font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 cursor-pointer min-h-[30px] flex items-center"
                  >
                    Clear
                  </button>
                  {/* Close button for mobile */}
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="sm:hidden p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Search Input */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={searchPlaceholder}
                  className={`w-full text-xs pl-8 pr-7 py-2 rounded-lg border outline-none font-medium transition-colors min-h-[38px] ${
                    isDarkMode
                      ? 'bg-slate-800 border-slate-700 text-slate-100 placeholder:text-slate-500 focus:border-indigo-500'
                      : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-indigo-500'
                  }`}
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Removable Selection Chips inside Dropdown */}
              {showChipsInDropdown && hasSelected && (
                <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto pt-1 pb-0.5">
                  {selectedItems.map((item) => (
                    <span
                      key={item.value}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border transition-colors ${
                        item.incompatible
                          ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-800'
                          : 'bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800'
                      }`}
                      title={item.incompatible ? '0 matches under current filters' : item.label}
                    >
                      {item.incompatible && <AlertTriangle className="w-2.5 h-2.5 text-amber-500" />}
                      <span className="truncate max-w-[140px]">{item.label}</span>
                      {item.incompatible && <span className="text-[9px] opacity-75">(0)</span>}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeSingleValue(item.value);
                        }}
                        className="hover:text-rose-500 p-0.5 rounded-full cursor-pointer"
                        title={`Remove ${item.label}`}
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Options List */}
            <div className="overflow-y-auto p-1.5 max-h-60 sm:max-h-64 space-y-0.5 divide-y divide-slate-100 dark:divide-slate-800/40">
              {filteredOptions.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-400 font-medium">
                  No matching {label.toLowerCase()} found.
                </div>
              ) : (
                filteredOptions.map((opt) => {
                  const isSelected = selectedValues.some(
                    (v) => v.toLowerCase() === opt.value.toLowerCase()
                  );
                  const isIncompatible = opt.incompatible || (opt.count === 0 && isSelected);

                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => toggleOption(opt.value)}
                      className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-bold text-left transition-all cursor-pointer min-h-[36px] ${
                        isSelected
                          ? isIncompatible
                            ? isDarkMode
                              ? 'bg-amber-950/60 text-amber-200 border border-amber-700/50'
                              : 'bg-amber-50 text-amber-900 border border-amber-200'
                            : isDarkMode
                            ? 'bg-indigo-950/80 text-indigo-200 font-black'
                            : 'bg-indigo-50 text-indigo-900 font-black'
                          : isDarkMode
                          ? 'hover:bg-slate-800 text-slate-300'
                          : 'hover:bg-slate-100 text-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0 pr-2">
                        <div
                          className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                            isSelected
                              ? isIncompatible
                                ? 'bg-amber-500 border-amber-500 text-white'
                                : 'bg-indigo-600 border-indigo-600 text-white'
                              : isDarkMode
                              ? 'border-slate-600 bg-slate-800'
                              : 'border-slate-300 bg-white'
                          }`}
                        >
                          {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                        </div>
                        <span className={`truncate ${isIncompatible ? 'line-through opacity-80' : ''}`}>
                          {opt.label || opt.value}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {isIncompatible ? (
                          <span
                            className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300 flex items-center gap-1"
                            title="No matches in current combination"
                          >
                            <AlertTriangle className="w-2.5 h-2.5" />
                            0 matches
                          </span>
                        ) : opt.count !== undefined ? (
                          <span
                            className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full ${
                              isSelected
                                ? 'bg-indigo-200 dark:bg-indigo-900 text-indigo-800 dark:text-indigo-200'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                            }`}
                          >
                            {opt.count.toLocaleString('en-IN')}
                          </span>
                        ) : null}
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {/* Footer */}
            {hasSelected && (
              <div
                className={`px-3 py-2 border-t text-[11px] font-bold flex items-center justify-between shrink-0 ${
                  isDarkMode
                    ? 'bg-slate-950/80 border-slate-800 text-slate-400'
                    : 'bg-slate-50 border-slate-100 text-slate-600'
                }`}
              >
                <span>
                  {selectedValues.length} of {normalizedOptions.length} selected
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleClear}
                    className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 cursor-pointer"
                  >
                    Clear {label}
                  </button>
                  {onResetAll && (
                    <>
                      <span>•</span>
                      <button
                        type="button"
                        onClick={onResetAll}
                        className="text-rose-500 hover:text-rose-600 dark:text-rose-400 cursor-pointer"
                      >
                        Reset All
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
