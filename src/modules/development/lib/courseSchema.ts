/**
 * A catalogue course with its rules (gap/02 TR7, TR9; X5 spec §2 X5-07A,
 * D-X5-05, platform-prep plan contract 3): the zod schema of
 * `development_course_save()`, the payload it takes and the sentence for
 * each of its refusals. The server's checks
 * (`20261124040600_fleet_training_core.sql`) are the same:
 * src/test/development/courseSchema.test.ts walks the same cases.
 *
 * Pure: no React, no Supabase. The qualification a completion grants is a
 * crew document type (`qualification_document_type_id`, X1's catalogue,
 * checked by the server) or, as the legacy fallback, a label.
 */
import { z } from 'zod';
import type { DevCategory, DevFormat } from '../constants';
import { DEV_CATEGORIES } from './settingsSchema';

export const DEV_FORMATS = ['in_person', 'online', 'onboard', 'blended', 'online_in_person'] as const satisfies readonly DevFormat[];

const blankToNull = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v);
const optionalText = (max: number) =>
  z.preprocess(blankToNull, z.string().trim().max(max, `Keep it to ${max} characters or fewer`).nullable().optional());
const requiredText = (message: string, max: number) =>
  z.preprocess((v) => (typeof v === 'string' ? v.trim() : v), z.string({ required_error: message }).min(1, message).max(max, `Keep it to ${max} characters or fewer`));
const optionalInt = (min: number, max: number, message: string) =>
  z.preprocess(
    (v) => (v === '' || v === undefined || (typeof v === 'number' && Number.isNaN(v)) ? null : v),
    z.coerce.number({ invalid_type_error: message }).int(message).min(min, message).max(max, message).nullable(),
  );
const nameList = z
  .array(z.string().trim().min(1, 'Remove the empty entry').max(80, 'Keep each to 80 characters or fewer'))
  .max(50, 'Up to 50 entries');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const courseSchema = z
  .object({
    name: requiredText('Name the course', 200),
    department: requiredText('Choose the department', 80),
    category: z.enum(DEV_CATEGORIES, { errorMap: () => ({ message: 'Choose a category' }) }),
    format: z.preprocess(blankToNull, z.enum(DEV_FORMATS).nullable()).optional(),
    catalogue_number: optionalInt(1, 999_999, 'Enter a whole number from 1').optional(),
    sub_section: optionalText(120),
    duration_description: optionalText(200),
    renewal_period: optionalText(120),
    reimbursement_summary: optionalText(2000),
    notes: optionalText(4000),
    contact_person: optionalText(120),
    over_4k_rule: z.boolean().optional(),
    requires_fleet_doctor_agreement: z.boolean().optional(),
    tags: nameList.optional(),
    valid_for_months: optionalInt(1, 600, 'Enter 1 to 600 months').optional(),
    renew_from_months: optionalInt(0, 599, 'Enter 0 or more months').optional(),
    applies_to_departments: nameList.optional(),
    applies_to_positions: nameList.optional(),
    is_mandatory: z.boolean().optional(),
    renewal_note: optionalText(2000),
    pathway: optionalText(120),
    qualification_label: optionalText(200),
    qualification_document_type_id: z.preprocess(blankToNull, z.string().regex(UUID, 'Choose a document type').nullable()).optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.renew_from_months != null) {
      if (v.valid_for_months == null) {
        ctx.addIssue({ code: 'custom', path: ['renew_from_months'], message: 'Set how long the course is valid first' });
      } else if (v.renew_from_months >= v.valid_for_months) {
        ctx.addIssue({ code: 'custom', path: ['renew_from_months'], message: 'Renewal must open before the course expires' });
      }
    }
  });

export type CourseInput = z.input<typeof courseSchema>;
export type CourseValues = z.output<typeof courseSchema>;

/** The payload of development_course_save: the parsed values, plus the id and the last seen updated_at for an edit. */
export function toCoursePayload(values: CourseValues, existing?: { id: string; updated_at?: string | null } | null): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) if (value !== undefined) out[key] = value;
  if (existing?.id) {
    out.id = existing.id;
    if (existing.updated_at) out.expected_updated_at = existing.updated_at;
  }
  return out;
}

const COURSE_FIELD_WORDS: Readonly<Record<string, string>> = {
  name: 'the name',
  department: 'the department',
  category: 'the category',
  format: 'the format',
  catalogue_number: 'the catalogue number',
  valid_for_months: 'how long it is valid',
  renew_from_months: 'when renewal opens',
  applies_to_departments: 'the departments',
  applies_to_positions: 'the positions',
  tags: 'the tags',
  qualification_document_type_id: 'the qualification',
};

/** A sentence for a development_course_save / _archive / _promote refusal (message + hint), or null when it is not one. */
export function courseRefusalMessage(error: { message?: string | null; hint?: string | null } | null | undefined): string | null {
  const code = error?.message?.trim();
  if (!code) return null;
  const field = error?.hint ? COURSE_FIELD_WORDS[error.hint] ?? 'a field' : 'a field';
  switch (code) {
    case 'not_permitted':
      return 'Only training admins change the course catalogue.';
    case 'course_not_found':
      return 'This course could not be found.';
    case 'stale_course':
      return 'Someone changed this course since you opened it. Reload and try again.';
    case 'field_required':
      return `Fill in ${field}.`;
    case 'field_invalid':
      return `Check ${field}: the value is not allowed.`;
    case 'field_unknown':
      return 'One of the course details is not known.';
    case 'qualification_type_not_found':
      return 'That qualification type could not be found in your crew document types.';
    case 'qualification_types_not_set_up':
      return 'Crew document types are not set up yet: name the qualification as text instead.';
    case 'not_a_proposal':
      return 'Only a crew member’s own course proposal can be added to the catalogue.';
    case 'application_voided':
      return 'This application was voided, so its course cannot be added.';
    case 'application_not_found':
      return 'This application could not be found.';
    default:
      return null;
  }
}
