import { OPEN_STATUSES, type LegalPriority, type Tone } from './constants';

/**
 * Client-side mirror of `legal_sla_deadline` / `legal_add_business_days`
 * (supabase/migrations/20260918100000_legal_module.sql). The database value
 * is authoritative; this is used for previews in the intake form and for
 * the countdown badges.
 */

export const isBusinessDay = (d: Date): boolean => {
  const dow = d.getDay();
  return dow !== 0 && dow !== 6;
};

/** Adds calendar days one at a time, counting only Monday to Friday. */
export function addBusinessDays(from: Date, days: number): Date {
  const d = new Date(from.getTime());
  let n = 0;
  while (n < days) {
    d.setDate(d.getDate() + 1);
    if (isBusinessDay(d)) n += 1;
  }
  return d;
}

export function computeSlaDeadline(priority: LegalPriority | string, from: Date = new Date()): Date {
  switch (priority) {
    case 'urgent':
      return new Date(from.getTime() + 24 * 60 * 60 * 1000);
    case 'high':
      return addBusinessDays(from, 2);
    case 'low':
      return addBusinessDays(from, 10);
    default:
      return addBusinessDays(from, 5);
  }
}

export type SlaKind = 'none' | 'on_track' | 'due_soon' | 'breached' | 'met' | 'missed' | 'cancelled';

export interface SlaState {
  kind: SlaKind;
  deadline: Date | null;
  /** Hours until the deadline (negative once past). Null when not applicable. */
  hoursLeft: number | null;
  label: string;
  tone: Tone;
}

const HOUR = 60 * 60 * 1000;

/** "45 min", "3 h", "2 d 4 h". */
export function formatDuration(hours: number): string {
  const h = Math.abs(hours);
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`;
  if (h < 48) return `${Math.floor(h)} h`;
  const days = Math.floor(h / 24);
  const rem = Math.floor(h - days * 24);
  return rem > 0 ? `${days} d ${rem} h` : `${days} d`;
}

export function slaState(
  row: { sla_deadline: string | null; status: string; resolved_at: string | null },
  now: Date = new Date(),
): SlaState {
  if (!row.sla_deadline) return { kind: 'none', deadline: null, hoursLeft: null, label: 'No SLA', tone: 'neutral' };
  const deadline = new Date(row.sla_deadline);
  if (Number.isNaN(deadline.getTime())) return { kind: 'none', deadline: null, hoursLeft: null, label: 'No SLA', tone: 'neutral' };

  if (row.status === 'cancelled') return { kind: 'cancelled', deadline, hoursLeft: null, label: 'Cancelled', tone: 'neutral' };

  if (row.status === 'completed') {
    const resolved = row.resolved_at ? new Date(row.resolved_at) : now;
    const delta = (deadline.getTime() - resolved.getTime()) / HOUR;
    return delta >= 0
      ? { kind: 'met', deadline, hoursLeft: delta, label: 'SLA met', tone: 'success' }
      : { kind: 'missed', deadline, hoursLeft: delta, label: `SLA missed by ${formatDuration(delta)}`, tone: 'critical' };
  }

  const hoursLeft = (deadline.getTime() - now.getTime()) / HOUR;
  if (hoursLeft < 0) return { kind: 'breached', deadline, hoursLeft, label: `Overdue by ${formatDuration(hoursLeft)}`, tone: 'critical' };
  if (hoursLeft <= 24) return { kind: 'due_soon', deadline, hoursLeft, label: `Due in ${formatDuration(hoursLeft)}`, tone: 'warning' };
  return { kind: 'on_track', deadline, hoursLeft, label: `Due in ${formatDuration(hoursLeft)}`, tone: 'success' };
}

export const isOpenStatus = (status: string | null | undefined): boolean =>
  OPEN_STATUSES.includes(status as (typeof OPEN_STATUSES)[number]);
