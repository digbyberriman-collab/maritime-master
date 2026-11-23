/**
 * The page-heading contract (spec §7; gap/10 IA17; deferred item 4): one
 * breadcrumb row and one h1 per page.
 *
 * - A page with its own h1 (legacy) or a PageHeader shows exactly that h1.
 * - A page with none gets the shell's fallback h1 (`shell-page-title`).
 * - While a loading marker is in `main` (the route Suspense fallback,
 *   ScopeLoading, FullPageLoading, PageLoading) the shell adds no h1, so a
 *   page that brings its own never flashes a second one.
 * - Shell page states (in-scope 404) bring their own h1, and name the
 *   document title and the current crumb after themselves, never after the
 *   URL's nav entry (the page location override): "Page not found", "Vessel
 *   not found" (no scope root), the Fleet-denied state, "<Module> is
 *   switched off" (the page's own crumbs).
 * - Vessel crumbs carry the vessel's label overrides (Planner → "Leave");
 *   a Fleet crumb is plain text for a user without fleet reach; crumb links
 *   are 44 px both ways on touch.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';

vi.mock('@/integrations/supabase/client', async () => (await import('./fakeSupabase')).fakeSupabaseModule);
vi.mock('@/modules/auth/contexts/AuthContext', async () => {
  const { shellState } = await import('./shellFakes');
  return { useAuth: () => shellState.auth };
});
vi.mock('@/modules/vessels/contexts/VesselContext', async () => {
  const { shellState } = await import('./shellFakes');
  return { useVessel: () => shellState.vessel };
});
vi.mock('@/modules/auth/store/permissionsStore', async () => {
  const { shellState } = await import('./shellFakes');
  return { usePermissionsStore: (selector: (s: object) => unknown) => selector(shellState.perm) };
});
// For the vessel route gate cases, which render the real shell around the real header.
vi.mock('@/shared/hooks/useSidebarBadgeCounts', () => ({ useSidebarBadgeCounts: () => ({ data: undefined }) }));
vi.mock('@/shared/contexts/BrandingContext', () => ({ useBrandingContext: () => ({ clientDisplayName: 'TEST', clientLogoUrl: null }) }));
vi.mock('@/shared/components/layout/InkfishFooter', () => ({ default: () => null }));
vi.mock('@/shared/components/InkfishWatermark', () => ({ default: () => null }));
vi.mock('@/shared/components/layout/topbar/TopBar', () => ({ default: () => null }));
vi.mock('@/shared/components/layout/topbar/KeyboardShortcutsDialog', () => ({ default: () => null }));
vi.mock('@/shared/components/layout/topbar/ShellShortcuts', () => ({ default: () => null }));
vi.mock('@/modules/feedback/components/FeedbackPanel', () => ({ default: () => null }));
vi.mock('@/modules/feedback/components/FeedbackResolvedToast', () => ({ default: () => null }));

import { Route, Routes } from 'react-router-dom';
import PageLocationHeader from '@/shared/components/layout/PageLocationHeader';
import { PageLocationOverrideProvider } from '@/shared/components/layout/PageLocationOverrideProvider';
import PageHeader from '@/shared/components/layout/PageHeader';
import { LazyLoader } from '@/shared/components/common/LazyLoader';
import { FullPageLoading, ScopeAccessDenied, ScopeLoading, ScopePageNotFound, VesselNotFound } from '@/app/router/ScopeStates';
import { VesselScopeRoute } from '@/app/router/scopes';
import { readPageHeadingPresence } from '@/shared/components/layout/usePageHeadingPresence';
import { SHELL_TEST_IDS } from '@/app/shell/testIds';
import { ScopeContext, type ScopeValue } from '@/app/router/scopeContext';
import { fakeDb, resetFakeDb } from './fakeSupabase';
import { DRAAK, FLEET_ACCESS, HYDRA, VESSEL_ONLY_ACCESS, asFleetUser, asVesselMaster, renderShell, resetShellState } from './shellFakes';

const FLEET: ScopeValue = { scope: 'fleet' };
const VESSEL: ScopeValue = { scope: 'vessel', vessel: DRAAK, vesselCode: 'DRA' };

/** The shell's main with its header, around `children` (as AppShell renders it, with the override channel). */
const Main: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
  <main data-testid={SHELL_TEST_IDS.main}>
    <PageLocationOverrideProvider>
      <PageLocationHeader />
      {children}
    </PageLocationOverrideProvider>
  </main>
);

/** The breadcrumb's items, as text, and the current one. */
const trail = () => {
  const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' });
  const items = within(crumbs)
    .getAllByRole('listitem')
    .filter((li) => !li.classList.contains('sm:hidden'))
    .map((li) => li.textContent ?? '');
  const current = crumbs.querySelector('[aria-current="page"]')?.textContent ?? null;
  return { items, current };
};

/** Renders the page, then swaps it out once `release()` is called (a lazy page arriving). */
function deferred(loading: React.ReactNode, page: React.ReactNode) {
  let release: () => void = () => undefined;
  const Swap: React.FC = () => {
    const [ready, setReady] = React.useState(false);
    release = () => setReady(true);
    return <>{ready ? page : loading}</>;
  };
  return { element: <Swap />, release: () => act(() => release()) };
}

const h1s = () => screen.queryAllByRole('heading', { level: 1 });

/** Waits for the observer's next frame. */
const settle = () => act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));

describe('page heading contract', () => {
  beforeEach(() => {
    resetFakeDb();
    resetShellState();
  });
  afterEach(() => {
    document.title = '';
  });

  it('a page with its own h1 keeps exactly that one', async () => {
    renderShell(
      <Main>
        <h1>Crew list</h1>
      </Main>,
      { path: '/fleet/dashboard', scope: FLEET },
    );
    await settle();
    expect(h1s()).toHaveLength(1);
    expect(h1s()[0]).toHaveTextContent('Crew list');
    expect(screen.queryByTestId(SHELL_TEST_IDS.fallbackHeading)).toBeNull();
    // The breadcrumb row is always there.
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument();
  });

  it('a page with a PageHeader shows its h1 only', async () => {
    renderShell(
      <Main>
        <PageHeader title="Fleet dashboard" description="Every vessel at a glance" />
      </Main>,
      { path: '/fleet/dashboard', scope: FLEET },
    );
    await settle();
    expect(h1s()).toHaveLength(1);
    expect(h1s()[0]).toHaveTextContent('Fleet dashboard');
    expect(h1s()[0].closest('[data-page-heading]')).not.toBeNull();
  });

  it('PageHeader keeps 18rem for the title before its actions sit beside it, so narrow screens wrap them', async () => {
    renderShell(
      <Main>
        <PageHeader title="Fleet dashboard" actions={<button type="button">Refresh</button>} />
      </Main>,
      { path: '/fleet/dashboard', scope: FLEET },
    );
    await settle();
    const titleBlock = h1s()[0].closest('[data-page-heading]')?.firstElementChild;
    // A zero basis alone never makes the actions wrap and crushes the title (D-84). A min-width, not
    // a basis, so a caller's column layout (max-sm:flex-col) does not turn it into an 18rem height.
    expect(titleBlock).toHaveClass('min-w-[min(18rem,100%)]', 'flex-1');
    expect(titleBlock).not.toHaveClass('min-w-0');
    expect(titleBlock?.className).not.toMatch(/basis|flex-\[1_1/);
  });

  it('a page without an h1 gets the shell title, which sets the document title too', async () => {
    renderShell(
      <Main>
        <p>Review queue</p>
      </Main>,
      { path: '/fleet/dashboard', scope: FLEET },
    );
    await waitFor(() => expect(screen.getByTestId(SHELL_TEST_IDS.fallbackHeading)).toBeInTheDocument());
    expect(h1s()).toHaveLength(1);
    expect(screen.getByTestId(SHELL_TEST_IDS.fallbackHeading)).toHaveClass('type-display');
    expect(screen.getByTestId(SHELL_TEST_IDS.fallbackHeading)).toHaveTextContent('Dashboard');
    expect(document.title).toBe('Dashboard | STORM');
  });

  it.each([
    ['the route Suspense fallback', <LazyLoader key="l" />],
    ['ScopeLoading', <ScopeLoading key="s" />],
    ['FullPageLoading', <FullPageLoading key="f" />],
  ])('adds no h1 while %s is in main, then defers to the page that arrives', async (_name, loader) => {
    const withHeading = deferred(loader, <h1>Crew list</h1>);
    renderShell(<Main>{withHeading.element}</Main>, { path: '/fleet/dashboard', scope: FLEET });
    await settle();
    await settle();
    expect(h1s()).toHaveLength(0);
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument();
    withHeading.release();
    await settle();
    expect(h1s()).toHaveLength(1);
    expect(h1s()[0]).toHaveTextContent('Crew list');
  });

  it('titles a page without an h1 only once its loading marker has gone', async () => {
    const page = deferred(<div aria-busy="true">Loading entries…</div>, <p>Entries</p>);
    renderShell(<Main>{page.element}</Main>, { path: '/fleet/dashboard', scope: FLEET });
    await settle();
    expect(h1s()).toHaveLength(0);
    page.release();
    await waitFor(() => expect(screen.getByTestId(SHELL_TEST_IDS.fallbackHeading)).toBeInTheDocument());
    expect(h1s()).toHaveLength(1);
  });

  it('the in-scope 404 brings its own h1, never the nav title of the URL', async () => {
    renderShell(
      <Main>
        <ScopePageNotFound homePath="/fleet/dashboard" />
      </Main>,
      { path: '/fleet/nonexistent', scope: FLEET },
    );
    await settle();
    expect(h1s()).toHaveLength(1);
    expect(h1s()[0]).toHaveTextContent('Page not found');
  });

  it('the in-scope 404 titles the document and the current crumb after itself, under the scope root', async () => {
    renderShell(
      <Main>
        <ScopePageNotFound homePath="/fleet/dashboard" />
      </Main>,
      { path: '/fleet/nonexistent', scope: FLEET },
    );
    await waitFor(() => expect(document.title).toBe('Page not found | STORM'));
    expect(trail()).toEqual({ items: ['Fleet', 'Page not found'], current: 'Page not found' });
    expect(within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByRole('link', { name: 'Fleet' })).toHaveAttribute('href', '/fleet');
    expect(screen.queryByText('Nonexistent')).toBeNull();
  });

  it('in the vessel scope the 404 keeps the vessel as its root crumb', async () => {
    renderShell(
      <Main>
        <ScopePageNotFound homePath="/v/dra" />
      </Main>,
      { path: '/v/dra/nonexistent', scope: VESSEL },
    );
    await waitFor(() => expect(document.title).toBe('Page not found | STORM'));
    expect(trail()).toEqual({ items: ['DRAAK', 'Page not found'], current: 'Page not found' });
    expect(within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByRole('link', { name: 'DRAAK' })).toHaveAttribute('href', '/v/dra');
  });

  it('"Vessel not found" names no scope root (there is no vessel to name)', async () => {
    renderShell(
      <Main>
        <VesselNotFound code="xyz" homePath="/fleet/dashboard" />
      </Main>,
      { path: '/v/xyz', scope: { scope: 'vessel', vessel: undefined, vesselCode: undefined } },
    );
    await waitFor(() => expect(document.title).toBe('Vessel not found | STORM'));
    expect(trail()).toEqual({ items: ['Vessel not found'], current: 'Vessel not found' });
  });

  it('the vessel master’s Fleet-denied state is not titled Dashboard; Fleet stays plain text', async () => {
    asVesselMaster();
    renderShell(
      <Main>
        <ScopeAccessDenied title="The Fleet view is not available to you" homePath="/v/dra" />
      </Main>,
      { path: '/fleet/dashboard', scope: FLEET, access: VESSEL_ONLY_ACCESS },
    );
    await waitFor(() => expect(document.title).toBe('The Fleet view is not available to you | STORM'));
    expect(trail()).toEqual({
      items: ['Fleet', 'The Fleet view is not available to you'],
      current: 'The Fleet view is not available to you',
    });
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(crumbs).getByText('Fleet').closest('a')).toBeNull();
    expect(within(crumbs).queryByText('Dashboard')).toBeNull();
  });

  it('gives the page its own title back once the state is gone', async () => {
    const page = deferred(<ScopePageNotFound homePath="/fleet/dashboard" />, <p>Review queue</p>);
    renderShell(<Main>{page.element}</Main>, { path: '/fleet/dashboard', scope: FLEET });
    await waitFor(() => expect(document.title).toBe('Page not found | STORM'));
    page.release();
    await waitFor(() => expect(document.title).toBe('Dashboard | STORM'));
    expect(trail().current).toBe('Dashboard');
  });

  it('portals (dialogs, sheets) never count as the page heading', () => {
    const main = document.createElement('main');
    const portal = document.createElement('div');
    portal.innerHTML = '<h1>Dialog title</h1>';
    document.body.append(main, portal);
    expect(readPageHeadingPresence(main)).toEqual({ hasPageHeading: false, settled: true });
    main.innerHTML = '<h1 data-shell-heading="">Shell</h1>';
    expect(readPageHeadingPresence(main).hasPageHeading).toBe(false);
    main.innerHTML = '<div data-route-loading=""></div><h1>Page</h1>';
    expect(readPageHeadingPresence(main)).toEqual({ hasPageHeading: true, settled: false });
    main.remove();
    portal.remove();
  });

  it('a vessel crumb shows the vessel label override, and the title follows', async () => {
    fakeDb.tables.vessel_module_settings = [
      { vessel_id: DRAAK.id, module_key: 'planner', enabled: true, enabled_from: null, label_override: 'Leave' },
    ];
    renderShell(
      <Main>
        <p>Timeline</p>
      </Main>,
      { path: '/v/dra/crew/planner/timeline', scope: VESSEL },
    );
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' });
    await waitFor(() => expect(within(crumbs).getByRole('link', { name: 'Leave' })).toBeInTheDocument());
    expect(within(crumbs).queryByText('Planner')).toBeNull();
    // The root crumb names the vessel and links it on its own code.
    expect(within(crumbs).getByRole('link', { name: 'DRAAK' })).toHaveAttribute('href', '/v/dra');
    // 44 px both ways on touch (D-35), after min-w-0 so fine pointers still truncate.
    expect(within(crumbs).getByRole('link', { name: 'DRAAK' })).toHaveClass(
      'min-w-0',
      '[@media(pointer:coarse)]:min-h-11',
      '[@media(pointer:coarse)]:min-w-11',
      '[@media(pointer:coarse)]:justify-center',
    );
    expect(within(crumbs).getByRole('link', { name: 'Crew' })).toHaveAttribute('href', '/v/dra/crew');
    expect(within(crumbs).getByText('Rotation Timeline')).toHaveAttribute('aria-current', 'page');
  });

  it('a module-level label override renames the crumb and the page title', async () => {
    fakeDb.tables.vessel_module_settings = [
      { vessel_id: DRAAK.id, module_key: 'crew_hor', enabled: true, enabled_from: null, label_override: 'Rest hours' },
    ];
    renderShell(
      <Main>
        <p>Board</p>
      </Main>,
      { path: '/v/dra/crew/hours-of-rest', scope: VESSEL },
    );
    await waitFor(() => expect(screen.getByTestId(SHELL_TEST_IDS.fallbackHeading)).toHaveTextContent('Rest hours'));
    expect(document.title).toBe('Rest hours | STORM');
  });

  it('a Fleet crumb is plain text for a user without fleet reach, a link with it', async () => {
    asVesselMaster();
    const view = renderShell(
      <Main>
        <h1>Notification centre</h1>
      </Main>,
      { path: '/notifications/center', access: VESSEL_ONLY_ACCESS },
    );
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(crumbs).getByText('Fleet').closest('a')).toBeNull();
    view.unmount();

    renderShell(
      <Main>
        <h1>Notification centre</h1>
      </Main>,
      { path: '/notifications/center', access: FLEET_ACCESS },
    );
    expect(within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByRole('link', { name: 'Fleet' })).toBeInTheDocument();
  });

  it('section headings are labels in the trail, not links; the current crumb is marked', async () => {
    renderShell(
      <Main>
        <h1>Users</h1>
      </Main>,
      { path: '/fleet/admin/users/crew', scope: FLEET },
    );
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(crumbs).getByText('Administration').closest('a')).toBeNull();
    expect(within(crumbs).getByRole('link', { name: 'Fleet' })).toHaveAttribute('href', '/fleet');
    expect(within(crumbs).getByText('Vessel Crew')).toHaveAttribute('aria-current', 'page');
    // Four crumbs: the middle folds into "…" below 640 px (a menu with the hidden crumbs).
    expect(within(crumbs).getByRole('button', { name: 'Show the full path' })).toBeInTheDocument();
  });

  it('works outside a scope provider (legacy page) and without nav access', () => {
    renderShell(
      <ScopeContext.Provider value={{ scope: 'legacy' } as unknown as ScopeValue}>
        <Main>
          <h1>Old page</h1>
        </Main>
      </ScopeContext.Provider>,
      { path: '/crew/leave', access: null },
    );
    expect(h1s()).toHaveLength(1);
  });
});

describe('the vessel route gate names its states (real shell, real header)', () => {
  const App: React.FC = () => (
    <Routes>
      <Route path="/v/:vesselCode" element={<VesselScopeRoute />}>
        <Route index element={<h1>Vessel home</h1>} />
        <Route path="technical/jobs" element={<h1>Jobs page</h1>} />
      </Route>
    </Routes>
  );
  const row = (moduleKey: string, enabled: boolean) => ({ vessel_id: HYDRA.id, module_key: moduleKey, enabled, enabled_from: null, label_override: null });

  beforeEach(() => {
    localStorage.clear();
    resetFakeDb();
    resetShellState();
    asFleetUser([HYDRA, DRAAK]);
  });
  afterEach(() => {
    document.title = '';
  });

  it('ModuleOff titles "<Module> is switched off", keeping the page’s crumbs', async () => {
    fakeDb.tables.vessel_module_settings = [row('technical', false)];
    renderShell(<App />, { path: '/v/hyd/technical/jobs' });
    expect(await screen.findByRole('heading', { level: 1, name: 'Technical is switched off for HYDRA' })).toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe('Technical is switched off | STORM'));
    expect(trail().items).toEqual(['HYDRA', 'Technical', 'Jobs']);
  });

  it('a failed settings read titles the error, under the vessel', async () => {
    fakeDb.failures.vessel_module_settings = { code: '57014', message: 'canceling statement due to statement timeout' };
    renderShell(<App />, { path: '/v/hyd/technical/jobs' });
    expect(await screen.findByRole('heading', { level: 1, name: "This vessel's modules could not load" }, { timeout: 4000 })).toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe("This vessel's modules could not load | STORM"));
    expect(trail()).toEqual({ items: ['HYDRA', "This vessel's modules could not load"], current: "This vessel's modules could not load" });
  });

  it('the page itself keeps the nav title', async () => {
    renderShell(<App />, { path: '/v/hyd/technical/jobs' });
    expect(await screen.findByRole('heading', { level: 1, name: 'Jobs page' })).toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe('Jobs | STORM'));
  });
});
