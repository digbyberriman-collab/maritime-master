/**
 * The "Alert windows" form (gap/02 X2, R3, R4; DECISIONS C5, D-X5-02; X5
 * spec X5-03B): how many days ahead an item type warns before it expires.
 * React Hook Form + zod with the shared form helpers, checked before any
 * request with the server's own rule (`expiry_window_rules_warn_days_check`
 * allows 0..1095; a window of 0 days would never warn ahead, so the form
 * asks for 1 to 1095, three years).
 *
 * The field holds the text of the input; the schema reads it as a whole
 * number. `toWarnDays` returns the parsed days after the resolver passed
 * (RHF hands `onSubmit` the field values as typed).
 */
import { z } from 'zod';
import { positiveInt } from '@/shared/lib/form';
import type { ExpiryItemType, SetExpiryWindowRuleInput } from '@/modules/fleet';

/**
 * The longest window (three years): the CHECK's ceiling, the same as the
 * fleet module's MAX_WARN_DAYS (src/test/reports/expiryWindowsDrawer.test.tsx
 * pins the two together).
 */
export const EXPIRY_WINDOW_MAX_DAYS = 1095;

export const WARN_DAYS_REQUIRED = 'Enter the number of days';

export const expiryWindowSchema = z.object({
  warnDays: positiveInt(WARN_DAYS_REQUIRED, EXPIRY_WINDOW_MAX_DAYS),
});

/** What the form holds: the input's text. */
export interface ExpiryWindowFormValues {
  warnDays: string;
}

/** The form's starting values for a window of `days`. */
export function expiryWindowFormDefaults(days: number): ExpiryWindowFormValues {
  return { warnDays: String(days) };
}

/** The whole number of days in the form, or null when the form does not hold a valid window. */
export function toWarnDays(values: ExpiryWindowFormValues): number | null {
  const parsed = expiryWindowSchema.safeParse(values);
  return parsed.success ? parsed.data.warnDays : null;
}

/** The definer's input for an item type's own window (not a type-specific one). */
export function toSetWindowInput(itemType: ExpiryItemType, warnDays: number): SetExpiryWindowRuleInput {
  return { itemType, certificateTypeId: null, warnDays };
}
