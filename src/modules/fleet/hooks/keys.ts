/**
 * React Query keys of the Fleet operations module. Every key of company or
 * vessel data carries the company id, and every key of vessel data the
 * vessel ids it was read for (sorted, so the same vessels in another order
 * share an entry), so two companies, or two "Vessels shown" selections,
 * never share a cache entry.
 *
 * Invalidate by prefix: `fleetKeys.expiry.all(companyId)` covers the
 * windows, the lists and the counts (a window change moves items between
 * buckets).
 */
import type { ExpiryBucket } from '@/lib/records/expiry';

const NONE = 'none';

/** The filters of one `fleet_expiry_items` read, normalised (`normaliseExpiryItemsFilters`). */
export interface FleetExpiryItemsFilters {
  /** Expiry source keys, sorted; null = every source. */
  sources: readonly string[] | null;
  /** Buckets, in severity order; null = every bucket. */
  buckets: readonly ExpiryBucket[] | null;
  /** Trimmed search text; null = none. */
  search: string | null;
  /** Also list crew with no current vessel and fleet-level items (fleet reach only). */
  includeUnassigned: boolean;
  limit: number;
  offset: number;
  /** The day the buckets are counted for (local `yyyy-MM-dd`). */
  today: string;
}

/** The vessel ids of a key: de-duplicated and sorted. */
export const vesselIdsKey = (vesselIds: readonly string[]): string[] => [...new Set(vesselIds)].sort();

const company = (companyId: string | null | undefined) => ['fleet', 'company', companyId ?? NONE] as const;
const expiryAll = (companyId: string | null | undefined) => [...company(companyId), 'expiry'] as const;

export const fleetKeys = {
  all: ['fleet'] as const,
  company,
  expiry: {
    all: expiryAll,
    items: (companyId: string | null | undefined, vesselIds: readonly string[], filters: FleetExpiryItemsFilters) =>
      [...expiryAll(companyId), 'items', vesselIdsKey(vesselIds), filters] as const,
    summary: (companyId: string | null | undefined, vesselIds: readonly string[], byVessel: boolean, today: string) =>
      [...expiryAll(companyId), 'summary', vesselIdsKey(vesselIds), { byVessel, today }] as const,
    windows: (companyId: string | null | undefined) => [...expiryAll(companyId), 'windows'] as const,
  },
};
