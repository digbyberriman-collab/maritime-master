/**
 * One fleet document's history (gap/02 FD4, W1; X5 spec X5-04B): the
 * document, every version the reader may see (newest first, superseded
 * versions included, drafts for library editors only: RLS), its target
 * vessels, and the names of the people who published, superseded or
 * withdrew. The version history drawer shows it; the publish dialog reads
 * the draft version it finishes and the document's `updated_at` it
 * publishes against (the server refuses a stale one).
 *
 * Three selects in parallel with named columns, then one names select for
 * every person in them (no N+1). Names are auxiliary: when they cannot be
 * read the drawer says "Name not available" for each, never an invented
 * one.
 *
 * D-01: a missing table is `not_set_up` (cached, not retried); any other
 * error is `error` with Retry; a document the reader cannot see (RLS, or
 * deleted) is `not_found`. Never sample rows.
 */
import { useQuery } from '@tanstack/react-query';
import { isMissingRelationError as isMissingRelation } from '@/shared/lib/notify';
import { fleetDocumentsDb } from '../lib/fleetDocumentsDb';
import type { FleetDocumentRow, FleetDocumentVersionRow } from '../types/db.pending';
import { fleetDocumentKeys } from './keys';

const DOCUMENT_COLUMNS =
  'id, company_id, type_id, title, description, status, target_mode, current_version_id, published_at, published_by, withdrawn_at, withdrawn_by, withdrawn_reason, created_at, created_by, updated_at' as const;
const VERSION_COLUMNS =
  'id, document_id, version_no, version_label, version_kind, effective_date, state, file_object_id, file_name, mime_type, size_bytes, change_summary, published_at, published_by, superseded_at, created_at, created_by, updated_at' as const;
const TARGET_COLUMNS = 'vessel_id' as const;
const NAME_COLUMNS = 'user_id, first_name, last_name, preferred_name' as const;

export type FleetDocumentDetail = Pick<
  FleetDocumentRow,
  | 'id'
  | 'company_id'
  | 'type_id'
  | 'title'
  | 'description'
  | 'status'
  | 'target_mode'
  | 'current_version_id'
  | 'published_at'
  | 'published_by'
  | 'withdrawn_at'
  | 'withdrawn_by'
  | 'withdrawn_reason'
  | 'created_at'
  | 'created_by'
  | 'updated_at'
>;

export type FleetDocumentVersionDetail = Pick<
  FleetDocumentVersionRow,
  | 'id'
  | 'document_id'
  | 'version_no'
  | 'version_label'
  | 'version_kind'
  | 'effective_date'
  | 'state'
  | 'file_object_id'
  | 'file_name'
  | 'mime_type'
  | 'size_bytes'
  | 'change_summary'
  | 'published_at'
  | 'published_by'
  | 'superseded_at'
  | 'created_at'
  | 'created_by'
  | 'updated_at'
>;

export interface FleetDocumentHistory {
  document: FleetDocumentDetail;
  /** Newest first. */
  versions: FleetDocumentVersionDetail[];
  /** Target vessel ids, sorted. */
  targetVesselIds: string[];
  /** Display names by auth user id; a missing entry is "Name not available". */
  names: Record<string, string>;
  /** The names could not be read at all (permission or error). */
  namesUnavailable: boolean;
}

type Answer = { kind: 'not_set_up' } | { kind: 'not_found' } | { kind: 'ok'; history: FleetDocumentHistory };

export type FleetDocumentHistoryState =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'not_set_up' }
  | { state: 'not_found' }
  | { state: 'error'; error: unknown; retry: () => void }
  | { state: 'ready'; history: FleetDocumentHistory; updatedAt: number; refreshing: boolean };

type NameRow = { user_id: string | null; first_name: string | null; last_name: string | null; preferred_name: string | null };

/** "Preferred Last", else "First Last"; null when the row holds no name. */
export function displayName(row: NameRow): string | null {
  const first = (row.preferred_name?.trim() || row.first_name?.trim()) ?? '';
  const last = row.last_name?.trim() ?? '';
  const name = [first, last].filter(Boolean).join(' ');
  return name || null;
}

/** Everyone who acted on the document or its versions. */
export function actorIds(document: FleetDocumentDetail, versions: readonly FleetDocumentVersionDetail[]): string[] {
  const ids = [document.published_by, document.withdrawn_by, document.created_by, ...versions.flatMap((v) => [v.published_by, v.created_by])];
  return [...new Set(ids.filter((id): id is string => typeof id === 'string' && id.length > 0))].sort();
}

export async function fetchFleetDocumentHistory(companyId: string, documentId: string): Promise<Answer> {
  const [document, versions, targets] = await Promise.all([
    fleetDocumentsDb.from('fleet_documents').select(DOCUMENT_COLUMNS).eq('company_id', companyId).eq('id', documentId),
    fleetDocumentsDb
      .from('fleet_document_versions')
      .select(VERSION_COLUMNS)
      .eq('company_id', companyId)
      .eq('document_id', documentId)
      .order('version_no', { ascending: false }),
    fleetDocumentsDb.from('fleet_document_vessel_targets').select(TARGET_COLUMNS).eq('company_id', companyId).eq('document_id', documentId),
  ]);
  const errors = [document.error, versions.error, targets.error];
  if (errors.some((e) => isMissingRelation(e))) return { kind: 'not_set_up' };
  const failed = errors.find(Boolean);
  if (failed) throw failed;
  const row = ((document.data ?? []) as FleetDocumentDetail[]).find((d) => d.id === documentId);
  if (!row) return { kind: 'not_found' };
  const versionRows = ((versions.data ?? []) as FleetDocumentVersionDetail[])
    .filter((v) => v.document_id === documentId)
    .sort((a, b) => b.version_no - a.version_no);
  const targetVesselIds = [...new Set(((targets.data ?? []) as { vessel_id: string }[]).map((t) => t.vessel_id))].sort();

  const ids = actorIds(row, versionRows);
  const names: Record<string, string> = {};
  let namesUnavailable = false;
  if (ids.length) {
    const people = await fleetDocumentsDb.from('profiles').select(NAME_COLUMNS).in('user_id', ids);
    if (people.error) namesUnavailable = true;
    for (const person of (people.data ?? []) as NameRow[]) {
      const name = displayName(person);
      if (person.user_id && name) names[person.user_id] = name;
    }
  }
  return { kind: 'ok', history: { document: row, versions: versionRows, targetVesselIds, names, namesUnavailable } };
}

export function useFleetDocumentHistory(
  companyId: string | null | undefined,
  documentId: string | null | undefined,
  options: { enabled?: boolean } = {},
): FleetDocumentHistoryState {
  const enabled = (options.enabled ?? true) && Boolean(companyId) && Boolean(documentId);
  const query = useQuery({
    queryKey: fleetDocumentKeys.document(companyId, documentId),
    queryFn: () => fetchFleetDocumentHistory(companyId as string, documentId as string),
    enabled,
    staleTime: 15_000,
  });
  if (!enabled) return { state: 'idle' };
  if (query.isPending) return { state: 'loading' };
  if (query.isError) return { state: 'error', error: query.error, retry: () => void query.refetch() };
  if (query.data.kind === 'not_set_up') return { state: 'not_set_up' };
  if (query.data.kind === 'not_found') return { state: 'not_found' };
  return { state: 'ready', history: query.data.history, updatedAt: query.dataUpdatedAt, refreshing: query.isFetching };
}
