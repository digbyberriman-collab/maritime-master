/**
 * Onboarding progress (gap/04 C18; X1-10B): the eight checks one crew
 * member's onboarding is measured by, shared by the profile's Onboarding
 * card and the vessel crew dashboard. Pure: no client, no React.
 *
 * The server decides each check (crew_onboarding_progress, 061000; the
 * dashboard's onboarding section reads the same rows):
 *
 *   photo        a profile photo (profiles.avatar_url)
 *   signature    a stored signature (user_signature_images, SIG1); unknown
 *                while the platform signature store does not exist
 *   personal     title, date of birth, nationality and place of birth
 *   contact      an address, a phone and at least one next of kin
 *   passport     a valid passport flagged for the crew report
 *   medical      a valid medical fitness document (is_medical_fitness)
 *   stcw_basic   every STCW basic safety requirement of the person met;
 *                unknown when the vessel has none configured
 *   contract     an active employment contract (crew_contracts)
 *
 * This file owns what the browser does with them: the order and words, the
 * parse of the server's jsonb (an unknown key is ignored, a missing or
 * unreadable one reads "not checked", never "done"), the score
 * (passed / known checks: a check the server cannot answer never counts
 * either way), where each one is fixed, and the familiarisations listed with
 * a joiner.
 */
import { format } from 'date-fns';
import { HRIS_PATHS } from '@/modules/hris/paths';
import { CREW_ROOT } from '../paths';

// ---------------------------------------------------------------- the checks

export const ONBOARDING_CHECK_KEYS = ['photo', 'signature', 'personal', 'contact', 'passport', 'medical', 'stcw_basic', 'contract'] as const;
export type OnboardingCheckKey = (typeof ONBOARDING_CHECK_KEYS)[number];

export const ONBOARDING_CHECK_STATES = ['pass', 'fail', 'unknown'] as const;
export type OnboardingCheckState = (typeof ONBOARDING_CHECK_STATES)[number];

/** Why a check is not known: the store is not switched on, nothing is configured, or the server sent nothing readable. */
export type OnboardingUnknownReason = 'not_set_up' | 'not_configured' | 'not_reported';

export interface OnboardingCheckDef {
  key: OnboardingCheckKey;
  label: string;
  /** What passes the check, in a phrase. */
  needs: string;
  /** The link text that opens where it is fixed. */
  fixLabel: string;
}

export const ONBOARDING_CHECKS: readonly OnboardingCheckDef[] = Object.freeze([
  { key: 'photo', label: 'Photo', needs: 'A profile photo', fixLabel: 'Add a photo' },
  { key: 'signature', label: 'Signature', needs: 'A stored signature for signing records', fixLabel: 'Set up the signature' },
  { key: 'personal', label: 'Personal details', needs: 'Title, date and place of birth, and nationality', fixLabel: 'Complete the personal details' },
  { key: 'contact', label: 'Contact', needs: 'An address, a phone number and a next of kin', fixLabel: 'Complete the contact details' },
  { key: 'passport', label: 'Passport', needs: 'A valid passport used in the crew report', fixLabel: 'Add the passport' },
  { key: 'medical', label: 'Medical fitness', needs: 'A valid medical fitness certificate, such as an ENG1', fixLabel: 'Add the medical certificate' },
  { key: 'stcw_basic', label: 'STCW basic training', needs: 'Every STCW basic safety course this vessel requires', fixLabel: 'Add the STCW certificates' },
  { key: 'contract', label: 'Employment contract', needs: 'An active employment contract', fixLabel: 'Add the contract' },
]);

export const ONBOARDING_CHECK_COUNT = ONBOARDING_CHECK_KEYS.length;

const DEF_BY_KEY: Readonly<Record<OnboardingCheckKey, OnboardingCheckDef>> = Object.freeze(
  Object.fromEntries(ONBOARDING_CHECKS.map((d) => [d.key, d])) as Record<OnboardingCheckKey, OnboardingCheckDef>,
);

export const onboardingCheckDef = (key: OnboardingCheckKey): OnboardingCheckDef => DEF_BY_KEY[key];

export const isOnboardingCheckKey = (value: unknown): value is OnboardingCheckKey =>
  typeof value === 'string' && (ONBOARDING_CHECK_KEYS as readonly string[]).includes(value);

const isCheckState = (value: unknown): value is OnboardingCheckState =>
  typeof value === 'string' && (ONBOARDING_CHECK_STATES as readonly string[]).includes(value);

/** One check as the browser shows it. */
export interface OnboardingCheck {
  key: OnboardingCheckKey;
  label: string;
  state: OnboardingCheckState;
  /** "3 of 4" for STCW basic, when the server counted. */
  progress: string | null;
  /** Set when `state` is unknown. */
  unknownReason: OnboardingUnknownReason | null;
}

const PROGRESS = /^(\d{1,3}) of (\d{1,3})$/;

/**
 * The eight checks from the server's `checks` jsonb, always in STORM's
 * order. A key STORM does not know is ignored; a key sent twice counts once
 * (the first); a missing key or an unreadable state reads "not checked"
 * (unknown), so a gap in the answer never shows as done or as a failure.
 */
export function parseOnboardingChecks(value: unknown): OnboardingCheck[] {
  const sent = new Map<OnboardingCheckKey, { state: unknown; detail: unknown }>();
  if (Array.isArray(value)) {
    for (const item of value) {
      if (item === null || typeof item !== 'object' || Array.isArray(item)) continue;
      const { key, state, detail } = item as Record<string, unknown>;
      if (!isOnboardingCheckKey(key) || sent.has(key)) continue;
      sent.set(key, { state, detail });
    }
  }
  return ONBOARDING_CHECK_KEYS.map((key) => {
    const raw = sent.get(key);
    const state: OnboardingCheckState = raw && isCheckState(raw.state) ? raw.state : 'unknown';
    const detail = raw && typeof raw.detail === 'string' ? raw.detail.trim() : null;
    let unknownReason: OnboardingUnknownReason | null = null;
    if (state === 'unknown') {
      unknownReason = detail === 'not_set_up' || detail === 'not_configured' ? detail : 'not_reported';
    }
    const progress = state !== 'unknown' && detail && PROGRESS.test(detail) ? detail : null;
    return { key, label: DEF_BY_KEY[key].label, state, progress, unknownReason };
  });
}

// ---------------------------------------------------------------- the score

export interface OnboardingScore {
  passed: number;
  /** Checks the server could answer (pass or fail). */
  known: number;
  total: number;
  /** passed / known, rounded to a whole percent; null when nothing is known. */
  percent: number | null;
  /** Every known check passes (and at least one is known). */
  complete: boolean;
  /** The failing checks, in STORM's order. */
  outstanding: OnboardingCheckKey[];
  /** The checks not known, in STORM's order. */
  unknown: OnboardingCheckKey[];
}

/** Percentage = passed / known checks (X1 spec, X1-10B). Half a percent rounds up, as the server's round() does. */
export function onboardingScore(checks: readonly OnboardingCheck[]): OnboardingScore {
  const passed = checks.filter((c) => c.state === 'pass').length;
  const outstanding = checks.filter((c) => c.state === 'fail').map((c) => c.key);
  const unknown = checks.filter((c) => c.state === 'unknown').map((c) => c.key);
  const known = passed + outstanding.length;
  return {
    passed,
    known,
    total: checks.length,
    percent: known === 0 ? null : Math.round((passed * 100) / known),
    complete: known > 0 && passed === known,
    outstanding,
    unknown,
  };
}

/** "6 of 7 checks", or "Not checked yet" when nothing is known. */
export function scoreText(score: Pick<OnboardingScore, 'passed' | 'known'>): string {
  if (score.known === 0) return 'Not checked yet';
  return `${score.passed} of ${score.known} ${score.known === 1 ? 'check' : 'checks'}`;
}

/** Why a check is not known, as the card says it. */
export function unknownText(reason: OnboardingUnknownReason): string {
  switch (reason) {
    case 'not_set_up':
      return 'Checked once stored signatures are switched on.';
    case 'not_configured':
      return 'No STCW basic courses are required on this vessel yet.';
    default:
      return 'Not checked.';
  }
}

/** The line under a check's label. */
export function checkLine(check: OnboardingCheck): string {
  if (check.state === 'unknown') return unknownText(check.unknownReason ?? 'not_reported');
  if (check.state === 'pass') return check.progress ? `Done · ${check.progress}` : 'Done';
  const needs = DEF_BY_KEY[check.key].needs;
  return check.progress ? `${needs} · ${check.progress} held` : needs;
}

// ---------------------------------------------------------------- where each check is fixed

/** A link: `vessel` paths are relative to `/v/:vesselCode` (resolve with useScopedPath), `absolute` ones are used as they are. */
export type FixTarget = { kind: 'vessel'; path: string } | { kind: 'absolute'; path: string };

export interface FixContext {
  profileId: string;
  /** The viewer is the person (only they can store their signature). */
  isOwn: boolean;
}

export interface CheckFix {
  target: FixTarget | null;
  /** Said instead of a link when the viewer cannot fix it themselves. */
  note: string | null;
}

/** Where the person keeps their stored signature (gap/08 SIG1; the profile's SignatureCard links the same place). */
export const MY_SIGNATURE_PATH = '/me/signature';

/** A crew profile tab, relative to `/v/:vesselCode`. */
export const profileTabPath = (profileId: string, tab: string): string => `${CREW_ROOT}/people/${encodeURIComponent(profileId)}/${tab}`;

const hrPage = (path: string, profileId: string): FixTarget => ({ kind: 'absolute', path: `${path}?crew=${encodeURIComponent(profileId)}` });

/**
 * Where a check is fixed. The profile tabs hold the personal details,
 * contact (address, phones and next of kin) and documents; the photo and the
 * employment contract are kept in HR (the page opens on the person; a
 * self-service user always lands on their own record). The signature is the
 * person's own: anyone else gets a note instead of a link.
 */
export function checkFix(key: OnboardingCheckKey, ctx: FixContext): CheckFix {
  const id = ctx.profileId;
  switch (key) {
    case 'photo':
      return { target: hrPage(HRIS_PATHS.personalDetails, id), note: null };
    case 'signature':
      return ctx.isOwn
        ? { target: { kind: 'absolute', path: MY_SIGNATURE_PATH }, note: null }
        : { target: null, note: 'Only the crew member can store their signature, from their own profile.' };
    case 'personal':
      return { target: { kind: 'vessel', path: `${profileTabPath(id, 'personal')}?edit=1` }, note: null };
    case 'contact':
      return { target: { kind: 'vessel', path: profileTabPath(id, 'contact') }, note: null };
    case 'passport':
    case 'medical':
      return { target: { kind: 'vessel', path: profileTabPath(id, 'documents') }, note: null };
    case 'stcw_basic':
      return { target: { kind: 'vessel', path: profileTabPath(id, 'stcw') }, note: null };
    case 'contract':
      return { target: hrPage(HRIS_PATHS.contracts, id), note: null };
  }
}

/** The href of a fix: `scopedPath` (useScopedPath) resolves a vessel path. */
export const fixHref = (target: FixTarget, scopedPath: (rel: string) => string): string =>
  target.kind === 'vessel' ? scopedPath(target.path) : target.path;

// ---------------------------------------------------------------- familiarisations of a joiner

export interface OnboardingFamiliarisation {
  recordId: string;
  templateId: string | null;
  templateCode: string | null;
  templateName: string;
  /** The record's status as stored (open, in_progress, awaiting_signatures, completed). */
  status: string;
  dueDate: string | null;
  overdue: boolean;
}

const DAY = /^\d{4}-\d{2}-\d{2}/;
const dayOrNull = (v: unknown): string | null => (typeof v === 'string' && DAY.test(v) ? v.slice(0, 10) : null);
const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);

/** The familiarisations jsonb of a joiner; an item without a record id is dropped. */
export function parseOnboardingFamiliarisation(value: unknown): OnboardingFamiliarisation[] {
  if (!Array.isArray(value)) return [];
  const out: OnboardingFamiliarisation[] = [];
  for (const item of value) {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) continue;
    const o = item as Record<string, unknown>;
    const recordId = strOrNull(o.record_id);
    if (!recordId) continue;
    out.push({
      recordId,
      templateId: strOrNull(o.template_id),
      templateCode: strOrNull(o.template_code),
      templateName: strOrNull(o.template_name) ?? 'Familiarisation',
      status: strOrNull(o.status) ?? 'open',
      dueDate: dayOrNull(o.due_date),
      overdue: o.overdue === true,
    });
  }
  return out;
}

/** "1 of 2 required familiarisations completed", or null when none is required. */
export function familiarisationLine(required: number, completed: number): string | null {
  if (required <= 0) return null;
  const done = Math.min(Math.max(completed, 0), required);
  return `${done} of ${required} required ${required === 1 ? 'familiarisation' : 'familiarisations'} completed`;
}

// ---------------------------------------------------------------- one joiner

export type OnboardingPlacement = 'assignment' | 'planned' | 'pending_placement';

export interface OnboardingPerson {
  profileId: string;
  userId: string | null;
  firstName: string | null;
  lastName: string | null;
  preferredName: string | null;
  displayName: string;
  avatarUrl: string | null;
  positionName: string | null;
  departmentKey: string | null;
  placementKind: OnboardingPlacement;
  joinDate: string | null;
  checks: OnboardingCheck[];
  score: OnboardingScore;
  famRequired: number;
  famCompleted: number;
  familiarisation: OnboardingFamiliarisation[];
  /** A check is still failing, or a required familiarisation is not completed. */
  isOpen: boolean;
}

export class OnboardingShapeError extends Error {
  readonly answer: unknown;
  constructor(message: string, answer: unknown) {
    super(message);
    this.name = 'OnboardingShapeError';
    this.answer = answer;
  }
}

/** "Second Stew Demo": the preferred (else first) name and the last name. */
export function personName(first: string | null | undefined, last: string | null | undefined, preferred?: string | null): string {
  const given = (preferred ?? '').trim() || (first ?? '').trim();
  return [given, (last ?? '').trim()].filter(Boolean).join(' ') || 'Unnamed crew member';
}

const count = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);

const placementOf = (v: unknown): OnboardingPlacement => (v === 'planned' || v === 'pending_placement' ? v : 'assignment');

/**
 * One row of crew_onboarding_progress. A row without a profile id is not
 * the contract (OnboardingShapeError). `isOpen` is worked out from what is
 * shown (a failing check, or fewer completed than required
 * familiarisations), the same rule as the server's is_open.
 */
export function parseOnboardingRow(row: unknown): OnboardingPerson {
  if (row === null || typeof row !== 'object' || Array.isArray(row)) throw new OnboardingShapeError('An onboarding row is not an object.', row);
  const o = row as Record<string, unknown>;
  const profileId = strOrNull(o.profile_id);
  if (!profileId) throw new OnboardingShapeError('An onboarding row has no profile id.', row);
  const checks = parseOnboardingChecks(o.checks);
  const score = onboardingScore(checks);
  const famRequired = count(o.fam_required);
  const famCompleted = Math.min(count(o.fam_completed), famRequired);
  const firstName = strOrNull(o.first_name);
  const lastName = strOrNull(o.last_name);
  const preferredName = strOrNull(o.preferred_name);
  return {
    profileId,
    userId: strOrNull(o.user_id),
    firstName,
    lastName,
    preferredName,
    displayName: personName(firstName, lastName, preferredName),
    avatarUrl: strOrNull(o.avatar_url),
    positionName: strOrNull(o.position_name),
    departmentKey: strOrNull(o.department_key),
    placementKind: placementOf(o.placement_kind),
    joinDate: dayOrNull(o.join_date),
    checks,
    score,
    famRequired,
    famCompleted,
    familiarisation: parseOnboardingFamiliarisation(o.familiarisation),
    isOpen: score.outstanding.length > 0 || famCompleted < famRequired,
  };
}

/** Every row of the answer, in the server's order (latest joiner first). */
export function parseOnboardingRows(rows: unknown): OnboardingPerson[] {
  if (rows === null || rows === undefined) return [];
  if (!Array.isArray(rows)) throw new OnboardingShapeError('The onboarding answer is not a list.', rows);
  return rows.map(parseOnboardingRow);
}

// ---------------------------------------------------------------- words

/** d MMM yyyy for a yyyy-MM-dd day (local), or null. */
export function formatDay(value: string | null | undefined): string | null {
  if (!value || !DAY.test(value)) return null;
  const [y, m, d] = value.slice(0, 10).split('-').map(Number);
  return format(new Date(y, m - 1, d), 'd MMM yyyy');
}

/**
 * When the person joins or joined, in words: "Joined 12 Nov 2026",
 * "Joins 2 Dec 2026", and for a pending placement (D-225, D-199) whose day
 * has passed "Joins once their login is linked".
 */
export function joinText(person: Pick<OnboardingPerson, 'placementKind' | 'joinDate'>, today: string): string {
  const day = formatDay(person.joinDate);
  const ahead = person.joinDate !== null && person.joinDate > today;
  if (person.placementKind === 'pending_placement') return ahead && day ? `Joins ${day}` : 'Joins once their login is linked';
  if (!day) return person.placementKind === 'planned' ? 'Joining date not set' : 'Join date not recorded';
  return ahead || person.placementKind === 'planned' ? `Joins ${day}` : `Joined ${day}`;
}

/** "Passport, Medical fitness and 1 more" for the failing checks (at most `max` named). */
export function outstandingText(keys: readonly OnboardingCheckKey[], max = 2): string | null {
  if (keys.length === 0) return null;
  const names = keys.map((k) => DEF_BY_KEY[k].label);
  if (names.length <= max) return names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return `${names.slice(0, max).join(', ')} and ${names.length - max} more`;
}
