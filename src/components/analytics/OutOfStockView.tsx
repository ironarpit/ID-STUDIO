import React from 'react';
import { Product, ComputedProductAnalytics, AuditType } from '../../types';
import { AnalyticsTable } from './AnalyticsTable';
import { PackageX, ShoppingCart, TrendingUp, Truck } from 'lucide-react';

interface OutOfStockViewProps {
  products: Product[];
  analyticsMap: Map<string, ComputedProductAnalytics>;
  onSelectProduct: (p: Product) => void;
  onStartFloorAudit?: (title: string, type: AuditType, products: Product[]) => void;
  isDarkMode?: boolean;
}

export const OutOfStockView: React.FC<OutOfStockViewProps> = ({
  products,
  analyticsMap,
  onSelectProduct,
  onStartFloorAudit,
  isDarkMode
}) => {
  const outOfStockProducts = React.useMemo(() => {
    const list = products.filter((p) => (p.stock || 0) <= 0);

    // Prioritize products that are OUT OF STOCK + HAVE SALES above products with no sales history
    return list.sort((a, b) => {
      const salesA = a.salesCount || 0;
      const salesB = b.salesCount || 0;

      // Higher sales count first
      return salesB - salesA;
    });
  }, [products]);

  const summary = React.useMemo(() => {
    let count = 0;
    let withSalesCount = 0;
    let totalSalesUnits = 0;
    const suppliers = new Set<string>();

    outOfStockProducts.forEach((p) => {
      count++;
      const s = p.salesCount || 0;
      if (s > 0) {
        withSalesCount++;
        totalSalesUnits += s;
      }
      if (p.supplierName) suppliers.add(p.supplierName);
    });

    return { count, withSalesCount, totalSalesUnits, supplierCount: suppliers.size };
  }, [outOfStockProducts]);

  return (
    <div className="space-y-4">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className={`p-3.5 rounded-2xl border ${isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'}`}>
          <div className="flex items-center gap-2 mb-1 text-slate-500 dark:text-slate-400">
            <PackageX className="w-4 h-4 text-rose-600" />
            <span className="text-[10px] font-black uppercase tracking-wider">Out of Stock SKUs</span>
          </div>
          <div className="text-xl font-black text-rose-600 dark:text-rose-400">{summary.count.toLocaleString('en-IN')}</div>
          <span className="text-[10px] text-slate-400">0 closing stock balance</span>
        </div>

        <div className={`p-3.5 rounded-2xl border ${isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'}`}>
          <div className="flex items-center gap-2 mb-1 text-slate-500 dark:text-slate-400">
            <ShoppingCart className="w-4 h-4 text-amber-600" />
            <span className="text-[10px] font-black uppercase tracking-wider">Stock-out With Sales</span>
          </div>
          <div className="text-xl font-black text-amber-600 dark:text-amber-400">{summary.withSalesCount.toLocaleString('en-IN')} SKUs</div>
          <span className="text-[10px] text-slate-400 font-bold text-amber-600">Priority Replenishment!</span>
        </div>

        <div className={`p-3.5 rounded-2xl border ${isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'}`}>
          <div className="flex items-center gap-2 mb-1 text-slate-500 dark:text-slate-400">
            <TrendingUp className="w-4 h-4 text-indigo-600" />
            <span className="text-[10px] font-black uppercase tracking-wider">Historical Sales</span>
          </div>
          <div className="text-xl font-black text-indigo-600 dark:text-indigo-400">{summary.totalSalesUnits.toLocaleString('en-IN')} Sold</div>
          <span className="text-[10px] text-slate-400">Demand velocity history</span>
        </div>

        <div className={`p-3.5 rounded-2xl border ${isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'}`}>
          <div className="flex items-center gap-2 mb-1 text-slate-500 dark:text-slate-400">
            <Truck className="w-4 h-4 text-teal-600" />
            <span className="text-[10px] font-black uppercase tracking-wider">Affected Suppliers</span>
          </div>
          <div className="text-xl font-black text-teal-600 dark:text-teal-400">{summary.supplierCount.toLocaleString('en-IN')} Vendors</div>
          <span className="text-[10px] text-slate-400">Vendors to reorder from</span>
        </div>
      </div>

      <AnalyticsTable
        title="Out of Stock SKUs Analysis"
        description="Prioritized by Out of Stock items WITH active sales history (highest demand risk first)"
        products={outOfStockProducts}
        analyticsMap={analyticsMap}
        onSelectProduct={onSelectProduct}
        onStartFloorAudit={onStartFloorAudit ? (prods) => onStartFloorAudit('Out of Stock Floor Audit', 'out_of_stock', prods) : undefined}
        isDarkMode={isDarkMode}
        extraColumns={[
          {
            key: 'salesPriority',
            label: 'Sales Demand Priority',
            render: (p) => {
              const sales = p.salesCount || 0;
              if (sales > 0) {
                return (
                  <span className="font-mono text-xs font-black text-amber-700 bg-amber-100 dark:bg-amber-950 dark:text-amber-300 px-2 py-0.5 rounded-md">
                    {sales.toLocaleString('en-IN')} Sold (Priority Order)
                  </span>
                );
              }
              return (
                <span className="text-xs text-slate-400">
                  No Sales
                </span>
              );
            }
          }
        ]}
      />
    </div>
  );
};
