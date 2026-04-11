'use client';

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  createContext,
  useContext,
  type ReactNode,
} from 'react';
import type { DeviceClass, Orientation, LayoutConfig } from '@/lib/types';
import {
  getDeviceClass,
  getOrientation,
  getLayoutConfig,
} from '@/lib/ui/responsive-layout';

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export interface ResponsiveLayoutState {
  layout: LayoutConfig;
  deviceClass: DeviceClass;
  orientation: Orientation;
  zoom: number;
}

const ResponsiveLayoutContext = createContext<ResponsiveLayoutState | null>(null);

export function useResponsiveLayout(): ResponsiveLayoutState {
  const ctx = useContext(ResponsiveLayoutContext);
  if (!ctx) {
    throw new Error('useResponsiveLayout must be used within <ResponsiveLayout>');
  }
  return ctx;
}

// ---------------------------------------------------------------------------
// Pinch-to-zoom helpers
// ---------------------------------------------------------------------------

const MIN_ZOOM = 1;
const MAX_ZOOM = 3;

function getDistance(t1: { clientX: number; clientY: number }, t2: { clientX: number; clientY: number }): number {
  const dx = t1.clientX - t2.clientX;
  const dy = t1.clientY - t2.clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface ResponsiveLayoutProps {
  children:
    | ReactNode
    | ((state: ResponsiveLayoutState) => ReactNode);
}

export default function ResponsiveLayout({ children }: ResponsiveLayoutProps) {
  // --- State ---
  const [deviceClass, setDeviceClass] = useState<DeviceClass>(() =>
    typeof window !== 'undefined' ? getDeviceClass(window.innerWidth) : 'desktop',
  );
  const [orientation, setOrientation] = useState<Orientation>(() =>
    typeof window !== 'undefined' ? getOrientation() : 'landscape',
  );
  const [zoom, setZoom] = useState(1);

  const layout = getLayoutConfig(
    typeof window !== 'undefined' ? window.innerWidth : 1024,
    orientation,
  );

  // --- Refs for pinch tracking ---
  const initialPinchDistance = useRef<number | null>(null);
  const zoomAtPinchStart = useRef(1);

  // --- Resize / orientation change handler ---
  const updateLayout = useCallback(() => {
    const w = window.innerWidth;
    setDeviceClass(getDeviceClass(w));
    setOrientation(getOrientation());
  }, []);

  useEffect(() => {
    // ResizeObserver on document body for desktop window resize
    const ro = new ResizeObserver(() => updateLayout());
    ro.observe(document.documentElement);

    // Orientation change event for mobile
    const handleOrientationChange = () => {
      // Re-layout within 300ms — the event fires before dimensions update,
      // so we schedule a follow-up check.
      updateLayout();
      setTimeout(updateLayout, 100);
      setTimeout(updateLayout, 300);
    };

    window.addEventListener('orientationchange', handleOrientationChange);
    window.addEventListener('resize', updateLayout);

    return () => {
      ro.disconnect();
      window.removeEventListener('orientationchange', handleOrientationChange);
      window.removeEventListener('resize', updateLayout);
    };
  }, [updateLayout]);

  // --- Pinch-to-zoom (mobile only) ---
  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (deviceClass !== 'mobile') return;
      if (e.touches.length === 2) {
        initialPinchDistance.current = getDistance(e.touches[0], e.touches[1]);
        zoomAtPinchStart.current = zoom;
      }
    },
    [deviceClass, zoom],
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (deviceClass !== 'mobile') return;
      if (e.touches.length === 2 && initialPinchDistance.current !== null) {
        const currentDist = getDistance(e.touches[0], e.touches[1]);
        const scale = currentDist / initialPinchDistance.current;
        const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoomAtPinchStart.current * scale));
        setZoom(newZoom);
      }
    },
    [deviceClass],
  );

  const handleTouchEnd = useCallback(() => {
    initialPinchDistance.current = null;
  }, []);

  // --- Build state object ---
  const state: ResponsiveLayoutState = {
    layout,
    deviceClass,
    orientation,
    zoom,
  };

  return (
    <ResponsiveLayoutContext.Provider value={state}>
      <div
        className="w-full h-full"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {typeof children === 'function' ? children(state) : children}
      </div>
    </ResponsiveLayoutContext.Provider>
  );
}
