/**
 * When the shell shows "Some of your permissions could not be loaded" (D-56,
 * deferred item 3; spec §6.7).
 *
 * The permissions store sets `error` when a role load fails and retries by
 * itself at 1 s and 4 s; `loadPermissions()` clears `error` and sets
 * `isLoading` while a load runs. Reading `error` alone would hide the notice
 * on every retry and bring it back when the retry fails (a flicker), so the
 * notice latches: it appears with the error, stays while any load after it is
 * in flight, and goes only once a load has succeeded (`error` null and not
 * loading). It never grants anything: what the store failed to load stays
 * hidden everywhere until a load succeeds.
 */
import { useCallback, useState } from 'react';
import { usePermissionsStore } from '@/modules/auth/store/permissionsStore';

export interface RbacRetryState {
  /** Show the notice. */
  visible: boolean;
  /** A load is in flight while the notice shows: the Retry button waits. */
  retrying: boolean;
  /** Load the roles again. */
  retry: () => void;
}

export function useRbacRetryState(): RbacRetryState {
  const error = usePermissionsStore((s) => s.error);
  const isLoading = usePermissionsStore((s) => s.isLoading);
  const loadPermissions = usePermissionsStore((s) => s.loadPermissions);
  const failing = error !== null && error !== undefined;
  const [latched, setLatched] = useState(failing);
  // Adjusting state while rendering (not in an effect), so the notice never
  // misses a frame between the error and the retry that follows it.
  if (failing && !latched) setLatched(true);
  else if (!failing && !isLoading && latched) setLatched(false);
  const visible = failing || (latched && isLoading);
  const retry = useCallback(() => {
    void loadPermissions?.();
  }, [loadPermissions]);
  return { visible, retrying: visible && isLoading, retry };
}
