import React, { useState } from 'react';
import { Product, ComputedProductAnalytics, AuditType } from '../../types';
import { AnalyticsTable } from './AnalyticsTable';
import { Clock, CalendarX, Boxes, Coins, Tag } from 'lucide-react';
import { cleanDateOnly } from '../../utils/fileParser';

interface StockAgeViewProps {
  products: Product[];
  analyticsMap: Map<string, ComputedProductAnalytics>;
  onSelectProduct: (p: Product) => void;
  onStartFloorAudit?: (title: string, type: AuditType, products: Product[]) => void;
  isDarkMode?: boolean;
}

export const StockAgeView: React.FC<StockAgeViewProps> = ({
  products,
  analyticsMap,
  onSelectProduct,
  onStartFloorAudit,
  isDarkMode
}) => {
  const [selectedGroup, setSelectedGroup] = useState<string>('all');

  const hasAnyDate = React.useMemo(() => {
    return products.some((p) => p.lastPurchaseDate && p.lastPurchaseDate.trim() !== '');
  }, [products]);

  const groupStats = React.useMemo(() => {
    const stats: Record<string, { count: number; units: number; invValue: number; retailValue: number }> = {
      '0-30': { count: 0, units: 0, invValue: 0, retailValue: 0 },
      '31-60': { count: 0, units: 0, invValue: 0, retailValue: 0 },
      '61-90': { count: 0, units: 0, invValue: 0, retailValue: 0 },
      '91-180': { count: 0, units: 0, invValue: 0, retailValue: 0 },
      '181-365': { count: 0, units: 0, invValue: 0, retailValue: 0 },
      '365+': { count: 0, units: 0, invValue: 0, retailValue: 0 },
      'Unknown': { count: 0, units: 0, invValue: 0, retailValue: 0 }
    };

    products.forEach((p) => {
      const calc = analyticsMap.get(p.id);
      if (calc) {
        let g = calc.stockAgeGroup;
        if (g === '180+') g = '181-365'; // Normalization fallback
        if (stats[g]) {
          stats[g].count++;
          stats[g].units += p.stock || 0;
          stats[g].invValue += calc.inventoryValue;
          stats[g].retailValue += calc.retailStockValue;
        }
      }
    });

    return stats;
  }, [products, analyticsMap]);

  const filteredProducts = React.useMemo(() => {
    if (selectedGroup === 'all') return products;
    return products.filter((p) => {
      const calc = analyticsMap.get(p.id);
      if (!calc) return false;
      if (selectedGroup === '181-365' && (calc.stockAgeGroup === '181-365' || calc.stockAgeGroup === '180+')) {
        return true;
      }
      return calc.stockAgeGroup === selectedGroup;
    });
  }, [products, analyticsMap, selectedGroup]);

  return (
    <div className="space-y-4">
      {!hasAnyDate && (
        <div className={`p-4 rounded-2xl border flex items-center gap-3 ${
          isDarkMode ? 'bg-amber-950/40 border-amber-800 text-amber-200' : 'bg-amber-50 border-amber-200 text-amber-900'
        }`}>
          <CalendarX className="w-6 h-6 text-amber-600 flex-shrink-0" />
          <div>
            <div className="font-bold text-sm">Stock Age Notice</div>
            <div className="text-xs text-amber-700 dark:text-amber-300">
              Stock age cannot be calculated from the uploaded data because purchase/stock date columns were not included in the source file.
            </div>
          </div>
        </div>
      )}

      {/* Ageing Groups Header */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-7 gap-2.5">
        {[
          { key: '0-30', label: '0–30 Days', color: 'bg-emerald-50 border-emerald-200 text-emerald-800' },
          { key: '31-60', label: '31–60 Days', color: 'bg-blue-50 border-blue-200 text-blue-800' },
          { key: '61-90', label: '61–90 Days', color: 'bg-indigo-50 border-indigo-200 text-indigo-800' },
          { key: '91-180', label: '91–180 Days', color: 'bg-amber-50 border-amber-200 text-amber-800' },
          { key: '181-365', label: '181–365 Days', color: 'bg-orange-50 border-orange-200 text-orange-800' },
          { key: '365+', label: '365+ Days (Aged)', color: 'bg-rose-50 border-rose-300 text-rose-800' },
          { key: 'Unknown', label: 'No Date Recorded', color: 'bg-slate-100 border-slate-200 text-slate-700' }
        ].map((item) => {
          const st = groupStats[item.key] || { count: 0, units: 0, invValue: 0, retailValue: 0 };
          const isSelected = selectedGroup === item.key;
          return (
            <button
              key={item.key}
              onClick={() => setSelectedGroup(isSelected ? 'all' : item.key)}
              className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                isSelected ? 'ring-2 ring-indigo-600 font-bold shadow-md' : ''
              } ${isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : item.color}`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-black uppercase tracking-wider">{item.label}</span>
                <Clock className="w-3.5 h-3.5 opacity-60" />
              </div>
              <div className="text-base font-black">{st.count.toLocaleString('en-IN')} SKUs</div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                {st.units.toLocaleString('en-IN')} Qty
              </div>
              <div className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 mt-1">
                Cost: ₹{st.invValue.toLocaleString('en-IN')}
              </div>
              <div className="text-[9px] font-semibold text-slate-500 dark:text-slate-400">
                Retail: ₹{st.retailValue.toLocaleString('en-IN')}
              </div>
            </button>
          );
        })}
      </div>

      {/* Stock Ageing Table */}
      <AnalyticsTable
        title={`Stock Ageing Analysis ${selectedGroup !== 'all' ? `(${selectedGroup} Days Group)` : '(All Batches)'}`}
        description="Calculates inventory ageing from purchase/stock date to highlight slow-turning, aged stock"
        products={filteredProducts}
        analyticsMap={analyticsMap}
        onSelectProduct={onSelectProduct}
        onStartFloorAudit={onStartFloorAudit ? (prods) => onStartFloorAudit('Aged Stock Floor Audit', 'dead_stock', prods) : undefined}
        isDarkMode={isDarkMode}
        extraColumns={[
          {
            key: 'lastPurchaseDate',
            label: 'Last Purchase Date',
            render: (p) => (
              <span className="font-mono text-xs text-slate-700 dark:text-slate-300">
                {cleanDateOnly(p.lastPurchaseDate) || '—'}
              </span>
            )
          },
          {
            key: 'stockAgeGroup',
            label: 'Age Group',
            render: (p, calc) => {
              if (!calc) return '—';
              const isOld = calc.stockAgeGroup === '365+' || calc.stockAgeGroup === '181-365' || calc.stockAgeGroup === '180+' || calc.stockAgeGroup === '91-180';
              return (
                <span
                  className={`text-[10px] font-black px-2 py-0.5 rounded-md ${
                    isOld
                      ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                      : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                  }`}
                >
                  {calc.stockAgeGroup}
                </span>
              );
            }
          }
        ]}
      />
    </div>
  );
};
