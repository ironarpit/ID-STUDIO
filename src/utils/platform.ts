import { Capacitor } from '@capacitor/core';

export type AppPlatform = 'android' | 'ios' | 'web';

/**
 * Returns true when running inside a native Capacitor container (Android or iOS).
 */
export function isCapacitorNative(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/**
 * Returns true only when running inside the native Capacitor Android application.
 */
export function isAndroidNative(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  } catch {
    return false;
  }
}

/**
 * Returns true only when running inside the native Capacitor iOS application.
 */
export function isIOSNative(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';
  } catch {
    return false;
  }
}

/**
 * Returns true when running in a standard desktop/mobile web browser or PWA.
 */
export function isWebBrowser(): boolean {
  return !isCapacitorNative();
}

export function getAppPlatform(): AppPlatform {
  try {
    const p = Capacitor.getPlatform();
    if (p === 'android' || p === 'ios') return p;
  } catch {
    // Fallback to web
  }
  return 'web';
}

/**
 * Returns configured backend base URL (without trailing slash) for native builds,
 * or empty string on web so relative /api/* routes resolve against the current origin.
 */
export function getApiBaseUrl(): string {
  const raw = import.meta.env.VITE_API_BASE_URL;
  if (typeof raw !== 'string') return '';
  return raw.trim().replace(/\/+$/, '');
}

/**
 * Builds an API endpoint URL supporting VITE_API_BASE_URL while preserving
 * relative `/api/...` paths on standard web builds.
 */
export function getApiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const baseUrl = getApiBaseUrl();
  return baseUrl ? `${baseUrl}${normalizedPath}` : normalizedPath;
}

/**
 * Requests camera permission upfront via getUserMedia so Capacitor Android's
 * BridgeWebChromeClient triggers the OS runtime camera permission prompt before
 * camera enumeration or scanning begins. Immediately releases the temporary stream.
 */
export async function ensureCameraPermission(): Promise<{ granted: boolean; errorMessage?: string }> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    return {
      granted: false,
      errorMessage: 'Camera API is unavailable on this device or WebView.',
    };
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
      audio: false,
    });
    stream.getTracks().forEach((track) => {
      try {
        track.stop();
      } catch {
        // Ignore stop errors
      }
    });
    return { granted: true };
  } catch (err: any) {
    const name = err?.name || '';
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
      return {
        granted: false,
        errorMessage: isAndroidNative()
          ? 'Camera permission denied. Please allow Camera access for ID STUDIO in Android Settings > Apps > ID STUDIO > Permissions.'
          : 'Camera permission denied. Please allow camera access in browser settings.',
      };
    }
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      return {
        granted: false,
        errorMessage: 'No camera hardware detected on this device.',
      };
    }
    return {
      granted: false,
      errorMessage: err?.message || 'Unable to access device camera.',
    };
  }
}
