import type { RotationAssignment, LeaveOverlayEntry, ConflictInfo } from '../types';
import { LEAVE_CODE_TO_TYPE } from '../constants';
import { bandSpans, manningGapLabel, type ManningDayRow } from './manning';

/**
 * Blocks are grouped by linked crew account when present, and otherwise by the
 * imported crew name — spreadsheet imports often carry names without accounts.
 */
export function crewKeyOf(a: RotationAssignment): string | null {
  if (a.crew_user_id) return a.crew_user_id;
  const raw = (a.crew_name_raw ?? '').trim().toLowerCase();
  return raw ? `name:${raw}` : null;
}

function rangesOverlap(a1: string, a2: string, b1: string, b2: string) {
  return a1 <= b2 && b1 <= a2;
}

export function detectConflicts(
  assignments: RotationAssignment[],
  leave: LeaveOverlayEntry[]
): Map<string, ConflictInfo[]> {
  const out = new Map<string, ConflictInfo[]>();
  const push = (id: string, info: ConflictInfo) => {
    const arr = out.get(id) ?? [];
    arr.push(info);
    out.set(id, arr);
  };

  const byCrew: Record<string, RotationAssignment[]> = {};
  for (const a of assignments) {
    const key = crewKeyOf(a);
    if (!key) continue;
    (byCrew[key] ||= []).push(a);
  }
  for (const list of Object.values(byCrew)) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        if (a.rotation_type === 'leave' || b.rotation_type === 'leave') continue;
        if (rangesOverlap(a.start_date, a.end_date, b.start_date, b.end_date)) {
          push(a.id, { assignmentId: a.id, severity: 'hard', reason: `Overlaps assignment ${b.label ?? b.id.slice(0, 6)}` });
          push(b.id, { assignmentId: b.id, severity: 'hard', reason: `Overlaps assignment ${a.label ?? a.id.slice(0, 6)}` });
        }
      }
    }
  }

  const leaveByCrew: Record<string, LeaveOverlayEntry[]> = {};
  for (const l of leave) (leaveByCrew[l.crew_id] ||= []).push(l);
  for (const a of assignments) {
    if (!a.crew_user_id || a.rotation_type !== 'onboard') continue;
    const days = leaveByCrew[a.crew_user_id] ?? [];
    const overlap = days.find(
      (d) => d.date >= a.start_date && d.date <= a.end_date && LEAVE_CODE_TO_TYPE[d.status_code] === 'leave'
    );
    if (overlap) push(a.id, { assignmentId: a.id, severity: 'hard', reason: `Crew on leave ${overlap.date}` });
  }

  return out;
}

export interface ConflictItem {
  key: string;
  kind: 'overlap' | 'leave';
  severity: 'hard' | 'soft';
  primaryId: string;
  otherId: string | null;
  crewId: string | null;
  /** Set when the block only carries an imported crew name, not an account. */
  crewLabel?: string | null;
  reason: string;
  overlapStart: string;
  overlapEnd: string;
}

const maxISO = (a: string, b: string) => (a > b ? a : b);
const minISO = (a: string, b: string) => (a < b ? a : b);

/**
 * Flat, de-duplicated list of conflicts used by the resolution panel.
 * Overlaps are reported once per pair, ordered so `primaryId` is the block
 * that starts later (the one a planner would normally move).
 */
export function buildConflictItems(
  assignments: RotationAssignment[],
  leave: LeaveOverlayEntry[]
): ConflictItem[] {
  const items: ConflictItem[] = [];
  const byId = new Map(assignments.map((a) => [a.id, a]));

  const byCrew: Record<string, RotationAssignment[]> = {};
  for (const a of assignments) {
    const key = crewKeyOf(a);
    if (!key) continue;
    (byCrew[key] ||= []).push(a);
  }

  for (const [crewKey, list] of Object.entries(byCrew)) {
    const sorted = [...list].sort((x, y) => x.start_date.localeCompare(y.start_date));
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const a = sorted[i], b = sorted[j];
        if (a.rotation_type === 'leave' || b.rotation_type === 'leave') continue;
        if (!rangesOverlap(a.start_date, a.end_date, b.start_date, b.end_date)) continue;
        items.push({
          key: `overlap:${a.id}:${b.id}`,
          kind: 'overlap',
          severity: 'hard',
          primaryId: b.id,
          otherId: a.id,
          crewId: crewKey.startsWith('name:') ? null : crewKey,
          crewLabel: crewKey.startsWith('name:')
            ? (b.crew_name_raw ?? a.crew_name_raw ?? 'Unnamed crew')
            : null,
          reason: 'Double-booked: two assignments cover the same days',
          overlapStart: maxISO(a.start_date, b.start_date),
          overlapEnd: minISO(a.end_date, b.end_date),
        });
      }
    }
  }

  const leaveByCrew: Record<string, LeaveOverlayEntry[]> = {};
  for (const l of leave) (leaveByCrew[l.crew_id] ||= []).push(l);
  for (const a of assignments) {
    if (!a.crew_user_id || a.rotation_type !== 'onboard') continue;
    const days = (leaveByCrew[a.crew_user_id] ?? [])
      .filter((d) => d.date >= a.start_date && d.date <= a.end_date && LEAVE_CODE_TO_TYPE[d.status_code] === 'leave')
      .map((d) => d.date)
      .sort();
    if (!days.length) continue;
    items.push({
      key: `leave:${a.id}`,
      kind: 'leave',
      severity: 'hard',
      primaryId: a.id,
      otherId: null,
      crewId: a.crew_user_id,
      crewLabel: null,
      reason: days.length === 1
        ? `Crew is on approved leave on ${days[0]}`
        : `Crew is on approved leave for ${days.length} days in this block`,
      overlapStart: days[0],
      overlapEnd: days[days.length - 1],
    });
  }

  return items.filter((i) => byId.has(i.primaryId));
}
// ---------------------------------------------------------------- manning gaps (gap/04 C47, W7; X1-09)

/**
 * A manning gap on the timeline: a run of days a position spends below its
 * minimum of qualified crew aboard (the critical band of
 * vessel_manning_by_day). It names no block, so it is its own kind beside
 * the block conflicts: ConflictPanel resolves block conflicts, the
 * timeline lists manning gaps in its Manning gaps rows.
 */
export interface ManningGapItem {
  key: string;
  kind: 'manning_gap';
  severity: 'hard';
  positionId: string | null;
  positionName: string | null;
  departmentKey: string | null;
  reason: string;
  start: string;
  end: string;
  days: number;
  min: number;
  shortBy: number;
}

/** Every item the timeline lists: block conflicts and manning gaps. */
export type PlannerConflictItem = ConflictItem | ManningGapItem;

export const isManningGapItem = (item: PlannerConflictItem): item is ManningGapItem => item.kind === 'manning_gap';

/**
 * The manning gaps of a window: one item per critical span of a position
 * (bandSpans), optionally limited to spans that touch [from, to], in the
 * order of bandSpans (start, then rank order). A span of a position that
 * maps to no catalogue position keeps a null id and reads "Unmatched
 * titles".
 */
export function buildManningGapItems(rows: readonly ManningDayRow[], window?: { from: string; to: string }): ManningGapItem[] {
  return bandSpans(rows, 'critical')
    .filter((s) => !window || (s.end >= window.from && s.start <= window.to))
    .map((s) => ({
      key: `manning:${s.positionId ?? 'unmatched'}:${s.start}`,
      kind: 'manning_gap' as const,
      severity: 'hard' as const,
      positionId: s.positionId,
      positionName: s.positionName,
      departmentKey: s.departmentKey,
      reason: manningGapLabel(s),
      start: s.start,
      end: s.end,
      days: s.days,
      min: s.min,
      shortBy: s.worstShortBy,
    }));
}

/** Block conflicts and manning gaps together: block conflicts first (they name a block to fix), then gaps by start. */
export function buildPlannerConflictItems(
  assignments: RotationAssignment[],
  leave: LeaveOverlayEntry[],
  manningRows: readonly ManningDayRow[],
  window?: { from: string; to: string },
): PlannerConflictItem[] {
  return [...buildConflictItems(assignments, leave), ...buildManningGapItems(manningRows, window)];
}
