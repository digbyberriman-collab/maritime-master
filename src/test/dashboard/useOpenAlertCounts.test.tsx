/**
 * The fleet dashboard's alert KPI counts (useOpenAlertCounts) read the same
 * scope as the top-bar bell and the inbox (useAlertScope, D-90 / D-71):
 *
 * - a fleet-reach viewer on a fleet route counts every open alert of the
 *   company, even while VesselContext has one vessel selected and "All
 *   vessels" is off (no `vessel_id` filter, no `or`);
 * - anyone else counts the vessels in their reach plus the company-wide
 *   alerts (the same `or` filter the bell uses);
 * - nothing is read before access and the profile read have answered, and
 *   the state says `loading` meanwhile (D-04, no fake "all clear"), so a
 *   slow profile read is never a transient "no company";
 * - once they have, an account with no company is `error` (`no-company`,
 *   D-103), not zeros and not an endless skeleton, and still reads nothing;
 * - a failed read is `error` (`read`), not zero.
 *
 * The real useAlertScope runs; auth, scope access and the vessel list are
 * in-memory fakes, and the Supabase client records each call.
 */
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Vessel } from '@/modules/vessels/contexts/VesselContext';

interface RecordedCall {
  table: string;
  select: string | null;
  eq: Array<[string, unknown]>;
  in: Array<[string, unknown[]]>;
  or: string[];
}

const h = vi.hoisted(() => ({
  calls: [] as RecordedCall[],
  rows: [] as Array<{ severity_color: string | null; status: string }>,
  error: null as { message: string } | null,
  auth: {
    user: { id: 'u1' },
    profile: { id: 'p1', company_id: 'c1' } as { id: string; company_id: string | null } | null,
    profileResolved: true,
  },
  access: { ready: true, fleetReach: false },
  vessel: {
    vessels: [] as Vessel[],
    loading: false,
    canAccessAllVessels: false,
    selectedVesselId: null as string | null,
    isAllVessels: false,
  },
}));

vi.mock('@/integrations/supabase/client', () => {
  const from = (table: string) => {
    const call: RecordedCall = { table, select: null, eq: [], in: [], or: [] };
    h.calls.push(call);
    const builder = {
      select(columns: string) {
        call.select = columns;
        return builder;
      },
      eq(column: string, value: unknown) {
        call.eq.push([column, value]);
        return builder;
      },
      in(column: string, values: unknown[]) {
        call.in.push([column, values]);
        return builder;
      },
      or(filter: string) {
        call.or.push(filter);
        return builder;
      },
      then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
        const result = h.error ? { data: null, error: h.error } : { data: h.rows, error: null };
        return Promise.resolve(result).then(resolve, reject);
      },
    };
    return builder;
  };
  return { supabase: { from } };
});
vi.mock('@/modules/auth/contexts/AuthContext', () => ({ useAuth: () => h.auth }));
vi.mock('@/app/router/useScopeAccess', () => ({ useScopeAccess: () => h.access }));
vi.mock('@/modules/vessels/contexts/VesselContext', () => ({ useVessel: () => h.vessel }));

import { useOpenAlertCounts, OPEN_ALERT_STATUSES, alertKpiTileProps, NO_COMPANY_MESSAGE } from '@/modules/dashboard/hooks/useOpenAlertCounts';
import { ScopeContext, type ScopeValue } from '@/app/router/scopeContext';
import { alertOrFilter } from '@/modules/notifications/lib/alertScope';

const vessel = (id: string, name: string): Vessel => ({
  id, company_id: 'c1', name, imo_number: null, flag_state: null, vessel_type: null,
  classification_society: null, gross_tonnage: null, build_year: null, status: 'Active', created_at: '2023-01-01T00:00:00Z',
});
const DRAAK = vessel('v-dra', 'M/Y DRAAK');
const DAGON = vessel('v-dag', 'M/Y DAGON');
const HYDRA = vessel('v-hyd', 'M/Y HYDRA');

function renderCounts(scope: ScopeValue = { scope: 'fleet' }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <QueryClientProvider client={queryClient}>
      <ScopeContext.Provider value={scope}>{children}</ScopeContext.Provider>
    </QueryClientProvider>
  );
  return { ...renderHook(() => useOpenAlertCounts(), { wrapper }), queryClient };
}

const alertCalls = () => h.calls.filter((c) => c.table === 'alerts');

beforeEach(() => {
  h.calls.length = 0;
  h.rows = [];
  h.error = null;
  h.auth = { user: { id: 'u1' }, profile: { id: 'p1', company_id: 'c1' }, profileResolved: true };
  h.access = { ready: true, fleetReach: false };
  h.vessel = { vessels: [], loading: false, canAccessAllVessels: false, selectedVesselId: null, isAllVessels: false };
});

describe('useOpenAlertCounts', () => {
  it('a fleet-reach viewer on a fleet route counts the whole company, whatever vessel is selected', async () => {
    h.access = { ready: true, fleetReach: true };
    // One vessel selected, "All vessels" off (D-71: kept on Fleet pages until P2).
    h.vessel = { vessels: [DRAAK, DAGON, HYDRA], loading: false, canAccessAllVessels: false, selectedVesselId: DRAAK.id, isAllVessels: false };
    h.rows = [
      { severity_color: 'RED', status: 'OPEN' },
      { severity_color: 'RED', status: 'ESCALATED' },
      { severity_color: 'ORANGE', status: 'ACKNOWLEDGED' },
      { severity_color: 'ORANGE', status: 'OPEN' },
      { severity_color: 'YELLOW', status: 'SNOOZED' },
      { severity_color: 'YELLOW', status: 'OPEN' },
      { severity_color: 'YELLOW', status: 'OPEN' },
      { severity_color: 'BLUE', status: 'OPEN' },
    ];
    const { result, queryClient } = renderCounts({ scope: 'fleet' });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.counts).toEqual({ RED: 2, ORANGE: 2, YELLOW: 3, GREEN: 0, total: 7 });

    expect(alertCalls()).toHaveLength(1);
    const [call] = alertCalls();
    expect(call.select).toBe('severity_color, status');
    expect(call.eq).toEqual([['company_id', 'c1']]);
    expect(call.eq.some(([column]) => column === 'vessel_id')).toBe(false);
    expect(call.in).toEqual([['status', [...OPEN_ALERT_STATUSES]]]);
    expect(call.or).toEqual([]);
    // Keyed by the scope, apart from useAlerts' four-part key; useAlerts'
    // `['alert-counts']` invalidations still reach it.
    expect(queryClient.getQueryCache().findAll({ queryKey: ['alert-counts'] }).map((q) => q.queryKey)).toEqual([
      ['alert-counts', 'c1', 'scope', 'company'],
    ]);
  });

  it('a non-fleet viewer counts the vessels in reach plus the company-wide alerts', async () => {
    h.vessel = { vessels: [DRAAK, DAGON], loading: false, canAccessAllVessels: false, selectedVesselId: DRAAK.id, isAllVessels: false };
    h.rows = [{ severity_color: 'ORANGE', status: 'OPEN' }];
    const { result } = renderCounts({ scope: 'fleet' });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.counts).toEqual({ RED: 0, ORANGE: 1, YELLOW: 0, GREEN: 0, total: 1 });

    const [call] = alertCalls();
    const expected = alertOrFilter({ kind: 'reach', vesselIds: [DAGON.id, DRAAK.id] });
    expect(expected).toBe('vessel_id.in.(v-dag,v-dra),vessel_id.is.null');
    expect(call.or).toEqual([expected]);
    expect(call.eq).toEqual([['company_id', 'c1']]);
  });

  it('inside a vessel scope, that vessel and the company-wide alerts', async () => {
    h.access = { ready: true, fleetReach: true };
    h.vessel = { vessels: [DRAAK, DAGON], loading: false, canAccessAllVessels: true, selectedVesselId: DAGON.id, isAllVessels: false };
    const { result } = renderCounts({ scope: 'vessel', vessel: DRAAK, vesselCode: 'DRA' });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(alertCalls()[0].or).toEqual(['vessel_id.eq.v-dra,vessel_id.is.null']);
  });

  it('reads nothing and says loading until access has loaded', async () => {
    h.access = { ready: false, fleetReach: false };
    const { result, rerender } = renderCounts();
    expect(result.current.status).toBe('loading');
    expect(result.current.counts).toBeNull();
    // A retry before access has loaded does not read either.
    result.current.retry();
    await new Promise((resolve) => setTimeout(resolve, 20));
    rerender();
    expect(result.current.status).toBe('loading');
    expect(h.calls).toEqual([]);
  });

  it('reads nothing and says loading while the vessel list loads', async () => {
    h.vessel = { ...h.vessel, loading: true };
    const { result } = renderCounts();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(result.current.status).toBe('loading');
    expect(h.calls).toEqual([]);
  });

  it.each([
    ['a profile with no company', { id: 'p1', company_id: null }],
    ['no readable profile', null],
  ])('once access has loaded, %s is an error (no company), never an endless skeleton, and reads nothing', async (_name, profile) => {
    h.access = { ready: true, fleetReach: true };
    h.auth = { user: { id: 'u1' }, profile, profileResolved: true };
    const { result, rerender } = renderCounts();
    expect(result.current).toMatchObject({ status: 'error', reason: 'no-company', counts: null });
    // A retry cannot help, and reads nothing either.
    result.current.retry();
    await new Promise((resolve) => setTimeout(resolve, 20));
    rerender();
    expect(result.current).toMatchObject({ status: 'error', reason: 'no-company' });
    expect(h.calls).toEqual([]);
  });

  it('a profile read still in flight is loading, never "no company", and reads nothing (D-103)', async () => {
    // Access and the vessel list have settled (VesselContext stops waiting for
    // the profile after 5 s), but the profile read has not answered yet.
    h.access = { ready: true, fleetReach: true };
    h.vessel = { ...h.vessel, loading: false };
    h.auth = { user: { id: 'u1' }, profile: null, profileResolved: false };
    const { result, rerender } = renderCounts();
    expect(result.current).toMatchObject({ status: 'loading', counts: null });
    const tile = alertKpiTileProps(result.current);
    expect(tile.state).toBe('loading');
    expect(tile.errorMessage).toBeUndefined();
    expect(JSON.stringify(tile)).not.toContain(NO_COMPANY_MESSAGE);
    result.current.retry();
    await new Promise((resolve) => setTimeout(resolve, 20));
    rerender();
    expect(result.current.status).toBe('loading');
    expect(alertCalls()).toHaveLength(0);

    // The read answers with a company: counting starts.
    h.auth = { user: { id: 'u1' }, profile: { id: 'p1', company_id: 'c1' }, profileResolved: true };
    rerender();
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(alertCalls()).toHaveLength(1);
  });

  it('a failed read is an error, not zero', async () => {
    h.access = { ready: true, fleetReach: true };
    h.error = { message: 'boom' };
    const { result } = renderCounts();
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current).toMatchObject({ status: 'error', reason: 'read' });
    expect(result.current.counts).toBeNull();
  });
});

describe('alertKpiTileProps', () => {
  const retry = () => undefined;
  it('loading: the skeleton; ready: the tile decides from its value', () => {
    expect(alertKpiTileProps({ status: 'loading', counts: null, retry })).toEqual({ state: 'loading', onRetry: retry });
    expect(alertKpiTileProps({ status: 'ready', counts: { RED: 0, ORANGE: 0, YELLOW: 0, GREEN: 0, total: 0 }, retry })).toEqual({ state: undefined, onRetry: retry });
  });

  it('a failed read keeps its Retry; no company says why and offers none', () => {
    expect(alertKpiTileProps({ status: 'error', reason: 'read', counts: null, retry })).toEqual({ state: 'error', onRetry: retry });
    expect(alertKpiTileProps({ status: 'error', reason: 'no-company', counts: null, retry })).toEqual({
      state: 'error',
      errorMessage: NO_COMPANY_MESSAGE,
      onRetry: undefined,
    });
    expect(NO_COMPANY_MESSAGE).toBe('No company on your account');
  });
});
