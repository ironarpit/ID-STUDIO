import {
  matchesMainCodeFilter as originalMatchesMainCodeFilter,
  normalizeMainCode,
  isExcludedMainCode,
  getUniqueMainCodes
} from './mainCode';

export interface FilterOptionItem {
  value: string;
  label: string;
  count: number;
  incompatible?: boolean;
}

export interface LinkedFilterExtractors<T> {
  getMainCode?: (item: T) => string | undefined;
  getCategory?: (item: T) => string | undefined;
  getBrand?: (item: T) => string | undefined;
  getSupplier?: (item: T) => string | undefined;
}

export interface LinkedFilterSelections {
  mainCodes?: string[];
  categories?: string[];
  brands?: string[];
  suppliers?: string[];
}

export interface LinkedFilterResult<T> {
  filteredItems: T[];
  mainCodeOptions: FilterOptionItem[];
  categoryOptions: FilterOptionItem[];
  brandOptions: FilterOptionItem[];
  supplierOptions: FilterOptionItem[];
  hasActiveFilters: boolean;
  totalActiveSelections: number;
  hasIncompatibleSelections: boolean;
}

/**
 * Check if a string matches any item in the selected array (case-insensitive, trimmed).
 * If selected is empty, undefined, or contains 'all', returns true.
 */
export function matchesStringArray(
  val: string | undefined | null,
  selected: string[] | undefined | null
): boolean {
  if (!selected || selected.length === 0) return true;
  const active = selected.filter((s) => s && s.toLowerCase() !== 'all');
  if (active.length === 0) return true;

  const cleanVal = (val || '').trim().toLowerCase();
  if (!cleanVal) return false;

  return active.some((s) => s.trim().toLowerCase() === cleanVal);
}

export function matchesMainCode(
  val: string | undefined,
  selectedMainCodes: string[] | undefined | null
): boolean {
  return originalMatchesMainCodeFilter(val, selectedMainCodes);
}

export function matchesCategory(
  val: string | undefined,
  selectedCategories: string[] | undefined | null
): boolean {
  return matchesStringArray(val, selectedCategories);
}

export function matchesBrand(
  val: string | undefined,
  selectedBrands: string[] | undefined | null
): boolean {
  return matchesStringArray(val, selectedBrands);
}

export function matchesSupplier(
  val: string | undefined,
  selectedSuppliers: string[] | undefined | null
): boolean {
  return matchesStringArray(val, selectedSuppliers);
}

/**
 * Core bidirectional linked options calculation engine.
 * Computes options for each classification filter based on all active filters EXCEPT its own.
 * Preserves selected values even if they are incompatible (with count: 0 and incompatible: true).
 */
export function computeLinkedClassificationOptions<T>(
  items: T[],
  extractors: LinkedFilterExtractors<T>,
  selections: LinkedFilterSelections,
  basePredicate?: (item: T) => boolean
): LinkedFilterResult<T> {
  const selMainCodes = selections.mainCodes || [];
  const selCategories = selections.categories || [];
  const selBrands = selections.brands || [];
  const selSuppliers = selections.suppliers || [];

  const hasMainCode = Boolean(extractors.getMainCode);
  const hasCategory = Boolean(extractors.getCategory);
  const hasBrand = Boolean(extractors.getBrand);
  const hasSupplier = Boolean(extractors.getSupplier);

  // 1. Calculate overall filtered items (AND across all active filters)
  const filteredItems = items.filter((item) => {
    if (basePredicate && !basePredicate(item)) return false;

    if (hasMainCode && selMainCodes.length > 0) {
      if (!matchesMainCode(extractors.getMainCode!(item), selMainCodes)) return false;
    }

    if (hasCategory && selCategories.length > 0) {
      if (!matchesCategory(extractors.getCategory!(item), selCategories)) return false;
    }

    if (hasBrand && selBrands.length > 0) {
      if (!matchesBrand(extractors.getBrand!(item), selBrands)) return false;
    }

    if (hasSupplier && selSuppliers.length > 0) {
      if (!matchesSupplier(extractors.getSupplier!(item), selSuppliers)) return false;
    }

    return true;
  });

  // Track if any selected value has 0 matches
  let hasIncompatibleSelections = false;

  // 2. MAIN CODE OPTIONS: filtered by basePredicate + Category + Brand + Supplier (EXCLUDING MainCode)
  const mainCodeOptions: FilterOptionItem[] = [];
  if (hasMainCode) {
    const counts = new Map<string, number>();

    for (const item of items) {
      if (basePredicate && !basePredicate(item)) continue;

      if (hasCategory && selCategories.length > 0) {
        if (!matchesCategory(extractors.getCategory!(item), selCategories)) continue;
      }
      if (hasBrand && selBrands.length > 0) {
        if (!matchesBrand(extractors.getBrand!(item), selBrands)) continue;
      }
      if (hasSupplier && selSuppliers.length > 0) {
        if (!matchesSupplier(extractors.getSupplier!(item), selSuppliers)) continue;
      }

      const rawMc = extractors.getMainCode!(item);
      if (!rawMc || isExcludedMainCode(rawMc)) continue;

      const norm = normalizeMainCode(rawMc);
      if (norm) {
        if (norm === 'FOOD & GROCERY') {
          counts.set('FOOD', (counts.get('FOOD') || 0) + 1);
          counts.set('GROCERY', (counts.get('GROCERY') || 0) + 1);
        } else {
          counts.set(norm, (counts.get(norm) || 0) + 1);
        }
      }
    }

    // Include all found options
    for (const [code, count] of counts.entries()) {
      mainCodeOptions.push({
        value: code,
        label: code,
        count
      });
    }

    // Safety: keep any selected main code that is now incompatible (count === 0)
    for (const code of selMainCodes) {
      if (!counts.has(code)) {
        hasIncompatibleSelections = true;
        mainCodeOptions.push({
          value: code,
          label: code,
          count: 0,
          incompatible: true
        });
      }
    }

    // Priority sort: FOOD, GROCERY, NON-FOOD, NON-CORE, then alpha
    const priority = ['FOOD', 'GROCERY', 'NON-FOOD', 'NON-CORE'];
    mainCodeOptions.sort((a, b) => {
      const idxA = priority.indexOf(a.value);
      const idxB = priority.indexOf(b.value);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.label.localeCompare(b.label);
    });
  }

  // 3. CATEGORY OPTIONS: filtered by basePredicate + MainCode + Brand + Supplier (EXCLUDING Category)
  const categoryOptions: FilterOptionItem[] = [];
  if (hasCategory) {
    const counts = new Map<string, number>();
    const labelMap = new Map<string, string>();

    for (const item of items) {
      if (basePredicate && !basePredicate(item)) continue;

      if (hasMainCode && selMainCodes.length > 0) {
        if (!matchesMainCode(extractors.getMainCode!(item), selMainCodes)) continue;
      }
      if (hasBrand && selBrands.length > 0) {
        if (!matchesBrand(extractors.getBrand!(item), selBrands)) continue;
      }
      if (hasSupplier && selSuppliers.length > 0) {
        if (!matchesSupplier(extractors.getSupplier!(item), selSuppliers)) continue;
      }

      const rawCat = (extractors.getCategory!(item) || '').trim();
      if (rawCat) {
        const key = rawCat.toLowerCase();
        counts.set(key, (counts.get(key) || 0) + 1);
        if (!labelMap.has(key)) {
          labelMap.set(key, rawCat);
        }
      }
    }

    for (const [key, count] of counts.entries()) {
      const label = labelMap.get(key) || key;
      categoryOptions.push({
        value: label,
        label,
        count
      });
    }

    // Safety: keep any selected category that is now incompatible
    for (const cat of selCategories) {
      const key = cat.trim().toLowerCase();
      if (!counts.has(key)) {
        hasIncompatibleSelections = true;
        categoryOptions.push({
          value: cat,
          label: cat,
          count: 0,
          incompatible: true
        });
      }
    }

    categoryOptions.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
  }

  // 4. BRAND OPTIONS: filtered by basePredicate + MainCode + Category + Supplier (EXCLUDING Brand)
  const brandOptions: FilterOptionItem[] = [];
  if (hasBrand) {
    const counts = new Map<string, number>();
    const labelMap = new Map<string, string>();

    for (const item of items) {
      if (basePredicate && !basePredicate(item)) continue;

      if (hasMainCode && selMainCodes.length > 0) {
        if (!matchesMainCode(extractors.getMainCode!(item), selMainCodes)) continue;
      }
      if (hasCategory && selCategories.length > 0) {
        if (!matchesCategory(extractors.getCategory!(item), selCategories)) continue;
      }
      if (hasSupplier && selSuppliers.length > 0) {
        if (!matchesSupplier(extractors.getSupplier!(item), selSuppliers)) continue;
      }

      const rawBrand = (extractors.getBrand!(item) || '').trim();
      if (rawBrand) {
        const key = rawBrand.toLowerCase();
        counts.set(key, (counts.get(key) || 0) + 1);
        if (!labelMap.has(key)) {
          labelMap.set(key, rawBrand);
        }
      }
    }

    for (const [key, count] of counts.entries()) {
      const label = labelMap.get(key) || key;
      brandOptions.push({
        value: label,
        label,
        count
      });
    }

    // Safety: keep selected brands that are now incompatible
    for (const b of selBrands) {
      const key = b.trim().toLowerCase();
      if (!counts.has(key)) {
        hasIncompatibleSelections = true;
        brandOptions.push({
          value: b,
          label: b,
          count: 0,
          incompatible: true
        });
      }
    }

    brandOptions.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
  }

  // 5. SUPPLIER OPTIONS: filtered by basePredicate + MainCode + Category + Brand (EXCLUDING Supplier)
  const supplierOptions: FilterOptionItem[] = [];
  if (hasSupplier) {
    const counts = new Map<string, number>();
    const labelMap = new Map<string, string>();

    for (const item of items) {
      if (basePredicate && !basePredicate(item)) continue;

      if (hasMainCode && selMainCodes.length > 0) {
        if (!matchesMainCode(extractors.getMainCode!(item), selMainCodes)) continue;
      }
      if (hasCategory && selCategories.length > 0) {
        if (!matchesCategory(extractors.getCategory!(item), selCategories)) continue;
      }
      if (hasBrand && selBrands.length > 0) {
        if (!matchesBrand(extractors.getBrand!(item), selBrands)) continue;
      }

      const rawSupp = (extractors.getSupplier!(item) || '').trim();
      if (rawSupp) {
        const key = rawSupp.toLowerCase();
        counts.set(key, (counts.get(key) || 0) + 1);
        if (!labelMap.has(key)) {
          labelMap.set(key, rawSupp);
        }
      }
    }

    for (const [key, count] of counts.entries()) {
      const label = labelMap.get(key) || key;
      supplierOptions.push({
        value: label,
        label,
        count
      });
    }

    // Safety: keep selected suppliers that are now incompatible
    for (const s of selSuppliers) {
      const key = s.trim().toLowerCase();
      if (!counts.has(key)) {
        hasIncompatibleSelections = true;
        supplierOptions.push({
          value: s,
          label: s,
          count: 0,
          incompatible: true
        });
      }
    }

    supplierOptions.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
  }

  const totalActiveSelections =
    selMainCodes.length + selCategories.length + selBrands.length + selSuppliers.length;

  return {
    filteredItems,
    mainCodeOptions,
    categoryOptions,
    brandOptions,
    supplierOptions,
    hasActiveFilters: totalActiveSelections > 0,
    totalActiveSelections,
    hasIncompatibleSelections
  };
}
