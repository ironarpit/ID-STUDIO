import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';

// Polyfill/safe-patch for BarcodeDetector to prevent "Uncaught TypeError: Illegal constructor"
// when running inside restricted iframe or browser environments.
if (typeof window !== 'undefined') {
  try {
    let isNativeWorking = false;
    if ('BarcodeDetector' in window && typeof (window as any).BarcodeDetector === 'function') {
      try {
        const instance = new (window as any).BarcodeDetector({ formats: ['qr_code'] });
        if (instance && typeof instance.detect === 'function') {
          isNativeWorking = true;
        }
      } catch (_) {
        isNativeWorking = false;
      }
    }

    if (!isNativeWorking) {
      class SafeBarcodeDetector {
        constructor() {}
        detect() {
          return Promise.resolve([]);
        }
        static getSupportedFormats() {
          return Promise.resolve(['qr_code', 'code_128', 'ean_13', 'ean_8']);
        }
      }

      try {
        Object.defineProperty(window, 'BarcodeDetector', {
          value: SafeBarcodeDetector,
          writable: true,
          configurable: true,
          enumerable: true,
        });
      } catch (_) {
        (window as any).BarcodeDetector = SafeBarcodeDetector;
      }
    }
  } catch (_) {
    // Ignore polyfill errors
  }
}

import App from './App.tsx';
import './index.css';

// Register Service Worker for Instant PWA Web App Installation across devices
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('Service Worker registration skipped:', err);
    });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

