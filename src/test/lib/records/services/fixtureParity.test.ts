/**
 * Regression on the shared record fixtures Lane 1 generates from the frozen
 * C3 libraries (Phase 2 spec §E). The SQL mirrors are checked against the
 * same files in the DB harness; here the TS answers are re-checked, so a
 * change to a frozen engine (or a stale fixture) fails in vitest too:
 *
 * - `reference-cases.json` (`scripts/db/gen-reference-fixture.mjs`):
 *   `formatReference`, `formatVoyageReference`, `referenceCounterScope`;
 * - `record-transitions.json` (`scripts/db/gen-record-fixtures.mjs`):
 *   `transitionEnvelope` on every case (code, or the whole value);
 * - `record-vessel-lock.json`: `vesselSignaturesLocked`.
 *
 * A fixture that is not there yet is skipped with a visible warning (the
 * integrator confirms they run); `sourceSha256` must match the TS sources.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { formatReference, formatVoyageReference, referenceCounterScope } from '@/lib/records/reference';
import { transitionEnvelope, vesselSignaturesLocked, type EnvelopeState, type TransitionInput } from '@/lib/records/companyStep';

const FIXTURES = join(process.cwd(), 'supabase/tests/fixtures');

function load<T>(name: string, generator: string): T | null {
  const file = join(FIXTURES, name);
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8')) as T;
  console.warn(`SKIPPED: ${file} is missing; Lane 1 generates it with node ${generator}.`);
  return null;
}

const sha = (rel: string) => createHash('sha256').update(readFileSync(join(process.cwd(), rel))).digest('hex');
const expectSources = (recorded: Record<string, string>, generator: string) => {
  for (const [rel, hash] of Object.entries(recorded)) expect(hash, `${rel} changed: regenerate with node ${generator}`).toBe(sha(rel));
};

/** `run` as the generators do: the text, or the RangeError message. */
function run(fn: () => string): { ok: true; text: string } | { ok: false; error: string } {
  try {
    return { ok: true, text: fn() };
  } catch (e) {
    if (!(e instanceof RangeError)) throw e;
    return { ok: false, error: e.message };
  }
}

/** JSON with object keys sorted (the fixtures are written that way); array order is kept. */
function canonical(value: unknown): string {
  const sort = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sort);
    if (v && typeof v === 'object') {
      return Object.fromEntries(
        Object.entries(v as Record<string, unknown>)
          .filter(([, x]) => x !== undefined)
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([k, x]) => [k, sort(x)]),
      );
    }
    return v;
  };
  return JSON.stringify(sort(value));
}

/** "(omitted)" in a fixture input means the key was absent. */
const withoutOmitted = <T extends object>(input: T): T =>
  Object.fromEntries(Object.entries(input).filter(([, v]) => v !== '(omitted)')) as T;

// ─── reference-cases.json ────────────────────────────────────────────────

interface ReferenceFixture {
  sourceSha256: Record<string, string>;
  recordCases: { input: { type: string; vesselCode?: string | null; date: string; seq: number }; expected: unknown }[];
  voyageCases: { input: { vesselCode: string | null; date: string; seq: number }; expected: unknown }[];
  scopeCases: { input: { type: string; companyId: string; vesselId: string | null; date: string; voyage?: boolean }; expected: unknown }[];
}
const REF_GEN = 'scripts/db/gen-reference-fixture.mjs';
const references = load<ReferenceFixture>('reference-cases.json', REF_GEN);

describe.skipIf(!references)('reference-cases.json (C21, D-126)', () => {
  const f = references as ReferenceFixture;
  it('was generated from the current reference.ts and dates.ts', () => expectSources(f.sourceSha256, REF_GEN));

  it('formatReference gives the same text or the same rejection on every case', () => {
    const bad = f.recordCases.filter((c) => canonical(run(() => formatReference(withoutOmitted(c.input)))) !== canonical(c.expected));
    expect(bad).toEqual([]);
    expect(f.recordCases.length).toBeGreaterThan(300);
  });

  it('formatVoyageReference on every case', () => {
    const bad = f.voyageCases.filter((c) => canonical(run(() => formatVoyageReference(c.input))) !== canonical(c.expected));
    expect(bad).toEqual([]);
  });

  it('referenceCounterScope on every case', () => {
    const bad = f.scopeCases.filter((c) => canonical(run(() => referenceCounterScope(withoutOmitted(c.input)))) !== canonical(c.expected));
    expect(bad).toEqual([]);
  });
});

// ─── record-transitions.json / record-vessel-lock.json ───────────────────

interface TransitionFixture {
  sourceSha256: Record<string, string>;
  values: unknown[];
  cases: { state: EnvelopeState; input: TransitionInput; expected: number | string }[];
}
interface LockFixture {
  sourceSha256: Record<string, string>;
  cases: { state: Parameters<typeof vesselSignaturesLocked>[0]; sheetCycle: number; expected: boolean }[];
}
const REC_GEN = 'scripts/db/gen-record-fixtures.mjs';
const transitions = load<TransitionFixture>('record-transitions.json', REC_GEN);
const locks = load<LockFixture>('record-vessel-lock.json', REC_GEN);

describe.skipIf(!transitions)('record-transitions.json (gap/08 §C; D-30, D-32, D-51)', () => {
  const f = transitions as TransitionFixture;
  it('was generated from the current companyStep.ts and types.ts', () => expectSources(f.sourceSha256, REC_GEN));

  it('transitionEnvelope equals the fixture on 100% of the cases (error code, or the whole value)', () => {
    const bad: number[] = [];
    f.cases.forEach((c, i) => {
      const r = transitionEnvelope(c.state, c.input);
      const got = r.ok ? canonical(r.value) : r.error.code;
      const want = typeof c.expected === 'number' ? canonical(f.values[c.expected]) : c.expected;
      if (got !== want) bad.push(i);
    });
    expect(bad.slice(0, 20)).toEqual([]);
    expect(f.cases.length).toBeGreaterThan(5000);
  });
});

describe.skipIf(!locks)('record-vessel-lock.json (D-51)', () => {
  const f = locks as LockFixture;
  it('was generated from the current companyStep.ts and types.ts', () => expectSources(f.sourceSha256, REC_GEN));

  it('vesselSignaturesLocked equals the fixture on every case', () => {
    const bad = f.cases.filter((c) => vesselSignaturesLocked(c.state, c.sheetCycle) !== c.expected);
    expect(bad).toEqual([]);
    expect(f.cases.some((c) => c.expected)).toBe(true);
  });
});
