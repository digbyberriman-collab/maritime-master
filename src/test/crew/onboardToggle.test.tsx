/**
 * The crew list's On/Off quick toggle (gap/04 C4, W7; X1-09B):
 *
 * - which way the toggle goes for each status and placement;
 * - the switch shows only with crew_scheduling.edit and the planner engine
 *   applied (leave_types answers; D-01: hidden while it is missing, hidden
 *   while the gate loads, hidden for a pending placement);
 * - the switch opens the dialog and never writes by itself; Off sends
 *   crew_toggle_onboard with the type, the day and End unknown (or a last
 *   day), On sends the day; the crew list is refreshed; a refusal shows the
 *   server's sentence; a day more than a month away is refused before
 *   sending.
 */
import React from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { LEAVE_TYPES } from '@/modules/rotation-planner/lib/leaveTypes';

const TODAY = '2026-11-27';

const h = vi.hoisted(() => ({
  canEdit: true as boolean | 'loading',
  rpc: vi.fn(),
  tables: {} as Record<string, { data: unknown; error: unknown }>,
  fromCalls: [] as string[],
}));

vi.mock('@/integrations/supabase/client', () => {
  const from = (table: string) => {
    h.fromCalls.push(table);
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'in', 'order', 'limit', 'is', 'lte', 'gte']) chain[m] = () => chain;
    chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(h.tables[table] ?? { data: [], error: null }).then(resolve, reject);
    return chain;
  };
  return { supabase: { rpc: (...args: unknown[]) => h.rpc(...args), from } };
});
vi.mock('@/lib/permissions/useCan', () => ({
  useCan: (key: string) => (key === 'vessel.crew.crew_scheduling.edit' ? h.canEdit === true : true),
  useCapability: () => ({ allowed: true, status: 'granted', reason: 'test' }),
}));
vi.mock('@/app/router/scopeContext', () => ({
  useScope: () => ({ scope: 'vessel', vesselCode: 'DRA', vessel: { id: 'v-dra', company_id: 'c-1', name: 'DRAAK' } }),
}));
vi.mock('@/app/router/scopes', () => ({ useScopedPath: () => (rel = '') => `/v/dra/${rel}` }));
vi.mock('@/modules/crew/components/compliance/crewListCompliance', () => ({ useCrewListCompliance: () => ({ status: 'off', reason: 'Not in this test.' }) }));
vi.mock('@/shared/components/data/useMinWidth', () => ({ TABLET_MIN_WIDTH: 768, useMinWidth: () => true }));
vi.mock('@/modules/rotation-planner/lib/duration', async (orig) => {
  const real = await orig<typeof import('@/modules/rotation-planner/lib/duration')>();
  return { ...real, localToday: () => TODAY };
});

import { CrewTable } from '@/modules/crew/components/crew-list/CrewTable';
import { OnboardToggleDialog } from '@/modules/crew/components/crew-list/OnboardToggleDialog';
import { toggleDirectionFor } from '@/modules/rotation-planner/components/planner/onboardToggle';
import type { CrewListRow } from '@/modules/crew/lib/crewListModel';
import { CREW_STATUSES } from '@/modules/crew/lib/crewStatus';

const leaveTypeRows = LEAVE_TYPES.map((t) => ({
  key: t.key,
  label: t.label,
  day_code: t.dayCode,
  tone_key: t.toneKey,
  balance_effect: t.balanceEffect,
  policy_flag: t.policyFlag,
  counts_on_board: t.countsOnBoard,
  is_leave: t.isLeave,
  needs_approval: t.needsApproval,
  is_system: true,
  is_active: true,
  sort_order: t.sortOrder,
}));

const row = (over: Partial<CrewListRow>): CrewListRow => ({
  profileId: 'p-bosun',
  userId: 'u-bosun',
  firstName: 'Demo',
  lastName: 'Bosun',
  preferredName: null,
  displayName: 'Bosun, Demo',
  email: null,
  positionId: 'pos-bosun',
  positionName: 'Bosun',
  positionText: 'Bosun',
  departmentKey: 'deck',
  departmentLabel: 'Deck',
  rankTier: 'rating',
  sortOrder: 300,
  assignmentId: 'a-1',
  placementKind: 'assignment',
  joinDate: '2026-01-01',
  leaveDate: null,
  status: 'on_board',
  statusDetail: null,
  transferVesselId: null,
  leaveCode: null,
  travelToday: false,
  loginState: 'active',
  accountStatus: 'active',
  invitation: null,
  nationality: null,
  isMasterOffice: false,
  crewNumber: null,
  source: 'server',
  ...over,
});

const wrap = (ui: React.ReactElement) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
};

const table = (rows: CrewListRow[]) => (
  <CrewTable
    rows={rows}
    isLoading={false}
    search=""
    onSearchChange={() => undefined}
    status={null}
    onStatusChange={() => undefined}
    sort="rank"
    dir="asc"
    onSortChange={() => undefined}
    hasExternalFilters={false}
    onClearFilters={() => undefined}
    selectable={false}
    selectedIds={[]}
    onSelectionChange={() => undefined}
    rowActions={() => null}
    vesselName={() => null}
    showInvitations={false}
    canInvite={false}
    onInvite={() => undefined}
    invitingProfileId={null}
    inviteBusy={false}
    empty={{ title: 'No crew', body: 'Nobody yet.' }}
  />
);

beforeAll(() => {
  if (typeof globalThis.ResizeObserver === 'undefined') {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
});

beforeEach(() => {
  h.canEdit = true;
  h.tables = { leave_types: { data: leaveTypeRows, error: null } };
  h.fromCalls = [];
  h.rpc.mockReset();
  h.rpc.mockResolvedValue({ data: [{ direction: 'off', period_id: 'n-1', movement_id: 'm-1' }], error: null });
});

describe('toggleDirectionFor', () => {
  it('goes off from on board, on from on leave, nowhere otherwise', () => {
    for (const status of CREW_STATUSES) {
      for (const placementKind of ['assignment', 'planned', 'pending_placement'] as const) {
        const expected = placementKind !== 'assignment' ? null : status === 'on_board' ? 'off' : status === 'on_leave' ? 'on' : null;
        expect(toggleDirectionFor({ status, placementKind }), `${status} ${placementKind}`).toBe(expected);
      }
    }
  });
});

describe('the switch in the crew list', () => {
  const rows = [
    row({}),
    row({ profileId: 'p-stew', userId: 'u-stew', firstName: 'Demo', lastName: 'Stew', displayName: 'Stew, Demo', status: 'on_leave' }),
    row({ profileId: 'p-new', userId: null, firstName: 'Demo', lastName: 'Joiner', displayName: 'Joiner, Demo', status: 'pending', placementKind: 'pending_placement', loginState: 'pending_login' }),
  ];

  it('shows On for on board, Off for on leave, nothing for a pending placement', async () => {
    wrap(table(rows));
    const onBoard = await screen.findByRole('switch', { name: 'Bosun, Demo is on board. Mark off the vessel' });
    expect(onBoard).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('switch', { name: 'Stew, Demo is off. Mark on board' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getAllByRole('switch')).toHaveLength(2);
  });

  it('is hidden without crew scheduling edit, and reads nothing', async () => {
    h.canEdit = false;
    wrap(table(rows));
    await screen.findByText('Bosun, Demo');
    expect(screen.queryByRole('switch')).toBeNull();
    expect(h.fromCalls).not.toContain('leave_types');
  });

  it('D-01: is hidden while the planner engine is missing', async () => {
    h.tables.leave_types = { data: null, error: { code: 'PGRST205', message: 'Could not find the table public.leave_types' } };
    wrap(table(rows));
    await screen.findByText('Bosun, Demo');
    await waitFor(() => expect(h.fromCalls).toContain('leave_types'));
    expect(screen.queryByRole('switch')).toBeNull();
  });

  it('opens the dialog and writes nothing until it is confirmed; Off sends the time off', async () => {
    wrap(table(rows));
    fireEvent.click(await screen.findByRole('switch', { name: /Bosun, Demo is on board/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Mark off the vessel')).toBeInTheDocument();
    expect(h.rpc).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Mark off' }));
    await waitFor(() =>
      expect(h.rpc).toHaveBeenCalledWith('crew_toggle_onboard', {
        p_vessel_id: 'v-dra',
        p_profile_id: 'p-bosun',
        p_direction: 'off',
        p_leave_type_key: 'rotation',
        p_start: TODAY,
        p_end: null,
        p_end_unknown: true,
      }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});

describe('the dialog', () => {
  const vessel = { id: 'v-dra', companyId: 'c-1', name: 'DRAAK' };

  it('On ends the time off from the chosen day', async () => {
    h.rpc.mockResolvedValue({ data: [{ direction: 'on', period_id: 'p-9', movement_id: 'm-2' }], error: null });
    const onOpenChange = vi.fn();
    wrap(<OnboardToggleDialog open onOpenChange={onOpenChange} vessel={vessel} row={row({ status: 'on_leave' })} types={LEAVE_TYPES} today={TODAY} />);
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Back on board from'), { target: { value: '2026-11-29' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Mark on board' }));
    await waitFor(() => expect(h.rpc).toHaveBeenCalledWith('crew_toggle_onboard', { p_vessel_id: 'v-dra', p_profile_id: 'p-bosun', p_direction: 'on', p_start: '2026-11-29' }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('Off with a last day sends it, and shows the refusal sentence', async () => {
    h.rpc.mockResolvedValue({ data: null, error: { code: '22023', message: 'already_off', details: 'This crew member is already off on that day.' } });
    wrap(<OnboardToggleDialog open onOpenChange={() => undefined} vessel={vessel} row={row({})} types={LEAVE_TYPES} today={TODAY} />);
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Return date unknown' }));
    fireEvent.change(within(dialog).getByLabelText('Last day off'), { target: { value: '2026-12-20' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Mark off' }));
    expect(await within(dialog).findByText('This crew member is already off on that day.')).toBeInTheDocument();
    expect(h.rpc).toHaveBeenCalledWith('crew_toggle_onboard', expect.objectContaining({ p_end: '2026-12-20', p_end_unknown: false }));
  });

  it('refuses a day more than a month away before sending', async () => {
    wrap(<OnboardToggleDialog open onOpenChange={() => undefined} vessel={vessel} row={row({})} types={LEAVE_TYPES} today={TODAY} />);
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('First day off'), { target: { value: '2027-02-01' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Mark off' }));
    expect(await within(dialog).findByText('Choose a day within a month of today.')).toBeInTheDocument();
    expect(h.rpc).not.toHaveBeenCalled();
  });
});
