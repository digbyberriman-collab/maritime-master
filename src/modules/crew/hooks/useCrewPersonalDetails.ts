/**
 * A person's personal details for the profile's Personal and Contact tabs
 * (X1-03; gap/04 C17, C20, C21): the crew_personal_details row, the
 * languages, and the names and sign-in email from profiles; and the two
 * saves (crew_personal_details_save, crew_languages_save), each checked
 * against what the server returned (no fake success).
 *
 * D-01. While 20261124060300 is not applied crew_personal_details is
 * missing: the hook answers mode `legacy` with the fields profiles already
 * holds (date and place of birth, nationality text, gender, embarkation
 * port, phone), read-only; the tabs say saving arrives with the crew update.
 * Any other error is an error with Retry. Nothing is mocked.
 *
 * The details are the person's, not the vessel's: the key carries the
 * company and the profile (crewKeys.company).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { pendingClient, type NoPending } from '@/integrations/supabase/pending';
import { isMissingRelationError } from '@/shared/lib/notify';
import type {
  CrewLanguageRow,
  CrewLanguageSaveRow,
  CrewPendingFunctions,
  CrewPendingTables,
  CrewPersonalDetailsRow,
} from '../types/db.pending';
import type { PersonalPayload, ProfileNames } from '../lib/personalDetailsSchema';
import { crewKeys } from './crewKeys';

const crewDb = pendingClient<CrewPendingTables, NoPending, CrewPendingFunctions>();

export const DETAILS_COLUMNS =
  'profile_id, company_id, crew_number, title, middle_name, work_email, sex, date_of_birth, place_of_birth, nationality_code, dual_nationality_code, residency_country_code, place_of_embarkation, height_cm, weight_kg, marital_status, has_children, biography, address_line1, address_line2, city, region, postal_code, country_code, repatriation_airport, phone_dial_code, phone_number, mobile_dial_code, mobile_number, created_by, updated_by, created_at, updated_at';

/** The profile fields of the D-01 view (what profiles held before the crew update). */
export interface LegacyProfileFields {
  dateOfBirth: string | null;
  placeOfBirth: string | null;
  nationality: string | null;
  gender: string | null;
  embarkationPort: string | null;
  phone: string | null;
}

export interface ProfileIdentity extends ProfileNames {
  /** The sign-in email (an access column: changed in Users & Access, never here). */
  email: string | null;
}

export type LanguageEntry = Pick<CrewLanguageRow, 'slot' | 'language_code' | 'proficiency'>;

export type PersonalDetailsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; error: unknown; retry: () => void }
  | {
      status: 'ready';
      mode: 'server';
      details: CrewPersonalDetailsRow | null;
      languages: LanguageEntry[];
      names: ProfileIdentity;
      legacy: null;
    }
  | {
      status: 'ready';
      mode: 'legacy';
      details: null;
      languages: LanguageEntry[];
      names: ProfileIdentity;
      legacy: LegacyProfileFields;
    };

type Loaded = Extract<PersonalDetailsState, { status: 'ready' }>;

export const personalDetailsKey = (companyId: string | null | undefined, profileId: string) =>
  [...crewKeys.company(companyId), 'profile', profileId, 'personal'] as const;

export async function fetchPersonalDetails(profileId: string): Promise<Loaded> {
  const details = await crewDb.from('crew_personal_details').select(DETAILS_COLUMNS).eq('profile_id', profileId).maybeSingle();
  if (details.error && !isMissingRelationError(details.error)) throw details.error;

  if (details.error) {
    // D-01: the crew update is not applied; show what profiles holds.
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, first_name, last_name, preferred_name, date_of_birth, place_of_birth, nationality, gender, embarkation_port, phone')
      .eq('id', profileId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('This crew member could not be found.');
    return {
      status: 'ready',
      mode: 'legacy',
      details: null,
      languages: [],
      names: { email: data.email, first_name: data.first_name, last_name: data.last_name, preferred_name: data.preferred_name },
      legacy: {
        dateOfBirth: data.date_of_birth,
        placeOfBirth: data.place_of_birth,
        nationality: data.nationality,
        gender: data.gender,
        embarkationPort: data.embarkation_port,
        phone: data.phone,
      },
    };
  }

  const [languages, profile] = await Promise.all([
    crewDb.from('crew_languages').select('slot, language_code, proficiency').eq('profile_id', profileId).order('slot'),
    supabase.from('profiles').select('id, email, first_name, last_name, preferred_name').eq('id', profileId).maybeSingle(),
  ]);
  if (languages.error) throw languages.error;
  if (profile.error) throw profile.error;
  if (!profile.data) throw new Error('This crew member could not be found.');
  return {
    status: 'ready',
    mode: 'server',
    details: details.data ?? null,
    languages: languages.data ?? [],
    names: { email: profile.data.email, first_name: profile.data.first_name, last_name: profile.data.last_name, preferred_name: profile.data.preferred_name },
    legacy: null,
  };
}

/** The person's details, languages and names. `enabled: false` sends nothing. */
export function useCrewPersonalDetails(companyId: string | null | undefined, profileId: string | null, options: { enabled?: boolean } = {}): PersonalDetailsState {
  const enabled = (options.enabled ?? true) && Boolean(profileId);
  const query = useQuery({
    queryKey: personalDetailsKey(companyId, profileId ?? ''),
    queryFn: () => fetchPersonalDetails(profileId as string),
    enabled,
    retry: (failureCount, error) => !isMissingRelationError(error) && failureCount < 1,
    staleTime: 30_000,
  });
  if (!enabled) return { status: 'idle' };
  if (query.error) return { status: 'error', error: query.error, retry: () => void query.refetch() };
  if (!query.data) return { status: 'loading' };
  return query.data;
}

/** The save returned no row for this person: refused or lost on the way. */
export const DETAILS_NOT_SAVED = 'The details were not saved. Try again.';
export const LANGUAGES_NOT_SAVED = 'The languages were not saved. Try again.';

export async function savePersonalDetails(profileId: string, payload: PersonalPayload): Promise<CrewPersonalDetailsRow> {
  const { data, error } = await crewDb.rpc('crew_personal_details_save', { p_profile_id: profileId, p_payload: payload });
  if (error) throw error;
  if (!data || data.profile_id !== profileId) throw new Error(DETAILS_NOT_SAVED);
  return data;
}

export async function saveLanguages(profileId: string, rows: readonly CrewLanguageSaveRow[]): Promise<CrewLanguageRow[]> {
  const pRows = rows.map((r) => ({ slot: r.slot, language_code: r.language_code, proficiency: r.proficiency }));
  const { data, error } = await crewDb.rpc('crew_languages_save', { p_profile_id: profileId, p_rows: pRows });
  if (error) throw error;
  const saved = data ?? [];
  if (saved.length !== rows.length || saved.some((r) => r.profile_id !== profileId)) throw new Error(LANGUAGES_NOT_SAVED);
  return saved;
}

/**
 * The two saves. On success every crew query of the company refetches (the
 * header's names, the crew list, the details), so nothing shows the old
 * values; a failure is thrown to the caller, which reports it.
 */
export function usePersonalDetailsMutations(companyId: string | null | undefined, profileId: string) {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: crewKeys.company(companyId) });
  const details = useMutation({
    mutationFn: (payload: PersonalPayload) => savePersonalDetails(profileId, payload),
    onSuccess: refresh,
  });
  const languages = useMutation({
    mutationFn: (rows: readonly CrewLanguageSaveRow[]) => saveLanguages(profileId, rows),
    onSuccess: refresh,
  });
  return { details, languages, saving: details.isPending || languages.isPending };
}
