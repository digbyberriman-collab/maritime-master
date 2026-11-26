/**
 * Route paths and capability keys for the development (training) module.
 * Fleet paths are relative to `/fleet`, vessel paths to `/v/:vesselCode`.
 * Kept apart from the manifest so pages can import them, and so the
 * manifest, the router and the nav cannot drift.
 */
import type { CapabilityKey } from '@/lib/permissions/types';

/** The fleet training area, relative to `/fleet` (the slug of its nav leaf). */
export const FLEET_TRAINING_ROOT = 'training';

/** Fleet pages, relative to `/fleet`. */
export const DEVELOPMENT_FLEET_PATHS = {
  /** Redirects to the overview tab (X5-07B). */
  training: FLEET_TRAINING_ROOT,
  /** Fleet › Training, one tab per segment (FleetTrainingPage; gap/02 TR1–TR3, TR7, TR8, TR10). */
  trainingTab: `${FLEET_TRAINING_ROOT}/:tab`,
} as const;

/** The tabs of Fleet › Training, in their order; an unknown segment opens the first. */
export const FLEET_TRAINING_TABS = ['overview', 'by-vessel', 'applications', 'catalogue', 'settings'] as const;
export type FleetTrainingTab = (typeof FLEET_TRAINING_TABS)[number];

/** Absolute link to a Fleet › Training tab, with an optional query (`?vessel=DRA&status=awaiting`). */
export function fleetTrainingPath(tab: FleetTrainingTab = 'overview', query?: URLSearchParams | null): string {
  const qs = query?.toString();
  return `/fleet/${FLEET_TRAINING_ROOT}/${tab}${qs ? `?${qs}` : ''}`;
}

/** The vessel Crew tab's root, the base of the vessel Crew Training leaf. */
export const VESSEL_CREW_ROOT = 'crew';

/** Vessel pages, relative to `/v/:vesselCode`. */
export const DEVELOPMENT_VESSEL_PATHS = {
  crewTraining: `${VESSEL_CREW_ROOT}/training`,
} as const;

/**
 * The PMS keys of Fleet › Training (gap/02 X5; PP1). The server gates the
 * same rules (`fleet_ops_can` area `training`): view reads the fleet
 * registers; edit enrols, records completions and corrects details; admin
 * keeps the catalogue and the programme settings
 * (`development_admin_gate`) and voids, reimburses and closes; export
 * downloads the applications register.
 */
export const TRAINING_CAPS = {
  view: 'fleet.operations.fleet_training.view',
  edit: 'fleet.operations.fleet_training.edit',
  admin: 'fleet.operations.fleet_training.admin',
  export: 'fleet.operations.fleet_training.export',
} as const satisfies Record<string, CapabilityKey>;

/**
 * The PMS keys of the vessel's Crew Training register (gap/04 C62,
 * D-X1-7). `approve` is the head of department's step, `final_approve`
 * the Captain's and the Purser's (the server checks the office itself,
 * `development_actor_roles_for`).
 */
export const VESSEL_CREW_TRAINING_CAPS = {
  view: 'vessel.crew.crew_training.view',
  approve: 'vessel.crew.crew_training.approve',
  finalApprove: 'vessel.crew.crew_training.final_approve',
  export: 'vessel.crew.crew_training.export',
} as const satisfies Record<string, CapabilityKey>;

/** Every key the module's pages and actions use (the manifest declares them). */
export const DEVELOPMENT_CAPABILITIES: readonly CapabilityKey[] = [...Object.values(TRAINING_CAPS), ...Object.values(VESSEL_CREW_TRAINING_CAPS)];

/** The query parameters of the applications register (all optional; codes, keys and flags only). */
export const TRAINING_REGISTER_PARAMS = {
  vessel: 'vessel',
  category: 'category',
  status: 'status',
  clawback: 'clawback',
  q: 'q',
  /** The application opened in the dialog (a notification's deep link). */
  application: 'application',
} as const;
