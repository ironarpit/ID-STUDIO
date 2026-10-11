import React from 'react';
import { AnalyticsViewType, Product, ComputedProductAnalytics, StockReportMeta, AuditType } from '../../types';
import { RetailDashboardSummary } from '../../utils/analytics';
import { KpiSummaryRow } from './KpiSummaryRow';
import { DataSourceBadge } from './DataSourceBadge';
import { TopAlertsSection } from './TopAlertsSection';
import { RetailCharts } from './RetailCharts';
import { WorkingCapitalSection } from './WorkingCapitalSection';
import { ActionableRecommendationsSection } from './ActionableRecommendationsSection';
import { SalesVsInventoryMatrix } from './SalesVsInventoryMatrix';

interface DashboardViewProps {
  summary: RetailDashboardSummary;
  onSelectView: (view: AnalyticsViewType) => void;
  products: Product[];
  analyticsMap: Map<string, ComputedProductAnalytics>;
  reportMeta?: StockReportMeta | null;
  onSelectProduct?: (p: Product) => void;
  onInspectProducts?: (products: Product[], title: string) => void;
  onStartFloorAudit?: (title: string, type: AuditType, products: Product[]) => void;
  isDarkMode?: boolean;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  summary,
  onSelectView,
  products,
  analyticsMap,
  reportMeta,
  onSelectProduct = () => {},
  onInspectProducts = () => {},
  onStartFloorAudit,
  isDarkMode
}) => {
  return (
    <div className="space-y-4 w-full overflow-x-hidden">
      {/* 1. Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 px-0.5">
        <div>
          <h1 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-white">
            Stock IQ Overview
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Real-time inventory intelligence for smarter decisions.
          </p>
        </div>
      </div>

      {/* 2. KPI Summary Row (Total Products, Inventory Value, Out of Stock, Low Stock) */}
      <KpiSummaryRow
        summary={summary}
        onSelectView={onSelectView}
        isDarkMode={isDarkMode}
      />

      {/* 3. Top Alerts & Risk Monitoring */}
      <TopAlertsSection
        summary={summary}
        products={products}
        analyticsMap={analyticsMap}
        onSelectView={onSelectView}
        isDarkMode={isDarkMode}
      />

      {/* 4. Active Stock / Central Engine Sync Status (Compact Secondary Panel) */}
      <DataSourceBadge
        reportMeta={reportMeta || null}
        totalProducts={summary?.totalProducts || products.length}
        isDarkMode={isDarkMode}
      />

      {/* 5. Analytics at a Glance (3-Column Desktop Chart Grid) */}
      <RetailCharts
        products={products}
        analyticsMap={analyticsMap}
        isDarkMode={isDarkMode}
        onInspectProducts={onInspectProducts}
        onSelectView={onSelectView}
      />

      {/* 6. Working Capital & Stock Money Breakdown */}
      <WorkingCapitalSection
        products={products}
        analyticsMap={analyticsMap}
        onSelectView={onSelectView}
        isDarkMode={isDarkMode}
      />

      {/* 7. Actionable Recommendations */}
      <ActionableRecommendationsSection
        products={products}
        analyticsMap={analyticsMap}
        onSelectView={onSelectView}
        isDarkMode={isDarkMode}
      />

      {/* 8. Sales Performance vs Inventory Value Matrix (2x2) */}
      <SalesVsInventoryMatrix
        products={products}
        analyticsMap={analyticsMap}
        onSelectView={onSelectView}
        onInspectProducts={onInspectProducts}
        isDarkMode={isDarkMode}
      />
    </div>
  );
};
