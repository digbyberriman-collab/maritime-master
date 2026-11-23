/**
 * Manage favourites against the (fake) table, with the real hooks (D-68,
 * D-04, D-107): when `user_pinned_shortcuts` fails the page says so with
 * Retry, never "Star a page…"; Retry re-reads; Remove deletes the pin and the
 * row leaves only once the list is read again.
 */
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';

vi.mock('@/integrations/supabase/client', async () => (await import('../shell/fakeSupabase')).fakeSupabaseModule);
vi.mock('@/modules/auth/contexts/AuthContext', async () => {
  const { shellState } = await import('../shell/shellFakes');
  return { useAuth: () => shellState.auth };
});
vi.mock('@/modules/vessels/contexts/VesselContext', async () => {
  const { shellState } = await import('../shell/shellFakes');
  return { useVessel: () => shellState.vessel };
});
vi.mock('@/modules/auth/store/permissionsStore', async () => {
  const { shellState } = await import('../shell/shellFakes');
  return { usePermissionsStore: (selector: (s: object) => unknown) => selector(shellState.perm) };
});

import ShortcutsSection from '@/modules/settings/components/sections/ShortcutsSection';
import { fakeDb, resetFakeDb } from '../shell/fakeSupabase';
import { USER_ID, renderShell, resetShellState } from '../shell/shellFakes';

const pin = (target: string, label: string, sort = 0) => ({
  id: `pin-${label}`,
  user_id: USER_ID,
  shortcut_target: target,
  shortcut_label: label,
  shortcut_icon: 'ship',
  sort_order: sort,
});

beforeEach(() => {
  resetFakeDb();
  resetShellState();
});

describe('Manage favourites, live', () => {
  it('a failed read is an alert with Retry, not the empty list; Retry shows the pins', async () => {
    fakeDb.failures.user_pinned_shortcuts = { message: 'relation unavailable', code: '503' };
    fakeDb.tables.user_pinned_shortcuts = [pin('/fleet/dashboard', 'Fleet dashboard')];
    renderShell(<ShortcutsSection />, { path: '/me/shortcuts', scope: { scope: 'personal' } });
    expect(await screen.findByRole('alert')).toHaveTextContent('Favourites could not load.');
    expect(screen.queryByText('Star a page to keep it here.')).toBeNull();
    expect(screen.queryByRole('list')).toBeNull();

    fakeDb.failures.user_pinned_shortcuts = undefined;
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    const list = await screen.findByRole('list', { name: 'Favourites' });
    await waitFor(() => expect(within(list).getByRole('link', { name: 'Fleet dashboard' })).toHaveAttribute('href', '/fleet/dashboard'));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('Remove deletes the pin; the row leaves when the list is read again', async () => {
    fakeDb.tables.user_pinned_shortcuts = [pin('/fleet/dashboard', 'Fleet dashboard', 0), pin('/me', 'My profile', 1)];
    renderShell(<ShortcutsSection />, { path: '/me/shortcuts', scope: { scope: 'personal' } });
    const remove = await screen.findByRole('button', { name: 'Remove Fleet dashboard from favourites' });
    fakeDb.applyWrites = true;
    fireEvent.click(remove);
    await waitFor(() => expect(fakeDb.calls.some((c) => c.table === 'user_pinned_shortcuts' && c.op === 'delete')).toBe(true));
    expect(fakeDb.calls.filter((c) => c.op === 'delete')).toHaveLength(1);
    expect(fakeDb.calls.find((c) => c.op === 'delete')?.filters).toEqual([
      ['user_id', 'eq', USER_ID],
      ['shortcut_target', 'eq', '/fleet/dashboard'],
    ]);
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Fleet dashboard' })).toBeNull());
    expect(screen.getByRole('link', { name: 'My profile' })).toHaveAttribute('href', '/me');
  });
});
