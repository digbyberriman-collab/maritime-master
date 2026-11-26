/**
 * Fleet dashboard KPI rules (gap/02 W9, D3–D8; X5 spec §2 X5-02A). Pure:
 * the tile order and labels, tile → vessel module key, tile → capability
 * keys (the server's per-tile gates), tile → report key, the W9 red rule,
 * the sub-text parts and the KpiTile view of each tile.
 *
 * - The numbers are the server's (`fleet_dashboard_kpis`); nothing here
 *   adds them up or makes one up. A part the caller cannot count is null
 *   and is left out of the sub-text, never shown as 0.
 * - A number is a link only when the report registry knows the tile's
 *   report key (`knownReportKeys`); otherwise it is plain text.
 * - Not set up (the RPC is missing, D-01): the data tiles say "Not set up
 *   yet". A failed read: "Could not load" with Retry. Never zeros.
 *
 * The SQL mirror (20261124040100_fleet_dashboard_kpis.sql) gates each tile
 * with the rules of `FLEET_KPI_CAPABILITIES` and switches it off with the
 * vessel module of `FLEET_KPI_MODULE_KEY`; src/test/dashboard/fleetKpiRules.test.ts
 * pins both against the adaptor and the SQL.
 */
import type { Tone } from '@/components/ui/tones';
import type { KpiTileState } from '@/shared/components/data/KpiTile';
import type { CapabilityKey } from '@/lib/permissions/types';
import type { FleetDashboardKpisJson } from '../types/db.pending';
import type { FleetDashboardState } from '../hooks/useFleetDashboard';

/** The page's gate (the manifest route guard uses the same key). */
export const FLEET_DASHBOARD_VIEW = 'fleet.operations.fleet_dashboard.view' as const satisfies CapabilityKey;

/** The W9 tiles, in display order. */
export const FLEET_KPI_TILES = ['documents', 'hours_of_rest', 'leave', 'safety', 'technical', 'finance'] as const;
export type FleetKpiTileKey = (typeof FLEET_KPI_TILES)[number];

export const FLEET_KPI_LABELS: Readonly<Record<FleetKpiTileKey, string>> = {
  documents: 'Document alerts',
  hours_of_rest: 'Hours of rest',
  leave: 'Leave overdue',
  safety: 'Safety',
  technical: 'Technical',
  finance: 'Finance',
};

/** The vessel module setting that switches a tile off (gap/10 W4; SQL vessel_module_on_internal). */
export const FLEET_KPI_MODULE_KEY: Readonly<Record<FleetKpiTileKey, string | null>> = {
  documents: null,
  hours_of_rest: 'crew_hor',
  leave: null,
  safety: 'safety',
  technical: 'technical',
  finance: null,
};

/** The module's name in "… is off on every vessel shown". */
const MODULE_NAMES: Readonly<Partial<Record<FleetKpiTileKey, string>>> = {
  hours_of_rest: 'Hours of Rest',
  safety: 'Safety',
  technical: 'Technical',
};

/**
 * The keys whose rules gate a tile's data on each vessel (on top of
 * `FLEET_DASHBOARD_VIEW`). Document alerts follow each expiry source's read
 * area (`fleet_ops_can`, ../../fleet/lib/fleetOpsAccess.ts), so they list
 * no key here.
 */
export const FLEET_KPI_CAPABILITIES: Readonly<Record<FleetKpiTileKey, readonly CapabilityKey[]>> = {
  documents: [],
  hours_of_rest: ['vessel.crew.hours_of_rest.view'],
  leave: [],
  safety: ['vessel.safety.capa.view', 'vessel.safety.drills.view'],
  technical: ['vessel.technical.tasks.view'],
  finance: [],
};

/** The report each tile's number opens (gap/02 R-keys; registry `scope: 'fleet'`). */
export const FLEET_KPI_REPORT_KEY: Readonly<Record<FleetKpiTileKey, string | null>> = {
  documents: 'fleet-certificates',
  hours_of_rest: 'hours-of-rest',
  leave: null,
  safety: 'capa-tracker',
  technical: 'work-list',
  finance: null,
};

/** The fleet reports root the report keys sit under. */
export const FLEET_REPORTS_ROOT = '/fleet/reports';

/**
 * The link for a report key, or null when the registry does not know it
 * (the number stays plain text). `vessels` (the `?vessels=` codes of a
 * non-default "Vessels shown") is carried over so the report opens on the
 * same vessels.
 */
export function fleetReportHref(
  reportKey: string | null,
  knownReportKeys: ReadonlySet<string>,
  query: { vessels?: string | null } = {},
): string | null {
  if (!reportKey || !knownReportKeys.has(reportKey)) return null;
  const params = new URLSearchParams();
  if (query.vessels) params.set('vessels', query.vessels);
  const search = params.toString();
  return `${FLEET_REPORTS_ROOT}/${reportKey}${search ? `?${search}` : ''}`;
}

const plural = (n: number, one: string, many: string = `${one}s`) => `${n.toLocaleString('en-GB')} ${n === 1 ? one : many}`;

type Tiles = FleetDashboardKpisJson['tiles'];

/** The sub-text parts of a tile (W9 "each count separately"); zero parts are left out unless noted. */
export function fleetKpiParts(key: FleetKpiTileKey, tiles: Tiles): string[] {
  switch (key) {
    case 'documents': {
      const t = tiles.documents;
      if (t.state !== 'ok') return [];
      const p = t.parts;
      return [
        p.expired_vessel_certificates > 0 ? `${plural(p.expired_vessel_certificates, 'expired certificate')}` : null,
        p.expired_crew_documents > 0 ? `${plural(p.expired_crew_documents, 'expired crew document')}` : null,
        p.expired_crew_qualifications > 0 ? `${plural(p.expired_crew_qualifications, 'expired qualification')}` : null,
        p.endorsements_overdue > 0 ? `${plural(p.endorsements_overdue, 'endorsement')} overdue` : null,
        p.expiring > 0 ? `${p.expiring.toLocaleString('en-GB')} expiring` : null,
      ].filter((s): s is string => s !== null);
    }
    case 'hours_of_rest': {
      const t = tiles.hours_of_rest;
      if (t.state !== 'ok') return [];
      return [
        t.breach_days > 0 ? plural(t.breach_days, 'breach day') : null,
        t.near_threshold > 0 ? `${t.near_threshold.toLocaleString('en-GB')} near the limit` : null,
        t.crew_without_entries > 0 ? `${t.crew_without_entries.toLocaleString('en-GB')} with no entries` : null,
        `${plural(t.vessels_logging, 'vessel')} logging`,
      ].filter((s): s is string => s !== null);
    }
    case 'safety': {
      const t = tiles.safety;
      if (t.state !== 'ok') return [];
      const open = t.open_corrective_actions;
      const overdue = t.overdue_corrective_actions ?? 0;
      return [
        open !== null && open > 0 ? `${plural(open, 'open action')}${overdue > 0 ? `, ${overdue.toLocaleString('en-GB')} overdue` : ''}` : null,
        t.overdue_drills !== null && t.overdue_drills > 0 ? plural(t.overdue_drills, 'overdue drill') : null,
      ].filter((s): s is string => s !== null);
    }
    case 'technical': {
      const t = tiles.technical;
      if (t.state !== 'ok') return [];
      return [
        t.overdue_jobs > 0 ? `${plural(t.overdue_jobs, 'job')} overdue` : null,
        t.pending_approval > 0 ? `${t.pending_approval.toLocaleString('en-GB')} awaiting approval` : null,
      ].filter((s): s is string => s !== null);
    }
    default:
      return [];
  }
}

/**
 * The W9 red rule: danger when anything is expired or overdue (documents:
 * expired or endorsement overdue; hours of rest: any breach; safety:
 * overdue actions or drills; technical: overdue jobs). Attention soon (warn)
 * for what is only coming up. Nothing otherwise.
 */
export function fleetKpiTone(key: FleetKpiTileKey, tiles: Tiles): Tone | undefined {
  switch (key) {
    case 'documents': {
      const t = tiles.documents;
      if (t.state !== 'ok') return undefined;
      const p = t.parts;
      if (p.expired_vessel_certificates + p.expired_crew_documents + p.expired_crew_qualifications + p.endorsements_overdue > 0) return 'danger';
      return p.expiring > 0 ? 'warn' : undefined;
    }
    case 'hours_of_rest': {
      const t = tiles.hours_of_rest;
      if (t.state !== 'ok') return undefined;
      if (t.breach_days > 0) return 'danger';
      return t.near_threshold > 0 || t.crew_without_entries > 0 ? 'warn' : undefined;
    }
    case 'safety': {
      const t = tiles.safety;
      if (t.state !== 'ok') return undefined;
      return (t.overdue_corrective_actions ?? 0) + (t.overdue_drills ?? 0) > 0 ? 'danger' : undefined;
    }
    case 'technical': {
      const t = tiles.technical;
      if (t.state !== 'ok') return undefined;
      if (t.overdue_jobs > 0) return 'danger';
      return t.pending_approval > 0 ? 'warn' : undefined;
    }
    default:
      return undefined;
  }
}

/** What the KPI row is given: the RPC's state. */
export type FleetKpisInput =
  | { kind: 'loading' }
  | { kind: 'not_set_up' }
  | { kind: 'error'; message?: string }
  | { kind: 'ready'; data: FleetDashboardKpisJson };

/** The KPI row's input from the hook's state; `idle` (gate or scope not ready) reads as loading. */
export function fleetKpisInput(state: FleetDashboardState<FleetDashboardKpisJson>): FleetKpisInput {
  switch (state.state) {
    case 'ready':
      return { kind: 'ready', data: state.data };
    case 'not_set_up':
      return { kind: 'not_set_up' };
    case 'error':
      return { kind: 'error' };
    default:
      return { kind: 'loading' };
  }
}

/** One tile as `KpiTile` renders it. `state` undefined: KpiTile picks zero or ready from the value. */
export interface FleetKpiTileView {
  key: FleetKpiTileKey;
  label: string;
  state: KpiTileState | undefined;
  value?: number;
  /** The sub-text parts joined with " · " (screen readers and tests read this). */
  sub?: string;
  /** The same parts one by one, so the row can keep each part on one line where it fits. */
  parts?: string[];
  tone?: Tone;
  href?: string;
  zeroLabel?: string;
  notEnabledReason?: string;
  errorMessage?: string;
}

export interface FleetKpiViewOptions {
  /** Report keys the registry knows; a tile links only to one of these. */
  knownReportKeys: ReadonlySet<string>;
  /** `?vessels=` codes of a non-default selection, carried into report links. */
  vesselsParam?: string | null;
}

export const NOT_SET_UP_REASON = 'Not set up yet';
export const LEAVE_NOT_ENABLED_REASON = 'Leave limits are not set up yet';

const ZERO_LABELS: Readonly<Partial<Record<FleetKpiTileKey, string>>> = {
  documents: 'All documents in date',
  safety: 'Nothing open or overdue',
  technical: 'Nothing overdue',
};

/** The view of one tile from the server's answer. */
function readyTile(key: FleetKpiTileKey, tiles: Tiles, options: FleetKpiViewOptions): FleetKpiTileView {
  const label = FLEET_KPI_LABELS[key];
  if (key === 'leave') return { key, label, state: 'not-enabled', notEnabledReason: LEAVE_NOT_ENABLED_REASON };
  if (key === 'finance') return { key, label, state: 'no-access' };
  const tile = tiles[key];
  if (tile.state === 'no_access') return { key, label, state: 'no-access' };
  if (tile.state === 'module_off') {
    return { key, label, state: 'not-enabled', notEnabledReason: `${MODULE_NAMES[key] ?? label} is off on every vessel shown` };
  }
  const parts = fleetKpiParts(key, tiles);
  const tone = fleetKpiTone(key, tiles);
  const href = fleetReportHref(FLEET_KPI_REPORT_KEY[key], options.knownReportKeys, { vessels: options.vesselsParam }) ?? undefined;
  const value = tile.value;
  // Hours of rest with no breach but something to watch: show the 0 with its parts, not "All clear".
  const watch = key === 'hours_of_rest' && value === 0 && tone === 'warn';
  const zeroLabel =
    key === 'hours_of_rest' && tile.state === 'ok' && 'vessels_logging' in tile
      ? `No breaches · ${plural(tile.vessels_logging, 'vessel')} logging`
      : ZERO_LABELS[key];
  return {
    key,
    label,
    state: watch ? 'ready' : undefined,
    value,
    sub: parts.length ? parts.join(' · ') : undefined,
    parts: parts.length ? parts : undefined,
    tone,
    href,
    zeroLabel,
  };
}

/**
 * The six W9 tiles as KpiTile views: loading skeletons, "Not set up yet"
 * while the RPC is missing (the leave tile keeps its own reason), "Could
 * not load" with Retry on a failed read, else the server's numbers. Finance
 * is always hidden (G1); a tile the caller has no access to is hidden too
 * (`no-access`).
 */
export function buildFleetKpiTiles(input: FleetKpisInput, options: FleetKpiViewOptions): FleetKpiTileView[] {
  return FLEET_KPI_TILES.map((key): FleetKpiTileView => {
    const label = FLEET_KPI_LABELS[key];
    if (key === 'finance') return { key, label, state: 'no-access' };
    if (key === 'leave') return { key, label, state: 'not-enabled', notEnabledReason: LEAVE_NOT_ENABLED_REASON };
    switch (input.kind) {
      case 'loading':
        return { key, label, state: 'loading' };
      case 'not_set_up':
        return { key, label, state: 'not-enabled', notEnabledReason: NOT_SET_UP_REASON };
      case 'error':
        return { key, label, state: 'error', errorMessage: input.message };
      case 'ready':
        return readyTile(key, input.data.tiles, options);
    }
  });
}

const FRESHNESS_FORMAT = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'UTC',
});

/** The D-88 freshness stamp: "Updated 26 Nov 2026, 14:05 UTC" (en-GB, h23, UTC). */
export function formatFreshnessUtc(at: number | Date): string {
  return `Updated ${FRESHNESS_FORMAT.format(at)} UTC`;
}
