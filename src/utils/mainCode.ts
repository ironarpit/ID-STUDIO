/**
 * MainCode helper functions for parsing and filtering
 * Separates FOOD and GROCERY into distinct filters, supporting single or multi-select filters.
 */

export function isExcludedMainCode(mainCode?: string): boolean {
  if (!mainCode) return false;
  const norm = mainCode.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  return (
    norm === 'sor' ||
    norm === 'sors' ||
    norm.includes('vegetable') ||
    norm.includes('fruit') ||
    norm.includes('vegfruit')
  );
}

export function normalizeMainCode(mainCode?: string): string {
  if (!mainCode) return '';
  const raw = mainCode.trim();
  const norm = raw.toLowerCase();
  
  if (isExcludedMainCode(mainCode)) return '';

  // 1. FOOD variants (Packaged foods, snacks, beverages, dairy, confectionery, etc.)
  if (
    norm === 'food' ||
    norm === 'fmcg food' ||
    norm === 'fmcg - food' ||
    norm === 'packaged food' ||
    norm === 'packaged foods' ||
    norm === 'snacks' ||
    norm === 'biscuits' ||
    norm === 'beverages' ||
    norm === 'confectionery' ||
    norm === 'dairy' ||
    norm === 'bakery'
  ) {
    return 'FOOD';
  }

  // 2. GROCERY variants (Staples, pulses, grains, flour, spices, sugar, rice, edible oil, etc.)
  if (
    norm === 'grocery' ||
    norm === 'groceries' ||
    norm === 'staples' ||
    norm === 'staple' ||
    norm === 'grains' ||
    norm === 'pulses' ||
    norm === 'dal' ||
    norm === 'spices' ||
    norm === 'flour' ||
    norm === 'atta' ||
    norm === 'rice' ||
    norm === 'sugar' ||
    norm === 'oil & ghee' ||
    norm === 'edible oil'
  ) {
    return 'GROCERY';
  }

  // If literally "FOOD & GROCERY" or "FOOD/GROCERY", normalize as FOOD & GROCERY
  if (
    norm === 'food & grocery' ||
    norm === 'food & groceries' ||
    norm === 'food/grocery' ||
    norm === 'food / grocery'
  ) {
    return 'FOOD & GROCERY';
  }

  // 3. Non-Food variants (HPC, cleaning, personal care, toiletries, cosmetics)
  if (
    norm === 'non food' ||
    norm === 'nonfood' ||
    norm === 'non-food' ||
    norm === 'fmcg non food' ||
    norm === 'fmcg non-food' ||
    norm === 'fmcg - non food' ||
    norm === 'hpc' ||
    norm === 'personal care' ||
    norm === 'home care' ||
    norm === 'cleaning' ||
    norm === 'toiletries' ||
    norm === 'cosmetics' ||
    norm === 'hygiene'
  ) {
    return 'NON-FOOD';
  }

  // 4. Non-Core variants (General merchandise, apparel, footwear, household, appliances)
  if (
    norm === 'non core' ||
    norm === 'noncore' ||
    norm === 'non-core' ||
    norm === 'gm' ||
    norm === 'general merchandise' ||
    norm === 'apparel' ||
    norm === 'footwear' ||
    norm === 'luggage' ||
    norm === 'toys' ||
    norm === 'stationery' ||
    norm === 'household' ||
    norm === 'plasticware' ||
    norm === 'utensils' ||
    norm === 'appliances' ||
    norm === 'electronics' ||
    norm === 'kitchenware'
  ) {
    return 'NON-CORE';
  }

  return raw.toUpperCase();
}

/**
 * Checks if a product's mainCode matches the selected filter(s).
 * Supports string, string[], or empty/undefined filters.
 */
export function matchesMainCodeFilter(
  productMainCode: string | undefined, 
  filterVal: string | string[] | undefined | null
): boolean {
  if (!filterVal || filterVal === 'all') return true;
  
  const filters = Array.isArray(filterVal) 
    ? filterVal.filter(f => f && f !== 'all') 
    : [filterVal];

  if (filters.length === 0) return true;
  if (isExcludedMainCode(productMainCode)) return false;

  const rawP = (productMainCode || '').trim();
  const rawPNorm = rawP.toLowerCase();
  const normP = normalizeMainCode(productMainCode).toLowerCase();

  return filters.some(f => {
    if (!f || f === 'all') return true;
    const fNorm = normalizeMainCode(f).toLowerCase();
    const rawF = f.trim().toLowerCase();

    // FOOD filter check
    if (fNorm === 'food' || rawF === 'food') {
      return (
        normP === 'food' ||
        normP === 'food & grocery' ||
        rawPNorm === 'food' ||
        rawPNorm.includes('food') ||
        rawPNorm.includes('snack') ||
        rawPNorm.includes('biscuit') ||
        rawPNorm.includes('beverage') ||
        rawPNorm.includes('confectionery') ||
        rawPNorm.includes('dairy') ||
        rawPNorm.includes('bakery')
      );
    }

    // GROCERY filter check
    if (fNorm === 'grocery' || rawF === 'grocery') {
      return (
        normP === 'grocery' ||
        normP === 'food & grocery' ||
        rawPNorm === 'grocery' ||
        rawPNorm.includes('grocery') ||
        rawPNorm.includes('staple') ||
        rawPNorm.includes('grain') ||
        rawPNorm.includes('pulse') ||
        rawPNorm.includes('spice') ||
        rawPNorm.includes('atta') ||
        rawPNorm.includes('flour') ||
        rawPNorm.includes('rice') ||
        rawPNorm.includes('sugar') ||
        rawPNorm.includes('oil')
      );
    }

    // Combined FOOD & GROCERY check
    if (fNorm === 'food & grocery' || rawF === 'food & grocery') {
      return (
        normP === 'food' ||
        normP === 'grocery' ||
        normP === 'food & grocery' ||
        rawPNorm.includes('food') ||
        rawPNorm.includes('grocery')
      );
    }

    // NON-FOOD check
    if (fNorm === 'non-food' || rawF === 'non-food' || rawF === 'nonfood' || rawF === 'non food') {
      return (
        normP === 'non-food' ||
        rawPNorm === 'non food' ||
        rawPNorm === 'nonfood' ||
        rawPNorm.includes('non-food') ||
        rawPNorm.includes('nonfood') ||
        rawPNorm === 'hpc' ||
        rawPNorm.includes('personal care') ||
        rawPNorm.includes('home care') ||
        rawPNorm.includes('toiletries') ||
        rawPNorm.includes('cosmetics') ||
        rawPNorm.includes('cleaning') ||
        rawPNorm.includes('hygiene')
      );
    }

    // NON-CORE check
    if (fNorm === 'non-core' || rawF === 'non-core' || rawF === 'noncore' || rawF === 'non core') {
      return (
        normP === 'non-core' ||
        rawPNorm === 'non core' ||
        rawPNorm === 'noncore' ||
        rawPNorm.includes('non-core') ||
        rawPNorm.includes('noncore') ||
        rawPNorm.includes('general') ||
        rawPNorm.includes('apparel') ||
        rawPNorm.includes('footwear') ||
        rawPNorm.includes('plastic') ||
        rawPNorm.includes('household') ||
        rawPNorm.includes('utensil') ||
        rawPNorm.includes('appliance')
      );
    }

    // Exact or substring match for custom mainCodes
    return (
      normP === fNorm ||
      rawPNorm === rawF ||
      normP.includes(rawF) ||
      rawPNorm.includes(rawF)
    );
  });
}

/**
 * Derives unique normalized MainCodes from products, separated cleanly into Food, Grocery, Non-Food, Non-Core, etc.
 */
export function getUniqueMainCodes(products: Array<{ mainCode?: string }>): string[] {
  if (!products || products.length === 0) return [];
  const set = new Set<string>();

  for (const p of products) {
    if (!p.mainCode || isExcludedMainCode(p.mainCode)) continue;
    const norm = normalizeMainCode(p.mainCode);
    if (norm) {
      if (norm === 'FOOD & GROCERY') {
        // If data contains combined "FOOD & GROCERY", provide both separate filters
        set.add('FOOD');
        set.add('GROCERY');
      } else {
        set.add(norm);
      }
    }
  }

  const result = Array.from(set);
  
  // Sort with FOOD, GROCERY, NON-FOOD, NON-CORE at the top
  const priorityOrder = ['FOOD', 'GROCERY', 'NON-FOOD', 'NON-CORE'];
  return result.sort((a, b) => {
    const idxA = priorityOrder.indexOf(a);
    const idxB = priorityOrder.indexOf(b);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return a.localeCompare(b);
  });
}

/**
 * Derives unique, trimmed categories from an array of products/items, dynamically filtered
 * by the currently selected MainCode(s) if provided.
 */
export function deriveCategoriesFromProducts<T extends { category?: string; mainCode?: string }>(
  items: T[],
  selectedMainCodes?: string | string[]
): string[] {
  if (!items || items.length === 0) return [];
  const set = new Set<string>();

  for (const item of items) {
    if (selectedMainCodes && selectedMainCodes.length > 0) {
      if (!matchesMainCodeFilter(item.mainCode, selectedMainCodes)) continue;
    }
    const cat = (item.category || '').trim();
    if (cat) {
      set.add(cat);
    }
  }

  return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

/**
 * Checks if a category matches the selected category filter(s) with trim and case-insensitivity.
 */
export function matchesCategoryFilter(
  category: string | undefined,
  selectedCategories: string | string[] | undefined | null
): boolean {
  if (!selectedCategories || selectedCategories === 'all') return true;
  const filters = Array.isArray(selectedCategories)
    ? selectedCategories.filter(c => c && c !== 'all')
    : [selectedCategories];
  if (filters.length === 0) return true;
  const normCat = (category || '').trim().toLowerCase();
  if (!normCat) return false;
  return filters.some(f => f.trim().toLowerCase() === normCat);
}

/**
 * Validates selected categories against available categories, returning only valid ones.
 */
export function getValidSelectedCategories(
  selectedCategories: string[],
  availableCategories: string[]
): string[] {
  if (!selectedCategories || selectedCategories.length === 0) return [];
  if (!availableCategories || availableCategories.length === 0) return [];
  const validSet = new Set(availableCategories.map(c => c.trim().toLowerCase()));
  return selectedCategories.filter(c => validSet.has(c.trim().toLowerCase()));
}
