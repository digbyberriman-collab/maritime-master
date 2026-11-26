/**
 * Forms & Checklists module manifest (BUILD-PLAN B8; gap/00 A2; gap/02
 * FC1–FC7, W2; X5 spec §1, X5-06B). Data only: the registry loads it
 * eagerly, so it imports nothing but icons, the nav builders, the slot ids
 * and paths. Every page is a lazy chunk.
 *
 * - routes (Fleet scope, relative to `/fleet`):
 *   - `forms`: the overview by where crews find templates on board
 *     (FleetFormsOverviewPage, FC1), guard
 *     `fleet.operations.fleet_checklists.view`. Registering it arms the
 *     legacy `/ism/forms/templates` redirect for readers with fleet reach
 *     (PP3 pendingTarget).
 *   - `forms/new`: a new template (FormTemplateBuilderPage, FC3), guard
 *     `.create`; `?area=` preselects the area. A static segment, so it
 *     outranks `:area`.
 *   - `forms/:area`: one area (FleetFormsAreaPage, FC2, FC4), guard `.view`.
 *     The page maps the slug to the area enum (`technical-forms` ↔
 *     `technical_forms`, plus `unsorted`); anything else is the in-scope
 *     "Area not found".
 *   - `forms/:templateId/edit`: the builder on a draft, guard `.edit`; a
 *     published template offers its next version.
 *   - `forms/:templateId/preview`: what crews will see
 *     (FormTemplatePreviewPage), guard `.view`.
 *   Every guard is a capability (ModuleRoute, fails closed); each page
 *   checks the same key before it reads anything.
 * - nav: `fleet.compliance` Forms & Checklists at order 20, beta, with the
 *   view key.
 * - capabilities: the catalogue keys (./paths.ts FORMS_CAPS).
 *
 * Platform-prep PP3 created the planned leaf; X5-06B added the routes and
 * flipped it to beta.
 */
import { CheckSquare } from 'lucide-react';
import type { ModuleManifest } from '@/app/registry/types';
import { L } from '@/config/navBuilders';
import { FLEET_ROOT } from '@/modules/fleet/paths';
import { FORMS_CAPABILITIES, FORMS_CAPS, FORMS_FLEET_PATHS, FORMS_FLEET_ROOT } from './paths';

const manifest: ModuleManifest = {
  id: 'forms',
  label: 'Forms & Checklists',
  scopes: ['fleet'],
  routes: [
    {
      scope: 'fleet',
      path: FORMS_FLEET_PATHS.index,
      page: () => import('@/modules/forms/pages/FleetFormsOverviewPage'),
      guard: { kind: 'capability', capability: FORMS_CAPS.view },
      label: 'Forms & Checklists',
    },
    {
      scope: 'fleet',
      path: FORMS_FLEET_PATHS.create,
      page: () => import('@/modules/forms/pages/FormTemplateBuilderPage'),
      guard: { kind: 'capability', capability: FORMS_CAPS.create },
      label: 'New template',
    },
    {
      scope: 'fleet',
      path: FORMS_FLEET_PATHS.area,
      page: () => import('@/modules/forms/pages/FleetFormsAreaPage'),
      guard: { kind: 'capability', capability: FORMS_CAPS.view },
      label: 'Forms & Checklists area',
    },
    {
      scope: 'fleet',
      path: FORMS_FLEET_PATHS.edit,
      page: () => import('@/modules/forms/pages/FormTemplateBuilderPage'),
      guard: { kind: 'capability', capability: FORMS_CAPS.edit },
      label: 'Edit template',
    },
    {
      scope: 'fleet',
      path: FORMS_FLEET_PATHS.preview,
      page: () => import('@/modules/forms/pages/FormTemplatePreviewPage'),
      guard: { kind: 'capability', capability: FORMS_CAPS.view },
      label: 'Template preview',
    },
  ],
  nav: [
    {
      slot: 'fleet.compliance',
      order: 20,
      node: L('Forms & Checklists', FLEET_ROOT, { icon: CheckSquare, slug: FORMS_FLEET_ROOT, status: 'beta', capability: FORMS_CAPS.view }),
    },
  ],
  capabilities: FORMS_CAPABILITIES,
};

export default manifest;
