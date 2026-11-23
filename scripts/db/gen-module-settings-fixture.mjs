#!/usr/bin/env node
/**
 * Writes supabase/tests/fixtures/module-settings-cases.json from the frozen
 * TS resolver src/modules/vessels/lib/moduleSettings.ts (DECISIONS D-63,
 * D-86, C13; Phase 2 spec §A.5, CC-9). The SQL test
 * supabase/tests/sql/p2_module_settings asserts that module_enabled() gives
 * `resolveModuleSettings({status:'ready', source:'table', settings}, today)
 * .isModuleOn(key)` for every case.
 *
 *   node scripts/db/gen-module-settings-fixture.mjs           # (re)write the fixture
 *   node scripts/db/gen-module-settings-fixture.mjs --check   # exit 1 when it is out of date
 *
 * Each case is one vessel's rows, a `today` and the key asked about. A row's
 * `enabledFrom` is what the client reads from the `date` column: PostgREST
 * always returns a `date` as `YYYY-MM-DD` (years 0001–9999, which the
 * table's range CHECK enforces). Cases whose rows hold a string a `date`
 * column can never return (`storable: false`: garbage, a timestamp, a
 * year past 9999, an impossible day) pin how the TS treats them; the SQL
 * test checks that the column refuses or normalises such a value, so the
 * TS branch for it is unreachable from server data.
 */
import { join } from 'node:path';
import { REPO_ROOT, seededRandom, writeFixture, loadTs } from './lib/load-ts.mjs';

const SOURCE = 'src/modules/vessels/lib/moduleSettings.ts';
const OUT = join(REPO_ROOT, 'supabase/tests/fixtures/module-settings-cases.json');

const { modules, sourceSha256 } = await loadTs([SOURCE]);
const { resolveModuleSettings, parentModuleKeys } = modules[SOURCE];

const CANONICAL = /^(\d{4})-(\d{2})-(\d{2})$/;
function canonicalDate(s) {
  const m = CANONICAL.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < 1 || mo < 1 || mo > 12 || d < 1) return false;
  const last = new Date(Date.UTC(2000, mo, 0));
  last.setUTCFullYear(y, mo, 0);
  return d <= last.getUTCDate();
}

const isOn = (rows, today, key) => {
  const settings = new Map(rows.map((r) => [r.moduleKey, { moduleKey: r.moduleKey, enabled: r.enabled, enabledFrom: r.enabledFrom, labelOverride: r.labelOverride }]));
  return resolveModuleSettings({ status: 'ready', source: 'table', settings }, today).isModuleOn(key);
};

const cases = [];
const addCase = (name, rows, today, key) => {
  const storable = rows.every((r) => r.enabledFrom === null || canonicalDate(r.enabledFrom));
  cases.push({ name, rows, today, key, parents: parentModuleKeys(key), storable, expected: isOn(rows, today, key) });
};
const row = (moduleKey, enabled = true, enabledFrom = null, labelOverride = null) => ({ moduleKey, enabled, enabledFrom, labelOverride });

const TODAY = '2026-11-23';
// The basics.
addCase('no rows: on', [], TODAY, 'crew_hor');
addCase('missing row for the key: on', [row('charter', false)], TODAY, 'crew_hor');
addCase('enabled row: on', [row('crew_hor')], TODAY, 'crew_hor');
addCase('enabled false: off', [row('crew_hor', false)], TODAY, 'crew_hor');
addCase('enabled_from yesterday: on', [row('crew_hor', true, '2026-11-22')], TODAY, 'crew_hor');
addCase('enabled_from today: on', [row('crew_hor', true, TODAY)], TODAY, 'crew_hor');
addCase('enabled_from tomorrow: off', [row('crew_hor', true, '2026-11-24')], TODAY, 'crew_hor');
addCase('enabled_from far future: off', [row('crew_hor', true, '9999-12-31')], TODAY, 'crew_hor');
addCase('enabled_from far past: on', [row('crew_hor', true, '0001-01-01')], TODAY, 'crew_hor');
addCase('enabled false with past date: off', [row('crew_hor', false, '2020-01-01')], TODAY, 'crew_hor');
addCase('label only: on', [row('charter', true, null, 'Trip')], TODAY, 'charter');
// Dotted parents.
addCase('parent off: child off', [row('technical', false)], TODAY, 'technical.jobs');
addCase('parent future: child off', [row('technical', true, '2027-01-01')], TODAY, 'technical.jobs');
addCase('child off, parent on: off', [row('technical'), row('technical.jobs', false)], TODAY, 'technical.jobs');
addCase('child off: parent stays on', [row('technical.jobs', false)], TODAY, 'technical');
addCase('grandparent off', [row('a', false)], TODAY, 'a.b.c');
addCase('middle off', [row('a.b', false)], TODAY, 'a.b.c');
addCase('sibling off: on', [row('a.x', false)], TODAY, 'a.b.c');
addCase('prefix is not a parent: on', [row('tech', false)], TODAY, 'technical.jobs');
addCase('deep chain all on', [row('a'), row('a.b'), row('a.b.c'), row('a.b.c.d', true, '2026-01-01')], TODAY, 'a.b.c.d');
addCase('deep chain leaf future', [row('a'), row('a.b'), row('a.b.c', true, '2026-11-24')], TODAY, 'a.b.c.d');
// Keys as the caller may spell them (parentModuleKeys drops empty segments).
addCase('empty key: on', [row('crew_hor', false)], TODAY, '');
addCase('dot only: on', [row('crew_hor', false)], TODAY, '.');
addCase('double dot', [row('a', false)], TODAY, 'a..b');
addCase('double dot, joined key off', [row('a.b', false)], TODAY, 'a..b');
addCase('leading dot', [row('a', false)], TODAY, '.a');
addCase('trailing dot', [row('a', false)], TODAY, 'a.');
addCase('case differs: on', [row('crew_hor', false)], TODAY, 'CREW_HOR');
addCase('space in key: on', [row('crew_hor', false)], TODAY, ' crew_hor');
// Other todays.
for (const today of ['2026-11-22', '2026-11-24', '2025-12-31', '2027-01-01', '0001-01-01', '9999-12-31']) {
  addCase(`today ${today}`, [row('crew_hor', true, '2026-11-23'), row('charter', true, '2026-01-01')], today, 'crew_hor');
}
// Values a date column never returns (storable: false): how the TS treats them.
for (const v of ['garbage', '', '2026-13-01', '2026-02-30', '2026-11-24T00:00:00Z', '2026-11-24 10:00', '20261124', '10000-01-01', '2026/11/24', ' 2026-11-24', 'infinity', 'tomorrow', '2026-11-24 BC']) {
  addCase(`not a column value: ${JSON.stringify(v)}`, [row('crew_hor', true, v)], TODAY, 'crew_hor');
}
// Seeded random cases over a small key tree.
const rnd = seededRandom(86);
const KEYS = ['crew', 'crew.hor', 'crew.hor.sign', 'crew.leave', 'technical', 'technical.jobs', 'charter', 'safety', 'safety.permits'];
const DATES = [null, null, null, '2026-11-22', TODAY, '2026-11-24', '2025-01-01', '2030-06-15'];
for (let i = 0; i < 300; i += 1) {
  const rows = KEYS.filter(() => rnd() < 0.35).map((k) => row(k, rnd() < 0.8, DATES[Math.floor(rnd() * DATES.length)], rnd() < 0.1 ? 'Label' : null));
  const today = ['2026-11-22', TODAY, '2026-11-24', '2031-01-01'][Math.floor(rnd() * 4)];
  addCase(`random ${String(i).padStart(3, '0')}`, rows, today, KEYS[Math.floor(rnd() * KEYS.length)]);
}

writeFixture(
  OUT,
  {
    version: 1,
    generator: 'scripts/db/gen-module-settings-fixture.mjs',
    sourceSha256,
    description:
      'module_enabled() parity cases generated from src/modules/vessels/lib/moduleSettings.ts (D-63, D-86, CC-9). For every storable case, inserting `rows` for one vessel and calling module_enabled(vessel, key, today) must return `expected`. storable=false cases hold enabledFrom strings a date column never returns; the SQL test checks the column refuses or normalises them. Regenerate with node scripts/db/gen-module-settings-fixture.mjs; never edit by hand.',
    cases,
    counts: { cases: cases.length, storable: cases.filter((c) => c.storable).length },
  },
  { compactDepth: 2 },
);
