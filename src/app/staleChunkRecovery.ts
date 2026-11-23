/**
 * Stale-chunk recovery, with a loop guard (D-39, D-100; gap/00 J5).
 *
 * After a deploy, dynamic imports can point at chunks that no longer exist.
 * Reloading fixes that, but if the reload keeps failing (the preview frame
 * cannot fetch assets at all, say) an unguarded reload loop leaves the user
 * on a blank page. So `requestChunkRecovery()` reloads at most MAX_RELOADS
 * times in RELOAD_WINDOW_MS and then shows the recovery panel that main.tsx
 * registers (`setRecoveryPanel`).
 *
 * Two callers:
 * - main.tsx, for a route chunk that failed (vite:preloadError, a window
 *   error, an unhandled rejection);
 * - the optional chunks' boundaries (the palette dialog, the vessel switcher's
 *   list; src/app/optionalChunks.ts), when the user presses Reload. Those
 *   chunks never reload on their own: a hover preload or a failed Try again
 *   must not throw away what the page underneath holds (D-04, D-100).
 *
 * The guard stores {count, at} in sessionStorage: how many reloads ran back to
 * back, and when the last one started. It is not cleared when the app mounts
 * (a route chunk fails after boot, so clearing at boot reset the count on
 * every reload and the cap never tripped). A reload more than
 * RELOAD_WINDOW_MS after the previous one starts a new count. Without
 * storage the guard cannot count, so it never reloads: it shows the panel.
 *
 * main.tsx imports this module at boot, before React, so it must not import
 * React or anything that does.
 */

export const RELOAD_KEY = 'storm.preloadReloads';
const MAX_RELOADS = 2;
const RELOAD_WINDOW_MS = 60_000;

interface ReloadRecord {
  count: number;
  at: number;
}

const readRecord = (): ReloadRecord => {
  try {
    const raw = sessionStorage.getItem(RELOAD_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === 'object') {
      const { count, at } = parsed as Partial<ReloadRecord>;
      if (typeof count === 'number' && typeof at === 'number') return { count, at };
    }
  } catch {
    /* unreadable: treat as no earlier reloads */
  }
  return { count: 0, at: 0 };
};

// One recovery decision per page load: a failed import can raise several
// events, and each must not count as another reload.
let recovering = false;
let showPanel: (() => void) | null = null;

/** The recovery panel to show when the cap is hit or storage is unavailable (main.tsx registers it). */
export function setRecoveryPanel(show: () => void): void {
  showPanel = show;
}

/**
 * Reload to pick up the current build, unless that already ran MAX_RELOADS
 * times in the last RELOAD_WINDOW_MS or cannot be counted; then show the
 * recovery panel instead. With no panel registered it never reloads.
 */
export function requestChunkRecovery(): void {
  const panel = showPanel;
  // No panel to fall back on: a reload loop could not be stopped, so do nothing.
  if (!panel || recovering) return;
  recovering = true;
  const now = Date.now();
  const last = readRecord();
  const count = now - last.at > RELOAD_WINDOW_MS ? 0 : last.count;
  // Deferred so React is never unmounted from inside one of its own renders.
  if (count >= MAX_RELOADS) {
    setTimeout(panel, 0);
    return;
  }
  try {
    sessionStorage.setItem(RELOAD_KEY, JSON.stringify({ count: count + 1, at: now }));
  } catch {
    // Without storage the guard cannot count, so never reload automatically.
    setTimeout(panel, 0);
    return;
  }
  window.location.reload();
}
