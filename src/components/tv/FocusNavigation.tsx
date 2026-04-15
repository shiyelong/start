'use client';

import { useEffect, useCallback, useRef, createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';

// =============================================================================
// Focus Navigation — remote control focus management for TV interfaces
// Supports: up / down / left / right / enter / back
// =============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Direction = 'up' | 'down' | 'left' | 'right';

export interface FocusableItem {
  id: string;
  row: number;
  col: number;
  element: HTMLElement;
}

interface FocusContextValue {
  /** Currently focused item id */
  focusedId: string | null;
  /** Register a focusable element */
  register: (item: FocusableItem) => void;
  /** Unregister a focusable element */
  unregister: (id: string) => void;
  /** Move focus in a direction */
  moveFocus: (direction: Direction) => void;
  /** Set focus to a specific item */
  setFocus: (id: string) => void;
  /** Activate (enter/select) the currently focused item */
  activate: () => void;
}

const FocusContext = createContext<FocusContextValue | null>(null);

// ---------------------------------------------------------------------------
// Key mappings — standard remote control codes
// ---------------------------------------------------------------------------

const KEY_MAP: Record<string, Direction | 'enter' | 'back'> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  Enter: 'enter',
  ' ': 'enter',       // Space bar
  Escape: 'back',
  Backspace: 'back',
};

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface FocusProviderProps {
  children: ReactNode;
  /** Called when the user presses back/escape */
  onBack?: () => void;
}

export function FocusProvider({ children, onBack }: FocusProviderProps) {
  const itemsRef = useRef<Map<string, FocusableItem>>(new Map());
  const [focusedId, setFocusedId] = useState<string | null>(null);

  const register = useCallback((item: FocusableItem) => {
    itemsRef.current.set(item.id, item);
    // Auto-focus first registered item
    if (itemsRef.current.size === 1) {
      setFocusedId(item.id);
      item.element.focus();
    }
  }, []);

  const unregister = useCallback((id: string) => {
    itemsRef.current.delete(id);
  }, []);

  const findNearest = useCallback(
    (from: FocusableItem, direction: Direction): FocusableItem | null => {
      const items = Array.from(itemsRef.current.values());
      let candidates: FocusableItem[] = [];

      switch (direction) {
        case 'up':
          candidates = items.filter((i) => i.row < from.row);
          candidates.sort((a, b) => {
            const rowDiff = b.row - a.row; // prefer closest row
            if (rowDiff !== 0) return rowDiff;
            return Math.abs(a.col - from.col) - Math.abs(b.col - from.col);
          });
          break;
        case 'down':
          candidates = items.filter((i) => i.row > from.row);
          candidates.sort((a, b) => {
            const rowDiff = a.row - b.row;
            if (rowDiff !== 0) return rowDiff;
            return Math.abs(a.col - from.col) - Math.abs(b.col - from.col);
          });
          break;
        case 'left':
          candidates = items.filter((i) => i.row === from.row && i.col < from.col);
          candidates.sort((a, b) => b.col - a.col);
          break;
        case 'right':
          candidates = items.filter((i) => i.row === from.row && i.col > from.col);
          candidates.sort((a, b) => a.col - b.col);
          break;
      }

      return candidates[0] ?? null;
    },
    [],
  );

  const moveFocus = useCallback(
    (direction: Direction) => {
      const current = focusedId ? itemsRef.current.get(focusedId) : null;
      if (!current) {
        // Focus first item if nothing focused
        const first = Array.from(itemsRef.current.values())[0];
        if (first) {
          setFocusedId(first.id);
          first.element.focus();
        }
        return;
      }

      const next = findNearest(current, direction);
      if (next) {
        setFocusedId(next.id);
        next.element.focus();
        next.element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    },
    [focusedId, findNearest],
  );

  const setFocus = useCallback((id: string) => {
    const item = itemsRef.current.get(id);
    if (item) {
      setFocusedId(id);
      item.element.focus();
    }
  }, []);

  const activate = useCallback(() => {
    if (!focusedId) return;
    const item = itemsRef.current.get(focusedId);
    item?.element.click();
  }, [focusedId]);

  // Global keyboard listener
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const action = KEY_MAP[e.key];
      if (!action) return;

      e.preventDefault();
      e.stopPropagation();

      if (action === 'enter') {
        activate();
      } else if (action === 'back') {
        onBack?.();
      } else {
        moveFocus(action);
      }
    }

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [activate, moveFocus, onBack]);

  return (
    <FocusContext.Provider
      value={{ focusedId, register, unregister, moveFocus, setFocus, activate }}
    >
      {children}
    </FocusContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook: useFocusable
// ---------------------------------------------------------------------------

interface UseFocusableOptions {
  id: string;
  row: number;
  col: number;
  onSelect?: () => void;
}

export function useFocusable({ id, row, col, onSelect }: UseFocusableOptions) {
  const ctx = useContext(FocusContext);
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!ctx || !ref.current) return;
    const element = ref.current;
    ctx.register({ id, row, col, element });

    const handleClick = () => onSelect?.();
    element.addEventListener('click', handleClick);

    return () => {
      ctx.unregister(id);
      element.removeEventListener('click', handleClick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, row, col]);

  const isFocused = ctx?.focusedId === id;

  return {
    ref,
    isFocused,
    focusProps: {
      tabIndex: 0,
      'data-focus-id': id,
      'aria-selected': isFocused,
      className: isFocused
        ? 'ring-4 ring-[#3ea6ff] outline-none scale-105 transition-transform'
        : 'outline-none transition-transform',
    },
  };
}

// ---------------------------------------------------------------------------
// Hook: useFocusContext
// ---------------------------------------------------------------------------

export function useFocusContext() {
  const ctx = useContext(FocusContext);
  if (!ctx) {
    throw new Error('useFocusContext must be used within a <FocusProvider>');
  }
  return ctx;
}
