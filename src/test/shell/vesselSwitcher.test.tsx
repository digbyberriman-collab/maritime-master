/**
 * The vessel switcher (gap/10 top bar element 3, IA4, IA23; spec §6.2):
 * groups, search by name, code and IMO, "All vessels" for fleet users only,
 * selection through the vessel switch keeping the sub-path and query, alert
 * pills that never show a 0 or a guess, positions requested only while open.
 */
import React from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
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
  FLEET_ACCESS,
  HYDRA,
  USER_ID,
  VESSEL_ONLY_ACCESS,
  XIPHIAS,
  asVesselMaster,
  renderShell,
  resetShellState,
} from './shellFakes';

beforeAll(() => {
  // cmdk scrolls the active row into view; Radix measures the anchor.
  Element.prototype.scrollIntoView = () => undefined;
  if (!('ResizeObserver' in window)) {
    (window as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

const vesselScope = { scope: 'vessel' as const, vessel: DRAAK, vesselCode: 'DRA' };
const location = () => screen.getByTestId('location').textContent;
const alert = (vesselId: string, severity: string) => ({ vessel_id: vesselId, severity_color: severity, status: 'OPEN', company_id: COMPANY_ID });

async function openSwitcher(path = '/v/dra', access = FLEET_ACCESS) {
  renderShell(<ScopeControl />, { path, scope: vesselScope, access });
  const trigger = await screen.findByTestId(SHELL_TEST_IDS.vesselSwitcherTrigger);
  fireEvent.click(trigger);
  const panel = await screen.findByTestId(SHELL_TEST_IDS.vesselSwitcher);
  return { trigger, panel };
}

const groupHeadings = (panel: HTMLElement) => Array.from(panel.querySelectorAll('[cmdk-group-heading]')).map((h) => h.textContent);

beforeEach(() => {
  localStorage.clear();
  resetFakeDb();
  resetShellState();
  fakeDb.tables.fleet_groups = [
    { id: 'g-med', name: 'Mediterranean', company_id: COMPANY_ID },
    { id: 'g-carib', name: 'Caribbean', company_id: COMPANY_ID },
  ];
});

describe('rows and groups', () => {
  it('lists All vessels, Recent, the fleet groups and Other vessels; the current vessel is ticked', async () => {
    recordRecentVessel(USER_ID, HYDRA.id);
    const { panel } = await openSwitcher();
    expect(within(panel).getByRole('combobox')).toHaveAttribute('placeholder', 'Search by name, code or IMO');
    await waitFor(() => expect(groupHeadings(panel)).toEqual(['Recent', 'Caribbean', 'Mediterranean', 'Other vessels']));
    expect(within(panel).getByRole('option', { name: /All vessels/ })).toBeInTheDocument();
    const current = within(panel)
      .getAllByRole('option')
      .find((o) => o.getAttribute('aria-current') === 'true');
    expect(current).toHaveTextContent('DRAAK');
    expect(within(current as HTMLElement).getByLabelText('Current vessel')).toBeInTheDocument();
  });

  it('shows each vessel with its code chip', async () => {
    const { panel } = await openSwitcher();
    for (const [name, code] of [['DRAAK', 'DRA'], ['HYDRA', 'HYD'], ['XIPHIAS', 'XIP']]) {
      const row = within(panel)
        .getAllByRole('option')
        .find((o) => o.textContent?.startsWith(name)) as HTMLElement;
      expect(within(row).getByText(code)).toHaveClass('type-mono', 'uppercase');
    }
  });

  it('one "Vessels" group when the fleet groups cannot be read', async () => {
    fakeDb.failures.fleet_groups = { message: 'permission denied' };
    const { panel } = await openSwitcher();
    await new Promise((r) => setTimeout(r, 20));
    expect(groupHeadings(panel)).toEqual(['Vessels']);
  });

  it('drops a recent vessel that is no longer in reach', async () => {
    recordRecentVessel(USER_ID, 'v-sold');
    const { panel } = await openSwitcher();
    await new Promise((r) => setTimeout(r, 20));
    expect(groupHeadings(panel)).not.toContain('Recent');
  });

  it('offers "All vessels" only with fleet reach', async () => {
    asVesselMaster([DRAAK, HYDRA]);
    const { panel } = await openSwitcher('/v/dra', VESSEL_ONLY_ACCESS);
    expect(within(panel).queryByRole('option', { name: /All vessels/ })).toBeNull();
  });
});

describe('search', () => {
  it.each([
    ['hyd', ['HYDRA']],
    ['xiphias', ['XIPHIAS']],
    ['9123456', ['HYDRA']],
    ['nothing like it', []],
  ])('"%s" finds %j', async (query, expected) => {
    const { panel } = await openSwitcher();
    fireEvent.change(within(panel).getByRole('combobox'), { target: { value: query } });
    await waitFor(() => {
      const names = within(panel)
        .queryAllByRole('option')
        .map((o) => o.textContent ?? '')
        .map((t) => [DRAAK, HYDRA, XIPHIAS].find((v) => t.startsWith(v.name))?.name)
        .filter(Boolean);
      expect(Array.from(new Set(names))).toEqual(expected);
    });
    if (!expected.length) expect(within(panel).getByText('No vessel matches.')).toBeInTheDocument();
  });
});

describe('choosing a vessel', () => {
  it('keeps the sub-path and the query, records the vessel, closes and gives focus back', async () => {
    const { trigger, panel } = await openSwitcher('/v/dra/safety/drills?x=1');
    const hydra = (await within(panel).findAllByRole('option')).find((o) => o.textContent?.startsWith('HYDRA')) as HTMLElement;
    fireEvent.click(hydra);
    await waitFor(() => expect(location()).toBe('/v/hyd/safety/drills?x=1'));
    await waitFor(() => expect(screen.queryByTestId(SHELL_TEST_IDS.vesselSwitcher)).toBeNull());
    expect(readRecentVessels(USER_ID)[0]).toBe(HYDRA.id);
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('All vessels opens the fleet dashboard', async () => {
    const { panel } = await openSwitcher('/v/dra/crew/list');
    fireEvent.click(within(panel).getByRole('option', { name: /All vessels/ }));
    await waitFor(() => expect(location()).toBe('/fleet/dashboard'));
  });

  it('the current vessel just closes the list', async () => {
    const { panel } = await openSwitcher('/v/dra/crew/list');
    const draak = within(panel)
      .getAllByRole('option')
      .find((o) => o.getAttribute('aria-current') === 'true') as HTMLElement;
    fireEvent.click(draak);
    await waitFor(() => expect(screen.queryByTestId(SHELL_TEST_IDS.vesselSwitcher)).toBeNull());
    expect(location()).toBe('/v/dra/crew/list');
  });
});

describe('alert pills and AIS marks', () => {
  it('shows the open count in the worst tone, n+ when the summary was cut', async () => {
    fakeDb.tables.alerts = [alert(HYDRA.id, 'ORANGE'), alert(HYDRA.id, 'RED'), alert(DRAAK.id, 'YELLOW')];
    const { panel } = await openSwitcher();
    const hydra = await waitFor(() => {
      const row = within(panel)
        .getAllByRole('option')
        .find((o) => o.textContent?.startsWith('HYDRA') && o.querySelector('[data-tone]'));
      expect(row).toBeDefined();
      return row as HTMLElement;
    });
    const pill = hydra.querySelector('[data-tone]') as HTMLElement;
    expect(pill).toHaveAttribute('data-tone', 'danger');
    expect(pill).toHaveTextContent('2');
    expect(pill).toHaveAccessibleName('2 open alerts, worst red');
  });

  it('marks counts as n+ at the row cap', async () => {
    fakeDb.tables.alerts = Array.from({ length: 1000 }, () => alert(HYDRA.id, 'GREEN'));
    const { panel } = await openSwitcher();
    await waitFor(() => expect(within(panel).getAllByText('1000+').length).toBeGreaterThan(0));
  });

  it('no pills at all when alerts fail to load (never a 0)', async () => {
    fakeDb.failures.alerts = { message: 'timeout' };
    const { panel } = await openSwitcher();
    await new Promise((r) => setTimeout(r, 20));
    expect(panel.querySelector('[data-tone]')).toBeNull();
    expect(within(panel).queryByText('0')).toBeNull();
  });

  it('asks for every vessel position only once the list is open', async () => {
    renderShell(<ScopeControl />, { path: '/v/dra', scope: vesselScope, access: FLEET_ACCESS });
    const trigger = await screen.findByTestId(SHELL_TEST_IDS.vesselSwitcherTrigger);
    await new Promise((r) => setTimeout(r, 20));
    const asked = () => new Set(fakeDb.calls.filter((c) => c.table === 'ais_snapshots').map((c) => c.filters.find((f) => f[0] === 'vessel_id')?.[2]));
    expect(asked()).toEqual(new Set([DRAAK.id]));
    fireEvent.click(trigger);
    await screen.findByTestId(SHELL_TEST_IDS.vesselSwitcher);
    await waitFor(() => expect(asked()).toEqual(new Set([DRAAK.id, HYDRA.id, XIPHIAS.id])));
  });
});
