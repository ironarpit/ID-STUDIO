import React, { useEffect, useRef, useState, useMemo } from 'react';
import JsBarcode from 'jsbarcode';
import {
  Copy,
  Check,
  Printer,
  ExternalLink,
  Layers,
  X
} from 'lucide-react';
import { Product, ComputedProductAnalytics } from '../types';
import { getProductBrand } from '../utils/analytics';
import { PurchaseContactButton } from './PurchaseContactSheet';

export interface ProductCardProps {
  product: Product;
  analytics?: ComputedProductAnalytics;
  onUpdateStock?: (productId: string, newStock: number) => void;
  onOpenLabelModal: (product: Product) => void;
  onDeleteProduct?: (productId: string) => void;
  matchingCount?: number;
  onViewAllMatching?: () => void;
  onDismiss?: () => void;
  moduleType?: 'low_stock' | 'fast_moving' | 'zero_sales' | 'overstock' | 'replenishment' | 'top_sales' | 'abc' | 'general';
  isDarkMode?: boolean;
}

export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  analytics,
  onOpenLabelModal,
  matchingCount,
  onViewAllMatching,
  onDismiss,
  isDarkMode = false
}) => {
  const barcodeSvgRef = useRef<SVGSVGElement>(null);
  const [copied, setCopied] = useState(false);

  // Render Barcode SVG dynamically using JsBarcode
  useEffect(() => {
    if (barcodeSvgRef.current && product.barcode) {
      try {
        JsBarcode(barcodeSvgRef.current, product.barcode, {
          format: 'CODE128',
          lineColor: isDarkMode ? '#E2E8F0' : '#0F172A',
          background: 'transparent',
          width: 1.2,
          height: 18,
          displayValue: true,
          font: 'monospace',
          fontSize: 8,
          margin: 1
        });
      } catch (e) {
        console.warn('JsBarcode render fallback:', e);
      }
    }
  }, [product.barcode, isDarkMode]);

  const brand = useMemo(() => getProductBrand(product), [product]);

  // Derived Financials & Movement Analytics with comprehensive fallbacks
  const stock = product.stock || 0;
  const salesCount = product.salesCount || 0;
  const mrp = product.mrp || product.retailPrice || 0;
  const retailPrice = product.retailPrice || product.mrp || 0;

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

  const bansalCodeVal = useMemo(() => {
    return (
      product.bansalCode ||
      product.localCode ||
      (product.rawRowData && (
        product.rawRowData['Bansal Code'] ||
        product.rawRowData['bansal code'] ||
        product.rawRowData['BANSAL CODE'] ||
        product.rawRowData['BansalCode'] ||
        product.rawRowData['BANSALCODE'] ||
        product.rawRowData['Local Code'] ||
        product.rawRowData['Item Code'] ||
        product.rawRowData['ITEM CODE']
      )) ||
      '—'
    );
  }, [product]);

  const mainCodeVal = useMemo(() => {
    return (
      product.mainCode ||
      (product.rawRowData && (
        product.rawRowData['MainCode'] ||
        product.rawRowData['MAINCODE'] ||
        product.rawRowData['Main Code'] ||
        product.rawRowData['MAIN CODE'] ||
        product.rawRowData['Dept Code']
      )) ||
      '—'
    );
  }, [product]);

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

  const marginAmount = retailPrice - costPrice;
  const marginPct = retailPrice > 0 && costPrice > 0 ? (marginAmount / retailPrice) * 100 : (analytics ? analytics.marginPct : 0);

  // Status computation
  const isOut = stock <= 0;
  const isLow = !isOut && (stock <= Math.ceil(avgDailySales * 14) || (daysCover !== null && daysCover <= 7));
  const velocity = analytics?.movementStatus || (salesCount >= 30 ? 'fast' : salesCount === 0 ? 'dead' : daysCover !== null && daysCover > 60 ? 'slow' : 'normal');

  const handleCopy = () => {
    const textToCopy = `📦 ${product.name}
🔢 Barcode: ${product.barcode} | Bansal Code: ${bansalCodeVal} | MainCode: ${mainCodeVal}
💰 Cost Rate: ₹${costPrice} | MRP: ₹${mrp} | Retail Rate: ₹${retailPrice} | Margin: ${marginPct.toFixed(1)}%
📊 Stock: ${stock} Units | Sales: ${salesCount} Sold | Cover: ${daysCover !== null ? `${daysCover.toFixed(1)}d` : 'N/A'}`;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(textToCopy).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    } else {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div
      className={`rounded-xl border transition-all p-2.5 shadow-xs space-y-2 max-w-full ${
        isDarkMode
          ? 'bg-slate-900 border-slate-700 text-slate-100'
          : 'bg-white border-slate-200 text-slate-900'
      }`}
    >
      {/* Multiple Matching Products Banner (if any) */}
      {Boolean(matchingCount && matchingCount > 1) && onViewAllMatching && (
        <div className="bg-indigo-50/80 dark:bg-indigo-950/70 border border-indigo-200 dark:border-indigo-800 text-indigo-900 dark:text-indigo-200 rounded-lg px-2 py-1 flex items-center justify-between gap-1.5 text-[11px]">
          <div className="flex items-center gap-1.5 min-w-0">
            <Layers className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <span className="truncate">
              Barcode <strong className="font-mono">{product.barcode}</strong> matches <strong>{matchingCount} SKUs</strong>
            </span>
          </div>
          <button
            onClick={onViewAllMatching}
            className="text-[9.5px] bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-2 py-0.5 rounded shrink-0 cursor-pointer shadow-2xs"
          >
            Inspect ({matchingCount})
          </button>
        </div>
      )}

      {/* 1. COMPACT HEADER: BADGES + PRODUCT NAME + DISMISS */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 flex-wrap mb-0.5">
            <span
              className={`text-[8.5px] font-black px-1.5 py-0.2 rounded uppercase tracking-wider border ${
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
              className={`text-[8.5px] font-black px-1.5 py-0.2 rounded uppercase tracking-wider border ${
                velocity === 'fast'
                  ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/80 dark:text-emerald-200 dark:border-emerald-700'
                  : velocity === 'slow'
                  ? 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/80 dark:text-amber-200 dark:border-amber-700'
                  : velocity === 'dead'
                  ? 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/80 dark:text-rose-200 dark:border-rose-700'
                  : 'bg-slate-100 text-slate-800 border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-600'
              }`}
            >
              {velocity === 'fast' ? '⚡ Fast' : velocity === 'slow' ? '🐢 Slow' : velocity === 'dead' ? '🛑 Dead' : 'Normal'}
            </span>

            {analytics?.abcCategory && (
              <span className="text-[8.5px] font-black px-1.5 py-0.2 rounded bg-indigo-100 text-indigo-800 border border-indigo-300 dark:bg-indigo-950/80 dark:text-indigo-200 dark:border-indigo-700 uppercase">
                ABC: {analytics.abcCategory}
              </span>
            )}
          </div>

          <h2 className="text-xs sm:text-sm font-black text-slate-900 dark:text-white leading-tight truncate">
            {product.name}
            {product.unit && (
              <span className="ml-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                ({product.unit})
              </span>
            )}
          </h2>
        </div>

        {/* Dismiss Button */}
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
            title="Dismiss Product Result"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* 2. COMPACT 2-COLUMN SUMMARY GRID */}
      <div className="grid grid-cols-2 gap-1.5 p-2 rounded-lg bg-slate-50 dark:bg-slate-950/70 border border-slate-200/80 dark:border-slate-800 text-[10.5px]">
        {/* Left Column: Identifiers */}
        <div className="space-y-0.5 border-r border-slate-200/70 dark:border-slate-800 pr-1.5">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[9.5px] text-slate-400 uppercase font-bold">Barcode</span>
            <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400 truncate max-w-[110px]">{product.barcode}</span>
          </div>

          <div className="flex items-center justify-between gap-1">
            <span className="text-[9.5px] text-slate-400 uppercase font-bold">Bansal Code</span>
            <span className="font-mono font-bold text-slate-800 dark:text-slate-200 truncate max-w-[110px]">{bansalCodeVal}</span>
          </div>

          <div className="flex items-center justify-between gap-1">
            <span className="text-[9.5px] text-slate-400 uppercase font-bold">Main Code</span>
            <span className="font-mono font-bold text-slate-800 dark:text-slate-200 truncate max-w-[110px] uppercase">{mainCodeVal}</span>
          </div>

          <div className="flex items-center justify-between gap-1">
            <span className="text-[9.5px] text-slate-400 uppercase font-bold">Category</span>
            <span className="font-semibold text-slate-700 dark:text-slate-300 truncate max-w-[110px]">{product.category || 'General'}</span>
          </div>

          {brand && brand !== 'General' && (
            <div className="flex items-center justify-between gap-1">
              <span className="text-[9.5px] text-slate-400 uppercase font-bold">Brand</span>
              <span className="font-semibold text-slate-700 dark:text-slate-300 truncate max-w-[110px]">{brand}</span>
            </div>
          )}
        </div>

        {/* Right Column: Pricing & Movement */}
        <div className="space-y-0.5 pl-1">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[9.5px] text-slate-400 uppercase font-bold">Retail Rate</span>
            <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
              ₹{retailPrice.toLocaleString('en-IN')}
              {mrp > retailPrice && <span className="text-[9px] text-slate-400 line-through ml-1">₹{mrp}</span>}
            </span>
          </div>

          <div className="flex items-center justify-between gap-1">
            <span className="text-[9.5px] text-slate-400 uppercase font-bold">Cost / Margin</span>
            <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
              {costPrice > 0 ? `₹${costPrice}` : '—'}
              {marginPct > 0 && <span className="text-[9px] text-teal-600 dark:text-teal-400 ml-1">({marginPct.toFixed(0)}%)</span>}
            </span>
          </div>

          <div className="flex items-center justify-between gap-1">
            <span className="text-[9.5px] text-slate-400 uppercase font-bold">Closing Stock</span>
            <span className={`font-mono font-bold ${stock <= 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white'}`}>
              {stock.toLocaleString('en-IN')} Units
            </span>
          </div>

          <div className="flex items-center justify-between gap-1">
            <span className="text-[9.5px] text-slate-400 uppercase font-bold">Total Sold</span>
            <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
              {salesCount.toLocaleString('en-IN')} Sold
            </span>
          </div>

          <div className="flex items-center justify-between gap-1">
            <span className="text-[9.5px] text-slate-400 uppercase font-bold">Days Cover</span>
            <span className={`font-mono font-bold ${daysCover !== null && daysCover <= 7 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-700 dark:text-slate-300'}`}>
              {daysCover !== null ? `${daysCover.toFixed(1)}d` : 'N/A'}
            </span>
          </div>
        </div>
      </div>

      {/* 3. COMPACT ACTION ROW */}
      <div className="flex flex-wrap items-center justify-between gap-1.5 pt-1 border-t border-slate-200/60 dark:border-slate-800">
        {/* Compact Barcode Preview */}
        <div className="flex items-center bg-white dark:bg-slate-950 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-800 shrink-0">
          <svg ref={barcodeSvgRef} className="max-w-[95px] sm:max-w-[110px] h-5"></svg>
        </div>

        {/* Action Buttons: Purchase Contact, Copy, Sticker, Inspect */}
        <div className="flex flex-wrap items-center gap-1 shrink-0 ml-auto">
          <PurchaseContactButton product={product} variant="compact" />
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1 text-[10px] font-bold text-slate-700 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-300 px-2 py-1 rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer shadow-2xs active:scale-95"
            title="Copy Product Summary"
          >
            {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>

          <button
            type="button"
            onClick={() => onOpenLabelModal(product)}
            className="flex items-center gap-1 text-[10px] font-bold text-slate-700 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-300 px-2 py-1 rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer shadow-2xs active:scale-95"
            title="Print Barcode Sticker"
          >
            <Printer className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
            <span>Sticker</span>
          </button>

          {onViewAllMatching && (
            <button
              type="button"
              onClick={onViewAllMatching}
              className="flex items-center gap-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[10px] px-2.5 py-1 rounded-md transition-all active:scale-95 cursor-pointer shadow-2xs"
              title="Inspect Full Details"
            >
              <ExternalLink className="w-3 h-3" />
              <span>Inspect</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
