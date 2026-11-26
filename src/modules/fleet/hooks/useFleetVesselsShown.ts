/**
 * "Vessels shown" for the Fleet pages (gap/02 D1; D-X5-09): the vessels the
 * user reaches (VesselContext), the selection resolved by
 * ../lib/vesselsShown.ts from `?vessels=` and this user's stored choice,
 * and the setters the filter calls.
 *
 * - The selection is never another user's: the stored key carries the
 *   user id, and nothing is served until VesselContext has loaded this
 *   user's vessels (D-25, D-41).
 * - A failed vessel-list load is an error with Retry (VesselContext's latch,
 *   D-76), never "no vessels".
 * - Changing the selection replaces the `?vessels=` value (no history entry
 *   per tick) and stores it on this device; choosing the default clears
 *   both, so the default keeps following the fleet.
 * - `scope` is what the expiry hooks (and later the dashboard and reports)
 *   key and query by: the company id and the ids shown.
 */
import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useVessel } from '@/modules/vessels/contexts/VesselContext';
import { useFleetGroups } from '@/shared/components/layout/topbar/useFleetGroups';
import {
  VESSELS_SHOWN_PARAM,
  formatVesselCodes,
  normaliseSelection,
  readStoredVesselsShown,
  resolveVesselsShown,
  sameSelection,
  toShownVessels,
  writeStoredVesselsShown,
  type FleetGroupName,
  type ShownVessel,
  type VesselsShownSource,
  type VesselsShownStorage,
} from '../lib/vesselsShown';

/** The company and the vessels a fleet query is for. */
export interface FleetVesselScope {
  companyId: string;
  /** The vessels shown, in list order. */
  vesselIds: readonly string[];
}

export interface FleetVesselsShownReady {
  status: 'ready';
  companyId: string;
  /** Every vessel the user reaches, sorted by name (the filter's list). */
  vessels: ShownVessel[];
  /** The vessels shown, in list order. */
  shownIds: string[];
  shownVessels: ShownVessel[];
  /** The default selection: every counted vessel. */
  countedIds: string[];
  isDefault: boolean;
  source: VesselsShownSource;
  /** `?vessels=` codes that name no vessel the user reaches. */
  droppedCodes: string[];
  /** Fleet group names for the tick helpers (empty while loading or when they failed to load). */
  fleetGroups: readonly FleetGroupName[];
  scope: FleetVesselScope;
  /** Show these vessels (unknown ids dropped; an empty list is ignored). */
  setShown: (ids: readonly string[]) => void;
  /** Back to the default (every counted vessel). */
  showAll: () => void;
}

export type FleetVesselsShownState =
  | { status: 'loading' }
  | { status: 'error'; error: { message: string }; retry: () => void }
  | FleetVesselsShownReady;

/** The browser's localStorage; reading the accessor itself may throw (blocked storage), which the lib catches. */
const browserStorage: VesselsShownStorage = () => (typeof window === 'undefined' ? null : window.localStorage);

export interface UseFleetVesselsShownOptions {
  /** Storage to read and write (tests); defaults to localStorage. */
  storage?: VesselsShownStorage;
}

export function useFleetVesselsShown(options: UseFleetVesselsShownOptions = {}): FleetVesselsShownState {
  const storage = options.storage ?? browserStorage;
  const { user, profile } = useAuth();
  const vesselCtx = useVessel();
  const [params, setParams] = useSearchParams();
  const userId = user?.id ?? null;
  const companyId = profile?.company_id ?? null;
  const urlParam = params.get(VESSELS_SHOWN_PARAM);
  // Bumped after each write, so the stored choice is read again.
  const [storedVersion, setStoredVersion] = useState(0);

  const loaded = Boolean(userId) && Boolean(companyId) && !vesselCtx.loading && vesselCtx.loadedForUserId === userId;
  const groupsState = useFleetGroups(loaded);

  const { vessels: ctxVessels, getVesselCodeById } = vesselCtx;
  const vessels = useMemo(
    () =>
      loaded
        ? toShownVessels(
            ctxVessels
              .filter((v) => v.company_id === companyId)
              .map((v) => ({ ...v, code: getVesselCodeById(v.id) })),
          )
        : [],
    [loaded, ctxVessels, companyId, getVesselCodeById],
  );

  // `storedVersion` changes after each write, so the choice is read again.
  const stored = useMemo(
    () => (loaded && storedVersion >= 0 ? readStoredVesselsShown(storage, userId) : null),
    [loaded, storage, userId, storedVersion],
  );

  const resolution = useMemo(() => resolveVesselsShown({ vessels, urlParam, stored }), [vessels, urlParam, stored]);

  const setShown = useCallback(
    (ids: readonly string[]) => {
      const next = normaliseSelection(vessels, ids);
      if (!next.length) return;
      const isDefault = sameSelection(next, resolution.countedIds);
      const codes = isDefault ? null : formatVesselCodes(vessels, next);
      setParams(
        (prev) => {
          const out = new URLSearchParams(prev);
          if (codes) out.set(VESSELS_SHOWN_PARAM, codes);
          else out.delete(VESSELS_SHOWN_PARAM);
          return out;
        },
        { replace: true },
      );
      writeStoredVesselsShown(storage, userId, isDefault ? null : next);
      setStoredVersion((v) => v + 1);
    },
    [vessels, resolution.countedIds, setParams, storage, userId],
  );

  const showAll = useCallback(() => setShown(resolution.countedIds), [setShown, resolution.countedIds]);

  const fleetGroups = groupsState.status === 'ready' ? groupsState.groups : NO_GROUPS;
  const shownVessels = useMemo(() => {
    const ids = new Set(resolution.vesselIds);
    return vessels.filter((v) => ids.has(v.id));
  }, [vessels, resolution.vesselIds]);
  const scope = useMemo<FleetVesselScope | null>(
    () => (companyId ? { companyId, vesselIds: resolution.vesselIds } : null),
    [companyId, resolution.vesselIds],
  );

  if (vesselCtx.loadError) return { status: 'error', error: vesselCtx.loadError, retry: () => void vesselCtx.retryVessels() };
  if (!loaded || !companyId || !scope) return { status: 'loading' };
  return {
    status: 'ready',
    companyId,
    vessels,
    shownIds: resolution.vesselIds,
    shownVessels,
    countedIds: resolution.countedIds,
    isDefault: resolution.isDefault,
    source: resolution.source,
    droppedCodes: resolution.droppedCodes,
    fleetGroups,
    scope,
    setShown,
    showAll,
  };
}

const NO_GROUPS: readonly FleetGroupName[] = [];
