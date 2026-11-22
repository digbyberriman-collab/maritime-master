/**
 * Shared page states (gap/00 D7; gap/10 DS16, §A.12; BUILD-PLAN A7).
 *
 *   if (isLoading) return <PageLoading />;
 *   if (error) return <PageError error={error} onRetry={refetch} />;
 *   if (!rows.length) return <PageEmpty title="No permits yet" action={canCreate && <NewPermitButton />} />;
 *
 * Route guards render `AccessDenied`, `ModuleOff` and `VesselArchived`; none
 * of them renders a shell, so they sit inside whatever layout the scope uses.
 * `PageError` shows a missing table or RPC as "Not available yet" (DECISIONS
 * D-01), never as a crash or mock data.
 */
export { EmptyState, type EmptyStateProps } from './EmptyState';
export { PageLoading, type PageLoadingProps } from './PageLoading';
export { PageError, type PageErrorProps } from './PageError';
export { PageEmpty, type PageEmptyProps } from './PageEmpty';
export { AccessDenied, type AccessDeniedProps } from './AccessDenied';
export { ModuleOff, type ModuleOffProps } from './ModuleOff';
export { VesselArchived, type VesselArchivedProps } from './VesselArchived';
export {
  EMPTY_STATE_DEFAULTS,
  EMPTY_STATE_KINDS,
  SLOW_LOADING_AFTER_MS,
  SLOW_LOADING_MESSAGE,
  type EmptyStateKind,
} from './copy';
