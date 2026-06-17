import type { RotationAssignment, LeaveOverlayEntry, ConflictInfo } from '../types';
import { LEAVE_CODE_TO_TYPE } from '../constants';

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
    if (!a.crew_user_id) continue;
    (byCrew[a.crew_user_id] ||= []).push(a);
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