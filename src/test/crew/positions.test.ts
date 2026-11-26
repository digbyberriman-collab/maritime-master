/**
 * Positions, pure (X1-01): the TS mirror of crew_position_for() against the
 * parity cases the SQL test asserts too (fixtures/positionCases.json), the
 * synonym map (every entry covered by a case, equal to the SQL map), and
 * the positions drawer's model (rank order, department groups, reordering,
 * the manning rule, the save payload, refusal sentences).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import cases from './fixtures/positionCases.json';
import {
  POSITION_REFUSALS,
  POSITION_SYNONYMS,
  aliasMatch,
  assignSortSlots,
  groupByDepartment,
  heldBand,
  manningProblem,
  moveWithin,
  officeKey,
  parseCount,
  positionRefusalMessage,
  positionSynonym,
  positionVisibleOn,
  rankSort,
  resolvePositionFor,
  toSaveRows,
  type AliasLike,
  type PositionLike,
} from '@/modules/crew/lib/positions';
import { normaliseOffice } from '@/modules/crew/lib/crewUpdateErrors';
import type { VesselPosition } from '@/modules/crew/types/domain';

const MIGRATION = readFileSync(join(process.cwd(), 'supabase/migrations/20261124060100_crew_reference_positions.sql'), 'utf8');

// The fixture world: companies A and B, vessels A.dra, A.hyd, B.lev.
const vesselId = (company: string, vessel: string | null) => (vessel ? `${company}.${vessel}` : null);
const systemId = (key: string) => `system:${key}`;

const world: { positions: PositionLike[]; aliases: AliasLike[] } = {
  positions: [
    ...cases.system.map((s) => ({ id: systemId(s.key), companyId: null, vesselId: null, key: s.key, name: s.name, isActive: true })),
    ...cases.positions.map((p) => ({
      id: p.ref,
      companyId: p.company,
      vesselId: vesselId(p.company, p.vessel),
      key: p.key,
      name: p.name,
      isActive: p.active,
    })),
  ],
  aliases: cases.aliases.map((a) => ({ companyId: a.company, aliasKey: a.alias, positionId: a.position })),
};

describe('officeKey (record_normalise_office)', () => {
  it('is the crew office normaliser', () => {
    expect(officeKey).toBe(normaliseOffice);
  });
  it.each([
    ['Master', 'master'],
    ['  CHIEF  Mate ', 'chief_mate'],
    ["Ship's Doctor", 'ship_s_doctor'],
    ['2nd Officer', '2nd_officer'],
    ['Chief Steward/ess', 'chief_steward_ess'],
    ['AV/IT Officer', 'av_it_officer'],
    ['—', ''],
    ['', ''],
  ])('%j -> %j', (title, key) => {
    expect(officeKey(title)).toBe(key);
  });
  it('treats null and undefined as blank', () => {
    expect(officeKey(null)).toBe('');
    expect(officeKey(undefined)).toBe('');
  });
});

describe('resolvePositionFor mirrors crew_position_for (positionCases.json)', () => {
  it('has a case for every scope and rule', () => {
    expect(cases.cases.length).toBeGreaterThanOrEqual(70);
    expect(cases.cases.some((c) => c.expect === null)).toBe(true);
  });

  it.each(cases.cases.map((c) => [`${c.title || '(blank)'} on ${c.company}.${c.vessel}: ${c.why}`, c] as const))('%s', (_label, c) => {
    const got = resolvePositionFor(world, c.company, vesselId(c.company, c.vessel), c.title);
    expect(got?.id ?? null).toBe(c.expect);
  });

  it('answers null without a title and only STORM rows without a company', () => {
    expect(resolvePositionFor(world, 'A', 'A.dra', null)).toBeNull();
    expect(resolvePositionFor(world, null, null, 'Bosun')?.id).toBe(systemId('bosun'));
    expect(resolvePositionFor(world, null, null, 'Night Watchman')).toBeNull();
  });
});

describe('the synonym map', () => {
  const sqlEntries = Array.from(
    (MIGRATION.match(/FUNCTION public\.crew_position_synonym[\s\S]*?\$\$([\s\S]*?)\$\$/)?.[1] ?? '').matchAll(/\('([a-z0-9_]+)', '([a-z0-9_]+)'\)/g),
  ).map((m) => [m[1], m[2]] as const);

  it('equals crew_position_synonym() in the migration, entry by entry', () => {
    expect(sqlEntries.length).toBeGreaterThan(40);
    expect(Object.fromEntries(sqlEntries)).toEqual({ ...POSITION_SYNONYMS });
  });

  it('every entry is exercised by a parity case (so the SQL test proves the SQL map too)', () => {
    const titled = new Set(cases.cases.map((c) => officeKey(c.title)));
    const uncovered = Object.keys(POSITION_SYNONYMS).filter((k) => !titled.has(k));
    expect(uncovered).toEqual([]);
  });

  it('targets a STORM position key, never another synonym', () => {
    const systemKeys = new Set(cases.system.map((s) => s.key));
    for (const [alias, target] of Object.entries(POSITION_SYNONYMS)) {
      expect(systemKeys.has(target), `${alias} -> ${target}`).toBe(true);
      expect(POSITION_SYNONYMS[target], `${target} is not itself a synonym`).toBeUndefined();
    }
  });

  it('positionSynonym answers only for map entries', () => {
    expect(positionSynonym('captain')).toBe('master');
    expect(positionSynonym('master')).toBeNull();
    expect(positionSynonym('constructor')).toBeNull();
    expect(positionSynonym('')).toBeNull();
    expect(positionSynonym(null)).toBeNull();
  });
});

describe('visibility and aliases', () => {
  const sys: PositionLike = { id: 's', companyId: null, vesselId: null, key: 'k', name: 'K', isActive: true };
  const co: PositionLike = { ...sys, id: 'c', companyId: 'A' };
  const ve: PositionLike = { ...sys, id: 'v', companyId: 'A', vesselId: 'A.dra' };
  it('STORM rows are visible everywhere, company rows in their company, vessel rows on their vessel', () => {
    expect(positionVisibleOn(sys, null, null)).toBe(true);
    expect(positionVisibleOn(co, 'A', 'A.hyd')).toBe(true);
    expect(positionVisibleOn(co, 'B', 'B.lev')).toBe(false);
    expect(positionVisibleOn(co, null, null)).toBe(false);
    expect(positionVisibleOn(ve, 'A', 'A.dra')).toBe(true);
    expect(positionVisibleOn(ve, 'A', 'A.hyd')).toBe(false);
    expect(positionVisibleOn(ve, 'A', null)).toBe(false);
  });
  it('aliasMatch finds the company alias of a normalised title only', () => {
    expect(aliasMatch(world.aliases, 'A', ' old  MAN ')?.positionId).toBe(systemId('master'));
    expect(aliasMatch(world.aliases, 'B', 'Old Man')).toBeNull();
    expect(aliasMatch(world.aliases, null, 'Old Man')).toBeNull();
    expect(aliasMatch(world.aliases, 'A', '')).toBeNull();
  });
});

// ---------------------------------------------------------------- drawer model

const vp = (over: Partial<VesselPosition>): VesselPosition => ({
  positionId: 'p',
  scope: 'system',
  key: 'k',
  name: 'Name',
  departmentKey: 'deck',
  departmentLabel: 'Deck',
  departmentSort: 20,
  rankTier: 'rating',
  defaultAccessSetKey: 'crew',
  stcwCapacity: null,
  baseSortOrder: 40201,
  sortOrder: 40201,
  isListed: true,
  minOnBoard: 0,
  maxOnBoard: null,
  holderCount: 0,
  ...over,
});

describe('rankSort and groupByDepartment', () => {
  it('orders by sort order, then name, then id', () => {
    const list = [
      vp({ positionId: 'c', sortOrder: 20, name: 'B' }),
      vp({ positionId: 'b', sortOrder: 10, name: 'Z' }),
      vp({ positionId: 'a', sortOrder: 20, name: 'B' }),
      vp({ positionId: 'd', sortOrder: 20, name: 'A' }),
    ].sort(rankSort);
    expect(list.map((p) => p.positionId)).toEqual(['b', 'd', 'a', 'c']);
  });
  it('groups by department in the department order, keeping each group in the order given', () => {
    const groups = groupByDepartment([
      vp({ positionId: 'eng1', departmentKey: 'engineering', departmentLabel: 'Engineering', departmentSort: 30 }),
      vp({ positionId: 'deck1' }),
      vp({ positionId: 'eng2', departmentKey: 'engineering', departmentLabel: 'Engineering', departmentSort: 30 }),
      vp({ positionId: 'br1', departmentKey: 'bridge', departmentLabel: 'Bridge', departmentSort: 10 }),
    ]);
    expect(groups.map((g) => g.departmentKey)).toEqual(['bridge', 'deck', 'engineering']);
    expect(groups[2].positions.map((p) => p.positionId)).toEqual(['eng1', 'eng2']);
    expect(groupByDepartment([])).toEqual([]);
  });
});

describe('moveWithin', () => {
  const ids = (xs: string[]) => xs;
  const id = (x: string) => x;
  it('moves up, down, to the ends and clamps out-of-range targets', () => {
    expect(moveWithin(['a', 'b', 'c'], id, 'b', 0)).toEqual(['b', 'a', 'c']);
    expect(moveWithin(['a', 'b', 'c'], id, 'b', 2)).toEqual(['a', 'c', 'b']);
    expect(moveWithin(['a', 'b', 'c'], id, 'a', -5)).toEqual(['a', 'b', 'c']);
    expect(moveWithin(['a', 'b', 'c'], id, 'a', 99)).toEqual(['b', 'c', 'a']);
  });
  it('returns a copy, unchanged for an unknown id or the same index', () => {
    const list = ids(['a', 'b']);
    const same = moveWithin(list, id, 'a', 0);
    expect(same).toEqual(list);
    expect(same).not.toBe(list);
    expect(moveWithin(list, id, 'zz', 1)).toEqual(['a', 'b']);
  });
});

describe('manningProblem (the server rule manning_range_invalid)', () => {
  it.each([
    [0, null, null],
    [0, 0, null],
    [2, 3, null],
    [500, 500, null],
    [undefined, undefined, null],
  ])('min %j max %j is valid', (min, max, want) => {
    expect(manningProblem(min, max)).toBe(want);
  });
  it.each([
    [-1, null],
    [501, null],
    [1.5, null],
    [3, 2],
    [0, 501],
    [0, 2.5],
  ])('min %j max %j is refused', (min, max) => {
    expect(manningProblem(min, max)).toMatch(/minimum|maximum/i);
  });
});

describe('assignSortSlots and toSaveRows', () => {
  it('hands a department its own rank slots in the new order', () => {
    const slots = assignSortSlots([vp({ positionId: 'bosun', sortOrder: 30201 }), vp({ positionId: 'co', sortOrder: 20201 }), vp({ positionId: 'ab', sortOrder: 40203 })]);
    expect([...slots.entries()]).toEqual([['bosun', 20201], ['co', 30201], ['ab', 40203]]);
  });
  it('spreads equal slots so the new order holds', () => {
    const slots = assignSortSlots([vp({ positionId: 'b', sortOrder: 10 }), vp({ positionId: 'a', sortOrder: 10 }), vp({ positionId: 'c', sortOrder: 11 })]);
    expect([...slots.values()]).toEqual([10, 11, 12]);
    expect(assignSortSlots([]).size).toBe(0);
  });
  it('writes every listed position with its slot, min and max, then the unlisted ones cleared', () => {
    const rows = toSaveRows(
      [
        { positions: [vp({ positionId: 'x', sortOrder: 200, minOnBoard: 1, maxOnBoard: 2 }), vp({ positionId: 'y', sortOrder: 100 })] },
        { positions: [vp({ positionId: 'w', sortOrder: 50, minOnBoard: 3 })] },
      ],
      [vp({ positionId: 'z' })],
    );
    expect(rows).toEqual([
      { position_id: 'x', sort_order: 100, is_listed: true, min_on_board: 1, max_on_board: 2 },
      { position_id: 'y', sort_order: 200, is_listed: true, min_on_board: 0, max_on_board: null },
      { position_id: 'w', sort_order: 50, is_listed: true, min_on_board: 3, max_on_board: null },
      { position_id: 'z', sort_order: null, is_listed: false, min_on_board: 0, max_on_board: null },
    ]);
    expect(toSaveRows([])).toEqual([]);
  });
});

describe('positionRefusalMessage', () => {
  it('shows a 22023 DETAIL sentence as the server wrote it', () => {
    expect(positionRefusalMessage({ code: '22023', message: 'position_exists', details: 'A position called "Bosun" already exists. List it on this vessel instead.' }))
      .toBe('A position called "Bosun" already exists. List it on this vessel instead.');
  });
  it('maps every 22023 code without a DETAIL to its sentence', () => {
    for (const [code, sentence] of Object.entries(POSITION_REFUSALS)) {
      expect(positionRefusalMessage({ code: '22023', message: code })).toBe(sentence);
    }
  });
  it('passes 42501 through crewRefusalMessage (the DETAIL as is) and never shows a raw code', () => {
    expect(positionRefusalMessage({ code: '42501', message: 'crew_not_permitted', details: 'Only a crew compliance administrator of this vessel can change its positions and manning.' }))
      .toBe('Only a crew compliance administrator of this vessel can change its positions and manning.');
    expect(positionRefusalMessage({ code: '22023', message: 'some_new_code' })).not.toMatch(/^[a-z_]+$/);
    expect(positionRefusalMessage({ code: '42501', message: 'crew_not_permitted' })).not.toMatch(/^[a-z_]+$/);
  });
});

describe('heldBand (manning_band against the people holding a position)', () => {
  it.each([
    [0, 0, null, null],
    [3, 0, null, null],
    [0, 1, null, 'critical'],
    [1, 1, null, 'at_minimum'],
    [2, 1, null, 'normal'],
    [3, 1, 2, 'overmanned'],
    [2, 1, 2, 'normal'],
    [0, 0, 0, 'normal'],
    [1, 0, 0, 'overmanned'],
  ] as const)('%i held, min %i, max %j -> %j', (held, min, max, band) => {
    expect(heldBand(held, min, max)).toBe(band);
  });
});

describe('parseCount (the drawer\'s minimum and maximum fields)', () => {
  it.each([
    ['', null],
    ['  ', null],
    ['0', 0],
    [' 12 ', 12],
    ['500', 500],
  ] as const)('%j -> %j', (text, want) => {
    expect(parseCount(text)).toBe(want);
  });
  it.each(['-1', '1.5', 'two', '1e2', '1000'])('%j is not a head count', (text) => {
    expect(Number.isNaN(parseCount(text))).toBe(true);
  });
});
