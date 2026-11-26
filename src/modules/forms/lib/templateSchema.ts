/**
 * The template builder's form (gap/02 FC3, W2; X5 spec X5-06B; DECISIONS
 * C6, D-X5-13, D-X5-20): React Hook Form + zod with the shared form
 * helpers, and the conversions between the builder's sections and the
 * stored `form_templates.form_schema`.
 *
 * - The builder edits sections of items. Stored, a section is a field of
 *   type `section` (its title is the label) followed by its items, as the
 *   ISM form renderer and the server's publish checks read them
 *   (lib/publishChecks.ts). Items before the first header form a section
 *   with no header (`headerless`), which saves back without one. Every
 *   field property the builder does not edit (placeholder, help text,
 *   table columns, conditions, page number …) is kept as it was; so are
 *   `form_schema.pages`, `layout` and the rest.
 * - Per item: type, label, Required, a comment box, attachments, and the
 *   choices of a dropdown. `allowComment` / `allowAttachments` are stored
 *   on the field only when they are on.
 * - Saving a draft checks only what the table needs (a name, the lengths,
 *   a code made of letters, digits, `-` and `_`); what stops a publish is
 *   lib/publishChecks.ts, shown before publishing (`builderIssues`).
 * - "Add several": one item per pasted line (`parseSeveralItems`).
 * - A new template's code is made from its name and area when left blank
 *   (`suggestTemplateCode`), unique among the codes the reader can see;
 *   the server's UNIQUE (company, code, version) has the last word.
 * - The kind sets the legacy `form_type` (`formTypeFor`), kept when it
 *   already means that kind.
 *
 * No React and no requests.
 */
import { z } from 'zod';
import type { Json } from '@/integrations/supabase/types';
import { requiredText } from '@/shared/lib/form';
import type { FormTemplateArea, FormTemplateCadence, FormTemplateKind } from '../types/db.pending';
import { FORM_TEMPLATE_AREAS, FORM_TEMPLATE_KINDS } from './areaModel';
import { CADENCES } from './cadence';
import { publishIssues, type PublishBlocker } from './publishChecks';
import type { AreaKey, CatalogueTemplate, VesselScope } from './catalogueModel';

// ─── Limits ─────────────────────────────────────────────────────────────

export const NAME_MAX = 255;
export const CODE_MAX = 50;
/** A generated code keeps room for a Customise suffix (`_CUSTOM<n>`). */
export const SUGGESTED_CODE_MAX = 40;
export const DESCRIPTION_MAX = 2000;
export const SECTION_TITLE_MAX = 200;
export const ITEM_LABEL_MAX = 500;
export const OPTION_MAX = 200;
export const OPTIONS_MAX = 50;
/** Lines one "Add several" paste adds at most. */
export const ADD_SEVERAL_MAX = 200;
export const ITEMS_MAX = 500;

export const NAME_REQUIRED = 'Give the template a name';
export const CODE_FORMAT = 'Use letters, numbers, - and _ only';
export const AREA_REQUIRED = 'Choose where crews find it';
const tooLong = (max: number) => `Keep it to ${max.toLocaleString('en-GB')} characters or fewer`;

// ─── Item types ─────────────────────────────────────────────────────────

/**
 * The item types the builder offers, in its order (every one is a type
 * the ISM form renderer draws; src/test/forms/templateSchema.test.ts pins
 * them against `FIELD_TYPES`). Sections are not items.
 */
export const ITEM_TYPES = [
  'yes_no',
  'yes_no_na',
  'checkbox',
  'text',
  'textarea',
  'number',
  'date',
  'time',
  'datetime',
  'dropdown',
  'table',
  'file',
  'signature',
] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

export const ITEM_TYPE_LABELS: Readonly<Record<ItemType, string>> = {
  yes_no: 'Yes / No',
  yes_no_na: 'Yes / No / N/A',
  checkbox: 'Tick box',
  text: 'Short answer',
  textarea: 'Long answer',
  number: 'Number',
  date: 'Date',
  time: 'Time',
  datetime: 'Date and time',
  dropdown: 'Choose from a list',
  table: 'Table',
  file: 'File upload',
  signature: 'Signature',
};

export const isItemType = (value: unknown): value is ItemType => typeof value === 'string' && (ITEM_TYPES as readonly string[]).includes(value);

/** The label of a stored type, or the stored value itself for a type the builder does not list. */
export const itemTypeLabel = (type: string): string => (isItemType(type) ? ITEM_TYPE_LABELS[type] : type);

/** What a new item is, by kind: a checklist asks Yes / No, a permit ticks, a form asks for an answer. */
export function defaultItemType(kind: FormTemplateKind | null | undefined): ItemType {
  if (kind === 'checklist' || kind === 'passage_plan') return 'yes_no';
  if (kind === 'permit') return 'checkbox';
  return 'text';
}

// ─── The builder's values ──────────────────────────────────────────────

export interface BuilderItem {
  /** The field id (stable across saves). */
  key: string;
  type: string;
  label: string;
  required: boolean;
  allowComment: boolean;
  allowAttachments: boolean;
  /** A dropdown's choices. */
  options: string[];
  /** Everything else on the stored field, kept as it was. */
  extra: Record<string, unknown>;
}

export interface BuilderSection {
  key: string;
  title: string;
  /** Items stored before the first section header: no header field is written while the title stays blank. */
  headerless: boolean;
  extra: Record<string, unknown>;
  items: BuilderItem[];
}

export interface TemplateFormValues {
  name: string;
  code: string;
  /** '' = not chosen (Unsorted). */
  area: FormTemplateArea | '';
  kind: FormTemplateKind;
  description: string;
  cadence: FormTemplateCadence;
  requiresSignature: boolean;
  vesselScope: VesselScope;
  vesselIds: string[];
  sections: BuilderSection[];
}

let keySeq = 0;
/** A field id unique within a schema (time, a counter and a random tail). */
export function newKey(prefix: string): string {
  keySeq = (keySeq + 1) % 1_000_000;
  return `${prefix}${Date.now().toString(36)}${keySeq.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function newItem(type: string, label = '', extra: Record<string, unknown> = {}): BuilderItem {
  return { key: newKey('f_'), type, label, required: true, allowComment: false, allowAttachments: false, options: type === 'dropdown' ? ['', ''] : [], extra };
}

export function newSection(title = ''): BuilderSection {
  return { key: newKey('s_'), title, headerless: false, extra: {}, items: [] };
}

/** A section's page number carried to the items added to it (multi-page legacy templates). */
export const sectionItemExtra = (section: Pick<BuilderSection, 'extra'>): Record<string, unknown> =>
  typeof section.extra.pageNumber === 'number' ? { pageNumber: section.extra.pageNumber } : {};

/** A new template: the area given (`?area=`), a checklist (a permit in Permits), all vessels including future ones, one empty section. */
export function emptyTemplateValues(area: AreaKey | undefined): TemplateFormValues {
  const a = area ?? '';
  return {
    name: '',
    code: '',
    area: a === null ? '' : a,
    kind: a === 'ptw' ? 'permit' : 'checklist',
    description: '',
    cadence: 'none',
    requiresSignature: false,
    vesselScope: 'FLEET',
    vesselIds: [],
    sections: [newSection()],
  };
}

// ─── The zod schema ────────────────────────────────────────────────────

const itemSchema = z.object({
  key: z.string().min(1),
  type: z.string().min(1),
  label: z.string().max(ITEM_LABEL_MAX, tooLong(ITEM_LABEL_MAX)),
  required: z.boolean(),
  allowComment: z.boolean(),
  allowAttachments: z.boolean(),
  options: z.array(z.string().max(OPTION_MAX, tooLong(OPTION_MAX))).max(OPTIONS_MAX, `Up to ${OPTIONS_MAX} choices`),
  extra: z.record(z.unknown()),
});

const sectionSchema = z.object({
  key: z.string().min(1),
  title: z.string().max(SECTION_TITLE_MAX, tooLong(SECTION_TITLE_MAX)),
  headerless: z.boolean(),
  extra: z.record(z.unknown()),
  items: z.array(itemSchema),
});

export interface TemplateSchemaOptions {
  /** The catalogue columns exist (040500 applied): the area is required. */
  areasSetUp: boolean;
}

/** The builder's schema: what saving a draft needs. What stops a publish is `builderIssues`. */
export function templateFormSchema({ areasSetUp }: TemplateSchemaOptions) {
  return z
    .object({
      name: requiredText(NAME_REQUIRED, NAME_MAX),
      code: z
        .string()
        .max(CODE_MAX, tooLong(CODE_MAX))
        .refine((v) => /^[A-Za-z0-9_-]*$/.test(v.trim()), CODE_FORMAT),
      area: z.union([z.enum(FORM_TEMPLATE_AREAS), z.literal('')]),
      kind: z.enum(FORM_TEMPLATE_KINDS),
      description: z.string().max(DESCRIPTION_MAX, tooLong(DESCRIPTION_MAX)),
      cadence: z.enum(CADENCES),
      requiresSignature: z.boolean(),
      vesselScope: z.enum(['FLEET', 'VESSEL_SPECIFIC']),
      vesselIds: z.array(z.string().min(1)),
      sections: z.array(sectionSchema),
    })
    .superRefine((values, ctx) => {
      if (areasSetUp && values.area === '') ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['area'], message: AREA_REQUIRED });
      const items = values.sections.reduce((n, s) => n + s.items.length, 0);
      if (items > ITEMS_MAX) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['sections'], message: `A template can hold up to ${ITEMS_MAX} items` });
    });
}

// ─── form_schema ⇄ sections ────────────────────────────────────────────

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const str = (value: unknown): string => (typeof value === 'string' ? value : value === null || value === undefined ? '' : String(value));

const ITEM_OWN_KEYS = ['id', 'type', 'label', 'required', 'allowComment', 'allowAttachments', 'options'];
const SECTION_OWN_KEYS = ['id', 'type', 'label', 'required'];

const omit = (field: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> =>
  Object.fromEntries(Object.entries(field).filter(([k]) => !keys.includes(k)));

const isHeaderField = (field: unknown): boolean => isObject(field) && str(field.type).trim().toLowerCase() === 'section';

/** The builder's sections of a stored `form_schema` (anything that is not a list of fields reads as no items). */
export function formSchemaToSections(formSchema: unknown): BuilderSection[] {
  const fields = isObject(formSchema) && Array.isArray(formSchema.fields) ? formSchema.fields : [];
  const sections: BuilderSection[] = [];
  let current: BuilderSection | null = null;
  const used = new Set<string>();
  const keyOf = (raw: unknown, prefix: string) => {
    const id = str(raw).trim();
    if (id && !used.has(id)) {
      used.add(id);
      return id;
    }
    const fresh = newKey(prefix);
    used.add(fresh);
    return fresh;
  };
  for (const field of fields) {
    if (isHeaderField(field)) {
      const f = field as Record<string, unknown>;
      current = { key: keyOf(f.id, 's_'), title: str(f.label), headerless: false, extra: omit(f, SECTION_OWN_KEYS), items: [] };
      sections.push(current);
      continue;
    }
    if (!current) {
      current = { key: newKey('s_'), title: '', headerless: true, extra: {}, items: [] };
      sections.push(current);
    }
    const f = isObject(field) ? field : {};
    current.items.push({
      key: keyOf(f.id, 'f_'),
      type: str(f.type).trim() || 'text',
      label: str(f.label),
      required: f.required === true,
      allowComment: f.allowComment === true,
      allowAttachments: f.allowAttachments === true,
      options: Array.isArray(f.options) ? f.options.map(str) : [],
      extra: omit(f, ITEM_OWN_KEYS),
    });
  }
  return sections;
}

/** The stored fields of the builder's sections, in order. */
export function sectionsToFields(sections: readonly BuilderSection[]): Record<string, unknown>[] {
  const fields: Record<string, unknown>[] = [];
  for (const section of sections) {
    if (!section.headerless || section.title.trim()) {
      fields.push({ ...section.extra, id: section.key, type: 'section', label: section.title.trim(), required: false });
    }
    for (const item of section.items) {
      const field: Record<string, unknown> = { ...item.extra, id: item.key, type: item.type, label: item.label.trim(), required: item.required };
      if (item.allowComment) field.allowComment = true;
      if (item.allowAttachments) field.allowAttachments = true;
      if (item.type === 'dropdown' || item.options.length) field.options = item.options.map((o) => o.trim()).filter(Boolean);
      fields.push(field);
    }
  }
  return fields;
}

/** The `form_schema` to store: the template's own keys (pages, layout, rules) kept, the fields replaced. */
export function sectionsToFormSchema(sections: readonly BuilderSection[], base: unknown): Record<string, unknown> {
  const kept = isObject(base) ? base : {};
  return { ...kept, pages: Array.isArray(kept.pages) ? kept.pages : [], fields: sectionsToFields(sections) };
}

// ─── What stops a publish, pointing at the builder ─────────────────────

export interface BuilderIssue {
  code: PublishBlocker;
  /** The section or item key it is about, or null (the name, the vessels, no item at all). */
  key: string | null;
}

/** The publish checks (the server's, lib/publishChecks.ts) on the builder's values, each pointing at its section or item. */
export function builderIssues(values: Pick<TemplateFormValues, 'name' | 'sections' | 'vesselScope' | 'vesselIds'>): BuilderIssue[] {
  const fields = sectionsToFields(values.sections);
  return publishIssues({
    templateName: values.name,
    formSchema: { fields },
    vesselScope: values.vesselScope,
    vesselIds: values.vesselIds,
  }).map((issue) => ({ code: issue.code, key: issue.fieldIndex === null ? null : str(fields[issue.fieldIndex]?.id) || null }));
}

// ─── Add several ───────────────────────────────────────────────────────

/** A leading bullet, number or tick box of a pasted line ("- ", "• ", "3. ", "(2) ", "[ ] "). */
const BULLET = /^\s*(?:[-*•–—·▪◦]|\(?\d{1,3}[.)]|\[\s?[xX]?\s?\])\s+/;

export interface SeveralItems {
  labels: string[];
  /** Lines past the limit, left out. */
  leftOut: number;
}

/** One item per non-blank pasted line, bullets and numbering removed, up to `max`. */
export function parseSeveralItems(text: string, max = ADD_SEVERAL_MAX): SeveralItems {
  const labels = text
    .split(/\r\n|\r|\n/)
    .map((line) => line.replace(BULLET, '').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  return { labels: labels.slice(0, max), leftOut: Math.max(0, labels.length - max) };
}

// ─── Codes and legacy form types ───────────────────────────────────────

const AREA_CODE_PREFIX: Readonly<Record<FormTemplateArea, string>> = {
  charter: 'CHR',
  safety: 'SAF',
  technical: 'TECH',
  movement: 'MOV',
  ptw: 'PTW',
  familiarisation: 'FAM',
  crew: 'CREW',
  sms: 'SMS',
  technical_forms: 'TECHF',
};

/** A code made from the name and area (`SAF_FIRE_PATROL_ROUNDS`), unique among `usedCodes` (case-insensitive) with `_2`, `_3` … */
export function suggestTemplateCode(name: string, area: FormTemplateArea | '' | null, usedCodes: Iterable<string>): string {
  const words = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(Boolean);
  const prefix = area ? AREA_CODE_PREFIX[area] : 'FORM';
  let base = [prefix, ...words].join('_').slice(0, SUGGESTED_CODE_MAX).replace(/_+$/, '');
  if (base === prefix && !words.length) base = `${prefix}_TEMPLATE`;
  const used = new Set([...usedCodes].map((c) => c.toUpperCase()));
  if (!used.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const suffix = `_${n}`;
    const code = base.slice(0, SUGGESTED_CODE_MAX - suffix.length) + suffix;
    if (!used.has(code)) return code;
  }
}

/** The kind a legacy `form_type` means (the server's form_template_legacy_kind, without the category rule). */
export function kindOfFormType(formType: string | null | undefined): FormTemplateKind {
  const t = (formType ?? '').trim().toUpperCase();
  if (t === 'CHECKLIST' || t === 'INSPECTION') return 'checklist';
  if (t === 'PERMIT_TO_WORK') return 'permit';
  return 'form';
}

const FORM_TYPE_FOR_KIND: Readonly<Record<FormTemplateKind, string>> = {
  checklist: 'CHECKLIST',
  permit: 'PERMIT_TO_WORK',
  form: 'REPORT',
  register: 'OTHER',
  passage_plan: 'OTHER',
};

/** The `form_type` to store for a kind: the current one when it already means that kind, else the kind's own. */
export function formTypeFor(kind: FormTemplateKind, current: string | null | undefined): string {
  const cur = (current ?? '').trim().toUpperCase();
  const own = FORM_TYPE_FOR_KIND[kind];
  if (!cur) return own;
  if (kind === 'checklist') return kindOfFormType(cur) === 'checklist' ? cur : own;
  if (kind === 'permit') return cur === 'PERMIT_TO_WORK' ? cur : own;
  // A form, register or passage plan keeps any type that is not a checklist or permit type (REPORT, DRILL_REPORT, OTHER …).
  return kindOfFormType(cur) === 'form' ? cur : own;
}

// ─── Values ⇄ rows ─────────────────────────────────────────────────────

/** A template as the builder and the preview read it: the list columns and its form. */
export interface TemplateDetail extends CatalogueTemplate {
  formSchema: unknown;
}

/** The builder's values of a stored template. */
export function valuesFromTemplate(t: TemplateDetail): TemplateFormValues {
  const sections = formSchemaToSections(t.formSchema);
  return {
    name: t.name === 'Untitled template' ? '' : t.name,
    code: t.code,
    area: t.area ?? '',
    kind: t.kind ?? kindOfFormType(t.formType),
    description: t.description ?? '',
    cadence: t.cadence ?? 'none',
    requiresSignature: t.requiresSignature,
    vesselScope: t.vesselScope,
    vesselIds: t.vesselScope === 'VESSEL_SPECIFIC' ? [...t.vesselIds] : [],
    sections: sections.length ? sections : [newSection()],
  };
}

export interface DraftPayload {
  /** Live columns (always written). */
  live: {
    template_name: string;
    template_code: string;
    description: string | null;
    form_type: string;
    vessel_scope: VesselScope;
    vessel_ids: string[] | null;
    /** `form_schema` as stored (sectionsToFormSchema). */
    form_schema: Json;
  };
  /** The catalogue columns, only once 040500 is applied (D-01: the column does not exist before). */
  catalogue: {
    area: FormTemplateArea | null;
    form_kind: FormTemplateKind;
    cadence: FormTemplateCadence;
    requires_completion_signature: boolean;
  } | null;
}

export interface DraftPayloadOptions {
  areasSetUp: boolean;
  /** The stored template being edited (its form_type and form_schema are the base); null for a new one. */
  current: Pick<TemplateDetail, 'formType' | 'formSchema'> | null;
  /** The code to store (the typed one, else a suggestion). */
  code: string;
}

/** What a draft save writes. */
export function draftPayload(values: TemplateFormValues, { areasSetUp, current, code }: DraftPayloadOptions): DraftPayload {
  const specific = values.vesselScope === 'VESSEL_SPECIFIC';
  return {
    live: {
      template_name: values.name.trim(),
      template_code: code,
      description: values.description.trim() ? values.description.trim() : null,
      form_type: formTypeFor(values.kind, current?.formType ?? null),
      vessel_scope: values.vesselScope,
      vessel_ids: specific ? [...new Set(values.vesselIds)] : null,
      form_schema: sectionsToFormSchema(values.sections, current?.formSchema ?? null) as unknown as Json,
    },
    catalogue: areasSetUp
      ? { area: values.area === '' ? null : values.area, form_kind: values.kind, cadence: values.cadence, requires_completion_signature: values.requiresSignature }
      : null,
  };
}

/** The values as a form to preview (the same fields the draft would store). */
export const previewFields = (values: Pick<TemplateFormValues, 'sections'>): Record<string, unknown>[] => sectionsToFields(values.sections);

export const itemCount = (sections: readonly BuilderSection[]): number => sections.reduce((n, s) => n + s.items.length, 0);

// ─── The area page's dialogs ───────────────────────────────────────────

/** The definers' limits (lib/templateMachine.ts): a hide reason up to 300, an archive reason up to 500. */
export const HIDE_REASON_LIMIT = 300;
export const ARCHIVE_REASON_LIMIT = 500;
export const HIDE_REASON_REQUIRED = 'Say why it is hidden, so the vessel knows';

/** "Change where hidden": which vessels hide it, and why when a vessel newly hides it. */
export const visibilityChangeSchema = z
  .object({
    hidden: z.array(z.string().min(1)),
    reason: z.string().max(HIDE_REASON_LIMIT, tooLong(HIDE_REASON_LIMIT)),
    /** Vessels that hide it now that did not before (set by the dialog). */
    newlyHidden: z.array(z.string()),
  })
  .superRefine((v, ctx) => {
    if (v.newlyHidden.length && !v.reason.trim()) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['reason'], message: HIDE_REASON_REQUIRED });
  });
export type VisibilityChangeValues = z.infer<typeof visibilityChangeSchema>;

/** One vessel's change: shown → hidden (with the reason) or hidden → shown. */
export interface VisibilityChange {
  vesselId: string;
  visibility: 'shown' | 'hidden';
  reason: string | null;
}

/** The changes between the vessels hiding a template now and the ones ticked, in the vessels' order. */
export function visibilityChanges(vesselIds: readonly string[], hiddenBefore: readonly string[], hiddenAfter: readonly string[], reason: string): VisibilityChange[] {
  const before = new Set(hiddenBefore);
  const after = new Set(hiddenAfter);
  const text = reason.trim() || null;
  const changes: VisibilityChange[] = [];
  for (const id of vesselIds) {
    if (before.has(id) === after.has(id)) continue;
    changes.push(after.has(id) ? { vesselId: id, visibility: 'hidden', reason: text } : { vesselId: id, visibility: 'shown', reason: null });
  }
  return changes;
}

export const archiveSchema = z.object({ reason: z.string().max(ARCHIVE_REASON_LIMIT, tooLong(ARCHIVE_REASON_LIMIT)) });
export type ArchiveValues = z.infer<typeof archiveSchema>;

export const moveAreaSchema = z.object({ area: z.enum(FORM_TEMPLATE_AREAS, { errorMap: () => ({ message: 'Choose the area to move it to' }) }) });
export type MoveAreaValues = z.infer<typeof moveAreaSchema>;
