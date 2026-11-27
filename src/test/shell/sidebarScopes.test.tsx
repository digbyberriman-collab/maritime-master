/**
 * The sidebar per scope (gap/10 IA6, IA7; BUILD-PLAN S3; spec §4.5): the
 * Fleet tree with its six sections, only the active vessel tab's leaves
 * (for that vessel, with its label overrides), no sidebar for the vessel
 * home or Calendar, a workspace's own tree. Deferred item 2 with D-45: the
 * HRIS tree opens `/me/training` without `?module=`, but keeps `?module=hris`
 * on its legacy Leave Planner URL; `?module=` on a Fleet, vessel or personal
 * URL never changes the sidebar. While access loads, a vessel URL keeps the
 * static tab's column as skeleton rows (D-96, IA19: no layout jump).
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';

const badges = vi.hoisted(() => ({ data: { pendingCompliance: 0, unreadMessages: 4, overdueTasks: 0 } as Record<string, number> | undefined }));

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
vi.mock('@/shared/hooks/useSidebarBadgeCounts', () => ({ useSidebarBadgeCounts: () => badges }));
// The frame around the sidebar, for the cases that render the whole shell (the static column).
vi.mock('@/shared/contexts/BrandingContext', async () => {
  const { shellState } = await import('./shellFakes');
  return { useBrandingContext: () => shellState.branding };
});
vi.mock('@/shared/components/InkfishWatermark', () => ({ default: () => null }));
vi.mock('@/shared/components/layout/InkfishFooter', () => ({ default: () => null }));
vi.mock('@/shared/components/layout/topbar/TopBar', () => ({ default: () => <header data-testid="shell-topbar" /> }));
vi.mock('@/shared/components/layout/topbar/KeyboardShortcutsDialog', () => ({ default: () => null }));
vi.mock('@/shared/components/layout/topbar/ShellShortcuts', () => ({ default: () => null }));
vi.mock('@/modules/feedback/components/FeedbackPanel', () => ({ default: () => null }));
vi.mock('@/modules/feedback/components/FeedbackResolvedToast', () => ({ default: () => null }));

import AppShell from '@/shared/components/layout/AppShell';
import ShellSidebar from '@/shared/components/layout/ShellSidebar';
import { useShellSidebar } from '@/shared/components/layout/useShellSidebar';
import type { ShellScope } from '@/shared/components/layout/AppShell';
import { SHOW_ROADMAP_KEY } from '@/app/nav/roadmap';
import type { ScopeValue } from '@/app/router/scopeContext';
import { fakeDb, resetFakeDb } from './fakeSupabase';
import { SHELL_TEST_IDS } from '@/app/shell/testIds';
import { DRAAK, FAIL_CLOSED_NAV_ACCESS, asLoading, renderShell, resetShellState, shellState } from './shellFakes';

const Harness: React.FC<{ scope: ShellScope }> = ({ scope }) => {
  const model = useShellSidebar(scope);
  if (!model.available) return <p>No sidebar</p>;
  return <ShellSidebar model={model} collapsed={false} />;
};

const VESSEL: ScopeValue = { scope: 'vessel', vessel: DRAAK, vesselCode: 'DRA' };
const FLEET: ScopeValue = { scope: 'fleet' };
const HRIS: ScopeValue = { scope: 'workspace', workspace: 'hris' };

function renderSidebar(path: string, scope: ScopeValue) {
  return renderShell(<Harness scope={scope.scope} />, { path, scope });
}

const location = () => screen.getByTestId('location').textContent;
const headingsOf = (nav: HTMLElement) =>
  within(nav)
    .queryAllByRole('group')
    .map((g) => document.getElementById(g.getAttribute('aria-labelledby') ?? '')?.textContent);

beforeEach(() => {
  localStorage.clear();
  resetFakeDb();
  resetShellState();
  badges.data = { pendingCompliance: 0, unreadMessages: 4, overdueTasks: 0 };
  fakeDb.tables.vessel_module_settings = [
    { vessel_id: DRAAK.id, module_key: 'planner', enabled: true, enabled_from: null, label_override: 'Leave' },
  ];
});

describe('the Fleet sidebar', () => {
  it('draws the Fleet tree in its six section headings, as eyebrow headings', async () => {
    renderSidebar('/fleet/dashboard', FLEET);
    const nav = await screen.findByRole('navigation', { name: 'Fleet folders' });
    expect(headingsOf(nav)).toEqual(['Overview', 'Compliance', 'People', 'Workspaces', 'Administration', 'Configuration']);
    const heading = within(nav).getByText('Overview');
    expect(heading).toHaveClass('type-eyebrow', 'text-sidebar-muted-foreground');
    const dashboard = within(nav).getByRole('link', { name: /^Dashboard(, beta)?, current page/ });
    expect(dashboard).toHaveAttribute('aria-current', 'page');
    expect(dashboard).toHaveClass('bg-sidebar-accent', 'text-sidebar-primary');
  });

  it('ignores a stray ?module=hris', async () => {
    renderSidebar('/fleet/dashboard?module=hris', FLEET);
    expect(await screen.findByRole('navigation', { name: 'Fleet folders' })).toBeInTheDocument();
  });
});

describe('the vessel sidebar', () => {
  it('shows only the active tab’s leaves, for this vessel, with its label overrides (Planner → Leave)', async () => {
    renderSidebar('/v/dra/crew/list', VESSEL);
    const nav = await screen.findByRole('navigation', { name: 'Crew folders' });
    await waitFor(() => expect(within(nav).getByRole('link', { name: /^Leave/ })).toHaveAttribute('href', '/v/dra/crew/planner'));
    expect(within(nav).getByRole('link', { name: /^Crew List(, beta)?, current page/ })).toHaveAttribute('href', '/v/dra/crew/list');
    expect(within(nav).queryByRole('link', { name: /^Planner/ })).toBeNull();
    expect(within(nav).queryByRole('link', { name: /^Drills/ })).toBeNull();
    expect(within(nav).queryByRole('link', { name: /^Home/ })).toBeNull();
  });

  it('ignores a stray ?module=hris', async () => {
    renderSidebar('/v/dra/crew/list?module=hris', VESSEL);
    expect(await screen.findByRole('navigation', { name: 'Crew folders' })).toBeInTheDocument();
  });

  it('shows the Vessel tab’s CAPS sections (Show roadmap on for the planned ones) and the hoisted badge on the leaf', async () => {
    localStorage.setItem(SHOW_ROADMAP_KEY, 'true');
    renderSidebar('/v/dra/vessel/emergency', VESSEL);
    const nav = await screen.findByRole('navigation', { name: 'Vessel folders' });
    await waitFor(() => expect(headingsOf(nav)).toEqual(['Operations', 'Vessel Record', 'Administration']));
    expect(within(nav).getByRole('link', { name: /^Emergency Contact, current page/ })).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: 'Communications, planned, 4 unread messages' })).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: 'Open 4 unread messages' })).toBeInTheDocument();
  });

  it('without the roadmap, only the section that holds a built page', async () => {
    renderSidebar('/v/dra/vessel/emergency', VESSEL);
    const nav = await screen.findByRole('navigation', { name: 'Vessel folders' });
    await waitFor(() => expect(headingsOf(nav)).toEqual(['Vessel Record']));
  });

  it('shows an add-on without its entitlement as a lock that explains itself (G4)', async () => {
    localStorage.setItem(SHOW_ROADMAP_KEY, 'true');
    renderSidebar('/v/dra/technical', VESSEL);
    const nav = await screen.findByRole('navigation', { name: 'Technical folders' });
    const lock = await within(nav).findByRole('button', { name: 'Deck Plans, planned, add-on, locked' });
    expect(within(nav).queryByRole('link', { name: /^Deck Plans/ })).toBeNull();
    act(() => {
      fireEvent.click(lock);
    });
    expect(await screen.findByText('Deck Plans is an add-on')).toBeInTheDocument();
    expect(screen.getByText('An account admin can enable it in Add-ons.')).toBeInTheDocument();
  });

  it('is absent on the vessel home and Calendar (the page takes the full width)', async () => {
    const { unmount } = renderSidebar('/v/dra', VESSEL);
    expect(await screen.findByText('No sidebar')).toBeInTheDocument();
    unmount();
    renderSidebar('/v/dra/calendar', VESSEL);
    expect(await screen.findByText('No sidebar')).toBeInTheDocument();
  });

  it('shows skeleton rows, never unfiltered leaves, while the vessel’s settings load', async () => {
    fakeDb.delayMs = 50;
    renderSidebar('/v/dra/crew/list', VESSEL);
    const nav = screen.getByRole('navigation', { name: 'Crew folders' });
    expect(nav).toHaveAttribute('aria-busy', 'true');
    expect(within(nav).queryAllByRole('link')).toEqual([]);
    await waitFor(() => expect(within(nav).getAllByRole('link').length).toBeGreaterThan(0));
  });

  it('drops a module switched off for the vessel (its tab has no sidebar to show)', async () => {
    fakeDb.tables.vessel_module_settings = [{ vessel_id: DRAAK.id, module_key: 'crew', enabled: false, enabled_from: null, label_override: null }];
    renderSidebar('/v/dra/crew/list', VESSEL);
    expect(await screen.findByText('No sidebar')).toBeInTheDocument();
  });

  describe('while access loads (the vessel is not yet known)', () => {
    const realMatchMedia = window.matchMedia;
    beforeEach(() => {
      // A desktop window, where the sidebar is the static column.
      window.matchMedia = ((query: string) => ({ ...realMatchMedia(query), matches: /min-width:\s*(768|1024)px/.test(query) })) as typeof window.matchMedia;
    });
    afterEach(() => {
      window.matchMedia = realMatchMedia;
    });

    it('keeps the static tab’s column as skeleton rows, headed Crew, with no leaf links', () => {
      asLoading();
      // What VesselScopeBody publishes until access is in: the vessel scope, no vessel yet.
      renderShell(
        <AppShell>
          <p>Page</p>
        </AppShell>,
        { path: '/v/dra/crew/list', scope: { scope: 'vessel', vessel: undefined, vesselCode: undefined }, access: FAIL_CLOSED_NAV_ACCESS },
      );
      const column = screen.getByTestId(SHELL_TEST_IDS.sidebar);
      const nav = within(column).getByRole('navigation', { name: 'Crew folders' });
      expect(nav).toHaveAttribute('aria-busy', 'true');
      expect(within(nav).getByText('Crew')).toBeInTheDocument();
      expect(within(nav).getByText('Loading Crew').closest('[role="status"]')).toHaveAttribute('aria-busy', 'true');
      expect(within(column).queryAllByRole('link')).toEqual([]);
    });
  });
});

describe('the HRIS sidebar (deferred item 2, D-45)', () => {
  it('Training & Development opens /me/training with no ?module=, and the personal scope draws no HRIS tree', async () => {
    renderSidebar('/hris/employee-records/personal-details', HRIS);
    const nav = await screen.findByRole('navigation', { name: 'HRIS folders' });
    const training = within(nav).getByRole('link', { name: /^Training & Development/ });
    expect(training).toHaveAttribute('href', '/me/training');
    act(() => {
      fireEvent.click(training);
    });
    await waitFor(() => expect(location()).toBe('/me/training'));
  });

  it('Leave Planner keeps its legacy URL and ?module=hris (D-45)', async () => {
    renderSidebar('/hris/employee-records/personal-details', HRIS);
    const nav = await screen.findByRole('navigation', { name: 'HRIS folders' });
    act(() => {
      fireEvent.click(within(nav).getByRole('button', { name: /^Leave & Rotation section/ }));
    });
    expect(await within(nav).findByRole('link', { name: /^Leave Planner/ })).toHaveAttribute('href', '/crew/leave?module=hris');
    expect(within(nav).getByRole('link', { name: /^Leave Requests/ })).toHaveAttribute('href', '/crew/leave/requests?module=hris');
  });

  it('a legacy page opened with ?module=hris keeps the HRIS tree', async () => {
    renderSidebar('/crew/leave?module=hris', { scope: 'legacy' });
    expect(await screen.findByRole('navigation', { name: 'HRIS folders' })).toBeInTheDocument();
  });

  it('the personal scope ignores ?module=hris: /me/training draws the personal tree', async () => {
    renderSidebar('/me/training?module=hris', { scope: 'personal' });
    const nav = await screen.findByRole('navigation', { name: 'My account folders' });
    expect(headingsOf(nav)).toEqual(['Account', 'Notifications', 'My work', 'Data & help', 'Company settings']);
    expect(within(nav).getByRole('link', { name: /^Training, current page/ })).toHaveAttribute('href', '/me/training');
    expect(within(nav).queryByText('Employee Records')).toBeNull();
  });
});

describe('the personal sidebar (spec §8)', () => {
  const PERSONAL: ScopeValue = { scope: 'personal' };

  it('lists the company settings only for a role that may open them', async () => {
    const admin = renderSidebar('/me/profile', PERSONAL);
    const nav = await screen.findByRole('navigation', { name: 'My account folders' });
    expect(within(nav).getByRole('link', { name: /^Permissions$/ })).toHaveAttribute('href', '/me/permissions');
    expect(within(nav).getByRole('link', { name: /^Profile, current page/ })).toBeInTheDocument();
    admin.unmount();

    shellState.auth.profile = { ...shellState.auth.profile, role: 'crew' };
    renderSidebar('/me/profile', PERSONAL);
    const crewNav = await screen.findByRole('navigation', { name: 'My account folders' });
    expect(headingsOf(crewNav)).toEqual(['Account', 'Notifications', 'My work', 'Data & help']);
    expect(within(crewNav).queryByRole('link', { name: /^Permissions/ })).toBeNull();
  });

  it('hides every company setting while auth loads (fail closed)', async () => {
    shellState.auth.loading = true;
    renderSidebar('/me/profile', PERSONAL);
    const nav = await screen.findByRole('navigation', { name: 'My account folders' });
    expect(within(nav).queryByText('Company settings')).toBeNull();
  });

  it('keeps planned leaves (Signature, Documents, Leave) hidden until Show roadmap', async () => {
    renderSidebar('/me/profile', PERSONAL);
    const nav = await screen.findByRole('navigation', { name: 'My account folders' });
    expect(within(nav).queryByRole('link', { name: /^Signature/ })).toBeNull();
    expect(within(nav).queryByRole('link', { name: /^Leave/ })).toBeNull();
    expect(within(nav).getByRole('link', { name: /^Inbox$/ })).toHaveAttribute('href', '/inbox');
  });

  it('a legacy ?module=personal never draws the unfiltered tree', async () => {
    shellState.auth.profile = { ...shellState.auth.profile, role: 'crew' };
    renderSidebar('/crew/leave?module=personal', { scope: 'legacy' });
    const nav = await screen.findByRole('navigation', { name: 'My account folders' });
    expect(within(nav).queryByText('Company settings')).toBeNull();
  });
});
