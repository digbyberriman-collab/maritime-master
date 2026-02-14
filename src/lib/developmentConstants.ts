// Crew Development Module - Constants & Types

export type DevCategory = 'fleet_organised' | 'mandatory' | 'professional' | 'extracurricular';
export type DevFormat = 'in_person' | 'online' | 'onboard' | 'blended' | 'online_in_person';
export type ApplicationStatus = 'draft' | 'submitted' | 'hod_review' | 'peer_review' | 'captain_review' | 'approved' | 'enrolled' | 'completed' | 'returned' | 'cancelled' | 'discretionary_approved';
export type ExpenseStatus = 'draft' | 'submitted' | 'under_review' | 'approved' | 'paid' | 'partially_paid' | 'rejected';

export const CATEGORY_CONFIG: Record<DevCategory, { label: string; color: string; bgClass: string; textClass: string }> = {
  fleet_organised: { label: 'Fleet Organised', color: 'hsl(var(--cyan))', bgClass: 'bg-cyan/10', textClass: 'text-cyan' },
  mandatory: { label: 'Mandatory', color: 'hsl(var(--amber))', bgClass: 'bg-amber/10', textClass: 'text-amber' },
  professional: { label: 'Professional', color: 'hsl(var(--info))', bgClass: 'bg-info/10', textClass: 'text-info' },
  extracurricular: { label: 'Extracurricular', color: 'hsl(var(--purple))', bgClass: 'bg-purple/10', textClass: 'text-purple' },
};

export const FORMAT_LABELS: Record<DevFormat, string> = {
  in_person: 'In-Person',
  online: 'Online',
  onboard: 'Onboard',
  blended: 'Blended',
  online_in_person: 'Online/In-Person',
};

export const DEPARTMENTS = [
  'All',
  'Deck',
  'Dive',
  'Engineering',
  'Galley',
  'Interior',
  'IT',
  'Medical',
  'Subsea',
] as const;

export const APPLICATION_STATUS_CONFIG: Record<ApplicationStatus, { label: string; step: number; color: string }> = {
  draft: { label: 'Draft', step: 0, color: 'text-muted-foreground' },
  submitted: { label: 'Submitted', step: 1, color: 'text-info' },
  hod_review: { label: 'HOD Review', step: 2, color: 'text-amber' },
  peer_review: { label: 'Peer Review', step: 3, color: 'text-amber' },
  captain_review: { label: 'Captain Review', step: 4, color: 'text-amber' },
  approved: { label: 'Approved', step: 5, color: 'text-success' },
  enrolled: { label: 'Enrolled', step: 6, color: 'text-success' },
  completed: { label: 'Completed', step: 7, color: 'text-success' },
  returned: { label: 'Returned', step: -1, color: 'text-destructive' },
  cancelled: { label: 'Cancelled', step: -1, color: 'text-muted-foreground' },
  discretionary_approved: { label: 'Approved (Discretionary)', step: 5, color: 'text-success' },
};

export const APPROVAL_STEPS = [
  'Submitted',
  'HOD Review',
  'Peer Review',
  'Captain Approval',
  'Approved',
  'Enrolled',
  'Completed',
];

// Policy constants
export const ACCOMMODATION_CAP_PER_NIGHT = 250;
export const FOOD_PER_DIEM_FLEET_ORGANISED = 50;
export const PROFESSIONAL_THRESHOLD = 4000;
export const CLAWBACK_MONTHS = 12;
export const ELIGIBILITY_MONTHS = 12;
