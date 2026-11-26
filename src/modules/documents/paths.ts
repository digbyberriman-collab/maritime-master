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

/** Vessel pages, relative to `/v/:vesselCode`. */
export const DOCUMENTS_VESSEL_PATHS = {
  /** The documents the company publishes to the vessel, to read and acknowledge (X5-05A; gap/02 FD9). */
  fleetDocuments: `${VESSEL_SAFETY_ROOT}/fleet-documents`,
} as const;

/** `?doc=<document id>` on the vessel page opens that document (the notifications link there). */
export const FLEET_DOCUMENT_DOC_PARAM = 'doc';

/**
 * The vessel page's views (`?view=crew`, X5-05B): the caller's own
 * documents (the default) or, for the Master and heads of department, the
 * crew's acknowledgements.
 */
export const VESSEL_FLEET_DOCUMENTS_VIEW_PARAM = 'view';

/**
 * The library's query parameters (`/fleet/documents?tab=&section=&vessel=&settings=1`;
 * on the Acknowledgements tab `?doc=<document id>` picks the document, X5-05B).
 */
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
 * level) removes sections and document types. X5-05B: edit also reminds
 * any vessel's crew (`fleet_document_remind`), and admin chooses who can
 * sign on any vessel (`fleet_document_set_signer_rule`, as the vessel's
 * Master may for their own).
 */
export const DOCUMENTS_CAPS = {
  view: 'fleet.operations.fleet_documents.view',
  create: 'fleet.operations.fleet_documents.create',
  edit: 'fleet.operations.fleet_documents.edit',
  delete: 'fleet.operations.fleet_documents.delete',
  admin: 'fleet.operations.fleet_documents.admin',
} as const satisfies Record<string, CapabilityKey>;

/**
 * The vessel's Fleet documents keys (PP1): view_own opens the vessel page
 * (signed in: everyone reads what is published to their vessel and their
 * own state); sign is the crew member's own acknowledgement. The server
 * decides who may act (`fleet_document_acknowledge` and friends).
 */
export const VESSEL_FLEET_DOCUMENTS_CAPS = {
  viewOwn: 'vessel.safety.fleet_documents.view_own',
  sign: 'vessel.safety.fleet_documents.sign',
} as const satisfies Record<string, CapabilityKey>;

/** Every key the documents manifest declares (ModuleManifest.capabilities). */
export const DOCUMENTS_CAPABILITIES: readonly CapabilityKey[] = [...Object.values(DOCUMENTS_CAPS), ...Object.values(VESSEL_FLEET_DOCUMENTS_CAPS)];
