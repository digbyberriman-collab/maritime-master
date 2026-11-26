export interface LeaveStatusCode {
  code: string;
  label: string;
  category: 'accrued' | 'deducted' | 'neutral';
  color: string;
  bgColor: string;
}

export const LEAVE_STATUS_CODES: LeaveStatusCode[] = [
  { code: 'F', label: 'On Board (Time for Time Accrued)', category: 'accrued', color: '#2563eb', bgColor: '#dbeafe' },
  { code: 'Q', label: 'PBQ Leave Accrued', category: 'accrued', color: '#7c3aed', bgColor: '#ede9fe' },
  { code: 'L', label: 'Leave Used', category: 'deducted', color: '#dc2626', bgColor: '#fee2e2' },
  { code: 'T', label: 'Travel Day', category: 'neutral', color: '#f59e0b', bgColor: '#fef3c7' },
  { code: 'CD', label: 'Crew Development', category: 'neutral', color: '#0891b2', bgColor: '#cffafe' },
  { code: 'M', label: 'Medical Leave Paid', category: 'neutral', color: '#ec4899', bgColor: '#fce7f3' },
  { code: 'PPL', label: 'Paid Parental Leave', category: 'neutral', color: '#8b5cf6', bgColor: '#f3e8ff' },
  { code: 'CL', label: 'Compassionate Leave', category: 'neutral', color: '#6366f1', bgColor: '#e0e7ff' },
  { code: 'N', label: 'Neutral Leave', category: 'neutral', color: '#64748b', bgColor: '#f1f5f9' },
  { code: 'U', label: 'Unpaid Leave', category: 'neutral', color: '#334155', bgColor: '#e2e8f0' },
  { code: 'R', label: 'Rotational / Contract', category: 'neutral', color: '#059669', bgColor: '#d1fae5' },
];

export const STATUS_CODE_MAP = Object.fromEntries(
  LEAVE_STATUS_CODES.map(s => [s.code, s])
);

export const LEAVE_DEPARTMENTS = [
  'All',
  'Bridge',
  'Deck',
  'Engineering',
  'Interior',
  'Galley',
  'Medics',
  'Dive',
  'Media',
  'Fleet Chefs',
] as const;

export type LeaveDepartment = typeof LEAVE_DEPARTMENTS[number];

export interface CrewLeaveEntry {
  id: string;
  crew_id: string;
  date: string;
  status_code: string;
  company_id: string;
  vessel_id: string | null;
}

export interface CrewLeaveCarryover {
  id: string;
  crew_id: string;
  year: number;
  carryover_days: number;
  company_id: string;
}

export interface CrewLeaveLockedMonth {
  id: string;
  year: number;
  month: number;
  company_id: string;
  vessel_id: string | null;
  locked_at: string;
  locked_by: string | null;
}

export interface CrewLeaveRequest {
  id: string;
  crew_id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  notes: string | null;
  status: 'pending' | 'approved' | 'declined';
  company_id: string;
  vessel_id: string | null;
  submitted_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
}

export interface CrewMemberLeave {
  userId: string;
  firstName: string;
  lastName: string;
  position: string;
  department: string;
  entries: Record<string, string>; // date -> status_code
  carryover: number;
  counts: Record<string, number>;
  balance: number;
}
