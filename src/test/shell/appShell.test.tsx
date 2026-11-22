/**
 * The AppShell frame (spec §1, §3): the root is its own stacking context with
 * the watermark first (so it can sit behind content), the shell's actions
 * wrap the command palette (so the palette's Actions group sees them), one
 * palette per shell however many DashboardLayouts nest, the vessel of a
 * vessel-scope visit goes to the recent list, and the shell offers each
 * action only when its surface is there.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import type { ShellActions } from '@/app/shell/shellActions';

const seen = vi.hoisted(() => ({ paletteActions: [] as ShellActions[], impersonating: false }));

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
vi.mock('@/shared/components/InkfishWatermark', () => ({ default: () => <div data-testid="watermark" /> }));
vi.mock('@/shared/components/layout/topbar/TopBar', () => ({
  default: ({ impersonating }: { impersonating?: boolean }) => <header data-testid="shell-topbar" data-impersonating={impersonating || undefined} />,
}));
vi.mock('@/shared/components/layout/SidebarNavigation', () => ({ default: () => <nav aria-label="Test sidebar" /> }));
vi.mock('@/shared/components/layout/PageLocationHeader', () => ({ default: () => null }));
vi.mock('@/shared/components/layout/InkfishFooter', () => ({ default: () => null }));
vi.mock('@/modules/feedback/components/FeedbackPanel', () => ({ default: () => null }));
vi.mock('@/modules/feedback/components/FeedbackResolvedToast', () => ({ default: () => null }));
vi.mock('@/app/shell/impersonation', () => ({
  useImpersonation: () => (seen.impersonating ? { targetLabel: 'Chief Officer', end: () => undefined } : null),
}));
// The palette provider stands in for the palette: it records the shell actions it can see.
vi.mock('@/shared/components/command-palette', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/components/command-palette')>();
  const { useShellActions } = await import('@/app/shell/shellActions');
  const Provider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    seen.paletteActions.push(useShellActions());
    return <actual.CommandPaletteProvider><div data-testid="palette-provider">{children}</div></actual.CommandPaletteProvider>;
  };
  return { ...actual, CommandPaletteProvider: Provider };
});

import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import AppShell from '@/shared/components/layout/AppShell';
import { readRecentVessels } from '@/app/nav/recentVessels';
import { SHELL_TEST_IDS } from '@/app/shell/testIds';
import { useShellActions } from '@/app/shell/shellActions';
import { resetFakeDb } from './fakeSupabase';
import { DRAAK, HYDRA, USER_ID, asFleetUser, asLoading, renderShell, resetShellState } from './shellFakes';

const realMatchMedia = window.matchMedia;
const ActionsProbe: React.FC<{ onActions: (a: ShellActions) => void }> = ({ onActions }) => {
  onActions(useShellActions());
  return null;
};

beforeEach(() => {
  localStorage.clear();
  resetFakeDb();
  resetShellState();
  seen.paletteActions = [];
  seen.impersonating = false;
});
afterEach(() => {
  window.matchMedia = realMatchMedia;
});

describe('the shell root', () => {
  it('is its own stacking context with the page background, and the watermark is its first child', () => {
    renderShell(<AppShell>page</AppShell>, { path: '/fleet/dashboard', scope: { scope: 'fleet' } });
    const watermark = screen.getByTestId('watermark');
    const root = watermark.parentElement as HTMLElement;
    expect(root.firstElementChild).toBe(watermark);
    expect(root).toHaveClass('relative', 'isolate', 'min-h-dvh', 'bg-background');
    expect(root).toHaveAttribute('data-shell-scope', 'fleet');
  });

  it('puts no opaque background on the wrappers between the root and the page', () => {
    renderShell(<AppShell><p>page body</p></AppShell>, { path: '/fleet/dashboard', scope: { scope: 'fleet' } });
    const root = screen.getByTestId('watermark').parentElement as HTMLElement;
    let node = screen.getByText('page body').parentElement;
    while (node && node !== root) {
      expect(node.className).not.toMatch(/(^|\s)bg-(background|card|popover|muted)(\s|$)/);
      node = node.parentElement;
    }
  });

  it('keeps the header sticky and publishes its height for the sidebar', () => {
    renderShell(<AppShell>page</AppShell>, { path: '/fleet/dashboard', scope: { scope: 'fleet' } });
    const header = document.querySelector('[data-shell-header]') as HTMLElement;
    expect(header).toHaveClass('sticky', 'top-0', 'z-40');
    const root = screen.getByTestId('watermark').parentElement as HTMLElement;
    expect(root.style.getPropertyValue('--shell-header-h')).toMatch(/^\d+px$/);
    expect(screen.getByTestId(SHELL_TEST_IDS.main)).toHaveAttribute('id', 'main-content');
    expect(screen.getByTestId(SHELL_TEST_IDS.main)).toHaveClass('storm-compact', 'min-w-0');
  });
});

describe('providers', () => {
  it('the command palette sits inside the shell actions', () => {
    renderShell(<AppShell>page</AppShell>, { path: '/fleet/dashboard', scope: { scope: 'fleet' } });
    expect(seen.paletteActions.length).toBeGreaterThan(0);
    const actions = seen.paletteActions[seen.paletteActions.length - 1];
    expect(actions.openNotifications).toBeTypeOf('function');
    expect(actions.openKeyboardShortcuts).toBeTypeOf('function');
  });

  it('mounts one palette when DashboardLayouts nest', () => {
    renderShell(
      <DashboardLayout>
        <DashboardLayout>
          <DashboardLayout collapseSidebar>
            <p>page</p>
          </DashboardLayout>
        </DashboardLayout>
      </DashboardLayout>,
      { path: '/fleet/dashboard', scope: { scope: 'fleet' } },
    );
    expect(screen.getAllByTestId('palette-provider')).toHaveLength(1);
    expect(screen.getAllByTestId(SHELL_TEST_IDS.topBar)).toHaveLength(1);
    expect(screen.getAllByTestId(SHELL_TEST_IDS.main)).toHaveLength(1);
  });
});

describe('shell actions', () => {
  it('offers the vessel switcher only with two vessels in reach, and Help only from 768 px', () => {
    let actions: ShellActions = {};
    asFleetUser([DRAAK]);
    const { unmount } = renderShell(
      <AppShell>
        <ActionsProbe onActions={(a) => (actions = a)} />
      </AppShell>,
      { path: '/fleet/dashboard', scope: { scope: 'fleet' } },
    );
    expect(actions.openVesselSwitcher).toBeUndefined();
    expect(actions.openHelp).toBeUndefined();
    unmount();

    asFleetUser([DRAAK, HYDRA]);
    window.matchMedia = ((query: string) => ({ ...realMatchMedia(query), matches: query.includes('768') })) as typeof window.matchMedia;
    renderShell(
      <AppShell>
        <ActionsProbe onActions={(a) => (actions = a)} />
      </AppShell>,
      { path: '/fleet/dashboard', scope: { scope: 'fleet' } },
    );
    expect(actions.openVesselSwitcher).toBeTypeOf('function');
    expect(actions.openHelp).toBeTypeOf('function');
  });

  it('offers nothing while access loads', () => {
    let actions: ShellActions = {};
    asLoading();
    renderShell(
      <AppShell>
        <ActionsProbe onActions={(a) => (actions = a)} />
      </AppShell>,
      { path: '/fleet/dashboard', scope: { scope: 'fleet' } },
    );
    expect(actions.openVesselSwitcher).toBeUndefined();
  });
});

describe('recent vessels', () => {
  it('records the vessel of a vessel-scope visit', async () => {
    renderShell(<AppShell>page</AppShell>, { path: '/v/hyd', scope: { scope: 'vessel', vessel: HYDRA, vesselCode: 'HYD' } });
    await waitFor(() => expect(readRecentVessels(USER_ID)).toEqual([HYDRA.id]));
  });

  it('records nothing outside the vessel scope', () => {
    renderShell(<AppShell>page</AppShell>, { path: '/fleet/dashboard', scope: { scope: 'fleet' } });
    expect(readRecentVessels(USER_ID)).toEqual([]);
  });
});

describe('impersonation', () => {
  it('shows the warning bar above a warning-toned top bar', () => {
    seen.impersonating = true;
    renderShell(<AppShell>page</AppShell>, { path: '/fleet/dashboard', scope: { scope: 'fleet' } });
    const bar = screen.getByTestId(SHELL_TEST_IDS.impersonationBar);
    expect(bar).toHaveTextContent('Viewing as Chief Officer');
    expect(bar).toHaveClass('bg-warning-muted');
    expect(screen.getByTestId(SHELL_TEST_IDS.topBar)).toHaveAttribute('data-impersonating', 'true');
  });

  it('shows no bar in Phase 1 (no impersonation runtime)', () => {
    renderShell(<AppShell>page</AppShell>, { path: '/fleet/dashboard', scope: { scope: 'fleet' } });
    expect(screen.queryByTestId(SHELL_TEST_IDS.impersonationBar)).toBeNull();
  });
});
