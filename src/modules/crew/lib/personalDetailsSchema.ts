/**
 * The crew profile's Personal and Contact forms (X1-03; gap/04 C17, C20,
 * C21, W1 field rules, T-68): zod schemas for React Hook Form, the field
 * groups the server enforces, the labels of the fixed lists, and the
 * payload builders that send only what changed.
 *
 * Field groups (mirror of crew_personal_field_groups() in
 * 20261124060300_crew_profile_details.sql):
 * - identity: names, title, sex, date and place of birth, nationalities,
 *   residency, work email, crew number, usual place of embarkation. Only an
 *   editor (HR, or crew_profiles.edit on the person's vessel) changes them.
 * - self: height, weight, marital status, children, biography, address,
 *   repatriation airport and phones. The person changes their own.
 *
 * Pure: no React, no client. Dates are date-only strings in local time
 * (src/shared/lib/form.ts).
 */
import { z } from 'zod';
import { blankToNull, isDateOnly, todayDateOnly } from '@/shared/lib/form';
import { crewRefusalMessage } from './crewUpdateErrors';
import { isValidNationalNumber, normaliseDialCode, normaliseNationalNumber } from './phone';
import type {
  CrewHasChildren,
  CrewLanguageRow,
  CrewLanguageSaveRow,
  CrewMaritalStatus,
  CrewPersonalDetailsRow,
  CrewSex,
  CrewTitle,
} from '../types/db.pending';
import { LANGUAGE_PROFICIENCIES, type LanguageProficiency } from '../types/domain';

/** The D-01 note while crew_personal_details is not applied (X1 spec X1-03 §4). */
export const SAVE_UNAVAILABLE = 'Saving these details becomes available once the crew update is applied.';
/** Why identity fields are read-only for the person themselves. */
export const IDENTITY_LOCKED = 'Names, birth details, nationalities and the crew number are changed by HR or a crew editor of this vessel.';

// ---------------------------------------------------------------- field groups and labels

export type PersonalFieldGroup = 'identity' | 'self';

/** Every field a personal-details payload may carry, with its group (the server refuses any other key). */
export const PERSONAL_FIELD_GROUP = {
  first_name: 'identity',
  last_name: 'identity',
  preferred_name: 'identity',
  title: 'identity',
  middle_name: 'identity',
  work_email: 'identity',
  crew_number: 'identity',
  sex: 'identity',
  date_of_birth: 'identity',
  place_of_birth: 'identity',
  nationality_code: 'identity',
  dual_nationality_code: 'identity',
  residency_country_code: 'identity',
  place_of_embarkation: 'identity',
  height_cm: 'self',
  weight_kg: 'self',
  marital_status: 'self',
  has_children: 'self',
  biography: 'self',
  address_line1: 'self',
  address_line2: 'self',
  city: 'self',
  region: 'self',
  postal_code: 'self',
  country_code: 'self',
  repatriation_airport: 'self',
  phone_dial_code: 'self',
  phone_number: 'self',
  mobile_dial_code: 'self',
  mobile_number: 'self',
} as const satisfies Record<string, PersonalFieldGroup>;

export type PersonalField = keyof typeof PERSONAL_FIELD_GROUP;
export type PersonalPayload = Partial<Record<PersonalField, string | number | null>>;

export const TITLES = ['mr', 'mrs', 'ms', 'miss', 'dr', 'capt', 'mx'] as const satisfies readonly CrewTitle[];
export const TITLE_LABEL: Record<CrewTitle, string> = { mr: 'Mr', mrs: 'Mrs', ms: 'Ms', miss: 'Miss', dr: 'Dr', capt: 'Capt', mx: 'Mx' };

export const SEXES = ['male', 'female', 'other', 'undisclosed'] as const satisfies readonly CrewSex[];
export const SEX_LABEL: Record<CrewSex, string> = { male: 'Male', female: 'Female', other: 'Other', undisclosed: 'Prefer not to say' };

export const MARITAL_STATUSES = [
  'single',
  'married',
  'living_with_partner',
  'domestic_partnership',
  'separated',
  'divorced',
  'widowed',
  'undisclosed',
] as const satisfies readonly CrewMaritalStatus[];
export const MARITAL_STATUS_LABEL: Record<CrewMaritalStatus, string> = {
  single: 'Single',
  married: 'Married',
  living_with_partner: 'Living with a partner',
  domestic_partnership: 'Domestic partnership',
  separated: 'Separated',
  divorced: 'Divorced',
  widowed: 'Widowed',
  undisclosed: 'Prefer not to say',
};

export const HAS_CHILDREN = ['yes', 'no', 'undisclosed'] as const satisfies readonly CrewHasChildren[];
export const HAS_CHILDREN_LABEL: Record<CrewHasChildren, string> = { yes: 'Yes', no: 'No', undisclosed: 'Prefer not to say' };

export const BIOGRAPHY_MAX = 2000;

/** The four language places: 1 is the mother tongue. */
export const LANGUAGE_SLOTS = [1, 2, 3, 4] as const;
export const LANGUAGE_SLOT_LABEL: Record<(typeof LANGUAGE_SLOTS)[number], string> = {
  1: 'Mother tongue',
  2: 'Second language',
  3: 'Third language',
  4: 'Fourth language',
};

// ---------------------------------------------------------------- zod field builders

const text = (max: number, message: string) => z.string().trim().max(max, message);
const emptyOr = <T extends z.ZodTypeAny>(schema: T) => z.union([z.literal(''), schema]);
const countryCode = emptyOr(z.string().regex(/^[A-Z]{2}$/, 'Choose a country from the list'));

/** An optional whole number in a range, typed as text in the input. */
const wholeNumberText = (min: number, max: number, message: string) =>
  z
    .string()
    .trim()
    .refine((v) => v === '' || (/^[0-9]+$/.test(v) && Number(v) >= min && Number(v) <= max), message);

const languageRow = z.object({
  code: z.string(),
  proficiency: z.union([z.literal(''), z.enum(LANGUAGE_PROFICIENCIES)]),
});

// ---------------------------------------------------------------- Personal form

export const personalDetailsSchema = z
  .object({
    title: z.union([z.literal(''), z.enum(TITLES)]),
    first_name: z.string().trim().min(1, 'Enter the first name').max(50, 'Keep the first name to 50 characters'),
    middle_name: text(50, 'Keep the middle name to 50 characters'),
    last_name: z.string().trim().min(1, 'Enter the last name').max(50, 'Keep the last name to 50 characters'),
    preferred_name: text(50, 'Keep the preferred name to 50 characters'),
    sex: z.union([z.literal(''), z.enum(SEXES)]),
    date_of_birth: z
      .string()
      .trim()
      .refine((v) => v === '' || isDateOnly(v), 'Enter a valid date')
      .refine((v) => v === '' || !isDateOnly(v) || (v >= '1900-01-01' && v <= todayDateOnly()), 'Enter a date of birth from 1900 to today'),
    place_of_birth: text(120, 'Keep the place of birth to 120 characters'),
    nationality_code: countryCode,
    dual_nationality_code: countryCode,
    residency_country_code: countryCode,
    work_email: emptyOr(z.string().trim().max(254, 'Keep the email to 254 characters').email('Enter a valid email address')),
    crew_number: text(20, 'Keep the crew number to 20 characters'),
    place_of_embarkation: text(120, 'Keep the place of embarkation to 120 characters'),
    height_cm: wholeNumberText(100, 250, 'Height is a whole number from 100 to 250 cm'),
    weight_kg: wholeNumberText(30, 250, 'Weight is a whole number from 30 to 250 kg'),
    marital_status: z.union([z.literal(''), z.enum(MARITAL_STATUSES)]),
    has_children: z.union([z.literal(''), z.enum(HAS_CHILDREN)]),
    languages: z.array(languageRow).length(4),
  })
  .superRefine((v, ctx) => {
    if (v.dual_nationality_code && v.dual_nationality_code === v.nationality_code) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['dual_nationality_code'], message: 'The second nationality is the same as the first' });
    }
    const chosen = v.languages.map((l) => l.code.trim()).filter(Boolean);
    if (chosen.length > 0 && !v.languages[0].code.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['languages', 0, 'code'], message: 'Start with the mother tongue' });
    }
    const seen = new Set<string>();
    v.languages.forEach((l, i) => {
      const code = l.code.trim();
      if (!code) return;
      if (seen.has(code)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['languages', i, 'code'], message: 'This language is already listed' });
      }
      seen.add(code);
      if (i > 0 && !l.proficiency) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['languages', i, 'proficiency'], message: 'Choose how well they speak it' });
      }
    });
  });

export type PersonalDetailsValues = z.infer<typeof personalDetailsSchema>;

/** The names the profile carries (profiles), next to the details row. */
export interface ProfileNames {
  first_name: string | null;
  last_name: string | null;
  preferred_name: string | null;
}

type DetailsLike = Partial<CrewPersonalDetailsRow> | null | undefined;
type LanguageLike = Pick<CrewLanguageRow, 'slot' | 'language_code' | 'proficiency'>;

const str = (v: string | number | null | undefined): string => (v === null || v === undefined ? '' : String(v));

/** The form's starting values from the stored row, the names and the languages. */
export function personalDefaults(details: DetailsLike, names: ProfileNames, languages: readonly LanguageLike[]): PersonalDetailsValues {
  const bySlot = new Map(languages.map((l) => [l.slot, l]));
  return {
    title: details?.title ?? '',
    first_name: str(names.first_name),
    middle_name: str(details?.middle_name),
    last_name: str(names.last_name),
    preferred_name: str(names.preferred_name),
    sex: details?.sex ?? '',
    date_of_birth: str(details?.date_of_birth).slice(0, 10),
    place_of_birth: str(details?.place_of_birth),
    nationality_code: str(details?.nationality_code),
    dual_nationality_code: str(details?.dual_nationality_code),
    residency_country_code: str(details?.residency_country_code),
    work_email: str(details?.work_email),
    crew_number: str(details?.crew_number),
    place_of_embarkation: str(details?.place_of_embarkation),
    height_cm: str(details?.height_cm),
    weight_kg: str(details?.weight_kg),
    marital_status: details?.marital_status ?? '',
    has_children: details?.has_children ?? '',
    languages: LANGUAGE_SLOTS.map((slot) => ({
      code: bySlot.get(slot)?.language_code ?? '',
      proficiency: (slot === 1 ? '' : bySlot.get(slot)?.proficiency ?? '') as LanguageProficiency | '',
    })),
  };
}

const PERSONAL_FORM_FIELDS = [
  'title',
  'first_name',
  'middle_name',
  'last_name',
  'preferred_name',
  'sex',
  'date_of_birth',
  'place_of_birth',
  'nationality_code',
  'dual_nationality_code',
  'residency_country_code',
  'work_email',
  'crew_number',
  'place_of_embarkation',
  'height_cm',
  'weight_kg',
  'marital_status',
  'has_children',
] as const satisfies readonly PersonalField[];

/** A form value as the server stores it (blank -> null; whole numbers as numbers; email lower-case). */
function toStored(field: PersonalField, value: string): string | number | null {
  const v = blankToNull(value);
  if (v === null) return null;
  if (field === 'height_cm' || field === 'weight_kg') return Number(v);
  if (field === 'work_email') return v.toLowerCase();
  return v;
}

/**
 * The changed fields of the Personal form as a crew_personal_details_save
 * payload. Without identity rights, identity fields are left out (they are
 * read-only in the form), so a self-only save never trips the server's lock.
 */
export function personalPayload(values: PersonalDetailsValues, initial: PersonalDetailsValues, rights: { identity: boolean; self: boolean }): PersonalPayload {
  const payload: PersonalPayload = {};
  for (const field of PERSONAL_FORM_FIELDS) {
    const group = PERSONAL_FIELD_GROUP[field];
    if (group === 'identity' && !rights.identity) continue;
    if (group === 'self' && !rights.self) continue;
    const next = toStored(field, values[field]);
    if (next !== toStored(field, initial[field])) payload[field] = next;
  }
  return payload;
}

/** The languages as crew_languages_save rows (filled places only, in order), or null when they did not change. */
export function languagesPayload(values: PersonalDetailsValues, initial: PersonalDetailsValues): CrewLanguageSaveRow[] | null {
  const rows = (v: PersonalDetailsValues): CrewLanguageSaveRow[] =>
    v.languages
      .map((l, i) => ({ slot: i + 1, language_code: l.code.trim().toLowerCase(), proficiency: i === 0 ? null : (l.proficiency || null) }))
      .filter((l) => l.language_code !== '');
  const next = rows(values);
  return JSON.stringify(next) === JSON.stringify(rows(initial)) ? null : next;
}

// ---------------------------------------------------------------- Contact form

const phonePair = (dialField: 'phone_dial_code' | 'mobile_dial_code', numberField: 'phone_number' | 'mobile_number', label: string) =>
  (v: Record<string, string>, ctx: z.RefinementCtx) => {
    const national = normaliseNationalNumber(v[numberField]);
    if (!national) return;
    if (!isValidNationalNumber(national)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [numberField], message: `Enter the ${label} number without its dial code: 4 to 20 digits` });
    }
    if (!normaliseDialCode(v[dialField])) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [dialField], message: 'Choose the dial code' });
    }
  };

export const contactDetailsSchema = z
  .object({
    address_line1: text(120, 'Keep each address line to 120 characters'),
    address_line2: text(120, 'Keep each address line to 120 characters'),
    city: text(80, 'Keep the city to 80 characters'),
    region: text(80, 'Keep the region to 80 characters'),
    postal_code: text(20, 'Keep the postal code to 20 characters'),
    country_code: countryCode,
    repatriation_airport: z
      .string()
      .trim()
      .refine((v) => v === '' || /^[A-Za-z]{3}$/.test(v), 'Use the airport’s three-letter code, for example LHR'),
    phone_dial_code: z.string(),
    phone_number: z.string(),
    mobile_dial_code: z.string(),
    mobile_number: z.string(),
  })
  .superRefine((v, ctx) => {
    phonePair('phone_dial_code', 'phone_number', 'phone')(v, ctx);
    phonePair('mobile_dial_code', 'mobile_number', 'mobile')(v, ctx);
  });

export type ContactDetailsValues = z.infer<typeof contactDetailsSchema>;

const CONTACT_FIELDS = [
  'address_line1',
  'address_line2',
  'city',
  'region',
  'postal_code',
  'country_code',
  'repatriation_airport',
  'phone_dial_code',
  'phone_number',
  'mobile_dial_code',
  'mobile_number',
] as const satisfies readonly PersonalField[];

export function contactDefaults(details: DetailsLike): ContactDetailsValues {
  return {
    address_line1: str(details?.address_line1),
    address_line2: str(details?.address_line2),
    city: str(details?.city),
    region: str(details?.region),
    postal_code: str(details?.postal_code),
    country_code: str(details?.country_code),
    repatriation_airport: str(details?.repatriation_airport),
    phone_dial_code: str(details?.phone_dial_code),
    phone_number: str(details?.phone_number),
    mobile_dial_code: str(details?.mobile_dial_code),
    mobile_number: str(details?.mobile_number),
  };
}

/** A Contact form value as stored: numbers normalised, a dial code without its number dropped, the airport upper-case. */
function contactStored(field: (typeof CONTACT_FIELDS)[number], v: ContactDetailsValues): string | null {
  switch (field) {
    case 'phone_number':
    case 'mobile_number':
      return blankToNull(normaliseNationalNumber(v[field]));
    case 'phone_dial_code':
      return normaliseNationalNumber(v.phone_number) ? normaliseDialCode(v.phone_dial_code) : null;
    case 'mobile_dial_code':
      return normaliseNationalNumber(v.mobile_number) ? normaliseDialCode(v.mobile_dial_code) : null;
    case 'repatriation_airport':
      return blankToNull(v.repatriation_airport)?.toUpperCase() ?? null;
    default:
      return blankToNull(v[field]);
  }
}

/** The changed fields of the Contact form as a save payload (all self fields). */
export function contactPayload(values: ContactDetailsValues, initial: ContactDetailsValues): PersonalPayload {
  const payload: PersonalPayload = {};
  for (const field of CONTACT_FIELDS) {
    const next = contactStored(field, values);
    if (next !== contactStored(field, initial)) payload[field] = next;
  }
  // A phone pair travels together, so the stored CHECK (a dial code needs its number) always holds.
  for (const [dial, number] of [['phone_dial_code', 'phone_number'], ['mobile_dial_code', 'mobile_number']] as const) {
    if (dial in payload || number in payload) {
      payload[dial] = contactStored(dial, values);
      payload[number] = contactStored(number, values);
    }
  }
  return payload;
}

// ---------------------------------------------------------------- Biography

export const biographySchema = z.object({
  biography: z.string().max(BIOGRAPHY_MAX, `Keep the biography to ${BIOGRAPHY_MAX.toLocaleString('en-GB')} characters`),
});
export type BiographyValues = z.infer<typeof biographySchema>;

// ---------------------------------------------------------------- server refusals

interface PostgrestLike {
  code?: unknown;
  message?: unknown;
  details?: unknown;
  hint?: unknown;
}

/**
 * A refused save in words, and the form field it is about (the server puts
 * the field in HINT): 22023 refusals carry their sentence in DETAIL; the
 * rest go through crewRefusalMessage (a 42501 DETAIL as is).
 */
export function profileSaveRefusal(error: unknown): { message: string; field: string | null } {
  if (error !== null && typeof error === 'object') {
    const { code, details, hint } = error as PostgrestLike;
    const detail = typeof details === 'string' ? details.trim() : '';
    const field = typeof hint === 'string' && /^[a-z_0-9]+$/.test(hint.trim()) ? hint.trim() : null;
    if (code === '22023' && detail) return { message: detail, field };
    if (code === '42501') return { message: crewRefusalMessage(error), field };
  }
  return { message: crewRefusalMessage(error), field: null };
}
