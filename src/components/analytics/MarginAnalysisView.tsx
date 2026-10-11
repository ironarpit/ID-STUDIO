import React from 'react';
import { Product, ComputedProductAnalytics, AuditType } from '../../types';
import { AnalyticsTable } from './AnalyticsTable';
import { AlertCircle, AlertTriangle } from 'lucide-react';

interface MarginAnalysisViewProps {
  products: Product[];
  analyticsMap: Map<string, ComputedProductAnalytics>;
  onSelectProduct: (p: Product) => void;
  onStartFloorAudit?: (title: string, type: AuditType, products: Product[]) => void;
  isDarkMode?: boolean;
}

export const MarginAnalysisView: React.FC<MarginAnalysisViewProps> = ({
  products,
  analyticsMap,
  onSelectProduct,
  onStartFloorAudit,
  isDarkMode
}) => {
  const marginIssues = React.useMemo(() => {
    return products.filter((p) => {
      const calc = analyticsMap.get(p.id);
      return calc?.marginStatus === 'negative' || calc?.marginStatus === 'low';
    });
  }, [products, analyticsMap]);

  const stats = React.useMemo(() => {
    let negativeCount = 0;
    let lowCount = 0;
    analyticsMap.forEach((calc) => {
      if (calc.marginStatus === 'negative') negativeCount++;
      else if (calc.marginStatus === 'low') lowCount++;
    });
    return { negativeCount, lowCount };
  }, [analyticsMap]);

  return (
    <div className="space-y-4">
      {/* Margin Summary Banners */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 dark:bg-rose-950/60 dark:border-rose-800 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-black uppercase text-rose-600 block">Negative Margin SKUs</span>
            <span className="text-xl font-black mt-0.5 block">
              {stats.negativeCount.toLocaleString('en-IN')} Products
            </span>
            <span className="text-xs font-semibold text-rose-700 dark:text-rose-300 mt-1 block">
              Retail Price &lt; Buy Cost Rate (Selling at a loss!)
            </span>
          </div>
          <div className="p-3 bg-rose-100 dark:bg-rose-900 text-rose-600 dark:text-rose-200 rounded-2xl">
            <AlertCircle className="w-6 h-6" />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 dark:bg-amber-950/60 dark:border-amber-800 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-black uppercase text-amber-600 block">Low Margin SKUs (&lt;10%)</span>
            <span className="text-xl font-black mt-0.5 block">
              {stats.lowCount.toLocaleString('en-IN')} Products
            </span>
            <span className="text-xs font-semibold text-amber-700 dark:text-amber-300 mt-1 block">
              Profit margin below store target threshold
            </span>
          </div>
          <div className="p-3 bg-amber-100 dark:bg-amber-900 text-amber-600 dark:text-amber-200 rounded-2xl">
            <AlertTriangle className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Margin Table */}
      <AnalyticsTable
        title="Price & Margin Risk Analysis"
        description="Products flagged for price erosion, negative profit margins, or below cost sales"
        products={marginIssues.length > 0 ? marginIssues : products}
        analyticsMap={analyticsMap}
        onSelectProduct={onSelectProduct}
        onStartFloorAudit={onStartFloorAudit ? (prods) => onStartFloorAudit('Margin Risk Floor Audit', 'general', prods) : undefined}
        isDarkMode={isDarkMode}
        extraColumns={[
          {
            key: 'marginPct',
            label: 'Margin %',
            render: (p, calc) => {
              if (!calc) return '—';
              const isNegative = calc.marginStatus === 'negative';
              const isLow = calc.marginStatus === 'low';
              return (
                <span
                  className={`font-mono font-black text-xs px-2 py-0.5 rounded-md ${
                    isNegative
                      ? 'bg-rose-600 text-white animate-pulse'
                      : isLow
                      ? 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300'
                      : 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-300'
                  }`}
                >
                  {calc.marginPct.toFixed(1)}%
                </span>
              );
            }
          }
        ]}
      />
    </div>
  );
};
