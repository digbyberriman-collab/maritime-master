/**
 * The fleet document acknowledgement rule (src/modules/documents/lib/ackState.ts;
 * gap/02 W1; D-X5-04; X5-05A), the mirror of the server's one state core:
 *
 * - the SQL test (supabase/tests/sql/fleet/documents_acks.test.sql) copies
 *   the state table and the blocked-reason table between its markers; both
 *   copies are pinned here, row for row, and the TS rule answers every row;
 * - exhaustive: every combination of inputs against an independent
 *   first-match statement of the rule;
 * - due dates in UTC days (the join day, publication, a time zone with
 *   DST), the words for due / overdue / acknowledged;
 * - every refusal message the 040400 definers raise has a sentence.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ACK_BLOCKED_REASONS,
  ACK_REFUSAL_CODES,
  ACK_STATES,
  ackBlockedReason,
  ackDueAt,
  ackDueShort,
  ackDueText,
  ackRefusal,
  ackState,
  formatAckDate,
  isAckState,
  isOutstanding,
  ownBlockedSentence,
  type AckState,
} from '@/modules/documents/lib/ackState';

const ROOT = process.cwd();
const SQL_TEST = readFileSync(join(ROOT, 'supabase/tests/sql/fleet/documents_acks.test.sql'), 'utf8');
const SQL = readFileSync(join(ROOT, 'supabase/migrations/20261124040400_fleet_documents_acknowledgements.sql'), 'utf8');

type Due = 'past' | 'future' | 'none';
type Row = [status: string, onCrew: boolean, acknowledged: boolean, hasLogin: boolean, active: boolean, inSet: boolean, due: Due, expected: AckState];

/** The shared table (the SQL test holds the same rows between its ack-state-table markers). */
const STATE_TABLE: readonly Row[] = [
  ['published', true, false, true, true, true, 'future', 'pending'],
  ['published', true, false, true, true, true, 'none', 'pending'],
  ['published', true, false, true, true, true, 'past', 'overdue'],
  ['published', true, true, true, true, true, 'past', 'acknowledged'],
  ['published', true, true, false, false, false, 'past', 'acknowledged'],
  ['published', true, false, false, false, true, 'past', 'blocked'],
  ['published', true, false, false, true, true, 'future', 'blocked'],
  ['published', true, false, true, false, true, 'future', 'blocked'],
  ['published', true, false, true, true, false, 'past', 'blocked'],
  ['published', false, true, true, true, true, 'past', 'not_required'],
  ['published', false, false, true, true, true, 'future', 'not_required'],
  ['withdrawn', true, false, true, true, true, 'past', 'not_required'],
  ['withdrawn', true, true, true, true, true, 'future', 'not_required'],
  ['draft', true, false, true, true, true, 'future', 'not_required'],
];

const BLOCKED_TABLE: ReadonlyArray<[boolean, boolean, boolean, string | null]> = [
  [false, false, false, 'no_login'],
  [false, true, true, 'no_login'],
  [true, false, false, 'suspended'],
  [true, false, true, 'suspended'],
  [true, true, false, 'not_in_signer_set'],
  [true, true, true, null],
];

const NOW = new Date('2026-11-26T12:00:00Z');
const dueFor = (due: Due): Date | null =>
  due === 'past' ? new Date(NOW.getTime() - 86_400_000) : due === 'future' ? new Date(NOW.getTime() + 86_400_000) : null;

const between = (start: string, end: string) => SQL_TEST.split(`-- ${start}`)[1]?.split(`-- ${end}`)[0] ?? '';
const bool = (v: string) => v === 'true';

describe('the shared tables', () => {
  it('the SQL test copies the state table exactly (ack-state-table markers)', () => {
    const block = between('ack-state-table:start', 'ack-state-table:end');
    const rows = Array.from(
      block.matchAll(/\('([a-z_]+)', (true|false), (true|false), (true|false), (true|false), (true|false), '([a-z]+)', '([a-z_]+)'\)/g),
      (m) => [m[1], bool(m[2]), bool(m[3]), bool(m[4]), bool(m[5]), bool(m[6]), m[7], m[8]],
    );
    expect(rows).toEqual(STATE_TABLE.map((r) => [...r]));
  });

  it('the SQL test copies the blocked-reason table exactly (ack-blocked-table markers)', () => {
    const block = between('ack-blocked-table:start', 'ack-blocked-table:end');
    const rows = Array.from(block.matchAll(/\((true|false), (true|false), (true|false), (?:'([a-z_]+)'|NULL)\)/g), (m) => [bool(m[1]), bool(m[2]), bool(m[3]), m[4] ?? null]);
    expect(rows).toEqual(BLOCKED_TABLE.map((r) => [...r]));
  });

  it.each(STATE_TABLE)('%s, on crew %s, acknowledged %s, login %s, active %s, in set %s, due %s -> %s', (status, onCrew, acknowledged, hasLogin, active, inSignerSet, due, expected) => {
    expect(ackState({ documentStatus: status, onCrew, acknowledged, hasLogin, active, inSignerSet, dueAt: dueFor(due), now: NOW })).toBe(expected);
  });

  it.each(BLOCKED_TABLE)('blocked reason: login %s, active %s, in set %s -> %s', (hasLogin, active, inSet, expected) => {
    expect(ackBlockedReason(hasLogin, active, inSet)).toBe(expected);
  });
});

describe('the rule, exhaustively', () => {
  /** An independent statement of W1's precedence (the SQL CASE, line for line). */
  function oracle(status: string, onCrew: boolean, acknowledged: boolean, hasLogin: boolean, active: boolean, inSet: boolean, due: Due): AckState {
    if (status !== 'published') return 'not_required';
    if (!onCrew) return 'not_required';
    if (acknowledged) return 'acknowledged';
    if (!hasLogin || !active || !inSet) return 'blocked';
    if (due === 'past') return 'overdue';
    return 'pending';
  }

  it('every combination of inputs answers as the precedence says', () => {
    const flags = [false, true];
    let n = 0;
    for (const status of ['draft', 'published', 'withdrawn'])
      for (const onCrew of flags)
        for (const acknowledged of flags)
          for (const hasLogin of flags)
            for (const active of flags)
              for (const inSet of flags)
                for (const due of ['past', 'future', 'none'] as const) {
                  n += 1;
                  const got = ackState({ documentStatus: status, onCrew, acknowledged, hasLogin, active, inSignerSet: inSet, dueAt: dueFor(due), now: NOW });
                  expect(got, JSON.stringify({ status, onCrew, acknowledged, hasLogin, active, inSet, due })).toBe(oracle(status, onCrew, acknowledged, hasLogin, active, inSet, due));
                }
    expect(n).toBe(3 * 2 ** 5 * 3);
  });

  it('due exactly now is not overdue yet (now must be past due)', () => {
    expect(ackState({ documentStatus: 'published', onCrew: true, acknowledged: false, hasLogin: true, active: true, inSignerSet: true, dueAt: NOW, now: NOW })).toBe('pending');
  });

  it('the vocabularies match the SQL CHECKs and helpers', () => {
    expect([...ACK_STATES].sort()).toEqual(['acknowledged', 'blocked', 'not_required', 'overdue', 'pending']);
    expect([...ACK_BLOCKED_REASONS]).toEqual(['no_login', 'suspended', 'not_in_signer_set']);
    expect(SQL).toContain("CHECK (method IN ('self', 'witnessed', 'carried_forward'))");
    for (const reason of ACK_BLOCKED_REASONS) expect(SQL).toContain(`'${reason}'`);
    expect(isAckState('pending')).toBe(true);
    expect(isAckState('maybe')).toBe(false);
    expect(isOutstanding('overdue') && isOutstanding('pending') && !isOutstanding('blocked') && !isOutstanding(null)).toBe(true);
  });
});

describe('due dates (UTC days, as fleet_document_ack_due_at)', () => {
  it('joined before publication: publication + days', () => {
    expect(ackDueAt('2026-11-01T10:00:00Z', '2026-10-01', 14)?.toISOString()).toBe('2026-11-15T10:00:00.000Z');
  });
  it('joining after publication (a planned joiner): the join day at 00:00 UTC + days', () => {
    expect(ackDueAt('2026-11-01T10:00:00Z', '2026-11-20', 14)?.toISOString()).toBe('2026-12-04T00:00:00.000Z');
  });
  it('no join date, or one that is not a calendar date: publication + days', () => {
    expect(ackDueAt('2026-11-01T10:00:00Z', null, 7)?.toISOString()).toBe('2026-11-08T10:00:00.000Z');
    expect(ackDueAt('2026-11-01T10:00:00Z', '2026-02-30', 7)?.toISOString()).toBe('2026-11-08T10:00:00.000Z');
  });
  it('no publication time or days: none', () => {
    expect(ackDueAt(null, '2026-11-20', 7)).toBeNull();
    expect(ackDueAt('2026-11-01T10:00:00Z', null, null)).toBeNull();
    expect(ackDueAt('not a date', null, 7)).toBeNull();
  });
  it('days are UTC days, whatever the clock changes (the SQL test checks the same across a DST change)', () => {
    expect(ackDueAt('2026-03-30T10:00:00Z', null, 14)?.toISOString()).toBe('2026-04-13T10:00:00.000Z');
  });
  it('the SQL test pins the same answers', () => {
    expect(SQL_TEST).toContain("fleet_document_ack_due_at('2026-11-01T10:00:00Z', date '2026-10-01', 14), '2026-11-15T10:00:00Z'");
    expect(SQL_TEST).toContain("fleet_document_ack_due_at('2026-11-01T10:00:00Z', date '2026-11-20', 14), '2026-12-04T00:00:00Z'");
    expect(SQL_TEST).toContain("fleet_document_ack_due_at('2026-03-30T10:00:00Z', NULL, 14), '2026-04-13T10:00:00Z'");
  });
});

describe('words', () => {
  const now = '2026-11-26T09:00:00Z';
  it('due text: today, tomorrow, a date; overdue since; acknowledged on', () => {
    expect(ackDueText('pending', '2026-11-26T20:00:00Z', null, now)).toBe('Due today');
    expect(ackDueText('pending', '2026-11-27T08:00:00Z', null, now)).toBe('Due tomorrow');
    expect(ackDueText('pending', '2026-12-04T00:00:00Z', null, now)).toBe('Due 04 Dec 2026');
    expect(ackDueText('overdue', '2026-11-20T10:00:00Z', null, now)).toBe('Overdue since 20 Nov 2026');
    expect(ackDueText('acknowledged', null, '2026-11-03T08:15:00Z', now)).toBe('Acknowledged 03 Nov 2026');
    expect(ackDueText('blocked', '2026-11-20T10:00:00Z', null, now)).toBeNull();
    expect(ackDueText('not_required', null, null, now)).toBeNull();
    expect(ackDueText('pending', null, null, now)).toBeNull();
  });
  it('the short line beside the pill never repeats the state', () => {
    expect(ackDueShort('pending', '2026-12-04T00:00:00Z', null, now)).toBe('by 04 Dec 2026');
    expect(ackDueShort('pending', '2026-11-26T20:00:00Z', null, now)).toBe('due today');
    expect(ackDueShort('pending', '2026-11-27T08:00:00Z', null, now)).toBe('due tomorrow');
    expect(ackDueShort('overdue', '2026-11-20T10:00:00Z', null, now)).toBe('since 20 Nov 2026');
    expect(ackDueShort('acknowledged', null, '2026-11-03T08:15:00Z', now)).toBe('on 03 Nov 2026');
    expect(ackDueShort('blocked', '2026-11-20T10:00:00Z', null, now)).toBeNull();
    expect(ackDueShort('pending', null, null, now)).toBeNull();
  });
  it('dates are the UTC day the rule counts', () => {
    expect(formatAckDate('2026-12-03T23:30:00-05:00')).toBe('04 Dec 2026');
    expect(formatAckDate(null)).toBeNull();
    expect(formatAckDate('garbage')).toBeNull();
  });
  it('a blocked caller is told why, in their own terms; nothing promises an email', () => {
    for (const reason of ACK_BLOCKED_REASONS) {
      expect(ownBlockedSentence(reason).length).toBeGreaterThan(20);
      expect(ownBlockedSentence(reason)).not.toMatch(/email/i);
    }
  });
});

describe('refusals', () => {
  it('every refusal message the 040400 definers raise has a sentence (guards excepted)', () => {
    const raised = new Set(Array.from(SQL.matchAll(/MESSAGE = '([a-z_]+)'/g), (m) => m[1]).filter((m) => !m.endsWith('_guarded')));
    expect(raised.size).toBeGreaterThan(15);
    for (const code of raised) {
      expect(ACK_REFUSAL_CODES, code).toContain(code);
      expect(ackRefusal(code), code).toMatch(/\w/);
    }
  });
  it('blocked names the reason from the detail; unknown messages are not guessed', () => {
    expect(ackRefusal('blocked', 'not_in_signer_set')).toBe(ownBlockedSentence('not_in_signer_set'));
    expect(ackRefusal('blocked', null)).toBe('You cannot acknowledge this document.');
    expect(ackRefusal('something_else')).toBeNull();
    expect(ackRefusal(null)).toBeNull();
  });
});
