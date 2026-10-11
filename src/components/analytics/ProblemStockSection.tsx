import React, { useState } from 'react';
import { EyeOff, AlertOctagon, PackagePlus, ArrowRight, Eye } from 'lucide-react';
import { Product, ComputedProductAnalytics, AnalyticsViewType } from '../../types';

interface ProblemStockSectionProps {
  products: Product[];
  analyticsMap: Map<string, ComputedProductAnalytics>;
  onSelectView: (view: AnalyticsViewType) => void;
  onSelectProduct: (p: Product) => void;
  isDarkMode?: boolean;
}

type ModeType = 'zero_sales' | 'dead_stock' | 'overstock';

export const ProblemStockSection: React.FC<ProblemStockSectionProps> = ({
  products,
  analyticsMap,
  onSelectView,
  onSelectProduct,
  isDarkMode
}) => {
  const [activeMode, setActiveMode] = useState<ModeType>('zero_sales');

  // Compute Zero Sales
  const zeroSalesData = React.useMemo(() => {
    const list = products.filter((p) => (p.salesCount || 0) === 0);
    list.sort((a, b) => {
      const valA = analyticsMap.get(a.id)?.inventoryValueCost || 0;
      const valB = analyticsMap.get(b.id)?.inventoryValueCost || 0;
      return valB - valA;
    });

    let totalUnits = 0;
    let invValue = 0;
    let retailValue = 0;

    for (const p of list) {
      const calc = analyticsMap.get(p.id);
      totalUnits += p.stock || 0;
      if (calc) {
        invValue += calc.inventoryValueCost;
        retailValue += calc.retailStockValue;
      }
    }

    return { list, totalUnits, invValue, retailValue };
  }, [products, analyticsMap]);

  // Compute Dead Stock
  const deadStockData = React.useMemo(() => {
    const list = products.filter((p) => {
      const calc = analyticsMap.get(p.id);
      return calc && calc.movementStatus === 'dead';
    });
    list.sort((a, b) => {
      const valA = analyticsMap.get(a.id)?.inventoryValueCost || 0;
      const valB = analyticsMap.get(b.id)?.inventoryValueCost || 0;
      return valB - valA;
    });

    let totalUnits = 0;
    let invValue = 0;
    let retailValue = 0;

    for (const p of list) {
      const calc = analyticsMap.get(p.id);
      totalUnits += p.stock || 0;
      if (calc) {
        invValue += calc.inventoryValueCost;
        retailValue += calc.retailStockValue;
      }
    }

    return { list, totalUnits, invValue, retailValue };
  }, [products, analyticsMap]);

  // Compute Overstock
  const overstockData = React.useMemo(() => {
    const list = products.filter((p) => {
      const calc = analyticsMap.get(p.id);
      return calc && calc.stockStatus === 'overstock';
    });
    list.sort((a, b) => {
      const valA = analyticsMap.get(a.id)?.inventoryValueCost || 0;
      const valB = analyticsMap.get(b.id)?.inventoryValueCost || 0;
      return valB - valA;
    });

    let totalUnits = 0;
    let invValue = 0;
    let retailValue = 0;

    for (const p of list) {
      const calc = analyticsMap.get(p.id);
      totalUnits += p.stock || 0;
      if (calc) {
        invValue += calc.inventoryValueCost;
        retailValue += calc.retailStockValue;
      }
    }

    return { list, totalUnits, invValue, retailValue };
  }, [products, analyticsMap]);

  const getCurrentData = () => {
    if (activeMode === 'zero_sales') {
      return {
        title: 'ZERO SALES ANALYSIS',
        view: 'zero_sales' as AnalyticsViewType,
        icon: EyeOff,
        data: zeroSalesData,
        badgeColor: 'bg-slate-100 text-slate-800 border-slate-300 dark:bg-slate-700 dark:text-slate-200'
      };
    } else if (activeMode === 'dead_stock') {
      return {
        title: 'DEAD STOCK ANALYSIS',
        view: 'dead_stock' as AnalyticsViewType,
        icon: AlertOctagon,
        data: deadStockData,
        badgeColor: 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950 dark:text-rose-300'
      };
    } else {
      return {
        title: 'OVERSTOCK ANALYSIS',
        view: 'overstock' as AnalyticsViewType,
        icon: PackagePlus,
        data: overstockData,
        badgeColor: 'bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-950 dark:text-purple-300'
      };
    }
  };

  const current = getCurrentData();
  const Icon = current.icon;

  return (
    <div className={`p-5 rounded-2xl border ${isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'} shadow-2xs space-y-4`}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-3 border-slate-100 dark:border-slate-700">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600">
            <Icon className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-black tracking-tight">{current.title}</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              In-depth valuation and SKU auditing ranked by highest locked inventory value
            </p>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-900 p-1 rounded-xl">
          <button
            onClick={() => setActiveMode('zero_sales')}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeMode === 'zero_sales' ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Zero Sales ({zeroSalesData.list.length})
          </button>
          <button
            onClick={() => setActiveMode('dead_stock')}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeMode === 'dead_stock' ? 'bg-white dark:bg-slate-800 text-rose-600 dark:text-rose-400 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Dead Stock ({deadStockData.list.length})
          </button>
          <button
            onClick={() => setActiveMode('overstock')}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeMode === 'overstock' ? 'bg-white dark:bg-slate-800 text-purple-600 dark:text-purple-400 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Overstock ({overstockData.list.length})
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-700">
          <span className="text-[10px] uppercase font-bold text-slate-400 block">Total SKUs</span>
          <span className="text-base sm:text-lg font-black text-slate-900 dark:text-white block mt-0.5">
            {(current.data.list.length || 0).toLocaleString('en-IN')} SKUs
          </span>
        </div>

        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-700">
          <span className="text-[10px] uppercase font-bold text-slate-400 block">Total Units in Stock</span>
          <span className="text-base sm:text-lg font-black text-indigo-600 dark:text-indigo-400 block mt-0.5">
            {(current.data.totalUnits || 0).toLocaleString('en-IN')} Qty
          </span>
        </div>

        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-700">
          <span className="text-[10px] uppercase font-bold text-slate-400 block">Inventory Value Locked</span>
          <span className="text-base sm:text-lg font-black text-rose-600 dark:text-rose-400 block mt-0.5">
            ₹{(current.data.invValue || 0).toLocaleString('en-IN')}
          </span>
        </div>

        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-700">
          <span className="text-[10px] uppercase font-bold text-slate-400 block">Potential Retail Value</span>
          <span className="text-base sm:text-lg font-black text-purple-600 dark:text-purple-400 block mt-0.5">
            ₹{(current.data.retailValue || 0).toLocaleString('en-IN')}
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
        <table className="w-full text-left text-xs">
          <thead className={`uppercase text-[10px] font-black tracking-wider ${isDarkMode ? 'bg-slate-900 text-slate-400' : 'bg-slate-100 text-slate-500'}`}>
            <tr>
              <th className="p-2.5">Product Name</th>
              <th className="p-2.5">Category</th>
              <th className="p-2.5 text-right">Stock</th>
              <th className="p-2.5 text-right">Cost Price</th>
              <th className="p-2.5 text-right">Inventory Cost Value (₹)</th>
              <th className="p-2.5 text-right">Retail Price</th>
              <th className="p-2.5 text-center">Stock Age</th>
              <th className="p-2.5 text-center">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700 font-medium">
            {current.data.list.slice(0, 15).map((p) => {
              const calc = analyticsMap.get(p.id);
              const invVal = calc ? calc.inventoryValueCost : 0;

              return (
                <tr
                  key={p.id}
                  onClick={() => onSelectProduct(p)}
                  className="hover:bg-indigo-50/50 dark:hover:bg-slate-700/50 transition-colors cursor-pointer"
                >
                  <td className="p-2.5 max-w-xs">
                    <div className="font-bold text-slate-900 dark:text-white truncate">{p.name}</div>
                    <div className="text-[10px] text-slate-400 font-mono">{p.barcode}</div>
                  </td>
                  <td className="p-2.5 text-slate-500 dark:text-slate-400">
                    {p.category || 'General'}
                  </td>
                  <td className="p-2.5 text-right font-bold text-slate-800 dark:text-slate-200">
                    {p.stock}
                  </td>
                  <td className="p-2.5 text-right font-mono text-slate-600 dark:text-slate-300">
                    {p.costPrice ? `₹${p.costPrice.toLocaleString('en-IN')}` : '—'}
                  </td>
                  <td className="p-2.5 text-right font-mono font-black text-rose-600 dark:text-rose-400">
                    ₹{invVal.toLocaleString('en-IN')}
                  </td>
                  <td className="p-2.5 text-right font-mono font-bold text-slate-900 dark:text-white">
                    ₹{(p.retailPrice || 0).toLocaleString('en-IN')}
                  </td>
                  <td className="p-2.5 text-center text-[10px] text-slate-500 font-mono">
                    {calc?.stockAgeDays !== null && calc?.stockAgeDays !== undefined
                      ? `${calc.stockAgeDays} Days`
                      : 'N/A'}
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

      <div className="flex justify-end pt-2">
        <button
          onClick={() => onSelectView(current.view)}
          className="flex items-center gap-1.5 font-bold text-xs text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
        >
          <span>View All {current.data.list.length} Items in {current.title}</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
