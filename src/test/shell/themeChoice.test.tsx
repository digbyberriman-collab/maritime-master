/**
 * Theme from the account menu and the palette (gap/10 W1, D-19; spec §6.6):
 * the choice applies on this device at once and is mirrored to
 * `user_preferences.theme` for the signed-in user. A failed mirror says so
 * and keeps the device theme; signed out, nothing is written.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

const state = vi.hoisted(() => ({
  user: { id: 'u-officer' } as { id: string } | null,
  theme: 'dark',
  setTheme: (() => undefined) as (next: string) => void,
}));

vi.mock('@/integrations/supabase/client', async () => (await import('./fakeSupabase')).fakeSupabaseModule);
vi.mock('@/modules/auth/contexts/AuthContext', () => ({ useAuth: () => ({ user: state.user }) }));
vi.mock('next-themes', () => ({ useTheme: () => ({ theme: state.theme, setTheme: state.setTheme }) }));

import { useThemeChoice } from '@/app/shell/themeChoice';
import { notify } from '@/shared/lib/notify';
import { fakeDb, resetFakeDb } from './fakeSupabase';

describe('useThemeChoice', () => {
  beforeEach(() => {
    resetFakeDb();
    state.user = { id: 'u-officer' };
    state.theme = 'dark';
    state.setTheme = vi.fn();
    vi.restoreAllMocks();
  });

  it('reports the stored choice, and null before next-themes knows it', () => {
    const { result, rerender } = renderHook(() => useThemeChoice());
    expect(result.current.theme).toBe('dark');
    state.theme = undefined as unknown as string;
    rerender();
    expect(result.current.theme).toBeNull();
  });

  it('applies the theme at once and mirrors it to user_preferences for the signed-in user', async () => {
    const { result } = renderHook(() => useThemeChoice());
    let pending: Promise<void> | undefined;
    act(() => {
      pending = result.current.choose('light');
    });
    // On the device before the write has answered.
    expect(state.setTheme).toHaveBeenCalledWith('light');
    await act(async () => {
      await pending;
    });
    const write = fakeDb.calls.find((c) => c.table === 'user_preferences');
    expect(write?.op).toBe('upsert');
    expect(write?.payload).toMatchObject({ user_id: 'u-officer', theme: 'light' });
    expect(write?.options).toEqual({ onConflict: 'user_id' });
  });

  it('keeps the device theme and says so when the mirror fails', async () => {
    fakeDb.failures.user_preferences = { message: 'permission denied' };
    const error = vi.spyOn(notify, 'error').mockImplementation(() => 1);
    const { result } = renderHook(() => useThemeChoice());
    await act(async () => {
      await result.current.choose('system');
    });
    expect(state.setTheme).toHaveBeenCalledTimes(1);
    expect(state.setTheme).toHaveBeenCalledWith('system');
    expect(error).toHaveBeenCalledWith(expect.objectContaining({ message: 'permission denied' }), expect.objectContaining({ title: 'Theme applied on this device only' }));
  });

  it('writes nothing when nobody is signed in', async () => {
    state.user = null;
    const { result } = renderHook(() => useThemeChoice());
    await act(async () => {
      await result.current.choose('dark');
    });
    expect(state.setTheme).toHaveBeenCalledWith('dark');
    expect(fakeDb.calls).toEqual([]);
  });
});
