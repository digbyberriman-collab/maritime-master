/**
 * What stops a template from being published (gap/02 FC3 "block publish
 * with an empty section", W2 "A template with an empty section or no
 * items cannot leave Draft"; X5 spec §2 X5-06A).
 *
 * Mirrors `form_template_publish_blocker` of
 * `20261124040500_fleet_form_templates.sql`. The template's items are
 * `form_schema.fields` in order; a field of type `section` (any case) is a
 * section header, every other field an item, and the items before the
 * first header form a section of their own (no header). Blockers, in the
 * order the server reports the first one:
 *
 *   name_required       the name is blank
 *   no_section          no item at all (`fields` missing or not a list counts as none)
 *   empty_section       a header with no item before the next header or the end
 *   unlabelled_section  a header with a blank label
 *   unlabelled_item     an item with a blank label (a value that is not an object counts as one)
 *   targets_required    "Selected vessels" with no vessel
 *
 * The server also refuses a listed vessel of another company
 * (`invalid_targets`); the client cannot know, so it is not checked here.
 * The SQL test copies the cases of src/test/forms/publishChecks.test.ts
 * between its publish-cases markers, and the TS test runs them here.
 *
 * Pure: no React, no Supabase.
 */

export const PUBLISH_BLOCKERS = [
  'name_required',
  'no_section',
  'empty_section',
  'unlabelled_section',
  'unlabelled_item',
  'targets_required',
] as const;
export type PublishBlocker = (typeof PUBLISH_BLOCKERS)[number];

export interface PublishCheckInput {
  templateName: string | null | undefined;
  /** `form_templates.form_schema` as stored (any JSON). */
  formSchema: unknown;
  /** `FLEET` (every vessel, including future ones) or `VESSEL_SPECIFIC`. */
  vesselScope: string | null | undefined;
  vesselIds: readonly (string | null)[] | null | undefined;
}

/** One problem, with the field it is about (its index in `form_schema.fields`) where there is one. */
export interface PublishIssue {
  code: PublishBlocker;
  fieldIndex: number | null;
}

export interface TemplateSectionModel {
  /** The header field (index and label), or null for items before the first header. */
  header: { index: number; label: string } | null;
  /** The items in the section (index in `fields` and label, trimmed). */
  items: { index: number; label: string }[];
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** PostgreSQL's `btrim(text)`: spaces only. */
const pgTrim = (value: string): string => value.replace(/^ +| +$/g, '');

/** A JSON value as the server reads it with `->>` and `btrim`: text as is, numbers and booleans as text, objects and lists as JSON, null as nothing. */
const text = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return pgTrim(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
};

const isHeader = (field: unknown): boolean => isObject(field) && text(field.type).toLowerCase() === 'section';

/** `form_schema.fields`, or none when it is not a list. */
export function schemaFields(formSchema: unknown): unknown[] {
  if (!isObject(formSchema)) return [];
  const fields = formSchema.fields;
  return Array.isArray(fields) ? fields : [];
}

/** The template's sections, in order (a leading section without a header only when items come before the first header). */
export function templateSections(formSchema: unknown): TemplateSectionModel[] {
  const sections: TemplateSectionModel[] = [];
  let current: TemplateSectionModel | null = null;
  schemaFields(formSchema).forEach((field, index) => {
    if (isHeader(field)) {
      current = { header: { index, label: text((field as Record<string, unknown>).label) }, items: [] };
      sections.push(current);
      return;
    }
    if (!current) {
      current = { header: null, items: [] };
      sections.push(current);
    }
    current.items.push({ index, label: isObject(field) ? text(field.label) : '' });
  });
  return sections;
}

/** Every problem, in priority order, each pointing at its field where it has one. */
export function publishIssues(input: PublishCheckInput): PublishIssue[] {
  const issues: PublishIssue[] = [];
  if (!text(input.templateName)) issues.push({ code: 'name_required', fieldIndex: null });
  const sections = templateSections(input.formSchema);
  const itemCount = sections.reduce((n, s) => n + s.items.length, 0);
  if (itemCount === 0) issues.push({ code: 'no_section', fieldIndex: null });
  else {
    for (const s of sections) if (s.header && s.items.length === 0) issues.push({ code: 'empty_section', fieldIndex: s.header.index });
    for (const s of sections) if (s.header && !s.header.label) issues.push({ code: 'unlabelled_section', fieldIndex: s.header.index });
    for (const s of sections) for (const item of s.items) if (!item.label) issues.push({ code: 'unlabelled_item', fieldIndex: item.index });
  }
  const vessels = (input.vesselIds ?? []).filter((id): id is string => !!id);
  if (input.vesselScope === 'VESSEL_SPECIFIC' && vessels.length === 0) issues.push({ code: 'targets_required', fieldIndex: null });
  return issues;
}

/** The distinct blockers, in priority order. */
export function publishBlockers(input: PublishCheckInput): PublishBlocker[] {
  return [...new Set(publishIssues(input).map((issue) => issue.code))];
}

/** The blocker the server reports (the first), or null when the template may be published. */
export function publishBlocker(input: PublishCheckInput): PublishBlocker | null {
  return publishBlockers(input)[0] ?? null;
}
