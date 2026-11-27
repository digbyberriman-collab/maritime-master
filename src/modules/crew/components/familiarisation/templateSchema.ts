/**
 * The template editor's form (X1-10; gap/04 C63, W11): React Hook Form +
 * zod. The rules are the server's (familiarisation_template_save and
 * familiarisation_sections_normalise in 20261124061000), so a form that
 * passes here is one the server accepts; a refusal it still sends lands on
 * the field its HINT names (templateFieldFor).
 */
import { z } from 'zod';
import { SECTION_LIMITS, trimText, type FamiliarisationPreset, type FamiliarisationSection } from '@/modules/crew/lib/familiarisation';
import type { FamiliarisationTemplate, TemplatePayload } from '@/modules/crew/hooks/useFamiliarisation';

export const TEMPLATE_NAME_MAX = 120;
export const TEMPLATE_DESCRIPTION_MAX = 2000;

const text = (max: number, required: string, tooLong: string) =>
  z.string({ required_error: required }).transform(trimText).pipe(z.string().min(1, required).max(max, tooLong));

const itemSchema = z.object({
  text: text(SECTION_LIMITS.item, 'Write the item', `Keep an item to ${SECTION_LIMITS.item} characters or fewer`),
});

const sectionSchema = z.object({
  name: text(SECTION_LIMITS.name, 'Name the section', `Keep a section name to ${SECTION_LIMITS.name} characters or fewer`),
  items: z.array(itemSchema).min(1, 'Add at least one item').max(SECTION_LIMITS.items, `A section has at most ${SECTION_LIMITS.items} items`),
});

export const templateSchema = z
  .object({
    scope: z.enum(['vessel', 'fleet']),
    variantOf: z.string().nullable(),
    name: text(TEMPLATE_NAME_MAX, 'Name the template', `Keep the name to ${TEMPLATE_NAME_MAX} characters or fewer`),
    description: z
      .string()
      .transform(trimText)
      .pipe(z.string().max(TEMPLATE_DESCRIPTION_MAX, `Keep the description to ${TEMPLATE_DESCRIPTION_MAX.toLocaleString('en-GB')} characters or fewer`)),
    dueWithinDays: z.coerce
      .number({ invalid_type_error: 'Give a number of days' })
      .int('Give a whole number of days')
      .min(0, 'Give 0 to 365 days')
      .max(365, 'Give 0 to 365 days'),
    requiresCrewSignature: z.boolean(),
    requiresSupervisorSignature: z.boolean(),
    isActive: z.boolean(),
    positionIds: z.array(z.string()),
    sections: z.array(sectionSchema).min(1, 'Add at least one section').max(SECTION_LIMITS.sections, `A template has at most ${SECTION_LIMITS.sections} sections`),
  })
  .superRefine((v, ctx) => {
    const seen = new Map<string, number>();
    v.sections.forEach((s, i) => {
      const key = s.name.toLowerCase();
      if (seen.has(key)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['sections', i, 'name'], message: 'Two sections have this name' });
      else seen.set(key, i);
    });
    if (v.variantOf && v.scope !== 'vessel') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['variantOf'], message: 'Only a vessel template replaces a fleet template' });
    }
  });

/**
 * The form's values. Written out (not z.infer) so every key is required
 * under the app's non-strict compiler settings; `dueWithinDays` is a string
 * while typed in the number field and a number once the schema has run.
 */
export interface TemplateFormValues {
  scope: 'vessel' | 'fleet';
  variantOf: string | null;
  name: string;
  description: string;
  dueWithinDays: number | string;
  requiresCrewSignature: boolean;
  requiresSupervisorSignature: boolean;
  isActive: boolean;
  positionIds: string[];
  sections: { name: string; items: { text: string }[] }[];
}
/** The values handleSubmit passes on (the schema's output has the same shape). */
export type TemplateValues = TemplateFormValues;

const toFormSections = (sections: readonly FamiliarisationSection[]): TemplateFormValues['sections'] =>
  sections.map((s) => ({ name: s.section_name, items: s.checklist_items.map((t) => ({ text: t })) }));

/** A blank template: one empty section, both signatures, due in 14 days. */
export function blankTemplateValues(scope: 'vessel' | 'fleet' = 'vessel'): TemplateFormValues {
  return {
    scope,
    variantOf: null,
    name: '',
    description: '',
    dueWithinDays: 14,
    requiresCrewSignature: true,
    requiresSupervisorSignature: true,
    isActive: true,
    positionIds: [],
    sections: [{ name: '', items: [{ text: '' }] }],
  };
}

/** A STORM preset copied into a new template (T-15); positions are chosen by the editor. */
export function presetTemplateValues(preset: FamiliarisationPreset, scope: 'vessel' | 'fleet'): TemplateFormValues {
  return {
    ...blankTemplateValues(scope),
    name: preset.name,
    description: preset.description,
    dueWithinDays: preset.dueWithinDays,
    sections: toFormSections(preset.sections),
  };
}

/** An existing template in the form. */
export function templateFormValues(t: FamiliarisationTemplate): TemplateFormValues {
  return {
    scope: t.scope,
    variantOf: t.variantOf,
    name: t.name,
    description: t.description ?? '',
    dueWithinDays: t.dueWithinDays ?? 14,
    requiresCrewSignature: t.requiresCrewSignature,
    requiresSupervisorSignature: t.requiresSupervisorSignature,
    isActive: t.isActive,
    positionIds: [...t.positionIds],
    sections: t.sections.length ? toFormSections(t.sections) : [{ name: '', items: [{ text: '' }] }],
  };
}

/** The vessel's own version of a fleet template (T-134): its sections and positions copied, the name marked. */
export function variantTemplateValues(fleet: FamiliarisationTemplate, vesselName: string): TemplateFormValues {
  return {
    ...templateFormValues(fleet),
    scope: 'vessel',
    variantOf: fleet.id,
    name: `${vesselName} ${fleet.name}`.slice(0, TEMPLATE_NAME_MAX),
    isActive: true,
  };
}

/** The save's payload: scope and variant only when the template is new (the server keeps them). */
export function toTemplatePayload(values: TemplateValues, creating: boolean): TemplatePayload {
  const payload: TemplatePayload = {
    name: values.name,
    description: values.description === '' ? null : values.description,
    due_within_days: Number(values.dueWithinDays),
    requires_crew_signature: values.requiresCrewSignature,
    requires_supervisor_signature: values.requiresSupervisorSignature,
    sections: values.sections.map((s) => ({ section_name: s.name, checklist_items: s.items.map((i) => i.text) })),
    position_ids: [...new Set(values.positionIds)],
  };
  if (creating) {
    payload.scope = values.scope;
    if (values.variantOf) payload.variant_of = values.variantOf;
  } else {
    payload.is_active = values.isActive;
  }
  return payload;
}

type TemplateField = 'name' | 'description' | 'dueWithinDays' | 'positionIds' | 'sections' | 'scope' | 'variantOf';

/** The form field a server refusal names in its HINT (sections.<n> -> the section's name). */
export function templateFieldFor(hint: string | null | undefined): { field: TemplateField | `sections.${number}.name`; } | null {
  if (!hint) return null;
  const m = /^sections\.(\d+)$/.exec(hint);
  if (m) return { field: `sections.${Number(m[1]) - 1}.name` };
  const map: Record<string, TemplateField> = {
    name: 'name',
    description: 'description',
    due_within_days: 'dueWithinDays',
    position_ids: 'positionIds',
    sections: 'sections',
    scope: 'scope',
    variant_of: 'variantOf',
  };
  return map[hint] ? { field: map[hint] } : null;
}
