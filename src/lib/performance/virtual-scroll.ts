// =============================================================================
// Virtual Scrolling — efficient rendering for long lists
// Uses a windowing approach: only renders items visible in the viewport
// plus a small overscan buffer.
// =============================================================================

/**
 * Configuration for the virtual scroll engine.
 */
export interface VirtualScrollConfig {
  /** Total number of items in the list */
  totalItems: number;
  /** Height of each item in pixels (fixed-height mode) */
  itemHeight: number;
  /** Height of the visible container in pixels */
  containerHeight: number;
  /** Number of extra items to render above/below the viewport */
  overscan?: number;
}

/**
 * Computed virtual scroll state — tells the renderer which items
 * to mount and how to position them.
 */
export interface VirtualScrollState {
  /** Index of the first item to render */
  startIndex: number;
  /** Index of the last item to render (exclusive) */
  endIndex: number;
  /** Total height of the scrollable content (for the spacer) */
  totalHeight: number;
  /** Offset from the top for the first rendered item */
  offsetTop: number;
  /** Number of visible items (without overscan) */
  visibleCount: number;
}

/**
 * Calculate which items should be rendered given the current scroll position.
 *
 * @param config - Virtual scroll configuration
 * @param scrollTop - Current scroll position in pixels
 * @returns The computed virtual scroll state
 */
export function calculateVirtualScroll(
  config: VirtualScrollConfig,
  scrollTop: number,
): VirtualScrollState {
  const { totalItems, itemHeight, containerHeight, overscan = 3 } = config;

  if (totalItems === 0 || itemHeight === 0) {
    return {
      startIndex: 0,
      endIndex: 0,
      totalHeight: 0,
      offsetTop: 0,
      visibleCount: 0,
    };
  }

  const totalHeight = totalItems * itemHeight;
  const visibleCount = Math.ceil(containerHeight / itemHeight);

  // First visible item
  const rawStart = Math.floor(scrollTop / itemHeight);
  const startIndex = Math.max(0, rawStart - overscan);

  // Last visible item (exclusive)
  const rawEnd = rawStart + visibleCount;
  const endIndex = Math.min(totalItems, rawEnd + overscan);

  const offsetTop = startIndex * itemHeight;

  return {
    startIndex,
    endIndex,
    totalHeight,
    offsetTop,
    visibleCount,
  };
}

// ---------------------------------------------------------------------------
// Variable-height virtual scroll
// ---------------------------------------------------------------------------

/**
 * Configuration for variable-height virtual scrolling.
 * Each item can have a different height.
 */
export interface VariableVirtualScrollConfig {
  /** Array of item heights in pixels, indexed by item index */
  itemHeights: number[];
  /** Height of the visible container in pixels */
  containerHeight: number;
  /** Number of extra items to render above/below the viewport */
  overscan?: number;
}

/**
 * Pre-compute cumulative offsets for variable-height items.
 * Returns an array where offsets[i] is the top position of item i.
 */
export function computeOffsets(itemHeights: number[]): number[] {
  const offsets = new Array<number>(itemHeights.length + 1);
  offsets[0] = 0;
  for (let i = 0; i < itemHeights.length; i++) {
    offsets[i + 1] = offsets[i] + itemHeights[i];
  }
  return offsets;
}

/**
 * Binary search to find the first item whose bottom edge is past scrollTop.
 */
function findStartIndex(offsets: number[], scrollTop: number): number {
  let lo = 0;
  let hi = offsets.length - 2; // last valid item index
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (offsets[mid + 1] <= scrollTop) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return lo;
}

/**
 * Calculate virtual scroll state for variable-height items.
 */
export function calculateVariableVirtualScroll(
  config: VariableVirtualScrollConfig,
  scrollTop: number,
  offsets: number[],
): VirtualScrollState {
  const { itemHeights, containerHeight, overscan = 3 } = config;
  const totalItems = itemHeights.length;

  if (totalItems === 0) {
    return {
      startIndex: 0,
      endIndex: 0,
      totalHeight: 0,
      offsetTop: 0,
      visibleCount: 0,
    };
  }

  const totalHeight = offsets[totalItems];
  const rawStart = findStartIndex(offsets, scrollTop);
  const startIndex = Math.max(0, rawStart - overscan);

  // Find end index: first item whose top is past scrollTop + containerHeight
  const scrollBottom = scrollTop + containerHeight;
  let rawEnd = rawStart;
  while (rawEnd < totalItems && offsets[rawEnd] < scrollBottom) {
    rawEnd++;
  }
  const endIndex = Math.min(totalItems, rawEnd + overscan);

  const visibleCount = rawEnd - rawStart;
  const offsetTop = offsets[startIndex];

  return {
    startIndex,
    endIndex,
    totalHeight,
    offsetTop,
    visibleCount,
  };
}

// ---------------------------------------------------------------------------
// Scroll event throttle helper
// ---------------------------------------------------------------------------

/**
 * Create a throttled scroll handler using requestAnimationFrame.
 * Returns a cleanup function.
 *
 * Usage:
 * ```ts
 * const cleanup = onScroll(containerEl, (scrollTop) => {
 *   const state = calculateVirtualScroll(config, scrollTop);
 *   // re-render with state
 * });
 * ```
 */
export function onScroll(
  container: HTMLElement,
  callback: (scrollTop: number) => void,
): () => void {
  let rafId: number | null = null;

  function handleScroll() {
    if (rafId !== null) return;
    rafId = requestAnimationFrame(() => {
      callback(container.scrollTop);
      rafId = null;
    });
  }

  container.addEventListener('scroll', handleScroll, { passive: true });

  return () => {
    container.removeEventListener('scroll', handleScroll);
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
    }
  };
}
