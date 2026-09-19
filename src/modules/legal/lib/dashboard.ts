import { STATUSES, type LegalStatus } from './constants';
import { isOpen, isUrgentRequest, type LegalRequestRow } from './requests';

export interface DashboardMetrics {
  open: number;
  urgent: number;
  completed: number;
  /** Mean resolved_at − created_at in days over completed requests, 1 decimal. Null when none. */
  avgCycleDays: number | null;
  /** Share of completed-with-SLA requests resolved on or before the deadline. 100 when none. */
  slaCompliancePct: number;
  /** Open requests past their SLA right now. */
  breached: number;
}

const DAY = 24 * 3600 * 1000;

export function computeDashboardMetrics(rows: LegalRequestRow[], now: Date = new Date()): DashboardMetrics {
  const open = rows.filter((r) => isOpen(r.status));
  const completed = rows.filter((r) => r.status === 'completed');
  const cycles = completed
    .filter((r) => r.resolved_at)
    .map((r) => (new Date(r.resolved_at as string).getTime() - new Date(r.created_at).getTime()) / DAY)
    .filter((d) => Number.isFinite(d) && d >= 0);
  const withSla = completed.filter((r) => r.sla_deadline && r.resolved_at);
  const onTime = withSla.filter((r) => new Date(r.resolved_at as string).getTime() <= new Date(r.sla_deadline as string).getTime());
  return {
    open: open.length,
    urgent: open.filter(isUrgentRequest).length,
    completed: completed.length,
    avgCycleDays: cycles.length ? Math.round((cycles.reduce((a, b) => a + b, 0) / cycles.length) * 10) / 10 : null,
    slaCompliancePct: withSla.length ? Math.round((onTime.length / withSla.length) * 100) : 100,
    breached: open.filter((r) => r.sla_deadline && new Date(r.sla_deadline).getTime() < now.getTime()).length,
  };
}

export interface StatusSlice {
  status: LegalStatus;
  label: string;
  count: number;
  color: string;
}

export function statusBreakdown(rows: LegalRequestRow[]): StatusSlice[] {
  return STATUSES.map((s) => ({
    status: s.value,
    label: s.label,
    count: rows.filter((r) => r.status === s.value).length,
    color: s.chart,
  })).filter((s) => s.count > 0);
}

export interface MonthBucket {
  /** yyyy-MM */
  key: string;
  /** Short month label, e.g. "Apr". */
  label: string;
  count: number;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Requests created per month for the trailing `months` months (oldest first). */
export function monthlyVolume(rows: LegalRequestRow[], now: Date = new Date(), months = 6): MonthBucket[] {
  const buckets: MonthBucket[] = [];
  for (let i = months - 1; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    buckets.push({ key, label: MONTHS[d.getMonth()], count: 0 });
  }
  const byKey = new Map(buckets.map((b) => [b.key, b]));
  for (const r of rows) {
    const d = new Date(r.created_at);
    if (Number.isNaN(d.getTime())) continue;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const b = byKey.get(key);
    if (b) b.count += 1;
  }
  return buckets;
}

/** Open requests needing attention: urgent or SLA-breached, most pressing first. */
export function urgentAttention(rows: LegalRequestRow[], now: Date = new Date(), limit = 8): LegalRequestRow[] {
  const time = (s: string | null) => (s ? new Date(s).getTime() : Number.POSITIVE_INFINITY);
  return rows
    .filter((r) => isOpen(r.status) && (isUrgentRequest(r) || (r.sla_deadline && time(r.sla_deadline) < now.getTime())))
    .sort((a, b) => time(a.sla_deadline) - time(b.sla_deadline))
    .slice(0, limit);
}

/** Most recently touched requests. */
export function recentActivity(rows: LegalRequestRow[], limit = 8): LegalRequestRow[] {
  return [...rows].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, limit);
}
