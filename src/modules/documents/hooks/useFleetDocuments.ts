/**
 * The fleet document library of the caller's company (gap/02 FD2, FD4):
 * the documents the reader may see (RLS: fleet reach plus the documents
 * view rule; drafts for editors; published documents also for people of a
 * targeted vessel), their published and draft versions, and their target
 * vessels. Three selects in parallel, columns named; superseded versions
 * (history, X5-04B's version drawer) are not read here.
 *
 * D-01: a missing table is `not_set_up` (cached, not retried); any other
 * error is `error` with Retry. Never sample rows.
 */
import { useQuery } from '@tanstack/react-query';
import { isMissingRelationError as isMissingRelation } from '@/shared/lib/notify';
import { fleetDocumentsDb } from '../lib/fleetDocumentsDb';
import type { FleetDocumentRow, FleetDocumentVersionRow, FleetDocumentVesselTargetRow } from '../types/db.pending';
import { fleetDocumentKeys } from './keys';

const DOCUMENT_COLUMNS =
  'id, company_id, type_id, title, description, status, target_mode, ack_required, ack_due_days, current_version_id, published_at, withdrawn_at, withdrawn_reason, created_at, updated_at' as const;
const VERSION_COLUMNS = 'id, document_id, version_no, version_label, version_kind, effective_date, state, file_name, published_at' as const;
const TARGET_COLUMNS = 'document_id, vessel_id' as const;

export type FleetDocument = Pick<
  FleetDocumentRow,
  | 'id'
  | 'company_id'
  | 'type_id'
  | 'title'
  | 'description'
  | 'status'
  | 'target_mode'
  | 'ack_required'
  | 'ack_due_days'
  | 'current_version_id'
  | 'published_at'
  | 'withdrawn_at'
  | 'withdrawn_reason'
  | 'created_at'
  | 'updated_at'
>;
export type FleetDocumentVersion = Pick<
  FleetDocumentVersionRow,
  'id' | 'document_id' | 'version_no' | 'version_label' | 'version_kind' | 'effective_date' | 'state' | 'file_name' | 'published_at'
>;
export type FleetDocumentTarget = Pick<FleetDocumentVesselTargetRow, 'document_id' | 'vessel_id'>;

export interface FleetDocumentLibraryData {
  documents: FleetDocument[];
  versions: FleetDocumentVersion[];
  targets: FleetDocumentTarget[];
}

type Answer = { kind: 'not_set_up' } | { kind: 'ok'; data: FleetDocumentLibraryData };

export type FleetDocumentsState =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'not_set_up' }
  | { state: 'error'; error: unknown; retry: () => void }
  | { state: 'ready'; data: FleetDocumentLibraryData; updatedAt: number; refreshing: boolean };

export async function fetchFleetDocuments(companyId: string): Promise<Answer> {
  const [documents, versions, targets] = await Promise.all([
    fleetDocumentsDb.from('fleet_documents').select(DOCUMENT_COLUMNS).eq('company_id', companyId).order('title', { ascending: true }),
    fleetDocumentsDb
      .from('fleet_document_versions')
      .select(VERSION_COLUMNS)
      .eq('company_id', companyId)
      .in('state', ['published', 'draft'])
      .order('version_no', { ascending: true }),
    fleetDocumentsDb.from('fleet_document_vessel_targets').select(TARGET_COLUMNS).eq('company_id', companyId),
  ]);
  const errors = [documents.error, versions.error, targets.error];
  if (errors.some((e) => isMissingRelation(e))) return { kind: 'not_set_up' };
  const failed = errors.find(Boolean);
  if (failed) throw failed;
  return {
    kind: 'ok',
    data: {
      documents: (documents.data ?? []) as FleetDocument[],
      versions: (versions.data ?? []) as FleetDocumentVersion[],
      targets: (targets.data ?? []) as FleetDocumentTarget[],
    },
  };
}

export function useFleetDocuments(companyId: string | null | undefined, options: { enabled?: boolean } = {}): FleetDocumentsState {
  const enabled = (options.enabled ?? true) && Boolean(companyId);
  const query = useQuery({
    queryKey: fleetDocumentKeys.library(companyId),
    queryFn: () => fetchFleetDocuments(companyId as string),
    enabled,
    staleTime: 30_000,
  });
  if (!enabled) return { state: 'idle' };
  if (query.isPending) return { state: 'loading' };
  if (query.isError) return { state: 'error', error: query.error, retry: () => void query.refetch() };
  if (query.data.kind === 'not_set_up') return { state: 'not_set_up' };
  return { state: 'ready', data: query.data.data, updatedAt: query.dataUpdatedAt, refreshing: query.isFetching };
}
