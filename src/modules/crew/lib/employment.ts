/**
 * Employment (X1-11B; gap/04 C57, C59, W8): the pure rules behind the crew
 * profile's Employment tab, End employment and the vessel's employment
 * history. No React and no Supabase, so every rule is unit tested
 * (src/test/crew/employment.test.ts).
 *
 * - The Employment tab's sub-tabs (`?sub=details|transfers|appraisals|familiarisation`).
 * - End employment (W8): the end reasons in the order W8 lists them, with
 *   their words as crew_end_employment's crew_end_reason_label writes them;
 *   the form schema mirrors the server's refusals (reason required, a note
 *   for Other, the end date within a year of today and not before joining,
 *   notes under 2,000 characters) with the server's sentences; the strict
 *   reader of the RPC's answer and the outcome in words.
 * - Durations: whole days as crew_vessel_employment_history counts them
 *   (leave date minus join date) and a calendar span in words.
 * - The vessel history rows, their counters (past crew, records) and why a
 *   row cannot be re-hired from here; the strict reader of
 *   crew_rehire_prefill's answer in Add crew's form shape.
 * - Employment terms (C57): the edit form's schema and the payload
 *   crew_onboarding_save's terms path takes (every key, because a second
 *   save of the same start date replaces the row); the contract's
 *   probation length and two notice periods (061100 columns of
 *   crew_contracts), read only when the columns are there (D-01), and the
 *   patch that keeps the legacy readers' columns in step
 *   (probation_end_date, notice_period_days).
 */
import { z } from 'zod';
import { isDateOnly } from '@/shared/lib/form';
import type { CrewAssignmentTermsRow, CrewEmploymentEndReason, CrewEmploymentHistoryRpcRow } from '../types/db.pending';
import {
  LEAVE_DAYS_MAX,
  LEAVE_METHODS,
  PORT_MAX,
  parseLeaveDays,
  parseRatioPart,
  type AddCrewValues,
  type LeaveMethod,
  type OnboardingTerms,
} from './addCrewSchema';

// ---------------------------------------------------------------- sub-tabs

export const EMPLOYMENT_SUBTABS = ['details', 'transfers', 'appraisals', 'familiarisation'] as const;
export type EmploymentSubTab = (typeof EMPLOYMENT_SUBTABS)[number];

export const EMPLOYMENT_SUBTAB_LABEL: Record<EmploymentSubTab, string> = {
  details: 'Details',
  transfers: 'Transfers',
  appraisals: 'Appraisals',
  familiarisation: 'Familiarisation',
};

/** The URL parameter of the Employment tab's sub-tab. */
export const EMPLOYMENT_SUBTAB_PARAM = 'sub';

export const isEmploymentSubTab = (value: unknown): value is EmploymentSubTab =>
  typeof value === 'string' && (EMPLOYMENT_SUBTABS as readonly string[]).includes(value);

/** The sub-tab a URL names; an unknown or missing one is Details. */
export function resolveEmploymentSubTab(value: string | null | undefined): EmploymentSubTab {
  return isEmploymentSubTab(value) ? value : 'details';
}

// ---------------------------------------------------------------- end reasons (W8)

export interface EndReasonOption {
  value: CrewEmploymentEndReason;
  label: string;
  /** What happens to the active contract, in words, shown under the choice. */
  hint: string;
}

const EXPIRES = 'The active contract is marked expired.';
const TERMINATES = 'The active contract is marked terminated with this reason.';

/** W8's end reasons, in its order; the labels are crew_end_reason_label's. */
export const END_REASONS: readonly EndReasonOption[] = [
  { value: 'contract_end', label: 'Contract end', hint: EXPIRES },
  { value: 'resignation', label: 'Resignation', hint: TERMINATES },
  { value: 'dismissal', label: 'Dismissal', hint: TERMINATES },
  { value: 'medical', label: 'Medical', hint: TERMINATES },
  { value: 'end_of_temporary_contract', label: 'End of temporary contract', hint: EXPIRES },
  { value: 'transfer_to_another_employer', label: 'Transfer to another employer', hint: TERMINATES },
  { value: 'retirement', label: 'Retirement', hint: TERMINATES },
  { value: 'other', label: 'Other', hint: `${TERMINATES} Say why in the notes.` },
];

export const END_REASON_VALUES = END_REASONS.map((r) => r.value) as [CrewEmploymentEndReason, ...CrewEmploymentEndReason[]];

export const isEmploymentEndReason = (value: unknown): value is CrewEmploymentEndReason =>
  typeof value === 'string' && (END_REASON_VALUES as readonly string[]).includes(value);

const humanise = (value: string): string => {
  const t = value.trim().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
  return t ? t.charAt(0).toUpperCase() + t.slice(1).toLowerCase() : '';
};

/**
 * The words of an end reason: W8's, the transfer's own ('transfer', written
 * by transfer_crew), or a legacy value humanised (the HRIS editor's
 * end_of_contract, promotion, …). Null or blank reads null.
 */
export function endReasonLabel(value: string | null | undefined): string | null {
  if (!value || !value.trim()) return null;
  if (value === 'transfer') return 'Transfer to another vessel';
  return END_REASONS.find((r) => r.value === value)?.label ?? humanise(value);
}

/** What crew_end_employment does to the active contract for a reason. */
export function contractOutcomeFor(reason: CrewEmploymentEndReason): 'expired' | 'terminated' {
  return reason === 'contract_end' || reason === 'end_of_temporary_contract' ? 'expired' : 'terminated';
}

// ---------------------------------------------------------------- dates

const DAY_MS = 86_400_000;

const utcOf = (day: string): number => Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)));

/** Whole days from `from` to `to` (date-only strings, no time zone); null when either is not a date. */
export function daysBetweenDates(from: string | null | undefined, to: string | null | undefined): number | null {
  if (!from || !to || !isDateOnly(from.slice(0, 10)) || !isDateOnly(to.slice(0, 10))) return null;
  return Math.round((utcOf(to.slice(0, 10)) - utcOf(from.slice(0, 10))) / DAY_MS);
}

/** `day` plus `n` days (date-only). */
export function addDaysTo(day: string, n: number): string {
  return new Date(utcOf(day) + n * DAY_MS).toISOString().slice(0, 10);
}

const daysInMonth = (year: number, month0: number): number => new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();

/** `day` plus `months` calendar months, the day clamped to the month's end (31 Jan + 1 month = 28 or 29 Feb). */
export function addMonthsTo(day: string, months: number): string {
  const y = Number(day.slice(0, 4));
  const m0 = Number(day.slice(5, 7)) - 1;
  const d = Number(day.slice(8, 10));
  const total = m0 + months;
  const ty = y + Math.floor(total / 12);
  const tm = ((total % 12) + 12) % 12;
  const td = Math.min(d, daysInMonth(ty, tm));
  return `${String(ty).padStart(4, '0')}-${String(tm + 1).padStart(2, '0')}-${String(td).padStart(2, '0')}`;
}

export interface CalendarSpan {
  years: number;
  months: number;
  days: number;
}

/**
 * The calendar span from `from` to `to` (years, then months, then days, as
 * a person counts it: 10 Jan to 9 Mar is 1 month 27 days). Null when either
 * is not a date or `to` is before `from`.
 */
export function calendarSpan(from: string | null | undefined, to: string | null | undefined): CalendarSpan | null {
  const days = daysBetweenDates(from, to);
  if (days === null || days < 0 || !from || !to) return null;
  const a = from.slice(0, 10);
  const b = to.slice(0, 10);
  let months = (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + (Number(b.slice(5, 7)) - Number(a.slice(5, 7)));
  if (addMonthsTo(a, months) > b) months -= 1;
  const anchor = addMonthsTo(a, months);
  return { years: Math.floor(months / 12), months: months % 12, days: daysBetweenDates(anchor, b) ?? 0 };
}

const plural = (n: number, one: string, other: string) => `${n} ${n === 1 ? one : other}`;

/**
 * A served period in words: short for a table cell ("2 yr 3 mo", "4 mo 12 d",
 * "23 days") and long for a screen reader or a title ("2 years 3 months").
 * Years drop the days; null when the dates are missing or reversed.
 */
export function formatDuration(from: string | null | undefined, to: string | null | undefined): { short: string; long: string } | null {
  const span = calendarSpan(from, to);
  if (!span) return null;
  const { years, months, days } = span;
  if (years > 0) {
    return {
      short: months > 0 ? `${years} yr ${months} mo` : `${years} yr`,
      long: months > 0 ? `${plural(years, 'year', 'years')} ${plural(months, 'month', 'months')}` : plural(years, 'year', 'years'),
    };
  }
  if (months > 0) {
    return {
      short: days > 0 ? `${months} mo ${days} d` : `${months} mo`,
      long: days > 0 ? `${plural(months, 'month', 'months')} ${plural(days, 'day', 'days')}` : plural(months, 'month', 'months'),
    };
  }
  return { short: plural(days, 'day', 'days'), long: plural(days, 'day', 'days') };
}

/** "27 Nov 2026" from a date-only string (no time zone shift); '' for none. */
export function formatEmploymentDay(day: string | null | undefined): string {
  if (!day || !isDateOnly(day.slice(0, 10))) return '';
  const [y, m, d] = day.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** "November 2026". */
export function formatMonthYear(year: number, month: number): string {
  return new Date(year, month - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

// ---------------------------------------------------------------- end employment: the form (mirrors crew_end_employment)

export const END_NOTES_MAX = 2000;
/** The end date is within this many days of today, either way (the server's window). */
export const END_DATE_WINDOW_DAYS = 365;

/** The server's sentences, so the form and a refusal read the same. */
export const END_EMPLOYMENT_SENTENCES = {
  reason: 'Choose why the employment ends.',
  notesRequired: 'Say why the employment ends.',
  notesTooLong: 'Keep the notes under 2,000 characters.',
  dateRequired: 'Enter the end date.',
  dateInvalid: 'Enter a valid date.',
  dateWindow: 'Choose an end date within a year of today.',
  beforeJoin: 'The end date is before they joined this vessel.',
} as const;

export interface EndEmploymentContext {
  /** Today's local calendar day (yyyy-MM-dd). */
  today: string;
  /** The day the person joined the vessel (the current assignment's), when known. */
  joinDate: string | null;
}

export function makeEndEmploymentSchema(context: EndEmploymentContext) {
  return z
    .object({
      endDate: z.string(),
      reason: z.string(),
      notes: z.string(),
    })
    .superRefine((v, ctx) => {
      const issue = (path: 'endDate' | 'reason' | 'notes', message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
      const day = v.endDate.trim();
      if (!day) issue('endDate', END_EMPLOYMENT_SENTENCES.dateRequired);
      else if (!isDateOnly(day)) issue('endDate', END_EMPLOYMENT_SENTENCES.dateInvalid);
      else {
        const offset = daysBetweenDates(context.today, day) ?? 0;
        if (Math.abs(offset) > END_DATE_WINDOW_DAYS) issue('endDate', END_EMPLOYMENT_SENTENCES.dateWindow);
        else if (context.joinDate && isDateOnly(context.joinDate.slice(0, 10)) && day < context.joinDate.slice(0, 10)) {
          issue('endDate', END_EMPLOYMENT_SENTENCES.beforeJoin);
        }
      }
      if (!isEmploymentEndReason(v.reason)) issue('reason', END_EMPLOYMENT_SENTENCES.reason);
      const notes = v.notes.trim();
      if (v.reason === 'other' && !notes) issue('notes', END_EMPLOYMENT_SENTENCES.notesRequired);
      if (notes.length > END_NOTES_MAX) issue('notes', END_EMPLOYMENT_SENTENCES.notesTooLong);
    });
}

export type EndEmploymentValues = z.infer<ReturnType<typeof makeEndEmploymentSchema>>;

export function endEmploymentDefaults(today: string): EndEmploymentValues {
  return { endDate: today, reason: '', notes: '' };
}

/** crew_end_employment's arguments from valid form values. */
export function endEmploymentArgs(values: EndEmploymentValues, profileId: string, vesselId: string) {
  if (!isEmploymentEndReason(values.reason)) throw new Error('A valid end reason is required.');
  const notes = values.notes.trim();
  return {
    p_profile_id: profileId,
    p_vessel_id: vesselId,
    p_end_date: values.endDate.trim(),
    p_reason: values.reason,
    p_notes: notes || null,
  };
}

/** The form field a server HINT names (crew_end_employment's 22023 refusals), or null for a form-level refusal. */
export function endEmploymentFieldFor(hint: string | null | undefined): keyof EndEmploymentValues | null {
  switch (hint) {
    case 'end_date':
      return 'endDate';
    case 'reason':
      return 'reason';
    case 'notes':
      return 'notes';
    default:
      return null;
  }
}

/** D-225: a pending placement is not an assignment; it is changed on the profile, never ended (crew_end_employment's sentence). */
export const END_EMPLOYMENT_PENDING_MESSAGE =
  'This person is not assigned to the vessel yet: their assignment is written once their login is linked. Change the pending vessel on the profile.';

/** The legacy sign-off's reason for a W8 reason (the D-01 fallback carries the choice over). */
export function legacySignOffReason(reason: string): 'contract_end' | 'resignation' | 'termination' | 'other' {
  if (reason === 'contract_end' || reason === 'end_of_temporary_contract') return 'contract_end';
  if (reason === 'resignation') return 'resignation';
  if (reason === 'dismissal') return 'termination';
  return 'other';
}

// ---------------------------------------------------------------- end employment: the answer

export interface EndEmploymentResult {
  assignmentId: string;
  endDate: string;
  reason: CrewEmploymentEndReason;
  termsEnded: number;
  contract: { id: string; status: 'expired' | 'terminated' } | null;
  periodsRemoved: number;
  periodsTrimmed: number;
  /** The month the end date falls in, with its submission state; null for a person without a login. */
  finalHorMonth: { year: number; month: number; submissionStatus: string } | null;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => v !== null && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);
const count = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null);
const day = (v: unknown): string | null => (typeof v === 'string' && isDateOnly(v.slice(0, 10)) ? v.slice(0, 10) : null);

/** crew_end_employment's jsonb answer, read strictly: anything unexpected is null (never a guess). */
export function parseEndEmploymentResult(value: unknown): EndEmploymentResult | null {
  if (!isObj(value)) return null;
  const assignmentId = str(value.assignment_id);
  const endDate = day(value.end_date);
  const reason = value.reason;
  const termsEnded = count(value.terms_ended);
  const periodsRemoved = count(value.periods_removed);
  const periodsTrimmed = count(value.periods_trimmed);
  if (!assignmentId || !endDate || !isEmploymentEndReason(reason) || termsEnded === null || periodsRemoved === null || periodsTrimmed === null) {
    return null;
  }
  let contract: EndEmploymentResult['contract'] = null;
  if (value.contract !== null && value.contract !== undefined) {
    if (!isObj(value.contract)) return null;
    const id = str(value.contract.id);
    const status = value.contract.status;
    if (!id || (status !== 'expired' && status !== 'terminated')) return null;
    contract = { id, status };
  }
  let finalHorMonth: EndEmploymentResult['finalHorMonth'] = null;
  if (value.final_hor_month !== null && value.final_hor_month !== undefined) {
    const m = value.final_hor_month;
    if (!isObj(m)) return null;
    const year = typeof m.year === 'number' && Number.isInteger(m.year) ? m.year : null;
    const month = typeof m.month === 'number' && Number.isInteger(m.month) && m.month >= 1 && m.month <= 12 ? m.month : null;
    const submissionStatus = str(m.submission_status);
    if (year === null || month === null || !submissionStatus) return null;
    finalHorMonth = { year, month, submissionStatus };
  }
  return { assignmentId, endDate, reason, termsEnded, contract, periodsRemoved, periodsTrimmed, finalHorMonth };
}

/** An hours-of-rest month's state in words, for the final month after an end of employment. */
export function horMonthStateText(status: string): string {
  switch (status) {
    case 'none':
      return 'nothing recorded yet';
    case 'draft':
    case 'reopened':
      return 'not submitted yet';
    case 'submitted':
    case 'crew_signed':
      return 'submitted, waiting for sign-off';
    case 'hod_signed':
    case 'hod_reviewed':
      return 'signed by the head of department, waiting for approval';
    case 'approved':
    case 'captain_reviewed':
      return 'approved';
    case 'locked':
      return 'locked';
    default:
      return humanise(status).toLowerCase();
  }
}

/** The outcome of an end of employment in words: one sentence per effect, as the server answered it. */
export function endEmploymentOutcome(result: EndEmploymentResult, names: { person: string; vessel: string }): string[] {
  const lines: string[] = [];
  lines.push(`${names.person} leaves ${names.vessel} on ${formatEmploymentDay(result.endDate)}: ${endReasonLabel(result.reason)}.`);
  if (result.contract) {
    lines.push(result.contract.status === 'expired' ? 'The active contract is marked expired.' : 'The active contract is marked terminated.');
  } else {
    lines.push('There was no active contract to close.');
  }
  if (result.termsEnded > 0) lines.push('The employment terms on this vessel end on that day.');
  const removed = result.periodsRemoved;
  const trimmed = result.periodsTrimmed;
  if (removed === 0 && trimmed === 0) lines.push('The planner had nothing after that day.');
  else {
    const parts: string[] = [];
    if (removed > 0) parts.push(`${plural(removed, 'planner period', 'planner periods')} after that day ${removed === 1 ? 'was' : 'were'} removed`);
    if (trimmed > 0) parts.push(`${plural(trimmed, 'period', 'periods')} now ${trimmed === 1 ? 'ends' : 'end'} on it`);
    const sentence = parts.join(', and ');
    lines.push(`${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.`);
  }
  if (result.finalHorMonth) {
    const m = result.finalHorMonth;
    lines.push(`Hours of rest for ${formatMonthYear(m.year, m.month)} are their final month: ${horMonthStateText(m.submissionStatus)}.`);
  } else {
    lines.push('They have no login, so there is no hours of rest month to close.');
  }
  lines.push('Fleet HR is told in STORM. Their documents and history stay on their profile.');
  return lines;
}

// ---------------------------------------------------------------- the vessel's employment history (C59)

export interface EmploymentHistoryRow {
  assignmentId: string;
  profileId: string;
  userId: string;
  name: string;
  /** The catalogue position's name, else the assignment's title. */
  position: string | null;
  positionId: string | null;
  departmentKey: string | null;
  departmentLabel: string | null;
  joinDate: string | null;
  leaveDate: string | null;
  durationDays: number | null;
  endReason: string | null;
  endNotes: string | null;
  currentVesselId: string | null;
  currentVesselName: string | null;
}

/** "Demo Bosun": the preferred (else first) name and the last name. */
export function historyPersonName(first: string | null | undefined, last: string | null | undefined, preferred?: string | null): string {
  const given = (preferred ?? '').trim() || (first ?? '').trim();
  return [given, (last ?? '').trim()].filter(Boolean).join(' ') || 'Unnamed crew member';
}

export function toEmploymentHistoryRow(r: CrewEmploymentHistoryRpcRow): EmploymentHistoryRow {
  return {
    assignmentId: r.assignment_id,
    profileId: r.profile_id,
    userId: r.user_id,
    name: historyPersonName(r.first_name, r.last_name, r.preferred_name),
    position: (r.position_name ?? '').trim() || (r.position_text ?? '').trim() || null,
    positionId: r.position_id,
    departmentKey: r.department_key,
    departmentLabel: r.department_label,
    joinDate: r.join_date,
    leaveDate: r.leave_date,
    durationDays: typeof r.duration_days === 'number' ? r.duration_days : daysBetweenDates(r.join_date, r.leave_date),
    endReason: (r.end_reason ?? '').trim() || null,
    endNotes: (r.end_notes ?? '').trim() || null,
    currentVesselId: r.current_vessel_id,
    currentVesselName: r.current_vessel_name,
  };
}

/** The page's counters: past crew (distinct people) and records (ended assignments). */
export function historyCounters(rows: readonly Pick<EmploymentHistoryRow, 'profileId'>[]): { pastCrew: number; records: number } {
  return { pastCrew: new Set(rows.map((r) => r.profileId)).size, records: rows.length };
}

/**
 * Why a history row cannot be re-hired from this vessel's history, or null
 * when it can: someone on a crew today is transferred or edited there,
 * not re-hired (crew_rehire_prefill names their current vessel too).
 */
export function rehireBlock(row: Pick<EmploymentHistoryRow, 'currentVesselId' | 'currentVesselName'>, routeVesselId: string): string | null {
  if (!row.currentVesselId) return null;
  if (row.currentVesselId === routeVesselId) return 'Back on this vessel’s crew already.';
  return `On ${row.currentVesselName ?? 'another vessel'}’s crew now. Transfer them instead.`;
}

/** The text a history row is found by (name, position, department, reason). */
export function historySearchText(row: EmploymentHistoryRow): string {
  return [row.name, row.position, row.departmentLabel, endReasonLabel(row.endReason), row.endNotes].filter(Boolean).join(' ');
}

// ---------------------------------------------------------------- re-hire prefill (crew_rehire_prefill)

export interface RehirePrefillAnswer {
  profileId: string;
  displayName: string;
  hasLogin: boolean;
  /** The vessel whose crew they are on today, if any (a re-hire is for people on no crew). */
  current: { vesselId: string; vesselName: string | null } | null;
  lastAssignment: { vesselId: string; vesselName: string | null; position: string | null; joinDate: string | null; leaveDate: string | null; endReason: string | null } | null;
  /** Add crew's form values the answer fills. */
  values: Partial<AddCrewValues>;
}

const numText = (v: unknown): string => (typeof v === 'number' && Number.isFinite(v) ? String(v) : typeof v === 'string' ? v : '');

/** crew_rehire_prefill's jsonb answer in Add crew's shape; null when it cannot be read. */
export function parseRehirePrefill(value: unknown): RehirePrefillAnswer | null {
  if (!isObj(value)) return null;
  const profileId = str(value.profile_id);
  if (!profileId) return null;
  const first = typeof value.first_name === 'string' ? value.first_name : '';
  const last = typeof value.last_name === 'string' ? value.last_name : '';
  const preferred = typeof value.preferred_name === 'string' ? value.preferred_name : null;
  const values: Partial<AddCrewValues> = { firstName: first, lastName: last };
  if (typeof value.email === 'string') values.email = value.email;
  let current: RehirePrefillAnswer['current'] = null;
  if (isObj(value.current) && str(value.current.vessel_id)) {
    current = { vesselId: str(value.current.vessel_id) as string, vesselName: str(value.current.vessel_name) };
  }
  let lastAssignment: RehirePrefillAnswer['lastAssignment'] = null;
  if (isObj(value.last_assignment) && str(value.last_assignment.vessel_id)) {
    const a = value.last_assignment;
    lastAssignment = {
      vesselId: str(a.vessel_id) as string,
      vesselName: str(a.vessel_name),
      position: str(a.position_text),
      joinDate: day(a.join_date),
      leaveDate: day(a.leave_date),
      endReason: str(a.end_reason),
    };
  }
  if (isObj(value.terms)) {
    const t = value.terms;
    if (str(t.position_id)) values.positionId = str(t.position_id) as string;
    if (str(t.department_key)) values.departmentKey = str(t.department_key) as string;
    if (str(t.contract_type_key)) values.contractTypeKey = str(t.contract_type_key) as string;
    if (str(t.place_of_embarkation)) values.placeOfEmbarkation = str(t.place_of_embarkation) as string;
    const method = t.leave_method;
    if (typeof method === 'string' && (LEAVE_METHODS as readonly string[]).includes(method)) {
      values.leaveMethod = method as LeaveMethod;
      values.leaveDaysPerYear = numText(t.leave_days_per_year);
      values.leaveRatioOn = numText(t.leave_ratio_on);
      values.leaveRatioOff = numText(t.leave_ratio_off);
    }
  }
  return {
    profileId,
    displayName: historyPersonName(first, last, preferred),
    hasLogin: value.has_login === true,
    current,
    lastAssignment,
    values,
  };
}

// ---------------------------------------------------------------- the contract's probation and notice periods (061100)

export const PROBATION_MONTHS_MAX = 24;
export const NOTICE_DAYS_MAX = 365;

export interface ContractNotice {
  /** The 061100 columns are in the answer (D-01: false while the file is not applied). */
  known: boolean;
  probationMonths: number | null;
  noticeDuringProbationDays: number | null;
  noticeAfterProbationDays: number | null;
}

const intOrNull = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) ? v : null);

/**
 * The probation length and the two notice periods of a crew_contracts row
 * read with `*`: the keys are there once 061100 is applied. Without them
 * the legacy notice period stands in for the notice after probation.
 */
export function contractNoticeOf(row: object | null | undefined): ContractNotice {
  if (!row) return { known: false, probationMonths: null, noticeDuringProbationDays: null, noticeAfterProbationDays: null };
  const r = row as Obj;
  const known = 'probation_months' in r && 'notice_during_probation_days' in r && 'notice_after_probation_days' in r;
  if (!known) {
    return { known: false, probationMonths: null, noticeDuringProbationDays: null, noticeAfterProbationDays: intOrNull(r.notice_period_days) };
  }
  return {
    known: true,
    probationMonths: intOrNull(r.probation_months),
    noticeDuringProbationDays: intOrNull(r.notice_during_probation_days),
    noticeAfterProbationDays: intOrNull(r.notice_after_probation_days),
  };
}

/** "3 months", "1 month", "No probation" for 0; null when not recorded. */
export function probationText(months: number | null): string | null {
  if (months === null) return null;
  return months === 0 ? 'No probation' : plural(months, 'month', 'months');
}

/** "30 days", "1 day", "No notice" for 0; null when not recorded. */
export function noticeText(days: number | null): string | null {
  if (days === null) return null;
  return days === 0 ? 'No notice' : plural(days, 'day', 'days');
}

/** A whole number in [min, max] from a text field; '' is null; anything else is 'invalid'. */
export function parseWholeInRange(text: string, min: number, max: number): number | null | 'invalid' {
  const t = text.trim();
  if (t === '') return null;
  if (!/^\d{1,4}$/.test(t)) return 'invalid';
  const n = Number(t);
  return n >= min && n <= max ? n : 'invalid';
}

export interface ContractNoticePatch {
  probation_months: number | null;
  notice_during_probation_days: number | null;
  notice_after_probation_days: number | null;
  /** The legacy readers' columns, kept in step. */
  notice_period_days: number | null;
  probation_end_date: string | null;
}

/** The crew_contracts patch for the three periods, keeping probation_end_date and notice_period_days in step. */
export function toContractNoticePatch(
  values: Pick<TermsFormValues, 'probationMonths' | 'noticeDuringProbationDays' | 'noticeAfterProbationDays'>,
  contract: { start_date: string },
): ContractNoticePatch {
  const months = parseWholeInRange(values.probationMonths, 0, PROBATION_MONTHS_MAX);
  const during = parseWholeInRange(values.noticeDuringProbationDays, 0, NOTICE_DAYS_MAX);
  const after = parseWholeInRange(values.noticeAfterProbationDays, 0, NOTICE_DAYS_MAX);
  if (months === 'invalid' || during === 'invalid' || after === 'invalid') throw new Error('The probation and notice periods must be valid before they are saved.');
  return {
    probation_months: months,
    notice_during_probation_days: during,
    notice_after_probation_days: after,
    notice_period_days: after,
    probation_end_date: months === null || months === 0 || !isDateOnly(contract.start_date.slice(0, 10)) ? null : addMonthsTo(contract.start_date.slice(0, 10), months),
  };
}

// ---------------------------------------------------------------- employment terms: the edit form (crew_onboarding_save's terms path)

export interface TermsFormValues {
  /** Editable only when no terms row exists yet: a row is keyed by its start date. */
  startDate: string;
  positionId: string;
  departmentKey: string;
  contractTypeKey: string;
  joiningDate: string;
  reviewDate: string;
  leaveMethod: LeaveMethod;
  leaveDaysPerYear: string;
  leaveRatioOn: string;
  leaveRatioOff: string;
  placeOfEmbarkation: string;
  probationMonths: string;
  noticeDuringProbationDays: string;
  noticeAfterProbationDays: string;
}

export interface TermsSchemaOptions {
  /** The terms part is saved (the viewer may store terms). */
  editTerms: boolean;
  /** The contract part is saved (an active contract, the 061100 columns and the viewer may edit contracts). */
  editContract: boolean;
  /** The vessel's positions are listed: one must be chosen. */
  positionsFromCatalogue: boolean;
  /** The department list is there: one must be chosen. */
  departmentsAvailable: boolean;
}

export function makeTermsSchema(options: TermsSchemaOptions) {
  const text = z.string();
  return z
    .object({
      startDate: text,
      positionId: text,
      departmentKey: text,
      contractTypeKey: text,
      joiningDate: text,
      reviewDate: text,
      leaveMethod: z.enum(LEAVE_METHODS),
      leaveDaysPerYear: text,
      leaveRatioOn: text,
      leaveRatioOff: text,
      placeOfEmbarkation: text.refine((v) => v.trim().length <= PORT_MAX, `Keep the place of embarkation to ${PORT_MAX} characters`),
      probationMonths: text,
      noticeDuringProbationDays: text,
      noticeAfterProbationDays: text,
    })
    .superRefine((v, ctx) => {
      const issue = (path: keyof TermsFormValues, message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
      if (options.editTerms) {
        const start = v.startDate.trim();
        if (!start) issue('startDate', 'Enter the start date');
        else if (!isDateOnly(start)) issue('startDate', 'Enter a valid date');
        if (options.positionsFromCatalogue && !v.positionId) issue('positionId', 'Choose a position');
        if (options.departmentsAvailable && !v.departmentKey) issue('departmentKey', 'Choose a department');
        if (isDateOnly(start)) {
          const joining = v.joiningDate.trim();
          if (joining && !isDateOnly(joining)) issue('joiningDate', 'Enter a valid date');
          else if (joining && joining < start) issue('joiningDate', 'The date joining the vessel cannot be before the start date');
          const review = v.reviewDate.trim();
          if (review && !isDateOnly(review)) issue('reviewDate', 'Enter a valid date');
          else if (review && review < start) issue('reviewDate', 'The review date cannot be before the start date');
        }
        if (v.leaveMethod === 'days_per_year' && parseLeaveDays(v.leaveDaysPerYear) === null) {
          issue('leaveDaysPerYear', `Enter 0 to ${LEAVE_DAYS_MAX} days, with up to two decimals`);
        }
        if (v.leaveMethod === 'ratio') {
          if (parseRatioPart(v.leaveRatioOn) === null) issue('leaveRatioOn', 'Enter a whole number from 1');
          if (parseRatioPart(v.leaveRatioOff) === null) issue('leaveRatioOff', 'Enter a whole number from 1');
        }
      }
      if (options.editContract) {
        if (parseWholeInRange(v.probationMonths, 0, PROBATION_MONTHS_MAX) === 'invalid') issue('probationMonths', `Enter 0 to ${PROBATION_MONTHS_MAX} months`);
        if (parseWholeInRange(v.noticeDuringProbationDays, 0, NOTICE_DAYS_MAX) === 'invalid') {
          issue('noticeDuringProbationDays', `Enter 0 to ${NOTICE_DAYS_MAX} days`);
        }
        if (parseWholeInRange(v.noticeAfterProbationDays, 0, NOTICE_DAYS_MAX) === 'invalid') {
          issue('noticeAfterProbationDays', `Enter 0 to ${NOTICE_DAYS_MAX} days`);
        }
      }
    });
}

const intText = (n: number | null | undefined): string => (n === null || n === undefined ? '' : String(n));

/** The edit form's starting values from the stored terms (or a new record's defaults) and the contract's periods. */
export function termsDefaults(
  terms: Pick<
    CrewAssignmentTermsRow,
    | 'start_date'
    | 'position_id'
    | 'department_key'
    | 'contract_type_key'
    | 'date_joining_vessel'
    | 'review_date'
    | 'leave_method'
    | 'leave_days_per_year'
    | 'leave_ratio_on'
    | 'leave_ratio_off'
    | 'place_of_embarkation'
  > | null,
  notice: ContractNotice,
  fallbackStart: string | null,
): TermsFormValues {
  const method: LeaveMethod = terms?.leave_method && (LEAVE_METHODS as readonly string[]).includes(terms.leave_method) ? terms.leave_method : 'days_per_year';
  return {
    startDate: terms?.start_date?.slice(0, 10) ?? fallbackStart?.slice(0, 10) ?? '',
    positionId: terms?.position_id ?? '',
    departmentKey: terms?.department_key ?? '',
    contractTypeKey: terms?.contract_type_key ?? '',
    joiningDate: terms?.date_joining_vessel?.slice(0, 10) ?? '',
    reviewDate: terms?.review_date?.slice(0, 10) ?? '',
    leaveMethod: method,
    leaveDaysPerYear: terms ? (terms.leave_days_per_year === null ? '' : String(Number(terms.leave_days_per_year))) : '30',
    leaveRatioOn: terms ? intText(terms.leave_ratio_on) : '',
    leaveRatioOff: terms ? intText(terms.leave_ratio_off) : '',
    placeOfEmbarkation: terms?.place_of_embarkation ?? '',
    probationMonths: intText(notice.probationMonths),
    noticeDuringProbationDays: intText(notice.noticeDuringProbationDays),
    noticeAfterProbationDays: intText(notice.noticeAfterProbationDays),
  };
}

const TERMS_FIELDS: readonly (keyof TermsFormValues)[] = [
  'startDate',
  'positionId',
  'departmentKey',
  'contractTypeKey',
  'joiningDate',
  'reviewDate',
  'leaveMethod',
  'leaveDaysPerYear',
  'leaveRatioOn',
  'leaveRatioOff',
  'placeOfEmbarkation',
];
const CONTRACT_FIELDS: readonly (keyof TermsFormValues)[] = ['probationMonths', 'noticeDuringProbationDays', 'noticeAfterProbationDays'];

const differs = (a: TermsFormValues, b: TermsFormValues, keys: readonly (keyof TermsFormValues)[]) => keys.some((k) => a[k].trim() !== b[k].trim());

/** Which parts of the form changed from its starting values. */
export function termsChanges(values: TermsFormValues, initial: TermsFormValues): { terms: boolean; contract: boolean } {
  return { terms: differs(values, initial, TERMS_FIELDS), contract: differs(values, initial, CONTRACT_FIELDS) };
}

/**
 * crew_onboarding_save's p_terms for an edit: EVERY key, because a save of
 * the same start date replaces the row (a key left out is stored empty).
 * Position and department only when they come from the lists; the leave
 * allowance in the shape the table's CHECK wants.
 */
export function toTermsPayload(values: TermsFormValues, context: { positionsFromCatalogue: boolean; departmentsAvailable: boolean }): OnboardingTerms {
  const terms: OnboardingTerms = { start_date: values.startDate.trim(), leave_method: values.leaveMethod };
  const put = (key: keyof OnboardingTerms, value: string) => {
    const t = value.trim();
    if (t) terms[key] = t;
  };
  if (context.positionsFromCatalogue) put('position_id', values.positionId);
  if (context.departmentsAvailable) put('department_key', values.departmentKey);
  put('date_joining_vessel', values.joiningDate);
  put('review_date', values.reviewDate);
  put('contract_type_key', values.contractTypeKey);
  put('place_of_embarkation', values.placeOfEmbarkation);
  if (values.leaveMethod === 'days_per_year') {
    const days = parseLeaveDays(values.leaveDaysPerYear);
    if (days !== null) terms.leave_days_per_year = days;
  } else if (values.leaveMethod === 'ratio') {
    const on = parseRatioPart(values.leaveRatioOn);
    const off = parseRatioPart(values.leaveRatioOff);
    if (on !== null) terms.leave_ratio_on = on;
    if (off !== null) terms.leave_ratio_off = off;
  }
  return terms;
}

/** The terms form field a crew_onboarding_save HINT names, or null. */
export function termsFieldFor(hint: string | null | undefined): keyof TermsFormValues | null {
  switch (hint) {
    case 'start_date':
      return 'startDate';
    case 'position_id':
      return 'positionId';
    case 'department_key':
      return 'departmentKey';
    case 'date_joining_vessel':
      return 'joiningDate';
    case 'review_date':
      return 'reviewDate';
    case 'contract_type_key':
      return 'contractTypeKey';
    case 'leave_method':
      return 'leaveMethod';
    default:
      return null;
  }
}
