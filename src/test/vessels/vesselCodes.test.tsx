/**
 * Vessel codes once `vessels.code` is live (P1; DECISIONS D-03, D-25, C20;
 * Phase 2 spec §B.4).
 *
 * 1. Regression on the shared corpus `supabase/tests/fixtures/vessel-code-corpus.json`
 *    (generated from the frozen `vesselCode.ts` by
 *    `scripts/db/gen-vessel-code-corpus.mjs`; the SQL mirrors are checked
 *    against the same file): letters, candidates, stored-code
 *    normalisation and every fleet's expected `assignVesselCodes` map. When
 *    the fixture is absent the block is skipped with a visible warning.
 * 2. A stored code wins over the derivation.
 * 3. A reach-limited directory (what a crew member reads once P3's vessel
 *    RLS lands) gives the same codes as the full company fleet, as long as
 *    the codes are stored: the reason P1 lands before P3 (D-25).
 * 4. VesselContext, the one producer every screen uses (switcher, router
 *    reach, palette, pin availability, legacy redirects, references), serves
 *    the stored code.
 */
import React from 'react';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';

type Row = Record<string, unknown>;

const h = vi.hoisted(() => ({
  profile: null as Row | null,
  vessels: [] as Row[],
  assignments: [] as Row[],
  /** Simulates P3's vessel RLS: the directory read returns only these ids (null = the whole company). */
  readable: null as Set<string> | null,
}));

vi.mock('@/integrations/supabase/client', () => {
  const from = (table: string) => {
    const filters: ((r: Row) => boolean)[] = [];
    let single = false;
    const builder = {
      select: () => builder,
      order: () => builder,
      eq: (k: string, v: unknown) => {
        filters.push((r) => r[k] === v);
        return builder;
      },
      neq: (k: string, v: unknown) => {
        filters.push((r) => r[k] !== v);
        return builder;
      },
      in: (k: string, vs: unknown[]) => {
        filters.push((r) => vs.includes(r[k]));
        return builder;
      },
      maybeSingle: () => {
        single = true;
        return builder;
      },
      then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
        const result = () => {
          if (table === 'account_memberships') {
            return { data: null, error: { code: 'PGRST205', message: "Could not find the table 'public.account_memberships' in the schema cache" } };
          }
          let rows: Row[] = table === 'vessels' ? h.vessels : table === 'crew_assignments' ? h.assignments : [];
          if (table === 'vessels' && h.readable) rows = rows.filter((r) => h.readable?.has(String(r.id)));
          const out = rows.filter((r) => filters.every((f) => f(r)));
          return { data: single ? out[0] ?? null : out, error: null };
        };
        return Promise.resolve().then(result).then(resolve, reject);
      },
    };
    return builder;
  };
  return { supabase: { from } };
});
vi.mock('@/modules/auth/contexts/AuthContext', () => ({
  useAuth: () => ({ profile: h.profile, user: h.profile ? { id: h.profile.user_id } : null }),
}));

import {
  assignVesselCodes,
  getVesselCode,
  resolveVesselByCode,
  storedVesselCode,
  vesselCodeCandidates,
  vesselCodeLetters,
  type VesselCodeSource,
} from '@/modules/vessels/lib/vesselCode';
import { VesselProvider, useVessel } from '@/modules/vessels/contexts/VesselContext';

// ─── 1. The shared corpus ────────────────────────────────────────────────

const CORPUS = join(process.cwd(), 'supabase/tests/fixtures/vessel-code-corpus.json');
const SOURCE = 'src/modules/vessels/lib/vesselCode.ts';

interface Corpus {
  sourceSha256: Record<string, string>;
  names: { name: string; letters: string; candidates: string[] }[];
  limits: { name: string; limit: number; candidates: string[] }[];
  fullCandidates: { name: string; candidates: string[] }[];
  stored: { code: string | null; stored: string | null }[];
  singleCodePoints: Record<string, string>;
  specialUpper: { char: string; letters: string }[];
  fleets: { key: string; tableSafe: boolean; vessels: VesselCodeSource[]; expected: Record<string, string> }[];
}

const corpus: Corpus | null = existsSync(CORPUS) ? (JSON.parse(readFileSync(CORPUS, 'utf8')) as Corpus) : null;
if (!corpus) {
  console.warn(`SKIPPED: ${CORPUS} is missing; Lane 1 (D2) generates it with node scripts/db/gen-vessel-code-corpus.mjs.`);
}

describe.skipIf(!corpus)('vessel-code-corpus.json regression (D-03)', () => {
  const c = corpus as Corpus;

  it('was generated from the current vesselCode.ts (frozen in Phase 2: regenerate the fixture if this fails)', () => {
    const sha = createHash('sha256').update(readFileSync(join(process.cwd(), SOURCE))).digest('hex');
    expect(c.sourceSha256[SOURCE], 'regenerate the fixture: node scripts/db/gen-vessel-code-corpus.mjs').toBe(sha);
  });

  it('letters and the first candidates of every name', () => {
    const bad = c.names.filter((n) => vesselCodeLetters(n.name) !== n.letters || JSON.stringify(vesselCodeCandidates(n.name)) !== JSON.stringify(n.candidates));
    expect(bad.map((n) => n.name)).toEqual([]);
    expect(c.names.length).toBeGreaterThan(1000);
  });

  it('candidates at odd limits, and full candidate lists', () => {
    for (const l of c.limits) expect(vesselCodeCandidates(l.name, l.limit), `${l.name} @ ${l.limit}`).toEqual(l.candidates);
    for (const f of c.fullCandidates) expect(vesselCodeCandidates(f.name, 2000), f.name).toEqual(f.candidates);
  });

  it('stored-code normalisation', () => {
    for (const s of c.stored) expect(storedVesselCode({ code: s.code }), String(s.code)).toBe(s.stored);
  });

  it('every single code point and special upper-case expansion', () => {
    const bad = Object.entries(c.singleCodePoints).filter(([cp, letters]) => vesselCodeLetters(String.fromCodePoint(parseInt(cp, 16))) !== letters);
    expect(bad).toEqual([]);
    for (const s of c.specialUpper) expect(vesselCodeLetters(s.char), s.char).toBe(s.letters === '' ? 'VSL' : s.letters);
  });

  it('every fleet gets exactly its expected code map', () => {
    const bad = c.fleets.filter((f) => {
      const got = Object.fromEntries([...assignVesselCodes([...f.vessels]).entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
      return JSON.stringify(got) !== JSON.stringify(f.expected);
    });
    expect(bad.map((f) => f.key)).toEqual([]);
    expect(c.fleets.length).toBeGreaterThanOrEqual(200);
  });
});

// ─── 2. Stored codes win ─────────────────────────────────────────────────

describe('a stored code wins over the derivation', () => {
  const draak = { id: 'v1', name: 'M/Y DRAAK', created_at: '2026-01-01T00:00:00Z' };
  const drake = { id: 'v2', name: 'DRAKE', created_at: '2026-01-02T00:00:00Z' };

  it('the stored code is used as is (normalised), not the derived one', () => {
    expect(getVesselCode(draak)).toBe('DRA');
    expect(getVesselCode({ ...draak, code: 'xyz' })).toBe('XYZ');
  });

  it('a stored code is reserved first: a derived code never takes it, whatever the order', () => {
    // DRAKE (later) stores DRA; DRAAK (earlier, no stored code) must not take it.
    const codes = assignVesselCodes([draak, { ...drake, code: 'DRA' }]);
    expect(codes.get('v2')).toBe('DRA');
    expect(codes.get('v1')).toBe('DRK');
  });

  it('an invalid stored code is ignored and the vessel derives one', () => {
    expect(assignVesselCodes([{ ...draak, code: 'DR' }]).get('v1')).toBe('DRA');
    expect(assignVesselCodes([{ ...draak, code: '1AB' }]).get('v1')).toBe('DRA');
  });

  it('lookups by code follow the stored code', () => {
    const fleet = [{ ...draak, code: 'ZZZ' }, drake];
    expect(resolveVesselByCode('zzz', fleet)?.id).toBe('v1');
    expect(resolveVesselByCode('DRA', fleet)?.id).toBe('v2');
  });
});

// ─── 3. Reach-limited directories ─────────────────────────────────────────

/** Seeded PRNG (mulberry32): the subsets are the same on every run. */
function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A company fleet after P1's backfill: every vessel carries the code it derives today. */
const backfilled = (fleet: VesselCodeSource[]): VesselCodeSource[] => {
  const codes = assignVesselCodes(fleet.map((v) => ({ ...v, code: null })));
  return fleet.map((v) => ({ ...v, code: codes.get(v.id) ?? null }));
};

const sampleFleets = (): VesselCodeSource[][] => {
  if (corpus) return corpus.fleets.filter((f) => f.tableSafe).map((f) => f.vessels);
  // Without the corpus: a small fleet with colliding names.
  const names = ['DRAAK', 'DRAKE', 'DRAGON', 'HYDRA', 'HYDRANT', 'GAME CHANGER', 'GAMMA', 'A', 'AA', 'M/Y DRAAK II'];
  return [names.map((name, i) => ({ id: `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`, name, created_at: `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00Z` }))];
};

describe('a reach-limited directory gives the same codes as the full fleet once codes are stored (D-25)', () => {
  it('every random subset of every backfilled fleet keeps every vessel\'s code', () => {
    const rnd = prng(20261123);
    let checked = 0;
    for (const fleet of sampleFleets()) {
      const full = backfilled(fleet);
      const fullCodes = assignVesselCodes(full);
      for (let trial = 0; trial < 8; trial += 1) {
        const subset = full.filter(() => rnd() < 0.5);
        const subsetCodes = assignVesselCodes(subset);
        for (const v of subset) {
          expect(subsetCodes.get(v.id), `${v.id} in a subset of ${full.length}`).toBe(fullCodes.get(v.id));
          checked += 1;
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('without stored codes a subset can derive another code: why P1 lands before P3 limits vessel reads', () => {
    const fleet = [
      { id: 'a', name: 'DRAAK', created_at: '2026-01-01T00:00:00Z' },
      { id: 'b', name: 'DRAKE', created_at: '2026-01-02T00:00:00Z' },
    ];
    expect(assignVesselCodes(fleet).get('b')).toBe('DRK');
    // A crew member of DRAKE who cannot read DRAAK would derive DRA for it.
    expect(assignVesselCodes([fleet[1]]).get('b')).toBe('DRA');
    // With the backfilled codes stored, the same reader sees DRK.
    expect(assignVesselCodes([backfilled(fleet)[1]]).get('b')).toBe('DRK');
  });
});

// ─── 4. VesselContext serves the stored code ──────────────────────────────

let ctx: ReturnType<typeof useVessel> | null = null;
const Probe: React.FC = () => {
  ctx = useVessel();
  return null;
};

const settle = async () => {
  for (let i = 0; i < 6; i += 1) await act(async () => { await Promise.resolve(); });
};

afterEach(() => {
  cleanup();
  ctx = null;
  h.profile = null;
  h.vessels = [];
  h.assignments = [];
  h.readable = null;
});

describe('VesselContext codes (every producer reads getVesselCodeById / findVesselByCode)', () => {
  const company = [
    { id: 'va', company_id: 'c1', name: 'DRAAK', status: 'Active', created_at: '2026-01-01T00:00:00Z', code: 'DRA' },
    { id: 'vb', company_id: 'c1', name: 'DRAKE', status: 'Active', created_at: '2026-01-02T00:00:00Z', code: 'DRK' },
    { id: 'vc', company_id: 'c1', name: 'HYDRA', status: 'Active', created_at: '2026-01-03T00:00:00Z', code: 'HY1' },
  ];

  it('a stored code that differs from the derivation is the one served and resolved', async () => {
    h.profile = { id: 'p1', user_id: 'u1', company_id: 'c1', role: 'dpa' };
    h.vessels = company;
    render(<VesselProvider><Probe /></VesselProvider>);
    await settle();
    expect(ctx?.vessels.map((v) => v.name)).toEqual(['DRAAK', 'DRAKE', 'HYDRA']);
    expect(ctx?.getVesselCodeById('vc')).toBe('HY1');
    expect(ctx?.findVesselByCode('hy1')?.id).toBe('vc');
    // The derived code of HYDRA is not its code once one is stored.
    expect(ctx?.findVesselByCode('hyd')).toBeUndefined();
  });

  it('a crew member whose directory read is limited to their vessel sees the same code as the fleet', async () => {
    h.profile = { id: 'p2', user_id: 'u2', company_id: 'c1', role: 'crew' };
    h.vessels = company;
    h.assignments = [{ user_id: 'u2', vessel_id: 'vb', is_current: true }];
    h.readable = new Set(['vb']);
    render(<VesselProvider><Probe /></VesselProvider>);
    await settle();
    expect(ctx?.vessels.map((v) => v.name)).toEqual(['DRAKE']);
    expect(ctx?.companyVessels.map((v) => v.id)).toEqual(['vb']);
    expect(ctx?.getVesselCodeById('vb')).toBe('DRK');
    expect(ctx?.findVesselByCode('drk')?.id).toBe('vb');
    expect(ctx?.findVesselByCode('dra')).toBeUndefined();
  });
});
