/**
 * Route paths and capability keys for the Forms & Checklists module
 * (gap/02 FC1–FC7). Fleet paths are relative to `/fleet`. Kept apart from
 * the manifest so pages can import them, and so the manifest, the router
 * and the nav cannot drift.
 */
import type { CapabilityKey } from '@/lib/permissions/types';

/** The fleet forms area, relative to `/fleet` (the slug of its nav leaf). */
export const FORMS_FLEET_ROOT = 'forms';

/** Fleet pages, relative to `/fleet` (X5-06B). */
export const FORMS_FLEET_PATHS = {
  /** The overview by area (FleetFormsOverviewPage, gap/02 FC1). */
  index: FORMS_FLEET_ROOT,
  /** A new template (FormTemplateBuilderPage, FC3); `?area=` preselects the area. */
  create: `${FORMS_FLEET_ROOT}/new`,
  /** One area (FleetFormsAreaPage, FC2, FC4): the slug of an area, or `unsorted`. */
  area: `${FORMS_FLEET_ROOT}/:area`,
  /** Edit a draft (FormTemplateBuilderPage); a published template offers a new version. */
  edit: `${FORMS_FLEET_ROOT}/:templateId/edit`,
  /** What crews will see (FormTemplatePreviewPage). */
  preview: `${FORMS_FLEET_ROOT}/:templateId/preview`,
} as const;

/** Absolute links into the fleet forms pages. */
export const fleetFormsPath = {
  index: () => `/fleet/${FORMS_FLEET_ROOT}`,
  area: (slug: string) => `/fleet/${FORMS_FLEET_ROOT}/${slug}`,
  create: (areaSlug?: string | null) => `/fleet/${FORMS_FLEET_ROOT}/new${areaSlug ? `?area=${encodeURIComponent(areaSlug)}` : ''}`,
  edit: (templateId: string) => `/fleet/${FORMS_FLEET_ROOT}/${templateId}/edit`,
  preview: (templateId: string) => `/fleet/${FORMS_FLEET_ROOT}/${templateId}/preview`,
};

/**
 * The overview's and area pages' query parameters: `?vessel=<CODE>` shows
 * one vessel (else the whole fleet); `?tab=available|hidden|drafts` on an
 * area page; `?area=<slug>` on the builder.
 */
export const FORMS_PARAMS = {
  vessel: 'vessel',
  tab: 'tab',
  area: 'area',
} as const;

/**
 * The PMS keys of the fleet catalogue (gap/02 X5, W2; PP1). The server
 * gates the same rules (`fleet_ops_can` area `checklists`): view reads the
 * pages; create and edit write drafts (the live table policies decide who
 * may); admin publishes, versions, customises, archives, moves and deletes
 * (`form_template_gate`), and hides, restores and orders on any vessel.
 * Edit in a vessel's context hides, restores and orders on that vessel
 * (`form_template_vessel_manager_for`, with the vessel's Master).
 */
export const FORMS_CAPS = {
  view: 'fleet.operations.fleet_checklists.view',
  create: 'fleet.operations.fleet_checklists.create',
  edit: 'fleet.operations.fleet_checklists.edit',
  admin: 'fleet.operations.fleet_checklists.admin',
} as const satisfies Record<string, CapabilityKey>;

/** Every key the forms manifest declares (ModuleManifest.capabilities). */
export const FORMS_CAPABILITIES: readonly CapabilityKey[] = Object.values(FORMS_CAPS);
