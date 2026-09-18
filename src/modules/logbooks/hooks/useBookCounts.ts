import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchEntryCounts, fetchLogbooks } from '../lib/logbookApi';
import { getBookByDbType } from '../lib/catalog';

export interface BookCount { records: number; drafts: number; }

/** Current (non-superseded) record and draft counts per book across all volumes, for the book strip. */
export function useBookCounts(vesselId: string | null) {
  const logbooks = useQuery({ queryKey: ['logbooks', vesselId], enabled: !!vesselId, queryFn: () => fetchLogbooks(vesselId!) });
  const entries = useQuery({ queryKey: ['logbook-entry-counts', vesselId], enabled: !!vesselId, queryFn: () => fetchEntryCounts(vesselId!) });

  const counts = useMemo(() => {
    const byLogbook = new Map<string, string>();
    (logbooks.data ?? []).forEach((row) => {
      const book = getBookByDbType(row.logbook_type);
      if (book) byLogbook.set(row.id, book.id);
    });
    const result: Record<string, BookCount> = {};
    (entries.data ?? []).forEach((row) => {
      const bookId = byLogbook.get(row.logbook_id);
      if (!bookId || row.superseded_by_id) return;
      const count = (result[bookId] ??= { records: 0, drafts: 0 });
      count.records += 1;
      if (row.status === 'draft') count.drafts += 1;
    });
    return result;
  }, [logbooks.data, entries.data]);

  return { counts, logbooks: logbooks.data ?? [], isLoading: logbooks.isLoading || entries.isLoading };
}
