import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  Product,
  PurchaseResponsibilityMeta,
  PurchaseResponsibilityRecord,
} from '../types';
import {
  BLOCKED_UPGRADE_MESSAGE,
  IDB_BLOCKED_EVENT,
  IDB_VERSIONCHANGE_EVENT,
  clearPurchaseResponsibilityDB,
  getPurchaseResponsibilityMetaDB,
  getPurchaseResponsibilityRecordsDB,
  replacePurchaseResponsibilityDB,
} from '../utils/indexedDB';
import {
  PurchaseContactResolution,
  buildPurchaseContactLookupIndex,
  resolvePurchaseContactsFromIndex,
} from '../utils/purchaseResponsibility';

export const PURCHASE_RESPONSIBILITY_CHANGED_EVENT = 'bsm_purchase_responsibility_changed';

interface PurchaseContactContextValue {
  meta: PurchaseResponsibilityMeta | null;
  records: PurchaseResponsibilityRecord[];
  isLoading: boolean;
  storageError: string | null;
  clearStorageError: () => void;
  activeTargetProduct: Partial<Product> | null;
  isPopupOpen: boolean;
  reloadMaster: () => Promise<void>;
  replaceMaster: (
    nextMeta: PurchaseResponsibilityMeta,
    nextRecords: PurchaseResponsibilityRecord[]
  ) => Promise<void>;
  removeMaster: () => Promise<void>;
  openPurchaseContact: (product: Partial<Product>) => void;
  closePurchaseContact: () => void;
  resolveForProduct: (product?: Partial<Product> | null) => PurchaseContactResolution;
}

const PurchaseContactContext = createContext<PurchaseContactContextValue | null>(null);

export const PurchaseContactProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [meta, setMeta] = useState<PurchaseResponsibilityMeta | null>(null);
  const [records, setRecords] = useState<PurchaseResponsibilityRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [activeTargetProduct, setActiveTargetProduct] = useState<Partial<Product> | null>(null);
  const [isPopupOpen, setIsPopupOpen] = useState<boolean>(false);
  const skipNextExternalReloadRef = useRef<boolean>(false);

  const clearStorageError = useCallback(() => {
    setStorageError(null);
  }, []);

  const reloadMaster = useCallback(async () => {
    setIsLoading(true);
    try {
      const [loadedMeta, loadedRecords] = await Promise.all([
        getPurchaseResponsibilityMetaDB(),
        getPurchaseResponsibilityRecordsDB(),
      ]);
      setMeta(loadedMeta);
      setRecords(loadedRecords);
      setStorageError(null);
    } catch (err: any) {
      console.warn('Failed to load Purchase Responsibility Master:', err);
      setStorageError(err?.message || 'Failed to read Purchase Responsibility storage.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    reloadMaster();

    const handleExternalChange = () => {
      if (skipNextExternalReloadRef.current) {
        skipNextExternalReloadRef.current = false;
        return;
      }
      reloadMaster();
    };
    const handleBlocked = (e: Event) => {
      const detail = (e as CustomEvent<{ message?: string }>).detail;
      setStorageError(detail?.message || BLOCKED_UPGRADE_MESSAGE);
    };
    const handleVersionChange = () => {
      setStorageError(
        'Another ID Studio tab updated the offline database schema. Please reload this tab if data does not appear.'
      );
    };

    window.addEventListener(PURCHASE_RESPONSIBILITY_CHANGED_EVENT, handleExternalChange);
    window.addEventListener(IDB_BLOCKED_EVENT, handleBlocked);
    window.addEventListener(IDB_VERSIONCHANGE_EVENT, handleVersionChange);
    return () => {
      window.removeEventListener(PURCHASE_RESPONSIBILITY_CHANGED_EVENT, handleExternalChange);
      window.removeEventListener(IDB_BLOCKED_EVENT, handleBlocked);
      window.removeEventListener(IDB_VERSIONCHANGE_EVENT, handleVersionChange);
    };
  }, [reloadMaster]);

  const replaceMaster = useCallback(
    async (nextMeta: PurchaseResponsibilityMeta, nextRecords: PurchaseResponsibilityRecord[]) => {
      try {
        await replacePurchaseResponsibilityDB(nextMeta, nextRecords);
        setMeta(nextMeta);
        setRecords(nextRecords);
        setStorageError(null);
        skipNextExternalReloadRef.current = true;
        window.dispatchEvent(new CustomEvent(PURCHASE_RESPONSIBILITY_CHANGED_EVENT));
      } catch (err: any) {
        const msg = err?.message || 'Failed to save Purchase Responsibility Master.';
        setStorageError(msg);
        throw err;
      }
    },
    []
  );

  const removeMaster = useCallback(async () => {
    try {
      await clearPurchaseResponsibilityDB();
      setMeta(null);
      setRecords([]);
      setStorageError(null);
      skipNextExternalReloadRef.current = true;
      window.dispatchEvent(new CustomEvent(PURCHASE_RESPONSIBILITY_CHANGED_EVENT));
    } catch (err: any) {
      const msg = err?.message || 'Failed to remove Purchase Responsibility Master.';
      setStorageError(msg);
      throw err;
    }
  }, []);

  const openPurchaseContact = useCallback((product: Partial<Product>) => {
    // Store only the product identity/descriptor, never cached contact copies
    setActiveTargetProduct(product);
    setIsPopupOpen(true);
  }, []);

  const closePurchaseContact = useCallback(() => {
    setIsPopupOpen(false);
    setActiveTargetProduct(null);
  }, []);

  const lookupIndex = useMemo(() => buildPurchaseContactLookupIndex(records), [records]);

  const resolveForProduct = useCallback(
    (product?: Partial<Product> | null) => {
      return resolvePurchaseContactsFromIndex(product, lookupIndex);
    },
    [lookupIndex]
  );

  return (
    <PurchaseContactContext.Provider
      value={{
        meta,
        records,
        isLoading,
        storageError,
        clearStorageError,
        activeTargetProduct,
        isPopupOpen,
        reloadMaster,
        replaceMaster,
        removeMaster,
        openPurchaseContact,
        closePurchaseContact,
        resolveForProduct,
      }}
    >
      {children}
    </PurchaseContactContext.Provider>
  );
};

export function usePurchaseContact(): PurchaseContactContextValue {
  const ctx = useContext(PurchaseContactContext);
  if (!ctx) {
    throw new Error('usePurchaseContact must be used within a PurchaseContactProvider');
  }
  return ctx;
}
