/**
 * The people side of fleet document acknowledgements (gap/02 FD6, FD7,
 * FD8, W1; X5 spec X5-05B; DECISIONS D-X5-04, D-249), pure: the counts
 * the Acknowledgements tab and the library's Acknowledged column show, the
 * crew list the Master and heads of department read, who may do what on a
 * vessel (a hint for the screen: the definers decide), the reminder
 * answer, the signer rules in words, and the refusals of the three crew
 * definers as sentences.
 *
 * The server computes every state in one place (`fleet_document_ack_rows`,
 * 20261124040400) and filters every row to the caller's readership; this
 * file never decides a state, it only counts and words what came back.
 * No React, no Supabase.
 */
import type {
  FleetDocumentAckStatusRow,
  FleetDocumentSignerRuleKind,
  FleetDocumentSignerRuleRow,
  FleetDocumentSummaryRow,
} from '../types/db.pending';
import { ACK_BLOCKED_LABELS, ackRefusal, isOutstanding, type AckBlockedReason, type AckState } from './ackState';

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-GB')} ${n === 1 ? one : many}`;
const people = (n: number) => plural(n, 'person', 'people');

// ─── Counts ─────────────────────────────────────────────────────────────

/** The people of a document (or a vessel, or a person's documents) by state; history is not counted. */
export interface AckCounts {
  acknowledged: number;
  pending: number;
  overdue: number;
  blocked: number;
  /** Pending plus overdue: the people who still have to and are able to (the server's can_sign). */
  canSign: number;
  /** Everyone counted: acknowledged, pending, overdue and blocked. */
  total: number;
}

export const EMPTY_COUNTS: AckCounts = Object.freeze({ acknowledged: 0, pending: 0, overdue: 0, blocked: 0, canSign: 0, total: 0 });

const count = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0);

export function addCounts(a: AckCounts, b: AckCounts): AckCounts {
  return {
    acknowledged: a.acknowledged + b.acknowledged,
    pending: a.pending + b.pending,
    overdue: a.overdue + b.overdue,
    blocked: a.blocked + b.blocked,
    canSign: a.canSign + b.canSign,
    total: a.total + b.total,
  };
}

/** One `fleet_document_summary` row as counts (the server's bigint counts arrive as numbers). */
export function countsFromSummary(row: Pick<FleetDocumentSummaryRow, 'acknowledged' | 'pending' | 'overdue' | 'blocked' | 'can_sign'>): AckCounts {
  const acknowledged = count(row.acknowledged);
  const pending = count(row.pending);
  const overdue = count(row.overdue);
  const blocked = count(row.blocked);
  return { acknowledged, pending, overdue, blocked, canSign: count(row.can_sign), total: acknowledged + pending + overdue + blocked };
}

/** Counts over status rows (history rows, `not_required`, are not counted). */
export function countsFromRows(rows: readonly Pick<FleetDocumentAckStatusRow, 'state'>[]): AckCounts {
  const c = { acknowledged: 0, pending: 0, overdue: 0, blocked: 0 };
  for (const r of rows) if (r.state !== 'not_required') c[r.state] += 1;
  return { ...c, canSign: c.pending + c.overdue, total: c.acknowledged + c.pending + c.overdue + c.blocked };
}

/** Everyone who has not acknowledged yet: pending, overdue and blocked. */
export const needsCount = (c: AckCounts): number => c.pending + c.overdue + c.blocked;

/** "34 of 52 acknowledged". */
export const acknowledgedLabel = (c: AckCounts): string =>
  `${c.acknowledged.toLocaleString('en-GB')} of ${c.total.toLocaleString('en-GB')} acknowledged`;

/** The counts in one sentence (the bar's accessible name): "34 acknowledged, 10 to acknowledge, 5 overdue, 3 unable to acknowledge". */
export function countsSentence(c: AckCounts): string {
  if (c.total === 0) return 'Nobody to acknowledge';
  const parts = [`${c.acknowledged.toLocaleString('en-GB')} acknowledged`];
  if (c.pending) parts.push(`${c.pending.toLocaleString('en-GB')} to acknowledge`);
  if (c.overdue) parts.push(`${c.overdue.toLocaleString('en-GB')} overdue`);
  if (c.blocked) parts.push(`${c.blocked.toLocaleString('en-GB')} unable to acknowledge`);
  return parts.join(', ');
}

/** The bar's segments in their fixed order, one per person when they fit. */
export const BAR_STATES = ['acknowledged', 'pending', 'overdue', 'blocked'] as const satisfies readonly AckState[];
export type BarState = (typeof BAR_STATES)[number];

/** Up to this many people the bar draws one segment per person; above it, proportional segments. */
export const PER_PERSON_BAR_MAX = 40;

/** The per-person cells of a bar (state per cell, in BAR_STATES order), or null above PER_PERSON_BAR_MAX. */
export function perPersonCells(c: AckCounts): BarState[] | null {
  if (c.total === 0 || c.total > PER_PERSON_BAR_MAX) return null;
  return BAR_STATES.flatMap((s) => Array.from({ length: c[s] }, () => s));
}

// ─── Per document and per vessel (the fleet tab and the library column) ──

export interface VesselAckSummary {
  vesselId: string;
  versionId: string;
  counts: AckCounts;
}

export interface DocumentAckSummary {
  documentId: string;
  versionId: string;
  counts: AckCounts;
  vessels: VesselAckSummary[];
}

/**
 * `fleet_document_summary` rows per document, summed over its vessels.
 * When the library's current version is known, rows for any other version
 * are dropped (a version published since the summary was read is not
 * mixed with the old one's counts); otherwise the first version seen is
 * kept and rows of any other version are left out (never mixed).
 */
export function summariseByDocument(
  rows: readonly FleetDocumentSummaryRow[],
  currentVersion?: ReadonlyMap<string, string | null>,
): Map<string, DocumentAckSummary> {
  const out = new Map<string, DocumentAckSummary>();
  for (const row of rows) {
    const current = currentVersion?.get(row.document_id);
    if (current !== undefined && current !== row.version_id) continue;
    let doc = out.get(row.document_id);
    if (!doc) {
      doc = { documentId: row.document_id, versionId: row.version_id, counts: EMPTY_COUNTS, vessels: [] };
      out.set(row.document_id, doc);
    } else if (doc.versionId !== row.version_id) {
      // Two versions of one document without the library to say which is current: never mix them.
      continue;
    }
    const counts = countsFromSummary(row);
    doc.counts = addCounts(doc.counts, counts);
    doc.vessels.push({ vesselId: row.vessel_id, versionId: row.version_id, counts });
  }
  return out;
}

/** Most overdue first, then the most still to acknowledge, then the name. */
export function compareByNeed(a: { counts: AckCounts; name: string }, b: { counts: AckCounts; name: string }): number {
  return (
    b.counts.overdue - a.counts.overdue ||
    needsCount(b.counts) - needsCount(a.counts) ||
    a.name.localeCompare(b.name, 'en-GB', { sensitivity: 'base' })
  );
}

// ─── The crew list (Master / head of department) ────────────────────────

export interface CrewPerson {
  profileId: string;
  name: string;
  position: string | null;
  department: string | null;
  hasLogin: boolean;
  isPlanned: boolean;
  joinDate: string | null;
  /** This person's current rows (history rows left out), in the order they came. */
  rows: FleetDocumentAckStatusRow[];
  counts: AckCounts;
}

/** A person's name as the server gave it, or an honest placeholder. */
export const personName = (row: Pick<FleetDocumentAckStatusRow, 'person_name'>): string => row.person_name?.trim() || 'Name not recorded';

/**
 * The crew of one vessel by person, from `fleet_document_ack_status`
 * rows: people on the crew now (history rows are not the crew), one entry
 * each, with their rows (one document, or every document) and counts;
 * sorted by name.
 */
export function groupCrew(rows: readonly FleetDocumentAckStatusRow[], options: { vesselId: string; documentId?: string | null }): CrewPerson[] {
  const byId = new Map<string, CrewPerson>();
  for (const row of rows) {
    if (row.vessel_id !== options.vesselId || !row.on_crew) continue;
    if (options.documentId && row.document_id !== options.documentId) continue;
    let person = byId.get(row.profile_id);
    if (!person) {
      person = {
        profileId: row.profile_id,
        name: personName(row),
        position: row.position?.trim() || null,
        department: row.department?.trim() || null,
        hasLogin: row.has_login,
        isPlanned: row.is_planned,
        joinDate: row.join_date,
        rows: [],
        counts: EMPTY_COUNTS,
      };
      byId.set(row.profile_id, person);
    }
    person.rows.push(row);
  }
  const list = [...byId.values()];
  for (const p of list) p.counts = countsFromRows(p.rows);
  return list.sort((a, b) => a.name.localeCompare(b.name, 'en-GB', { sensitivity: 'base' }) || a.profileId.localeCompare(b.profileId));
}

/** The person's worst state across their rows: overdue, blocked, pending, acknowledged. */
export function worstState(person: Pick<CrewPerson, 'counts'>): 'overdue' | 'blocked' | 'pending' | 'acknowledged' | null {
  const c = person.counts;
  if (c.overdue) return 'overdue';
  if (c.blocked) return 'blocked';
  if (c.pending) return 'pending';
  if (c.acknowledged) return 'acknowledged';
  return null;
}

/** The distinct reasons a person cannot sign, in words ("No app login"). */
export function blockedLabels(rows: readonly Pick<FleetDocumentAckStatusRow, 'state' | 'blocked_reason'>[]): string[] {
  const reasons = new Set<AckBlockedReason>();
  for (const r of rows) if (r.state === 'blocked' && r.blocked_reason) reasons.add(r.blocked_reason);
  return [...reasons].map((r) => ACK_BLOCKED_LABELS[r]);
}

/** The positions on the crew rows, for the signer picker (distinct, case kept from the first seen, sorted). */
export function crewPositions(rows: readonly Pick<FleetDocumentAckStatusRow, 'position'>[]): string[] {
  const seen = new Map<string, string>();
  for (const r of rows) {
    const p = r.position?.trim();
    if (p && !seen.has(p.toLowerCase())) seen.set(p.toLowerCase(), p);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, 'en-GB', { sensitivity: 'base' }));
}

// ─── Who may act on a vessel (a hint; the definers decide) ──────────────

/** An RBAC role the caller holds (the permissions store's `get_user_roles_full` rows). */
export interface CapacityRole {
  role_name: string | null;
  vessel_id: string | null;
  department: string | null;
}

export interface CrewCapacityInput {
  vesselId: string;
  /** The caller's own roles; ignored until `rolesKnown`. */
  roles: readonly CapacityRole[];
  rolesKnown: boolean;
  /** `profiles.role` (legacy). */
  legacyRole: string | null;
  /** The caller is on this vessel's crew (`caller_on_crew` of the vessel's documents). */
  onCrew: boolean;
  fleetReach: boolean;
  /** fleet.operations.fleet_documents.view / .edit / .admin. */
  documentsView: boolean;
  documentsEdit: boolean;
  documentsAdmin: boolean;
}

export interface CrewCapacity {
  /** The capacity is known (roles loaded); until then nothing is offered (fail closed). */
  known: boolean;
  /** Reads the other people's states on this vessel. */
  readsCrew: boolean;
  /** Holds the Master's office on this vessel (record_is_master, as far as the client can tell). */
  isMaster: boolean;
  /** A head of department on this vessel; `departments` null = every department. */
  isHod: boolean;
  hodDepartments: readonly string[] | null;
  /** A documents viewer with fleet reach (reads every row). */
  isFleetReader: boolean;
  /** A documents editor with fleet reach (reminds any vessel's crew). */
  isFleetEditor: boolean;
  canWitness: boolean;
  canRemind: boolean;
  canChooseSigners: boolean;
}

const MASTER_ROLES = new Set(['captain', 'master']);
const norm = (value: string | null | undefined) => (value ?? '').trim().toLowerCase();

/**
 * What the caller may do in the vessel's crew view, mirroring who the
 * definers let act (040400): documents viewers with fleet reach read every
 * row; the Master (a Master's role on this vessel, or the legacy Master
 * role while on its crew) reads, witnesses, reminds and chooses who can
 * sign; a head of department (an HoD role on this vessel or company-wide;
 * a department, or every department) reads, witnesses and reminds their
 * department; documents editors with fleet reach remind; documents admins
 * with fleet reach choose who can sign. The server refuses anything this
 * gets wrong, and the screen says so in words.
 */
export function crewCapacity(input: CrewCapacityInput): CrewCapacity {
  const roles = input.rolesKnown ? input.roles : [];
  const here = (r: CapacityRole) => r.vessel_id === input.vesselId || r.vessel_id === null;
  const isMaster =
    roles.some((r) => MASTER_ROLES.has(norm(r.role_name)) && r.vessel_id === input.vesselId) || (norm(input.legacyRole) === 'master' && input.onCrew);
  const hodRoles = roles.filter((r) => norm(r.role_name) === 'hod' && here(r));
  const isHod = hodRoles.length > 0;
  const hodDepartments = !isHod || hodRoles.some((r) => !norm(r.department)) ? null : [...new Set(hodRoles.map((r) => norm(r.department)))];
  const isFleetReader = input.fleetReach && input.documentsView;
  const isFleetEditor = input.fleetReach && input.documentsEdit;
  const known = input.rolesKnown;
  return {
    known,
    readsCrew: known && (isFleetReader || isMaster || isHod),
    isMaster: known && isMaster,
    isHod: known && isHod,
    hodDepartments: isHod ? hodDepartments : null,
    isFleetReader: known && isFleetReader,
    isFleetEditor: known && isFleetEditor,
    canWitness: known && (isMaster || isHod),
    canRemind: known && (isMaster || isHod || isFleetEditor),
    canChooseSigners: known && (isMaster || (input.fleetReach && input.documentsAdmin)),
  };
}

/** Whether the caller's office covers the person's department: the Master every department, a head of department theirs. */
export function coversDepartment(capacity: CrewCapacity, department: string | null): boolean {
  if (capacity.isMaster) return true;
  if (!capacity.isHod) return false;
  if (capacity.hodDepartments === null) return true;
  return capacity.hodDepartments.includes(norm(department));
}

/** Whether the caller may record a witnessed acknowledgement for this row (Master or covering HoD; never their own). */
export function mayWitnessRow(
  capacity: CrewCapacity,
  row: Pick<FleetDocumentAckStatusRow, 'on_crew' | 'state' | 'blocked_reason' | 'department' | 'profile_id'>,
  callerProfileId: string | null,
): boolean {
  return capacity.canWitness && row.profile_id !== callerProfileId && coversDepartment(capacity, row.department) && canBeWitnessed(row);
}

/** Whether the caller may remind this person (outstanding with a login; Master, fleet editors, or a covering HoD; never themselves). */
export function mayRemindRow(
  capacity: CrewCapacity,
  row: Pick<FleetDocumentAckStatusRow, 'on_crew' | 'state' | 'has_login' | 'department' | 'profile_id'>,
  callerProfileId: string | null,
): boolean {
  return (
    capacity.canRemind &&
    row.on_crew &&
    isOutstanding(row.state) &&
    row.has_login &&
    row.profile_id !== callerProfileId &&
    (capacity.isMaster || capacity.isFleetEditor || coversDepartment(capacity, row.department))
  );
}

// ─── Witnessed acknowledgement ──────────────────────────────────────────

/** The blocked reasons a witness may record past: no login, or a suspended one (not the signer list). */
export const WITNESSABLE_BLOCKED: readonly AckBlockedReason[] = ['no_login', 'suspended'];

/** Whether a witness may record this row (on the crew; pending, overdue, or blocked for a login reason). */
export function canBeWitnessed(row: Pick<FleetDocumentAckStatusRow, 'on_crew' | 'state' | 'blocked_reason'>): boolean {
  if (!row.on_crew) return false;
  if (isOutstanding(row.state)) return true;
  return row.state === 'blocked' && row.blocked_reason !== null && WITNESSABLE_BLOCKED.includes(row.blocked_reason);
}

// ─── Reminders (FD7) ────────────────────────────────────────────────────

/** The 24-hour rule, as the screens show it. */
export const REMIND_RULE = 'One reminder a day per person: anyone reminded in the last 24 hours is skipped.';
/** Where a reminder arrives (in-app only, D-249; never an email). */
export const REMIND_CHANNEL = 'Reminders appear in the person’s STORM notifications.';

export type RemindScope = 'person' | 'vessel' | 'all';

export interface RemindTarget {
  scope: RemindScope;
  documentId: string;
  /** Null for every vessel the document reaches (scope `all`). */
  vesselId: string | null;
  /** Only for scope `person`. */
  profileId: string | null;
}

/** The answer of `fleet_document_remind`: `{ reminder_id, sent, skipped, failed, vessels }`. */
export interface RemindOutcome {
  reminderId: string | null;
  sent: number;
  skipped: number;
  failed: number;
  vessels: number;
}

const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;

/** The reminder answer, checked; null when it is not that shape (never a guess). */
export function parseRemindOutcome(value: unknown): RemindOutcome | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const id = v.reminder_id;
  if (!(id === null || id === undefined || typeof id === 'string')) return null;
  if (!isCount(v.sent) || !isCount(v.skipped) || !isCount(v.failed) || !isCount(v.vessels)) return null;
  // A reminder is logged exactly when someone was sent or skipped.
  const logged = v.sent > 0 || v.skipped > 0;
  if (logged !== (typeof id === 'string' && id.length > 0)) return null;
  return { reminderId: typeof id === 'string' ? id : null, sent: v.sent, skipped: v.skipped, failed: v.failed, vessels: v.vessels };
}

export interface RemindMessage {
  tone: 'success' | 'info' | 'warning';
  title: string;
  description: string;
}

/** The outcome in words; it never says an email went out (D-249). */
export function remindOutcomeMessage(outcome: RemindOutcome): RemindMessage {
  const skipped = outcome.skipped ? `${people(outcome.skipped)} skipped: reminded in the last 24 hours.` : '';
  const failed = outcome.failed ? `The reminder could not reach ${people(outcome.failed)}; try again later.` : '';
  if (outcome.sent > 0) {
    return {
      tone: outcome.failed ? 'warning' : 'success',
      title: `${people(outcome.sent)} reminded`,
      description: ['It is in their STORM notifications.', skipped, failed].filter(Boolean).join(' '),
    };
  }
  if (outcome.failed > 0) return { tone: 'warning', title: 'Nobody was reminded', description: [failed, skipped].filter(Boolean).join(' ') };
  if (outcome.skipped > 0) {
    return {
      tone: 'info',
      title: 'Nobody was reminded',
      description: `${outcome.skipped === 1 ? 'The one person' : `All ${outcome.skipped.toLocaleString('en-GB')} people`} still to acknowledge ${outcome.skipped === 1 ? 'was' : 'were'} reminded in the last 24 hours.`,
    };
  }
  return {
    tone: 'info',
    title: 'Nobody to remind',
    description: 'Everyone has acknowledged, or the people left cannot acknowledge in the app (no login or not on the signer list).',
  };
}

/**
 * The people a reminder would reach, from the status rows the screen has:
 * on the crew, pending or overdue, with a login, never the caller (the
 * server's own rule; it also applies the 24-hour rule and the caller's
 * department).
 */
export function remindCandidates(
  rows: readonly FleetDocumentAckStatusRow[],
  target: RemindTarget,
  callerProfileId: string | null,
): FleetDocumentAckStatusRow[] {
  return rows.filter(
    (r) =>
      r.on_crew &&
      r.document_id === target.documentId &&
      (target.vesselId === null || r.vessel_id === target.vesselId) &&
      (target.scope !== 'person' || r.profile_id === target.profileId) &&
      isOutstanding(r.state) &&
      r.has_login &&
      r.profile_id !== callerProfileId,
  );
}

// ─── Signer rules (FD8) ─────────────────────────────────────────────────

export const SIGNER_RULES = ['all_crew_with_login', 'hod_and_above', 'positions', 'named_people'] as const satisfies readonly FleetDocumentSignerRuleKind[];

export const SIGNER_RULE_LABELS: Readonly<Record<FleetDocumentSignerRuleKind, string>> = {
  all_crew_with_login: 'Everyone on the crew with an app login',
  hod_and_above: 'Heads of department and above',
  positions: 'Chosen positions',
  named_people: 'Chosen people',
};

export const SIGNER_RULE_HINTS: Readonly<Record<FleetDocumentSignerRuleKind, string>> = {
  all_crew_with_login: 'The default. Crew without a login can still be recorded as witnessed.',
  hod_and_above: 'The Master, heads of department and senior officers sign; everyone else is shown as not on the signer list.',
  positions: 'Only crew in the positions you pick sign.',
  named_people: 'Only the people you pick sign.',
};

/** The rule that applies to a document type on the vessel: the type's own, else the all-types rule, else null (the default). */
export function effectiveSignerRule<R extends Pick<FleetDocumentSignerRuleRow, 'type_id'>>(rules: readonly R[], typeId: string | null): R | null {
  return (typeId ? rules.find((r) => r.type_id === typeId) : undefined) ?? rules.find((r) => r.type_id === null) ?? null;
}

/** A rule in one line: "Chosen positions: Master, Chief Officer", "Chosen people: 3". */
export function signerRuleSummary(
  rule: Pick<FleetDocumentSignerRuleRow, 'rule' | 'positions' | 'profile_ids'> | null,
  nameOf?: (profileId: string) => string | null,
): string {
  if (!rule) return `${SIGNER_RULE_LABELS.all_crew_with_login} (default)`;
  if (rule.rule === 'positions') return `${SIGNER_RULE_LABELS.positions}: ${rule.positions.join(', ')}`;
  if (rule.rule === 'named_people') {
    const names = rule.profile_ids.map((id) => nameOf?.(id) ?? null);
    const known = names.filter((n): n is string => Boolean(n));
    if (known.length === rule.profile_ids.length && known.length > 0 && known.length <= 4) return `${SIGNER_RULE_LABELS.named_people}: ${known.join(', ')}`;
    return `${SIGNER_RULE_LABELS.named_people}: ${people(rule.profile_ids.length)}`;
  }
  return SIGNER_RULE_LABELS[rule.rule];
}

// ─── Refusals of the crew definers, in context ──────────────────────────

/** A witnessed acknowledgement's refusal, naming the person where it helps; null for an unknown code. */
export function witnessRefusal(code: string | null | undefined, detail: string | null | undefined, name: string): string | null {
  switch (code) {
    case 'already_acknowledged':
      return `${name} has already acknowledged this version. The list has been refreshed.`;
    case 'not_required':
      return `This version no longer needs ${name}’s acknowledgement. The list has been refreshed.`;
    case 'blocked':
      return detail === 'not_in_signer_set'
        ? `${name} is not on the list of people who sign for this vessel. Change who can sign first.`
        : `${name} cannot be recorded as having acknowledged this version.`;
    case 'not_permitted':
      return 'Only the Master, or the head of department of this person, can record a witnessed acknowledgement on this vessel.';
    case 'witness_is_subject':
      return ackRefusal(code);
    default:
      return ackRefusal(code, detail);
  }
}

/** A reminder's refusal; null for an unknown code. */
export function remindRefusal(code: string | null | undefined): string | null {
  if (code === 'not_permitted') return 'You cannot send reminders for this vessel. The Master, heads of department and the fleet document editors can.';
  if (code === 'vessel_required') return 'Choose the vessel: as Master or head of department you remind your own vessel’s crew.';
  if (code === 'profile_not_found') return 'That person is no longer on your company’s crew list.';
  return ackRefusal(code);
}

/** A signer rule's refusal; null for an unknown code. */
export function signerRuleRefusal(code: string | null | undefined): string | null {
  if (code === 'not_permitted') return 'Only the vessel’s Master or a fleet document admin can change who can sign.';
  if (code === 'profile_not_found') return 'One of the people chosen is no longer on your company’s crew list. Refresh and choose again.';
  return ackRefusal(code);
}
