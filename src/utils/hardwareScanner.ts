import { useEffect } from 'react';
import { normalizeScannedBarcode } from './barcodeResolver';

export type ScannerContextMode = 'floor_audit' | 'focus_iq' | 'global_search';

export type ScanResultType = 'MATCHED' | 'NOT_IN_AUDIT' | 'NOT_IN_FOCUS' | 'NOT_FOUND' | 'FOUND';

export interface ScannerFeedbackData {
  id: string;
  type: 'matched' | 'not_in_audit' | 'not_in_focus' | 'not_found' | 'found';
  title: string;
  productName?: string;
  bansalCode?: string;
  barcode: string;
  message?: string;
  timestamp: number;
}

export interface SessionScanItem {
  id: string;
  barcode: string;
  productName?: string;
  bansalCode?: string;
  result: ScanResultType;
  context: ScannerContextMode;
  timestamp: string;
}

interface UseHardwareScannerOptions {
  onScan: (barcode: string) => void;
  enabled?: boolean;
}

/**
 * Global Hardware HID Barcode Scanner Listener.
 *
 * NETUM Bluetooth HID Barcode Scanner operates as a high-speed keyboard wedge:
 * - Emits keystrokes with < 50ms interval between characters.
 * - Terminates sequence with Enter key ('Enter').
 * - Normal human typing (typically > 80-150ms per key) is ignored.
 * - Protects active input fields from barcode character leakage and form submission.
 * - Applies 800ms duplicate guard for identical barcode scans.
 */
export function useHardwareBarcodeScanner({ onScan, enabled = true }: UseHardwareScannerOptions) {
  useEffect(() => {
    if (!enabled) return;

    let buffer = '';
    let lastKeyTime = 0;
    let burstStartTime = 0;
    let activeInput: { element: HTMLInputElement | HTMLTextAreaElement; preBurstValue: string } | null = null;
    let lastScanGuard = { barcode: '', timestamp: 0 };

    const KEY_TIMEOUT_MS = 90; // Max time between consecutive scanner keys
    const MAX_AVG_INTERVAL_MS = 55; // Hardware scanner keys arrive < 50ms apart
    const MIN_BARCODE_LENGTH = 3; // Sensible minimum barcode length
    const DUPLICATE_GUARD_MS = 800; // 700-1000ms duplicate scan guard

    const handleKeyDown = (e: KeyboardEvent) => {
      const now = Date.now();
      const timeSinceLastKey = now - lastKeyTime;

      // Check if user is typing inside an input/textarea
      const target = e.target as HTMLElement | null;
      const isInputFocused =
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);

      // Handle Enter (completion of scan)
      if (e.key === 'Enter') {
        const bufferedText = buffer.trim();
        const burstDuration = now - burstStartTime;
        const charCount = bufferedText.length;
        const avgInterval = charCount > 1 ? burstDuration / charCount : 999;

        // Verify that this was indeed a hardware scanner burst (fast & reasonable length)
        if (charCount >= MIN_BARCODE_LENGTH && avgInterval < MAX_AVG_INTERVAL_MS) {
          // Hardware scan detected!
          e.preventDefault();
          e.stopPropagation();

          // If an input was focused during this burst, revert the input to its pre-burst value
          // so the barcode characters do not pollute the text field
          if (activeInput && isInputFocused) {
            const { element, preBurstValue } = activeInput;
            element.value = preBurstValue;
            // Dispatch input event to notify any React state of the clean value
            element.dispatchEvent(new Event('input', { bubbles: true }));
          }

          const cleanCode = normalizeScannedBarcode(bufferedText);

          // Check Duplicate-Scan Guard (800ms window for identical barcode)
          const isDuplicate =
            lastScanGuard.barcode === cleanCode &&
            now - lastScanGuard.timestamp < DUPLICATE_GUARD_MS;

          // Always reset scanner buffer immediately
          buffer = '';
          activeInput = null;
          lastKeyTime = 0;
          burstStartTime = 0;

          if (isDuplicate) {
            // Accidental double-trigger ignored
            return;
          }

          // Record scan for duplicate guard
          lastScanGuard = { barcode: cleanCode, timestamp: now };

          // Execute independent scan processing
          onScan(cleanCode);
          return;
        }

        // If not a rapid scanner burst, reset buffer and let Enter behave normally
        buffer = '';
        activeInput = null;
        lastKeyTime = 0;
        burstStartTime = 0;
        return;
      }

      // Only track printable single characters (numbers, letters, standard barcode symbols)
      if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        // If too much time has passed since previous key, reset buffer for a new burst
        if (timeSinceLastKey > KEY_TIMEOUT_MS) {
          buffer = e.key;
          burstStartTime = now;
          if (isInputFocused && target) {
            activeInput = {
              element: target as HTMLInputElement | HTMLTextAreaElement,
              preBurstValue: (target as HTMLInputElement).value || '',
            };
          } else {
            activeInput = null;
          }
        } else {
          // Rapid key arrival (< 90ms): append to buffer
          buffer += e.key;
        }

        lastKeyTime = now;
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [enabled, onScan]);
}
