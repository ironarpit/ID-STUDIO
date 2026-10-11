import React, { useState, useEffect } from 'react';
import { Layers, ArrowRight, Package, MapPin, CheckCircle2, ChevronDown, ChevronUp, X } from 'lucide-react';
import { Product } from '../types';

interface MatchingProductsListProps {
  barcode: string;
  products: Product[];
  selectedProductId?: string;
  onSelectProduct: (product: Product) => void;
  onClearSelection?: () => void;
}

export const MatchingProductsList: React.FC<MatchingProductsListProps> = ({
  barcode,
  products,
  selectedProductId,
  onSelectProduct,
  onClearSelection
}) => {
  const [isCollapsed, setIsCollapsed] = useState<boolean>(!!selectedProductId);

  // Automatically collapse when selectedProductId changes to a valid ID
  useEffect(() => {
    if (selectedProductId) {
      setIsCollapsed(true);
    }
  }, [selectedProductId]);

  const commonProductCode = React.useMemo(() => {
    if (products.length === 0) return null;
    const codes = products.map(p => p.localCode).filter(Boolean);
    if (codes.length === 0) return null;
    const first = codes[0];
    const allSame = codes.every(c => c === first);
    return allSame ? first : null;
  }, [products]);

  const handleSelect = (product: Product) => {
    onSelectProduct(product);
    setIsCollapsed(true);
  };

  return (
    <div id="matching-products-section" className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3 sm:p-4 shadow-2xs space-y-2.5 animate-fade-in my-2">
      {/* Header Banner */}
      <div 
        className={`flex flex-col gap-1.5 cursor-pointer select-none group ${
          !isCollapsed ? 'pb-2 border-b border-slate-200 dark:border-slate-800' : ''
        }`}
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        {/* Line 1: Title */}
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/70 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 shrink-0 group-hover:bg-indigo-100 transition-colors">
            <Layers className="w-4 h-4" />
          </div>
          <h2 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors truncate">
            Multiple Matching Products Found ({products.length})
          </h2>
        </div>

        {/* Line 2: Code & Barcode on Left | Clear Selection Icon & Arrow on Right */}
        <div className="flex items-center justify-between gap-2 pl-7 text-[11px]">
          <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
            {commonProductCode && (
              <span className="font-mono font-bold text-indigo-800 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 px-2 py-0.5 rounded border border-indigo-200 dark:border-indigo-800">
                {commonProductCode}
              </span>
            )}
            {barcode && (
              <span className="font-mono font-bold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                {barcode}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
            {onClearSelection && (
              <button
                type="button"
                onClick={onClearSelection}
                className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-rose-600 bg-slate-50 dark:bg-slate-800 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-rose-200 transition-all cursor-pointer"
                title="Clear Selection"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}

            <button
              type="button"
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="p-1.5 text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 bg-slate-50 dark:bg-slate-800 hover:bg-indigo-50 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-indigo-200 transition-all cursor-pointer"
              title={isCollapsed ? 'Expand List' : 'Collapse List'}
            >
              {isCollapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Matching Products Cards Grid */}
      {!isCollapsed && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-0.5 animate-fade-in">
          {products.map((product, index) => {
            const isSelected = selectedProductId === product.id;

            return (
              <div
                key={product.id || index}
                onClick={() => handleSelect(product)}
                className={`rounded-xl p-2.5 sm:p-3 transition-all duration-150 cursor-pointer flex flex-col justify-between gap-1.5 relative overflow-hidden ${
                  isSelected
                    ? 'bg-indigo-50/90 dark:bg-indigo-950/70 border border-indigo-300 dark:border-indigo-700 shadow-xs'
                    : 'bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 hover:border-indigo-400 hover:bg-white dark:hover:bg-slate-800'
                }`}
              >
                {/* Product Top Bar: MainCode, Category, Stock */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                    {product.mainCode && (
                      <span className="text-[10px] font-black text-white bg-indigo-600 px-1.5 py-0.2 rounded uppercase tracking-wide">
                        {product.mainCode}
                      </span>
                    )}
                    {product.category && product.category !== 'General' && (
                      <span className="text-[10px] font-semibold text-slate-700 dark:text-slate-300 bg-slate-200/80 dark:bg-slate-700 px-1.5 py-0.2 rounded border border-slate-300 dark:border-slate-600">
                        {product.category}
                      </span>
                    )}
                  </div>

                  {/* Stock Tag */}
                  <span className={`shrink-0 inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                    product.stock <= 0
                      ? 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                      : product.stock <= 10
                      ? 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                      : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                  }`}>
                    <Package className="w-3 h-3" />
                    {product.stock <= 0 ? 'Out of Stock' : `Stock: ${product.stock}`}
                  </span>
                </div>

                {/* Product Name & UM */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h3 className={`font-bold text-xs sm:text-sm leading-snug ${isSelected ? 'text-indigo-950 dark:text-indigo-200' : 'text-slate-900 dark:text-slate-100'}`}>
                    {product.name}
                  </h3>
                  {product.unit && (
                    <span className="text-[10px] font-bold font-mono text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 px-1.5 py-0.2 rounded shrink-0" title={`Unit / UM: ${product.unit}`}>
                      {product.unit}
                    </span>
                  )}
                </div>

                {/* Price & Action Row */}
                <div className="flex items-center justify-between gap-2 bg-white dark:bg-slate-900 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-800 text-xs shadow-2xs">
                  <div className="flex items-center gap-3">
                    {product.mrp > 0 && (
                      <div>
                        <span className="text-[8px] uppercase font-bold text-slate-400 block leading-none">MRP</span>
                        <span className="text-slate-600 dark:text-slate-300 font-bold text-xs">₹{product.mrp}</span>
                      </div>
                    )}
                    <div>
                      <span className="text-[8px] uppercase font-bold text-slate-400 block leading-none">Retail</span>
                      <span className="text-indigo-700 dark:text-indigo-400 font-extrabold text-xs sm:text-sm leading-none">₹{product.retailPrice}</span>
                    </div>
                    {product.location && (
                      <span className="flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400 shrink-0">
                        <MapPin className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                        <span>{product.location}</span>
                      </span>
                    )}
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSelect(product);
                    }}
                    className={`shrink-0 flex items-center justify-center gap-1 font-bold text-[11px] py-1 px-2.5 rounded-lg transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                        : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                    }`}
                  >
                    {isSelected ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-100" />
                        <span>Selected</span>
                      </>
                    ) : (
                      <>
                        <ArrowRight className="w-3.5 h-3.5" />
                        <span>Select</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

