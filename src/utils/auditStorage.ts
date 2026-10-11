import {
  AuditSession,
  AuditProductResult,
  AuditType,
  Product,
} from '../types';
import {
  saveAuditSessionDB,
  getAuditSessionDB,
  getAllAuditSessionsDB,
  saveAuditResultsDB,
  saveSingleAuditResultDB,
  getAuditResultsBySessionDB,
  getAllFlaggedResultsDB,
  getAllFlaggedAndResolvedResultsDB,
  deleteAuditSessionDB,
} from './indexedDB';
export { saveAuditSessionDB } from './indexedDB';

export interface CreateSessionParams {
  storeId: string;
  type: AuditType;
  title: string;
  products: Product[];
  categoryFilter?: string;
  mainCodeFilter?: string | string[];
  rankRange?: string;
  filterConditions?: string;
  reportPeriod?: string;
  datasetVersion?: string;
  focusMonth?: string;
  sourceList?: string;
  purchaseMeta?: AuditSession['purchaseMeta'];
}

/**
 * Creates a new Floor Audit Session with snapshot product results.
 */
export async function createSession(params: CreateSessionParams): Promise<{
  session: AuditSession;
  results: AuditProductResult[];
}> {
  const {
    storeId,
    type,
    title,
    products,
    categoryFilter,
    mainCodeFilter,
    rankRange,
    filterConditions,
    reportPeriod,
    datasetVersion,
    focusMonth,
    sourceList
  } = params;
  const now = new Date().toISOString();
  const sessionId = `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  const productIds = products.map((p) => p.id);

  const results: AuditProductResult[] = products.map((p) => {
    const raw = p.rawRowData || {};

    // 1. Bansal Code / Item Code / Local Code
    let bansalCode = p.bansalCode || p.localCode || p.code || '';
    if (!bansalCode && raw) {
      const key = Object.keys(raw).find(k => {
        const norm = k.toLowerCase().replace(/[^a-z0-9]/g, '');
        return ['code', 'bansalcode', 'bansal', 'localcode', 'itemcode', 'shortcode', 'storecode', 'internalcode', 'hsncode', 'hsn', 'productcode'].includes(norm);
      });
      if (key) bansalCode = String(raw[key] || '').trim();
    }

    // 2. Main Code
    let mainCode = p.mainCode || '';
    if (!mainCode && raw) {
      const key = Object.keys(raw).find(k => {
        const norm = k.toLowerCase().replace(/[^a-z0-9]/g, '');
        return ['maincode', 'main_code', 'maingroup', 'dept', 'department', 'section'].includes(norm);
      });
      if (key) mainCode = String(raw[key] || '').trim();
    }
    if (!mainCode) mainCode = p.category || '';

    // 3. Category
    let category = p.category || '';
    if (!category && raw) {
      const key = Object.keys(raw).find(k => {
        const norm = k.toLowerCase().replace(/[^a-z0-9]/g, '');
        return ['category', 'group', 'subgroup', 'segment'].includes(norm);
      });
      if (key) category = String(raw[key] || '').trim();
    }
    if (!category) category = 'General';

    // 4. Brand
    let brand = p.brand || '';
    if (!brand && raw) {
      const key = Object.keys(raw).find(k => {
        const norm = k.toLowerCase().replace(/[^a-z0-9]/g, '');
        return ['brand', 'brandname', 'make', 'company'].includes(norm);
      });
      if (key) brand = String(raw[key] || '').trim();
    }

    // 5. Manufacturer
    let manufacturer = p.manufacturer || '';
    if (!manufacturer && raw) {
      const key = Object.keys(raw).find(k => {
        const norm = k.toLowerCase().replace(/[^a-z0-9]/g, '');
        return ['manufacturer', 'manufacture', 'mfg'].includes(norm);
      });
      if (key) manufacturer = String(raw[key] || '').trim();
    }

    // 6. Supplier
    let supplier = p.supplierName || p.supplier || '';
    if (!supplier && raw) {
      const key = Object.keys(raw).find(k => {
        const norm = k.toLowerCase().replace(/[^a-z0-9]/g, '');
        return ['supplier', 'suppliername', 'vendor', 'vendorname', 'distributor', 'party', 'partyname', 'source', 'companyname'].includes(norm);
      });
      if (key) supplier = String(raw[key] || '').trim();
    }

    // 7. Quantities
    let openingStock = typeof p.openingStock === 'number' ? p.openingStock : (typeof p.openingQty === 'number' ? p.openingQty : 0);
    if (openingStock <= 0 && raw) {
      const key = Object.keys(raw).find(k => ['openingqty', 'opening', 'opqty', 'opstock'].includes(k.toLowerCase().replace(/[^a-z0-9]/g, '')));
      if (key) {
        const v = parseFloat(String(raw[key]).replace(/[^0-9.-]/g, ''));
        if (!isNaN(v)) openingStock = v;
      }
    }

    let purchaseQty = typeof p.purchaseQty === 'number' ? p.purchaseQty : 0;
    if (purchaseQty <= 0 && raw) {
      const key = Object.keys(raw).find(k => ['purchaseqty', 'purnet', 'purchase', 'inward'].includes(k.toLowerCase().replace(/[^a-z0-9]/g, '')));
      if (key) {
        const v = parseFloat(String(raw[key]).replace(/[^0-9.-]/g, ''));
        if (!isNaN(v)) purchaseQty = v;
      }
    }

    let salesQty = typeof p.salesCount === 'number' ? p.salesCount : (typeof p.salesQty === 'number' ? p.salesQty : 0);
    if (salesQty <= 0 && raw) {
      const key = Object.keys(raw).find(k => ['salescount', 'salenet', 'sales', 'sold', 'soldqty'].includes(k.toLowerCase().replace(/[^a-z0-9]/g, '')));
      if (key) {
        const v = parseFloat(String(raw[key]).replace(/[^0-9.-]/g, ''));
        if (!isNaN(v)) salesQty = v;
      }
    }

    let closingStock = typeof p.stock === 'number' ? p.stock : (typeof p.closingQty === 'number' ? p.closingQty : 0);
    if (closingStock <= 0 && raw) {
      const key = Object.keys(raw).find(k => ['closingstock', 'closingqty', 'closing', 'stock', 'qty', 'balance'].includes(k.toLowerCase().replace(/[^a-z0-9]/g, '')));
      if (key) {
        const v = parseFloat(String(raw[key]).replace(/[^0-9.-]/g, ''));
        if (!isNaN(v)) closingStock = v;
      }
    }

    // 8. Financials
    let costPrice = typeof p.costPrice === 'number' && p.costPrice > 0 ? p.costPrice : (typeof p.cost === 'number' && p.cost > 0 ? p.cost : 0);
    if (costPrice <= 0 && raw) {
      const key = Object.keys(raw).find(k => {
        const norm = k.toLowerCase().replace(/[^a-z0-9]/g, '');
        return ['costprice', 'cost', 'netrate', 'averagerate', 'avragerate', 'purrate', 'buyprice', 'buyingprice', 'buyrate', 'costrate', 'purchaserate', 'cp', 'purchaseprice', 'inwardrate', 'inwardprice', 'lastpurrate', 'buy'].includes(norm);
      });
      if (key) {
        const v = parseFloat(String(raw[key]).replace(/[^0-9.-]/g, ''));
        if (!isNaN(v) && v > 0) costPrice = v;
      }
    }

    let retailPrice = typeof p.retailPrice === 'number' ? p.retailPrice : (typeof p.salePrice === 'number' ? p.salePrice : 0);
    if (retailPrice <= 0 && raw) {
      const key = Object.keys(raw).find(k => ['retailprice', 'retail', 'sellingprice', 'sp', 'rate', 'price'].includes(k.toLowerCase().replace(/[^a-z0-9]/g, '')));
      if (key) {
        const v = parseFloat(String(raw[key]).replace(/[^0-9.-]/g, ''));
        if (!isNaN(v) && v > 0) retailPrice = v;
      }
    }

    let mrp = typeof p.mrp === 'number' ? p.mrp : 0;
    if (mrp <= 0 && raw) {
      const key = Object.keys(raw).find(k => ['mrp', 'maxretailprice', 'listprice', 'markedprice', 'originalprice'].includes(k.toLowerCase().replace(/[^a-z0-9]/g, '')));
      if (key) {
        const v = parseFloat(String(raw[key]).replace(/[^0-9.-]/g, ''));
        if (!isNaN(v) && v > 0) mrp = v;
      }
    }

    // 9. Last Purchase Info
    let lastPurchaseDate = p.lastPurchaseDate || '';
    if (!lastPurchaseDate && raw) {
      const key = Object.keys(raw).find(k => ['lastpurdate', 'lastpurchasedate', 'purchasedate', 'purdate', 'pdate'].includes(k.toLowerCase().replace(/[^a-z0-9]/g, '')));
      if (key) lastPurchaseDate = String(raw[key] || '').trim();
    }

    let lastPurchaseNo = p.lastPurchaseNo || p.lastPurchaseNumber || '';
    if (!lastPurchaseNo && raw) {
      const key = Object.keys(raw).find(k => ['lastpurno', 'last_pur_no', 'purno', 'pur_no', 'invoiceno'].includes(k.toLowerCase().replace(/[^a-z0-9]/g, '')));
      if (key) lastPurchaseNo = String(raw[key] || '').trim();
    }

    return {
      id: `${sessionId}_${p.id}`,
      auditId: sessionId,
      productId: p.id,
      storeId,
      barcode: p.barcode || '',
      productName: p.name || 'Unnamed Product',
      mainCode,
      bansalCode,
      code: bansalCode,
      localCode: bansalCode,
      category,
      brand,
      manufacturer,
      supplierName: supplier,
      supplier,
      openingStock,
      openingQty: openingStock,
      purchaseQty,
      purchasedQty: typeof (p as any).purchasedQty === 'number' ? (p as any).purchasedQty : purchaseQty,
      freeQty: typeof (p as any).freeQty === 'number' ? (p as any).freeQty : (raw?.freeQty ? Number(raw.freeQty) : 0),
      supplierEntries: (p as any).supplierEntries || undefined,
      salesCount: salesQty,
      salesQty,
      stock: closingStock,
      closingStock,
      costPrice,
      cost: costPrice,
      retailPrice,
      salePrice: retailPrice,
      mrp,
      focusOffer: (p as any).focusOffer || (p as any).offer || undefined,
      focusMrp: (p as any).focusMrp || (mrp > 0 ? mrp : undefined),
      lastPurchaseDate,
      lastPurchaseNo,
      lastPurchaseNumber: lastPurchaseNo,
      status: 'pending',
    };
  });

  const session: AuditSession = {
    id: sessionId,
    storeId,
    title,
    type,
    categoryFilter,
    mainCodeFilter,
    rankRange,
    filterConditions,
    reportPeriod,
    datasetVersion,
    focusMonth,
    sourceList,
    purchaseMeta: params.purchaseMeta,
    status: 'in_progress',
    createdAt: now,
    totalItems: products.length,
    completedCount: 0,
    flaggedCount: 0,
    productIds,
    currentIndex: 0,
  };

  await saveAuditSessionDB(session);
  await saveAuditResultsDB(results);

  return { session, results };
}

/**
 * Checks if a Daily Purchase Audit for the same store and report period/file has already been created.
 */
export async function checkDuplicatePurchaseReport(
  storeId: string,
  reportPeriod: string,
  fileName?: string
): Promise<AuditSession | null> {
  const sessions = await getAllAuditSessionsDB(storeId);
  const normPeriod = (reportPeriod || '').trim().toLowerCase();
  const normFile = (fileName || '').trim().toLowerCase();

  const found = sessions.find((s) => {
    if (s.type !== 'daily_purchase') return false;
    const sPeriod = (s.reportPeriod || s.purchaseMeta?.periodStr || '').trim().toLowerCase();
    const sFile = (s.purchaseMeta?.fileName || '').trim().toLowerCase();
    if (normPeriod && sPeriod === normPeriod) return true;
    if (normFile && sFile && sFile === normFile) return true;
    return false;
  });

  return found || null;
}

/**
 * Saves or updates an individual product audit result, recalculates session progress,
 * and updates session status automatically if completed.
 */
export async function saveProductResult(result: AuditProductResult): Promise<{
  session: AuditSession | null;
  result: AuditProductResult;
}> {
  const now = new Date().toISOString();
  const d = new Date(now);
  const defaultDate = d.toLocaleDateString();
  const defaultTime = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  let flaggedAt = result.flaggedAt;
  if (result.status === 'flagged' && !flaggedAt) {
    flaggedAt = now;
  }
  let resolvedAt = result.resolvedAt;
  if (result.status === 'resolved' && !resolvedAt) {
    resolvedAt = now;
  }

  const updatedResult: AuditProductResult = {
    ...result,
    checkedAt: result.checkedAt || now,
    checkedDate: result.checkedDate || defaultDate,
    checkedTime: result.checkedTime || defaultTime,
    flaggedAt,
    resolvedAt,
  };

  await saveSingleAuditResultDB(updatedResult);

  const session = await getAuditSessionDB(updatedResult.auditId);
  if (!session) {
    return { session: null, result: updatedResult };
  }

  const allResults = await getAuditResultsBySessionDB(session.id);

  let completedCount = 0;
  let flaggedCount = 0;
  let doneCount = 0;
  let resolvedCount = 0;

  for (const r of allResults) {
    if (r.status === 'done' || r.status === 'flagged' || r.status === 'resolved') {
      completedCount++;
    }
    if (r.status === 'done') doneCount++;
    if (r.status === 'flagged') flaggedCount++;
    if (r.status === 'resolved') resolvedCount++;
  }

  const pendingCount = session.totalItems - completedCount;

  // Find next pending index
  const nextPendingIndex = session.productIds.findIndex((pId) => {
    const res = allResults.find((r) => r.productId === pId);
    return !res || res.status === 'pending';
  });

  const isFinished = completedCount >= session.totalItems;

  const updatedSession: AuditSession = {
    ...session,
    completedCount,
    flaggedCount,
    doneCount,
    pendingCount,
    resolvedCount,
    currentIndex: nextPendingIndex !== -1 ? nextPendingIndex : session.totalItems - 1,
    status: isFinished ? 'completed' : 'in_progress',
    completedAt: isFinished ? (session.completedAt || now) : undefined,
  };

  await saveAuditSessionDB(updatedSession);

  return { session: updatedSession, result: updatedResult };
}

/**
 * Loads all active (in_progress) audit sessions, optionally filtered by storeId.
 */
export async function loadActiveSessions(storeId?: string): Promise<AuditSession[]> {
  const allSessions = await loadAllSessions(storeId);
  return allSessions
    .filter((s) => s.status === 'in_progress')
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/**
 * Loads all audit sessions (active & completed) directly from local IndexedDB.
 */
export async function loadAllSessions(storeId?: string): Promise<AuditSession[]> {
  const sid = storeId || 'store_1';
  const allSessions = await getAllAuditSessionsDB(sid);
  return allSessions.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

/**
 * Refreshes sessions directly from local IndexedDB.
 */
export async function forceRefreshSessions(storeId: string): Promise<AuditSession[]> {
  const all = await getAllAuditSessionsDB(storeId || 'store_1');
  return all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/**
 * Resumes an audit session by ID, returning session details and all results from IndexedDB.
 */
export async function resumeSession(sessionId: string): Promise<{
  session: AuditSession | null;
  results: AuditProductResult[];
}> {
  const session = await getAuditSessionDB(sessionId);
  if (!session) {
    return { session: null, results: [] };
  }
  const results = await getAuditResultsBySessionDB(sessionId);
  return { session, results };
}

/**
 * Manually marks an audit session as completed.
 */
export async function markSessionCompleted(sessionId: string): Promise<AuditSession | null> {
  const session = await getAuditSessionDB(sessionId);
  if (!session) return null;

  const updatedSession: AuditSession = {
    ...session,
    status: 'completed',
    completedAt: new Date().toISOString(),
  };

  await saveAuditSessionDB(updatedSession);
  return updatedSession;
}

/**
 * Retrieves all items across sessions that are flagged for follow-up.
 * Leveraging IndexedDB/local cache for fast visual rendering without massive nested reads.
 */
export async function getFlaggedItems(storeId?: string, includeResolved = false): Promise<AuditProductResult[]> {
  const sid = storeId || 'store_1';
  if (includeResolved) {
    return await getAllFlaggedAndResolvedResultsDB(sid);
  }
  return await getAllFlaggedResultsDB(sid);
}

/**
 * Resolves a flagged audit product result with resolution notes locally.
 */
export async function resolveFlaggedItem(
  resultId: string,
  resolutionRemark: string
): Promise<AuditProductResult | null> {
  const now = new Date().toISOString();
  
  const flaggedItems = await getAllFlaggedAndResolvedResultsDB();
  const target = flaggedItems.find((item) => item.id === resultId);

  if (!target) {
    return null;
  }

  const updatedResult: AuditProductResult = {
    ...target,
    status: 'resolved',
    resolvedAt: now,
    resolutionRemark,
  };

  await saveSingleAuditResultDB(updatedResult);

  const session = await getAuditSessionDB(target.auditId);
  if (session) {
    const sessionResults = await getAuditResultsBySessionDB(session.id);
    const newFlaggedCount = sessionResults.filter((r) => r.status === 'flagged').length;
    const newResolvedCount = sessionResults.filter((r) => r.status === 'resolved').length;
    const updatedSession = {
      ...session,
      flaggedCount: newFlaggedCount,
      resolvedCount: newResolvedCount,
    };
    await saveAuditSessionDB(updatedSession);
  }

  return updatedResult;
}

/**
 * Creates a controlled, completed reference Zero Sale audit session
 * matching the exact test specifications:
 * 1. Checked OK product
 * 2. Not On Floor product
 * 3. Board Missing product
 * 4. Action Required damaged/expired product
 * 5. Two products checked by different employees (Arpit Patel & Ramesh Kumar)
 * 6. Bansal Code beginning with zero (013006849)
 * 7. Valid LPD (15/04/2026)
 * 8. Missing LPD (null/empty)
 */
export async function seedTestZeroSaleAudit(storeId: string = 'store_1'): Promise<AuditSession> {
  const sessionId = `session_zero_sale_test_ref_17052026`;
  const createdAt = '2026-05-17T09:00:00.000Z';
  const completedAt = '2026-05-17T11:30:00.000Z';

  const session: AuditSession = {
    id: sessionId,
    storeId,
    type: 'zero_sales',
    title: 'ZERO SALE 17-05-2026 CORE',
    createdAt,
    completedAt,
    status: 'completed',
    totalItems: 8,
    completedCount: 8,
    doneCount: 4,
    flaggedCount: 4,
    resolvedCount: 0,
    mainCodeFilter: ['FOOD', 'GROCERY', 'NON-FOOD'],
    productIds: ['p_amul_butter_500g', 'p_maggi_noodles_4p', 'p_fortune_soya_1l', 'p_britannia_goodday_120g', 'p_dabur_red_200g', 'p_surf_excel_1kg', 'p_tata_tea_500g', 'p_local_veg_basket'],
    reportPeriod: '17/04/2026 To 17/05/2026',
    activeChecker: 'Arpit Patel',
    filterConditions: 'CORE Period : 17/04/2026 To 17/05/2026'
  };

  const results: AuditProductResult[] = [
    {
      id: `${sessionId}_p1`,
      auditId: sessionId,
      productId: 'p_amul_butter_500g',
      productName: 'AMUL BUTTER PASTEURISED 500G',
      barcode: '8901262010052',
      bansalCode: '013006849',
      mainCode: 'FOOD',
      category: 'DAIRY',
      brand: 'AMUL',
      supplierName: 'GUJARAT CO-OP MILK MARKETING FED',
      openingStock: 24,
      purchaseQty: 0,
      salesCount: 0,
      stock: 24,
      costPrice: 240.50,
      mrp: 275.00,
      retailPrice: 265.00,
      lastPurchaseDate: '15/04/2026',
      locationStatus: 'on_floor',
      isOnFloor: true,
      displayPosition: 'eye_level',
      visibilityLevel: 'eye_level',
      boardStatus: 'board_correct',
      status: 'done',
      checkedBy: 'Arpit Patel',
      checkedAt: '2026-05-17T09:15:00.000Z',
      checkedDate: '17/05/2026',
      checkedTime: '09:15 AM',
      remarks: 'Product on Eye Level Rack; board correct.',
      storeId
    },
    {
      id: `${sessionId}_p2`,
      auditId: sessionId,
      productId: 'p_maggi_noodles_4p',
      productName: 'MAGGI 2-MINUTE NOODLES PACK OF 4',
      barcode: '8901058852310',
      bansalCode: '004581230',
      mainCode: 'FOOD',
      category: 'INSTANT FOOD',
      brand: 'MAGGI',
      supplierName: 'NESTLE INDIA LTD',
      openingStock: 15,
      purchaseQty: 0,
      salesCount: 0,
      stock: 15,
      costPrice: 48.00,
      mrp: 56.00,
      retailPrice: 54.00,
      lastPurchaseDate: '',
      locationStatus: 'not_found',
      isOnFloor: false,
      boardStatus: 'board_missing',
      status: 'flagged',
      issueReason: 'Product and board not found on floor',
      checkedBy: 'Ramesh Kumar',
      checkedAt: '2026-05-17T09:28:00.000Z',
      checkedDate: '17/05/2026',
      checkedTime: '09:28 AM',
      remarks: 'Product and board not found on floor.',
      storeId
    },
    {
      id: `${sessionId}_p3`,
      auditId: sessionId,
      productId: 'p_fortune_soya_1l',
      productName: 'FORTUNE REFINED SOYABEAN OIL 1L POUCH',
      barcode: '8906007280014',
      bansalCode: '028914002',
      mainCode: 'FOOD',
      category: 'EDIBLE OILS',
      brand: 'FORTUNE',
      supplierName: 'ADANI WILMAR LTD',
      openingStock: 30,
      purchaseQty: 0,
      salesCount: 0,
      stock: 30,
      costPrice: 115.00,
      mrp: 140.00,
      retailPrice: 135.00,
      lastPurchaseDate: '20/04/2026',
      locationStatus: 'on_floor',
      isOnFloor: true,
      displayPosition: 'eye_level',
      visibilityLevel: 'eye_level',
      boardStatus: 'board_missing',
      status: 'flagged',
      issueReason: 'Price board missing on shelf',
      checkedBy: 'Arpit Patel',
      checkedAt: '2026-05-17T09:42:00.000Z',
      checkedDate: '17/05/2026',
      checkedTime: '09:42 AM',
      remarks: 'Product on Endcap; board missing.',
      storeId
    },
    {
      id: `${sessionId}_p4`,
      auditId: sessionId,
      productId: 'p_britannia_goodday_120g',
      productName: 'BRITANNIA GOOD DAY CASHEW BISCUITS 120G',
      barcode: '8901063012112',
      bansalCode: '078129045',
      mainCode: 'FOOD',
      category: 'BISCUITS & SNACKS',
      brand: 'BRITANNIA',
      supplierName: 'BRITANNIA INDUSTRIES LTD',
      openingStock: 8,
      purchaseQty: 0,
      salesCount: 0,
      stock: 8,
      costPrice: 22.50,
      mrp: 30.00,
      retailPrice: 28.00,
      lastPurchaseDate: '02/05/2026',
      locationStatus: 'on_floor',
      isOnFloor: true,
      displayPosition: 'below_eye',
      visibilityLevel: 'below_eye',
      boardStatus: 'board_correct',
      status: 'flagged',
      issueReason: 'Damaged/Expired product found on shelf',
      checkedBy: 'Ramesh Kumar',
      checkedAt: '2026-05-17T10:05:00.000Z',
      checkedDate: '17/05/2026',
      checkedTime: '10:05 AM',
      remarks: 'Damaged/Expired product found; remove from sale.',
      storeId
    },
    {
      id: `${sessionId}_p5`,
      auditId: sessionId,
      productId: 'p_dabur_red_200g',
      productName: 'DABUR RED TOOTHPASTE 200G',
      barcode: '8901207001429',
      bansalCode: '055410982',
      mainCode: 'NON-FOOD',
      category: 'ORAL CARE',
      brand: 'DABUR',
      supplierName: 'DABUR INDIA LTD',
      openingStock: 18,
      purchaseQty: 0,
      salesCount: 0,
      stock: 18,
      costPrice: 85.00,
      mrp: 110.00,
      retailPrice: 102.00,
      lastPurchaseDate: '10/05/2026',
      locationStatus: 'on_floor',
      isOnFloor: true,
      displayPosition: 'eye_level',
      visibilityLevel: 'eye_level',
      boardStatus: 'board_correct',
      status: 'done',
      checkedBy: 'Ramesh Kumar',
      checkedAt: '2026-05-17T10:20:00.000Z',
      checkedDate: '17/05/2026',
      checkedTime: '10:20 AM',
      remarks: 'Product on Eye Level Rack; board correct.',
      storeId
    },
    {
      id: `${sessionId}_p6`,
      auditId: sessionId,
      productId: 'p_surf_excel_1kg',
      productName: 'SURF EXCEL EASY WASH DETERGENT POWDER 1KG',
      barcode: '8901030612994',
      bansalCode: '091238471',
      mainCode: 'NON-FOOD',
      category: 'LAUNDRY',
      brand: 'SURF EXCEL',
      supplierName: 'HINDUSTAN UNILEVER LTD',
      openingStock: 12,
      purchaseQty: 0,
      salesCount: 0,
      stock: 12,
      costPrice: 125.00,
      mrp: 155.00,
      retailPrice: 148.00,
      lastPurchaseDate: null as any,
      locationStatus: 'on_floor',
      isOnFloor: true,
      displayPosition: 'below_eye',
      visibilityLevel: 'below_eye',
      boardStatus: 'board_correct',
      status: 'done',
      checkedBy: 'Arpit Patel',
      checkedAt: '2026-05-17T10:45:00.000Z',
      checkedDate: '17/05/2026',
      checkedTime: '10:45 AM',
      remarks: 'Product available Below Eye Level; improve visibility.',
      storeId
    },
    {
      id: `${sessionId}_p7`,
      auditId: sessionId,
      productId: 'p_tata_tea_500g',
      productName: 'TATA TEA PREMIUM 500G',
      barcode: '8901052001028',
      bansalCode: '011293847',
      mainCode: 'FOOD',
      category: 'BEVERAGES',
      brand: 'TATA TEA',
      supplierName: 'TATA CONSUMER PRODUCTS LTD',
      openingStock: 40,
      purchaseQty: 0,
      salesCount: 0,
      stock: 40,
      costPrice: 210.00,
      mrp: 260.00,
      retailPrice: 245.00,
      lastPurchaseDate: '01/04/2026',
      locationStatus: 'on_floor',
      isOnFloor: true,
      displayPosition: 'eye_level',
      visibilityLevel: 'eye_level',
      boardStatus: 'wrong_price',
      status: 'flagged',
      issueReason: 'Wrong price board displayed',
      checkedBy: 'Arpit Patel',
      checkedAt: '2026-05-17T11:05:00.000Z',
      checkedDate: '17/05/2026',
      checkedTime: '11:05 AM',
      remarks: 'Product on floor; wrong price board.',
      storeId
    },
    {
      id: `${sessionId}_p8`,
      auditId: sessionId,
      productId: 'p_local_veg_basket',
      productName: 'LOCAL VEGETABLE BASKET MIX',
      barcode: '8900000192837',
      bansalCode: '000192837',
      mainCode: 'GROCERY',
      category: 'FRESH PRODUCE',
      brand: 'GENERIC',
      supplierName: 'LOCAL MANDI SUPPLIER',
      openingStock: 5,
      purchaseQty: 0,
      salesCount: 0,
      stock: 5,
      costPrice: 40.00,
      mrp: 50.00,
      retailPrice: 50.00,
      lastPurchaseDate: '14/05/2026',
      locationStatus: 'on_floor',
      isOnFloor: true,
      displayPosition: 'eye_level',
      visibilityLevel: 'eye_level',
      boardStatus: 'not_applicable',
      status: 'done',
      checkedBy: 'Ramesh Kumar',
      checkedAt: '2026-05-17T11:25:00.000Z',
      checkedDate: '17/05/2026',
      checkedTime: '11:25 AM',
      remarks: 'Bulk floor bin display; board N/A.',
      storeId
    }
  ];

  await saveAuditSessionDB(session);
  await saveAuditResultsDB(results);

  return session;
}

/**
 * Deletes an audit session and its product results locally in IndexedDB.
 */
export async function deleteAuditSession(sessionId: string, _storeId?: string): Promise<void> {
  await deleteAuditSessionDB(sessionId);
}

