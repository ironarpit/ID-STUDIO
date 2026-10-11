import React from 'react';
import { Product, ComputedProductAnalytics, AuditType } from '../../types';
import { AnalyticsTable } from './AnalyticsTable';
import { cleanDateOnly } from '../../utils/fileParser';
import { AlertOctagon, Boxes, Coins, Tag } from 'lucide-react';

interface DeadStockViewProps {
  products: Product[];
  analyticsMap: Map<string, ComputedProductAnalytics>;
  onSelectProduct: (p: Product) => void;
  onStartFloorAudit?: (title: string, type: AuditType, products: Product[]) => void;
  isDarkMode?: boolean;
}

export const DeadStockView: React.FC<DeadStockViewProps> = ({
  products,
  analyticsMap,
  onSelectProduct,
  onStartFloorAudit,
  isDarkMode
}) => {
  const deadProducts = React.useMemo(() => {
    const list = products.filter((p) => {
      const calc = analyticsMap.get(p.id);
      return calc?.movementStatus === 'dead';
    });
    // Rank products by highest inventory value
    return list.sort((a, b) => {
      const valA = analyticsMap.get(a.id)?.inventoryValue || 0;
      const valB = analyticsMap.get(b.id)?.inventoryValue || 0;
      return valB - valA;
    });
  }, [products, analyticsMap]);

  const summary = React.useMemo(() => {
    let count = 0;
    let units = 0;
    let invValue = 0;
    let retailValue = 0;

    deadProducts.forEach((p) => {
      count++;
      units += p.stock || 0;
      const calc = analyticsMap.get(p.id);
      if (calc) {
        invValue += calc.inventoryValue;
        retailValue += calc.retailStockValue;
      }
    });

    return { count, units, invValue, retailValue };
  }, [deadProducts, analyticsMap]);

  return (
    <div className="space-y-4">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className={`p-3.5 rounded-2xl border ${isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'}`}>
          <div className="flex items-center gap-2 mb-1 text-slate-500 dark:text-slate-400">
            <AlertOctagon className="w-4 h-4 text-rose-600" />
            <span className="text-[10px] font-black uppercase tracking-wider">Dead Stock Count</span>
          </div>
          <div className="text-xl font-black text-rose-600 dark:text-rose-400">{summary.count.toLocaleString('en-IN')} SKUs</div>
          <span className="text-[10px] text-slate-400">Positive stock + 0 sales</span>
        </div>

        <div className={`p-3.5 rounded-2xl border ${isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'}`}>
          <div className="flex items-center gap-2 mb-1 text-slate-500 dark:text-slate-400">
            <Boxes className="w-4 h-4 text-amber-600" />
            <span className="text-[10px] font-black uppercase tracking-wider">Dead Stock Units</span>
          </div>
          <div className="text-xl font-black text-amber-600 dark:text-amber-400">{summary.units.toLocaleString('en-IN')} Qty</div>
          <span className="text-[10px] text-slate-400">Dormant items in store</span>
        </div>

        <div className={`p-3.5 rounded-2xl border ${isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'}`}>
          <div className="flex items-center gap-2 mb-1 text-slate-500 dark:text-slate-400">
            <Coins className="w-4 h-4 text-rose-600" />
            <span className="text-[10px] font-black uppercase tracking-wider">Dead Inventory Value</span>
          </div>
          <div className="text-xl font-black text-rose-600 dark:text-rose-400">₹{summary.invValue.toLocaleString('en-IN')}</div>
          <span className="text-[10px] text-slate-400">Cost capital frozen</span>
        </div>

        <div className={`p-3.5 rounded-2xl border ${isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'}`}>
          <div className="flex items-center gap-2 mb-1 text-slate-500 dark:text-slate-400">
            <Tag className="w-4 h-4 text-purple-600" />
            <span className="text-[10px] font-black uppercase tracking-wider">Dead Retail Value</span>
          </div>
          <div className="text-xl font-black text-purple-600 dark:text-purple-400">₹{summary.retailValue.toLocaleString('en-IN')}</div>
          <span className="text-[10px] text-slate-400">Retail price valuation</span>
        </div>
      </div>

      <AnalyticsTable
        title="Dead Stock Analysis"
        description="Products with positive stock balance but zero reported sales — ranked by highest inventory value"
        products={deadProducts}
        analyticsMap={analyticsMap}
        onSelectProduct={onSelectProduct}
        onStartFloorAudit={onStartFloorAudit ? (prods) => onStartFloorAudit('Dead Stock Floor Audit', 'dead_stock', prods) : undefined}
        isDarkMode={isDarkMode}
        extraColumns={[
          {
            key: 'lastPurchaseDate',
            label: 'Last Purchase Date',
            render: (p) => (
              <span className="font-mono text-xs text-rose-600 dark:text-rose-400 font-bold">
                {cleanDateOnly(p.lastPurchaseDate) || '—'}
              </span>
            )
          }
        ]}
      />
    </div>
  );
};
