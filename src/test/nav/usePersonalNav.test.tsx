/**
 * Personal Hours of rest follows `crew_hor` (D-109; gap/10 W4, D-04, D-01):
 * the leaf shows only when the setting is on for at least one of the user's
 * reachable vessels, and is hidden while any of their settings loads or has
 * failed. A table that does not exist yet counts as on. The palette's Pages
 * (useVisibleNavLeaves) read the same personal nodes, so they follow.
 *
 * The shell calls the hook on every page, so it fetches those settings only
 * while the personal tree is in use (the personal scope, or the open
 * palette); elsewhere it reads the cache.
 *
 * The real hooks over the shell fakes (in-memory Supabase, auth, vessels,
 * RBAC), as in the shell tests.
 */
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import type { QueryClient } from '@tanstack/react-query';

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

import { anyVesselModuleOn, usePersonalNav } from '@/app/nav/usePersonalNav';
import { INERT_COMMAND_PALETTE } from '@/shared/components/command-palette';
import { CommandPaletteContext } from '@/shared/components/command-palette/context';
import { useVisibleNavLeaves } from '@/app/nav/useVisibleNav';
import type { FilteredNavNode } from '@/app/nav/navTree';
import { vesselModuleSettingsKeys } from '@/modules/vessels/hooks/useVesselModuleSettings';
import { TABLE_MISSING_STATE, type ModuleSettingsState } from '@/modules/vessels/lib/moduleSettings';
import { fakeDb, resetFakeDb } from '../shell/fakeSupabase';
import { DRAAK, HYDRA, asFleetUser, asVesselMaster, renderShell, resetShellState } from '../shell/shellFakes';

const labels = (nodes: readonly FilteredNavNode[]): string[] =>
  nodes.flatMap((n) => (n.children?.length ? labels(n.children) : [n.label]));

const Probe: React.FC = () => {
  const { nodes } = usePersonalNav();
  const palette = useVisibleNavLeaves();
  return (
    <>
      <output data-testid="personal-leaves">{labels(nodes).join('|')}</output>
      <output data-testid="palette-pages">{palette.leaves.map((l) => l.path).join('|')}</output>
    </>
  );
};

/** usePersonalNav alone (useVisibleNavLeaves also reads the current vessel's settings, through useVesselNav). */
const PersonalOnly: React.FC = () => {
  const { nodes } = usePersonalNav();
  return <output data-testid="personal-leaves">{labels(nodes).join('|')}</output>;
};

const personalLeaves = () => (screen.getByTestId('personal-leaves').textContent ?? '').split('|');
const palettePages = () => (screen.getByTestId('palette-pages').textContent ?? '').split('|');

const horOff = (vesselId: string) => ({ vessel_id: vesselId, module_key: 'crew_hor', enabled: false, enabled_from: null, label_override: null });

/** Render, then wait until every vessel's settings read has answered (or failed). */
async function renderSettled(vesselIds: string[]): Promise<QueryClient> {
  const { queryClient } = renderShell(<Probe />, { path: '/me/profile', scope: { scope: 'personal' } });
  await waitFor(
    () => {
      for (const id of vesselIds) {
        const status = queryClient.getQueryState(vesselModuleSettingsKeys.vessel(id))?.status;
        expect(status === 'success' || status === 'error').toBe(true);
      }
    },
    { timeout: 4000 },
  );
  // The user's own, ungated sections show once auth is in.
  await waitFor(() => expect(personalLeaves()).toContain('Training'));
  return queryClient;
}

beforeEach(() => {
  localStorage.clear();
  resetFakeDb();
  resetShellState();
});

describe('the personal Hours of rest leaf', () => {
  it('is hidden when crew_hor is off on the only vessel (sidebar and palette)', async () => {
    asVesselMaster([DRAAK]);
    fakeDb.tables.vessel_module_settings = [horOff(DRAAK.id)];
    await renderSettled([DRAAK.id]);
    expect(personalLeaves()).not.toContain('Hours of rest');
    await waitFor(() => expect(palettePages()).toContain('/me/training'));
    expect(palettePages()).not.toContain('/me/hours-of-rest');
  });

  it('shows when crew_hor is on for the only vessel (no settings row)', async () => {
    asVesselMaster([DRAAK]);
    fakeDb.tables.vessel_module_settings = [];
    await renderSettled([DRAAK.id]);
    await waitFor(() => expect(personalLeaves()).toContain('Hours of rest'));
    await waitFor(() => expect(palettePages()).toContain('/me/hours-of-rest'));
  });

  it('shows when crew_hor is on for one of two vessels', async () => {
    asFleetUser([DRAAK, HYDRA]);
    fakeDb.tables.vessel_module_settings = [horOff(DRAAK.id)];
    await renderSettled([DRAAK.id, HYDRA.id]);
    await waitFor(() => expect(personalLeaves()).toContain('Hours of rest'));
  });

  it('is hidden when crew_hor is off on every vessel', async () => {
    asFleetUser([DRAAK, HYDRA]);
    fakeDb.tables.vessel_module_settings = [horOff(DRAAK.id), horOff(HYDRA.id)];
    await renderSettled([DRAAK.id, HYDRA.id]);
    expect(personalLeaves()).not.toContain('Hours of rest');
  });

  it('is hidden while the settings load', async () => {
    asVesselMaster([DRAAK]);
    fakeDb.delayMs = 60_000;
    const { queryClient } = renderShell(<Probe />, { path: '/me/profile', scope: { scope: 'personal' } });
    await waitFor(() => expect(personalLeaves()).toContain('Training'));
    expect(queryClient.getQueryState(vesselModuleSettingsKeys.vessel(DRAAK.id))?.status).toBe('pending');
    expect(personalLeaves()).not.toContain('Hours of rest');
  });

  it('is hidden when a read fails, even if another vessel has it on', async () => {
    asFleetUser([DRAAK, HYDRA]);
    fakeDb.failures.vessel_module_settings = { code: '57014', message: 'canceling statement due to statement timeout' };
    await renderSettled([DRAAK.id, HYDRA.id]);
    expect(personalLeaves()).not.toContain('Hours of rest');
  });

  it('shows when the settings table does not exist yet (D-01)', async () => {
    asVesselMaster([DRAAK]);
    fakeDb.failures.vessel_module_settings = { code: '42P01', message: 'relation "public.vessel_module_settings" does not exist' };
    await renderSettled([DRAAK.id]);
    await waitFor(() => expect(personalLeaves()).toContain('Hours of rest'));
  });

  it('outside the personal tree it fetches no settings (the shell calls it on every page), but uses cached ones', async () => {
    asVesselMaster([DRAAK]);
    fakeDb.tables.vessel_module_settings = [];
    const first = renderShell(<PersonalOnly />, { path: '/fleet/dashboard', scope: { scope: 'fleet' } });
    await waitFor(() => expect(personalLeaves()).toContain('Training'));
    expect(fakeDb.calls.filter((c) => c.table === 'vessel_module_settings')).toEqual([]);
    expect(personalLeaves()).not.toContain('Hours of rest');
    first.unmount();

    // Once the personal area (or the vessel switch) has read them, other scopes reuse the cache.
    const second = renderShell(<PersonalOnly />, { path: '/me/profile', scope: { scope: 'personal' } });
    await waitFor(() => expect(personalLeaves()).toContain('Hours of rest'));
    const calls = fakeDb.calls.filter((c) => c.table === 'vessel_module_settings').length;
    expect(calls).toBe(1);
    second.unmount();
    renderShell(<PersonalOnly />, { path: '/fleet/dashboard', scope: { scope: 'fleet' }, queryClient: second.queryClient });
    await waitFor(() => expect(personalLeaves()).toContain('Hours of rest'));
    expect(fakeDb.calls.filter((c) => c.table === 'vessel_module_settings').length).toBe(calls);
  });

  it('the open palette (which lists the personal pages in any scope) reads them', async () => {
    asVesselMaster([DRAAK]);
    fakeDb.tables.vessel_module_settings = [];
    renderShell(
      <CommandPaletteContext.Provider value={{ ...INERT_COMMAND_PALETTE, isOpen: true }}>
        <PersonalOnly />
      </CommandPaletteContext.Provider>,
      { path: '/v/dra', scope: { scope: 'vessel', vessel: DRAAK, vesselCode: 'DRA' } },
    );
    await waitFor(() => expect(personalLeaves()).toContain('Hours of rest'));
  });

  it('is hidden with no vessel in reach', async () => {
    asVesselMaster([]);
    renderShell(<Probe />, { path: '/me/profile', scope: { scope: 'personal' } });
    await waitFor(() => expect(personalLeaves()).toContain('Training'));
    expect(personalLeaves()).not.toContain('Hours of rest');
  });
});

describe('anyVesselModuleOn', () => {
  const TODAY = '2026-11-23';
  const ready = (rows: Array<[string, boolean, string | null]>): ModuleSettingsState => ({
    status: 'ready',
    source: 'table',
    settings: new Map(rows.map(([key, enabled, from]) => [key, { moduleKey: key, enabled, enabledFrom: from, labelOverride: null }])),
  });

  it('is off for every key with no vessels, while any loads, and after any error', () => {
    expect(anyVesselModuleOn([], TODAY)('crew_hor')).toBe(false);
    expect(anyVesselModuleOn([ready([]), { status: 'loading' }], TODAY)('crew_hor')).toBe(false);
    expect(anyVesselModuleOn([ready([]), { status: 'error', message: 'x' }], TODAY)('crew_hor')).toBe(false);
  });

  it('is on when one vessel has it on, a missing table included; a future enabled_from is off (D-63)', () => {
    expect(anyVesselModuleOn([ready([['crew_hor', false, null]]), ready([])], TODAY)('crew_hor')).toBe(true);
    expect(anyVesselModuleOn([TABLE_MISSING_STATE], TODAY)('crew_hor')).toBe(true);
    expect(anyVesselModuleOn([ready([['crew_hor', true, '2026-12-01']])], TODAY)('crew_hor')).toBe(false);
    expect(anyVesselModuleOn([ready([['crew_hor', false, null]])], TODAY)('crew_hor')).toBe(false);
  });
});
