/**
 * Add crew member (gap/04 C14, C15, C55, W1; X1-03B): the form's sections
 * and field rules, the payloads for the two saves, and the honest outcome.
 *
 * Sections (W1): Basic (names, email), Position and department, Status
 * (derived from the joining date, never typed), Employment (start, joining
 * and review dates, contract type, leave allowance), Embarkation, and
 * Permissions (the STORM role sent to create-crew-member, on the D-189
 * allow-list and defaulted from the position; the position's default access
 * set is a preview only until access sets exist, C15).
 *
 * Saving is two steps (X1 spec X1-03B):
 * 1. create-crew-member (the hardened creation path, D-180/D-184/D-189):
 *    the profile without a login, the vessel as a pending placement, the
 *    invitation when asked;
 * 2. crew_onboarding_save (060300): the employment terms on this vessel.
 * The outcome says what happened, part by part: "Added and invited",
 * "Added, not invited", or "Added. The employment details were not saved:
 * <sentence>. Open the profile to add them."
 *
 * Email: required until the platform makes profiles.email optional
 * (PR-X1-H; D-X1-5 is OPEN). The schema already takes `emailOptional`, and
 * the help text for a person without an email is written (NO_EMAIL_HELP).
 *
 * Pure: no React, no client. Dates are date-only strings in local time.
 */
import { z } from 'zod';
import { isDateOnly } from '@/shared/lib/form';
import { NOT_STORED_NOTE, emailErrorMessage } from '@/modules/auth/services/adminActions';
import type { CreateCrewMemberInput, CreateCrewOutcome, CrewMemberRole } from '@/modules/auth/services/adminActions';
import { CREW_ROOT } from '../paths';
import type { AccessSetKey } from '../types/domain';

// ---------------------------------------------------------------- the route

/** The Add crew page, relative to `/v/:vesselCode` (routes.tsx declares the same path). */
export const ADD_CREW_PATH = `${CREW_ROOT}/new`;
/** The re-hire prefill parameter (X1-11B links `crew/new?rehire=<profileId>`). */
export const REHIRE_PARAM = 'rehire';

/** The Add crew URL, optionally prefilled for a re-hire. Link it with useScopedPath(). */
export function addCrewPath(options: { rehire?: string | null } = {}): string {
  return options.rehire ? `${ADD_CREW_PATH}?${REHIRE_PARAM}=${encodeURIComponent(options.rehire)}` : ADD_CREW_PATH;
}

// ---------------------------------------------------------------- copy and limits

/** Email stays required until PR-X1-H (D-X1-5). Flip with the platform change, and the schema follows. */
export const EMAIL_OPTIONAL = false;
export const EMAIL_HELP = 'STORM sends the invitation here. One email belongs to one person.';
/** Prepared for PR-X1-H: shown when the email becomes optional. */
export const NO_EMAIL_HELP = 'Optional. Without an email the person cannot sign in to STORM or receive an invitation; you can add one later.';

export const NAME_MAX = 50;
export const EMAIL_MAX = 254;
export const POSITION_TITLE_MAX = 80;
export const PORT_MAX = 120;
export const DEFAULT_LEAVE_DAYS = 30;
export const LEAVE_DAYS_MAX = 365;
export const RATIO_PART_MAX = 365;

// ---------------------------------------------------------------- roles (C15, D-189)

/** The roles the browser may send (create-crew-member's CREW_ROLES; admin roles are given in Users & Access, D-124). */
export const ADD_CREW_ROLES = ['crew', 'master', 'chief_officer', 'chief_engineer'] as const satisfies readonly CrewMemberRole[];

export const ADD_CREW_ROLE_LABEL: Record<CrewMemberRole, string> = {
  crew: 'Crew',
  master: 'Master',
  chief_officer: 'Chief officer',
  chief_engineer: 'Chief engineer',
};

/** The role a position implies: its own key for the three senior offices, else crew. */
export function defaultRoleForPosition(positionKey: string | null | undefined): CrewMemberRole {
  switch ((positionKey ?? '').trim().toLowerCase()) {
    case 'master':
      return 'master';
    case 'chief_officer':
      return 'chief_officer';
    case 'chief_engineer':
      return 'chief_engineer';
    default:
      return 'crew';
  }
}

/** What the access-set preview says for a position's default access set (C15: preview only). */
export function accessSetPreview(key: AccessSetKey | null | undefined, labels: Record<AccessSetKey, string>): string {
  return key ? labels[key] : 'No default access set';
}

// ---------------------------------------------------------------- leave allowance (C55)

export const LEAVE_METHODS = ['days_per_year', 'ratio', 'none'] as const;
export type LeaveMethod = (typeof LEAVE_METHODS)[number];
export const LEAVE_METHOD_LABEL: Record<LeaveMethod, string> = {
  days_per_year: 'Days per year',
  ratio: 'Rotation ratio',
  none: 'No leave allowance',
};

const DAYS_TEXT = /^\d{1,3}(\.\d{1,2})?$/;
const WHOLE_TEXT = /^\d{1,3}$/;

/** A days-per-year text as a number in range, or null. */
export function parseLeaveDays(text: string): number | null {
  const t = text.trim();
  if (!DAYS_TEXT.test(t)) return null;
  const n = Number(t);
  return n >= 0 && n <= LEAVE_DAYS_MAX ? n : null;
}

/** A ratio part as a whole number from 1, or null. */
export function parseRatioPart(text: string): number | null {
  const t = text.trim();
  if (!WHOLE_TEXT.test(t)) return null;
  const n = Number(t);
  return n >= 1 && n <= RATIO_PART_MAX ? n : null;
}

/** "= 2.50 days/month" for a days-per-year text, or null when it is not a valid number. */
export function leaveDaysPerMonthText(text: string): string | null {
  const days = parseLeaveDays(text);
  return days === null ? null : `= ${(days / 12).toFixed(2)} days/month`;
}

// ---------------------------------------------------------------- status (derived)

export type JoinStatus = 'on_board' | 'pending';

/**
 * On board or Pending, from the dates (W1: the form never asks): Pending
 * while the day they step aboard (the joining date, else the start date) is
 * still ahead, else On board. Null without a valid start date.
 */
export function deriveJoinStatus(startDate: string, joiningDate: string, today: string): JoinStatus | null {
  const start = startDate.trim();
  if (!isDateOnly(start)) return null;
  const joining = joiningDate.trim();
  const aboard = isDateOnly(joining) ? joining : start;
  return aboard > today ? 'pending' : 'on_board';
}

// ---------------------------------------------------------------- the schema

const trimmedMax = (max: number, message: string) => z.string().trim().max(max, message);
const optionalDate = z
  .string()
  .trim()
  .refine((v) => v === '' || isDateOnly(v), 'Enter a valid date');

export interface AddCrewSchemaOptions {
  /** profiles.email is optional (PR-X1-H). */
  emailOptional?: boolean;
  /** The vessel's positions are set up: a position must be chosen from them; otherwise a title is typed (D-01). */
  positionsFromCatalogue?: boolean;
  /** The department list is set up: a department is required. */
  departmentsAvailable?: boolean;
}

export function makeAddCrewSchema(options: AddCrewSchemaOptions = {}) {
  const { emailOptional = EMAIL_OPTIONAL, positionsFromCatalogue = true, departmentsAvailable = true } = options;
  const email = z.string().trim().max(EMAIL_MAX, `Keep the email to ${EMAIL_MAX} characters`);
  return z
    .object({
      firstName: z.string().trim().min(1, 'Enter the first name').max(NAME_MAX, `Keep the first name to ${NAME_MAX} characters`),
      lastName: z.string().trim().min(1, 'Enter the last name').max(NAME_MAX, `Keep the last name to ${NAME_MAX} characters`),
      email: emailOptional
        ? z.union([z.literal(''), email.email('Enter a valid email address')])
        : email.min(1, 'Enter an email address').email('Enter a valid email address'),
      positionId: z.string(),
      positionTitle: trimmedMax(POSITION_TITLE_MAX, `Keep the position to ${POSITION_TITLE_MAX} characters`),
      departmentKey: z.string(),
      startDate: z
        .string()
        .trim()
        .min(1, 'Enter the start date')
        .refine((v) => isDateOnly(v), 'Enter a valid date'),
      joiningDate: optionalDate,
      reviewDate: optionalDate,
      contractTypeKey: z.string(),
      leaveMethod: z.enum(LEAVE_METHODS),
      leaveDaysPerYear: z.string(),
      leaveRatioOn: z.string(),
      leaveRatioOff: z.string(),
      placeOfEmbarkation: trimmedMax(PORT_MAX, `Keep the place of embarkation to ${PORT_MAX} characters`),
      role: z.enum(ADD_CREW_ROLES),
      sendInvite: z.boolean(),
    })
    .superRefine((v, ctx) => {
      const issue = (path: string, message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
      if (positionsFromCatalogue && !v.positionId) issue('positionId', 'Choose a position');
      if (!positionsFromCatalogue && !v.positionTitle.trim()) issue('positionTitle', 'Enter the position');
      if (departmentsAvailable && !v.departmentKey) issue('departmentKey', 'Choose a department');
      const start = v.startDate.trim();
      if (isDateOnly(start)) {
        const joining = v.joiningDate.trim();
        if (isDateOnly(joining) && joining < start) issue('joiningDate', 'The joining date cannot be before the start date');
        const review = v.reviewDate.trim();
        if (isDateOnly(review) && review < start) issue('reviewDate', 'The review date cannot be before the start date');
      }
      if (v.leaveMethod === 'days_per_year' && parseLeaveDays(v.leaveDaysPerYear) === null) {
        issue('leaveDaysPerYear', `Enter 0 to ${LEAVE_DAYS_MAX} days, with up to two decimals`);
      }
      if (v.leaveMethod === 'ratio') {
        if (parseRatioPart(v.leaveRatioOn) === null) issue('leaveRatioOn', 'Enter a whole number from 1');
        if (parseRatioPart(v.leaveRatioOff) === null) issue('leaveRatioOff', 'Enter a whole number from 1');
      }
    });
}

export const addCrewSchema = makeAddCrewSchema();
export type AddCrewValues = z.infer<typeof addCrewSchema>;

/** A new form: invitation on (D-189), 30 days a year (W1), crew role. */
export function addCrewDefaults(prefill: Partial<AddCrewValues> = {}): AddCrewValues {
  return {
    firstName: '',
    lastName: '',
    email: '',
    positionId: '',
    positionTitle: '',
    departmentKey: '',
    startDate: '',
    joiningDate: '',
    reviewDate: '',
    contractTypeKey: '',
    leaveMethod: 'days_per_year',
    leaveDaysPerYear: String(DEFAULT_LEAVE_DAYS),
    leaveRatioOn: '',
    leaveRatioOff: '',
    placeOfEmbarkation: '',
    role: 'crew',
    sendInvite: true,
    ...prefill,
  };
}

// ---------------------------------------------------------------- payloads

/** The keys crew_onboarding_save accepts in p_terms (it refuses any other, 22023 field_unknown). */
export const ONBOARDING_TERM_KEYS = [
  'start_date',
  'position_id',
  'department_key',
  'date_joining_vessel',
  'review_date',
  'contract_type_key',
  'leave_method',
  'leave_days_per_year',
  'leave_ratio_on',
  'leave_ratio_off',
  'place_of_embarkation',
] as const;
export type OnboardingTerms = Partial<Record<(typeof ONBOARDING_TERM_KEYS)[number], string | number>>;

/** The create-crew-member body: the person, the vessel, the role and the invitation choice. */
export function toCreateCrewInput(values: AddCrewValues, context: { vesselId: string; positionName: string | null }): CreateCrewMemberInput {
  const joining = values.joiningDate.trim() || values.startDate.trim();
  return {
    email: values.email.trim().toLowerCase(),
    firstName: values.firstName.trim(),
    lastName: values.lastName.trim(),
    role: values.role,
    vesselId: context.vesselId,
    position: (context.positionName ?? values.positionTitle).trim() || undefined,
    joinDate: joining || undefined,
    sendInvite: values.sendInvite,
  };
}

/**
 * crew_onboarding_save's p_terms: only filled keys (the server reads a
 * missing key as empty), the leave allowance in the shape its CHECK wants
 * (days for days, both parts for a ratio, nothing for none), and the
 * position and department only when they come from the lists.
 */
export function toOnboardingTerms(values: AddCrewValues, context: { positionsFromCatalogue: boolean; departmentsAvailable: boolean }): OnboardingTerms {
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

/** What the duplicate check looked at; a change to any of these means it must run again. */
export function duplicateKey(values: Pick<AddCrewValues, 'email' | 'firstName' | 'lastName'>): string {
  const fold = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();
  return [fold(values.email), fold(values.firstName), fold(values.lastName)].join('|');
}

export type DuplicateMatchKind = 'email' | 'name_dob' | 'name';
export const DUPLICATE_MATCH_LABEL: Record<DuplicateMatchKind, string> = {
  email: 'Same email',
  name_dob: 'Same name and date of birth',
  name: 'Same name',
};

/** A person with the same email cannot be added again (one email, one person); a name match can, once confirmed. */
export function duplicatesBlockSave(matches: readonly { matchKind: DuplicateMatchKind }[], confirmedDifferent: boolean): boolean {
  if (matches.some((m) => m.matchKind === 'email')) return true;
  return matches.length > 0 && !confirmedDifferent;
}

// ---------------------------------------------------------------- the outcome

/** What the second step (crew_onboarding_save) did. */
export type OnboardingOutcome =
  | { status: 'saved' }
  /** The function is not applied yet (D-01). */
  | { status: 'missing' }
  | { status: 'failed'; message: string };

/** The D-01 sentence: the terms store is not in this database yet. */
export const ONBOARDING_MISSING_SENTENCE = 'storing them needs the crew update, which this account does not have yet';

export type AddCrewField = 'email' | 'firstName' | 'lastName' | 'role';

export type AddCrewResult =
  | {
      kind: 'added';
      tone: 'success' | 'warning';
      title: string;
      /** One sentence per part, in order: employment, invitation, vessel. */
      lines: string[];
      profileId: string;
      invited: boolean;
      employmentSaved: boolean;
    }
  /** Nothing was added: the form stays, with the reason (at a field when the function named one). */
  | { kind: 'not_added'; tone: 'error'; title: string; message: string; field: AddCrewField | null; retry: boolean }
  /** A 2xx STORM cannot read: it may or may not have been added (D-143). */
  | { kind: 'unconfirmed'; tone: 'warning'; title: string; message: string };

const stripStop = (s: string) => s.trim().replace(/[.\s]+$/, '');

/** "The employment details were not saved: <sentence>. Open the profile to add them." */
export function employmentNotSavedLine(onboarding: Exclude<OnboardingOutcome, { status: 'saved' }>): string {
  const why = onboarding.status === 'missing' ? ONBOARDING_MISSING_SENTENCE : stripStop(onboarding.message) || 'the server refused them';
  const lower = why.charAt(0).toLowerCase() + why.slice(1);
  return `The employment details were not saved: ${lower}. Open the profile to add them.`;
}

const FIELD_OF: Record<string, AddCrewField> = { email: 'email', firstName: 'firstName', lastName: 'lastName', role: 'role' };

/** The outcome of both steps, part by part (non-negotiable 9: never a success that did not happen). */
export function addCrewResult(create: CreateCrewOutcome, onboarding: OnboardingOutcome | null): AddCrewResult {
  if (create.kind === 'failed') {
    const { failure } = create;
    const named = typeof failure.details.field === 'string' ? FIELD_OF[failure.details.field] ?? null : null;
    const field: AddCrewField | null =
      named ?? (failure.reason === 'placeholder_email' || (failure.code === 'conflict' && !failure.reason) ? 'email' : null);
    const retry = failure.code === 'network' || failure.code === 'internal_error' || failure.code === 'status_unavailable' || failure.code === 'unexpected_response';
    return { kind: 'not_added', tone: 'error', title: 'The crew member was not added', message: failure.message, field, retry };
  }
  if (create.kind === 'unconfirmed') {
    return {
      kind: 'unconfirmed',
      tone: 'warning',
      title: 'STORM could not confirm this',
      message: 'The server did not say whether the crew member was added. Check the crew list before adding them again.',
    };
  }

  const profileId = create.profileId;
  let invited = false;
  let inviteLine: string;
  let vesselLine: string | null = null;
  let warn = false;
  if (create.kind === 'created') {
    invited = create.invited === 'sent';
    inviteLine = invited
      ? `STORM emailed them an invitation.${create.stored ? '' : ` ${NOT_STORED_NOTE}`}`
      : 'No invitation was sent. Invite them from the crew list or Users & Access when they are ready to join.';
    if (create.assignment === 'pending_login') vesselLine = 'They show as Pending login on the crew list until they accept an invitation.';
  } else if (create.kind === 'created_invite_failed') {
    warn = true;
    inviteLine = create.emailError
      ? `The invitation email could not be sent: ${stripStop(emailErrorMessage(create.emailError))}. Send it again from Users & Access.`
      : 'The invitation was not sent. Send it from Users & Access.';
    if (create.assignmentFailed) vesselLine = 'The vessel assignment was not saved either. Assign the vessel from the crew list.';
  } else {
    warn = true;
    invited = create.invited === 'sent';
    inviteLine = invited ? 'STORM emailed them an invitation.' : 'No invitation was sent.';
    vesselLine = 'The vessel assignment could not be saved. Assign the vessel from the crew list.';
  }

  if (!profileId) {
    // An honest partial answer without the new profile's id: nothing more can be saved here.
    return {
      kind: 'added',
      tone: 'warning',
      title: invited ? 'Added and invited' : 'Added, not invited',
      lines: ['The employment details were not saved: STORM did not get the new profile back. Find them on the crew list to add them.', inviteLine, ...(vesselLine ? [vesselLine] : [])],
      profileId: '',
      invited,
      employmentSaved: false,
    };
  }

  const employmentSaved = onboarding?.status === 'saved';
  const lines: string[] = [];
  if (onboarding && onboarding.status !== 'saved') lines.push(employmentNotSavedLine(onboarding));
  else if (employmentSaved) lines.push('Their employment details are saved.');
  lines.push(inviteLine);
  if (vesselLine) lines.push(vesselLine);
  const title = onboarding && onboarding.status !== 'saved' ? 'Added' : invited ? 'Added and invited' : 'Added, not invited';
  return {
    kind: 'added',
    tone: warn || (onboarding !== null && !employmentSaved) ? 'warning' : 'success',
    title,
    lines,
    profileId,
    invited,
    employmentSaved,
  };
}

/** A re-hire saves the terms only (the person exists): the outcome of that one step. */
export function rehireResult(onboarding: OnboardingOutcome, profileId: string): AddCrewResult {
  if (onboarding.status === 'saved') {
    return {
      kind: 'added',
      tone: 'success',
      title: 'Employment saved',
      lines: ['Their new employment details on this vessel are saved.'],
      profileId,
      invited: false,
      employmentSaved: true,
    };
  }
  const why = onboarding.status === 'missing' ? ONBOARDING_MISSING_SENTENCE : stripStop(onboarding.message);
  return {
    kind: 'not_added',
    tone: 'error',
    title: 'The employment details were not saved',
    message: `${why.charAt(0).toUpperCase()}${why.slice(1)}.`,
    field: null,
    retry: onboarding.status === 'failed',
  };
}
