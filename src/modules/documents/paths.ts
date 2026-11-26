/**
 * Route paths and capability keys for the documents module. Fleet paths
 * are relative to `/fleet`, vessel paths to `/v/:vesselCode`. Kept apart
 * from the manifest so pages can import them, and so the manifest, the
 * router and the nav cannot drift.
 */
import type { CapabilityKey } from '@/lib/permissions/types';

/** Fleet pages, relative to `/fleet`. */
export const DOCUMENTS_FLEET_PATHS = {
  /** The fleet document library (FleetDocumentsPage, X5-04A). */
  index: 'documents',
  /** The controlled document register, the target of the legacy `/documents`. */
  register: 'documents/register',
} as const;

/** The vessel Safety tab's root, the base of the vessel Fleet Documents leaf. */
export const VESSEL_SAFETY_ROOT = 'safety';

/** The library's query parameters (`/fleet/documents?tab=&section=&vessel=&settings=1`). */
export const FLEET_DOCUMENTS_PARAMS = {
  tab: 'tab',
  section: 'section',
  vessel: 'vessel',
  settings: 'settings',
} as const;

/**
 * The PMS keys of the fleet document library (gap/02 X5, W1; PP1). The
 * server gates the same rules with fleet reach (`fleet_ops_can` area
 * `documents`): view reads the library, edit changes it (taxonomy,
 * documents, versions, targets, publish, withdraw), delete (the admin
 * level) removes sections and document types.
 */
export const DOCUMENTS_CAPS = {
  view: 'fleet.operations.fleet_documents.view',
  create: 'fleet.operations.fleet_documents.create',
  edit: 'fleet.operations.fleet_documents.edit',
  delete: 'fleet.operations.fleet_documents.delete',
} as const satisfies Record<string, CapabilityKey>;

/** Every key the documents manifest declares (ModuleManifest.capabilities). */
export const DOCUMENTS_CAPABILITIES: readonly CapabilityKey[] = Object.values(DOCUMENTS_CAPS);
