/**
 * The reserved slot for record references in the command palette (gap/10
 * IA12; C21). No provider is registered in Phase 1, so a reference query
 * finds nothing: the palette never invents a record.
 */
import type { RecordReferenceMatch, RecordReferenceProvider } from './types';

/**
 * `PTW-DRA-2026-061`, `INC-2026-011` (fleet-level, no vessel) and
 * `DRA-20261103-037` (voyages), any case.
 */
export const RECORD_REFERENCE_PATTERN = /^(?:[A-Z]{2,5}-(?:[A-Z][A-Z0-9]{2}-)?\d{4}-\d{3,}|[A-Z][A-Z0-9]{2}-\d{8}-\d{3,})$/i;

/** True when the query looks like a record reference. */
export function looksLikeRecordReference(query: string): boolean {
  return RECORD_REFERENCE_PATTERN.test(query.trim());
}

/** Providers registered by the domain streams (Phase 3). Empty in Phase 1. */
export const RECORD_REFERENCE_PROVIDERS: readonly RecordReferenceProvider[] = [];

/**
 * Every provider whose `matches` accepts the query, searched in parallel. A
 * provider that throws contributes nothing (its error is not a result).
 */
export async function searchRecordReferences(
  query: string,
  signal: AbortSignal,
  providers: readonly RecordReferenceProvider[] = RECORD_REFERENCE_PROVIDERS,
): Promise<RecordReferenceMatch[]> {
  const q = query.trim();
  if (!q) return [];
  const settled = await Promise.allSettled(
    providers.filter((p) => p.matches(q)).map((p) => p.search(q, signal)),
  );
  return settled.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
}
