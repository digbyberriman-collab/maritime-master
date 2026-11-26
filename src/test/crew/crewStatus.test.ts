/**
 * The derived crew status (X1-02; gap/04 W2, C4): crewStatusDecide() is
 * the exact mirror of crew_status_decide() in
 * 20261124060200_crew_vessel_list.sql. Both read the same parity cases
 * (src/test/crew/fixtures/crewStatusCases.json): every combination of a
 * transfer flag, a placement kind, a day code and an In/Out event.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import cases from './fixtures/crewStatusCases.json';
import {
  CREW_PLACEMENT_KINDS,
  CREW_STATUSES,
  crewStatusDecide,
  isAboard,
  isLeaveDayCode,
  normaliseDayCode,
  ON_BOARD_DAY_CODES,
} from '@/modules/crew/lib/crewStatus';
import { statusVocabulary } from '@/shared/components/status';

type Case = {
  transferActive: boolean | null;
  placementKind: string | null;
  leaveCode: string | null;
  inOutLast: string | null;
  expect: string;
  why: string;
};

const all = cases.cases as Case[];
const ROOT = process.cwd();

describe('crewStatusDecide: parity cases', () => {
  it('covers every combination (3 transfer flags x 5 placements x 15 day codes x 4 In/Out values)', () => {
    expect(all).toHaveLength(3 * 5 * 15 * 4);
    const key = (c: Case) => JSON.stringify([c.transferActive, c.placementKind, c.leaveCode, c.inOutLast]);
    expect(new Set(all.map(key)).size).toBe(all.length);
  });

  it.each(all.map((c, i) => [i, c] as const))('case %i', (_i, c) => {
    expect(crewStatusDecide(c), c.why).toBe(c.expect);
  });

  it('reaches every status, and only the statuses of the registry', () => {
    const seen = new Set(all.map((c) => c.expect));
    expect([...seen].sort()).toEqual([...CREW_STATUSES].sort());
    const vocabulary = statusVocabulary('crew_status').map((e) => e.status);
    for (const status of CREW_STATUSES) expect(vocabulary, status).toContain(status);
  });

  it('pins the decision order: on_transfer > pending > on_leave > ashore > on_board', () => {
    expect(cases.order).toEqual([...CREW_STATUSES]);
    expect(crewStatusDecide({ transferActive: true, placementKind: 'pending_placement', leaveCode: 'L', inOutLast: 'out' })).toBe('on_transfer');
    expect(crewStatusDecide({ transferActive: false, placementKind: 'planned', leaveCode: 'L', inOutLast: 'out' })).toBe('pending');
    expect(crewStatusDecide({ transferActive: false, placementKind: 'assignment', leaveCode: 'L', inOutLast: 'out' })).toBe('on_leave');
    expect(crewStatusDecide({ transferActive: false, placementKind: 'assignment', leaveCode: 'F', inOutLast: 'out' })).toBe('ashore');
    expect(crewStatusDecide({ transferActive: false, placementKind: 'assignment', leaveCode: 'F', inOutLast: 'in' })).toBe('on_board');
    expect(crewStatusDecide({ transferActive: null, placementKind: null, leaveCode: null, inOutLast: null })).toBe('on_board');
  });

  it('the SQL test reads the same file, and the SQL function names the same codes', () => {
    expect(readFileSync(join(ROOT, 'supabase/tests/sql/crew/vessel_list.test.sql'), 'utf8')).toContain('src/test/crew/fixtures/crewStatusCases.json');
    const sql = readFileSync(join(ROOT, 'supabase/migrations/20261124060200_crew_vessel_list.sql'), 'utf8');
    expect(sql).toMatch(/NOT IN \('F', 'T'\)/);
    expect(sql).toMatch(/p_placement_kind IN \('planned', 'pending_placement'\)/);
    expect(cases.onBoardCodes).toEqual([...ON_BOARD_DAY_CODES]);
  });
});

describe('day codes', () => {
  it('trims and upper-cases; empty is no code', () => {
    expect(normaliseDayCode(' l ')).toBe('L');
    expect(normaliseDayCode('')).toBeNull();
    expect(normaliseDayCode('   ')).toBeNull();
    expect(normaliseDayCode(null)).toBeNull();
    expect(normaliseDayCode(undefined)).toBeNull();
  });

  it('F (on board) and T (travel day) are not leave; every other code is', () => {
    for (const code of ['F', 'T', 'f', ' t ']) expect(isLeaveDayCode(code), code).toBe(false);
    for (const code of ['L', 'Q', 'CD', 'M', 'PPL', 'CL', 'N', 'U', 'R']) expect(isLeaveDayCode(code), code).toBe(true);
    expect(isLeaveDayCode(null)).toBe(false);
  });
});

describe('placements and the report', () => {
  it('lists the three placement kinds the server returns', () => {
    expect([...CREW_PLACEMENT_KINDS]).toEqual(['assignment', 'planned', 'pending_placement']);
  });

  it('counts on board and ashore as aboard for the crew list report, nobody else', () => {
    expect(CREW_STATUSES.filter(isAboard)).toEqual(['ashore', 'on_board']);
  });
});
