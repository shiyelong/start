// =============================================================================
// Image Lazy Loading — Intersection Observer based lazy loading utility
// =============================================================================

/**
 * Options for the lazy loading observer.
 */
export interface LazyLoadOptions {
  /** Root margin for triggering load before element enters viewport */
  rootMargin?: string;
  /** Intersection threshold (0-1) */
  threshold?: number;
  /** Attribute containing the real image URL (default: 'data-src') */
  srcAttr?: string;
  /** Attribute containing the real srcset (default: 'data-srcset') */
  srcsetAttr?: string;
  /** Callback when an image starts loading */
  onLoad?: (element: HTMLElement) => void;
  /** Callback when an image fails to load */
  onError?: (element: HTMLElement) => void;
}

const DEFAULT_OPTIONS: Required<LazyLoadOptions> = {
  rootMargin: '200px 0px', // Start loading 200px before entering viewport
  threshold: 0,
  srcAttr: 'data-src',
  srcsetAttr: 'data-srcset',
  onLoad: () => {},
  onError: () => {},
};

/**
 * Create a lazy loading observer that watches elements and swaps
 * data-src / data-srcset to src / srcset when they enter the viewport.
 *
 * Usage:
 * ```ts
 * const observer = createLazyLoadObserver();
 * document.querySelectorAll('img[data-src]').forEach(el => observer.observe(el));
 * // Later: observer.disconnect();
 * ```
 */
export function createLazyLoadObserver(
  options?: LazyLoadOptions,
): IntersectionObserver {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;

        const el = entry.target as HTMLElement;
        loadElement(el, opts);
        observer.unobserve(el);
      }
    },
    {
      rootMargin: opts.rootMargin,
      threshold: opts.threshold,
    },
  );

  return observer;
}

/**
 * Load a single element by swapping data attributes to real attributes.
 */
function loadElement(
  el: HTMLElement,
  opts: Required<LazyLoadOptions>,
): void {
  const src = el.getAttribute(opts.srcAttr);
  const srcset = el.getAttribute(opts.srcsetAttr);

  if (el instanceof HTMLImageElement) {
    if (src) {
      el.src = src;
      el.removeAttribute(opts.srcAttr);
    }
    if (srcset) {
      el.srcset = srcset;
      el.removeAttribute(opts.srcsetAttr);
    }

    el.onload = () => {
      el.classList.add('lazy-loaded');
      opts.onLoad(el);
    };
    el.onerror = () => {
      el.classList.add('lazy-error');
      opts.onError(el);
    };
  } else if (el instanceof HTMLVideoElement) {
    // For video poster images
    if (src) {
      el.poster = src;
      el.removeAttribute(opts.srcAttr);
    }
    opts.onLoad(el);
  } else {
    // For background images on divs etc.
    if (src) {
      el.style.backgroundImage = `url(${src})`;
      el.removeAttribute(opts.srcAttr);
    }
    opts.onLoad(el);
  }
}

// ---------------------------------------------------------------------------
// React hook helper
// ---------------------------------------------------------------------------

/**
 * Observe a single element ref for lazy loading.
 * Designed to be used inside a useEffect:
 *
 * ```tsx
 * const imgRef = useRef<HTMLImageElement>(null);
 * useEffect(() => {
 *   if (!imgRef.current) return;
 *   return observeElement(imgRef.current);
 * }, []);
 * ```
 */
export function observeElement(
  element: HTMLElement,
  options?: LazyLoadOptions,
): () => void {
  const observer = createLazyLoadObserver(options);
  observer.observe(element);
  return () => observer.disconnect();
}

// ---------------------------------------------------------------------------
// Batch lazy load — scan DOM for [data-src] elements
// ---------------------------------------------------------------------------

/**
 * Scan a container (or document) for all elements with data-src and
 * attach lazy loading. Returns a cleanup function.
 */
export function lazyLoadAll(
  container?: HTMLElement,
  options?: LazyLoadOptions,
): () => void {
  const root = container ?? document.body;
  const srcAttr = options?.srcAttr ?? 'data-src';
  const elements = root.querySelectorAll<HTMLElement>(`[${srcAttr}]`);

  const observer = createLazyLoadObserver(options);
  elements.forEach((el) => observer.observe(el));

  return () => observer.disconnect();
}
