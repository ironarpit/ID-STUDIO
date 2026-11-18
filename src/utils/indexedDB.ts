import { Product, StockReportMeta, ScanHistoryItem, AuditSession, AuditProductResult, FocusMaster, PhysicalFocusCheckSession, BarcodeMasterItem, BarcodeMasterStatus, NearExpiryBatch, NearExpiryItem, BarcodeOverride, StockVariation, PurchaseResponsibilityMeta, PurchaseResponsibilityRecord } from '../types';

export const DB_NAME = 'BSMIQOfflineOnlyDB_v1';
export const DB_VERSION = 16;
export const IDB_BLOCKED_EVENT = 'bsm_idb_upgrade_blocked';
export const IDB_VERSIONCHANGE_EVENT = 'bsm_idb_versionchange';
export const BLOCKED_UPGRADE_MESSAGE =
  'Database upgrade is blocked by another open ID Studio tab or window. Please close or reload all other ID Studio tabs, then try again.';

const STORE_PRODUCTS = 'products';
const STORE_META = 'meta';
const STORE_HISTORY = 'history';
export const STORE_AUDIT_SESSIONS = 'audit_sessions';
export const STORE_AUDIT_RESULTS = 'audit_results';
export const STORE_FOCUS_MASTERS = 'focus_masters';
export const STORE_FOCUS_CHECKS = 'focus_checks';
export const STORE_BARCODE_MASTER = 'barcode_master';
export const STORE_BARCODE_MAPPINGS = 'barcode_mappings';
export const STORE_NEAR_EXPIRY_BATCHES = 'near_expiry_batches';
export const STORE_NEAR_EXPIRY_ITEMS = 'near_expiry_items';
export const STORE_BARCODE_OVERRIDES = 'barcode_overrides';
export const STORE_STOCK_VARIATIONS = 'stock_variations';
export const STORE_PURCHASE_MASTER = 'purchase_responsibility_master';
export const STORE_PURCHASE_RECORDS = 'purchase_responsibility_records';

let cachedDBPromise: Promise<IDBDatabase> | null = null;
const activeConnections = new Set<IDBDatabase>();

function closeAllActiveConnections(): void {
  for (const conn of activeConnections) {
    try {
      conn.close();
    } catch {
      // Ignore close errors
    }
  }
  activeConnections.clear();
  cachedDBPromise = null;
}

/**
 * Closes any cached IndexedDB connection held by the current tab (useful on versionchange or tests).
 */
export function closeCachedDBConnection(): void {
  closeAllActiveConnections();
}

function ensureIndexIfAbsent(store: IDBObjectStore | null | undefined, indexName: string, keyPath: string): void {
  if (!store) return;
  if (!store.indexNames.contains(indexName)) {
    store.createIndex(indexName, keyPath, { unique: false });
  }
}

/**
 * Idempotently creates missing object stores and indexes without deleting or altering existing data.
 */
export function ensureObjectStoresAndIndexes(db: IDBDatabase, transaction: IDBTransaction | null): void {
  if (!db.objectStoreNames.contains(STORE_PRODUCTS)) {
    db.createObjectStore(STORE_PRODUCTS, { keyPath: 'id' });
  }
  if (!db.objectStoreNames.contains(STORE_META)) {
    db.createObjectStore(STORE_META);
  }
  if (!db.objectStoreNames.contains(STORE_HISTORY)) {
    db.createObjectStore(STORE_HISTORY, { keyPath: 'id' });
  }
  if (!db.objectStoreNames.contains(STORE_AUDIT_SESSIONS)) {
    db.createObjectStore(STORE_AUDIT_SESSIONS, { keyPath: 'id' });
  }
  if (!db.objectStoreNames.contains(STORE_AUDIT_RESULTS)) {
    db.createObjectStore(STORE_AUDIT_RESULTS, { keyPath: 'id' });
  }
  if (!db.objectStoreNames.contains(STORE_FOCUS_MASTERS)) {
    db.createObjectStore(STORE_FOCUS_MASTERS, { keyPath: 'id' });
  }
  if (!db.objectStoreNames.contains(STORE_FOCUS_CHECKS)) {
    db.createObjectStore(STORE_FOCUS_CHECKS, { keyPath: 'id' });
  }
  if (!db.objectStoreNames.contains(STORE_BARCODE_MASTER)) {
    db.createObjectStore(STORE_BARCODE_MASTER);
  }

  let barcodeMappingsStore: IDBObjectStore | null = null;
  if (!db.objectStoreNames.contains(STORE_BARCODE_MAPPINGS)) {
    barcodeMappingsStore = db.createObjectStore(STORE_BARCODE_MAPPINGS, { keyPath: 'id' });
  } else if (transaction) {
    barcodeMappingsStore = transaction.objectStore(STORE_BARCODE_MAPPINGS);
  }
  ensureIndexIfAbsent(barcodeMappingsStore, 'code', 'code');
  ensureIndexIfAbsent(barcodeMappingsStore, 'ean', 'ean');

  if (!db.objectStoreNames.contains(STORE_NEAR_EXPIRY_BATCHES)) {
    db.createObjectStore(STORE_NEAR_EXPIRY_BATCHES, { keyPath: 'id' });
  }

  let nearExpiryItemsStore: IDBObjectStore | null = null;
  if (!db.objectStoreNames.contains(STORE_NEAR_EXPIRY_ITEMS)) {
    nearExpiryItemsStore = db.createObjectStore(STORE_NEAR_EXPIRY_ITEMS, { keyPath: 'id' });
  } else if (transaction) {
    nearExpiryItemsStore = transaction.objectStore(STORE_NEAR_EXPIRY_ITEMS);
  }
  ensureIndexIfAbsent(nearExpiryItemsStore, 'batchId', 'batchId');
  ensureIndexIfAbsent(nearExpiryItemsStore, 'bansalCode', 'bansalCode');
  ensureIndexIfAbsent(nearExpiryItemsStore, 'barcode', 'barcode');
  ensureIndexIfAbsent(nearExpiryItemsStore, 'status', 'status');

  if (!db.objectStoreNames.contains(STORE_BARCODE_OVERRIDES)) {
    db.createObjectStore(STORE_BARCODE_OVERRIDES, { keyPath: 'scannedBarcode' });
  }
  if (!db.objectStoreNames.contains(STORE_STOCK_VARIATIONS)) {
    db.createObjectStore(STORE_STOCK_VARIATIONS, { keyPath: 'id' });
  }

  // Purchase Responsibility stores: create only if absent, preserve existing records/indexes
  if (!db.objectStoreNames.contains(STORE_PURCHASE_MASTER)) {
    db.createObjectStore(STORE_PURCHASE_MASTER);
  }

  let purchaseRecordsStore: IDBObjectStore | null = null;
  if (!db.objectStoreNames.contains(STORE_PURCHASE_RECORDS)) {
    purchaseRecordsStore = db.createObjectStore(STORE_PURCHASE_RECORDS, { keyPath: 'id' });
  } else if (transaction) {
    purchaseRecordsStore = transaction.objectStore(STORE_PURCHASE_RECORDS);
  }
  ensureIndexIfAbsent(purchaseRecordsStore, 'bansalCode', 'bansalCode');
}

export function openDB(): Promise<IDBDatabase> {
  if (cachedDBPromise) {
    return cachedDBPromise;
  }

  cachedDBPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      cachedDBPromise = null;
      reject(new Error('IndexedDB is not supported in this browser environment.'));
      return;
    }

    let settled = false;
    let blockedTimer: ReturnType<typeof setTimeout> | null = null;

    const cleanupTimer = () => {
      if (blockedTimer !== null) {
        clearTimeout(blockedTimer);
        blockedTimer = null;
      }
    };

    // Close any lingering connections in this tab before opening/upgrading
    for (const conn of activeConnections) {
      try {
        conn.close();
      } catch {
        // Ignore close errors
      }
    }
    activeConnections.clear();

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      ensureObjectStoresAndIndexes(db, request.transaction);
    };

    request.onblocked = () => {
      closeAllActiveConnections();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent(IDB_BLOCKED_EVENT, {
            detail: { message: BLOCKED_UPGRADE_MESSAGE },
          })
        );
      }
      if (!settled && blockedTimer === null) {
        blockedTimer = setTimeout(() => {
          if (!settled) {
            settled = true;
            cachedDBPromise = null;
            reject(new Error(BLOCKED_UPGRADE_MESSAGE));
          }
        }, 3500);
      }
    };

    request.onsuccess = () => {
      cleanupTimer();
      const db = request.result;
      activeConnections.add(db);

      db.onversionchange = () => {
        closeAllActiveConnections();
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent(IDB_VERSIONCHANGE_EVENT));
        }
      };

      db.onclose = () => {
        activeConnections.delete(db);
        cachedDBPromise = null;
      };

      if (!settled) {
        settled = true;
        resolve(db);
      } else {
        // If rejected earlier by blocked timeout, do not leak an orphaned connection
        try {
          db.close();
        } catch {
          // Ignore
        }
        activeConnections.delete(db);
      }
    };

    request.onerror = () => {
      cleanupTimer();
      cachedDBPromise = null;
      if (!settled) {
        settled = true;
        const err = request.error;
        if (err && err.name === 'VersionError') {
          const versionMessage =
            `IndexedDB version conflict (${err.message}). Please reload this page and close other open ID Studio tabs so the latest database schema can be used.`;
          if (typeof window !== 'undefined') {
            window.dispatchEvent(
              new CustomEvent(IDB_BLOCKED_EVENT, {
                detail: { message: versionMessage },
              })
            );
          }
          reject(new Error(versionMessage));
          return;
        }
        reject(err || new Error('Failed to open IndexedDB database.'));
      }
    };
  });

  return cachedDBPromise;
}

export async function saveProductsDB(products: Product[], storeId: string): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_PRODUCTS, 'readwrite');
    const store = tx.objectStore(STORE_PRODUCTS);

    await store.put({ id: storeId, products });

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('IndexedDB saveProducts error:', err);
  }
}

export async function getProductsDB(storeId: string): Promise<Product[]> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_PRODUCTS, 'readonly');
    const store = tx.objectStore(STORE_PRODUCTS);
    const request = store.get(storeId);

    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        const result = request.result;
        resolve(result ? result.products || [] : []);
      };
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn('IndexedDB getProducts error:', err);
    return [];
  }
}

export async function saveMetaDB(meta: StockReportMeta | null, storeId: string): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_META, 'readwrite');
    const store = tx.objectStore(STORE_META);
    const key = `meta_${storeId}`;
    if (meta) {
      store.put(meta, key);
    } else {
      store.delete(key);
    }
  } catch (err) {
    console.warn('IndexedDB saveMeta error:', err);
  }
}

export async function getMetaDB(storeId: string): Promise<StockReportMeta | null> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_META, 'readonly');
    const store = tx.objectStore(STORE_META);
    const request = store.get(`meta_${storeId}`);

    return new Promise((resolve) => {
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => resolve(null);
    });
  } catch (err) {
    return null;
  }
}

export async function saveHistoryDB(history: ScanHistoryItem[]): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_HISTORY, 'readwrite');
    const store = tx.objectStore(STORE_HISTORY);
    store.clear();
    for (const item of history) {
      store.put(item);
    }
  } catch (err) {
    console.warn('IndexedDB saveHistory error:', err);
  }
}

export async function getHistoryDB(): Promise<ScanHistoryItem[]> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_HISTORY, 'readonly');
    const store = tx.objectStore(STORE_HISTORY);
    const request = store.getAll();

    return new Promise((resolve) => {
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => resolve([]);
    });
  } catch (err) {
    return [];
  }
}

export async function deleteProductDB(id: string): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_PRODUCTS, 'readwrite');
    const store = tx.objectStore(STORE_PRODUCTS);
    
    // Get all store records
    const request = store.getAll();
    request.onsuccess = () => {
      const records = request.result || [];
      for (const record of records) {
        if (record && Array.isArray(record.products)) {
          const filtered = record.products.filter((p: Product) => p.id !== id);
          if (filtered.length !== record.products.length) {
            store.put({ id: record.id, products: filtered });
          }
        }
      }
    };

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('IndexedDB deleteProduct error:', err);
  }
}

export async function clearStoreDB(storeId: string): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction([STORE_PRODUCTS, STORE_META], 'readwrite');
    tx.objectStore(STORE_PRODUCTS).delete(storeId);
    tx.objectStore(STORE_META).delete(`meta_${storeId}`);

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn(`IndexedDB clearStoreDB for ${storeId} error:`, err);
  }
}

export async function clearAllDB(): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction([STORE_PRODUCTS, STORE_META, STORE_HISTORY], 'readwrite');
    tx.objectStore(STORE_PRODUCTS).clear();
    tx.objectStore(STORE_META).clear();
    tx.objectStore(STORE_HISTORY).clear();

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('IndexedDB clearAll error:', err);
  }
}

export async function clearAllOfflineDataDB(): Promise<void> {
  try {
    const db = await openDB();
    const stores = [
      STORE_PRODUCTS,
      STORE_META,
      STORE_HISTORY,
      STORE_AUDIT_SESSIONS,
      STORE_AUDIT_RESULTS,
      STORE_FOCUS_MASTERS,
      STORE_FOCUS_CHECKS,
      STORE_BARCODE_MASTER,
      STORE_BARCODE_MAPPINGS,
      STORE_NEAR_EXPIRY_BATCHES,
      STORE_NEAR_EXPIRY_ITEMS,
      STORE_BARCODE_OVERRIDES,
      STORE_PURCHASE_MASTER,
      STORE_PURCHASE_RECORDS
    ];
    const tx = db.transaction(stores, 'readwrite');
    stores.forEach(sName => {
      if (db.objectStoreNames.contains(sName)) {
        tx.objectStore(sName).clear();
      }
    });

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('IndexedDB clearAllOfflineDataDB error:', err);
  }
}

// --- Audit Storage IndexedDB Methods ---

export async function saveAuditSessionDB(session: AuditSession): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_AUDIT_SESSIONS, 'readwrite');
    const store = tx.objectStore(STORE_AUDIT_SESSIONS);
    store.put(session);
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('IndexedDB saveAuditSession error:', err);
  }
}

export async function getAuditSessionDB(sessionId: string): Promise<AuditSession | null> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_AUDIT_SESSIONS, 'readonly');
    const store = tx.objectStore(STORE_AUDIT_SESSIONS);
    const request = store.get(sessionId);
    return new Promise((resolve) => {
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => resolve(null);
    });
  } catch (err) {
    console.warn('IndexedDB getAuditSession error:', err);
    return null;
  }
}

export async function getAllAuditSessionsDB(storeId?: string): Promise<AuditSession[]> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_AUDIT_SESSIONS, 'readonly');
    const store = tx.objectStore(STORE_AUDIT_SESSIONS);
    const request = store.getAll();
    return new Promise((resolve) => {
      request.onsuccess = () => {
        let list: AuditSession[] = request.result || [];
        if (storeId) {
          list = list.filter((s) => s.storeId === storeId);
        }
        resolve(list);
      };
      request.onerror = () => resolve([]);
    });
  } catch (err) {
    console.warn('IndexedDB getAllAuditSessions error:', err);
    return [];
  }
}

export async function saveAuditResultsDB(results: AuditProductResult[]): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_AUDIT_RESULTS, 'readwrite');
    const store = tx.objectStore(STORE_AUDIT_RESULTS);
    for (const res of results) {
      store.put(res);
    }
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('IndexedDB saveAuditResults error:', err);
  }
}

export async function saveSingleAuditResultDB(result: AuditProductResult): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_AUDIT_RESULTS, 'readwrite');
    const store = tx.objectStore(STORE_AUDIT_RESULTS);
    store.put(result);
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('IndexedDB saveSingleAuditResult error:', err);
  }
}

export async function getAuditResultsBySessionDB(auditId: string): Promise<AuditProductResult[]> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_AUDIT_RESULTS, 'readonly');
    const store = tx.objectStore(STORE_AUDIT_RESULTS);
    const request = store.getAll();
    return new Promise((resolve) => {
      request.onsuccess = () => {
        const allResults: AuditProductResult[] = request.result || [];
        resolve(allResults.filter((r) => r.auditId === auditId));
      };
      request.onerror = () => resolve([]);
    });
  } catch (err) {
    console.warn('IndexedDB getAuditResultsBySession error:', err);
    return [];
  }
}

export async function getAllFlaggedResultsDB(storeId?: string): Promise<AuditProductResult[]> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_AUDIT_RESULTS, 'readonly');
    const store = tx.objectStore(STORE_AUDIT_RESULTS);
    const request = store.getAll();
    return new Promise((resolve) => {
      request.onsuccess = () => {
        let allResults: AuditProductResult[] = request.result || [];
        let flagged = allResults.filter((r) => r.status === 'flagged');
        if (storeId) {
          flagged = flagged.filter((r) => r.storeId === storeId);
        }
        resolve(flagged);
      };
      request.onerror = () => resolve([]);
    });
  } catch (err) {
    console.warn('IndexedDB getAllFlaggedResults error:', err);
    return [];
  }
}

export async function getAllFlaggedAndResolvedResultsDB(storeId?: string): Promise<AuditProductResult[]> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_AUDIT_RESULTS, 'readonly');
    const store = tx.objectStore(STORE_AUDIT_RESULTS);
    const request = store.getAll();
    return new Promise((resolve) => {
      request.onsuccess = () => {
        let allResults: AuditProductResult[] = request.result || [];
        let flaggedAndResolved = allResults.filter(
          (r) => r.status === 'flagged' || r.status === 'resolved' || Boolean(r.flaggedAt)
        );
        if (storeId) {
          flaggedAndResolved = flaggedAndResolved.filter((r) => r.storeId === storeId);
        }
        resolve(flaggedAndResolved);
      };
      request.onerror = () => resolve([]);
    });
  } catch (err) {
    console.warn('IndexedDB getAllFlaggedAndResolvedResults error:', err);
    return [];
  }
}

export async function deleteAuditSessionDB(sessionId: string): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction([STORE_AUDIT_SESSIONS, STORE_AUDIT_RESULTS], 'readwrite');
    tx.objectStore(STORE_AUDIT_SESSIONS).delete(sessionId);
    
    const resultsStore = tx.objectStore(STORE_AUDIT_RESULTS);
    const req = resultsStore.getAll();
    req.onsuccess = () => {
      const allRes: AuditProductResult[] = req.result || [];
      for (const res of allRes) {
        if (res.auditId === sessionId) {
          resultsStore.delete(res.id);
        }
      }
    };
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('IndexedDB deleteAuditSession error:', err);
  }
}

// ==========================================
// FOCUS MASTER (FOCUS IQ) PERSISTENCE
// ==========================================

export async function saveFocusMasterDB(master: FocusMaster): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_FOCUS_MASTERS, 'readwrite');
    const store = tx.objectStore(STORE_FOCUS_MASTERS);
    await store.put(master);
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('IndexedDB saveFocusMaster error:', err);
  }
}

export async function getFocusMasterDB(id: string): Promise<FocusMaster | null> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_FOCUS_MASTERS, 'readonly');
    const store = tx.objectStore(STORE_FOCUS_MASTERS);
    const request = store.get(id);
    return new Promise((resolve) => {
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => resolve(null);
    });
  } catch (err) {
    console.warn('IndexedDB getFocusMaster error:', err);
    return null;
  }
}

export async function getAllFocusMastersDB(storeId?: string): Promise<FocusMaster[]> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_FOCUS_MASTERS, 'readonly');
    const store = tx.objectStore(STORE_FOCUS_MASTERS);
    const request = store.getAll();
    return new Promise((resolve) => {
      request.onsuccess = () => {
        let masters: FocusMaster[] = request.result || [];
        if (storeId) {
          masters = masters.filter(m => m.storeId === storeId);
        }
        resolve(masters);
      };
      request.onerror = () => resolve([]);
    });
  } catch (err) {
    console.warn('IndexedDB getAllFocusMasters error:', err);
    return [];
  }
}

export async function deleteFocusMasterDB(id: string): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_FOCUS_MASTERS, 'readwrite');
    tx.objectStore(STORE_FOCUS_MASTERS).delete(id);
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('IndexedDB deleteFocusMaster error:', err);
  }
}

// ==========================================
// PHYSICAL FOCUS CHECK (STAGE 4) PERSISTENCE
// ==========================================

export async function saveFocusCheckDB(session: PhysicalFocusCheckSession): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_FOCUS_CHECKS, 'readwrite');
    const store = tx.objectStore(STORE_FOCUS_CHECKS);
    await store.put(session);
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('IndexedDB saveFocusCheck error:', err);
  }
}

export async function getFocusCheckDB(id: string): Promise<PhysicalFocusCheckSession | null> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_FOCUS_CHECKS, 'readonly');
    const store = tx.objectStore(STORE_FOCUS_CHECKS);
    const request = store.get(id);
    return new Promise((resolve) => {
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => resolve(null);
    });
  } catch (err) {
    console.warn('IndexedDB getFocusCheck error:', err);
    return null;
  }
}

export async function getAllFocusChecksDB(storeId?: string): Promise<PhysicalFocusCheckSession[]> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_FOCUS_CHECKS, 'readonly');
    const store = tx.objectStore(STORE_FOCUS_CHECKS);
    const request = store.getAll();
    return new Promise((resolve) => {
      request.onsuccess = () => {
        let checks: PhysicalFocusCheckSession[] = request.result || [];
        if (storeId) {
          checks = checks.filter(c => c.storeId === storeId);
        }
        resolve(checks);
      };
      request.onerror = () => resolve([]);
    });
  } catch (err) {
    console.warn('IndexedDB getAllFocusChecks error:', err);
    return [];
  }
}

export async function deleteFocusCheckDB(id: string): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_FOCUS_CHECKS, 'readwrite');
    tx.objectStore(STORE_FOCUS_CHECKS).delete(id);
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('IndexedDB deleteFocusCheck error:', err);
  }
}

// ==========================================
// BARCODE MASTER (STAGE 2) PERSISTENCE
// ==========================================

export async function saveBarcodeMasterDB(
  status: BarcodeMasterStatus,
  mappings: BarcodeMasterItem[]
): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction([STORE_BARCODE_MASTER, STORE_BARCODE_MAPPINGS], 'readwrite');
    const masterStore = tx.objectStore(STORE_BARCODE_MASTER);
    const mappingsStore = tx.objectStore(STORE_BARCODE_MAPPINGS);

    await masterStore.put(status, 'active_master');
    await mappingsStore.clear();

    for (let i = 0; i < mappings.length; i++) {
      const item = mappings[i];
      mappingsStore.put({
        id: `${item.code}_${item.ean}_${i}`,
        code: item.code,
        itemName: item.itemName,
        uom: item.uom,
        ean: item.ean
      });
    }

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('IndexedDB saveBarcodeMasterDB error:', err);
  }
}

export async function getBarcodeMasterStatusDB(): Promise<BarcodeMasterStatus | null> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_BARCODE_MASTER, 'readonly');
    const store = tx.objectStore(STORE_BARCODE_MASTER);
    const request = store.get('active_master');
    return new Promise((resolve) => {
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => resolve(null);
    });
  } catch (err) {
    console.warn('IndexedDB getBarcodeMasterStatusDB error:', err);
    return null;
  }
}

export async function getBarcodeMasterMappingsDB(): Promise<BarcodeMasterItem[]> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_BARCODE_MAPPINGS, 'readonly');
    const store = tx.objectStore(STORE_BARCODE_MAPPINGS);
    const request = store.getAll();
    return new Promise((resolve) => {
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => resolve([]);
    });
  } catch (err) {
    console.warn('IndexedDB getBarcodeMasterMappingsDB error:', err);
    return [];
  }
}

export async function clearBarcodeMasterDB(): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction([STORE_BARCODE_MASTER, STORE_BARCODE_MAPPINGS], 'readwrite');
    tx.objectStore(STORE_BARCODE_MASTER).clear();
    tx.objectStore(STORE_BARCODE_MAPPINGS).clear();
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('IndexedDB clearBarcodeMasterDB error:', err);
  }
}

export async function findBarcodeMasterItemsDB(codeOrEan: string): Promise<BarcodeMasterItem[]> {
  try {
    const raw = String(codeOrEan ?? '').trim();
    if (!raw) return [];

    let normEan = raw.replace(/\.0+$/, '').replace(/\s+/g, '');
    let normCode = raw.replace(/\.0+$/, '').replace(/\D/g, '');
    if (normCode.length > 0 && normCode.length <= 9) {
      normCode = normCode.padStart(9, '0');
    }

    const db = await openDB();
    const tx = db.transaction(STORE_BARCODE_MAPPINGS, 'readonly');
    const store = tx.objectStore(STORE_BARCODE_MAPPINGS);

    return new Promise((resolve) => {
      const eanIndex = store.index('ean');
      const eanReq = eanIndex.getAll(normEan);

      eanReq.onsuccess = () => {
        let results = eanReq.result || [];
        if (results.length > 0) {
          resolve(results);
          return;
        }

        // If raw string differs from normEan, try searching with raw string
        if (raw !== normEan) {
          const rawEanReq = eanIndex.getAll(raw);
          rawEanReq.onsuccess = () => {
            if (rawEanReq.result && rawEanReq.result.length > 0) {
              resolve(rawEanReq.result);
              return;
            }
            // Check code index
            if (normCode && normCode.length === 9) {
              const codeIndex = store.index('code');
              const codeReq = codeIndex.getAll(normCode);
              codeReq.onsuccess = () => resolve(codeReq.result || []);
              codeReq.onerror = () => resolve([]);
            } else {
              resolve([]);
            }
          };
          rawEanReq.onerror = () => resolve([]);
          return;
        }

        // Check code index with 9-digit padded code
        if (normCode && normCode.length === 9) {
          const codeIndex = store.index('code');
          const codeReq = codeIndex.getAll(normCode);
          codeReq.onsuccess = () => resolve(codeReq.result || []);
          codeReq.onerror = () => resolve([]);
        } else {
          resolve([]);
        }
      };

      eanReq.onerror = () => resolve([]);
    });
  } catch (err) {
    console.warn('IndexedDB findBarcodeMasterItemsDB error:', err);
    return [];
  }
}

export async function findBarcodeMasterItemDB(codeOrEan: string): Promise<BarcodeMasterItem | null> {
  const items = await findBarcodeMasterItemsDB(codeOrEan);
  return items.length > 0 ? items[0] : null;
}

// ==================================================
// NEAR EXPIRY INDEXEDDB HELPERS
// ==================================================

export async function saveNearExpiryBatchDB(batch: NearExpiryBatch): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NEAR_EXPIRY_BATCHES, 'readwrite');
    const store = tx.objectStore(STORE_NEAR_EXPIRY_BATCHES);
    await store.put(batch);
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('IndexedDB saveNearExpiryBatchDB error:', err);
  }
}

export async function getNearExpiryBatchesDB(): Promise<NearExpiryBatch[]> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NEAR_EXPIRY_BATCHES, 'readonly');
    const store = tx.objectStore(STORE_NEAR_EXPIRY_BATCHES);
    const req = store.getAll();
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('IndexedDB getNearExpiryBatchesDB error:', err);
    return [];
  }
}

export async function getNearExpiryBatchByIdDB(batchId: string): Promise<NearExpiryBatch | null> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NEAR_EXPIRY_BATCHES, 'readonly');
    const store = tx.objectStore(STORE_NEAR_EXPIRY_BATCHES);
    const req = store.get(batchId);
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('IndexedDB getNearExpiryBatchByIdDB error:', err);
    return null;
  }
}

export async function deleteNearExpiryBatchDB(batchId: string): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction([STORE_NEAR_EXPIRY_BATCHES, STORE_NEAR_EXPIRY_ITEMS], 'readwrite');
    tx.objectStore(STORE_NEAR_EXPIRY_BATCHES).delete(batchId);
    
    // Also delete associated items
    const itemStore = tx.objectStore(STORE_NEAR_EXPIRY_ITEMS);
    const index = itemStore.index('batchId');
    const req = index.getAllKeys(batchId);
    req.onsuccess = () => {
      const keys = req.result || [];
      keys.forEach(k => itemStore.delete(k));
    };

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('IndexedDB deleteNearExpiryBatchDB error:', err);
  }
}

export async function saveNearExpiryItemDB(item: NearExpiryItem): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NEAR_EXPIRY_ITEMS, 'readwrite');
    const store = tx.objectStore(STORE_NEAR_EXPIRY_ITEMS);
    await store.put(item);
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('IndexedDB saveNearExpiryItemDB error:', err);
  }
}

export async function saveNearExpiryItemsDB(items: NearExpiryItem[]): Promise<void> {
  if (!items || items.length === 0) return;
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NEAR_EXPIRY_ITEMS, 'readwrite');
    const store = tx.objectStore(STORE_NEAR_EXPIRY_ITEMS);
    for (const item of items) {
      store.put(item);
    }
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('IndexedDB saveNearExpiryItemsDB error:', err);
  }
}

export async function getNearExpiryItemsDB(batchId?: string): Promise<NearExpiryItem[]> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NEAR_EXPIRY_ITEMS, 'readonly');
    const store = tx.objectStore(STORE_NEAR_EXPIRY_ITEMS);
    let req: IDBRequest<NearExpiryItem[]>;
    if (batchId) {
      const index = store.index('batchId');
      req = index.getAll(batchId);
    } else {
      req = store.getAll();
    }
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('IndexedDB getNearExpiryItemsDB error:', err);
    return [];
  }
}

export async function deleteNearExpiryItemDB(itemId: string): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NEAR_EXPIRY_ITEMS, 'readwrite');
    const store = tx.objectStore(STORE_NEAR_EXPIRY_ITEMS);
    store.delete(itemId);
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('IndexedDB deleteNearExpiryItemDB error:', err);
  }
}

export async function clearAllNearExpiryDB(): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction([STORE_NEAR_EXPIRY_BATCHES, STORE_NEAR_EXPIRY_ITEMS], 'readwrite');
    tx.objectStore(STORE_NEAR_EXPIRY_BATCHES).clear();
    tx.objectStore(STORE_NEAR_EXPIRY_ITEMS).clear();
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('IndexedDB clearAllNearExpiryDB error:', err);
  }
}

// ==================================================
// BARCODE OVERRIDES INDEXEDDB METHODS
// ==================================================

export async function saveBarcodeOverrideDB(override: BarcodeOverride): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_BARCODE_OVERRIDES, 'readwrite');
    const store = tx.objectStore(STORE_BARCODE_OVERRIDES);
    store.put(override);
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('IndexedDB saveBarcodeOverrideDB error:', err);
  }
}

export async function getBarcodeOverridesDB(): Promise<BarcodeOverride[]> {
  try {
    const db = await openDB();
    if (!db.objectStoreNames.contains(STORE_BARCODE_OVERRIDES)) {
      return [];
    }
    const tx = db.transaction(STORE_BARCODE_OVERRIDES, 'readonly');
    const store = tx.objectStore(STORE_BARCODE_OVERRIDES);
    const req = store.getAll();
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('IndexedDB getBarcodeOverridesDB error:', err);
    return [];
  }
}

export async function getBarcodeOverrideForBarcodeDB(scannedBarcode: string): Promise<BarcodeOverride | null> {
  if (!scannedBarcode || !scannedBarcode.trim()) return null;
  try {
    const db = await openDB();
    if (!db.objectStoreNames.contains(STORE_BARCODE_OVERRIDES)) {
      return null;
    }
    const tx = db.transaction(STORE_BARCODE_OVERRIDES, 'readonly');
    const store = tx.objectStore(STORE_BARCODE_OVERRIDES);
    const trimmed = scannedBarcode.trim();
    const req = store.get(trimmed);
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('IndexedDB getBarcodeOverrideForBarcodeDB error:', err);
    return null;
  }
}

export async function deleteBarcodeOverrideDB(scannedBarcode: string): Promise<void> {
  if (!scannedBarcode || !scannedBarcode.trim()) return;
  try {
    const db = await openDB();
    if (!db.objectStoreNames.contains(STORE_BARCODE_OVERRIDES)) {
      return;
    }
    const tx = db.transaction(STORE_BARCODE_OVERRIDES, 'readwrite');
    const store = tx.objectStore(STORE_BARCODE_OVERRIDES);
    store.delete(scannedBarcode.trim());
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('IndexedDB deleteBarcodeOverrideDB error:', err);
  }
}

export async function clearBarcodeOverridesDB(): Promise<void> {
  try {
    const db = await openDB();
    if (!db.objectStoreNames.contains(STORE_BARCODE_OVERRIDES)) {
      return;
    }
    const tx = db.transaction(STORE_BARCODE_OVERRIDES, 'readwrite');
    tx.objectStore(STORE_BARCODE_OVERRIDES).clear();
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('IndexedDB clearBarcodeOverridesDB error:', err);
  }
}

export async function saveStockVariationsDB(variations: Record<string, StockVariation>): Promise<void> {
  const db = await openDB();
  if (!db.objectStoreNames.contains(STORE_STOCK_VARIATIONS)) return;
  const tx = db.transaction(STORE_STOCK_VARIATIONS, 'readwrite');
  const store = tx.objectStore(STORE_STOCK_VARIATIONS);
  store.clear();
  for (const v of Object.values(variations)) {
    store.put(v);
  }
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function putStockVariationDB(variation: StockVariation): Promise<void> {
  const db = await openDB();
  if (!db.objectStoreNames.contains(STORE_STOCK_VARIATIONS)) return;
  const tx = db.transaction(STORE_STOCK_VARIATIONS, 'readwrite');
  const store = tx.objectStore(STORE_STOCK_VARIATIONS);
  store.put(variation);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteStockVariationDB(id: string): Promise<void> {
  const db = await openDB();
  if (!db.objectStoreNames.contains(STORE_STOCK_VARIATIONS)) return;
  const tx = db.transaction(STORE_STOCK_VARIATIONS, 'readwrite');
  const store = tx.objectStore(STORE_STOCK_VARIATIONS);
  store.delete(id);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getStockVariationsDB(): Promise<Record<string, StockVariation>> {
  try {
    const db = await openDB();
    if (!db.objectStoreNames.contains(STORE_STOCK_VARIATIONS)) {
      return {};
    }
    const tx = db.transaction(STORE_STOCK_VARIATIONS, 'readonly');
    const store = tx.objectStore(STORE_STOCK_VARIATIONS);
    const request = store.getAll();
    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        const list: StockVariation[] = request.result || [];
        const map: Record<string, StockVariation> = {};
        for (const item of list) {
          const key = item.productKey || item.bansalCode || item.localCode || item.barcode || item.id;
          if (key) {
            map[key] = item;
          }
        }
        resolve(map);
      };
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn('IndexedDB getStockVariationsDB error:', err);
    return {};
  }
}

// ==================================================
// PURCHASE RESPONSIBILITY MASTER INDEXEDDB METHODS
// ==================================================

export async function replacePurchaseResponsibilityDB(
  meta: PurchaseResponsibilityMeta,
  records: PurchaseResponsibilityRecord[]
): Promise<void> {
  if (!meta || !records || records.length === 0) {
    throw new Error('Cannot save an empty Purchase Responsibility Master.');
  }

  const db = await openDB();
  if (!db.objectStoreNames.contains(STORE_PURCHASE_MASTER) || !db.objectStoreNames.contains(STORE_PURCHASE_RECORDS)) {
    throw new Error('Purchase Responsibility storage is unavailable in IndexedDB.');
  }

  const tx = db.transaction([STORE_PURCHASE_MASTER, STORE_PURCHASE_RECORDS], 'readwrite');
  const masterStore = tx.objectStore(STORE_PURCHASE_MASTER);
  const recordsStore = tx.objectStore(STORE_PURCHASE_RECORDS);

  const clearReq = recordsStore.clear();
  masterStore.put(meta, 'active_purchase_master');

  const BATCH_SIZE = 500;
  let offset = 0;

  const writeNextBatch = () => {
    const end = Math.min(offset + BATCH_SIZE, records.length);
    let lastReq: IDBRequest | null = null;
    for (let i = offset; i < end; i++) {
      lastReq = recordsStore.put(records[i]);
    }
    offset = end;
    if (offset < records.length && lastReq) {
      lastReq.onsuccess = () => {
        writeNextBatch();
      };
    }
  };

  clearReq.onsuccess = () => {
    if (records.length > 0) {
      writeNextBatch();
    }
  };

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('Failed to save Purchase Responsibility Master transaction.'));
    tx.onabort = () => reject(tx.error || new Error('Purchase Responsibility Master transaction was aborted.'));
  });
}

export async function getPurchaseResponsibilityMetaDB(): Promise<PurchaseResponsibilityMeta | null> {
  try {
    const db = await openDB();
    if (!db.objectStoreNames.contains(STORE_PURCHASE_MASTER)) {
      return null;
    }
    const tx = db.transaction(STORE_PURCHASE_MASTER, 'readonly');
    const store = tx.objectStore(STORE_PURCHASE_MASTER);
    const request = store.get('active_purchase_master');
    return new Promise((resolve) => {
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => resolve(null);
    });
  } catch (err) {
    console.warn('IndexedDB getPurchaseResponsibilityMetaDB error:', err);
    return null;
  }
}

export async function getPurchaseResponsibilityRecordsDB(): Promise<PurchaseResponsibilityRecord[]> {
  try {
    const db = await openDB();
    if (!db.objectStoreNames.contains(STORE_PURCHASE_RECORDS)) {
      return [];
    }
    const tx = db.transaction(STORE_PURCHASE_RECORDS, 'readonly');
    const store = tx.objectStore(STORE_PURCHASE_RECORDS);
    const request = store.getAll();
    return new Promise((resolve) => {
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => resolve([]);
    });
  } catch (err) {
    console.warn('IndexedDB getPurchaseResponsibilityRecordsDB error:', err);
    return [];
  }
}

export async function clearPurchaseResponsibilityDB(): Promise<void> {
  const db = await openDB();
  if (!db.objectStoreNames.contains(STORE_PURCHASE_MASTER) || !db.objectStoreNames.contains(STORE_PURCHASE_RECORDS)) {
    return;
  }
  const tx = db.transaction([STORE_PURCHASE_MASTER, STORE_PURCHASE_RECORDS], 'readwrite');
  tx.objectStore(STORE_PURCHASE_MASTER).clear();
  tx.objectStore(STORE_PURCHASE_RECORDS).clear();

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('Failed to clear Purchase Responsibility Master.'));
    tx.onabort = () => reject(tx.error || new Error('Clear Purchase Responsibility Master transaction aborted.'));
  });
}


