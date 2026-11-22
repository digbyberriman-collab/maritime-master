/**
 * Which AIS mark a vessel gets (D-22; spec §6.1), pure for tests. See AisMark.
 */
import { navStateFromAis, STALE_FIX_MS, type VesselPosition } from '@/modules/dashboard/hooks/useLatestVesselPositions';

export type AisMarkKind = 'under_way' | 'moored' | 'at_anchor' | 'unknown' | 'stale';

export interface AisMarkInput {
  /** The positions query: no mark unless it is `ready`. */
  status: 'loading' | 'error' | 'ready';
  /** The vessel's latest positioned fix, if any. */
  position?: VesselPosition | null;
  /** For tests; defaults to now. */
  now?: number;
}

export interface AisMarkState {
  kind: AisMarkKind;
  label: string;
  /** ISO time of the fix the mark is based on. */
  fixAt: string | null;
  /** Course (else heading) in degrees, for the under-way arrow. */
  course: number | null;
}

const LABEL: Readonly<Record<AisMarkKind, string>> = {
  under_way: 'Under way',
  moored: 'Moored',
  at_anchor: 'At anchor',
  unknown: 'Status unknown',
  stale: 'No recent position',
};

export function aisMarkState({ status, position, now = Date.now() }: AisMarkInput): AisMarkState | null {
  if (status !== 'ready') return null;
  const at = position ? Date.parse(position.timestampUtc) : Number.NaN;
  if (!position || Number.isNaN(at) || now - at > STALE_FIX_MS) {
    return { kind: 'stale', label: LABEL.stale, fixAt: position && !Number.isNaN(at) ? position.timestampUtc : null, course: null };
  }
  const kind: AisMarkKind = navStateFromAis(position.navStatus) ?? 'unknown';
  return { kind, label: LABEL[kind], fixAt: position.timestampUtc, course: position.cog ?? position.heading ?? null };
}
