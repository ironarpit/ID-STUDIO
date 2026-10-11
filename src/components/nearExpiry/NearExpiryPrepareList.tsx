import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Calendar,
  Search,
  Plus,
  FileSpreadsheet,
  Upload,
  Download,
  Trash2,
  AlertTriangle,
  Check,
  Package,
  Layers,
  Sparkles,
  ChevronDown
} from 'lucide-react';
import { Product, NearExpiryBatch, NearExpiryItem } from '../../types';
import {
  formatDateDDMMYYYY,
  formatDateYYYYMMDD,
  calculateShelfLife,
  formatDisplayDays,
  formatDisplayPct,
  parseFlexibleDateInput,
  validateMfgAndExpiry
} from '../../utils/nearExpiryEngine';
import {
  normalizeLocalCode,
  normalizeScannedBarcode,
  resolveScannedBarcode,
  searchProductsFlexible,
  BarcodeResolveResult
} from '../../utils/barcodeResolver';
import { saveNearExpiryItemDB, deleteNearExpiryItemDB, saveBarcodeOverrideDB } from '../../utils/indexedDB';
import { downloadHoNearExpiryExcel } from '../../utils/nearExpiryExcel';
import { BarcodeConflictModal } from '../BarcodeConflictModal';
import { playSuccessBeep, playErrorBeep, triggerVibration } from '../../utils/audio';

interface NearExpiryPrepareListProps {
  batch: NearExpiryBatch;
  allBatches?: NearExpiryBatch[];
  onSelectBatch?: (batch: NearExpiryBatch) => void;
  onOpenBatchModal?: () => void;
  items: NearExpiryItem[];
  onItemsChange: (items: NearExpiryItem[]) => void;
  stockProducts: Product[];
  onOpenImportModal: () => void;
  onOpenHoUploadModal?: () => void;
  onBatchUpdated?: (updatedBatch: NearExpiryBatch) => void;
  isDarkMode?: boolean;
}

export const NearExpiryPrepareList: React.FC<NearExpiryPrepareListProps> = ({
  batch,
  allBatches,
  onSelectBatch,
  onOpenBatchModal,
  items,
  onItemsChange,
  stockProducts,
  onOpenImportModal,
  onOpenHoUploadModal,
  onBatchUpdated,
  isDarkMode = false
}) => {
  // Search state for product addition
  const [searchInput, setSearchInput] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [candidates, setCandidates] = useState<Product[]>([]);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Scan Request ID Token to prevent stale async resolutions from overwriting newer scans
  const scanRequestIdRef = useRef<number>(0);

  // Conflict Modal State
  const [conflictModalData, setConflictModalData] = useState<{
    isOpen: boolean;
    barcode: string;
    candidates: Product[];
    candidateDetails?: any[];
    masterIdentity?: any;
    overrideIdentity?: any;
    isStaleOverride?: boolean;
  }>({
    isOpen: false,
    barcode: '',
    candidates: []
  });

  // Form Inputs
  const [nearExpiryQty, setNearExpiryQty] = useState('1');
  const [mfgDateInput, setMfgDateInput] = useState('');
  const [expiryDateInput, setExpiryDateInput] = useState('');
  const [debitStatus, setDebitStatus] = useState<'NON DEBIT' | 'DEBIT'>('NON DEBIT');

  // Compact list search
  const [listSearch, setListSearch] = useState('');
  const [itemToDelete, setItemToDelete] = useState<NearExpiryItem | null>(null);
  const [isDownloadingExcel, setIsDownloadingExcel] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const qtyInputRef = useRef<HTMLInputElement>(null);

  // Strict shared barcode resolver for hardware scans, camera scans, and exact code submissions
  const resolveBarcodeStrictly = async (scannedBarcode: string) => {
    if (!scannedBarcode || !scannedBarcode.trim()) return;
    const rawCode = scannedBarcode.trim();

    // 1. Increment request token to cancel/ignore any older unfinished scan resolution
    const currentRequestId = ++scanRequestIdRef.current;

    // 2. Clear previous Near Expiry selected product, stale search results and errors
    setSelectedProduct(null);
    setCandidates([]);
    setValidationError(null);

    try {
      // 3. Resolve using the exact same shared barcode resolver used by Floor IQ
      const result: BarcodeResolveResult = await resolveScannedBarcode(rawCode, stockProducts);

      // Check if a newer scan was initiated while waiting
      if (scanRequestIdRef.current !== currentRequestId) {
        return;
      }

      // Exact match resolved (current_stock, saved_override, barcode_master, or store_label_fallback)
      if (
        result.ok &&
        result.product &&
        (result.resolution === 'current_stock' ||
          result.resolution === 'saved_override' ||
          result.resolution === 'barcode_master' ||
          result.resolution === 'store_label_fallback')
      ) {
        const prod = result.product;
        setSelectedProduct(prod);
        setCandidates([]);
        setValidationError(null);
        setNearExpiryQty('1');
        setSearchInput(''); // Clear search input to avoid stale text

        try {
          playSuccessBeep();
          triggerVibration(80);
        } catch {}

        setTimeout(() => {
          qtyInputRef.current?.focus();
          qtyInputRef.current?.select();
        }, 100);
        return;
      }

      // Conflict / Identity mismatch / Multi-candidate ambiguity
      if (
        result.ambiguous ||
        result.resolution === 'barcode_master_conflict' ||
        result.resolution === 'barcode_identity_conflict' ||
        result.resolution === 'current_stock_conflict' ||
        result.resolution === 'store_label_conflict' ||
        result.resolution === 'stale_override_conflict'
      ) {
        // Never silently choose a product when multiple matches or identity conflicts exist
        setSelectedProduct(null);
        setCandidates([]);
        setValidationError(null);
        setConflictModalData({
          isOpen: true,
          barcode: rawCode,
          candidates: result.candidates || [],
          candidateDetails: result.candidateDetails,
          masterIdentity: result.masterIdentity,
          overrideIdentity: result.overrideIdentity,
          isStaleOverride: result.isStaleOverride
        });
        return;
      }

      // Not Found
      setSelectedProduct(null);
      setCandidates([]);
      setValidationError('BARCODE NOT FOUND');
      try {
        playErrorBeep();
        triggerVibration(200);
      } catch {}
    } catch (err) {
      if (scanRequestIdRef.current === currentRequestId) {
        console.error('Near Expiry barcode resolution error:', err);
        setSelectedProduct(null);
        setCandidates([]);
        setValidationError('BARCODE NOT FOUND');
      }
    }
  };

  // Dedicated single scan listener for Near Expiry Prepare List
  useEffect(() => {
    const handleNearExpiryScan = (e: CustomEvent<{ barcode: string }>) => {
      if (e.detail?.barcode) {
        resolveBarcodeStrictly(e.detail.barcode);
      }
    };

    window.addEventListener('near-expiry-scan' as any, handleNearExpiryScan);
    return () => {
      window.removeEventListener('near-expiry-scan' as any, handleNearExpiryScan);
    };
  }, [stockProducts]);

  // Handle conflict modal candidate selection
  const handleSelectConflictCandidate = async (candidate: Product, alwaysUse: boolean = false) => {
    const rawBarcode = conflictModalData.barcode || candidate.barcode;
    setConflictModalData({ isOpen: false, barcode: '', candidates: [] });

    if (alwaysUse && rawBarcode) {
      try {
        await saveBarcodeOverrideDB({
          scannedBarcode: rawBarcode,
          targetBansalCode: candidate.bansalCode || candidate.localCode || candidate.code || '',
          targetProductName: candidate.name || candidate.itemName || '',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      } catch (err) {
        console.warn('Failed to save barcode override:', err);
      }
    }

    handleSelectProduct(candidate);
  };

  // Parsed dates
  const mfgParse = useMemo(() => {
    if (!mfgDateInput.trim()) return null;
    return parseFlexibleDateInput(mfgDateInput);
  }, [mfgDateInput]);

  const expiryParse = useMemo(() => {
    if (!expiryDateInput.trim()) return null;
    return parseFlexibleDateInput(expiryDateInput);
  }, [expiryDateInput]);

  // Live shelf life calculation
  const shelfLife = useMemo(() => {
    const mfgDate = mfgParse?.date ? formatDateYYYYMMDD(mfgParse.date) : '';
    const expiryDate = expiryParse?.date ? formatDateYYYYMMDD(expiryParse.date) : '';
    return calculateShelfLife(mfgDate, expiryDate);
  }, [mfgParse, expiryParse]);

  const calculatedCost = Number(selectedProduct?.costPrice ?? selectedProduct?.cost ?? 0);
  const parsedQty = parseFloat(nearExpiryQty) || 0;
  const calculatedValue = Math.round(parsedQty * calculatedCost * 100) / 100;

  // Manual typing search handler (provides suggestions without auto-selecting on partial/single match)
  const handleSearchChange = (query: string) => {
    setSearchInput(query);
    setValidationError(null);
    if (!query.trim()) {
      setCandidates([]);
      return;
    }

    // Prohibit auto-selection; provide clean list of up to 8 matching items
    const matches = searchProductsFlexible(query, stockProducts);
    setCandidates(matches.slice(0, 8));
  };

  const handleSelectProduct = (product: Product) => {
    setSelectedProduct(product);
    setCandidates([]);
    setValidationError(null);
    setNearExpiryQty('1');
    setSearchInput('');

    setTimeout(() => {
      qtyInputRef.current?.focus();
      qtyInputRef.current?.select();
    }, 100);
  };

  // Quick Chips for Expiry
  const handleQuickExpiryChip = (days: number) => {
    const target = new Date();
    target.setDate(target.getDate() + days);
    const dd = String(target.getDate()).padStart(2, '0');
    const mm = String(target.getMonth() + 1).padStart(2, '0');
    const yyyy = target.getFullYear();
    setExpiryDateInput(`${dd}-${mm}-${yyyy}`);
  };

  // Add Product to Batch
  const handleAddProduct = async () => {
    if (!selectedProduct) {
      setValidationError('Please search and select a product first.');
      return;
    }

    if (parsedQty <= 0) {
      setValidationError('Please enter a valid Near Expiry quantity (> 0).');
      qtyInputRef.current?.focus();
      return;
    }

    // Validate dates
    const dateVal = validateMfgAndExpiry(mfgDateInput, expiryDateInput);
    if (!dateVal.valid || !dateVal.expDate) {
      setValidationError(dateVal.error || 'Please enter a valid Expiry Date.');
      return;
    }

    const bansalCode = normalizeLocalCode(
      selectedProduct.bansalCode || selectedProduct.localCode || selectedProduct.code || ''
    );
    // Populate actual EAN from the product without copying Bansal code into EAN
    const barcode = selectedProduct.barcode || '';
    const itemName = selectedProduct.name || selectedProduct.itemName || 'Unnamed Item';
    const mrp = Number(selectedProduct.mrp ?? 0);
    const mtdSale = Number(selectedProduct.salesCount ?? selectedProduct.salesQty ?? 0);
    const supplier = selectedProduct.supplierName || selectedProduct.supplier || '';
    const mainCode = selectedProduct.mainCode || '';
    const category = selectedProduct.category || '';

    const formattedMfg = dateVal.mfgDate ? formatDateDDMMYYYY(dateVal.mfgDate) : '';
    const formattedExp = formatDateDDMMYYYY(dateVal.expDate);

    // Save as distinct expiry lot
    const newItem: NearExpiryItem = {
      id: `nei_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
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
      mfgDate: formattedMfg,
      expiryDate: formattedExp,
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
      onItemsChange([newItem, ...items]);

      // Reset entry form
      setSelectedProduct(null);
      setSearchInput('');
      setNearExpiryQty('1');
      setMfgDateInput('');
      setExpiryDateInput('');
      setValidationError(null);

      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    } catch (err) {
      console.error('Error saving item:', err);
      setValidationError('Failed to save product to offline storage.');
    }
  };

  // Delete item handler
  const confirmDeleteItem = async () => {
    if (!itemToDelete) return;
    try {
      await deleteNearExpiryItemDB(itemToDelete.id);
      onItemsChange(items.filter((it) => it.id !== itemToDelete.id));
      setItemToDelete(null);
    } catch (err) {
      console.error('Failed to delete item:', err);
    }
  };

  // Download HO Excel handler
  const handleDownloadHoExcel = async () => {
    if (items.length === 0) {
      alert('This batch is currently empty. Add products or import a list first.');
      return;
    }
    setIsDownloadingExcel(true);
    try {
      await downloadHoNearExpiryExcel(batch, items);
    } catch (err) {
      console.error('Error generating HO Excel:', err);
      alert('Failed to generate Excel file.');
    } finally {
      setIsDownloadingExcel(false);
    }
  };

  // Filtered items in compact list
  const filteredItems = useMemo(() => {
    if (!listSearch.trim()) return items;
    const query = listSearch.trim().toLowerCase();
    const norm = normalizeLocalCode(query);
    const normBar = normalizeScannedBarcode(query);

    return items.filter((it) => {
      const code = normalizeLocalCode(it.bansalCode || it.hoBansalCode);
      const barcode = normalizeScannedBarcode(it.barcode || it.hoEanCode);
      const name = (it.itemName || it.hoItemName || '').toLowerCase();

      return (
        (norm && code === norm) ||
        (normBar && barcode === normBar) ||
        name.includes(query)
      );
    });
  }, [items, listSearch]);

  const batchTotalUnits = items.reduce((sum, it) => sum + (Number(it.nearExpiryStock) || 0), 0);
  const batchTotalValue = items.reduce((sum, it) => sum + (Number(it.value) || 0), 0);

  return (
    <div className="space-y-3.5 max-w-5xl mx-auto">
      {/* 1. Header Control Bar: Fortnight Selector + Action Buttons */}
      <div
        className={`p-3 sm:p-4 rounded-2xl border ${
          isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
        } shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3`}
      >
        {/* Active Fortnight Selector */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenBatchModal}
            className="min-h-[42px] px-3.5 py-1.5 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50/80 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:hover:bg-indigo-900/60 text-indigo-950 dark:text-indigo-200 text-xs font-bold flex items-center gap-2 transition-all cursor-pointer"
          >
            <Calendar className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <div className="text-left">
              <span className="text-[10px] uppercase font-bold text-indigo-500 block leading-none">
                Fortnight Batch
              </span>
              <span className="font-extrabold text-xs">{batch.name}</span>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-indigo-500 ml-1" />
          </button>

          <span className="text-xs font-semibold text-slate-500">
            Store: <strong>{batch.storeName || 'PATAN'}</strong>
          </span>
        </div>

        {/* Action Buttons: Import, Download HO Excel, Upload HO Response */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={onOpenImportModal}
            className="min-h-[40px] px-3 py-1.5 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-2xs"
            title="Import existing list from Excel"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Import List</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadHoExcel}
            disabled={isDownloadingExcel || items.length === 0}
            className="min-h-[40px] px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-2xs"
            title="Download formatted Excel for Head Office"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{isDownloadingExcel ? 'Generating...' : 'Download HO Excel'}</span>
          </button>

          <button
            type="button"
            onClick={onOpenHoUploadModal}
            className="min-h-[40px] px-3 py-1.5 rounded-xl border border-indigo-300 dark:border-indigo-700 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-2xs"
            title="Upload response returned from Head Office"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Upload HO Response</span>
          </button>
        </div>
      </div>

      {/* 2. Add Near Expiry Product Card */}
      <div
        className={`p-3.5 sm:p-5 rounded-2xl border ${
          isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
        } shadow-xs space-y-3.5`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-indigo-600 text-white">
              <Plus className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                Add Near Expiry Product
              </h2>
              <p className="text-[11px] text-slate-500">
                Scan barcode or search by name / Bansal code
              </p>
            </div>
          </div>
        </div>

        {/* Search & Scan Input */}
        <div className="relative">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchInput}
              onChange={(e) => handleSearchChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && searchInput.trim()) {
                  e.preventDefault();
                  resolveBarcodeStrictly(searchInput.trim());
                }
              }}
              placeholder="Scan Barcode / Enter Bansal Code or Name..."
              className={`w-full pl-9 pr-8 py-2.5 rounded-xl border text-xs sm:text-sm font-medium ${
                isDarkMode
                  ? 'bg-slate-800 border-slate-700 text-white placeholder-slate-400'
                  : 'bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400'
              } focus:outline-hidden focus:border-indigo-500 focus:bg-white dark:focus:bg-slate-900`}
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => {
                  setSearchInput('');
                  setCandidates([]);
                  searchInputRef.current?.focus();
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
              >
                ✕
              </button>
            )}
          </div>

          {/* Autocomplete candidates dropdown */}
          {candidates.length > 0 && !selectedProduct && (
            <div className="absolute z-20 top-full left-0 right-0 mt-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg max-h-56 overflow-y-auto">
              {candidates.map((cand) => (
                <button
                  key={cand.id}
                  type="button"
                  onClick={() => handleSelectProduct(cand)}
                  className="w-full text-left p-2.5 text-xs hover:bg-slate-50 dark:hover:bg-slate-800 border-b border-slate-100 dark:border-slate-800 last:border-0 flex items-center justify-between cursor-pointer"
                >
                  <div className="pr-2">
                    <div className="font-bold text-slate-900 dark:text-white">
                      {cand.name || cand.itemName}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      Code: {cand.bansalCode || cand.code} • Barcode: {cand.barcode || 'N/A'} • MRP: ₹{cand.mrp || 0}
                    </div>
                  </div>
                  <span className="text-[11px] font-bold text-indigo-600 shrink-0">Select</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Conflict Selection Modal */}
        {conflictModalData.isOpen && (
          <BarcodeConflictModal
            isOpen={conflictModalData.isOpen}
            onClose={() => setConflictModalData({ isOpen: false, barcode: '', candidates: [] })}
            barcode={conflictModalData.barcode}
            candidates={conflictModalData.candidates}
            candidateDetails={conflictModalData.candidateDetails}
            masterIdentity={conflictModalData.masterIdentity}
            overrideIdentity={conflictModalData.overrideIdentity}
            isStaleOverride={conflictModalData.isStaleOverride}
            stockProducts={stockProducts}
            onSelectCandidate={handleSelectConflictCandidate}
            isDarkMode={isDarkMode}
          />
        )}

        {/* Validation Error Message */}
        {validationError && (
          <div className="p-2 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 font-semibold flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{validationError}</span>
          </div>
        )}

        {/* Selected Product Form Fields */}
        {selectedProduct && (
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60 space-y-3">
            {/* Product Identity Header */}
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                  {selectedProduct.name || selectedProduct.itemName}
                </h3>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  <span>Code: <strong className="font-mono text-slate-700 dark:text-slate-200">{normalizeLocalCode(selectedProduct.bansalCode || selectedProduct.code)}</strong></span>
                  <span>•</span>
                  <span>EAN: <span className="font-mono">{selectedProduct.barcode || 'N/A'}</span></span>
                  <span>•</span>
                  <span>MRP: <strong>₹{Number(selectedProduct.mrp || 0).toFixed(2)}</strong></span>
                  <span>•</span>
                  <span>Cost: <strong>₹{calculatedCost.toFixed(2)}</strong></span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedProduct(null)}
                className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
                title="Cancel product"
              >
                ✕
              </button>
            </div>

            {/* Form Inputs Grid: Qty, MFG Date, Expiry Date */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* 1. Near Expiry Qty */}
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
                  placeholder="e.g. 5"
                  className={`w-full px-3 py-2 rounded-xl border text-sm font-bold ${
                    isDarkMode
                      ? 'bg-slate-800 border-slate-700 text-white'
                      : 'bg-white border-slate-300 text-slate-900'
                  } focus:outline-hidden focus:border-indigo-500`}
                />
              </div>

              {/* 2. Numeric MFG Date Input */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                    MFG Date
                  </label>
                  {mfgParse?.valid && (
                    <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                      ✓ {mfgParse.formattedDDMMYYYY}
                    </span>
                  )}
                </div>
                <input
                  type="text"
                  inputMode="numeric"
                  value={mfgDateInput}
                  onChange={(e) => setMfgDateInput(e.target.value)}
                  placeholder="e.g. 07-12 or 0712"
                  className={`w-full px-3 py-2 rounded-xl border text-sm font-semibold ${
                    mfgDateInput && !mfgParse?.valid
                      ? 'border-amber-400 bg-amber-50/50 dark:bg-amber-950/20'
                      : isDarkMode
                      ? 'bg-slate-800 border-slate-700 text-white'
                      : 'bg-white border-slate-300 text-slate-900'
                  } focus:outline-hidden focus:border-indigo-500`}
                />
                <span className="text-[10px] text-slate-400 mt-0.5 block">
                  Numeric DD-MM (Current Year) or DD-MM-YYYY
                </span>
              </div>

              {/* 3. Numeric Expiry Date Input */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                    Expiry Date <span className="text-rose-500">*</span>
                  </label>
                  {expiryParse?.valid && (
                    <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400">
                      ✓ {expiryParse.formattedDDMMYYYY}
                    </span>
                  )}
                </div>
                <input
                  type="text"
                  inputMode="numeric"
                  value={expiryDateInput}
                  onChange={(e) => setExpiryDateInput(e.target.value)}
                  placeholder="e.g. 07-12 or 07-12-2026"
                  className={`w-full px-3 py-2 rounded-xl border text-sm font-bold ${
                    expiryDateInput && !expiryParse?.valid
                      ? 'border-rose-400 bg-rose-50/50 dark:bg-rose-950/20'
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
                  ].map((chip) => (
                    <button
                      key={chip.label}
                      type="button"
                      onClick={() => handleQuickExpiryChip(chip.days)}
                      className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-slate-200/70 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 cursor-pointer"
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Calculations & Debit Status */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-200 dark:border-slate-700/60 text-xs">
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-bold block">Value</span>
                <span className="font-extrabold text-slate-900 dark:text-white">
                  ₹{calculatedValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-bold block">Total Days</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {shelfLife.totalDays > 0 ? `${shelfLife.totalDays} days` : '—'}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-bold block">Days Left</span>
                <span
                  className={`font-bold ${
                    shelfLife.isExpired
                      ? 'text-rose-600 dark:text-rose-400'
                      : 'text-slate-800 dark:text-slate-200'
                  }`}
                >
                  {expiryParse?.valid ? formatDisplayDays(shelfLife.pendingDays) : '—'}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-bold block">Pending %</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">
                  {expiryParse?.valid ? formatDisplayPct(shelfLife.pendingPct) : '—'}
                </span>
              </div>
            </div>

            {/* Add Button */}
            <div className="pt-2 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-slate-500 text-[11px] font-medium">Type:</span>
                <button
                  type="button"
                  onClick={() => setDebitStatus((prev) => (prev === 'DEBIT' ? 'NON DEBIT' : 'DEBIT'))}
                  className={`px-2 py-0.5 text-[10px] font-bold rounded-md border cursor-pointer ${
                    debitStatus === 'DEBIT'
                      ? 'bg-rose-50 text-rose-700 border-rose-300'
                      : 'bg-emerald-50 text-emerald-700 border-emerald-300'
                  }`}
                >
                  {debitStatus}
                </button>
              </div>

              <button
                type="button"
                onClick={handleAddProduct}
                className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-sm cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add to Batch</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 3. Current Batch Summary Bar */}
      <div
        className={`p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs ${
          isDarkMode
            ? 'bg-slate-900 border-slate-800 text-slate-200'
            : 'bg-white border-slate-200 text-slate-800'
        } shadow-xs`}
      >
        <div className="flex items-center gap-2">
          <span className="font-extrabold text-sm text-slate-900 dark:text-white">
            {items.length} Products
          </span>
          <span className="text-slate-400">•</span>
          <span>Total Qty: <strong>{batchTotalUnits}</strong></span>
          <span className="text-slate-400">•</span>
          <span>Total Value: <strong>₹{batchTotalValue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</strong></span>
        </div>

        {/* Filter / Search within added products */}
        <div className="relative min-w-[200px]">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={listSearch}
            onChange={(e) => setListSearch(e.target.value)}
            placeholder="Search added products..."
            className={`w-full pl-8 pr-3 py-1.5 rounded-lg border text-xs ${
              isDarkMode
                ? 'bg-slate-800 border-slate-700 text-white'
                : 'bg-slate-50 border-slate-300 text-slate-900'
            } focus:outline-hidden focus:border-indigo-500`}
          />
        </div>
      </div>

      {/* 4. Compact List of Added Products (Preserves separate expiry lots, NO floor removal controls) */}
      <div
        className={`rounded-2xl border overflow-hidden ${
          isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
        } shadow-xs`}
      >
        {filteredItems.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-xs">
            {items.length === 0
              ? 'No products added to this fortnight batch yet. Use the search bar above or click "Import List".'
              : 'No products match your search.'}
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {filteredItems.map((it) => {
              const shelf = calculateShelfLife(it.mfgDate, it.expiryDate);

              return (
                <div
                  key={it.id}
                  className="p-3 sm:px-4 sm:py-2.5 flex items-center justify-between gap-3 text-xs hover:bg-slate-50 dark:hover:bg-slate-800/50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 dark:text-white truncate">
                        {it.itemName || it.hoItemName}
                      </span>
                      <span
                        className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                          it.debitStatus === 'DEBIT'
                            ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                            : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                        }`}
                      >
                        {it.debitStatus || 'NON DEBIT'}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      <span>Code: <strong className="font-mono text-slate-700 dark:text-slate-200">{it.bansalCode || it.hoBansalCode}</strong></span>
                      <span>•</span>
                      <span>Barcode: <span className="font-mono">{it.barcode || it.hoEanCode || 'N/A'}</span></span>
                      <span>•</span>
                      <span>Expiry: <strong className="text-slate-800 dark:text-slate-200">{formatDateDDMMYYYY(it.expiryDate || it.hoExpiryDate)}</strong></span>
                      {it.mfgDate && (
                        <>
                          <span>•</span>
                          <span>MFG: {formatDateDDMMYYYY(it.mfgDate)}</span>
                        </>
                      )}
                      <span>•</span>
                      <span>Left: <strong className={shelf.isExpired ? 'text-rose-600' : 'text-slate-700 dark:text-slate-200'}>{formatDisplayDays(shelf.pendingDays)}</strong> ({formatDisplayPct(shelf.pendingPct)})</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <div className="font-extrabold text-slate-900 dark:text-white">
                        {it.nearExpiryStock ?? it.hoNearExpiryStock} units
                      </div>
                      <div className="text-[10px] text-slate-500">
                        ₹{Number(it.value || (Number(it.nearExpiryStock) * Number(it.cost || 0))).toFixed(2)}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setItemToDelete(it)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                      title="Remove product from batch"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {itemToDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-xs"
          onClick={() => setItemToDelete(null)}
        >
          <div
            className={`w-full max-w-sm p-4 rounded-2xl border ${
              isDarkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900'
            } shadow-xl`}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-bold text-sm">Remove Product from Batch?</h3>
            <p className="text-xs text-slate-500 mt-1">
              Remove <strong>{itemToDelete.itemName}</strong> (Lot: {formatDateDDMMYYYY(itemToDelete.expiryDate)}) from this batch?
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setItemToDelete(null)}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteItem}
                className="px-4 py-1.5 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
