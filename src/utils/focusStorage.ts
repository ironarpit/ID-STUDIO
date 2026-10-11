import { FocusMaster, FocusType, PhysicalFocusCheckSession } from '../types';
import {
  saveFocusMasterDB,
  getAllFocusMastersDB,
  getFocusMasterDB,
  deleteFocusMasterDB,
  saveFocusCheckDB,
  getFocusCheckDB,
  getAllFocusChecksDB,
  deleteFocusCheckDB
} from './indexedDB';

// ==========================================
// 100% PERSONAL OFFLINE FOCUS IQ STORAGE
// Uses IndexedDB ONLY
// ==========================================

/**
 * Saves a monthly Focus Master to IndexedDB.
 * Automatically marks this master as active for its FocusType.
 */
export async function saveFocusMaster(master: FocusMaster): Promise<FocusMaster> {
  const storeId = master.storeId || 'store_1';
  const existing = await getAllFocusMastersDB(storeId);

  // Mark other masters of same type inactive in IndexedDB
  for (const item of existing) {
    if (item.type === master.type && item.id !== master.id && item.isActive) {
      item.isActive = false;
      await saveFocusMasterDB(item);
    }
  }

  const toSave: FocusMaster = {
    ...master,
    storeId,
    isActive: true
  };

  await saveFocusMasterDB(toSave);
  return toSave;
}

/**
 * Retrieves all Focus Masters for a store from local IndexedDB.
 */
export async function loadAllFocusMasters(storeId: string = 'store_1'): Promise<FocusMaster[]> {
  const localMasters = await getAllFocusMastersDB(storeId);
  return localMasters.sort(
    (a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
  );
}

/**
 * Gets the active monthly Focus Master for a specific focus type from IndexedDB.
 */
export async function getActiveFocusMaster(
  storeId: string = 'store_1',
  type: FocusType
): Promise<FocusMaster | null> {
  const all = await loadAllFocusMasters(storeId);
  const matching = all.filter(m => m.type === type);
  return matching.find(m => m.isActive) || matching[0] || null;
}

/**
 * Sets a specific Focus Master as active, marking all others of that type as inactive.
 */
export async function setActiveFocusMaster(
  storeId: string = 'store_1',
  type: FocusType,
  masterId: string
): Promise<void> {
  const all = await getAllFocusMastersDB(storeId);
  for (const item of all) {
    if (item.type === type) {
      const shouldBeActive = item.id === masterId;
      if (item.isActive !== shouldBeActive) {
        item.isActive = shouldBeActive;
        await saveFocusMasterDB(item);
      }
    }
  }
}

/**
 * Deletes a Focus Master from local IndexedDB.
 */
export async function deleteFocusMaster(masterId: string): Promise<void> {
  await deleteFocusMasterDB(masterId);
}

// ==========================================
// PHYSICAL FOCUS CHECK PERSISTENCE (INDEXEDDB)
// ==========================================

/**
 * Saves or updates a physical focus check session in IndexedDB.
 */
export async function savePhysicalFocusCheck(session: PhysicalFocusCheckSession): Promise<void> {
  await saveFocusCheckDB(session);
}

/**
 * Loads all physical focus checks for a store from local IndexedDB.
 */
export async function loadAllPhysicalFocusChecks(storeId: string = 'store_1'): Promise<PhysicalFocusCheckSession[]> {
  const localChecks = await getAllFocusChecksDB(storeId);
  localChecks.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  return localChecks;
}

/**
 * Gets the active (in_progress) physical check for a store and focus type, or null.
 */
export async function getActivePhysicalFocusCheck(
  storeId: string = 'store_1',
  type: FocusType
): Promise<PhysicalFocusCheckSession | null> {
  const all = await loadAllPhysicalFocusChecks(storeId);
  const active = all.find(c => c.type === type && c.status === 'in_progress');
  return active || null;
}

/**
 * Gets the most recent completed physical check for a store and focus type, or null.
 */
export async function getLatestCompletedPhysicalFocusCheck(
  storeId: string = 'store_1',
  type: FocusType
): Promise<PhysicalFocusCheckSession | null> {
  const all = await loadAllPhysicalFocusChecks(storeId);
  const completed = all.filter(c => c.type === type && c.status === 'completed');
  if (completed.length === 0) return null;
  completed.sort((a, b) => new Date(b.completedAt || b.startedAt).getTime() - new Date(a.completedAt || a.startedAt).getTime());
  return completed[0];
}

/**
 * In 100% offline mode, no background network polling is needed.
 * Returns an instant cleanup function.
 */
export function subscribeToPhysicalFocusCheck(
  _checkId: string,
  _onUpdate: (session: PhysicalFocusCheckSession) => void
): () => void {
  // Offline mode: No background network polling
  return () => {};
}

/**
 * Deletes a physical focus check session from local IndexedDB.
 */
export async function deletePhysicalFocusCheck(
  storeIdOrCheckId: string,
  optionalCheckId?: string
): Promise<void> {
  const checkId = optionalCheckId || storeIdOrCheckId;
  await deleteFocusCheckDB(checkId);
}
