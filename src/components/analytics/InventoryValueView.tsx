import React from 'react';
import { Product, ComputedProductAnalytics, AuditType } from '../../types';
import { AnalyticsTable } from './AnalyticsTable';
import { RetailCharts } from './RetailCharts';
import { Coins, Tags, Briefcase, Truck } from 'lucide-react';
import {
  computeCategorySummaries,
  computeBrandSummaries,
  computeSupplierSummaries
} from '../../utils/analytics';

interface InventoryValueViewProps {
  products: Product[];
  analyticsMap: Map<string, ComputedProductAnalytics>;
  onSelectProduct: (p: Product) => void;
  onStartFloorAudit?: (title: string, type: AuditType, products: Product[]) => void;
  isDarkMode?: boolean;
}

export const InventoryValueView: React.FC<InventoryValueViewProps> = ({
  products,
  analyticsMap,
  onSelectProduct,
  onStartFloorAudit,
  isDarkMode
}) => {
  const topCategories = React.useMemo(() => {
    return computeCategorySummaries(products, analyticsMap).slice(0, 5);
  }, [products, analyticsMap]);

  const topBrands = React.useMemo(() => {
    return computeBrandSummaries(products, analyticsMap).slice(0, 5);
  }, [products, analyticsMap]);

  const topSuppliers = React.useMemo(() => {
    return computeSupplierSummaries(products, analyticsMap).slice(0, 5);
  }, [products, analyticsMap]);

  const totalValue = React.useMemo(() => {
    let sum = 0;
    analyticsMap.forEach(calc => {
      sum += calc.inventoryValue;
    });
    return sum;
  }, [analyticsMap]);

  return (
    <div className="space-y-6">
      {/* Total Valuation Header Banner */}
      <div className="p-4 rounded-2xl bg-indigo-950 dark:bg-slate-900 text-white shadow-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border border-indigo-900 dark:border-slate-850">
        <div>
          <span className="text-[10px] font-black uppercase text-emerald-300 block">Grand Inventory Valuation</span>
          <h2 className="text-2xl sm:text-3xl font-black mt-0.5">
            ₹{totalValue.toLocaleString('en-IN')}
          </h2>
          <p className="text-xs text-emerald-200 mt-1">
            Calculated across {products.length.toLocaleString('en-IN')} total stock SKUs
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="p-3 bg-white/10 backdrop-blur-xs rounded-2xl text-emerald-300">
            <Coins className="w-8 h-8" />
          </div>
        </div>
      </div>

      {/* Top Value Breakdown Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Top Category */}
        <div className={`p-4 rounded-2xl border ${isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'}`}>
          <div className="flex items-center gap-2 mb-2">
            <Tags className="w-4 h-4 text-teal-600" />
            <h3 className="font-extrabold text-xs uppercase tracking-wider text-slate-500">Top Categories by Value</h3>
          </div>
          <div className="space-y-2 mt-2">
            {topCategories.map(cat => (
              <div key={cat.category} className="flex items-center justify-between text-xs">
                <span className="font-semibold truncate max-w-[140px]">{cat.category}</span>
                <span className="font-mono font-extrabold text-teal-600 dark:text-teal-400">
                  ₹{cat.inventoryValue.toLocaleString('en-IN')}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Top Brand */}
        <div className={`p-4 rounded-2xl border ${isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'}`}>
          <div className="flex items-center gap-2 mb-2">
            <Briefcase className="w-4 h-4 text-violet-600" />
            <h3 className="font-extrabold text-xs uppercase tracking-wider text-slate-500">Top Brands by Value</h3>
          </div>
          <div className="space-y-2 mt-2">
            {topBrands.map(b => (
              <div key={b.brand} className="flex items-center justify-between text-xs">
                <span className="font-semibold truncate max-w-[140px]">{b.brand}</span>
                <span className="font-mono font-extrabold text-violet-600 dark:text-violet-400">
                  ₹{b.inventoryValue.toLocaleString('en-IN')}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Top Supplier */}
        <div className={`p-4 rounded-2xl border ${isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'}`}>
          <div className="flex items-center gap-2 mb-2">
            <Truck className="w-4 h-4 text-cyan-600" />
            <h3 className="font-extrabold text-xs uppercase tracking-wider text-slate-500">Top Suppliers by Value</h3>
          </div>
          <div className="space-y-2 mt-2">
            {topSuppliers.map(s => (
              <div key={s.supplierName} className="flex items-center justify-between text-xs">
                <span className="font-semibold truncate max-w-[140px]">{s.supplierName}</span>
                <span className="font-mono font-extrabold text-cyan-600 dark:text-cyan-400">
                  ₹{s.inventoryValue.toLocaleString('en-IN')}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Visual Charts */}
      <RetailCharts products={products} analyticsMap={analyticsMap} isDarkMode={isDarkMode} />

      {/* Valuation Table */}
      <AnalyticsTable
        title="Inventory Valuation Master Table"
        description="Comprehensive valuation breakdown of all closing stock items"
        products={products}
        analyticsMap={analyticsMap}
        onSelectProduct={onSelectProduct}
        onStartFloorAudit={onStartFloorAudit ? (prods) => onStartFloorAudit('Inventory Value Floor Audit', 'general', prods) : undefined}
        isDarkMode={isDarkMode}
      />
    </div>
  );
};
