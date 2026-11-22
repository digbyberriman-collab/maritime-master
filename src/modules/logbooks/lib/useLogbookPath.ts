/**
 * Links between the logbook pages, built for wherever the page is mounted
 * (gap/00 B4: pages never hand-build vessel URLs):
 *
 * - inside the vessel scope: `/v/<code>/logbooks/<rel>`, so moving between
 *   logbook pages stays in the scope and never remounts the shell (D-13);
 * - outside it, where the legacy route renders the old page in place (a user
 *   with no vessel to scope to): `/vessel/logbooks/<rel>`.
 *
 * `bookPath('')` is the logbooks index; `q` is a query string (with its `?`).
 */
import { useCallback } from 'react';
import { useScopedPath, useVesselScope } from '@/app/router/scopes';

export function useLogbookPath(): (rel: string, q?: string) => string {
  const inScope = useVesselScope() !== null;
  const scoped = useScopedPath();
  return useCallback(
    (rel: string, q = '') => {
      const tail = rel.replace(/^\/+/, '');
      const path = inScope ? scoped(tail ? `logbooks/${tail}` : 'logbooks') : `/vessel/logbooks${tail ? `/${tail}` : ''}`;
      return `${path}${q}`;
    },
    [inScope, scoped],
  );
}
