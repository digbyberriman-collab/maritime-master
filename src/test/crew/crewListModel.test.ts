/**
 * The vessel crew list's model (X1-02; gap/04 C3, C4, C9): the URL state
 * (defaults left out, unknown values ignored, other parameters kept), the
 * Movements range rules, search over name, position and crew number, the
 * count chips, the three sorts, the mapping of the server rows and of the
 * legacy rows (the D-01 fallback), the as-at report split, and the
 * missing-RPC classifier.
 */
import { describe, expect, it } from 'vitest';
import {
  addDays,
  asAtInRange,
  compareByRank,
  CREW_LIST_DEFAULTS,
  crewSearchText,
  daysBetween,
  defaultMovementRange,
  departmentOptions,
  displayNameOf,
  filterByDepartment,
  fromLegacyCrew,
  fromMovementRow,
  fromRpcRow,
  isDay,
  isMissingRpc,
  localDay,
  MOVEMENT_RANGE_MAX_DAYS,
  parseCrewListParams,
  parseMovementRange,
  positionLabel,
  sortCrewRows,
  splitForReport,
  STATUS_CHIP_ORDER,
  statusCounts,
  withCrewListParams,
  withMovementRange,
  type CrewListRow,
} from '@/modules/crew/lib/crewListModel';
import type { CrewMember } from '@/modules/crew/hooks/useCrew';
import type { CrewVesselListRpcRow } from '@/modules/crew/types/db.pending';

const rpc = (over: Partial<CrewVesselListRpcRow> = {}): CrewVesselListRpcRow => ({
  profile_id: 'p-1',
  user_id: 'u-1',
  first_name: 'Demo',
  last_name: 'Bosun',
  preferred_name: null,
  avatar_url: null,
  email: 'bosun@example.test',
  position_id: 'pos-bosun',
  position_name: 'Bosun',
  position_text: 'Boatswain',
  department_key: 'deck',
  department_label: 'Deck',
  rank_tier: 'officer',
  sort_order: 30201,
  assignment_id: 'a-1',
  placement_kind: 'assignment',
  join_date: '2026-10-01',
  leave_date: null,
  status: 'on_board',
  status_detail: null,
  transfer_vessel_id: null,
  leave_code: 'F',
  travel_today: false,
  login_state: 'active',
  account_status: 'active',
  invitation_id: null,
  invitation_status: null,
  invitation_expires_at: null,
  invitation_last_sent_at: null,
  invitation_last_error_code: null,
  nationality: 'Dutch',
  is_master_office: false,
  ...over,
});

const row = (over: Partial<CrewVesselListRpcRow> = {}): CrewListRow => fromRpcRow(rpc(over));

describe('URL state', () => {
  it('reads the defaults from an empty query', () => {
    expect(parseCrewListParams(new URLSearchParams())).toEqual(CREW_LIST_DEFAULTS);
  });

  it('reads every parameter', () => {
    const p = parseCrewListParams(new URLSearchParams('tab=movements&q=bos&dept=deck&status=on_leave&sort=join&dir=desc'));
    expect(p).toEqual({ tab: 'movements', q: 'bos', dept: 'deck', status: 'on_leave', sort: 'join', dir: 'desc' });
  });

  it('ignores unknown values instead of failing', () => {
    const p = parseCrewListParams(new URLSearchParams('tab=x&status=away&sort=age&dir=up&dept=Deck%20Dept'));
    expect(p).toEqual(CREW_LIST_DEFAULTS);
  });

  it('caps the search at 120 characters', () => {
    expect(parseCrewListParams(new URLSearchParams(`q=${'a'.repeat(300)}`)).q).toHaveLength(120);
  });

  it('writes only what differs from the default and keeps every other parameter', () => {
    const base = new URLSearchParams('positions=1&from=2026-01-01');
    const next = withCrewListParams(base, { tab: 'movements', status: 'pending', sort: 'name', dir: 'desc', q: ' crew ' });
    expect(next.get('positions')).toBe('1');
    expect(next.get('from')).toBe('2026-01-01');
    expect(next.get('tab')).toBe('movements');
    expect(next.get('status')).toBe('pending');
    expect(next.get('sort')).toBe('name');
    expect(next.get('dir')).toBe('desc');
    expect(next.get('q')).toBe(' crew ');
    const back = withCrewListParams(next, { tab: 'crew', status: null, sort: 'rank', dir: 'asc', q: '' });
    expect([...back.keys()].sort()).toEqual(['from', 'positions']);
  });
});

describe('days', () => {
  it('formats the local day, adds days and counts the days between', () => {
    expect(localDay(new Date(2026, 10, 26, 23, 59))).toBe('2026-11-26');
    expect(addDays('2026-11-26', 10)).toBe('2026-12-06');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(daysBetween('2026-11-26', '2026-12-06')).toBe(10);
    expect(daysBetween('2026-12-06', '2026-11-26')).toBe(-10);
  });

  it('accepts only real yyyy-MM-dd days', () => {
    expect(isDay('2026-02-28')).toBe(true);
    expect(isDay('2026-02-30')).toBe(false);
    expect(isDay('26-11-2026')).toBe(false);
    expect(isDay('')).toBe(false);
    expect(isDay(null)).toBe(false);
  });

  it('allows an as-at day within two years either side of today, as the server does', () => {
    expect(asAtInRange('2028-11-25', '2026-11-26')).toBe(true);
    expect(asAtInRange('2028-11-27', '2026-11-26')).toBe(false);
    expect(asAtInRange('2024-11-27', '2026-11-26')).toBe(true);
    expect(asAtInRange('2024-11-25', '2026-11-26')).toBe(false);
    expect(asAtInRange('not a day', '2026-11-26')).toBe(false);
  });
});

describe('Movements range', () => {
  const today = '2026-11-26';

  it('defaults to the last 90 days and the next 30', () => {
    expect(defaultMovementRange(today)).toEqual({ from: '2026-08-28', to: '2026-12-26' });
    expect(parseMovementRange(new URLSearchParams(), today)).toEqual({ from: '2026-08-28', to: '2026-12-26' });
  });

  it('reads the URL, swaps a reversed range and cuts one longer than three years', () => {
    expect(parseMovementRange(new URLSearchParams('from=2026-01-01&to=2026-02-01'), today)).toEqual({ from: '2026-01-01', to: '2026-02-01' });
    expect(parseMovementRange(new URLSearchParams('from=2026-02-01&to=2026-01-01'), today)).toEqual({ from: '2026-01-01', to: '2026-02-01' });
    const long = parseMovementRange(new URLSearchParams('from=2020-01-01&to=2026-01-01'), today);
    expect(long.to).toBe('2026-01-01');
    expect(daysBetween(long.from, long.to)).toBe(MOVEMENT_RANGE_MAX_DAYS);
    expect(parseMovementRange(new URLSearchParams('from=2026-13-01'), today).from).toBe('2026-08-28');
  });

  it('keeps the default range out of the URL', () => {
    const next = withMovementRange(new URLSearchParams('tab=movements'), defaultMovementRange(today), today);
    expect(next.toString()).toBe('tab=movements');
    const custom = withMovementRange(next, { from: '2026-01-01', to: '2026-02-01' }, today);
    expect(custom.get('from')).toBe('2026-01-01');
    expect(custom.get('to')).toBe('2026-02-01');
  });
});

describe('server rows', () => {
  it('maps the RPC row (camel case, names, the invitation)', () => {
    const r = row({
      invitation_id: 'i-1',
      invitation_status: 'sent',
      invitation_last_sent_at: '2026-11-25T08:00:00Z',
      invitation_expires_at: '2026-12-02T08:00:00Z',
      travel_today: true,
      is_master_office: true,
      email: '  ',
      preferred_name: '',
    });
    expect(r).toMatchObject({
      profileId: 'p-1',
      displayName: 'Bosun, Demo',
      positionName: 'Bosun',
      positionText: 'Boatswain',
      departmentKey: 'deck',
      status: 'on_board',
      travelToday: true,
      isMasterOffice: true,
      email: null,
      preferredName: null,
      source: 'server',
      crewNumber: null,
    });
    expect(r.invitation).toEqual({ id: 'i-1', status: 'sent', expiresAt: '2026-12-02T08:00:00Z', lastSentAt: '2026-11-25T08:00:00Z', lastErrorCode: null });
    expect(row().invitation).toBeNull();
  });

  it('names a person by last and first name, else either, else a neutral label', () => {
    expect(displayNameOf('Demo', 'Bosun')).toBe('Bosun, Demo');
    expect(displayNameOf('', 'Bosun')).toBe('Bosun');
    expect(displayNameOf('Demo', null)).toBe('Demo');
    expect(displayNameOf(null, '  ')).toBe('Unnamed crew member');
  });

  it('shows the catalogue name, else the free-text title', () => {
    expect(positionLabel(row())).toBe('Bosun');
    expect(positionLabel(row({ position_name: null }))).toBe('Boatswain');
    expect(positionLabel(row({ position_name: null, position_text: null }))).toBeNull();
  });
});

describe('search, departments, counts', () => {
  const rows = [
    row({ profile_id: 'p-1', first_name: 'Demo', last_name: 'Bosun', department_key: 'deck', department_label: 'Deck', status: 'on_board' }),
    row({ profile_id: 'p-2', first_name: 'Demo', last_name: 'Stew', position_name: 'Second Stew', position_text: 'Stewardess', department_key: 'interior', department_label: 'Interior', status: 'on_leave' }),
    row({ profile_id: 'p-3', first_name: 'Demo', last_name: 'Joiner', department_key: 'deck', department_label: 'Deck', status: 'pending', placement_kind: 'planned' }),
    row({ profile_id: 'p-4', first_name: 'Demo', last_name: 'Mover', department_key: null, department_label: null, status: 'on_transfer' }),
  ];

  it('searches names, the catalogue position, the free-text title and the crew number', () => {
    expect(crewSearchText(rows[1])).toContain('Second Stew');
    expect(crewSearchText(rows[1])).toContain('Stewardess');
    expect(crewSearchText({ ...rows[0], crewNumber: 'C-042' })).toContain('C-042');
  });

  it('lists the departments present, in label order, and filters by one', () => {
    expect(departmentOptions(rows)).toEqual([{ key: 'deck', label: 'Deck' }, { key: 'interior', label: 'Interior' }]);
    expect(filterByDepartment(rows, 'deck').map((r) => r.profileId)).toEqual(['p-1', 'p-3']);
    expect(filterByDepartment(rows, null)).toHaveLength(4);
  });

  it('counts Total and every status', () => {
    expect(statusCounts(rows)).toEqual({ total: 4, on_board: 1, ashore: 0, on_leave: 1, pending: 1, on_transfer: 1 });
    expect(STATUS_CHIP_ORDER).toEqual(['on_board', 'ashore', 'on_leave', 'pending', 'on_transfer']);
  });
});

describe('sorting', () => {
  const rows = [
    row({ profile_id: 'c', last_name: 'Cook', sort_order: null, join_date: null }),
    row({ profile_id: 'm', last_name: 'Master', sort_order: 10101, join_date: '2026-01-10' }),
    row({ profile_id: 'b', last_name: 'Bosun', sort_order: 5, join_date: '2026-03-01' }),
    row({ profile_id: 'a', last_name: 'Able', sort_order: 30201, join_date: '2025-12-01' }),
  ];

  it('rank: the vessel order, unmapped titles last (in both directions), then by name', () => {
    expect(sortCrewRows(rows, 'rank', 'asc').map((r) => r.profileId)).toEqual(['b', 'm', 'a', 'c']);
    expect(sortCrewRows(rows, 'rank', 'desc').map((r) => r.profileId)).toEqual(['a', 'm', 'b', 'c']);
    expect(compareByRank(row({ sort_order: 1, last_name: 'B' }), row({ sort_order: 1, last_name: 'A' }))).toBeGreaterThan(0);
  });

  it('name: last name, then first name', () => {
    expect(sortCrewRows(rows, 'name', 'asc').map((r) => r.profileId)).toEqual(['a', 'b', 'c', 'm']);
    expect(sortCrewRows(rows, 'name', 'desc').map((r) => r.profileId)).toEqual(['m', 'c', 'b', 'a']);
  });

  it('join: by join date, no date last', () => {
    expect(sortCrewRows(rows, 'join', 'asc').map((r) => r.profileId)).toEqual(['a', 'm', 'b', 'c']);
    expect(sortCrewRows(rows, 'join', 'desc').map((r) => r.profileId)).toEqual(['b', 'm', 'a', 'c']);
  });
});

describe('the D-01 fallback: legacy rows', () => {
  const today = '2026-11-26';
  const member = (over: Partial<CrewMember> = {}): CrewMember => ({
    id: 'p-1',
    user_id: 'u-1',
    email: 'crew@example.test',
    first_name: 'Demo',
    last_name: 'Deckhand',
    rank: 'Deckhand',
    nationality: null,
    phone: null,
    status: 'Active',
    role: 'crew',
    created_at: '2026-01-01T00:00:00Z',
    department: 'Deck',
    account_status: 'active',
    current_assignment: { id: 'a-1', vessel_id: 'v-dra', vessel_name: 'DRAAK', position: 'Deckhand', join_date: '2026-10-01', rank: 'Deckhand' },
    ...over,
  });
  const ctx = (over: Partial<Parameters<typeof fromLegacyCrew>[1]> = {}) => ({
    vesselId: 'v-dra',
    today,
    leaveCodeByUserId: new Map<string, string>(),
    includeEmail: true,
    ...over,
  });

  it('a current assignment reads On board, or On leave from the day code of today', () => {
    expect(fromLegacyCrew(member(), ctx())).toMatchObject({ status: 'on_board', placementKind: 'assignment', source: 'basic', departmentKey: 'deck', departmentLabel: 'Deck' });
    expect(fromLegacyCrew(member(), ctx({ leaveCodeByUserId: new Map([['u-1', 'F']]) }))?.status).toBe('on_board');
    expect(fromLegacyCrew(member(), ctx({ leaveCodeByUserId: new Map([['u-1', 'l']]) }))).toMatchObject({ status: 'on_leave', statusDetail: 'leave', leaveCode: 'L' });
  });

  it('a pending placement reads Pending and pending login, with no assignment id (D-225)', () => {
    const pending = member({
      id: 'p-9',
      user_id: null,
      is_imported: true,
      current_assignment: { id: 'imported-p-9', vessel_id: 'v-dra', vessel_name: 'DRAAK', position: 'Crew', join_date: '2026-12-01', pending_placement: true },
    });
    expect(fromLegacyCrew(pending, ctx())).toMatchObject({
      status: 'pending',
      statusDetail: 'pending_placement',
      placementKind: 'pending_placement',
      loginState: 'pending_login',
      assignmentId: null,
    });
  });

  it('a later join date reads Pending (planned), as the server does', () => {
    expect(fromLegacyCrew(member({ current_assignment: { id: 'a-2', vessel_id: 'v-dra', vessel_name: 'DRAAK', position: 'Deckhand', join_date: '2026-12-24' } }), ctx())).toMatchObject({
      status: 'pending',
      placementKind: 'planned',
    });
  });

  it('leaves out another vessel, no assignment, and a stale row whose leave date has passed', () => {
    expect(fromLegacyCrew(member({ current_assignment: { id: 'a-3', vessel_id: 'v-hyd', vessel_name: 'HYDRA', position: 'Cook', join_date: '2026-10-01' } }), ctx())).toBeNull();
    expect(fromLegacyCrew(member({ current_assignment: null }), ctx())).toBeNull();
    expect(fromLegacyCrew(member({ current_assignment: { id: 'a-4', vessel_id: 'v-dra', vessel_name: 'DRAAK', position: 'Cook', join_date: '2026-10-01', leave_date: today } }), ctx())).toBeNull();
    expect(fromLegacyCrew(member({ current_assignment: { id: 'a-5', vessel_id: 'v-dra', vessel_name: 'DRAAK', position: 'Cook', join_date: '2026-10-01', leave_date: '2026-12-01' } }), ctx())?.leaveDate).toBe('2026-12-01');
  });

  it('shows the email only when allowed, puts the Master first and marks a disabled login', () => {
    expect(fromLegacyCrew(member(), ctx({ includeEmail: false }))?.email).toBeNull();
    const master = fromLegacyCrew(member({ current_assignment: { id: 'a-6', vessel_id: 'v-dra', vessel_name: 'DRAAK', position: 'Captain', join_date: '2026-01-01' } }), ctx());
    expect(master).toMatchObject({ isMasterOffice: true, sortOrder: 0 });
    expect(fromLegacyCrew(member({ account_status: 'disabled' }), ctx())?.loginState).toBe('disabled');
  });
});

describe('the crew list report as at a day', () => {
  it('lists on board and ashore in rank order and counts the others apart', () => {
    const split = splitForReport([
      row({ profile_id: 'x', status: 'on_leave' }),
      row({ profile_id: 'm', status: 'on_board', sort_order: 1 }),
      row({ profile_id: 'a', status: 'ashore', sort_order: 9 }),
      row({ profile_id: 'p', status: 'pending' }),
      row({ profile_id: 't', status: 'on_transfer' }),
      row({ profile_id: 'b', status: 'on_board', sort_order: 5 }),
    ]);
    expect(split.aboard.map((r) => r.profileId)).toEqual(['m', 'b', 'a']);
    expect(split).toMatchObject({ onLeave: 1, pending: 1, onTransfer: 1 });
  });
});

describe('movements', () => {
  it('maps a stored row and keys a derived one by its source', () => {
    const base = {
      profile_id: 'p-1', user_id: 'u-1', first_name: 'Demo', last_name: 'Bosun', preferred_name: null, position_text: 'Bosun',
      kind: 'embark' as const, occurred_on: '2026-11-01', occurred_at: null, port: ' Palma ', source: 'manual' as const, source_id: null, notes: null,
    };
    expect(fromMovementRow({ ...base, movement_id: 'm-1' }, 0)).toMatchObject({ key: 'm-1', displayName: 'Bosun, Demo', port: 'Palma' });
    const derived = fromMovementRow({ ...base, movement_id: null, source: 'assignment', source_id: 'a-1', port: null }, 3);
    expect(derived.key).toBe('assignment:a-1:embark:2026-11-01:3');
    expect(derived.port).toBeNull();
  });
});

describe('isMissingRpc (the D-01 classifier)', () => {
  it('is true for the schema-cache miss and for an undefined function naming the RPC', () => {
    expect(isMissingRpc({ code: 'PGRST202', message: 'Could not find the function public.crew_vessel_list' }, 'crew_vessel_list')).toBe(true);
    expect(isMissingRpc({ code: '42883', message: 'function public.crew_vessel_list(uuid, date) does not exist' }, 'crew_vessel_list')).toBe(true);
  });

  it('is false for anything else, a 42883 naming another function included', () => {
    expect(isMissingRpc({ code: '42883', message: 'function public.crew_position_for(uuid, uuid, text) does not exist' }, 'crew_vessel_list')).toBe(false);
    expect(isMissingRpc({ code: '42501', message: 'crew_not_permitted' }, 'crew_vessel_list')).toBe(false);
    expect(isMissingRpc({ code: '42P01', message: 'relation does not exist' }, 'crew_vessel_list')).toBe(false);
    expect(isMissingRpc(new Error('network'), 'crew_vessel_list')).toBe(false);
    expect(isMissingRpc(null, 'crew_vessel_list')).toBe(false);
  });
});
