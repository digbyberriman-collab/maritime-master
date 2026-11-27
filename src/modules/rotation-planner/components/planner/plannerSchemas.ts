/**
 * The planner's forms (X1-09B; gap/04 C50, C47, C4; W7): Add leave (one
 * person, one to ten periods, each a type and a start with an end or "End
 * unknown", and a note), one period on the timeline (type, dates, notes,
 * replace rotation leave) and the On/Off toggle. React Hook Form + zod;
 * date-only strings in the crew's local calendar; the rules are the
 * server's (planner_periods_parse, mirrored in lib/periods
 * validatePeriodsInput), so a form the schema accepts is not refused for
 * its shape.
 */
import { z } from 'zod';
import { compareDates, daysBetween, isDateOnly } from '../../lib/duration';
import { MAX_PERIODS_PER_REQUEST, PERIOD_RANGE_DAYS, periodsOverlap, PLANNER_REFUSAL_TEXT } from '../../lib/periods';

export const NOTE_MAX = 2000;

const dateField = z
  .string({ required_error: 'Choose a date.', invalid_type_error: 'Choose a date.' })
  .trim()
  .refine((v) => v === '' || isDateOnly(v), { message: 'Enter a valid date.' });

/** One period of Add leave or of a request. `end` is '' while End unknown is ticked. */
export const periodFormSchema = z.object({
  leaveTypeKey: z.string().trim().min(1, PLANNER_REFUSAL_TEXT.leave_type_unknown),
  start: dateField,
  end: dateField,
  endUnknown: z.boolean(),
});
export type PeriodFormValues = z.infer<typeof periodFormSchema>;

/** Checks one period's dates against today (the server's range rule), adding issues at `path`. */
function checkPeriod(p: PeriodFormValues, today: string, ctx: z.RefinementCtx, path: Array<string | number>): boolean {
  let ok = true;
  if (!p.start) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Choose the first day.', path: [...path, 'start'] });
    ok = false;
  }
  if (!p.endUnknown && !p.end) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Choose the last day, or tick End unknown.', path: [...path, 'end'] });
    ok = false;
  }
  if (!ok) return false;
  if (!p.endUnknown && compareDates(p.end, p.start) < 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: PLANNER_REFUSAL_TEXT.period_dates_invalid, path: [...path, 'end'] });
    return false;
  }
  const fromToday = daysBetween(today, p.start);
  if (fromToday < -PERIOD_RANGE_DAYS || fromToday > PERIOD_RANGE_DAYS) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: PLANNER_REFUSAL_TEXT.period_out_of_range, path: [...path, 'start'] });
    return false;
  }
  if (!p.endUnknown && daysBetween(today, p.end) > PERIOD_RANGE_DAYS) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: PLANNER_REFUSAL_TEXT.period_out_of_range, path: [...path, 'end'] });
    return false;
  }
  return true;
}

/** Add leave: the person, the periods (none overlapping), a note and whether rotation leave is replaced. */
export function addLeaveSchema(today: string) {
  return z
    .object({
      profileId: z.string().trim().min(1, 'Choose a crew member.'),
      periods: z.array(periodFormSchema).min(1, PLANNER_REFUSAL_TEXT.periods_required).max(MAX_PERIODS_PER_REQUEST, PLANNER_REFUSAL_TEXT.periods_too_many),
      note: z.string().trim().max(NOTE_MAX, PLANNER_REFUSAL_TEXT.notes_too_long),
      replace: z.boolean(),
    })
    .superRefine((v, ctx) => {
      const seen: Array<{ start: string; end: string | null }> = [];
      v.periods.forEach((p, i) => {
        if (!checkPeriod(p, today, ctx, ['periods', i])) return;
        const range = { start: p.start, end: p.endUnknown ? null : p.end };
        if (seen.some((s) => periodsOverlap(s, range))) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: PLANNER_REFUSAL_TEXT.periods_overlap, path: ['periods', i, 'start'] });
        }
        seen.push(range);
      });
    });
}
export type AddLeaveValues = z.infer<ReturnType<typeof addLeaveSchema>>;

export const emptyPeriod = (today: string, leaveTypeKey = 'holiday'): PeriodFormValues => ({ leaveTypeKey, start: today, end: '', endUnknown: false });

export const addLeaveDefaults = (today: string, profileId = ''): AddLeaveValues => ({
  profileId,
  periods: [emptyPeriod(today)],
  note: '',
  replace: false,
});

/** The periods payload (PeriodInput) of valid form values. */
export function periodInputs(periods: readonly PeriodFormValues[]): Array<{ leaveTypeKey: string; start: string; end: string | null; endUnknown: boolean }> {
  return periods.map((p) => ({ leaveTypeKey: p.leaveTypeKey, start: p.start, end: p.endUnknown ? null : p.end, endUnknown: p.endUnknown }));
}

/** One period on the timeline (new or edited). */
export function periodEditSchema(today: string) {
  return periodFormSchema
    .extend({
      notes: z.string().trim().max(NOTE_MAX, PLANNER_REFUSAL_TEXT.notes_too_long),
      replace: z.boolean(),
    })
    .superRefine((v, ctx) => {
      checkPeriod(v, today, ctx, []);
    });
}
export type PeriodEditValues = z.infer<ReturnType<typeof periodEditSchema>>;

/** The On/Off toggle: Off writes time off (a type, the first day, the last day or End unknown); On ends the time off. */
export function toggleSchema(today: string) {
  return z
    .object({
      direction: z.enum(['off', 'on']),
      leaveTypeKey: z.string().trim(),
      start: dateField,
      end: dateField,
      endUnknown: z.boolean(),
    })
    .superRefine((v, ctx) => {
      if (!v.start) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Choose the day.', path: ['start'] });
        return;
      }
      if (Math.abs(daysBetween(today, v.start)) > 31) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: PLANNER_REFUSAL_TEXT.date_out_of_range, path: ['start'] });
        return;
      }
      if (v.direction === 'on') return;
      if (!v.leaveTypeKey) ctx.addIssue({ code: z.ZodIssueCode.custom, message: PLANNER_REFUSAL_TEXT.leave_type_invalid, path: ['leaveTypeKey'] });
      if (!v.endUnknown && !v.end) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Choose the last day off, or tick End unknown.', path: ['end'] });
      } else if (!v.endUnknown && compareDates(v.end, v.start) < 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: PLANNER_REFUSAL_TEXT.period_dates_invalid, path: ['end'] });
      }
    });
}
export type ToggleValues = z.infer<ReturnType<typeof toggleSchema>>;
