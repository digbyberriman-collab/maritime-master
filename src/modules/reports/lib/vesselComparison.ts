/**
 * The Vessel comparison report (gap/02 R2; X5 spec X5-03A): tabs, columns,
 * findings, order, links and the export table. Pure: no React, no Supabase.
 *
 * Data: one row per vessel shown from `fleet_vessel_comparison` (040100,
 * through the dashboard's `useFleetVesselComparison`). A group the reader
 * cannot count on a vessel (no access, its module off) is NULL: the report
 * shows "–" (not covered), never 0, and sorts the vessel after the covered
 * ones. Within a group, a part that is null is not counted either.
 *
 * Findings per tab: `severe` (expired, overdue, breach days) and `watch`
 * (coming up, awaiting approval, near the limit). Vessels sort by severe,
 * then watch, then name ("worst first").
 *
 * Links: a number opens the vessel's own page for it where one exists
 * (`vesselPath`): certificates, drills, the technical schedule, hours of
 * rest. Corrective actions have no vessel page yet (D-27): their numbers
 * open the fleet CAPA tracker. Insurance has no live page yet, so its
 * numbers are plain text.
 */
import type { Tone } from '@/components/ui/tones';
import type { ExportColumn } from '@/lib/export';
import { vesselPath } from '@/modules/vessels/lib/vesselCode';
import type { FleetVesselComparison } from '@/modules/dashboard/hooks/useFleetDashboard';
import { FLEET_REPORTS_ROOT } from '../paths';
import type { ReportFilterSpec } from './reportFilters';

export const COMPARISON_TABS = ['documents', 'safety', 'technical', 'insurance', 'hours-of-rest'] as const;
export type ComparisonTab = (typeof COMPARISON_TABS)[number];
export const COMPARISON_TAB_PARAM = 'tab';
export const DEFAULT_COMPARISON_TAB: ComparisonTab = 'documents';

export const COMPARISON_TAB_LABELS: Readonly<Record<ComparisonTab, string>> = {
  documents: 'Documents',
  safety: 'Safety',
  technical: 'Technical',
  insurance: 'Insurance',
  'hours-of-rest': 'Hours of rest',
};

/** The tab a `?tab=` value names; a missing or unknown value is Documents. */
export function parseComparisonTab(value: string | null | undefined): ComparisonTab {
  return (COMPARISON_TABS as readonly string[]).includes(value ?? '') ? (value as ComparisonTab) : DEFAULT_COMPARISON_TAB;
}

/** The URL parameters with this tab (the default removed); other parameters kept. */
export function writeComparisonTab(tab: ComparisonTab, params: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(params);
  if (tab === DEFAULT_COMPARISON_TAB) next.delete(COMPARISON_TAB_PARAM);
  else next.set(COMPARISON_TAB_PARAM, tab);
  return next;
}

/** The report's one filter: every vessel, or only those with something to act on. */
export const COMPARISON_SHOW_FILTER: ReportFilterSpec = {
  key: 'show',
  label: 'Show',
  options: [
    { value: 'all', label: 'All vessels' },
    { value: 'findings', label: 'Vessels with findings' },
  ],
  defaultValue: 'all',
};
export const COMPARISON_FILTERS: readonly ReportFilterSpec[] = [COMPARISON_SHOW_FILTER];

/** How a metric counts: `severe` and `watch` feed the order; `info` is shown only. */
export type MetricWeight = 'severe' | 'watch' | 'info';

export interface ComparisonMetric {
  id: string;
  label: string;
  /** A longer heading for the export and screen readers. */
  title: string;
  weight: MetricWeight;
  /** The count, or null when the group or part is not covered. */
  value: (row: FleetVesselComparison) => number | null;
  /** Where the number opens, or null (no page). `code` is the vessel's code. */
  href: (code: string) => string | null;
}

const CAPA_TRACKER = `${FLEET_REPORTS_ROOT}/capa-tracker`;

export const COMPARISON_METRICS: Readonly<Record<ComparisonTab, readonly ComparisonMetric[]>> = {
  documents: [
    { id: 'expired', label: 'Expired', title: 'Expired documents', weight: 'severe', value: (r) => r.documents?.expired ?? null, href: (c) => vesselPath(c, 'certificates') },
    {
      id: 'endorsements_overdue',
      label: 'Endorsements overdue',
      title: 'Endorsements overdue',
      weight: 'severe',
      value: (r) => r.documents?.endorsements_overdue ?? null,
      href: (c) => vesselPath(c, 'certificates'),
    },
    { id: 'expiring', label: 'Expiring', title: 'Expiring within their window', weight: 'watch', value: (r) => r.documents?.expiring ?? null, href: (c) => vesselPath(c, 'certificates') },
  ],
  safety: [
    {
      id: 'overdue_corrective_actions',
      label: 'Overdue actions',
      title: 'Overdue corrective actions',
      weight: 'severe',
      value: (r) => r.safety?.overdue_corrective_actions ?? null,
      href: () => CAPA_TRACKER,
    },
    { id: 'overdue_drills', label: 'Overdue drills', title: 'Overdue drills', weight: 'severe', value: (r) => r.safety?.overdue_drills ?? null, href: (c) => vesselPath(c, 'safety/drills') },
    {
      id: 'open_corrective_actions',
      label: 'Open actions',
      title: 'Open corrective actions',
      weight: 'watch',
      value: (r) => r.safety?.open_corrective_actions ?? null,
      href: () => CAPA_TRACKER,
    },
  ],
  technical: [
    { id: 'overdue_jobs', label: 'Overdue jobs', title: 'Overdue jobs', weight: 'severe', value: (r) => r.technical?.overdue_jobs ?? null, href: (c) => vesselPath(c, 'technical?tab=schedule') },
    {
      id: 'pending_approval',
      label: 'Awaiting approval',
      title: 'Jobs awaiting approval',
      weight: 'watch',
      value: (r) => r.technical?.pending_approval ?? null,
      href: (c) => vesselPath(c, 'technical?tab=schedule'),
    },
    { id: 'open_jobs', label: 'Open jobs', title: 'Open jobs', weight: 'info', value: (r) => r.technical?.open_jobs ?? null, href: (c) => vesselPath(c, 'technical?tab=schedule') },
  ],
  insurance: [
    { id: 'expired', label: 'Expired', title: 'Expired policies', weight: 'severe', value: (r) => r.insurance?.expired ?? null, href: () => null },
    { id: 'expiring', label: 'Expiring in 90 days', title: 'Policies expiring within 90 days', weight: 'watch', value: (r) => r.insurance?.expiring ?? null, href: () => null },
  ],
  'hours-of-rest': [
    {
      id: 'breach_days',
      label: 'Breach days',
      title: 'Breach crew-days in the last 30 days',
      weight: 'severe',
      value: (r) => r.hours_of_rest?.breach_days ?? null,
      href: (c) => vesselPath(c, 'crew/hours-of-rest'),
    },
    {
      id: 'near_threshold',
      label: 'Near the limit',
      title: 'Crew-days near the limit',
      weight: 'watch',
      value: (r) => r.hours_of_rest?.near_threshold ?? null,
      href: (c) => vesselPath(c, 'crew/hours-of-rest'),
    },
    {
      id: 'crew_without_entries',
      label: 'No entries (7 days)',
      title: 'Crew with no entries in 7 days',
      weight: 'watch',
      value: (r) => r.hours_of_rest?.crew_without_entries ?? null,
      href: (c) => vesselPath(c, 'crew/hours-of-rest'),
    },
  ],
};

/** The KPI tile that totals each tab's first metric (short enough for a 2-up tile on a phone). */
export const COMPARISON_LEAD_LABEL: Readonly<Record<ComparisonTab, string>> = {
  documents: 'Expired items',
  safety: 'Overdue actions',
  technical: 'Overdue jobs',
  insurance: 'Expired policies',
  'hours-of-rest': 'Breach days (30 d)',
};

/** The jsonb group behind a tab. */
const GROUP: Readonly<Record<ComparisonTab, keyof Pick<FleetVesselComparison, 'documents' | 'safety' | 'technical' | 'insurance' | 'hours_of_rest'>>> = {
  documents: 'documents',
  safety: 'safety',
  technical: 'technical',
  insurance: 'insurance',
  'hours-of-rest': 'hours_of_rest',
};

export interface VesselFindings {
  /** False: the tab's group is not covered on this vessel ("–"). */
  covered: boolean;
  severe: number;
  watch: number;
}

/** A vessel's findings on a tab. A safety group with no counted part is not covered. */
export function vesselFindings(row: FleetVesselComparison, tab: ComparisonTab): VesselFindings {
  const metrics = COMPARISON_METRICS[tab];
  const values = metrics.map((m) => m.value(row));
  const covered = row[GROUP[tab]] !== null && values.some((v) => v !== null);
  let severe = 0;
  let watch = 0;
  metrics.forEach((m, i) => {
    const v = values[i] ?? 0;
    if (m.weight === 'severe') severe += v;
    else if (m.weight === 'watch') watch += v;
  });
  return { covered, severe: covered ? severe : 0, watch: covered ? watch : 0 };
}

/** The status a vessel's findings read as (a pill in the table and the cards). */
export function findingsStatus(f: VesselFindings): { tone: Tone; label: string } {
  if (!f.covered) return { tone: 'neutral', label: 'Not covered' };
  if (f.severe > 0) return { tone: 'danger', label: 'Needs action' };
  if (f.watch > 0) return { tone: 'warn', label: 'Coming up' };
  return { tone: 'ok', label: 'Clear' };
}

/** Worst first: covered before not covered, then severe, then watch, then name. */
export function sortByFindings(rows: readonly FleetVesselComparison[], tab: ComparisonTab): FleetVesselComparison[] {
  return [...rows]
    .map((row) => ({ row, f: vesselFindings(row, tab) }))
    .sort(
      (a, b) =>
        Number(b.f.covered) - Number(a.f.covered) ||
        b.f.severe - a.f.severe ||
        b.f.watch - a.f.watch ||
        a.row.vessel_name.localeCompare(b.row.vessel_name, 'en-GB'),
    )
    .map((x) => x.row);
}

/** The rows the report shows: sorted worst first, and only those with findings when asked. */
export function comparisonRows(rows: readonly FleetVesselComparison[], tab: ComparisonTab, show: string): FleetVesselComparison[] {
  const sorted = sortByFindings(rows, tab);
  if (show !== 'findings') return sorted;
  return sorted.filter((row) => {
    const f = vesselFindings(row, tab);
    return f.covered && f.severe + f.watch > 0;
  });
}

export interface ComparisonSummary {
  /** Vessels in the answer. */
  vessels: number;
  /** Vessels whose group is covered on this tab. */
  covered: number;
  withSevere: number;
  withWatch: number;
  /** Per metric id: the sum over covered vessels, or null when no vessel counts it. */
  totals: Record<string, number | null>;
}

/** The KPI row of a tab, over every vessel in the answer (not only those shown by the filter). */
export function comparisonSummary(rows: readonly FleetVesselComparison[], tab: ComparisonTab): ComparisonSummary {
  const metrics = COMPARISON_METRICS[tab];
  const totals: Record<string, number | null> = Object.fromEntries(metrics.map((m) => [m.id, null]));
  let covered = 0;
  let withSevere = 0;
  let withWatch = 0;
  for (const row of rows) {
    const f = vesselFindings(row, tab);
    if (!f.covered) continue;
    covered += 1;
    if (f.severe > 0) withSevere += 1;
    else if (f.watch > 0) withWatch += 1;
    for (const m of metrics) {
      const v = m.value(row);
      if (v !== null) totals[m.id] = (totals[m.id] ?? 0) + v;
    }
  }
  return { vessels: rows.length, covered, withSevere, withWatch, totals };
}

export const NOT_COVERED_REASON = 'Not covered: no access, or the module is off on this vessel';

/** The export table of a tab: vessel, code, status, then the tab's numbers (blank = not covered). */
export function comparisonExportColumns(tab: ComparisonTab): ExportColumn<FleetVesselComparison>[] {
  return [
    { key: 'vessel', header: 'Vessel', value: (r) => r.vessel_name, width: 28 },
    { key: 'code', header: 'Code', value: (r) => r.vessel_code, width: 8 },
    { key: 'status', header: 'Status', value: (r) => findingsStatus(vesselFindings(r, tab)).label, width: 14 },
    ...COMPARISON_METRICS[tab].map(
      (m): ExportColumn<FleetVesselComparison> => ({ key: m.id, header: m.title, kind: 'number', value: (r) => m.value(r) }),
    ),
  ];
}
