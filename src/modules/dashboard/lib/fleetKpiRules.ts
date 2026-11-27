/**
 * Fleet dashboard KPI rules (gap/02 W9, D3–D8; X5 spec §2 X5-02A). Pure:
 * the tile order and labels, tile → vessel module key, tile → capability
 * keys (the server's per-tile gates), tile → report key, the W9 red rule,
 * the sub-text parts and the KpiTile view of each tile.
 *
 * - The numbers are the server's (`fleet_dashboard_kpis`); nothing here
 *   adds them up or makes one up. A part the caller cannot count is null
 *   and is left out of the sub-text, never shown as 0.
 * - Each part opens the report that holds what it counts, with its bucket
 *   in the query string the report already reads (gap/02 W9, D9; D-381):
 *   expired certificates and endorsements open Fleet certificates, expired
 *   crew documents and qualifications open Crew documents, expiring opens
 *   the report of each source (or Fleet certificates while the server
 *   does not split it), corrective actions open the CAPA tracker on its
 *   open actions, overdue drills open Overdue drills. The tile's own link
 *   is its most urgent part's (`FLEET_KPI_REPORT_KEY` when it has none).
 * - A number is a link only when the report registry knows the report key
 *   (`knownReportKeys`); otherwise it is plain text.
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
import type { FleetDashboardKpisJson, FleetDocumentsParts } from '../types/db.pending';
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

/**
 * The report a tile opens when none of its parts links (gap/02 R-keys;
 * registry `scope: 'fleet'`): a real zero, or a tile whose parts carry no
 * link of their own (hours of rest, technical).
 */
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

/** What a report link carries: the vessels shown and the report's own filters. */
export interface FleetReportQuery {
  /** The `?vessels=` codes of a non-default "Vessels shown", so the report opens on the same vessels. */
  vessels?: string | null;
  /** The report's Status filter value (`expired`, `due`, `open`, …). */
  status?: string | null;
  /** The report's Type filter value. */
  type?: string | null;
}

/**
 * The link for a report key, or null when the registry does not know it
 * (the number stays plain text). The query is appended in a fixed order
 * (vessels, status, type); empty values are left out.
 */
export function fleetReportHref(reportKey: string | null, knownReportKeys: ReadonlySet<string>, query: FleetReportQuery = {}): string | null {
  if (!reportKey || !knownReportKeys.has(reportKey)) return null;
  const params = new URLSearchParams();
  if (query.vessels) params.set('vessels', query.vessels);
  if (query.status) params.set('status', query.status);
  if (query.type) params.set('type', query.type);
  const search = params.toString();
  return `${FLEET_REPORTS_ROOT}/${reportKey}${search ? `?${search}` : ''}`;
}

const plural = (n: number, one: string, many: string = `${one}s`) => `${n.toLocaleString('en-GB')} ${n === 1 ? one : many}`;

type Tiles = FleetDashboardKpisJson['tiles'];

/** One sub-text part: its words, the report that holds what it counts (and the filters), and how urgent it is. */
interface KpiPart {
  text: string;
  /** The registry report key, or null when the part opens nothing of its own. */
  report: string | null;
  query?: { status?: string; type?: string };
  /** Lower is more urgent: the tile's own link is its most urgent linked part's. */
  rank: number;
}

/** The fleet certificates report (vessel certificates only, `CERTIFICATE_SOURCES`). */
export const CERTIFICATES_REPORT = 'fleet-certificates';
/** The crew documents report (every crew source, `CREW_SOURCE_KEYS`). */
export const CREW_DOCUMENTS_REPORT = 'crew-documents';
/** The legacy CAPA tracker (corrective actions; `?status=open|overdue`, `?vessels=` of one vessel). */
export const CORRECTIVE_ACTIONS_REPORT = 'capa-tracker';
/** The overdue drills report (R7). */
export const OVERDUE_DRILLS_REPORT = 'overdue-drills';

/**
 * The server's split of `expiring` by source (C-1, D-381), when it sends
 * one that adds up; null for an older answer (the fallback: one part).
 */
function expiringBySource(p: FleetDocumentsParts): { certificates: number; crew: number } | null {
  const certificates = p.expiring_vessel_certificates;
  const crew = p.expiring_crew_items;
  if (typeof certificates !== 'number' || typeof crew !== 'number') return null;
  return certificates + crew === p.expiring ? { certificates, crew } : null;
}

function kpiParts(key: FleetKpiTileKey, tiles: Tiles): KpiPart[] {
  const keep = (parts: (KpiPart | null)[]) => parts.filter((part): part is KpiPart => part !== null);
  switch (key) {
    case 'documents': {
      const t = tiles.documents;
      if (t.state !== 'ok') return [];
      const p = t.parts;
      const split = expiringBySource(p);
      const expired = { status: 'expired' };
      const due = { status: 'due' };
      return keep([
        p.expired_vessel_certificates > 0
          ? { text: plural(p.expired_vessel_certificates, 'expired certificate'), report: CERTIFICATES_REPORT, query: expired, rank: 0 }
          : null,
        p.expired_crew_documents > 0
          ? { text: plural(p.expired_crew_documents, 'expired crew document'), report: CREW_DOCUMENTS_REPORT, query: expired, rank: 0 }
          : null,
        p.expired_crew_qualifications > 0
          ? { text: plural(p.expired_crew_qualifications, 'expired qualification'), report: CREW_DOCUMENTS_REPORT, query: expired, rank: 0 }
          : null,
        // No endorsement filter exists: the certificates report lists them with their endorsement state.
        p.endorsements_overdue > 0 ? { text: `${plural(p.endorsements_overdue, 'endorsement')} overdue`, report: CERTIFICATES_REPORT, rank: 1 } : null,
        ...(split
          ? [
              split.certificates > 0
                ? { text: plural(split.certificates, 'expiring certificate'), report: CERTIFICATES_REPORT, query: due, rank: 2 }
                : null,
              split.crew > 0 ? { text: plural(split.crew, 'expiring crew item'), report: CREW_DOCUMENTS_REPORT, query: due, rank: 2 } : null,
            ]
          : [p.expiring > 0 ? { text: `${p.expiring.toLocaleString('en-GB')} expiring`, report: CERTIFICATES_REPORT, query: due, rank: 2 } : null]),
      ]);
    }
    case 'hours_of_rest': {
      const t = tiles.hours_of_rest;
      if (t.state !== 'ok') return [];
      return keep([
        t.breach_days > 0 ? { text: plural(t.breach_days, 'breach day'), report: null, rank: 0 } : null,
        t.near_threshold > 0 ? { text: `${t.near_threshold.toLocaleString('en-GB')} near the limit`, report: null, rank: 1 } : null,
        t.crew_without_entries > 0 ? { text: `${t.crew_without_entries.toLocaleString('en-GB')} with no entries`, report: null, rank: 1 } : null,
        { text: `${plural(t.vessels_logging, 'vessel')} logging`, report: null, rank: 2 },
      ]);
    }
    case 'safety': {
      const t = tiles.safety;
      if (t.state !== 'ok') return [];
      const open = t.open_corrective_actions;
      const overdue = t.overdue_corrective_actions ?? 0;
      return keep([
        open !== null && open > 0
          ? {
              text: `${plural(open, 'open action')}${overdue > 0 ? `, ${overdue.toLocaleString('en-GB')} overdue` : ''}`,
              report: CORRECTIVE_ACTIONS_REPORT,
              query: { status: 'open' },
              rank: 1,
            }
          : null,
        t.overdue_drills !== null && t.overdue_drills > 0 ? { text: plural(t.overdue_drills, 'overdue drill'), report: OVERDUE_DRILLS_REPORT, rank: 0 } : null,
      ]);
    }
    case 'technical': {
      const t = tiles.technical;
      if (t.state !== 'ok') return [];
      return keep([
        t.overdue_jobs > 0 ? { text: `${plural(t.overdue_jobs, 'job')} overdue`, report: null, rank: 0 } : null,
        t.pending_approval > 0 ? { text: `${t.pending_approval.toLocaleString('en-GB')} awaiting approval`, report: null, rank: 1 } : null,
      ]);
    }
    default:
      return [];
  }
}

/** The sub-text parts of a tile (W9 "each count separately"); zero parts are left out unless noted. */
export function fleetKpiParts(key: FleetKpiTileKey, tiles: Tiles): string[] {
  return kpiParts(key, tiles).map((part) => part.text);
}

/** One sub-text part with the report it opens (none: plain text). */
export interface FleetKpiPartLink {
  text: string;
  href?: string;
}

/** The link options a part or tile link needs. */
export type FleetKpiLinkOptions = Pick<FleetKpiViewOptions, 'knownReportKeys' | 'vesselsParam'>;

function partHref(part: KpiPart, options: FleetKpiLinkOptions): string | undefined {
  return fleetReportHref(part.report, options.knownReportKeys, { vessels: options.vesselsParam, ...part.query }) ?? undefined;
}

/**
 * The same parts as `fleetKpiParts`, each with the report that holds what
 * it counts and its bucket in the query (`?status=`), plus the vessels
 * shown; a part whose report the registry does not know is plain text.
 */
export function fleetKpiPartLinks(key: FleetKpiTileKey, tiles: Tiles, options: FleetKpiLinkOptions): FleetKpiPartLink[] {
  return kpiParts(key, tiles).map((part) => {
    const href = partHref(part, options);
    return href ? { text: part.text, href } : { text: part.text };
  });
}

/**
 * The tile's own link: its most urgent part that links (documents: expired,
 * then endorsements, then expiring; safety: overdue drills, then actions),
 * else the tile's report (`FLEET_KPI_REPORT_KEY`) with the vessels shown.
 */
export function fleetKpiTileHref(key: FleetKpiTileKey, tiles: Tiles, options: FleetKpiLinkOptions): string | undefined {
  const linked = kpiParts(key, tiles)
    .map((part) => ({ part, href: partHref(part, options) }))
    .filter((x): x is { part: KpiPart; href: string } => x.href !== undefined)
    .sort((a, b) => a.part.rank - b.part.rank);
  if (linked.length) return linked[0].href;
  return fleetReportHref(FLEET_KPI_REPORT_KEY[key], options.knownReportKeys, { vessels: options.vesselsParam }) ?? undefined;
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
  /** The parts with the report each opens (a part without `href` is plain text). */
  partLinks?: FleetKpiPartLink[];
  tone?: Tone;
  /** The tile's own link: its most urgent part's, else its report's. */
  href?: string;
  zeroLabel?: string;
  notEnabledReason?: string;
  errorMessage?: string;
}

/**
 * The link the whole tile may carry when rendered: none when a part links
 * on its own, because a link cannot sit inside another (the parts then
 * carry the links, most urgent first; the number itself stays text until
 * KpiTile can link its value beside inner links).
 */
export function fleetKpiTileOwnHref(tile: Pick<FleetKpiTileView, 'href' | 'partLinks'>): string | undefined {
  return tile.partLinks?.some((part) => part.href) ? undefined : tile.href;
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
  const partLinks = fleetKpiPartLinks(key, tiles, options);
  const parts = partLinks.map((part) => part.text);
  const tone = fleetKpiTone(key, tiles);
  const href = fleetKpiTileHref(key, tiles, options);
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
    partLinks: partLinks.length ? partLinks : undefined,
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
