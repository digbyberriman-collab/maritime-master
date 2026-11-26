/**
 * The crew requirement engine (X1-06; gap/04 C5, C33, C34, C36, W5): the
 * TS mirror of crew_requirement_status_for(), crew_compliance_summary_for()
 * and the pure rules of 20261124060600_crew_compliance.sql, row for row.
 * The server is the authority; this mirror serves optimistic updates (a
 * document just added, a cell just ticked) and the add dialog's "Missing
 * for current role" list. The shared cases of
 * src/test/crew/fixtures/complianceCases.json are asserted against this
 * module by src/test/crew/compliance.test.ts and against SQL by
 * supabase/tests/sql/crew/compliance_parity.test.sql.
 *
 * The rule (W5 §2-§4):
 *   satisfiers   the row's options and every type that reaches one through
 *                the satisfaction rules (STORM's and the company's), at most
 *                five rules deep, cycle safe, the shortest depth; 'option',
 *                or the kind of the rule next to the option
 *                (component / supersedes / equivalent)
 *   counts       a document of a satisfier type that is neither rejected nor
 *                removed (unverified, verified and conditionally approved
 *                all count; alerts off still counts; lib/verification.ts
 *                satisfiesRequirements is the same rule)
 *   best         not expired before expired; "No expiry", then the latest
 *                date, then a missing date; unconditional first; the
 *                shortest rule chain; the id
 *   state        met, expiring (inside the window), expired (only expired
 *                satisfiers), missing (none); a familiarisation row is met by
 *                a completed record of one of its templates on the vessel
 *   explained    a missing row says why: rejected (a satisfier was
 *                rejected), not_linked (a document of the same category as
 *                an option, linked by no rule), in_progress (an open
 *                familiarisation record), none; with the nearest document
 *   summary      met = met + expiring; status complete, else the worst of
 *                expired > missing > expiring with alerts on; two dots
 *                (documents; STCW and qualifications): none, danger, warn
 *                (expiring with alerts on, conditional, missing date), ok
 *
 * Pure: no React, no client. "today" is passed in.
 */
import { expiryStatus, type ExpiryBucket } from '@/lib/records/expiry';
import type { DateInput } from '@/lib/records/dates';
import { daysBetween, toCalendarDate } from '@/lib/records/dates';
import type { CrewDocumentSatisfactionKind, CrewDocumentTab, CrewDocumentVerificationStatus } from '../types/db.pending';
import { documentWindowDays } from './documentState';
import { satisfiesRequirements, showsAmber } from './verification';

// ---------------------------------------------------------------- vocabularies

/** The W5 requirement groups (crew_requirement_rows.group_key). */
export const REQUIREMENT_GROUPS = [
  'stcw_basic',
  'survival_craft',
  'advanced_training',
  'medical',
  'security',
  'stcw_passenger',
  'coc_gmdss',
  'deck_engineering',
  'navigation_safety',
  'documents',
  'familiarisation',
  'custom',
] as const;
export type RequirementGroup = (typeof REQUIREMENT_GROUPS)[number];

/** Group labels, STORM wording. */
export const REQUIREMENT_GROUP_LABEL: Readonly<Record<RequirementGroup, string>> = {
  stcw_basic: 'Basic safety (STCW VI/1)',
  survival_craft: 'Survival craft and rescue boats',
  advanced_training: 'Advanced training',
  medical: 'Medical',
  security: 'Security',
  stcw_passenger: 'Passenger ships (STCW V/2)',
  coc_gmdss: 'Certificates of competency and GMDSS',
  deck_engineering: 'Deck and engineering certificates',
  navigation_safety: 'Navigation and safety',
  documents: 'Documents',
  familiarisation: 'Familiarisation',
  custom: 'Other requirements',
};

export const REQUIREMENT_KINDS = ['document', 'familiarisation'] as const;
export type RequirementKind = (typeof REQUIREMENT_KINDS)[number];

export const REQUIREMENT_STATES = ['met', 'expiring', 'expired', 'missing'] as const;
export type RequirementState = (typeof REQUIREMENT_STATES)[number];

export const COMPLIANCE_STATUSES = ['complete', 'expiring', 'missing', 'expired'] as const;
export type ComplianceStatus = (typeof COMPLIANCE_STATUSES)[number];

export const COMPLIANCE_TABS = ['documents', 'stcw', 'qualifications', 'familiarisation'] as const;
export type ComplianceTab = (typeof COMPLIANCE_TABS)[number];

export const SATISFIED_VIA = ['option', 'component', 'supersedes', 'equivalent', 'familiarisation'] as const;
export type SatisfiedVia = (typeof SATISFIED_VIA)[number];

export const GAP_REASONS = ['rejected', 'not_linked', 'in_progress', 'none'] as const;
export type GapReason = (typeof GAP_REASONS)[number];

export const COMPLIANCE_DOTS = ['none', 'ok', 'warn', 'danger'] as const;
export type ComplianceDot = (typeof COMPLIANCE_DOTS)[number];

export const COMPLIANCE_ISSUE_REASONS = ['expired', 'missing', 'expiring', 'conditional', 'missing_date'] as const;
export type ComplianceIssueReason = (typeof COMPLIANCE_ISSUE_REASONS)[number];

/** The longest chain of satisfaction rules the engine follows. */
export const MAX_RULE_DEPTH = 5;

/** The D-01 copy while 20261124060600 is not applied. */
export const COMPLIANCE_NOT_SET_UP_NOTICE = 'Crew compliance becomes available once the crew update is applied.';

const isOneOf = <T extends string>(list: readonly T[], value: unknown): value is T =>
  typeof value === 'string' && (list as readonly string[]).includes(value);

export const isRequirementGroup = (v: unknown): v is RequirementGroup => isOneOf(REQUIREMENT_GROUPS, v);
export const isRequirementState = (v: unknown): v is RequirementState => isOneOf(REQUIREMENT_STATES, v);
export const isComplianceStatus = (v: unknown): v is ComplianceStatus => isOneOf(COMPLIANCE_STATUSES, v);
export const isComplianceTab = (v: unknown): v is ComplianceTab => isOneOf(COMPLIANCE_TABS, v);
export const isSatisfiedVia = (v: unknown): v is SatisfiedVia => isOneOf(SATISFIED_VIA, v);
export const isGapReason = (v: unknown): v is GapReason => isOneOf(GAP_REASONS, v);
export const isComplianceDot = (v: unknown): v is ComplianceDot => isOneOf(COMPLIANCE_DOTS, v);
export const isComplianceIssueReason = (v: unknown): v is ComplianceIssueReason => isOneOf(COMPLIANCE_ISSUE_REASONS, v);

// ---------------------------------------------------------------- pure rules (SQL helpers of the same name)

const STCW_GROUPS: readonly RequirementGroup[] = [
  'stcw_basic',
  'survival_craft',
  'advanced_training',
  'medical',
  'security',
  'stcw_passenger',
  'navigation_safety',
];

/** SQL crew_requirement_tab: familiarisation; else the first option's tab; else the group's. */
export function requirementTab(kind: RequirementKind, groupKey: string, optionTab: string | null | undefined): ComplianceTab {
  if (kind === 'familiarisation') return 'familiarisation';
  if (optionTab === 'documents' || optionTab === 'stcw' || optionTab === 'qualifications') return optionTab;
  if (groupKey === 'documents') return 'documents';
  if ((STCW_GROUPS as readonly string[]).includes(groupKey)) return 'stcw';
  return 'qualifications';
}

const CATEGORY_GROUP: Readonly<Record<string, RequirementGroup>> = {
  stcw_basic: 'stcw_basic',
  stcw_survival_craft: 'survival_craft',
  stcw_fire: 'advanced_training',
  stcw_special_ships: 'advanced_training',
  stcw_leadership: 'advanced_training',
  stcw_engineering: 'advanced_training',
  stcw_medical: 'medical',
  medical_fitness: 'medical',
  health_records: 'medical',
  stcw_security: 'security',
  security_services: 'security',
  stcw_passenger: 'stcw_passenger',
  coc_deck: 'coc_gmdss',
  coc_deck_yacht: 'coc_gmdss',
  coc_engineering: 'coc_gmdss',
  coc_engineering_yacht: 'coc_gmdss',
  coc_electro: 'coc_gmdss',
  radio: 'coc_gmdss',
  flag_endorsements: 'coc_gmdss',
  ratings: 'deck_engineering',
  dynamic_positioning: 'deck_engineering',
  tenders_watersports: 'deck_engineering',
  diving: 'deck_engineering',
  technical_trades: 'deck_engineering',
  stcw_navigation: 'navigation_safety',
  helicopter_offshore: 'navigation_safety',
  passports: 'documents',
  seafarer_identity: 'documents',
  visas: 'documents',
  work_permits: 'documents',
  identity_other: 'documents',
  licences: 'documents',
  other_documents: 'documents',
};

/** SQL crew_requirement_group_for_category: the group a document category's requirement goes in. */
export function requirementGroupForCategory(categoryKey: string | null | undefined): RequirementGroup {
  return (categoryKey && CATEGORY_GROUP[categoryKey]) || 'custom';
}

/** SQL crew_compliance_status_decide: expired > missing > expiring (alerts on) > complete. */
export function complianceStatus(expired: number, missing: number, expiringOpen: number): ComplianceStatus {
  if (expired > 0) return 'expired';
  if (missing > 0) return 'missing';
  if (expiringOpen > 0) return 'expiring';
  return 'complete';
}

/** SQL crew_compliance_dot: none (nothing required), danger, warn, ok. */
export function complianceDot(required: number, bad: number, warn: number): ComplianceDot {
  if (required === 0) return 'none';
  if (bad > 0) return 'danger';
  if (warn > 0) return 'warn';
  return 'ok';
}

// ---------------------------------------------------------------- the satisfier closure (SQL crew_requirement_row_satisfiers)

export interface SatisfactionRule {
  /** Holding this type ... */
  typeId: string;
  /** ... satisfies a requirement for this one. */
  satisfiesTypeId: string;
  kind: CrewDocumentSatisfactionKind;
}

export type SatisfierKind = 'option' | CrewDocumentSatisfactionKind;

export interface Satisfier {
  typeId: string;
  /** 'option' at depth 0, else the kind of the rule next to the option. */
  kind: SatisfierKind;
  depth: number;
  /** The option this satisfier satisfies. */
  viaOptionTypeId: string;
  optionSort: number;
}

export interface ClosureOption {
  typeId: string;
  sortOrder: number;
  /** The option's own id (the last tie-break; the sort order when absent). */
  id?: string;
}

const cmpStr = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * The shortest depth and first-rule kinds of every type that reaches the
 * root (SQL: the recursive chain with its path check, then DISTINCT ON the
 * shortest depth, the kind alphabetically). Breadth first: the shortest
 * path to a type is always a simple path, so the path check never hides it.
 */
function closureFromRoot(root: string, bySatisfied: ReadonlyMap<string, readonly SatisfactionRule[]>, maxDepth: number): Map<string, { depth: number; kind: SatisfierKind }> {
  const out = new Map<string, { depth: number; kind: SatisfierKind }>([[root, { depth: 0, kind: 'option' }]]);
  // frontier: type -> the first-rule kinds it is reached with at this depth
  let frontier = new Map<string, Set<SatisfierKind>>([[root, new Set<SatisfierKind>(['option'])]]);
  for (let depth = 1; depth <= maxDepth && frontier.size > 0; depth += 1) {
    const next = new Map<string, Set<SatisfierKind>>();
    for (const [typeId, kinds] of frontier) {
      for (const rule of bySatisfied.get(typeId) ?? []) {
        if (out.has(rule.typeId) && (out.get(rule.typeId)?.depth ?? 0) < depth) continue;
        const reached = next.get(rule.typeId) ?? new Set<SatisfierKind>();
        if (depth === 1) reached.add(rule.kind);
        else for (const k of kinds) reached.add(k);
        next.set(rule.typeId, reached);
      }
    }
    for (const [typeId, kinds] of next) {
      const kind = [...kinds].sort(cmpStr)[0] as SatisfierKind;
      out.set(typeId, { depth, kind });
    }
    frontier = next;
  }
  return out;
}

/**
 * Every satisfier type of a requirement's document options: per type the
 * shortest depth, then the first option (sort order, then id), then the
 * kind alphabetically (SQL crew_requirement_row_satisfiers).
 */
export function satisfierClosure(options: readonly ClosureOption[], rules: readonly SatisfactionRule[], maxDepth = MAX_RULE_DEPTH): Map<string, Satisfier> {
  const bySatisfied = new Map<string, SatisfactionRule[]>();
  for (const r of rules) {
    const list = bySatisfied.get(r.satisfiesTypeId) ?? [];
    list.push(r);
    bySatisfied.set(r.satisfiesTypeId, list);
  }
  const out = new Map<string, Satisfier>();
  const better = (a: Satisfier, aId: string, b: Satisfier, bId: string) =>
    a.depth !== b.depth ? a.depth < b.depth : a.optionSort !== b.optionSort ? a.optionSort < b.optionSort : aId !== bId ? aId < bId : a.kind < b.kind;
  const optionIds = new Map<string, string>();
  for (const option of options) {
    const optionId = option.id ?? String(option.sortOrder).padStart(6, '0');
    for (const [typeId, reach] of closureFromRoot(option.typeId, bySatisfied, maxDepth)) {
      const candidate: Satisfier = { typeId, kind: reach.kind, depth: reach.depth, viaOptionTypeId: option.typeId, optionSort: option.sortOrder };
      const current = out.get(typeId);
      if (!current || better(candidate, optionId, current, optionIds.get(typeId) ?? '')) {
        out.set(typeId, candidate);
        optionIds.set(typeId, optionId);
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------- inputs

export interface RequirementOptionInput {
  /** A document option. */
  documentTypeId?: string | null;
  /** A familiarisation option. */
  familiarizationTemplateId?: string | null;
  sortOrder: number;
  id?: string;
  /** The option type's category and its tab (the row's tab; not_linked). */
  categoryKey?: string | null;
  tab?: CrewDocumentTab | null;
}

export interface RequirementRowInput {
  id: string;
  groupKey: string;
  label: string;
  kind: RequirementKind;
  sortOrder: number;
  options: readonly RequirementOptionInput[];
  /** The positions the row is ticked for on the vessel. */
  positionIds: readonly string[];
}

export interface HeldDocumentInput {
  id: string;
  documentTypeId: string | null;
  /** The type's key (the not_linked tie-break); the type id when absent. */
  typeKey?: string | null;
  typeName?: string | null;
  categoryKey?: string | null;
  /** The type's expiry item type (the default window: passports 270 days, else 90). */
  itemType?: string | null;
  /** The window the server resolved (crew_documents_for_profile.window_days). */
  windowDays?: number | null;
  expiryDate: string | null;
  noExpiry: boolean;
  verificationStatus: CrewDocumentVerificationStatus;
  alertsMuted: boolean;
  hasFile: boolean;
  /** Removed documents never count. */
  deleted?: boolean;
}

export interface FamiliarisationRecordInput {
  id: string;
  templateId: string;
  templateName?: string | null;
  /** familiarization_records.status (completed, in any case, is done). */
  status: string;
  completedOn?: string | null;
}

export interface EvaluateInput {
  /** The person's position on the vessel (crew_position_for); null: nothing is required. */
  positionId: string | null;
  rows: readonly RequirementRowInput[];
  rules: readonly SatisfactionRule[];
  documents: readonly HeldDocumentInput[];
  familiarisation?: readonly FamiliarisationRecordInput[];
  today: DateInput;
}

// ---------------------------------------------------------------- output (one row of crew_requirement_status_for)

export interface RequirementStatus {
  rowId: string;
  groupKey: string;
  label: string;
  kind: RequirementKind;
  tab: ComplianceTab;
  rowSort: number;
  state: RequirementState;
  satisfyingDocumentId: string | null;
  satisfyingRecordId: string | null;
  satisfyingTypeId: string | null;
  /** The satisfying document's type name, or the completed familiarisation's name. */
  satisfyingName: string | null;
  satisfiedVia: SatisfiedVia | null;
  viaOptionTypeId: string | null;
  /** The satisfier's expiry date (null with no expiry or a missing date). */
  nextExpiry: string | null;
  noExpiry: boolean;
  bucket: ExpiryBucket | null;
  daysRemaining: number | null;
  verificationStatus: CrewDocumentVerificationStatus | null;
  isConditional: boolean;
  isMuted: boolean;
  missingDate: boolean;
  /** Null without a satisfying document. */
  hasFile: boolean | null;
  gapReason: GapReason | null;
  nearestDocumentId: string | null;
  nearestRecordId: string | null;
  nearestTypeId: string | null;
  nearestName: string | null;
}

interface Scored {
  doc: HeldDocumentInput;
  bucket: ExpiryBucket | null;
  daysRemaining: number | null;
  noDate: boolean;
  expiryClass: 0 | 1 | 2;
}

function score(doc: HeldDocumentInput, today: DateInput): Scored {
  const noDate = !doc.expiryDate && !doc.noExpiry;
  const expiryClass: 0 | 1 | 2 = doc.noExpiry ? 0 : doc.expiryDate ? 1 : 2;
  if (noDate) return { doc, bucket: null, daysRemaining: null, noDate, expiryClass };
  const windowDays = documentWindowDays(doc.itemType ?? null, doc.windowDays);
  const st = expiryStatus({ expiresOn: doc.noExpiry ? null : doc.expiryDate, windowDays, today, noExpiry: doc.noExpiry });
  return { doc, bucket: st.bucket, daysRemaining: st.daysRemaining, noDate, expiryClass };
}

/** Latest first for the expiry date (yyyy-MM-dd sorts as text); null last. */
const cmpExpiryDesc = (a: string | null, b: string | null) => (a === b ? 0 : a === null ? 1 : b === null ? -1 : a > b ? -1 : 1);

interface Candidate extends Scored {
  satisfier: Satisfier;
}

function cmpBest(a: Candidate, b: Candidate): number {
  const ax = a.bucket === 'expired' ? 1 : 0;
  const bx = b.bucket === 'expired' ? 1 : 0;
  if (ax !== bx) return ax - bx;
  if (a.expiryClass !== b.expiryClass) return a.expiryClass - b.expiryClass;
  const e = cmpExpiryDesc(a.doc.expiryDate, b.doc.expiryDate);
  if (e !== 0) return e;
  const ac = a.doc.verificationStatus === 'conditionally_approved' ? 1 : 0;
  const bc = b.doc.verificationStatus === 'conditionally_approved' ? 1 : 0;
  if (ac !== bc) return ac - bc;
  if (a.satisfier.depth !== b.satisfier.depth) return a.satisfier.depth - b.satisfier.depth;
  return cmpStr(a.doc.id, b.doc.id);
}

function cmpRejected(a: Candidate, b: Candidate): number {
  if (a.expiryClass !== b.expiryClass) return a.expiryClass - b.expiryClass;
  const e = cmpExpiryDesc(a.doc.expiryDate, b.doc.expiryDate);
  if (e !== 0) return e;
  if (a.satisfier.depth !== b.satisfier.depth) return a.satisfier.depth - b.satisfier.depth;
  return cmpStr(a.doc.id, b.doc.id);
}

function cmpNear(a: Scored, b: Scored): number {
  if (a.expiryClass !== b.expiryClass) return a.expiryClass - b.expiryClass;
  const e = cmpExpiryDesc(a.doc.expiryDate, b.doc.expiryDate);
  if (e !== 0) return e;
  const k = cmpStr(a.doc.typeKey ?? a.doc.documentTypeId ?? '', b.doc.typeKey ?? b.doc.documentTypeId ?? '');
  if (k !== 0) return k;
  return cmpStr(a.doc.id, b.doc.id);
}

const isDone = (status: string) => status.trim().toLowerCase() === 'completed';

/** The tab of a row (its first document option's tab, else its group's). */
export function rowTab(row: Pick<RequirementRowInput, 'kind' | 'groupKey' | 'options'>): ComplianceTab {
  const first = [...row.options]
    .filter((o) => o.documentTypeId)
    .sort((a, b) => a.sortOrder - b.sortOrder || cmpStr(a.id ?? '', b.id ?? ''))[0];
  return requirementTab(row.kind, row.groupKey, first?.tab ?? null);
}

const emptyStatus = (row: RequirementRowInput): RequirementStatus => ({
  rowId: row.id,
  groupKey: row.groupKey,
  label: row.label,
  kind: row.kind,
  tab: rowTab(row),
  rowSort: row.sortOrder,
  state: 'missing',
  satisfyingDocumentId: null,
  satisfyingRecordId: null,
  satisfyingTypeId: null,
  satisfyingName: null,
  satisfiedVia: null,
  viaOptionTypeId: null,
  nextExpiry: null,
  noExpiry: false,
  bucket: null,
  daysRemaining: null,
  verificationStatus: null,
  isConditional: false,
  isMuted: false,
  missingDate: false,
  hasFile: null,
  gapReason: null,
  nearestDocumentId: null,
  nearestRecordId: null,
  nearestTypeId: null,
  nearestName: null,
});

function evaluateFamiliarisation(row: RequirementRowInput, records: readonly FamiliarisationRecordInput[]): RequirementStatus {
  const out = emptyStatus(row);
  const options = new Map<string, number>();
  for (const o of row.options) if (o.familiarizationTemplateId) options.set(o.familiarizationTemplateId, o.sortOrder);
  const mine = records
    .filter((r) => options.has(r.templateId))
    .sort((a, b) => {
      const d = Number(isDone(b.status)) - Number(isDone(a.status));
      if (d !== 0) return d;
      const c = cmpExpiryDesc(a.completedOn ?? null, b.completedOn ?? null);
      if (c !== 0) return c;
      const s = (options.get(a.templateId) ?? 0) - (options.get(b.templateId) ?? 0);
      if (s !== 0) return s;
      return cmpStr(a.id, b.id);
    });
  const best = mine[0];
  if (best && isDone(best.status)) {
    return { ...out, state: 'met', satisfyingRecordId: best.id, satisfyingName: best.templateName ?? null, satisfiedVia: 'familiarisation' };
  }
  return {
    ...out,
    state: 'missing',
    gapReason: best ? 'in_progress' : 'none',
    nearestRecordId: best?.id ?? null,
    nearestName: best?.templateName ?? null,
  };
}

function evaluateDocumentRow(row: RequirementRowInput, docs: readonly Scored[], rules: readonly SatisfactionRule[]): RequirementStatus {
  const out = emptyStatus(row);
  const options: ClosureOption[] = row.options
    .filter((o): o is RequirementOptionInput & { documentTypeId: string } => Boolean(o.documentTypeId))
    .map((o) => ({ typeId: o.documentTypeId, sortOrder: o.sortOrder, id: o.id }));
  const satisfiers = satisfierClosure(options, rules);
  const candidates: Candidate[] = [];
  for (const d of docs) {
    const s = d.doc.documentTypeId ? satisfiers.get(d.doc.documentTypeId) : undefined;
    if (s) candidates.push({ ...d, satisfier: s });
  }
  const counting = candidates.filter((c) => satisfiesRequirements(c.doc.verificationStatus)).sort(cmpBest);
  const best = counting[0];
  if (best) {
    const state: RequirementState =
      best.bucket === 'expired' ? 'expired' : best.bucket === 'expiring' || best.bucket === 'expiring_soon' ? 'expiring' : 'met';
    return {
      ...out,
      state,
      satisfyingDocumentId: best.doc.id,
      satisfyingTypeId: best.doc.documentTypeId,
      satisfyingName: best.doc.typeName ?? null,
      satisfiedVia: best.satisfier.kind,
      viaOptionTypeId: best.satisfier.viaOptionTypeId,
      nextExpiry: best.doc.noExpiry ? null : best.doc.expiryDate,
      noExpiry: best.doc.noExpiry,
      bucket: best.bucket,
      daysRemaining: best.daysRemaining,
      verificationStatus: best.doc.verificationStatus,
      isConditional: showsAmber(best.doc.verificationStatus),
      isMuted: best.doc.alertsMuted,
      missingDate: best.noDate,
      hasFile: best.doc.hasFile,
    };
  }
  const rejected = candidates.filter((c) => !satisfiesRequirements(c.doc.verificationStatus)).sort(cmpRejected)[0];
  if (rejected) {
    return {
      ...out,
      gapReason: 'rejected',
      nearestDocumentId: rejected.doc.id,
      nearestTypeId: rejected.doc.documentTypeId,
      nearestName: rejected.doc.typeName ?? null,
    };
  }
  const categories = new Set(row.options.map((o) => o.categoryKey).filter((c): c is string => Boolean(c)));
  const near = docs
    .filter(
      (d) =>
        d.doc.categoryKey &&
        categories.has(d.doc.categoryKey) &&
        satisfiesRequirements(d.doc.verificationStatus) &&
        !(d.doc.documentTypeId && satisfiers.has(d.doc.documentTypeId)),
    )
    .sort(cmpNear)[0];
  if (near) {
    return {
      ...out,
      gapReason: 'not_linked',
      nearestDocumentId: near.doc.id,
      nearestTypeId: near.doc.documentTypeId,
      nearestName: near.doc.typeName ?? null,
    };
  }
  return { ...out, gapReason: 'none' };
}

/**
 * The status of every requirement ticked for the person's position (SQL
 * crew_requirement_status_for for one person), ordered by the rows' sort
 * order then id. Documents with no type and removed documents never count.
 */
export function evaluateRequirements(input: EvaluateInput): RequirementStatus[] {
  if (!input.positionId) return [];
  const docs = input.documents
    .filter((d) => !d.deleted && d.documentTypeId)
    .map((d) => score(d, input.today));
  const required = input.rows
    .filter((r) => r.positionIds.includes(input.positionId as string))
    .sort((a, b) => a.sortOrder - b.sortOrder || cmpStr(a.id, b.id));
  return required.map((row) =>
    row.kind === 'familiarisation' ? evaluateFamiliarisation(row, input.familiarisation ?? []) : evaluateDocumentRow(row, docs, input.rules),
  );
}

// ---------------------------------------------------------------- summary (SQL crew_compliance_summary_for)

export interface ComplianceIssue {
  rowId: string;
  label: string;
  tab: ComplianceTab;
  state: RequirementState;
  reason: ComplianceIssueReason;
}

export interface ComplianceCounts {
  required: number;
  met: number;
  expiring: number;
  expired: number;
  missing: number;
  conditional: number;
  muted: number;
  docsRequired: number;
  docsMet: number;
  stcwRequired: number;
  stcwMet: number;
  qualsRequired: number;
  qualsMet: number;
  famRequired: number;
  famMet: number;
  status: ComplianceStatus;
  nextExpiry: string | null;
  dotDocuments: ComplianceDot;
  dotQualifications: ComplianceDot;
  issues: ComplianceIssue[];
}

/** The issue a status row raises (the tooltip and the dots), first match: expired, missing, expiring with alerts on, conditional, a missing date. */
export function issueReason(s: Pick<RequirementStatus, 'state' | 'isMuted' | 'isConditional' | 'missingDate'>): ComplianceIssueReason | null {
  if (s.state === 'expired') return 'expired';
  if (s.state === 'missing') return 'missing';
  if (s.state === 'expiring' && !s.isMuted) return 'expiring';
  if (s.isConditional) return 'conditional';
  if (s.missingDate) return 'missing_date';
  return null;
}

const ISSUE_ORDER: Readonly<Record<ComplianceIssueReason, number>> = { expired: 0, missing: 1, expiring: 2, conditional: 3, missing_date: 4 };

/** A person's counts, status, next expiry, dots and issues from their status rows. */
export function summariseCompliance(rows: readonly RequirementStatus[]): ComplianceCounts {
  let met = 0;
  let expiring = 0;
  let expired = 0;
  let missing = 0;
  let conditional = 0;
  let muted = 0;
  let expiringOpen = 0;
  const tab = { documents: [0, 0], stcw: [0, 0], qualifications: [0, 0], familiarisation: [0, 0] } as Record<ComplianceTab, [number, number]>;
  let docsBad = 0;
  let docsWarn = 0;
  let qualsBad = 0;
  let qualsWarn = 0;
  let nextExpiry: string | null = null;
  const issues: Array<ComplianceIssue & { sort: number }> = [];
  for (const r of rows) {
    const ok = r.state === 'met' || r.state === 'expiring';
    tab[r.tab][0] += 1;
    if (ok) {
      met += 1;
      tab[r.tab][1] += 1;
      if (r.isConditional) conditional += 1;
      if (r.nextExpiry && (nextExpiry === null || r.nextExpiry < nextExpiry)) nextExpiry = r.nextExpiry;
    }
    if (r.state === 'expiring') expiring += 1;
    if (r.state === 'expired') expired += 1;
    if (r.state === 'missing') missing += 1;
    if (r.state !== 'missing' && r.isMuted) muted += 1;
    const reason = issueReason(r);
    if (reason === 'expiring') expiringOpen += 1;
    const bad = reason === 'expired' || reason === 'missing';
    const warn = reason === 'expiring' || reason === 'conditional' || reason === 'missing_date';
    if (r.tab === 'documents') {
      if (bad) docsBad += 1;
      if (warn) docsWarn += 1;
    } else if (r.tab === 'stcw' || r.tab === 'qualifications') {
      if (bad) qualsBad += 1;
      if (warn) qualsWarn += 1;
    }
    if (reason) issues.push({ rowId: r.rowId, label: r.label, tab: r.tab, state: r.state, reason, sort: r.rowSort });
  }
  issues.sort((a, b) => ISSUE_ORDER[a.reason] - ISSUE_ORDER[b.reason] || a.sort - b.sort || cmpStr(a.rowId, b.rowId));
  return {
    required: rows.length,
    met,
    expiring,
    expired,
    missing,
    conditional,
    muted,
    docsRequired: tab.documents[0],
    docsMet: tab.documents[1],
    stcwRequired: tab.stcw[0],
    stcwMet: tab.stcw[1],
    qualsRequired: tab.qualifications[0],
    qualsMet: tab.qualifications[1],
    famRequired: tab.familiarisation[0],
    famMet: tab.familiarisation[1],
    status: complianceStatus(expired, missing, expiringOpen),
    nextExpiry,
    dotDocuments: complianceDot(tab.documents[0], docsBad, docsWarn),
    dotQualifications: complianceDot(tab.stcw[0] + tab.qualifications[0], qualsBad, qualsWarn),
    issues: issues.map(({ sort: _sort, ...issue }) => issue),
  };
}

// ---------------------------------------------------------------- what the UI asks of it

/** A requirement the person still needs (the add dialog's "Missing for current role" quick-add). */
export interface MissingRequirement {
  rowId: string;
  label: string;
  tab: ComplianceTab;
  state: Extract<RequirementState, 'missing' | 'expired'>;
  /** The document types that would satisfy it, in option order. */
  optionTypeIds: string[];
  gapReason: GapReason | null;
}

/**
 * The document requirements the person has not met (missing, or only
 * expired satisfiers), worst first then in row order, with the option
 * types to offer. Familiarisation rows are left out: they are met by a
 * record, not a document.
 */
export function missingForRole(
  statuses: readonly Pick<RequirementStatus, 'rowId' | 'label' | 'tab' | 'state' | 'kind' | 'rowSort' | 'gapReason'>[],
  optionsByRow: ReadonlyMap<string, readonly string[]>,
): MissingRequirement[] {
  return statuses
    .filter((s): s is typeof s & { state: 'missing' | 'expired' } => s.kind === 'document' && (s.state === 'missing' || s.state === 'expired'))
    .sort((a, b) => (a.state === b.state ? 0 : a.state === 'missing' ? -1 : 1) || a.rowSort - b.rowSort || cmpStr(a.rowId, b.rowId))
    .map((s) => ({ rowId: s.rowId, label: s.label, tab: s.tab, state: s.state, optionTypeIds: [...(optionsByRow.get(s.rowId) ?? [])], gapReason: s.gapReason }));
}

/** The words of a cell: what satisfies it, or why it is missing (every missing cell explains itself; every met cell names its document). */
export function requirementExplanation(s: Pick<RequirementStatus, 'state' | 'satisfiedVia' | 'satisfyingName' | 'gapReason' | 'nearestName' | 'isConditional' | 'missingDate' | 'isMuted'>): string {
  if (s.state === 'missing') {
    switch (s.gapReason) {
      case 'rejected':
        return s.nearestName ? `Missing: ${s.nearestName} was rejected.` : 'Missing: the document held was rejected.';
      case 'not_linked':
        return s.nearestName ? `Missing. Nearest held: ${s.nearestName}, which does not count for this requirement.` : 'Missing.';
      case 'in_progress':
        return s.nearestName ? `Missing: ${s.nearestName} is not completed yet.` : 'Missing: the familiarisation is not completed yet.';
      default:
        return 'Missing: nothing held counts for this requirement.';
    }
  }
  const name = s.satisfyingName ?? 'a document';
  const how: Record<SatisfiedVia, string> = {
    option: `Held: ${name}.`,
    component: `Covered by ${name} (a combined certificate).`,
    supersedes: `Covered by ${name} (a higher certificate).`,
    equivalent: `Covered by ${name} (an accepted equivalent).`,
    familiarisation: `Completed: ${name}.`,
  };
  const parts = [s.satisfiedVia ? how[s.satisfiedVia] : `Held: ${name}.`];
  if (s.state === 'expired') parts[0] = `Expired: ${name}.`;
  if (s.state === 'expiring') parts.push(s.isMuted ? 'Expiring soon (alerts off).' : 'Expiring soon.');
  if (s.isConditional) parts.push('Conditionally approved.');
  if (s.missingDate) parts.push('Expiry date missing.');
  return parts.join(' ');
}

/** Days from today to a date (negative once passed); null without a date. */
export function daysUntil(day: string | null | undefined, today: DateInput): number | null {
  if (!day) return null;
  return daysBetween(toCalendarDate(today), toCalendarDate(day));
}
