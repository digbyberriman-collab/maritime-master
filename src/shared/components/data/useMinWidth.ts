/**
 * `true` while the viewport is at least `px` wide (`(min-width: …px)`), kept
 * live. Pages use it where a register must swap a table for cards on phones
 * (gap/10 A.10; Phase 1 S7: documents and crew list at 390 px) rather than
 * render both and hide one with CSS. False where `matchMedia` is missing, so
 * the narrow (card) layout is the safe default.
 */
import { useCallback, useSyncExternalStore } from 'react';

/** gap/10 §6.8 breakpoints: tablet and up. */
export const TABLET_MIN_WIDTH = 768;

function mediaList(query: string): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
  try {
    return window.matchMedia(query);
  } catch {
    return null;
  }
}

export function useMinWidth(px: number): boolean {
  const query = `(min-width: ${px}px)`;
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = mediaList(query);
      if (!list) return () => undefined;
      if (typeof list.addEventListener === 'function') {
        list.addEventListener('change', onChange);
        return () => list.removeEventListener('change', onChange);
      }
      list.addListener?.(onChange);
      return () => list.removeListener?.(onChange);
    },
    [query],
  );
  const getSnapshot = useCallback(() => mediaList(query)?.matches === true, [query]);
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
