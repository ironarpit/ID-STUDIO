import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Scan,
  Search,
  CheckCircle2,
  Calendar,
  AlertTriangle,
  Plus,
  RefreshCw,
  Package,
  Layers,
  Sparkles,
  ArrowRight,
  Trash2,
  Edit2
} from 'lucide-react';
import { Product, NearExpiryBatch, NearExpiryItem } from '../../types';
import { resolveOfflineBarcode, normalizeLocalCode } from '../../utils/barcodeResolver';
import { calculateShelfLife, formatDateYYYYMMDD, formatDateDDMMYYYY, formatPendingDaysText, parseToMidnightDate } from '../../utils/nearExpiryEngine';
import { saveNearExpiryItemDB } from '../../utils/indexedDB';
import { BarcodeScannerModal } from '../BarcodeScannerModal';
import { playSuccessBeep } from '../../utils/audio';

interface NearExpiryFastEntryProps {
  batch: NearExpiryBatch;
  stockProducts: Product[];
  onItemAdded: (item: NearExpiryItem) => void;
  isDarkMode?: boolean;
}

export const NearExpiryFastEntry: React.FC<NearExpiryFastEntryProps> = ({
  batch,
  stockProducts,
  onItemAdded,
  isDarkMode = false
}) => {
  // Input search & scanner state
  const [searchInput, setSearchInput] = useState('');
  const [isResolving, setIsResolving] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [candidates, setCandidates] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  // Manual entry fields
  const [nearExpiryQty, setNearExpiryQty] = useState<string>('1');
  const [mfgDate, setMfgDate] = useState<string>('');
  const [expiryDate, setExpiryDate] = useState<string>('');
  const [debitStatus, setDebitStatus] = useState<'NON DEBIT' | 'DEBIT'>('NON DEBIT');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [recentAdded, setRecentAdded] = useState<NearExpiryItem[]>([]);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const qtyInputRef = useRef<HTMLInputElement>(null);

  // Focus input on mount
  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  // Text search suggestions when typing > 2 chars
  const searchSuggestions = useMemo(() => {
    if (!searchInput || searchInput.trim().length < 2 || selectedProduct) return [];
    const query = searchInput.trim().toLowerCase();
    const queryDigits = searchInput.trim().replace(/\D/g, '');

    return stockProducts
      .filter((p) => {
        const nameMatch = (p.name || p.itemName || '').toLowerCase().includes(query);
        const codeMatch = (p.bansalCode || p.localCode || p.code || '').includes(queryDigits || query);
        const barMatch = (p.barcode || '').includes(query);
        return nameMatch || codeMatch || barMatch;
      })
      .slice(0, 6);
  }, [searchInput, stockProducts, selectedProduct]);

  // Handle product identification via offline resolver
  const handleResolve = async (inputVal: string) => {
    const term = inputVal.trim();
    if (!term) return;

    setIsResolving(true);
    setValidationError(null);
    setCandidates([]);

    try {
      const res = await resolveOfflineBarcode(term, stockProducts);

      if (res.ok && res.product) {
        selectProduct(res.product);
      } else if (res.candidates && res.candidates.length > 1) {
        setCandidates(res.candidates);
      } else {
        // Fallback: search by name in stockProducts
        const nameMatches = stockProducts.filter((p) =>
          (p.name || p.itemName || '').toLowerCase().includes(term.toLowerCase())
        );
        if (nameMatches.length === 1) {
          selectProduct(nameMatches[0]);
        } else if (nameMatches.length > 1) {
          setCandidates(nameMatches.slice(0, 10));
        } else {
          setValidationError(`No product found in stock or Barcode Master matching "${term}".`);
        }
      }
    } catch (err) {
      console.error('Resolve error:', err);
      setValidationError('Failed to resolve barcode or code.');
    } finally {
      setIsResolving(false);
    }
  };

  const selectProduct = (p: Product) => {
    setSelectedProduct(p);
    setCandidates([]);
    setValidationError(null);

    // Detect Debit / Non-Debit from raw data if present
    let detectedDebit: 'NON DEBIT' | 'DEBIT' = 'NON DEBIT';
    if (p.rawRowData) {
      for (const [k, v] of Object.entries(p.rawRowData)) {
        const lowerK = k.toLowerCase();
        const lowerV = String(v).toLowerCase();
        if (lowerK.includes('debit') || lowerK.includes('nondebit')) {
          if (lowerV.includes('non') || lowerV.includes('nd')) {
            detectedDebit = 'NON DEBIT';
          } else if (lowerV.includes('debit')) {
            detectedDebit = 'DEBIT';
          }
        }
      }
    }
    setDebitStatus(detectedDebit);

    // Set default dates if available or leave blank for fast entry
    setNearExpiryQty('1');
    setMfgDate('');
    setExpiryDate('');

    // Focus Qty input automatically
    setTimeout(() => {
      qtyInputRef.current?.focus();
      qtyInputRef.current?.select();
    }, 100);
  };

  // Live shelf life calculation
  const shelfLife = useMemo(() => {
    return calculateShelfLife(mfgDate, expiryDate);
  }, [mfgDate, expiryDate]);

  // Live calculated Value
  const calculatedCost = Number(selectedProduct?.costPrice ?? selectedProduct?.cost ?? 0);
  const parsedQty = parseFloat(nearExpiryQty) || 0;
  const calculatedValue = Math.round(parsedQty * calculatedCost * 100) / 100;

  // Handle Save & Add Next
  const handleSaveItem = async (keepFocus: boolean = true) => {
    if (!selectedProduct) {
      setValidationError('Please scan or select a product first.');
      return;
    }

    if (!parsedQty || parsedQty <= 0) {
      setValidationError('Please enter a valid Near Expiry Stock quantity (> 0).');
      qtyInputRef.current?.focus();
      return;
    }

    if (!expiryDate) {
      setValidationError('Please enter the Expiry Date.');
      return;
    }

    const bansalCode = normalizeLocalCode(
      selectedProduct.bansalCode || selectedProduct.localCode || selectedProduct.code || ''
    );
    const barcode = selectedProduct.barcode || '';
    const itemName = selectedProduct.name || selectedProduct.itemName || 'Unnamed Item';
    const mrp = Number(selectedProduct.mrp ?? 0);
    const mtdSale = Number(selectedProduct.salesCount ?? selectedProduct.salesQty ?? 0);
    const supplier = selectedProduct.supplierName || selectedProduct.supplier || '';
    const mainCode = selectedProduct.mainCode || '';
    const category = selectedProduct.category || '';

    const newItem: NearExpiryItem = {
      id: `nei_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      batchId: batch.id,
      productId: selectedProduct.id,
      barcode,
      bansalCode,
      mainCode,
      category,
      itemName,
      debitStatus,
      mrp,
      cost: calculatedCost,
      value: calculatedValue,
      nearExpiryStock: parsedQty,
      mtdSale,
      mfgDate: mfgDate || '',
      expiryDate,
      entryDate: formatDateYYYYMMDD(new Date()),
      totalDays: shelfLife.totalDays,
      pendingDays: shelfLife.pendingDays,
      pendingPct: shelfLife.pendingPct,
      supplier,
      status: 'DRAFT',
      rawProductData: selectedProduct
    };

    try {
      await saveNearExpiryItemDB(newItem);
      playSuccessBeep();
      onItemAdded(newItem);
      setRecentAdded((prev) => [newItem, ...prev.slice(0, 9)]);

      // Reset form for next entry
      setSelectedProduct(null);
      setSearchInput('');
      setNearExpiryQty('1');
      setMfgDate('');
      setExpiryDate('');
      setValidationError(null);

      if (keepFocus) {
        setTimeout(() => {
          searchInputRef.current?.focus();
        }, 100);
      }
    } catch (err) {
      console.error('Save near expiry item error:', err);
      setValidationError('Failed to save item to offline storage.');
    }
  };

  return (
    <div className="space-y-3 max-w-4xl mx-auto">
      {/* 1. Barcode Scanner & Search Bar */}
      <div
        className={`p-3 sm:p-4 rounded-xl border ${
          isDarkMode
            ? 'bg-slate-900 border-slate-800 text-slate-100'
            : 'bg-white border-slate-200 text-slate-900'
        } shadow-xs`}
      >
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-emerald-600 text-white">
              <Plus className="w-4 h-4" />
            </div>
            <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
              Add Near Expiry Product
            </h2>
          </div>
          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Batch: {batch.name}
          </span>
        </div>

        {/* Input Bar */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleResolve(searchInput);
                }
              }}
              placeholder="Scan/type barcode, Bansal Code, or name..."
              className={`w-full pl-9 pr-8 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                isDarkMode
                  ? 'bg-slate-800 border-slate-700 text-white placeholder-slate-400 focus:border-indigo-500'
                  : 'bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400 focus:border-indigo-500'
              } focus:outline-hidden focus:ring-1 focus:ring-indigo-500`}
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => {
                  setSearchInput('');
                  setCandidates([]);
                  searchInputRef.current?.focus();
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                ✕
              </button>
            )}
          </div>

          {/* Resolve / Enter Button */}
          <button
            type="button"
            onClick={() => handleResolve(searchInput)}
            disabled={!searchInput.trim() || isResolving}
            className="min-h-[44px] px-3.5 sm:px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-semibold flex items-center gap-1.5 transition-all disabled:opacity-50 cursor-pointer shrink-0"
          >
            {isResolving ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Search className="w-4 h-4" />
            )}
            <span className="hidden sm:inline">Find</span>
          </button>

          {/* Camera Scanner Button */}
          <button
            type="button"
            onClick={() => setIsScannerOpen(true)}
            className="min-h-[44px] px-3 sm:px-4 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-xs sm:text-sm font-semibold flex items-center gap-1.5 transition-all cursor-pointer shrink-0"
            title="Scan with camera"
          >
            <Scan className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <span className="hidden xs:inline">Scan</span>
          </button>
        </div>

        {/* Search Suggestions Dropdown */}
        {searchSuggestions.length > 0 && (
          <div className="mt-2 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-800 shadow-md">
            {searchSuggestions.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => selectProduct(item)}
                className="w-full text-left px-3 py-2 text-xs flex items-center justify-between gap-2 hover:bg-slate-50 dark:hover:bg-slate-700/60 cursor-pointer"
              >
                <div className="truncate">
                  <div className="font-semibold text-slate-900 dark:text-white truncate">
                    {item.name || item.itemName}
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 flex gap-2">
                    <span>Code: {item.bansalCode || item.localCode || item.code || 'N/A'}</span>
                    <span>• Barcode: {item.barcode || 'N/A'}</span>
                    <span>• Stock: {item.stock ?? item.closingStock ?? 0}</span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    ₹{item.costPrice ?? item.cost ?? 0}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Multiple Candidates Disambiguation */}
        {candidates.length > 1 && (
          <div className="mt-2.5 p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800">
            <div className="text-xs font-bold text-amber-800 dark:text-amber-300 mb-1.5 flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Multiple matching products found. Please select one:</span>
            </div>
            <div className="space-y-1 max-h-44 overflow-y-auto">
              {candidates.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => selectProduct(c)}
                  className="w-full text-left p-2 rounded-lg bg-white dark:bg-slate-900 border border-amber-200/60 text-xs flex items-center justify-between hover:bg-amber-100/50 cursor-pointer"
                >
                  <div>
                    <div className="font-bold text-slate-900 dark:text-white">
                      {c.name || c.itemName}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      Code: {c.bansalCode || c.localCode || c.code} | Barcode: {c.barcode} | Cost: ₹{c.costPrice ?? c.cost}
                    </div>
                  </div>
                  <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">Select</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {validationError && (
          <div className="mt-2 text-xs font-medium text-rose-600 dark:text-rose-400 flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span>{validationError}</span>
          </div>
        )}
      </div>

      {/* 2. Fast Entry Form — Only Near-Expiry Details */}
      {selectedProduct && (
        <div
          className={`p-3 sm:p-4 rounded-xl border ${
            isDarkMode
              ? 'bg-slate-900 border-slate-800 text-slate-100'
              : 'bg-white border-slate-200 text-slate-900'
          } shadow-xs`}
        >
          {/* Autofilled Product Header */}
          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 mb-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white leading-tight">
                  {selectedProduct.name || selectedProduct.itemName}
                </h3>
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 mt-1 text-[11px] text-slate-600 dark:text-slate-300">
                  <span>
                    Bansal Code:{' '}
                    <strong className="font-mono text-slate-900 dark:text-white">
                      {normalizeLocalCode(selectedProduct.bansalCode || selectedProduct.localCode || selectedProduct.code)}
                    </strong>
                  </span>
                  <span>• EAN: <span className="font-mono">{selectedProduct.barcode || 'N/A'}</span></span>
                  <span>• Main: <strong>{selectedProduct.mainCode || 'N/A'}</strong></span>
                  <span>• Cat: <strong>{selectedProduct.category || 'N/A'}</strong></span>
                  {selectedProduct.supplierName && (
                    <span>• Supplier: <strong>{selectedProduct.supplierName}</strong></span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedProduct(null);
                  searchInputRef.current?.focus();
                }}
                className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
                title="Cancel selection"
              >
                ✕
              </button>
            </div>

            {/* Price & REG-STAT Info Row */}
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mt-2 pt-2 border-t border-slate-200 dark:border-slate-700/60 text-xs">
              <div>
                <div className="text-[10px] text-slate-500 uppercase font-semibold">MRP</div>
                <div className="font-bold text-slate-900 dark:text-white">
                  ₹{Number(selectedProduct.mrp || 0).toFixed(2)}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-slate-500 uppercase font-semibold">Cost Price</div>
                <div className="font-bold text-indigo-600 dark:text-indigo-400">
                  ₹{calculatedCost.toFixed(2)}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-slate-500 uppercase font-semibold">MTD Sale</div>
                <div className="font-bold text-slate-800 dark:text-slate-200">
                  {selectedProduct.salesCount ?? selectedProduct.salesQty ?? 0}
                </div>
              </div>
              <div className="col-span-3 sm:col-span-1 flex items-center justify-between sm:justify-start gap-1.5">
                <span className="text-[10px] text-slate-500 uppercase font-semibold">Type:</span>
                <button
                  type="button"
                  onClick={() =>
                    setDebitStatus((prev) => (prev === 'NON DEBIT' ? 'DEBIT' : 'NON DEBIT'))
                  }
                  className={`px-2 py-0.5 text-[10px] font-bold rounded-md border cursor-pointer ${
                    debitStatus === 'DEBIT'
                      ? 'bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border-rose-300'
                      : 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-300'
                  }`}
                  title="Click to toggle Debit / Non-Debit"
                >
                  {debitStatus}
                </button>
              </div>
            </div>
          </div>

          {/* User Enters Near-Expiry Fields: Qty, MFG Date, Expiry Date */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {/* 1. Near Expiry Stock Qty */}
            <div>
              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                Near Expiry Qty <span className="text-rose-500">*</span>
              </label>
              <input
                ref={qtyInputRef}
                type="number"
                min="0.01"
                step="any"
                value={nearExpiryQty}
                onChange={(e) => setNearExpiryQty(e.target.value)}
                placeholder="e.g. 10"
                className={`w-full px-3 py-2 rounded-xl border text-sm font-bold ${
                  isDarkMode
                    ? 'bg-slate-800 border-slate-700 text-white'
                    : 'bg-white border-slate-300 text-slate-900'
                } focus:outline-hidden focus:border-indigo-500`}
              />
            </div>

            {/* 2. MFG Date */}
            <div>
              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                MFG Date
              </label>
              <input
                type="date"
                value={mfgDate}
                onChange={(e) => setMfgDate(e.target.value)}
                className={`w-full px-3 py-2 rounded-xl border text-sm font-semibold ${
                  isDarkMode
                    ? 'bg-slate-800 border-slate-700 text-white'
                    : 'bg-white border-slate-300 text-slate-900'
                } focus:outline-hidden focus:border-indigo-500`}
              />
            </div>

            {/* 3. Expiry Date */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  Expiry Date <span className="text-rose-500">*</span>
                </label>
                <span className="text-[10px] text-slate-400">DD/MM/YYYY or quick buttons</span>
              </div>
              <input
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
                className={`w-full px-3 py-2 rounded-xl border text-sm font-bold ${
                  expiryDate && shelfLife.isExpired
                    ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-400 text-rose-700 dark:text-rose-300'
                    : isDarkMode
                    ? 'bg-slate-800 border-slate-700 text-white'
                    : 'bg-white border-slate-300 text-slate-900'
                } focus:outline-hidden focus:border-indigo-500`}
              />
              {/* Quick Date Chips */}
              <div className="flex flex-wrap gap-1 mt-1.5">
                {[
                  { label: '+15d', days: 15 },
                  { label: '+30d', days: 30 },
                  { label: '+45d', days: 45 },
                  { label: '+60d', days: 60 },
                  { label: '+90d', days: 90 }
                ].map((chip) => {
                  const targetDate = new Date();
                  targetDate.setDate(targetDate.getDate() + chip.days);
                  const yyyyMmDd = formatDateYYYYMMDD(targetDate);
                  return (
                    <button
                      key={chip.label}
                      type="button"
                      onClick={() => setExpiryDate(yyyyMmDd)}
                      className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 cursor-pointer"
                    >
                      {chip.label} ({targetDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })})
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Automatic Calculations Box */}
          <div className="mt-3 p-2.5 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/60">
            <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300 mb-1 flex items-center justify-between">
              <span>Automatic Calculations</span>
              <span>Today: {formatDateDDMMYYYY(new Date())}</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 block">VALUE</span>
                <span className="font-extrabold text-slate-900 dark:text-white text-sm">
                  ₹{calculatedValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>

              <div>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 block">TOTAL SHELF LIFE</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">
                  {shelfLife.totalDays > 0 ? `${shelfLife.totalDays} days` : '—'}
                </span>
              </div>

              <div>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 block">PENDING DAYS</span>
                <span
                  className={`font-bold ${
                    shelfLife.isExpired
                      ? 'text-rose-600 dark:text-rose-400 font-extrabold'
                      : 'text-slate-800 dark:text-slate-200'
                  }`}
                >
                  {expiryDate ? formatPendingDaysText(shelfLife.pendingDays) : '—'}
                </span>
              </div>

              <div>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 block">PENDING %</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">
                  {expiryDate && shelfLife.totalDays > 0 ? `${shelfLife.pendingPct}%` : '—'}
                </span>
              </div>
            </div>
          </div>

          {/* Action Buttons: Save & Add Next / Cancel */}
          <div className="flex items-center gap-2 mt-3 pt-2">
            <button
              type="button"
              onClick={() => handleSaveItem(true)}
              className="min-h-[44px] flex-1 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold flex items-center justify-center gap-2 shadow-xs cursor-pointer transition-all active:scale-[0.99]"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Save & Add Next</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setSelectedProduct(null);
                searchInputRef.current?.focus();
              }}
              className="min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* 3. Items Added in This Session */}
      {recentAdded.length > 0 && (
        <div
          className={`p-3 rounded-xl border ${
            isDarkMode
              ? 'bg-slate-900 border-slate-800 text-slate-100'
              : 'bg-white border-slate-200 text-slate-900'
          } shadow-xs`}
        >
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              <span>Added this session ({recentAdded.length})</span>
            </h4>
            <span className="text-[11px] text-slate-500 font-medium">
              Total Qty: {recentAdded.reduce((s, it) => s + (Number(it.nearExpiryStock) || 0), 0)}
            </span>
          </div>

          <div className="space-y-1.5 max-h-48 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
            {recentAdded.map((it) => (
              <div
                key={it.id}
                className="pt-1.5 first:pt-0 flex items-center justify-between gap-2 text-xs"
              >
                <div className="truncate">
                  <div className="font-semibold text-slate-900 dark:text-white truncate">
                    {it.itemName}
                  </div>
                  <div className="text-[10px] text-slate-500 flex gap-2">
                    <span>Code: {it.bansalCode}</span>
                    <span>• Exp: {formatDateDDMMYYYY(it.expiryDate)}</span>
                    <span className={it.pendingDays < 0 ? 'text-rose-500 font-bold' : ''}>
                      • {formatPendingDaysText(it.pendingDays)}
                    </span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <span className="px-2 py-0.5 text-xs font-extrabold rounded-md bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                    Qty: {it.nearExpiryStock}
                  </span>
                  <div className="text-[10px] font-bold text-slate-600 dark:text-slate-400 mt-0.5">
                    ₹{Number(it.value || 0).toFixed(2)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Barcode Scanner Modal */}
      <BarcodeScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScanResult={(code) => {
          setIsScannerOpen(false);
          setSearchInput(code);
          handleResolve(code);
        }}
        soundEnabled={true}
        onToggleSound={() => {}}
        products={stockProducts}
      />
    </div>
  );
};
