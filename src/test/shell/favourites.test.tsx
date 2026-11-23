/**
 * Favourites links (gap/10 top bar element 6, IA13; spec §6.4; D-04): only
 * in-app paths become links; anything else (`javascript:`, protocol-relative
 * `//host`, `/\host`) is listed as "Not a page in STORM" with Remove, and the
 * star never saves such a target. On a vessel page whose vessel has not
 * resolved, there is no page to pin: the star is not shown.
 */
import React from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
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

import FavouritesControl from '@/shared/components/layout/topbar/FavouritesControl';
import { isInAppPath, usePinnedShortcuts } from '@/shared/hooks/usePinnedShortcuts';
import { SHELL_TEST_IDS } from '@/app/shell/testIds';
import { fakeDb, resetFakeDb } from './fakeSupabase';
import { USER_ID, renderShell, resetShellState } from './shellFakes';

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
