/**
 * Field validation, completion and signature-policy rules shared by the
 * workspace and the review pages. The database applies the same signature
 * policies in its RPCs; these client rules exist so the crew see what is
 * missing before they try to sign.
 */
import type { ActorCapacity, SigningPolicy, TemplateField } from './templates';
import type { CrewCapacity, ExternalCapacity } from './roles';

export type FieldValues = Record<string, unknown>;

export interface FieldProblem { key: string; message: string; }

export interface SchemaLike { fields: TemplateField[]; signing?: SigningPolicy; }

export const fieldRequired = (field: TemplateField, values: FieldValues) =>
  field.required || Boolean(field.requiredWhen && values[field.requiredWhen.field] === field.requiredWhen.equals);

const DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

export function fieldProblems(schema: SchemaLike, values: FieldValues = {}, complete = false): FieldProblem[] {
  const problems: FieldProblem[] = [];
  for (const key of Object.keys(values)) {
    if (!schema.fields.some((f) => f.key === key)) problems.push({ key, message: 'Unexpected entry field.' });
  }
  for (const field of schema.fields) {
    const value = values[field.key];
    const empty = value === '' || value === undefined || value === null;
    if (empty) {
      if (complete && fieldRequired(field, values)) problems.push({ key: field.key, message: `${field.label} is required before signing.` });
      continue;
    }
    let message: string | undefined;
    if (field.type === 'number') {
      const min = field.min ?? -Infinity;
      const max = field.max ?? Infinity;
      if (!(typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max)) {
        message = `${field.label} must be between ${field.min} and ${field.max}.`;
      }
    } else if (typeof value !== 'string' || value.length > (field.type === 'textarea' ? 4000 : 500)) {
      message = `${field.label} is invalid or too long.`;
    }
    if (field.options && !field.options.includes(value as string)) message = `Choose a valid ${field.label}.`;
    if (field.type === 'datetime-local' && typeof value === 'string') {
      const valid = DATETIME.test(value) && Number.isFinite(Date.parse(`${value}Z`)) && new Date(`${value}Z`).toISOString().slice(0, 16) === value;
      if (!valid) message = `${field.label} must be a valid UTC date and time.`;
    }
    if (message) problems.push({ key: field.key, message });
  }
  for (const [start, end] of [['startTime', 'endTime'], ['validFrom', 'validTo']] as const) {
    const a = values[start];
    const b = values[end];
    if (typeof a === 'string' && typeof b === 'string' && a && b && b < a) {
      problems.push({ key: end, message: 'Finish time must be on or after start time.' });
    }
  }
  return problems;
}

export interface Completion { total: number; filled: number; missing: FieldProblem[]; }

export function completion(schema: SchemaLike, fields: FieldValues): Completion {
  const required = schema.fields.filter((f) => fieldRequired(f, fields));
  const missing = fieldProblems(schema, fields, true);
  return {
    total: required.length,
    filled: required.filter((f) => fields[f.key] !== undefined && fields[f.key] !== null && fields[f.key] !== '').length,
    missing,
  };
}

/** The capacities recorded against an entry: author, countersigners, attested witnesses and the verifying Master. */
export interface SignatureLike {
  kind: 'author' | 'countersign' | 'verify' | 'acknowledge' | 'attested';
  actor_id: string | null;
  actor_capacity: ActorCapacity | string | null;
  witness_capacity?: ActorCapacity | string | null;
}

const capacitiesPresent = (signatures: SignatureLike[]): Set<string> => {
  const set = new Set<string>();
  for (const signature of signatures) {
    if (signature.kind === 'acknowledge') continue;
    // An attested witness counts both the witness and the Master who attested it.
    if (signature.kind === 'attested' && signature.witness_capacity) set.add(signature.witness_capacity);
    if (signature.actor_capacity) set.add(signature.actor_capacity);
  }
  return set;
};

/** Human-readable list of the signatures a policy still needs. `withMaster` treats the Master's page review as present. */
export function missingSigners(policy: SigningPolicy | undefined, signatures: SignatureLike[], withMaster = false): string[] {
  if (!policy) return [];
  const actors = capacitiesPresent(signatures);
  if (withMaster) actors.add('master');
  const missing: string[] = [];
  if (!actors.has('master')) missing.push('Master');
  if (policy === 'master-crew' && !['officer', 'engineer', 'steward'].some((id) => actors.has(id))) missing.push('another crew member');
  if (policy === 'master-officer' && !['officer', 'engineer'].some((id) => actors.has(id))) missing.push('another officer');
  if (policy === 'inspector-crew' && ['master', 'officer', 'engineer', 'steward'].filter((id) => actors.has(id)).length < 2) missing.push('another crew member');
  if (policy === 'master-catering' && !actors.has('steward')) missing.push('catering witness');
  if (policy === 'master-mother' && !actors.has('mother')) missing.push('mother');
  if (policy === 'surveyor-master' && !actors.has('surveyor')) missing.push('authorized surveyor');
  if (policy === 'port-master' && !actors.has('portofficial')) missing.push('port official');
  return missing;
}

/** External witness capacity a policy calls for, if any. The Master attests that witness's signature. */
export function externalWitnessFor(policy: SigningPolicy | undefined): ExternalCapacity | null {
  if (policy === 'master-mother') return 'mother';
  if (policy === 'surveyor-master') return 'surveyor';
  if (policy === 'port-master') return 'portofficial';
  return null;
}

export interface EntryLike {
  status: string;
  recorded_by: string | null;
  superseded_by_id?: string | null;
  schema_snapshot?: { signing?: SigningPolicy; acknowledgement?: boolean } | null;
}

/** Whether this user (with this capacity) may add a crew countersignature to a signed entry. */
export function canCountersign(entry: EntryLike, signatures: SignatureLike[], capacity: CrewCapacity | null, userId: string | null): boolean {
  const policy = entry.schema_snapshot?.signing;
  if (!policy || !capacity || !userId) return false;
  if (!['signed', 'verified'].includes(entry.status) || entry.superseded_by_id || userId === entry.recorded_by) return false;
  if (signatures.some((s) => s.kind === 'countersign' && s.actor_id === userId)) return false;
  if (policy === 'master-catering') return capacity === 'steward';
  if (policy === 'master-officer') return capacity === 'officer' || capacity === 'engineer';
  if (policy === 'master-crew' || policy === 'inspector-crew') return ['officer', 'engineer', 'steward'].includes(capacity);
  return false;
}

/** Whether the Master may record an attested external-witness signature on this entry. */
export function canAttestWitness(entry: EntryLike, signatures: SignatureLike[], capacity: CrewCapacity | null): ExternalCapacity | null {
  const witness = externalWitnessFor(entry.schema_snapshot?.signing);
  if (!witness || capacity !== 'master') return null;
  if (!['signed', 'verified'].includes(entry.status) || entry.superseded_by_id) return null;
  if (signatures.some((s) => s.kind === 'attested' && s.witness_capacity === witness)) return null;
  return witness;
}

export function canVerify(entry: EntryLike, capacity: CrewCapacity | null): boolean {
  return capacity === 'master' && entry.status === 'signed' && !entry.superseded_by_id;
}

export function canAcknowledge(entry: EntryLike, signatures: SignatureLike[], capacity: CrewCapacity | null, userId: string | null): boolean {
  if (!capacity || !userId || !entry.schema_snapshot?.acknowledgement) return false;
  if (entry.status === 'draft' || entry.superseded_by_id) return false;
  return !signatures.some((s) => s.kind === 'acknowledge' && s.actor_id === userId);
}
