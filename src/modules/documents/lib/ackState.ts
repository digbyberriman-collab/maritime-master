/**
 * The fleet document acknowledgement rule (gap/02 W1; D-X5-04; X5 spec
 * X5-05A), pure. The server computes it in one place,
 * `fleet_document_ack_rows()` (`20261124040400_fleet_documents_acknowledgements.sql`,
 * through the pure `fleet_document_ack_state` / `_ack_blocked_reason` /
 * `_ack_due_at`); this file is its mirror, so the client explains a state
 * the same way the server decided it. The SQL test copies the state and
 * blocked-reason tables between its ack-state-table / ack-blocked-table
 * markers and src/test/documents/ackState.test.ts pins both copies.
 *
 * - One state per person x published version x targeted vessel, first
 *   match wins: not_required (the document is not published, or the person
 *   is no longer on the vessel's crew: history), acknowledged, blocked
 *   (no_login, then suspended, then not_in_signer_set), overdue (now is
 *   past due), pending.
 * - Due: the later of the version's publication and the person's join date
 *   on the vessel (00:00 UTC that day), plus the document's days, counted
 *   in UTC days. A planned joiner is pending from publication and due from
 *   the join date.
 *
 * Also the words the pages show for a state, a due date and a definer's
 * refusal. No account, vessel or person data lives here.
 */
import type {
  FleetDocumentAckBlockedReason,
  FleetDocumentAckMethod,
  FleetDocumentAckState,
} from '../types/db.pending';

export type AckState = FleetDocumentAckState;
export type AckBlockedReason = FleetDocumentAckBlockedReason;
export type AckMethod = FleetDocumentAckMethod;

export const ACK_STATES = ['pending', 'overdue', 'blocked', 'acknowledged', 'not_required'] as const satisfies readonly AckState[];
export const ACK_BLOCKED_REASONS = ['no_login', 'suspended', 'not_in_signer_set'] as const satisfies readonly AckBlockedReason[];
export const ACK_METHODS = ['self', 'witnessed', 'carried_forward'] as const satisfies readonly AckMethod[];

export const isAckState = (value: unknown): value is AckState => typeof value === 'string' && (ACK_STATES as readonly string[]).includes(value);
export const isAckBlockedReason = (value: unknown): value is AckBlockedReason =>
  typeof value === 'string' && (ACK_BLOCKED_REASONS as readonly string[]).includes(value);
export const isAckMethod = (value: unknown): value is AckMethod => typeof value === 'string' && (ACK_METHODS as readonly string[]).includes(value);

/** The states someone still has to act on. */
export const isOutstanding = (state: AckState | null | undefined): state is 'pending' | 'overdue' => state === 'pending' || state === 'overdue';

// ─── The rule ───────────────────────────────────────────────────────────

/** Why someone cannot sign, the first reason that applies; null when they can (`fleet_document_ack_blocked_reason`). */
export function ackBlockedReason(hasLogin: boolean, active: boolean, inSignerSet: boolean): AckBlockedReason | null {
  if (!hasLogin) return 'no_login';
  if (!active) return 'suspended';
  if (!inSignerSet) return 'not_in_signer_set';
  return null;
}

const DAY_MS = 86_400_000;
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

const toTime = (value: Date | string | null | undefined): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const time = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(time) ? time : null;
};

/** 00:00 UTC of a `yyyy-MM-dd` date; null when blank or not a calendar date. */
function utcStartOfDay(value: string | null | undefined): number | null {
  const match = value ? DATE_ONLY.exec(value) : null;
  if (!match) return null;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const time = Date.UTC(y, m - 1, d);
  const check = new Date(time);
  return check.getUTCFullYear() === y && check.getUTCMonth() === m - 1 && check.getUTCDate() === d ? time : null;
}

/**
 * When an acknowledgement falls due (`fleet_document_ack_due_at`): the later
 * of the version's publication and the join date (00:00 UTC), plus the days
 * in UTC days. Null without a publication time or a number of days.
 */
export function ackDueAt(publishedAt: Date | string | null | undefined, joinDate: string | null | undefined, dueDays: number | null | undefined): Date | null {
  const published = toTime(publishedAt);
  if (published === null || dueDays === null || dueDays === undefined || !Number.isFinite(dueDays)) return null;
  const joined = utcStartOfDay(joinDate);
  const from = joined === null ? published : Math.max(published, joined);
  return new Date(from + dueDays * DAY_MS);
}

export interface AckStateInput {
  /** The document's status (draft, published, withdrawn). */
  documentStatus: string;
  /** The person is on the vessel's current crew (false: history). */
  onCrew: boolean;
  acknowledged: boolean;
  hasLogin: boolean;
  /** The login is active (`user_is_active`). */
  active: boolean;
  inSignerSet: boolean;
  dueAt: Date | string | null;
  now: Date | string;
}

/** The state of one person x version x vessel (`fleet_document_ack_state`). */
export function ackState(input: AckStateInput): AckState {
  if (input.documentStatus !== 'published' || !input.onCrew) return 'not_required';
  if (input.acknowledged) return 'acknowledged';
  if (ackBlockedReason(input.hasLogin, input.active, input.inSignerSet) !== null) return 'blocked';
  const due = toTime(input.dueAt);
  const now = toTime(input.now);
  if (due !== null && now !== null && now > due) return 'overdue';
  return 'pending';
}

// ─── Words ──────────────────────────────────────────────────────────────

const UTC_DATE = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });

/**
 * A due date or an acknowledgement time as the day it falls on ("04 Dec
 * 2026", the library's date style), in UTC like the server's day
 * arithmetic, so the date shown is the day the rule counts. Null for a
 * missing or unreadable value.
 */
export function formatAckDate(value: Date | string | null | undefined): string | null {
  const time = toTime(value);
  return time === null ? null : UTC_DATE.format(time);
}

const utcDayNumber = (time: number) => Math.floor(time / DAY_MS);

/**
 * The due line for someone's own state: "Due 26 Nov 2026" (or "Due today",
 * "Due tomorrow"), "Overdue since 20 Nov 2026", "Acknowledged 3 Nov 2026";
 * null for the states without one.
 */
export function ackDueText(
  state: AckState | null | undefined,
  dueAt: Date | string | null | undefined,
  acknowledgedAt: Date | string | null | undefined,
  now: Date | string = new Date(),
): string | null {
  if (state === 'acknowledged') {
    const on = formatAckDate(acknowledgedAt);
    return on ? `Acknowledged ${on}` : 'Acknowledged';
  }
  if (!isOutstanding(state)) return null;
  const due = toTime(dueAt);
  const today = toTime(now);
  if (due === null) return state === 'overdue' ? 'Overdue' : null;
  const date = UTC_DATE.format(due);
  if (state === 'overdue') return `Overdue since ${date}`;
  if (today !== null) {
    const days = utcDayNumber(due) - utcDayNumber(today);
    if (days === 0) return 'Due today';
    if (days === 1) return 'Due tomorrow';
  }
  return `Due ${date}`;
}

/**
 * The same line, short, for beside the state pill (which already says the
 * state): "by 04 Dec 2026", "due today", "due tomorrow", "since 20 Nov
 * 2026", "on 03 Nov 2026"; null for the states without one.
 */
export function ackDueShort(
  state: AckState | null | undefined,
  dueAt: Date | string | null | undefined,
  acknowledgedAt: Date | string | null | undefined,
  now: Date | string = new Date(),
): string | null {
  if (state === 'acknowledged') {
    const on = formatAckDate(acknowledgedAt);
    return on ? `on ${on}` : null;
  }
  if (!isOutstanding(state)) return null;
  const due = toTime(dueAt);
  if (due === null) return null;
  const date = UTC_DATE.format(due);
  if (state === 'overdue') return `since ${date}`;
  const today = toTime(now);
  if (today !== null) {
    const days = utcDayNumber(due) - utcDayNumber(today);
    if (days === 0) return 'due today';
    if (days === 1) return 'due tomorrow';
  }
  return `by ${date}`;
}

/** Why the caller themselves cannot acknowledge (the vessel page and its card). */
const OWN_BLOCKED: Readonly<Record<AckBlockedReason, string>> = {
  no_login: 'You need an app login to acknowledge it yourself. Ask the Master or your head of department to record it on a shared device.',
  suspended: 'Your account is suspended, so you cannot acknowledge it. Ask your account admin.',
  not_in_signer_set: 'You are not on the list of people who sign for this vessel. Ask the Master if you think you should be.',
};

export function ownBlockedSentence(reason: AckBlockedReason | null | undefined): string {
  return reason ? OWN_BLOCKED[reason] : 'You cannot acknowledge this document right now.';
}

/** A short label for a blocked reason (the crew lists, X5-05B). */
export const ACK_BLOCKED_LABELS: Readonly<Record<AckBlockedReason, string>> = {
  no_login: 'No app login',
  suspended: 'Account suspended',
  not_in_signer_set: 'Not on the signer list',
};

/** How an acknowledgement was recorded, in words. */
export const ACK_METHOD_LABELS: Readonly<Record<AckMethod, string>> = {
  self: 'Acknowledged in the app',
  witnessed: 'Recorded on a shared device, with a witness',
  carried_forward: 'Carried forward from the previous version',
};

// ─── Refusals ───────────────────────────────────────────────────────────

const REFUSALS: Readonly<Record<string, string>> = {
  not_required: 'This version no longer needs your acknowledgement. The list has been refreshed.',
  already_acknowledged: 'You have already acknowledged this version.',
  blocked: 'You cannot acknowledge this document.',
  version_not_found: 'This version is no longer available. Refresh to see the current documents.',
  document_not_found: 'This document is no longer available. Refresh to see the current documents.',
  profile_not_found: 'That person is not on your company’s crew list.',
  vessel_out_of_reach: 'You no longer have access to this vessel.',
  not_permitted: 'You do not have permission to do this.',
  witness_is_subject: 'You cannot witness your own acknowledgement. Acknowledge it yourself instead.',
  vessel_required: 'Choose the vessel to remind.',
  not_published: 'Only a published document can be acknowledged or reminded about.',
  ack_not_required: 'This document does not need an acknowledgement.',
  vessel_archived: 'This vessel is archived.',
  invalid_rule: 'Choose who can sign.',
  positions_required: 'Choose at least one position.',
  too_many_positions: 'Choose up to 100 positions.',
  position_too_long: 'Position names can be up to 80 characters.',
  positions_not_expected: 'Positions only apply to the positions rule.',
  people_required: 'Choose at least one person.',
  too_many_people: 'Choose up to 500 people.',
  people_not_expected: 'People only apply to the named people rule.',
  type_not_found: 'That document type no longer exists. Refresh and try again.',
};

/** Every refusal code the acknowledgement definers raise. */
export const ACK_REFUSAL_CODES: readonly string[] = Object.keys(REFUSALS);

/**
 * The sentence for an acknowledgement definer's refusal (the message is
 * the code; `blocked` carries the reason in its detail), or null for an
 * unknown one.
 */
export function ackRefusal(message: string | null | undefined, detail?: string | null): string | null {
  if (!message || !Object.prototype.hasOwnProperty.call(REFUSALS, message)) return null;
  if (message === 'blocked' && isAckBlockedReason(detail)) return ownBlockedSentence(detail);
  return REFUSALS[message];
}
