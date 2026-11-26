/**
 * The training application machine (X5-07A, gap/02 W3, TR4–TR6): the TS
 * mirror in lib/applicationMachine.ts against the two copies the SQL test
 * walks (supabase/tests/sql/fleet/training_transitions.test.sql, whose
 * machine and actor tables are compared there with the server's
 * development_transition_target() and development_action_actors()) and
 * against the vocabularies of 20261124040600_fleet_training_core.sql. Then
 * the rules the UI reads: the final-approval mode, who acts next, the stale
 * rule, what each action needs, the actions a viewer is offered, the
 * refusal sentences and the D-X5-20 fallback set.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ACTION_DONE,
  ACTION_LABELS,
  APPLICATION_ACTIONS,
  APPLICATION_ACTORS,
  APPLICATION_STATUSES,
  AWAITING_APPROVAL_STATUSES,
  STALE_AFTER_DAYS,
  TERMINAL_STATUSES,
  TRANSITION_NOT_SET_UP,
  TRANSITION_REFUSALS,
  actionActors,
  actionRequirement,
  actorRows,
  availableActions,
  finalApprovalCompletes,
  hasApproved,
  hasLegacyFallback,
  isStale,
  machineRows,
  nextActor,
  pendingFinalApprovers,
  stageEnteredAt,
  statusAfterFinalApproval,
  transitionRefusalMessage,
  transitionTarget,
  type ApplicationAction,
  type ApplicationStatus,
} from '@/modules/development/lib/applicationMachine';

const ROOT = process.cwd();
const MIGRATION = readFileSync(join(ROOT, 'supabase/migrations/20261124040600_fleet_training_core.sql'), 'utf8');
const SQL_TEST = readFileSync(join(ROOT, 'supabase/tests/sql/fleet/training_transitions.test.sql'), 'utf8');

/** The text between `-- <name>:start` and `-- <name>:end`. */
function block(name: string): string {
  const start = SQL_TEST.indexOf(`-- ${name}:start`);
  const end = SQL_TEST.indexOf(`-- ${name}:end`);
  expect(start, `${name} start marker`).toBeGreaterThan(-1);
  expect(end, `${name} end marker`).toBeGreaterThan(start);
  return SQL_TEST.slice(start, end);
}

const triples = (text: string): Array<[string, string, string]> =>
  [...text.matchAll(/\('([a-z_]+)', '([a-z_]+)', '([!a-z_|]+)'\)/g)].map((m) => [m[1], m[2], m[3]]);

/** The quoted words of the named CHECK constraint (the part after its `IN (`). */
function checkList(constraint: string): string[] {
  const at = MIGRATION.indexOf(`ADD CONSTRAINT ${constraint} CHECK`);
  expect(at, constraint).toBeGreaterThan(-1);
  const open = MIGRATION.indexOf('IN (', at);
  const close = MIGRATION.indexOf(')', open);
  return [...MIGRATION.slice(open, close).matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
}

/** The body of a function in the migration. */
function functionBody(name: string): string {
  const at = MIGRATION.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  expect(at, name).toBeGreaterThan(-1);
  const start = MIGRATION.indexOf('AS $$', at);
  return MIGRATION.slice(start, MIGRATION.indexOf('\n$$;', start));
}

const app = (status: ApplicationStatus, over: Record<string, unknown> = {}) => ({ status, ...over });

describe('the machine table', () => {
  it('has every (status, action) pair exactly once: 16 × 14', () => {
    const rows = machineRows();
    expect(rows).toHaveLength(APPLICATION_STATUSES.length * APPLICATION_ACTIONS.length);
    expect(rows).toHaveLength(224);
    expect(new Set(rows.map(([s, a]) => `${s}/${a}`)).size).toBe(224);
  });

  it('is the copy the SQL test compares with development_transition_target()', () => {
    expect(triples(block('machine-table'))).toEqual(machineRows());
  });

  it('is the copy the SQL test compares with development_action_actors()', () => {
    const rows = actorRows();
    expect(triples(block('actor-table'))).toEqual(rows);
    expect(rows).toHaveLength(machineRows().filter(([, , out]) => !out.startsWith('!')).length);
    expect(rows).toHaveLength(61);
  });

  it('uses exactly the status, action and actor vocabularies of 040600', () => {
    expect(checkList('development_applications_status_check')).toEqual([...APPLICATION_STATUSES]);
    expect(checkList('development_application_events_from_status_check')).toEqual([...APPLICATION_STATUSES]);
    expect(checkList('development_application_events_to_status_check')).toEqual([...APPLICATION_STATUSES]);
    expect(checkList('development_application_events_action_check')).toEqual(['created', ...APPLICATION_ACTIONS, 'course_promoted']);
    expect(checkList('development_application_events_role_check')).toEqual([...APPLICATION_ACTORS]);
  });

  it('ends at a status of the list, or refuses with a code the definer raises', () => {
    const body = functionBody('development_transition_target');
    for (const [, , out] of machineRows()) {
      if (out.startsWith('!')) expect(body).toContain(`'${out}'`);
      else expect(APPLICATION_STATUSES).toContain(out);
    }
  });

  it('lets a voided application do nothing and a finished one only be voided', () => {
    for (const action of APPLICATION_ACTIONS) {
      expect(transitionTarget('voided', action)).toEqual({ ok: false, refusal: 'application_voided' });
      for (const status of ['rejected', 'cancelled', 'closed'] as const) {
        expect(transitionTarget(status, action)).toEqual(
          action === 'void' ? { ok: true, to: 'voided' } : { ok: false, refusal: 'application_final' },
        );
      }
    }
    for (const status of APPLICATION_STATUSES) {
      if (status !== 'voided') expect(transitionTarget(status, 'void')).toEqual({ ok: true, to: 'voided' });
    }
    expect(TERMINAL_STATUSES).toEqual(['rejected', 'cancelled', 'closed', 'voided']);
  });

  it('walks the happy path draft → closed', () => {
    const steps: Array<[ApplicationStatus, ApplicationAction, ApplicationStatus]> = [
      ['draft', 'submit', 'hod_review'],
      ['hod_review', 'hod_approve', 'captain_purser_review'],
      ['captain_purser_review', 'final_approve', 'approved'],
      ['approved', 'enrol', 'enrolled'],
      ['enrolled', 'complete', 'completed'],
      ['completed', 'reimburse', 'reimbursed'],
      ['reimbursed', 'close', 'closed'],
    ];
    for (const [from, action, to] of steps) expect(transitionTarget(from, action)).toEqual({ ok: true, to });
  });

  it('keeps the legacy review statuses working (submitted, purser_review, captain_review)', () => {
    expect(transitionTarget('submitted', 'hod_approve')).toEqual({ ok: true, to: 'captain_purser_review' });
    expect(transitionTarget('purser_review', 'final_approve')).toEqual({ ok: true, to: 'approved' });
    expect(transitionTarget('captain_review', 'final_approve_discretionary')).toEqual({ ok: true, to: 'discretionary_approved' });
  });

  it('distinguishes return (back to the applicant) from reject (ends it)', () => {
    expect(transitionTarget('hod_review', 'hod_return')).toEqual({ ok: true, to: 'returned' });
    expect(transitionTarget('captain_purser_review', 'return')).toEqual({ ok: true, to: 'returned' });
    expect(transitionTarget('hod_review', 'reject')).toEqual({ ok: true, to: 'rejected' });
    expect(transitionTarget('captain_purser_review', 'reject')).toEqual({ ok: true, to: 'rejected' });
    expect(transitionTarget('returned', 'submit')).toEqual({ ok: true, to: 'hod_review' });
    expect(transitionTarget('hod_review', 'return').ok).toBe(false);
    expect(transitionTarget('captain_purser_review', 'hod_return').ok).toBe(false);
  });

  it('keeps the status on edit_fields, only while the application is open', () => {
    for (const status of APPLICATION_STATUSES) {
      const out = transitionTarget(status, 'edit_fields');
      if (out.ok) expect(out.to).toBe(status);
    }
    expect(transitionTarget('draft', 'edit_fields').ok).toBe(false);
    expect(transitionTarget('completed', 'edit_fields').ok).toBe(false);
  });
});

describe('who acts', () => {
  it('never lets the applicant approve, return or reject', () => {
    for (const action of ['hod_approve', 'hod_return', 'final_approve', 'final_approve_discretionary', 'return', 'reject', 'reimburse', 'close', 'void', 'edit_fields'] as const) {
      for (const status of APPLICATION_STATUSES) expect(actionActors(action, status)).not.toContain('applicant');
    }
  });

  it('gives the discretionary approval to the Captain only', () => {
    for (const status of APPLICATION_STATUSES) {
      const actors = actionActors('final_approve_discretionary', status);
      expect(actors.length === 0 || (actors.length === 1 && actors[0] === 'captain')).toBe(true);
    }
  });

  it('lets the applicant cancel before approval, and the approvers after it', () => {
    expect(actionActors('cancel', 'draft')).toEqual(['applicant']);
    expect(actionActors('cancel', 'hod_review')).toEqual(['applicant']);
    expect(actionActors('cancel', 'approved')).toEqual(['captain', 'purser', 'training_admin']);
    expect(actionActors('cancel', 'completed')).toEqual([]);
  });

  it('has the head of department reject at the HOD stage and the final approvers later', () => {
    expect(actionActors('reject', 'hod_review')).toEqual(['hod']);
    expect(actionActors('reject', 'captain_purser_review')).toEqual(['captain', 'purser']);
  });

  it('is empty for every refused pair', () => {
    for (const [status, action, out] of machineRows()) {
      if (out.startsWith('!')) expect(actionActors(action, status)).toEqual([]);
      else expect(actionActors(action, status).length).toBeGreaterThan(0);
    }
  });
});

describe('the final review (D-X5-06)', () => {
  it("'either' completes on the first approval", () => {
    expect(finalApprovalCompletes('either', 'captain', {})).toBe(true);
    expect(finalApprovalCompletes('either', 'purser', {})).toBe(true);
    expect(statusAfterFinalApproval('captain_purser_review', 'either', 'purser', {}, false)).toBe('approved');
  });

  it("'both' waits for the other office", () => {
    expect(finalApprovalCompletes('both', 'captain', {})).toBe(false);
    expect(statusAfterFinalApproval('captain_purser_review', 'both', 'captain', {}, false)).toBe('captain_purser_review');
    expect(finalApprovalCompletes('both', 'purser', { captain_decision: 'approved' })).toBe(true);
    expect(statusAfterFinalApproval('captain_purser_review', 'both', 'purser', { captain_decision: 'approved' }, false)).toBe('approved');
    expect(finalApprovalCompletes('both', 'captain', { purser_decision: 'approved' })).toBe(true);
  });

  it('keeps a discretionary Captain approval discretionary to the end', () => {
    expect(statusAfterFinalApproval('captain_purser_review', 'either', 'captain', {}, true)).toBe('discretionary_approved');
    const captainFirst = { captain_decision: 'discretionary_approved', is_discretionary: true };
    expect(statusAfterFinalApproval('captain_purser_review', 'both', 'purser', captainFirst, false)).toBe('discretionary_approved');
  });

  it('lists who is still to decide', () => {
    expect(pendingFinalApprovers('both', {})).toEqual(['captain', 'purser']);
    expect(pendingFinalApprovers('both', { captain_decision: 'approved' })).toEqual(['purser']);
    expect(pendingFinalApprovers('both', { captain_decision: 'approved', purser_decision: 'approved' })).toEqual([]);
    expect(pendingFinalApprovers('either', {})).toEqual(['captain', 'purser']);
    expect(pendingFinalApprovers('either', { purser_decision: 'approved' })).toEqual([]);
    expect(hasApproved('captain', { captain_decision: 'discretionary_approved' })).toBe(true);
    expect(hasApproved('purser', { purser_decision: 'returned' })).toBe(false);
  });
});

describe('who acts next and the stale rule', () => {
  it('names the next actor for each stage', () => {
    expect(nextActor(app('draft'), 'both')).toMatchObject({ kind: 'applicant' });
    expect(nextActor(app('returned'), 'both')).toMatchObject({ kind: 'applicant', label: 'Returned for changes' });
    expect(nextActor(app('hod_review'), 'both')).toMatchObject({ kind: 'hod' });
    expect(nextActor(app('captain_purser_review'), 'both')).toEqual({
      kind: 'final',
      roles: ['captain', 'purser'],
      label: 'Waiting for the Captain and the Purser',
    });
    expect(nextActor(app('captain_purser_review', { captain_decision: 'approved' }), 'both').label).toBe('Waiting for the Purser');
    expect(nextActor(app('captain_purser_review'), 'either').label).toBe('Waiting for the Captain or the Purser');
    expect(nextActor(app('completed'), 'both')).toMatchObject({ kind: 'training_admin' });
    expect(nextActor(app('voided'), 'both')).toMatchObject({ kind: 'none' });
  });

  it(`is stale after ${STALE_AFTER_DAYS} days at one approval stage, counted from stage_entered_at`, () => {
    const now = new Date('2026-11-26T12:00:00Z');
    const eightDays = '2026-11-18T11:00:00Z';
    const sixDays = '2026-11-20T12:00:00Z';
    expect(isStale(app('hod_review', { stage_entered_at: eightDays }), now)).toBe(true);
    expect(isStale(app('hod_review', { stage_entered_at: sixDays }), now)).toBe(false);
    expect(isStale(app('captain_purser_review', { stage_entered_at: sixDays, submitted_at: eightDays }), now)).toBe(false);
    for (const status of APPLICATION_STATUSES) {
      if (!(AWAITING_APPROVAL_STATUSES as readonly string[]).includes(status)) {
        expect(isStale(app(status, { stage_entered_at: eightDays }), now)).toBe(false);
      }
    }
  });

  it('falls back to submitted_at, then updated_at, when the stage time is not there yet', () => {
    expect(stageEnteredAt(app('hod_review', { submitted_at: '2026-11-01T00:00:00Z', updated_at: '2026-11-20T00:00:00Z' }))?.toISOString()).toBe(
      '2026-11-01T00:00:00.000Z',
    );
    expect(stageEnteredAt(app('approved', { submitted_at: '2026-11-01T00:00:00Z', updated_at: '2026-11-20T00:00:00Z' }))?.toISOString()).toBe(
      '2026-11-20T00:00:00.000Z',
    );
    expect(stageEnteredAt(app('hod_review', { stage_entered_at: 'not a date' }))).toBeNull();
    expect(stageEnteredAt(app('hod_review'))).toBeNull();
  });
});

describe('what a viewer is offered', () => {
  it('gives the applicant submit and cancel on a draft', () => {
    expect(availableActions(app('draft'), ['applicant'], 'both')).toEqual(['submit', 'cancel']);
  });

  it('gives the head of department the HOD actions and the corrections', () => {
    expect(availableActions(app('hod_review'), ['hod'], 'both')).toEqual(['hod_approve', 'hod_return', 'reject', 'edit_fields']);
  });

  it('leaves out a final approval the office has already given', () => {
    const decided = app('captain_purser_review', { captain_decision: 'approved' });
    expect(availableActions(decided, ['captain'], 'both')).not.toContain('final_approve');
    expect(availableActions(decided, ['captain'], 'both')).not.toContain('final_approve_discretionary');
    expect(availableActions(decided, ['purser'], 'both')).toContain('final_approve');
    expect(availableActions(app('captain_purser_review'), ['purser'], 'both')).not.toContain('final_approve_discretionary');
  });

  it('offers nothing on a voided application or an unknown status', () => {
    expect(availableActions(app('voided'), [...APPLICATION_ACTORS], 'both')).toEqual([]);
    expect(availableActions({ status: 'archived' }, [...APPLICATION_ACTORS], 'both')).toEqual([]);
  });

  it('asks for the text the server requires', () => {
    expect(actionRequirement('hod_return', 'hod')).toBe('comment');
    expect(actionRequirement('return', 'captain')).toBe('comment');
    expect(actionRequirement('reject', 'hod')).toBe('reason');
    expect(actionRequirement('void', 'training_admin')).toBe('reason');
    expect(actionRequirement('cancel', 'applicant')).toBeNull();
    expect(actionRequirement('cancel', 'captain')).toBe('reason');
    expect(actionRequirement('final_approve_discretionary', 'captain')).toBe('justification');
    expect(actionRequirement('complete', 'applicant')).toBe('completion');
    expect(actionRequirement('submit', 'applicant')).toBeNull();
  });
});

describe('words', () => {
  it('labels every action and says what each did', () => {
    for (const action of APPLICATION_ACTIONS) {
      expect(ACTION_LABELS[action]).toBeTruthy();
      expect(ACTION_DONE[action]).toBeTruthy();
    }
  });

  it('has a sentence for every refusal development_transition raises', () => {
    const body = functionBody('development_transition');
    const raised = new Set([...body.matchAll(/MESSAGE = '([a-z_]+)'/g)].map((m) => m[1]));
    for (const [, , out] of machineRows()) if (out.startsWith('!')) raised.add(out.slice(1));
    expect(raised.size).toBeGreaterThan(10);
    for (const code of raised) expect(TRANSITION_REFUSALS[code], code).toBeTruthy();
    expect(transitionRefusalMessage(' stale_application ')).toBe(TRANSITION_REFUSALS.stale_application);
    expect(transitionRefusalMessage('duplicate key value violates unique constraint')).toBeNull();
    expect(transitionRefusalMessage(null)).toBeNull();
    expect(TRANSITION_NOT_SET_UP).toMatch(/not set up yet/);
  });
});

describe('the D-X5-20 fallback set', () => {
  it('is exactly the applicant submitting a draft or returned application, or cancelling a draft', () => {
    const allowed: string[] = [];
    for (const action of APPLICATION_ACTIONS) {
      for (const status of APPLICATION_STATUSES) {
        for (const actor of [...APPLICATION_ACTORS, null]) {
          if (hasLegacyFallback(action, status, actor)) allowed.push(`${actor}:${action}:${status}`);
        }
      }
    }
    expect(allowed.sort()).toEqual(['applicant:cancel:draft', 'applicant:submit:draft', 'applicant:submit:returned']);
  });
});
