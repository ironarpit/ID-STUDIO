import React, { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
  CartesianGrid
} from 'recharts';
import { 
  BarChart2, 
  Tags, 
  PieChart as PieIcon, 
  Activity, 
  Maximize2, 
  Layers, 
  ArrowRight
} from 'lucide-react';
import { Product, ComputedProductAnalytics, AnalyticsViewType } from '../../types';
import {
  computeCategorySummaries
} from '../../utils/analytics';
import { DetailedDiagramsModal } from './DetailedDiagramsModal';

export interface RetailChartsProps {
  products: Product[];
  analyticsMap: Map<string, ComputedProductAnalytics>;
  isDarkMode?: boolean;
  onInspectProducts?: (products: Product[], title: string) => void;
  onSelectView?: (view: AnalyticsViewType) => void;
}

export function RetailCharts({
  products,
  analyticsMap,
  isDarkMode,
  onInspectProducts = () => {},
  onSelectView = (_view: AnalyticsViewType) => {}
}: RetailChartsProps) {
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [modalTab, setModalTab] = useState<'categories' | 'brands' | 'suppliers' | 'abc'>('categories');

  const openDetailed = (tab: 'categories' | 'brands' | 'suppliers' | 'abc') => {
    setModalTab(tab);
    setModalOpen(true);
  };

  // 1. Top Categories by Inventory Value (Top 6 for clean readability)
  const categoryData = useMemo(() => {
    if (!products || products.length === 0) return [];
    return computeCategorySummaries(products, analyticsMap).slice(0, 6);
  }, [products, analyticsMap]);

  // 2. ABC Classification Distribution
  const abcDistribution = useMemo(() => {
    let aCount = 0, bCount = 0, cCount = 0;
    if (analyticsMap && typeof analyticsMap.forEach === 'function') {
      analyticsMap.forEach(v => {
        if (v?.abcCategory === 'A') aCount++;
        else if (v?.abcCategory === 'B') bCount++;
        else cCount++;
      });
    }
    const total = aCount + bCount + cCount;
    return [
      { name: 'Class A (Top 70% Rev)', value: aCount, color: '#10b981', pct: total > 0 ? Math.round((aCount / total) * 100) : 0 },
      { name: 'Class B (Next 20% Rev)', value: bCount, color: '#f59e0b', pct: total > 0 ? Math.round((bCount / total) * 100) : 0 },
      { name: 'Class C (Bottom 10%)', value: cCount, color: '#6366f1', pct: total > 0 ? Math.round((cCount / total) * 100) : 0 }
    ];
  }, [analyticsMap]);

  // 3. Stock Health Breakdown (Healthy vs Watch vs Critical)
  const healthDistribution = useMemo(() => {
    let healthyCount = 0, watchCount = 0, criticalCount = 0;
    if (analyticsMap && typeof analyticsMap.forEach === 'function') {
      analyticsMap.forEach(v => {
        if (v?.healthStatus === 'healthy') healthyCount++;
        else if (v?.healthStatus === 'watch') watchCount++;
        else if (v?.healthStatus === 'critical') criticalCount++;
        else healthyCount++;
      });
    }
    const total = healthyCount + watchCount + criticalCount;
    return [
      { name: 'Healthy Stock', value: healthyCount, color: '#10b981', pct: total > 0 ? Math.round((healthyCount / total) * 100) : 0 },
      { name: 'Needs Watch', value: watchCount, color: '#f59e0b', pct: total > 0 ? Math.round((watchCount / total) * 100) : 0 },
      { name: 'Critical Risk', value: criticalCount, color: '#ef4444', pct: total > 0 ? Math.round((criticalCount / total) * 100) : 0 }
    ];
  }, [analyticsMap]);

  const textColor = isDarkMode ? '#cbd5e1' : '#475569';
  const gridColor = isDarkMode ? '#334155' : '#f1f5f9';
  const tooltipStyle = {
    backgroundColor: isDarkMode ? '#0f172a' : '#ffffff',
    borderColor: isDarkMode ? '#334155' : '#e2e8f0',
    color: isDarkMode ? '#f8fafc' : '#0f172a',
    borderRadius: '10px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    fontSize: '11px',
    padding: '8px 12px'
  };

  const hasData = products && products.length > 0;

  const handleSelectView = (view: AnalyticsViewType) => {
    if (typeof onSelectView === 'function') {
      onSelectView(view);
    }
  };

  return (
    <div className="space-y-3">
      {/* Section Header with Clean Action Controls */}
      <div className="flex items-center justify-between flex-wrap gap-2 px-0.5">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800">
            <BarChart2 className="w-3.5 h-3.5" />
          </div>
          <div>
            <h2 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
              Analytics at a Glance
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 hidden sm:block">
              Visual category capital allocation, revenue contribution, and portfolio risk
            </p>
          </div>
        </div>

        {/* Quick Diagram Exploration Links */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => handleSelectView('category_dash')}
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750 transition-colors cursor-pointer"
          >
            <Tags className="w-3 h-3 text-teal-600 dark:text-teal-400" />
            <span>Categories</span>
          </button>
          <button
            type="button"
            onClick={() => handleSelectView('abc_analysis')}
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750 transition-colors cursor-pointer"
          >
            <PieIcon className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
            <span>ABC Matrix</span>
          </button>
          <button
            type="button"
            onClick={() => openDetailed('categories')}
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors cursor-pointer"
          >
            <Maximize2 className="w-3 h-3" />
            <span>Detailed Diagrams</span>
          </button>
        </div>
      </div>

      {/* 3-Column Balanced Desktop Chart Grid / Single Column Mobile */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {/* Card 1: Category Valuation */}
        <div className={`p-3.5 rounded-xl border flex flex-col justify-between ${
          isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
        } shadow-xs transition-all`}>
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <div className="p-1 rounded-md bg-teal-50 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400">
                <Tags className="w-3.5 h-3.5" />
              </div>
              <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate">
                Inventory Value by Top Categories
              </h3>
            </div>
            <button
              type="button"
              onClick={() => handleSelectView('category_dash')}
              className="text-[11px] font-semibold text-teal-600 dark:text-teal-400 hover:underline flex items-center gap-0.5 shrink-0 cursor-pointer"
            >
              <span>View</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          <div className="h-52 w-full flex items-center justify-center">
            {hasData && categoryData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categoryData} margin={{ top: 8, right: 8, left: -10, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                  <XAxis 
                    dataKey="category" 
                    stroke={textColor} 
                    fontSize={10} 
                    interval={0} 
                    angle={-20} 
                    textAnchor="end"
                    tick={{ fill: textColor }}
                  />
                  <YAxis 
                    stroke={textColor} 
                    fontSize={10} 
                    tickFormatter={(val) => (val != null && !isNaN(val)) ? `₹${(Number(val) / 1000).toFixed(0)}k` : ''}
                    tick={{ fill: textColor }}
                  />
                  <Tooltip
                    formatter={(value: any) => [`₹${Number(value).toLocaleString('en-IN')}`, 'Inventory Value']}
                    contentStyle={tooltipStyle}
                  />
                  <Bar dataKey="inventoryValue" fill="#0d9488" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-center p-4">
                <Layers className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-1.5" />
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                  No stock data available for category chart.
                </p>
              </div>
            )}
          </div>
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
            <span>Leading categories by cost</span>
            <span className="font-semibold text-slate-700 dark:text-slate-300">{categoryData.length} categories</span>
          </div>
        </div>

        {/* Card 2: ABC Matrix / Classification */}
        <div className={`p-3.5 rounded-xl border flex flex-col justify-between ${
          isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
        } shadow-xs transition-all`}>
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <div className="p-1 rounded-md bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
                <PieIcon className="w-3.5 h-3.5" />
              </div>
              <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate">
                ABC Revenue Classification
              </h3>
            </div>
            <button
              type="button"
              onClick={() => handleSelectView('abc_analysis')}
              className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-0.5 shrink-0 cursor-pointer"
            >
              <span>View</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          <div className="h-52 w-full flex items-center justify-center">
            {hasData ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={abcDistribution}
                    cx="50%"
                    cy="45%"
                    innerRadius={42}
                    outerRadius={68}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {abcDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: any) => [`${Number(value).toLocaleString('en-IN')} SKUs`, 'Product Count']}
                    contentStyle={tooltipStyle}
                  />
                  <Legend 
                    verticalAlign="bottom" 
                    height={28} 
                    wrapperStyle={{ fontSize: '10px', color: textColor }} 
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-center p-4">
                <PieIcon className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-1.5" />
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                  No ABC data available for this store.
                </p>
              </div>
            )}
          </div>
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
            <span>Pareto distribution</span>
            <span className="font-semibold text-slate-700 dark:text-slate-300">
              Class A: {abcDistribution[0]?.pct || 0}% items
            </span>
          </div>
        </div>

        {/* Card 3: Stock Health Condition */}
        <div className={`p-3.5 rounded-xl border flex flex-col justify-between ${
          isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
        } shadow-xs transition-all md:col-span-2 lg:col-span-1`}>
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <div className="p-1 rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
                <Activity className="w-3.5 h-3.5" />
              </div>
              <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate">
                Stock Health Condition
              </h3>
            </div>
            <button
              type="button"
              onClick={() => handleSelectView('ai_recommendations')}
              className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-0.5 shrink-0 cursor-pointer"
            >
              <span>Audit</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          <div className="h-52 w-full flex items-center justify-center">
            {hasData ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={healthDistribution}
                    cx="50%"
                    cy="45%"
                    innerRadius={42}
                    outerRadius={68}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {healthDistribution.map((entry, index) => (
                      <Cell key={`cell-health-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: any) => [`${Number(value).toLocaleString('en-IN')} SKUs`, 'SKUs in condition']}
                    contentStyle={tooltipStyle}
                  />
                  <Legend 
                    verticalAlign="bottom" 
                    height={28} 
                    wrapperStyle={{ fontSize: '10px', color: textColor }} 
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-center p-4">
                <Activity className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-1.5" />
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                  No health analysis available.
                </p>
              </div>
            )}
          </div>
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
            <span>Operational health condition</span>
            <span className="font-semibold text-emerald-600 dark:text-emerald-400">
              {healthDistribution[0]?.pct || 0}% Healthy
            </span>
          </div>
        </div>
      </div>

      {/* Detailed Modal for deep-dive exploration */}
      <DetailedDiagramsModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        products={products}
        analyticsMap={analyticsMap}
        initialTab={modalTab}
        onInspectProducts={onInspectProducts}
        isDarkMode={isDarkMode}
      />
    </div>
  );
}
