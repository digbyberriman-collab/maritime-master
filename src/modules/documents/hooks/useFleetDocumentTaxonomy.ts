/**
 * The fleet document taxonomy of the caller's company (gap/02 FD1, FD10):
 * its sections and document types, in order. Read through RLS (active
 * members of the company); the two selects run in parallel and name their
 * columns.
 *
 * D-01: while either table is missing the answer is `not_set_up` (cached,
 * not retried) and the page says "Fleet documents are not set up yet";
 * any other error is `error` with Retry. Never sample rows.
 */
import { useQuery } from '@tanstack/react-query';
import { isMissingRelationError as isMissingRelation } from '@/shared/lib/notify';
import { fleetDocumentsDb } from '../lib/fleetDocumentsDb';
import type { FleetDocumentSectionRow, FleetDocumentTypeRow } from '../types/db.pending';
import { fleetDocumentKeys } from './keys';

const SECTION_COLUMNS = 'id, company_id, name, sort_order, updated_at' as const;
const TYPE_COLUMNS =
  'id, company_id, section_id, name, sort_order, ack_required_default, ack_due_days_default, version_kind_default, hide_when_empty, updated_at' as const;

export type FleetDocumentSection = Pick<FleetDocumentSectionRow, 'id' | 'company_id' | 'name' | 'sort_order' | 'updated_at'>;
export type FleetDocumentType = Pick<
  FleetDocumentTypeRow,
  | 'id'
  | 'company_id'
  | 'section_id'
  | 'name'
  | 'sort_order'
  | 'ack_required_default'
  | 'ack_due_days_default'
  | 'version_kind_default'
  | 'hide_when_empty'
  | 'updated_at'
>;

export interface FleetDocumentTaxonomy {
  sections: FleetDocumentSection[];
  types: FleetDocumentType[];
}

type Answer = { kind: 'not_set_up' } | { kind: 'ok'; taxonomy: FleetDocumentTaxonomy };

export type FleetDocumentTaxonomyState =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'not_set_up' }
  | { state: 'error'; error: unknown; retry: () => void }
  | { state: 'ready'; taxonomy: FleetDocumentTaxonomy; updatedAt: number; refreshing: boolean };

const byOrder = <T extends { sort_order: number; name: string; id: string }>(a: T, b: T) =>
  a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'en-GB', { sensitivity: 'base' }) || a.id.localeCompare(b.id);

export async function fetchFleetDocumentTaxonomy(companyId: string): Promise<Answer> {
  const [sections, types] = await Promise.all([
    fleetDocumentsDb.from('fleet_document_sections').select(SECTION_COLUMNS).eq('company_id', companyId).order('sort_order', { ascending: true }),
    fleetDocumentsDb.from('fleet_document_types').select(TYPE_COLUMNS).eq('company_id', companyId).order('sort_order', { ascending: true }),
  ]);
  if (isMissingRelation(sections.error) || isMissingRelation(types.error)) return { kind: 'not_set_up' };
  if (sections.error) throw sections.error;
  if (types.error) throw types.error;
  return {
    kind: 'ok',
    taxonomy: {
      sections: [...((sections.data ?? []) as FleetDocumentSection[])].sort(byOrder),
      types: [...((types.data ?? []) as FleetDocumentType[])].sort(byOrder),
    },
  };
}

export function useFleetDocumentTaxonomy(companyId: string | null | undefined, options: { enabled?: boolean } = {}): FleetDocumentTaxonomyState {
  const enabled = (options.enabled ?? true) && Boolean(companyId);
  const query = useQuery({
    queryKey: fleetDocumentKeys.taxonomy(companyId),
    queryFn: () => fetchFleetDocumentTaxonomy(companyId as string),
    enabled,
    staleTime: 60_000,
  });
  if (!enabled) return { state: 'idle' };
  if (query.isPending) return { state: 'loading' };
  if (query.isError) return { state: 'error', error: query.error, retry: () => void query.refetch() };
  if (query.data.kind === 'not_set_up') return { state: 'not_set_up' };
  return { state: 'ready', taxonomy: query.data.taxonomy, updatedAt: query.dataUpdatedAt, refreshing: query.isFetching };
}
