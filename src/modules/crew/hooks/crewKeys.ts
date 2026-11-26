/**
 * React Query keys of the crew module (X1 spec §3 "Keys"). Every key of
 * company or vessel data carries the company id and the vessel id, so two
 * vessels (or a vessel switch) never share a cache entry. The global
 * reference lists (countries, languages, departments) are the same for
 * everyone and sit under 'reference'; contract types carry the company,
 * because a company may add its own.
 *
 * Invalidate by prefix: `crewKeys.vessel(companyId, vesselId)` covers every
 * list of one vessel.
 */
const NONE = 'none';

export const crewKeys = {
  all: ['crew'] as const,
  company: (companyId: string | null | undefined) => ['crew', 'company', companyId ?? NONE] as const,
  vessel: (companyId: string | null | undefined, vesselId: string | null | undefined) =>
    ['crew', 'company', companyId ?? NONE, 'vessel', vesselId ?? NONE] as const,
  positions: (companyId: string | null | undefined, vesselId: string | null | undefined) =>
    [...crewKeys.vessel(companyId, vesselId), 'positions'] as const,
  unmatchedTitles: (companyId: string | null | undefined, vesselId: string | null | undefined) =>
    [...crewKeys.vessel(companyId, vesselId), 'unmatched-titles'] as const,
  contractTypes: (companyId: string | null | undefined) => [...crewKeys.company(companyId), 'contract-types'] as const,
  reference: ['crew', 'reference'] as const,
  countries: () => ['crew', 'reference', 'countries'] as const,
  languages: () => ['crew', 'reference', 'languages'] as const,
  departments: () => ['crew', 'reference', 'departments'] as const,
};
