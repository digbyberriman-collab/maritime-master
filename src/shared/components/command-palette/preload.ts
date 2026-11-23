/**
 * Warm the palette's lazy dialog chunk before the first open (contract,
 * BUILD-PLAN S5): the TopBar search trigger calls this on `pointerenter` and
 * `focus`, the provider on the first ⌘K / Ctrl+K. Safe to call any number of
 * times and outside a provider.
 *
 * The chunk is an optional UI chunk (src/app/optionalChunks.ts): it is
 * imported once and shared with the `React.lazy` that renders it. A failed
 * import, or one that resolves to something other than the module, is
 * forgotten, so the next preload or open tries again. It never reloads the
 * page (main.tsx leaves it out of the stale-chunk reload, D-39); the open path
 * shows "Search could not load" with Try again instead (D-81). A preload never
 * throws and never rejects unhandled.
 */
import type { ComponentType } from 'react';
import { createOptionalChunkLoader, type OptionalChunkLoader } from '@/app/optionalChunks';
import type { PaletteDialogProps } from './paletteDialogProps';

export type PaletteDialogModule = { default: ComponentType<PaletteDialogProps> };

export type PaletteLoader = OptionalChunkLoader<PaletteDialogModule>;

/** A loader around `importer` (exported for tests; the app uses `paletteLoader`). */
export function createPaletteLoader(importer: () => Promise<PaletteDialogModule>): PaletteLoader {
  return createOptionalChunkLoader(importer);
}

export const paletteLoader = createPaletteLoader(() => import('./PaletteDialog'));

export function preloadCommandPalette(): void {
  paletteLoader.preload();
}
