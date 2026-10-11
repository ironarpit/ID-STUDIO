import React from 'react';
import { Product, ComputedProductAnalytics, AuditType } from '../../types';
import { AnalyticsTable } from './AnalyticsTable';
import { Sparkles, ArrowRight } from 'lucide-react';

interface AiRecommendationsViewProps {
  products: Product[];
  analyticsMap: Map<string, ComputedProductAnalytics>;
  onSelectProduct: (p: Product) => void;
  onStartFloorAudit?: (title: string, type: AuditType, products: Product[]) => void;
  isDarkMode?: boolean;
}

export const AiRecommendationsView: React.FC<AiRecommendationsViewProps> = ({
  products,
  analyticsMap,
  onSelectProduct,
  onStartFloorAudit,
  isDarkMode
}) => {
  const recommendationsSummary = React.useMemo(() => {
    let urgentCount = 0;
    let deadStockCount = 0;
    let promoCount = 0;
    let highDemandCount = 0;

    analyticsMap.forEach((calc) => {
      if (calc.stockStatus === 'out_of_stock' || calc.suggestedReorder > 0) urgentCount++;
      if (calc.movementStatus === 'dead') deadStockCount++;
      if (calc.stockStatus === 'overstock') promoCount++;
      if (calc.movementStatus === 'fast') highDemandCount++;
    });

    return { urgentCount, deadStockCount, promoCount, highDemandCount };
  }, [analyticsMap]);

  return (
    <div className="space-y-4">
      {/* AI Intelligence Header Banner */}
      <div className="p-4 rounded-2xl bg-indigo-950 dark:bg-slate-900 text-white shadow-md flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border border-indigo-900 dark:border-slate-850">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-xl bg-white/10 backdrop-blur-xs text-indigo-300">
              <Sparkles className="w-5 h-5 animate-pulse" />
            </div>
            <h2 className="text-base sm:text-lg font-black tracking-tight">AI Store Floor Advisor</h2>
          </div>
          <p className="text-xs text-indigo-200">
            Real-time rule-based algorithms analyzing stock cover, sales velocity, margin risk, and inventory ageing.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full md:w-auto text-xs">
          <div className="p-2.5 rounded-xl bg-white/10 backdrop-blur-xs text-center">
            <span className="text-[10px] uppercase font-bold text-indigo-200 block">Replenish Urgently</span>
            <span className="font-black text-base text-rose-300 block mt-0.5">
              {recommendationsSummary.urgentCount.toLocaleString('en-IN')}
            </span>
          </div>
          <div className="p-2.5 rounded-xl bg-white/10 backdrop-blur-xs text-center">
            <span className="text-[10px] uppercase font-bold text-indigo-200 block">Move to Promo</span>
            <span className="font-black text-base text-amber-300 block mt-0.5">
              {recommendationsSummary.promoCount.toLocaleString('en-IN')}
            </span>
          </div>
          <div className="p-2.5 rounded-xl bg-white/10 backdrop-blur-xs text-center">
            <span className="text-[10px] uppercase font-bold text-indigo-200 block">Dead Stock Action</span>
            <span className="font-black text-base text-purple-300 block mt-0.5">
              {recommendationsSummary.deadStockCount.toLocaleString('en-IN')}
            </span>
          </div>
          <div className="p-2.5 rounded-xl bg-white/10 backdrop-blur-xs text-center">
            <span className="text-[10px] uppercase font-bold text-indigo-200 block">High Demand</span>
            <span className="font-black text-base text-emerald-300 block mt-0.5">
              {recommendationsSummary.highDemandCount.toLocaleString('en-IN')}
            </span>
          </div>
        </div>
      </div>

      {/* Recommendations Table */}
      <AnalyticsTable
        title="Product-Level AI Action Suggestions"
        description="Prescriptive store-floor advice for stock reordering, shelf placement, and clearance promotions"
        products={products}
        analyticsMap={analyticsMap}
        onSelectProduct={onSelectProduct}
        onStartFloorAudit={onStartFloorAudit ? (prods) => onStartFloorAudit('AI Recommendations Floor Audit', 'general', prods) : undefined}
        isDarkMode={isDarkMode}
        extraColumns={[
          {
            key: 'aiRecommendation',
            label: 'Action Suggestion',
            render: (p, calc) => {
              if (!calc) return '—';
              const isCritical = calc.healthStatus === 'critical';
              const isWatch = calc.healthStatus === 'watch';
              return (
                <div className="flex items-center gap-1.5 max-w-sm">
                  <span
                    className={`text-[10px] font-bold px-2 py-1 rounded-lg leading-tight flex items-center gap-1 ${
                      isCritical
                        ? 'bg-rose-100 text-rose-900 border border-rose-200 dark:bg-rose-950 dark:text-rose-200'
                        : isWatch
                        ? 'bg-amber-100 text-amber-900 border border-amber-200 dark:bg-amber-950 dark:text-amber-200'
                        : 'bg-emerald-100 text-emerald-900 border border-emerald-200 dark:bg-emerald-950 dark:text-emerald-200'
                    }`}
                  >
                    <Sparkles className="w-3 h-3 shrink-0" />
                    <span>{calc.aiRecommendation}</span>
                  </span>
                </div>
              );
            }
          }
        ]}
      />
    </div>
  );
};
