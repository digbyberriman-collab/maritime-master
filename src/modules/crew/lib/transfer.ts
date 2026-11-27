/**
 * Controlled transfer between vessels (X1-11; gap/04 C58, W9; DECISIONS
 * D-207, D-198, D-225, D-246, D-X1-12). Pure: no imports with code, so the
 * SQL test loads this file through scripts/db/lib/load-ts.mjs and compares
 * nextTransferStatus() with its SQL mirror crew_transfer_next() in
 * 20261124061100_crew_transfers_employment.sql for every status, action and
 * fact.
 *
 * A transfer moves Draft (the details: destination, position, dates) ->
 * Review (the pre-transfer review: destination requirement gaps, medical
 * flags, the last appraisal, hours-of-rest breaches and the rest gap, open
 * familiarisation and training; every item ticked, none blocking) ->
 * Pending approval (only when either vessel asks for fleet approval,
 * vessel_crew_settings.transfer_requires_fleet_approval, D-X1-12) ->
 * Scheduled -> Completed (the one completion definer transfer_crew, from
 * the sign-off date; the daily sweep completes it on the sign-on date).
 * Cancelled from any state before Completed; a declined approval cancels
 * the transfer with the reason.
 */

export const TRANSFER_STATUSES = ['draft', 'review', 'pending_approval', 'scheduled', 'completed', 'cancelled'] as const;
export type TransferStatus = (typeof TRANSFER_STATUSES)[number];

export const TRANSFER_ACTIONS = ['review', 'acknowledge', 'submit', 'approve', 'decline', 'cancel', 'complete'] as const;
export type TransferAction = (typeof TRANSFER_ACTIONS)[number];

/** Why a step is not possible from the transfer's state (a 22023 refusal of the definers). */
export type TransferStepRefusal = 'illegal_transition' | 'acknowledgements_missing' | 'transfer_not_due' | 'unknown_action';

/** The limits the definers apply, shared with lib/transferSchema.ts. */
export const TRANSFER_LIMITS = {
  /** The sign-off date may be at most this many days ago (a transfer recorded late). */
  signOffPastDays: 31,
  /** The sign-off date may be at most this many days ahead. */
  signOffFutureDays: 365,
  /** Sign on within this many days of signing off. */
  maxGapDays: 90,
  notesMax: 2000,
  reasonMax: 2000,
  ackNoteMax: 500,
} as const;

export const isTransferStatus = (value: unknown): value is TransferStatus =>
  typeof value === 'string' && (TRANSFER_STATUSES as readonly string[]).includes(value);

export const isTransferAction = (value: unknown): value is TransferAction =>
  typeof value === 'string' && (TRANSFER_ACTIONS as readonly string[]).includes(value);

/** Still moving: not completed and not cancelled. */
export const isOpenTransfer = (status: TransferStatus): boolean => status !== 'completed' && status !== 'cancelled';

/**
 * The state a step leads to, or why it cannot be taken
 * (crew_transfer_next):
 * - review: Draft or Review -> Review (the review is computed again);
 * - acknowledge: Review -> Review;
 * - submit: Review -> Pending approval when approval is required, else
 *   Scheduled; every review item must be acknowledged first;
 * - approve: Pending approval -> Scheduled; decline: Pending approval ->
 *   Cancelled;
 * - cancel: any open state -> Cancelled;
 * - complete: Scheduled -> Completed, from the sign-off date (due).
 */
export function nextTransferStatus(
  status: TransferStatus | string | null,
  action: TransferAction | string | null,
  requiresApproval: boolean | null,
  acknowledged: boolean | null,
  due: boolean | null,
): TransferStatus | TransferStepRefusal {
  switch (action) {
    case 'review':
      return status === 'draft' || status === 'review' ? 'review' : 'illegal_transition';
    case 'acknowledge':
      return status === 'review' ? 'review' : 'illegal_transition';
    case 'submit':
      if (status !== 'review') return 'illegal_transition';
      if (acknowledged !== true) return 'acknowledgements_missing';
      return requiresApproval === true ? 'pending_approval' : 'scheduled';
    case 'approve':
      return status === 'pending_approval' ? 'scheduled' : 'illegal_transition';
    case 'decline':
      return status === 'pending_approval' ? 'cancelled' : 'illegal_transition';
    case 'cancel':
      return status === 'draft' || status === 'review' || status === 'pending_approval' || status === 'scheduled'
        ? 'cancelled'
        : 'illegal_transition';
    case 'complete':
      if (status !== 'scheduled') return 'illegal_transition';
      return due === true ? 'completed' : 'transfer_not_due';
    default:
      return 'unknown_action';
  }
}

/** A step leads somewhere (not a refusal). */
export const isTransferStep = (outcome: TransferStatus | TransferStepRefusal): outcome is TransferStatus => isTransferStatus(outcome);

/** A cancellation needs a reason once the transfer was submitted (pending approval or scheduled). */
export const cancelReasonRequired = (status: TransferStatus): boolean => status === 'pending_approval' || status === 'scheduled';

/** Day arithmetic on date-only strings (UTC calendar days, no time zone). */
export function daysBetween(from: string, to: string): number {
  const a = Date.UTC(Number(from.slice(0, 4)), Number(from.slice(5, 7)) - 1, Number(from.slice(8, 10)));
  const b = Date.UTC(Number(to.slice(0, 4)), Number(to.slice(5, 7)) - 1, Number(to.slice(8, 10)));
  return Math.round((b - a) / 86_400_000);
}

export function addDays(day: string, n: number): string {
  const t = Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10))) + n * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

/** "27 Nov 2026" from a date-only string (no time zone shift). */
export function formatTransferDay(day: string | null | undefined): string {
  if (!day) return '';
  const [y, m, d] = day.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return day;
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Completion is possible from the sign-off date (transfer_crew); the sweep completes on the sign-on date. */
export const transferDue = (signOffDate: string, today: string): boolean => signOffDate <= today;

// ---------------------------------------------------------------- the wizard and the timeline

/** The wizard's three steps: the details, the review, and the transfer's status. */
export type TransferWizardStep = 'details' | 'review' | 'status';

/** Where the wizard opens for a transfer (none yet: the details). */
export function wizardStepFor(status: TransferStatus | null): TransferWizardStep {
  if (status === null || status === 'draft') return 'details';
  if (status === 'review') return 'review';
  return 'status';
}

export type TimelineStepKey = 'draft' | 'review' | 'pending_approval' | 'scheduled' | 'completed';
export type TimelineStepState = 'done' | 'current' | 'upcoming' | 'cancelled';

export interface TimelineStep {
  key: TimelineStepKey;
  label: string;
  state: TimelineStepState;
}

export const TIMELINE_LABELS: Record<TimelineStepKey, string> = {
  draft: 'Details',
  review: 'Review',
  pending_approval: 'Fleet approval',
  scheduled: 'Scheduled',
  completed: 'Completed',
};

/** What the transfer reached before it was cancelled (the latest stamp). */
export interface TransferProgress {
  status: TransferStatus;
  requiresApproval: boolean;
  /** Reviewed at least once (a review snapshot exists). */
  reviewed: boolean;
  submitted: boolean;
  approved: boolean;
}

/**
 * The steps of the status timeline (TransferStatusTimeline): Details,
 * Review, Fleet approval (only when it is required), Scheduled, Completed.
 * Steps before the current one are done; a cancelled transfer marks the
 * step it stopped at as cancelled and the later ones as upcoming.
 */
export function transferTimeline(progress: TransferProgress): TimelineStep[] {
  const keys: TimelineStepKey[] = ['draft', 'review'];
  if (progress.requiresApproval) keys.push('pending_approval');
  keys.push('scheduled', 'completed');
  let reached: TimelineStepKey;
  if (progress.status === 'cancelled') {
    reached = progress.approved ? 'scheduled' : progress.submitted ? (progress.requiresApproval ? 'pending_approval' : 'scheduled') : progress.reviewed ? 'review' : 'draft';
  } else {
    reached = progress.status;
  }
  const at = keys.indexOf(reached);
  return keys.map((key, i) => {
    let state: TimelineStepState;
    if (i < at) state = 'done';
    else if (i > at) state = 'upcoming';
    else if (progress.status === 'cancelled') state = 'cancelled';
    else if (progress.status === 'completed') state = 'done';
    else state = 'current';
    return { key, label: TIMELINE_LABELS[key], state };
  });
}

// ---------------------------------------------------------------- the review items

export const REVIEW_ITEM_KINDS = ['requirement', 'familiarisation_required', 'medical', 'appraisal', 'hours_of_rest', 'rest_gap', 'familiarisation', 'training'] as const;
export type ReviewItemKind = (typeof REVIEW_ITEM_KINDS)[number];
export type ReviewItemSeverity = 'danger' | 'warning' | 'info';

export interface ReviewItem {
  key: string;
  kind: ReviewItemKind;
  severity: ReviewItemSeverity;
  title: string;
  detail: string;
  /** md5 of the title and detail: an acknowledgement holds only while the item reads the same. */
  fingerprint: string;
}

export interface ReviewAcknowledgement {
  key: string;
  note: string | null;
}

/** Every review item has an acknowledgement (submit needs it; none blocks by default). */
export function allAcknowledged(items: readonly Pick<ReviewItem, 'key'>[], acks: readonly Pick<ReviewAcknowledgement, 'key'>[]): boolean {
  const ticked = new Set(acks.map((a) => a.key));
  return items.every((item) => ticked.has(item.key));
}

const SEVERITY_ORDER: Record<ReviewItemSeverity, number> = { danger: 0, warning: 1, info: 2 };

/** Review items, worst first, then in the server's order. */
export function sortReviewItems<T extends Pick<ReviewItem, 'severity'>>(items: readonly T[]): T[] {
  return items
    .map((item, i) => ({ item, i }))
    .sort((a, b) => SEVERITY_ORDER[a.item.severity] - SEVERITY_ORDER[b.item.severity] || a.i - b.i)
    .map((x) => x.item);
}

export function reviewCounts(items: readonly Pick<ReviewItem, 'severity'>[]): Record<ReviewItemSeverity, number> {
  const counts: Record<ReviewItemSeverity, number> = { danger: 0, warning: 0, info: 0 };
  for (const item of items) counts[item.severity] += 1;
  return counts;
}

// ---------------------------------------------------------------- what the viewer may do

export interface TransferRights {
  /** Change the details, run the review, tick and submit (crew_assignments.assign on both vessels). */
  canEdit: boolean;
  canSubmit: boolean;
  /** Approve or decline (crew_assignments.approve with fleet reach; not the submitter). */
  canDecide: boolean;
  canCancel: boolean;
  /** Complete now (scheduled, from the sign-off date). */
  canComplete: boolean;
}

export const NO_TRANSFER_RIGHTS: TransferRights = { canEdit: false, canSubmit: false, canDecide: false, canCancel: false, canComplete: false };

/** The words a status reads in, for notices outside the status pill. */
export const TRANSFER_STATUS_SENTENCE: Record<TransferStatus, string> = {
  draft: 'The details are saved; the review comes next.',
  review: 'Waiting for the review to be acknowledged and submitted.',
  pending_approval: 'Waiting for fleet approval.',
  scheduled: 'Scheduled. It completes on the sign-on date, or earlier from the sign-off date.',
  completed: 'Completed. The person is on the new vessel’s crew.',
  cancelled: 'Cancelled.',
};

// ---------------------------------------------------------------- the server's answers (jsonb), read strictly

export interface TransferVesselRef {
  id: string;
  name: string;
  code: string | null;
}

export interface TransferPositionRef {
  id: string;
  name: string;
}

export interface TransferAcknowledgementRow {
  key: string;
  fingerprint: string | null;
  note: string | null;
  at: string | null;
}

export interface TransferReview {
  generatedAt: string | null;
  items: ReviewItem[];
}

/** A transfer as transfer_crew_detail and every step answer it (crew_transfer_json). */
export interface Transfer {
  id: string;
  status: TransferStatus;
  profileId: string;
  userId: string | null;
  personName: string;
  fromVessel: TransferVesselRef;
  toVessel: TransferVesselRef;
  fromPosition: TransferPositionRef | null;
  toPosition: TransferPositionRef | null;
  sameRole: boolean;
  signOffDate: string;
  signOnDate: string;
  requiresApproval: boolean;
  review: TransferReview | null;
  acknowledgements: TransferAcknowledgementRow[];
  acknowledged: boolean;
  notes: string | null;
  createdAt: string | null;
  createdByName: string | null;
  submittedAt: string | null;
  submittedByName: string | null;
  approvedAt: string | null;
  approvedByName: string | null;
  declineReason: string | null;
  cancelledAt: string | null;
  cancelledByName: string | null;
  cancelledReason: string | null;
  completedAt: string | null;
  compliantOnDestinationAt: string | null;
  rights: TransferRights;
  /** Why an approver may not decide (they submitted it). */
  decideBlock: 'own_submission' | null;
}

export interface TransferDestinationPosition {
  id: string;
  key: string;
  name: string;
  departmentKey: string | null;
  departmentLabel: string | null;
  rankTier: string | null;
}

export interface TransferDestination {
  vesselId: string;
  name: string;
  code: string | null;
  requiresApproval: boolean;
  positions: TransferDestinationPosition[];
  /** The origin title's position as this vessel sees it (null: a position must be chosen). */
  samePositionId: string | null;
}

export type TransferBlockCode = 'pending_placement_not_transferable' | 'not_on_vessel' | 'out_of_reach' | 'manages_admins_required' | 'unknown';

export interface TransferOptions {
  person: { profileId: string; userId: string | null; displayName: string };
  from: {
    vesselId: string;
    vesselName: string | null;
    assignmentId: string | null;
    positionText: string | null;
    positionId: string | null;
    positionKey: string | null;
    joinDate: string | null;
    isMasterOffice: boolean;
  };
  destinations: TransferDestination[];
  openTransfer: Transfer | null;
  blocked: { code: TransferBlockCode; message: string } | null;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
const bool = (v: unknown): boolean => v === true;
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const dayOf = (v: unknown): string | null => {
  const s = str(v);
  return s && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
};

/** "Preferred (else first) Last", as the server names people. */
export function personNameOf(value: unknown): string {
  if (!isObj(value)) return 'Crew member';
  const given = (str(value.preferred_name) ?? '').trim() || (str(value.first_name) ?? '').trim();
  return [given, (str(value.last_name) ?? '').trim()].filter(Boolean).join(' ') || 'Crew member';
}

function vesselRef(value: unknown): TransferVesselRef | null {
  if (!isObj(value)) return null;
  const id = str(value.id);
  if (!id) return null;
  return { id, name: str(value.name) ?? 'Vessel', code: str(value.code) };
}

function positionRef(value: unknown): TransferPositionRef | null {
  if (!isObj(value)) return null;
  const id = str(value.id);
  return id ? { id, name: str(value.name) ?? 'Position' } : null;
}

const SEVERITIES: readonly ReviewItemSeverity[] = ['danger', 'warning', 'info'];

export function parseReviewItem(value: unknown): ReviewItem | null {
  if (!isObj(value)) return null;
  const key = str(value.key);
  const kind = str(value.kind);
  const severity = str(value.severity);
  const title = str(value.title);
  if (!key || !title || !kind || !(REVIEW_ITEM_KINDS as readonly string[]).includes(kind) || !severity || !(SEVERITIES as readonly string[]).includes(severity)) return null;
  return {
    key,
    kind: kind as ReviewItemKind,
    severity: severity as ReviewItemSeverity,
    title,
    detail: str(value.detail) ?? '',
    fingerprint: str(value.fingerprint) ?? '',
  };
}

/** A transfer from its jsonb answer; null when it cannot be read (the caller treats that as an error, never as data). */
export function parseTransfer(value: unknown): Transfer | null {
  if (!isObj(value)) return null;
  const id = str(value.id);
  const status = value.status;
  const profileId = str(value.profile_id);
  const fromVessel = vesselRef(value.from_vessel);
  const toVessel = vesselRef(value.to_vessel);
  const signOffDate = dayOf(value.sign_off_date);
  const signOnDate = dayOf(value.sign_on_date);
  if (!id || !isTransferStatus(status) || !profileId || !fromVessel || !toVessel || !signOffDate || !signOnDate) return null;
  const rights = isObj(value.rights) ? value.rights : {};
  const review = isObj(value.review)
    ? {
        generatedAt: str(value.review.generated_at),
        items: list(value.review.items).map(parseReviewItem).filter((x): x is ReviewItem => x !== null),
      }
    : null;
  return {
    id,
    status,
    profileId,
    userId: str(value.user_id),
    personName: personNameOf(value.person),
    fromVessel,
    toVessel,
    fromPosition: positionRef(value.from_position),
    toPosition: positionRef(value.to_position),
    sameRole: bool(value.same_role),
    signOffDate,
    signOnDate,
    requiresApproval: bool(value.requires_approval),
    review,
    acknowledgements: list(value.acknowledgements)
      .filter(isObj)
      .map((a) => ({ key: str(a.key) ?? '', fingerprint: str(a.fingerprint), note: str(a.note), at: str(a.at) }))
      .filter((a) => a.key !== ''),
    acknowledged: bool(value.acknowledged),
    notes: str(value.notes),
    createdAt: str(value.created_at),
    createdByName: str(value.created_by_name),
    submittedAt: str(value.submitted_at),
    submittedByName: str(value.submitted_by_name),
    approvedAt: str(value.approved_at),
    approvedByName: str(value.approved_by_name),
    declineReason: str(value.decline_reason),
    cancelledAt: str(value.cancelled_at),
    cancelledByName: str(value.cancelled_by_name),
    cancelledReason: str(value.cancelled_reason),
    completedAt: str(value.completed_at),
    compliantOnDestinationAt: str(value.compliant_on_destination_at),
    rights: {
      canEdit: bool(rights.can_edit),
      canSubmit: bool(rights.can_submit),
      canDecide: bool(rights.can_decide),
      canCancel: bool(rights.can_cancel),
      canComplete: bool(rights.can_complete),
    },
    decideBlock: rights.decide_block === 'own_submission' ? 'own_submission' : null,
  };
}

/** A person's transfers (crew_transfers_for_profile): an array; unreadable rows are dropped. */
export function parseTransferList(value: unknown): Transfer[] {
  return list(value).map(parseTransfer).filter((t): t is Transfer => t !== null);
}

const BLOCK_CODES: readonly TransferBlockCode[] = ['pending_placement_not_transferable', 'not_on_vessel', 'out_of_reach', 'manages_admins_required'];

/** The wizard's options (transfer_crew_options); null when it cannot be read. */
export function parseTransferOptions(value: unknown): TransferOptions | null {
  if (!isObj(value) || !isObj(value.person) || !isObj(value.from)) return null;
  const profileId = str(value.person.profile_id);
  const vesselId = str(value.from.vessel_id);
  if (!profileId || !vesselId) return null;
  const destinations: TransferDestination[] = list(value.destinations)
    .filter(isObj)
    .map((d) => ({
      vesselId: str(d.vessel_id) ?? '',
      name: str(d.name) ?? 'Vessel',
      code: str(d.code),
      requiresApproval: bool(d.requires_approval),
      samePositionId: str(d.same_position_id),
      positions: list(d.positions)
        .filter(isObj)
        .map((p) => ({
          id: str(p.id) ?? '',
          key: str(p.key) ?? '',
          name: str(p.name) ?? '',
          departmentKey: str(p.department_key),
          departmentLabel: str(p.department_label),
          rankTier: str(p.rank_tier),
        }))
        .filter((p) => p.id !== '' && p.name !== ''),
    }))
    .filter((d) => d.vesselId !== '');
  let blocked: TransferOptions['blocked'] = null;
  if (isObj(value.blocked)) {
    const code = str(value.blocked.code);
    blocked = {
      code: code && (BLOCK_CODES as readonly string[]).includes(code) ? (code as TransferBlockCode) : 'unknown',
      message: str(value.blocked.message) ?? 'This person cannot be transferred from here.',
    };
  }
  return {
    person: { profileId, userId: str(value.person.user_id), displayName: personNameOf(value.person) },
    from: {
      vesselId,
      vesselName: str(value.from.vessel_name),
      assignmentId: str(value.from.assignment_id),
      positionText: str(value.from.position_text),
      positionId: str(value.from.position_id),
      positionKey: str(value.from.position_key),
      joinDate: dayOf(value.from.join_date),
      isMasterOffice: bool(value.from.is_master_office),
    },
    destinations,
    openTransfer: value.open_transfer === null || value.open_transfer === undefined ? null : parseTransfer(value.open_transfer),
    blocked,
  };
}

/** The timeline's input from a transfer. */
export function transferProgressOf(t: Pick<Transfer, 'status' | 'requiresApproval' | 'review' | 'submittedAt' | 'approvedAt'>): TransferProgress {
  return {
    status: t.status,
    requiresApproval: t.requiresApproval,
    reviewed: t.review !== null,
    submitted: t.submittedAt !== null,
    approved: t.approvedAt !== null,
  };
}

/** Acknowledgements that still hold for the review (same key and fingerprint), as the server keeps them. */
export function liveAcknowledgements(review: TransferReview | null, acks: readonly TransferAcknowledgementRow[]): Map<string, TransferAcknowledgementRow> {
  const out = new Map<string, TransferAcknowledgementRow>();
  if (!review) return out;
  const prints = new Map(review.items.map((i) => [i.key, i.fingerprint]));
  for (const a of acks) {
    if (prints.has(a.key) && (a.fingerprint === null || a.fingerprint === prints.get(a.key))) out.set(a.key, a);
  }
  return out;
}
