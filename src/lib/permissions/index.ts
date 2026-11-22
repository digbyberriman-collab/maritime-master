/**
 * Capability checks (PMS v1 keys) for STORM.
 *
 *   const canApprove = useCan('vessel.safety.permit_to_work.approve');
 *   <Can capability="vessel.safety.drills.create">…</Can>
 *   <ModuleRoute capability="vessel.safety.drills.view">…</ModuleRoute>
 *
 * Backed by the interim adaptor (DECISIONS D-04) until the PMS runtime lands.
 */
export {
  CAPABILITY_ACTIONS,
  isCapabilityAction,
  isCapabilityKey,
  parseCapabilityKey,
} from './types';
export type {
  CanContext,
  CapabilityAction,
  CapabilityKey,
  ParsedCapabilityKey,
  SubcategoryPath,
} from './types';
export { getCatalogueEntry, listCatalogueCapabilities, listCatalogueEntries } from './catalogue';
export type { CatalogueEntry } from './catalogue';
export { requiredLevel, resolveCapability, ruleForCapability } from './adaptor';
export type {
  AccessDomain,
  AccessLevel,
  AccessSnapshot,
  CapabilityDecision,
  CapabilityRule,
  CapabilityStatus,
} from './adaptor';
export { useAccessSnapshot, useCan, useCapability } from './useCan';
export { Can } from './Can';
export type { CanProps } from './Can';
