export interface Capability {
  key: string;
  label: string;
  sensitive?: boolean;
  indent?: boolean;
}

export const VIEW_CAPABILITIES: Capability[] = [
  { key: 'crew.see_crew_list', label: 'Can see crew list' },
  { key: 'crew.view_crew_profiles', label: 'Can view crew profiles' },
  { key: 'crew.edit_crew_profiles', label: 'Can edit crew profiles', indent: true },
  { key: 'crew.view_scheduling', label: 'Can view scheduling dashboard' },
  { key: 'crew.access_leave_records', label: 'Can access leave records' },
  { key: 'crew.view_medical', label: 'Can view medical information', sensitive: true },
  { key: 'crew.edit_medical', label: 'Can edit medical information', sensitive: true, indent: true },
  { key: 'crew.access_employment_records', label: 'Can access employment records', sensitive: true },
  { key: 'crew.view_appraisals', label: 'Can view appraisals' },
];

export const APPROVAL_CAPABILITIES: Capability[] = [
  { key: 'crew.conduct_appraisals', label: 'Can conduct appraisals' },
  { key: 'crew.approve_leave', label: 'Can approve leave requests' },
  { key: 'crew.approve_hours_of_rest', label: 'Can approve hours of rest submissions' },
  { key: 'crew.approve_payroll', label: 'Can approve payroll runs' },
  { key: 'crew.approve_expenses', label: 'Can approve expenses' },
  { key: 'crew.mark_expenses_paid', label: 'Can mark expenses paid' },
  { key: 'crew.approve_invoices', label: 'Can approve invoices' },
  { key: 'crew.record_invoice_payments', label: 'Can record invoice payments' },
];

export const DEPARTMENTS = ['Deck', 'Engineering', 'Interior', 'Galley', 'Medical', 'Administration'];