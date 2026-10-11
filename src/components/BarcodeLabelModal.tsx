import React, { useRef, useEffect } from 'react';
import JsBarcode from 'jsbarcode';
import { X, Printer, Check, Tag } from 'lucide-react';
import { Product } from '../types';
import { useModalTransition } from '../utils/useModalTransition';

interface BarcodeLabelModalProps {
  product: Product | null;
  isOpen: boolean;
  onClose: () => void;
  isDarkMode?: boolean;
}

export const BarcodeLabelModal: React.FC<BarcodeLabelModalProps> = ({
  product,
  isOpen,
  onClose,
  isDarkMode = false
}) => {
  const labelBarcodeRef = useRef<SVGSVGElement>(null);
  const { handleClose, backdropClass, panelClass } = useModalTransition({
    onClose,
    isOpen,
    duration: 170
  });

  const mrp = product ? (product.mrp || product.retailPrice || 0) : 0;
  const retailPrice = product ? (product.retailPrice || product.mrp || 0) : 0;

  useEffect(() => {
    if (isOpen && product && labelBarcodeRef.current) {
      try {
        JsBarcode(labelBarcodeRef.current, product.barcode, {
          format: 'CODE128',
          lineColor: '#000000',
          background: '#ffffff',
          width: 2,
          height: 48,
          displayValue: true,
          fontSize: 12,
          font: 'monospace',
          margin: 4
        });
      } catch (e) {
        console.warn('JsBarcode print render error:', e);
      }
    }
  }, [isOpen, product]);

  if (!isOpen || !product) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div
      className={`fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs ${backdropClass}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div
        className={`border rounded-3xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col mobile-bottom-sheet ${panelClass} ${
          isDarkMode ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        {/* Header */}
        <div className={`p-4 border-b flex items-center justify-between ${
          isDarkMode ? 'border-slate-800 bg-slate-950/90' : 'border-slate-200 bg-slate-50'
        }`}>
          <div className="flex items-center gap-2">
            <Tag className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <h2 className="text-base font-black text-slate-900 dark:text-white">Print Barcode Label</h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Printable Card Area */}
        <div className={`p-6 flex flex-col items-center justify-center ${
          isDarkMode ? 'bg-slate-950/60' : 'bg-slate-100'
        }`}>
          <div id="printable-barcode-sticker" className="w-72 bg-white text-slate-900 p-4 rounded-2xl shadow-md border border-slate-300 flex flex-col items-center text-center space-y-2">
            <p className="font-extrabold text-sm uppercase tracking-wide truncate max-w-full text-slate-950">
              {product.name}
            </p>

            {product.localCode && (
              <div className="text-[11px] font-bold font-mono text-slate-700">
                Code: {product.localCode}
              </div>
            )}

            <div className="flex justify-center my-1">
              <svg ref={labelBarcodeRef} className="max-w-full h-16"></svg>
            </div>

            <div className="flex items-center justify-between w-full text-xs font-bold border-t border-dashed border-slate-300 pt-2 text-slate-900">
              <span className="text-slate-500 line-through">MRP: ₹{mrp}</span>
              <span className="text-base font-black text-slate-950">SALE: ₹{retailPrice}</span>
            </div>

            <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest pt-1">
              ID STUDIO
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className={`p-4 border-t flex items-center justify-between ${
          isDarkMode ? 'border-slate-800 bg-slate-950/90' : 'border-slate-200 bg-slate-50'
        }`}>
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
          >
            Close
          </button>
          <button
            onClick={handlePrint}
            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
          >
            <Printer className="w-4 h-4" />
            <span>Print Label</span>
          </button>
        </div>
      </div>
    </div>
  );
};
