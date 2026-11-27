/**
 * The fleet medical status rules (src/modules/fleet/lib/medicalStatus.ts;
 * gap/02 W8; D-X5-08). The reasons table below is the one the SQL test
 * (supabase/tests/sql/fleet/medical_status.test.sql, between the
 * medical-reasons-table markers) runs through fleet_medical_reasons() and
 * fleet_medical_status_of(); this file pins that copy, the reason and
 * status vocabularies of the migration, and checks every combination of
 * the facts for the invariants the rules promise.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ENG1_STATES,
  MEDICAL_REASONS,
  MEDICAL_REASON_HELP,
  MEDICAL_REASON_LABELS,
  MEDICAL_REASON_LEVEL,
  MEDICAL_STATUSES,
  MEDICAL_STATUS_RANK,
  OCC_HEALTH_STATES,
  compareMedicalRows,
  isMedicalReason,
  medicalReasons,
  medicalStatusOf,
  orderReasons,
  parseMedicalStatusParam,
  tallyMedicalStatus,
  vaccineKey,
  type Eng1State,
  type MedicalFacts,
  type MedicalReason,
  type MedicalStatus,
  type OccHealthState,
} from '@/modules/fleet/lib/medicalStatus';
import { statusMeta } from '@/shared/components/status/statusTone';

const ROOT = process.cwd();
const MIGRATION = readFileSync(join(ROOT, 'supabase/migrations/20261124040700_fleet_medical_status.sql'), 'utf8');
const SQL_TEST = readFileSync(join(ROOT, 'supabase/tests/sql/fleet/medical_status.test.sql'), 'utf8');

interface Case {
  name: string;
  facts: MedicalFacts;
  reasons: MedicalReason[];
  status: MedicalStatus;
}

const BASE: MedicalFacts = {
  hasHealthRecord: true,
  eng1State: 'valid',
  requiredExpired: 0,
  requiredMissing: 0,
  vaccineOverdue: 0,
  boostersDue: 0,
  vaccinationRecords: 2,
  seriousRest: 0,
  restNoncompliant: 0,
  occHealth: 'ok',
};

const c = (name: string, over: Partial<MedicalFacts>, reasons: MedicalReason[], status: MedicalStatus): Case => ({
  name,
  facts: { ...BASE, ...over },
  reasons,
  status,
});

/** Each rule on its own, the edges, and the combinations the order and the levels decide. */
const CASES: Case[] = [
  c('all clear', {}, [], 'ok'),
  c('eng1 expiring within the window but not 30 days', { eng1State: 'expiring' }, [], 'ok'),
  c('rest not tracked', { seriousRest: null, restNoncompliant: null }, [], 'ok'),
  c('eng1 missing', { eng1State: 'missing' }, ['eng1_missing'], 'critical'),
  c('eng1 unfit', { eng1State: 'unfit' }, ['eng1_unfit'], 'critical'),
  c('eng1 expired', { eng1State: 'expired' }, ['eng1_expired'], 'critical'),
  c('required vaccine expired', { requiredExpired: 1 }, ['required_vaccine_expired'], 'critical'),
  c('required vaccine missing', { requiredMissing: 2 }, ['required_vaccine_missing'], 'critical'),
  c('serious rest breach', { seriousRest: 1, restNoncompliant: 1 }, ['serious_rest_breach'], 'critical'),
  c('serious breach hides plain non-compliance', { seriousRest: 1, restNoncompliant: 4 }, ['serious_rest_breach'], 'critical'),
  c('eng1 expiring within 30 days', { eng1State: 'expiring_soon' }, ['eng1_expiring'], 'at_risk'),
  c('booster due', { boostersDue: 1 }, ['booster_due'], 'at_risk'),
  c('vaccine not required expired', { vaccineOverdue: 1 }, ['vaccine_overdue'], 'at_risk'),
  c('rest non-compliance', { restNoncompliant: 2 }, ['rest_noncompliance'], 'at_risk'),
  c('health check overdue', { occHealth: 'overdue' }, ['occ_health_overdue'], 'at_risk'),
  c('no health record', { hasHealthRecord: false, eng1State: 'missing', requiredExpired: null, requiredMissing: null, vaccineOverdue: null, boostersDue: null, vaccinationRecords: null, occHealth: null }, ['eng1_missing', 'no_health_record'], 'critical'),
  c('no health record with an expired eng1 document', { hasHealthRecord: false, eng1State: 'expired', requiredExpired: null, requiredMissing: null, vaccineOverdue: null, boostersDue: null, vaccinationRecords: null, occHealth: null }, ['eng1_expired', 'no_health_record'], 'critical'),
  c('no health record, rest breach', { hasHealthRecord: false, eng1State: 'valid', requiredExpired: null, requiredMissing: null, vaccineOverdue: null, boostersDue: null, vaccinationRecords: null, occHealth: null, restNoncompliant: 1 }, ['rest_noncompliance', 'no_health_record'], 'at_risk'),
  c('eng1 without expiry', { eng1State: 'no_expiry' }, ['eng1_no_expiry'], 'incomplete'),
  c('no vaccination record', { vaccinationRecords: 0 }, ['no_vaccinations'], 'incomplete'),
  c('no health check on file', { occHealth: 'none' }, ['no_occ_health'], 'incomplete'),
  c('no vaccinations and a required one missing', { vaccinationRecords: 0, requiredMissing: 1 }, ['required_vaccine_missing', 'no_vaccinations'], 'critical'),
  c('critical beats at risk', { eng1State: 'expired', boostersDue: 1, occHealth: 'overdue' }, ['eng1_expired', 'booster_due', 'occ_health_overdue'], 'critical'),
  c('at risk beats incomplete', { eng1State: 'expiring_soon', vaccinationRecords: 0, occHealth: 'none' }, ['eng1_expiring', 'no_vaccinations', 'no_occ_health'], 'at_risk'),
  c('every critical reason', { eng1State: 'expired', requiredExpired: 1, requiredMissing: 1, seriousRest: 2, restNoncompliant: 3 }, ['eng1_expired', 'required_vaccine_expired', 'required_vaccine_missing', 'serious_rest_breach'], 'critical'),
  c('every at risk reason', { eng1State: 'expiring_soon', boostersDue: 2, vaccineOverdue: 1, restNoncompliant: 1, occHealth: 'overdue' }, ['eng1_expiring', 'booster_due', 'vaccine_overdue', 'rest_noncompliance', 'occ_health_overdue'], 'at_risk'),
  c('every incomplete reason with a record', { eng1State: 'no_expiry', vaccinationRecords: 0, occHealth: 'none' }, ['eng1_no_expiry', 'no_vaccinations', 'no_occ_health'], 'incomplete'),
  c('unfit and expired vaccines', { eng1State: 'unfit', requiredExpired: 1, vaccineOverdue: 1 }, ['eng1_unfit', 'required_vaccine_expired', 'vaccine_overdue'], 'critical'),
  c('missing eng1 and no health check', { eng1State: 'missing', occHealth: 'none' }, ['eng1_missing', 'no_occ_health'], 'critical'),
  c('zero counts raise nothing', { requiredExpired: 0, requiredMissing: 0, vaccineOverdue: 0, boostersDue: 0, seriousRest: 0, restNoncompliant: 0 }, [], 'ok'),
];

// ─── The SQL copy ─────────────────────────────────────────────────────────

const sqlValue = (v: number | boolean | string | null): string => (v === null ? 'NULL' : typeof v === 'string' ? `'${v}'` : String(v));

/** One row of the SQL test's reasons table. */
function sqlRow(k: Case): string {
  const f = k.facts;
  return `  (${[
    sqlValue(k.name),
    sqlValue(f.hasHealthRecord),
    sqlValue(f.eng1State),
    sqlValue(f.requiredExpired),
    sqlValue(f.requiredMissing),
    sqlValue(f.vaccineOverdue),
    sqlValue(f.boostersDue),
    sqlValue(f.vaccinationRecords),
    sqlValue(f.seriousRest),
    sqlValue(f.restNoncompliant),
    sqlValue(f.occHealth),
    sqlValue(k.reasons.join('|')),
    sqlValue(k.status),
  ].join(', ')})`;
}

const expectedBlock = (): string => CASES.map(sqlRow).join(',\n');

/** The lines between `-- <name>:start` and `-- <name>:end`. */
function block(text: string, name: string): string {
  const start = text.indexOf(`-- ${name}:start`);
  const end = text.indexOf(`-- ${name}:end`);
  expect(start, `${name} start marker`).toBeGreaterThan(-1);
  expect(end, `${name} end marker`).toBeGreaterThan(start);
  return text.slice(text.indexOf('\n', start) + 1, end).replace(/\s+$/, '');
}

if (process.env.WRITE_MEDICAL_TABLE) {
  writeFileSync(process.env.WRITE_MEDICAL_TABLE, `${expectedBlock()}\n`);
}

describe('the reasons table', () => {
  it.each(CASES.map((k) => [k.name, k] as const))('%s', (_name, k) => {
    expect(medicalReasons(k.facts)).toEqual(k.reasons);
    expect(medicalStatusOf(k.reasons)).toBe(k.status);
  });

  it('is the copy the SQL test runs through fleet_medical_reasons() and fleet_medical_status_of()', () => {
    expect(block(SQL_TEST, 'medical-reasons-table')).toBe(expectedBlock());
  });

  it('covers every reason and every status', () => {
    const reasons = new Set(CASES.flatMap((k) => k.reasons));
    expect([...MEDICAL_REASONS].filter((r) => !reasons.has(r))).toEqual([]);
    expect(new Set(CASES.map((k) => k.status))).toEqual(new Set(MEDICAL_STATUSES));
  });
});

// ─── The migration's vocabulary ───────────────────────────────────────────

/** The body of a function in the migration. */
function functionBody(name: string): string {
  const at = MIGRATION.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  expect(at, name).toBeGreaterThan(-1);
  const start = MIGRATION.indexOf('AS $$', at);
  return MIGRATION.slice(start, MIGRATION.indexOf('\n$$;', start));
}

describe('the migration', () => {
  it('lists the reasons in the same order as fleet_medical_reasons()', () => {
    const body = functionBody('fleet_medical_reasons');
    expect([...body.matchAll(/THEN '([a-z0-9_]+)' END/g)].map((m) => m[1])).toEqual([...MEDICAL_REASONS]);
  });

  it('gives each reason the same level in fleet_medical_status_of()', () => {
    const body = functionBody('fleet_medical_status_of');
    const levels: Record<string, string> = {};
    for (const m of body.matchAll(/ARRAY\[([^\]]+)\]::text\[\] THEN '([a-z_]+)'/g)) {
      for (const r of m[1].matchAll(/'([a-z0-9_]+)'/g)) levels[r[1]] = m[2];
    }
    expect(levels).toEqual({ ...MEDICAL_REASON_LEVEL });
  });

  it('validates the statuses the client knows', () => {
    const body = functionBody('fleet_crew_medical_status');
    const list = body.match(/s NOT IN \(([^)]+)\)/);
    expect(list).not.toBeNull();
    expect([...(list as RegExpMatchArray)[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1])).toEqual([...MEDICAL_STATUSES]);
  });

  it('answers only ENG1 states the client knows', () => {
    const body = functionBody('fleet_crew_medical_status');
    for (const state of ['unfit', 'missing', 'no_expiry']) expect(body).toContain(`'${state}'`);
    // The rest are expiry_bucket() answers (C5).
    expect(body).toContain('public.expiry_bucket(b.b_eff, v_med_window, v_today)');
    expect([...ENG1_STATES].sort()).toEqual(['expired', 'expiring', 'expiring_soon', 'missing', 'no_expiry', 'unfit', 'valid']);
  });

  it('never reads clinical text (an exemption is read only for whether one is recorded)', () => {
    const body = functionBody('fleet_crew_medical_status');
    for (const column of ['restrictions', 'notes', 'condition_name', 'allergen', 'reaction', 'treatment', 'summary', 'recommendations', 'examiner_name', 'total_score', 'risk_band', 'severity']) {
      expect(body, column).not.toMatch(new RegExp(`\\.${column}\\b`));
    }
    expect(body).toContain("nullif(btrim(coalesce(x.exemption_reason, '')), '') IS NOT NULL AS v_exempt");
  });
});

// ─── Every combination ────────────────────────────────────────────────────

function* allFacts(): Generator<MedicalFacts> {
  const counts = [null, 0, 1] as const;
  for (const hasHealthRecord of [true, false])
    for (const eng1State of ENG1_STATES)
      for (const requiredExpired of counts)
        for (const requiredMissing of counts)
          for (const vaccineOverdue of counts)
            for (const boostersDue of counts)
              for (const vaccinationRecords of [0, 2])
                for (const seriousRest of counts)
                  for (const restNoncompliant of counts)
                    for (const occHealth of [null, ...OCC_HEALTH_STATES] as (OccHealthState | null)[])
                      yield { hasHealthRecord, eng1State: eng1State as Eng1State, requiredExpired, requiredMissing, vaccineOverdue, boostersDue, vaccinationRecords, seriousRest, restNoncompliant, occHealth };
}

describe('every combination of the facts', () => {
  /** The W8 invariants one combination breaks (empty = none). */
  function violations(f: MedicalFacts): string[] {
    const out: string[] = [];
    const reasons = medicalReasons(f);
    const status = medicalStatusOf(reasons);
    const ranks = reasons.map((r) => MEDICAL_STATUS_RANK[MEDICAL_REASON_LEVEL[r]]);
    // In the fixed order, each once; most severe first.
    if (reasons.join() !== orderReasons(reasons).join()) out.push('order');
    if (ranks.some((r, i) => i > 0 && r < ranks[i - 1])) out.push('severity order');
    // The status is the most severe level, and ok only without reasons.
    if (MEDICAL_STATUS_RANK[status] !== (ranks.length ? Math.min(...ranks) : MEDICAL_STATUS_RANK.ok)) out.push('status');
    // One ENG1 reason at most; a missing ENG1 is critical with or without a Health record (D-385).
    if (reasons.filter((r) => r.startsWith('eng1_')).length > 1) out.push('one eng1 reason');
    if (f.eng1State === 'missing' && !reasons.includes('eng1_missing')) out.push('missing eng1');
    if (!f.hasHealthRecord && (!reasons.includes('no_health_record') || reasons.some((r) => ['no_vaccinations', 'no_occ_health'].includes(r)))) {
      out.push('no health record');
    }
    // A serious breach is listed instead of plain non-compliance; unknown rest raises nothing.
    if (reasons.includes('serious_rest_breach') && reasons.includes('rest_noncompliance')) out.push('serious and plain');
    if (f.seriousRest === null && f.restNoncompliant === null && reasons.some((r) => r.includes('rest'))) out.push('untracked rest');
    // Critical exactly when a W8 critical rule holds.
    const critical =
      f.eng1State === 'missing' ||
      f.eng1State === 'unfit' ||
      f.eng1State === 'expired' ||
      (f.requiredExpired ?? 0) > 0 ||
      (f.requiredMissing ?? 0) > 0 ||
      (f.seriousRest ?? 0) > 0;
    if ((status === 'critical') !== critical) out.push('critical rule');
    return out;
  }

  it('keeps the invariants of W8', () => {
    let n = 0;
    const broken: string[] = [];
    for (const f of allFacts()) {
      n += 1;
      const v = violations(f);
      if (v.length && broken.length < 5) broken.push(`${JSON.stringify(f)}: ${v.join(', ')}`);
    }
    expect(broken).toEqual([]);
    expect(n).toBe(2 * 7 * 3 * 3 * 3 * 3 * 2 * 3 * 3 * 4);
  }, 60_000);
});

// ─── Helpers ──────────────────────────────────────────────────────────────

describe('labels and the status tone', () => {
  it('has a chip label and a help line for every reason', () => {
    for (const r of MEDICAL_REASONS) {
      expect(MEDICAL_REASON_LABELS[r].length).toBeGreaterThan(0);
      expect(MEDICAL_REASON_LABELS[r].length).toBeLessThanOrEqual(28);
      expect(MEDICAL_REASON_HELP[r].endsWith('.')).toBe(true);
    }
  });

  it('uses the medical_status tone domain for every status', () => {
    expect(MEDICAL_STATUSES.map((s) => statusMeta('medical_status', s).tone)).toEqual(['danger', 'warn', 'info', 'ok']);
  });

  it('knows its vocabularies', () => {
    expect(isMedicalReason('eng1_missing')).toBe(true);
    expect(isMedicalReason('eng1_lost')).toBe(false);
    expect(parseMedicalStatusParam('at_risk')).toBe('at_risk');
    expect(parseMedicalStatusParam('AT_RISK')).toBeNull();
    expect(parseMedicalStatusParam(null)).toBeNull();
  });
});

describe('sorting and counting', () => {
  const row = (status: MedicalStatus, reasons: MedicalReason[], vesselName: string, personName: string, profileId = personName) => ({
    status,
    reasons,
    vesselName,
    personName,
    profileId,
  });

  it('orders most severe first, then more reasons, then vessel and name', () => {
    const rows = [
      row('ok', [], 'ALPHA', 'Ann'),
      row('at_risk', ['booster_due'], 'BRAVO', 'Bea'),
      row('critical', ['eng1_expired'], 'BRAVO', 'Cal'),
      row('critical', ['eng1_expired', 'required_vaccine_missing'], 'CHARLIE', 'Dee'),
      row('incomplete', ['no_occ_health'], 'ALPHA', 'Eve'),
      row('critical', ['eng1_expired'], 'ALPHA', 'Fay'),
    ];
    expect([...rows].sort(compareMedicalRows).map((r) => r.personName)).toEqual(['Dee', 'Fay', 'Cal', 'Bea', 'Eve', 'Ann']);
  });

  it('counts people per status', () => {
    expect(tallyMedicalStatus([{ status: 'critical' }, { status: 'critical' }, { status: 'ok' }])).toEqual({ critical: 2, at_risk: 0, incomplete: 0, ok: 1 });
  });

  it('compares vaccine names as the server does', () => {
    expect(vaccineKey('  Yellow   Fever ')).toBe('yellow fever');
    expect(vaccineKey('   ')).toBeNull();
    expect(vaccineKey(null)).toBeNull();
  });
});
