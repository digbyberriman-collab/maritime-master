/**
 * Export jobs (gap/08 §G, EX1, EX3, EX4; DECISIONS C10; Phase 2 spec §A.14).
 * Server jobs move requested → running → ready | failed only through the
 * service-role `export_job_transition`; the client creates, polls and
 * cancels. Client-side exports are logged first with `log_client_export`.
 * No timed fake completion: a job with no builder stays `requested`, and the
 * UI says "Queued". A business refusal (22023, e.g. cancelling a running job)
 * is `refused`; anything else but "not live yet" throws.
 */
import type { Json } from '@/integrations/supabase/types';
import { recordsDb } from './client';
import { missingOrThrow, refusedOrThrow, type ServiceResult } from './results';
import type { ExportJobRow, ExportKind, ExportStatus } from './db.pending';

export const EXPORT_TERMINAL_STATUSES: readonly ExportStatus[] = ['ready', 'failed', 'cancelled', 'expired', 'purged'];
/** Poll every 3 s while a job is requested or running; stop at a terminal status. */
export const EXPORT_POLL_MS = 3000;

export function exportPollInterval(status: ExportStatus | null | undefined): number | false {
  return status && !EXPORT_TERMINAL_STATUSES.includes(status) ? EXPORT_POLL_MS : false;
}

export interface ExportRequest {
  kind: ExportKind;
  sourceKey: string;
  params?: Json;
  containsPersonalData?: boolean;
  vesselId?: string;
}

export async function requestExport(request: ExportRequest): Promise<ServiceResult<ExportJobRow>> {
  const { data, error } = await recordsDb.rpc('request_export', {
    p_kind: request.kind,
    p_source_key: request.sourceKey,
    p_params: request.params,
    p_contains_personal_data: request.containsPersonalData,
    p_vessel_id: request.vesselId,
  });
  if (error) return refusedOrThrow(error);
  return { status: 'ok', value: data };
}

export async function logClientExport(request: ExportRequest & { rowCount?: number }): Promise<ServiceResult<ExportJobRow>> {
  const { data, error } = await recordsDb.rpc('log_client_export', {
    p_kind: request.kind,
    p_source_key: request.sourceKey,
    p_params: request.params,
    p_contains_personal_data: request.containsPersonalData,
    p_row_count: request.rowCount,
    p_vessel_id: request.vesselId,
  });
  if (error) return refusedOrThrow(error);
  return { status: 'ok', value: data };
}

export async function fetchExportJob(jobId: string): Promise<ServiceResult<ExportJobRow | null>> {
  const { data, error } = await recordsDb.from('export_jobs').select('*').eq('id', jobId).maybeSingle();
  if (error) return missingOrThrow(error);
  return { status: 'ok', value: data };
}

export async function cancelExportJob(jobId: string): Promise<ServiceResult<ExportJobRow>> {
  const { data, error } = await recordsDb.rpc('cancel_export_job', { p_job_id: jobId });
  if (error) return refusedOrThrow(error);
  return { status: 'ok', value: data };
}
