/**
 * Record-kind registry (gap/08 REG1; DECISIONS G7).
 *
 * One entry per kind of workflow record: who owns it, whether it rides on
 * the record envelope, its company step, its signature-slot template and
 * its policies. Domain streams register their kinds from their module
 * manifests; the `record_kinds` table is seeded from the same definitions,
 * so SQL reads policy from the table and the UI reads it from here.
 *
 * Definitions are plain data (no functions), so an identical
 * re-registration (hot reload, a manifest imported twice) is a no-op, while
 * a different definition under an existing key or prefix is an error.
 */
import { REFERENCE_TYPE_PATTERN } from './reference';
import { createSignatureSheet, validateSlotTemplate, type SignatureSheet, type SlotDefinition } from './signatures';
import type { EnvelopeState } from './companyStep';
import {
  COMPANY_STEPS,
  ENVELOPE_STATUSES,
  type CompanyStep,
  type DeleteRule,
  type EditAfterSign,
  type EnvelopeStatus,
} from './types';

export const SNAPSHOT_REASONS = ['submitted', 'decision', 'closed', 'reopened', 'review_started', 'voided'] as const;
export type SnapshotReason = (typeof SNAPSHOT_REASONS)[number];

const EDIT_AFTER_SIGN: readonly EditAfterSign[] = ['allow_with_flag', 'lock', 'revert_to_draft'];
const DELETE_RULES: readonly DeleteRule[] = ['draft_only', 'never_after_submit', 'until_signed', 'free', 'cascade_parent'];

export type RecordScope = 'vessel' | 'fleet';

export interface RecordKindDefinition {
  /** `<module>.<kind>`, snake_case, e.g. `safety.corrective_action`. */
  key: string;
  /** Owning module; must equal the key's first segment. */
  moduleKey: string;
  /** Gap doc that defines the kind's business rules, e.g. `gap/05`. */
  owningDoc?: string;
  label: string;
  /** Reference prefix (`CA` → `CA-DRA-2026-014`), unique across kinds. */
  refPrefix: string;
  /** Vessel records carry the vessel code in the reference; fleet records do not. */
  scope: RecordScope;
  /** Route of the record page, e.g. `/v/:vesselCode/safety/corrective-actions/:id`. */
  routePattern?: string;
  /** PMS subcategory the kind's capabilities live under, e.g. `vessel.safety.capa`. */
  capabilityPath?: string;
  /** Rides on `record_envelopes` (status, whose move, threads, signatures). */
  enveloped: boolean;
  companyStep: CompanyStep;
  /** Initial report goes to the company first (incident). */
  reportFirst?: boolean;
  /** Company closes with approved / with conditions / not approved (risk assessment). */
  decisionKind?: boolean;
  allowReopen?: boolean;
  allowCloseAs?: boolean;
  editAfterSign: EditAfterSign;
  deleteRule: DeleteRule;
  slotTemplate: readonly SlotDefinition[];
  /** Statuses the kind uses (subset of the envelope vocabulary). */
  statuses?: readonly EnvelopeStatus[];
  snapshotOn?: readonly SnapshotReason[];
  /** Fields masked in diffs, emails and exports (AU7). */
  sensitiveFields?: readonly string[];
  personalData?: boolean;
  legalPrivilege?: boolean;
  /** Evidence may be attached after completion (drills). */
  allowLateEvidence?: boolean;
  retentionYears?: number;
  pdfTemplateKey?: string;
}

export type RecordKind = Readonly<RecordKindDefinition>;

export class RecordKindError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RecordKindError';
  }
}

export class DuplicateRecordKindError extends RecordKindError {
  constructor(message: string) {
    super(message);
    this.name = 'DuplicateRecordKindError';
  }
}

const KEY = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/;
const SUBCATEGORY_PATH = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/;

/** Throws `RecordKindError` describing the first problem with a definition. */
export function validateRecordKind(def: RecordKindDefinition): void {
  const where = `Record kind "${def.key}"`;
  if (!KEY.test(def.key)) throw new RecordKindError(`${where}: key must be "<module>.<kind>" in snake_case`);
  if (def.moduleKey !== def.key.split('.')[0]) throw new RecordKindError(`${where}: moduleKey must be "${def.key.split('.')[0]}"`);
  if (!def.label?.trim()) throw new RecordKindError(`${where}: label is required`);
  if (!REFERENCE_TYPE_PATTERN.test(def.refPrefix)) throw new RecordKindError(`${where}: refPrefix must be 1–8 upper-case letters or digits`);
  if (def.scope !== 'vessel' && def.scope !== 'fleet') throw new RecordKindError(`${where}: scope must be vessel or fleet`);
  if (!COMPANY_STEPS.includes(def.companyStep)) throw new RecordKindError(`${where}: unknown companyStep "${def.companyStep}"`);
  if (!EDIT_AFTER_SIGN.includes(def.editAfterSign)) throw new RecordKindError(`${where}: unknown editAfterSign "${def.editAfterSign}"`);
  if (!DELETE_RULES.includes(def.deleteRule)) throw new RecordKindError(`${where}: unknown deleteRule "${def.deleteRule}"`);

  if (!def.enveloped && (def.companyStep !== 'none' || def.reportFirst || def.decisionKind)) {
    throw new RecordKindError(`${where}: a company step needs the record envelope (enveloped: true)`);
  }
  if (def.reportFirst && def.companyStep === 'none') throw new RecordKindError(`${where}: report-first kinds go to the company (companyStep ≠ none)`);
  if (def.decisionKind && def.companyStep !== 'sign_off') throw new RecordKindError(`${where}: decision kinds need companyStep sign_off`);

  try {
    validateSlotTemplate(def.slotTemplate);
  } catch (e) {
    throw new RecordKindError(`${where}: ${(e as Error).message}`);
  }
  if (def.companyStep === 'none' && def.slotTemplate.some((s) => s.party === 'company')) {
    throw new RecordKindError(`${where}: company signature slots need a company step`);
  }

  if (def.routePattern !== undefined) {
    if (!def.routePattern.startsWith('/')) throw new RecordKindError(`${where}: routePattern must start with "/"`);
    if (def.scope === 'vessel' && !def.routePattern.startsWith('/v/:vesselCode/')) {
      throw new RecordKindError(`${where}: vessel records live under /v/:vesselCode/ (DECISIONS R7)`);
    }
  }
  if (def.capabilityPath !== undefined && !SUBCATEGORY_PATH.test(def.capabilityPath)) {
    throw new RecordKindError(`${where}: capabilityPath must be "domain.module.subcategory"`);
  }
  for (const s of def.statuses ?? []) {
    if (!ENVELOPE_STATUSES.includes(s)) throw new RecordKindError(`${where}: unknown status "${s}"`);
  }
  for (const s of def.snapshotOn ?? []) {
    if (!SNAPSHOT_REASONS.includes(s)) throw new RecordKindError(`${where}: unknown snapshot reason "${s}"`);
  }
  if (def.retentionYears !== undefined && (!Number.isInteger(def.retentionYears) || def.retentionYears < 1)) {
    throw new RecordKindError(`${where}: retentionYears must be a whole number ≥ 1`);
  }
}

function freezeDeep<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value as Record<string, unknown>)) freezeDeep(v);
  }
  return value;
}

/** Stable JSON (sorted keys) for comparing definitions. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export interface RecordKindRegistry {
  /** Validate and add a kind. Identical re-registration is a no-op; a conflict throws. */
  register(def: RecordKindDefinition): RecordKind;
  get(key: string): RecordKind | undefined;
  /** Like `get`, but throws when the kind is not registered. */
  require(key: string): RecordKind;
  has(key: string): boolean;
  list(): RecordKind[];
  byModule(moduleKey: string): RecordKind[];
  /** The kind whose references start with `prefix` (e.g. from a parsed reference). */
  byRefPrefix(prefix: string): RecordKind | undefined;
}

export function createRecordKindRegistry(): RecordKindRegistry {
  const kinds = new Map<string, RecordKind>();
  const prefixes = new Map<string, string>();

  return {
    register(def) {
      validateRecordKind(def);
      const existing = kinds.get(def.key);
      if (existing) {
        if (canonical(existing) === canonical(def)) return existing;
        throw new DuplicateRecordKindError(`Record kind "${def.key}" is already registered with a different definition`);
      }
      const owner = prefixes.get(def.refPrefix);
      if (owner) throw new DuplicateRecordKindError(`Reference prefix "${def.refPrefix}" is already used by "${owner}"`);
      const kind = freezeDeep(structuredCloneData(def));
      kinds.set(def.key, kind);
      prefixes.set(def.refPrefix, def.key);
      return kind;
    },
    get: (key) => kinds.get(key),
    require(key) {
      const kind = kinds.get(key);
      if (!kind) throw new RecordKindError(`Record kind "${key}" is not registered`);
      return kind;
    },
    has: (key) => kinds.has(key),
    list: () => Array.from(kinds.values()),
    byModule: (moduleKey) => Array.from(kinds.values()).filter((k) => k.moduleKey === moduleKey),
    byRefPrefix(prefix) {
      const key = prefixes.get(String(prefix).toUpperCase());
      return key ? kinds.get(key) : undefined;
    },
  };
}

/** Deep copy of plain data, so later mutation of the caller's object cannot change the registry. */
function structuredCloneData<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** The app-wide registry the module manifests register into. */
export const recordKinds: RecordKindRegistry = createRecordKindRegistry();
export const registerRecordKind = (def: RecordKindDefinition): RecordKind => recordKinds.register(def);
export const getRecordKind = (key: string): RecordKind | undefined => recordKinds.get(key);

// ─── Bridges to the engines ───────────────────────────────────────────────

/** A fresh signature sheet from the kind's slot template. */
export function signatureSheetForKind(kind: RecordKind, options: { creatorProfileId?: string | null } = {}): SignatureSheet {
  return createSignatureSheet(kind.slotTemplate, options);
}

/** The envelope-machine state for a record of this kind. */
export function envelopeStateForKind(
  kind: RecordKind,
  record: Pick<EnvelopeState, 'status'> & Partial<Pick<EnvelopeState, 'closedBy' | 'companyAcknowledged' | 'version'>>,
): EnvelopeState {
  return {
    status: record.status,
    companyStep: kind.companyStep,
    reportFirst: kind.reportFirst ?? false,
    decisionKind: kind.decisionKind ?? false,
    allowReopen: kind.allowReopen ?? false,
    allowCloseAs: kind.allowCloseAs ?? false,
    closedBy: record.closedBy ?? null,
    companyAcknowledged: record.companyAcknowledged ?? false,
    version: record.version,
    deleteRule: kind.deleteRule,
  };
}
