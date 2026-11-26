// Crew Development (training) — constants and types.
//
// The application statuses come from the state machine
// (lib/applicationMachine.ts, D-X5-25); the policy numbers and category
// names come from the company's program_settings row (lib/settingsSchema.ts
// holds the column defaults used before a row exists; TR10, D-X5-19), never
// from this file.

import { APPLICATION_STATUSES, type ApplicationStatus } from './lib/applicationMachine';
import { DEFAULT_CATEGORY_LABELS } from './lib/settingsSchema';

export { APPLICATION_STATUSES };
export type { ApplicationStatus };

export type DevCategory = 'fleet_organised' | 'mandatory' | 'professional' | 'extracurricular';
export type DevFormat = 'in_person' | 'online' | 'onboard' | 'blended' | 'online_in_person';
export type ExpenseStatus = 'draft' | 'submitted' | 'under_review' | 'approved' | 'paid' | 'partially_paid' | 'rejected';

/**
 * Category colours and the default words (DEFAULT_CATEGORY_LABELS). An
 * account renames the categories in program_settings.category_labels:
 * read the words with useCategoryLabels() (hooks/useProgramSettings.ts)
 * wherever a page shows them.
 */
export const CATEGORY_CONFIG: Record<DevCategory, { label: string; color: string; bgClass: string; textClass: string }> = {
  fleet_organised: { label: DEFAULT_CATEGORY_LABELS.fleet_organised, color: 'hsl(var(--cyan))', bgClass: 'bg-cyan/10', textClass: 'text-cyan' },
  mandatory: { label: DEFAULT_CATEGORY_LABELS.mandatory, color: 'hsl(var(--amber))', bgClass: 'bg-amber/10', textClass: 'text-amber' },
  professional: { label: DEFAULT_CATEGORY_LABELS.professional, color: 'hsl(var(--info))', bgClass: 'bg-info/10', textClass: 'text-info' },
  extracurricular: { label: DEFAULT_CATEGORY_LABELS.extracurricular, color: 'hsl(var(--purple))', bgClass: 'bg-purple/10', textClass: 'text-purple' },
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

/**
 * Every status of the machine with its label (the statusTone registry's
 * training_application words) and its place on the approval stepper
 * (0 = draft, -1 = off the stepper: returned or finished without
 * completion).
 */
export const APPLICATION_STATUS_CONFIG: Record<ApplicationStatus, { label: string; step: number; color: string }> = {
  draft: { label: 'Draft', step: 0, color: 'text-muted-foreground' },
  submitted: { label: 'Submitted', step: 1, color: 'text-info' },
  hod_review: { label: 'HoD review', step: 2, color: 'text-amber' },
  captain_purser_review: { label: 'Captain & purser review', step: 3, color: 'text-amber' },
  purser_review: { label: 'Purser review', step: 3, color: 'text-amber' },
  captain_review: { label: 'Captain review', step: 3, color: 'text-amber' },
  approved: { label: 'Approved', step: 4, color: 'text-success' },
  discretionary_approved: { label: 'Approved (discretionary)', step: 4, color: 'text-success' },
  enrolled: { label: 'Enrolled', step: 5, color: 'text-success' },
  completed: { label: 'Completed', step: 6, color: 'text-success' },
  reimbursed: { label: 'Reimbursed', step: 7, color: 'text-success' },
  closed: { label: 'Closed', step: 7, color: 'text-muted-foreground' },
  returned: { label: 'Returned for changes', step: -1, color: 'text-destructive' },
  rejected: { label: 'Rejected', step: -1, color: 'text-destructive' },
  cancelled: { label: 'Cancelled', step: -1, color: 'text-muted-foreground' },
  voided: { label: 'Voided', step: -1, color: 'text-muted-foreground' },
};

export const APPROVAL_STEPS = [
  'Submitted',
  'HoD review',
  'Captain & Purser',
  'Approved',
  'Enrolled',
  'Completed',
];

/** The label of a stored status (an unknown value is shown as stored, never guessed). */
export function applicationStatusLabel(status: string): string {
  return (APPLICATION_STATUS_CONFIG as Record<string, { label: string }>)[status]?.label ?? status;
}

// ISO currency codes commonly used for crew course expenses
export const APPLICATION_CURRENCIES = [
  { code: 'USD', label: 'US Dollar' },
  { code: 'EUR', label: 'Euro' },
  { code: 'GBP', label: 'Pound Sterling' },
  { code: 'AUD', label: 'Australian Dollar' },
  { code: 'NZD', label: 'New Zealand Dollar' },
  { code: 'CAD', label: 'Canadian Dollar' },
  { code: 'CHF', label: 'Swiss Franc' },
] as const;
