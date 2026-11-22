/**
 * Warm the palette's lazy dialog chunk before the first open (contract,
 * BUILD-PLAN S5): the TopBar search trigger calls this on `pointerenter` and
 * `focus`, the provider on the first ⌘K / Ctrl+K. Safe to call any number of
 * times and outside a provider.
 *
 * The chunk is imported once and shared with the `React.lazy` that renders
 * it. A failed import is forgotten, so the next preload or open tries again
 * (the open path shows its own "could not load" state); a preload never
 * throws and never rejects unhandled.
 */
import type { ComponentType } from 'react';
import type { PaletteDialogProps } from './paletteDialogProps';

export type PaletteDialogModule = { default: ComponentType<PaletteDialogProps> };

export interface PaletteLoader {
  /** The dialog module; one import in flight or settled at a time. */
  load: () => Promise<PaletteDialogModule>;
  /** `load()` for warming the cache: never throws, never rejects. */
  preload: () => void;
}

/** A loader around `importer` (exported for tests; the app uses `paletteLoader`). */
export function createPaletteLoader(importer: () => Promise<PaletteDialogModule>): PaletteLoader {
  let pending: Promise<PaletteDialogModule> | null = null;
  const load = () => {
    if (!pending) {
      let attempt: Promise<PaletteDialogModule>;
      try {
        attempt = importer();
      } catch (error) {
        attempt = Promise.reject(error);
      }
      pending = attempt.catch((error: unknown) => {
        pending = null;
        throw error;
      });
    }
    return pending;
  };
  const preload = () => {
    try {
      load().catch(() => undefined);
    } catch {
      // A preload is only a hint.
    }
  };
  return { load, preload };
}

export const paletteLoader = createPaletteLoader(() => import('./PaletteDialog'));

export function preloadCommandPalette(): void {
  paletteLoader.preload();
}
