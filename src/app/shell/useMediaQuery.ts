/**
 * `window.matchMedia(query).matches`, kept live (shell breakpoints, spec §6.8).
 *
 * Layout stays in CSS (`md:flex`, `lg:hidden`); this is for the few shell
 * decisions that must agree with the layout in script: whether the Help
 * popover can be opened programmatically (its trigger shows from 768 px),
 * whether the account menu carries the "More" group (below 768 px), and
 * whether ⌘/Ctrl+B acts (a static sidebar from 1024 px). False where
 * `matchMedia` is unavailable, so a missing API never claims a wide screen.
 */
import { useCallback, useSyncExternalStore } from 'react';

export const SHELL_MEDIA = {
  /** Tablet and up: Apps, favourites and Help sit in the top bar. */
  md: '(min-width: 768px)',
  /** Desktop: the static sidebar. */
  lg: '(min-width: 1024px)',
} as const;

function mediaList(query: string): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
  try {
    return window.matchMedia(query);
  } catch {
    return null;
  }
}

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = mediaList(query);
      if (!list) return () => undefined;
      if (typeof list.addEventListener === 'function') {
        list.addEventListener('change', onChange);
        return () => list.removeEventListener('change', onChange);
      }
      // Older Safari.
      list.addListener?.(onChange);
      return () => list.removeListener?.(onChange);
    },
    [query],
  );
  const getSnapshot = useCallback(() => mediaList(query)?.matches === true, [query]);
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
