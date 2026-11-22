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
 *   scope, never inside a render or a route element.
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
  // forgotten so a later preload can try again.
  let pending: Promise<PageModule<P>> | null = null;
  const load = (): Promise<PageModule<P>> => {
    if (!pending) {
      pending = loader().catch((error: unknown) => {
        pending = null;
        throw error;
      });
    }
    return pending;
  };

  const Lazy = React.lazy(load) as unknown as React.ComponentType<P>;
  const { guard, layout, label } = options;

  const Page: React.FC<P> = (props) => (
    <>
      {wrapWith(
        guard,
        wrapWith(
          layout,
          <RouteErrorBoundary label={label}>
            <RouteSuspense>{React.createElement(Lazy, props)}</RouteSuspense>
          </RouteErrorBoundary>,
        ),
      )}
    </>
  );
  Page.displayName = label ? `LazyPage(${label})` : 'LazyPage';

  return Object.assign(Page, { preload: load, meta: Object.freeze({ loader, guard, layout, label }) });
}

export default lazyPage;
