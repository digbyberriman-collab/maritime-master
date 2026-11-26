/**
 * The crew document form (X1-04; gap/04 C24, C25, C26; X1-04B's add and
 * edit dialog): the zod schema for React Hook Form, built per document type
 * from its field_schema, the payload builder (changed fields only on an
 * edit) and the refusal mapper. Mirror of crew_document_save() in
 * 20261124060400_crew_document_catalogue.sql:
 *
 * - every document: number (60), issue date (not in the future), expiry
 *   date (not before the issue date) or the "No expiry" tick (the tick clears
 *   the date; one of the two is required), issuing country (ISO code), notes;
 * - the type's field_schema switches on issuing office, endorsement date,
 *   capacity, limitations, visa type, entries (single, double, multiple) and
 *   grade, each optional or required;
 * - a passport (expiry item type passport) needs its issuing country and
 *   issue date and may be "Use this passport in crew report" (one per
 *   person; the server refuses a second with crew_report_passport_exists).
 *
 * Pure: no React, no client. Dates are date-only strings in local time.
 */
import { addMonths } from 'date-fns';
import { z } from 'zod';
import type { Json } from '@/integrations/supabase/types';
import { blankToNull, fromDateOnly, isDateOnly, toDateOnly, todayDateOnly } from '@/shared/lib/form';
import { crewRefusalMessage } from './crewUpdateErrors';
import { readFieldSchema } from './documentTabs';
import type { CrewDocumentFieldKey, CrewDocumentFieldSchema, CrewDocumentItemType } from '../types/db.pending';

/** While the crew document RPCs are not applied (D-01): the catalogue and saving wait for the update. */
export const CATALOGUE_MISSING_NOTICE = 'Document types become available once the crew update is applied.';
export const SAVE_UNAVAILABLE_NOTICE = 'Saving documents becomes available once the crew update is applied.';

export const VISA_ENTRIES = ['single', 'double', 'multiple'] as const;
export type VisaEntries = (typeof VISA_ENTRIES)[number];
export const VISA_ENTRIES_LABEL: Readonly<Record<VisaEntries, string>> = { single: 'Single entry', double: 'Double entry', multiple: 'Multiple entry' };

/** What the form needs to know about a document type. */
export interface DocumentTypeForForm {
  name: string;
  expiry_item_type: CrewDocumentItemType;
  field_schema: Json | CrewDocumentFieldSchema | null;
  default_validity_months?: number | null;
}

export interface CrewDocumentFormValues {
  number: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  no_expiry: boolean;
  issuing_country_code: string | null;
  issuing_office: string | null;
  endorsement_due_date: string | null;
  capacity: string | null;
  limitations: string | null;
  visa_type: string | null;
  entries: VisaEntries | null;
  grade: string | null;
  use_in_crew_report: boolean;
  notes: string | null;
}

/** A form field and the payload key it is sent as. */
export type CrewDocumentFormField = keyof CrewDocumentFormValues;

/** The fields every document has. */
export const DOCUMENT_CORE_FIELDS = ['number', 'issue_date', 'expiry_date', 'no_expiry', 'issuing_country_code', 'notes'] as const satisfies readonly CrewDocumentFormField[];

/** field_schema key -> form field (the endorsement date is stored as endorsement_due_date). */
export const SCHEMA_FIELD: Readonly<Record<CrewDocumentFieldKey, CrewDocumentFormField>> = {
  issuing_office: 'issuing_office',
  endorsement_date: 'endorsement_due_date',
  capacity: 'capacity',
  limitations: 'limitations',
  visa_type: 'visa_type',
  entries: 'entries',
  grade: 'grade',
};

export const DOCUMENT_FIELD_LABEL: Readonly<Record<CrewDocumentFormField, string>> = {
  number: 'Number',
  issue_date: 'Issue date',
  expiry_date: 'Expiry date',
  no_expiry: 'No expiry',
  issuing_country_code: 'Issuing country',
  issuing_office: 'Issuing office',
  endorsement_due_date: 'Endorsement date',
  capacity: 'Capacity',
  limitations: 'Limitations',
  visa_type: 'Visa type',
  entries: 'Entries',
  grade: 'Grade or level',
  use_in_crew_report: 'Use this passport in crew report',
  notes: 'Notes',
};

export interface DocumentFormField {
  field: CrewDocumentFormField;
  required: boolean;
}

const isPassport = (type: DocumentTypeForForm) => type.expiry_item_type === 'passport';

/**
 * The fields the form shows for a type, in order: the core fields, the
 * type's extra fields, and the crew-report flag for a passport. A passport's
 * issuing country and issue date are required.
 */
export function documentFormFields(type: DocumentTypeForForm): DocumentFormField[] {
  const schema = readFieldSchema(type.field_schema as Json);
  const passport = isPassport(type);
  const out: DocumentFormField[] = [
    { field: 'number', required: false },
    { field: 'issuing_country_code', required: passport },
  ];
  if (schema.issuing_office) out.push({ field: 'issuing_office', required: schema.issuing_office === 'required' });
  out.push({ field: 'issue_date', required: passport }, { field: 'expiry_date', required: false }, { field: 'no_expiry', required: false });
  for (const key of ['endorsement_date', 'capacity', 'limitations', 'visa_type', 'entries', 'grade'] as const) {
    const mode = schema[key];
    if (mode) out.push({ field: SCHEMA_FIELD[key], required: mode === 'required' });
  }
  if (passport) out.push({ field: 'use_in_crew_report', required: false });
  out.push({ field: 'notes', required: false });
  return out;
}

/** The fields a payload may carry for the type (the server refuses any other: 22023 field_unknown). */
export function allowedPayloadFields(type: DocumentTypeForForm): Set<CrewDocumentFormField> {
  return new Set(documentFormFields(type).map((f) => f.field));
}

const text = (max: number) =>
  z.preprocess((v) => blankToNull(typeof v === 'string' ? v.trim() : v), z.string().max(max, `Keep it to ${max} characters or fewer`).nullable());
const date = () =>
  z.preprocess(
    (v) => (v instanceof Date ? toDateOnly(v) ?? 'invalid' : blankToNull(typeof v === 'string' ? v.trim() : v)),
    z.string().refine(isDateOnly, { message: 'Enter a valid date' }).nullable(),
  );

/**
 * The zod schema of the form for one type. Output: the values the payload is
 * built from, with the expiry date cleared when "No expiry" is ticked.
 */
export function buildCrewDocumentSchema(type: DocumentTypeForForm, options: { today?: string } = {}) {
  const today = options.today ?? todayDateOnly();
  const fields = documentFormFields(type);
  const required = new Set(fields.filter((f) => f.required).map((f) => f.field));
  return z
    .object({
      number: text(60),
      issue_date: date(),
      expiry_date: date(),
      no_expiry: z.boolean(),
      issuing_country_code: z.preprocess(
        (v) => blankToNull(typeof v === 'string' ? v.trim().toUpperCase() : v),
        z.string().regex(/^[A-Z]{2}$/, 'Choose the issuing country from the list.').nullable(),
      ),
      issuing_office: text(120),
      endorsement_due_date: date(),
      capacity: text(120),
      limitations: text(500),
      visa_type: text(60),
      entries: z.preprocess((v) => blankToNull(v), z.enum(VISA_ENTRIES).nullable()),
      grade: text(60),
      use_in_crew_report: z.boolean(),
      notes: text(2000),
    })
    .superRefine((v, ctx) => {
      const issue = v.issue_date;
      const expiry = v.no_expiry ? null : v.expiry_date;
      if (issue && issue > today) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['issue_date'], message: 'The issue date cannot be in the future.' });
      if (issue && issue < '1900-01-01') ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['issue_date'], message: 'Check the issue date.' });
      if (issue && expiry && expiry < issue) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['expiry_date'], message: 'The expiry date cannot be before the issue date.' });
      }
      if (!v.no_expiry && !v.expiry_date) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['expiry_date'], message: 'Enter the expiry date, or tick No expiry.' });
      }
      for (const field of required) {
        const value = v[field];
        if (value === null || value === undefined || value === '') {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message: `Enter the ${DOCUMENT_FIELD_LABEL[field].toLowerCase()}.` });
        }
      }
      if (v.use_in_crew_report && !isPassport(type)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['use_in_crew_report'], message: 'Only a passport can be used in the crew report.' });
      }
    })
    .transform(
      (v): CrewDocumentFormValues => ({
        number: v.number ?? null,
        issue_date: v.issue_date ?? null,
        expiry_date: v.no_expiry ? null : v.expiry_date ?? null,
        no_expiry: v.no_expiry,
        issuing_country_code: v.issuing_country_code ?? null,
        issuing_office: v.issuing_office ?? null,
        endorsement_due_date: v.endorsement_due_date ?? null,
        capacity: v.capacity ?? null,
        limitations: v.limitations ?? null,
        visa_type: v.visa_type ?? null,
        entries: v.entries ?? null,
        grade: v.grade ?? null,
        use_in_crew_report: v.use_in_crew_report,
        notes: v.notes ?? null,
      }),
    );
}

export type CrewDocumentSchema = ReturnType<typeof buildCrewDocumentSchema>;

/** An empty form. */
export function emptyDocumentValues(): CrewDocumentFormValues {
  return {
    number: null,
    issue_date: null,
    expiry_date: null,
    no_expiry: false,
    issuing_country_code: null,
    issuing_office: null,
    endorsement_due_date: null,
    capacity: null,
    limitations: null,
    visa_type: null,
    entries: null,
    grade: null,
    use_in_crew_report: false,
    notes: null,
  };
}

/** The stored fields of a document, as the form edits them. */
export interface DocumentForForm {
  number: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  no_expiry: boolean;
  issuing_country_code: string | null;
  issuing_office: string | null;
  endorsement_due_date: string | null;
  use_in_crew_report: boolean;
  details: Json | null;
  notes: string | null;
}

const detailText = (details: Json | null, key: string): string | null => {
  if (details === null || typeof details !== 'object' || Array.isArray(details)) return null;
  const v = (details as Record<string, Json | undefined>)[key];
  return typeof v === 'string' && v.trim() !== '' ? v : null;
};

/** The form values of a stored document (an edit). */
export function documentFormDefaults(doc: DocumentForForm): CrewDocumentFormValues {
  const entries = detailText(doc.details, 'entries');
  return {
    number: doc.number,
    issue_date: doc.issue_date,
    expiry_date: doc.no_expiry ? null : doc.expiry_date,
    no_expiry: doc.no_expiry,
    issuing_country_code: doc.issuing_country_code,
    issuing_office: doc.issuing_office,
    endorsement_due_date: doc.endorsement_due_date,
    capacity: detailText(doc.details, 'capacity'),
    limitations: detailText(doc.details, 'limitations'),
    visa_type: detailText(doc.details, 'visa_type'),
    entries: (VISA_ENTRIES as readonly string[]).includes(entries ?? '') ? (entries as VisaEntries) : null,
    grade: detailText(doc.details, 'grade'),
    use_in_crew_report: doc.use_in_crew_report,
    notes: doc.notes,
  };
}

/**
 * The expiry date a type's default validity suggests for an issue date
 * (issue date plus the months), or null without either. A suggestion the
 * person confirms, never saved on its own.
 */
export function suggestedExpiryDate(issueDate: string | null | undefined, months: number | null | undefined): string | null {
  if (!issueDate || months === null || months === undefined || months <= 0) return null;
  const issued = fromDateOnly(issueDate);
  return issued ? toDateOnly(addMonths(issued, months)) : null;
}

/**
 * The p_payload of crew_document_save: the fields this type has, every one
 * on a new document (or a type change), only the changed ones on an edit
 * (absent keys keep their value on the server, null clears). The tick and
 * the date travel together when either changes.
 */
export function toDocumentPayload(
  values: CrewDocumentFormValues,
  type: DocumentTypeForForm,
  original?: CrewDocumentFormValues | null,
): Record<string, Json> {
  const allowed = allowedPayloadFields(type);
  const payload: Record<string, Json> = {};
  const changed = (field: CrewDocumentFormField) => !original || original[field] !== values[field];
  for (const field of allowed) {
    if (field === 'no_expiry' || field === 'expiry_date') continue;
    if (changed(field)) payload[field] = values[field];
  }
  if (changed('no_expiry') || changed('expiry_date')) {
    payload.no_expiry = values.no_expiry;
    payload.expiry_date = values.no_expiry ? null : values.expiry_date;
  }
  return payload;
}

/** The uploaded file's fields, added to a payload (X1-04B's upload returns the stored path, never a URL). */
export function withDocumentFile(
  payload: Record<string, Json>,
  file: { path: string; name: string; size: number; mime: string | null },
): Record<string, Json> {
  return { ...payload, file_path: file.path, file_name: file.name, file_size: file.size, file_mime: file.mime };
}

// ---------------------------------------------------------------- refusals

interface PostgrestLike {
  code?: unknown;
  details?: unknown;
  hint?: unknown;
}

/** Where a refusal points in the form: a field, the file, the type, the removal reason, or nothing. */
export type DocumentRefusalField = CrewDocumentFormField | 'file' | 'document_type_id' | 'reason' | null;

const FILE_FIELDS = new Set(['file_path', 'file_name', 'file_size', 'file_mime']);
const FORM_FIELDS = new Set<string>(Object.keys(DOCUMENT_FIELD_LABEL));

/**
 * A refused save or removal in words, and the form field it is about: a
 * 22023 refusal carries its sentence in DETAIL and the field in HINT (the
 * file fields point at the file), a P0002 says what could not be found, a
 * 42501 goes through crewRefusalMessage (its DETAIL as is, D-225).
 */
export function crewDocumentRefusal(error: unknown): { message: string; field: DocumentRefusalField } {
  if (error !== null && typeof error === 'object') {
    const { code, details, hint } = error as PostgrestLike;
    const detail = typeof details === 'string' ? details.trim() : '';
    const raw = typeof hint === 'string' ? hint.trim() : '';
    const field: DocumentRefusalField = FILE_FIELDS.has(raw)
      ? 'file'
      : raw === 'document_type_id' || raw === 'reason'
        ? raw
        : FORM_FIELDS.has(raw)
          ? (raw as CrewDocumentFormField)
          : null;
    if ((code === '22023' || code === 'P0002') && detail) return { message: detail, field };
    if (code === 'P0002') return { message: 'This document could not be found.', field: null };
    if (code === '42501') return { message: crewRefusalMessage(error), field };
  }
  return { message: crewRefusalMessage(error), field: null };
}
