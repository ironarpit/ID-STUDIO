import { Product, StockVariation } from '../types';
import { normalizeLocalCode } from './barcodeResolver';
import {
  saveStockVariationsDB,
  getStockVariationsDB,
  deleteStockVariationDB
} from './indexedDB';

export type { StockVariation };

const STORAGE_KEY = 'bsm_stock_variations_v1';
export const STOCK_VARIATION_EVENT = 'bsm_stock_variations_changed';

// In-memory cache for synchronous reads
let memoryCache: Record<string, StockVariation> | null = null;
let isIndexedDBInitialized = false;

/**
 * Loads stock variations synchronously from cache / localStorage,
 * and asynchronously initializes / migrates from IndexedDB, merging with timestamp precedence.
 */
export function loadStockVariations(): Record<string, StockVariation> {
  if (memoryCache !== null) {
    return { ...memoryCache };
  }

  let fromLocal: Record<string, StockVariation> = {};
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        fromLocal = parsed;
      }
    }
  } catch (e) {
    console.warn('Failed to parse localStorage stock variations:', e);
  }

  memoryCache = fromLocal;

  // Asynchronously sync and migrate with IndexedDB in background
  if (!isIndexedDBInitialized && typeof window !== 'undefined') {
    isIndexedDBInitialized = true;
    initIndexedDBStockVariations(fromLocal);
  }

  return { ...memoryCache };
}

async function initIndexedDBStockVariations(initialLocalRecords: Record<string, StockVariation>) {
  try {
    const dbRecords = await getStockVariationsDB();
    const currentCache = memoryCache || initialLocalRecords;
    const merged: Record<string, StockVariation> = { ...dbRecords };

    const allKeys = new Set([...Object.keys(dbRecords), ...Object.keys(currentCache)]);
    for (const key of allKeys) {
      const cacheVar = currentCache[key];
      const dbVar = dbRecords[key];
      if (cacheVar && !dbVar) {
        merged[key] = cacheVar;
      } else if (!cacheVar && dbVar) {
        merged[key] = dbVar;
      } else if (cacheVar && dbVar) {
        const cacheTime = new Date(cacheVar.timestamp || 0).getTime();
        const dbTime = new Date(dbVar.timestamp || 0).getTime();
        merged[key] = cacheTime >= dbTime ? cacheVar : dbVar;
      }
    }

    memoryCache = merged;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    } catch {}
    await saveStockVariationsDB(merged);
    notifyStockVariationsChanged(merged);
  } catch (err) {
    console.warn('IndexedDB stock variations init warning:', err);
  }
}

/**
 * Dispatches a global event so all components, tables, and inspectors refresh immediately.
 */
export function notifyStockVariationsChanged(variations: Record<string, StockVariation>): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(STOCK_VARIATION_EVENT, { detail: variations })
    );
  }
}

/**
 * Synchronous and persistent save of the stock variations map.
 */
export function saveStockVariationsMap(variations: Record<string, StockVariation>): boolean {
  memoryCache = { ...variations };
  let localOk = false;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(variations));
    localOk = true;
  } catch (e) {
    console.error('Failed to save stock variations to localStorage:', e);
  }

  // Persist to IndexedDB asynchronously
  saveStockVariationsDB(variations).catch((err) => {
    console.error('Failed to persist stock variations to IndexedDB:', err);
  });

  notifyStockVariationsChanged(variations);
  return localOk;
}

/**
 * Returns a stable unique key for a product in the given store.
 */
export function getProductStockKey(p: Product): string {
  const code = (p.bansalCode || p.localCode || p.code || p.barcode || p.id || '').trim();
  return code;
}

/**
 * Extracts the true original imported system stock for a product,
 * guaranteeing it is NEVER corrupted by previous adjustments or calculations.
 */
export function getSystemStock(p: Product): number | null {
  if (p.systemStock !== undefined && p.systemStock !== null) {
    const n = Number(p.systemStock);
    return isNaN(n) ? null : n;
  }
  const rawStock = p.closingStock ?? p.stock ?? p.closingQty;
  if (rawStock !== undefined && rawStock !== null && String(rawStock).trim() !== '') {
    const n = Number(rawStock);
    return isNaN(n) ? null : n;
  }
  return null;
}

/**
 * Checks if a product's codes are duplicate between distinct products within the store catalog.
 */
export function checkDuplicateCodesInCatalog(p: Product, allProducts?: Product[]): boolean {
  if (!allProducts || allProducts.length <= 1) return false;
  const pId = p.id || '';
  const pBansal = (p.bansalCode || p.localCode || p.code || '').trim().toLowerCase();
  const pBarcode = (p.barcode || '').trim().toLowerCase();

  for (const item of allProducts) {
    if (item.id && pId && item.id.trim() === pId.trim()) continue;
    const iBansal = (item.bansalCode || item.localCode || item.code || '').trim().toLowerCase();
    const iBarcode = (item.barcode || '').trim().toLowerCase();

    if (pBansal && iBansal && pBansal === iBansal) {
      return true; // Duplicate code across distinct products detected!
    }
    if (pBarcode && iBarcode && pBarcode === iBarcode) {
      return true; // Duplicate barcode across distinct products detected!
    }
  }
  return false;
}

/**
 * Finds the variation record matching a product.
 * Verifies store identity, product key / identity, and flags reused codes for review.
 */
function normalizeStoreId(storeId?: string): string {
  const s = (storeId || 'store_1').trim().toLowerCase();
  if (s === 'patan' || s === 'store_1' || s === '') return 'store_1';
  return s;
}

/**
 * Finds the variation record matching a product.
 * Verifies store identity, product key / identity, and flags reused codes for review.
 */
export function getStockVariation(
  p: Product,
  variations: Record<string, StockVariation>,
  allProducts?: Product[]
): StockVariation | null {
  if (!p) return null;

  const pStore = normalizeStoreId(p.storeId);
  const key = getProductStockKey(p);
  let v = variations[key];

  if (!v) {
    // Secondary match by exact codes / normalized codes / productKey
    const pBansal = (p.bansalCode || p.localCode || p.code || '').trim().toLowerCase();
    const pBarcode = (p.barcode || '').trim().toLowerCase();
    const pNorm = normalizeLocalCode(p.bansalCode || p.localCode || p.code);

    for (const varItem of Object.values(variations)) {
      const vBansal = (varItem.bansalCode || varItem.localCode || '').trim().toLowerCase();
      const vBarcode = (varItem.barcode || '').trim().toLowerCase();
      const vNorm = normalizeLocalCode(varItem.bansalCode || varItem.localCode);
      if (
        (pNorm && vNorm && pNorm === vNorm) ||
        (pBansal && vBansal && pBansal === vBansal) ||
        (pBarcode && vBarcode && pBarcode === vBarcode) ||
        (p.id && varItem.productKey && p.id.trim() === varItem.productKey.trim())
      ) {
        v = varItem;
        break;
      }
    }
  }

  if (!v) return null;

  // Check store match
  const vStore = normalizeStoreId(v.storeId);
  if (vStore !== pStore) {
    return null;
  }

  // Check reused code / product identity mismatch (different product reusing old code)
  const isDuplicate = allProducts ? checkDuplicateCodesInCatalog(p, allProducts) : false;
  const hasIdentityConflict = Boolean(
    p.id && v.productKey && p.id.trim() !== v.productKey.trim()
  );
  const identityMatch = !hasIdentityConflict && (
    (p.id && v.productKey && p.id.trim() === v.productKey.trim()) ||
    ((p.bansalCode || p.localCode || p.code || '').trim().toLowerCase() === (v.bansalCode || v.localCode || '').trim().toLowerCase())
  );

  if (isDuplicate || hasIdentityConflict || !identityMatch) {
    return {
      ...v,
      status: 'needs_review',
      recountNeeded: false
    };
  }

  const sys = getSystemStock(p);
  const adjStock = sys !== null ? sys + v.adjustment : v.systemStock + v.adjustment;
  return {
    ...v,
    recountNeeded: adjStock < 0,
    status: 'active'
  };
}

/**
 * Calculates working adjusted stock:
 * Adjusted Stock = Latest Original System Stock + Saved Adjustment
 */
export function getAdjustedStock(
  p: Product,
  variations: Record<string, StockVariation>,
  allProducts?: Product[]
): number {
  const sysStock = getSystemStock(p);
  if (sysStock === null) return 0;
  const variation = getStockVariation(p, variations, allProducts);
  if (!variation || variation.status === 'needs_review') return sysStock;
  return sysStock + variation.adjustment;
}

/**
 * Determines variation status for a product.
 */
export function getVariationStatus(
  p: Product,
  variations: Record<string, StockVariation>,
  allProducts?: Product[]
): 'active' | 'missing_from_upload' | 'needs_review' | 'normal' {
  if (allProducts && checkDuplicateCodesInCatalog(p, allProducts)) {
    const key = getProductStockKey(p);
    if (variations[key]) return 'needs_review';
  }
  const variation = getStockVariation(p, variations, allProducts);
  if (!variation) return 'normal';
  return variation.status || 'active';
}

/**
 * Saves or updates a physical stock adjustment for a verified product with reliable IndexedDB awaiting.
 */
export async function upsertStockVariation(
  p: Product,
  physicalStock: number,
  remark?: string,
  storeId: string = 'PATAN',
  allProducts?: Product[]
): Promise<{ success: boolean; error?: string; variation?: StockVariation }> {
  if (!p) {
    return { success: false, error: 'Product is required.' };
  }

  const key = getProductStockKey(p);
  if (!key) {
    return { success: false, error: 'Product match is ambiguous: missing unique identifier or code.' };
  }

  if (allProducts && checkDuplicateCodesInCatalog(p, allProducts)) {
    return {
      success: false,
      error: 'Cannot apply adjustment: duplicate or reused code detected in current catalog. Resolve code conflict first.'
    };
  }

  const sysStock = getSystemStock(p);
  if (sysStock === null || isNaN(sysStock)) {
    return { success: false, error: 'Original system stock quantity is unavailable or invalid for this product.' };
  }

  if (typeof physicalStock !== 'number' || isNaN(physicalStock) || !isFinite(physicalStock)) {
    return { success: false, error: 'Physical count must be a valid finite number.' };
  }

  if (physicalStock < 0) {
    return { success: false, error: 'Physical count cannot be negative.' };
  }

  const adjustment = physicalStock - sysStock;

  if (adjustment === 0) {
    const delResult = await deleteStockVariation(p);
    if (!delResult.success) {
      return { success: false, error: delResult.error || 'Failed to remove adjustment from storage.' };
    }
    return { success: true };
  }

  const adjustedStock = sysStock + adjustment;
  const recountNeeded = adjustedStock < 0;
  const resolvedStoreId = normalizeStoreId(p.storeId || storeId);

  const variation: StockVariation = {
    id: `${resolvedStoreId}_${key}`,
    storeId: resolvedStoreId,
    productKey: p.id || key,
    bansalCode: p.bansalCode || p.code,
    localCode: p.localCode,
    barcode: p.barcode,
    productName: p.name || p.itemName || 'Product',
    systemStock: sysStock,
    physicalStock,
    adjustment,
    timestamp: new Date().toISOString(),
    remark: remark?.trim() || undefined,
    recountNeeded,
    status: 'active'
  };

  try {
    const variations = loadStockVariations();
    variations[key] = variation;

    // Await IndexedDB transaction completion reliably before reporting success
    await saveStockVariationsDB(variations);

    memoryCache = { ...variations };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(variations));
    } catch {}

    notifyStockVariationsChanged(variations);
    return { success: true, variation };
  } catch (err: any) {
    console.error('Failed to upsert stock variation:', err);
    return { success: false, error: err?.message || 'Storage failure: unable to persist adjustment to IndexedDB.' };
  }
}

/**
 * Removes an existing stock variation for a product, awaiting IndexedDB transaction completion.
 */
export async function deleteStockVariation(p: Product): Promise<{ success: boolean; error?: string }> {
  const key = getProductStockKey(p);
  if (!key) return { success: false, error: 'Product key not found.' };

  try {
    const variations = loadStockVariations();
    let found = false;

    if (variations[key]) {
      delete variations[key];
      found = true;
    }

    for (const [k, v] of Object.entries(variations)) {
      if (
        (p.bansalCode && v.bansalCode && p.bansalCode.trim() === v.bansalCode.trim()) ||
        (p.localCode && v.localCode && p.localCode.trim() === v.localCode.trim()) ||
        (p.barcode && v.barcode && p.barcode.trim() === v.barcode.trim()) ||
        (p.id && v.productKey && p.id.trim() === v.productKey.trim())
      ) {
        delete variations[k];
        found = true;
      }
    }

    if (found) {
      await saveStockVariationsDB(variations);
      memoryCache = { ...variations };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(variations));
      } catch {}
      deleteStockVariationDB(key).catch(() => {});
      notifyStockVariationsChanged(variations);
    }

    return { success: true };
  } catch (err: any) {
    console.error('Failed to delete stock variation:', err);
    return { success: false, error: err?.message || 'Storage failure while removing adjustment.' };
  }
}

/**
 * Enriches imported products with adjusted stock values while keeping original imported system quantities immutable,
 * preventing false duplicates when code and barcode are identical.
 */
export function enrichProductsWithVariations(
  products: Product[],
  variations: Record<string, StockVariation>
): Product[] {
  if (!products || products.length === 0) return [];

  const bansalProducts = new Map<string, Set<string>>();
  const barcodeProducts = new Map<string, Set<string>>();

  for (const p of products) {
    const pId = p.id || p.bansalCode || p.barcode || Math.random().toString();
    const bansal = (p.bansalCode || p.localCode || p.code || '').trim().toLowerCase();
    const barcode = (p.barcode || '').trim().toLowerCase();
    if (bansal) {
      if (!bansalProducts.has(bansal)) bansalProducts.set(bansal, new Set());
      bansalProducts.get(bansal)!.add(pId);
    }
    if (barcode) {
      if (!barcodeProducts.has(barcode)) barcodeProducts.set(barcode, new Set());
      barcodeProducts.get(barcode)!.add(pId);
    }
  }

  return products.map((p) => {
    const originalSystemStock = p.systemStock !== undefined && p.systemStock !== null
      ? Number(p.systemStock)
      : Number(p.stock ?? p.closingStock ?? p.closingQty ?? 0);

    const bansal = (p.bansalCode || p.localCode || p.code || '').trim().toLowerCase();
    const barcode = (p.barcode || '').trim().toLowerCase();
    
    const isDuplicate = 
      (bansal && bansalProducts.get(bansal) && bansalProducts.get(bansal)!.size > 1) ||
      (barcode && barcodeProducts.get(barcode) && barcodeProducts.get(barcode)!.size > 1);

    const variation = isDuplicate ? null : getStockVariation(p, variations, products);

    let adjusted = originalSystemStock;
    let enrichedVariation: StockVariation | undefined = undefined;

    if (variation && variation.status !== 'needs_review') {
      adjusted = originalSystemStock + variation.adjustment;
      enrichedVariation = {
        ...variation,
        recountNeeded: adjusted < 0
      };
    } else if (variation && variation.status === 'needs_review') {
      enrichedVariation = variation;
    }

    return {
      ...p,
      systemStock: originalSystemStock,
      stock: adjusted,
      closingStock: adjusted,
      closingQty: adjusted,
      stockVariation: enrichedVariation
    };
  });
}
