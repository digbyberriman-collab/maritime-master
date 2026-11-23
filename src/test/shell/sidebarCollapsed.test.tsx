/**
 * The sidebar's icon-only state (gap/10 IA20; spec §4.5): the device value
 * wins once set; with nothing stored the profile's
 * `user_preferences.sidebar_collapsed` is adopted once; a toggle writes both,
 * and a failed mirror keeps the device value (best effort, no notice).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

vi.mock('@/integrations/supabase/client', async () => (await import('./fakeSupabase')).fakeSupabaseModule);
vi.mock('@/modules/auth/contexts/AuthContext', async () => {
  const { shellState } = await import('./shellFakes');
  return { useAuth: () => shellState.auth };
});

import { SIDEBAR_COLLAPSED_KEY, useSidebarCollapsed } from '@/app/shell/sidebarCollapsed';
import { fakeDb, resetFakeDb } from './fakeSupabase';
import { USER_ID, resetShellState, shellState } from './shellFakes';

const prefReads = () => fakeDb.calls.filter((c) => c.table === 'user_preferences' && c.op === 'select');
const prefWrites = () => fakeDb.calls.filter((c) => c.table === 'user_preferences' && c.op === 'upsert');

beforeEach(() => {
  localStorage.clear();
  resetFakeDb();
  resetShellState();
});

describe('useSidebarCollapsed', () => {
  it('the device value wins once set: the profile is not even read', async () => {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, 'true');
    fakeDb.tables.user_preferences = [{ user_id: USER_ID, sidebar_collapsed: false }];
    const { result } = renderHook(() => useSidebarCollapsed());
    expect(result.current.collapsed).toBe(true);
    await act(async () => {});
    expect(prefReads()).toEqual([]);
    expect(result.current.collapsed).toBe(true);
  });

  it('with nothing stored, adopts the profile’s value once and keeps it on the device', async () => {
    fakeDb.tables.user_preferences = [{ user_id: USER_ID, sidebar_collapsed: true }];
    const { result, rerender } = renderHook(() => useSidebarCollapsed());
    expect(result.current.collapsed).toBe(false);
    await waitFor(() => expect(result.current.collapsed).toBe(true));
    expect(localStorage.getItem(SIDEBAR_COLLAPSED_KEY)).toBe('true');
    rerender();
    expect(prefReads()).toHaveLength(1);
    expect(prefReads()[0].filters).toEqual([['user_id', 'eq', USER_ID]]);
  });

  it('a toggle while the profile read is in flight wins over the profile', async () => {
    vi.useFakeTimers();
    try {
      fakeDb.delayMs = 30;
      fakeDb.tables.user_preferences = [{ user_id: USER_ID, sidebar_collapsed: false }];
      const { result } = renderHook(() => useSidebarCollapsed());
      // The read has started and has not come back yet.
      expect(prefReads()).toHaveLength(1);
      act(() => result.current.toggle());
      expect(result.current.collapsed).toBe(true);
      // Let the read come back and the hook handle it, then check it lost.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(fakeDb.delayMs);
      });
      expect(result.current.collapsed).toBe(true);
      expect(localStorage.getItem(SIDEBAR_COLLAPSED_KEY)).toBe('true');
    } finally {
      vi.useRealTimers();
    }
  });

  it('a toggle writes the device value and mirrors it to the profile', async () => {
    const { result } = renderHook(() => useSidebarCollapsed());
    act(() => result.current.toggle());
    expect(result.current.collapsed).toBe(true);
    expect(localStorage.getItem(SIDEBAR_COLLAPSED_KEY)).toBe('true');
    await waitFor(() => expect(prefWrites()).toHaveLength(1));
    expect(prefWrites()[0].payload).toMatchObject({ user_id: USER_ID, sidebar_collapsed: true });
    expect(prefWrites()[0].options).toEqual({ onConflict: 'user_id' });
    act(() => result.current.toggle());
    expect(localStorage.getItem(SIDEBAR_COLLAPSED_KEY)).toBe('false');
    await waitFor(() => expect(prefWrites()).toHaveLength(2));
  });

  it('a failed mirror keeps the device value', async () => {
    fakeDb.writeFailures.user_preferences = { message: 'permission denied', code: '42501' };
    const { result } = renderHook(() => useSidebarCollapsed());
    act(() => result.current.toggle());
    await waitFor(() => expect(prefWrites()).toHaveLength(1));
    expect(result.current.collapsed).toBe(true);
    expect(localStorage.getItem(SIDEBAR_COLLAPSED_KEY)).toBe('true');
  });

  it('signed out: device only', async () => {
    shellState.auth.user = null;
    const { result } = renderHook(() => useSidebarCollapsed());
    act(() => result.current.toggle());
    await act(async () => {});
    expect(fakeDb.calls).toEqual([]);
    expect(localStorage.getItem(SIDEBAR_COLLAPSED_KEY)).toBe('true');
  });
});
