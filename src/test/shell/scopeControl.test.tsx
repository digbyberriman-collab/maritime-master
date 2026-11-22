/**
 * The scope control (gap/10 top bar element 2, IA3, W2; spec §6.1): its five
 * states, the workspace chip, the Fleet counterpart (used only when visible),
 * the vessel segment going through the vessel switch, the AIS mark by shape
 * (D-22) and the compliance dot from the one alert tone map (D-57). Loading
 * and errors show no mark and no dot, never a reassuring one.
 */
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';

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

import ScopeControl from '@/shared/components/layout/topbar/ScopeControl';
import { SHELL_TEST_IDS } from '@/app/shell/testIds';
import { readRecentVessels, recordRecentVessel } from '@/app/nav/recentVessels';
import { fakeDb, resetFakeDb } from './fakeSupabase';
import {
  COMPANY_ID,
  DRAAK,
  FAIL_CLOSED_NAV_ACCESS,
  FLEET_ACCESS,
  HYDRA,
  USER_ID,
  VESSEL_ONLY_ACCESS,
  XIPHIAS,
  asFleetUser,
  asLoading,
  asVesselMaster,
  renderShell,
  resetShellState,
} from './shellFakes';

const vesselScope = { scope: 'vessel' as const, vessel: DRAAK, vesselCode: 'DRA' };
const location = () => screen.getByTestId('location').textContent;
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
const fix = (vesselId: string, navStatus: string | null, at = minutesAgo(10), cog: number | null = 45) => ({
  vessel_id: vesselId,
  latitude: 43.7,
  longitude: 7.4,
  sog: 8,
  cog,
  heading: null,
  nav_status: navStatus,
  timestamp_utc: at,
});
const alert = (vesselId: string, severity: string) => ({ vessel_id: vesselId, severity_color: severity, status: 'OPEN', company_id: COMPANY_ID });

beforeEach(() => {
  localStorage.clear();
  resetFakeDb();
  resetShellState();
});

describe('the five states (fail closed)', () => {
  it('fleet reach and several vessels: Fleet, the vessel and the switcher chevron', async () => {
    renderShell(<ScopeControl />, { path: '/v/dra', scope: vesselScope, access: FLEET_ACCESS });
    expect(await screen.findByTestId(SHELL_TEST_IDS.scopeFleet)).toBeInTheDocument();
    expect(screen.getByTestId(SHELL_TEST_IDS.scopeVessel)).toHaveTextContent('DRAAK');
    expect(screen.getByTestId(SHELL_TEST_IDS.vesselSwitcherTrigger)).toHaveAccessibleName('Switch vessel');
    expect(screen.getByTestId(SHELL_TEST_IDS.scopeVessel)).toHaveAttribute('aria-current', 'true');
    expect(screen.getByTestId(SHELL_TEST_IDS.scopeFleet)).not.toHaveAttribute('aria-current');
  });

  it('fleet reach and one vessel: both segments, no chevron', async () => {
    asFleetUser([DRAAK]);
    renderShell(<ScopeControl />, { path: '/fleet/dashboard', scope: { scope: 'fleet' }, access: FLEET_ACCESS });
    expect(await screen.findByTestId(SHELL_TEST_IDS.scopeFleet)).toHaveAttribute('aria-current', 'true');
    expect(screen.getByTestId(SHELL_TEST_IDS.scopeVessel)).toBeInTheDocument();
    expect(screen.queryByTestId(SHELL_TEST_IDS.vesselSwitcherTrigger)).toBeNull();
  });

  it('fleet reach and no vessel: the Fleet segment only', async () => {
    asFleetUser([]);
    renderShell(<ScopeControl />, { path: '/fleet/dashboard', scope: { scope: 'fleet' }, access: { ...FLEET_ACCESS, vesselReach: false } });
    expect(await screen.findByTestId(SHELL_TEST_IDS.scopeFleet)).toBeInTheDocument();
    expect(screen.queryByTestId(SHELL_TEST_IDS.scopeVessel)).toBeNull();
  });

  it('no fleet reach and two vessels: the vessel and its chevron, no Fleet', async () => {
    asVesselMaster([DRAAK, HYDRA]);
    renderShell(<ScopeControl />, { path: '/v/dra', scope: vesselScope, access: VESSEL_ONLY_ACCESS });
    expect(await screen.findByTestId(SHELL_TEST_IDS.scopeVessel)).toBeInTheDocument();
    expect(screen.getByTestId(SHELL_TEST_IDS.vesselSwitcherTrigger)).toBeInTheDocument();
    expect(screen.queryByTestId(SHELL_TEST_IDS.scopeFleet)).toBeNull();
  });

  it('no fleet reach and one vessel: a plain label without control chrome', async () => {
    asVesselMaster([DRAAK]);
    renderShell(<ScopeControl />, { path: '/v/dra', scope: vesselScope, access: VESSEL_ONLY_ACCESS });
    const label = await screen.findByTestId(SHELL_TEST_IDS.scopeVessel);
    expect(label.tagName).toBe('SPAN');
    expect(screen.queryByRole('group', { name: 'Scope' })).toBeNull();
    expect(screen.queryByTestId(SHELL_TEST_IDS.vesselSwitcherTrigger)).toBeNull();
  });

  it('neither fleet nor vessel reach: nothing', async () => {
    asVesselMaster([]);
    renderShell(<ScopeControl />, { path: '/me', scope: { scope: 'personal' }, access: { ...VESSEL_ONLY_ACCESS, vesselReach: false } });
    await waitFor(() => expect(screen.queryByTestId(SHELL_TEST_IDS.scopeControl)).toBeNull());
    expect(screen.queryByTestId(SHELL_TEST_IDS.scopeFleet)).toBeNull();
  });

  it('a skeleton while access loads, with neither segment', () => {
    asLoading();
    renderShell(<ScopeControl />, { path: '/v/dra', scope: vesselScope, access: FAIL_CLOSED_NAV_ACCESS });
    expect(screen.getByTestId(SHELL_TEST_IDS.scopeControl)).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByTestId(SHELL_TEST_IDS.scopeFleet)).toBeNull();
    expect(screen.queryByTestId(SHELL_TEST_IDS.scopeVessel)).toBeNull();
  });
});

describe('workspace chip', () => {
  it('names the workspace and lights neither segment', async () => {
    renderShell(<ScopeControl />, { path: '/hris/people', scope: { scope: 'workspace', workspace: 'hris' }, access: FLEET_ACCESS });
    expect(await screen.findByTestId(SHELL_TEST_IDS.scopeWorkspaceChip)).toHaveTextContent('HRIS');
    expect(screen.getByTestId(SHELL_TEST_IDS.scopeFleet)).not.toHaveAttribute('aria-current');
    expect(screen.getByTestId(SHELL_TEST_IDS.scopeVessel)).not.toHaveAttribute('aria-current');
  });

  it('is absent outside a workspace', async () => {
    renderShell(<ScopeControl />, { path: '/fleet/dashboard', scope: { scope: 'fleet' }, access: FLEET_ACCESS });
    await screen.findByTestId(SHELL_TEST_IDS.scopeFleet);
    expect(screen.queryByTestId(SHELL_TEST_IDS.scopeWorkspaceChip)).toBeNull();
  });
});

describe('the Fleet segment target', () => {
  it.each([
    ['/v/dra/crew/training/records', '/fleet/training'],
    ['/v/dra/calendar', '/fleet/calendar'],
    ['/v/dra', '/fleet/dashboard'],
    // Fleet › Medical is planned (hidden): its counterpart falls back to the dashboard.
    ['/v/dra/crew/medical', '/fleet/dashboard'],
    // No counterpart.
    ['/v/dra/logbooks', '/fleet/dashboard'],
  ])('from %s goes to %s', async (path, target) => {
    renderShell(<ScopeControl />, { path, scope: vesselScope, access: FLEET_ACCESS });
    expect(await screen.findByTestId(SHELL_TEST_IDS.scopeFleet)).toHaveAttribute('href', target);
  });

  it('never uses a counterpart the user cannot see', async () => {
    renderShell(<ScopeControl />, { path: '/v/dra/crew/training', scope: vesselScope, access: { ...FLEET_ACCESS, can: () => false } });
    // Training is live and ungated: still visible without capabilities.
    expect(await screen.findByTestId(SHELL_TEST_IDS.scopeFleet)).toHaveAttribute('href', '/fleet/training');
  });
});

describe('the vessel segment', () => {
  it('outside the vessel scope names the vessel opened last on this device', async () => {
    recordRecentVessel(USER_ID, HYDRA.id);
    renderShell(<ScopeControl />, { path: '/fleet/dashboard', scope: { scope: 'fleet' }, access: FLEET_ACCESS });
    expect(await screen.findByTestId(SHELL_TEST_IDS.scopeVessel)).toHaveTextContent('HYDRA');
  });

  it('falls back to the selected vessel when nothing was opened yet', async () => {
    renderShell(<ScopeControl />, { path: '/fleet/dashboard', scope: { scope: 'fleet' }, access: FLEET_ACCESS });
    expect(await screen.findByTestId(SHELL_TEST_IDS.scopeVessel)).toHaveTextContent('DRAAK');
  });

  it('opens the vessel through the vessel switch from a Fleet page (counterpart, recent list)', async () => {
    renderShell(<ScopeControl />, { path: '/fleet/training', scope: { scope: 'fleet' }, access: FLEET_ACCESS });
    fireEvent.click(await screen.findByTestId(SHELL_TEST_IDS.scopeVessel));
    await waitFor(() => expect(location()).toBe('/v/dra/crew/training'));
    expect(readRecentVessels(USER_ID)[0]).toBe(DRAAK.id);
  });

  it('opens the vessel home from a workspace page', async () => {
    renderShell(<ScopeControl />, { path: '/hris/people', scope: { scope: 'workspace', workspace: 'hris' }, access: FLEET_ACCESS });
    fireEvent.click(await screen.findByTestId(SHELL_TEST_IDS.scopeVessel));
    await waitFor(() => expect(location()).toBe('/v/dra'));
  });

  it("inside the vessel scope goes to that vessel's home", async () => {
    renderShell(<ScopeControl />, { path: '/v/dra/crew/list', scope: vesselScope, access: FLEET_ACCESS });
    fireEvent.click(await screen.findByTestId(SHELL_TEST_IDS.scopeVessel));
    await waitFor(() => expect(location()).toBe('/v/dra'));
  });
});

describe('AIS mark (D-22)', () => {
  const mark = async () => {
    renderShell(<ScopeControl />, { path: '/v/dra', scope: vesselScope, access: FLEET_ACCESS });
    const segment = await screen.findByTestId(SHELL_TEST_IDS.scopeVessel);
    return segment;
  };

  it.each([
    ['0', 'under_way', 'Under way'],
    ['5', 'moored', 'Moored'],
    ['1', 'at_anchor', 'At anchor'],
    ['restricted manoeuvrability', 'unknown', 'Status unknown'],
  ])('nav status %s → %s', async (status, kind, label) => {
    fakeDb.tables.ais_snapshots = [fix(DRAAK.id, status)];
    const segment = await mark();
    await waitFor(() => expect(segment.querySelector(`[data-ais="${kind}"]`)).not.toBeNull());
    expect(within(segment).getByText(new RegExp(`^${label}, fix`))).toHaveClass('sr-only');
    if (kind === 'under_way') expect(segment.querySelector('[data-ais] svg')).toHaveClass('text-primary');
  });

  it('a fix older than six hours is hollow: no recent position', async () => {
    fakeDb.tables.ais_snapshots = [fix(DRAAK.id, '0', minutesAgo(7 * 60))];
    const segment = await mark();
    await waitFor(() => expect(segment.querySelector('[data-ais="stale"]')).not.toBeNull());
    expect(segment.querySelector('[data-ais="stale"] span')).toHaveClass('border');
    expect(within(segment).getByText(/^No recent position/)).toBeInTheDocument();
  });

  it('no fix at all reads as no recent position, not as moored', async () => {
    fakeDb.tables.ais_snapshots = [];
    const segment = await mark();
    await waitFor(() => expect(segment.querySelector('[data-ais="stale"]')).not.toBeNull());
  });

  it('shows no mark while positions fail to load', async () => {
    fakeDb.failures.ais_snapshots = { message: 'network down' };
    const segment = await mark();
    // Let the failed request settle.
    await new Promise((r) => setTimeout(r, 20));
    expect(segment.querySelector('[data-ais]')).toBeNull();
  });

  it('shows no mark while positions load', async () => {
    fakeDb.delayMs = 10_000;
    const segment = await mark();
    expect(segment.querySelector('[data-ais]')).toBeNull();
  });
});

describe('compliance dot (D-57)', () => {
  it('takes the worst open alert tone from ALERT_SEVERITY_TONE', async () => {
    fakeDb.tables.alerts = [alert(DRAAK.id, 'YELLOW'), alert(DRAAK.id, 'RED'), alert(HYDRA.id, 'GREEN')];
    renderShell(<ScopeControl />, { path: '/v/dra', scope: vesselScope, access: FLEET_ACCESS });
    const segment = await screen.findByTestId(SHELL_TEST_IDS.scopeVessel);
    await waitFor(() => expect(segment.querySelector('[data-compliance="RED"]')).not.toBeNull());
    const dot = segment.querySelector('[data-compliance] > span[aria-hidden]');
    expect(dot).toHaveClass('bg-current', 'text-destructive', 'rounded-full');
    expect(within(segment).getByText('2 open alerts, worst red')).toHaveClass('sr-only');
    const request = fakeDb.calls.find((c) => c.table === 'alerts');
    expect(request?.filters).toEqual(
      expect.arrayContaining([
        ['company_id', 'eq', COMPANY_ID],
        ['status', 'eq', 'OPEN'],
        ['vessel_id', 'in', [DRAAK.id, HYDRA.id, XIPHIAS.id].sort()],
      ]),
    );
  });

  it('no open alert: no dot', async () => {
    fakeDb.tables.alerts = [alert(HYDRA.id, 'RED')];
    renderShell(<ScopeControl />, { path: '/v/dra', scope: vesselScope, access: FLEET_ACCESS });
    const segment = await screen.findByTestId(SHELL_TEST_IDS.scopeVessel);
    await new Promise((r) => setTimeout(r, 20));
    expect(segment.querySelector('[data-compliance]')).toBeNull();
    expect(within(segment).queryByText(/alert/)).toBeNull();
  });

  it('an alerts error: no dot (never a reassuring one)', async () => {
    fakeDb.failures.alerts = { message: 'permission denied' };
    renderShell(<ScopeControl />, { path: '/v/dra', scope: vesselScope, access: FLEET_ACCESS });
    const segment = await screen.findByTestId(SHELL_TEST_IDS.scopeVessel);
    await new Promise((r) => setTimeout(r, 20));
    expect(segment.querySelector('[data-compliance]')).toBeNull();
  });

  it('a summary cut at the row cap says so for a vessel missing from it', async () => {
    fakeDb.tables.alerts = Array.from({ length: 1000 }, () => alert(HYDRA.id, 'ORANGE'));
    renderShell(<ScopeControl />, { path: '/v/dra', scope: vesselScope, access: FLEET_ACCESS });
    const segment = await screen.findByTestId(SHELL_TEST_IDS.scopeVessel);
    expect(await within(segment).findByText('Alert summary incomplete')).toHaveClass('sr-only');
    expect(segment.querySelector('[data-compliance]')).toBeNull();
  });
});
