/**
 * The single way to mount a lazily loaded route page.
 *
 * Before this helper, `src/routes/index.tsx` created 42 pages with
 * `React.createElement(React.lazy(...))` inside the route element. That made
 * a new component type whenever the element was rebuilt, so the page
 * remounted (and refetched) instead of updating, and the file carried three
 * different Suspense fallbacks. `lazyPage` fixes both:
 *
 * - `React.lazy` runs once, when `lazyPage()` is called. Call it at module
 *   scope, never inside a render or a route element. The one exception is
 *   recovery: React.lazy caches a rejected import, so after a chunk fails to
 *   load, the next Try again, path change or fresh mount gets a new
 *   React.lazy that fetches the chunk again.
 * - Every page gets the same `LazyLoader` fallback.
 * - Every page gets its own `ErrorBoundary`, reset by the URL path, so a
 *   broken page clears itself when the user navigates away.
 * - An optional guard (`ProtectedRoute`, `ModuleRoute`, …) and an optional
 *   layout (`DashboardLayout`, a workspace shell) wrap the page. The boundary
 *   sits inside the layout, so the shell stays usable when the page throws.
 *
 * Render order: guard → layout → error boundary → Suspense → page.
 */
import React from 'react';
import { RouteErrorBoundary, RouteSuspense } from './RouteBoundary';

/** What a page module's dynamic import resolves to. */
export interface PageModule<P> {
  default: React.ComponentType<P>;
}

/** `() => import('@/modules/x/pages/Page')`. */
export type PageLoader<P> = () => Promise<PageModule<P>>;

/**
 * Something that renders the page as its children: a guard or a layout.
 * Pass the component (`ProtectedRoute`), or an element when it needs props;
 * an element's own children are replaced by the page.
 */
export type PageWrapper =
  | React.ComponentType<{ children: React.ReactNode }>
  | React.ReactElement<{ children?: React.ReactNode }>;

export interface LazyPageOptions {
  /** Access check around everything else (login, module, capability). */
  guard?: PageWrapper;
  /** Shell around the page, for pages that do not render one themselves. */
  layout?: PageWrapper;
  /** Names the page in the error fallback ("<label> could not be displayed"). */
  label?: string;
}

/**
 * What a lazy page was built from. Read by the route registry and its tests
 * (src/app/registry, src/test/config/registry.test.tsx) to check guards and
 * layouts without rendering.
 */
export interface LazyPageMeta<P> extends Readonly<LazyPageOptions> {
  readonly loader: PageLoader<P>;
}

/** A route page component. `preload()` fetches its chunk ahead of a click. */
export type LazyPageComponent<P> = React.FC<P> & {
  preload: () => Promise<PageModule<P>>;
  meta: LazyPageMeta<P>;
};

/** Wrap `content` in a guard or layout given as a component or an element. */
function wrapWith(wrapper: PageWrapper | undefined, content: React.ReactNode): React.ReactNode {
  if (!wrapper) return content;
  if (React.isValidElement<{ children?: React.ReactNode }>(wrapper)) {
    return React.cloneElement(wrapper, undefined, content);
  }
  const Wrapper = wrapper;
  return <Wrapper>{content}</Wrapper>;
}

/**
 * Create a route page from a dynamic import. Call at module scope:
 *
 * ```tsx
 * const CrewList = lazyPage(() => import('@/modules/crew/pages/CrewList'), { guard: ProtectedRoute });
 * <Route path="/crew/list" element={<CrewList />} />
 * ```
 *
 * Props given to the returned component are passed to the page.
 */
export function lazyPage<P extends object>(
  loader: PageLoader<P>,
  options: LazyPageOptions = {},
): LazyPageComponent<P> {
  // One import promise shared by preload() and React.lazy. A failed import is
  // forgotten so a later preload or retry can try again. A result that is not
  // a module counts as a failure too: when main.tsx prevents Vite's
  // vite:preloadError, the import resolves to undefined instead of rejecting.
  let pending: Promise<PageModule<P>> | null = null;
  const load = (): Promise<PageModule<P>> => {
    if (!pending) {
      pending = loader()
        .then((m) => {
          if (!m || typeof m !== 'object' || !('default' in m)) throw new Error('Page chunk failed to load');
          return m;
        })
        .catch((error: unknown) => {
          pending = null;
          throw error;
        });
    }
    return pending;
  };

  // The React.lazy in use, and whether its import failed. Normal renders all
  // share one; a failed one is replaced only when a page recovers (below).
  interface LazyEntry {
    Lazy: React.ComponentType<P>;
    failed: boolean;
  }
  const makeEntry = (): LazyEntry => {
    const entry: LazyEntry = { Lazy: () => null, failed: false };
    entry.Lazy = React.lazy(() =>
      load().catch((error: unknown) => {
        entry.failed = true;
        throw error;
      }),
    ) as unknown as React.ComponentType<P>;
    return entry;
  };
  let current = makeEntry();
  /** The lazy component to render: a fresh one if the current one failed to load. */
  const acquire = (): React.ComponentType<P> => {
    if (current.failed) current = makeEntry();
    return current.Lazy;
  };

  const { guard, layout, label } = options;

  const Page: React.FC<P> = (props) => {
    // Read once per mount, so remounting after a failed load retries it.
    const [Lazy, setLazy] = React.useState(() => acquire());
    // The boundary was reset (Try again, or the path changed): retry a failed load.
    const retry = React.useCallback(() => setLazy(() => acquire()), []);
    return (
      <>
        {wrapWith(
          guard,
          wrapWith(
            layout,
            <RouteErrorBoundary label={label} onReset={retry}>
              <RouteSuspense>{React.createElement(Lazy, props)}</RouteSuspense>
            </RouteErrorBoundary>,
          ),
        )}
      </>
    );
  };
  Page.displayName = label ? `LazyPage(${label})` : 'LazyPage';

  return Object.assign(Page, { preload: load, meta: Object.freeze({ loader, guard, layout, label }) });
}

export default lazyPage;
