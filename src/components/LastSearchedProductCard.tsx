import React from 'react';
import { Eye, X, Package, ArrowUpRight } from 'lucide-react';
import { Product } from '../types';
import { PurchaseContactButton } from './PurchaseContactSheet';

interface LastSearchedProductCardProps {
  product: Product;
  onViewDetails: (product: Product) => void;
  onClear: () => void;
  isDarkMode?: boolean;
}

export const LastSearchedProductCard: React.FC<LastSearchedProductCardProps> = ({
  product,
  onViewDetails,
  onClear,
  isDarkMode = false
}) => {
  const codeDisplay = product.localCode || product.barcode || 'N/A';
  const stockQty = typeof product.stock === 'number' ? product.stock : 0;
  const mrpVal = typeof product.mrp === 'number' ? product.mrp : 0;

  const getStockBadge = (stock: number) => {
    if (stock <= 0) {
      return (
        <span className="px-2 py-0.5 rounded-md font-bold text-[11px] bg-rose-100 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
          Out of Stock (0)
        </span>
      );
    }
    if (stock <= 10) {
      return (
        <span className="px-2 py-0.5 rounded-md font-bold text-[11px] bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
          Stock: {stock}
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded-md font-bold text-[11px] bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
        Stock: {stock}
      </span>
    );
  };

  return (
    <div
      id="last-searched-product-card"
      onClick={() => onViewDetails(product)}
      className={`group relative p-3 sm:p-4 rounded-xl border transition-all cursor-pointer shadow-xs hover:shadow-md ${
        isDarkMode
          ? 'bg-slate-900 border-indigo-500/40 hover:border-indigo-400'
          : 'bg-white border-indigo-200 hover:border-indigo-400'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        {/* Left Side: Badge + Product Information */}
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wider bg-indigo-50 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
              Last Searched
            </span>
            {product.category && (
              <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium truncate max-w-[160px]">
                {product.category}
              </span>
            )}
          </div>

          {/* Product Name */}
          <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white leading-snug line-clamp-2">
            {product.name}
          </h3>

          {/* Key Metrics: Code, Stock, MRP */}
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap text-xs pt-0.5">
            <div className="flex items-center gap-1 font-mono text-slate-700 dark:text-slate-300">
              <span className="text-slate-400 dark:text-slate-500 font-sans font-medium text-[11px]">Code:</span>
              <span className="font-bold">{codeDisplay}</span>
            </div>

            <div className="flex items-center gap-1 font-mono">
              {getStockBadge(stockQty)}
            </div>

            <div className="flex items-center gap-1 font-mono text-slate-800 dark:text-slate-200">
              <span className="text-slate-400 dark:text-slate-500 font-sans font-medium text-[11px]">MRP:</span>
              <span className="font-bold">₹{mrpVal.toLocaleString('en-IN')}</span>
            </div>
          </div>
        </div>

        {/* Right Side: Action Button & Close */}
        <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end" onClick={(e) => e.stopPropagation()}>
          <PurchaseContactButton product={product} variant="compact" />
          <button
            type="button"
            id="btn-view-details"
            onClick={() => onViewDetails(product)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold text-xs shadow-xs transition-all cursor-pointer"
            title="View Complete Product Details"
          >
            <span>VIEW DETAILS</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            id="btn-clear-last-searched"
            onClick={onClear}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            title="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
