/**
 * The area model of the form and checklist catalogue (gap/02 FC1, FC2,
 * W2; DECISIONS C6; X5 spec §1 route table, §2 X5-06A).
 *
 * A template's area is where crews find it on board. The lists mirror the
 * named CHECKs of `20261124040500_fleet_form_templates.sql`
 * (`form_templates_area_check`, `_form_kind_check`); src/test/forms/
 * areaModel.test.ts pins them against the file. A template with no area
 * is "Unsorted" (not mapped yet, or the area column not applied yet).
 *
 * The fleet page of an area is `/fleet/forms/:area` with a URL slug per
 * area; the only slug that differs from the stored value is
 * `technical-forms` for `technical_forms`. An unknown slug is no area (the
 * page shows its in-scope 404).
 *
 * Pure: no React, no Supabase.
 */
import type { FormTemplateArea, FormTemplateKind } from '../types/db.pending';

export type { FormTemplateArea, FormTemplateKind } from '../types/db.pending';

/** Every area, in the order the fleet overview shows them. */
export const FORM_TEMPLATE_AREAS = [
  'charter',
  'safety',
  'technical',
  'movement',
  'ptw',
  'familiarisation',
  'crew',
  'sms',
  'technical_forms',
] as const satisfies readonly FormTemplateArea[];

export const FORM_TEMPLATE_KINDS = ['form', 'checklist', 'register', 'passage_plan', 'permit'] as const satisfies readonly FormTemplateKind[];

/** The area's name on the fleet pages (Charter is called Trip on some vessels). */
export const AREA_LABELS: Readonly<Record<FormTemplateArea, string>> = {
  charter: 'Charter / Trip',
  safety: 'Safety',
  technical: 'Technical',
  movement: 'Movement',
  ptw: 'Permits',
  familiarisation: 'Familiarisation',
  crew: 'Crew',
  sms: 'SMS forms',
  technical_forms: 'Technical forms',
};

/** "Crew find these in …": the vessel menu entry that lists the area's templates. */
export const AREA_CREW_LOCATIONS: Readonly<Record<FormTemplateArea, string>> = {
  charter: 'Charter › Checklists',
  safety: 'Safety › Checklists',
  technical: 'Technical › Forms & Checklists',
  movement: 'Vessel › Voyage Checklists',
  ptw: 'Safety › Permits to Work',
  familiarisation: 'Crew › Familiarisation',
  crew: 'Crew › Checklists',
  sms: 'Safety › SMS Forms',
  technical_forms: 'Technical › Forms & Checklists',
};

export const FORM_KIND_LABELS: Readonly<Record<FormTemplateKind, string>> = {
  form: 'Form',
  checklist: 'Checklist',
  register: 'Register',
  passage_plan: 'Passage plan',
  permit: 'Permit',
};

export const UNSORTED_LABEL = 'Unsorted';
export const UNSORTED_SLUG = 'unsorted';

export const isFormTemplateArea = (value: unknown): value is FormTemplateArea =>
  typeof value === 'string' && (FORM_TEMPLATE_AREAS as readonly string[]).includes(value);

export const isFormTemplateKind = (value: unknown): value is FormTemplateKind =>
  typeof value === 'string' && (FORM_TEMPLATE_KINDS as readonly string[]).includes(value);

/** The URL slug of an area (`technical_forms` → `technical-forms`). */
export function areaSlug(area: FormTemplateArea): string {
  return area.replace(/_/g, '-');
}

/** The area of a URL slug; null for anything else (the stored spelling `technical_forms` included: slugs are canonical). */
export function areaFromSlug(slug: string | null | undefined): FormTemplateArea | null {
  if (!slug) return null;
  return FORM_TEMPLATE_AREAS.find((area) => areaSlug(area) === slug) ?? null;
}

/** The label of an area, or "Unsorted" for none or an unknown value. */
export function areaLabel(area: string | null | undefined): string {
  return isFormTemplateArea(area) ? AREA_LABELS[area] : UNSORTED_LABEL;
}

/** Where crews find an area's templates; null for Unsorted (they are on no vessel menu). */
export function areaCrewLocation(area: string | null | undefined): string | null {
  return isFormTemplateArea(area) ? AREA_CREW_LOCATIONS[area] : null;
}

export function formKindLabel(kind: string | null | undefined): string | null {
  return isFormTemplateKind(kind) ? FORM_KIND_LABELS[kind] : null;
}

export interface AreaGroup<T> {
  /** null = Unsorted. */
  area: FormTemplateArea | null;
  label: string;
  items: T[];
}

/**
 * Templates grouped by area in the overview's order, Unsorted (no area or
 * an unknown one) last; areas with no template are left out unless
 * `includeEmpty`. Order inside a group is kept.
 */
export function groupByArea<T>(items: readonly T[], areaOf: (item: T) => string | null | undefined, includeEmpty = false): AreaGroup<T>[] {
  const buckets = new Map<FormTemplateArea | null, T[]>();
  for (const item of items) {
    const raw = areaOf(item);
    const area = isFormTemplateArea(raw) ? raw : null;
    const list = buckets.get(area) ?? [];
    list.push(item);
    buckets.set(area, list);
  }
  const groups: AreaGroup<T>[] = [];
  for (const area of FORM_TEMPLATE_AREAS) {
    const list = buckets.get(area) ?? [];
    if (list.length || includeEmpty) groups.push({ area, label: AREA_LABELS[area], items: list });
  }
  const unsorted = buckets.get(null) ?? [];
  if (unsorted.length) groups.push({ area: null, label: UNSORTED_LABEL, items: unsorted });
  return groups;
}
