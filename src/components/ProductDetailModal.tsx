import React, { useEffect, useRef, useState, useMemo } from 'react';
import JsBarcode from 'jsbarcode';
import {
  X,
  Copy,
  Check,
  Printer,
  Package,
  Sparkles,
  ChevronDown,
  ChevronUp,
  ArrowLeft,
  Building2,
  Calendar,
  Layers,
  Tag,
  Image as ImageIcon,
  ExternalLink
} from 'lucide-react';
import { Product, ComputedProductAnalytics } from '../types';
import { loadStockVariations, getStockVariation, upsertStockVariation, deleteStockVariation, getSystemStock, StockVariation } from '../utils/stockVariations';
import { getProductBrand } from '../utils/analytics';
import { useModalTransition } from '../utils/useModalTransition';
import { cleanDateOnly } from '../utils/fileParser';
import { MatchingProductsList } from './MatchingProductsList';

interface ProductDetailModalProps {
  product: Product | null;
  analytics: ComputedProductAnalytics | undefined;
  onClose: () => void;
  onOpenLabelModal: (product: Product) => void;
  isDarkMode?: boolean;
  matchingProducts?: Product[];
  onSelectProduct?: (product: Product) => void;
  zIndexClassName?: string;
}

export const ProductDetailModal: React.FC<ProductDetailModalProps> = ({
  product,
  analytics,
  onClose,
  onOpenLabelModal,
  isDarkMode = false,
  matchingProducts,
  onSelectProduct,
  zIndexClassName = 'z-[100]'
}) => {
  const barcodeSvgRef = useRef<SVGSVGElement>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showExtraColumns, setShowExtraColumns] = useState(false);

  if (!product) return null;

  // Render Barcode SVG dynamically for sticker preview
  useEffect(() => {
    if (barcodeSvgRef.current && product.barcode) {
      try {
        JsBarcode(barcodeSvgRef.current, product.barcode, {
          format: 'CODE128',
          lineColor: isDarkMode ? '#E2E8F0' : '#0F172A',
          background: 'transparent',
          width: 1.4,
          height: 26,
          displayValue: false, // We render the clean text underneath for guaranteed large readability
          margin: 1
        });
      } catch (e) {
        console.warn('JsBarcode render fallback:', e);
      }
    }
  }, [product.barcode, isDarkMode]);

  const brand = useMemo(() => getProductBrand(product), [product]);

  // Google Images Search URL using the inspected product's full name only
  const trimmedProductName = useMemo(() => {
    return (product.name || '').trim();
  }, [product.name]);

  const searchImagesUrl = useMemo(() => {
    if (!trimmedProductName) return '';
    return `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(trimmedProductName)}`;
  }, [trimmedProductName]);

  // Extraction of Bansal / Local Code (guaranteed leading zeroes preserved as string)
  const bansalCodeVal = useMemo(() => {
    const raw =
      product.bansalCode ||
      product.localCode ||
      product.code ||
      (product.rawRowData && (
        product.rawRowData['Bansal Code'] ||
        product.rawRowData['bansal code'] ||
        product.rawRowData['BANSAL CODE'] ||
        product.rawRowData['BansalCode'] ||
        product.rawRowData['BANSALCODE'] ||
        product.rawRowData['Local Code'] ||
        product.rawRowData['LOCAL CODE'] ||
        product.rawRowData['Item Code'] ||
        product.rawRowData['ITEM CODE'] ||
        product.rawRowData['Code'] ||
        product.rawRowData['CODE']
      ));
    return raw !== undefined && raw !== null && String(raw).trim() !== '' ? String(raw).trim() : '—';
  }, [product]);

  // Extraction of Barcode as raw text
  const barcodeVal = useMemo(() => {
    return product.barcode ? String(product.barcode).trim() : '—';
  }, [product.barcode]);

  // Extraction of Main Code
  const mainCodeVal = useMemo(() => {
    const raw =
      product.mainCode ||
      (product.rawRowData && (
        product.rawRowData['MainCode'] ||
        product.rawRowData['MAINCODE'] ||
        product.rawRowData['Main Code'] ||
        product.rawRowData['MAIN CODE'] ||
        product.rawRowData['Main_Code'] ||
        product.rawRowData['Dept Code'] ||
        product.rawRowData['DEPT CODE']
      ));
    return raw !== undefined && raw !== null && String(raw).trim() !== '' ? String(raw).trim() : '—';
  }, [product]);

  // Extraction of Supplier
  const supplierVal = useMemo(() => {
    const raw =
      product.supplierName ||
      product.supplier ||
      (product.rawRowData && (
        product.rawRowData['Supplier'] ||
        product.rawRowData['SUPPLIER'] ||
        product.rawRowData['Supplier Name'] ||
        product.rawRowData['SUPPLIER NAME'] ||
        product.rawRowData['Party Name'] ||
        product.rawRowData['PARTY NAME'] ||
        product.rawRowData['Vendor'] ||
        product.rawRowData['VENDOR'] ||
        product.rawRowData['Vendor Name'] ||
        product.rawRowData['VENDOR NAME']
      ));
    return raw !== undefined && raw !== null && String(raw).trim() !== '' ? String(raw).trim() : '—';
  }, [product]);

  // Extraction of Last Purchase Date
  const lastPurchaseDateVal = useMemo(() => {
    const raw =
      product.lastPurchaseDate ||
      (product.rawRowData && (
        product.rawRowData['Last Purchase Date'] ||
        product.rawRowData['LAST PURCHASE DATE'] ||
        product.rawRowData['Last Pur Date'] ||
        product.rawRowData['LAST PUR DATE'] ||
        product.rawRowData['Pur Date'] ||
        product.rawRowData['PUR DATE'] ||
        product.rawRowData['Last Inward Date'] ||
        product.rawRowData['LAST INWARD DATE'] ||
        product.rawRowData['Last Received Date']
      ));
    return cleanDateOnly(raw) || '—';
  }, [product]);

  // Pricing & Financials
  const costPrice = useMemo(() => {
    if (product.costPrice && product.costPrice > 0) return product.costPrice;
    if (product.cost && product.cost > 0) return product.cost;
    if (product.rawRowData) {
      const rawCost =
        product.rawRowData['Cost Rate'] ||
        product.rawRowData['COST RATE'] ||
        product.rawRowData['Cost Price'] ||
        product.rawRowData['COST PRICE'] ||
        product.rawRowData['Cost'] ||
        product.rawRowData['COST'] ||
        product.rawRowData['Purchase Rate'] ||
        product.rawRowData['PURCHASE RATE'] ||
        product.rawRowData['Pur Rate'] ||
        product.rawRowData['PUR RATE'] ||
        product.rawRowData['Rate'] ||
        product.rawRowData['RATE'];
      if (rawCost !== undefined && rawCost !== null) {
        const parsed = parseFloat(String(rawCost).replace(/[^0-9.-]+/g, ''));
        if (!isNaN(parsed) && parsed > 0) return parsed;
      }
    }
    return 0;
  }, [product]);

  const mrp = product.mrp || product.retailPrice || 0;
  const retailPrice = product.retailPrice || product.mrp || 0;
  const systemStock = getSystemStock(product);
  const [variationsMap, setVariationsMap] = React.useState<Record<string, StockVariation>>(loadStockVariations);
  const currentVariation = React.useMemo(() => getStockVariation(product, variationsMap), [product, variationsMap]);
  const stock = currentVariation ? systemStock + currentVariation.adjustment : systemStock;

  const [physicalInput, setPhysicalInput] = React.useState<string>(currentVariation ? String(currentVariation.physicalStock) : '');
  const [remarkInput, setRemarkInput] = React.useState<string>(currentVariation?.remark || '');
  const [variationMsg, setVariationMsg] = React.useState<string | null>(null);

  React.useEffect(() => {
    const vars = loadStockVariations();
    setVariationsMap(vars);
    const v = getStockVariation(product, vars);
    setPhysicalInput(v ? String(v.physicalStock) : '');
    setRemarkInput(v?.remark || '');
  }, [product]);
  const salesCount = product.salesCount || 0;

  const discountPct = mrp > retailPrice && mrp > 0 ? Math.round(((mrp - retailPrice) / mrp) * 100) : 0;
  const marginAmount = retailPrice - costPrice;
  const marginPct = retailPrice > 0 && costPrice > 0 ? (marginAmount / retailPrice) * 100 : (analytics ? analytics.marginPct : 0);

  // Movement & Cover
  const avgDailySales = analytics ? analytics.avgDailySales : salesCount / 30;
  let daysCover: number | null = null;
  if (analytics) {
    daysCover = analytics.daysCover;
  } else {
    if (avgDailySales > 0) {
      daysCover = stock / avgDailySales;
    } else if (stock <= 0) {
      daysCover = 0;
    }
  }

  // Target calculations
  const safetyStock = Math.ceil(avgDailySales * 7);
  const reorderPoint = Math.ceil(avgDailySales * 14);
  const targetStock = Math.ceil(avgDailySales * 30);
  const recommendedOrder = Math.max(0, targetStock - stock);

  // Status computation
  const isOut = stock <= 0;
  const isLow = !isOut && (stock <= reorderPoint || (daysCover !== null && daysCover <= 7));
  const velocity = analytics?.movementStatus || (salesCount >= 30 ? 'fast' : salesCount === 0 ? 'dead' : daysCover !== null && daysCover > 60 ? 'slow' : 'normal');

  // Copy helper
  const handleCopyText = (text: string, fieldKey: string) => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text);
    }
    setCopiedField(fieldKey);
    setTimeout(() => {
      setCopiedField((curr) => (curr === fieldKey ? null : curr));
    }, 2000);
  };

  const handleCopyFullDetails = () => {
    const formattedMrp = mrp.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const formattedRetail = (retailPrice || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const formattedStock = stock.toLocaleString('en-IN');
    const formattedSold = salesCount.toLocaleString('en-IN');
    const formattedCover = daysCover !== null ? daysCover.toFixed(1) : (stock <= 0 ? '0.0' : '—');

    const summary = `${product.name} (${bansalCodeVal})

MRP: ₹${formattedMrp} | Retail: ₹${formattedRetail}
Closing: ${formattedStock} Units | Sold: ${formattedSold} | Cover: ${formattedCover} Days`;

    handleCopyText(summary, 'full_details');
  };

  // Filter raw data entries to exclude promoted fields
  const filteredRawDataEntries = useMemo(() => {
    if (!product.rawRowData) return [];
    const PROMOTED_KEYS = new Set([
      'name', 'item name', 'item_name', 'product name', 'description', 'unit', 'uom',
      'barcode', 'ean', 'ean code', 'bar code',
      'bansal code', 'bansalcode', 'local code', 'localcode', 'item code', 'code',
      'main code', 'maincode', 'dept code', 'dept',
      'category', 'brand',
      'mrp', 'retail price', 'retail rate', 'retailprice', 'retailrate', 'sale price',
      'cost', 'cost price', 'cost rate', 'costprice', 'costrate', 'purchase rate', 'pur rate', 'rate',
      'stock', 'closing stock', 'closingstock', 'qty', 'stock qty', 'current stock',
      'sales', 'sales count', 'sales qty', 'total sold', 'mtd sales',
      'supplier', 'supplier name', 'party name', 'vendor', 'vendor name',
      'last purchase date', 'last pur date', 'pur date', 'last inward date', 'last received date'
    ]);

    return Object.entries(product.rawRowData).filter(([key]) => {
      const normalized = key.toLowerCase().trim();
      return !PROMOTED_KEYS.has(normalized);
    });
  }, [product.rawRowData]);

  const { handleClose, backdropClass, panelClass } = useModalTransition({
    onClose,
    isOpen: true,
    duration: 170
  });

  // Prevent background scrolling while modal is open
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    const originalTouchAction = document.body.style.touchAction;

    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';

    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.touchAction = originalTouchAction;
    };
  }, []);

  return (
    <div
      className={`fixed inset-0 ${zIndexClassName} flex items-center justify-center p-0 sm:p-3 bg-slate-950/80 backdrop-blur-xs overscroll-contain ${backdropClass}`}
      style={{
        minHeight: '100vh',
        height: '100dvh',
        maxHeight: '100dvh',
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        paddingLeft: 'env(safe-area-inset-left, 0px)',
        paddingRight: 'env(safe-area-inset-right, 0px)',
        boxSizing: 'border-box',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div
        className={`relative w-full sm:max-w-2xl h-full sm:h-auto max-h-full sm:max-h-[92vh] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 ${panelClass}`}
        style={{
          maxHeight: '100%',
        }}
      >
        {/* 1. COMPACT STICKY HEADER */}
        <div className="sticky top-0 z-30 px-3.5 py-2.5 sm:px-4 sm:py-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0 shadow-2xs">
          <div className="flex items-start justify-between gap-2.5">
            <button
              type="button"
              onClick={handleClose}
              className="flex items-center justify-center gap-1.5 min-h-[44px] min-w-[44px] px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 active:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 dark:active:bg-slate-600 text-slate-700 dark:text-slate-200 font-bold text-xs sm:text-sm transition-all cursor-pointer shrink-0"
              title="Return"
              aria-label="Return"
            >
              <ArrowLeft className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span>Back</span>
            </button>

            <div className="min-w-0 flex-1">
              {/* Status Badges Row */}
              <div className="flex items-center gap-1.5 flex-wrap mb-1">
                <span
                  className={`text-[10px] sm:text-[11px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider border ${
                    isOut
                      ? 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/80 dark:text-rose-200 dark:border-rose-700'
                      : isLow
                      ? 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/80 dark:text-amber-200 dark:border-amber-700'
                      : 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/80 dark:text-emerald-200 dark:border-emerald-700'
                  }`}
                >
                  {isOut ? 'Out of Stock' : isLow ? 'Low Stock' : 'In Stock'}
                </span>

                <span
                  className={`text-[10px] sm:text-[11px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider border ${
                    velocity === 'fast'
                      ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/80 dark:text-emerald-200 dark:border-emerald-700'
                      : velocity === 'slow'
                      ? 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/80 dark:text-amber-200 dark:border-amber-700'
                      : velocity === 'dead'
                      ? 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/80 dark:text-rose-200 dark:border-rose-700'
                      : 'bg-slate-100 text-slate-800 border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700'
                  }`}
                >
                  {velocity === 'fast' ? '⚡ Fast' : velocity === 'slow' ? '🐢 Slow' : velocity === 'dead' ? '🛑 Dead' : 'Normal'}
                </span>

                {analytics?.abcCategory && (
                  <span className="text-[10px] sm:text-[11px] font-black px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-800 border border-indigo-300 dark:bg-indigo-950/80 dark:text-indigo-200 dark:border-indigo-700 uppercase">
                    ABC: {analytics.abcCategory}
                  </span>
                )}
              </div>

              {/* Product Name (Full product name visible, high contrast, wrapping cleanly) */}
              <h2 className="text-base sm:text-lg md:text-xl font-extrabold text-slate-900 dark:text-white leading-snug break-words">
                {product.name}
                {product.unit && (
                  <span className="ml-1.5 text-xs sm:text-sm font-bold text-emerald-600 dark:text-emerald-400">
                    ({product.unit})
                  </span>
                )}
              </h2>
            </div>

            {/* Permanently visible 44×44px Close Button */}
            <button
              type="button"
              onClick={handleClose}
              className="w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl bg-slate-100 hover:bg-slate-200 active:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 dark:active:bg-slate-600 text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white cursor-pointer shrink-0 transition-colors"
              title="Close Inspector"
              aria-label="Close Inspector"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 2. SCROLLABLE CONTENT BODY */}
        <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-4 space-y-3 custom-scrollbar overscroll-contain">

          {/* SECTION 1: PRIORITY IDENTITY STRIP (Local Code + Barcode) */}
          <div className="grid grid-cols-1 xs:grid-cols-2 gap-2.5">
            {/* Tile 1: Local / Bansal Code */}
            <div className="p-3 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200/80 dark:border-indigo-800/80 flex items-center justify-between gap-2 shadow-2xs">
              <div className="min-w-0 flex-1">
                <span className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Local / Bansal Code
                </span>
                <span className="font-mono text-lg sm:text-xl font-black text-slate-900 dark:text-white truncate block select-all">
                  {bansalCodeVal}
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleCopyText(bansalCodeVal, 'bansal_code')}
                className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-50 dark:hover:bg-slate-800 text-indigo-600 dark:text-indigo-400 transition-colors cursor-pointer shrink-0"
                title="Copy Bansal Code"
              >
                {copiedField === 'bansal_code' ? (
                  <Check className="w-4 h-4 text-emerald-500" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>
            </div>

            {/* Tile 2: Barcode */}
            <div className="p-3 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200/80 dark:border-indigo-800/80 flex items-center justify-between gap-2 shadow-2xs">
              <div className="min-w-0 flex-1">
                <span className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Barcode (EAN)
                </span>
                <span className="font-mono text-lg sm:text-xl font-black text-indigo-600 dark:text-indigo-400 truncate block select-all">
                  {barcodeVal}
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleCopyText(barcodeVal, 'barcode')}
                className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-50 dark:hover:bg-slate-800 text-indigo-600 dark:text-indigo-400 transition-colors cursor-pointer shrink-0"
                title="Copy Barcode"
              >
                {copiedField === 'barcode' ? (
                  <Check className="w-4 h-4 text-emerald-500" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          {/* SECTION 2 & 3: PRICING & STOCK & SALES */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* PRICING CARD */}
            <div className="p-3 rounded-xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 space-y-2">
              <div className="flex items-center justify-between pb-1.5 border-b border-slate-200 dark:border-slate-800">
                <span className="text-xs font-black uppercase tracking-wider text-slate-600 dark:text-slate-300">
                  Pricing
                </span>
                {discountPct > 0 && (
                  <span className="text-[11px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700">
                    {discountPct}% OFF MRP
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 text-left">
                {/* Cost Rate */}
                <div className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
                    Cost Rate
                  </span>
                  <span className="font-mono text-base sm:text-lg font-bold text-slate-800 dark:text-slate-200 block truncate">
                    {costPrice > 0 ? `₹${costPrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
                  </span>
                </div>

                {/* MRP (Indigo emphasized) */}
                <div className="p-2 rounded-lg bg-indigo-50/40 dark:bg-indigo-950/30 border border-indigo-200/70 dark:border-indigo-800/70">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300 block">
                    MRP
                  </span>
                  <span className="font-mono text-lg sm:text-xl font-black text-indigo-700 dark:text-indigo-300 block truncate">
                    {mrp > 0 ? `₹${mrp.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
                  </span>
                </div>

                {/* Retail Rate (Green emphasized) */}
                <div className="p-2 rounded-lg bg-emerald-50/50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300 block">
                    Retail Rate
                  </span>
                  <span className="font-mono text-lg sm:text-xl font-black text-emerald-600 dark:text-emerald-400 block truncate">
                    ₹{(retailPrice || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>

                {/* Margin */}
                <div className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
                    Margin
                  </span>
                  <span className="font-mono text-base sm:text-lg font-bold text-teal-600 dark:text-teal-400 block truncate">
                    {costPrice > 0 ? `₹${marginAmount.toFixed(1)}` : '—'}
                    {marginPct > 0 && <span className="text-xs ml-1 font-semibold">({marginPct.toFixed(1)}%)</span>}
                  </span>
                </div>
              </div>
            </div>

            {/* STOCK & SALES CARD */}
            <div className="p-3 rounded-xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 space-y-2">
              <div className="flex items-center justify-between pb-1.5 border-b border-slate-200 dark:border-slate-800">
                <span className="text-xs font-black uppercase tracking-wider text-slate-600 dark:text-slate-300">
                  Stock & Sales
                </span>
                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                  {stock <= 0 ? 'Out of Stock' : `${stock} on hand`}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-left">
                {/* Closing Stock (Strongest Value) */}
                <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/70 border border-indigo-200 dark:border-indigo-800 shadow-2xs">
                  <span className="text-[11px] font-black uppercase tracking-wider text-indigo-700 dark:text-indigo-300 block">
                    Closing Stock
                  </span>
                  <span
                    className={`font-mono text-xl sm:text-2xl font-black block truncate ${
                      stock <= 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white'
                    }`}
                  >
                    {stock.toLocaleString('en-IN')}
                    {product.unit ? <span className="text-xs font-bold ml-1 text-slate-500">{product.unit}</span> : ''}
                  </span>
                </div>

                {/* Total Sold */}
                <div className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
                    Total Sold
                  </span>
                  <span className="font-mono text-base sm:text-lg font-bold text-indigo-600 dark:text-indigo-400 block truncate">
                    {salesCount.toLocaleString('en-IN')}
                  </span>
                </div>

                {/* Daily Average */}
                <div className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
                    Daily Average
                  </span>
                  <span className="font-mono text-base sm:text-lg font-bold text-slate-800 dark:text-slate-200 block truncate">
                    {avgDailySales.toFixed(1)} / day
                  </span>
                </div>

                {/* Days Cover */}
                <div className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
                    Days Cover
                  </span>
                  <span
                    className={`font-mono text-base sm:text-lg font-bold block truncate ${
                      daysCover !== null && daysCover <= 7
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-slate-800 dark:text-slate-200'
                    }`}
                  >
                    {daysCover !== null ? `${daysCover.toFixed(1)} Days` : '—'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 4: SUPPLIER AND LAST PURCHASE (Promoted Prominently) */}
          <div className="p-3 rounded-xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
            <div className="flex items-start gap-2 min-w-0">
              <Building2 className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Supplier
                </span>
                <span className="font-bold text-slate-900 dark:text-white text-sm break-words">
                  {supplierVal}
                </span>
              </div>
            </div>

            <div className="flex items-start gap-2 min-w-0">
              <Calendar className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Last Purchase Date
                </span>
                <span className="font-mono font-bold text-slate-900 dark:text-white text-sm">
                  {lastPurchaseDateVal}
                </span>
              </div>
            </div>
          </div>

          {/* SECTION 5: MAIN CODE, CATEGORY AND BRAND */}
          <div className="p-2.5 rounded-xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-[11px] font-bold uppercase text-slate-500 dark:text-slate-400">Main Code:</span>
              <span className="font-mono font-bold text-slate-900 dark:text-white text-xs">{mainCodeVal}</span>
            </div>

            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-[11px] font-bold uppercase text-slate-500 dark:text-slate-400">Category:</span>
              <span className="font-bold text-slate-900 dark:text-white text-xs">{product.category || 'General'}</span>
            </div>

            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-[11px] font-bold uppercase text-slate-500 dark:text-slate-400">Brand:</span>
              <span className="font-bold text-slate-900 dark:text-white text-xs">{brand || 'General'}</span>
            </div>
          </div>

          {/* SECTION 6: BARCODE PREVIEW & DESKTOP ACTIONS */}
          <div className="p-3 rounded-xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
            {/* SVG Barcode Preview with number directly underneath */}
            <div className="flex flex-col items-center sm:items-start bg-white dark:bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 w-full sm:w-auto">
              <svg ref={barcodeSvgRef} className="max-w-[160px] sm:max-w-[180px] h-7" />
              <span className="font-mono font-bold text-xs text-slate-800 dark:text-slate-200 mt-0.5 tracking-wider">
                {barcodeVal}
              </span>
            </div>

            {/* Action Buttons Row (Search Images, Copy SKU, Print Sticker) */}
            <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap shrink-0 w-full sm:w-auto justify-start sm:justify-end">
              {searchImagesUrl ? (
                <a
                  href={searchImagesUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[42px] px-3 py-2 rounded-xl bg-sky-50 hover:bg-sky-100 dark:bg-sky-950/70 dark:hover:bg-sky-900 border border-sky-200 dark:border-sky-800 text-sky-700 dark:text-sky-300 font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs active:scale-95"
                  title={`Search Google Images for "${trimmedProductName}"`}
                  aria-label="Search Images"
                >
                  <ImageIcon className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" />
                  <span>Search Images</span>
                  <ExternalLink className="w-3 h-3 text-sky-500 opacity-70 shrink-0" />
                </a>
              ) : (
                <button
                  type="button"
                  disabled
                  className="min-h-[42px] px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500 font-bold text-xs flex items-center gap-1.5 cursor-not-allowed opacity-60"
                  title="Product name is empty"
                  aria-label="Search Images"
                >
                  <ImageIcon className="w-4 h-4 shrink-0" />
                  <span>Search Images</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleCopyFullDetails}
                className="min-h-[42px] px-3 py-2 rounded-xl bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs active:scale-95"
                title="Copy Product Summary"
              >
                {copiedField === 'full_details' ? (
                  <Check className="w-4 h-4 text-emerald-500" />
                ) : (
                  <Copy className="w-4 h-4 text-indigo-600" />
                )}
                <span>{copiedField === 'full_details' ? 'Copied Details' : 'Copy SKU Info'}</span>
              </button>

              <button
                type="button"
                onClick={() => onOpenLabelModal(product)}
                className="min-h-[42px] px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center gap-1.5 transition-all shadow-xs active:scale-95 cursor-pointer"
                title="Print Barcode Sticker"
              >
                <Printer className="w-4 h-4" />
                <span>Print Sticker</span>
              </button>
            </div>
          </div>

          {/* SECTION 7: INVENTORY ASSESSMENT (Slim Strip) */}
          <div className="p-3 rounded-xl bg-indigo-50/60 dark:bg-indigo-950/40 border border-indigo-200/70 dark:border-indigo-900/60 space-y-1.5">
            <div className="flex items-center justify-between text-xs font-bold">
              <div className="flex items-center gap-1.5 text-indigo-700 dark:text-indigo-300">
                <Sparkles className="w-4 h-4 shrink-0" />
                <span className="uppercase tracking-wider font-extrabold text-[11px]">Inventory Assessment</span>
              </div>
              {recommendedOrder > 0 && (
                <span className="text-[10px] font-black bg-indigo-600 text-white px-2 py-0.5 rounded-full shadow-2xs">
                  Reorder: {recommendedOrder} Units
                </span>
              )}
            </div>

            <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-snug font-medium">
              {analytics?.aiRecommendation || (
                isOut
                  ? `SKU is out of stock. Reorder ${Math.max(12, targetStock)} units to recover customer demand.`
                  : isLow
                  ? `Stock runout expected in ${daysCover ? daysCover.toFixed(1) : 5} days. Reorder ${recommendedOrder || 15} units.`
                  : velocity === 'fast'
                  ? `Fast-moving item (${avgDailySales.toFixed(1)}/day). Maintain safety stock above ${safetyStock} units.`
                  : velocity === 'dead'
                  ? `Zero sales in this period. Consider promotional clearance.`
                  : `Stock is balanced with healthy coverage of ${daysCover ? daysCover.toFixed(1) : '30'} days.`
              )}
            </p>
          </div>

          {/* SECTION 8: OTHER COLUMNS FROM FILE (COLLAPSIBLE ACCORDION) */}
          {filteredRawDataEntries.length > 0 && (
            <div className="space-y-1.5 pt-1">
              <button
                type="button"
                onClick={() => setShowExtraColumns(!showExtraColumns)}
                className="w-full flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <span className="flex items-center gap-1.5">
                  <Package className="w-4 h-4 text-indigo-500" />
                  <span>Other Columns from File ({filteredRawDataEntries.length} Fields)</span>
                </span>
                {showExtraColumns ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>

              {showExtraColumns && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 p-2 rounded-xl border bg-slate-50/60 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 max-h-48 overflow-y-auto custom-scrollbar">
                  {filteredRawDataEntries.map(([key, val]) => (
                    <div key={key} className="p-2 bg-white dark:bg-slate-900 rounded-lg border border-slate-200/80 dark:border-slate-800 min-w-0">
                      <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 block truncate">
                        {key}
                      </span>
                      <span className="font-mono text-xs font-bold text-slate-900 dark:text-slate-100 block truncate select-all" title={String(val)}>
                        {val !== null && val !== undefined && String(val).trim() !== '' ? String(val) : '—'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* SECTION 9: MATCHING MULTIPLE PRODUCTS (IF MULTI MATCH) */}
          {matchingProducts && matchingProducts.length > 1 && onSelectProduct && (
            <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
              <MatchingProductsList
                barcode={product.barcode}
                products={matchingProducts}
                selectedProductId={product.id}
                onSelectProduct={onSelectProduct}
              />
            </div>
          )}
        </div>

        {/* 3. STICKY ACTION FOOTER */}
        <div className="sticky bottom-0 z-20 px-3.5 py-2.5 sm:px-4 sm:py-3 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between gap-2.5 shrink-0">
          {/* Desktop Left: Back to list */}
          <button
            type="button"
            onClick={handleClose}
            className="hidden sm:flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold text-xs sm:text-sm transition-colors cursor-pointer active:scale-95 min-h-[44px]"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to List</span>
          </button>

          {/* Mobile Actions: Copy SKU Info (Left) + Print Sticker (Right) */}
          <button
            type="button"
            onClick={handleCopyFullDetails}
            className="sm:hidden flex-1 min-h-[44px] px-3 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-2xs active:scale-95"
            title="Copy Product Summary"
          >
            {copiedField === 'full_details' ? (
              <Check className="w-4 h-4 text-emerald-500" />
            ) : (
              <Copy className="w-4 h-4 text-indigo-600" />
            )}
            <span>{copiedField === 'full_details' ? 'Copied' : 'Copy SKU Info'}</span>
          </button>

          <button
            type="button"
            onClick={() => onOpenLabelModal(product)}
            className="flex-1 sm:flex-none min-h-[44px] px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all shadow-xs cursor-pointer active:scale-95"
          >
            <Printer className="w-4 h-4" />
            <span>Print Sticker</span>
          </button>
        </div>
      </div>
    </div>
  );
};

