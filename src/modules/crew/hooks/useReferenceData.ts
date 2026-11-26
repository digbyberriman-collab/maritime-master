/**
 * Global reference lists (X1-01; gap/04 C70, C71): countries (ISO 3166-1,
 * with demonym, dial code and flag), languages (ISO 639) and departments.
 * They change only by migration, so they are cached for 24 hours.
 *
 * D-01: while 20261124060100 is not applied the tables are missing: a list
 * answers `missing` and the pickers fall back to free text. Any other error
 * is `error` with a retry. Nothing is mocked.
 */
import { useQuery } from '@tanstack/react-query';
import { isMissingRelationError } from '@/shared/lib/notify';
import { pendingClient, type NoPending } from '@/integrations/supabase/pending';
import type { CrewPendingFunctions, CrewPendingTables } from '../types/db.pending';
import type { Country, Department, Language } from '../types/domain';
import { crewKeys } from './crewKeys';

/** The crew module's client typed with its pending tables and RPCs (D-01). */
const crewDb = pendingClient<CrewPendingTables, NoPending, CrewPendingFunctions>();

export const REFERENCE_STALE_MS = 24 * 60 * 60 * 1000;

export type ReferenceList<T> =
  | { status: 'loading'; items: readonly T[] }
  | { status: 'missing'; items: readonly T[] }
  | { status: 'error'; items: readonly T[]; error: unknown; retry: () => void }
  | { status: 'ready'; items: readonly T[] };

const EMPTY: readonly never[] = Object.freeze([] as never[]);

const retryUnlessMissing = (failureCount: number, error: unknown) =>
  !isMissingRelationError(error) && failureCount < 1;

function toList<T>(query: { data?: T[]; error: unknown; refetch: () => unknown }): ReferenceList<T> {
  if (query.error) {
    if (isMissingRelationError(query.error)) return { status: 'missing', items: EMPTY };
    return { status: 'error', items: EMPTY, error: query.error, retry: () => void query.refetch() };
  }
  if (!query.data) return { status: 'loading', items: EMPTY };
  return { status: 'ready', items: query.data };
}

export async function fetchCountries(): Promise<Country[]> {
  const { data, error } = await crewDb
    .from('ref_countries')
    .select('iso2, iso3, name, demonym, dial_code, flag_emoji, sort_name')
    .eq('is_active', true)
    .order('sort_name');
  if (error) throw error;
  return (data ?? []).map((r) => ({
    iso2: r.iso2,
    iso3: r.iso3,
    name: r.name,
    demonym: r.demonym,
    dialCode: r.dial_code,
    flagEmoji: r.flag_emoji,
    sortName: r.sort_name,
  }));
}

export async function fetchLanguages(): Promise<Language[]> {
  const { data, error } = await crewDb
    .from('ref_languages')
    .select('code, name, sort_order')
    .eq('is_active', true)
    .order('sort_order')
    .order('name');
  if (error) throw error;
  return (data ?? []).map((r) => ({ code: r.code, name: r.name, sortOrder: r.sort_order }));
}

export async function fetchDepartments(): Promise<Department[]> {
  const { data, error } = await crewDb
    .from('departments')
    .select('key, label, sort_order')
    .eq('is_active', true)
    .order('sort_order');
  if (error) throw error;
  return (data ?? []).map((r) => ({ key: r.key, label: r.label, sortOrder: r.sort_order }));
}

export function useCountries(options: { enabled?: boolean } = {}): ReferenceList<Country> {
  const query = useQuery({
    queryKey: crewKeys.countries(),
    queryFn: fetchCountries,
    enabled: options.enabled ?? true,
    staleTime: REFERENCE_STALE_MS,
    gcTime: REFERENCE_STALE_MS,
    retry: retryUnlessMissing,
  });
  return toList(query);
}

export function useLanguages(options: { enabled?: boolean } = {}): ReferenceList<Language> {
  const query = useQuery({
    queryKey: crewKeys.languages(),
    queryFn: fetchLanguages,
    enabled: options.enabled ?? true,
    staleTime: REFERENCE_STALE_MS,
    gcTime: REFERENCE_STALE_MS,
    retry: retryUnlessMissing,
  });
  return toList(query);
}

export function useDepartments(options: { enabled?: boolean } = {}): ReferenceList<Department> {
  const query = useQuery({
    queryKey: crewKeys.departments(),
    queryFn: fetchDepartments,
    enabled: options.enabled ?? true,
    staleTime: REFERENCE_STALE_MS,
    gcTime: REFERENCE_STALE_MS,
    retry: retryUnlessMissing,
  });
  return toList(query);
}

/** Countries and languages together (the profile forms of later slices read both). */
export function useReferenceData(options: { enabled?: boolean } = {}): { countries: ReferenceList<Country>; languages: ReferenceList<Language> } {
  return { countries: useCountries(options), languages: useLanguages(options) };
}
