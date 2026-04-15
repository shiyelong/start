// =============================================================================
// Platform Detection — detect Web/Android/iOS/TV/Windows/macOS
// =============================================================================

/** Supported runtime platforms */
export type Platform =
  | 'web'
  | 'android'
  | 'ios'
  | 'android-tv'
  | 'windows'
  | 'macos';

/** Device form factor */
export type FormFactor = 'mobile' | 'tablet' | 'desktop' | 'tv';

export interface PlatformInfo {
  platform: Platform;
  formFactor: FormFactor;
  /** True when running inside Capacitor native shell */
  isNative: boolean;
  /** True when running inside Electron desktop shell */
  isElectron: boolean;
  /** True when the device has touch support */
  hasTouch: boolean;
  /** True when a TV-style leanback UI should be used */
  isTv: boolean;
  /** True when safe-area insets should be respected */
  hasSafeArea: boolean;
  /** User-agent string (empty on server) */
  userAgent: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof navigator !== 'undefined';
}

function getUA(): string {
  return isBrowser() ? navigator.userAgent : '';
}

function hasTouchSupport(): boolean {
  if (!isBrowser()) return false;
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

/**
 * Detect if the app is running inside Capacitor (Android / iOS native shell).
 * Capacitor injects `window.Capacitor` at runtime.
 */
function isCapacitor(): boolean {
  if (!isBrowser()) return false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return !!(window as any).Capacitor;
}

/**
 * Detect if the app is running inside Electron.
 * Electron exposes `process.versions.electron` or a custom preload flag.
 */
function isElectronEnv(): boolean {
  if (!isBrowser()) return false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  return !!(w.process?.versions?.electron || w.__ELECTRON__);
}

/**
 * Detect Android TV / Fire TV / Google TV.
 * These devices include "Android" in the UA and have leanback features.
 */
function isAndroidTv(): boolean {
  const ua = getUA();
  if (!ua.includes('Android')) return false;
  // Common TV identifiers
  return (
    ua.includes('TV') ||
    ua.includes('AFT') || // Amazon Fire TV
    ua.includes('BRAVIA') ||
    ua.includes('Chromecast') ||
    ua.includes('SmartTV') ||
    ua.includes('Tizen') ||
    ua.includes('Web0S')
  );
}

// ---------------------------------------------------------------------------
// Main detection
// ---------------------------------------------------------------------------

/**
 * Detect the current runtime platform and form factor.
 * Safe to call on both server and client — returns sensible defaults on server.
 */
export function detectPlatform(): PlatformInfo {
  const ua = getUA();
  const touch = hasTouchSupport();
  const capacitor = isCapacitor();
  const electron = isElectronEnv();

  // --- TV detection (must come before generic Android) ---
  if (isAndroidTv()) {
    return {
      platform: 'android-tv',
      formFactor: 'tv',
      isNative: capacitor,
      isElectron: false,
      hasTouch: false,
      isTv: true,
      hasSafeArea: false,
      userAgent: ua,
    };
  }

  // --- Electron desktop ---
  if (electron) {
    const isMac = ua.includes('Macintosh') || ua.includes('Mac OS');
    return {
      platform: isMac ? 'macos' : 'windows',
      formFactor: 'desktop',
      isNative: false,
      isElectron: true,
      hasTouch: touch,
      isTv: false,
      hasSafeArea: false,
      userAgent: ua,
    };
  }

  // --- Capacitor native ---
  if (capacitor) {
    const isIos = /iPad|iPhone|iPod/.test(ua) || (ua.includes('Mac') && touch);
    return {
      platform: isIos ? 'ios' : 'android',
      formFactor: touch && window.innerWidth < 768 ? 'mobile' : 'tablet',
      isNative: true,
      isElectron: false,
      hasTouch: true,
      isTv: false,
      hasSafeArea: isIos,
      userAgent: ua,
    };
  }

  // --- Plain browser ---
  const isIos = /iPad|iPhone|iPod/.test(ua) || (ua.includes('Mac') && touch);
  const isAndroid = ua.includes('Android');
  const isMobile = isIos || isAndroid;
  const isMac = ua.includes('Macintosh') || ua.includes('Mac OS');

  let platform: Platform = 'web';
  if (isIos) platform = 'ios';
  else if (isAndroid) platform = 'android';
  else if (isMac) platform = 'macos';
  else if (ua.includes('Windows')) platform = 'windows';

  let formFactor: FormFactor = 'desktop';
  if (isMobile) {
    formFactor = isBrowser() && window.innerWidth >= 768 ? 'tablet' : 'mobile';
  }

  return {
    platform,
    formFactor,
    isNative: false,
    isElectron: false,
    hasTouch: touch,
    isTv: false,
    hasSafeArea: isIos,
    userAgent: ua,
  };
}

/** Singleton — lazily computed on first access */
let _cached: PlatformInfo | null = null;

export function getPlatformInfo(): PlatformInfo {
  if (!_cached) {
    _cached = detectPlatform();
  }
  return _cached;
}

/** Reset cached value (useful after orientation change or for testing) */
export function resetPlatformCache(): void {
  _cached = null;
}
