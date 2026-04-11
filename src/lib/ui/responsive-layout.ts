// =============================================================================
// Responsive Layout — Breakpoint detection and layout configuration
// =============================================================================

import type { DeviceClass, Orientation, LayoutConfig } from '@/lib/types';

// Re-export types for convenience
export type { DeviceClass, Orientation, LayoutConfig };

// ---------------------------------------------------------------------------
// Layout configs for every device-orientation combination
// ---------------------------------------------------------------------------

export const LAYOUT_CONFIGS: Record<`${DeviceClass}-${Orientation}`, LayoutConfig> = {
  'mobile-portrait':   { canvasScale: 0.6, controlsPosition: 'bottom', chatPosition: 'overlay', toolbarPosition: 'top' },
  'mobile-landscape':  { canvasScale: 0.8, controlsPosition: 'sides',  chatPosition: 'overlay', toolbarPosition: 'top' },
  'tablet-portrait':   { canvasScale: 0.5, controlsPosition: 'bottom', chatPosition: 'overlay', toolbarPosition: 'top' },
  'tablet-landscape':  { canvasScale: 0.7, controlsPosition: 'sides',  chatPosition: 'side',    toolbarPosition: 'top' },
  'desktop-portrait':  { canvasScale: 0.8, controlsPosition: 'hidden', chatPosition: 'side',    toolbarPosition: 'top' },
  'desktop-landscape': { canvasScale: 0.8, controlsPosition: 'hidden', chatPosition: 'side',    toolbarPosition: 'top' },
};

// ---------------------------------------------------------------------------
// Breakpoint detection
// ---------------------------------------------------------------------------

/** Classify viewport width into a device class. */
export function getDeviceClass(width: number): DeviceClass {
  if (width < 768) return 'mobile';
  if (width < 1024) return 'tablet';
  return 'desktop';
}

/** Detect current orientation from the screen API or window dimensions. */
export function getOrientation(): Orientation {
  if (typeof window === 'undefined') return 'landscape';

  // Prefer the Screen Orientation API when available
  if (window.screen?.orientation?.type) {
    return window.screen.orientation.type.startsWith('portrait') ? 'portrait' : 'landscape';
  }

  // Fallback: compare window dimensions
  return window.innerHeight > window.innerWidth ? 'portrait' : 'landscape';
}

/** Get the layout config for a given viewport width and orientation. */
export function getLayoutConfig(width: number, orientation: Orientation): LayoutConfig {
  const device = getDeviceClass(width);
  const key: `${DeviceClass}-${Orientation}` = `${device}-${orientation}`;
  return LAYOUT_CONFIGS[key];
}
