import React from 'react';
import { AlertOctagon, Flame, Eye } from 'lucide-react';
import { Product, ComputedProductAnalytics } from '../../types';
import { computeStockRiskProducts } from '../../utils/analytics';

interface StockRiskSectionProps {
  products: Product[];
  analyticsMap: Map<string, ComputedProductAnalytics>;
  onSelectProduct: (p: Product) => void;
  isDarkMode?: boolean;
}

export const StockRiskSection: React.FC<StockRiskSectionProps> = ({
  products,
  analyticsMap,
  onSelectProduct,
  isDarkMode
}) => {
  const stockRisks = React.useMemo(() => {
    return computeStockRiskProducts(products, analyticsMap);
  }, [products, analyticsMap]);

  if (stockRisks.length === 0) {
    return null;
  }

  return (
    <div className={`p-5 rounded-2xl border ${isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'} shadow-2xs space-y-4`}>
      <div className="flex items-center justify-between border-b pb-3 border-slate-100 dark:border-slate-700">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400 border border-rose-200 dark:border-rose-800">
            <Flame className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-black tracking-tight flex items-center gap-2">
              STOCK RISK ANALYSIS
              <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                {stockRisks.length} At-Risk SKUs
              </span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              High-velocity active SKUs currently out of stock or with critical stock runway (&lt;7 days)
            </p>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
        <table className="w-full text-left text-xs">
          <thead className={`uppercase text-[10px] font-black tracking-wider ${isDarkMode ? 'bg-slate-900 text-slate-400' : 'bg-slate-100 text-slate-500'}`}>
            <tr>
              <th className="p-2.5">Risk Scenario</th>
              <th className="p-2.5">Product</th>
              <th className="p-2.5 text-right">Sales Qty</th>
              <th className="p-2.5 text-right">Stock Qty</th>
              <th className="p-2.5 text-right">Avg Daily Sales</th>
              <th className="p-2.5 text-right">Days Cover</th>
              <th className="p-2.5 text-center">Urgency</th>
              <th className="p-2.5 text-center">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700 font-medium">
            {stockRisks.slice(0, 30).map((item, idx) => {
              const p = item.product;
              const calc = analyticsMap.get(p.id);

              return (
                <tr
                  key={`${p.id}_${idx}`}
                  onClick={() => onSelectProduct(p)}
                  className="hover:bg-rose-50/50 dark:hover:bg-slate-700/50 transition-colors cursor-pointer"
                >
                  <td className="p-2.5">
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-md ${
                      item.urgency === 'CRITICAL' ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                    }`}>
                      {item.riskType}
                    </span>
                  </td>
                  <td className="p-2.5 max-w-xs">
                    <div className="font-bold text-slate-900 dark:text-white truncate">{p.name}</div>
                    <div className="text-[10px] text-slate-400 font-mono">{p.barcode} • {p.category || 'General'}</div>
                  </td>
                  <td className="p-2.5 text-right font-bold text-indigo-600 dark:text-indigo-400">
                    {(item.sales || 0).toLocaleString('en-IN')}
                  </td>
                  <td className={`p-2.5 text-right font-bold ${item.stock <= 0 ? 'text-rose-600' : 'text-slate-800 dark:text-slate-200'}`}>
                    {item.stock}
                  </td>
                  <td className="p-2.5 text-right font-mono font-medium">
                    {item.avgDailySales.toFixed(2)}/day
                  </td>
                  <td className={`p-2.5 text-right font-mono font-black ${
                    item.daysCover <= 0 ? 'text-rose-600' : item.daysCover <= 3 ? 'text-amber-600' : 'text-indigo-600'
                  }`}>
                    {item.daysCover <= 0 ? '0 Days (OOS)' : `${item.daysCover.toFixed(1)} Days`}
                  </td>
                  <td className="p-2.5 text-center">
                    <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${
                      item.urgency === 'CRITICAL' ? 'bg-rose-600 text-white' : 'bg-amber-500 text-white'
                    }`}>
                      {item.urgency}
                    </span>
                  </td>
                  <td className="p-2.5 text-center">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectProduct(p);
                      }}
                      className="p-1 rounded bg-indigo-50 dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
