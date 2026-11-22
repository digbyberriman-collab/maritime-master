/**
 * Capability keys (PMS v1).
 *
 * A capability key has exactly four snake_case segments:
 *
 *   domain.module.subcategory.action      e.g. vessel.safety.permit_to_work.approve
 *
 * The first three segments name a catalogue subcategory
 * (docs/permissions/catalogues/storm.json); the last is one of the PMS
 * actions below. Call sites use these keys today through the interim
 * `useCan` adaptor (DECISIONS D-04) and keep them unchanged when the PMS
 * runtime replaces the adaptor.
 */

/** The PMS v1 action vocabulary, in catalogue order. */
export const CAPABILITY_ACTIONS = [
  'view_own',
  'view',
  'create',
  'edit',
  'delete',
  'export',
  'assign',
  'approve',
  'final_approve',
  'sign',
  'settle',
  'admin',
] as const;

export type CapabilityAction = (typeof CAPABILITY_ACTIONS)[number];

/**
 * A capability key. The template type catches most typos in the action at
 * compile time; `isCapabilityKey()` enforces the exact shape at runtime
 * (four segments, each `[a-z][a-z0-9_]*`).
 */
export type CapabilityKey = `${string}.${string}.${string}.${CapabilityAction}`;

/** The three-segment path that names a catalogue subcategory. */
export type SubcategoryPath = `${string}.${string}.${string}`;

export interface ParsedCapabilityKey {
  domain: string;
  module: string;
  subcategory: string;
  action: CapabilityAction;
  /** `domain.module.subcategory` */
  path: SubcategoryPath;
  /** `domain.module` */
  modulePath: `${string}.${string}`;
}

/**
 * Optional scope for a check. The interim adaptor evaluates capabilities at
 * company level (today's module and level checks are not per vessel), so
 * `vesselId` and `departmentId` are accepted for call-site stability and are
 * enforced once the PMS runtime lands. `subjectProfileId` is enforced now:
 * a `view_own` capability only covers the caller's own record.
 */
export interface CanContext {
  vesselId?: string | null;
  departmentId?: string | null;
  /** `profiles.id` of the person the record is about (D6 subject key). */
  subjectProfileId?: string | null;
}

const SEGMENT = /^[a-z][a-z0-9_]*$/;
const ACTION_SET: ReadonlySet<string> = new Set(CAPABILITY_ACTIONS);

export function isCapabilityAction(value: string): value is CapabilityAction {
  return ACTION_SET.has(value);
}

/** Splits a key into its segments, or returns null when the shape is wrong. */
export function parseCapabilityKey(key: string): ParsedCapabilityKey | null {
  if (typeof key !== 'string') return null;
  const parts = key.split('.');
  if (parts.length !== 4) return null;
  if (!parts.every((part) => SEGMENT.test(part))) return null;
  const [domain, module, subcategory, action] = parts;
  if (!isCapabilityAction(action)) return null;
  return {
    domain,
    module,
    subcategory,
    action,
    path: `${domain}.${module}.${subcategory}`,
    modulePath: `${domain}.${module}`,
  };
}

/** True when `key` has the four-segment snake_case shape with a PMS action. */
export function isCapabilityKey(key: string): key is CapabilityKey {
  return parseCapabilityKey(key) !== null;
}
