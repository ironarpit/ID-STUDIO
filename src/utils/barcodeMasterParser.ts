import * as XLSX from 'xlsx';
import { BarcodeMasterItem } from '../types';

export interface BarcodeMasterParseResult {
  filename: string;
  items: BarcodeMasterItem[];
  totalSourceRows: number;
  validMappings: number;
  rejectedRows: number;
  uniqueLocalCodes: number;
  uniqueBarcodes: number;
  multiBarcodeCodes: number;
  conflictingBarcodes: number;
  headersFound: string[];
}

/**
 * CODE parsing rules:
 * - treat as text
 * - trim whitespace
 * - remove trailing Excel .0
 * - remove non-digits
 * - left-pad to exactly 9 digits
 * - reject row if final CODE is empty or not exactly 9 digits
 */
export function cleanBarcodeMasterCode(val: any): string {
  if (val === null || val === undefined) return '';

  let s = typeof val === 'number'
    ? (Number.isInteger(val) ? String(val) : String(val).replace(/\.0+$/, ''))
    : String(val).trim();

  // Remove trailing Excel .0
  s = s.replace(/\.0+$/, '');

  // Remove non-digits
  s = s.replace(/\D/g, '');

  // Left-pad to exactly 9 digits
  if (s.length > 0 && s.length <= 9) {
    s = s.padStart(9, '0');
  }

  // Reject if not exactly 9 digits
  return s.length === 9 ? s : '';
}

/**
 * EAN parsing rules:
 * - convert to string
 * - trim
 * - remove trailing numeric ".0" if present
 * - remove ALL whitespace characters, including internal spaces/tabs
 * - treat as TEXT
 * - preserve leading zeros
 * - do NOT left-pad barcode
 * - do NOT alter valid barcode digits
 * - do NOT apply GS1/EAN validation during import
 * - reject row if barcode is empty
 */
export function cleanBarcodeMasterEan(val: any): string {
  if (val === null || val === undefined) return '';

  let s = '';
  if (typeof val === 'number') {
    if (!isNaN(val) && isFinite(val)) {
      s = BigInt(Math.round(val)).toString();
    } else {
      s = String(val);
    }
  } else {
    s = String(val);
    // In case string itself is in scientific notation e.g. "8.90123E+12"
    if (/^[+-]?\d+(\.\d+)?[eE][+-]?\d+$/i.test(s.trim())) {
      try {
        const num = Number(s.trim());
        if (!isNaN(num) && isFinite(num)) {
          s = BigInt(Math.round(num)).toString();
        }
      } catch {
        // Keep string as is
      }
    }
  }

  // 1. convert to string & trim
  let barcode = String(s ?? '').trim();
  // 2. remove trailing numeric ".0" if present
  barcode = barcode.replace(/\.0+$/, '');
  // 3. remove ALL whitespace characters, including internal spaces/tabs
  barcode = barcode.replace(/\s+/g, '');

  return barcode;
}

/**
 * Parses an Excel (.xlsx) file for Barcode Master mappings.
 * Expected columns: CODE, ITEMNAME, UOM, EAN (case-insensitive, whitespace trimmed).
 */
export async function parseBarcodeMasterExcel(
  file: File,
  onProgress?: (stage: string, percent: number) => void
): Promise<BarcodeMasterParseResult> {
  const filename = file.name;
  const ext = filename.split('.').pop()?.toLowerCase();
  if (ext !== 'xlsx' && ext !== 'xls') {
    throw new Error('Unsupported file format. Please upload an Excel (.xlsx) file.');
  }

  if (onProgress) onProgress('Reading Excel', 10);

  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, {
    type: 'array',
    cellDates: false
  });

  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new Error('The uploaded Excel workbook contains no worksheets.');
  }

  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) {
    throw new Error('Unable to read the first worksheet in the workbook.');
  }

  if (onProgress) onProgress('Validating Rows', 25);

  const rawRows = XLSX.utils.sheet_to_json<any[]>(sheet, {
    header: 1,
    raw: true,
    defval: ''
  });

  if (!rawRows || rawRows.length === 0) {
    throw new Error('The worksheet is empty.');
  }

  // Detect header row by scanning first 15 rows
  const normalizeCol = (str: any) =>
    String(str || '')
      .trim()
      .toUpperCase()
      .replace(/[\s_-]+/g, '');

  let headerRowIndex = -1;
  let codeIdx = -1;
  let eanIdx = -1;
  let nameIdx = -1;
  let uomIdx = -1;

  const maxHeaderScan = Math.min(rawRows.length, 15);
  for (let r = 0; r < maxHeaderScan; r++) {
    const row = rawRows[r];
    if (!Array.isArray(row)) continue;

    let cIdx = -1;
    let eIdx = -1;
    let nIdx = -1;
    let uIdx = -1;

    for (let c = 0; c < row.length; c++) {
      const norm = normalizeCol(row[c]);
      if (norm === 'CODE' || norm === 'LOCALCODE' || norm === 'ITEMCODE' || norm === 'BANSALCODE' || norm === 'SHORTCODE') {
        if (cIdx === -1) cIdx = c;
      } else if (norm === 'EAN' || norm === 'BARCODE' || norm === 'EANCODE' || norm === 'UPC') {
        if (eIdx === -1) eIdx = c;
      } else if (norm === 'ITEMNAME' || norm === 'NAME' || norm === 'PRODUCT' || norm === 'PRODUCTNAME' || norm === 'DESCRIPTION' || norm === 'PARTICULARS') {
        if (nIdx === -1) nIdx = c;
      } else if (norm === 'UOM' || norm === 'UNIT' || norm === 'UNITOFMEASURE') {
        if (uIdx === -1) uIdx = c;
      }
    }

    if (cIdx !== -1 && eIdx !== -1) {
      headerRowIndex = r;
      codeIdx = cIdx;
      eanIdx = eIdx;
      nameIdx = nIdx;
      uomIdx = uIdx;
      break;
    }
  }

  if (headerRowIndex === -1 || codeIdx === -1 || eanIdx === -1) {
    throw new Error(
      "Missing required columns. Expected header row containing 'CODE' and 'EAN' (and optionally 'ITEMNAME', 'UOM')."
    );
  }

  const headersFound: string[] = (rawRows[headerRowIndex] || []).map((c: any) => String(c || '').trim());

  if (onProgress) onProgress('Preparing Mappings', 40);

  const items: BarcodeMasterItem[] = [];
  const seenPairs = new Set<string>();
  let totalSourceRows = 0;
  let rejectedRows = 0;

  for (let r = headerRowIndex + 1; r < rawRows.length; r++) {
    const row = rawRows[r];
    if (!Array.isArray(row) || row.length === 0) continue;

    // Check if entire row is empty
    const hasAnyValue = row.some((cell) => cell !== null && cell !== undefined && String(cell).trim() !== '');
    if (!hasAnyValue) continue;

    totalSourceRows++;

    const rawCode = row[codeIdx];
    const rawEan = row[eanIdx];
    const rawName = nameIdx !== -1 ? row[nameIdx] : '';
    const rawUom = uomIdx !== -1 ? row[uomIdx] : '';

    const code = cleanBarcodeMasterCode(rawCode);
    if (!code) {
      rejectedRows++;
      continue;
    }

    const ean = cleanBarcodeMasterEan(rawEan);
    if (!ean) {
      rejectedRows++;
      continue;
    }

    const itemName = rawName !== null && rawName !== undefined ? String(rawName).trim() : '';
    const uom = rawUom !== null && rawUom !== undefined ? String(rawUom).trim() : '';

    // De-duplicate ONLY exact duplicate CODE + EAN pairs
    const pairKey = `${code}|${ean}`;
    if (seenPairs.has(pairKey)) {
      continue;
    }
    seenPairs.add(pairKey);

    items.push({
      code,
      itemName,
      uom,
      ean
    });
  }

  if (items.length === 0) {
    throw new Error('No valid mappings could be extracted. Please check the file format and rows.');
  }

  // Calculate distinct metrics
  const uniqueLocalCodes = new Set(items.map((i) => i.code)).size;
  const uniqueBarcodes = new Set(items.map((i) => i.ean)).size;

  const codeToBarcodes = new Map<string, Set<string>>();
  const barcodeToCodes = new Map<string, Set<string>>();

  for (const item of items) {
    if (!codeToBarcodes.has(item.code)) {
      codeToBarcodes.set(item.code, new Set());
    }
    codeToBarcodes.get(item.code)!.add(item.ean);

    if (!barcodeToCodes.has(item.ean)) {
      barcodeToCodes.set(item.ean, new Set());
    }
    barcodeToCodes.get(item.ean)!.add(item.code);
  }

  let multiBarcodeCodes = 0;
  for (const set of codeToBarcodes.values()) {
    if (set.size > 1) multiBarcodeCodes++;
  }

  let conflictingBarcodes = 0;
  for (const set of barcodeToCodes.values()) {
    if (set.size > 1) conflictingBarcodes++;
  }

  return {
    filename,
    items,
    totalSourceRows,
    validMappings: items.length,
    rejectedRows,
    uniqueLocalCodes,
    uniqueBarcodes,
    multiBarcodeCodes,
    conflictingBarcodes,
    headersFound
  };
}
