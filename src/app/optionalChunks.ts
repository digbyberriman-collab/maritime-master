/**
 * Optional UI chunks: lazy pieces of the shell that are not a page.
 *
 * Two kinds of lazy chunk fail differently:
 *
 * - Route chunks (`lazyPage`) are the page itself. When one cannot load after
 *   a deploy, main.tsx reloads the page through the bounded guard
 *   (src/app/staleChunkRecovery.ts): at most twice in a minute, then the
 *   recovery panel (D-39).
 * - Optional UI chunks, listed here, are a dialog or a popover on top of a
 *   page that already works: the command palette's dialog and the vessel
 *   switcher's list. They never reload the page on their own (D-100): a hover
 *   or background preload on a flaky link, or a failed Try again, must not
 *   throw away what the user has typed (D-04). A failed one rejects to its
 *   own boundary, which says "Search could not load" or "The vessel list
 *   could not load", names both causes (an update or the connection) and
 *   offers Try again / Retry (a new import) and Reload. Only the user's
 *   Reload goes through the guard (`requestChunkRecovery`), so after a deploy,
 *   when the old hashed file is gone, the page can still pick up the new one.
 *
 * main.tsx imports this module at boot, before React, so it must not import
 * React or anything that does.
 */

/** Base names of the optional chunks (the file name without its build hash). */
export const OPTIONAL_CHUNKS = ['PaletteDialog', 'VesselSwitcherPanel'] as const;

export type OptionalChunk = (typeof OPTIONAL_CHUNKS)[number];

/**
 * A failed-import URL whose file is one of OPTIONAL_CHUNKS: the built
 * `/assets/PaletteDialog-<hash>.js` (or its `.css`), or the dev server's
 * `/src/…/PaletteDialog.tsx?t=1`. A longer name (`PaletteDialogFoo.js`) or a
 * route chunk does not match.
 */
const OPTIONAL_CHUNK_URL = new RegExp(String.raw`\/(${OPTIONAL_CHUNKS.join('|')})(-[\w-]+)?\.(js|css|tsx?)\b`);

/**
 * Whether a chunk-load error message names an optional chunk. The browser's
 * message carries the URL in Chromium ("Failed to fetch dynamically imported
 * module: <url>"), Firefox ("error loading dynamically imported module: <url>")
 * and Vite's CSS preload ("Unable to preload CSS for <url>"). Safari's
 * ("Importing a module script failed.") carries none, so there a failed
 * optional chunk is not recognised and still takes the reload path.
 */
export function isOptionalChunkError(msg: string): boolean {
  return OPTIONAL_CHUNK_URL.test(msg);
}

export interface OptionalChunkLoader<M> {
  /** The module; one import in flight or settled at a time. */
  load: () => Promise<M>;
  /** `load()` for warming the cache: never throws, never rejects. */
  preload: () => void;
}

/**
 * One import of an optional chunk at a time, shared by its preloads and the
 * `React.lazy` that renders it. A failed import is forgotten, so the next
 * preload, open or retry imports again. A result that is not a module counts
 * as a failure too (as in `lazyPage`): an import whose `vite:preloadError`
 * was prevented resolves to undefined instead of rejecting, and caching that
 * would leave the boundary failing for good.
 */
export function createOptionalChunkLoader<M>(importer: () => Promise<M>): OptionalChunkLoader<M> {
  let pending: Promise<M> | null = null;
  const load = (): Promise<M> => {
    if (!pending) {
      let attempt: Promise<M>;
      try {
        attempt = importer();
      } catch (error) {
        attempt = Promise.reject(error);
      }
      const forget = (error: unknown): never => {
        pending = null;
        throw error;
      };
      // One `then` with both handlers, so a failure is forgotten in the same
      // microtask as the import settles (a chained catch would take one more).
      pending = attempt.then((m) => {
        if (!m || typeof m !== 'object' || !('default' in m)) return forget(new Error('chunk failed to load'));
        return m;
      }, forget);
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
