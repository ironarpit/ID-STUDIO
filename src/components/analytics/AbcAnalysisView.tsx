import React, { useState } from 'react';
import { Info } from 'lucide-react';
import { Product, ComputedProductAnalytics, AuditType } from '../../types';
import { AnalyticsTable } from './AnalyticsTable';

interface AbcAnalysisViewProps {
  products: Product[];
  analyticsMap: Map<string, ComputedProductAnalytics>;
  onSelectProduct: (p: Product) => void;
  onStartFloorAudit?: (title: string, type: AuditType, products: Product[]) => void;
  isDarkMode?: boolean;
}

export const AbcAnalysisView: React.FC<AbcAnalysisViewProps> = ({
  products,
  analyticsMap,
  onSelectProduct,
  onStartFloorAudit,
  isDarkMode
}) => {
  const [abcFilter, setAbcFilter] = useState<'all' | 'A' | 'B' | 'C'>('all');

  const filteredProducts = React.useMemo(() => {
    if (abcFilter === 'all') return products;
    return products.filter((p) => {
      const calc = analyticsMap.get(p.id);
      return calc?.abcCategory === abcFilter;
    });
  }, [products, analyticsMap, abcFilter]);

  const stats = React.useMemo(() => {
    let aCount = 0, bCount = 0, cCount = 0;
    let aVal = 0, bVal = 0, cVal = 0;
    let totalSalesVal = 0;

    analyticsMap.forEach((v) => {
      totalSalesVal += v.salesValue;
      if (v.abcCategory === 'A') {
        aCount++;
        aVal += v.salesValue;
      } else if (v.abcCategory === 'B') {
        bCount++;
        bVal += v.salesValue;
      } else {
        cCount++;
        cVal += v.salesValue;
      }
    });

    const isRevenueZero = totalSalesVal === 0;

    return { aCount, bCount, cCount, aVal, bVal, cVal, isRevenueZero };
  }, [analyticsMap]);

  return (
    <div className="space-y-4">
      {stats.isRevenueZero && (
        <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 text-amber-800 dark:text-amber-300 text-xs flex items-center gap-2.5">
          <Info className="w-4 h-4 shrink-0 text-amber-600" />
          <div>
            <span className="font-bold">Sales Value Fallback Triggered:</span> Sales revenue was 0 across all SKUs in this report. ABC analysis is calculated using <strong>Sales Quantity / Inventory Stock Valuation fallback ranking</strong> (A = Top 70%, B = Next 20%, C = Remaining 10%).
          </div>
        </div>
      )}

      {/* ABC Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <button
          onClick={() => setAbcFilter('A')}
          className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
            abcFilter === 'A'
              ? 'ring-2 ring-emerald-500 bg-emerald-50 border-emerald-300 dark:bg-emerald-950/60'
              : isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase text-emerald-600">Category A</span>
            <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">Top 70% Share</span>
          </div>
          <div className="text-xl font-black text-slate-900 dark:text-white mt-1">
            {stats.aCount.toLocaleString('en-IN')} SKUs
          </div>
          <div className="text-xs font-bold text-emerald-700 mt-1">
            Sales: ₹{stats.aVal.toLocaleString('en-IN')}
          </div>
        </button>

        <button
          onClick={() => setAbcFilter('B')}
          className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
            abcFilter === 'B'
              ? 'ring-2 ring-amber-500 bg-amber-50 border-amber-300 dark:bg-amber-950/60'
              : isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase text-amber-600">Category B</span>
            <span className="text-xs font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">Next 20% Share</span>
          </div>
          <div className="text-xl font-black text-slate-900 dark:text-white mt-1">
            {stats.bCount.toLocaleString('en-IN')} SKUs
          </div>
          <div className="text-xs font-bold text-amber-700 mt-1">
            Sales: ₹{stats.bVal.toLocaleString('en-IN')}
          </div>
        </button>

        <button
          onClick={() => setAbcFilter('C')}
          className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
            abcFilter === 'C'
              ? 'ring-2 ring-indigo-500 bg-indigo-50 border-indigo-300 dark:bg-indigo-950/60'
              : isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase text-indigo-600">Category C</span>
            <span className="text-xs font-bold text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded-full">Remaining 10% Share</span>
          </div>
          <div className="text-xl font-black text-slate-900 dark:text-white mt-1">
            {stats.cCount.toLocaleString('en-IN')} SKUs
          </div>
          <div className="text-xs font-bold text-indigo-700 mt-1">
            Sales: ₹{stats.cVal.toLocaleString('en-IN')}
          </div>
        </button>
      </div>

      {/* ABC Analytics Table */}
      <AnalyticsTable
        title={`ABC Analysis ${abcFilter !== 'all' ? `(Category ${abcFilter})` : '(All Categories)'}`}
        description="Automatic Pareto analysis classifying SKUs into high value revenue generators (A), moderate performers (B), and long tail inventory (C)"
        products={filteredProducts}
        analyticsMap={analyticsMap}
        onSelectProduct={onSelectProduct}
        onStartFloorAudit={onStartFloorAudit ? (prods) => onStartFloorAudit(`ABC Class ${abcFilter} Floor Audit`, 'top_100', prods) : undefined}
        isDarkMode={isDarkMode}
      />
    </div>
  );
};
