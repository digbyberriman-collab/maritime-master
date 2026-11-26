/**
 * The company medical settings (gap/02 M1, W8; D-X5-08; X5-08): which
 * fitness assessments count as an ENG1, which are accepted as equivalent
 * (T-185) and which vaccines every crew member must hold. React Hook Form +
 * zod, with the server's own rules (`fleet_medical_settings_save` and the
 * CHECKs of 20261124040700_fleet_medical_status.sql) checked before any
 * request:
 *
 * - each assessment type is an ENG1, an accepted equivalent or not counted;
 *   at least one is an ENG1;
 * - a vaccine name is 1 to 80 characters (trimmed, spaces collapsed), each
 *   name once whatever its case, 40 at most.
 *
 * The warning windows are not here: ENG1 at risk and boosters due use the
 * company's `medical` and `vaccination` alert windows (C5,
 * expiry_window_rules), set in Reports › Alert windows.
 */
import { z } from 'zod';
import type { FleetMedicalSettingsPayload, FleetMedicalSettingsRow } from '../types/db.pending';
import { vaccineKey } from './medicalStatus';

/** `med_fitness_assessments.assessment_type`, in the server's canonical order. */
export const ASSESSMENT_TYPES = ['eng1', 'ml5', 'company', 'return_to_work', 'pre_employment', 'periodic', 'other'] as const;
export type AssessmentType = (typeof ASSESSMENT_TYPES)[number];

export const ASSESSMENT_TYPE_LABELS: Readonly<Record<AssessmentType, string>> = Object.freeze({
  eng1: 'ENG1',
  ml5: 'ML5 medical',
  company: 'Company medical',
  return_to_work: 'Return-to-work medical',
  pre_employment: 'Pre-employment medical',
  periodic: 'Periodic medical',
  other: 'Other medical',
});

/** How one assessment type counts. */
export const ASSESSMENT_ROLES = ['eng1', 'equivalent', 'none'] as const;
export type AssessmentRole = (typeof ASSESSMENT_ROLES)[number];

export const ASSESSMENT_ROLE_LABELS: Readonly<Record<AssessmentRole, string>> = Object.freeze({
  eng1: 'Counts as ENG1',
  equivalent: 'Accepted equivalent',
  none: 'Not counted',
});

export const VACCINE_NAME_MAX = 80;
export const REQUIRED_VACCINES_MAX = 40;

/** The settings as the client holds them. */
export interface MedicalSettings {
  eng1Types: AssessmentType[];
  equivalentTypes: AssessmentType[];
  requiredVaccines: string[];
}

/** No row yet: ENG1 only, no equivalents, no required vaccines (the table defaults). */
export const DEFAULT_MEDICAL_SETTINGS: Readonly<MedicalSettings> = Object.freeze<MedicalSettings>({
  eng1Types: ['eng1'],
  equivalentTypes: [],
  requiredVaccines: [],
});

const isAssessmentType = (value: unknown): value is AssessmentType =>
  typeof value === 'string' && (ASSESSMENT_TYPES as readonly string[]).includes(value);

/** Types in the canonical order, each once, unknown ones dropped. */
export const orderTypes = (types: readonly string[]): AssessmentType[] => ASSESSMENT_TYPES.filter((t) => types.includes(t));

/** A stored row as settings (unknown types dropped). */
export function settingsFromRow(row: Pick<FleetMedicalSettingsRow, 'eng1_assessment_types' | 'eng1_equivalent_types' | 'required_vaccines'>): MedicalSettings {
  return {
    eng1Types: orderTypes((row.eng1_assessment_types ?? []).filter(isAssessmentType)),
    equivalentTypes: orderTypes((row.eng1_equivalent_types ?? []).filter(isAssessmentType)),
    requiredVaccines: [...(row.required_vaccines ?? [])],
  };
}

/** A vaccine name as it is stored: trimmed, runs of spaces as one. */
export const normaliseVaccineName = (name: string): string => name.trim().replace(/\s+/g, ' ');

// ─── The form ─────────────────────────────────────────────────────────────

export const ENG1_TYPE_REQUIRED = 'Choose at least one assessment that counts as ENG1';
export const VACCINE_NAME_REQUIRED = 'Enter the vaccine name';
export const VACCINE_NAME_TOO_LONG = `Keep the name to ${VACCINE_NAME_MAX} characters`;
export const VACCINE_DUPLICATE = 'This vaccine is already on the list';
export const TOO_MANY_VACCINES = `The list holds up to ${REQUIRED_VACCINES_MAX} vaccines`;

/** What the form holds: each type's role, and the vaccines. */
export interface MedicalSettingsFormValues {
  roles: Record<AssessmentType, AssessmentRole>;
  requiredVaccines: string[];
}

/** One vaccine name as typed (checked again on submit). */
export const vaccineNameSchema = z
  .string()
  .transform(normaliseVaccineName)
  .pipe(z.string().min(1, VACCINE_NAME_REQUIRED).max(VACCINE_NAME_MAX, VACCINE_NAME_TOO_LONG));

const roleSchema = z.enum(ASSESSMENT_ROLES);

export const medicalSettingsSchema = z
  .object({
    roles: z.object(Object.fromEntries(ASSESSMENT_TYPES.map((t) => [t, roleSchema])) as Record<AssessmentType, typeof roleSchema>),
    requiredVaccines: z.array(vaccineNameSchema).max(REQUIRED_VACCINES_MAX, TOO_MANY_VACCINES),
  })
  .superRefine((values, ctx) => {
    if (!ASSESSMENT_TYPES.some((t) => values.roles[t] === 'eng1')) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['roles'], message: ENG1_TYPE_REQUIRED });
    }
    const seen = new Set<string>();
    values.requiredVaccines.forEach((name, index) => {
      const key = vaccineKey(name);
      if (key && seen.has(key)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['requiredVaccines', index], message: VACCINE_DUPLICATE });
      if (key) seen.add(key);
    });
  });

/** The form's starting values. */
export function settingsToForm(settings: MedicalSettings): MedicalSettingsFormValues {
  const roles = Object.fromEntries(
    ASSESSMENT_TYPES.map((t) => [t, settings.eng1Types.includes(t) ? 'eng1' : settings.equivalentTypes.includes(t) ? 'equivalent' : 'none']),
  ) as Record<AssessmentType, AssessmentRole>;
  return { roles, requiredVaccines: [...settings.requiredVaccines] };
}

/** The settings a valid form holds (null when the form does not pass the rules). */
export function formToSettings(values: MedicalSettingsFormValues): MedicalSettings | null {
  const parsed = medicalSettingsSchema.safeParse(values);
  if (!parsed.success) return null;
  return {
    eng1Types: ASSESSMENT_TYPES.filter((t) => parsed.data.roles[t] === 'eng1'),
    equivalentTypes: ASSESSMENT_TYPES.filter((t) => parsed.data.roles[t] === 'equivalent'),
    requiredVaccines: parsed.data.requiredVaccines,
  };
}

/** What `fleet_medical_settings_save` is sent: every list, and the `updated_at` the reader saw (null = no row yet). */
export function toSavePayload(settings: MedicalSettings, expectedUpdatedAt: string | null): FleetMedicalSettingsPayload {
  return {
    eng1_assessment_types: [...settings.eng1Types],
    eng1_equivalent_types: [...settings.equivalentTypes],
    required_vaccines: [...settings.requiredVaccines],
    expected_updated_at: expectedUpdatedAt,
  };
}

/**
 * Adds a typed name to the list: normalised, refused (with the reason) when
 * blank, too long, already listed (any case) or the list is full.
 */
export function addVaccine(list: readonly string[], typed: string): { list: string[]; error: string | null } {
  const name = normaliseVaccineName(typed);
  if (!name) return { list: [...list], error: VACCINE_NAME_REQUIRED };
  if (name.length > VACCINE_NAME_MAX) return { list: [...list], error: VACCINE_NAME_TOO_LONG };
  if (list.some((v) => vaccineKey(v) === vaccineKey(name))) return { list: [...list], error: VACCINE_DUPLICATE };
  if (list.length >= REQUIRED_VACCINES_MAX) return { list: [...list], error: TOO_MANY_VACCINES };
  return { list: [...list, name], error: null };
}

// ─── Refusals ─────────────────────────────────────────────────────────────

const REFUSALS: Readonly<Record<string, string>> = Object.freeze({
  not_permitted: 'Only medical admins with access to the whole fleet can change the medical settings.',
  stale_settings: 'Someone changed the medical settings while you were editing. Close and open the settings again to see their change.',
  eng1_types_required: ENG1_TYPE_REQUIRED + '.',
  eng1_types_overlap: 'An assessment cannot count as ENG1 and as an equivalent at the same time.',
  invalid_assessment_type: 'One of the assessment types is not one STORM knows. Reload the page and try again.',
  invalid_vaccine: `Each vaccine name needs 1 to ${VACCINE_NAME_MAX} characters.`,
  too_many_vaccines: TOO_MANY_VACCINES + '.',
  invalid_settings: 'The settings could not be read by the server. Reload the page and try again.',
  unknown_setting: 'The settings could not be read by the server. Reload the page and try again.',
  settings_not_saved: 'The settings were not saved. Try again.',
});

/** A sentence for a refusal of `fleet_medical_settings_save` (its stable message), or null when it is not one. */
export function medicalSettingsRefusal(message: string | null | undefined): string | null {
  return message ? REFUSALS[message] ?? null : null;
}
