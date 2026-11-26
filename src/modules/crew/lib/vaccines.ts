/**
 * The standard crew vaccination list and booster status (gap/04 C60; X1-03B).
 *
 * STORM's own list of 17 vaccines a yacht crew member is commonly asked
 * about, each with a planning booster interval and a one-line note on how
 * the course works. The intervals are STORM's planning defaults, written for
 * the profile's Medical tab: they are not a medical rule. When the medical
 * team records a "valid until" date on a vaccination, that date wins; the
 * interval only fills in when no date was recorded. Requirements depend on
 * flag, itinerary and the owner, so nothing here enforces a vaccine.
 *
 * Pure: no React, no client. Dates are date-only strings (`yyyy-MM-dd`).
 *
 * The medical record (`med_vaccinations.vaccine`) is free text, so a dose is
 * matched to the list by patterns: a combined vaccine ("Tetanus / diphtheria
 * / polio", "Hepatitis A and B") counts for every standard vaccine it names,
 * and a dose that matches none is listed under "Other vaccinations".
 */
import { daysBetween, isCalendarDate } from '@/lib/records/dates';
import { expiryStatus } from '@/lib/records/expiry';
import type { Tone } from '@/components/ui/tones';

export interface StandardVaccine {
  key: string;
  name: string;
  /** Months after the latest dose when a booster is due; null when the course needs no routine booster. */
  boosterMonths: number | null;
  /** How the course works, in one sentence. */
  schedule: string;
  /** Matched against the normalised vaccine text of a recorded dose. */
  patterns: readonly RegExp[];
}

/** STORM's standard list, in the order the tab shows it. */
export const STANDARD_VACCINES: readonly StandardVaccine[] = Object.freeze([
  {
    key: 'tetanus_diphtheria',
    name: 'Tetanus and diphtheria',
    boosterMonths: 120,
    schedule: 'A booster every ten years once the primary course is done.',
    patterns: [/\btetanus\b/, /\bdiphtheria\b/, /\btd\b/, /\btdap\b/, /\bdtp\b/, /\bdtap\b/],
  },
  {
    key: 'polio',
    name: 'Polio',
    boosterMonths: 120,
    schedule: 'A booster every ten years for trips where polio still circulates.',
    patterns: [/\bpolio\b/, /\bipv\b/, /\bopv\b/],
  },
  {
    key: 'hepatitis_a',
    name: 'Hepatitis A',
    boosterMonths: null,
    schedule: 'Two doses six to twelve months apart give long-term cover.',
    patterns: [/\bhep(atitis)? ?a\b/],
  },
  {
    key: 'hepatitis_b',
    name: 'Hepatitis B',
    boosterMonths: null,
    schedule: 'Three doses complete the course; a blood test can confirm the cover.',
    patterns: [/\bhep(atitis)? ?b\b/, /\bhep(atitis)? ?a ?(and )?b\b/, /\bhep(atitis)? ?ab\b/],
  },
  {
    key: 'typhoid',
    name: 'Typhoid',
    boosterMonths: 36,
    schedule: 'The injected vaccine needs a booster every three years while the risk lasts.',
    patterns: [/\btyphoid\b/],
  },
  {
    key: 'yellow_fever',
    name: 'Yellow fever',
    boosterMonths: null,
    schedule: 'One dose; the international certificate is valid for life.',
    patterns: [/\byellow ?fever\b/],
  },
  {
    key: 'mmr',
    name: 'Measles, mumps and rubella',
    boosterMonths: null,
    schedule: 'Two doses give lifelong cover.',
    patterns: [/\bmmr\b/, /\bmeasles\b/, /\bmumps\b/, /\brubella\b/],
  },
  {
    key: 'varicella',
    name: 'Chickenpox (varicella)',
    boosterMonths: null,
    schedule: 'Two doses for anyone who has not had chickenpox.',
    patterns: [/\bvaricella\b/, /\bchicken ?pox\b/],
  },
  {
    key: 'meningococcal_acwy',
    name: 'Meningococcal ACWY',
    boosterMonths: 60,
    schedule: 'A booster after five years while the risk continues.',
    // Not MenB: a "meningococcal B" dose is another vaccine and stays under Other.
    patterns: [/\bacwy\b/, /\bmen ?acwy\b/, /\bmening\w* a ?c ?w ?y\b/, /^meningococcal( conjugate)?( vaccine)?$/],
  },
  {
    key: 'rabies',
    name: 'Rabies',
    boosterMonths: null,
    schedule: 'A course before travel; boosters only on a doctor’s advice.',
    patterns: [/\brabies\b/],
  },
  {
    key: 'japanese_encephalitis',
    name: 'Japanese encephalitis',
    boosterMonths: 24,
    schedule: 'One booster one to two years after the course for continued risk.',
    patterns: [/\bjapanese ?encephalitis\b/, /\bje\b/],
  },
  {
    key: 'tick_borne_encephalitis',
    name: 'Tick-borne encephalitis',
    boosterMonths: 36,
    schedule: 'The first booster three years after the course, later ones every five.',
    patterns: [/\btick ?borne\b/, /\btbe\b/],
  },
  {
    key: 'cholera',
    name: 'Cholera',
    boosterMonths: 24,
    schedule: 'The oral vaccine needs a booster after two years for adults at risk.',
    patterns: [/\bcholera\b/],
  },
  {
    key: 'influenza',
    name: 'Influenza',
    boosterMonths: 12,
    schedule: 'One dose each year for the season’s strains.',
    patterns: [/\binfluenza\b/, /\bflu\b/],
  },
  {
    key: 'covid_19',
    name: 'COVID-19',
    boosterMonths: 12,
    schedule: 'Doses as national guidance advises, usually one a year.',
    patterns: [/\bcovid\b/, /\bcovid ?19\b/, /\bsars ?cov ?2\b/, /\bcoronavirus\b/],
  },
  {
    key: 'tuberculosis_bcg',
    name: 'Tuberculosis (BCG)',
    boosterMonths: null,
    schedule: 'One dose, usually given in childhood.',
    patterns: [/\bbcg\b/, /\btuberculosis\b/, /\btb\b/],
  },
  {
    key: 'pneumococcal',
    name: 'Pneumococcal',
    boosterMonths: null,
    schedule: 'One dose for people at higher risk; a doctor decides on any repeat.',
    patterns: [/\bpneumococc/, /\bppsv/, /\bpcv/],
  },
] as const satisfies readonly StandardVaccine[]);

/** A booster falling due inside this many days reads "Booster due". */
export const BOOSTER_WINDOW_DAYS = 60;

/** Lower case, accents dropped, punctuation and separators as single spaces. */
export function normaliseVaccineText(text: string | null | undefined): string {
  return (text ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Every standard vaccine a recorded vaccine text names (a combined vaccine names several). */
export function matchStandardVaccines(text: string | null | undefined): StandardVaccine[] {
  const normalised = normaliseVaccineText(text);
  if (!normalised) return [];
  return STANDARD_VACCINES.filter((v) => v.patterns.some((p) => p.test(normalised)));
}

/**
 * `day` plus whole months, as a date-only string. A day that does not exist
 * in the target month lands on its last day (31 Jan + 1 month = 28 or 29 Feb).
 */
export function addMonthsDateOnly(day: string, months: number): string {
  if (!isCalendarDate(day)) throw new RangeError(`Not a calendar date: ${day}`);
  if (!Number.isInteger(months)) throw new RangeError(`months must be a whole number, got ${months}`);
  const [y, m, d] = day.split('-').map(Number);
  const total = y * 12 + (m - 1) + months;
  const year = Math.floor(total / 12);
  const month = total - year * 12 + 1;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${pad(year, 4)}-${pad(month)}-${pad(Math.min(d, last))}`;
}

/** One recorded dose, as the Medical tab reads it (med_vaccinations, column-limited). */
export interface VaccineDose {
  id: string;
  vaccine: string;
  doseLabel: string | null;
  administeredOn: string | null;
  validUntil: string | null;
  /** An exemption is recorded (its reason is clinical text and is not shown). */
  exempt: boolean;
}

export const VACCINATION_STATES = ['overdue', 'due_soon', 'date_missing', 'not_recorded', 'exempt', 'valid', 'complete'] as const;
export type VaccinationState = (typeof VACCINATION_STATES)[number];

/** Pill tone and label of each state (colour never stands alone: the label says it). */
export const VACCINATION_STATE_META: Readonly<Record<VaccinationState, { tone: Tone; label: string }>> = Object.freeze({
  overdue: { tone: 'danger', label: 'Booster overdue' },
  due_soon: { tone: 'warn', label: 'Booster due' },
  date_missing: { tone: 'info', label: 'Date missing' },
  not_recorded: { tone: 'neutral', label: 'Not recorded' },
  exempt: { tone: 'neutral', label: 'Exempt' },
  valid: { tone: 'ok', label: 'Up to date' },
  complete: { tone: 'ok', label: 'Course recorded' },
});

export interface StandardVaccinationRow {
  vaccine: StandardVaccine;
  /** The doses recorded for it, latest first. */
  doses: VaccineDose[];
  latest: VaccineDose | null;
  /** When the next booster is due: the record's "valid until", else the latest dose plus the interval. */
  boosterDue: string | null;
  /** Where boosterDue came from. */
  boosterSource: 'record' | 'interval' | null;
  /** Days from today to boosterDue (negative once overdue). */
  daysToBooster: number | null;
  state: VaccinationState;
}

export interface VaccinationSummary {
  rows: StandardVaccinationRow[];
  /** Recorded doses that match no standard vaccine, latest first. */
  other: VaccineDose[];
  counts: Record<VaccinationState, number>;
}

const byLatest = (a: VaccineDose, b: VaccineDose): number => {
  const da = a.administeredOn ?? '';
  const db = b.administeredOn ?? '';
  if (da !== db) return da < db ? 1 : -1;
  return a.id.localeCompare(b.id);
};

const validDay = (value: string | null | undefined): string | null => {
  const day = (value ?? '').slice(0, 10);
  return isCalendarDate(day) ? day : null;
};

/** The state and booster date of one standard vaccine from its doses. */
export function vaccinationRow(vaccine: StandardVaccine, doses: readonly VaccineDose[], today: string): StandardVaccinationRow {
  const sorted = [...doses].sort(byLatest);
  const latest = sorted[0] ?? null;
  const base = { vaccine, doses: sorted, latest };
  if (!latest) return { ...base, boosterDue: null, boosterSource: null, daysToBooster: null, state: 'not_recorded' };
  if (latest.exempt) return { ...base, boosterDue: null, boosterSource: null, daysToBooster: null, state: 'exempt' };

  const recorded = validDay(latest.validUntil);
  const given = validDay(latest.administeredOn);
  let boosterDue: string | null = null;
  let boosterSource: StandardVaccinationRow['boosterSource'] = null;
  if (recorded) {
    boosterDue = recorded;
    boosterSource = 'record';
  } else if (vaccine.boosterMonths !== null && given) {
    boosterDue = addMonthsDateOnly(given, vaccine.boosterMonths);
    boosterSource = 'interval';
  }

  if (!boosterDue) {
    // No booster date: a course with no routine booster is recorded; one that needs boosters cannot be dated.
    const state: VaccinationState = vaccine.boosterMonths === null ? 'complete' : 'date_missing';
    return { ...base, boosterDue: null, boosterSource: null, daysToBooster: null, state };
  }
  const status = expiryStatus({ expiresOn: boosterDue, windowDays: BOOSTER_WINDOW_DAYS, today });
  const state: VaccinationState =
    status.bucket === 'expired' ? 'overdue' : status.bucket === 'expiring_soon' || status.bucket === 'expiring' ? 'due_soon' : 'valid';
  return { ...base, boosterDue, boosterSource, daysToBooster: daysBetween(today, boosterDue), state };
}

/** The standard list against the recorded doses, plus the doses outside it and a count per state. */
export function vaccinationSummary(doses: readonly VaccineDose[], today: string): VaccinationSummary {
  const matched = new Map<string, VaccineDose[]>();
  const other: VaccineDose[] = [];
  for (const dose of doses) {
    const hits = matchStandardVaccines(dose.vaccine);
    if (hits.length === 0) other.push(dose);
    for (const v of hits) matched.set(v.key, [...(matched.get(v.key) ?? []), dose]);
  }
  const rows = STANDARD_VACCINES.map((v) => vaccinationRow(v, matched.get(v.key) ?? [], today));
  const counts = Object.fromEntries(VACCINATION_STATES.map((s) => [s, 0])) as Record<VaccinationState, number>;
  for (const row of rows) counts[row.state] += 1;
  return { rows, other: other.sort(byLatest), counts };
}
