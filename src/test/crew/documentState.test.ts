/**
 * The crew document state and tabs (X1-04; gap/04 C23, C24, C29, W3;
 * DECISIONS C5, D-31; T-185):
 *
 * - lib/documentState: the D-31 boundary table is the EXP1 fixture of
 *   src/test/lib/records/expiry.test.ts (read from that file, so the two
 *   never drift), every row on the document's window (90, passport 270, a
 *   14-day and a zero rule); the precedence not_uploaded > missing_date >
 *   bucket; the item-type default windows; alerts off as an overlay;
 *   endorsements; attention, badges, the legend; the server rule pinned in
 *   the migration and the SQL test copying the same table; the default
 *   window and the endorsement rule held equal to X5's
 *   src/modules/fleet/lib/expiryWindows.ts and endorsement.ts (restated in
 *   documentState because the crew module may not import fleet internals);
 * - lib/documentTabs: the tab of every seeded category and every legacy
 *   string, read from the migration's seed; the legacy key normaliser on
 *   the SQL test's cases; field schemas.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CREW_DOCUMENT_STATES,
  DOCUMENT_ENDORSEMENT_STATES,
  DOCUMENT_LEGEND_KEYS,
  PASSPORT_DOCUMENT_WINDOW_DAYS,
  countDocumentLegend,
  deriveDocumentState,
  documentBadges,
  documentEndorsementState,
  documentLegendKey,
  documentStateFromServer,
  documentWindowDays,
} from '@/modules/crew/lib/documentState';
import { DEFAULT_ENDORSEMENT_WINDOW_DAYS, ENDORSEMENT_STATES, endorsementState } from '@/modules/fleet/lib/endorsement';
import { EXPIRY_ITEM_TYPES, PASSPORT_WINDOW_DAYS, expiryDefaultWindow } from '@/modules/fleet/lib/expiryWindows';
import {
  CREW_DOCUMENT_TABS,
  LEGACY_CATEGORY,
  SYSTEM_CATEGORY_TAB,
  UNCLASSIFIED_TAB,
  itemTypeForCategory,
  legacyCategoryFor,
  legacyDocumentKey,
  readFieldSchema,
  tabForCategory,
  tabForLegacy,
} from '@/modules/crew/lib/documentTabs';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
const MIGRATION = read('supabase/migrations/20261124060400_crew_document_catalogue.sql');
const SQL_TEST = read('supabase/tests/sql/crew/document_catalogue.test.sql');

const TODAY = '2026-11-22';
const plus = (days: number) => {
  const d = new Date(Date.UTC(2026, 10, 22 + days));
  return d.toISOString().slice(0, 10);
};

/** The D-31 boundary table: label, window, bucket, days (the EXP1 rows, relative to TODAY). */
const BOUNDARIES: ReadonlyArray<{ label: string; windowDays: number; bucket: string; days: number }> = [
  { label: 'a year overdue', windowDays: 90, bucket: 'expired', days: -365 },
  { label: 'the day after the expiry date', windowDays: 90, bucket: 'expired', days: -1 },
  { label: 'the expiry date itself', windowDays: 90, bucket: 'expiring_soon', days: 0 },
  { label: 'the day before the expiry date', windowDays: 90, bucket: 'expiring_soon', days: 1 },
  { label: 'last day of the 30-day tier', windowDays: 90, bucket: 'expiring_soon', days: 30 },
  { label: 'first day past the 30-day tier', windowDays: 90, bucket: 'expiring', days: 31 },
  { label: 'last day of the window', windowDays: 90, bucket: 'expiring', days: 90 },
  { label: 'first day past the window', windowDays: 90, bucket: 'valid', days: 91 },
  { label: 'passport, last day of 270', windowDays: 270, bucket: 'expiring', days: 270 },
  { label: 'passport, past 270', windowDays: 270, bucket: 'valid', days: 271 },
  { label: '14-day window, last day', windowDays: 14, bucket: 'expiring_soon', days: 14 },
  { label: '14-day window, past it', windowDays: 14, bucket: 'valid', days: 15 },
  { label: 'zero window, expiry date', windowDays: 0, bucket: 'expiring_soon', days: 0 },
  { label: 'zero window, the day after', windowDays: 0, bucket: 'expired', days: -1 },
];

describe('the D-31 boundary table', () => {
  it('is the EXP1 fixture of src/test/lib/records/expiry.test.ts, row for row', () => {
    const src = read('src/test/lib/records/expiry.test.ts');
    const today = /const TODAY = '([0-9-]+)'/.exec(src)?.[1];
    expect(today).toBe(TODAY);
    const body = src.slice(src.indexOf('const EXPIRY_BUCKET_FIXTURE'), src.indexOf('];', src.indexOf('const EXPIRY_BUCKET_FIXTURE')));
    const re = /\{ case: '([^']+)', expiresOn: '([0-9-]+)', windowDays: ([0-9]+), today: TODAY, bucket: '([a-z_]+)', days: (-?[0-9]+) \}/g;
    const rows = [...body.matchAll(re)].map((m) => ({ label: m[1], expiresOn: m[2], windowDays: Number(m[3]), bucket: m[4], days: Number(m[5]) }));
    expect(rows).toHaveLength(14);
    expect(rows.map(({ label, windowDays, bucket, days }) => ({ label, windowDays, bucket, days }))).toEqual(BOUNDARIES);
    for (const r of rows) expect(plus(r.days), r.label).toBe(r.expiresOn);
  });

  it('is the table the SQL test checks crew_documents_for_profile against', () => {
    const block = SQL_TEST.slice(SQL_TEST.indexOf('CREATE TEMP TABLE exp1'), SQL_TEST.indexOf('GRANT SELECT ON exp1'));
    const rows = [...block.matchAll(/\('([^']+)', (\d+), '([a-z_]+)', (-?\d+)\)/g)].map((m) => ({ label: m[1], windowDays: Number(m[2]), bucket: m[3], days: Number(m[4]) }));
    expect(rows).toEqual(BOUNDARIES);
  });

  it.each(BOUNDARIES)('$label: $bucket ($days d) on a $windowDays-day window', ({ windowDays, bucket, days }) => {
    const r = deriveDocumentState({ hasFile: true, expiryDate: plus(days), noExpiry: false, windowDays, today: TODAY });
    expect(r).toMatchObject({ state: bucket, bucket, daysRemaining: days, windowDays, incomplete: false });
  });

  it('a passport gets 270 days and everything else 90 when no rule is given (expiry_default_window)', () => {
    expect(documentWindowDays('passport')).toBe(270);
    expect(documentWindowDays('crew_qualification')).toBe(90);
    expect(documentWindowDays('medical')).toBe(90);
    expect(documentWindowDays(null)).toBe(90);
    expect(documentWindowDays('passport', 14)).toBe(14);
    expect(deriveDocumentState({ hasFile: true, expiryDate: plus(270), noExpiry: false, itemType: 'passport', today: TODAY })).toMatchObject({ bucket: 'expiring', windowDays: 270 });
    expect(deriveDocumentState({ hasFile: true, expiryDate: plus(271), noExpiry: false, itemType: 'passport', today: TODAY }).bucket).toBe('valid');
    expect(deriveDocumentState({ hasFile: true, expiryDate: plus(91), noExpiry: false, itemType: 'visa', today: TODAY }).bucket).toBe('valid');
  });
});

describe('the state rule', () => {
  const base = { hasFile: true, expiryDate: plus(200), noExpiry: false, today: TODAY } as const;

  it('no file: not_uploaded, whatever the date (the bucket stays known)', () => {
    expect(deriveDocumentState({ ...base, hasFile: false })).toMatchObject({ state: 'not_uploaded', bucket: 'valid', incomplete: true });
    expect(deriveDocumentState({ ...base, hasFile: false, expiryDate: plus(-5) })).toMatchObject({ state: 'not_uploaded', bucket: 'expired' });
    expect(deriveDocumentState({ ...base, hasFile: false, expiryDate: null })).toMatchObject({ state: 'not_uploaded', bucket: null });
  });

  it('no date without the tick: missing_date, never valid (D-31), with no bucket and no days', () => {
    for (const expiryDate of [null, undefined, '', '  ']) {
      expect(deriveDocumentState({ ...base, expiryDate })).toMatchObject({ state: 'missing_date', bucket: null, daysRemaining: null, incomplete: true, needsAttention: true });
    }
  });

  it('the tick: no_expiry, no days, nothing to do', () => {
    expect(deriveDocumentState({ ...base, expiryDate: null, noExpiry: true })).toMatchObject({ state: 'no_expiry', bucket: 'no_expiry', daysRemaining: null, needsAttention: false, incomplete: false });
  });

  it('alerts off keeps the real state and raises nothing', () => {
    const r = deriveDocumentState({ ...base, expiryDate: plus(-3), alertsMuted: true });
    expect(r).toMatchObject({ state: 'expired', bucket: 'expired', alertsOff: true, needsAttention: false });
    expect(deriveDocumentState({ ...base, expiryDate: plus(-3) }).needsAttention).toBe(true);
  });

  it('endorsements: due from 30 days before through the date, overdue after (expiry_endorsement_state)', () => {
    expect(deriveDocumentState({ ...base, endorsementDueDate: plus(30) }).endorsement).toBe('due');
    expect(deriveDocumentState({ ...base, endorsementDueDate: plus(0) }).endorsement).toBe('due');
    expect(deriveDocumentState({ ...base, endorsementDueDate: plus(31) }).endorsement).toBeNull();
    expect(deriveDocumentState({ ...base, endorsementDueDate: plus(-1) })).toMatchObject({ endorsement: 'overdue', needsAttention: true });
    expect(deriveDocumentState({ ...base, endorsementDueDate: null }).endorsement).toBeNull();
  });

  it("the restated X5 rules equal X5's: default windows on every item type, endorsement on every boundary", () => {
    expect(PASSPORT_DOCUMENT_WINDOW_DAYS).toBe(PASSPORT_WINDOW_DAYS);
    for (const t of [...EXPIRY_ITEM_TYPES, 'crew_document', 'crew_qualification', 'work_authorisation', null, undefined, 'unknown']) {
      expect(documentWindowDays(t), String(t)).toBe(expiryDefaultWindow(t));
    }
    expect([...DOCUMENT_ENDORSEMENT_STATES]).toEqual([...ENDORSEMENT_STATES]);
    expect(DEFAULT_ENDORSEMENT_WINDOW_DAYS).toBe(30);
    for (const d of [-400, -31, -30, -2, -1, 0, 1, 29, 30, 31, 32, 365]) {
      expect(documentEndorsementState(plus(d), TODAY), String(d)).toBe(endorsementState({ dueOn: plus(d), today: TODAY, windowDays: 30 }));
    }
    for (const blank of [null, undefined, '', '  ']) expect(documentEndorsementState(blank, TODAY)).toBe(endorsementState({ dueOn: blank, today: TODAY }));
  });

  it('attention: the expiry buckets of the engine, a missing date, an endorsement', () => {
    expect(deriveDocumentState({ ...base, expiryDate: plus(10) }).needsAttention).toBe(true);
    expect(deriveDocumentState({ ...base, expiryDate: plus(80) }).needsAttention).toBe(true);
    expect(deriveDocumentState({ ...base, expiryDate: plus(200) }).needsAttention).toBe(false);
  });

  it('the server rule is the same (pinned in crew_documents_for_profile)', () => {
    expect(MIGRATION).toContain("CASE WHEN NOT s.t_has_file THEN 'not_uploaded' WHEN s.t_bucket IS NULL THEN 'missing_date' ELSE s.t_bucket END");
    expect(MIGRATION).toContain('CASE WHEN b.expiry_date IS NULL AND NOT b.no_expiry THEN NULL');
    expect(MIGRATION).toContain('public.expiry_endorsement_state(s.endorsement_due_date, current_date, 30)');
    expect(MIGRATION).toContain('(cc.file_path IS NOT NULL OR nullif(btrim(cc.file_url), \'\') IS NOT NULL) AS t_has_file');
  });

  it('a server row maps without recomputing', () => {
    const r = documentStateFromServer({ state: 'missing_date', bucket: null, days_remaining: null, window_days: 90, alerts_muted: false, endorsement_state: null, has_file: true });
    expect(r).toMatchObject({ state: 'missing_date', bucket: null, incomplete: true, needsAttention: true, windowDays: 90 });
    const muted = documentStateFromServer({ state: 'expired', bucket: 'expired', days_remaining: -4, window_days: 270, alerts_muted: true, endorsement_state: null, has_file: true });
    expect(muted).toMatchObject({ alertsOff: true, needsAttention: false, daysRemaining: -4, incomplete: false });
    expect(CREW_DOCUMENT_STATES).toEqual(['not_uploaded', 'missing_date', 'expired', 'expiring_soon', 'expiring', 'valid', 'no_expiry']);
  });
});

describe('what a row shows', () => {
  const r = (over: Partial<Parameters<typeof deriveDocumentState>[0]>) =>
    deriveDocumentState({ hasFile: true, expiryDate: plus(200), noExpiry: false, today: TODAY, ...over });

  it('the expiry first, then no file, a missing date, the endorsement, alerts off', () => {
    expect(documentBadges(r({}))).toEqual([{ kind: 'expiry', bucket: 'valid', daysRemaining: 200 }]);
    expect(documentBadges(r({ hasFile: false, expiryDate: null }))).toEqual([
      { kind: 'expiry_unknown' },
      { kind: 'state', key: 'not_uploaded' },
      { kind: 'state', key: 'missing_date' },
    ]);
    expect(documentBadges(r({ expiryDate: plus(-2), alertsMuted: true, endorsementDueDate: plus(-1) }))).toEqual([
      { kind: 'expiry', bucket: 'expired', daysRemaining: -2 },
      { kind: 'state', key: 'endorsement_overdue' },
      { kind: 'state', key: 'alerts_off' },
    ]);
    expect(documentBadges(r({ endorsementDueDate: plus(5) }))).toContainEqual({ kind: 'state', key: 'endorsement_due' });
  });

  it('the legend: alerts off, not uploaded, missing date, expired, expiring, valid', () => {
    expect(documentLegendKey(r({ alertsMuted: true, expiryDate: plus(-1) }))).toBe('alerts_off');
    expect(documentLegendKey(r({ hasFile: false }))).toBe('not_uploaded');
    expect(documentLegendKey(r({ expiryDate: null }))).toBe('missing_date');
    expect(documentLegendKey(r({ expiryDate: plus(-1) }))).toBe('expired');
    expect(documentLegendKey(r({ expiryDate: plus(5) }))).toBe('expiring');
    expect(documentLegendKey(r({ expiryDate: plus(60) }))).toBe('expiring');
    expect(documentLegendKey(r({ expiryDate: null, noExpiry: true }))).toBe('valid');
    expect(countDocumentLegend([r({}), r({ hasFile: false }), r({ expiryDate: plus(-1) })])).toEqual({
      valid: 1, expiring: 0, expired: 1, missing_date: 0, alerts_off: 0, not_uploaded: 1,
    });
    expect(Object.keys(countDocumentLegend([]))).toEqual([...DOCUMENT_LEGEND_KEYS]);
  });
});

// ---------------------------------------------------------------- tabs

describe('category tabs', () => {
  it('every seeded category, and its tab, is mirrored', () => {
    const block = MIGRATION.slice(MIGRATION.indexOf('INSERT INTO public.crew_document_categories'), MIGRATION.indexOf('ON CONFLICT (key) DO UPDATE SET label'));
    const seeded = Object.fromEntries([...block.matchAll(/\('([a-z0-9_]+)', '(?:[^']|'')+', '(documents|stcw|qualifications)', \d+, true\)/g)].map((m) => [m[1], m[2]]));
    expect(Object.keys(seeded)).toHaveLength(37);
    expect(SYSTEM_CATEGORY_TAB).toEqual(seeded);
  });

  it('medical certificates are documents, never qualifications (T-185)', () => {
    expect(tabForCategory('medical_fitness')).toBe('documents');
    expect(tabForCategory('health_records')).toBe('documents');
    expect(tabForCategory('stcw_medical')).toBe('stcw');
  });

  it('the live catalogue wins; unknown and missing categories are unclassified', () => {
    expect(tabForCategory('custom_cat', [{ key: 'custom_cat', tab: 'stcw' }])).toBe('stcw');
    expect(tabForCategory('passports', [{ key: 'passports', tab: 'qualifications' }])).toBe('qualifications');
    expect(tabForCategory('nope')).toBe(UNCLASSIFIED_TAB);
    expect(tabForCategory(null)).toBe('qualifications');
    expect(CREW_DOCUMENT_TABS).toEqual(['documents', 'stcw', 'qualifications']);
  });

  it('item types for the legacy window', () => {
    expect(itemTypeForCategory('passports')).toBe('passport');
    expect(itemTypeForCategory('visas')).toBe('visa');
    expect(itemTypeForCategory('work_permits')).toBe('work_authorisation');
    expect(itemTypeForCategory('medical_fitness')).toBe('medical');
    expect(itemTypeForCategory('seafarer_identity')).toBe('crew_document');
    expect(itemTypeForCategory('stcw_basic')).toBe('crew_qualification');
    expect(itemTypeForCategory(null)).toBe('crew_qualification');
  });
});

describe('legacy certificate strings', () => {
  it("the normaliser gives SQL crew_document_legacy_key's answer on the SQL test's cases", () => {
    const block = SQL_TEST.slice(SQL_TEST.indexOf("$q$VALUES ('Drug & Alcohol Test', 'drug_and_alcohol_test')"));
    const cases = [...block.slice(0, block.indexOf('crew_document_legacy_key: lower case')).matchAll(/\('((?:[^']|'')*)', (?:'([a-z0-9_]+)'|NULL(?:::text)?)\)/g)];
    expect(cases.length).toBe(6);
    for (const [, input, want] of cases) expect(legacyDocumentKey(input.replace(/''/g, "'")), input).toBe(want ?? null);
    expect(legacyDocumentKey(null)).toBeNull();
  });

  it("every legacy string of the seeded map lands on its type's category", () => {
    const typeBlock = MIGRATION.slice(MIGRATION.indexOf('INSERT INTO public.crew_document_types (id, company_id'), MIGRATION.indexOf('ON CONFLICT (id) DO UPDATE SET category_key'));
    const typeCategory = Object.fromEntries([...typeBlock.matchAll(/^ {2}\('([a-z0-9_]+)', '([a-z0-9_]+)', /gm)].map((m) => [m[1], m[2]]));
    expect(Object.keys(typeCategory).length).toBe(206);
    const legacyBlock = MIGRATION.slice(MIGRATION.indexOf('INSERT INTO public.crew_document_type_legacy_map'));
    const legacy = [...legacyBlock.slice(0, legacyBlock.indexOf(') AS v(label, type_key)')).matchAll(/^ {2}\('((?:[^']|'')+)', '([a-z0-9_]+)'\)/gm)].map((m) => [m[1].replace(/''/g, "'"), m[2]] as const);
    expect(legacy).toHaveLength(41);
    const mirrored = Object.fromEntries(legacy.map(([label, typeKey]) => [legacyDocumentKey(label), typeCategory[typeKey]]));
    expect(LEGACY_CATEGORY).toEqual(mirrored);
  });

  it('every MARITIME_CERTIFICATE_TYPES string of the certificates module is mapped', () => {
    const src = read('src/modules/certificates/hooks/useCrewCertificates.ts');
    const body = src.slice(src.indexOf('MARITIME_CERTIFICATE_TYPES = ['), src.indexOf('\n];', src.indexOf('MARITIME_CERTIFICATE_TYPES = [')));
    const strings = [...body.matchAll(/types:\s*\[([\s\S]*?)\]/g)].flatMap((g) => [...g[1].matchAll(/'([^']+)'/g)].map((m) => m[1]));
    expect(strings).toHaveLength(41);
    for (const s of strings) expect(LEGACY_CATEGORY[legacyDocumentKey(s) as string], s).toBeDefined();
  });

  it('a legacy row maps by its type, then its name, else nothing', () => {
    expect(legacyCategoryFor('STCW Basic Safety Training (VI/1)', 'Anything')).toBe('stcw_basic');
    expect(legacyCategoryFor('Medical', 'ENG1 Medical Certificate')).toBe('medical_fitness');
    expect(legacyCategoryFor('Misc', 'An unknown course')).toBeNull();
    expect(tabForLegacy('Passport', 'Passport')).toBe('documents');
    expect(tabForLegacy('Medical', 'ENG1 Medical Certificate')).toBe('documents');
    expect(tabForLegacy('STCW Ship Security Officer', null)).toBe('stcw');
    expect(tabForLegacy('Master 3000 GT', null)).toBe('qualifications');
    expect(tabForLegacy('Misc', 'x')).toBe('qualifications');
  });
});

describe('field schemas', () => {
  it('keeps only known fields with a known mode', () => {
    expect(readFieldSchema({ capacity: 'required', issuing_office: 'optional', colour: 'required', grade: 'sometimes' })).toEqual({ capacity: 'required', issuing_office: 'optional' });
    expect(readFieldSchema(null)).toEqual({});
    expect(readFieldSchema(['capacity'])).toEqual({});
    expect(readFieldSchema('capacity')).toEqual({});
  });
});
