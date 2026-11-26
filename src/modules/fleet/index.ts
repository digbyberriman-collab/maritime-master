/**
 * Public API of the Fleet operations module (gap/02). Other modules (the
 * dashboard, reports, documents) use these; they never import the module's
 * internals. Not imported by the manifest, so none of it reaches the entry
 * chunk until a lazy page pulls it in.
 *
 * - Vessels shown: `useFleetVesselsShown` and `FleetVesselsFilter` (with the
 *   reusable `VesselTickHelpers` / `VesselChecklist` and the pure helpers).
 * - Expiry: `useFleetExpiryItems`, `useFleetExpirySummary`,
 *   `ExpiryBucketSummary`, and the window rules.
 * - Medical (X5-08): `CrewMedicalGrid` (the fleet grid, or one vessel's
 *   with `vesselId`), `useFleetMedicalStatus` and the W8 rules.
 */
export { fleetKeys, type FleetExpiryItemsFilters } from './hooks/keys';
export {
  useFleetVesselsShown,
  type FleetVesselScope,
  type FleetVesselsShownReady,
  type FleetVesselsShownState,
} from './hooks/useFleetVesselsShown';
export {
  ALERT_BUCKETS,
  FleetExpiryError,
  VESSEL_OUT_OF_REACH_MESSAGE,
  normaliseExpiryItemsFilters,
  tallyExpirySummary,
  useFleetExpiryItems,
  useFleetExpirySummary,
  type ExpiryTally,
  type FleetExpiryItem,
  type FleetExpiryItemsPage,
  type FleetExpiryItemsQuery,
  type FleetExpiryState,
  type FleetExpirySummaryEntry,
} from './hooks/useFleetExpiry';
export {
  ExpiryWindowRuleError,
  useClearExpiryWindowRule,
  useExpiryWindowRules,
  useSetExpiryWindowRule,
  type ExpiryWindowRuleView,
  type ExpiryWindowRulesState,
  type SetExpiryWindowRuleInput,
  type WindowFor,
} from './hooks/useExpiryWindowRules';
export {
  FleetVesselsFilter,
  VesselChecklist,
  VesselTickHelpers,
  type FleetVesselsFilterProps,
  type VesselChecklistProps,
  type VesselTickHelpersProps,
} from './components/FleetVesselsFilter';
export { ExpiryBucketSummary, type ExpiryBucketSummaryProps } from './components/ExpiryBucketSummary';
export {
  VESSELS_SHOWN_PARAM,
  isCountedVessel,
  tickVessels,
  toggleVessel,
  vesselTickOptions,
  type FleetGroupName,
  type ShownVessel,
  type VesselTickOption,
  type VesselTickOptions,
} from './lib/vesselsShown';
export { EXPIRY_ITEM_TYPES, EXPIRY_ITEM_TYPE_LABELS, expiryWindowFor, type ExpiryItemType } from './lib/expiryWindows';
export { ENDORSEMENT_STATE_LABELS, type EndorsementState } from './lib/endorsement';
export { FLEET_CAPS, FLEET_PATHS, FLEET_VESSEL_PATHS } from './paths';
export { CrewMedicalGrid, type CrewMedicalGridProps } from './components/CrewMedicalGrid';
export {
  FleetMedicalError,
  fleetMedicalKeys,
  useFleetMedicalSettings,
  useFleetMedicalStatus,
  type CrewMedicalRow,
  type FleetMedicalScope,
  type FleetMedicalState,
} from './hooks/useFleetMedicalStatus';
export {
  MEDICAL_REASONS,
  MEDICAL_REASON_LABELS,
  MEDICAL_REASON_LEVEL,
  MEDICAL_STATUSES,
  medicalStatusOf,
  tallyMedicalStatus,
  type MedicalReason,
  type MedicalStatus,
} from './lib/medicalStatus';
