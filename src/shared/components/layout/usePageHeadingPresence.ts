/**
 * Does the page inside the shell's `<main>` bring its own h1? (Heading
 * contract, spec §7; gap/10 IA17; deferred item 4.)
 *
 * One page = one breadcrumb row + one h1. The page owns the h1 (`PageHeader`,
 * or a legacy page's own `<h1>`); the shell adds its fallback h1 only when the
 * settled page has none. This hook answers both halves:
 *
 * - `settled` is false while `main` holds a loading marker: the route
 *   Suspense fallback (`[data-route-loading]`, LazyLoader and the scope
 *   loading states) or anything `[aria-busy="true"]` (PageLoading). During
 *   loading only the breadcrumb shows, so a page with its own h1 never
 *   flashes a second one.
 * - `hasPageHeading` is true when `main` holds an h1 other than the shell's
 *   own (`[data-shell-heading]`). Dialogs and sheets render in portals
 *   outside `main`, so they never count.
 *
 * A MutationObserver on `main` (child list, subtree, and the `aria-busy` /
 * `data-route-loading` attributes) re-checks, coalesced to one check per
 * animation frame. The first check runs before paint.
 */
import React from 'react';

export interface PageHeadingPresence {
  /** `main` holds an h1 that is not the shell's own. */
  hasPageHeading: boolean;
  /** No loading marker left in `main`; until then the shell shows no fallback heading. */
  settled: boolean;
}

/** Marks the shell's own fallback h1, so it never counts as the page's. */
export const SHELL_HEADING_ATTRIBUTE = 'data-shell-heading';

const LOADING_SELECTOR = '[data-route-loading], [aria-busy="true"]';
const PAGE_HEADING_SELECTOR = `h1:not([${SHELL_HEADING_ATTRIBUTE}])`;

/** The presence facts for one `main` element right now (pure DOM read; exported for tests). */
export function readPageHeadingPresence(main: ParentNode | null): PageHeadingPresence {
  if (!main) return { hasPageHeading: false, settled: false };
  return {
    hasPageHeading: main.querySelector(PAGE_HEADING_SELECTOR) !== null,
    settled: main.querySelector(LOADING_SELECTOR) === null,
  };
}

const INITIAL: PageHeadingPresence = { hasPageHeading: false, settled: false };

type FrameHandle = { cancel: () => void };

function nextFrame(run: () => void): FrameHandle {
  if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
    const id = window.requestAnimationFrame(run);
    return { cancel: () => window.cancelAnimationFrame(id) };
  }
  const id = setTimeout(run, 16);
  return { cancel: () => clearTimeout(id) };
}

/**
 * `anchorRef` is the shell's `<main>` or any element inside it (the
 * breadcrumb header passes its own root: a parent's ref is not attached yet
 * when a child's layout effect runs, so the header finds `main` from itself).
 */
export function usePageHeadingPresence(anchorRef: React.RefObject<HTMLElement | null>): PageHeadingPresence {
  const [presence, setPresence] = React.useState<PageHeadingPresence>(INITIAL);

  React.useLayoutEffect(() => {
    const anchor = anchorRef.current;
    const main = anchor?.closest('main') ?? anchor;
    if (!main) return undefined;
    const update = () =>
      setPresence((previous) => {
        const next = readPageHeadingPresence(main);
        return previous.hasPageHeading === next.hasPageHeading && previous.settled === next.settled ? previous : next;
      });
    // Before paint: the page's first render is already in the DOM.
    update();
    if (typeof MutationObserver === 'undefined') return undefined;

    let pending: FrameHandle | null = null;
    const observer = new MutationObserver(() => {
      if (pending) return;
      pending = nextFrame(() => {
        pending = null;
        update();
      });
    });
    observer.observe(main, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['aria-busy', 'data-route-loading'],
    });
    return () => {
      observer.disconnect();
      pending?.cancel();
    };
  }, [anchorRef]);

  return presence;
}
