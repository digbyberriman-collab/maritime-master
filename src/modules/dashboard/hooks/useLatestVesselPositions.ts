/**
 * The last AIS fix each vessel reported (gap/02 T1/T2), read from
 * `ais_snapshots`. Nothing here is estimated: a vessel without a reported
 * latitude and longitude has no entry, and the tracker lists it as
 * "No position yet" instead of placing it on the map.
 *
 * DECISIONS D-01: the live schema may not have the table yet. A missing
 * relation reads as "no positions" (an empty map); any other error is thrown
 * so the page shows its error state.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';
import { isMissingRelationError } from '@/shared/lib/notify';
import type { VesselNavState } from '@/shared/components/data/mapTheme';

export const AIS_SNAPSHOT_COLUMNS = 'vessel_id, latitude, longitude, sog, cog, heading, nav_status, timestamp_utc' as const;

export type AisSnapshotRow = Pick<
  Tables<'ais_snapshots'>,
  'vessel_id' | 'latitude' | 'longitude' | 'sog' | 'cog' | 'heading' | 'nav_status' | 'timestamp_utc'
>;

/** A reported fix with a real position. */
export interface VesselPosition {
  vesselId: string;
  latitude: number;
  longitude: number;
  sog: number | null;
  cog: number | null;
  heading: number | null;
  navStatus: string | null;
  /** ISO time the fix was reported. */
  timestampUtc: string;
}

/** A fix older than this is drawn hollow (gap/10 §A.11). */
export const STALE_FIX_MS = 6 * 60 * 60 * 1000;

/**
 * AIS sends sentinel values for "not available" (heading 511, course 360,
 * speed 102.3 kn). Keep a reading only when it is a real one.
 */
const angle = (value: number | null): number | null =>
  value !== null && Number.isFinite(value) && value >= 0 && value < 360 ? value : null;
const speed = (value: number | null): number | null =>
  value !== null && Number.isFinite(value) && value >= 0 && value < 102.2 ? value : null;

/**
 * Newest fix with a position per vessel. Rows may come in any order; rows
 * without a latitude or longitude are ignored, never filled in.
 */
export function latestFixByVessel(rows: readonly AisSnapshotRow[]): Map<string, VesselPosition> {
  const out = new Map<string, VesselPosition>();
  for (const row of rows) {
    if (row.latitude === null || row.longitude === null) continue;
    if (!Number.isFinite(row.latitude) || !Number.isFinite(row.longitude)) continue;
    if (Math.abs(row.latitude) > 90 || Math.abs(row.longitude) > 180) continue; // AIS 91/181 = not available
    const at = Date.parse(row.timestamp_utc);
    if (Number.isNaN(at)) continue;
    const prev = out.get(row.vessel_id);
    if (prev && Date.parse(prev.timestampUtc) >= at) continue;
    out.set(row.vessel_id, {
      vesselId: row.vessel_id,
      latitude: row.latitude,
      longitude: row.longitude,
      sog: speed(row.sog),
      cog: angle(row.cog),
      heading: angle(row.heading),
      navStatus: row.nav_status,
      timestampUtc: row.timestamp_utc,
    });
  }
  return out;
}

/**
 * Map an AIS navigational status (ITU-R M.1371 code or its text) to a marker
 * state. Anything else is unknown: null, shown as "Status unknown".
 */
export function navStateFromAis(navStatus: string | null | undefined): VesselNavState | null {
  if (!navStatus) return null;
  const s = navStatus.trim().toLowerCase();
  if (/^\d+$/.test(s)) {
    const code = Number(s);
    if (code === 0 || code === 8) return 'under_way';
    if (code === 1) return 'at_anchor';
    if (code === 5) return 'moored';
    return null;
  }
  if (s.includes('anchor')) return 'at_anchor';
  if (s.includes('moored')) return 'moored';
  if (/under[\s_-]?way/.test(s) || s.includes('sailing')) return 'under_way';
  return null;
}

/** Latest positioned fix for each listed vessel; vessels without one are absent. */
export function useLatestVesselPositions(vesselIds: readonly string[]) {
  const ids = useMemo(() => Array.from(new Set(vesselIds)).sort(), [vesselIds]);
  return useQuery({
    queryKey: ['latest-vessel-positions', ...ids],
    enabled: ids.length > 0,
    queryFn: async (): Promise<Map<string, VesselPosition>> => {
      // One newest-first row per vessel: a single query over every vessel's
      // history would hit the row cap and drop vessels with fewer fixes.
      const results = await Promise.all(
        ids.map((id) =>
          supabase
            .from('ais_snapshots')
            .select(AIS_SNAPSHOT_COLUMNS)
            .eq('vessel_id', id)
            .not('latitude', 'is', null)
            .not('longitude', 'is', null)
            .order('timestamp_utc', { ascending: false })
            .limit(1),
        ),
      );
      const rows: AisSnapshotRow[] = [];
      for (const { data, error } of results) {
        if (error) {
          if (isMissingRelationError(error)) return new Map();
          throw error;
        }
        rows.push(...(data ?? []));
      }
      return latestFixByVessel(rows);
    },
  });
}
