import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, Camera, Image as ImageIcon, ScanLine, X, Sparkles } from 'lucide-react';
import { Product } from '../types';
import { cleanBarcode } from '../utils/fileParser';
import { searchProductsFlexible } from '../utils/barcodeResolver';

interface SearchInputProps {
  products: Product[];
  onSelectProduct: (product: Product) => void;
  onOpenScanner: () => void;
  onOpenPhotoScanner?: () => void;
  currentSearchTerm: string;
  onSearchTermChange: (term: string) => void;
  onBarcodeScan?: (barcode: string) => void;
  activeProductBarcode?: string;
}

export const SearchInput: React.FC<SearchInputProps> = ({
  products,
  onSelectProduct,
  onOpenScanner,
  onOpenPhotoScanner,
  currentSearchTerm,
  onSearchTermChange,
  onBarcodeScan,
  activeProductBarcode
}) => {
  const [isOpenSuggestions, setIsOpenSuggestions] = useState(false);
  const [hardwareDetected, setHardwareDetected] = useState(false);
  const [keypadMode, setKeypadMode] = useState<'numeric' | 'text'>('numeric');
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // High performance filtered suggestions using flexible search matching
  const filteredSuggestions = useMemo(() => {
    return searchProductsFlexible(currentSearchTerm, products, { limit: 7 });
  }, [products, currentSearchTerm]);

  // USB/Bluetooth Barcode Scanner Hardware listener
  useEffect(() => {
    let buffer = '';
    let lastKeyTime = Date.now();

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is typing normally in another input or textarea or modal
      const activeTag = document.activeElement?.tagName.toLowerCase();
      if (activeTag === 'textarea' || (activeTag === 'input' && document.activeElement !== inputRef.current)) {
        return;
      }

      const now = Date.now();
      const timeDiff = now - lastKeyTime;
      lastKeyTime = now;

      // Hardware scanners type very fast (< 50ms per key)
      if (e.key === 'Enter') {
        if (buffer.length >= 3) {
          const rawCode = buffer.trim();
          const scannedCode = cleanBarcode(rawCode) || rawCode;
          buffer = '';
          setHardwareDetected(true);
          setTimeout(() => setHardwareDetected(false), 2000);

          // Pass scanned code to trigger complete barcode lookup (including multiple matches)
          if (onBarcodeScan) {
            onBarcodeScan(scannedCode);
          } else {
            onSearchTermChange(scannedCode);
          }
          setIsOpenSuggestions(false);
          if (inputRef.current) inputRef.current.blur();
        } else if (document.activeElement === inputRef.current && currentSearchTerm.trim()) {
          // Manual enter press in search input
          if (onBarcodeScan && /^\d{4,}$/.test(currentSearchTerm.trim())) {
            onBarcodeScan(currentSearchTerm.trim());
          } else {
            onSearchTermChange(currentSearchTerm.trim());
          }
          setIsOpenSuggestions(false);
          if (inputRef.current) inputRef.current.blur();
        }
      } else if (e.key.length === 1) {
        if (timeDiff > 100) {
          // Normal human typing or start of new scan
          buffer = e.key;
        } else {
          // Rapid hardware scan typing
          buffer += e.key;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [products, currentSearchTerm, onSelectProduct, onSearchTermChange]);

  // Click outside listener for suggestions
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpenSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative w-full max-w-2xl mx-auto">
      {/* Hardware Scanner Notification Banner */}
      {hardwareDetected && (
        <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-indigo-600 text-white font-bold text-xs px-3.5 py-1 rounded-full shadow-md flex items-center gap-1.5 animate-fade-in z-40">
          <ScanLine className="w-3.5 h-3.5" />
          Hardware Scanner Input Received!
        </div>
      )}

      {/* Main Search Bar Frame */}
      <div className="relative flex items-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 focus-within:border-indigo-500 dark:focus-within:border-indigo-400 rounded-xl shadow-xs transition-all overflow-hidden group">
        <div className="pl-3 pr-1 text-slate-400 dark:text-slate-500 group-focus-within:text-indigo-600 dark:group-focus-within:text-indigo-400 shrink-0">
          <Search className="w-4 h-4" />
        </div>

        {/* Change Keypad Option */}
        <button
          type="button"
          onClick={() => {
            setKeypadMode((prev) => (prev === 'numeric' ? 'text' : 'numeric'));
            setTimeout(() => inputRef.current?.focus(), 50);
          }}
          className={`ml-1.5 px-2 py-1 rounded-lg text-[10px] font-extrabold transition-all border shrink-0 flex items-center gap-1 cursor-pointer active:scale-95 ${
            keypadMode === 'numeric'
              ? 'bg-amber-50 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800'
              : 'bg-indigo-50 dark:bg-indigo-950/80 text-indigo-800 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800'
          }`}
          title="Toggle keyboard layout between Numeric and Alphabetical"
        >
          <span>{keypadMode === 'numeric' ? '123' : 'ABC'}</span>
        </button>

        <input
          ref={inputRef}
          type="text"
          inputMode={keypadMode}
          pattern={keypadMode === 'numeric' ? '[0-9]*' : undefined}
          value={currentSearchTerm}
          onChange={(e) => {
            onSearchTermChange(e.target.value);
            setIsOpenSuggestions(true);
          }}
          onFocus={() => {
            setIsOpenSuggestions(true);
          }}
          onTouchStart={() => {
            setIsOpenSuggestions(true);
          }}
          onClick={() => {
            setIsOpenSuggestions(true);
          }}
          placeholder={keypadMode === 'numeric' ? 'Enter numeric barcode...' : 'Search by name / main code...'}
          className="w-full bg-transparent text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 text-xs sm:text-sm py-2 px-2 focus:outline-none font-medium"
        />

        {/* Clear Button */}
        {currentSearchTerm && (
          <button
            onClick={() => {
              onSearchTermChange('');
              inputRef.current?.focus();
            }}
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 mr-1 rounded-md cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}

        {/* Action Buttons inside Search Bar: Barcode Camera Scan + Photo Search */}
        <div className="mr-1.5 flex items-center gap-1 shrink-0">
          {/* Camera Scan (Barcode) */}
          <button
            type="button"
            onClick={onOpenScanner}
            className="flex items-center gap-1 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs px-2.5 py-1 rounded-lg transition-all active:scale-95 cursor-pointer shadow-xs"
            title="Camera Barcode Scanner"
          >
            <Camera className="w-3.5 h-3.5" />
            <span className="hidden xs:inline">Scan</span>
          </button>

          {/* Photo Scanner (Product Picture Search) */}
          {onOpenPhotoScanner && (
            <button
              type="button"
              onClick={onOpenPhotoScanner}
              className="flex items-center gap-1 bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 text-white font-semibold text-xs px-2.5 py-1 rounded-lg transition-all active:scale-95 cursor-pointer shadow-xs"
              title="Photo Scanner - Take picture or upload product photo to search"
            >
              <ImageIcon className="w-3.5 h-3.5 text-indigo-300" />
              <span className="hidden xs:inline">Photo</span>
            </button>
          )}
        </div>
      </div>

      {/* Auto-suggestions Dropdown */}
      {isOpenSuggestions && filteredSuggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl z-40 overflow-hidden divide-y divide-slate-100 dark:divide-slate-800 animate-fade-in">
          <div className="p-2.5 bg-slate-50 dark:bg-slate-950 text-[10px] uppercase font-bold tracking-wider text-slate-500 dark:text-slate-400 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
            <span>Search Suggestions ({filteredSuggestions.length})</span>
            <span>Click product to select</span>
          </div>

          {filteredSuggestions.map((product) => {
            const isSelected = activeProductBarcode === product.barcode;
            return (
              <button
                key={product.id}
                onClick={() => {
                  onSelectProduct(product);
                  setIsOpenSuggestions(false);
                }}
                className={`w-full p-3.5 text-left transition-colors flex items-center justify-between gap-3 cursor-pointer ${
                  isSelected 
                    ? 'bg-indigo-50 dark:bg-indigo-950/60 border-l-4 border-indigo-600' 
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900 shrink-0">
                    <ScanLine className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-sm text-slate-900 dark:text-white truncate">{product.name}</p>
                    <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      <span className="font-mono text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950 px-1.5 py-0.5 rounded border border-indigo-200 dark:border-indigo-800">
                        {product.barcode}
                      </span>
                      {product.category && product.category !== 'General' && (
                        <>
                          <span>•</span>
                          <span>{product.category}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <div className="text-sm font-bold text-slate-900 dark:text-white">
                    ₹{product.salePrice.toLocaleString('en-IN')}
                  </div>
                  {product.mrp > product.salePrice && (
                    <div className="text-[10px] text-slate-400 line-through">
                      MRP ₹{product.mrp.toLocaleString('en-IN')}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
