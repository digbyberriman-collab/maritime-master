import { z } from 'zod';
import type { Tables, TablesUpdate } from '@/integrations/supabase/types';
import { getEditableFields } from '@/modules/auth/lib/permissions';

/**
 * Pure helpers for the HRIS Personal Details form. Everything here is
 * framework-free so it can be unit tested without React or Supabase.
 */

/** profiles columns surfaced by the Personal Details form, in display order. */
export const PROFILE_FORM_FIELDS = [
  // Identity
  'first_name',
  'last_name',
  'preferred_name',
  'date_of_birth',
  'gender',
  'nationality',
  // Contact
  'email',
  'phone',
  // Employment
  'rank',
  'position',
  'department',
  'status',
  'employment_status',
  'employment_start_date',
  'probation_end_date',
  'rotation',
  'rotation_pattern',
  'cabin',
  'contract_start_date',
  'contract_end_date',
  // Documents & compliance
  'medical_expiry',
  'passport_number',
  'passport_expiry',
  'visa_status',
  // Notes
  'notes',
] as const;

export type ProfileFormField = (typeof PROFILE_FORM_FIELDS)[number];

/**
 * Columns this page never writes. Email is the login identity; contract
 * dates are owned by the Contracts page (a trigger syncs them from the
 * active crew_contracts row).
 */
export const READ_ONLY_PROFILE_FIELDS: ReadonlySet<ProfileFormField> = new Set<ProfileFormField>([
  'email',
  'contract_start_date',
  'contract_end_date',
]);

/** Fields only shown when the viewer has HR view rights or owns the record. */
export const SENSITIVE_PROFILE_FIELDS: ReadonlySet<ProfileFormField> = new Set<ProfileFormField>([
  'date_of_birth',
  'passport_number',
]);

/** ISO calendar date (yyyy-mm-dd) or empty. Inputs of type="date" emit this shape. */
const isoDate = z
  .string()
  .refine((v) => v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v), { message: 'Enter a valid date' });

const optionalText = (max: number) => z.string().trim().max(max, `Must be ${max} characters or fewer`);

export const profileFormSchema = z
  .object({
    first_name: z.string().trim().min(1, 'First name is required').max(50, 'Must be 50 characters or fewer'),
    last_name: z.string().trim().min(1, 'Last name is required').max(50, 'Must be 50 characters or fewer'),
    preferred_name: optionalText(100),
    date_of_birth: isoDate.refine((v) => v === '' || v <= todayIso(), { message: 'Date of birth cannot be in the future' }),
    gender: optionalText(50),
    nationality: optionalText(100),
    email: z.string(),
    phone: optionalText(50),
    rank: optionalText(100),
    position: optionalText(100),
    department: optionalText(100),
    status: optionalText(50),
    employment_status: optionalText(50),
    employment_start_date: isoDate,
    probation_end_date: isoDate,
    rotation: optionalText(100),
    rotation_pattern: optionalText(40),
    cabin: optionalText(50),
    contract_start_date: z.string(),
    contract_end_date: z.string(),
    medical_expiry: isoDate,
    passport_number: optionalText(100),
    passport_expiry: isoDate,
    visa_status: optionalText(100),
    notes: optionalText(5000),
  })
  .superRefine((data, ctx) => {
    if (data.employment_start_date && data.probation_end_date && data.probation_end_date < data.employment_start_date) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['probation_end_date'],
        message: 'Probation end must be on or after the employment start date',
      });
    }
  });

export type ProfileFormValues = z.infer<typeof profileFormSchema>;

export function todayIso(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Map a profiles row to form values: null → '' and dates trimmed to yyyy-mm-dd. */
export function profileToFormValues(profile: Tables<'profiles'>): ProfileFormValues {
  const values = {} as Record<ProfileFormField, string>;
  for (const field of PROFILE_FORM_FIELDS) {
    const raw = profile[field];
    values[field] = raw == null ? '' : String(raw).slice(0, DATE_FIELDS.has(field) ? 10 : undefined);
  }
  return values;
}

const DATE_FIELDS: ReadonlySet<ProfileFormField> = new Set<ProfileFormField>([
  'date_of_birth',
  'employment_start_date',
  'probation_end_date',
  'contract_start_date',
  'contract_end_date',
  'medical_expiry',
  'passport_expiry',
]);

export const isDateField = (field: ProfileFormField): boolean => DATE_FIELDS.has(field);

/**
 * Build the minimal `profiles` UPDATE from an edited form: only fields that
 * changed AND the viewer may edit are included; '' becomes null. Returns an
 * empty object when nothing changed.
 */
export function buildProfilePatch(
  original: ProfileFormValues,
  next: ProfileFormValues,
  editable: ReadonlySet<ProfileFormField>,
): TablesUpdate<'profiles'> {
  const patch: Record<string, string | null> = {};
  for (const field of PROFILE_FORM_FIELDS) {
    if (!editable.has(field)) continue;
    const before = (original[field] ?? '').trim();
    const after = (next[field] ?? '').trim();
    if (before === after) continue;
    patch[field] = after === '' ? null : after;
  }
  return patch as TablesUpdate<'profiles'>;
}

/**
 * Which form fields the viewer may edit. Mirrors the server: HR editors
 * (`hr_can_edit`) may update anything writable; a user editing their own row
 * is limited to the crew self-service allow-list (`OWN_PROFILE_FIELDS` in
 * src/modules/auth/lib/permissions.ts).
 */
export function resolveEditableFields(input: { canEdit: boolean; isOwnRecord: boolean }): ReadonlySet<ProfileFormField> {
  if (input.canEdit) {
    return new Set(PROFILE_FORM_FIELDS.filter((f) => !READ_ONLY_PROFILE_FIELDS.has(f)));
  }
  if (input.isOwnRecord) {
    const own = new Set<string>(getEditableFields('crew', true));
    return new Set(PROFILE_FORM_FIELDS.filter((f) => own.has(f) && !READ_ONLY_PROFILE_FIELDS.has(f)));
  }
  return new Set();
}

/**
 * Select options for a vocabulary list, keeping whatever is currently stored
 * even if it is not in the list (imported data, legacy labels).
 */
export function withStoredOption(list: readonly string[], current: string | null | undefined): string[] {
  const options = [...list];
  if (current && !options.includes(current)) options.unshift(current);
  return options;
}

export const EMPLOYMENT_STATUSES = ['permanent', 'rotational', 'temporary', 'seasonal', 'freelance', 'contractor'] as const;

// ---------------------------------------------------------------------------
// Avatar upload helpers
// ---------------------------------------------------------------------------

export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
export const AVATAR_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

const AVATAR_EXTENSIONS: Record<(typeof AVATAR_MIME_TYPES)[number], string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** Returns an error message, or null when the file is acceptable. */
export function validateAvatarFile(file: { type: string; size: number }): string | null {
  if (!(AVATAR_MIME_TYPES as readonly string[]).includes(file.type)) {
    return 'Please choose a JPEG, PNG or WebP image';
  }
  if (file.size > AVATAR_MAX_BYTES) {
    return 'Image must be 5 MB or smaller';
  }
  if (file.size === 0) {
    return 'The selected file is empty';
  }
  return null;
}

/** `<company_id>/<profile_id>/<timestamp>.<ext>` — must match the avatars bucket policy. */
export function avatarStoragePath(companyId: string, profileId: string, mimeType: string, now: number = Date.now()): string {
  const ext = AVATAR_EXTENSIONS[mimeType as (typeof AVATAR_MIME_TYPES)[number]] ?? 'jpg';
  return `${companyId}/${profileId}/${now}.${ext}`;
}

/** Initials for avatar fallbacks. */
export function profileInitials(firstName: string | null | undefined, lastName: string | null | undefined): string {
  return `${firstName?.trim()[0] ?? ''}${lastName?.trim()[0] ?? ''}`.toUpperCase() || '?';
}
