/**
 * Quick-hide privacy utility.
 *
 * - Ctrl+Shift+H (or Cmd+Shift+H on macOS) instantly navigates to a safe page
 * - Neutralizes the browser tab title to a generic string
 * - Restores original title when returning
 *
 * Validates: Requirements 47.5, 47.8
 */

// ── Constants ─────────────────────────────────────────────────

/** Neutral tab title shown when quick-hide is active */
const SAFE_TITLE = '星聚 - 娱乐平台';

/** Safe page URL to navigate to on quick-hide */
const SAFE_PAGE = '/';

/** localStorage key to store the page we came from */
const RETURN_KEY = 'starhub_qh_return';

// ── State ─────────────────────────────────────────────────────

let originalTitle: string | null = null;
let listenerAttached = false;

// ── Core functions ────────────────────────────────────────────

/**
 * Neutralize the browser tab title to a generic string.
 * Stores the original title so it can be restored later.
 */
export function neutralizeTitle(): void {
  if (typeof document === 'undefined') return;
  if (document.title !== SAFE_TITLE) {
    originalTitle = document.title;
  }
  document.title = SAFE_TITLE;
}

/**
 * Restore the original tab title if it was neutralized.
 */
export function restoreTitle(): void {
  if (typeof document === 'undefined') return;
  if (originalTitle) {
    document.title = originalTitle;
    originalTitle = null;
  }
}

/**
 * Perform the quick-hide action:
 * 1. Save current path for optional return
 * 2. Neutralize tab title
 * 3. Navigate to the safe page
 */
export function quickHide(): void {
  if (typeof window === 'undefined') return;

  // Store current location for potential return
  try {
    localStorage.setItem(RETURN_KEY, window.location.pathname);
  } catch {
    // localStorage may be unavailable in private browsing
  }

  neutralizeTitle();
  window.location.href = SAFE_PAGE;
}

/**
 * Get the path the user was on before quick-hide, if any.
 * Clears the stored path after reading.
 */
export function getReturnPath(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const path = localStorage.getItem(RETURN_KEY);
    if (path) {
      localStorage.removeItem(RETURN_KEY);
    }
    return path;
  } catch {
    return null;
  }
}

// ── Keyboard shortcut handler ─────────────────────────────────

function handleKeyDown(event: KeyboardEvent): void {
  // Ctrl+Shift+H or Cmd+Shift+H
  const isModifier = event.ctrlKey || event.metaKey;
  if (isModifier && event.shiftKey && event.key.toLowerCase() === 'h') {
    event.preventDefault();
    event.stopPropagation();
    quickHide();
  }
}

/**
 * Attach the global keyboard shortcut listener for quick-hide.
 * Safe to call multiple times — only attaches once.
 */
export function attachQuickHideListener(): void {
  if (typeof window === 'undefined') return;
  if (listenerAttached) return;

  window.addEventListener('keydown', handleKeyDown, { capture: true });
  listenerAttached = true;
}

/**
 * Remove the global keyboard shortcut listener.
 */
export function detachQuickHideListener(): void {
  if (typeof window === 'undefined') return;
  if (!listenerAttached) return;

  window.removeEventListener('keydown', handleKeyDown, { capture: true });
  listenerAttached = false;
}

/**
 * Check if the current path is in the adult zone and auto-neutralize title.
 */
export function autoNeutralizeIfNeeded(): void {
  if (typeof window === 'undefined') return;
  const path = window.location.pathname;
  if (path.startsWith('/zone')) {
    neutralizeTitle();
  }
}
