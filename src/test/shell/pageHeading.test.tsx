/**
 * The page-heading contract (spec §7; gap/10 IA17; deferred item 4): one
 * breadcrumb row and one h1 per page.
 *
 * - A page with its own h1 (legacy) or a PageHeader shows exactly that h1.
 * - A page with none gets the shell's fallback h1 (`shell-page-title`).
 * - While a loading marker is in `main` (the route Suspense fallback,
 *   ScopeLoading, FullPageLoading, PageLoading) the shell adds no h1, so a
 *   page that brings its own never flashes a second one.
 * - Shell page states (in-scope 404) bring their own h1.
 * - Vessel crumbs carry the vessel's label overrides (Planner → "Leave");
 *   a Fleet crumb is plain text for a user without fleet reach.
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

import PageLocationHeader from '@/shared/components/layout/PageLocationHeader';
import PageHeader from '@/shared/components/layout/PageHeader';
import { LazyLoader } from '@/shared/components/common/LazyLoader';
import { FullPageLoading, ScopeLoading, ScopePageNotFound } from '@/app/router/ScopeStates';
import { readPageHeadingPresence } from '@/shared/components/layout/usePageHeadingPresence';
import { SHELL_TEST_IDS } from '@/app/shell/testIds';
import { ScopeContext, type ScopeValue } from '@/app/router/scopeContext';
import { fakeDb, resetFakeDb } from './fakeSupabase';
import { DRAAK, FLEET_ACCESS, VESSEL_ONLY_ACCESS, asVesselMaster, renderShell, resetShellState } from './shellFakes';

const FLEET: ScopeValue = { scope: 'fleet' };
const VESSEL: ScopeValue = { scope: 'vessel', vessel: DRAAK, vesselCode: 'DRA' };

/** The shell's main with its header, around `children` (as AppShell renders it). */
const Main: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
  <main data-testid={SHELL_TEST_IDS.main}>
    <PageLocationHeader />
    {children}
  </main>
);

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
