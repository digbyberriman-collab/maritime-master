/**
 * The crew profile's Medical tab data (gap/04 C60; X1-03B): the person's
 * clinical summary from the Health module, read through `hw_people.profile_id`.
 *
 * Minimal on purpose (X1 spec risk 15): explicit column lists, and only the
 * summary fields the tab shows. No notes, reactions, treatment text,
 * dosages, histories or consultation narrative leave the database here;
 * a confidential consultation keeps only its number and date (its type,
 * outcome and fitness are dropped as the rows are read). The
 * med_* RLS (medical staff, or the person) stays the control: the tab gate
 * (health.personnel_medical.crew_medical_records.view) decides whether this
 * hook runs at all, and `enabled: false` sends nothing.
 *
 * States:
 * - `no-record`: the person has no Health record (no hw_people row the
 *   viewer can read);
 * - `not-enabled`: a Health table is missing (D-01);
 * - `denied`: the database refused the read (42501);
 * - `error`: anything else, with Retry. Nothing is mocked.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { isMissingTable } from '@/integrations/supabase/missingRelation';
import type { VaccineDose } from '../lib/vaccines';
import { crewKeys } from './crewKeys';

export interface MedicalVessel {
  id: string;
  companyId: string;
}

export interface MedicalAllergy {
  id: string;
  allergen: string;
  allergyType: string;
  severity: string;
  carriesAutoinjector: boolean;
}

export interface MedicalCondition {
  id: string;
  name: string;
  category: string | null;
  status: string;
  affectsFitness: boolean;
  requiresMedication: boolean;
}

export interface MedicalMedication {
  id: string;
  name: string;
  isRegular: boolean;
}

/** A medical report (med_consultations): the register line only, never the narrative. */
export interface MedicalReport {
  id: string;
  number: string;
  occurredAt: string;
  confidential: boolean;
  /** Null for a confidential report. */
  type: string | null;
  outcome: string | null;
  fitForDuty: string | null;
  followUpOn: string | null;
}

export interface CrewMedicalSummary {
  /** hw_people.id: the Health pages take it as `?person=`. */
  personId: string;
  personActive: boolean;
  bloodGroup: string | null;
  lastReviewedOn: string | null;
  allergies: MedicalAllergy[];
  conditions: MedicalCondition[];
  medications: MedicalMedication[];
  vaccinations: VaccineDose[];
  reports: MedicalReport[];
}

export type MedicalSummaryState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'not-enabled' }
  | { status: 'denied' }
  | { status: 'error'; error: unknown; retry: () => void }
  | { status: 'no-record' }
  | { status: 'ready'; summary: CrewMedicalSummary; refreshing: boolean };

/** Allergy severities, worst first (a safety list: the worst is read first). */
const SEVERITY_ORDER = ['anaphylaxis', 'severe', 'moderate', 'mild'];
const severityRank = (value: string): number => {
  const i = SEVERITY_ORDER.indexOf(value.trim().toLowerCase());
  return i === -1 ? SEVERITY_ORDER.length : i;
};

/** The most recent reports shown on the tab; the full register is in Health. */
export const MEDICAL_REPORTS_SHOWN = 8;

class MedicalNotEnabled extends Error {
  constructor() {
    super('medical_not_enabled');
  }
}

class MedicalDenied extends Error {
  constructor() {
    super('medical_denied');
  }
}

const isDenied = (error: unknown): boolean =>
  !!error && typeof error === 'object' && (error as { code?: unknown }).code === '42501';

/** A failed read as the tab reads it: missing table → not enabled, refusal → denied, else the error itself. */
function rethrow(error: unknown): never {
  if (isMissingTable(error)) throw new MedicalNotEnabled();
  if (isDenied(error)) throw new MedicalDenied();
  throw error;
}

export async function fetchCrewMedicalSummary(companyId: string, profileId: string): Promise<CrewMedicalSummary | null> {
  const people = await supabase
    .from('hw_people')
    .select('id, is_active')
    .eq('company_id', companyId)
    .eq('profile_id', profileId)
    .order('is_active', { ascending: false })
    .limit(1);
  if (people.error) rethrow(people.error);
  const person = people.data?.[0];
  if (!person) return null;

  const [record, allergies, conditions, medications, vaccinations, reports] = await Promise.all([
    supabase.from('med_patient_records').select('blood_group, last_reviewed_on').eq('person_id', person.id).maybeSingle(),
    supabase
      .from('med_allergies')
      .select('id, allergen, allergy_type, severity, carries_autoinjector')
      .eq('person_id', person.id)
      .eq('is_active', true),
    supabase
      .from('med_conditions')
      .select('id, condition_name, category, status, affects_fitness, requires_medication')
      .eq('person_id', person.id)
      .in('status', ['active', 'managed'])
      .order('condition_name'),
    supabase
      .from('med_medications')
      .select('id, medication_name, is_regular')
      .eq('person_id', person.id)
      .eq('is_active', true)
      .order('medication_name'),
    supabase
      .from('med_vaccinations')
      .select('id, vaccine, dose_label, administered_on, valid_until, exemption_reason')
      .eq('person_id', person.id)
      .order('administered_on', { ascending: false, nullsFirst: false }),
    supabase
      .from('med_consultations')
      .select('id, consultation_number, occurred_at, is_confidential, consultation_type, outcome, fit_for_duty, follow_up_on')
      .eq('person_id', person.id)
      .order('occurred_at', { ascending: false })
      .limit(MEDICAL_REPORTS_SHOWN),
  ]);
  for (const result of [record, allergies, conditions, medications, vaccinations, reports]) {
    if (result.error) rethrow(result.error);
  }

  return {
    personId: person.id,
    personActive: person.is_active,
    bloodGroup: record.data?.blood_group ?? null,
    lastReviewedOn: record.data?.last_reviewed_on ?? null,
    allergies: (allergies.data ?? [])
      .map((a) => ({
        id: a.id,
        allergen: a.allergen,
        allergyType: a.allergy_type,
        severity: a.severity,
        carriesAutoinjector: a.carries_autoinjector,
      }))
      .sort((a, b) => severityRank(a.severity) - severityRank(b.severity) || a.allergen.localeCompare(b.allergen)),
    conditions: (conditions.data ?? []).map((c) => ({
      id: c.id,
      name: c.condition_name,
      category: c.category,
      status: c.status,
      affectsFitness: c.affects_fitness,
      requiresMedication: c.requires_medication,
    })),
    medications: (medications.data ?? []).map((m) => ({ id: m.id, name: m.medication_name, isRegular: m.is_regular })),
    vaccinations: (vaccinations.data ?? []).map((v) => ({
      id: v.id,
      vaccine: v.vaccine,
      doseLabel: v.dose_label,
      administeredOn: v.administered_on,
      validUntil: v.valid_until,
      exempt: Boolean((v.exemption_reason ?? '').trim()),
    })),
    reports: (reports.data ?? []).map((r) => ({
      id: r.id,
      number: r.consultation_number,
      occurredAt: r.occurred_at,
      confidential: r.is_confidential,
      type: r.is_confidential ? null : r.consultation_type,
      outcome: r.is_confidential ? null : r.outcome,
      fitForDuty: r.is_confidential ? null : r.fit_for_duty,
      followUpOn: r.is_confidential ? null : r.follow_up_on,
    })),
  };
}

export const medicalKey = (vessel: MedicalVessel | null, profileId: string) =>
  [...crewKeys.vessel(vessel?.companyId, vessel?.id), 'profile', profileId, 'medical'] as const;

const retryReads = (failureCount: number, error: unknown) =>
  !(error instanceof MedicalNotEnabled) && !(error instanceof MedicalDenied) && failureCount < 1;

/**
 * The person's medical summary seen from the vessel. `enabled: false` (the
 * medical gate still loading or denied) sends no request and answers `idle`.
 */
export function useCrewMedicalSummary(vessel: MedicalVessel | null, profileId: string | null, options: { enabled?: boolean } = {}): MedicalSummaryState {
  const enabled = (options.enabled ?? true) && Boolean(vessel?.companyId) && Boolean(profileId);
  const query = useQuery({
    queryKey: medicalKey(vessel, profileId ?? ''),
    queryFn: () => fetchCrewMedicalSummary(vessel?.companyId as string, profileId as string),
    enabled,
    retry: retryReads,
    staleTime: 60_000,
  });
  if (!enabled) return { status: 'idle' };
  if (query.error) {
    if (query.error instanceof MedicalNotEnabled) return { status: 'not-enabled' };
    if (query.error instanceof MedicalDenied) return { status: 'denied' };
    return { status: 'error', error: query.error, retry: () => void query.refetch() };
  }
  if (query.data === undefined) return { status: 'loading' };
  if (query.data === null) return { status: 'no-record' };
  return { status: 'ready', summary: query.data, refreshing: query.isFetching };
}
