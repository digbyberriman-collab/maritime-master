/**
 * The templates crews on one vessel see in one area (gap/02 FC4, W2; X5
 * spec X5-06B): published, offered on the vessel (all vessels, or the
 * vessel listed), not hidden there, in the vessel's order. Exported from
 * `@/modules/forms` for the vessel pages (Safety › Checklists, and later
 * Technical, Movement, Charter, Crew).
 *
 * - One catalogue read for the company (shared with the fleet pages'
 *   cache) and one settings read for this vessel.
 * - D-01: while the area column is not applied, every published template
 *   offered on the vessel is listed (`areasSetUp: false`, the page says
 *   "Areas are not set up yet"); while the settings table is missing,
 *   nothing is hidden and the order is by name (`settingsSetUp: false`).
 *   Any other failure is an error with Retry, never sample rows.
 * - `enabled` false (no vessel yet, a gate still loading) sends nothing.
 */
import { indexSettings, vesselTemplates, type CatalogueTemplate } from '../lib/catalogueModel';
import type { FormTemplateArea } from '../types/db.pending';
import { useFormTemplateCatalogue, useFormTemplateVesselSettings } from './useFleetFormTemplates';

export type VesselFormTemplatesState =
  | { status: 'loading' }
  | { status: 'error'; error: unknown; retry: () => void }
  | {
      status: 'ready';
      /** Shown on the vessel, in its order. */
      templates: CatalogueTemplate[];
      /** Published templates of the area hidden on the vessel. */
      hiddenCount: number;
      /** The area column exists (040500 applied); without it every template offered on the vessel is listed. */
      areasSetUp: boolean;
      /** The per-vessel settings table exists; without it nothing is hidden and the order is by name. */
      settingsSetUp: boolean;
      /** When the catalogue was read (the page's freshness stamp, D-88). */
      updatedAt: number;
      refreshing: boolean;
    };

export function useVesselFormTemplates(vesselId: string | null | undefined, area: FormTemplateArea, enabled = true): VesselFormTemplatesState {
  const on = enabled && !!vesselId;
  const catalogue = useFormTemplateCatalogue(on);
  const settings = useFormTemplateVesselSettings(vesselId ? [vesselId] : [], on);

  if (!on) return { status: 'loading' };
  if (catalogue.status === 'error') return catalogue;
  if (settings.status === 'error') return settings;
  if (catalogue.status === 'loading' || settings.status === 'loading') return { status: 'loading' };
  const settingsSetUp = settings.status === 'ready';
  const index = indexSettings(settings.status === 'ready' ? settings.settings : []);
  const list = vesselTemplates(catalogue.templates, vesselId as string, catalogue.areasSetUp ? area : undefined, index);
  return {
    status: 'ready',
    templates: list.templates,
    hiddenCount: list.hiddenCount,
    areasSetUp: catalogue.areasSetUp,
    settingsSetUp,
    updatedAt: catalogue.updatedAt,
    refreshing: catalogue.refreshing,
  };
}
