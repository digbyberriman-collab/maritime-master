/**
 * Density and Show roadmap follow the account once
 * `user_preferences.density` / `.show_roadmap` are live (DECISIONS D-19,
 * D-29, D-69; Phase 2 spec §B.5):
 * - the device value wins once set (the server value is read but not used);
 * - a device with nothing stored adopts an explicit server value, without
 *   writing it back;
 * - null on the server changes nothing;
 * - every change applies on the device and is mirrored; a failed mirror
 *   shows a notice and keeps the device value;
 * - columns missing (D-01): device only, no notice, today's copy;
 * - columns present: Appearance says the choice follows the account.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';

type Reply = { data?: unknown; error: unknown };
const h = vi.hoisted(() => ({
  /** What a `user_preferences` read answers. */
  read: { data: null, error: null } as { data?: unknown; error: unknown },
  /** What a `user_preferences` upsert answers. */
  write: { error: null } as { data?: unknown; error: unknown },
  reads: [] as { columns: string; filters: [string, unknown][] }[],
  writes: [] as { row: Record<string, unknown>; options: unknown }[],
  /** Holds the next read until released. */
  hold: null as Promise<void> | null,
  notifyError: vi.fn(),
  user: { id: 'user-1' } as { id: string } | null,
}));

vi.mock('@/integrations/supabase/client', () => {
  const from = (table: string) => {
    const call = { columns: '', filters: [] as [string, unknown][] };
    const chain = {
      select: (columns: string) => {
        call.columns = columns;
        if (table === 'user_preferences') h.reads.push(call);
        return chain;
      },
      eq: (k: string, v: unknown) => {
        call.filters.push([k, v]);
        return chain;
      },
      neq: () => chain,
      order: () => Promise.resolve({ data: [], error: null }),
      maybeSingle: () => {
        const hold = h.hold;
        const answer = () => (table === 'user_preferences' ? h.read : { data: null, error: null });
        return hold ? hold.then(answer) : Promise.resolve(answer());
      },
      upsert: (row: Record<string, unknown>, options: unknown) => {
        h.writes.push({ row, options });
        return Promise.resolve<Reply>(h.write);
      },
    };
    return chain;
  };
  return { supabase: { from } };
});
vi.mock('@/shared/lib/notify', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/lib/notify')>();
  return { ...actual, notify: { ...actual.notify, error: h.notifyError } };
});
vi.mock('@/modules/auth/contexts/AuthContext', () => ({
  useAuth: () => ({ user: h.user, profile: h.user ? { company_id: 'company-1' } : null, loading: false, profileResolved: true }),
}));
vi.mock('@/shared/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

import { fetchUiPreferences, saveUiPreference, uiPreferenceKeys } from '@/modules/settings/services/uiPreferences';
import { getUiPreferenceSync, mirrorUiPreference, resetUiPreferenceSyncForTests, syncUiPreferences } from '@/app/shell/uiPreferenceSync';
import { DEVICE_ADOPTERS, useUiPreferenceSync } from '@/app/shell/useUiPreferenceSync';
import { DENSITY_STORAGE_KEY, getDensity } from '@/components/ui/theme-config';
import { useDensity } from '@/components/ui/use-density';
import { SHOW_ROADMAP_CHOSEN_KEY, SHOW_ROADMAP_KEY, hasStoredShowRoadmapChoice, readShowRoadmap, useShowRoadmapPreference } from '@/app/nav/roadmap';
import { ThemeProvider } from '@/components/ui/theme-provider';
import AppearanceSection from '@/modules/settings/components/sections/AppearanceSection';

const MISSING_COLUMN = { code: '42703', message: 'column user_preferences.density does not exist' };
const MISSING_COLUMN_WRITE = { code: 'PGRST204', message: "Could not find the 'density' column of 'user_preferences' in the schema cache" };
const SERVER_ERROR = { code: '500', message: 'Internal Server Error' };

const root = () => document.documentElement;
const sync = (userId: string | null = 'user-1') => syncUiPreferences(userId, DEVICE_ADOPTERS);

beforeEach(() => {
  localStorage.clear();
  root().removeAttribute('data-density');
  h.read = { data: null, error: null };
  h.write = { error: null };
  h.reads.length = 0;
  h.writes.length = 0;
  h.hold = null;
  h.user = { id: 'user-1' };
  h.notifyError.mockReset();
  resetUiPreferenceSyncForTests();
});

afterEach(() => {
  resetUiPreferenceSyncForTests();
});

describe('the service (fetchUiPreferences / saveUiPreference)', () => {
  it('reads density and show_roadmap of the user only', async () => {
    h.read = { data: { density: 'compact', show_roadmap: true }, error: null };
    await expect(fetchUiPreferences('user-1')).resolves.toEqual({ source: 'columns', density: 'compact', showRoadmap: true });
    expect(h.reads[0]).toEqual({ columns: 'density, show_roadmap', filters: [['user_id', 'user-1']] });
    expect(uiPreferenceKeys.user('user-1')).toEqual(['ui-preferences', 'user-1']);
  });

  it('no row, nulls, or a value outside the vocabulary: never chosen', async () => {
    await expect(fetchUiPreferences('user-1')).resolves.toEqual({ source: 'columns', density: null, showRoadmap: null });
    h.read = { data: { density: 'huge', show_roadmap: 'yes' }, error: null };
    await expect(fetchUiPreferences('user-1')).resolves.toEqual({ source: 'columns', density: null, showRoadmap: null });
  });

  it('missing columns (42703 / PGRST204) read as "not live yet"; any other error is thrown', async () => {
    h.read = { data: null, error: MISSING_COLUMN };
    await expect(fetchUiPreferences('user-1')).resolves.toEqual({ source: 'columns-missing', density: null, showRoadmap: null });
    h.read = { data: null, error: SERVER_ERROR };
    await expect(fetchUiPreferences('user-1')).rejects.toBe(SERVER_ERROR);
  });

  it('a save upserts on user_id and reports missing columns and errors honestly', async () => {
    await expect(saveUiPreference('user-1', { density: 'compact' })).resolves.toEqual({ ok: true });
    expect(h.writes[0]).toEqual({ row: { user_id: 'user-1', density: 'compact' }, options: { onConflict: 'user_id' } });
    h.write = { error: MISSING_COLUMN_WRITE };
    await expect(saveUiPreference('user-1', { show_roadmap: true })).resolves.toEqual({ ok: false, reason: 'columns-missing' });
    h.write = { error: SERVER_ERROR };
    await expect(saveUiPreference('user-1', { density: 'default' })).resolves.toEqual({ ok: false, reason: 'error', error: SERVER_ERROR });
  });
});

describe('adoption on sign-in (D-19)', () => {
  it('a device with no density adopts the account\'s explicit value, without writing it back', async () => {
    h.read = { data: { density: 'compact', show_roadmap: null }, error: null };
    await sync();
    expect(root().getAttribute('data-density')).toBe('compact');
    expect(localStorage.getItem(DENSITY_STORAGE_KEY)).toBe('compact');
    expect(getUiPreferenceSync()).toEqual({ userId: 'user-1', columns: 'present' });
    expect(h.writes).toEqual([]);
  });

  it('the device value wins once set', async () => {
    localStorage.setItem(DENSITY_STORAGE_KEY, 'comfortable');
    localStorage.setItem(SHOW_ROADMAP_CHOSEN_KEY, '1');
    h.read = { data: { density: 'compact', show_roadmap: true }, error: null };
    await sync();
    expect(localStorage.getItem(DENSITY_STORAGE_KEY)).toBe('comfortable');
    expect(root().getAttribute('data-density')).toBeNull();
    expect(readShowRoadmap()).toBe(false);
    expect(h.writes).toEqual([]);
  });

  it('a device with no Show roadmap choice adopts the account\'s, on or off', async () => {
    h.read = { data: { density: null, show_roadmap: true }, error: null };
    await sync();
    expect(readShowRoadmap()).toBe(true);
    expect(hasStoredShowRoadmapChoice()).toBe(true);

    resetUiPreferenceSyncForTests();
    localStorage.clear();
    localStorage.setItem(SHOW_ROADMAP_KEY, 'true');
    h.read = { data: { density: null, show_roadmap: false }, error: null };
    await sync();
    // On is a stored device choice: it wins.
    expect(readShowRoadmap()).toBe(true);
  });

  it('null on the server changes nothing', async () => {
    h.read = { data: { density: null, show_roadmap: null }, error: null };
    await sync();
    expect(localStorage.getItem(DENSITY_STORAGE_KEY)).toBeNull();
    expect(hasStoredShowRoadmapChoice()).toBe(false);
    expect(getUiPreferenceSync().columns).toBe('present');
  });

  it('columns missing: device only (no adoption, no error)', async () => {
    h.read = { data: null, error: MISSING_COLUMN };
    await sync();
    expect(getUiPreferenceSync()).toEqual({ userId: 'user-1', columns: 'missing' });
    expect(localStorage.getItem(DENSITY_STORAGE_KEY)).toBeNull();
  });

  it('a failed read leaves the device alone and is retried on the next sync', async () => {
    h.read = { data: null, error: SERVER_ERROR };
    await sync();
    expect(getUiPreferenceSync()).toEqual({ userId: 'user-1', columns: 'error' });
    h.read = { data: { density: 'compact', show_roadmap: null }, error: null };
    await sync();
    expect(getUiPreferenceSync().columns).toBe('present');
    expect(getDensity()).toBe('compact');
  });

  it('reads once per user; a choice made while the read is in flight wins', async () => {
    let release = () => {};
    h.hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    h.read = { data: { density: 'compact', show_roadmap: true }, error: null };
    const pending = sync();
    void sync();
    const { result } = renderHook(() => useDensity());
    act(() => result.current[1]('comfortable'));
    release();
    await pending;
    expect(h.reads).toHaveLength(1);
    expect(localStorage.getItem(DENSITY_STORAGE_KEY)).toBe('comfortable');
    // Show roadmap was not chosen on the device: it is adopted.
    expect(readShowRoadmap()).toBe(true);
  });

  it('a sign-out supersedes a read in flight: nothing lands', async () => {
    let release = () => {};
    h.hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    h.read = { data: { density: 'compact', show_roadmap: true }, error: null };
    const pending = sync('user-1');
    await sync(null);
    release();
    await pending;
    expect(getUiPreferenceSync()).toEqual({ userId: null, columns: 'unknown' });
    expect(localStorage.getItem(DENSITY_STORAGE_KEY)).toBeNull();
  });

  it('useUiPreferenceSync syncs the given user, and signs out with null', async () => {
    h.read = { data: { density: 'compact', show_roadmap: null }, error: null };
    const { rerender } = renderHook(({ id }) => useUiPreferenceSync(id), { initialProps: { id: 'user-1' as string | null } });
    await waitFor(() => expect(getUiPreferenceSync().columns).toBe('present'));
    rerender({ id: null });
    await waitFor(() => expect(getUiPreferenceSync()).toEqual({ userId: null, columns: 'unknown' }));
  });
});

describe('mirroring a change', () => {
  it('density: applies on the device and is mirrored to the account', async () => {
    await sync();
    const { result } = renderHook(() => useDensity());
    act(() => result.current[1]('compact'));
    expect(root().getAttribute('data-density')).toBe('compact');
    await waitFor(() => expect(h.writes).toHaveLength(1));
    expect(h.writes[0].row).toEqual({ user_id: 'user-1', density: 'compact' });
    expect(h.notifyError).not.toHaveBeenCalled();
  });

  it('Show roadmap: stored on the device (on and off) and mirrored', async () => {
    await sync();
    const { result } = renderHook(() => useShowRoadmapPreference());
    act(() => result.current[1](true));
    expect(result.current[0]).toBe(true);
    act(() => result.current[1](false));
    expect(result.current[0]).toBe(false);
    expect(hasStoredShowRoadmapChoice()).toBe(true);
    await waitFor(() => expect(h.writes).toHaveLength(2));
    expect(h.writes.map((w) => w.row)).toEqual([
      { user_id: 'user-1', show_roadmap: true },
      { user_id: 'user-1', show_roadmap: false },
    ]);
  });

  it('a failed mirror shows a notice and keeps the device value', async () => {
    await sync();
    h.write = { error: SERVER_ERROR };
    const { result } = renderHook(() => useDensity());
    act(() => result.current[1]('compact'));
    await waitFor(() => expect(h.notifyError).toHaveBeenCalledTimes(1));
    expect(h.notifyError).toHaveBeenCalledWith(SERVER_ERROR, {
      title: 'Density applied on this device only',
      fallback: 'It could not be saved to your account. Try again later.',
    });
    expect(result.current[0]).toBe('compact');
    expect(localStorage.getItem(DENSITY_STORAGE_KEY)).toBe('compact');

    const roadmap = renderHook(() => useShowRoadmapPreference());
    act(() => roadmap.result.current[1](true));
    await waitFor(() => expect(h.notifyError).toHaveBeenCalledTimes(2));
    expect(h.notifyError.mock.calls[1][1]).toMatchObject({ title: 'Show roadmap applied on this device only' });
    expect(readShowRoadmap()).toBe(true);
  });

  it('columns missing on write: device only, no notice, and later changes do not try again', async () => {
    await sync();
    h.write = { error: MISSING_COLUMN_WRITE };
    await mirrorUiPreference({ density: 'compact' });
    expect(h.notifyError).not.toHaveBeenCalled();
    expect(getUiPreferenceSync().columns).toBe('missing');
    await mirrorUiPreference({ density: 'default' });
    expect(h.writes).toHaveLength(1);
  });

  it('columns known missing from the read: no write at all', async () => {
    h.read = { data: null, error: MISSING_COLUMN };
    await sync();
    const { result } = renderHook(() => useDensity());
    act(() => result.current[1]('compact'));
    await act(async () => {});
    expect(h.writes).toEqual([]);
    expect(getDensity()).toBe('compact');
  });

  it('signed out: device only', async () => {
    const { result } = renderHook(() => useDensity());
    act(() => result.current[1]('compact'));
    await act(async () => {});
    expect(h.writes).toEqual([]);
    expect(localStorage.getItem(DENSITY_STORAGE_KEY)).toBe('compact');
  });
});

describe('Appearance says where density is saved', () => {
  // Appearance's own layout read logs its failure; these tests are about the copy.
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(async () => {
    // Unmount (and let the section's own reads settle) while console.error is
    // still muted, so nothing lands outside act() after the test.
    await act(async () => {});
    cleanup();
    vi.restoreAllMocks();
  });

  const renderAppearance = () =>
    render(
      <ThemeProvider>
        <AppearanceSection />
      </ThemeProvider>,
    );

  it('columns missing: "Saved on this device." (today\'s copy)', async () => {
    h.read = { data: null, error: MISSING_COLUMN };
    renderAppearance();
    await screen.findByRole('radiogroup', { name: 'Density' });
    await waitFor(() => expect(getUiPreferenceSync().columns).toBe('missing'));
    expect(screen.getByText('Row and control sizes. Saved on this device.')).toBeInTheDocument();
  });

  it('columns present: the choice also follows the account', async () => {
    h.read = { data: { density: null, show_roadmap: null }, error: null };
    renderAppearance();
    expect(await screen.findByText('Row and control sizes. Saved on this device and to your account, so a new device starts with it.')).toBeInTheDocument();
  });

  it('a read error keeps the device copy (it is not known to follow the account)', async () => {
    h.read = { data: null, error: SERVER_ERROR };
    renderAppearance();
    await waitFor(() => expect(getUiPreferenceSync().columns).toBe('error'));
    expect(await screen.findByText('Row and control sizes. Saved on this device.')).toBeInTheDocument();
  });

  it('picking a density in Appearance mirrors it', async () => {
    h.read = { data: { density: null, show_roadmap: null }, error: null };
    renderAppearance();
    fireEvent.click(await screen.findByRole('radio', { name: /Compact/ }));
    expect(root().getAttribute('data-density')).toBe('compact');
    await waitFor(() => expect(h.writes.some((w) => w.row.density === 'compact')).toBe(true));
  });
});
