/**
 * The reports hub's period and trend charts (gap/02 R1). Pure: no React, no
 * Supabase, no chart library.
 *
 * - Period: `?period=3|6|12` months (default 6, the SQL default); anything
 *   else reads as the default. The default is not written to the URL.
 * - Charts: one card per series of `fleet_report_trends`, in this order:
 *   incidents, corrective actions (opened / closed), drills (completed /
 *   overdue), document expiries ahead. A series the reader cannot count
 *   (`no_access`) has no card; one switched off on every vessel shown
 *   (`module_off`) keeps its card and says so; numbers are the server's,
 *   one bar per month, never filled in.
 */
import type { FleetReportTrendsJson } from '../types/db.pending';

export const REPORT_PERIODS = [3, 6, 12] as const;
export type ReportPeriod = (typeof REPORT_PERIODS)[number];
export const DEFAULT_REPORT_PERIOD: ReportPeriod = 6;
export const PERIOD_PARAM = 'period';

/** The period a `?period=` value names; a missing or unknown value is the default. */
export function parseReportPeriod(value: string | null | undefined): ReportPeriod {
  const n = Number(value);
  return (REPORT_PERIODS as readonly number[]).includes(n) ? (n as ReportPeriod) : DEFAULT_REPORT_PERIOD;
}

/** The URL parameters with this period (the default removed); other parameters kept. */
export function writeReportPeriod(period: ReportPeriod, params: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(params);
  if (period === DEFAULT_REPORT_PERIOD) next.delete(PERIOD_PARAM);
  else next.set(PERIOD_PARAM, String(period));
  return next;
}

export const periodLabel = (period: ReportPeriod): string => `${period} months`;

const MONTH_SHORT = new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' });
const MONTH_LONG = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });

const monthDate = (month: string): Date => {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1));
};

/**
 * Axis labels for `yyyy-mm-01` months: "Sep", or "Dec 25" / "Jan 26" when
 * the months span more than one year.
 */
export function monthAxisLabels(months: readonly string[]): string[] {
  const years = new Set(months.map((m) => m.slice(0, 4)));
  return months.map((m) => {
    const short = MONTH_SHORT.format(monthDate(m));
    return years.size > 1 ? `${short} ${m.slice(2, 4)}` : short;
  });
}

/** "September 2026" (tooltips and the accessible table). */
export const monthLongLabel = (month: string): string => MONTH_LONG.format(monthDate(month));

export type TrendSeriesKey = 'incidents' | 'corrective_actions' | 'drills' | 'expiries';

/** A chart colour token (`--chart-n`, D-53; the same series keeps the same colour). */
export type TrendColour = 'chart-1' | 'chart-2' | 'chart-3' | 'chart-4';

export interface TrendBar {
  key: string;
  label: string;
  colour: TrendColour;
}

/** One row of a chart: the month and a value per bar. */
export interface TrendRow {
  month: string;
  label: string;
  longLabel: string;
  values: Record<string, number>;
}

export type TrendCard =
  | { key: TrendSeriesKey; title: string; description: string; state: 'module_off'; offReason: string }
  | {
      key: TrendSeriesKey;
      title: string;
      description: string;
      state: 'ok';
      bars: TrendBar[];
      rows: TrendRow[];
      /** The sum of each bar over the period. */
      totals: Record<string, number>;
      /** Items already expired (expiries only). */
      expired?: number;
      vessels: number;
    };

const SAFETY_OFF = 'Safety is off on every vessel shown';

function rowsOf(months: readonly string[], series: Record<string, readonly number[]>): TrendRow[] {
  const labels = monthAxisLabels(months);
  return months.map((month, i) => ({
    month,
    label: labels[i],
    longLabel: monthLongLabel(month),
    values: Object.fromEntries(Object.entries(series).map(([k, values]) => [k, values[i] ?? 0])),
  }));
}

const sum = (values: readonly number[]) => values.reduce((a, b) => a + b, 0);

/**
 * The cards to show for an answer, in display order. A `no_access` series
 * has no card. Arrays whose length does not match the months are a contract
 * break: the hook rejects them before this runs (useReportTrends).
 */
export function trendCards(data: FleetReportTrendsJson): TrendCard[] {
  const cards: TrendCard[] = [];
  const { months, ahead } = data;

  const inc = data.incidents;
  if (inc.state === 'module_off') {
    cards.push({ key: 'incidents', title: 'Incidents', description: 'Reported each month.', state: 'module_off', offReason: SAFETY_OFF });
  } else if (inc.state === 'ok') {
    cards.push({
      key: 'incidents',
      title: 'Incidents',
      description: 'Reported each month.',
      state: 'ok',
      bars: [{ key: 'count', label: 'Incidents', colour: 'chart-1' }],
      rows: rowsOf(months, { count: inc.counts }),
      totals: { count: sum(inc.counts) },
      vessels: inc.vessels,
    });
  }

  const ca = data.corrective_actions;
  if (ca.state === 'module_off') {
    cards.push({ key: 'corrective_actions', title: 'Corrective actions', description: 'Opened and closed each month.', state: 'module_off', offReason: SAFETY_OFF });
  } else if (ca.state === 'ok') {
    cards.push({
      key: 'corrective_actions',
      title: 'Corrective actions',
      description: 'Opened and closed each month.',
      state: 'ok',
      bars: [
        { key: 'opened', label: 'Opened', colour: 'chart-2' },
        { key: 'closed', label: 'Closed', colour: 'chart-1' },
      ],
      rows: rowsOf(months, { opened: ca.opened, closed: ca.closed }),
      totals: { opened: sum(ca.opened), closed: sum(ca.closed) },
      vessels: ca.vessels,
    });
  }

  const dr = data.drills;
  if (dr.state === 'module_off') {
    cards.push({ key: 'drills', title: 'Drills', description: 'Carried out, and missed by their scheduled month.', state: 'module_off', offReason: SAFETY_OFF });
  } else if (dr.state === 'ok') {
    cards.push({
      key: 'drills',
      title: 'Drills',
      description: 'Carried out, and missed by their scheduled month.',
      state: 'ok',
      bars: [
        { key: 'completed', label: 'Carried out', colour: 'chart-1' },
        { key: 'overdue', label: 'Overdue', colour: 'chart-2' },
      ],
      rows: rowsOf(months, { completed: dr.completed, overdue: dr.overdue }),
      totals: { completed: sum(dr.completed), overdue: sum(dr.overdue) },
      vessels: dr.vessels,
    });
  }

  const ex = data.expiries;
  if (ex.state === 'ok') {
    cards.push({
      key: 'expiries',
      title: 'Document expiries ahead',
      description: 'Certificates, crew documents and qualifications expiring each month from today.',
      state: 'ok',
      bars: [{ key: 'due', label: 'Expiring', colour: 'chart-4' }],
      rows: rowsOf(ahead, { due: ex.due }),
      totals: { due: sum(ex.due) },
      expired: ex.expired,
      vessels: ex.vessels,
    });
  }
  return cards;
}

/** The sentence a screen reader hears for a chart card ("Incidents: 4 over 3 months"). */
export function trendSummary(card: TrendCard, period: ReportPeriod): string {
  if (card.state === 'module_off') return `${card.title}: ${card.offReason}.`;
  const parts = card.bars.map((b) => `${card.totals[b.key].toLocaleString('en-GB')} ${b.label.toLowerCase()}`);
  const span = card.key === 'expiries' ? `in the next ${period} months` : `over the last ${period} months`;
  const expired = card.expired ? `, ${card.expired.toLocaleString('en-GB')} already expired` : '';
  return `${card.title}: ${parts.join(', ')} ${span}${expired}.`;
}
