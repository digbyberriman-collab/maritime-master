/**
 * The hours-of-rest month machine (lib/horMonth.ts; gap/04 C39, C43, W6;
 * D-X1-6, D-X1-11, D-X1-20): every legal and illegal pair of status and
 * action, every refusal and warning, the order of the checks, and the
 * shared month cases of fixtures/horCases.json (work_rest_month_decide
 * answers the same in SQL).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ALL_SUBMISSION_STATUSES,
  availableMonthActions,
  decideMonthAction,
  isMonthOpen,
  LEGAL_FROM,
  MONTH_ACTIONS,
  MONTH_REFUSAL_TEXT,
  MONTH_STATES,
  MONTH_WARNING_TEXT,
  NEXT_STATE,
  normaliseMonthStatus,
  REFUSAL_SQLSTATE,
  SIGNER_ROLE,
  type MonthAction,
  type MonthFacts,
} from '@/modules/work-rest/lib/horMonth';
import { statusLabel } from '@/shared/components/status/statusTone';

const CASES = JSON.parse(readFileSync(join(process.cwd(), 'src/test/work-rest/fixtures/horCases.json'), 'utf8')) as {
  months: Array<{ name: string; status: string | null; action: string; facts: MonthFacts; expect: unknown }>;
};

const BASE: MonthFacts = {
  isOwn: false,
  canCreate: false,
  canApprove: false,
  canFinalApprove: false,
  sameDepartment: false,
  inMonth: true,
  stillAboard: true,
  hodStep: 'nudge',
  hodSigned: false,
  blockingUnreviewed: 0,
  lowUnreviewed: 0,
  missingDays: 0,
  reason: null,
};
const CREW: MonthFacts = { ...BASE, isOwn: true, canCreate: true };
const MASTER: MonthFacts = { ...BASE, canApprove: true, canFinalApprove: true, stillAboard: false, reason: 'A reason.' };
const HOD: MonthFacts = { ...BASE, canApprove: true, sameDepartment: true };
const ACTOR: Record<MonthAction, MonthFacts> = {
  submit: CREW,
  submit_on_behalf: MASTER,
  hod_sign: HOD,
  approve: { ...MASTER, hodSigned: true },
  lock: MASTER,
  reopen: MASTER,
};

describe('statuses', () => {
  it('legacy statuses read as the engine states', () => {
    expect(normaliseMonthStatus('crew_signed')).toBe('submitted');
    expect(normaliseMonthStatus('hod_reviewed')).toBe('hod_signed');
    expect(normaliseMonthStatus('captain_reviewed')).toBe('approved');
    for (const s of MONTH_STATES) expect(normaliseMonthStatus(s)).toBe(s);
    expect(normaliseMonthStatus('archived')).toBeNull();
    expect(normaliseMonthStatus(null)).toBeNull();
  });

  it('only a draft or reopened month (or no month yet) is open for days', () => {
    expect(isMonthOpen(null)).toBe(true);
    expect(ALL_SUBMISSION_STATUSES.filter((s) => isMonthOpen(s))).toEqual(['draft', 'reopened']);
    expect(isMonthOpen('archived')).toBe(false);
  });

  it('every status has a label in the registry, approved included', () => {
    for (const s of ALL_SUBMISSION_STATUSES) expect(statusLabel('work_rest_submission', s)).not.toBe(s);
    expect(statusLabel('work_rest_submission', 'approved')).toBe('Approved');
  });
});

describe('every pair of status and action', () => {
  const pairs = ALL_SUBMISSION_STATUSES.flatMap((s) => MONTH_ACTIONS.map((a) => [s, a] as const));
  it.each(pairs)('%s + %s', (status, action) => {
    const d = decideMonthAction(status, action, ACTOR[action]);
    const state = normaliseMonthStatus(status);
    if (state && LEGAL_FROM[action].includes(state)) {
      expect(d).toEqual({ ok: true, to: NEXT_STATE[action], warnings: [] });
    } else {
      expect(d).toEqual({ ok: false, refusal: 'illegal_transition', sqlstate: '22023' });
    }
  });

  it('the legal pairs are exactly the W6 table', () => {
    const legal = MONTH_STATES.flatMap((s) => MONTH_ACTIONS.filter((a) => decideMonthAction(s, a, ACTOR[a]).ok).map((a) => `${s}:${a}`));
    expect(legal.sort()).toEqual(
      [
        'draft:submit',
        'draft:submit_on_behalf',
        'reopened:submit',
        'reopened:submit_on_behalf',
        'submitted:hod_sign',
        'submitted:approve',
        'hod_signed:approve',
        'approved:lock',
        'submitted:reopen',
        'hod_signed:reopen',
        'approved:reopen',
        'locked:reopen',
      ].sort(),
    );
  });

  it('an unknown status or action is refused', () => {
    expect(decideMonthAction('archived', 'submit', CREW)).toEqual({ ok: false, refusal: 'illegal_transition', sqlstate: '22023' });
    expect(decideMonthAction('draft', 'withdraw', MASTER)).toEqual({ ok: false, refusal: 'action_unknown', sqlstate: '22023' });
  });

  it('a month with no row yet is a draft', () => {
    expect(decideMonthAction(null, 'submit', CREW)).toEqual({ ok: true, to: 'submitted', warnings: [] });
  });

  it('each action signs with its role; lock and reopen sign nothing', () => {
    expect(SIGNER_ROLE).toEqual({ submit: 'crew', submit_on_behalf: 'company', hod_sign: 'hod', approve: 'captain', lock: null, reopen: null });
  });
});

describe('who may act', () => {
  it('submit: only the crew member, with hours_of_rest.create', () => {
    expect(decideMonthAction('draft', 'submit', MASTER)).toMatchObject({ refusal: 'not_own_month', sqlstate: '42501' });
    expect(decideMonthAction('draft', 'submit', { ...CREW, canCreate: false })).toMatchObject({ refusal: 'not_permitted' });
  });

  it('submit on behalf: a final approver, never for their own month', () => {
    expect(decideMonthAction('draft', 'submit_on_behalf', { ...MASTER, canFinalApprove: false })).toMatchObject({ refusal: 'not_permitted' });
    expect(decideMonthAction('draft', 'submit_on_behalf', { ...MASTER, isOwn: true })).toMatchObject({ refusal: 'own_month' });
  });

  it('HoD sign: approve, not one\'s own month, own department only', () => {
    expect(decideMonthAction('submitted', 'hod_sign', { ...HOD, canApprove: false, canFinalApprove: true })).toMatchObject({ refusal: 'not_permitted' });
    expect(decideMonthAction('submitted', 'hod_sign', { ...HOD, isOwn: true })).toMatchObject({ refusal: 'own_month' });
    expect(decideMonthAction('submitted', 'hod_sign', { ...HOD, sameDepartment: false })).toMatchObject({ refusal: 'out_of_department', sqlstate: '42501' });
  });

  it('approve and reopen: a final approver, never their own month; lock may be one\'s own', () => {
    expect(decideMonthAction('submitted', 'approve', HOD)).toMatchObject({ refusal: 'not_permitted' });
    expect(decideMonthAction('submitted', 'approve', { ...MASTER, isOwn: true })).toMatchObject({ refusal: 'own_month' });
    expect(decideMonthAction('locked', 'reopen', { ...MASTER, isOwn: true })).toMatchObject({ refusal: 'own_month' });
    expect(decideMonthAction('approved', 'lock', { ...MASTER, isOwn: true })).toMatchObject({ ok: true, to: 'locked' });
    expect(decideMonthAction('approved', 'lock', HOD)).toMatchObject({ refusal: 'not_permitted' });
  });

  it('who is checked before where the month is', () => {
    expect(decideMonthAction('locked', 'approve', HOD)).toMatchObject({ refusal: 'not_permitted' });
    expect(decideMonthAction('locked', 'approve', MASTER)).toMatchObject({ refusal: 'illegal_transition' });
  });
});

describe('conditions and warnings', () => {
  it('submit needs an assignment in the month and warns about days not entered', () => {
    expect(decideMonthAction('draft', 'submit', { ...CREW, inMonth: false })).toMatchObject({ refusal: 'not_on_vessel', sqlstate: '22023' });
    expect(decideMonthAction('draft', 'submit', { ...CREW, missingDays: 2 })).toEqual({ ok: true, to: 'submitted', warnings: ['days_not_entered'] });
  });

  it('on behalf is for former crew only, with a reason (C43)', () => {
    expect(decideMonthAction('draft', 'submit_on_behalf', { ...MASTER, stillAboard: true })).toMatchObject({ refusal: 'still_on_vessel' });
    expect(decideMonthAction('draft', 'submit_on_behalf', { ...MASTER, inMonth: false })).toMatchObject({ refusal: 'not_on_vessel' });
    expect(decideMonthAction('draft', 'submit_on_behalf', { ...MASTER, reason: ' ' })).toMatchObject({ refusal: 'reason_required' });
    expect(decideMonthAction('draft', 'submit_on_behalf', { ...MASTER, reason: 'r'.repeat(2001) })).toMatchObject({ refusal: 'reason_too_long' });
    expect(decideMonthAction('draft', 'submit_on_behalf', { ...MASTER, reason: 'r'.repeat(2000) })).toMatchObject({ ok: true });
  });

  it('the HoD step off refuses an HoD signature', () => {
    expect(decideMonthAction('submitted', 'hod_sign', { ...HOD, hodStep: 'off' })).toMatchObject({ refusal: 'hod_step_off' });
  });

  it('approve: required HoD signature, then every non-low breach reviewed; low ones and the nudge warn', () => {
    expect(decideMonthAction('submitted', 'approve', { ...MASTER, hodStep: 'required' })).toMatchObject({ refusal: 'hod_signature_required' });
    expect(decideMonthAction('submitted', 'approve', { ...MASTER, hodStep: 'required', blockingUnreviewed: 2 })).toMatchObject({ refusal: 'hod_signature_required' });
    expect(decideMonthAction('hod_signed', 'approve', { ...MASTER, hodSigned: true, blockingUnreviewed: 1 })).toMatchObject({ refusal: 'breaches_unreviewed' });
    expect(decideMonthAction('hod_signed', 'approve', { ...MASTER, hodSigned: true, lowUnreviewed: 3 })).toEqual({ ok: true, to: 'approved', warnings: ['low_breaches_unreviewed'] });
    expect(decideMonthAction('submitted', 'approve', { ...MASTER, hodStep: 'nudge' })).toEqual({ ok: true, to: 'approved', warnings: ['hod_not_signed'] });
    expect(decideMonthAction('submitted', 'approve', { ...MASTER, hodStep: 'off' })).toEqual({ ok: true, to: 'approved', warnings: [] });
  });

  it('reopen needs a reason', () => {
    expect(decideMonthAction('approved', 'reopen', { ...MASTER, reason: null })).toMatchObject({ refusal: 'reason_required' });
  });

  it('every refusal and warning has a sentence and a SQLSTATE', () => {
    for (const r of Object.keys(REFUSAL_SQLSTATE)) {
      expect(MONTH_REFUSAL_TEXT[r as keyof typeof MONTH_REFUSAL_TEXT]).toMatch(/\.$/);
      expect(['42501', '22023']).toContain(REFUSAL_SQLSTATE[r as keyof typeof REFUSAL_SQLSTATE]);
    }
    expect(Object.keys(MONTH_WARNING_TEXT).sort()).toEqual(['days_not_entered', 'hod_not_signed', 'low_breaches_unreviewed']);
  });
});

describe('available actions', () => {
  it('offers what the caller may do now', () => {
    expect(availableMonthActions('draft', CREW)).toEqual(['submit']);
    expect(availableMonthActions('submitted', { ...MASTER, reason: null })).toEqual(['approve', 'reopen']);
    expect(availableMonthActions('submitted', HOD)).toEqual(['hod_sign']);
    expect(availableMonthActions('approved', MASTER)).toEqual(['lock', 'reopen']);
    expect(availableMonthActions('draft', { ...MASTER, reason: null })).toEqual(['submit_on_behalf']);
    expect(availableMonthActions('locked', CREW)).toEqual([]);
  });
});

describe('the month parity cases (horCases.json; work_rest_month_decide answers the same)', () => {
  it('cover every status and action pair and every refusal', () => {
    const pairs = CASES.months.filter((c) => c.name.startsWith('pair:'));
    expect(pairs.length).toBeGreaterThanOrEqual(ALL_SUBMISSION_STATUSES.length * MONTH_ACTIONS.length);
    const all = JSON.stringify(CASES.months.map((c) => c.expect));
    for (const r of Object.keys(REFUSAL_SQLSTATE)) expect(all, r).toContain(`"${r}"`);
    for (const w of Object.keys(MONTH_WARNING_TEXT)) expect(all, w).toContain(`"${w}"`);
  });

  it.each(CASES.months.map((c) => [c.name, c] as const))('%s', (_name, c) => {
    expect(decideMonthAction(c.status, c.action, c.facts)).toEqual(c.expect);
  });
});
