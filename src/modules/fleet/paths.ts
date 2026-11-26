/**
 * Route paths and capability keys for the Fleet operations module. Fleet
 * paths are relative to `/fleet`, vessel paths to `/v/:vesselCode`. Kept
 * apart from the manifest so pages can import them, and so the manifest,
 * the router and the nav cannot drift.
 */
import type { CapabilityKey } from '@/lib/permissions/types';

/** The Fleet view's root (gap/10 IA7), the base its nav leaves are built on. */
export const FLEET_ROOT = '/fleet';

/** The vessel Crew tab's root, the base of the vessel Crew Medical leaf. */
export const VESSEL_CREW_ROOT = 'crew';

/** Fleet routes (relative to `/fleet`); registered by the slice that builds each page. */
export const FLEET_PATHS = {
  /** The fleet medical overview (X5-08). */
  medical: 'medical',
} as const;

/** Vessel routes (relative to `/v/:vesselCode`); registered by the slice that builds each page. */
export const FLEET_VESSEL_PATHS = {
  /** The vessel Crew Medical page (gap/04 C61; X5-08). */
  crewMedical: `${VESSEL_CREW_ROOT}/medical`,
} as const;

/**
 * The PMS keys this module's pages and actions use (X5 spec §1; PP1):
 *
 * - fleet medical overview and the vessel Crew Medical page (X5-08);
 * - the expiry warning windows (`set_expiry_window_rule` /
 *   `clear_expiry_window_rule`, gated by reports admin with fleet reach,
 *   D-X5-02).
 */
export const FLEET_CAPS = {
  medicalView: 'fleet.operations.fleet_medical.view',
  medicalExport: 'fleet.operations.fleet_medical.export',
  medicalAdmin: 'fleet.operations.fleet_medical.admin',
  crewMedicalView: 'vessel.crew.crew_medical.view',
  crewMedicalExport: 'vessel.crew.crew_medical.export',
  expiryWindowsAdmin: 'fleet.operations.fleet_reports.admin',
} as const satisfies Record<string, CapabilityKey>;

/** Every key the fleet manifest declares (ModuleManifest.capabilities). */
export const FLEET_CAPABILITIES: readonly CapabilityKey[] = Object.values(FLEET_CAPS);
