/**
 * Expiry windows (gap/02 X2; DECISIONS C5; D-X5-02): the item types, their
 * labels and the window an item gets.
 *
 * The window of an item is, in order: the company's rule for its
 * `certificate_type_id` under its item type, the company's rule for the
 * item type, else the default (passports 270 days, everything else 90).
 * This mirrors SQL `expiry_default_window()` and `expiry_window_for()`
 * (`20261124040000_fleet_expiry_engine.sql`) and uses the one TS resolver,
 * `resolveExpiryWindow` from `@/lib/records/expiry`, on the rules of the
 * item's own type.
 *
 * The item-type list is frozen at the X5-01A merge: X1's crew document
 * types use a subset of it, and `expiry_window_rules` checks it.
 */
import { DEFAULT_EXPIRY_WINDOW_DAYS, resolveExpiryWindow, type ExpiryWindowRule } from '@/lib/records/expiry';

/** Every item type a window rule (and an expiry source) may name. Order = display order. */
export const EXPIRY_ITEM_TYPES = [
  'vessel_certificate',
  'insurance_policy',
  'passport',
  'visa',
  'crew_document',
  'crew_qualification',
  'medical',
  'vaccination',
  'work_authorisation',
  'contract',
  'training_course',
] as const;

export type ExpiryItemType = (typeof EXPIRY_ITEM_TYPES)[number];

/** UI labels (sentence case). */
export const EXPIRY_ITEM_TYPE_LABELS: Readonly<Record<ExpiryItemType, string>> = {
  vessel_certificate: 'Vessel certificates',
  insurance_policy: 'Insurance policies',
  passport: 'Passports',
  visa: 'Visas',
  crew_document: 'Crew documents',
  crew_qualification: 'Crew qualifications',
  medical: 'Medical certificates',
  vaccination: 'Vaccinations',
  work_authorisation: 'Work authorisations',
  contract: 'Contracts',
  training_course: 'Training courses',
};

/** The passport default (nine months, gap/02 W9). */
export const PASSPORT_WINDOW_DAYS = 270;
/** The longest window a rule may hold (three years; `expiry_window_rules_warn_days_check`). */
export const MAX_WARN_DAYS = 1095;

export function isExpiryItemType(value: unknown): value is ExpiryItemType {
  return typeof value === 'string' && (EXPIRY_ITEM_TYPES as readonly string[]).includes(value);
}

/** The window when no rule matches: passports 270 days, every other item type 90 (SQL `expiry_default_window`). */
export function expiryDefaultWindow(itemType: string | null | undefined): number {
  return itemType === 'passport' ? PASSPORT_WINDOW_DAYS : DEFAULT_EXPIRY_WINDOW_DAYS;
}

/** A whole number of days a rule may hold (0..1095). */
export function isValidWarnDays(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MAX_WARN_DAYS;
}

/** The columns of an `expiry_window_rules` row this module reads. */
export interface ExpiryWindowRuleColumns {
  item_type: string;
  certificate_type_id: string | null;
  warn_days: number;
}

/** Rows of `expiry_window_rules` as the TS engine's rule shape. */
export function toExpiryWindowRules(rows: readonly ExpiryWindowRuleColumns[]): ExpiryWindowRule[] {
  return rows.map((r) => ({ itemType: r.item_type, certificateTypeId: r.certificate_type_id, warnDays: r.warn_days }));
}

/**
 * The window for an item (SQL `expiry_window_for`): a rule for its
 * certificate type under its item type wins over the item type's rule;
 * otherwise the item type's default. An item without an item type matches
 * no rule and gets the general default (90).
 */
export function expiryWindowFor(
  rules: readonly ExpiryWindowRule[],
  item: { itemType: string | null | undefined; certificateTypeId?: string | null },
): number {
  const itemType = item.itemType ?? null;
  const own = itemType === null ? [] : rules.filter((r) => r.itemType === itemType);
  return resolveExpiryWindow(own, { itemType, certificateTypeId: item.certificateTypeId ?? null }, expiryDefaultWindow(itemType));
}

/**
 * The sentence for a refusal of `set_expiry_window_rule` /
 * `clear_expiry_window_rule` (its stable snake_case message), or null for
 * an error the caller should treat as unexpected.
 */
export function expiryWindowRefusal(message: string | null | undefined): string | null {
  switch (message) {
    case 'not_permitted':
      return 'You do not have permission to change expiry windows.';
    case 'invalid_item_type':
      return 'That item type has no expiry window.';
    case 'invalid_warn_days':
      return `Enter a whole number of days from 0 to ${MAX_WARN_DAYS}.`;
    case 'rule_required':
    case 'rule_not_found':
      return 'That window rule no longer exists. Refresh to see the current windows.';
    default:
      return null;
  }
}
