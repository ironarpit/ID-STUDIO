export interface Product {
  id: string;
  barcode: string;
  name: string;
  itemName?: string; // Alias for name
  category?: string;
  mainCode?: string; // Column B: Food, Grocery, Nonfood, Noncore, SOR, SOR-S, Vegetable & Fruit, etc.
  mrp: number;
  costPrice?: number; // Purchase / Buy Price / Average Rate
  cost?: number; // Alias for costPrice
  retailPrice: number;
  salePrice?: number; // Kept for optional compatibility, defaults to retailPrice
  wholesalePrice?: number;
  stock: number; // Closing stock
  closingQty?: number; // Alias for stock
  closingStock?: number; // Alias for stock
  openingStock?: number;
  openingQty?: number; // Alias for openingStock
  purchaseQty?: number;
  salesCount: number;
  salesQty?: number; // Alias for salesCount
  localCode?: string; // Bansal Code / Local Code / Item Code
  bansalCode?: string; // Bansal Code (Source Column "Code")
  code?: string; // Alias for bansalCode / localCode
  lastPurchaseDate?: string;
  lastPurchaseNo?: string;
  lastPurchaseNumber?: string; // Alias for lastPurchaseNo
  supplierName?: string;
  supplier?: string; // Alias for supplierName
  brand?: string;
  manufacturer?: string;
  group?: string;
  subGroup?: string;
  segment?: string;
  location?: string;
  unit?: string;
  storeId?: string;
  rawRowData?: Record<string, any>;
}

export interface ComputedProductAnalytics {
  inventoryValue: number; // Cost / rate valuation (fallback retail)
  inventoryValueCost: number; // Closing Stock * Cost Price
  retailStockValue: number; // Closing Stock * Retail Price
  salesValue: number;
  avgDailySales: number;
  daysCover: number;
  marginPct: number;
  marginAmount: number;
  marginStatus: 'negative' | 'low' | 'healthy';
  stockAgeDays: number | null;
  stockAgeGroup: '0-30' | '31-60' | '61-90' | '91-180' | '181-365' | '365+' | '180+' | 'Unknown';
  abcCategory: 'A' | 'B' | 'C';
  movementStatus: 'fast' | 'slow' | 'dead' | 'zero_sales' | 'normal';
  stockStatus: 'out_of_stock' | 'low_stock' | 'overstock' | 'normal';
  monthsOfStock: number;
  suggestedReorder: number;
  aiRecommendation: string;
  healthStatus: 'healthy' | 'watch' | 'critical';
}

export type AppMode = 'stock_iq' | 'floor_iq' | 'focus_iq';

export type AnalyticsViewType =
  | 'bsmiq_home'
  | 'dashboard'
  | 'replenishment'
  | 'fast_moving'
  | 'slow_moving'
  | 'dead_stock'
  | 'zero_sales'
  | 'overstock'
  | 'low_stock'
  | 'out_of_stock'
  | 'inventory_value'
  | 'category_dash'
  | 'brand_dash'
  | 'supplier_dash'
  | 'abc_analysis'
  | 'margin_analysis'
  | 'stock_age'
  | 'ai_recommendations'
  | 'all_products'
  | 'reports'
  | 'top_sales'
  | 'product_detail'
  | 'floor_audit'
  | 'floor_audit_runner'
  | 'flagged_followup'
  | 'near_expiry'
  | 'focus_home'
  | 'core_focus'
  | 'non_core_focus'
  | 'core_focus_issues'
  | 'non_core_focus_issues'
  | 'core_focus_offers'
  | 'non_core_focus_offers'
  | 'core_focus_check'
  | 'non_core_focus_check'
  | 'focus_flagged_issues'
  | 'focus_history';
  | 'stock_variations';

export interface ColumnMapping {
  barcode: string;
  name: string;
  category?: string;
  mainCode?: string;
  brand?: string;
  manufacturer?: string;
  openingStock?: string;
  purchaseQty?: string;
  mrp: string;
  costPrice?: string;
  retailPrice: string;
  salePrice?: string;
  stock: string;
  salesCount: string;
  localCode?: string;
  lastPurchaseDate?: string;
  lastPurchaseNo?: string;
  supplierName?: string;
}

export interface StockReportMeta {
  fileName: string;
  filename?: string;
  uploadedAt: string;
  totalProducts: number;
  totalCategories: number;
  totalStockValue: number;
  reportDays?: number;
  reportPeriodText?: string;
  isClearedByAdmin?: boolean;
}

export type UploadStage =
  | 'Reading File'
  | 'Validating Products'
  | 'Preparing Data'
  | 'Saving to Device'
  | 'Complete'
  | 'Preparing Stock'
  | 'Creating Chunks'
  | 'Uploading to Cloud'
  | 'Verifying Upload'
  | 'Activating New Stock'
  | 'Cleaning Old Version';

export interface UploadProgressData {
  stage: UploadStage;
  percent: number;
  productsProcessed: number;
  totalProducts: number;
  chunksUploaded: number;
  totalChunks: number;
  batchUploaded: number;
  totalBatches: number;
  failed?: boolean;
  error?: string;
  success?: boolean;
  version?: number;
  lastUpdated?: string;
  message?: string;
  storeId?: string;
}

export interface ScanHistoryItem {
  id: string;
  barcode: string;
  productName: string;
  timestamp: string;
  found: boolean;
  product?: Product;
}

export interface ScannerSettings {
  soundEnabled: boolean;
  vibrateEnabled: boolean;
  continuousMode: boolean;
  preferredCameraId?: string;
}

// --- Floor Audit / Daily Task Module Types ---

export type AuditType =
  | 'zero_sales'
  | 'top_100'
  | 'category'
  | 'random'
  | 'shelf_board'
  | 'low_stock'
  | 'out_of_stock'
  | 'overstock'
  | 'dead_stock'
  | 'custom'
  | 'core_focus'
  | 'non_core_focus'
  | 'daily_purchase';

export interface DailyPurchaseSupplierEntry {
  supplierCode?: string;
  supplierName: string;
  supplier?: string;
  purchaseQty: number;
  freeQty?: number;
}

export type SupplierPurchaseEntry = DailyPurchaseSupplierEntry;

export interface DailyPurchaseMeta {
  reportTitle?: string;
  storeName?: string;
  periodStr?: string;
  auditDateStr?: string;
  totalRowsRead?: number;
  uniqueProductsCount?: number;
  invalidRowsCount?: number;
  fileName?: string;
}

export type AuditSessionStatus = 'in_progress' | 'completed' | 'abandoned';

export type AuditResultStatus = 'pending' | 'done' | 'flagged' | 'resolved';

export type LocationStatus = 'on_floor' | 'warehouse' | 'both' | 'not_found';

export type DisplayPosition = 'eye_level' | 'above_eye' | 'below_eye' | 'not_displayed';

export type RefillStatus = 'fully_refilled' | 'partially_refilled' | 'refill_required' | 'shelf_empty';

export type BoardStatus = 'board_correct' | 'board_missing' | 'wrong_price' | 'not_applicable';

export interface AuditSession {
  id: string;
  storeId: string;
  title: string;
  type: AuditType;
  focusType?: 'core' | 'non_core';
  focusMonth?: string;
  sourceList?: string;
  categoryFilter?: string;
  mainCodeFilter?: string | string[];
  rankRange?: string;
  filterConditions?: string;
  reportPeriod?: string;
  auditDate?: string;
  purchaseMeta?: DailyPurchaseMeta;
  datasetVersion?: string;
  status: AuditSessionStatus;
  createdAt: string;
  completedAt?: string;
  totalItems: number;
  completedCount: number;
  flaggedCount: number;
  doneCount?: number;
  pendingCount?: number;
  resolvedCount?: number;
  productIds: string[];
  currentIndex?: number;
  activeChecker?: string;
  lastChecker?: string;
}

export interface AuditProductResult {
  id: string; // Pattern: `${auditId}_${productId}`
  auditId: string;
  productId: string;
  storeId: string;

  // --- Complete Product Snapshot Fields ---
  barcode: string;
  productName: string;
  mainCode?: string;
  bansalCode?: string;
  code?: string;
  localCode?: string;
  category?: string;
  brand?: string;
  manufacturer?: string;
  unit?: string;
  rawRowData?: Record<string, any>;
  supplierName?: string;
  supplier?: string;

  openingStock?: number;
  openingQty?: number;
  purchaseQty?: number;
  purchasedQty?: number;
  freeQty?: number;
  suppliersList?: DailyPurchaseSupplierEntry[];
  salesCount?: number;
  salesQty?: number;
  stock?: number; // Closing stock
  closingStock?: number;

  costPrice?: number;
  cost?: number;
  retailPrice?: number;
  salePrice?: number;
  mrp?: number;

  lastPurchaseDate?: string;
  lastPurchaseNo?: string;
  lastPurchaseNumber?: string;
  isAmbiguousMatch?: boolean;

  // --- Focus Audit Specific Snapshot & Execution Fields ---
  focusOffer?: string;
  focusType?: 'core' | 'non_core';
  focusMonth?: string;
  sourceList?: string;
  display?: 'YES' | 'NO';
  board?: 'YES' | 'NO';
  boardType?: 'B1G1' | 'OFF' | 'ONLY';
  productOrder?: number;

  // --- Daily Purchase Audit Specific Fields ---
  isDisplayedOnFloor?: 'yes' | 'no';
  isBoardCorrect?: 'yes' | 'no' | 'not_applicable';
  dailyPurchaseOutcome?: 'OK' | 'NOT_ON_FLOOR' | 'BOARD_INCORRECT' | 'ACTION_REQUIRED';

  // --- Audit Execution Fields ---
  isOnFloor?: 'yes' | 'no' | boolean;
  visibilityLevel?: 'eye_level' | 'above_eye' | 'below_eye';
  displayLocations?: string[];
  locationStatus?: LocationStatus;
  displayPosition?: DisplayPosition;
  refillStatus?: RefillStatus;
  boardStatus?: BoardStatus | 'correct' | 'incorrect' | 'missing' | 'not_applicable';
  issueReason?: string;
  remarks?: string;
  remark?: string;
  checkedBy?: string;
  status: AuditResultStatus;
  resultStatus?: AuditResultStatus;

  checkedAt?: string;
  checkedDate?: string;
  checkedTime?: string;
  flaggedAt?: string;
  resolutionRemark?: string;
  resolvedAt?: string;
}

export const LOCATION_OPTIONS: { value: LocationStatus; label: string }[] = [
  { value: 'on_floor', label: 'On Floor' },
  { value: 'warehouse', label: 'Warehouse' },
  { value: 'both', label: 'Both Floor & Warehouse' },
  { value: 'not_found', label: 'Not Found' },
];

export const DISPLAY_POSITION_OPTIONS: { value: DisplayPosition; label: string }[] = [
  { value: 'eye_level', label: 'Eye Level' },
  { value: 'above_eye', label: 'Above Eye Level' },
  { value: 'below_eye', label: 'Below Eye Level' },
  { value: 'not_displayed', label: 'Not Displayed' },
];

export const REFILL_STATUS_OPTIONS: { value: RefillStatus; label: string }[] = [
  { value: 'fully_refilled', label: 'Fully Refilled' },
  { value: 'partially_refilled', label: 'Partially Refilled' },
  { value: 'refill_required', label: 'Refill Required' },
  { value: 'shelf_empty', label: 'Shelf Empty' },
];

export const BOARD_STATUS_OPTIONS: { value: BoardStatus; label: string }[] = [
  { value: 'board_correct', label: 'Board Available & Correct' },
  { value: 'board_missing', label: 'Board Missing' },
  { value: 'wrong_price', label: 'Wrong Price' },
  { value: 'not_applicable', label: 'Not Applicable' },
];

export interface AuditCheckFormHandle {
  submitValidated: (advanceToNext: boolean) => Promise<boolean>;
}

export const ISSUE_REASON_PRESETS: Record<AuditType, string[]> = {
  zero_sales: [
    'Hidden in Warehouse',
    'Damaged / Expired / Spoiled',
    'High Price / Low Demand',
    'Wrong Barcode / System Error',
    'Not Displayed / Missing Board',
    'Misplaced on Wrong Shelf',
    'Other Reason',
  ],
  top_100: [
    'Low Shelf Stock / Needs Refill',
    'Refill Pending in Backroom',
    'Missing Price Tag / Board',
    'Suboptimal Display Location',
    'Stock Count Mismatch',
    'Other Reason',
  ],
  category: [
    'Out of Stock / Empty Facing',
    'Unsorted / Disorganized Facing',
    'Wrong Price Tag',
    'Damaged Packaging',
    'Other Reason',
  ],
  random: [
    'Misplaced Product',
    'System Count Mismatch',
    'Missing Board / Label',
    'Damaged / Imperfect Item',
    'Other Reason',
  ],
  shelf_board: [
    'Board Missing',
    'Wrong Price Printed on Board',
    'Board Damaged / Faded',
    'Position Obscured',
    'Other Reason',
  ],
  low_stock: [
    'Low Shelf Stock / Needs Refill',
    'Refill Pending in Backroom',
    'Wrong System Stock Count',
    'Missing Board / Label',
    'Other Reason',
  ],
  out_of_stock: [
    'Out of Stock / Empty Facing',
    'Stock in Warehouse Not Brought to Floor',
    'Supplier Delivery Delayed',
    'Wrong System Stock Count',
    'Other Reason',
  ],
  overstock: [
    'Excess Floor Display',
    'No Backroom Space',
    'High Price / Low Demand',
    'Wrong System Stock Count',
    'Other Reason',
  ],
  dead_stock: [
    'Hidden in Warehouse',
    'Damaged / Expired / Spoiled',
    'Discontinued Item',
    'Not Displayed / Missing Board',
    'Other Reason',
  ],
  custom: [
    'Stock Count Mismatch',
    'Display / Placement Issue',
    'Missing Price Tag / Board',
    'Damaged / Expired Item',
    'Other Reason',
  ],
  core_focus: [
    'Not on Display',
    'Board Missing',
    'Wrong Offer Board',
    'Out of Stock',
    'Damaged / Expired Item',
    'Other Reason',
  ],
  non_core_focus: [
    'Not on Display',
    'Board Missing',
    'Wrong Offer Board',
    'Out of Stock',
    'Damaged / Expired Item',
    'Other Reason',
  ],
  daily_purchase: [
    'Product Not on Floor / Stock in Backroom',
    'Price Board Missing',
    'Price Board Incorrect',
    'Damaged / Short Inward',
    'Barcode Not Scanning / Missing',
    'Other Reason',
  ],
};

// ==========================================
// FOCUS IQ (MONTHLY FOCUS MASTER & OFFERS)
// ==========================================

export type FocusType = 'core' | 'non_core';

export interface FocusProductItem {
  id: string;
  code: string; // Bansal / Local Code (text with leading zeros preserved, e.g. "013006849")
  bansalCode?: string; // Alias for code
  barcode?: string;
  name: string; // Product Description / Name from Focus Excel
  itemName?: string; // Alias for name
  category?: string;
  brand?: string;
  mrp?: number;
  focusMrp?: number; // Alias for mrp
  focusOffer?: string; // Focus Offer / Scheme / Promotion / Discount Details
  offerText?: string; // Alias for focusOffer
  specialPrice?: number; // Focus Offer Price / Special Rate
  discount?: string | number; // Discount % or amount
  startDate?: string;
  endDate?: string;
  remarks?: string;
  rawRowData?: Record<string, any>; // Complete original row data from Excel
}

export interface FocusMaster {
  id: string; // e.g. `${storeId}_${type}_${monthKey}`
  storeId: string;
  type: FocusType; // 'core' | 'non_core'
  monthKey: string; // e.g. '2026-05' or 'May-2026'
  monthDisplay: string; // e.g. 'May 2026'
  fileName: string;
  uploadedAt: string;
  totalProducts: number;
  items: FocusProductItem[];
  isActive?: boolean;
  metrics?: any;
}

export interface MatchedFocusProduct {
  focusItem: FocusProductItem;
  isMatched: boolean;
  stockProduct?: Product;
}

export interface FocusSummaryStats {
  activeMonth: string;
  totalProducts: number;
  matchedCount: number;
  notMatchedCount: number;
  matchedPercentage: number;
  lastUploadedAt?: string;
  fileName?: string;
}

// ==========================================
// FOCUS IQ STAGE 2 (STOCK STATUS & ISSUES)
// ==========================================

export type FocusStockStatus = 'OUT_OF_STOCK' | 'LOW_STOCK' | 'AVAILABLE' | 'NOT_MATCHED';

export interface EvaluatedFocusProduct {
  focusItem: FocusProductItem;
  isMatched: boolean;
  stockProduct?: Product;
  code: string; // 9-digit normalized code
  productName: string;
  category?: string;
  brand?: string;
  focusOffer?: string;
  salesQty: number;
  stockQty: number;
  avgDailySales: number | null;
  stockCoverDays: number | null;
  costPrice: number;
  mrp: number;
  retailPrice: number;
  status: FocusStockStatus;
}

export interface FocusIQStats {
  activeMonth: string;
  totalProducts: number;
  outOfStockCount: number;
  lowStockCount: number;
  availableCount: number;
  notMatchedCount: number;
  reportDays: number | null;
  lastUploadedAt?: string;
  fileName?: string;
}

// ==========================================
// FOCUS IQ STAGE 3 (OFFER MISMATCH & PRICING)
// ==========================================

export type FocusOfferStatus = 
  | 'CORRECT' 
  | 'MISMATCH' 
  | 'MANUAL_CHECK' 
  | 'UNRECOGNIZED' 
  | 'NOT_MATCHED';

export type OfferParsedType = 
  | 'PERCENT_OFF' 
  | 'RUPEE_OFF' 
  | 'FIXED_PRICE' 
  | 'EXPLICIT_SP' 
  | 'MULTI_BUY' 
  | 'UNRECOGNIZED' 
  | 'NO_OFFER';

export interface EvaluatedFocusOfferProduct {
  focusItem: FocusProductItem;
  stockProduct?: Product;
  isMatched: boolean;
  code: string; // 9-digit normalized code
  productName: string;
  category?: string;
  brand?: string;
  focusOffer: string;
  focusMrp: number; // MRP from monthly Focus Master
  currentMrp: number; // MRP from current active Stock IQ
  expectedRetail: number | null; // Calculated using CURRENT Stock IQ MRP
  currentRetail: number; // Current Retail in Stock IQ
  difference: number | null; // currentRetail - expectedRetail
  costPrice: number; // Current Cost in Stock IQ
  stockQty: number; // Closing Stock in Stock IQ
  salesQty: number; // Sales in Stock IQ
  offerStatus: FocusOfferStatus;
  offerType: OfferParsedType;
  calculationExplanation: string;
  isMrpChanged: boolean; // Math.abs(focusMrp - currentMrp) > 0.50 (when focusMrp > 0 and isMatched)
  isBelowCost: boolean; // expectedRetail !== null && expectedRetail < costPrice
  warnings: string[]; // ['MRP CHANGED', 'BELOW COST'] etc.
}

export interface FocusOfferStats {
  activeMonth: string;
  totalProducts: number;
  matchedCount: number;
  notMatchedCount: number;
  correctCount: number;
  mismatchCount: number;
  manualCheckCount: number;
  unrecognizedCount: number;
  mrpChangedCount: number;
  belowCostCount: number;
  lastUploadedAt?: string;
  fileName?: string;
}

// ==========================================
// FOCUS IQ STAGE 4 (PHYSICAL FOCUS CHECK)
// ==========================================

export type FocusOnFloorStatus = 'YES' | 'NO';
export type FocusDisplayFacingStatus = 'GOOD' | 'NEED_REFILL' | 'POOR_DISPLAY';
export type FocusBoardStatus = 'CORRECT' | 'INCORRECT' | 'MISSING' | 'NOT_APPLICABLE';
export type FocusCheckItemStatus = 'PENDING' | 'DONE' | 'FLAGGED';

export type FocusIssuePreset =
  | 'Product Not On Floor'
  | 'Refill Required'
  | 'Poor Display'
  | 'Board Missing'
  | 'Board Incorrect'
  | 'Offer / Price Issue'
  | 'Other';

export interface PhysicalCheckItemResult {
  id: string; // `${checkId}_${code}`
  checkId: string;
  code: string; // 9-digit normalized code
  productName: string;
  category?: string;
  brand?: string;
  focusOffer?: string;
  focusMrp?: number;
  
  // Physical Check Fields (1-5):
  onFloor: FocusOnFloorStatus;
  displayFacing: FocusDisplayFacingStatus;
  focusBoard: FocusBoardStatus;
  remark?: string;
  issuePreset?: FocusIssuePreset | string;
  status: FocusCheckItemStatus;
  checkedAt?: string;

  // Scan Verification Fields (Stage 5):
  scanVerified?: boolean;
  verifiedBarcode?: string;
  verifiedDateTime?: string;
  scanError?: boolean;
  scannedBarcode?: string;
  scannedProductName?: string;

  // Resolution / Flagged Follow-up Fields (Stage 5):
  isResolved?: boolean;
  resolutionRemark?: string;
  resolvedAt?: string;
}

export interface PhysicalFocusCheckSession {
  id: string;
  storeId: string;
  type: FocusType; // 'core' | 'non_core'
  monthDisplay: string;
  masterId: string;
  masterFileName?: string;
  status: 'in_progress' | 'completed';
  startedAt: string;
  completedAt?: string;
  
  // Frozen Focus product snapshot (product list / order)
  productsSnapshot: FocusProductItem[];
  
  // Results mapped by normalized code
  results: Record<string, PhysicalCheckItemResult>;
  
  // Progress metrics
  totalCount: number;
  doneCount: number;
  flaggedCount: number;
  pendingCount: number;
  completionPercentage: number;
  
  notes?: string;
}

// ==========================================
// BARCODE MASTER INTERFACES & TYPES (STAGE 2)
// ==========================================

export interface BarcodeMasterItem {
  code: string;       // 9-digit Local Code
  itemName: string;   // Product / Item Name
  uom: string;        // Unit of Measure (PCS, KG, etc.)
  ean: string;        // Barcode / EAN
}

export interface BarcodeMasterStatus {
  status?: string;
  filename?: string;
  totalMappings?: number;
  uniqueLocalCodes?: number;
  uniqueBarcodes?: number;
  multiBarcodeCodes?: number;
  conflictingBarcodes?: number;
  rejectedRows?: number;
  uploadedDate?: string | null;
  uploadedAt?: string | null;
  activatedDate?: string | null;
  activatedAt?: string | null;
  version?: string;
  [key: string]: any;
}

export interface BarcodeMasterActivationResult {
  totalMappings: number;
  uniqueLocalCodes: number;
  uniqueBarcodes: number;
  multiBarcodeCodes: number;
  conflictingBarcodes: number;
  rejectedRows: number;
  version?: string;
  message?: string;
}

export type BarcodeMasterUploadStage =
  | 'Idle'
  | 'Reading Excel'
  | 'Validating Rows'
  | 'Preparing Mappings'
  | 'Saving to Device'
  | 'Activating Master'
  | 'Uploading Mappings'
  | 'Verifying Upload'
  | 'Activating Barcode Master'
  | 'Complete'
  | 'Failed';

export interface BarcodeMasterProgressData {
  stage: BarcodeMasterUploadStage;
  percent: number;
  uploadedItems: number;
  totalItems: number;
  currentBatch: number;
  totalBatches: number;
  error?: string;
}

// ==================================================
// BARCODE OVERRIDE TYPES
// ==================================================

export interface BarcodeOverride {
  scannedBarcode: string;
  targetBansalCode: string;
  targetProductName: string;
  createdAt: string;
  updatedAt: string;
}

export type BarcodeCandidateReason =
  | 'Name + UOM Match'
  | 'Old Mapped Code — Identity Mismatch'
  | 'Barcode Master Identity Match'
  | 'Saved Override (Stale)'
  | 'Manual Search Match'
  | 'Multiple Stock Match'
  | 'Store Label Candidate';

export type BarcodeCandidateBadge = 'RECOMMENDED' | 'CONFLICT' | 'MATCH' | 'STALE' | 'SEARCH';

export interface BarcodeCandidateProduct {
  product: Product;
  reason: BarcodeCandidateReason;
  badge: BarcodeCandidateBadge;
  isRecommended?: boolean;
  uom?: string;
}

export interface BarcodeMasterIdentity {
  ean: string;
  code: string;
  itemName: string;
  uom?: string;
}

// ==================================================
// NEAR EXPIRY MANAGEMENT TYPES
// ==================================================

export type NearExpiryActionType =
  | 'DEBIT TO VENDOR'
  | 'TRANSFER TO DC'
  | 'WRITE OFF + SEND TO DC'
  | 'ADD TO NEAR EXPIRY / RE-SUBMIT TO HO'
  | 'MANUAL FOLLOW-UP'
  | 'MANUAL REVIEW'
  | 'PENDING HO RESPONSE';

export type NearExpiryItemStatus =
  | 'DRAFT'
  | 'WAITING'
  | 'ACTION_REQUIRED'
  | 'COMPLETED';

export type NearExpiryBatchStatus =
  | 'DRAFT'
  | 'SENT_TO_HO'
  | 'HO_RESPONSE_RECEIVED'
  | 'ACTION_IN_PROGRESS'
  | 'COMPLETED';

export type FloorRemovalStatus = 'PENDING' | 'SENT' | 'REMOVED';

export interface NearExpiryBatch {
  id: string;
  name: string; // e.g. "Fortnight 1 - Sep 2026"
  periodStart?: string;
  periodEnd?: string;
  storeName: string;
  storeId: string;
  status: NearExpiryBatchStatus;
  createdAt: string;
  updatedAt: string;
  sentToHoAt?: string;
  hoResponseAt?: string;
  itemCount?: number;
  totalQty?: number;
  totalValue?: number;
}

export interface NearExpiryItem {
  id: string;
  batchId: string;
  productId?: string;
  barcode: string;
  bansalCode: string;
  mainCode: string;
  category: string;
  itemName: string;
  debitStatus: string; // e.g. "NON DEBIT" | "DEBIT"
  mrp: number;
  cost: number;
  value: number; // nearExpiryStock * cost
  nearExpiryStock: number;
  mtdSale: number;
  mfgDate: string; // YYYY-MM-DD or DD/MM/YYYY
  expiryDate: string; // YYYY-MM-DD or DD/MM/YYYY
  entryDate: string; // YYYY-MM-DD
  totalDays: number;
  pendingDays: number;
  pendingPct: number;
  supplier: string;
  hoRemark?: string;
  actionType?: NearExpiryActionType;
  actionTiming?: 'IMMEDIATE' | 'DEFERRED' | 'MANUAL';
  actionDueDate?: string; // YYYY-MM-DD
  status: NearExpiryItemStatus;
  executionStatus?: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
  completedAt?: string;
  completedBy?: string;
  notes?: string;
  rawProductData?: Partial<Product>;

  // Daily Floor Removal Tracking Fields
  floorRemovalStatus?: FloorRemovalStatus;
  floorRemovalSentAt?: string; // ISO datetime string
  floorRemovalSentDate?: string; // Local calendar date (YYYY-MM-DD)
  floorRemovalRemovedAt?: string; // ISO datetime string
  floorRemovalRemovedDate?: string; // Local calendar date (YYYY-MM-DD)
  returnedToFloorAt?: string; // ISO datetime string
  returnedToFloorReason?: string;

  // Preserved HO returned fields (all 22 columns from HO response)
  hoSrNo?: number | string;
  hoStoreName?: string;
  hoEanCode?: string;
  hoBansalCode?: string;
  hoMainCode?: string;
  hoCategory?: string;
  hoItemName?: string;
  hoPurchaseName?: string;
  hoNonDebitDebit?: string;
  hoStoreDc?: string;
  hoDebitStatus?: string;
  hoMrp?: number;
  hoCost?: number;
  hoValue?: number;
  hoNearExpiryStock?: number;
  hoMtdSale?: number;
  hoMfgDate?: string;
  hoExpiryDate?: string;
  hoTodayDate?: string;
  hoTotalDays?: number;
  hoPendingShelfLifeDays?: number;
  hoPendingShelfLifePct?: number;
  hoPendingShelfLifePercent?: number | string;
  hoSupplier?: string;
  hoImportData?: Record<string, any>;
  isHoImported?: boolean;
  stockMasterLinked?: boolean;
  effectiveActionType?: string;
  daysUntilAction?: number;
  actionDueFormatted?: string;
  instruction?: string;
}

export interface HoImportMatchResult {
  totalRows: number;
  importedCount: number; // Total rows imported into batch (linked + new)
  linkedCount: number; // Matched & linked to existing Prepared List items
  newHoCount: number; // New HO-only items created from Excel
  stockMasterMatchedCount: number; // Products matched in Stock IQ master
  stockMasterNotFoundCount: number; // Products not found in Stock IQ master
  ambiguousCount: number;
  skippedCount: number; // Empty / invalid skipped rows
  storeFilteredRows: number;
  matchedCount: number; // Maintained for backward-compatibility (same as importedCount)
  unmatchedCount: number;
  updatedItems: NearExpiryItem[];
  unmatchedRows: Array<{
    rowNumber: number;
    bansalCode?: string;
    ean?: string;
    itemName?: string;
    remark?: string;
    reason: string;
  }>;
  ambiguousRows: Array<{
    rowNumber: number;
    bansalCode?: string;
    ean?: string;
    itemName?: string;
    remark?: string;
    reason: string;
  }>;
  detectedSheet?: string;
  detectedHeaderRow?: number;
  detectedHeaders?: string[];
}


