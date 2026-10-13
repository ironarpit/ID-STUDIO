import { Product } from '../types';

export interface StockVariation {
  id: string; // unique key storeId_productKey
  storeId: string;
  productKey: string; // stable identity (bansalCode || localCode || barcode || id)
  bansalCode?: string;
  localCode?: string;
  barcode?: string;
  productName: string;
  systemStock: number; // original system stock at count time
  physicalStock: number; // counted physical stock (floor + warehouse)
  adjustment: number; // physicalStock - systemStock
  timestamp: string; // ISO date string
  remark?: string;
}

const STORAGE_KEY = 'bsm_stock_variations_v1';

export function loadStockVariations(): Record<string, StockVariation> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (e) {
    console.error('Failed to load stock variations:', e);
    return {};
  }
}

export function saveStockVariationsMap(variations: Record<string, StockVariation>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(variations));
  } catch (e) {
    console.error('Failed to save stock variations:', e);
  }
}

export function getProductStockKey(p: Product): string {
  return (p.bansalCode || p.localCode || p.code || p.barcode || p.id || '').trim();
}

export function getSystemStock(p: Product): number {
  return Number(p.stock ?? p.closingStock ?? p.closingQty ?? 0);
}

export function getStockVariation(p: Product, variations: Record<string, StockVariation>): StockVariation | null {
  const key = getProductStockKey(p);
  if (!key) return null;
  if (variations[key]) return variations[key];

  for (const v of Object.values(variations)) {
    if (
      (p.bansalCode && v.bansalCode && p.bansalCode.trim() === v.bansalCode.trim()) ||
      (p.localCode && v.localCode && p.localCode.trim() === v.localCode.trim()) ||
      (p.barcode && v.barcode && p.barcode.trim() === v.barcode.trim()) ||
      (p.id && v.productKey && p.id.trim() === v.productKey.trim())
    ) {
      return v;
    }
  }
  return null;
}

export function getAdjustedStock(p: Product, variations: Record<string, StockVariation>): number {
  const sysStock = getSystemStock(p);
  const variation = getStockVariation(p, variations);
  if (!variation) return sysStock;
  return sysStock + variation.adjustment;
}

export function getVariationStatus(p: Product, variations: Record<string, StockVariation>): 'active' | 'missing_from_upload' | 'normal' {
  const variation = getStockVariation(p, variations);
  if (!variation) return 'normal';
  return 'active';
}

export function upsertStockVariation(
  p: Product,
  physicalStock: number,
  remark?: string,
  storeId: string = 'PATAN'
): { success: boolean; error?: string; variation?: StockVariation } {
  const key = getProductStockKey(p);
  if (!key) {
    return { success: false, error: 'Product match is ambiguous or missing unique identifier code.' };
  }
  const sysStock = getSystemStock(p);
  if (isNaN(sysStock) || sysStock === undefined || sysStock === null) {
    return { success: false, error: 'Original system stock is unavailable for this product.' };
  }
  if (isNaN(physicalStock) || physicalStock < 0) {
    return { success: false, error: 'Physical count must be a valid non-negative number.' };
  }

  const adjustment = physicalStock - sysStock;
  if (adjustment === 0) {
    deleteStockVariation(p);
    return { success: true };
  }

  const variation: StockVariation = {
    id: `${storeId}_${key}`,
    storeId,
    productKey: key,
    bansalCode: p.bansalCode || p.code,
    localCode: p.localCode,
    barcode: p.barcode,
    productName: p.name || p.itemName || 'Product',
    systemStock: sysStock,
    physicalStock,
    adjustment,
    timestamp: new Date().toISOString(),
    remark: remark?.trim() || undefined
  };

  const variations = loadStockVariations();
  variations[key] = variation;
  saveStockVariationsMap(variations);
  return { success: true, variation };
}

export function deleteStockVariation(p: Product): void {
  const key = getProductStockKey(p);
  if (!key) return;
  const variations = loadStockVariations();
  if (variations[key]) {
    delete variations[key];
    saveStockVariationsMap(variations);
  }
}

/**
 * Enriches a list of products with adjusted stock values, keeping original system stock immutable.
 */
export function enrichProductsWithVariations(
  products: Product[],
  variations: Record<string, StockVariation>
): Product[] {
  if (!products || products.length === 0) return [];
  return products.map((p) => {
    const sysStock = getSystemStock(p);
    const variation = getStockVariation(p, variations);
    const adjusted = variation ? sysStock + variation.adjustment : sysStock;
    return {
      ...p,
      stock: adjusted,
      closingStock: adjusted,
      closingQty: adjusted,
      systemStock: sysStock,
      stockVariation: variation || undefined
    };
  });
}
