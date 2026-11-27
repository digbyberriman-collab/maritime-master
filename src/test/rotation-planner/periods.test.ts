import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { addDays, compareDates } from '@/modules/rotation-planner/lib/duration';
import { LEAVE_TYPES, requestableLeaveTypes } from '@/modules/rotation-planner/lib/leaveTypes';
import {
  LEAVE_DECISIONS,
  LEAVE_DECISION_RESULT,
  LEAVE_HOD_STEPS,
  LEAVE_REQUEST_STATUSES,
  MAX_PERIODS_PER_REQUEST,
  OPEN_PERIOD_HORIZON_DAYS,
  PERIOD_RANGE_DAYS,
  PLANNER_NOT_SET_UP_NOTICE,
  PLANNER_REFUSAL_TEXT,
  PlannerNotSetUpError,
  PlannerRefusalError,
  PlannerShapeError,
  REPLACEABLE_LEAVE_TYPE,
  coverOf,
  effectiveEnd,
  governingPeriod,
  isPlannerRpcMissing,
  isPlannerTableMissing,
  leaveDecisionCheck,
  leaveRequestActions,
  openHorizon,
  parseLeaveRequestRows,
  parsePlannerPeriodRows,
  periodsOverlap,
  periodsPayload,
  planReplace,
  plannerCrewName,
  plannerErrorOf,
  plannerRefusalOf,
  plannerRefusalText,
  rangesOverlap,
  storedPeriodsOf,
  validatePeriodsInput,
  type PeriodInput,
  type StoredPeriod,
} from '@/modules/rotation-planner/lib/periods';

const D0 = '2026-11-01';
const d = (n: number) => addDays(D0, n);
const TODAY = '2026-11-27';
const ACTIVE = LEAVE_TYPES.map((t) => t.key);

const sp = (id: string, start: number, end: number, leaveTypeKey = 'rotation', endUnknown = false): StoredPeriod => ({
  id,
  leaveTypeKey,
  start: d(start),
  end: d(end),
  endUnknown,
});

describe('constants', () => {
  it('pins the rules shared with the SQL', () => {
    expect(OPEN_PERIOD_HORIZON_DAYS).toBe(30);
    expect(MAX_PERIODS_PER_REQUEST).toBe(10);
    expect(PERIOD_RANGE_DAYS).toBe(731);
    expect(REPLACEABLE_LEAVE_TYPE).toBe('rotation');
    expect(LEAVE_REQUEST_STATUSES).toEqual(['draft', 'pending', 'approved', 'declined', 'cancelled', 'completed']);
    expect(LEAVE_DECISIONS).toEqual(['hod_review', 'approve', 'decline', 'cancel']);
    expect(LEAVE_HOD_STEPS).toEqual(['off', 'nudge', 'required']);
    expect(LEAVE_DECISION_RESULT).toEqual({ hod_review: 'pending', approve: 'approved', decline: 'declined', cancel: 'cancelled' });
  });
});

describe('rangesOverlap (mirror of planner_periods_overlap)', () => {
  /** The rule as intervals: an end-unknown period covers only its start for the overlap test (it ends before the next one). */
  const reference = (aS: number, aE: number | null, bS: number, bE: number | null) => {
    const a1 = aS, a2 = aE ?? aS, b1 = bS, b2 = bE ?? bS;
    return a1 <= b2 && b1 <= a2;
  };

  it('matches the interval model over every pair of small periods, open or closed', () => {
    const ends = (s: number): Array<number | null> => [null, s, s + 1, s + 2, s + 3, s + 5];
    let cases = 0;
    for (let aS = 0; aS <= 5; aS++) {
      for (const aE of ends(aS)) {
        for (let bS = 0; bS <= 5; bS++) {
          for (const bE of ends(bS)) {
            const got = rangesOverlap(d(aS), aE === null ? null : d(aE), d(bS), bE === null ? null : d(bE));
            expect(got, `${aS}-${aE} vs ${bS}-${bE}`).toBe(reference(aS, aE, bS, bE));
            expect(rangesOverlap(d(bS), bE === null ? null : d(bE), d(aS), aE === null ? null : d(aE))).toBe(got);
            cases++;
          }
        }
      }
    }
    expect(cases).toBe(36 * 36);
  });

  it.each<[string, number, number | null, number, number | null, boolean]>([
    ['the same start always overlaps', 0, null, 0, null, true],
    ['an earlier open period never reaches a later one', 0, null, 5, 9, false],
    ['an earlier closed period overlaps when it ends on the later start', 0, 5, 5, null, true],
    ['an earlier closed period ending the day before does not', 0, 4, 5, 9, false],
    ['two open periods on different days do not', 0, null, 3, null, false],
    ['a period inside another overlaps', 0, 10, 3, 4, true],
  ])('%s', (_w, aS, aE, bS, bE, want) => {
    expect(rangesOverlap(d(aS), aE === null ? null : d(aE), d(bS), bE === null ? null : d(bE))).toBe(want);
  });

  it('a missing start never overlaps', () => {
    expect(rangesOverlap(null, null, d(0), d(1))).toBe(false);
    expect(rangesOverlap(d(0), d(1), null, d(1))).toBe(false);
  });

  it('periodsOverlap reads ranges; coverOf drops the written end of an end-unknown period', () => {
    expect(periodsOverlap({ start: d(0), end: d(4) }, { start: d(4), end: null })).toBe(true);
    expect(coverOf(sp('a', 0, 40, 'rotation', true))).toEqual({ start: d(0), end: null });
    expect(coverOf(sp('a', 0, 40))).toEqual({ start: d(0), end: d(40) });
    expect(periodsOverlap(coverOf(sp('a', 0, 40, 'rotation', true)), { start: d(10), end: d(12) })).toBe(false);
  });
});

describe('openHorizon (mirror of planner_open_horizon)', () => {
  it('today + 30, never before the start, never past the day before the next period', () => {
    for (let s = -40; s <= 40; s += 4) {
      for (const next of [null, -50, s, s + 1, s + 2, s + 10, s + 31, s + 80]) {
        const start = addDays(TODAY, s);
        const nextStart = next === null ? null : addDays(TODAY, next);
        const ahead = compareDates(addDays(TODAY, 30), start) >= 0 ? addDays(TODAY, 30) : start;
        let want = ahead;
        if (nextStart !== null && compareDates(nextStart, start) > 0) {
          const before = addDays(nextStart, -1);
          if (compareDates(before, ahead) < 0) want = before;
        }
        expect(openHorizon(start, nextStart, TODAY), `${s}/${next}`).toBe(want);
      }
    }
  });

  it.each<[string, string, string | null, string]>([
    ['no next period: today + 30', '2026-11-01', null, '2026-12-27'],
    ['a start after today + 30: the start', '2027-02-01', null, '2027-02-01'],
    ['a next period inside the horizon: the day before it', '2026-11-01', '2026-12-01', '2026-11-30'],
    ['a next period beyond the horizon: today + 30', '2026-11-01', '2027-03-01', '2026-12-27'],
    ['a next period the day after the start: the start', '2026-11-01', '2026-11-02', '2026-11-01'],
    ['a "next" period that is not after the start is ignored', '2026-11-10', '2026-11-10', '2026-12-27'],
  ])('%s', (_w, start, next, want) => expect(openHorizon(start, next, TODAY)).toBe(want));
});

describe('effectiveEnd and governingPeriod', () => {
  it('an end-unknown period ends the day before the next one; a closed one keeps its end', () => {
    const open = sp('o', 0, 40, 'rotation', true);
    const later = sp('l', 20, 30, 'on_board');
    expect(effectiveEnd(open, [open, later])).toBe(d(19));
    expect(effectiveEnd(open, [open])).toBeNull();
    expect(effectiveEnd(later, [open, later])).toBe(d(30));
    expect(effectiveEnd(open, [open, sp('e', -5, 2, 'holiday')])).toBeNull();
    expect(effectiveEnd(open, [open, sp('n1', 30, 31), sp('n2', 10, 11)])).toBe(d(9));
  });

  it('the latest start covering a day governs it (ties by id)', () => {
    const base = sp('a', 0, 30, 'on_board');
    const inner = sp('b', 10, 12, 'holiday');
    const twin = sp('c', 10, 15, 'medical');
    expect(governingPeriod([base], d(5))?.id).toBe('a');
    expect(governingPeriod([base, inner], d(11))?.id).toBe('b');
    expect(governingPeriod([base, inner], d(13))?.id).toBe('a');
    expect(governingPeriod([base, inner, twin], d(11))?.id).toBe('b');
    expect(governingPeriod([base], d(31))).toBeNull();
    expect(governingPeriod([base], d(-1))).toBeNull();
    expect(governingPeriod([], d(0))).toBeNull();
  });

  it('an open period governs up to the next one, and every later day while none follows', () => {
    const open = sp('o', 0, 30, 'rotation', true);
    const next = sp('n', 50, 60, 'on_board');
    expect(governingPeriod([open, next], d(49))?.id).toBe('o');
    expect(governingPeriod([open, next], d(50))?.id).toBe('n');
    expect(governingPeriod([open], d(400))?.id).toBe('o');
  });
});

describe('planReplace (the replace loop of planner_period_write)', () => {
  it('without replace, every overlapping period blocks', () => {
    const plan = planReplace([sp('r', 0, 10), sp('h', 20, 25, 'holiday'), sp('far', 40, 50)], { start: d(5), end: d(22) }, false);
    expect(plan.ok).toBe(false);
    expect(plan.blockers.map((b) => b.id)).toEqual(['r', 'h']);
    expect([plan.deletes, plan.updates, plan.inserts]).toEqual([[], [], []]);
  });

  it('with replace, a non-rotation period still blocks', () => {
    const plan = planReplace([sp('h', 0, 10, 'holiday'), sp('r', 12, 14)], { start: d(5), end: d(13) }, true);
    expect(plan.ok).toBe(false);
    expect(plan.blockers.map((b) => b.id)).toEqual(['h']);
    expect(plan.updates).toEqual([{ id: 'r', start: d(14), end: d(14), endUnknown: false }]);
  });

  it('trims a rotation period that starts before', () => {
    const plan = planReplace([sp('r', 0, 10)], { start: d(5), end: d(20) }, true);
    expect(plan).toEqual({ ok: true, blockers: [], deletes: [], updates: [{ id: 'r', start: d(0), end: d(4), endUnknown: false }], inserts: [] });
  });

  it('splits a rotation period around the new one', () => {
    const plan = planReplace([sp('r', 0, 30)], { start: d(10), end: d(12) }, true);
    expect(plan.updates).toEqual([{ id: 'r', start: d(0), end: d(9), endUnknown: false }]);
    expect(plan.inserts).toEqual([{ fromId: 'r', start: d(13), end: d(30), endUnknown: false }]);
    expect(plan.ok).toBe(true);
  });

  it('leaves an open rotation period that starts before alone (it already ends before the new one)', () => {
    const plan = planReplace([sp('r', 0, 60, 'rotation', true)], { start: d(10), end: d(12) }, true);
    expect(plan).toEqual({ ok: true, blockers: [], deletes: [], updates: [], inserts: [] });
  });

  it('removes a rotation period inside the new one, or any later one under an open new period', () => {
    expect(planReplace([sp('r', 5, 8)], { start: d(5), end: d(10) }, true).deletes).toEqual(['r']);
    expect(planReplace([sp('r', 5, 10)], { start: d(5), end: d(10) }, true).deletes).toEqual(['r']);
    expect(planReplace([sp('r', 5, 40)], { start: d(5), end: null }, true).deletes).toEqual(['r']);
  });

  it('moves a later rotation period to start after the new one', () => {
    const plan = planReplace([sp('r', 5, 30)], { start: d(5), end: d(10) }, true);
    expect(plan.updates).toEqual([{ id: 'r', start: d(11), end: d(30), endUnknown: false }]);
    const open = planReplace([sp('r', 5, 8, 'rotation', true)], { start: d(5), end: d(10) }, true);
    expect(open.updates).toEqual([{ id: 'r', start: d(11), end: d(11), endUnknown: true }]);
    const openFar = planReplace([sp('r', 5, 40, 'rotation', true)], { start: d(5), end: d(10) }, true);
    expect(openFar.updates).toEqual([{ id: 'r', start: d(11), end: d(40), endUnknown: true }]);
  });

  it('ignores periods that do not overlap and keeps the start order', () => {
    const plan = planReplace([sp('late', 30, 40), sp('early', 0, 3)], { start: d(5), end: d(10) }, true);
    expect(plan).toEqual({ ok: true, blockers: [], deletes: [], updates: [], inserts: [] });
    const both = planReplace([sp('b', 8, 20), sp('a', 0, 6)], { start: d(5), end: d(10) }, true);
    expect(both.updates.map((u) => u.id)).toEqual(['a', 'b']);
  });
});

describe('validatePeriodsInput (mirror of planner_periods_parse)', () => {
  const p = (start: string, end: string | null, leaveTypeKey = 'holiday', endUnknown = end === null): PeriodInput => ({ leaveTypeKey, start, end, endUnknown });
  const opts = { today: TODAY, activeTypeKeys: ACTIVE };

  it('accepts one to ten periods that do not overlap', () => {
    expect(validatePeriodsInput([p('2026-12-01', '2026-12-05')], opts)).toEqual({ ok: true });
    const ten = Array.from({ length: 10 }, (_, i) => p(addDays('2026-12-01', i * 3), addDays('2026-12-01', i * 3 + 1)));
    expect(validatePeriodsInput(ten, opts)).toEqual({ ok: true });
    expect(validatePeriodsInput([p('2026-12-01', '2026-12-05'), p('2026-12-10', null)], opts)).toEqual({ ok: true });
  });

  it.each<[string, PeriodInput[], string, number | null]>([
    ['no period', [], 'periods_required', null],
    ['eleven periods', Array.from({ length: 11 }, (_, i) => p(addDays('2026-12-01', i * 3), addDays('2026-12-01', i * 3))), 'periods_too_many', null],
    ['an unknown type', [p('2026-12-01', '2026-12-02', 'annual')], 'leave_type_unknown', 1],
    ['a bad start', [p('2026-12-01', '2026-12-02'), p('2026-02-30', '2026-03-02')], 'period_invalid', 2],
    ['a bad end', [p('2026-12-01', '2026-13-02')], 'period_invalid', 1],
    ['end unknown with an end', [p('2026-12-01', '2026-12-02', 'holiday', true)], 'period_invalid', 1],
    ['no end and not end unknown', [p('2026-12-01', null, 'holiday', false)], 'period_invalid', 1],
    ['an end before the start', [p('2026-12-05', '2026-12-01')], 'period_dates_invalid', 1],
    ['a start more than two years back', [p(addDays(TODAY, -732), addDays(TODAY, -700))], 'period_out_of_range', 1],
    ['a start more than two years ahead', [p(addDays(TODAY, 732), null)], 'period_out_of_range', 1],
    ['an end more than two years ahead', [p(TODAY, addDays(TODAY, 732))], 'period_out_of_range', 1],
    ['two overlapping periods', [p('2026-12-01', '2026-12-05'), p('2026-12-05', '2026-12-08')], 'periods_overlap', 2],
    ['two periods on the same start', [p('2026-12-01', null), p('2026-12-01', '2026-12-02')], 'periods_overlap', 2],
  ])('refuses %s', (_w, periods, refusal, index) => {
    expect(validatePeriodsInput(periods, opts)).toEqual({ ok: false, refusal, index });
  });

  it('accepts the edges of the two-year range', () => {
    expect(validatePeriodsInput([p(addDays(TODAY, -731), addDays(TODAY, -700))], opts)).toEqual({ ok: true });
    expect(validatePeriodsInput([p(TODAY, addDays(TODAY, 731))], opts)).toEqual({ ok: true });
  });

  it('every refusal has a sentence', () => {
    for (const r of ['periods_required', 'periods_too_many', 'period_invalid', 'leave_type_unknown', 'period_dates_invalid', 'period_out_of_range', 'periods_overlap']) {
      expect(PLANNER_REFUSAL_TEXT[r]).toBeTruthy();
    }
  });
});

describe('leaveDecisionCheck (mirror of planner_leave_decide_check)', () => {
  const B = [false, true];
  const STATUSES = ['pending', 'approved', 'declined', 'cancelled', 'draft'];
  const REFUSALS = new Set([
    '22023:decision_invalid', '22023:illegal_transition', '22023:hod_step_off', '42501:own_request', '42501:not_department_hod',
    '22023:already_reviewed', '42501:not_permitted', '22023:hod_review_pending', '22023:reason_required', '42501:ask_approver',
  ]);
  const all = function* () {
    for (const decision of [...LEAVE_DECISIONS, 'reject'])
      for (const status of STATUSES)
        for (const owner of B) for (const approver of B) for (const hod of B) for (const mf of B)
          for (const step of LEAVE_HOD_STEPS) for (const reviewed of B) for (const reason of B)
            yield { decision, status, owner, approver, hod, mf, step, reviewed, reason, r: leaveDecisionCheck(decision, status, owner, approver, hod, mf, step, reviewed, reason) };
  };

  it('answers ok or a known refusal for every case', () => {
    let n = 0;
    for (const c of all()) {
      expect(c.r === 'ok' || REFUSALS.has(c.r), JSON.stringify(c)).toBe(true);
      n++;
    }
    expect(n).toBe(5 * 5 * 2 ** 6 * 3);
  });

  it('nobody approves, declines or reviews their own request; a requester may withdraw it while pending', () => {
    for (const c of all()) {
      if (!c.owner) continue;
      if (c.decision === 'approve' || c.decision === 'decline' || c.decision === 'hod_review') expect(c.r).not.toBe('ok');
      if (c.decision === 'cancel' && c.status === 'pending') expect(c.r).toBe('ok');
    }
  });

  it('only a pending request is reviewed, approved or declined; only pending or approved is cancelled', () => {
    for (const c of all()) {
      if (c.r !== 'ok') continue;
      if (c.decision === 'cancel') expect(['pending', 'approved']).toContain(c.status);
      else expect(c.status).toBe('pending');
    }
  });

  it('a required HoD step holds approval until reviewed, unless Master or fleet', () => {
    for (const c of all()) {
      if (c.decision !== 'approve' || c.status !== 'pending' || c.owner || !c.approver) continue;
      const held = c.step === 'required' && !c.reviewed && !c.mf;
      expect(c.r).toBe(held ? '22023:hod_review_pending' : 'ok');
    }
  });

  it('a decline needs a reason and an approver or the HoD (step on)', () => {
    for (const c of all()) {
      if (c.decision !== 'decline' || c.status !== 'pending' || c.owner) continue;
      const may = c.approver || (c.hod && c.step !== 'off');
      expect(c.r).toBe(!may ? '42501:not_permitted' : c.reason ? 'ok' : '22023:reason_required');
    }
  });

  it.each<[string, Parameters<typeof leaveDecisionCheck>, string]>([
    ['an unknown decision', ['reject', 'pending', false, true, false, false, 'nudge', false, true], '22023:decision_invalid'],
    ['a null decision', [null, 'pending', false, true, false, false, 'nudge', false, true], '22023:decision_invalid'],
    ['HoD review with the step off', ['hod_review', 'pending', false, false, true, false, 'off', false, false], '22023:hod_step_off'],
    ['HoD review by someone else', ['hod_review', 'pending', false, true, false, false, 'nudge', false, false], '42501:not_department_hod'],
    ['HoD review twice', ['hod_review', 'pending', false, false, true, false, 'required', true, false], '22023:already_reviewed'],
    ['HoD review', ['hod_review', 'pending', false, false, true, false, 'nudge', false, false], 'ok'],
    ['approval without the right', ['approve', 'pending', false, false, true, false, 'nudge', true, false], '42501:not_permitted'],
    ['approval of a decided request', ['approve', 'approved', false, true, false, false, 'nudge', false, false], '22023:illegal_transition'],
    ['approval, step nudge, not reviewed', ['approve', 'pending', false, true, false, false, 'nudge', false, false], 'ok'],
    ['approval by the Master over a required step', ['approve', 'pending', false, true, false, true, 'required', false, false], 'ok'],
    ['an approver cancelling approved leave without a reason', ['cancel', 'approved', false, true, false, false, 'nudge', false, false], '22023:reason_required'],
    ['an approver cancelling approved leave with a reason', ['cancel', 'approved', false, true, false, false, 'nudge', false, true], 'ok'],
    ['an approver cancelling their own approved leave', ['cancel', 'approved', true, true, false, false, 'nudge', false, false], 'ok'],
    ['a crew member cancelling approved leave', ['cancel', 'approved', true, false, false, false, 'nudge', false, true], '42501:ask_approver'],
    ['a stranger cancelling', ['cancel', 'pending', false, false, true, false, 'nudge', false, true], '42501:not_permitted'],
    ['cancelling a declined request', ['cancel', 'declined', true, true, false, false, 'nudge', false, true], '22023:illegal_transition'],
    ['nulls read as no, the step as nudge', ['approve', 'pending', null, true, null, null, null, null, null], 'ok'],
    ['a null status', ['cancel', null, true, true, false, false, 'nudge', false, true], '22023:illegal_transition'],
  ])('%s', (_w, args, want) => expect(leaveDecisionCheck(...args)).toBe(want));
});

describe('leaveRequestActions', () => {
  const ctx = { status: 'pending', isOwner: false, isApprover: true, isHod: false, isMasterOrFleet: false, hodStep: 'nudge' as const, hodReviewed: false };

  it('an approver of a pending request: approve, decline (reason), cancel (reason)', () => {
    expect(leaveRequestActions(ctx)).toEqual([
      { decision: 'approve', needsReason: false },
      { decision: 'decline', needsReason: true },
      { decision: 'cancel', needsReason: true },
    ]);
  });

  it('the requester of a pending request: withdraw only, no reason', () => {
    expect(leaveRequestActions({ ...ctx, isOwner: true })).toEqual([{ decision: 'cancel', needsReason: false }]);
  });

  it('the HoD with the step on: review and decline', () => {
    expect(leaveRequestActions({ ...ctx, isApprover: false, isHod: true })).toEqual([
      { decision: 'hod_review', needsReason: false },
      { decision: 'decline', needsReason: true },
    ]);
  });

  it('an approver while a required step is pending: decline and cancel only', () => {
    expect(leaveRequestActions({ ...ctx, hodStep: 'required' }).map((a) => a.decision)).toEqual(['decline', 'cancel']);
  });

  it('nothing on a declined request', () => {
    expect(leaveRequestActions({ ...ctx, status: 'declined' })).toEqual([]);
  });
});

describe('refusal sentences', () => {
  it('prefers the server sentence, then the planner sentence, then a generic one', () => {
    expect(plannerRefusalText('period_overlap', 'This period overlaps Holiday from 1 Dec.')).toBe('This period overlaps Holiday from 1 Dec.');
    expect(plannerRefusalText('period_overlap', 'period_overlap')).toBe(PLANNER_REFUSAL_TEXT.period_overlap);
    expect(plannerRefusalText('period_overlap', '  ')).toBe(PLANNER_REFUSAL_TEXT.period_overlap);
    expect(plannerRefusalText('period_overlap')).toBe(PLANNER_REFUSAL_TEXT.period_overlap);
    expect(plannerRefusalText('something_new', null)).toBe('The planner could not save this change.');
  });

  it('has a sentence for every refusal a planner RPC can raise (the migration and the decision check)', () => {
    const sql = readFileSync(resolve(process.cwd(), 'supabase/migrations/20261124060900_crew_planner_periods.sql'), 'utf8');
    const words = new Set([...sql.matchAll(/MESSAGE = '([a-z_]+)'/g)].map((m) => m[1]));
    const guardOnly = new Set([
      'planner_engine_only', 'planner_period_scope_mismatch', 'leave_request_engine_only', 'leave_request_scope_mismatch',
      'leave_request_period_locked', 'leave_request_period_scope_mismatch', 'crew_leave_settings_scope_mismatch',
    ]);
    const decision = ['decision_invalid', 'illegal_transition', 'hod_step_off', 'own_request', 'not_department_hod', 'already_reviewed', 'not_permitted', 'hod_review_pending', 'reason_required', 'ask_approver'];
    const missing = [...words, ...decision, 'vessel_required'].filter((w) => !guardOnly.has(w) && !PLANNER_REFUSAL_TEXT[w]);
    expect(missing).toEqual([]);
    expect(words.size).toBeGreaterThan(30);
    expect(Object.isFrozen(PLANNER_REFUSAL_TEXT)).toBe(true);
  });
});

describe('plannerCrewName', () => {
  it.each<[Parameters<typeof plannerCrewName>[0], string]>([
    [{ preferredName: 'Sam', firstName: 'Samuel', lastName: 'Deckhand' }, 'Sam Deckhand'],
    [{ preferredName: 'Sam', firstName: 'Samuel', lastName: null }, 'Sam'],
    [{ preferredName: ' ', firstName: 'Chief', lastName: 'Steward' }, 'Chief Steward'],
    [{ firstName: 'Cook', lastName: '' }, 'Cook'],
    [{ firstName: null, lastName: 'Bosun' }, 'Bosun'],
    [{ rawName: ' Imported Deckhand ' }, 'Imported Deckhand'],
    [{}, 'Unnamed crew'],
  ])('%j -> %s', (input, want) => expect(plannerCrewName(input)).toBe(want));
});

const periodRow = (over: Record<string, unknown> = {}) => ({
  id: 'p1',
  vessel_id: 'v1',
  profile_id: 'pr1',
  crew_user_id: 'u1',
  crew_name_raw: null,
  first_name: 'Deck',
  last_name: 'Hand',
  preferred_name: null,
  leave_type_key: 'on_board',
  status: 'confirmed',
  start_date: '2026-11-01',
  end_date: '2026-11-30',
  end_unknown: false,
  effective_end: '2026-11-30',
  request_id: null,
  approved_by: null,
  approved_at: null,
  is_sick_on_board: false,
  notes: null,
  version: 3,
  updated_at: '2026-11-27T10:00:00Z',
  ...over,
});

describe('parsePlannerPeriodRows', () => {
  it('reads the RPC rows strictly into camel case', () => {
    expect(parsePlannerPeriodRows([periodRow(), periodRow({ id: 'p2', end_unknown: true, effective_end: null, leave_type_key: null, crew_user_id: null, first_name: null, last_name: null, crew_name_raw: 'Imported Cook' })])).toEqual([
      {
        id: 'p1', vesselId: 'v1', profileId: 'pr1', crewUserId: 'u1', crewName: 'Deck Hand', leaveTypeKey: 'on_board', status: 'confirmed',
        start: '2026-11-01', end: '2026-11-30', endUnknown: false, effectiveEnd: '2026-11-30', requestId: null, approvedBy: null, approvedAt: null,
        isSickOnBoard: false, notes: null, version: 3, updatedAt: '2026-11-27T10:00:00Z',
      },
      {
        id: 'p2', vesselId: 'v1', profileId: 'pr1', crewUserId: null, crewName: 'Imported Cook', leaveTypeKey: null, status: 'confirmed',
        start: '2026-11-01', end: '2026-11-30', endUnknown: true, effectiveEnd: null, requestId: null, approvedBy: null, approvedAt: null,
        isSickOnBoard: false, notes: null, version: 3, updatedAt: '2026-11-27T10:00:00Z',
      },
    ]);
    expect(parsePlannerPeriodRows([])).toEqual([]);
  });

  it.each([
    ['not an array', { x: 1 }],
    ['a row that is not an object', [[]]],
    ['an unknown status', [periodRow({ status: 'approved' })]],
    ['no version', [periodRow({ version: '3' })]],
    ['no id', [periodRow({ id: '' })]],
    ['a timestamp start', [periodRow({ start_date: '2026-11-01T00:00:00Z' })]],
    ['no end', [periodRow({ end_date: null })]],
    ['an end before the start', [periodRow({ end_date: '2026-10-01' })]],
    ['a text flag', [periodRow({ end_unknown: 'false' })]],
    ['a numeric note', [periodRow({ notes: 5 })]],
    ['a bad effective end', [periodRow({ effective_end: 'soon' })]],
    ['no update time', [periodRow({ updated_at: null })]],
  ])('refuses %s', (_w, rows) => expect(() => parsePlannerPeriodRows(rows)).toThrow(PlannerShapeError));
});

describe('storedPeriodsOf and periodsPayload', () => {
  it('keeps the confirmed and complete typed periods of one person', () => {
    const periods = parsePlannerPeriodRows([
      periodRow({ id: 'a' }),
      periodRow({ id: 'b', status: 'complete', leave_type_key: 'rotation' }),
      periodRow({ id: 'c', status: 'draft' }),
      periodRow({ id: 'd', leave_type_key: null }),
      periodRow({ id: 'e', profile_id: 'other' }),
    ]);
    expect(storedPeriodsOf(periods, 'pr1')).toEqual([
      { id: 'a', leaveTypeKey: 'on_board', start: '2026-11-01', end: '2026-11-30', endUnknown: false },
      { id: 'b', leaveTypeKey: 'rotation', start: '2026-11-01', end: '2026-11-30', endUnknown: false },
    ]);
  });

  it('sends snake case and no end for an end-unknown period', () => {
    expect(periodsPayload([
      { leaveTypeKey: 'holiday', start: '2026-12-01', end: '2026-12-05', endUnknown: false },
      { leaveTypeKey: 'rotation', start: '2026-12-10', end: '2026-12-31', endUnknown: true },
    ])).toEqual([
      { leave_type_key: 'holiday', start_date: '2026-12-01', end_date: '2026-12-05', end_unknown: false },
      { leave_type_key: 'rotation', start_date: '2026-12-10', end_date: null, end_unknown: true },
    ]);
  });
});

describe('parseLeaveRequestRows', () => {
  const req = (over: Record<string, unknown> = {}) => ({
    id: 'r1',
    company_id: 'c1',
    vessel_id: 'v1',
    crew_id: 'u1',
    profile_id: 'pr1',
    leave_type: 'L',
    start_date: '2026-12-01',
    end_date: '2026-12-20',
    status: 'pending',
    notes: null,
    submitted_at: '2026-11-27T09:00:00Z',
    hod_reviewed_at: null,
    hod_reviewed_by: null,
    reviewed_at: null,
    reviewed_by: null,
    cancellation_reason: null,
    ...over,
  });
  const per = (over: Record<string, unknown> = {}) => ({ id: 'q1', request_id: 'r1', leave_type_key: 'holiday', start_date: '2026-12-01', end_date: '2026-12-05', end_unknown: false, sort_order: 0, ...over });
  const legacy = (code: string) => (code === 'L' ? 'holiday' : code === 'M' ? 'medical' : null);

  it('joins the periods in their order', () => {
    const [r] = parseLeaveRequestRows([req()], [per({ id: 'q2', sort_order: 1, start_date: '2026-12-15', end_date: null, end_unknown: true, leave_type_key: 'rotation' }), per()], legacy);
    expect(r.periods.map((p) => [p.id, p.leaveTypeKey, p.start, p.end, p.endUnknown])).toEqual([
      ['q1', 'holiday', '2026-12-01', '2026-12-05', false],
      ['q2', 'rotation', '2026-12-15', null, true],
    ]);
    expect(r).toMatchObject({ id: 'r1', companyId: 'c1', vesselId: 'v1', profileId: 'pr1', crewUserId: 'u1', status: 'pending', start: '2026-12-01', end: '2026-12-20' });
  });

  it('reads a legacy request without periods as its own range and type', () => {
    const [r] = parseLeaveRequestRows([req({ leave_type: 'M', status: 'approved' })], [], legacy);
    expect(r.periods).toEqual([{ id: 'r1:legacy', leaveTypeKey: 'medical', start: '2026-12-01', end: '2026-12-20', endUnknown: false, sortOrder: 0 }]);
  });

  it('answers nothing for no requests', () => {
    expect(parseLeaveRequestRows([], [], legacy)).toEqual([]);
  });

  it.each([
    ['requests not an array', 'x', []],
    ['periods not an array', [req()], null],
    ['an unknown status', [req({ status: 'rejected' })], []],
    ['a legacy request of an unknown code', [req({ leave_type: 'Z' })], []],
    ['a request without a login', [req({ crew_id: null })], []],
    ['a period without an order', [req()], [per({ sort_order: null })]],
    ['a period with a bad start', [req()], [per({ start_date: '2026-12-32' })]],
    ['a period without a request', [req()], [per({ request_id: null })]],
    ['a period that is not an object', [req()], ['x']],
  ])('refuses %s', (_w, requests, periods) => expect(() => parseLeaveRequestRows(requests, periods, legacy)).toThrow(PlannerShapeError));
});

describe('errors (D-01)', () => {
  it('a missing RPC: PGRST202, or a 42883 that names the function', () => {
    expect(isPlannerRpcMissing({ code: 'PGRST202', message: 'Could not find the function public.planner_vessel_periods' }, 'planner_vessel_periods')).toBe(true);
    expect(isPlannerRpcMissing({ code: '42883', message: 'function public.planner_vessel_periods(uuid, date, date) does not exist' }, 'planner_vessel_periods')).toBe(true);
    expect(isPlannerRpcMissing({ code: '42883', message: 'function public.crew_vessel_gate(text) does not exist' }, 'planner_vessel_periods')).toBe(false);
    expect(isPlannerRpcMissing({ code: '42501', message: 'crew_not_permitted' }, 'planner_vessel_periods')).toBe(false);
    expect(isPlannerRpcMissing(null, 'x')).toBe(false);
    expect(isPlannerRpcMissing('PGRST202', 'x')).toBe(false);
  });

  it('a missing table: 42P01 or PGRST205 only', () => {
    expect(isPlannerTableMissing({ code: '42P01' })).toBe(true);
    expect(isPlannerTableMissing({ code: 'PGRST205' })).toBe(true);
    expect(isPlannerTableMissing({ code: '42703' })).toBe(false);
    expect(isPlannerTableMissing(undefined)).toBe(false);
  });

  it('a refusal carries its word, code, sentence and hint', () => {
    const r = plannerRefusalOf({ code: '22023', message: 'period_overlap', details: 'This period overlaps Holiday from 1 Dec.', hint: 'abc' });
    expect(r).toBeInstanceOf(PlannerRefusalError);
    expect(r).toMatchObject({ refusal: 'period_overlap', code: '22023', hint: 'abc', message: 'This period overlaps Holiday from 1 Dec.' });
    const bare = plannerRefusalOf({ code: '42501', message: 'crew_not_permitted', details: null, hint: '' });
    expect(bare).toMatchObject({ refusal: 'crew_not_permitted', hint: null, message: PLANNER_REFUSAL_TEXT.crew_not_permitted });
    expect(plannerRefusalOf({ message: 'Failed to fetch' })).toBeNull();
    expect(plannerRefusalOf({ message: 'duplicate key value violates unique constraint' })).toBeNull();
    expect(plannerRefusalOf(null)).toBeNull();
  });

  it('plannerErrorOf: not set up, a refusal, or the error itself', () => {
    const missing = plannerErrorOf({ code: 'PGRST202', message: 'x' }, 'planner_add_leave');
    expect(missing).toBeInstanceOf(PlannerNotSetUpError);
    expect((missing as PlannerNotSetUpError).fn).toBe('planner_add_leave');
    expect((missing as Error).message).toBe(PLANNER_NOT_SET_UP_NOTICE);
    expect(plannerErrorOf({ code: '42P01', message: 'relation "leave_types" does not exist' }, 'x')).toBeInstanceOf(PlannerNotSetUpError);
    expect(plannerErrorOf({ code: '22023', message: 'periods_overlap', hint: '2' }, 'x')).toBeInstanceOf(PlannerRefusalError);
    const network = new TypeError('Failed to fetch');
    expect(plannerErrorOf(network, 'x')).toBe(network);
  });
});

describe('the request types offered match the SQL rule (leave types that are time off)', () => {
  it('requestable types are exactly the is_leave ones', () => {
    expect(requestableLeaveTypes().every((t) => t.isLeave)).toBe(true);
    expect(requestableLeaveTypes()).toHaveLength(LEAVE_TYPES.filter((t) => t.isLeave).length);
  });
});
