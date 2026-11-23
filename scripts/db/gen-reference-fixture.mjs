#!/usr/bin/env node
/**
 * Writes supabase/tests/fixtures/reference-cases.json from the frozen TS
 * reference formatter src/lib/records/reference.ts (+ dates.ts) (DECISIONS
 * C21; gap/01 F21; Phase 2 spec §A.6, §E). The SQL tests in
 * supabase/tests/sql/p2_reference assert that format_reference_text(),
 * format_voyage_reference_text() and reference_counter_scope() give the
 * same text, or refuse the same input.
 *
 *   node scripts/db/gen-reference-fixture.mjs           # (re)write the fixture
 *   node scripts/db/gen-reference-fixture.mjs --check   # exit 1 when it is out of date
 *
 * Every case records the TS input, the TS answer (`ok` + `text`, or
 * `ok: false` + the RangeError message) and `sql`: the arguments the SQL
 * function receives. The SQL functions take a `date` and an `integer`, so
 * a TS input those types cannot carry (an impossible date string, a
 * fractional or out-of-range counter) has `sql: null` with the reason in
 * `sqlSkip`: the type system refuses it before the function runs. A date
 * string passes to SQL as `toCalendarDate()` reads it (its first ten
 * characters), which is the value a `date` column would hold.
 */
import { join } from 'node:path';
import { REPO_ROOT, keyUuid, writeFixture, loadTs } from './lib/load-ts.mjs';

const REFERENCE = 'src/lib/records/reference.ts';
const DATES = 'src/lib/records/dates.ts';
const OUT = join(REPO_ROOT, 'supabase/tests/fixtures/reference-cases.json');

const { modules, sourceSha256 } = await loadTs([REFERENCE, DATES]);
const { formatReference, formatVoyageReference, referenceCounterScope } = modules[REFERENCE];
const { toCalendarDate } = modules[DATES];

const INT_MAX = 2147483647;

function run(fn) {
  try {
    return { ok: true, text: fn() };
  } catch (e) {
    if (!(e instanceof RangeError)) throw e;
    return { ok: false, error: e.message };
  }
}

/** The SQL `date` argument for a TS date input, or a reason it cannot be one. */
function sqlDate(date) {
  try {
    return { value: toCalendarDate(date) };
  } catch {
    return { skip: `"${date}" is not a calendar date: a date argument cannot carry it` };
  }
}

function sqlSeq(seq) {
  if (!Number.isInteger(seq)) return { skip: `${seq} is not a whole number: an integer argument cannot carry it` };
  if (seq > INT_MAX || seq < -INT_MAX - 1) return { skip: `${seq} is outside the integer range` };
  return { value: seq };
}

const TYPES = ['PTW', 'ptw', ' ptw ', ' Ptw\t', 'P', 'AUD', 'ABCDEFGH', 'ABCDEFGHI', 'A1B2C3D4', '1AB', 'P-T', 'P_T', '', ' ', 'ßa', 'ﬁx', 'éa', 'PTW​'];
const VESSEL_CODES = [undefined, null, '', '  ', ' ', 'DRA', 'dra', ' dra ', 'DR1', 'dr1', 'DR', 'DRAA', '1RA', 'D-1', 'ßa', 'ﬁx', 'éab', 'ABC\n'];
const DATES_IN = [
  '2026-11-23', '2026-01-01', '2026-12-31', '2026-11-23T23:59:59Z', '2026-11-23T00:30:00+05:00', '  2026-03-04  ',
  '0001-01-01', '0099-06-30', '1000-02-28', '9999-12-31', '2024-02-29', '2000-02-29', '1900-02-28', '2004-02-29',
  '2023-02-29', '1900-02-29', '2026-13-01', '2026-00-10', '2026-04-31', '20261123', 'garbage', '', '2026-11-2',
];
const SEQS = [1, 2, 9, 10, 99, 100, 999, 1000, 1001, 12345, 2147483647, 0, -1, -999, 1.5, 2147483648];

const recordCases = [];
const add = (input) => {
  const ts = run(() => formatReference(input));
  const d = sqlDate(input.date);
  const s = sqlSeq(input.seq);
  const skip = d.skip ?? s.skip;
  recordCases.push({
    input: { ...input, vesselCode: input.vesselCode === undefined ? '(omitted)' : input.vesselCode },
    expected: ts,
    sql: skip ? null : { type: input.type, vesselCode: input.vesselCode ?? null, on: d.value, seq: s.value },
    ...(skip ? { sqlSkip: skip } : {}),
  });
};
for (const type of TYPES) for (const vesselCode of VESSEL_CODES) add({ type, vesselCode, date: '2026-11-23', seq: 61 });
for (const date of DATES_IN) for (const vesselCode of [null, 'DRA']) add({ type: 'PTW', vesselCode, date, seq: 4 });
for (const seq of SEQS) for (const vesselCode of [null, 'DRA']) add({ type: 'AUD', vesselCode, date: '2026-06-01', seq });

const voyageCases = [];
for (const vesselCode of [null, ...VESSEL_CODES.filter((v) => v !== undefined)]) {
  for (const [date, seq] of [['2026-11-03', 37], ['2026-11-03', 1000], ['0001-01-01', 1], ['9999-12-31', 999], ['2026-02-30', 1], ['2026-11-03', 0], ['2026-11-03', 2.5]]) {
    const ts = run(() => formatVoyageReference({ vesselCode, date, seq }));
    const d = sqlDate(date);
    const s = sqlSeq(seq);
    const skip = d.skip ?? s.skip;
    voyageCases.push({
      input: { vesselCode, date, seq },
      expected: ts,
      sql: skip ? null : { vesselCode, on: d.value, seq: s.value },
      ...(skip ? { sqlSkip: skip } : {}),
    });
  }
}

const COMPANY = keyUuid('company:A');
const COMPANY_B = keyUuid('company:B');
const VESSEL = keyUuid('vessel:A.dra');
const VESSEL_2 = keyUuid('vessel:A.hyd');
const scopeCases = [];
for (const [type, companyId, vesselId, date, voyage] of [
  ['PTW', COMPANY, VESSEL, '2026-11-23', false],
  ['ptw', COMPANY, VESSEL, '2026-11-23', false],
  [' aud ', COMPANY, null, '2026-11-23', false],
  ['AUD', COMPANY, null, '2026-11-23', undefined],
  ['AUD', COMPANY_B, null, '2027-01-01', false],
  ['PTW', COMPANY, VESSEL_2, '2026-12-31T23:59:59Z', false],
  ['PTW', COMPANY, VESSEL, '0001-01-01', false],
  ['1AB', COMPANY, VESSEL, '2026-11-23', false],
  ['', COMPANY, VESSEL, '2026-11-23', false],
  ['ABCDEFGHI', COMPANY, null, '2026-11-23', false],
  ['PTW', COMPANY, VESSEL, '2026-02-30', false],
  ['PTW', COMPANY, VESSEL, '2026-11-03', true],
  ['', COMPANY, VESSEL, '2026-11-03', true],
  ['1AB', COMPANY, VESSEL_2, '9999-12-31', true],
  ['PTW', COMPANY, null, '2026-11-03', true],
  ['PTW', COMPANY, VESSEL, 'garbage', true],
]) {
  const input = { type, companyId, vesselId, date, ...(voyage === undefined ? {} : { voyage }) };
  const ts = run(() => referenceCounterScope(input));
  const d = sqlDate(date);
  scopeCases.push({
    input: { ...input, voyage: voyage === undefined ? '(omitted)' : voyage },
    expected: ts,
    sql: d.skip ? null : { type, companyId, vesselId, on: d.value, voyage: voyage ?? false },
    ...(d.skip ? { sqlSkip: d.skip } : {}),
  });
}

writeFixture(
  OUT,
  {
    version: 1,
    generator: 'scripts/db/gen-reference-fixture.mjs',
    sourceSha256,
    description:
      'Reference-format cases generated from src/lib/records/reference.ts (C21). The SQL functions of 20261123000600_platform_format_reference.sql must give the same text for every case whose `sql` is set, and refuse (SQLSTATE 22023) every such case whose expected.ok is false. `sql: null` cases are TS inputs a date / integer argument cannot carry (sqlSkip says why). Regenerate with node scripts/db/gen-reference-fixture.mjs; never edit by hand.',
    recordCases,
    voyageCases,
    scopeCases,
    counts: {
      recordCases: recordCases.length,
      voyageCases: voyageCases.length,
      scopeCases: scopeCases.length,
      sqlCases: [...recordCases, ...voyageCases, ...scopeCases].filter((c) => c.sql).length,
    },
  },
  { compactDepth: 2 },
);
