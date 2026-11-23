/**
 * Favourites links (gap/10 top bar element 6, IA13; spec §6.4; D-04, D-93):
 * only in-app paths become links; anything else (`javascript:`,
 * protocol-relative `//host`, `/\host`) is listed as "Not a page in STORM"
 * with Remove, and the star never saves such a target. On a vessel page whose
 * vessel has not resolved, and on any shell-owned state but ModuleOff, there
 * is no page to pin: the star is not shown. An in-app pin the viewer can no
 * longer open (fleet reach, vessel reach, the vessel's module settings, the
 * workspace's Apps entry) is "No longer available" with Remove; while access
 * loads a pin waits, with no link.
 */
import React from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';

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
// For the shell cases: the real AppShell and scope routes, with a top bar that is the favourites control alone.
vi.mock('@/shared/components/layout/topbar/TopBar', async () => {
  const { default: Favourites } = await import('@/shared/components/layout/topbar/FavouritesControl');
  return {
    default: () => (
      <header data-testid="shell-topbar">
        <Favourites />
      </header>
    ),
  };
});
vi.mock('@/shared/hooks/useSidebarBadgeCounts', () => ({ useSidebarBadgeCounts: () => ({ data: undefined }) }));
vi.mock('@/shared/contexts/BrandingContext', () => ({ useBrandingContext: () => ({ clientDisplayName: 'TEST', clientLogoUrl: null }) }));
vi.mock('@/shared/components/layout/InkfishFooter', () => ({ default: () => null }));
vi.mock('@/shared/components/InkfishWatermark', () => ({ default: () => null }));
vi.mock('@/shared/components/layout/topbar/KeyboardShortcutsDialog', () => ({ default: () => null }));
vi.mock('@/shared/components/layout/topbar/ShellShortcuts', () => ({ default: () => null }));
vi.mock('@/modules/feedback/components/FeedbackPanel', () => ({ default: () => null }));
vi.mock('@/modules/feedback/components/FeedbackResolvedToast', () => ({ default: () => null }));

import FavouritesControl from '@/shared/components/layout/topbar/FavouritesControl';
import { isInAppPath, usePinnedShortcuts } from '@/shared/hooks/usePinnedShortcuts';
import { SHELL_TEST_IDS } from '@/app/shell/testIds';
import { FleetScope, ScopeNotFound, VesselScopeRoute } from '@/app/router/scopes';
import { fakeDb, resetFakeDb } from './fakeSupabase';
import {
  DRAAK,
  FAIL_CLOSED_NAV_ACCESS,
  HYDRA,
  USER_ID,
  VESSEL_ONLY_ACCESS,
  XIPHIAS,
  asFleetUser,
  asLoading,
  asVesselMaster,
  renderShell,
  resetShellState,
  shellState,
} from './shellFakes';

beforeAll(() => {
  Element.prototype.scrollIntoView = () => undefined;
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => undefined;
});

beforeEach(() => {
  localStorage.clear();
  resetFakeDb();
  resetShellState();
});

const pin = (target: string, label: string, sort = 0) => ({
  id: `pin-${label}`,
  user_id: USER_ID,
  shortcut_target: target,
  shortcut_label: label,
  shortcut_icon: 'ship',
  sort_order: sort,
});

async function openFavourites() {
  await waitFor(() => expect(screen.getByTestId(SHELL_TEST_IDS.favouriteToggle)).not.toHaveAttribute('aria-disabled'));
  fireEvent.keyDown(screen.getByTestId(SHELL_TEST_IDS.favouritesTrigger), { key: 'Enter' });
  return screen.findByTestId(SHELL_TEST_IDS.favouritesMenu);
}

describe('isInAppPath', () => {
  it.each([
    ['/fleet/dashboard', true],
    ['/v/dra/crew/list?tab=active', true],
    ['/', true],
    ['javascript:alert(1)', false],
    ['data:text/html,hi', false],
    ['https://evil.example/x', false],
    ['//evil.example/x', false],
    ['/\\evil', false],
    ['fleet/dashboard', false],
    ['', false],
  ])('%s → %s', (target, expected) => {
    expect(isInAppPath(target)).toBe(expected);
  });
});

describe('the favourites menu', () => {
  it('links in-app pins only; any other target is "Not a page in STORM" with Remove, never an anchor', async () => {
    fakeDb.tables.user_pinned_shortcuts = [
      pin('/fleet/dashboard', 'Fleet dashboard', 0),
      pin('javascript:alert(1)', 'Script', 1),
      pin('//evil.example/x', 'Elsewhere', 2),
      pin('/\\evil', 'Backslash', 3),
    ];
    renderShell(<FavouritesControl />, { path: '/fleet/documents', scope: { scope: 'fleet' } });
    const menu = await openFavourites();

    const good = within(menu).getByRole('menuitem', { name: /Fleet dashboard/ });
    expect(good.tagName).toBe('A');
    expect(good).toHaveAttribute('href', '/fleet/dashboard');

    for (const label of ['Script', 'Elsewhere', 'Backslash']) {
      const item = within(menu).getByRole('menuitem', { name: `Remove ${label}, not a page in STORM` });
      expect(item.tagName).not.toBe('A');
      expect(item.closest('a')).toBeNull();
      expect(item).not.toHaveAttribute('href');
      expect(item).toHaveTextContent('Not a page in STORM');
      expect(item).toHaveTextContent('Remove');
    }
    // No anchor in the menu points anywhere but an in-app path.
    for (const anchor of Array.from(menu.querySelectorAll('a'))) expect(isInAppPath(anchor.getAttribute('href') ?? '')).toBe(true);
  });

  it('Remove deletes the pin and keeps the menu open', async () => {
    fakeDb.tables.user_pinned_shortcuts = [pin('javascript:alert(1)', 'Script')];
    renderShell(<FavouritesControl />, { path: '/fleet/documents', scope: { scope: 'fleet' } });
    const menu = await openFavourites();
    fakeDb.applyWrites = true;
    fireEvent.click(within(menu).getByRole('menuitem', { name: /^Remove Script/ }));
    await waitFor(() => expect(fakeDb.calls.some((c) => c.op === 'delete')).toBe(true));
    const remove = fakeDb.calls.find((c) => c.op === 'delete');
    expect(remove?.filters).toEqual([
      ['user_id', 'eq', USER_ID],
      ['shortcut_target', 'eq', 'javascript:alert(1)'],
    ]);
    expect(await within(menu).findByText('Star a page to keep it here.')).toBeInTheDocument();
    expect(screen.getByTestId(SHELL_TEST_IDS.favouritesMenu)).toBeInTheDocument();
  });
});

describe('saving a favourite', () => {
  it('refuses a target that is not an in-app path, without a write', async () => {
    fakeDb.tables.user_pinned_shortcuts = [];
    const api: { current: ReturnType<typeof usePinnedShortcuts> | null } = { current: null };
    const Probe: React.FC = () => {
      api.current = usePinnedShortcuts();
      return null;
    };
    renderShell(<Probe />);
    await waitFor(() => expect(api.current?.status).toBe('ready'));
    let saved: boolean | undefined;
    await act(async () => {
      saved = await api.current?.togglePin({ target: '//x', label: 'Elsewhere', icon: 'ship' });
    });
    expect(saved).toBe(false);
    expect(fakeDb.calls.some((c) => c.op === 'insert')).toBe(false);
  });
});

describe('a vessel page whose vessel has not resolved', () => {
  it('shows no star (nothing to pin), and keeps the favourites menu', async () => {
    fakeDb.tables.user_pinned_shortcuts = [pin('/fleet/dashboard', 'Fleet dashboard')];
    renderShell(<FavouritesControl />, { path: '/v/zzz/crew/list', scope: { scope: 'vessel', vessel: undefined } });
    expect(screen.queryByTestId(SHELL_TEST_IDS.favouriteToggle)).toBeNull();
    const chevron = screen.getByTestId(SHELL_TEST_IDS.favouritesTrigger);
    expect(chevron).not.toHaveClass('rounded-l-none');
    fireEvent.keyDown(chevron, { key: 'Enter' });
    const menu = await screen.findByTestId(SHELL_TEST_IDS.favouritesMenu);
    expect(await within(menu).findByRole('menuitem', { name: /Fleet dashboard/ })).toHaveAttribute('href', '/fleet/dashboard');
  });
});

describe('shell-owned states (D-93, D-96)', () => {
  const realMatchMedia = window.matchMedia;
  afterEach(() => {
    window.matchMedia = realMatchMedia;
  });

  /** The scope routes as the router declares them: a page, the module gate, and the in-scope 404. */
  const App: React.FC = () => (
    <Routes>
      <Route path="/fleet" element={<FleetScope />}>
        <Route path="dashboard" element={<h1>Fleet dashboard</h1>} />
        <Route path="*" element={<ScopeNotFound />} />
      </Route>
      <Route path="/v/:vesselCode" element={<VesselScopeRoute />}>
        <Route path="technical" element={<h1>Technical overview</h1>} />
        <Route path="*" element={<ScopeNotFound />} />
      </Route>
    </Routes>
  );

  it.each([
    ['the Fleet scope', '/fleet/nonexistent'],
    ['the vessel scope', '/v/hyd/nonexistent/thing'],
  ])('the in-scope 404 in %s shows no star; the favourites menu stays', async (_scope, path) => {
    asFleetUser([HYDRA, DRAAK, XIPHIAS]);
    fakeDb.tables.user_pinned_shortcuts = [pin('/fleet/dashboard', 'Fleet dashboard')];
    renderShell(<App />, { path });
    expect(await screen.findByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument();
    await act(async () => {});
    expect(screen.queryByTestId(SHELL_TEST_IDS.favouriteToggle)).toBeNull();
    expect(screen.queryByRole('button', { name: /to favourites/ })).toBeNull();
    const chevron = screen.getByTestId(SHELL_TEST_IDS.favouritesTrigger);
    expect(chevron).not.toHaveClass('rounded-l-none');
    fireEvent.keyDown(chevron, { key: 'Enter' });
    const menu = await screen.findByTestId(SHELL_TEST_IDS.favouritesMenu);
    expect(await within(menu).findByRole('menuitem', { name: /Fleet dashboard/ })).toHaveAttribute('href', '/fleet/dashboard');
    // Nothing was pinned on the way.
    expect(fakeDb.calls.some((c) => c.table === 'user_pinned_shortcuts' && c.op === 'insert')).toBe(false);
  });

  it('the Fleet denial for a vessel-only viewer shows no star either', async () => {
    asVesselMaster([DRAAK]);
    renderShell(<App />, { path: '/fleet/dashboard', access: VESSEL_ONLY_ACCESS });
    expect(await screen.findByRole('heading', { level: 1, name: 'The Fleet view is not available to you' })).toBeInTheDocument();
    expect(screen.queryByTestId(SHELL_TEST_IDS.favouriteToggle)).toBeNull();
    expect(screen.getByTestId(SHELL_TEST_IDS.favouritesTrigger)).toBeInTheDocument();
  });

  it('ModuleOff keeps the star, named after the page (the page exists, only switched off)', async () => {
    asFleetUser([HYDRA, DRAAK, XIPHIAS]);
    fakeDb.tables.vessel_module_settings = [
      { vessel_id: HYDRA.id, module_key: 'technical', enabled: false, enabled_from: null, label_override: null },
    ];
    renderShell(<App />, { path: '/v/hyd/technical' });
    expect(await screen.findByRole('heading', { level: 1, name: 'Technical is switched off for HYDRA' })).toBeInTheDocument();
    const star = screen.getByTestId(SHELL_TEST_IDS.favouriteToggle);
    await waitFor(() => expect(star).not.toHaveAttribute('aria-disabled'));
    expect(star).toHaveAccessibleName('Add Overview to favourites');
  });

  it('an ordinary page keeps its star', async () => {
    renderShell(<App />, { path: '/fleet/dashboard' });
    expect(await screen.findByRole('heading', { level: 1, name: 'Fleet dashboard' })).toBeInTheDocument();
    expect(screen.getByTestId(SHELL_TEST_IDS.favouriteToggle)).toBeInTheDocument();
  });
});

describe('pins to pages the viewer can no longer open (D-93, D-04)', () => {
  async function openMenu() {
    fireEvent.keyDown(screen.getByTestId(SHELL_TEST_IDS.favouritesTrigger), { key: 'Enter' });
    return screen.findByTestId(SHELL_TEST_IDS.favouritesMenu);
  }

  /** "No longer available" with Remove, never an anchor. */
  async function expectUnavailable(menu: HTMLElement, label: string) {
    const item = await within(menu).findByRole('menuitem', { name: `Remove ${label}, no longer available` });
    expect(item.tagName).not.toBe('A');
    expect(item.closest('a')).toBeNull();
    expect(item).not.toHaveAttribute('href');
    expect(item).toHaveTextContent('No longer available');
    expect(item).toHaveTextContent('Remove');
    return item;
  }

  const anchors = (menu: HTMLElement) => Array.from(menu.querySelectorAll('a')).map((a) => a.getAttribute('href'));

  /** A link once the pin has resolved (a vessel pin waits for that vessel's module settings first). */
  const expectLink = (menu: HTMLElement, label: string, href: string) =>
    waitFor(() => expect(within(menu).getByRole('menuitem', { name: label })).toHaveAttribute('href', href));

  it('a vessel-only viewer: a Fleet page and an unreached vessel are unavailable; their own vessel opens', async () => {
    asVesselMaster([DRAAK]);
    fakeDb.tables.user_pinned_shortcuts = [
      pin('/fleet/admin/users', 'Users', 0),
      pin('/v/hyd/technical', 'HYDRA Technical', 1),
      pin('/v/dra/crew/list', 'Crew List', 2),
    ];
    renderShell(<FavouritesControl />, { path: '/v/dra/crew/roster', scope: { scope: 'vessel', vessel: DRAAK, vesselCode: 'DRA' }, access: VESSEL_ONLY_ACCESS });
    const menu = await openMenu();
    await expectUnavailable(menu, 'Users');
    await expectUnavailable(menu, 'HYDRA Technical');
    await expectLink(menu, 'Crew List', '/v/dra/crew/list');
    expect(anchors(menu)).toEqual(['/v/dra/crew/list', '/me/shortcuts']);
  });

  it('a workspace whose Apps entry the viewer does not get is unavailable; one they get opens', async () => {
    asVesselMaster([DRAAK]);
    // No maintenance access: Apps offers no Yard (D-97). Legal's entry is ungated.
    shellState.perm = { ...shellState.perm, hasPermission: (module: string) => module !== 'maintenance' };
    fakeDb.tables.user_pinned_shortcuts = [pin('/yard/refit/overview/dashboard', 'Refit dashboard', 0), pin('/departments/legal', 'Legal', 1)];
    renderShell(<FavouritesControl />, { path: '/v/dra/crew/list', scope: { scope: 'vessel', vessel: DRAAK, vesselCode: 'DRA' }, access: VESSEL_ONLY_ACCESS });
    const menu = await openMenu();
    await expectUnavailable(menu, 'Refit dashboard');
    await expectLink(menu, 'Legal', '/departments/legal');
  });

  it('a module switched off on a reachable vessel is unavailable (the route gate would show ModuleOff)', async () => {
    fakeDb.tables.vessel_module_settings = [
      { vessel_id: DRAAK.id, module_key: 'technical', enabled: false, enabled_from: null, label_override: null },
    ];
    fakeDb.tables.user_pinned_shortcuts = [pin('/v/dra/technical', 'DRAAK Technical', 0), pin('/v/dra/crew/list', 'Crew List', 1)];
    renderShell(<FavouritesControl />, { path: '/fleet/documents', scope: { scope: 'fleet' } });
    const menu = await openMenu();
    await expectUnavailable(menu, 'DRAAK Technical');
    await expectLink(menu, 'Crew List', '/v/dra/crew/list');
  });

  it('a legacy /crew pin opens (it redirects to the current vessel’s roster, which is on)', async () => {
    fakeDb.tables.user_pinned_shortcuts = [pin('/crew', 'Crew roster', 0), pin('/documents', 'Documents', 1)];
    renderShell(<FavouritesControl />, { path: '/fleet/dashboard', scope: { scope: 'fleet' } });
    const menu = await openMenu();
    await expectLink(menu, 'Crew roster', '/crew');
    await expectLink(menu, 'Documents', '/documents');
  });

  it('Remove on an unavailable pin deletes it and keeps the menu open', async () => {
    asVesselMaster([DRAAK]);
    fakeDb.tables.user_pinned_shortcuts = [pin('/fleet/admin/users', 'Users')];
    renderShell(<FavouritesControl />, { path: '/v/dra/crew/list', scope: { scope: 'vessel', vessel: DRAAK, vesselCode: 'DRA' }, access: VESSEL_ONLY_ACCESS });
    const menu = await openMenu();
    const item = await expectUnavailable(menu, 'Users');
    fakeDb.applyWrites = true;
    fireEvent.click(item);
    await waitFor(() => expect(fakeDb.calls.some((c) => c.op === 'delete')).toBe(true));
    expect(fakeDb.calls.find((c) => c.op === 'delete')?.filters).toEqual([
      ['user_id', 'eq', USER_ID],
      ['shortcut_target', 'eq', '/fleet/admin/users'],
    ]);
    expect(await within(menu).findByText('Star a page to keep it here.')).toBeInTheDocument();
  });

  it('while access loads every pin waits: aria-disabled, no link', async () => {
    asLoading();
    fakeDb.tables.user_pinned_shortcuts = [pin('/fleet/dashboard', 'Fleet dashboard', 0), pin('/me', 'My profile', 1), pin('/v/dra/crew/list', 'Crew List', 2)];
    renderShell(<FavouritesControl />, { path: '/fleet/documents', scope: { scope: 'fleet' }, access: FAIL_CLOSED_NAV_ACCESS });
    const menu = await openMenu();
    for (const label of ['Fleet dashboard', 'My profile', 'Crew List']) {
      const item = await within(menu).findByRole('menuitem', { name: label });
      expect(item).toHaveAttribute('aria-disabled', 'true');
      expect(item.tagName).not.toBe('A');
      expect(item.closest('a')).toBeNull();
      expect(item).not.toHaveAttribute('href');
      expect(item).not.toHaveTextContent('No longer available');
    }
    expect(anchors(menu)).toEqual(['/me/shortcuts']);
  });

  it('a workspace waits for its Apps entry while nav access loads', async () => {
    fakeDb.tables.user_pinned_shortcuts = [pin('/hris/salaries', 'Salaries', 0)];
    renderShell(<FavouritesControl />, { path: '/fleet/documents', scope: { scope: 'fleet' }, access: FAIL_CLOSED_NAV_ACCESS });
    const menu = await openMenu();
    const item = await within(menu).findByRole('menuitem', { name: 'Salaries' });
    expect(item).toHaveAttribute('aria-disabled', 'true');
    expect(item).not.toHaveAttribute('href');
  });
});
