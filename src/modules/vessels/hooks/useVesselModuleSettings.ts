/**
 * One vessel's `vessel_module_settings` rows (gap/10 IA9, W4; DECISIONS C13,
 * D-01, D-04; spec §5.3). The only place that builds the vessels pending
 * client, so the pending-table ratchet sees one shim and one client.
 *
 * - The table not existing yet (`isMissingRelation`) is not an error: the
 *   state is `ready` with `source: 'table-missing'` and no rows, which the
 *   resolver reads as "every module on" (D-01).
 * - Any other failure is an `error` state (the shell shows a Retry strip and
 *   hides what the settings gate). Never mock rows.
 *
 * `vesselModuleSettingsQueryOptions` is shared with `useVesselSwitch`, which
 * fetches the target vessel's settings before it navigates, so both read one
 * cache entry. W4: Vessel Settings invalidates `vesselModuleSettingsKeys.all`
 * when it saves, so open sessions update without a reload.
 */
import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { isMissingRelation, pendingClient } from '@/integrations/supabase/pending';
import { normaliseError } from '@/shared/lib/notify';
import type { VesselsPendingTables } from '../types/db.pending';
import { TABLE_MISSING_STATE, type ModuleSettingsState, type VesselModuleSetting } from '../lib/moduleSettings';

const vesselsDb = pendingClient<VesselsPendingTables>();

export const vesselModuleSettingsKeys = {
  all: ['vessel-module-settings'] as const,
  vessel: (vesselId: string) => ['vessel-module-settings', vesselId] as const,
};

export type ReadyModuleSettings = Extract<ModuleSettingsState, { status: 'ready' }>;

/** Settings stay fresh for 30 s; Vessel Settings invalidates them on save (W4). */
export const VESSEL_MODULE_SETTINGS_STALE_MS = 30_000;

/** The vessel's settings; a missing table resolves as "nothing stored". Throws on any other error. */
export async function fetchVesselModuleSettings(vesselId: string): Promise<ReadyModuleSettings> {
  const { data, error } = await vesselsDb
    .from('vessel_module_settings')
    .select('vessel_id, module_key, enabled, enabled_from, label_override')
    .eq('vessel_id', vesselId);
  if (error) {
    if (isMissingRelation(error)) return TABLE_MISSING_STATE;
    throw error;
  }
  const settings = new Map<string, VesselModuleSetting>();
  for (const row of data ?? []) {
    if (!row.module_key) continue;
    settings.set(row.module_key, {
      moduleKey: row.module_key,
      // Only an explicit `false` switches a module off.
      enabled: row.enabled !== false,
      enabledFrom: row.enabled_from ?? null,
      labelOverride: row.label_override ?? null,
    });
  }
  return { status: 'ready', source: 'table', settings };
}

/** For `useQuery` and `queryClient.fetchQuery` (the vessel switch). */
export function vesselModuleSettingsQueryOptions(vesselId: string) {
  return {
    queryKey: vesselModuleSettingsKeys.vessel(vesselId),
    queryFn: () => fetchVesselModuleSettings(vesselId),
    staleTime: VESSEL_MODULE_SETTINGS_STALE_MS,
    retry: 1,
  };
}

export interface VesselModuleSettingsResult {
  state: ModuleSettingsState;
  /** A load (first or retry) is in flight. */
  fetching: boolean;
  retry: () => void;
}

const LOADING: ModuleSettingsState = { status: 'loading' };

/** `vesselId` absent: `loading` (nothing is known, so nothing gated shows). */
export function useVesselModuleSettings(vesselId: string | null | undefined): VesselModuleSettingsResult {
  const query = useQuery({
    ...vesselModuleSettingsQueryOptions(vesselId ?? ''),
    enabled: Boolean(vesselId),
  });
  const { data, error, isError, isFetching, refetch } = query;
  const state = useMemo<ModuleSettingsState>(() => {
    if (!vesselId) return LOADING;
    if (data) return data;
    if (isError) {
      return { status: 'error', message: normaliseError(error, "This vessel's modules could not load.").message };
    }
    return LOADING;
  }, [vesselId, data, isError, error]);
  const retry = useCallback(() => {
    void refetch();
  }, [refetch]);
  return { state, fetching: Boolean(vesselId) && isFetching, retry };
}
