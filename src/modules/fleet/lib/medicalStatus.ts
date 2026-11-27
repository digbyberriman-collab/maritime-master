/**
 * The fleet medical status rules (gap/02 M1, W8; gap/04 C61; D-X5-08),
 * pure. The server computes every row (`fleet_crew_medical_status`,
 * 20261124040700_fleet_medical_status.sql); this file mirrors its
 * `fleet_medical_reasons` / `fleet_medical_status_of` so the grid can check
 * what it is sent, sort it and explain it. The reasons table in
 * src/test/fleet/medicalStatus.test.ts is copied into
 * supabase/tests/sql/fleet/medical_status.test.sql and pinned, so the two
 * never drift.
 *
 * Status, from the reasons (each has one level), most severe first:
 *
 *   critical    ENG1 (or an accepted equivalent) missing (with or without
 *               a Health record, D-385), assessed unfit or expired; a required vaccine expired or missing; a serious
 *               rest breach in the last 30 days (< 4 h in 24 h or < 50 h in
 *               7 days)
 *   at_risk     ENG1 expires within 30 days (the 'medical' window, C5); a
 *               booster due (inside the 'vaccination' window); a vaccine
 *               that is not required has expired; any rest non-compliance in
 *               30 days; a health check overdue
 *   incomplete  no Health record; ENG1 on file without an expiry date; no
 *               vaccination record at all; no health check on file
 *   ok          none of these
 *
 * Counts that are `null` are not known (no Health record, rest not
 * tracked) and raise nothing.
 */

/** The statuses, most severe first (the `medical_status` tone domain). */
export const MEDICAL_STATUSES = ['critical', 'at_risk', 'incomplete', 'ok'] as const;
export type MedicalStatus = (typeof MEDICAL_STATUSES)[number];

/** The levels a reason can have (every status but ok). */
export type MedicalReasonLevel = Exclude<MedicalStatus, 'ok'>;

/** The reasons, in the order the server lists them (most severe first). */
export const MEDICAL_REASONS = [
  'eng1_missing',
  'eng1_unfit',
  'eng1_expired',
  'required_vaccine_expired',
  'required_vaccine_missing',
  'serious_rest_breach',
  'eng1_expiring',
  'booster_due',
  'vaccine_overdue',
  'rest_noncompliance',
  'occ_health_overdue',
  'no_health_record',
  'eng1_no_expiry',
  'no_vaccinations',
  'no_occ_health',
] as const;
export type MedicalReason = (typeof MEDICAL_REASONS)[number];

export const MEDICAL_REASON_LEVEL: Readonly<Record<MedicalReason, MedicalReasonLevel>> = Object.freeze({
  eng1_missing: 'critical',
  eng1_unfit: 'critical',
  eng1_expired: 'critical',
  required_vaccine_expired: 'critical',
  required_vaccine_missing: 'critical',
  serious_rest_breach: 'critical',
  eng1_expiring: 'at_risk',
  booster_due: 'at_risk',
  vaccine_overdue: 'at_risk',
  rest_noncompliance: 'at_risk',
  occ_health_overdue: 'at_risk',
  no_health_record: 'incomplete',
  eng1_no_expiry: 'incomplete',
  no_vaccinations: 'incomplete',
  no_occ_health: 'incomplete',
});

/** The chip text of each reason (sentence case, short enough for a chip). */
export const MEDICAL_REASON_LABELS: Readonly<Record<MedicalReason, string>> = Object.freeze({
  eng1_missing: 'No ENG1',
  eng1_unfit: 'Assessed unfit',
  eng1_expired: 'ENG1 expired',
  required_vaccine_expired: 'Required vaccine expired',
  required_vaccine_missing: 'Required vaccine missing',
  serious_rest_breach: 'Serious rest breach',
  eng1_expiring: 'ENG1 expires ≤ 30 d',
  booster_due: 'Booster due',
  vaccine_overdue: 'Vaccine expired',
  rest_noncompliance: 'Rest non-compliance',
  occ_health_overdue: 'Health check overdue',
  no_health_record: 'No health record',
  eng1_no_expiry: 'ENG1 has no expiry date',
  no_vaccinations: 'No vaccinations recorded',
  no_occ_health: 'No health check on file',
});

/** What each rule means, for the "How the status is worked out" panel. */
export const MEDICAL_REASON_HELP: Readonly<Record<MedicalReason, string>> = Object.freeze({
  eng1_missing: 'No ENG1 or accepted equivalent on file.',
  eng1_unfit: 'The latest fitness assessment found the person unfit or temporarily unfit.',
  eng1_expired: 'The ENG1 or accepted equivalent has expired.',
  required_vaccine_expired: 'A vaccine the company requires, or one marked required, has expired.',
  required_vaccine_missing: 'A vaccine the company requires is not recorded.',
  serious_rest_breach: 'Less than 4 hours of rest in 24 hours, or less than 50 hours in 7 days, in the last 30 days.',
  eng1_expiring: 'The ENG1 expires within 30 days.',
  booster_due: 'A vaccine expires inside the vaccination warning window.',
  vaccine_overdue: 'A vaccine that is not required has expired.',
  rest_noncompliance: 'At least one hours-of-rest breach in the last 30 days.',
  occ_health_overdue: 'A health check is past its due date.',
  no_health_record: 'The person has no health record yet.',
  eng1_no_expiry: 'An ENG1 is on file but without an expiry date.',
  no_vaccinations: 'No vaccination is recorded.',
  no_occ_health: 'No health check is on file.',
});

/**
 * The ENG1 state the server sends: the expiry bucket of the ENG1 on file
 * (C5, with the company's 'medical' window), or why there is none to judge.
 */
export const ENG1_STATES = ['unfit', 'missing', 'expired', 'expiring_soon', 'expiring', 'valid', 'no_expiry'] as const;
export type Eng1State = (typeof ENG1_STATES)[number];

export const ENG1_STATE_LABELS: Readonly<Record<Eng1State, string>> = Object.freeze({
  unfit: 'Unfit',
  missing: 'None on file',
  expired: 'Expired',
  expiring_soon: '≤ 30 d',
  expiring: 'Due ≤ window',
  valid: 'Valid',
  no_expiry: 'No expiry date',
});

/** Occupational health (screening due dates until gap/02 M2). */
export const OCC_HEALTH_STATES = ['overdue', 'none', 'ok'] as const;
export type OccHealthState = (typeof OCC_HEALTH_STATES)[number];

/** The facts the reasons are worked out from (one person). */
export interface MedicalFacts {
  hasHealthRecord: boolean;
  eng1State: Eng1State;
  /** Required vaccines (company list or marked required) that have expired. */
  requiredExpired: number | null;
  /** Vaccines on the company's list with no record. */
  requiredMissing: number | null;
  /** Vaccines that are not required and have expired. */
  vaccineOverdue: number | null;
  boostersDue: number | null;
  /** Every vaccination record of the person. */
  vaccinationRecords: number | null;
  /** Serious rest breach days in 30 days; null = not tracked. */
  seriousRest: number | null;
  /** Rest breach days in 30 days; null = not tracked. */
  restNoncompliant: number | null;
  /** null = not known (no Health record). */
  occHealth: OccHealthState | null;
}

const positive = (n: number | null): boolean => (n ?? 0) > 0;

/** The reasons of one person, most severe first (`fleet_medical_reasons`). */
export function medicalReasons(f: MedicalFacts): MedicalReason[] {
  const out: MedicalReason[] = [];
  if (f.eng1State === 'missing') out.push('eng1_missing');
  if (f.eng1State === 'unfit') out.push('eng1_unfit');
  if (f.eng1State === 'expired') out.push('eng1_expired');
  if (positive(f.requiredExpired)) out.push('required_vaccine_expired');
  if (positive(f.requiredMissing)) out.push('required_vaccine_missing');
  if (positive(f.seriousRest)) out.push('serious_rest_breach');
  if (f.eng1State === 'expiring_soon') out.push('eng1_expiring');
  if (positive(f.boostersDue)) out.push('booster_due');
  if (positive(f.vaccineOverdue)) out.push('vaccine_overdue');
  if (positive(f.restNoncompliant) && !positive(f.seriousRest)) out.push('rest_noncompliance');
  if (f.occHealth === 'overdue') out.push('occ_health_overdue');
  if (!f.hasHealthRecord) out.push('no_health_record');
  if (f.eng1State === 'no_expiry') out.push('eng1_no_expiry');
  if (f.hasHealthRecord && (f.vaccinationRecords ?? 0) === 0) out.push('no_vaccinations');
  if (f.hasHealthRecord && f.occHealth === 'none') out.push('no_occ_health');
  return out;
}

/** The status of a set of reasons: its most severe level, else ok (`fleet_medical_status_of`). */
export function medicalStatusOf(reasons: readonly MedicalReason[]): MedicalStatus {
  let best: MedicalStatus = 'ok';
  for (const reason of reasons) {
    const level = MEDICAL_REASON_LEVEL[reason];
    if (MEDICAL_STATUS_RANK[level] < MEDICAL_STATUS_RANK[best]) best = level;
  }
  return best;
}

/** 0 = most severe. */
export const MEDICAL_STATUS_RANK: Readonly<Record<MedicalStatus, number>> = Object.freeze({ critical: 0, at_risk: 1, incomplete: 2, ok: 3 });

/** The reasons in the server's order (an unordered list is sorted, duplicates dropped). */
export function orderReasons(reasons: readonly MedicalReason[]): MedicalReason[] {
  const set = new Set(reasons);
  return MEDICAL_REASONS.filter((r) => set.has(r));
}

const STATUS_SET: ReadonlySet<string> = new Set(MEDICAL_STATUSES);
const REASON_SET: ReadonlySet<string> = new Set(MEDICAL_REASONS);
const ENG1_SET: ReadonlySet<string> = new Set(ENG1_STATES);
const OCC_SET: ReadonlySet<string> = new Set(OCC_HEALTH_STATES);

export const isMedicalStatus = (value: unknown): value is MedicalStatus => typeof value === 'string' && STATUS_SET.has(value);
export const isMedicalReason = (value: unknown): value is MedicalReason => typeof value === 'string' && REASON_SET.has(value);
export const isEng1State = (value: unknown): value is Eng1State => typeof value === 'string' && ENG1_SET.has(value);
export const isOccHealthState = (value: unknown): value is OccHealthState => typeof value === 'string' && OCC_SET.has(value);

/** What the grid sorts and counts by. */
export interface MedicalSortable {
  status: MedicalStatus;
  reasons: readonly MedicalReason[];
  vesselName: string;
  personName: string;
  profileId: string;
}

/** Most severe first: status, then more reasons first, then vessel, then name (the server's order). */
export function compareMedicalRows(a: MedicalSortable, b: MedicalSortable): number {
  return (
    MEDICAL_STATUS_RANK[a.status] - MEDICAL_STATUS_RANK[b.status] ||
    b.reasons.length - a.reasons.length ||
    a.vesselName.localeCompare(b.vesselName, 'en') ||
    a.personName.localeCompare(b.personName, 'en') ||
    a.profileId.localeCompare(b.profileId)
  );
}

/** People per status. */
export function tallyMedicalStatus(rows: readonly { status: MedicalStatus }[]): Record<MedicalStatus, number> {
  const tally: Record<MedicalStatus, number> = { critical: 0, at_risk: 0, incomplete: 0, ok: 0 };
  for (const row of rows) tally[row.status] += 1;
  return tally;
}

/** The `?status=` value: a known status, else none (all). */
export function parseMedicalStatusParam(value: string | null | undefined): MedicalStatus | null {
  return isMedicalStatus(value) ? value : null;
}

/** A vaccine name as the server compares it (`fleet_medical_vaccine_key`): trimmed, spaces collapsed, lower case; null when blank. */
export function vaccineKey(name: string | null | undefined): string | null {
  const key = (name ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
  return key ? key : null;
}
