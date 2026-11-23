/**
 * What the top-bar bell reads (gap/10 top bar element 8, IA15; spec §2.1;
 * D-71; D-04): nothing while access or the vessel list loads; the route's
 * vessel inside `/v/:code`; the whole company for fleet reach; the vessels
 * in reach for everyone else. Reads are keyed by the scope, so a late answer
 * for an earlier scope never shows, and the badge comes from head counts,
 * not from the 20-row list.
 */
import React from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import type { QueryClient, QueryKey } from '@tanstack/react-query';

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

import NotificationBell from '@/shared/components/layout/NotificationBell';
import { ScopeContext, type ScopeValue } from '@/app/router/scopeContext';
import { SHELL_TEST_IDS } from '@/app/shell/testIds';
import { fakeDb, resetFakeDb } from './fakeSupabase';
import { COMPANY_ID, DRAAK, HYDRA, asFleetUser, asVesselMaster, renderShell, resetShellState, shellState } from './shellFakes';

beforeAll(() => {
  Element.prototype.scrollIntoView = () => undefined;
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => undefined;
});

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('storm_alert_helper_shown', 'true');
  resetFakeDb();
  resetShellState();
});

const alertRow = (id: string, vesselId: string | null, severity = 'RED', status = 'OPEN') => ({
  id,
  title: `Alert ${id}`,
  description: null,
  severity_color: severity,
  status,
  vessel_id: vesselId,
  due_at: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  related_entity_type: null,
  related_entity_id: null,
  source_module: null,
  company_id: COMPANY_ID,
});

/** The rendered scope, changeable from a test (a route change in the real shell). */
const scopeControl: { set: (scope: ScopeValue) => void; refresh: () => void } = { set: () => undefined, refresh: () => undefined };
const Scoped: React.FC<{ initial: ScopeValue; children: React.ReactNode }> = ({ initial, children }) => {
  const [scope, setScope] = React.useState(initial);
  scopeControl.set = setScope;
  // A new value for the same scope: every reader renders again (and reads the fakes again).
  scopeControl.refresh = () => setScope((current) => ({ ...current }));
  return <ScopeContext.Provider value={scope}>{children}</ScopeContext.Provider>;
};

function renderBell(scope: ScopeValue = { scope: 'fleet' }) {
  return renderShell(
    <Scoped initial={scope}>
      <NotificationBell open onOpenChange={() => undefined} />
    </Scoped>,
    { path: scope.scope === 'vessel' ? '/v/dra' : '/fleet/dashboard' },
  );
}

const alertReads = () => fakeDb.calls.filter((c) => c.table === 'alerts' && c.op === 'select');
const listReads = () => alertReads().filter((c) => c.limit === 20);
const trigger = () => screen.getByTestId(SHELL_TEST_IDS.notificationsTrigger);

async function settled(queryClient: QueryClient, queryKey: QueryKey) {
  await waitFor(() => {
    const status = queryClient.getQueryState(queryKey)?.status;
    expect(status === 'success' || status === 'error').toBe(true);
  });
  await act(async () => {});
}

const listKey = (scopeKey: string) => ['shell', 'bell', 'list', COMPANY_ID, scopeKey];
const countsKey = (scopeKey: string) => ['shell', 'bell', 'counts', COMPANY_ID, scopeKey];

describe('readiness (fail closed)', () => {
  it('reads nothing while the vessel list loads, then reads in reach once it has', async () => {
    asVesselMaster([DRAAK]);
    fakeDb.tables.alerts = [alertRow('hyd', HYDRA.id)];
    shellState.vessel = { ...shellState.vessel, loading: true, selectedVesselId: null, selectedVessel: null };
    const { queryClient } = renderBell();
    const panel = await screen.findByTestId(SHELL_TEST_IDS.notificationsPanel);
    await act(async () => {});
    expect(within(panel).getByRole('status')).toHaveTextContent('Loading alerts…');
    expect(alertReads()).toEqual([]);
    expect(trigger()).toHaveAccessibleName('Notifications');
    expect(trigger().querySelector('[data-tone]')).toBeNull();

    // Loaded: the first read is already scoped to the master's reach.
    asVesselMaster([DRAAK]);
    act(() => scopeControl.refresh());
    await settled(queryClient, listKey('reach:v-dra'));
    expect(alertReads().length).toBeGreaterThan(0);
    for (const call of alertReads()) expect(call.or).toEqual(['vessel_id.in.(v-dra),vessel_id.is.null']);
  });

  it('reads nothing while roles load', async () => {
    shellState.perm = { ...shellState.perm, isInitialized: false, loadedFor: null };
    renderBell();
    await screen.findByTestId(SHELL_TEST_IDS.notificationsPanel);
    await act(async () => {});
    expect(alertReads()).toEqual([]);
  });
});

describe('scope', () => {
  it('a vessel-only user, outside the vessel scope: the vessels in reach and company-wide alerts', async () => {
    asVesselMaster([DRAAK]);
    const { queryClient } = renderBell({ scope: 'workspace', workspace: 'hris' });
    await settled(queryClient, listKey('reach:v-dra'));
    await settled(queryClient, countsKey('reach:v-dra'));
    expect(alertReads()).toHaveLength(3);
    for (const call of alertReads()) {
      expect(call.filters).toContainEqual(['company_id', 'eq', COMPANY_ID]);
      expect(call.or).toEqual(['vessel_id.in.(v-dra),vessel_id.is.null']);
    }
  });

  it('a vessel-only user with no vessel at all: company-wide alerts only, never every vessel', async () => {
    asVesselMaster([]);
    const { queryClient } = renderBell({ scope: 'personal' });
    await settled(queryClient, listKey('reach:'));
    for (const call of alertReads()) expect(call.or).toEqual(['vessel_id.is.null']);
  });

  it('inside /v/:code: that vessel and the company-wide alerts, named in the header', async () => {
    const { queryClient } = renderBell({ scope: 'vessel', vessel: DRAAK, vesselCode: 'DRA' });
    await settled(queryClient, listKey('vessel:v-dra'));
    for (const call of alertReads()) expect(call.or).toEqual(['vessel_id.eq.v-dra,vessel_id.is.null']);
    expect(within(screen.getByTestId(SHELL_TEST_IDS.notificationsPanel)).getByText('DRAAK')).toBeInTheDocument();
    expect(screen.getByTestId(SHELL_TEST_IDS.notificationsPanel)).toHaveTextContent('Alerts · DRAAK');
  });

  it('fleet reach outside the vessel scope: the whole company, whatever vessel is selected', async () => {
    asFleetUser();
    const { queryClient } = renderBell({ scope: 'workspace', workspace: 'health' });
    await settled(queryClient, listKey('company'));
    expect(alertReads().length).toBeGreaterThan(0);
    for (const call of alertReads()) {
      expect(call.or).toBeUndefined();
      expect(call.filters).toContainEqual(['company_id', 'eq', COMPANY_ID]);
    }
    expect(screen.getByTestId(SHELL_TEST_IDS.notificationsPanel)).not.toHaveTextContent('Alerts ·');
  });

  it('a late answer for an earlier scope never shows', async () => {
    fakeDb.tables.alerts = [alertRow('draak-1', DRAAK.id, 'YELLOW')];
    fakeDb.delayMs = 300;
    const { queryClient } = renderBell({ scope: 'vessel', vessel: DRAAK, vesselCode: 'DRA' });
    await waitFor(() => expect(listReads()).toHaveLength(1));
    // The user opens HYDRA before DRAAK's read answers; HYDRA's answers first.
    fakeDb.delayMs = 10;
    act(() => scopeControl.set({ scope: 'vessel', vessel: HYDRA, vesselCode: 'HYD' }));
    await waitFor(() => expect(listReads()).toHaveLength(2));
    fakeDb.tables.alerts = [alertRow('hydra-1', HYDRA.id, 'YELLOW')];
    await settled(queryClient, listKey('vessel:v-hyd'));
    const panel = screen.getByTestId(SHELL_TEST_IDS.notificationsPanel);
    expect(within(panel).getByText('Alert hydra-1')).toBeInTheDocument();
    // DRAAK's read now answers, late, with what the table holds then.
    fakeDb.tables.alerts = [alertRow('stale', DRAAK.id, 'RED')];
    await settled(queryClient, listKey('vessel:v-dra'));
    expect(within(panel).queryByText('Alert stale')).toBeNull();
    expect(within(panel).getByText('Alert hydra-1')).toBeInTheDocument();
    expect(panel).toHaveTextContent('Alerts · HYDRA');
  });
});

describe('badge', () => {
  it('counts open alerts beyond the 20-row list: 20 acknowledged RED rows and one open alert', async () => {
    fakeDb.tables.alerts = [
      ...Array.from({ length: 20 }, (_, i) => alertRow(`ack-${i}`, DRAAK.id, 'RED', 'ACKNOWLEDGED')),
      alertRow('open-orange', DRAAK.id, 'ORANGE', 'OPEN'),
    ];
    const { queryClient } = renderBell();
    await settled(queryClient, countsKey('company'));
    await settled(queryClient, listKey('company'));
    expect(trigger()).toHaveAccessibleName('Notifications, 1 unread');
    const badge = trigger().querySelector('[data-tone]') as HTMLElement;
    expect(badge).toHaveTextContent('1');
    expect(badge).toHaveAttribute('data-tone', 'primary');
    // The counts are head requests over open alerts, the second one RED only.
    const heads = alertReads().filter((c) => c.selectOptions?.head);
    expect(heads).toHaveLength(2);
    for (const head of heads) expect(head.filters).toContainEqual(['status', 'eq', 'OPEN']);
    expect(heads.some((h) => h.filters.some(([column, , value]) => column === 'severity_color' && value === 'RED'))).toBe(true);
  });

  it('takes the critical tone from the RED count, and caps the label at 99+', async () => {
    fakeDb.tables.alerts = [
      ...Array.from({ length: 120 }, (_, i) => alertRow(`y-${i}`, DRAAK.id, 'YELLOW')),
      alertRow('red', HYDRA.id, 'RED'),
    ];
    const { queryClient } = renderBell();
    await settled(queryClient, countsKey('company'));
    expect(trigger()).toHaveAccessibleName('Notifications, 121 unread, including critical');
    const badge = trigger().querySelector('[data-tone]') as HTMLElement;
    expect(badge).toHaveTextContent('99+');
    expect(badge).toHaveAttribute('data-tone', 'critical');
  });

  it('no badge, and no "0", until the counts are in', async () => {
    fakeDb.tables.alerts = [alertRow('a', DRAAK.id)];
    fakeDb.delayMs = 200;
    const { queryClient } = renderBell();
    await waitFor(() => expect(alertReads().length).toBe(3));
    expect(trigger().querySelector('[data-tone]')).toBeNull();
    expect(trigger()).toHaveAccessibleName('Notifications');
    await settled(queryClient, countsKey('company'));
    expect(trigger()).toHaveAccessibleName('Notifications, 1 unread, including critical');
  });
});
