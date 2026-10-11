import { NearExpiryBatch, NearExpiryItem, Product } from '../types';
import {
  getNearExpiryBatchesDB,
  saveNearExpiryBatchDB,
  deleteNearExpiryBatchDB,
  getNearExpiryItemsDB,
  saveNearExpiryItemDB,
  saveNearExpiryItemsDB,
  deleteNearExpiryItemDB,
  clearAllNearExpiryDB
} from './indexedDB';
import { evaluateItemStatus, calculateShelfLife, formatDateYYYYMMDD } from './nearExpiryEngine';

export { getNearExpiryItemsDB };

/**
 * Returns a human-friendly default batch name for current date:
 * Days 1-15 -> "Fortnight 1 - Sep 2026"
 * Days 16-31 -> "Fortnight 2 - Sep 2026"
 */
export function getDefaultFortnightName(d: Date = new Date()): {
  name: string;
  start: string;
  end: string;
} {
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = monthNames[d.getMonth()];
  const year = d.getFullYear();
  const day = d.getDate();
  const mIndex = String(d.getMonth() + 1).padStart(2, '0');

  if (day <= 15) {
    return {
      name: `Fortnight 1 - ${month} ${year}`,
      start: `${year}-${mIndex}-01`,
      end: `${year}-${mIndex}-15`
    };
  } else {
    const lastDay = new Date(year, d.getMonth() + 1, 0).getDate();
    return {
      name: `Fortnight 2 - ${month} ${year}`,
      start: `${year}-${mIndex}-16`,
      end: `${year}-${mIndex}-${lastDay}`
    };
  }
}

/**
 * Ensures an active batch exists. If no batches exist, creates the initial default batch.
 */
export async function getOrCreateActiveBatch(storeName: string = 'PATAN', storeId: string = 'store_1'): Promise<{
  activeBatch: NearExpiryBatch;
  allBatches: NearExpiryBatch[];
}> {
  const batches = await getNearExpiryBatchesDB();

  // Normalize visible Store 1 to PATAN on loaded batches
  batches.forEach((b) => {
    if (b.storeName === 'Store 1' || !b.storeName) {
      b.storeName = 'PATAN';
    }
  });

  if (batches.length === 0) {
    const info = getDefaultFortnightName();
    const newBatch: NearExpiryBatch = {
      id: `batch_${Date.now()}`,
      name: info.name,
      periodStart: info.start,
      periodEnd: info.end,
      storeName,
      storeId,
      status: 'DRAFT',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await saveNearExpiryBatchDB(newBatch);
    return { activeBatch: newBatch, allBatches: [newBatch] };
  }

  // Sort batches by createdAt descending
  batches.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  // Find active (non-completed) batch or fallback to latest
  const active = batches.find((b) => b.status !== 'COMPLETED') || batches[0];
  return { activeBatch: active, allBatches: batches };
}

/**
 * Creates a brand new Fortnight batch without destroying previous batches.
 * PREVENTS DUPLICATES based on Store + Year + Month + Fortnight.
 * If a matching batch already exists, returns the existing batch instead.
 */
export async function createNewBatch(
  name: string,
  storeName: string = 'PATAN',
  storeId: string = 'store_1'
): Promise<NearExpiryBatch> {
  const batches = await getNearExpiryBatchesDB();
  const info = getDefaultFortnightName();
  const batchName = name.trim() || info.name;

  // Check for duplicate batch by Store + Name OR Store + Period
  const existing = batches.find((b) => {
    const isSameStore =
      (b.storeId && storeId && b.storeId === storeId) ||
      (b.storeName && storeName && b.storeName.toLowerCase().trim() === storeName.toLowerCase().trim()) ||
      (!b.storeId && !storeId);

    if (!isSameStore) return false;

    const bName = (b.name || '').toLowerCase().trim();
    const targetName = batchName.toLowerCase().trim();
    if (bName === targetName) return true;

    // Check if both correspond to same period
    if (b.periodStart === info.start && b.periodEnd === info.end && targetName === info.name.toLowerCase().trim()) {
      return true;
    }

    return false;
  });

  if (existing) {
    if (existing.storeName === 'Store 1' || !existing.storeName) {
      existing.storeName = 'PATAN';
    }
    return existing;
  }

  const newBatch: NearExpiryBatch = {
    id: `batch_${Date.now()}`,
    name: batchName,
    periodStart: info.start,
    periodEnd: info.end,
    storeName,
    storeId,
    status: 'DRAFT',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  await saveNearExpiryBatchDB(newBatch);
  return newBatch;
}

/**
 * Completely clears all Near Expiry data (batches and items) and reinitializes a clean default batch.
 * Does not touch Stock IQ, Barcode Master, Focus IQ, or Floor Audits.
 */
export async function clearAllNearExpiryData(
  storeName: string = 'PATAN',
  storeId: string = 'store_1'
): Promise<{
  activeBatch: NearExpiryBatch;
  allBatches: NearExpiryBatch[];
}> {
  await clearAllNearExpiryDB();
  return await getOrCreateActiveBatch(storeName, storeId);
}

/**
 * Loads items for a batch and recalculates dynamic due statuses based on today's date.
 */
export async function loadBatchItems(batchId: string): Promise<NearExpiryItem[]> {
  const rawItems = await getNearExpiryItemsDB(batchId);
  const now = new Date();

  // Dynamically re-evaluate status and live pending shelf life for every item
  // so Waiting automatically transitions to Action Required when due date is reached,
  // and days remaining are always calculated against the actual current device date.
  return rawItems.map((item) => {
    const evaluated = evaluateItemStatus(item, now);
    const expDateVal = item.expiryDate || item.hoExpiryDate;
    const shelf = calculateShelfLife(item.mfgDate || item.hoMfgDate, expDateVal, now);

    return {
      ...item,
      status: evaluated.status,
      actionType: item.actionType || evaluated.effectiveActionType,
      actionTiming: item.actionTiming || undefined,
      pendingDays: shelf.pendingDays,
      pendingPct: shelf.pendingPct,
      totalDays: shelf.totalDays || item.totalDays
    };
  });
}

/**
 * Calculates batch summary KPIs.
 */
export function calculateBatchSummary(items: NearExpiryItem[]) {
  const totalProducts = items.length;
  const totalQty = items.reduce((sum, it) => sum + (Number(it.nearExpiryStock) || 0), 0);
  const totalValue = items.reduce((sum, it) => sum + (Number(it.value) || 0), 0);

  const actionRequiredCount = items.filter((it) => it.status === 'ACTION_REQUIRED').length;
  const waitingCount = items.filter((it) => it.status === 'WAITING').length;
  const completedCount = items.filter((it) => it.status === 'COMPLETED').length;
  const draftCount = items.filter((it) => it.status === 'DRAFT').length;

  return {
    totalProducts,
    totalQty,
    totalValue,
    actionRequiredCount,
    waitingCount,
    completedCount,
    draftCount
  };
}

/**
 * Marks an action as completed with a timestamp, preserving full history.
 */
export async function markActionCompleted(
  item: NearExpiryItem,
  notes?: string
): Promise<NearExpiryItem> {
  const updated: NearExpiryItem = {
    ...item,
    status: 'COMPLETED',
    executionStatus: 'COMPLETED',
    completedAt: new Date().toISOString(),
    notes: notes || item.notes
  };

  await saveNearExpiryItemDB(updated);
  return updated;
}

/**
 * Marks multiple items as completed in batch.
 */
export async function markItemsCompleted(
  allItems: NearExpiryItem[],
  targetItemIds: string[],
  notes?: string
): Promise<NearExpiryItem[]> {
  const targetSet = new Set(targetItemIds);
  const now = new Date().toISOString();
  const updatedTargets: NearExpiryItem[] = [];

  const updatedAll = allItems.map((it) => {
    if (!targetSet.has(it.id)) return it;
    const updated: NearExpiryItem = {
      ...it,
      status: 'COMPLETED',
      executionStatus: 'COMPLETED',
      completedAt: now,
      notes: notes || it.notes
    };
    updatedTargets.push(updated);
    return updated;
  });

  if (updatedTargets.length > 0) {
    await saveNearExpiryItemsDB(updatedTargets);
  }

  return updatedAll;
}

/**
 * Marks target items as sent to staff for floor removal.
 * Preserves all HO remarks, debit status, and existing batch scope.
 */
export async function markItemsFloorSent(
  allItems: NearExpiryItem[],
  targetItemIds: string[]
): Promise<NearExpiryItem[]> {
  const targetSet = new Set(targetItemIds);
  const now = new Date();
  const isoNow = now.toISOString();
  const dateStr = formatDateYYYYMMDD(now);

  const updatedTargetItems: NearExpiryItem[] = [];

  const updatedAll = allItems.map((it) => {
    if (!targetSet.has(it.id)) return it;

    const updated: NearExpiryItem = {
      ...it,
      floorRemovalStatus: it.floorRemovalStatus === 'REMOVED' ? 'REMOVED' : 'SENT',
      floorRemovalSentAt: it.floorRemovalSentAt || isoNow,
      floorRemovalSentDate: it.floorRemovalSentDate || dateStr
    };
    updatedTargetItems.push(updated);
    return updated;
  });

  if (updatedTargetItems.length > 0) {
    await saveNearExpiryItemsDB(updatedTargetItems);
  }

  return updatedAll;
}

/**
 * Marks target items as physically removed from the floor.
 * Preserves all HO remarks, debit status, and existing batch scope.
 */
export async function markItemsFloorRemoved(
  allItems: NearExpiryItem[],
  targetItemIds: string[]
): Promise<NearExpiryItem[]> {
  const targetSet = new Set(targetItemIds);
  const now = new Date();
  const isoNow = now.toISOString();
  const dateStr = formatDateYYYYMMDD(now);

  const updatedTargetItems: NearExpiryItem[] = [];

  const updatedAll = allItems.map((it) => {
    if (!targetSet.has(it.id)) return it;

    const updated: NearExpiryItem = {
      ...it,
      floorRemovalStatus: 'REMOVED',
      floorRemovalRemovedAt: isoNow,
      floorRemovalRemovedDate: dateStr
    };
    updatedTargetItems.push(updated);
    return updated;
  });

  if (updatedTargetItems.length > 0) {
    await saveNearExpiryItemsDB(updatedTargetItems);
  }

  return updatedAll;
}

/**
 * Undoes or resets floor removal status for target items.
 * Allows fixing accidental markings without deleting products or altering HO data.
 */
export async function undoItemsFloorStatus(
  allItems: NearExpiryItem[],
  targetItemIds: string[],
  mode: 'UNDO_REMOVED' | 'RESET_ALL' = 'RESET_ALL'
): Promise<NearExpiryItem[]> {
  const targetSet = new Set(targetItemIds);
  const updatedTargetItems: NearExpiryItem[] = [];

  const updatedAll = allItems.map((it) => {
    if (!targetSet.has(it.id)) return it;

    let updated: NearExpiryItem;
    if (mode === 'UNDO_REMOVED' && it.floorRemovalSentAt) {
      // Revert from REMOVED back to SENT
      updated = {
        ...it,
        floorRemovalStatus: 'SENT',
        floorRemovalRemovedAt: undefined,
        floorRemovalRemovedDate: undefined
      };
    } else {
      // Complete reset to un-sent / un-removed
      updated = {
        ...it,
        floorRemovalStatus: undefined,
        floorRemovalSentAt: undefined,
        floorRemovalSentDate: undefined,
        floorRemovalRemovedAt: undefined,
        floorRemovalRemovedDate: undefined
      };
    }
    updatedTargetItems.push(updated);
    return updated;
  });

  if (updatedTargetItems.length > 0) {
    await saveNearExpiryItemsDB(updatedTargetItems);
  }

  return updatedAll;
}

/**
 * Safely returns a physically removed item to the sales floor.
 * Clears physical removal status, records return timestamp and reason.
 */
export async function returnItemToFloor(
  allItems: NearExpiryItem[],
  itemId: string,
  reason: string = 'HO instruction: Continue sale'
): Promise<NearExpiryItem[]> {
  const now = new Date();
  const isoNow = now.toISOString();

  let targetItem: NearExpiryItem | null = null;
  const updatedAll = allItems.map((it) => {
    if (it.id !== itemId) return it;

    const updated: NearExpiryItem = {
      ...it,
      floorRemovalStatus: undefined,
      floorRemovalRemovedAt: undefined,
      floorRemovalRemovedDate: undefined,
      returnedToFloorAt: isoNow,
      returnedToFloorReason: reason
    };
    targetItem = updated;
    return updated;
  });

  if (targetItem) {
    await saveNearExpiryItemDB(targetItem);
  }

  return updatedAll;
}

/**
 * Safely reverts a completed item back to active status.
 */
export async function revertItemCompletion(
  allItems: NearExpiryItem[],
  itemId: string
): Promise<NearExpiryItem[]> {
  let targetItem: NearExpiryItem | null = null;
  const updatedAll = allItems.map((it) => {
    if (it.id !== itemId) return it;
    const updated: NearExpiryItem = {
      ...it,
      status: it.hoRemark ? 'ACTION_REQUIRED' : 'DRAFT',
      executionStatus: 'PENDING',
      completedAt: undefined,
      notes: undefined
    };
    targetItem = updated;
    return updated;
  });

  if (targetItem) {
    await saveNearExpiryItemDB(targetItem);
  }

  return updatedAll;
}

