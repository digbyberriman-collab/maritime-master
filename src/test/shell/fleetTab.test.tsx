/**
 * Deferred item 1 (D-26): the shell never offers the Fleet view to a user who
 * cannot open it. The old module rail filtered on `canAccessModule('fleet')`,
 * which the legacy module map grants to masters and officers, so a vessel-only
 * master saw a Fleet tab that FleetScope then denied. The top bar's Fleet
 * segment, `g f` and the shortcuts dialog now follow fleet reach only, the
 * rule the nav applies to every fleet node; while access loads none of them
 * shows (fail closed).
 *
 * The real AppShell, top bar and NavAccessProvider; auth, vessels and roles
 * are in-memory fakes (src/test/shell/shellFakes.ts).
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';

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
vi.mock('@/shared/contexts/BrandingContext', async () => {
  const { shellState } = await import('./shellFakes');
  return { useBrandingContext: () => shellState.branding };
});
vi.mock('@/modules/feedback/store/feedbackStore', async () => {
  const { shellState } = await import('./shellFakes');
  return { useFeedbackStore: (selector?: (s: object) => unknown) => (selector ? selector(shellState.feedback) : shellState.feedback) };
});
vi.mock('@/modules/dashboard/contexts/DashboardFilterContext', () => ({
  DashboardFilterProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('@/shared/components/layout/SidebarNavigation', () => ({ default: () => <nav aria-label="Test sidebar" /> }));
vi.mock('@/shared/components/layout/PageLocationHeader', () => ({ default: () => null }));
vi.mock('@/shared/components/layout/InkfishFooter', () => ({ default: () => null }));
vi.mock('@/shared/components/InkfishWatermark', () => ({ default: () => null }));
vi.mock('@/modules/feedback/components/FeedbackPanel', () => ({ default: () => null }));
vi.mock('@/modules/feedback/components/FeedbackResolvedToast', () => ({ default: () => null }));

import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import NavAccessProvider from '@/app/nav/NavAccessProvider';
import { ScopeContext, type ScopeValue } from '@/app/router/scopeContext';
import { SHELL_TEST_IDS } from '@/app/shell/testIds';
import { resetFakeDb } from './fakeSupabase';
import { DRAAK, HYDRA, asFleetUser, asLoading, asVesselMaster, renderShell, resetShellState, shellState } from './shellFakes';

function renderVesselPage(path = '/v/dra/crew/list') {
  const scope: ScopeValue = { scope: 'vessel', vessel: shellState.vessel.vessels[0], vesselCode: 'DRA' };
  return renderShell(
    <NavAccessProvider>
      <ScopeContext.Provider value={scope}>
        <DashboardLayout>
          <p>Crew list</p>
        </DashboardLayout>
      </ScopeContext.Provider>
    </NavAccessProvider>,
    { path, access: null },
  );
}

const location = () => screen.getByTestId('location').textContent;

function press(...keys: string[]) {
  for (const key of keys) act(() => void fireEvent.keyDown(document.body, { key }));
}

describe('the Fleet scope in the top bar (deferred item 1, D-26)', () => {
  beforeEach(() => {
    localStorage.clear();
    resetFakeDb();
    resetShellState();
  });
  afterEach(() => vi.useRealTimers());

  it('is not offered to a vessel-only master, although the legacy module map lets them through', async () => {
    asVesselMaster([DRAAK, HYDRA]);
    expect(shellState.auth.canAccessModule('fleet')).toBe(true);
    renderVesselPage();

    const topBar = await screen.findByTestId(SHELL_TEST_IDS.topBar);
    await waitFor(() => expect(within(topBar).getByTestId(SHELL_TEST_IDS.scopeVessel)).toBeInTheDocument());
    expect(screen.queryByTestId(SHELL_TEST_IDS.scopeFleet)).toBeNull();
    // No link anywhere in the top bar leads into the Fleet view.
    for (const link of within(topBar).queryAllByRole('link')) {
      expect(link.getAttribute('href') ?? '').not.toMatch(/^\/fleet(\/|$)/);
      expect(link.textContent ?? '').not.toMatch(/^\s*Fleet\s*$/);
    }
  });

  it('g f does nothing for a vessel-only user, and the shortcuts dialog does not list it', async () => {
    asVesselMaster([DRAAK, HYDRA]);
    renderVesselPage();
    await screen.findByTestId(SHELL_TEST_IDS.scopeVessel);

    press('g', 'f');
    expect(location()).toBe('/v/dra/crew/list');

    press('?');
    const dialog = await screen.findByTestId(SHELL_TEST_IDS.keyboardShortcuts);
    expect(within(dialog).queryByText('Go to the Fleet view')).toBeNull();
    expect(within(dialog).getByText('Show keyboard shortcuts')).toBeInTheDocument();
    // Two vessels in reach: the switcher shortcut is live.
    expect(within(dialog).getByText('Switch vessel')).toBeInTheDocument();
  });

  it('a master with one vessel gets a plain vessel label and no switcher', async () => {
    asVesselMaster([DRAAK]);
    renderVesselPage();
    const label = await screen.findByTestId(SHELL_TEST_IDS.scopeVessel);
    expect(label.tagName).toBe('SPAN');
    expect(screen.queryByTestId(SHELL_TEST_IDS.scopeFleet)).toBeNull();
    expect(screen.queryByTestId(SHELL_TEST_IDS.vesselSwitcherTrigger)).toBeNull();

    press('?');
    const dialog = await screen.findByTestId(SHELL_TEST_IDS.keyboardShortcuts);
    expect(within(dialog).queryByText('Switch vessel')).toBeNull();
    expect(within(dialog).queryByText('Go to the Fleet view')).toBeNull();
  });

  it('is offered to a fleet user: the segment, g f and the dialog entry', async () => {
    asFleetUser();
    renderVesselPage('/v/dra/crew/training');
    const fleet = await screen.findByTestId(SHELL_TEST_IDS.scopeFleet);
    // Crew › Training has a visible Fleet counterpart.
    expect(fleet).toHaveAttribute('href', '/fleet/training');

    press('g', 'f');
    await waitFor(() => expect(location()).toBe('/fleet/training'));
  });

  it('lists g f in the shortcuts dialog for a fleet user', async () => {
    asFleetUser();
    renderVesselPage();
    await screen.findByTestId(SHELL_TEST_IDS.scopeFleet);
    press('?');
    const dialog = await screen.findByTestId(SHELL_TEST_IDS.keyboardShortcuts);
    expect(within(dialog).getByText('Go to the Fleet view')).toBeInTheDocument();
  });

  it('shows neither segment while access is loading (fail closed)', async () => {
    asLoading();
    renderVesselPage();
    const control = await screen.findByTestId(SHELL_TEST_IDS.scopeControl);
    expect(control).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByTestId(SHELL_TEST_IDS.scopeFleet)).toBeNull();
    expect(screen.queryByTestId(SHELL_TEST_IDS.scopeVessel)).toBeNull();
    press('g', 'f');
    expect(location()).toBe('/v/dra/crew/list');
  });
});
