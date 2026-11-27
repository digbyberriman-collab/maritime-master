/**
 * An unresolved vessel URL (unknown code, out of reach, sold) is a dead end
 * of the vessel scope, and the shell treats it as one (D-04 fail closed;
 * spec §1: the tab row and the sidebar are the vessel's; D-58 shell-owned
 * states). VesselScopeBody publishes `{ scope: 'vessel', vessel: undefined }`
 * for it, and then:
 *
 * - no tab row and no sidebar (static column or drawer), so nothing reads as
 *   another vessel's page being denied;
 * - no link into another vessel (the last vessel is for the surfaces outside
 *   the vessel scope only, spec §5.3; the top bar's scope control keeps it,
 *   D-64, and is not drawn here);
 * - `useVesselNav()` names no vessel and no active tab;
 * - while access loads, the vessel is not yet known: the row stays (its
 *   skeletons) and so does the static tab's sidebar column (skeleton rows,
 *   no links), so neither the header nor the page jumps once the vessel
 *   resolves (D-96, IA19).
 *
 * src/test/router/scopes.test.tsx stubs the tab row, which is why it never
 * saw this.
 */
import React from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';

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
vi.mock('@/shared/hooks/useSidebarBadgeCounts', () => ({ useSidebarBadgeCounts: () => ({ data: undefined }) }));
vi.mock('@/shared/components/InkfishWatermark', () => ({ default: () => null }));
vi.mock('@/shared/components/layout/InkfishFooter', () => ({ default: () => null }));
// The top bar names the last vessel by design (D-64); this file is about the frame below it.
vi.mock('@/shared/components/layout/topbar/TopBar', () => ({
  default: ({ mobileNavAvailable }: { mobileNavAvailable?: boolean }) => (
    <header data-testid="shell-topbar" data-mobile-nav={mobileNavAvailable ? 'available' : 'none'} />
  ),
}));
vi.mock('@/shared/components/layout/topbar/KeyboardShortcutsDialog', () => ({ default: () => null }));
vi.mock('@/shared/components/layout/topbar/ShellShortcuts', () => ({ default: () => null }));
vi.mock('@/modules/feedback/components/FeedbackPanel', () => ({ default: () => null }));
vi.mock('@/modules/feedback/components/FeedbackResolvedToast', () => ({ default: () => null }));

import AppShell from '@/shared/components/layout/AppShell';
import { useVesselNav } from '@/app/nav/useVesselNav';
import { SHELL_TEST_IDS } from '@/app/shell/testIds';
import type { ScopeValue } from '@/app/router/scopeContext';
import { resetFakeDb } from './fakeSupabase';
import {
  DRAAK,
  FAIL_CLOSED_NAV_ACCESS,
  VESSEL_ONLY_ACCESS,
  asLoading,
  asVesselMaster,
  renderShell,
  resetShellState,
} from './shellFakes';

const UNRESOLVED: ScopeValue = { scope: 'vessel', vessel: undefined, vesselCode: undefined };
const realMatchMedia = window.matchMedia;

/** A desktop window, where a sidebar would be the static column. */
function desktop() {
  window.matchMedia = ((query: string) => ({ ...realMatchMedia(query), matches: /min-width:\s*(768|1024)px/.test(query) })) as typeof window.matchMedia;
}

const NavDump: React.FC = () => {
  const nav = useVesselNav();
  return <pre data-testid="vessel-nav">{JSON.stringify({ vessel: nav.vessel, activeTabId: nav.activeTabId, status: nav.status })}</pre>;
};
const navDump = () => JSON.parse(screen.getByTestId('vessel-nav').textContent ?? '{}') as { vessel: unknown; activeTabId: string | null; status: string };

const State: React.FC = () => <h1>Vessel not found</h1>;

function renderAt(path: string, scope: ScopeValue, access = VESSEL_ONLY_ACCESS) {
  return renderShell(
    <AppShell>
      <State />
      <NavDump />
    </AppShell>,
    { path, scope, access },
  );
}

/** Every link in the document that opens a vessel's page. */
const vesselLinks = () =>
  Array.from(document.querySelectorAll('a[href]'))
    .map((a) => a.getAttribute('href') ?? '')
    .filter((href) => href.startsWith('/v/'));

beforeAll(() => {
  Element.prototype.scrollIntoView = () => undefined;
});
beforeEach(() => {
  localStorage.clear();
  resetFakeDb();
  resetShellState();
  desktop();
});
afterEach(() => {
  window.matchMedia = realMatchMedia;
});

describe('an unresolved vessel URL, access ready', () => {
  it('unknown code (/v/zzz/crew/list): no tab row, no sidebar, no link into another vessel', async () => {
    renderAt('/v/zzz/crew/list', UNRESOLVED);
    await waitFor(() => expect(navDump().status).toBe('ready'));
    expect(screen.queryByTestId(SHELL_TEST_IDS.moduleTabBar)).toBeNull();
    expect(screen.queryByTestId(SHELL_TEST_IDS.sidebar)).toBeNull();
    expect(screen.getByTestId('shell-topbar')).toHaveAttribute('data-mobile-nav', 'none');
    expect(vesselLinks()).toEqual([]);
    expect(document.querySelector('[aria-current="page"]')?.closest('a')).toBeFalsy();
  });

  it('useVesselNav names no vessel and no active tab (never the last vessel)', async () => {
    renderAt('/v/zzz/crew/list', UNRESOLVED);
    await waitFor(() => expect(navDump().status).toBe('ready'));
    expect(navDump()).toEqual({ vessel: null, activeTabId: null, status: 'ready' });
  });

  it('the vessel master on another vessel (/v/hyd/crew/list, out of reach) gets none of DRAAK’s nav', async () => {
    asVesselMaster([DRAAK]);
    renderAt('/v/hyd/crew/list', UNRESOLVED);
    await waitFor(() => expect(navDump().status).toBe('ready'));
    expect(navDump()).toEqual({ vessel: null, activeTabId: null, status: 'ready' });
    expect(screen.queryByTestId(SHELL_TEST_IDS.moduleTabBar)).toBeNull();
    expect(screen.queryByTestId(SHELL_TEST_IDS.sidebar)).toBeNull();
    expect(vesselLinks()).toEqual([]);
  });
});

describe('while access loads', () => {
  it('keeps the tab row and the static tab’s sidebar as skeletons, with nothing to follow', () => {
    asLoading();
    renderAt('/v/zzz/crew/list', UNRESOLVED, FAIL_CLOSED_NAV_ACCESS);
    const row = screen.getByTestId(SHELL_TEST_IDS.moduleTabBar);
    expect(within(row).getByRole('status')).toHaveAttribute('aria-busy', 'true');
    expect(within(row).queryAllByRole('link')).toEqual([]);
    // The column holds its place (no jump once the vessel resolves), but draws no vessel's tree.
    const sidebar = screen.getByTestId(SHELL_TEST_IDS.sidebar);
    const nav = within(sidebar).getByRole('navigation', { name: 'Crew folders' });
    expect(nav).toHaveAttribute('aria-busy', 'true');
    expect(within(nav).getByText('Loading Crew').closest('[role="status"]')).toHaveAttribute('aria-busy', 'true');
    expect(within(sidebar).queryAllByRole('link')).toEqual([]);
    expect(vesselLinks()).toEqual([]);
  });
});

describe('the control: a resolved vessel', () => {
  it('keeps its own tab row and sidebar, on its own code', async () => {
    // The crew leaves are rebuilt pages behind their capabilities (Phase 3 wave 1), so this vessel user holds them.
    renderAt('/v/dra/crew/list', { scope: 'vessel', vessel: DRAAK, vesselCode: 'DRA' }, { ...VESSEL_ONLY_ACCESS, can: () => true });
    const row = await screen.findByTestId(SHELL_TEST_IDS.moduleTabBar);
    const crew = await within(row).findByTestId(`${SHELL_TEST_IDS.moduleTabPrefix}crew`);
    expect(crew).toHaveAttribute('href', '/v/dra/crew');
    expect(crew).toHaveAttribute('aria-current', 'page');
    await waitFor(() => expect(screen.getByTestId(SHELL_TEST_IDS.sidebar)).toBeInTheDocument());
    expect(navDump()).toMatchObject({ vessel: { id: DRAAK.id, code: 'DRA', name: 'DRAAK' }, activeTabId: 'crew' });
  });
});
