import { NearExpiryActionType, NearExpiryItem, NearExpiryItemStatus } from '../types';

/**
 * Normalizes any date string (YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY) or Date object
 * to a standardized local Date at 00:00:00.
 */
export function parseToMidnightDate(val: unknown): Date | null {
  if (!val) return null;

  if (val instanceof Date) {
    if (isNaN(val.getTime())) return null;
    if (val.getUTCHours() === 0 && val.getUTCMinutes() === 0) {
      return new Date(val.getUTCFullYear(), val.getUTCMonth(), val.getUTCDate());
    }
    return new Date(val.getFullYear(), val.getMonth(), val.getDate());
  }

  // Handle Excel serial date numbers (e.g. 45000) or strings of 5 digits
  let numVal: number | null = null;
  if (typeof val === 'number') {
    numVal = val;
  } else if (typeof val === 'string' && /^\d{5}(\.\d+)?$/.test(val.trim())) {
    numVal = parseFloat(val.trim());
  }
  if (numVal !== null && numVal > 20000 && numVal < 80000) {
    // Excel base date: Dec 30, 1899
    const utcDays = Math.floor(numVal - 25569);
    const date = new Date(utcDays * 86400 * 1000);
    return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  }

  const str = String(val).trim();
  if (!str) return null;

  // Pattern 1: YYYY-MM-DD or YYYY/MM/DD
  const ymdMatch = str.match(/^(\d{4})[-\/\.](\d{1,2})[-\/\.](\d{1,2})/);
  if (ymdMatch) {
    const year = parseInt(ymdMatch[1], 10);
    const month = parseInt(ymdMatch[2], 10) - 1;
    const day = parseInt(ymdMatch[3], 10);
    const d = new Date(year, month, day);
    if (isNaN(d.getTime())) return null;
    if (d.getFullYear() !== year || d.getMonth() !== month || d.getDate() !== day) return null;
    return d;
  }

  // Pattern 2: DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY or DD/MM/YY or DD-MM or DD/MM
  const dmyMatch = str.match(/^(\d{1,2})[-\/\.](\d{1,2})(?:[-\/\.](\d{2,4}))?$/);
  if (dmyMatch) {
    let day = parseInt(dmyMatch[1], 10);
    let month = parseInt(dmyMatch[2], 10) - 1;
    let year = dmyMatch[3] ? parseInt(dmyMatch[3], 10) : new Date().getFullYear();
    if (year < 100) year += 2000;
    if (month > 11 && day <= 12) {
      const tmp = day - 1;
      day = month + 1;
      month = tmp;
    }
    const d = new Date(year, month, day);
    if (isNaN(d.getTime())) return null;
    if (d.getFullYear() !== year || d.getMonth() !== month || d.getDate() !== day) return null;
    return d;
  }

  // Pattern 2b: Pure digits DDMM (4 digits), DDMMYY (6 digits), DDMMYYYY (8 digits)
  const pureDigitsMatch = str.match(/^(\d{2})(\d{2})(\d{2}|\d{4})?$/);
  if (pureDigitsMatch) {
    let day = parseInt(pureDigitsMatch[1], 10);
    let month = parseInt(pureDigitsMatch[2], 10) - 1;
    let year = pureDigitsMatch[3] ? parseInt(pureDigitsMatch[3], 10) : new Date().getFullYear();
    if (year < 100) year += 2000;
    if (day >= 1 && day <= 31 && month >= 0 && month <= 11) {
      const d = new Date(year, month, day);
      if (!isNaN(d.getTime())) {
        if (d.getFullYear() === year && d.getMonth() === month && d.getDate() === day) {
          return d;
        }
      }
    }
  }

  // Pattern 3: DD-MMM-YYYY or DD MMM YYYY (e.g. 01-Oct-2026, 1-Oct-26, 15-SEP-2026)
  const monthMap: Record<string, number> = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
  };
  const dMmmYMatch = str.match(/^(\d{1,2})[-\s/]([a-zA-Z]{3,9})[-\s/](\d{2,4})/);
  if (dMmmYMatch) {
    const day = parseInt(dMmmYMatch[1], 10);
    const mStr = dMmmYMatch[2].slice(0, 3).toLowerCase();
    let year = parseInt(dMmmYMatch[3], 10);
    if (year < 100) year += 2000;
    if (monthMap[mStr] !== undefined) {
      const d = new Date(year, monthMap[mStr], day);
      return isNaN(d.getTime()) ? null : d;
    }
  }

  // Fallback native parse
  const fallback = new Date(str);
  if (!isNaN(fallback.getTime())) {
    return new Date(fallback.getFullYear(), fallback.getMonth(), fallback.getDate());
  }

  return null;
}

/**
 * Formats a Date or date string to standard display DD/MM/YYYY.
 */
export function formatDateDDMMYYYY(val: unknown): string {
  const d = parseToMidnightDate(val);
  if (!d) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Formats a Date or date string to ISO YYYY-MM-DD for HTML inputs.
 */
export function formatDateYYYYMMDD(val: unknown): string {
  const d = parseToMidnightDate(val);
  if (!d) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${year}-${month}-${day}`;
}

export interface FlexibleDateParseResult {
  valid: boolean;
  date: Date | null;
  formattedDDMMYYYY: string;
  error?: string;
}

/**
 * Flexible numeric date parser supporting:
 * - 07-12, 07/12, 07.12 (current year automatically applied)
 * - 0712 (4 digits -> current year automatically applied)
 * - 07-12-26, 07-12-2026, 07122026
 * - Real calendar dates (rejects invalid days like 31 Feb)
 */
export function parseFlexibleDateInput(input: string): FlexibleDateParseResult {
  const trimmed = input.trim();
  if (!trimmed) {
    return { valid: false, date: null, formattedDDMMYYYY: '', error: 'Date is required' };
  }

  const d = parseToMidnightDate(trimmed);
  if (!d || isNaN(d.getTime())) {
    return {
      valid: false,
      date: null,
      formattedDDMMYYYY: '',
      error: 'Invalid calendar date. Use e.g. 07-12 or 07-12-2026'
    };
  }

  return {
    valid: true,
    date: d,
    formattedDDMMYYYY: formatDateDDMMYYYY(d)
  };
}

/**
 * Validates MFG Date and Expiry Date combination:
 * - Real calendar dates
 * - MFG Date <= Expiry Date
 */
export function validateMfgAndExpiry(
  mfgInput: string,
  expInput: string
): { valid: boolean; mfgDate: Date | null; expDate: Date | null; error?: string } {
  const expRes = parseFlexibleDateInput(expInput);
  if (!expRes.valid || !expRes.date) {
    return { valid: false, mfgDate: null, expDate: null, error: expRes.error || 'Valid expiry date is required' };
  }

  if (!mfgInput.trim()) {
    return { valid: true, mfgDate: null, expDate: expRes.date };
  }

  const mfgRes = parseFlexibleDateInput(mfgInput);
  if (!mfgRes.valid || !mfgRes.date) {
    return { valid: false, mfgDate: null, expDate: expRes.date, error: 'Invalid MFG calendar date' };
  }

  if (mfgRes.date.getTime() > expRes.date.getTime()) {
    return {
      valid: false,
      mfgDate: mfgRes.date,
      expDate: expRes.date,
      error: 'MFG Date cannot be after Expiry Date'
    };
  }

  return { valid: true, mfgDate: mfgRes.date, expDate: expRes.date };
}

/**
 * Calculate shelf life metrics using actual integer day arithmetic.
 */
export function calculateShelfLife(
  mfgDateVal: unknown,
  expiryDateVal: unknown,
  referenceDateVal?: unknown
): {
  totalDays: number;
  pendingDays: number;
  pendingPct: number;
  mfgFormatted: string;
  expiryFormatted: string;
  isExpired: boolean;
} {
  const mfg = parseToMidnightDate(mfgDateVal);
  const exp = parseToMidnightDate(expiryDateVal);
  const ref = parseToMidnightDate(referenceDateVal) || new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());

  if (!exp) {
    return {
      totalDays: 0,
      pendingDays: 0,
      pendingPct: 0,
      mfgFormatted: mfg ? formatDateDDMMYYYY(mfg) : '',
      expiryFormatted: '',
      isExpired: false
    };
  }

  const ONE_DAY_MS = 1000 * 60 * 60 * 24;

  let totalDays = 0;
  if (mfg) {
    totalDays = Math.round((exp.getTime() - mfg.getTime()) / ONE_DAY_MS);
  }

  // Pending days: Expiry - Reference Date (can be negative!)
  const pendingDays = Math.round((exp.getTime() - ref.getTime()) / ONE_DAY_MS);
  const isExpired = pendingDays < 0;

  // Pending %: Pending / Total
  let pendingPct = 0;
  if (totalDays > 0) {
    pendingPct = Math.round(((pendingDays / totalDays) * 100) * 10) / 10;
  }

  return {
    totalDays: totalDays > 0 ? totalDays : 0,
    pendingDays,
    pendingPct,
    mfgFormatted: mfg ? formatDateDDMMYYYY(mfg) : '',
    expiryFormatted: formatDateDDMMYYYY(exp),
    isExpired
  };
}

/**
 * Formats numeric days cleanly avoiding long floating point noise (e.g. 0.12849 -> Less than 1 day).
 */
export function formatDisplayDays(val: unknown): string {
  if (val === undefined || val === null || val === '') return '-';
  const num = typeof val === 'number' ? val : parseFloat(String(val));
  if (isNaN(num)) return String(val);

  if (num < 0) {
    const abs = Math.abs(Math.round(num));
    return `${Math.round(num)} days (${abs} ${abs === 1 ? 'day' : 'days'} expired)`;
  }
  if (num === 0) {
    return '0 days (Expires today)';
  }
  if (num > 0 && num < 1) {
    return 'Less than 1 day';
  }
  const rounded = Math.round(num);
  return `${rounded} ${rounded === 1 ? 'day' : 'days'}`;
}

/**
 * Returns whole days remaining until expiry date compared against reference date (defaults to today).
 * Positive = days left in future
 * 0 = expires today
 * Negative = days expired in past
 */
export function getDaysRemaining(
  expiryDateVal: unknown,
  referenceDateVal?: unknown
): number | null {
  const exp = parseToMidnightDate(expiryDateVal);
  if (!exp) return null;
  const ref = parseToMidnightDate(referenceDateVal) || new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
  const ONE_DAY_MS = 1000 * 60 * 60 * 24;
  return Math.round((exp.getTime() - ref.getTime()) / ONE_DAY_MS);
}

/**
 * Formats numeric percentage cleanly (e.g. 47.54098 -> 47.5%).
 */
export function formatDisplayPct(val: unknown): string {
  if (val === undefined || val === null || val === '') return '-';
  const num = typeof val === 'number' ? val : parseFloat(String(val).replace('%', ''));
  if (isNaN(num)) return String(val);
  const rounded = Math.round(num * 10) / 10;
  return `${rounded}%`;
}

/**
 * Formats pending days display text.
 * Recalculates whole days remaining using current device date if expiryDateVal is provided.
 * Rules:
 * future expiry -> correct whole days remaining (e.g. 18 days left)
 * today -> Expires Today
 * past -> X days expired (e.g. 5 days expired)
 */
export function formatPendingDaysText(
  pendingDays: number | null | undefined,
  expiryDateVal?: unknown
): string {
  let days: number | null = null;
  if (expiryDateVal) {
    days = getDaysRemaining(expiryDateVal);
  }
  if (days === null && pendingDays !== undefined && pendingDays !== null && !isNaN(pendingDays)) {
    days = Math.round(Number(pendingDays));
  }
  if (days === null || isNaN(days)) return '-';

  if (days < 0) {
    const abs = Math.abs(days);
    return `${abs} ${abs === 1 ? 'day' : 'days'} expired`;
  }
  if (days === 0) {
    return 'Expires Today';
  }
  return `${days} ${days === 1 ? 'day' : 'days'} left`;
}

/**
 * Interprets exact HO Remark according to strict business logic.
 * NEVER INVENT OR GUESS UNKNOWN REMARKS.
 */
export function interpretHoRemark(
  rawRemark: string,
  expiryDateVal: unknown
): {
  actionType: NearExpiryActionType;
  actionTiming: 'IMMEDIATE' | 'DEFERRED' | 'MANUAL';
  actionDueDate?: string; // YYYY-MM-DD
  cleanRemark: string;
} {
  const cleanRemark = (rawRemark || '').trim();
  if (!cleanRemark) {
    return {
      actionType: 'PENDING HO RESPONSE',
      actionTiming: 'MANUAL',
      cleanRemark: ''
    };
  }

  // Normalize punctuation to spaces for robust word matching
  const upper = cleanRemark
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const expDate = parseToMidnightDate(expiryDateVal);

  // ----------------------------------------------------
  // PATTERN D: SALE TILL 15 DAYS REMAINS (Deferred by 15 days before expiry)
  // ----------------------------------------------------
  if (
    upper.includes('SALE TILL 15 DAYS') ||
    upper.includes('15 DAYS REMAIN') ||
    upper.includes('15 DAY REMAIN') ||
    upper.includes('15 DAYS REMAINING') ||
    upper.includes('15 DAYS') ||
    upper.includes('15 DAY')
  ) {
    let dueDateStr: string | undefined;
    if (expDate) {
      const dueDate = new Date(expDate);
      dueDate.setDate(dueDate.getDate() - 15);
      dueDateStr = formatDateYYYYMMDD(dueDate);
    }

    if (upper.includes('DEBIT')) {
      return {
        actionType: 'DEBIT TO VENDOR',
        actionTiming: 'DEFERRED',
        actionDueDate: dueDateStr,
        cleanRemark
      };
    }

    if (upper.includes('WRITE OFF')) {
      return {
        actionType: 'WRITE OFF + SEND TO DC',
        actionTiming: 'DEFERRED',
        actionDueDate: dueDateStr,
        cleanRemark
      };
    }

    if (
      upper.includes('TRANSFER TO DC') ||
      upper.includes('TRF TO DC') ||
      upper.includes('SEND TO DC') ||
      upper.includes('SENT TO DC') ||
      upper.includes('THEN DC') ||
      upper.includes('TO DC')
    ) {
      return {
        actionType: 'TRANSFER TO DC',
        actionTiming: 'DEFERRED',
        actionDueDate: dueDateStr,
        cleanRemark
      };
    }

    return {
      actionType: 'ADD TO NEAR EXPIRY / RE-SUBMIT TO HO',
      actionTiming: 'DEFERRED',
      actionDueDate: dueDateStr,
      cleanRemark
    };
  }

  // ----------------------------------------------------
  // PATTERN E: SALE TILL EXPIRY AFTER THAT TRANSFER TO DC
  // ----------------------------------------------------
  if (
    (upper.includes('SALE TILL EXPIRY') || upper.includes('TILL EXPIRY') || upper.includes('SALE TILL EXP')) &&
    (upper.includes('TRANSFER TO DC') ||
      upper.includes('TRF TO DC') ||
      upper.includes('SEND TO DC') ||
      upper.includes('SENT TO DC') ||
      upper.includes('TO DC')) &&
    !upper.includes('WRITE OFF')
  ) {
    return {
      actionType: 'TRANSFER TO DC',
      actionTiming: 'DEFERRED',
      actionDueDate: expDate ? formatDateYYYYMMDD(expDate) : undefined,
      cleanRemark
    };
  }

  // ----------------------------------------------------
  // PATTERN F: SALE TILL EXPIRY AFTER THAT WRITE OFF AND SEND TO DC
  // ----------------------------------------------------
  if (
    (upper.includes('SALE TILL EXPIRY') || upper.includes('TILL EXPIRY') || upper.includes('SALE TILL EXP')) &&
    upper.includes('WRITE OFF')
  ) {
    return {
      actionType: 'WRITE OFF + SEND TO DC',
      actionTiming: 'DEFERRED',
      actionDueDate: expDate ? formatDateYYYYMMDD(expDate) : undefined,
      cleanRemark
    };
  }

  // ----------------------------------------------------
  // PATTERN G: SALE TILL EXPIRY AFTER THAT DEBIT TO VENDOR
  // ----------------------------------------------------
  if (
    (upper.includes('SALE TILL EXPIRY') || upper.includes('TILL EXPIRY') || upper.includes('SALE TILL EXP')) &&
    (upper.includes('DEBIT TO VENDOR') || upper.includes('DEBIT'))
  ) {
    return {
      actionType: 'DEBIT TO VENDOR',
      actionTiming: 'DEFERRED',
      actionDueDate: expDate ? formatDateYYYYMMDD(expDate) : undefined,
      cleanRemark
    };
  }

  // ----------------------------------------------------
  // PATTERN H: GENERIC SALE TILL EXPIRY
  // ----------------------------------------------------
  if (upper.includes('SALE TILL EXPIRY') || upper.includes('TILL EXPIRY') || upper.includes('SALE TILL EXP')) {
    return {
      actionType: 'ADD TO NEAR EXPIRY / RE-SUBMIT TO HO',
      actionTiming: 'DEFERRED',
      actionDueDate: expDate ? formatDateYYYYMMDD(expDate) : undefined,
      cleanRemark
    };
  }

  // ----------------------------------------------------
  // PATTERN A: DEBIT TO VENDOR (Immediate)
  // ----------------------------------------------------
  if (
    (upper === 'DEBIT TO VENDOR' ||
      upper === 'DEBIT TO VENDOR NOW' ||
      upper === 'DEBIT TO PARTY' ||
      upper === 'DEBIT TO SUPPLIER' ||
      upper === 'DEBIT VENDOR' ||
      upper === 'DEBIT' ||
      upper.startsWith('DEBIT TO VENDOR') ||
      upper.startsWith('DEBIT VENDOR') ||
      upper.startsWith('RETURN TO VENDOR')) &&
    !upper.includes('SALE TILL')
  ) {
    return {
      actionType: 'DEBIT TO VENDOR',
      actionTiming: 'IMMEDIATE',
      cleanRemark
    };
  }

  // ----------------------------------------------------
  // PATTERN B: TRANSFER TO DC (Immediate)
  // ----------------------------------------------------
  if (
    (upper === 'TRANSFER TO DC' ||
      upper === 'TRANSFER TO DC NOW' ||
      upper === 'TRF TO DC' ||
      upper === 'SEND TO DC' ||
      upper === 'SENT TO DC' ||
      upper === 'TRANSFER DC' ||
      upper.startsWith('TRANSFER TO DC') ||
      upper.startsWith('TRF TO DC')) &&
    !upper.includes('SALE TILL') &&
    !upper.includes('WRITE OFF')
  ) {
    return {
      actionType: 'TRANSFER TO DC',
      actionTiming: 'IMMEDIATE',
      cleanRemark
    };
  }

  // ----------------------------------------------------
  // PATTERN C: WRITE OFF AND SEND TO DC
  // Only immediately actionable if explicitly stating NOW, IMMEDIATE, or TODAY.
  // Otherwise deferred until product reaches <= 5% pending shelf life or expired.
  // ----------------------------------------------------
  if (
    (upper.includes('WRITE OFF') ||
      upper === 'WRITE OFF AND SEND TO DC' ||
      upper === 'WRITE OFF & SEND TO DC' ||
      upper === 'WRITE OFF + SEND TO DC' ||
      upper === 'WRITE OFF + SEND TO DC NOW') &&
    !upper.includes('SALE TILL')
  ) {
    const isExplicitNow =
      upper.includes('NOW') ||
      upper.includes('IMMEDIATE') ||
      upper.includes('TODAY');

    return {
      actionType: 'WRITE OFF + SEND TO DC',
      actionTiming: isExplicitNow ? 'IMMEDIATE' : 'DEFERRED',
      cleanRemark
    };
  }

  // ----------------------------------------------------
  // PATTERN: CONTACT PERSON (e.g. CONTACT ANNURAG BHAI)
  // ----------------------------------------------------
  if (
    upper.includes('CONTACT') ||
    upper.includes('TALK TO') ||
    upper.includes('ANNURAG') ||
    upper.includes('ANURAG') ||
    upper.includes('CHECK WITH')
  ) {
    return {
      actionType: 'MANUAL FOLLOW-UP',
      actionTiming: 'IMMEDIATE',
      cleanRemark
    };
  }

  // ----------------------------------------------------
  // UNKNOWN REMARK: NEVER GUESS! SET MANUAL REVIEW!
  // ----------------------------------------------------
  return {
    actionType: 'MANUAL REVIEW',
    actionTiming: 'MANUAL',
    cleanRemark
  };
}

/**
 * Returns the exact operational action name for display on product cards and headers.
 */
export function getActionNowLabel(item: NearExpiryItem): string {
  const type = item.effectiveActionType || item.actionType;
  switch (type) {
    case 'DEBIT TO VENDOR':
      return 'DEBIT TO VENDOR NOW';
    case 'TRANSFER TO DC':
      return 'TRANSFER TO DC NOW';
    case 'WRITE OFF + SEND TO DC':
      return 'WRITE OFF + SEND TO DC NOW';
    case 'ADD TO NEAR EXPIRY / RE-SUBMIT TO HO':
      return 'ADD TO NEAR EXPIRY / RE-SUBMIT TO HO NOW';
    case 'MANUAL FOLLOW-UP':
    case 'MANUAL REVIEW':
    default:
      return 'MANUAL REVIEW';
  }
}

/**
 * Identifies the Action Group key for top-level operational cards in NEED ACTION NOW.
 */
export type ActionGroupKey =
  | 'DEBIT_TO_VENDOR'
  | 'TRANSFER_TO_DC'
  | 'WRITE_OFF_SEND_TO_DC'
  | 'ADD_TO_NEAR_EXPIRY'
  | 'MANUAL_REVIEW';

export function getActionGroupKey(item: NearExpiryItem): ActionGroupKey {
  const type = item.effectiveActionType || item.actionType;
  switch (type) {
    case 'DEBIT TO VENDOR':
      return 'DEBIT_TO_VENDOR';
    case 'TRANSFER TO DC':
      return 'TRANSFER_TO_DC';
    case 'WRITE OFF + SEND TO DC':
      return 'WRITE_OFF_SEND_TO_DC';
    case 'ADD TO NEAR EXPIRY / RE-SUBMIT TO HO':
      return 'ADD_TO_NEAR_EXPIRY';
    default:
      return 'MANUAL_REVIEW';
  }
}

/**
 * Dynamically evaluates an item's current effective status based on:
 * - completedAt
 * - actionTiming
 * - actionDueDate
 * - referenceDate (default: today midnight)
 */
export function evaluateItemStatus(
  item: NearExpiryItem,
  referenceDate?: Date
): {
  status: NearExpiryItemStatus;
  effectiveActionType: NearExpiryActionType;
  daysUntilAction?: number;
  actionDueFormatted?: string;
  instruction: string;
} {
  // If already marked done
  if (item.completedAt || item.status === 'COMPLETED' || item.executionStatus === 'COMPLETED') {
    return {
      status: 'COMPLETED',
      effectiveActionType: item.actionType || 'MANUAL REVIEW',
      instruction: 'ACTION COMPLETED'
    };
  }

  const rawRemark = (item.hoRemark || '').trim();
  const upperRemark = rawRemark.toUpperCase();

  // If no HO remark has been assigned
  if (!rawRemark) {
    return {
      status: 'DRAFT',
      effectiveActionType: 'PENDING HO RESPONSE',
      instruction: 'AWAITING HO REMARKS'
    };
  }

  // Always re-interpret rawRemark against current expiry date to guarantee accurate timing and due date
  const interpretation = interpretHoRemark(rawRemark, item.expiryDate || item.hoExpiryDate);
  const actionType = item.actionType && item.actionType !== 'PENDING HO RESPONSE' ? item.actionType : interpretation.actionType;
  const actionTiming = interpretation.actionTiming || item.actionTiming;
  const actionDueDate = interpretation.actionDueDate || item.actionDueDate;

  if (actionType === 'PENDING HO RESPONSE') {
    return {
      status: 'DRAFT',
      effectiveActionType: 'PENDING HO RESPONSE',
      instruction: 'AWAITING HO REMARKS'
    };
  }

  const today = referenceDate
    ? new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate())
    : new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());

  // Handle Deferred actions (e.g. Sale Till 15 Days, Sale Till Expiry)
  if (actionTiming === 'DEFERRED') {
    const dueDate = parseToMidnightDate(actionDueDate || item.expiryDate || item.hoExpiryDate);

    if (dueDate) {
      const ONE_DAY_MS = 1000 * 60 * 60 * 24;
      const daysUntilAction = Math.round((dueDate.getTime() - today.getTime()) / ONE_DAY_MS);
      const actionDueFormatted = formatDateDDMMYYYY(dueDate);

      // When current date reaches or passes Action Due Date -> ACTION REQUIRED
      if (today.getTime() >= dueDate.getTime()) {
        return {
          status: 'ACTION_REQUIRED',
          effectiveActionType: actionType || 'MANUAL REVIEW',
          daysUntilAction,
          actionDueFormatted,
          instruction: 'DUE FOR ACTION'
        };
      }

      // Before Action Due Date -> WAITING
      return {
        status: 'WAITING',
        effectiveActionType: actionType || 'MANUAL REVIEW',
        daysUntilAction,
        actionDueFormatted,
        instruction: 'CONTINUE SALE'
      };
    }
  }

  // Handle WRITE OFF + SEND TO DC: wait until <= 5% shelf life or expired (unless explicitly forced NOW)
  if (actionType === 'WRITE OFF + SEND TO DC') {
    const isExplicitImmediate = upperRemark.includes('NOW') || upperRemark.includes('IMMEDIATE') || upperRemark.includes('TODAY');
    if (!isExplicitImmediate) {
      const shelf = calculateShelfLife(item.mfgDate || item.hoMfgDate, item.expiryDate || item.hoExpiryDate, today);
      if (shelf.pendingPct > 5.0 && shelf.pendingDays > 0) {
        return {
          status: 'WAITING',
          effectiveActionType: 'WRITE OFF + SEND TO DC',
          daysUntilAction: shelf.pendingDays,
          actionDueFormatted: shelf.expiryFormatted,
          instruction: 'CONTINUE SALE (Wait till ≤ 5% shelf life)'
        };
      }
    }
  }

  // Immediate or Manual actions
  return {
    status: 'ACTION_REQUIRED',
    effectiveActionType: actionType || (actionTiming === 'MANUAL' ? 'MANUAL REVIEW' : 'MANUAL FOLLOW-UP'),
    instruction: actionType === 'MANUAL REVIEW' ? 'MANUAL REVIEW REQUIRED' : 'EXECUTE ON FLOOR'
  };
}
