import { Product, ComputedProductAnalytics, StockReportMeta } from '../types';

export function getProductBrand(p: Product): string {
  if (p.brand && p.brand.trim()) return p.brand.trim();
  if (p.rawRowData) {
    for (const key of Object.keys(p.rawRowData)) {
      const normKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (normKey === 'brand' || normKey === 'brandname' || normKey === 'company' || normKey === 'manufacturer') {
        const val = String(p.rawRowData[key]).trim();
        if (val) return val;
      }
    }
  }
  // Fallback: extract first word if uppercase / brand-like from name
  const nameParts = p.name.split(' ');
  if (nameParts[0] && nameParts[0].length >= 3 && nameParts[0] === nameParts[0].toUpperCase()) {
    return nameParts[0];
  }
  return 'Unbranded / Other';
}

export function parseDateToDaysAgo(dateStr?: string): number | null {
  if (!dateStr || !dateStr.trim()) return null;
  const str = dateStr.trim();
  
  let day: number, month: number, year: number;
  const parts = str.split(/[\/\-\.]/);
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      year = parseInt(parts[0], 10);
      month = parseInt(parts[1], 10) - 1;
      day = parseInt(parts[2], 10);
    } else {
      day = parseInt(parts[0], 10);
      month = parseInt(parts[1], 10) - 1;
      year = parseInt(parts[2], 10);
      if (year < 100) year += 2000;
    }
    const dateObj = new Date(year, month, day);
    if (!isNaN(dateObj.getTime())) {
      const now = new Date();
      const diffMs = now.getTime() - dateObj.getTime();
      return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
    }
  }
  return null;
}

export interface AbcResult {
  abcMap: Map<string, 'A' | 'B' | 'C'>;
  fallbackUsed: boolean;
  fallbackReason?: string;
}

// Compute ABC Analysis Map across all products
export function computeAbcMap(products: Product[]): AbcResult {
  const map = new Map<string, 'A' | 'B' | 'C'>();
  if (!products || products.length === 0) {
    return { abcMap: map, fallbackUsed: false };
  }

  // Primary: Rank by Sales Revenue Value
  const itemsWithRevenue = products.map((p) => ({
    id: p.id,
    revenue: (p.salesCount || 0) * (p.retailPrice || p.mrp || 0),
    salesQty: p.salesCount || 0,
    stockVal: (p.stock || 0) * (p.costPrice || p.retailPrice || p.mrp || 0)
  }));

  const totalRevenue = itemsWithRevenue.reduce((sum, i) => sum + i.revenue, 0);

  if (totalRevenue > 0) {
    itemsWithRevenue.sort((a, b) => b.revenue - a.revenue);
    let running = 0;
    for (const item of itemsWithRevenue) {
      running += item.revenue;
      const cumPct = running / totalRevenue;
      if (cumPct <= 0.70) {
        map.set(item.id, 'A');
      } else if (cumPct <= 0.90) {
        map.set(item.id, 'B');
      } else {
        map.set(item.id, 'C');
      }
    }
    return { abcMap: map, fallbackUsed: false };
  }

  // Fallback 1: Rank by Sales Quantity if sales revenue is zero
  const totalSalesQty = itemsWithRevenue.reduce((sum, i) => sum + i.salesQty, 0);
  if (totalSalesQty > 0) {
    itemsWithRevenue.sort((a, b) => b.salesQty - a.salesQty);
    let running = 0;
    for (const item of itemsWithRevenue) {
      running += item.salesQty;
      const cumPct = running / totalSalesQty;
      if (cumPct <= 0.70) {
        map.set(item.id, 'A');
      } else if (cumPct <= 0.90) {
        map.set(item.id, 'B');
      } else {
        map.set(item.id, 'C');
      }
    }
    return {
      abcMap: map,
      fallbackUsed: true,
      fallbackReason: 'Sales value unavailable. Ranked by Sales Quantity fallback.'
    };
  }

  // Fallback 2: Rank by Inventory Value if zero sales exist overall
  itemsWithRevenue.sort((a, b) => b.stockVal - a.stockVal);
  const totalStockVal = itemsWithRevenue.reduce((sum, i) => sum + i.stockVal, 0);
  let running = 0;
  for (const item of itemsWithRevenue) {
    running += item.stockVal;
    const cumPct = totalStockVal > 0 ? running / totalStockVal : 0;
    if (cumPct <= 0.70) {
      map.set(item.id, 'A');
    } else if (cumPct <= 0.90) {
      map.set(item.id, 'B');
    } else {
      map.set(item.id, 'C');
    }
  }

  return {
    abcMap: map,
    fallbackUsed: true,
    fallbackReason: 'Zero sales in report. Ranked by Inventory Stock Valuation fallback.'
  };
}

export interface ComputeAnalyticsOptions {
  lowStockDaysThreshold?: number; // default 7 days
  overstockDaysThreshold?: number; // default 60 days
}

export function computeAllProductAnalytics(
  products: Product[],
  reportMeta?: StockReportMeta | null,
  options?: ComputeAnalyticsOptions
): {
  analyticsMap: Map<string, ComputedProductAnalytics>;
  periodDays: number;
  periodIsAssumed: boolean;
  abcResult: AbcResult;
} {
  const analyticsMap = new Map<string, ComputedProductAnalytics>();
  if (!products || products.length === 0) {
    return {
      analyticsMap,
      periodDays: 30,
      periodIsAssumed: true,
      abcResult: { abcMap: new Map(), fallbackUsed: false }
    };
  }

  // 1. Determine Report Period Days
  let periodDays = 30;
  let periodIsAssumed = true;
  if (reportMeta?.reportDays && reportMeta.reportDays > 0) {
    periodDays = reportMeta.reportDays;
    periodIsAssumed = false;
  }

  const lowStockThreshold = options?.lowStockDaysThreshold ?? 7;
  const overstockThreshold = options?.overstockDaysThreshold ?? 60;

  // 2. Compute ABC Map
  const abcResult = computeAbcMap(products);

  // 3. Centralized Movement Classification across ACTIVE selling products
  const activeProducts = products.filter((p) => (p.salesCount || 0) > 0);
  const activeCount = activeProducts.length;

  const movementMap = new Map<string, 'fast' | 'slow' | 'dead' | 'zero_sales' | 'normal'>();

  if (activeCount > 0) {
    // Sort active products by salesCount descending
    const activeSortedDesc = [...activeProducts].sort((a, b) => (b.salesCount || 0) - (a.salesCount || 0));
    
    // Top 20% cutoff for Fast Moving
    const top20Count = Math.max(1, Math.ceil(activeCount * 0.20));
    const fastCutoffSales = activeSortedDesc[top20Count - 1].salesCount || 0;

    // Bottom 20% cutoff for Slow Moving
    const activeSortedAsc = [...activeProducts].sort((a, b) => (a.salesCount || 0) - (b.salesCount || 0));
    const bottom20Count = Math.max(1, Math.ceil(activeCount * 0.20));
    const slowCutoffSales = activeSortedAsc[bottom20Count - 1].salesCount || 0;

    for (const p of products) {
      const salesCount = p.salesCount || 0;
      const stock = p.stock || 0;

      if (salesCount === 0 && stock > 0) {
        movementMap.set(p.id, 'dead');
      } else if (salesCount === 0) {
        movementMap.set(p.id, 'zero_sales');
      } else if (salesCount >= fastCutoffSales && fastCutoffSales > 0) {
        movementMap.set(p.id, 'fast');
      } else if (salesCount <= slowCutoffSales && salesCount < fastCutoffSales) {
        movementMap.set(p.id, 'slow');
      } else {
        movementMap.set(p.id, 'normal');
      }
    }
  } else {
    // All products have 0 sales
    for (const p of products) {
      const stock = p.stock || 0;
      if (stock > 0) {
        movementMap.set(p.id, 'dead');
      } else {
        movementMap.set(p.id, 'zero_sales');
      }
    }
  }

  // 4. Calculate individual product metrics
  for (const p of products) {
    const retailPrice = p.retailPrice || p.mrp || 0;
    const costPrice = p.costPrice || 0;
    const stock = p.stock || 0;
    const salesCount = p.salesCount || 0;

    const inventoryValueCost = stock * (costPrice > 0 ? costPrice : retailPrice);
    const retailStockValue = stock * retailPrice;
    const inventoryValue = inventoryValueCost;
    const salesValue = salesCount * retailPrice;

    const avgDailySales = salesCount / periodDays;
    const daysCover = avgDailySales > 0 ? stock / avgDailySales : (stock > 0 ? 9999 : 0);
    const monthsOfStock = avgDailySales > 0 ? (stock / avgDailySales) / 30 : (stock > 0 ? 99 : 0);

    // Margin
    const marginAmount = retailPrice - costPrice;
    const marginPct = retailPrice > 0 ? (marginAmount / retailPrice) * 100 : 0;
    let marginStatus: 'negative' | 'low' | 'healthy' = 'healthy';
    if (costPrice > 0 && (retailPrice < costPrice || marginPct < 0)) {
      marginStatus = 'negative';
    } else if (costPrice > 0 && marginPct < 10) {
      marginStatus = 'low';
    }

    // Stock Ageing
    const stockAgeDays = parseDateToDaysAgo(p.lastPurchaseDate);
    let stockAgeGroup: '0-30' | '31-60' | '61-90' | '91-180' | '181-365' | '365+' | '180+' | 'Unknown' = 'Unknown';
    if (stockAgeDays !== null) {
      if (stockAgeDays <= 30) stockAgeGroup = '0-30';
      else if (stockAgeDays <= 60) stockAgeGroup = '31-60';
      else if (stockAgeDays <= 90) stockAgeGroup = '61-90';
      else if (stockAgeDays <= 180) stockAgeGroup = '91-180';
      else if (stockAgeDays <= 365) stockAgeGroup = '181-365';
      else stockAgeGroup = '365+';
    }

    // Movement Status
    const movementStatus = movementMap.get(p.id) || 'normal';

    // Stock Status
    let stockStatus: 'out_of_stock' | 'low_stock' | 'overstock' | 'normal' = 'normal';
    if (stock <= 0) {
      stockStatus = 'out_of_stock';
    } else if (daysCover <= lowStockThreshold || stock <= 5) {
      stockStatus = 'low_stock';
    } else if (daysCover > overstockThreshold) {
      stockStatus = 'overstock';
    }

    // Suggested Reorder Qty (Target 30 days stock based on avgDailySales, min 10)
    let suggestedReorder = 0;
    if (stockStatus === 'out_of_stock' || stockStatus === 'low_stock') {
      suggestedReorder = Math.max(10, Math.ceil(avgDailySales * 30) - stock);
    }

    // AI Recommendation
    let aiRecommendation = 'Stock level healthy. Maintain standard replenishment cycle.';
    if (stockStatus === 'out_of_stock') {
      aiRecommendation = 'Urgent replenishment required! Product is completely out of stock.';
    } else if (movementStatus === 'fast' && stockStatus === 'low_stock') {
      aiRecommendation = 'High demand SKU with low runway! Increase order quantity immediately.';
    } else if (movementStatus === 'dead') {
      aiRecommendation = 'Dead stock identified. Reposition to front shelf or bundle with promotional discount.';
    } else if (stockStatus === 'overstock') {
      aiRecommendation = 'Overstocked item. Do not reorder; launch bulk promotion to release capital.';
    } else if (movementStatus === 'slow') {
      aiRecommendation = 'Slow moving SKU. Audit pricing and reduce reorder batch size.';
    } else if (marginStatus === 'negative') {
      aiRecommendation = 'Negative margin detected! Review supplier purchase rate or adjust selling price.';
    } else if (stockAgeGroup === '365+' || stockAgeGroup === '181-365' || stockAgeGroup === '91-180') {
      aiRecommendation = 'Old inventory (>90 days). Priority clearance sale recommended.';
    }

    // Overall Health Status
    let healthStatus: 'healthy' | 'watch' | 'critical' = 'healthy';
    if (stockStatus === 'out_of_stock' || marginStatus === 'negative' || movementStatus === 'dead') {
      healthStatus = 'critical';
    } else if (
      stockStatus === 'low_stock' ||
      stockStatus === 'overstock' ||
      movementStatus === 'slow' ||
      marginStatus === 'low'
    ) {
      healthStatus = 'watch';
    }

    const abcCategory = abcResult.abcMap.get(p.id) || 'C';

    analyticsMap.set(p.id, {
      inventoryValue,
      inventoryValueCost,
      retailStockValue,
      salesValue,
      avgDailySales,
      daysCover,
      marginPct,
      marginAmount,
      marginStatus,
      stockAgeDays,
      stockAgeGroup,
      abcCategory,
      movementStatus,
      stockStatus,
      monthsOfStock,
      suggestedReorder,
      aiRecommendation,
      healthStatus
    });
  }

  return {
    analyticsMap,
    periodDays,
    periodIsAssumed,
    abcResult
  };
}

export interface RetailDashboardSummary {
  totalProducts: number;
  totalInventoryValue: number;
  totalRetailValue: number;
  totalStockQuantity: number;
  totalSalesValue: number;
  totalSalesQuantity: number;
  fastMovingCount: number;
  slowMovingCount: number;
  deadStockCount: number;
  zeroSalesCount: number;
  lowStockCount: number;
  overstockCount: number;
  outOfStockCount: number;
  categoriesCount: number;
  brandsCount: number;
  suppliersCount: number;
}

export function computeDashboardSummary(
  products: Product[] = [],
  analyticsMap?: Map<string, ComputedProductAnalytics>
): RetailDashboardSummary {
  const safeProducts = Array.isArray(products) ? products : [];
  const safeAnalyticsMap = analyticsMap instanceof Map ? analyticsMap : new Map<string, ComputedProductAnalytics>();

  let totalInventoryValue = 0;
  let totalRetailValue = 0;
  let totalStockQuantity = 0;
  let totalSalesValue = 0;
  let totalSalesQuantity = 0;

  let fastMovingCount = 0;
  let slowMovingCount = 0;
  let deadStockCount = 0;
  let zeroSalesCount = 0;
  let lowStockCount = 0;
  let overstockCount = 0;
  let outOfStockCount = 0;

  const categories = new Set<string>();
  const brands = new Set<string>();
  const suppliers = new Set<string>();

  for (let i = 0; i < safeProducts.length; i++) {
    const p = safeProducts[i];
    if (!p) continue;
    const calc = safeAnalyticsMap.get(p.id);

    totalStockQuantity += p.stock || 0;
    totalSalesQuantity += p.salesCount || 0;

    if (p.category) categories.add(p.category);
    const brand = getProductBrand(p);
    if (brand) brands.add(brand);
    if (p.supplierName) suppliers.add(p.supplierName);

    if (calc) {
      totalInventoryValue += calc.inventoryValueCost || 0;
      totalRetailValue += calc.retailStockValue || 0;
      totalSalesValue += calc.salesValue || 0;

      if (calc.movementStatus === 'fast') fastMovingCount++;
      if (calc.movementStatus === 'slow') slowMovingCount++;
      if (calc.movementStatus === 'dead') deadStockCount++;
      if (calc.movementStatus === 'zero_sales' || (p.salesCount || 0) === 0) zeroSalesCount++;

      if (calc.stockStatus === 'low_stock') lowStockCount++;
      if (calc.stockStatus === 'overstock') overstockCount++;
      if (calc.stockStatus === 'out_of_stock') outOfStockCount++;
    }
  }

  return {
    totalProducts: safeProducts.length,
    totalInventoryValue,
    totalRetailValue,
    totalStockQuantity,
    totalSalesValue,
    totalSalesQuantity,
    fastMovingCount,
    slowMovingCount,
    deadStockCount,
    zeroSalesCount,
    lowStockCount,
    overstockCount,
    outOfStockCount,
    categoriesCount: categories.size,
    brandsCount: brands.size,
    suppliersCount: suppliers.size
  };
}

export interface CategorySummary {
  category: string;
  productCount: number;
  closingStock: number;
  salesQuantity: number;
  inventoryValue: number; // Cost Value
  retailValue: number;    // Retail Value
  salesValue: number;
  margin: number;
  fastMovers: number;
  slowMovers: number;
  zeroSales: number;
  deadStock: number;
  overstock: number;
  lowStock: number;
  outOfStock: number;
  zeroSalesValue: number;
  deadStockValue: number;
  overstockValue: number;
  healthStatus: 'healthy' | 'attention' | 'risk';
  products: Product[];
}

export function computeCategorySummaries(
  products: Product[] = [],
  analyticsMap?: Map<string, ComputedProductAnalytics>
): CategorySummary[] {
  const safeProducts = Array.isArray(products) ? products : [];
  const safeAnalyticsMap = analyticsMap instanceof Map ? analyticsMap : new Map<string, ComputedProductAnalytics>();
  const map = new Map<string, CategorySummary>();

  for (const p of safeProducts) {
    if (!p) continue;
    const cat = (p.category && p.category.trim()) ? p.category.trim() : 'Unknown / Not Available';
    const calc = safeAnalyticsMap.get(p.id);
    if (!map.has(cat)) {
      map.set(cat, {
        category: cat,
        productCount: 0,
        closingStock: 0,
        salesQuantity: 0,
        inventoryValue: 0,
        retailValue: 0,
        salesValue: 0,
        margin: 0,
        fastMovers: 0,
        slowMovers: 0,
        zeroSales: 0,
        deadStock: 0,
        overstock: 0,
        lowStock: 0,
        outOfStock: 0,
        zeroSalesValue: 0,
        deadStockValue: 0,
        overstockValue: 0,
        healthStatus: 'healthy',
        products: []
      });
    }

    const item = map.get(cat)!;
    item.productCount++;
    item.closingStock += p.stock || 0;
    item.salesQuantity += p.salesCount || 0;
    item.products.push(p);

    if (calc) {
      const costVal = calc.inventoryValueCost || 0;
      item.inventoryValue += costVal;
      item.retailValue += calc.retailStockValue || 0;
      item.salesValue += calc.salesValue || 0;

      if (calc.movementStatus === 'fast') item.fastMovers++;
      if (calc.movementStatus === 'slow') item.slowMovers++;
      if (calc.movementStatus === 'dead') {
        item.deadStock++;
        item.deadStockValue += costVal;
      }
      if ((p.salesCount || 0) === 0) {
        item.zeroSales++;
        item.zeroSalesValue += costVal;
      }

      if (calc.stockStatus === 'low_stock') item.lowStock++;
      if (calc.stockStatus === 'overstock') {
        item.overstock++;
        item.overstockValue += costVal;
      }
      if (calc.stockStatus === 'out_of_stock') item.outOfStock++;
    }
  }

  // Calculate Category Health & Margin
  for (const item of map.values()) {
    item.margin = item.retailValue > 0 ? Math.max(0, ((item.retailValue - item.inventoryValue) / item.retailValue) * 100) : 0;
    if (item.deadStock > 0 || (item.productCount > 0 && item.outOfStock / item.productCount > 0.25) || (item.inventoryValue > 0 && item.deadStockValue / item.inventoryValue > 0.3)) {
      item.healthStatus = 'risk';
    } else if (item.slowMovers > 0 || item.lowStock > 0 || item.zeroSales > 0 || item.overstock > 0) {
      item.healthStatus = 'attention';
    } else {
      item.healthStatus = 'healthy';
    }
  }

  return Array.from(map.values()).sort((a, b) => b.inventoryValue - a.inventoryValue);
}

export interface BrandSummary {
  brand: string;
  productCount: number;
  closingStock: number;
  salesQuantity: number;
  inventoryValue: number; // Cost Value
  retailValue: number;    // Retail Value
  salesValue: number;
  margin: number;
  fastMovers: number;
  slowMovers: number;
  zeroSales: number;
  deadStock: number;
  overstock: number;
  lowStock: number;
  outOfStock: number;
  zeroSalesValue: number;
  deadStockValue: number;
  overstockValue: number;
  products: Product[];
}

export function computeBrandSummaries(
  products: Product[] = [],
  analyticsMap?: Map<string, ComputedProductAnalytics>
): BrandSummary[] {
  const safeProducts = Array.isArray(products) ? products : [];
  const safeAnalyticsMap = analyticsMap instanceof Map ? analyticsMap : new Map<string, ComputedProductAnalytics>();
  const map = new Map<string, BrandSummary>();

  for (const p of safeProducts) {
    if (!p) continue;
    const brand = getProductBrand(p) || 'Unknown / Not Available';
    const calc = safeAnalyticsMap.get(p.id);
    if (!map.has(brand)) {
      map.set(brand, {
        brand,
        productCount: 0,
        closingStock: 0,
        salesQuantity: 0,
        inventoryValue: 0,
        retailValue: 0,
        salesValue: 0,
        margin: 0,
        fastMovers: 0,
        slowMovers: 0,
        zeroSales: 0,
        deadStock: 0,
        overstock: 0,
        lowStock: 0,
        outOfStock: 0,
        zeroSalesValue: 0,
        deadStockValue: 0,
        overstockValue: 0,
        products: []
      });
    }

    const item = map.get(brand)!;
    item.productCount++;
    item.closingStock += p.stock || 0;
    item.salesQuantity += p.salesCount || 0;
    item.products.push(p);

    if (calc) {
      const costVal = calc.inventoryValueCost || 0;
      item.inventoryValue += costVal;
      item.retailValue += calc.retailStockValue || 0;
      item.salesValue += calc.salesValue || 0;

      if (calc.movementStatus === 'fast') item.fastMovers++;
      if (calc.movementStatus === 'slow') item.slowMovers++;
      if (calc.movementStatus === 'dead') {
        item.deadStock++;
        item.deadStockValue += costVal;
      }
      if ((p.salesCount || 0) === 0) {
        item.zeroSales++;
        item.zeroSalesValue += costVal;
      }

      if (calc.stockStatus === 'low_stock') item.lowStock++;
      if (calc.stockStatus === 'overstock') {
        item.overstock++;
        item.overstockValue += costVal;
      }
      if (calc.stockStatus === 'out_of_stock') item.outOfStock++;
    }
  }

  for (const item of map.values()) {
    item.margin = item.retailValue > 0 ? Math.max(0, ((item.retailValue - item.inventoryValue) / item.retailValue) * 100) : 0;
  }

  return Array.from(map.values()).sort((a, b) => b.inventoryValue - a.inventoryValue);
}

export interface SupplierSummary {
  supplierName: string;
  productCount: number;
  closingStock: number;
  salesQuantity: number;
  inventoryValue: number; // Cost Value
  retailValue: number;    // Retail Value
  salesValue: number;
  fastMovers: number;
  slowMovers: number;
  zeroSales: number;
  deadStock: number;
  overstock: number;
  lowStock: number;
  outOfStock: number;
  zeroSalesValue: number;
  deadStockValue: number;
  overstockValue: number;
  replenishmentCount: number;
  criticalReplenishmentCount: number;
  highPriorityReplenishmentCount: number;
  recommendedUnits: number;
  estimatedPurchaseValue: number;
  products: Product[];
}

export function computeSupplierSummaries(
  products: Product[] = [],
  analyticsMap?: Map<string, ComputedProductAnalytics>
): SupplierSummary[] {
  const safeProducts = Array.isArray(products) ? products : [];
  const safeAnalyticsMap = analyticsMap instanceof Map ? analyticsMap : new Map<string, ComputedProductAnalytics>();
  const map = new Map<string, SupplierSummary>();

  for (const p of safeProducts) {
    if (!p) continue;
    const supplier = (p.supplierName && p.supplierName.trim()) ? p.supplierName.trim() : 'Unknown / Not Available';
    const calc = safeAnalyticsMap.get(p.id);
    if (!map.has(supplier)) {
      map.set(supplier, {
        supplierName: supplier,
        productCount: 0,
        closingStock: 0,
        salesQuantity: 0,
        inventoryValue: 0,
        retailValue: 0,
        salesValue: 0,
        fastMovers: 0,
        slowMovers: 0,
        zeroSales: 0,
        deadStock: 0,
        overstock: 0,
        lowStock: 0,
        outOfStock: 0,
        zeroSalesValue: 0,
        deadStockValue: 0,
        overstockValue: 0,
        replenishmentCount: 0,
        criticalReplenishmentCount: 0,
        highPriorityReplenishmentCount: 0,
        recommendedUnits: 0,
        estimatedPurchaseValue: 0,
        products: []
      });
    }

    const item = map.get(supplier)!;
    item.productCount++;
    item.closingStock += p.stock || 0;
    item.salesQuantity += p.salesCount || 0;
    item.products.push(p);

    if (calc) {
      const costVal = calc.inventoryValueCost || 0;
      const unitCost = p.costPrice ?? (p.retailPrice ? p.retailPrice * 0.8 : (p.mrp ? p.mrp * 0.8 : 0));
      item.inventoryValue += costVal;
      item.retailValue += calc.retailStockValue || 0;
      item.salesValue += calc.salesValue || 0;

      if (calc.movementStatus === 'fast') item.fastMovers++;
      if (calc.movementStatus === 'slow') item.slowMovers++;
      if (calc.movementStatus === 'dead') {
        item.deadStock++;
        item.deadStockValue += costVal;
      }
      if ((p.salesCount || 0) === 0) {
        item.zeroSales++;
        item.zeroSalesValue += costVal;
      }

      if (calc.stockStatus === 'low_stock') item.lowStock++;
      if (calc.stockStatus === 'overstock') {
        item.overstock++;
        item.overstockValue += costVal;
      }
      if (calc.stockStatus === 'out_of_stock') item.outOfStock++;

      // Replenishment logic
      if (calc.suggestedReorder > 0 || calc.stockStatus === 'low_stock' || calc.stockStatus === 'out_of_stock') {
        item.replenishmentCount++;
        const reorderUnits = calc.suggestedReorder > 0 ? calc.suggestedReorder : (p.salesCount || 10);
        item.recommendedUnits += reorderUnits;
        item.estimatedPurchaseValue += reorderUnits * unitCost;

        if (calc.stockStatus === 'out_of_stock' && (p.salesCount || 0) > 0) {
          item.criticalReplenishmentCount++;
        } else if (calc.stockStatus === 'low_stock' || calc.movementStatus === 'fast') {
          item.highPriorityReplenishmentCount++;
        }
      }
    }
  }

  return Array.from(map.values()).sort((a, b) => b.inventoryValue - a.inventoryValue);
}

// ----------------------------------------------------
// NEW MODULE 6 MANAGEMENT DASHBOARD CALCULATION HELPERS
// ----------------------------------------------------

export interface WorkingCapitalSummary {
  totalInventoryValue: number;
  deadStockValue: number;
  slowMovingValue: number;
  overstockValue: number;
  healthyStockValue: number;
}

export function computeWorkingCapitalSummary(
  products: Product[] = [],
  analyticsMap?: Map<string, ComputedProductAnalytics>
): WorkingCapitalSummary {
  const safeProducts = Array.isArray(products) ? products : [];
  const safeAnalyticsMap = analyticsMap instanceof Map ? analyticsMap : new Map<string, ComputedProductAnalytics>();

  let totalInventoryValue = 0;
  let deadStockValue = 0;
  let slowMovingValue = 0;
  let overstockValue = 0;
  let healthyStockValue = 0;

  for (const p of safeProducts) {
    if (!p) continue;
    const calc = safeAnalyticsMap.get(p.id);
    if (!calc) continue;

    const val = calc.inventoryValueCost || 0;
    totalInventoryValue += val;

    if (calc.movementStatus === 'dead') {
      deadStockValue += val;
    } else if (calc.movementStatus === 'slow') {
      slowMovingValue += val;
    } else if (calc.stockStatus === 'overstock') {
      overstockValue += val;
    } else {
      healthyStockValue += val;
    }
  }

  return {
    totalInventoryValue,
    deadStockValue,
    slowMovingValue,
    overstockValue,
    healthyStockValue
  };
}

export interface AttentionItem {
  id: string;
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'NORMAL';
  title: string;
  description: string;
  count: number;
  totalValue: number;
  products: Product[];
  viewTarget: string;
  badgeColor: string;
}

export function computeAttentionItems(
  products: Product[] = [],
  analyticsMap?: Map<string, ComputedProductAnalytics>
): AttentionItem[] {
  const safeProducts = Array.isArray(products) ? products : [];
  const safeAnalyticsMap = analyticsMap instanceof Map ? analyticsMap : new Map<string, ComputedProductAnalytics>();

  const oosFastMoving: Product[] = [];
  const lowStockFastMoving: Product[] = [];
  const highValDeadStock: Product[] = [];
  const negativeMargin: Product[] = [];
  const highValOverstock: Product[] = [];
  const slowMovingHighStock: Product[] = [];
  const mrpAnomalies: Product[] = [];
  const missingData: Product[] = [];

  for (const p of safeProducts) {
    if (!p) continue;
    const calc = safeAnalyticsMap.get(p.id);
    if (!calc) continue;

    const val = calc.inventoryValueCost || 0;

    // 🔴 Out of Stock + Fast Moving
    if (calc.stockStatus === 'out_of_stock' && calc.movementStatus === 'fast') {
      oosFastMoving.push(p);
    }
    // 🔴 Fast Moving + Low Stock
    else if (calc.stockStatus === 'low_stock' && calc.movementStatus === 'fast') {
      lowStockFastMoving.push(p);
    }

    // 🔴 High Value Dead Stock
    if (calc.movementStatus === 'dead' && val >= 500) {
      highValDeadStock.push(p);
    }

    // 🔴 Negative Margin
    if (calc.marginStatus === 'negative' || (p.costPrice && p.retailPrice < p.costPrice)) {
      negativeMargin.push(p);
    }

    // 🟠 High Value Overstock
    if (calc.stockStatus === 'overstock' && val >= 1000) {
      highValOverstock.push(p);
    }

    // 🟠 Slow Moving + High Stock
    if (calc.movementStatus === 'slow' && p.stock >= 10) {
      slowMovingHighStock.push(p);
    }

    // 🟡 Retail Price higher than MRP anomaly
    if (p.mrp > 0 && p.retailPrice > p.mrp) {
      mrpAnomalies.push(p);
    }

    // 🟡 Missing key product data
    if (!p.category || p.category === 'General' || !p.costPrice || !p.supplierName) {
      missingData.push(p);
    }
  }

  const items: AttentionItem[] = [];

  if (oosFastMoving.length > 0) {
    items.push({
      id: 'oos_fast',
      priority: 'CRITICAL',
      title: 'Out of Stock + Fast Moving',
      description: 'High-demand SKUs currently out of stock, causing immediate revenue loss.',
      count: oosFastMoving.length,
      totalValue: oosFastMoving.reduce((sum, p) => sum + ((p.salesCount || 0) * (p.retailPrice || p.mrp || 0)), 0),
      products: oosFastMoving,
      viewTarget: 'out_of_stock',
      badgeColor: 'bg-rose-600 text-white'
    });
  }

  if (lowStockFastMoving.length > 0) {
    items.push({
      id: 'low_fast',
      priority: 'HIGH',
      title: 'Fast Moving + Low Stock',
      description: 'Top velocity SKUs nearing stockout within less than 7 days.',
      count: lowStockFastMoving.length,
      totalValue: lowStockFastMoving.reduce((sum, p) => sum + (safeAnalyticsMap.get(p.id)?.inventoryValueCost || 0), 0),
      products: lowStockFastMoving,
      viewTarget: 'low_stock',
      badgeColor: 'bg-rose-500 text-white'
    });
  }

  if (highValDeadStock.length > 0) {
    items.push({
      id: 'dead_high_val',
      priority: 'HIGH',
      title: 'High-Value Dead Stock',
      description: 'Items with significant tied-up capital and zero sales activity.',
      count: highValDeadStock.length,
      totalValue: highValDeadStock.reduce((sum, p) => sum + (safeAnalyticsMap.get(p.id)?.inventoryValueCost || 0), 0),
      products: highValDeadStock,
      viewTarget: 'dead_stock',
      badgeColor: 'bg-amber-600 text-white'
    });
  }

  if (negativeMargin.length > 0) {
    items.push({
      id: 'negative_margin',
      priority: 'HIGH',
      title: 'Negative Profit Margin',
      description: 'Selling price is lower than cost price, incurring direct per-unit loss.',
      count: negativeMargin.length,
      totalValue: negativeMargin.reduce((sum, p) => sum + (safeAnalyticsMap.get(p.id)?.inventoryValueCost || 0), 0),
      products: negativeMargin,
      viewTarget: 'margin_analysis',
      badgeColor: 'bg-rose-600 text-white'
    });
  }

  if (highValOverstock.length > 0) {
    items.push({
      id: 'high_overstock',
      priority: 'MEDIUM',
      title: 'High-Value Overstock',
      description: 'Excess stock cover exceeding 60 days, locking capital unnecessarily.',
      count: highValOverstock.length,
      totalValue: highValOverstock.reduce((sum, p) => sum + (safeAnalyticsMap.get(p.id)?.inventoryValueCost || 0), 0),
      products: highValOverstock,
      viewTarget: 'overstock',
      badgeColor: 'bg-amber-500 text-white'
    });
  }

  if (slowMovingHighStock.length > 0) {
    items.push({
      id: 'slow_high_stock',
      priority: 'MEDIUM',
      title: 'Slow Moving + High Stock',
      description: 'High unit stock sitting on slow-turning products.',
      count: slowMovingHighStock.length,
      totalValue: slowMovingHighStock.reduce((sum, p) => sum + (safeAnalyticsMap.get(p.id)?.inventoryValueCost || 0), 0),
      products: slowMovingHighStock,
      viewTarget: 'slow_moving',
      badgeColor: 'bg-amber-400 text-slate-900'
    });
  }

  if (mrpAnomalies.length > 0) {
    items.push({
      id: 'mrp_anomaly',
      priority: 'LOW',
      title: 'Retail Price > MRP Anomaly',
      description: 'Retail price set higher than Maximum Retail Price (MRP).',
      count: mrpAnomalies.length,
      totalValue: mrpAnomalies.reduce((sum, p) => sum + (safeAnalyticsMap.get(p.id)?.inventoryValueCost || 0), 0),
      products: mrpAnomalies,
      viewTarget: 'all_products',
      badgeColor: 'bg-blue-500 text-white'
    });
  }

  if (missingData.length > 0) {
    items.push({
      id: 'missing_data',
      priority: 'LOW',
      title: 'Missing Important Product Data',
      description: 'SKUs missing category, cost price, or supplier metadata.',
      count: missingData.length,
      totalValue: 0,
      products: missingData,
      viewTarget: 'all_products',
      badgeColor: 'bg-slate-500 text-white'
    });
  }

  return items;
}

export interface StockRiskProduct {
  product: Product;
  sales: number;
  stock: number;
  avgDailySales: number;
  daysCover: number;
  riskType: string;
  urgency: 'CRITICAL' | 'HIGH' | 'MEDIUM';
}

export function computeStockRiskProducts(
  products: Product[],
  analyticsMap: Map<string, ComputedProductAnalytics>
): StockRiskProduct[] {
  const risks: StockRiskProduct[] = [];

  for (const p of products) {
    const calc = analyticsMap.get(p.id);
    if (!calc) continue;

    const sales = p.salesCount || 0;
    const stock = p.stock || 0;
    const avgDailySales = calc.avgDailySales;
    const daysCover = calc.daysCover;

    if (stock <= 0 && sales > 0) {
      risks.push({
        product: p,
        sales,
        stock,
        avgDailySales,
        daysCover: 0,
        riskType: 'Out of Stock + Active Sales',
        urgency: 'CRITICAL'
      });
    } else if (stock <= 5 && sales > 0) {
      risks.push({
        product: p,
        sales,
        stock,
        avgDailySales,
        daysCover,
        riskType: 'Low Stock + High Sales',
        urgency: 'HIGH'
      });
    } else if (daysCover > 0 && daysCover < 7 && sales > 0) {
      risks.push({
        product: p,
        sales,
        stock,
        avgDailySales,
        daysCover,
        riskType: 'Low Days Cover (<7 Days)',
        urgency: 'HIGH'
      });
    } else if (calc.movementStatus === 'fast' && stock <= 10) {
      risks.push({
        product: p,
        sales,
        stock,
        avgDailySales,
        daysCover,
        riskType: 'Fast Moving + Low Stock',
        urgency: 'HIGH'
      });
    }
  }

  return risks.sort((a, b) => a.daysCover - b.daysCover);
}

export interface SalesVsInventoryQuadrant {
  name: string;
  description: string;
  count: number;
  totalInventoryValue: number;
  totalSalesValue: number;
  products: Product[];
  badgeColor: string;
}

export function computeSalesVsInventoryMatrix(
  products: Product[] = [],
  analyticsMap?: Map<string, ComputedProductAnalytics>
): {
  q1: SalesVsInventoryQuadrant;
  q2: SalesVsInventoryQuadrant;
  q3: SalesVsInventoryQuadrant;
  q4: SalesVsInventoryQuadrant;
} {
  const safeProducts = Array.isArray(products) ? products : [];
  const safeAnalyticsMap = analyticsMap instanceof Map ? analyticsMap : new Map<string, ComputedProductAnalytics>();

  const q1Prods: Product[] = [];
  const q2Prods: Product[] = [];
  const q3Prods: Product[] = [];
  const q4Prods: Product[] = [];

  let totalSales = 0;
  let totalVal = 0;
  for (const p of safeProducts) {
    if (!p) continue;
    totalSales += p.salesCount || 0;
    const calc = safeAnalyticsMap.get(p.id);
    if (calc) totalVal += calc.inventoryValueCost || 0;
  }
  const avgSales = safeProducts.length > 0 ? totalSales / safeProducts.length : 1;
  const avgVal = safeProducts.length > 0 ? totalVal / safeProducts.length : 100;

  for (const p of safeProducts) {
    if (!p) continue;
    const calc = safeAnalyticsMap.get(p.id);
    const sales = p.salesCount || 0;
    const val = calc ? (calc.inventoryValueCost || 0) : 0;

    const isHighSales = sales >= avgSales || calc?.movementStatus === 'fast';
    const isHighVal = val >= avgVal || calc?.stockStatus === 'overstock';

    if (isHighSales && !isHighVal) {
      q1Prods.push(p);
    } else if (isHighSales && isHighVal) {
      q2Prods.push(p);
    } else if (!isHighSales && isHighVal) {
      q3Prods.push(p);
    } else {
      q4Prods.push(p);
    }
  }

  const calcSum = (prods: Product[]) => {
    let invVal = 0;
    let salesVal = 0;
    for (const p of prods) {
      if (!p) continue;
      const calc = safeAnalyticsMap.get(p.id);
      if (calc) {
        invVal += calc.inventoryValueCost || 0;
        salesVal += calc.salesValue || 0;
      }
    }
    return { invVal, salesVal };
  };

  const q1Sum = calcSum(q1Prods);
  const q2Sum = calcSum(q2Prods);
  const q3Sum = calcSum(q3Prods);
  const q4Sum = calcSum(q4Prods);

  return {
    q1: {
      name: 'High Sales + Low Inventory',
      description: 'High demand, low runway. Immediate replenishment priority.',
      count: q1Prods.length,
      totalInventoryValue: q1Sum.invVal,
      totalSalesValue: q1Sum.salesVal,
      products: q1Prods,
      badgeColor: 'border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300'
    },
    q2: {
      name: 'High Sales + High Inventory',
      description: 'Healthy high turnover. Well-stocked core revenue drivers.',
      count: q2Prods.length,
      totalInventoryValue: q2Sum.invVal,
      totalSalesValue: q2Sum.salesVal,
      products: q2Prods,
      badgeColor: 'border-blue-500 bg-blue-50 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300'
    },
    q3: {
      name: 'Low Sales + High Inventory',
      description: 'Capital tied up in sluggish stock. High overstock risk.',
      count: q3Prods.length,
      totalInventoryValue: q3Sum.invVal,
      totalSalesValue: q3Sum.salesVal,
      products: q3Prods,
      badgeColor: 'border-rose-500 bg-rose-50 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300'
    },
    q4: {
      name: 'Low Sales + Low Inventory',
      description: 'Low velocity, low stock. Minimal risk / potential exit candidates.',
      count: q4Prods.length,
      totalInventoryValue: q4Sum.invVal,
      totalSalesValue: q4Sum.salesVal,
      products: q4Prods,
      badgeColor: 'border-slate-300 bg-slate-50 text-slate-700 dark:bg-slate-900 dark:text-slate-300'
    }
  };
}

export interface AbcTierSummary {
  category: 'A' | 'B' | 'C';
  label: string;
  count: number;
  salesValue: number;
  inventoryValue: number;
  products: Product[];
}

export function computeAbcSummary(
  products: Product[] = [],
  analyticsMap?: Map<string, ComputedProductAnalytics>
): {
  tierA: AbcTierSummary;
  tierB: AbcTierSummary;
  tierC: AbcTierSummary;
} {
  const safeProducts = Array.isArray(products) ? products : [];
  const safeAnalyticsMap = analyticsMap instanceof Map ? analyticsMap : new Map<string, ComputedProductAnalytics>();

  const aProds: Product[] = [];
  const bProds: Product[] = [];
  const cProds: Product[] = [];

  for (const p of safeProducts) {
    if (!p) continue;
    const calc = safeAnalyticsMap.get(p.id);
    const cat = calc ? calc.abcCategory : 'C';
    if (cat === 'A') aProds.push(p);
    else if (cat === 'B') bProds.push(p);
    else cProds.push(p);
  }

  const calcSum = (prods: Product[]) => {
    let salesVal = 0;
    let invVal = 0;
    for (const p of prods) {
      if (!p) continue;
      const calc = safeAnalyticsMap.get(p.id);
      if (calc) {
        salesVal += calc.salesValue || 0;
        invVal += calc.inventoryValueCost || 0;
      }
    }
    return { salesVal, invVal };
  };

  const aSum = calcSum(aProds);
  const bSum = calcSum(bProds);
  const cSum = calcSum(cProds);

  return {
    tierA: {
      category: 'A',
      label: 'Class A (Top 70% Revenue)',
      count: aProds.length,
      salesValue: aSum.salesVal,
      inventoryValue: aSum.invVal,
      products: aProds
    },
    tierB: {
      category: 'B',
      label: 'Class B (Next 20% Revenue)',
      count: bProds.length,
      salesValue: bSum.salesVal,
      inventoryValue: bSum.invVal,
      products: bProds
    },
    tierC: {
      category: 'C',
      label: 'Class C (Remaining 10% Revenue)',
      count: cProds.length,
      salesValue: cSum.salesVal,
      inventoryValue: cSum.invVal,
      products: cProds
    }
  };
}

export interface ActionableRecommendation {
  id: string;
  title: string;
  text: string;
  impactType: 'warning' | 'critical' | 'info' | 'success';
  count: number;
  value: number;
  viewTarget: string;
  products: Product[];
}

export function computeActionableRecommendations(
  products: Product[] = [],
  analyticsMap?: Map<string, ComputedProductAnalytics>
): ActionableRecommendation[] {
  const safeProducts = Array.isArray(products) ? products : [];
  const safeAnalyticsMap = analyticsMap instanceof Map ? analyticsMap : new Map<string, ComputedProductAnalytics>();
  const recs: ActionableRecommendation[] = [];

  // 1. Fast moving with low days cover
  const fastLowDays = safeProducts.filter((p) => {
    if (!p) return false;
    const calc = safeAnalyticsMap.get(p.id);
    return calc && calc.movementStatus === 'fast' && calc.daysCover <= 3;
  });
  if (fastLowDays.length > 0) {
    recs.push({
      id: 'rec_fast_low_days',
      title: 'Fast-Moving Stockout Risk',
      text: `${fastLowDays.length} fast-moving products have less than 3 days of stock remaining. Reorder immediately.`,
      impactType: 'critical',
      count: fastLowDays.length,
      value: fastLowDays.reduce((sum, p) => sum + (safeAnalyticsMap.get(p.id)?.inventoryValueCost || 0), 0),
      viewTarget: 'low_stock',
      products: fastLowDays
    });
  }

  // 2. Capital locked in Zero Sales
  const zeroSalesProds = safeProducts.filter((p) => p && (p.salesCount || 0) === 0 && p.stock > 0);
  const zeroSalesValue = zeroSalesProds.reduce(
    (sum, p) => sum + (safeAnalyticsMap.get(p.id)?.inventoryValueCost || 0),
    0
  );
  if (zeroSalesProds.length > 0) {
    recs.push({
      id: 'rec_zero_sales_capital',
      title: 'Capital Locked in Unsold Inventory',
      text: `₹${zeroSalesValue.toLocaleString('en-IN')} is currently tied up in ${zeroSalesProds.length} zero-sales inventory items. Consider bundle promotions or shelf repositioning.`,
      impactType: 'warning',
      count: zeroSalesProds.length,
      value: zeroSalesValue,
      viewTarget: 'zero_sales',
      products: zeroSalesProds
    });
  }

  // 3. Out of stock with past sales
  const oosPastSales = safeProducts.filter((p) => p && p.stock <= 0 && (p.salesCount || 0) > 0);
  if (oosPastSales.length > 0) {
    recs.push({
      id: 'rec_oos_past_sales',
      title: 'Out of Stock High Demand SKUs',
      text: `${oosPastSales.length} products are completely out of stock despite having active customer sales history.`,
      impactType: 'critical',
      count: oosPastSales.length,
      value: 0,
      viewTarget: 'out_of_stock',
      products: oosPastSales
    });
  }

  // 4. Overstock Value
  const overstockProds = safeProducts.filter((p) => {
    if (!p) return false;
    const calc = safeAnalyticsMap.get(p.id);
    return calc && calc.stockStatus === 'overstock';
  });
  const overstockValue = overstockProds.reduce(
    (sum, p) => sum + (safeAnalyticsMap.get(p.id)?.inventoryValueCost || 0),
    0
  );
  if (overstockProds.length > 0) {
    recs.push({
      id: 'rec_overstock_value',
      title: 'Excess Inventory Cover (>60 Days)',
      text: `₹${overstockValue.toLocaleString('en-IN')} of inventory across ${overstockProds.length} SKUs is classified as overstock. Pause future purchase orders.`,
      impactType: 'warning',
      count: overstockProds.length,
      value: overstockValue,
      viewTarget: 'overstock',
      products: overstockProds
    });
  }

  // 5. Negative Margin SKUs
  const negMarginProds = safeProducts.filter((p) => {
    if (!p) return false;
    const calc = safeAnalyticsMap.get(p.id);
    return calc && (calc.marginStatus === 'negative' || (p.costPrice && p.retailPrice < p.costPrice));
  });
  if (negMarginProds.length > 0) {
    recs.push({
      id: 'rec_negative_margin',
      title: 'Negative Margin Detection',
      text: `${negMarginProds.length} SKUs are priced below purchase cost price, generating loss on every sale.`,
      impactType: 'critical',
      count: negMarginProds.length,
      value: 0,
      viewTarget: 'margin_analysis',
      products: negMarginProds
    });
  }

  return recs;
}

