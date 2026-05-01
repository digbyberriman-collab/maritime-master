// CSV export helpers for the Leave Planner / Calendar.

import type { CrewMemberLeave } from '@/modules/crew/leaveConstants';

function csvEscape(v: unknown): string {
  const s = String(v ?? '');
  return /[,"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function exportLeavePlannerCSV(rows: CrewMemberLeave[]): string {
  const header = [
    'Last Name',
    'First Name',
    'Vessel',
    'Department',
    'Rank',
    'Rotation',
    'Joining Date',
    'Annual Entitlement',
    'Carryover',
    'Accrued',
    'Taken',
    'Booked',
    'Available',
    'Remaining',
    'Next Leave Start',
    'Next Leave End',
    'Notes',
  ];
  const out = [header];
  for (const r of rows) {
    out.push([
      r.lastName,
      r.firstName,
      r.vesselName ?? '',
      r.department ?? '',
      r.rank ?? r.position ?? '',
      r.rotation ?? '',
      r.joiningDate ?? '',
      r.entitlement.toFixed(2),
      r.carryover.toFixed(2),
      r.accrued.toFixed(2),
      r.taken.toFixed(2),
      r.booked.toFixed(2),
      r.available.toFixed(2),
      r.remaining.toFixed(2),
      r.next_leave_start ?? '',
      r.next_leave_end ?? '',
      (r.notes || []).join(' | '),
    ]);
  }
  return out.map((row) => row.map(csvEscape).join(',')).join('\n');
}

export function downloadCSV(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
