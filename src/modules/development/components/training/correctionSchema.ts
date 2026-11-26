/**
 * An approver's correction of an application's details (gap/02 TR5, W3
 * "Edits by approvers"; X5-07B): the zod schema of the "Correct details"
 * form and the `edit_fields` payload of `development_transition` (only
 * the fields that changed, each one the definer's whitelist allows; the
 * server writes the diff to the history and tells the applicant).
 */
import { z } from 'zod';
import { optionalDateOnly } from '@/shared/lib/form';
import { DEV_CATEGORIES } from '../../lib/settingsSchema';

const text = (max: number) => z.string().trim().max(max, `Keep it to ${max} characters or fewer`);
const money = z.preprocess(
  (v) => (v === '' || v === undefined || v === null ? null : v),
  z.coerce.number({ invalid_type_error: 'Enter an amount' }).min(0, 'Must be 0 or more').max(10_000_000, 'Must be 10,000,000 or less').nullable(),
);

export const correctionSchema = z
  .object({
    course_name: text(200).min(1, 'Name the course'),
    course_provider: text(200),
    course_location: text(200),
    course_start_date: optionalDateOnly(),
    course_end_date: optionalDateOnly(),
    category: z.enum(DEV_CATEGORIES, { errorMap: () => ({ message: 'Choose a category' }) }),
    estimated_tuition_usd: money,
    estimated_travel_usd: money,
    estimated_accommodation_usd: money,
    comment: text(2000),
  })
  .superRefine((v, ctx) => {
    if (v.course_start_date && v.course_end_date && v.course_end_date < v.course_start_date) {
      ctx.addIssue({ code: 'custom', path: ['course_end_date'], message: 'The course cannot end before it starts' });
    }
  });

export type CorrectionInput = z.input<typeof correctionSchema>;
export type CorrectionValues = z.output<typeof correctionSchema>;

/** The correctable fields as the application has them. */
export interface CorrectableApplication {
  course_name: string;
  course_provider?: string | null;
  course_location?: string | null;
  course_start_date?: string | null;
  course_end_date?: string | null;
  category?: string | null;
  estimated_tuition_usd?: number | null;
  estimated_travel_usd?: number | null;
  estimated_accommodation_usd?: number | null;
}

export const CORRECTABLE_FIELDS = [
  'course_name',
  'course_provider',
  'course_location',
  'course_start_date',
  'course_end_date',
  'category',
  'estimated_tuition_usd',
  'estimated_travel_usd',
  'estimated_accommodation_usd',
] as const;
type Field = (typeof CORRECTABLE_FIELDS)[number];

export function correctionDefaults(app: CorrectableApplication): CorrectionValues {
  return {
    course_name: app.course_name ?? '',
    course_provider: app.course_provider ?? '',
    course_location: app.course_location ?? '',
    course_start_date: app.course_start_date?.slice(0, 10) ?? null,
    course_end_date: app.course_end_date?.slice(0, 10) ?? null,
    category: ((DEV_CATEGORIES as readonly string[]).includes(app.category ?? '') ? app.category : 'professional') as CorrectionValues['category'],
    estimated_tuition_usd: app.estimated_tuition_usd ?? null,
    estimated_travel_usd: app.estimated_travel_usd ?? null,
    estimated_accommodation_usd: app.estimated_accommodation_usd ?? null,
    comment: '',
  };
}

const norm = (field: Field, value: unknown): unknown => {
  if (value === '' || value === undefined) return null;
  if (field === 'course_start_date' || field === 'course_end_date') return typeof value === 'string' ? value.slice(0, 10) : value;
  if (field.startsWith('estimated_')) return value === null ? null : Number(value);
  return typeof value === 'string' ? value.trim() || null : value;
};

/** `{ fields, comment? }` for edit_fields with only what changed; null when nothing did. */
export function correctionPayload(values: CorrectionValues, app: CorrectableApplication): { fields: Record<string, unknown>; comment?: string } | null {
  const fields: Record<string, unknown> = {};
  for (const field of CORRECTABLE_FIELDS) {
    const next = norm(field, values[field]);
    const before = norm(field, app[field]);
    if (next !== before) fields[field] = next;
  }
  if (!Object.keys(fields).length) return null;
  const comment = (values.comment ?? '').trim();
  return comment ? { fields, comment } : { fields };
}
