import { z } from 'zod';
import type { PerformanceReviewRow } from '@/modules/hris/lib/reviews';
import { REVIEW_TYPE_VALUES, type ReviewType } from '@/modules/hris/lib/reviews';

/** Schema and helpers for the review metadata form (kept out of the component file for fast refresh). */
export const reviewFormSchema = z
  .object({
    profile_id: z.string().min(1, 'Choose the crew member being reviewed'),
    reviewer_profile_id: z.string(),
    review_type: z.enum(REVIEW_TYPE_VALUES as [ReviewType, ...ReviewType[]]),
    cycle_id: z.string(),
    vessel_id: z.string(),
    period_start: z.string(),
    period_end: z.string(),
    due_date: z.string(),
  })
  .refine((v) => !v.period_start || !v.period_end || v.period_end >= v.period_start, {
    message: 'Period end must be on or after the start',
    path: ['period_end'],
  })
  .refine((v) => v.profile_id !== v.reviewer_profile_id, { message: 'The reviewer cannot review themselves', path: ['reviewer_profile_id'] });

export type ReviewFormValues = z.infer<typeof reviewFormSchema>;

const toReviewType = (value: string): ReviewType => (REVIEW_TYPE_VALUES.includes(value as ReviewType) ? (value as ReviewType) : 'annual_evaluation');

export const emptyReviewForm = (defaults: Partial<ReviewFormValues> = {}): ReviewFormValues => ({
  profile_id: '',
  reviewer_profile_id: '',
  review_type: 'annual_evaluation',
  cycle_id: '',
  vessel_id: '',
  period_start: '',
  period_end: '',
  due_date: '',
  ...defaults,
});

export const reviewToFormValues = (review: PerformanceReviewRow): ReviewFormValues => ({
  profile_id: review.profile_id,
  reviewer_profile_id: review.reviewer_profile_id ?? '',
  review_type: toReviewType(review.review_type),
  cycle_id: review.cycle_id ?? '',
  vessel_id: review.vessel_id ?? '',
  period_start: review.period_start ?? '',
  period_end: review.period_end ?? '',
  due_date: review.due_date ?? '',
});
