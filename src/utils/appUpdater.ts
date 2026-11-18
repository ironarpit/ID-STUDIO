import { isAndroidNative } from './platform';

/**
 * Utility to force-refresh application bundles and clear asset caches
 * WITHOUT deleting or affecting IndexedDB databases or localStorage
 * (all user uploaded Stock IQ, Focus, Near Expiry, and Barcode data remain 100% safe).
 */
export async function forceAppUpdate(): Promise<void> {
  if (isAndroidNative()) {
    return;
  }

  try {
    // 1. Clear CacheStorage (service worker and browser asset caches)
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map((name) => caches.delete(name)));
    }

    // 2. Unregister all service workers
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((reg) => reg.unregister()));
    }
  } catch (err) {
    console.warn('Cache clearing notice:', err);
  }

  // 3. Trigger hard cache-busting reload
  try {
    const currentUrl = new URL(window.location.href);
    currentUrl.searchParams.set('_v', Date.now().toString());
    window.location.replace(currentUrl.toString());
  } catch (_e) {
    window.location.reload();
  }
}
