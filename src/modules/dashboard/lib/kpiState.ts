import type { KpiTileState } from '@/shared/components/data/KpiTile';

/** The part of a React Query result a KPI tile needs. */
export interface KpiQueryLike {
  isPending: boolean;
  isError: boolean;
}

/**
 * Tile state for a count read by a query (gap/10 A.9): `loading` until the
 * first answer (also while the query cannot start yet), `error` when it
 * failed, otherwise `undefined` so `KpiTile` picks `zero` or `ready` from the
 * value. Never a made-up 0.
 */
export function kpiStateFor(query: KpiQueryLike): KpiTileState | undefined {
  if (query.isError) return 'error';
  if (query.isPending) return 'loading';
  return undefined;
}
