/**
 * What the deep-link resolver (../lib/deepLink.ts) needs to know about the
 * viewer, from the shell's own sources, so the bell and /inbox open exactly
 * what the router and the Apps menu would let them open:
 *
 * - fleet reach: `useScopeAccess().fleetReach` (memberships once live, the
 *   D-26 rules until then);
 * - reachable vessels: VesselContext's served vessels and their codes
 *   (`getVesselCodeById`, the same codes the vessel scope resolves);
 * - workspaces: the Apps entry (`useWorkspaceRootGate`, D-97);
 * - record kinds: the record registry's `routePattern`.
 *
 * Fail closed (D-04): until access, the vessel list and the workspace gate
 * have loaded, `ready` is false and callers show "Checking access…" rather
 * than an answer. While the vessel list is in error, a vessel link the
 * viewer seems not to reach is unknown, not gone: `reachUnknown` says so.
 */
import { useCallback, useMemo } from 'react';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useVessel } from '@/modules/vessels/contexts/VesselContext';
import { useScopeAccess } from '@/app/router/useScopeAccess';
import { useWorkspaceRootGate } from '@/app/nav/workspaceAccess';
import { getRecordKind } from '@/lib/records/registry';
import { WORKSPACE_ROOTS, resolveInboxLink, type DeepLinkContext, type DeepLinkResult, type DeepLinkSource } from '../lib/deepLink';
import type { InboxWorkspace } from '../types/db.pending';

export interface InboxLinks {
  /** Access, the vessel list and the workspace gate have loaded. */
  ready: boolean;
  /** The vessel list failed: "no reach" may only mean "not known". */
  reachUnknown: boolean;
  resolve: (row: DeepLinkSource) => DeepLinkResult;
}

const routeForKind = (key: string): string | undefined => getRecordKind(key)?.routePattern;

export function useInboxLinks(): InboxLinks {
  const { profile } = useAuth();
  const access = useScopeAccess();
  const { vessels, getVesselCodeById } = useVessel();
  const workspace = useWorkspaceRootGate();

  // No readable profile: no vessels, whatever the context still holds (as useScopeAccess).
  const served = profile ? vessels : null;
  const codes = useMemo(() => {
    const set = new Set<string>();
    for (const v of served ?? []) {
      const code = getVesselCodeById(v.id);
      if (code) set.add(code);
    }
    return set;
  }, [served, getVesselCodeById]);

  const { canOpen } = workspace;
  const canOpenWorkspace = useCallback((ws: InboxWorkspace) => canOpen(WORKSPACE_ROOTS[ws]), [canOpen]);

  const context = useMemo<DeepLinkContext>(
    () => ({ fleetReach: access.fleetReach, reachableVesselCodes: codes, canOpenWorkspace, routeForKind }),
    [access.fleetReach, codes, canOpenWorkspace],
  );
  const resolve = useCallback((row: DeepLinkSource) => resolveInboxLink(row, context), [context]);

  return {
    ready: access.ready && workspace.ready,
    reachUnknown: Boolean(access.vesselsError),
    resolve,
  };
}
