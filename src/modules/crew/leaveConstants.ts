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
  LEAVE_STATUS_CODES.map((s) => [s.code, s])
);

/**
 * Departments shown in the planner department filter.
 * The "All" option is rendered specially by the UI; dynamic departments
 * discovered from real crew profiles are merged into this list at runtime.
 */
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

export type LeaveDepartment = (typeof LEAVE_DEPARTMENTS)[number] | string;

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

export type LeaveRequestStatus =
  | 'draft'
  | 'requested'
  | 'pending'
  | 'hod_reviewed'
  | 'approved'
  | 'rejected'
  | 'declined'
  | 'cancelled'
  | 'completed';

export interface CrewLeaveRequest {
  id: string;
  crew_id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  notes: string | null;
  status: LeaveRequestStatus;
  company_id: string;
  vessel_id: string | null;
  submitted_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  hod_reviewed_at?: string | null;
  hod_reviewed_by?: string | null;
  hod_review_notes?: string | null;
  approved_by?: string | null;
  approved_at?: string | null;
  cancelled_at?: string | null;
  cancelled_by?: string | null;
  cancel_reason?: string | null;
  rejection_reason?: string | null;
}

/**
 * Leave row for the planner / calendar — backed entirely by real Supabase
 * data (crew_assignments + profiles + crew_leave_entries + carryover +
 * leave_policies). No more seed data.
 */
export interface CrewMemberLeave {
  userId: string;
  firstName: string;
  lastName: string;
  position: string;
  department: string;
  rank: string;
  rotation: string | null;
  joiningDate: string | null;
  leavingDate: string | null;
  vesselId: string | null;
  vesselName: string | null;
  hodUserId: string | null;
  entries: Record<string, string>; // date -> status_code (current month)
  carryover: number;
  counts: Record<string, number>; // status counts for the year
  balance: number;            // legacy alias for `remaining`

  // Calculator outputs
  entitlement: number;
  accrued: number;
  taken: number;
  booked: number;
  available: number;
  remaining: number;
  monthly_accrual: number;
  next_leave_start?: string;
  next_leave_end?: string;
  notes: string[];
}
