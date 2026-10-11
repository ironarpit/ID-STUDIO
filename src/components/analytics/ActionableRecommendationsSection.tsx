import React from 'react';
import { Sparkles, ArrowRight, Lightbulb } from 'lucide-react';
import { Product, ComputedProductAnalytics, AnalyticsViewType } from '../../types';
import { computeActionableRecommendations } from '../../utils/analytics';

interface ActionableRecommendationsSectionProps {
  products: Product[];
  analyticsMap: Map<string, ComputedProductAnalytics>;
  onSelectView: (view: AnalyticsViewType) => void;
  isDarkMode?: boolean;
}

export const ActionableRecommendationsSection: React.FC<ActionableRecommendationsSectionProps> = ({
  products,
  analyticsMap,
  onSelectView,
  isDarkMode
}) => {
  const recommendations = React.useMemo(() => {
    return computeActionableRecommendations(products, analyticsMap);
  }, [products, analyticsMap]);

  if (!recommendations || recommendations.length === 0) {
    return null;
  }

  return (
    <div className={`p-3.5 sm:p-4 rounded-xl border ${isDarkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-800'} shadow-xs space-y-3`}>
      <div className="flex items-center justify-between border-b pb-2 border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-1.5 min-w-0">
          <div className="p-1 rounded-md bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400 border border-amber-200 dark:border-amber-800 shrink-0">
            <Sparkles className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate">
              Actionable Recommendations
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
              Data-backed decision insights generated directly from sales velocity and inventory valuation
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {recommendations.map((rec) => (
          <div
            key={rec.id}
            onClick={() => onSelectView(rec.viewTarget as AnalyticsViewType)}
            className={`p-3 rounded-lg border flex flex-col justify-between transition-all cursor-pointer group ${
              rec.impactType === 'critical'
                ? isDarkMode ? 'bg-rose-950/20 border-rose-800/60 hover:border-rose-600' : 'bg-rose-50/60 border-rose-200 hover:border-rose-300'
                : rec.impactType === 'warning'
                ? isDarkMode ? 'bg-amber-950/20 border-amber-800/60 hover:border-amber-600' : 'bg-amber-50/60 border-amber-200 hover:border-amber-300'
                : isDarkMode ? 'bg-slate-850/60 border-slate-800 hover:border-slate-700' : 'bg-slate-50/80 border-slate-200/80 hover:border-slate-300'
            }`}
          >
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <Lightbulb className={`w-3.5 h-3.5 shrink-0 ${rec.impactType === 'critical' ? 'text-rose-600 dark:text-rose-400' : 'text-amber-500'}`} />
                <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                  {rec.title}
                </h3>
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-normal line-clamp-2">
                {rec.text}
              </p>
            </div>

            <div className="flex items-center justify-between pt-2 mt-2 border-t border-slate-200/50 dark:border-slate-800 text-xs">
              <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 truncate">
                {rec.value > 0 ? `Impact: ₹${(rec.value || 0).toLocaleString('en-IN')}` : `${rec.count || 0} Products`}
              </span>
              <div className="flex items-center gap-0.5 text-[11px] font-bold text-indigo-600 dark:text-indigo-400 group-hover:translate-x-0.5 transition-transform shrink-0">
                <span>Take Action</span>
                <ArrowRight className="w-3 h-3" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
