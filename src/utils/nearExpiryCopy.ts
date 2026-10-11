import { NearExpiryItem } from '../types';
import { formatDateDDMMYYYY, getActionNowLabel, calculateShelfLife } from './nearExpiryEngine';

/**
 * Formats items for Daily Floor Removal WhatsApp notification:
 *
 * FLOOR REMOVAL — PATAN
 * Date: DD/MM/YYYY
 * Items/Lots: 12
 *
 * 1. KELLOGG'S OATS-1.5 kg
 * Code: 002007412
 * Qty: 2
 * Expiry: 05/10/2026
 * Pending: 4 days | 4.0%
 *
 * 2. BALAJI WAFERS
 * Code: 002019944
 * Qty: 10
 * Expiry: 14/09/2026
 * Pending: Expires Today | 0.0%
 *
 * Please remove these items from the floor and confirm.
 */
export function formatFloorRemovalForWhatsApp(
  items: NearExpiryItem[],
  storeName?: string,
  date: Date = new Date()
): string {
  const effectiveStore = (!storeName || storeName.trim().toUpperCase() === 'STORE 1' || storeName.trim() === 'store_1')
    ? 'PATAN'
    : storeName.trim().replace(/^\[(.*)\]$/, '$1').trim().toUpperCase();

  const dateStr = formatDateDDMMYYYY(date);
  const header = `FLOOR REMOVAL — ${effectiveStore}\nDate: ${dateStr}\nItems/Lots: ${items.length}`;

  if (!items || items.length === 0) {
    return `${header}\n\nPlease remove these items from the floor and confirm.`;
  }

  const productBlocks = items.map((it, idx) => {
    const name = (it.itemName || it.hoItemName || 'Product').trim();
    const code = (it.bansalCode || it.hoBansalCode || it.barcode || it.hoEanCode || 'N/A').trim();
    const qty = Number(it.nearExpiryStock ?? it.hoNearExpiryStock) || 0;
    const expDate = it.expiryDate || it.hoExpiryDate;
    const expStr = expDate ? formatDateDDMMYYYY(expDate) : 'N/A';

    // Live days remaining & pending shelf life % against current device date
    const life = calculateShelfLife(it.mfgDate || it.hoMfgDate, expDate, date);
    let pendingStr = '';
    if (life.pendingDays < 0) {
      const abs = Math.abs(life.pendingDays);
      pendingStr = `${abs} ${abs === 1 ? 'day' : 'days'} expired`;
    } else if (life.pendingDays === 0) {
      pendingStr = 'Expires Today';
    } else {
      pendingStr = `${life.pendingDays} ${life.pendingDays === 1 ? 'day' : 'days'}`;
    }

    const pctVal = life.totalDays > 0 ? life.pendingPct : (Number(it.pendingPct) || 0);
    const pctStr = `${pctVal.toFixed(1)}%`;

    return `${idx + 1}. ${name}\nCode: ${code}\nQty: ${qty}\nExpiry: ${expStr}\nPending: ${pendingStr} | ${pctStr}`;
  });

  return `${header}\n\n${productBlocks.join('\n\n')}\n\nPlease remove these items from the floor and confirm.`;
}

/**
 * Formats exactly the filtered Near Expiry items for WhatsApp in compact format:
 *
 * NEAR EXPIRY — PATAN
 *
 * Products: 12
 *
 * 1. KELLOGG'S OATS-1.5 kg
 * Code: 002007412
 * Qty: 2
 * Expiry: 05/10/2026
 * Pending: 21 days | 5.9%
 *
 * 2. PRODUCT NAME
 * Code: 00XXXXXXX
 * Qty: 4
 * Expiry: 10/10/2026
 * Pending: 26 days | 8.2%
 *
 * — BSM Floor IQ
 */
export function formatFilteredNearExpiryForWhatsApp(
  items: NearExpiryItem[]
): string {
  const header = `NEAR EXPIRY — PATAN\n\nProducts: ${items.length}`;

  if (!items || items.length === 0) {
    return `${header}\n\n— BSM Floor IQ`;
  }

  const now = new Date();
  const productBlocks = items.map((it, idx) => {
    const name = (it.itemName || it.hoItemName || 'Product').trim();
    const code = (it.bansalCode || it.hoBansalCode || it.barcode || it.hoEanCode || 'N/A').trim();
    const qty = Number(it.nearExpiryStock ?? it.hoNearExpiryStock) || 0;
    const expDate = it.expiryDate || it.hoExpiryDate;
    const expStr = expDate ? formatDateDDMMYYYY(expDate) : 'N/A';

    // Live days remaining & pending shelf life % against current device date
    const life = calculateShelfLife(it.mfgDate || it.hoMfgDate, expDate, now);
    let pendingStr = '';
    if (life.pendingDays < 0) {
      const abs = Math.abs(life.pendingDays);
      pendingStr = `${abs} ${abs === 1 ? 'day' : 'days'} expired`;
    } else if (life.pendingDays === 0) {
      pendingStr = 'Expires Today';
    } else {
      pendingStr = `${life.pendingDays} ${life.pendingDays === 1 ? 'day' : 'days'}`;
    }

    const pctVal = life.totalDays > 0 ? life.pendingPct : (Number(it.pendingPct) || 0);
    const pctStr = `${pctVal.toFixed(1)}%`;

    return `${idx + 1}. ${name}\nCode: ${code}\nQty: ${qty}\nExpiry: ${expStr}\nPending: ${pendingStr} | ${pctStr}`;
  });

  return `${header}\n\n${productBlocks.join('\n\n')}\n\n— BSM Floor IQ`;
}

/**
 * Formats a single item for plain-text WhatsApp sharing in compact format.
 *
 * PRODUCT NAME
 * Code: 0020XXXXX
 * Qty: 70
 * Exp: 07/09/2026
 * Action: WRITE OFF + SEND TO DC
 *
 * — BSM Floor IQ
 */
export function formatNearExpiryItemForWhatsApp(item: NearExpiryItem): string {
  const name = (item.itemName || item.hoItemName || 'Product').trim();
  const code = (item.bansalCode || item.hoBansalCode || item.barcode || item.hoEanCode || 'N/A').trim();
  const stock = Number(item.nearExpiryStock ?? item.hoNearExpiryStock) || 0;
  const exp = item.expiryDate || item.hoExpiryDate ? formatDateDDMMYYYY(item.expiryDate || item.hoExpiryDate) : 'N/A';
  
  const rawAction = (item.effectiveActionType || item.actionType || getActionNowLabel(item)).trim();
  const action = rawAction.replace(/\s+NOW$/i, '').toUpperCase();

  return `${name}\nCode: ${code}\nQty: ${stock}\nExp: ${exp}\nAction: ${action}\n\n— ID STUDIO Floor IQ`;
}

/**
 * Formats a complete list of items for WhatsApp with compact format:
 *
 * [STORE 1]
 * WRITE OFF + SEND TO DC
 *
 * 6 Products | Qty: 221
 *
 * 1. BALAJI RATLAMI SEV
 * 002023209 | Qty: 70 | Exp: 07/09/2026
 *
 * 2. PRODUCT NAME
 * 0020XXXXX | Qty: 25 | Exp: 10/09/2026
 *
 * — ID STUDIO Floor IQ
 */
export function formatNearExpiryListForWhatsApp(
  title: string,
  items: NearExpiryItem[],
  storeName?: string
): string {
  const effectiveStore = (!storeName || storeName.trim().toUpperCase() === 'STORE 1' || storeName.trim() === 'store_1')
    ? 'PATAN'
    : storeName.trim().replace(/^\[(.*)\]$/, '$1').trim().toUpperCase();

  const storeHeader = `[${effectiveStore}]\n`;

  let cleanTitle = title.toUpperCase().trim();
  cleanTitle = cleanTitle.replace(/\s+NOW$/i, '').trim() || cleanTitle;

  if (!items || items.length === 0) {
    return `${storeHeader}${cleanTitle}\n\n0 Products | Qty: 0\n\n— ID STUDIO Floor IQ`;
  }

  const totalQty = items.reduce(
    (sum, it) => sum + (Number(it.nearExpiryStock ?? it.hoNearExpiryStock) || 0),
    0
  );

  const header = `${storeHeader}${cleanTitle}\n\n${items.length} ${items.length === 1 ? 'Product' : 'Products'} | Qty: ${totalQty}`;

  const productBlocks = items.map((it, idx) => {
    const name = (it.itemName || it.hoItemName || 'Product').trim();
    const code = (it.bansalCode || it.hoBansalCode || it.barcode || it.hoEanCode || 'N/A').trim();
    const qty = Number(it.nearExpiryStock ?? it.hoNearExpiryStock) || 0;
    const exp = it.expiryDate || it.hoExpiryDate ? formatDateDDMMYYYY(it.expiryDate || it.hoExpiryDate) : 'N/A';

    return `${idx + 1}. ${name}\n${code} | Qty: ${qty} | Exp: ${exp}`;
  });

  return `${header}\n\n${productBlocks.join('\n\n')}\n\n— ID STUDIO Floor IQ`;
}

/**
 * Exact specification format for Stage 2 REMOVE TODAY WhatsApp copy:
 *
 * NEAR EXPIRY — REMOVE FROM FLOOR
 * Store: PATAN
 * Date: DD/MM/YYYY
 * Products: X
 *
 * 1. PRODUCT NAME
 *    Code: 002000000
 *    Qty: 2
 *    Expiry: 05/10/2026
 *    Pending: 17 days | 4.8%
 *
 * — BSM Floor IQ
 */
export function formatRemoveTodayWhatsApp(
  items: NearExpiryItem[],
  storeName: string = 'PATAN',
  date: Date = new Date()
): string {
  const effectiveStore = (!storeName || storeName.trim().toUpperCase() === 'STORE 1' || storeName.trim() === 'store_1')
    ? 'PATAN'
    : storeName.trim().replace(/^\[(.*)\]$/, '$1').trim().toUpperCase();

  const dateStr = formatDateDDMMYYYY(date);
  const header = `NEAR EXPIRY — REMOVE FROM FLOOR\nStore: ${effectiveStore}\nDate: ${dateStr}\nProducts: ${items.length}`;

  if (!items || items.length === 0) {
    return `${header}\n\n— BSM Floor IQ`;
  }

  const now = new Date();
  const productBlocks = items.map((it, idx) => {
    const name = (it.itemName || it.hoItemName || 'Product').trim();
    const code = (it.bansalCode || it.hoBansalCode || it.barcode || it.hoEanCode || 'N/A').trim();
    const qty = Number(it.nearExpiryStock ?? it.hoNearExpiryStock) || 0;
    const expDate = it.expiryDate || it.hoExpiryDate;
    const expStr = expDate ? formatDateDDMMYYYY(expDate) : 'N/A';

    const life = calculateShelfLife(it.mfgDate || it.hoMfgDate, expDate, now);
    let pendingStr = '';
    if (life.pendingDays < 0) {
      const abs = Math.abs(life.pendingDays);
      pendingStr = `${abs} ${abs === 1 ? 'day' : 'days'} expired`;
    } else if (life.pendingDays === 0) {
      pendingStr = 'Expires Today';
    } else {
      pendingStr = `${life.pendingDays} ${life.pendingDays === 1 ? 'day' : 'days'}`;
    }

    const pctVal = life.totalDays > 0 ? life.pendingPct : (Number(it.pendingPct) || 0);
    const pctStr = `${pctVal.toFixed(1)}%`;

    return `${idx + 1}. ${name}\n   Code: ${code}\n   Qty: ${qty}\n   Expiry: ${expStr}\n   Pending: ${pendingStr} | ${pctStr}`;
  });

  return `${header}\n\n${productBlocks.join('\n\n')}\n\n— BSM Floor IQ`;
}

/**
 * Copies plain text to clipboard safely.
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallback
    }
  }

  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-9999px';
    textArea.style.top = '0';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    return successful;
  } catch (err) {
    console.warn('Failed to copy to clipboard:', err);
    return false;
  }
}


