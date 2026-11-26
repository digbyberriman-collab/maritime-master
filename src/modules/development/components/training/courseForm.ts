/**
 * The starting values of the course editor (gap/02 TR7; X5-07B): the
 * course's live columns and its 040600 rules, or a blank course. Pure.
 */
import type { DevCategory, DevFormat } from '../../constants';
import type { CourseValues } from '../../lib/courseSchema';
import type { CatalogueCourse } from './useFleetTrainingData';

/** The form's starting values: the course's, or a blank course. */
export function courseFormDefaults(course: CatalogueCourse | null): CourseValues {
  const rules = course?.rules ?? null;
  return {
    name: course?.name ?? '',
    department: course?.department ?? 'All',
    category: (course?.category as DevCategory | undefined) ?? 'professional',
    format: (course?.format as DevFormat | null | undefined) ?? null,
    sub_section: course?.sub_section ?? '',
    duration_description: course?.duration_description ?? '',
    notes: course?.notes ?? '',
    pathway: rules?.pathway ?? '',
    valid_for_months: rules?.valid_for_months ?? null,
    renew_from_months: rules?.renew_from_months ?? null,
    is_mandatory: rules?.is_mandatory ?? false,
    applies_to_departments: rules?.applies_to_departments ?? [],
    applies_to_positions: rules?.applies_to_positions ?? [],
    renewal_note: rules?.renewal_note ?? '',
    qualification_label: rules?.qualification_label ?? '',
  };
}
