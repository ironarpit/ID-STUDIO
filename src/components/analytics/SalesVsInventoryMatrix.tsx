import React from 'react';
import { LayoutGrid, ArrowRight } from 'lucide-react';
import { Product, ComputedProductAnalytics, AnalyticsViewType } from '../../types';
import { computeSalesVsInventoryMatrix } from '../../utils/analytics';

interface SalesVsInventoryMatrixProps {
  products: Product[];
  analyticsMap: Map<string, ComputedProductAnalytics>;
  onSelectView: (view: AnalyticsViewType) => void;
  onInspectProducts: (products: Product[], title: string) => void;
  isDarkMode?: boolean;
}

export const SalesVsInventoryMatrix: React.FC<SalesVsInventoryMatrixProps> = ({
  products,
  analyticsMap,
  onSelectView,
  onInspectProducts,
  isDarkMode
}) => {
  const matrix = React.useMemo(() => {
    return computeSalesVsInventoryMatrix(products, analyticsMap);
  }, [products, analyticsMap]);

  const quadrants = [matrix.q1, matrix.q2, matrix.q3, matrix.q4];

  return (
    <div className={`p-3.5 sm:p-4 rounded-xl border ${isDarkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-800'} shadow-xs space-y-3`}>
      <div className="flex items-center justify-between border-b pb-2 border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-1.5 min-w-0">
          <div className="p-1 rounded-md bg-purple-50 text-purple-600 dark:bg-purple-950/60 dark:text-purple-400 border border-purple-200 dark:border-purple-800 shrink-0">
            <LayoutGrid className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate">
              Sales Performance vs Inventory Value Matrix
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
              Quadrant classification mapping sales velocity against capital investment
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
        {quadrants.map((q, idx) => (
          <div
            key={idx}
            onClick={() => onInspectProducts(q.products, `${q.name} Products`)}
            className={`p-3 rounded-lg border transition-all cursor-pointer flex flex-col justify-between group ${q.badgeColor}`}
          >
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-white/90 dark:bg-slate-900/90 shadow-2xs">
                  {q.name}
                </span>
                <span className="text-[11px] font-black font-mono">
                  {(q.count || 0).toLocaleString('en-IN')} SKUs
                </span>
              </div>

              <p className="text-[11px] text-slate-600 dark:text-slate-300 font-medium mb-2 line-clamp-1">
                {q.description}
              </p>

              <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-slate-200/50 dark:border-slate-700/50">
                <div>
                  <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 block truncate">
                    Inventory Cost Value
                  </span>
                  <span className="font-black text-xs sm:text-sm block mt-0.5 truncate font-mono">
                    ₹{(q.totalInventoryValue || 0).toLocaleString('en-IN')}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 block truncate">
                    Total Sales Revenue
                  </span>
                  <span className="font-black text-xs sm:text-sm block mt-0.5 truncate font-mono">
                    ₹{(q.totalSalesValue || 0).toLocaleString('en-IN')}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-1 text-[11px] font-bold pt-2 mt-2 group-hover:translate-x-0.5 transition-transform">
              <span>View {q.count} SKUs</span>
              <ArrowRight className="w-3 h-3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
