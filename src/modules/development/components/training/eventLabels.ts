/**
 * The words of an application's history (gap/02 TR5; X5-07B): each
 * recorded action, each part a person acts in, and each field an approver
 * may correct (`development_transition` edit_fields). Pure.
 */
import type { ApplicationActor } from '../../lib/applicationMachine';
import type { DevelopmentApplicationEventAction } from '../../types/db.pending';

export const EVENT_ACTION_LABELS: Readonly<Record<DevelopmentApplicationEventAction, string>> = {
  created: 'Created',
  submit: 'Submitted for approval',
  hod_approve: 'Approved by the head of department',
  hod_return: 'Returned for changes',
  final_approve: 'Approved',
  final_approve_discretionary: 'Approved as discretionary',
  return: 'Returned for changes',
  reject: 'Rejected',
  cancel: 'Cancelled',
  enrol: 'Marked as enrolled',
  complete: 'Completion recorded',
  reimburse: 'Marked as reimbursed',
  close: 'Closed',
  void: 'Voided',
  edit_fields: 'Details corrected',
  course_promoted: 'Course added to the catalogue',
};

export const ACTOR_LABELS: Readonly<Record<ApplicationActor, string>> = {
  applicant: 'Applicant',
  hod: 'Head of department',
  captain: 'Captain',
  purser: 'Purser',
  training_editor: 'Training editor',
  training_admin: 'Training admin',
};

/** The words for the fields an approver may correct (development_transition edit_fields). */
export const FIELD_LABELS: Readonly<Record<string, string>> = {
  course_name: 'Course',
  course_provider: 'Provider',
  course_description: 'Description',
  course_url: 'Course link',
  course_location: 'Location',
  course_start_date: 'Start',
  course_end_date: 'End',
  course_duration_days: 'Duration (days)',
  course_duration_hours: 'Duration (hours)',
  category: 'Category',
  estimated_tuition_usd: 'Tuition (USD)',
  estimated_travel_usd: 'Travel (USD)',
  estimated_travel_route: 'Travel route',
  estimated_accommodation_usd: 'Accommodation (USD)',
  estimated_accommodation_nights: 'Nights',
  estimated_accommodation_nightly_rate: 'Nightly rate (USD)',
  estimated_food_per_diem_usd: 'Food per diem (USD)',
  leave_days_accrued: 'Leave days',
  neutral_days_accrued: 'Neutral days',
  application_currency: 'Currency',
  exchange_rate_to_usd: 'Rate to USD',
  tuition_local_amount: 'Tuition (local)',
  travel_local_amount: 'Travel (local)',
  accommodation_local_amount: 'Accommodation (local)',
};

/** A diff value as text: a dash for nothing, numbers in en-GB, everything else as stored. */
export function diffValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '–';
  if (typeof value === 'number') return value.toLocaleString('en-GB');
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}
