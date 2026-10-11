import { Product, BarcodeCandidateProduct, BarcodeCandidateReason, BarcodeCandidateBadge, BarcodeMasterIdentity, BarcodeOverride } from '../types';
import { findBarcodeMasterItemsDB, getProductsDB, getBarcodeOverrideForBarcodeDB } from './indexedDB';
import { cleanBarcode } from './fileParser';

export type { BarcodeCandidateProduct, BarcodeCandidateReason, BarcodeCandidateBadge, BarcodeMasterIdentity, BarcodeOverride };

export type BarcodeResolutionType =
  | 'current_stock'
  | 'saved_override'
  | 'barcode_master'
  | 'store_label_fallback'
  | 'current_stock_conflict'
  | 'barcode_master_conflict'
  | 'barcode_identity_conflict'
  | 'stale_override_conflict'
  | 'store_label_conflict'
  | 'mapped_product_not_in_current_stock'
  | 'mapped_but_no_stock'
  | 'not_mapped';

export interface BarcodeResolveResult {
  ok: boolean;
  found: boolean;
  resolution: BarcodeResolutionType;
  ambiguous: boolean;
  barcode: string;
  rawBarcode?: string;
  message: string;
  product: Product | null;
  candidates: Product[];
  candidateDetails?: BarcodeCandidateProduct[];
  masterIdentity?: BarcodeMasterIdentity;
  overrideIdentity?: BarcodeOverride;
  isStaleOverride?: boolean;
  mappings?: { localCode: string; itemName?: string; uom?: string }[];
  storeLabelCode?: string;
}

/**
 * Normalizes a scanned/searched barcode or EAN:
 * 1. Convert to string
 * 2. Trim whitespace
 * 3. Remove trailing numeric ".0" if present
 * 4. Remove ALL whitespace characters (spaces, tabs)
 */
export function normalizeScannedBarcode(value: unknown): string {
  let barcode = String(value ?? '').trim();
  barcode = barcode.replace(/\.0+$/, '');
  barcode = barcode.replace(/\s+/g, '');
  return barcode;
}

/**
 * Normalizes Local Code / Bansal Code:
 * 1. Convert to string
 * 2. Trim whitespace
 * 3. Remove trailing numeric ".0" if present
 * 4. Remove non-digits
 * 5. Left-pad with zeros to 9 digits (e.g. 2003200 -> 002003200)
 */
export function normalizeLocalCode(value: unknown): string {
  let code = String(value ?? '').trim();
  code = code.replace(/\.0+$/, '');
  code = code.replace(/\D/g, '');
  if (code.length > 0 && code.length <= 9) {
    code = code.padStart(9, '0');
  }
  return code;
}

/**
 * Normalizes UOM strings to standard representations:
 * - 350g, 350gm, 350 grams -> 350g
 * - 1.5kg, 1.500kg -> 1.5kg
 * - 500ml, 500 ml -> 500ml
 * - 1l, 1 ltr, 1 liter -> 1l
 * - 12 pcs, 12pk -> 12pcs
 */
export function normalizeUomString(uomStr: string): string {
  if (!uomStr) return '';
  let uom = uomStr.trim().toLowerCase();
  uom = uom.replace(/\s+/g, '');
  uom = uom.replace(/^[-/,:]+/, '');

  // Weight (grams / kg)
  const gMatch = uom.match(/^(\d+(?:\.\d+)?)(?:g|gm|gms|gram|grams|grm)$/i);
  if (gMatch) {
    const val = parseFloat(gMatch[1]);
    if (val >= 1000 && val % 1000 === 0) {
      return `${val / 1000}kg`;
    }
    return `${val}g`;
  }

  const kgMatch = uom.match(/^(\d+(?:\.\d+)?)(?:kg|kgs|kilo|kilogram|kilograms)$/i);
  if (kgMatch) {
    const val = parseFloat(kgMatch[1]);
    return `${val}kg`;
  }

  // Volume (ml / liters)
  const mlMatch = uom.match(/^(\d+(?:\.\d+)?)(?:ml|m\.l\.)$/i);
  if (mlMatch) {
    const val = parseFloat(mlMatch[1]);
    if (val >= 1000 && val % 1000 === 0) {
      return `${val / 1000}l`;
    }
    return `${val}ml`;
  }

  const lMatch = uom.match(/^(\d+(?:\.\d+)?)(?:l|ltr|liter|litre|liters|litres)$/i);
  if (lMatch) {
    const val = parseFloat(lMatch[1]);
    return `${val}l`;
  }

  // Count / Pack / Pcs
  const pcsMatch = uom.match(/^(\d+)(?:pc|pcs|piece|pieces|pk|pack|packs|n|nos|units?|sachets?|tabs?|tablets?)$/i);
  if (pcsMatch) {
    return `${pcsMatch[1]}pcs`;
  }

  return uom;
}

/**
 * Extracts and separates embedded UOM from product name or declared UOM field.
 */
export function extractUomAndBaseName(
  name: string,
  declaredUom?: string
): { baseName: string; normalizedUom: string } {
  let cleanName = (name || '').trim();
  let foundUom = '';

  if (declaredUom && declaredUom.trim()) {
    foundUom = normalizeUomString(declaredUom);
  }

  // Check for common UOM patterns embedded in product title (e.g. "PARLE MILK SHAKTI 350G", "COOKIE 60 g", "OIL 1 LTR")
  const uomRegex = /(?:^|[\s\-_/,])(\d+(?:\.\d+)?\s*(?:g|gm|gms|gram|grams|grm|kg|kgs|kilo|kilogram|ml|ltr|lt|l|liter|litre|pc|pcs|piece|pieces|pk|pack|packs|n|nos))\b/i;
  const match = cleanName.match(uomRegex);

  if (match) {
    const rawMatch = match[1];
    if (!foundUom) {
      foundUom = normalizeUomString(rawMatch);
    }
    // Remove the UOM from baseName
    cleanName = cleanName.replace(match[0], ' ').trim();
  }

  // Remove trailing and leading punctuation
  cleanName = cleanName.replace(/^[-/,:]+|[-/,:]+$/g, '').trim();

  return {
    baseName: cleanName,
    normalizedUom: foundUom
  };
}

/**
 * Common noise tokens to ignore when comparing core product identity
 */
const NOISE_TOKENS = new Set([
  'THE', 'OF', 'AND', '&', 'WITH', 'FOR', 'IN', 'ON', 'AT', 'TO', 'BY', 'A', 'AN',
  'NEW', 'FREE', 'OFF', 'PROMO', 'PACK', 'PKT', 'PACKET', 'BOX', 'JAR', 'POUCH',
  'BOTTLE', 'CAN', 'SPECIAL', 'COMBO', 'BUY', 'GET', 'REGULAR', 'CLASSIC', 'PREMIUM'
]);

/**
 * Extracts clean, distinctive tokens from product name
 */
export function extractSignificantTokens(text: string): string[] {
  if (!text) return [];
  const normalized = text
    .toUpperCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) return [];
  return normalized
    .split(' ')
    .map((t) => t.trim())
    .filter((t) => t.length > 1 && !NOISE_TOKENS.has(t));
}

/**
 * Compares Barcode Master Item identity with Current Stock product identity.
 * Evaluates base product names and UOM / pack size.
 */
export function compareProductIdentities(
  master: { name: string; uom?: string },
  current: { name: string; uom?: string }
): {
  isMatch: boolean;
  isDefiniteMismatch: boolean;
  similarity: number;
  reason: string;
} {
  const masterParsed = extractUomAndBaseName(master.name, master.uom);
  const currentParsed = extractUomAndBaseName(current.name, current.uom);

  const masterTokens = extractSignificantTokens(masterParsed.baseName);
  const currentTokens = extractSignificantTokens(currentParsed.baseName);

  // 1. UOM comparison
  const uomMaster = masterParsed.normalizedUom;
  const uomCurrent = currentParsed.normalizedUom;
  let uomMismatch = false;

  if (uomMaster && uomCurrent && uomMaster !== uomCurrent) {
    uomMismatch = true;
  }

  // 2. Token overlap comparison
  if (masterTokens.length === 0 || currentTokens.length === 0) {
    // If one is empty, fallback to simple string equality
    const exactSame = master.name.trim().toLowerCase() === current.name.trim().toLowerCase();
    return {
      isMatch: exactSame && !uomMismatch,
      isDefiniteMismatch: !exactSame || uomMismatch,
      similarity: exactSame ? 1 : 0,
      reason: exactSame ? 'Exact Name Match' : 'Name Mismatch'
    };
  }

  const masterSet = new Set(masterTokens);
  const currentSet = new Set(currentTokens);

  let sharedCount = 0;
  for (const token of masterTokens) {
    if (currentSet.has(token)) sharedCount++;
  }

  const unionSize = new Set([...masterTokens, ...currentTokens]).size;
  const jaccard = sharedCount / (unionSize || 1);
  const overlapRatio = sharedCount / Math.min(masterTokens.length, currentTokens.length);

  // Check distinctive non-brand difference (e.g. Parle Milk Shakti vs Parle Milano)
  // If master has distinct words that do NOT appear in current, and current has distinct words that do not appear in master:
  const masterDiff = masterTokens.filter((t) => !currentSet.has(t));
  const currentDiff = currentTokens.filter((t) => !masterSet.has(t));

  // If UOM is strongly different (e.g. 350g vs 60g) AND name has differing tokens -> Definite mismatch
  if (uomMismatch && (masterDiff.length > 0 || currentDiff.length > 0)) {
    return {
      isMatch: false,
      isDefiniteMismatch: true,
      similarity: jaccard,
      reason: `UOM Mismatch (${uomMaster} vs ${uomCurrent}) & Name Differences`
    };
  }

  // If major core nouns differ completely (e.g. MILK SHAKTI vs MILANO CHOCO HAZELNUT COOKIE)
  if (sharedCount <= 1 && (masterDiff.length >= 1 || currentDiff.length >= 2)) {
    return {
      isMatch: false,
      isDefiniteMismatch: true,
      similarity: jaccard,
      reason: 'Distinct Product Descriptors Differ'
    };
  }

  // High similarity and compatible UOM
  if (overlapRatio >= 0.75 && !uomMismatch) {
    return {
      isMatch: true,
      isDefiniteMismatch: false,
      similarity: jaccard,
      reason: 'Name & UOM Match'
    };
  }

  // Substantial match
  if (jaccard >= 0.6 && !uomMismatch) {
    return {
      isMatch: true,
      isDefiniteMismatch: false,
      similarity: jaccard,
      reason: 'Strong Descriptor Overlap'
    };
  }

  return {
    isMatch: false,
    isDefiniteMismatch: true,
    similarity: jaccard,
    reason: 'Descriptor Incompatibility'
  };
}

/**
 * Searches Current Stock for products matching Barcode Master Item Name and UOM.
 */
export function findMatchingStockProductsForMasterIdentity(
  master: { itemName: string; uom?: string },
  products: Product[]
): { product: Product; score: number; reason: BarcodeCandidateReason }[] {
  const matches: { product: Product; score: number; reason: BarcodeCandidateReason }[] = [];

  for (const p of products) {
    const pName = p.name || p.itemName || '';
    const pUom = p.unit || '';
    const comp = compareProductIdentities(
      { name: master.itemName, uom: master.uom },
      { name: pName, uom: pUom }
    );

    if (comp.isMatch) {
      matches.push({
        product: p,
        score: comp.similarity,
        reason: 'Name + UOM Match'
      });
    }
  }

  // Sort descending by similarity score
  matches.sort((a, b) => b.score - a.score);
  return matches;
}

/**
 * Converts raw candidate/product data into standard Product shape
 */
export function normalizeCandidateToProduct(
  raw: any,
  searchedBarcode: string,
  localStockProducts?: Product[]
): Product {
  const code = String(raw.bansalCode || raw.localCode || raw.code || '').trim();
  const rawBarcode = String(raw.barcode || raw.currentBarcode || searchedBarcode || '').trim();
  const name = String(raw.name || raw.itemName || 'Item ' + (code || rawBarcode)).trim();
  const mrp = Number(raw.mrp ?? raw.retailPrice ?? 0);
  const stock = Number(
    raw.stock ?? raw.currentStock ?? raw.closingStock ?? raw.closingQty ?? 0
  );
  const retailPrice = Number(raw.retailPrice ?? raw.salePrice ?? mrp);

  if (localStockProducts && localStockProducts.length > 0 && code) {
    const normC = normalizeLocalCode(code);
    const localMatch = localStockProducts.find((p) => {
      const pCode = normalizeLocalCode(p.bansalCode || p.localCode || p.code);
      return pCode === normC;
    });
    if (localMatch) {
      return {
        ...localMatch,
        barcode: localMatch.barcode || rawBarcode,
        bansalCode: localMatch.bansalCode || code,
        localCode: localMatch.localCode || code,
        code: localMatch.code || code
      };
    }
  }

  return {
    id: raw.id || `prod_${code || rawBarcode}_${Date.now()}`,
    barcode: rawBarcode,
    name,
    itemName: name,
    bansalCode: code,
    localCode: code,
    code,
    mrp: isNaN(mrp) ? 0 : mrp,
    retailPrice: isNaN(retailPrice) ? mrp : retailPrice,
    salePrice: isNaN(retailPrice) ? mrp : retailPrice,
    stock: isNaN(stock) ? 0 : stock,
    closingStock: isNaN(stock) ? 0 : stock,
    salesCount: Number(raw.salesCount ?? raw.salesQty ?? 0),
    category: raw.category || '',
    brand: raw.brand || '',
    unit: raw.unit || '',
    mainCode: raw.mainCode || ''
  };
}

/**
 * STRICT EXACT matching function used for physical barcode scans (camera and hardware wedge).
 * NEVER matches partial digits, substrings, prefixes, names, categories, or metadata.
 * Only returns products with exact matching barcode or 9-digit/exact local code.
 */
export function findExactMatchingProductsInStock(
  query: string,
  products: Product[]
): Product[] {
  if (!query || !query.trim() || !products || products.length === 0) {
    return [];
  }

  const rawTerm = query.trim().toLowerCase();
  const cleanTerm = cleanBarcode(query).toLowerCase();
  const normBarcode = normalizeScannedBarcode(query);
  const normLocal = normalizeLocalCode(query);

  const matches: Product[] = [];

  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    const pRawBar = (p.barcode || '').toLowerCase();
    const pCleanBar = cleanBarcode(p.barcode || '').toLowerCase();
    const pNormBar = normalizeScannedBarcode(p.barcode);

    const pLocalRaw = (p.localCode || p.bansalCode || p.code || '').toLowerCase();
    const pCleanLocal = cleanBarcode(pLocalRaw).toLowerCase();
    const pNormLocal = normalizeLocalCode(p.bansalCode || p.localCode || p.code);

    // Exact Barcode match
    const isExactBarcode =
      (normBarcode.length > 0 && pNormBar === normBarcode) ||
      pRawBar === rawTerm ||
      (cleanTerm.length > 0 && pCleanBar === cleanTerm);

    // Exact Local Code match
    const isExactLocalCode =
      (normLocal.length === 9 && pNormLocal === normLocal) ||
      (pLocalRaw.length > 0 && pLocalRaw === rawTerm) ||
      (cleanTerm.length > 0 && pCleanLocal.length > 0 && pCleanLocal === cleanTerm);

    if (isExactBarcode || isExactLocalCode) {
      matches.push(p);
    }
  }

  return matches;
}

/**
 * Flexible search function used ONLY for manual typing in search bar and suggestion dropdowns.
 * Supports partial matching, product names, categories, and mainCodes.
 */
export function searchProductsFlexible(
  query: string,
  products: Product[],
  options?: { limit?: number }
): Product[] {
  if (!query || !query.trim() || !products || products.length === 0) {
    return [];
  }

  const rawTerm = query.trim().toLowerCase();
  const cleanTerm = cleanBarcode(query).toLowerCase();
  const normBarcode = normalizeScannedBarcode(query);
  const normLocal = normalizeLocalCode(query);

  const exactMatches: Product[] = [];
  const partialMatches: Product[] = [];

  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    const pRawBar = (p.barcode || '').toLowerCase();
    const pCleanBar = cleanBarcode(p.barcode || '').toLowerCase();
    const pNormBar = normalizeScannedBarcode(p.barcode);

    const pLocalRaw = (p.localCode || p.bansalCode || p.code || '').toLowerCase();
    const pCleanLocal = cleanBarcode(pLocalRaw).toLowerCase();
    const pNormLocal = normalizeLocalCode(p.bansalCode || p.localCode || p.code);

    const pName = (p.name || p.itemName || '').toLowerCase();
    const pCat = (p.category || '').toLowerCase();
    const pMain = (p.mainCode || '').toLowerCase();

    // 1. Exact Barcode / Code match
    const isExactBarcode =
      (normBarcode.length > 0 && pNormBar === normBarcode) ||
      pRawBar === rawTerm ||
      (cleanTerm.length > 0 && pCleanBar === cleanTerm);

    const isExactLocalCode =
      (normLocal.length === 9 && pNormLocal === normLocal) ||
      (pLocalRaw.length > 0 && pLocalRaw === rawTerm) ||
      (cleanTerm.length > 0 && pCleanLocal.length > 0 && pCleanLocal === cleanTerm);

    if (isExactBarcode || isExactLocalCode) {
      exactMatches.push(p);
      continue;
    }

    // 2. Substring Barcode / Local Code / Name / Category / MainCode match
    const isSubstringBarcode =
      pRawBar.includes(rawTerm) ||
      (cleanTerm.length > 0 && pCleanBar.includes(cleanTerm)) ||
      (pLocalRaw.length > 0 && pLocalRaw.includes(rawTerm));

    const isNameOrMetaMatch =
      pName.includes(rawTerm) ||
      (pCat.length > 0 && pCat.includes(rawTerm)) ||
      (pMain.length > 0 && pMain.includes(rawTerm));

    if (isSubstringBarcode || isNameOrMetaMatch) {
      partialMatches.push(p);
    }
  }

  const combined = exactMatches.length > 0 ? exactMatches : partialMatches;

  if (options?.limit && options.limit > 0) {
    return combined.slice(0, options.limit);
  }

  return combined;
}

export const findMatchingProductsInStock = searchProductsFlexible;

/**
 * Normalizes a Bansal/Local Code for 16-digit store-printed label comparison ONLY:
 * - Trims whitespace and removes trailing .0
 * - If 1-9 numeric digits, left-pads with zeros to 9 digits (e.g. "13012423" -> "013012423", "2030251" -> "002030251")
 * - If non-numeric or longer than 9 digits, returns as-is without padding or truncation.
 */
export function normalizeBansalCodeForStoreLabel(value: unknown): string {
  if (value === null || value === undefined) return '';
  let code = String(value).trim().replace(/\.0+$/, '');
  if (/^\d{1,9}$/.test(code)) {
    return code.padStart(9, '0');
  }
  return code;
}

/**
 * Checks whether a product matches a 9-digit candidate Bansal Code extracted from a 16-digit store label.
 */
export function matchesStoreLabelBansalCandidate(product: Product, candidateBansalCode: string): boolean {
  if (!candidateBansalCode || candidateBansalCode.length !== 9) return false;
  const codesToCheck = [product.bansalCode, product.localCode, product.code];
  for (const c of codesToCheck) {
    if (!c) continue;
    const normalized = normalizeBansalCodeForStoreLabel(c);
    if (normalized === candidateBansalCode) {
      return true;
    }
  }
  return false;
}

/**
 * Finds matching products in stock for a 16-digit store-printed label:
 * 1. Requires exactly 16 numeric digits
 * 2. Extracts first 9 digits as candidate Bansal Code
 * 3. Resolves candidate against Bansal/Local Code fields only
 * 4. Deduplicates by unique product identity
 */
export function findStoreLabelFallbackProducts(
  rawValue: string,
  products: Product[]
): {
  is16Digits: boolean;
  candidateCode: string;
  matches: Product[];
} {
  const clean = normalizeScannedBarcode(rawValue);
  if (!/^\d{16}$/.test(clean)) {
    return { is16Digits: false, candidateCode: '', matches: [] };
  }

  const candidateCode = clean.slice(0, 9);
  const matchedList: Product[] = [];
  const seenIds = new Set<string>();

  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    if (matchesStoreLabelBansalCandidate(p, candidateCode)) {
      const key = p.id || `${p.bansalCode || ''}_${p.localCode || ''}_${p.code || ''}_${p.barcode || ''}_${p.name || ''}`;
      if (!seenIds.has(key)) {
        seenIds.add(key);
        matchedList.push(p);
      }
    }
  }

  return {
    is16Digits: true,
    candidateCode,
    matches: matchedList
  };
}

/**
 * 100% Offline Local Barcode Resolver with Safe Barcode Master Conflict Resolution.
 *
 * RESOLUTION PRIORITY:
 * 1. Exact full barcode in Current Stock (Direct Match)
 * 2. Valid saved Barcode Override (Stored in IndexedDB)
 * 3. Barcode Master exact EAN lookup (with Identity Mismatch Detection & Candidate Generation)
 * 4. Store-printed 16-digit barcode fallback (First 9 digits -> Bansal Code)
 * 5. Not Mapped
 */
export async function resolveOfflineBarcode(
  rawValue: string,
  localStockProducts?: Product[]
): Promise<BarcodeResolveResult> {
  const normalizedBarcode = normalizeScannedBarcode(rawValue);
  const normalizedSearchCode = normalizeLocalCode(rawValue);

  if (!normalizedBarcode && !normalizedSearchCode) {
    return {
      ok: false,
      found: false,
      resolution: 'not_mapped',
      ambiguous: false,
      barcode: '',
      rawBarcode: rawValue,
      message: 'Barcode not mapped.',
      product: null,
      candidates: []
    };
  }

  // Load products if not supplied
  let products = localStockProducts || [];
  if (products.length === 0) {
    try {
      products = await getProductsDB('store_1');
    } catch {
      products = [];
    }
  }

  // ==================================================
  // PRIORITY 1: Exact full barcode in Current Stock
  // (Full Current Stock matches ALWAYS take priority over overrides and Barcode Master)
  // ==================================================
  const directMatches = findExactMatchingProductsInStock(rawValue, products);

  if (directMatches.length === 1) {
    return {
      ok: true,
      found: true,
      resolution: 'current_stock',
      ambiguous: false,
      barcode: normalizedBarcode || rawValue,
      rawBarcode: rawValue,
      message: 'Current stock barcode verified.',
      product: directMatches[0],
      candidates: directMatches
    };
  }

  if (directMatches.length > 1) {
    return {
      ok: true,
      found: true,
      resolution: 'current_stock_conflict',
      ambiguous: true,
      barcode: normalizedBarcode || rawValue,
      rawBarcode: rawValue,
      message: 'Multiple matching products found in stock. Please choose candidate.',
      product: null,
      candidates: directMatches
    };
  }

  // ==================================================
  // PRIORITY 2: Saved Barcode Overrides
  // (User-confirmed "Always Use This Product" overrides)
  // ==================================================
  try {
    const savedOverride = await getBarcodeOverrideForBarcodeDB(normalizedBarcode || rawValue);
    if (savedOverride) {
      const normTargetCode = normalizeLocalCode(savedOverride.targetBansalCode);
      const targetProduct = products.find((p) => {
        const pCode = normalizeLocalCode(p.bansalCode || p.localCode || p.code);
        return (
          (normTargetCode && pCode === normTargetCode) ||
          p.id === savedOverride.targetBansalCode
        );
      });

      if (targetProduct) {
        // Validate target current product identity still matches saved product name
        const idCheck = compareProductIdentities(
          { name: savedOverride.targetProductName },
          { name: targetProduct.name || targetProduct.itemName || '', uom: targetProduct.unit }
        );

        if (idCheck.isMatch) {
          return {
            ok: true,
            found: true,
            resolution: 'saved_override',
            ambiguous: false,
            barcode: normalizedBarcode || rawValue,
            rawBarcode: rawValue,
            message: 'Saved Barcode Override',
            product: targetProduct,
            candidates: [targetProduct],
            overrideIdentity: savedOverride
          };
        } else {
          // Stale override: Code was reused or product identity changed!
          const candidateDetails: BarcodeCandidateProduct[] = [
            {
              product: targetProduct,
              reason: 'Saved Override (Stale)',
              badge: 'STALE',
              isRecommended: false,
              uom: targetProduct.unit
            }
          ];
          return {
            ok: true,
            found: false,
            resolution: 'stale_override_conflict',
            ambiguous: true,
            barcode: normalizedBarcode || rawValue,
            rawBarcode: rawValue,
            message: 'Saved barcode override is stale: product identity in stock has changed.',
            product: null,
            candidates: [targetProduct],
            candidateDetails,
            overrideIdentity: savedOverride,
            isStaleOverride: true
          };
        }
      } else {
        // Target product removed from stock -> Stale override
        return {
          ok: true,
          found: false,
          resolution: 'stale_override_conflict',
          ambiguous: true,
          barcode: normalizedBarcode || rawValue,
          rawBarcode: rawValue,
          message: 'Saved barcode override is stale: target product is not in current stock.',
          product: null,
          candidates: [],
          overrideIdentity: savedOverride,
          isStaleOverride: true
        };
      }
    }
  } catch (err) {
    console.warn('Barcode override lookup warning:', err);
  }

  // ==================================================
  // PRIORITY 3: Barcode Master Lookup & Identity Verification
  // ==================================================
  try {
    const masterMappings = await findBarcodeMasterItemsDB(normalizedBarcode || rawValue);

    if (masterMappings.length > 0) {
      const firstMaster = masterMappings[0];
      const masterIdentity: BarcodeMasterIdentity = {
        ean: normalizedBarcode || rawValue,
        code: firstMaster.code,
        itemName: firstMaster.itemName || '',
        uom: firstMaster.uom
      };

      // Retrieve mapped Local Code(s) normalized to 9 digits
      const mappedLocalCodes = Array.from(
        new Set(
          masterMappings
            .map((m) => normalizeLocalCode(m.code))
            .filter((c) => Boolean(c) && c.length === 9)
        )
      );

      // Find product in Current Stock with the mapped code
      const oldStockProducts = products.filter((p) => {
        const pLocal = normalizeLocalCode(p.bansalCode || p.localCode || p.code);
        return mappedLocalCodes.includes(pLocal);
      });

      // Find current stock products matching the Master Item Name + UOM
      const identityMatchedStock = findMatchingStockProductsForMasterIdentity(
        { itemName: firstMaster.itemName, uom: firstMaster.uom },
        products
      );

      // Evaluate identity match for old mapped code
      let oldStockProductMatchesIdentity = false;
      let oldStockProductDefiniteMismatch = false;

      if (oldStockProducts.length === 1) {
        const oldP = oldStockProducts[0];
        const comp = compareProductIdentities(
          { name: firstMaster.itemName, uom: firstMaster.uom },
          { name: oldP.name || oldP.itemName || '', uom: oldP.unit }
        );
        oldStockProductMatchesIdentity = comp.isMatch;
        oldStockProductDefiniteMismatch = comp.isDefiniteMismatch;
      }

      // Case A: Safe, Unambiguous Match!
      // Old mapped product exists in stock, its identity matches Master, no conflicting matches, single master mapping.
      if (
        oldStockProducts.length === 1 &&
        oldStockProductMatchesIdentity &&
        !oldStockProductDefiniteMismatch &&
        masterMappings.length === 1
      ) {
        return {
          ok: true,
          found: true,
          resolution: 'barcode_master',
          ambiguous: false,
          barcode: normalizedBarcode || rawValue,
          rawBarcode: rawValue,
          message: 'Resolved via Barcode Master.',
          product: oldStockProducts[0],
          candidates: oldStockProducts,
          masterIdentity,
          mappings: masterMappings.map((m) => ({
            localCode: m.code,
            itemName: m.itemName,
            uom: m.uom
          }))
        };
      }

      // Case B: Identity Mismatch / Reused Code / Multiple Candidates!
      // Must build candidate list and show Safe Conflict Selection Modal.
      const candidateList: BarcodeCandidateProduct[] = [];
      const seenProductKeys = new Set<string>();

      // 1. Recommended Candidate(s): Current stock products matching Master identity (Name + UOM)
      for (const item of identityMatchedStock) {
        const p = item.product;
        const key = p.id || normalizeLocalCode(p.bansalCode || p.localCode || p.code);
        if (!seenProductKeys.has(key)) {
          seenProductKeys.add(key);
          candidateList.push({
            product: p,
            reason: 'Name + UOM Match',
            badge: 'RECOMMENDED',
            isRecommended: true,
            uom: p.unit || masterIdentity.uom
          });
        }
      }

      // 2. Conflicting Old-Code Candidate(s): Current product carrying the historical code
      for (const oldP of oldStockProducts) {
        const key = oldP.id || normalizeLocalCode(oldP.bansalCode || oldP.localCode || oldP.code);
        if (!seenProductKeys.has(key)) {
          seenProductKeys.add(key);
          const isIdentMatch = compareProductIdentities(
            { name: firstMaster.itemName, uom: firstMaster.uom },
            { name: oldP.name || oldP.itemName || '', uom: oldP.unit }
          ).isMatch;

          candidateList.push({
            product: oldP,
            reason: isIdentMatch ? 'Name + UOM Match' : 'Old Mapped Code — Identity Mismatch',
            badge: isIdentMatch ? 'MATCH' : 'CONFLICT',
            isRecommended: false,
            uom: oldP.unit
          });
        }
      }

      const productsOnly = candidateList.map((c) => c.product);

      if (candidateList.length > 0) {
        return {
          ok: true,
          found: true,
          resolution: oldStockProductDefiniteMismatch
            ? 'barcode_identity_conflict'
            : 'barcode_master_conflict',
          ambiguous: true,
          barcode: normalizedBarcode || rawValue,
          rawBarcode: rawValue,
          message: oldStockProductDefiniteMismatch
            ? 'Barcode Master product identity differs from current stock code assignment.'
            : 'Multiple product candidates found for mapped barcode.',
          product: null,
          candidates: productsOnly,
          candidateDetails: candidateList,
          masterIdentity,
          mappings: masterMappings.map((m) => ({
            localCode: m.code,
            itemName: m.itemName,
            uom: m.uom
          }))
        };
      }

      // Mapped in Barcode Master, but no product found in current stock
      if (products.length === 0) {
        return {
          ok: true,
          found: false,
          resolution: 'mapped_but_no_stock',
          ambiguous: false,
          barcode: normalizedBarcode || rawValue,
          rawBarcode: rawValue,
          message: 'Barcode is mapped, but no current stock file is loaded.',
          product: null,
          candidates: [],
          masterIdentity
        };
      }

      return {
        ok: true,
        found: false,
        resolution: 'mapped_product_not_in_current_stock',
        ambiguous: false,
        barcode: normalizedBarcode || rawValue,
        rawBarcode: rawValue,
        message: 'Barcode mapped in Barcode Master, but product is not in current stock.',
        product: null,
        candidates: [],
        masterIdentity
      };
    }
  } catch (err) {
    console.warn('Local Barcode Master lookup warning:', err);
  }

  // ==================================================
  // PRIORITY 4: Store-Printed 16-Digit Barcode Fallback
  // (First 9 digits match printed Bansal code)
  // ==================================================
  const storeLabelCheck = findStoreLabelFallbackProducts(rawValue, products);
  if (storeLabelCheck.is16Digits) {
    const candidateCode = storeLabelCheck.candidateCode;
    const fallbackMatches = storeLabelCheck.matches;

    if (fallbackMatches.length === 1) {
      return {
        ok: true,
        found: true,
        resolution: 'store_label_fallback',
        ambiguous: false,
        barcode: normalizedBarcode || rawValue,
        rawBarcode: rawValue,
        message: `Store Label • Code: ${candidateCode}`,
        product: fallbackMatches[0],
        candidates: fallbackMatches,
        storeLabelCode: candidateCode
      };
    }

    if (fallbackMatches.length > 1) {
      const candidateDetails: BarcodeCandidateProduct[] = fallbackMatches.map((p) => ({
        product: p,
        reason: 'Store Label Candidate',
        badge: 'MATCH',
        isRecommended: false,
        uom: p.unit
      }));

      return {
        ok: true,
        found: true,
        resolution: 'store_label_conflict',
        ambiguous: true,
        barcode: normalizedBarcode || rawValue,
        rawBarcode: rawValue,
        message: `Multiple matching products found for store label code (${candidateCode}).`,
        product: null,
        candidates: fallbackMatches,
        candidateDetails,
        storeLabelCode: candidateCode
      };
    }
  }

  // ==================================================
  // PRIORITY 5: Not Mapped
  // ==================================================
  return {
    ok: false,
    found: false,
    resolution: 'not_mapped',
    ambiguous: false,
    barcode: normalizedBarcode || rawValue,
    rawBarcode: rawValue,
    message: 'Barcode not mapped.',
    product: null,
    candidates: []
  };
}

export const resolveScannedBarcode = resolveOfflineBarcode;
export const resolveScannedBarcodeStrict = resolveOfflineBarcode;
