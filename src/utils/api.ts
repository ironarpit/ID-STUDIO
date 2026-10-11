import {
  Product,
  StockReportMeta,
  UploadProgressData,
  UploadStage,
  BarcodeMasterStatus,
  BarcodeMasterItem,
  BarcodeMasterActivationResult,
  BarcodeMasterProgressData,
  BarcodeMasterUploadStage,
  FocusMaster,
  FocusType,
  FocusProductItem
} from '../types';
import {
  saveProductsDB,
  getProductsDB,
  saveMetaDB,
  getMetaDB,
  clearStoreDB,
  saveBarcodeMasterDB,
  getBarcodeMasterStatusDB,
  getBarcodeMasterMappingsDB,
  saveAuditSessionDB,
  getAuditSessionDB,
  getAllAuditSessionsDB,
  saveAuditResultsDB,
  saveSingleAuditResultDB,
  getAuditResultsBySessionDB,
  deleteAuditSessionDB,
  saveFocusMasterDB,
  getFocusMasterDB,
  getAllFocusMastersDB,
  deleteFocusMasterDB,
  saveFocusCheckDB,
  getFocusCheckDB,
  getAllFocusChecksDB,
  deleteFocusCheckDB
} from './indexedDB';

// ==========================================
// 100% PERSONAL OFFLINE BSM IQ ENGINE
// ZERO Cloudflare Worker calls
// ZERO D1 reads / writes
// ZERO Cloud login / auth calls
// ZERO Background polling
// ==========================================

export const OFFLINE_MODE = true;
export const WORKER_BASE_URL = '';

// ==========================================
// 1. STORE METADATA & VERSION TYPES
// ==========================================

export interface StoreInfo {
  id: string;
  name: string;
  active: boolean;
  lastUploadedAt: string | null;
  lastFileName: string | null;
  productCount: number;
  stockVersion: number;
  syncStatus: 'synced' | 'pending' | 'failed' | 'idle';
}

export interface StockVersionResponse {
  success: boolean;
  storeId: string;
  version?: number;
  fingerprint?: string;
  lastUpdated: string | null;
  productCount?: number;
  totalProducts?: number;
  active?: boolean;
  isCleared?: boolean;
  stores?: any[];
}

export interface ServerStockResponse {
  success: boolean;
  storeId?: string;
  products: Product[];
  meta: StockReportMeta | null;
  lastUpdated: string | null;
  version?: number;
  fingerprint?: string;
}

export async function fetchStoresList(): Promise<StoreInfo[]> {
  try {
    const products = await getProductsDB('store_1');
    const meta = await getMetaDB('store_1');
    return [
      {
        id: 'store_1',
        name: 'Store 1',
        active: true,
        lastUploadedAt: meta?.uploadedAt || null,
        lastFileName: meta?.fileName || null,
        productCount: products.length,
        stockVersion: 1,
        syncStatus: 'synced'
      }
    ];
  } catch {
    return [
      {
        id: 'store_1',
        name: 'Store 1',
        active: true,
        lastUploadedAt: null,
        lastFileName: null,
        productCount: 0,
        stockVersion: 1,
        syncStatus: 'synced'
      }
    ];
  }
}

// ==========================================
// 3. STOCK IQ: LOCAL VERSION & FULL PRODUCTS
// ==========================================

export async function fetchStockVersion(storeId: string = 'store_1'): Promise<StockVersionResponse> {
  const products = await getProductsDB(storeId);
  const meta = await getMetaDB(storeId);
  const versionStr = localStorage.getItem(`stockscan_version_${storeId}`);
  const version = versionStr ? Number(versionStr) || Date.now() : 1;

  return {
    success: true,
    storeId,
    version,
    productCount: products.length,
    totalProducts: products.length,
    lastUpdated: meta?.uploadedAt || null,
    active: true
  };
}

export async function fetchServerStock(storeId: string = 'store_1'): Promise<ServerStockResponse> {
  const products = await getProductsDB(storeId);
  const meta = await getMetaDB(storeId);
  const versionStr = localStorage.getItem(`stockscan_version_${storeId}`);
  const version = versionStr ? Number(versionStr) || 1 : 1;

  return {
    success: true,
    storeId,
    products,
    meta,
    lastUpdated: meta?.uploadedAt || null,
    version
  };
}

// ==========================================
// 4. BATCH STOCK UPLOAD (LOCAL INDEXEDDB)
// ==========================================

export async function uploadServerStock(
  products: Product[],
  meta: StockReportMeta,
  storeId: string = 'store_1',
  onProgress?: (progress: UploadProgressData) => void,
  _fallbackToLocal?: boolean
): Promise<{ success: boolean; message: string; totalProducts: number; lastUpdated: string; version: number; storeId: string }> {
  const totalProducts = products.length;

  const reportProgress = (stage: UploadStage, percent: number) => {
    if (onProgress) {
      onProgress({
        stage,
        percent: Math.min(100, Math.max(0, percent)),
        chunksUploaded: 1,
        totalChunks: 1,
        batchUploaded: 1,
        totalBatches: 1,
        productsProcessed: Math.min(totalProducts, Math.round((percent / 100) * totalProducts)),
        totalProducts
      });
    }
  };

  reportProgress('Reading File', 25);
  await new Promise(r => setTimeout(r, 40));

  reportProgress('Validating Products', 50);
  await new Promise(r => setTimeout(r, 40));

  reportProgress('Preparing Data', 75);
  // Save directly to local IndexedDB
  await saveProductsDB(products, storeId);
  await saveMetaDB(meta, storeId);

  const now = new Date().toISOString();
  const version = Date.now();
  localStorage.setItem(`stockscan_version_${storeId}`, String(version));

  reportProgress('Saving to Device', 90);
  await new Promise(r => setTimeout(r, 30));

  reportProgress('Complete', 100);

  return {
    success: true,
    message: `Successfully loaded and saved ${products.length} products to local IndexedDB.`,
    totalProducts: products.length,
    lastUpdated: now,
    version,
    storeId
  };
}

// ==========================================
// 5. STOCK ITEM UPDATES & DELETION
// ==========================================

export async function updateServerStockItem(
  productId: string,
  newStock: number,
  storeId: string = 'store_1'
): Promise<{ success: boolean; updatedProduct: Product; storeId: string; version: number }> {
  const products = await getProductsDB(storeId);
  const index = products.findIndex(p => p.id === productId || p.bansalCode === productId || p.code === productId);
  let updatedProduct: Product;

  if (index >= 0) {
    products[index] = {
      ...products[index],
      stock: newStock,
      closingQty: newStock
    };
    updatedProduct = products[index];
    await saveProductsDB(products, storeId);
  } else {
    updatedProduct = {
      id: productId,
      bansalCode: productId,
      barcode: '',
      name: 'Updated Product',
      category: 'General',
      mrp: 0,
      costPrice: 0,
      retailPrice: 0,
      stock: newStock,
      salesCount: 0,
      unit: 'PCS'
    };
  }

  const version = Date.now();
  localStorage.setItem(`stockscan_version_${storeId}`, String(version));

  return {
    success: true,
    updatedProduct,
    storeId,
    version
  };
}

export async function deleteServerStockItems(
  productIds: string | string[],
  storeId: string = 'store_1'
): Promise<{ success: boolean; message: string }> {
  const codes = Array.isArray(productIds) ? productIds : [productIds];
  const set = new Set(codes);
  const products = await getProductsDB(storeId);
  const remaining = products.filter(p => !set.has(p.id) && !set.has(p.bansalCode || '') && !set.has(p.code || ''));
  
  await saveProductsDB(remaining, storeId);
  const meta = await getMetaDB(storeId);
  if (meta) {
    await saveMetaDB({
      ...meta,
      totalProducts: remaining.length
    }, storeId);
  }

  return {
    success: true,
    message: `Successfully deleted ${codes.length} product(s) from local storage.`
  };
}

export async function clearServerStock(
  storeId: string = 'store_1'
): Promise<{ success: boolean; message: string }> {
  await clearStoreDB(storeId);
  localStorage.removeItem(`stockscan_version_${storeId}`);
  return {
    success: true,
    message: 'Stock data successfully cleared from local IndexedDB.'
  };
}

export async function toggleStoreActive(
  storeId: string
): Promise<StoreInfo[]> {
  return fetchStoresList();
}

// ==========================================
// 6. FLOOR IQ API ENDPOINTS (LOCAL INDEXEDDB)
// ==========================================

export async function fetchServerAuditSessions(storeId: string = 'store_1'): Promise<any[]> {
  return getAllAuditSessionsDB(storeId);
}

export async function fetchServerAuditSession(sessionId: string, _storeId?: string): Promise<{ session: any; results: any[] } | null> {
  const session = await getAuditSessionDB(sessionId);
  if (!session) return null;
  const results = await getAuditResultsBySessionDB(sessionId);
  return { session, results };
}

export async function fetchServerAuditResults(auditId: string): Promise<any[]> {
  return getAuditResultsBySessionDB(auditId);
}

export async function saveServerAuditSession(session: any, results?: any[]): Promise<boolean> {
  try {
    await saveAuditSessionDB(session);
    if (results && results.length > 0) {
      await saveAuditResultsDB(results);
    }
    return true;
  } catch {
    return false;
  }
}

export async function saveServerAuditResult(result: any, sessionUpdates?: any): Promise<boolean> {
  try {
    await saveSingleAuditResultDB(result);
    if (sessionUpdates && sessionUpdates.id) {
      const existing = await getAuditSessionDB(sessionUpdates.id);
      if (existing) {
        await saveAuditSessionDB({ ...existing, ...sessionUpdates });
      }
    }
    return true;
  } catch {
    return false;
  }
}

export async function saveServerAuditResultsBatch(
  _sessionId: string,
  _storeId: string,
  results: any[],
  sessionUpdates?: any
): Promise<boolean> {
  try {
    await saveAuditResultsDB(results);
    if (sessionUpdates && sessionUpdates.id) {
      const existing = await getAuditSessionDB(sessionUpdates.id);
      if (existing) {
        await saveAuditSessionDB({ ...existing, ...sessionUpdates });
      }
    }
    return true;
  } catch {
    return false;
  }
}

export async function resolveServerFlaggedItem(
  resultId: string,
  _storeId: string,
  resolutionRemark?: string,
  auditId?: string,
  _bansalCode?: string
): Promise<boolean> {
  try {
    if (auditId) {
      const results = await getAuditResultsBySessionDB(auditId);
      const target = results.find(r => r.id === resultId);
      if (target) {
        target.status = 'resolved';
        target.resolutionRemark = resolutionRemark;
        target.resolvedAt = new Date().toISOString();
        await saveSingleAuditResultDB(target);
      }
    }
    return true;
  } catch {
    return false;
  }
}

export async function deleteServerAuditSession(sessionId: string, _storeId?: string): Promise<boolean> {
  try {
    await deleteAuditSessionDB(sessionId);
    return true;
  } catch {
    return false;
  }
}

// ==========================================
// 7. FOCUS IQ API ENDPOINTS (LOCAL INDEXEDDB)
// ==========================================

export interface FocusMasterUploadItem {
  bansalCode: string;
  category: string;
  itemName: string;
  focusMrp: number;
  offerText: string;
}

export interface FocusMasterUploadPayload {
  focusType: 'core' | 'non_core';
  month: number;
  year: number;
  filename: string;
  items: FocusMasterUploadItem[];
}

export interface FocusMasterUploadResult {
  success: boolean;
  data?: any;
  error?: string;
}

export async function uploadFocusMasterServer(master: any): Promise<FocusMasterUploadResult> {
  try {
    await saveFocusMasterDB(master);
    return { success: true, data: master };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to save Focus Master locally' };
  }
}

export async function fetchFocusMastersServer(storeId: string = 'store_1', focusType: string): Promise<FocusMaster[]> {
  const list = await getAllFocusMastersDB(storeId);
  return list.filter(m => m.type === focusType);
}

export async function fetchActiveFocusMasterServer(storeId: string = 'store_1', focusType: string): Promise<FocusMaster | null> {
  const list = await getAllFocusMastersDB(storeId);
  const matching = list.filter(m => m.type === focusType);
  return matching.find(m => m.isActive) || matching[0] || null;
}

export async function deleteFocusMasterServer(masterId: string): Promise<boolean> {
  try {
    await deleteFocusMasterDB(masterId);
    return true;
  } catch {
    return false;
  }
}

export async function startFocusCheckServer(session: any): Promise<boolean> {
  try {
    await saveFocusCheckDB(session);
    return true;
  } catch {
    return false;
  }
}

export async function saveFocusCheckResultServer(
  _sessionId: string,
  _code: string,
  _result: any,
  sessionUpdates?: any
): Promise<boolean> {
  try {
    if (sessionUpdates && sessionUpdates.id) {
      await saveFocusCheckDB(sessionUpdates);
    }
    return true;
  } catch {
    return false;
  }
}

export async function completeFocusCheckServer(sessionId: string, sessionUpdates?: any): Promise<boolean> {
  try {
    const existing = await getFocusCheckDB(sessionId);
    if (existing) {
      await saveFocusCheckDB({ ...existing, ...sessionUpdates, status: 'completed' });
    } else if (sessionUpdates) {
      await saveFocusCheckDB(sessionUpdates);
    }
    return true;
  } catch {
    return false;
  }
}

export async function fetchFocusChecksServer(): Promise<any[]> {
  return getAllFocusChecksDB('store_1');
}

export async function fetchFocusCheckDetailsServer(sessionId: string): Promise<any | null> {
  return getFocusCheckDB(sessionId);
}

export async function resolveFocusIssueServer(sessionId: string, code: string, resolutionRemark: string): Promise<boolean> {
  try {
    const session = await getFocusCheckDB(sessionId);
    if (session && session.results && session.results[code]) {
      session.results[code].isResolved = true;
      session.results[code].resolutionRemark = resolutionRemark;
      session.results[code].resolvedAt = new Date().toISOString();
      await saveFocusCheckDB(session);
    }
    return true;
  } catch {
    return false;
  }
}

export async function deleteFocusCheckServer(sessionId: string): Promise<boolean> {
  try {
    await deleteFocusCheckDB(sessionId);
    return true;
  } catch {
    return false;
  }
}

// ==========================================
// 8. BARCODE MASTER API (LOCAL INDEXEDDB)
// ==========================================

export async function fetchBarcodeMasterStatus(): Promise<BarcodeMasterStatus | null> {
  return getBarcodeMasterStatusDB();
}

export async function uploadBarcodeMaster(
  finalMappings: BarcodeMasterItem[],
  filename: string,
  onProgress?: (progress: BarcodeMasterProgressData) => void,
  precomputedRejectedRows: number = 0
): Promise<BarcodeMasterActivationResult> {
  const seenPairs = new Set<string>();
  const validatedMappings: BarcodeMasterItem[] = [];
  
  for (const item of finalMappings) {
    const code = String(item.code || '').trim();
    let ean = String(item.ean || '').trim();
    ean = ean.replace(/\.0+$/, '');
    ean = ean.replace(/\s+/g, '');
    if (!code || !ean) continue;
    const pairKey = `${code}|${ean}`;
    if (seenPairs.has(pairKey)) continue;
    seenPairs.add(pairKey);
    validatedMappings.push({
      code,
      itemName: String(item.itemName || '').trim(),
      uom: String(item.uom || '').trim(),
      ean
    });
  }

  const totalMappings = validatedMappings.length;
  const updateProgress = (stage: BarcodeMasterUploadStage, percent: number) => {
    if (onProgress) {
      onProgress({
        stage,
        percent,
        uploadedItems: totalMappings,
        totalItems: totalMappings,
        currentBatch: 1,
        totalBatches: 1
      });
    }
  };

  updateProgress('Preparing Mappings', 25);
  await new Promise(r => setTimeout(r, 40));

  updateProgress('Saving to Device', 60);
  const uniqueLocalCodes = new Set(validatedMappings.map(i => i.code)).size;
  const uniqueBarcodes = new Set(validatedMappings.map(i => i.ean)).size;
  const now = new Date().toISOString();
  const version = `local_bm_${Date.now()}`;

  const status: BarcodeMasterStatus = {
    status: 'Active',
    filename: filename || 'Barcode Master',
    totalMappings,
    uniqueLocalCodes,
    uniqueBarcodes,
    multiBarcodeCodes: 0,
    conflictingBarcodes: 0,
    rejectedRows: precomputedRejectedRows,
    uploadedDate: now,
    activatedDate: now,
    version
  };

  await saveBarcodeMasterDB(status, validatedMappings);

  updateProgress('Activating Master', 90);
  await new Promise(r => setTimeout(r, 30));

  updateProgress('Complete', 100);

  return {
    totalMappings,
    uniqueLocalCodes,
    uniqueBarcodes,
    multiBarcodeCodes: 0,
    conflictingBarcodes: 0,
    rejectedRows: precomputedRejectedRows,
    version,
    message: 'Barcode Master Saved Locally in IndexedDB'
  };
}

export async function cleanupBarcodeMasterUpload(_version: string): Promise<void> {
  // Local no-op
}
