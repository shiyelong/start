// =============================================================================
// Platform Adapter — platform-specific feature stubs
// Provides a unified API surface that delegates to native (Capacitor / Electron)
// or falls back to web APIs.
// =============================================================================

import { getPlatformInfo } from './detect';
import type { Platform } from './detect';

// ---------------------------------------------------------------------------
// Notification adapter
// ---------------------------------------------------------------------------

export interface PlatformNotification {
  title: string;
  body: string;
  icon?: string;
  data?: Record<string, unknown>;
}

/**
 * Request notification permission and return whether it was granted.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  const { isNative, isElectron } = getPlatformInfo();

  if (isNative) {
    // Capacitor Push Notifications — stub
    // In production: import { PushNotifications } from '@capacitor/push-notifications';
    // await PushNotifications.requestPermissions();
    console.info('[platform/adapter] Capacitor push permission requested');
    return true;
  }

  if (isElectron) {
    // Electron uses the web Notification API directly
    if (typeof Notification !== 'undefined') {
      const result = await Notification.requestPermission();
      return result === 'granted';
    }
    return false;
  }

  // Web fallback
  if (typeof Notification !== 'undefined') {
    const result = await Notification.requestPermission();
    return result === 'granted';
  }
  return false;
}

/**
 * Show a local notification.
 */
export async function showNotification(n: PlatformNotification): Promise<void> {
  const { isNative } = getPlatformInfo();

  if (isNative) {
    // Capacitor LocalNotifications stub
    // import { LocalNotifications } from '@capacitor/local-notifications';
    // await LocalNotifications.schedule({ notifications: [{ title: n.title, body: n.body, id: Date.now() }] });
    console.info('[platform/adapter] Capacitor local notification:', n.title);
    return;
  }

  // Web / Electron
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    new Notification(n.title, { body: n.body, icon: n.icon });
  }
}

// ---------------------------------------------------------------------------
// File system adapter
// ---------------------------------------------------------------------------

export interface FileResult {
  name: string;
  path: string;
  data: ArrayBuffer;
  mimeType: string;
}

/**
 * Pick a file from the device.
 * Returns null if the user cancels.
 */
export async function pickFile(accept?: string): Promise<FileResult | null> {
  const { isNative } = getPlatformInfo();

  if (isNative) {
    // Capacitor Filesystem stub
    // import { FilePicker } from '@capawesome/capacitor-file-picker';
    // const result = await FilePicker.pickFiles({ types: [accept ?? '*/*'] });
    console.info('[platform/adapter] Capacitor file picker invoked');
    return null;
  }

  // Web fallback — use <input type="file">
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    if (accept) input.accept = accept;
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      const data = await file.arrayBuffer();
      resolve({ name: file.name, path: file.name, data, mimeType: file.type });
    };
    input.click();
  });
}

/**
 * Save data to the device file system.
 */
export async function saveFile(
  name: string,
  data: ArrayBuffer | Blob,
  mimeType: string,
): Promise<boolean> {
  const { isNative, isElectron } = getPlatformInfo();

  if (isNative) {
    // Capacitor Filesystem.writeFile stub
    console.info('[platform/adapter] Capacitor saveFile:', name);
    return true;
  }

  if (isElectron) {
    // Electron dialog.showSaveDialog stub
    console.info('[platform/adapter] Electron saveFile:', name);
    return true;
  }

  // Web fallback — trigger download
  const blob = data instanceof Blob ? data : new Blob([data], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
  return true;
}

// ---------------------------------------------------------------------------
// Hardware / device capabilities
// ---------------------------------------------------------------------------

export interface HardwareCapabilities {
  /** Estimated device memory in GB (0 if unknown) */
  deviceMemoryGB: number;
  /** Number of logical CPU cores (0 if unknown) */
  hardwareConcurrency: number;
  /** Whether hardware-accelerated WebGL is available */
  hasWebGL: boolean;
  /** Whether the device supports vibration */
  hasVibration: boolean;
  /** Whether the device supports screen wake lock */
  hasWakeLock: boolean;
}

export function getHardwareCapabilities(): HardwareCapabilities {
  if (typeof navigator === 'undefined') {
    return {
      deviceMemoryGB: 0,
      hardwareConcurrency: 0,
      hasWebGL: false,
      hasVibration: false,
      hasWakeLock: false,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nav = navigator as any;

  let hasWebGL = false;
  try {
    const canvas = document.createElement('canvas');
    hasWebGL = !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    // ignore
  }

  return {
    deviceMemoryGB: nav.deviceMemory ?? 0,
    hardwareConcurrency: nav.hardwareConcurrency ?? 0,
    hasWebGL,
    hasVibration: typeof nav.vibrate === 'function',
    hasWakeLock: 'wakeLock' in nav,
  };
}

// ---------------------------------------------------------------------------
// Screen orientation helpers
// ---------------------------------------------------------------------------

/**
 * Lock screen orientation (mobile only).
 */
export async function lockOrientation(
  orientation: 'portrait' | 'landscape',
): Promise<boolean> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const screen = (window as any).screen;
    if (screen?.orientation?.lock) {
      await screen.orientation.lock(
        orientation === 'landscape' ? 'landscape-primary' : 'portrait-primary',
      );
      return true;
    }
  } catch {
    // Not supported or permission denied
  }
  return false;
}

/**
 * Unlock screen orientation.
 */
export function unlockOrientation(): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const screen = (window as any).screen;
    screen?.orientation?.unlock?.();
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Keep screen awake (video playback, games)
// ---------------------------------------------------------------------------

let _wakeLock: WakeLockSentinel | null = null;

export async function requestWakeLock(): Promise<boolean> {
  try {
    if ('wakeLock' in navigator) {
      _wakeLock = await navigator.wakeLock.request('screen');
      return true;
    }
  } catch {
    // Permission denied or not supported
  }
  return false;
}

export async function releaseWakeLock(): Promise<void> {
  try {
    await _wakeLock?.release();
    _wakeLock = null;
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Safe-area inset helpers
// ---------------------------------------------------------------------------

export interface SafeAreaInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * Read CSS env() safe-area insets. Returns 0 on platforms without notches.
 */
export function getSafeAreaInsets(): SafeAreaInsets {
  if (typeof getComputedStyle === 'undefined') {
    return { top: 0, right: 0, bottom: 0, left: 0 };
  }

  const style = getComputedStyle(document.documentElement);
  const parse = (prop: string) =>
    parseInt(style.getPropertyValue(prop) || '0', 10) || 0;

  return {
    top: parse('env(safe-area-inset-top)'),
    right: parse('env(safe-area-inset-right)'),
    bottom: parse('env(safe-area-inset-bottom)'),
    left: parse('env(safe-area-inset-left)'),
  };
}

// ---------------------------------------------------------------------------
// Platform feature matrix
// ---------------------------------------------------------------------------

export interface PlatformFeatures {
  supportsBackgroundAudio: boolean;
  supportsPushNotifications: boolean;
  supportsFileSystem: boolean;
  supportsSystemTray: boolean;
  supportsGlobalShortcuts: boolean;
  supportsPictureInPicture: boolean;
}

export function getPlatformFeatures(): PlatformFeatures {
  const { platform, isNative, isElectron } = getPlatformInfo();

  return {
    supportsBackgroundAudio: isNative || isElectron,
    supportsPushNotifications: isNative || (typeof Notification !== 'undefined'),
    supportsFileSystem: isNative || isElectron,
    supportsSystemTray: isElectron,
    supportsGlobalShortcuts: isElectron,
    supportsPictureInPicture:
      typeof document !== 'undefined' && 'pictureInPictureEnabled' in document,
  };
}

// ---------------------------------------------------------------------------
// Convenience: get platform-specific config values
// ---------------------------------------------------------------------------

/** Returns recommended image quality tier based on platform and capabilities */
export function getRecommendedImageQuality(): 'low' | 'medium' | 'high' {
  const { formFactor } = getPlatformInfo();
  const { deviceMemoryGB } = getHardwareCapabilities();

  if (formFactor === 'mobile' || deviceMemoryGB <= 2) return 'low';
  if (formFactor === 'tablet' || deviceMemoryGB <= 4) return 'medium';
  return 'high';
}
