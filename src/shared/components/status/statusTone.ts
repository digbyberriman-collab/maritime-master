/**
 * Status tone registry (gap/10 DS12, §A.8; gap/00 G3).
 *
 * `statusTone(domain, status)` is the single answer to "what colour is this
 * status?". Every module's local colour helper (`getStatusColor`,
 * `SUBMISSION_STATUS_COLORS`, …) moves onto it, so the same word means the
 * same thing everywhere:
 *
 *   ok       done, valid, compliant         signal   live / in progress
 *   info     waiting on the vessel          purple   waiting on the company
 *   warn     attention soon                 orange   attention now
 *   danger   failed / overdue / expired     neutral  inactive (draft, cancelled)
 *
 * Statuses are matched case-insensitively with spaces and hyphens folded to
 * `_`, so `'Under Investigation'`, `'under_investigation'` and
 * `'UNDER-INVESTIGATION'` are one key. An unknown domain or status resolves
 * to `neutral` with a readable label; nothing here throws.
 *
 * The vocabularies are the ones stored today (module constants, generated
 * types and gap docs) plus the ones Phase 3 wave 1 writes (X1 Crew, X5 Fleet
 * operations; landed together in platform-prep PP2 so neither stream edits
 * this shared file). A later stream that adds a status adds it here through
 * a platform step; `statusTone.test.ts` pins the meaning of each.
 */
import { isTone, type Tone } from '@/components/ui/tones';
import { EXPIRY_BUCKET_LABELS } from '@/lib/records/expiry';

export interface StatusEntry {
  tone: Tone;
  /** Sentence-case UI label. */
  label: string;
}

export interface StatusMeta extends StatusEntry {
  /** False when the domain or status is not in the registry (tone is then neutral). */
  known: boolean;
}

type Vocabulary = Readonly<Record<string, StatusEntry>>;

const vocab = (entries: Record<string, readonly [Tone, string]>): Vocabulary =>
  Object.freeze(
    Object.fromEntries(Object.entries(entries).map(([key, [tone, label]]) => [key, Object.freeze({ tone, label })])),
  );

/** Expiry buckets (DECISIONS C5; `@/lib/records` expiry engine). */
const EXPIRY = vocab({
  expired: ['danger', EXPIRY_BUCKET_LABELS.expired],
  expiring_soon: ['orange', EXPIRY_BUCKET_LABELS.expiring_soon],
  expiring: ['warn', EXPIRY_BUCKET_LABELS.expiring],
  valid: ['ok', EXPIRY_BUCKET_LABELS.valid],
  no_expiry: ['neutral', EXPIRY_BUCKET_LABELS.no_expiry],
});

export const STATUS_REGISTRY = {
  // ── Record engine (gap/08 envelope; `@/lib/records` ENVELOPE_STATUSES) ──
  envelope: vocab({
    open: ['info', 'Open'],
    in_review: ['signal', 'In review'],
    submitted: ['purple', 'Submitted to company'],
    acknowledged: ['signal', 'Acknowledged'],
    awaiting_company_close: ['purple', 'Awaiting company sign-off'],
    // The company has asked the vessel for more: the vessel's move (whoseMove.ts).
    info_requested: ['info', 'Further information required'],
    closed: ['ok', 'Closed'],
    void: ['neutral', 'Voided'],
  }),
  whose_move: vocab({
    vessel: ['info', 'Waiting on vessel'],
    company: ['purple', 'Waiting on company'],
    none: ['neutral', 'Closed'],
  }),
  expiry: EXPIRY,

  // ── Safety (incidents, ISM) ──
  incident: vocab({
    draft: ['neutral', 'Draft'],
    open: ['info', 'Open'],
    under_investigation: ['signal', 'Under investigation'],
    closed: ['ok', 'Closed'],
  }),
  /** Corrective / preventive actions: ISM CAPA register, incident CAPAs, audit CAPAs. */
  corrective_action: vocab({
    open: ['info', 'Open'],
    in_progress: ['signal', 'In progress'],
    verification: ['purple', 'Awaiting verification'],
    pending_verification: ['purple', 'Awaiting verification'],
    overdue: ['danger', 'Overdue'],
    closed: ['ok', 'Closed'],
    cancelled: ['neutral', 'Cancelled'],
  }),
  non_conformity: vocab({
    open: ['info', 'Open'],
    in_progress: ['signal', 'In progress'],
    verification: ['purple', 'Awaiting verification'],
    overdue: ['danger', 'Overdue'],
    closed: ['ok', 'Closed'],
  }),
  /** ISM form submissions (`SUBMISSION_STATUSES`). */
  form_submission: vocab({
    draft: ['neutral', 'Draft'],
    submitted: ['info', 'Submitted'],
    pending_signature: ['purple', 'Awaiting signature'],
    signed: ['ok', 'Signed'],
    rejected: ['danger', 'Rejected'],
    amended: ['signal', 'Amended'],
    archived: ['neutral', 'Archived'],
  }),
  risk_assessment: vocab({
    draft: ['neutral', 'Draft'],
    under_review: ['signal', 'Under review'],
    approved: ['ok', 'Approved'],
    active: ['signal', 'Active'],
    expired: ['danger', 'Expired'],
    archived: ['neutral', 'Archived'],
  }),
  permit: vocab({
    draft: ['neutral', 'Draft'],
    pending: ['info', 'Pending approval'],
    approved: ['ok', 'Approved'],
    active: ['signal', 'Active'],
    suspended: ['warn', 'Suspended'],
    completed: ['ok', 'Completed'],
    expired: ['danger', 'Expired'],
    cancelled: ['neutral', 'Cancelled'],
  }),

  // ── Audits ──
  audit: vocab({
    planned: ['info', 'Planned'],
    in_progress: ['signal', 'In progress'],
    completed: ['ok', 'Completed'],
    closed: ['ok', 'Closed'],
    cancelled: ['neutral', 'Cancelled'],
  }),
  audit_finding: vocab({
    open: ['info', 'Open'],
    capa_assigned: ['signal', 'CAPA assigned'],
    under_review: ['purple', 'Under review'],
    closed: ['ok', 'Closed'],
  }),
  /** Finding severity (`FINDING_TYPES`). */
  audit_finding_type: vocab({
    major_nc: ['danger', 'Major non-conformity'],
    minor_nc: ['orange', 'Minor non-conformity'],
    observation: ['info', 'Observation'],
  }),

  // ── Training ──
  /** Training records (`TRAINING_STATUSES`; "Expiring soon" is the 90-day window). */
  training: vocab({
    valid: ['ok', 'Valid'],
    expiring_soon: ['warn', 'Expiring soon'],
    expired: ['danger', 'Expired'],
    suspended: ['neutral', 'Suspended'],
  }),
  /**
   * Familiarisation records (gap/04 W11): Open → In progress → Awaiting
   * signatures → Completed; Overdue is a computed flag. Signatures are the
   * crew member's and the supervisor's, both on board, so the wait is the
   * vessel's (info). `not_started` stays for legacy rows.
   */
  familiarization: vocab({
    not_started: ['neutral', 'Not started'],
    open: ['info', 'Open'],
    in_progress: ['signal', 'In progress'],
    awaiting_signatures: ['info', 'Awaiting signatures'],
    completed: ['ok', 'Completed'],
    overdue: ['danger', 'Overdue'],
  }),
  /** Training / development applications (HoD → Purser → Captain chain). */
  training_application: vocab({
    draft: ['neutral', 'Draft'],
    submitted: ['info', 'Submitted'],
    pending_approval: ['info', 'Pending approval'],
    hod_review: ['signal', 'HoD review'],
    purser_review: ['signal', 'Purser review'],
    captain_review: ['signal', 'Captain review'],
    captain_purser_review: ['signal', 'Captain & purser review'],
    approved: ['ok', 'Approved'],
    discretionary_approved: ['ok', 'Approved (discretionary)'],
    enrolled: ['signal', 'Enrolled'],
    completed: ['ok', 'Completed'],
    returned: ['warn', 'Returned for changes'],
    declined: ['danger', 'Declined'],
    cancelled: ['neutral', 'Cancelled'],
    // Terminal states of the application workflow (gap/02 W3; X5 PR-06).
    rejected: ['danger', 'Rejected'],
    voided: ['neutral', 'Voided'],
    reimbursed: ['ok', 'Reimbursed'],
    closed: ['neutral', 'Closed'],
  }),

  // ── Hours of work and rest ──
  work_rest_submission: vocab({
    draft: ['neutral', 'Draft'],
    submitted: ['info', 'Submitted'],
    crew_signed: ['info', 'Signed by crew'],
    hod_reviewed: ['signal', 'Reviewed by HoD'],
    hod_signed: ['signal', 'Signed by HoD'],
    captain_reviewed: ['signal', 'Reviewed by Master'],
    // X1 month approval (gap/04 W6); the legacy review states above stay for old rows.
    approved: ['ok', 'Approved'],
    locked: ['ok', 'Locked'],
    reopened: ['warn', 'Reopened'],
  }),
  /** Rest-hour non-conformities (breaches). */
  work_rest_nc: vocab({
    open: ['danger', 'Open breach'],
    reviewed: ['signal', 'Reviewed'],
    justified: ['info', 'Justified'],
    corrected: ['ok', 'Corrected'],
    accepted_by_captain: ['ok', 'Accepted by Master'],
    dismissed: ['neutral', 'Dismissed'],
    // X1 breach review (gap/04 W6): accepted with a justification, sent back
    // to the crew member to correct the record (reopened, like `returned`),
    // or included in a sent breach report (the last step).
    accepted: ['ok', 'Accepted'],
    correction_requested: ['warn', 'Correction requested'],
    reported: ['ok', 'Reported'],
  }),
  work_rest_compliance: vocab({
    compliant: ['ok', 'Compliant'],
    warning: ['warn', 'Near limit'],
    non_compliant: ['danger', 'Non-compliant'],
    breach: ['danger', 'Breach'],
    no_data: ['neutral', 'No data'],
  }),

  // ── Certificates and documents ──
  /**
   * Controlled documents (`documents.status`, `DOCUMENT_STATUSES`). Obsolete
   * is withdrawn from use: inactive (neutral), like a superseded certificate.
   */
  document: vocab({
    draft: ['neutral', 'Draft'],
    under_review: ['signal', 'Under review'],
    approved: ['ok', 'Approved'],
    obsolete: ['neutral', 'Obsolete'],
  }),
  /**
   * Stored certificate statuses (`CERTIFICATE_STATUS`). Legacy rows say
   * `Expiring_Soon` for "inside the alert window" (90 days by default), which
   * is C5's `expiring`, so it reads as warn "Expiring soon" here. New code
   * shows buckets with `<ExpiryPill>` (domain `expiry`), where
   * `expiring_soon` is the ≤ 30 day tier.
   */
  certificate: vocab({
    valid: ['ok', 'Valid'],
    expiring: ['warn', 'Due ≤ window'],
    expiring_soon: ['warn', 'Expiring soon'],
    expired: ['danger', 'Expired'],
    no_expiry: ['neutral', 'No expiry'],
    pending_renewal: ['info', 'Pending renewal'],
    suspended: ['danger', 'Suspended'],
    superseded: ['neutral', 'Superseded'],
  }),
  crew_document: vocab({
    valid: ['ok', 'Valid'],
    expiring: ['warn', 'Due ≤ window'],
    expiring_soon: ['warn', 'Expiring soon'],
    expired: ['danger', 'Expired'],
    no_expiry: ['neutral', 'No expiry'],
    pending: ['info', 'Pending verification'],
    extracted: ['warn', 'Needs confirming'],
    verified: ['ok', 'Verified'],
    approved: ['ok', 'Verified'],
    rejected: ['danger', 'Rejected'],
  }),
  /**
   * Verification of a crew document (gap/04 W4, X1). Conditionally approved
   * satisfies a requirement but shows amber; rejected never satisfies.
   */
  crew_document_verification: vocab({
    unverified: ['info', 'Not yet verified'],
    verified: ['ok', 'Verified'],
    conditionally_approved: ['warn', 'Conditionally approved'],
    rejected: ['danger', 'Rejected'],
  }),
  /**
   * The non-bucket states of a crew document (X1). The expiry bucket itself
   * renders through `<ExpiryPill>` (domain `expiry`), never here.
   */
  crew_document_state: vocab({
    missing_date: ['warn', 'Expiry date missing'],
    not_uploaded: ['warn', 'No file attached'],
    alerts_off: ['neutral', 'Alerts off'],
    endorsement_due: ['warn', 'Endorsement due'],
    endorsement_overdue: ['danger', 'Endorsement overdue'],
  }),

  // ── Crew ──
  crew: vocab({
    active: ['ok', 'Active'],
    on_leave: ['info', 'On leave'],
    pending: ['warn', 'Pending'],
    invited: ['info', 'Invited'],
    inactive: ['neutral', 'Inactive'],
  }),
  crew_account: vocab({
    active: ['ok', 'Active'],
    invited: ['info', 'Invited'],
    not_invited: ['neutral', 'Not invited'],
    disabled: ['danger', 'Disabled'],
    /** Users & Access: no login in use yet (invited or not); the invitation column says which. */
    not_joined: ['neutral', 'Not joined'],
  }),
  /**
   * A crew member's status on a vessel on a day (gap/04 W2; X1
   * `crew_status_decide`, first match wins: on_transfer > pending > on_leave
   * > ashore > on_board).
   * `pending_login` is the login state of a person added without a sign-in
   * (D-199): inactive, like `crew_account.not_joined`, never a warning.
   */
  crew_status: vocab({
    on_board: ['ok', 'On board'],
    ashore: ['neutral', 'Ashore'],
    on_leave: ['info', 'On leave'],
    pending: ['info', 'Pending'],
    on_transfer: ['signal', 'On transfer'],
    pending_login: ['neutral', 'Pending login'],
  }),
  /**
   * One requirement row for one person (gap/04 W5). Severity reads
   * expired (danger) > missing (orange, attention now) > expiring (warn).
   */
  crew_requirement: vocab({
    met: ['ok', 'Met'],
    expiring: ['warn', 'Expiring'],
    expired: ['danger', 'Expired'],
    missing: ['orange', 'Missing'],
  }),
  /** A person's compliance summary (gap/04 W5 §4): the worst of their rows. */
  crew_compliance: vocab({
    complete: ['ok', 'Complete'],
    expiring: ['warn', 'Expiring'],
    missing: ['orange', 'Missing'],
    expired: ['danger', 'Expired'],
  }),
  /**
   * A day on the hours-of-rest month (X1 `lib/horDay.ts`). `breach` and
   * `warning` are overlays and use the `work_rest_compliance` meanings.
   */
  hor_day: vocab({
    not_expected: ['neutral', 'Not expected'],
    not_entered: ['warn', 'Not entered'],
    entered: ['signal', 'Entered'],
    submitted: ['info', 'Submitted'],
    approved: ['ok', 'Approved'],
    leave: ['neutral', 'Leave'],
    breach: ['danger', 'Breach'],
    warning: ['warn', 'Near limit'],
  }),
  /**
   * The On board total of a manning day (gap/04 C48, `vessel_manning_by_day`):
   * qualified below the minimum is critical; at the minimum, one departure
   * away; above the maximum is a planning note, not a fault.
   */
  manning_band: vocab({
    critical: ['danger', 'Below minimum'],
    at_minimum: ['warn', 'At minimum'],
    normal: ['ok', 'Within range'],
    overmanned: ['info', 'Above maximum'],
  }),
  /** Leave requests (X1 planner): the approver is on board or in the HR office. */
  leave_request: vocab({
    pending: ['info', 'Awaiting decision'],
    approved: ['ok', 'Approved'],
    declined: ['danger', 'Declined'],
    cancelled: ['neutral', 'Cancelled'],
  }),
  /**
   * Crew transfers (gap/04 W9): Draft → Review → Pending approval (only when
   * the vessel needs fleet approval, so the wait is the company's) →
   * Scheduled → Completed; Cancelled from any state before Completed.
   */
  crew_transfer: vocab({
    draft: ['neutral', 'Draft'],
    review: ['info', 'Checking gaps'],
    pending_approval: ['purple', 'Awaiting fleet approval'],
    scheduled: ['signal', 'Scheduled'],
    completed: ['ok', 'Completed'],
    cancelled: ['neutral', 'Cancelled'],
  }),

  // ── Fleet documents, forms and medical (X5) ──
  /** Fleet documents (gap/02 W1; D-X5-03): published to vessels, replaced by a new version, or withdrawn. */
  fleet_document: vocab({
    draft: ['neutral', 'Draft'],
    published: ['ok', 'Published'],
    superseded: ['neutral', 'Superseded'],
    withdrawn: ['neutral', 'Withdrawn'],
  }),
  /** One person's acknowledgement of a fleet document version (X5 `fleet_document_ack_rows`). */
  document_ack: vocab({
    pending: ['info', 'To acknowledge'],
    overdue: ['danger', 'Overdue'],
    blocked: ['warn', 'Unable to acknowledge'],
    acknowledged: ['ok', 'Acknowledged'],
    not_required: ['neutral', 'Not required'],
  }),
  /**
   * Form templates (`form_templates.status`, stored upper case: DRAFT,
   * PUBLISHED, SUPERSEDED, ARCHIVED; matching folds case). `hidden` is the
   * per-vessel setting (`form_template_vessel_settings`), not a stored status.
   */
  form_template: vocab({
    draft: ['neutral', 'Draft'],
    published: ['ok', 'Published'],
    superseded: ['neutral', 'Superseded'],
    archived: ['neutral', 'Archived'],
    hidden: ['warn', 'Hidden on vessel'],
  }),
  /** Crew medical status (gap/02 W8; X5 `fleet_crew_medical_status`), most severe first. */
  medical_status: vocab({
    critical: ['danger', 'Critical'],
    at_risk: ['warn', 'At risk'],
    incomplete: ['info', 'Incomplete'],
    ok: ['ok', 'Up to date'],
  }),
  /**
   * Invitations (`user_invitations.status`, Phase 2 honest vocabulary,
   * proposed D-121). "Sent" only when the email provider accepted it;
   * `invited` is the legacy profile status shown when no invitation row is
   * visible (it never proves an email went, so it never reads "Sent").
   */
  invitation: vocab({
    pending: ['info', 'Pending'],
    sent: ['signal', 'Sent'],
    send_failed: ['danger', 'Send failed'],
    accepted: ['ok', 'Accepted'],
    expired: ['warn', 'Expired'],
    revoked: ['neutral', 'Revoked'],
    invited: ['info', 'Invited'],
    not_invited: ['neutral', 'Not invited'],
  }),

  // ── Support and feedback ──
  /**
   * Support requests: gap/03 workflow 2 set, gap/09 helpdesk states, and the
   * live legacy values (open / resolved / closed) until the migration maps them.
   */
  support: vocab({
    with_helpdesk: ['purple', 'With your helpdesk'],
    resolved_internally: ['ok', 'Resolved by your helpdesk'],
    requested: ['info', 'Requested'],
    awaiting_approval: ['purple', 'Awaiting approval'],
    approved: ['signal', 'Approved'],
    in_progress: ['signal', 'In progress'],
    testing: ['purple', 'Ready to check'],
    to_be_invoiced: ['ok', 'Complete · invoicing'],
    complete: ['ok', 'Complete'],
    cancelled: ['neutral', 'Cancelled'],
    open: ['info', 'Open'],
    resolved: ['ok', 'Resolved'],
    closed: ['ok', 'Closed'],
  }),
  feedback: vocab({
    submitted: ['info', 'Submitted'],
    in_review: ['signal', 'In review'],
    fixed: ['ok', 'Fixed'],
  }),
} as const satisfies Record<string, Vocabulary>;

export type StatusDomain = keyof typeof STATUS_REGISTRY;

export const STATUS_DOMAINS = Object.freeze(Object.keys(STATUS_REGISTRY) as StatusDomain[]);

/** `'Under Investigation'` → `'under_investigation'`; anything that is not text → `''`. */
export function normalizeStatusKey(status: unknown): string {
  if (typeof status !== 'string' && typeof status !== 'number') return '';
  return String(status)
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .replace(/_+/g, '_');
}

/** `'CAPA_Assigned'` → `'CAPA assigned'`, `'in_progress'` → `'In progress'`; empty → `'—'`. */
export function humanizeStatus(status: unknown): string {
  if (typeof status !== 'string' && typeof status !== 'number') return '—';
  const words = String(status).trim().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').split(' ').filter(Boolean);
  if (words.length === 0) return '—';
  return words
    .map((w, i) => {
      if (w.length > 1 && w === w.toUpperCase() && /[A-Z]/.test(w) && words.some((o) => o !== o.toUpperCase())) {
        return w; // keep acronyms (CAPA, HoD) when the rest is mixed case
      }
      const lower = w.toLowerCase();
      return i === 0 ? lower.charAt(0).toUpperCase() + lower.slice(1) : lower;
    })
    .join(' ');
}

const vocabularyOf = (domain: unknown): Vocabulary | undefined =>
  typeof domain === 'string' && Object.prototype.hasOwnProperty.call(STATUS_REGISTRY, domain)
    ? (STATUS_REGISTRY as Record<string, Vocabulary>)[domain]
    : undefined;

/** Tone, label and whether the registry knows it. Never throws. */
export function statusMeta(domain: StatusDomain, status: unknown): StatusMeta {
  const key = normalizeStatusKey(status);
  const vocabulary = vocabularyOf(domain);
  const entry = key && vocabulary && Object.prototype.hasOwnProperty.call(vocabulary, key) ? vocabulary[key] : undefined;
  if (entry && isTone(entry.tone)) return { tone: entry.tone, label: entry.label, known: true };
  return { tone: 'neutral', label: humanizeStatus(status), known: false };
}

/** The tone for a status; `neutral` when the domain or status is unknown. */
export function statusTone(domain: StatusDomain, status: unknown): Tone {
  return statusMeta(domain, status).tone;
}

/** The sentence-case label for a status (the raw value humanised when unknown). */
export function statusLabel(domain: StatusDomain, status: unknown): string {
  return statusMeta(domain, status).label;
}

/** Every status of a domain in registry order, e.g. for filter chips. Unknown domain → []. */
export function statusVocabulary(domain: StatusDomain): ReadonlyArray<{ status: string } & StatusEntry> {
  const vocabulary = vocabularyOf(domain);
  if (!vocabulary) return [];
  return Object.entries(vocabulary).map(([status, entry]) => ({ status, ...entry }));
}
