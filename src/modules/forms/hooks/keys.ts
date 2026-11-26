/**
 * React Query keys of the form template catalogue (X5 spec §0.4). Every
 * key starts with `forms` and carries the company, and the vessel ids
 * where a query is per vessel (sorted, so the same set is the same key).
 *
 * The ISM template pages (`src/modules/ism/forms`) still cache their
 * template lists under `['form-templates', …]` and `['form-template', id]`;
 * the mutations invalidate those too (`LEGACY_TEMPLATE_KEYS`).
 */
import type { FormTemplateArea } from '../types/db.pending';

const sortedIds = (ids: readonly string[] | null | undefined): string[] | null => (ids ? [...ids].sort() : null);

export const formsKeys = {
  all: ['forms'] as const,
  company: (companyId: string | null | undefined) => ['forms', companyId ?? null] as const,
  templates: (companyId: string | null | undefined) => ['forms', companyId ?? null, 'templates'] as const,
  template: (companyId: string | null | undefined, templateId: string | null | undefined) =>
    ['forms', companyId ?? null, 'template', templateId ?? null] as const,
  vesselSettings: (companyId: string | null | undefined, vesselIds: readonly string[] | null | undefined) =>
    ['forms', companyId ?? null, 'vessel-settings', sortedIds(vesselIds)] as const,
  runStats: (companyId: string | null | undefined, vesselIds: readonly string[] | null | undefined, area: FormTemplateArea | null, today: string) =>
    ['forms', companyId ?? null, 'run-stats', sortedIds(vesselIds), area, today] as const,
  events: (companyId: string | null | undefined, templateId: string | null | undefined) =>
    ['forms', companyId ?? null, 'events', templateId ?? null] as const,
};

/** The ISM template pages' own cache roots, invalidated after every template change. */
export const LEGACY_TEMPLATE_KEYS = [['form-templates'], ['form-template']] as const;
