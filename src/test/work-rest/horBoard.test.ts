/**
 * The vessel hours-of-rest board model (lib/horBoard.ts; gap/04 C40-C45,
 * W6; T-144; X1-08): the strict reader of work_rest_vessel_board, months
 * and the URL, the queues (first match wins), departments, the card (day
 * states, the status menu, on behalf, Remind and its last-reminded line),
 * the start notice (C45), and the breach review rules and forms.
 */
import { describe, expect, it } from 'vitest';
import {
  BOARD_QUEUES,
  BREACH_FILTER_LABEL,
  BoardShapeError,
  CORRECTION_PENDING_TEXT,
  MONTH_NAMES,
  OTHER_DEPARTMENT,
  QUEUE_LABEL,
  REMIND_BLOCK_TEXT,
  REVIEW_OUTCOME_LABEL,
  boardStartNotice,
  breachFigures,
  breachReviewSchema,
  breachState,
  canSubmitOnBehalf,
  compareMonths,
  deficitText,
  departmentGroups,
  departmentTabs,
  displayName,
  filterBreaches,
  filterMembers,
  isBoardQueue,
  isOpenBreach,
  longDate,
  memberDays,
  memberMonthFacts,
  memberMonthState,
  memberQueue,
  menuItems,
  monthLabel,
  monthOf,
  monthParam,
  monthRange,
  onBehalfSchema,
  parseBreachFilter,
  parseMonthParam,
  parseVesselBoard,
  positionLabel,
  queueCounts,
  reminderLine,
  remindState,
  remindableWaiting,
  reopenSchema,
  reviewOptions,
  ruleLabel,
  shiftMonth,
  sortBreaches,
  viewerMayAct,
  type BoardMember,
  type BoardViewer,
  type VesselBoard,
} from '@/modules/work-rest/lib/horBoard';
import { MONTH_REFUSAL_TEXT } from '@/modules/work-rest/lib/horMonth';

// ─── The server's answer ─────────────────────────────────────────────────

type RawMember = Record<string, unknown>;

const rawMember = (over: Partial<RawMember> & { user_id: string }): RawMember => ({
  profile_id: `p-${over.user_id}`,
  first_name: 'Demo',
  last_name: 'Crew',
  preferred_name: null,
  avatar_url: null,
  position_name: 'Deckhand',
  position_text: null,
  department_key: 'deck',
  department_label: 'Deck',
  sort_order: 10,
  assignments: [{ from: '2026-10-01', to: null }],
  month: { submission_id: null, status: null, submitted_at: null, on_behalf: false, hod_signed: false, approved_at: null, locked_at: null },
  days: { records: [1, 2, 3], leave: [], breach: [], warning: [] },
  counts: {
    expected: 20,
    logged: 3,
    missing: 17,
    breach_days: 0,
    unreviewed: 0,
    blocking_unreviewed: 0,
    low_unreviewed: 0,
    awaiting_correction: 0,
    serious_open: 0,
  },
  still_aboard: true,
  former_crew: false,
  on_leave_all_month: false,
  last_reminder: null,
  reminded_today: false,
  ...over,
});

const rawBoard = (members: RawMember[], over: Record<string, unknown> = {}): Record<string, unknown> => ({
  vessel_id: 'v-dra',
  year: 2026,
  month: 11,
  today: '2026-11-20',
  first_day: '2026-11-01',
  last_day: '2026-11-30',
  hor: { off: false, from: null },
  hod_step: 'nudge',
  can_final_approve: true,
  my_department_key: 'deck',
  members,
  ...over,
});

const month = (status: string | null, over: Record<string, unknown> = {}) => ({
  submission_id: status ? 's-1' : null,
  status,
  submitted_at: null,
  on_behalf: false,
  hod_signed: false,
  approved_at: null,
  locked_at: null,
  ...over,
});

const counts = (over: Record<string, number> = {}) => ({
  expected: 20,
  logged: 20,
  missing: 0,
  breach_days: 0,
  unreviewed: 0,
  blocking_unreviewed: 0,
  low_unreviewed: 0,
  awaiting_correction: 0,
  serious_open: 0,
  ...over,
});

const MASTER: BoardViewer = { userId: 'u-master' };
const HOD: BoardViewer = { userId: 'u-hod' };

const board = (members: RawMember[], over: Record<string, unknown> = {}): VesselBoard => parseVesselBoard(rawBoard(members, over));
const one = (m: RawMember, over: Record<string, unknown> = {}): { b: VesselBoard; m: BoardMember } => {
  const b = board([m], over);
  return { b, m: b.members[0] };
};

// ─── parseVesselBoard ────────────────────────────────────────────────────

describe('parseVesselBoard: the strict reader', () => {
  it('reads every field, camel-cased', () => {
    const b = board([
      rawMember({
        user_id: 'u-1',
        last_reminder: { kind: 'manual', sent_on: '2026-11-03', sent_at: '2026-11-03T08:00:00Z', by_label: 'Chief Officer' },
        month: month('submitted', { on_behalf: true, hod_signed: true }),
      }),
    ]);
    expect(b).toMatchObject({ vesselId: 'v-dra', year: 2026, month: 11, today: '2026-11-20', hodStep: 'nudge', canFinalApprove: true, myDepartmentKey: 'deck' });
    expect(b.hor).toEqual({ off: false, from: null });
    const m = b.members[0];
    expect(m).toMatchObject({ profileId: 'p-u-1', userId: 'u-1', departmentKey: 'deck', stillAboard: true, formerCrew: false });
    expect(m.month).toMatchObject({ status: 'submitted', onBehalf: true, hodSigned: true });
    expect(m.counts).toMatchObject({ expected: 20, missing: 17, blockingUnreviewed: 0 });
    expect(m.lastReminder).toEqual({ kind: 'manual', sentOn: '2026-11-03', sentAt: '2026-11-03T08:00:00Z', byLabel: 'Chief Officer' });
    expect(m.assignments).toEqual([{ from: '2026-10-01', to: null }]);
  });

  it('accepts integers sent as strings (bigint counts), and ignores the start date when Hours of Rest is off', () => {
    const b = board([rawMember({ user_id: 'u-1', counts: { ...counts(), expected: '20', logged: '7' } })], { hor: { off: true, from: '2026-01-01' }, year: '2026' });
    expect(b.year).toBe(2026);
    expect(b.members[0].counts.logged).toBe(7);
    expect(b.hor).toEqual({ off: true, from: null });
  });

  it.each([
    ['no members array', { members: null }],
    ['a month out of range', { month: 13 }],
    ['an unknown HoD step', { hod_step: 'sometimes' }],
    ['a malformed day', { today: '20/11/2026' }],
    ['no vessel', { vessel_id: '' }],
    ['hor not an object', { hor: true }],
  ])('throws BoardShapeError on %s', (_what, over) => {
    expect(() => parseVesselBoard(rawBoard([rawMember({ user_id: 'u-1' })], over))).toThrow(BoardShapeError);
  });

  it.each([
    ['a day outside 1-31', { days: { records: [0], leave: [], breach: [], warning: [] } }],
    ['a fractional count', { counts: { ...counts(), logged: 2.5 } }],
    ['an unknown reminder kind', { last_reminder: { kind: 'carrier_pigeon', sent_on: '2026-11-01' } }],
    ['a reminder without its day', { last_reminder: { kind: 'manual', sent_on: null } }],
    ['a boolean as text', { still_aboard: 'yes' }],
    ['no assignments', { assignments: null }],
    ['a malformed assignment day', { assignments: [{ from: 'soon', to: null }] }],
  ])('throws on a member with %s', (_what, over) => {
    expect(() => parseVesselBoard(rawBoard([rawMember({ user_id: 'u-1', ...over })]))).toThrow(/unexpected shape/);
  });

  it('a non-object answer throws', () => {
    expect(() => parseVesselBoard(null)).toThrow(BoardShapeError);
    expect(() => parseVesselBoard([])).toThrow(BoardShapeError);
  });
});

// ─── Months and the URL ──────────────────────────────────────────────────

describe('months and the URL', () => {
  it('labels and parameters', () => {
    expect(monthLabel({ year: 2026, month: 11 })).toBe('November 2026');
    expect(monthParam({ year: 2026, month: 3 })).toBe('2026-03');
    expect(MONTH_NAMES).toHaveLength(12);
  });

  it('parses ?month=YYYY-MM and the legacy ?year=&month=, and nothing else', () => {
    expect(parseMonthParam('2026-11')).toEqual({ year: 2026, month: 11 });
    expect(parseMonthParam('11', '2026')).toEqual({ year: 2026, month: 11 });
    expect(parseMonthParam('2026-13')).toBeNull();
    expect(parseMonthParam('1999-01')).toBeNull();
    expect(parseMonthParam('11')).toBeNull();
    expect(parseMonthParam('0', '2026')).toBeNull();
    expect(parseMonthParam(null, '2026')).toBeNull();
    expect(parseMonthParam('nov')).toBeNull();
  });

  it('shifts across years, compares, and finds the month of a day and its range', () => {
    expect(shiftMonth({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
    expect(shiftMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth({ year: 2026, month: 11 }, -12)).toEqual({ year: 2025, month: 11 });
    expect(compareMonths({ year: 2026, month: 11 }, { year: 2026, month: 10 })).toBeGreaterThan(0);
    expect(compareMonths({ year: 2025, month: 12 }, { year: 2026, month: 1 })).toBeLessThan(0);
    expect(compareMonths({ year: 2026, month: 5 }, { year: 2026, month: 5 })).toBe(0);
    expect(monthOf('2026-02-28')).toEqual({ year: 2026, month: 2 });
    expect(monthRange({ year: 2028, month: 2 })).toEqual({ from: '2028-02-01', to: '2028-02-29' });
    expect(monthRange({ year: 2026, month: 11 })).toEqual({ from: '2026-11-01', to: '2026-11-30' });
  });

  it('long dates', () => {
    expect(longDate('2026-12-01')).toBe('1 December 2026');
  });
});

// ─── Queues ──────────────────────────────────────────────────────────────

describe('queues (first match wins)', () => {
  it('the four chips, in order, with their labels', () => {
    expect(BOARD_QUEUES).toEqual(['ready', 'waiting', 'approved', 'on_leave']);
    expect(BOARD_QUEUES.map((q) => QUEUE_LABEL[q])).toEqual(['Ready for you', 'Waiting on crew', 'Approved', 'On leave']);
    expect(isBoardQueue('ready')).toBe(true);
    expect(isBoardQueue('in_review')).toBe(false);
    expect(isBoardQueue(null)).toBe(false);
  });

  it('approved and locked months are Approved (legacy captain_reviewed too), even on leave', () => {
    for (const status of ['approved', 'locked', 'captain_reviewed']) {
      const { b, m } = one(rawMember({ user_id: 'u-1', month: month(status), on_leave_all_month: true }));
      expect(memberQueue(m, b, MASTER), status).toBe('approved');
    }
  });

  it('on leave all month is On leave when not approved', () => {
    const { b, m } = one(rawMember({ user_id: 'u-1', month: month('submitted'), on_leave_all_month: true }));
    expect(memberQueue(m, b, MASTER)).toBe('on_leave');
  });

  it('no month, a draft or a reopened month is Waiting on crew', () => {
    for (const status of [null, 'draft', 'reopened']) {
      const { b, m } = one(rawMember({ user_id: 'u-1', month: month(status) }));
      expect(memberQueue(m, b, MASTER), String(status)).toBe('waiting');
    }
  });

  it('a submitted month is Ready for the final approver, also when breaches still need review', () => {
    const { b, m } = one(rawMember({ user_id: 'u-1', month: month('submitted') }));
    expect(memberQueue(m, b, MASTER)).toBe('ready');
    const blocked = one(rawMember({ user_id: 'u-1', month: month('submitted'), counts: counts({ unreviewed: 2, blocking_unreviewed: 2 }) }));
    expect(memberQueue(blocked.m, blocked.b, MASTER)).toBe('ready');
    expect(viewerMayAct(blocked.m, blocked.b, MASTER)).toBe(true);
  });

  it('the viewer\'s own month is never theirs to sign: in review', () => {
    const { b, m } = one(rawMember({ user_id: 'u-master', month: month('submitted') }));
    expect(memberQueue(m, b, MASTER)).toBe('in_review');
  });

  it('a head of department: a submitted month of their department is Ready; another department, or HoD-signed, is in review', () => {
    const hod = { can_final_approve: false, my_department_key: 'deck', hod_step: 'required' };
    const own = one(rawMember({ user_id: 'u-1', month: month('submitted') }), hod);
    expect(memberQueue(own.m, own.b, HOD)).toBe('ready');
    const other = one(rawMember({ user_id: 'u-1', department_key: 'interior', month: month('submitted') }), hod);
    expect(memberQueue(other.m, other.b, HOD)).toBe('in_review');
    const signed = one(rawMember({ user_id: 'u-1', month: month('hod_signed', { hod_signed: true }) }), hod);
    expect(memberQueue(signed.m, signed.b, HOD)).toBe('in_review');
    const off = one(rawMember({ user_id: 'u-1', month: month('submitted') }), { ...hod, hod_step: 'off' });
    expect(memberQueue(off.m, off.b, HOD)).toBe('in_review');
  });

  it('a HoD-signed month is Ready for the final approver', () => {
    const { b, m } = one(rawMember({ user_id: 'u-1', month: month('hod_signed', { hod_signed: true }) }), { hod_step: 'required' });
    expect(memberQueue(m, b, MASTER)).toBe('ready');
  });

  it('counts: the four chips, in review only under All', () => {
    const b = board([
      rawMember({ user_id: 'u-1', month: month('submitted') }),
      rawMember({ user_id: 'u-2', month: month(null) }),
      rawMember({ user_id: 'u-3', month: month('reopened') }),
      rawMember({ user_id: 'u-4', month: month('approved') }),
      rawMember({ user_id: 'u-5', on_leave_all_month: true }),
      rawMember({ user_id: 'u-master', month: month('submitted') }),
    ]);
    expect(queueCounts(b.members, b, MASTER)).toEqual({ all: 6, ready: 1, waiting: 2, approved: 1, on_leave: 1 });
  });
});

// ─── Departments ─────────────────────────────────────────────────────────

describe('departments', () => {
  const b = board([
    rawMember({ user_id: 'u-1', department_key: 'deck', department_label: 'Deck' }),
    rawMember({ user_id: 'u-2', department_key: 'engine', department_label: null }),
    rawMember({ user_id: 'u-3', department_key: null, department_label: null }),
    rawMember({ user_id: 'u-4', department_key: 'deck', department_label: 'Deck' }),
    rawMember({ user_id: 'u-5', department_key: 'guest_services', department_label: null, month: month('approved') }),
  ]);

  it('groups in the server\'s order, a missing label humanised, no department last as Other', () => {
    const groups = departmentGroups(b.members);
    expect(groups.map((g) => [g.key, g.label, g.members.map((m) => m.userId)])).toEqual([
      ['deck', 'Deck', ['u-1', 'u-4']],
      ['engine', 'Engine', ['u-2']],
      ['guest_services', 'Guest services', ['u-5']],
      [OTHER_DEPARTMENT, 'Other', ['u-3']],
    ]);
  });

  it('tabs: All first, then each department with its count', () => {
    expect(departmentTabs(b.members)).toEqual([
      { key: 'all', label: 'All', count: 5 },
      { key: 'deck', label: 'Deck', count: 2 },
      { key: 'engine', label: 'Engine', count: 1 },
      { key: 'guest_services', label: 'Guest services', count: 1 },
      { key: 'other', label: 'Other', count: 1 },
    ]);
  });

  it('filters by department (Other for none), by queue, and both', () => {
    expect(filterMembers(b.members, { dept: 'deck', queue: null }, b, MASTER).map((m) => m.userId)).toEqual(['u-1', 'u-4']);
    expect(filterMembers(b.members, { dept: 'other', queue: null }, b, MASTER).map((m) => m.userId)).toEqual(['u-3']);
    expect(filterMembers(b.members, { dept: 'all', queue: 'approved' }, b, MASTER).map((m) => m.userId)).toEqual(['u-5']);
    expect(filterMembers(b.members, { dept: 'deck', queue: 'approved' }, b, MASTER)).toEqual([]);
    expect(filterMembers(b.members, { dept: null, queue: null }, b, MASTER)).toHaveLength(5);
  });
});

// ─── The card ────────────────────────────────────────────────────────────

describe('the card', () => {
  it('names: preferred first name, else first name, with the last name; never blank', () => {
    expect(displayName({ preferredName: 'Sam', firstName: 'Samuel', lastName: 'Deck' })).toBe('Sam Deck');
    expect(displayName({ preferredName: ' ', firstName: 'Ann', lastName: null })).toBe('Ann');
    expect(displayName({ preferredName: null, firstName: null, lastName: null })).toBe('Crew member');
    const { m } = one(rawMember({ user_id: 'u-1', position_name: null, position_text: 'Bosun' }));
    expect(positionLabel(m)).toBe('Bosun');
    const { m: none } = one(rawMember({ user_id: 'u-1', position_name: null, position_text: null }));
    expect(positionLabel(none)).toBe('Crew');
  });

  it('the month state: no row is a draft; legacy statuses normalised', () => {
    expect(memberMonthState(one(rawMember({ user_id: 'u-1' })).m)).toBe('draft');
    expect(memberMonthState(one(rawMember({ user_id: 'u-1', month: month('crew_signed') })).m)).toBe('submitted');
  });

  it('the days: entered, leave, breach and warning overlays, not expected outside the assignment and after today', () => {
    const { b, m } = one(
      rawMember({
        user_id: 'u-1',
        assignments: [{ from: '2026-11-03', to: '2026-11-25' }],
        days: { records: [3, 4, 5], leave: [6], breach: [4], warning: [5] },
      }),
    );
    const days = memberDays(m, b);
    expect(days).toHaveLength(30);
    const at = (d: number) => days[d - 1].day;
    expect(at(2)).toMatchObject({ state: 'not_expected', reason: 'not_assigned' });
    expect(at(3)).toMatchObject({ state: 'entered', breach: false, warning: false });
    expect(at(4)).toMatchObject({ state: 'entered', breach: true, warning: false });
    expect(at(5)).toMatchObject({ state: 'entered', breach: false, warning: true });
    expect(at(6)).toMatchObject({ state: 'leave' });
    expect(at(7)).toMatchObject({ state: 'not_entered' });
    expect(at(21)).toMatchObject({ state: 'not_expected', reason: 'future' });
    expect(days[0].date).toBe('2026-11-01');
  });

  it('the days follow the month: submitted and approved; before the start date not expected (C45)', () => {
    const sub = one(rawMember({ user_id: 'u-1', month: month('submitted'), days: { records: [10], leave: [], breach: [], warning: [] } }), { hor: { off: false, from: '2026-11-08' } });
    const days = memberDays(sub.m, sub.b);
    expect(days[9].day.state).toBe('submitted');
    expect(days[6].day).toMatchObject({ state: 'not_expected', reason: 'before_start' });
    const app = one(rawMember({ user_id: 'u-1', month: month('locked'), days: { records: [10], leave: [], breach: [], warning: [] } }));
    expect(memberDays(app.m, app.b)[9].day.state).toBe('approved');
  });

  it('the status menu for the final approver: approve on a submitted month, HoD sign when in their department, reopen', () => {
    const { b, m } = one(rawMember({ user_id: 'u-1', month: month('submitted') }));
    expect(menuItems(m, b, MASTER)).toEqual([
      { action: 'hod_sign', label: 'Sign as head of department', disabledReason: null, needsReason: false },
      { action: 'approve', label: 'Approve month', disabledReason: null, needsReason: false },
      { action: 'reopen', label: 'Reopen month', disabledReason: null, needsReason: true },
    ]);
  });

  it('approve is disabled with the sentence while breaches are unreviewed, the HoD signature is required, or a correction is requested', () => {
    const blocked = one(rawMember({ user_id: 'u-1', department_key: 'engine', month: month('submitted'), counts: counts({ blocking_unreviewed: 1, unreviewed: 1 }) }));
    expect(menuItems(blocked.m, blocked.b, MASTER).find((i) => i.action === 'approve')?.disabledReason).toBe(MONTH_REFUSAL_TEXT.breaches_unreviewed);
    const hodReq = one(rawMember({ user_id: 'u-1', department_key: 'engine', month: month('submitted') }), { hod_step: 'required' });
    expect(menuItems(hodReq.m, hodReq.b, MASTER).find((i) => i.action === 'approve')?.disabledReason).toBe(MONTH_REFUSAL_TEXT.hod_signature_required);
    const corr = one(rawMember({ user_id: 'u-1', department_key: 'engine', month: month('submitted'), counts: counts({ awaiting_correction: 1 }) }));
    expect(menuItems(corr.m, corr.b, MASTER).find((i) => i.action === 'approve')?.disabledReason).toBe(CORRECTION_PENDING_TEXT);
  });

  it('who-refusals and steps the month is not at are left out', () => {
    const own = one(rawMember({ user_id: 'u-master', month: month('submitted') }));
    expect(menuItems(own.m, own.b, MASTER).map((i) => i.action)).toEqual([]);
    const draft = one(rawMember({ user_id: 'u-1', month: month(null) }));
    expect(menuItems(draft.m, draft.b, MASTER)).toEqual([]);
    const approved = one(rawMember({ user_id: 'u-1', month: month('approved') }));
    expect(menuItems(approved.m, approved.b, MASTER).map((i) => i.action)).toEqual(['lock', 'reopen']);
    const locked = one(rawMember({ user_id: 'u-1', month: month('locked') }));
    expect(menuItems(locked.m, locked.b, MASTER).map((i) => i.action)).toEqual(['reopen']);
    const hodOnly = one(rawMember({ user_id: 'u-1', month: month('submitted') }), { can_final_approve: false });
    expect(menuItems(hodOnly.m, hodOnly.b, HOD).map((i) => i.action)).toEqual(['hod_sign']);
    const otherDept = one(rawMember({ user_id: 'u-1', department_key: 'engine', month: month('submitted') }), { can_final_approve: false });
    expect(menuItems(otherDept.m, otherDept.b, HOD)).toEqual([]);
  });

  it('memberMonthFacts: the board gate grants approve; the rest from the board', () => {
    const { b, m } = one(rawMember({ user_id: 'u-1', still_aboard: false, counts: counts({ missing: 4, low_unreviewed: 1 }) }));
    expect(memberMonthFacts(m, b, MASTER, 'why')).toMatchObject({
      isOwn: false,
      canCreate: false,
      canApprove: true,
      canFinalApprove: true,
      sameDepartment: true,
      inMonth: true,
      stillAboard: false,
      missingDays: 4,
      lowUnreviewed: 1,
      reason: 'why',
    });
  });

  it('submit on their behalf (C43): the final approver, someone who has left, an open month', () => {
    const gone = rawMember({ user_id: 'u-1', still_aboard: false, former_crew: true });
    expect(canSubmitOnBehalf(one(gone).m, one(gone).b, MASTER)).toBe(true);
    const reopened = rawMember({ user_id: 'u-1', still_aboard: false, former_crew: true, month: month('reopened') });
    expect(canSubmitOnBehalf(one(reopened).m, one(reopened).b, MASTER)).toBe(true);
    const aboard = rawMember({ user_id: 'u-1' });
    expect(canSubmitOnBehalf(one(aboard).m, one(aboard).b, MASTER)).toBe(false);
    const submitted = rawMember({ user_id: 'u-1', still_aboard: false, month: month('submitted') });
    expect(canSubmitOnBehalf(one(submitted).m, one(submitted).b, MASTER)).toBe(false);
    const hod = one(gone, { can_final_approve: false });
    expect(canSubmitOnBehalf(hod.m, hod.b, HOD)).toBe(false);
  });

  it('the last-reminded line', () => {
    expect(reminderLine(null)).toBeNull();
    expect(reminderLine({ kind: 'manual', sentOn: '2026-11-03', sentAt: null, byLabel: 'Chief Officer' })).toBe('Reminded 3 Nov by Chief Officer');
    expect(reminderLine({ kind: 'manual', sentOn: '2026-11-03', sentAt: null, byLabel: null })).toBe('Reminded 3 Nov');
    expect(reminderLine({ kind: 'auto_month_start', sentOn: '2026-12-01', sentAt: null, byLabel: null })).toBe('Reminded automatically 1 Dec');
    expect(reminderLine({ kind: 'pre_cutoff', sentOn: '2026-11-28', sentAt: null, byLabel: 'ignored' })).toBe('Reminded automatically 28 Nov');
  });

  it('Remind: offered for an open month of someone else not on leave and not reminded today', () => {
    const at = (over: Partial<RawMember>, viewer: BoardViewer = MASTER) => remindState(one(rawMember({ user_id: 'u-1', ...over })).m, viewer);
    expect(at({})).toEqual({ can: true, block: null });
    expect(at({ month: month('reopened') })).toEqual({ can: true, block: null });
    expect(at({}, { userId: 'u-1' })).toEqual({ can: false, block: 'own_month' });
    expect(at({ month: month('submitted') })).toEqual({ can: false, block: 'month_closed' });
    expect(at({ month: month('approved'), reminded_today: true })).toEqual({ can: false, block: 'month_closed' });
    expect(at({ on_leave_all_month: true })).toEqual({ can: false, block: 'on_leave' });
    expect(at({ reminded_today: true })).toEqual({ can: false, block: 'reminded_today' });
    expect(REMIND_BLOCK_TEXT.reminded_today).toBe('Already reminded today.');
  });

  it('Remind all waiting: the waiting crew who can be reminded now', () => {
    const b = board([
      rawMember({ user_id: 'u-1' }),
      rawMember({ user_id: 'u-2', reminded_today: true }),
      rawMember({ user_id: 'u-3', month: month('submitted') }),
      rawMember({ user_id: 'u-master' }),
      rawMember({ user_id: 'u-5', month: month('reopened') }),
    ]);
    expect(remindableWaiting(b.members, b, MASTER).map((m) => m.userId)).toEqual(['u-1', 'u-5']);
  });
});

// ─── The start notice (C45) ──────────────────────────────────────────────

describe('the start notice (C45)', () => {
  it('off, a month wholly before the start date, else nothing (a start inside the month is a partial month)', () => {
    expect(boardStartNotice({ hor: { off: true, from: null }, lastDay: '2026-11-30' })).toEqual({ kind: 'off' });
    expect(boardStartNotice({ hor: { off: false, from: '2026-12-01' }, lastDay: '2026-11-30' })).toEqual({ kind: 'before_start', from: '2026-12-01' });
    expect(boardStartNotice({ hor: { off: false, from: '2026-11-15' }, lastDay: '2026-11-30' })).toBeNull();
    expect(boardStartNotice({ hor: { off: false, from: '2026-11-30' }, lastDay: '2026-11-30' })).toBeNull();
    expect(boardStartNotice({ hor: { off: false, from: null }, lastDay: '2026-11-30' })).toBeNull();
  });
});

// ─── Breach review (C42) ─────────────────────────────────────────────────

const breach = (over: Partial<{ status: string | null; review_outcome: string | null; breach_report_id: string | null; can_review: boolean }> = {}) => ({
  status: 'open' as string | null,
  review_outcome: null as string | null,
  breach_report_id: null as string | null,
  can_review: true,
  ...over,
});

describe('breach review (C42)', () => {
  it('open breaches: unreviewed, or waiting on a correction', () => {
    expect(isOpenBreach(breach())).toBe(true);
    expect(isOpenBreach(breach({ status: null }))).toBe(true);
    expect(isOpenBreach(breach({ review_outcome: 'correction_requested', status: 'reviewed' }))).toBe(true);
    expect(isOpenBreach(breach({ review_outcome: 'accepted', status: 'justified' }))).toBe(false);
    expect(isOpenBreach(breach({ review_outcome: 'dismissed', status: 'dismissed' }))).toBe(false);
    expect(isOpenBreach(breach({ status: 'justified' }))).toBe(false);
  });

  it('the outcomes the server allows', () => {
    expect(reviewOptions(breach())).toEqual(['accepted', 'correction_requested']);
    expect(reviewOptions(breach({ review_outcome: 'correction_requested', status: 'reviewed' }))).toEqual(['accepted', 'dismissed']);
    expect(reviewOptions(breach({ review_outcome: 'accepted', status: 'justified' }))).toEqual([]);
    expect(reviewOptions(breach({ breach_report_id: 'r-1' }))).toEqual([]);
    expect(reviewOptions(breach({ can_review: false }))).toEqual([]);
    expect(reviewOptions(breach({ status: 'corrected' }))).toEqual([]);
    expect(REVIEW_OUTCOME_LABEL).toEqual({ accepted: 'Accept with justification', correction_requested: 'Request correction', dismissed: 'Dismiss' });
  });

  it('the state a row reads as: reported, the outcome, else the status', () => {
    expect(breachState(breach({ breach_report_id: 'r-1', review_outcome: 'accepted' }))).toBe('reported');
    expect(breachState(breach({ review_outcome: 'correction_requested' }))).toBe('correction_requested');
    expect(breachState(breach())).toBe('open');
    expect(breachState(breach({ status: null }))).toBe('open');
  });

  it('the deficit column: hours to two decimals, a dash without one', () => {
    expect(deficitText(9)).toBe('9 h');
    expect(deficitText(2.5)).toBe('2.5 h');
    expect(deficitText(1.256)).toBe('1.26 h');
    expect(deficitText(null)).toBe('–');
    expect(deficitText(undefined)).toBe('–');
    expect(deficitText(Number.NaN)).toBe('–');
  });

  it('rule words and what was measured', () => {
    expect(ruleLabel('REST_24H_MIN')).toBe('Rest in 24 h');
    expect(ruleLabel('SOMETHING_NEW')).toBe('SOMETHING_NEW');
    expect(breachFigures('REST_24H_MIN', 6, 10)).toBe('6 h rest, needs 10 h');
    expect(breachFigures('REST_7D_MIN', 70.5, 77)).toBe('70.5 h rest, needs 77 h');
    expect(breachFigures('REST_PERIODS_MAX', 3, 2)).toBe('3 rest periods, at most 2');
    expect(breachFigures('REST_INTERVAL_MAX', 15, 14)).toBe('15 h between rests, at most 14 h');
    expect(breachFigures('REST_LONG_BLOCK_MIN', 5, 6)).toBe('Longest rest 5 h, needs 6 h');
    expect(breachFigures('REST_24H_MIN', null, 10)).toBeNull();
    expect(breachFigures('REST_24H_MIN', Number.NaN, 10)).toBeNull();
  });

  it('the order: serious first, then still to review, then by day and name', () => {
    const row = (id: string, o: Partial<{ is_serious: boolean; review_outcome: string | null; status: string | null; breach_day: string; last_name: string }>) => ({
      id,
      is_serious: false,
      status: 'open' as string | null,
      review_outcome: null as string | null,
      breach_day: '2026-11-05',
      last_name: 'B',
      first_name: 'X',
      ...o,
    });
    const sorted = sortBreaches([
      row('reviewed-early', { review_outcome: 'accepted', status: 'justified', breach_day: '2026-11-01' }),
      row('open-late', { breach_day: '2026-11-09' }),
      row('serious-reviewed', { is_serious: true, review_outcome: 'accepted', status: 'justified' }),
      row('open-early-b', { breach_day: '2026-11-02', last_name: 'B' }),
      row('open-early-a', { breach_day: '2026-11-02', last_name: 'A' }),
      row('serious-open', { is_serious: true }),
    ]);
    expect(sorted.map((r) => r.id)).toEqual(['serious-open', 'serious-reviewed', 'open-early-a', 'open-early-b', 'open-late', 'reviewed-early']);
  });

  it('filters: Non-compliant only keeps the open ones; the URL value', () => {
    const rows = [breach(), breach({ review_outcome: 'accepted', status: 'justified' }), breach({ review_outcome: 'correction_requested' })];
    expect(filterBreaches(rows, 'open')).toHaveLength(2);
    expect(filterBreaches(rows, 'all')).toHaveLength(3);
    expect(BREACH_FILTER_LABEL).toEqual({ open: 'Non-compliant only', all: 'All breaches' });
    expect(parseBreachFilter('open')).toBe('open');
    expect(parseBreachFilter('all')).toBe('all');
    expect(parseBreachFilter('1')).toBeNull();
    expect(parseBreachFilter(null)).toBeNull();
  });

  it('the review form: accepting needs a justification; notes at most 2000 characters', () => {
    expect(breachReviewSchema.safeParse({ outcome: 'accepted', note: '  ' }).success).toBe(false);
    expect(breachReviewSchema.safeParse({ outcome: 'accepted', note: 'Fire drill' }).success).toBe(true);
    expect(breachReviewSchema.safeParse({ outcome: 'correction_requested', note: '' }).success).toBe(true);
    expect(breachReviewSchema.safeParse({ outcome: 'dismissed', note: '' }).success).toBe(true);
    expect(breachReviewSchema.safeParse({ outcome: 'correction_requested', note: 'x'.repeat(2001) }).success).toBe(false);
    expect(breachReviewSchema.safeParse({ outcome: 'ignored', note: '' }).success).toBe(false);
  });

  it('the on-behalf and reopen forms need a reason', () => {
    expect(onBehalfSchema.safeParse({ reason: '' }).success).toBe(false);
    expect(onBehalfSchema.safeParse({ reason: 'Signed off in port before the cut-off' }).success).toBe(true);
    expect(onBehalfSchema.safeParse({ reason: 'x'.repeat(2001) }).success).toBe(false);
    expect(reopenSchema.safeParse({ reason: '   ' }).success).toBe(false);
    expect(reopenSchema.safeParse({ reason: 'Day 12 was entered on the wrong vessel' }).success).toBe(true);
  });
});
