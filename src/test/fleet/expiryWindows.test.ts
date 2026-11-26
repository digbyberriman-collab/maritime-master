import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_EXPIRY_WINDOW_DAYS, expiryStatus } from '@/lib/records/expiry';
import {
  EXPIRY_ITEM_TYPES,
  EXPIRY_ITEM_TYPE_LABELS,
  MAX_WARN_DAYS,
  PASSPORT_WINDOW_DAYS,
  expiryDefaultWindow,
  expiryWindowFor,
  expiryWindowRefusal,
  isExpiryItemType,
  isValidWarnDays,
  toExpiryWindowRules,
} from '@/modules/fleet/lib/expiryWindows';

/** The SQL this module mirrors (gap/02 X2; D-X5-02). */
const SQL = readFileSync(join(process.cwd(), 'supabase/migrations/20261124040000_fleet_expiry_engine.sql'), 'utf8');

/** The quoted words of the first `IN (…)` list after `marker`. */
function sqlList(marker: string): string[] {
  const at = SQL.indexOf(marker);
  expect(at, `${marker} is in the migration`).toBeGreaterThanOrEqual(0);
  const list = SQL.slice(at).match(/IN \(([^)]*)\)/)?.[1] ?? '';
  return Array.from(list.matchAll(/'([a-z_]+)'/g), (m) => m[1]);
}

describe('item types (frozen at the X5-01A merge)', () => {
  it('are exactly the CHECK lists and the definers’ lists of the migration', () => {
    const want = [...EXPIRY_ITEM_TYPES].sort();
    expect(sqlList('expiry_window_rules_item_type_check CHECK').sort()).toEqual(want);
    expect(sqlList('expiry_sources_item_type_check CHECK').sort()).toEqual(want);
    const notIn = (marker: string) =>
      Array.from((SQL.slice(SQL.indexOf(marker)).match(/NOT IN \(([^)]*)\)/)?.[1] ?? '').matchAll(/'([a-z_]+)'/g), (m) => m[1]).sort();
    expect(notIn('CREATE OR REPLACE FUNCTION public.expiry_window_for')).toEqual(want);
    expect(notIn('CREATE OR REPLACE FUNCTION public.set_expiry_window_rule')).toEqual(want);
  });

  it('use medical, never medical_certificate (X1 agreement 1)', () => {
    expect(EXPIRY_ITEM_TYPES).toContain('medical');
    expect(EXPIRY_ITEM_TYPES).not.toContain('medical_certificate' as never);
    expect(EXPIRY_ITEM_TYPES).toHaveLength(11);
  });

  it('each has a label, written fresh', () => {
    for (const t of EXPIRY_ITEM_TYPES) expect(EXPIRY_ITEM_TYPE_LABELS[t].length).toBeGreaterThan(3);
    expect(new Set(Object.values(EXPIRY_ITEM_TYPE_LABELS)).size).toBe(EXPIRY_ITEM_TYPES.length);
  });

  it('isExpiryItemType narrows', () => {
    expect(isExpiryItemType('passport')).toBe(true);
    expect(isExpiryItemType('medical_certificate')).toBe(false);
    expect(isExpiryItemType(undefined)).toBe(false);
    expect(isExpiryItemType(7)).toBe(false);
  });
});

describe('expiryDefaultWindow (SQL expiry_default_window)', () => {
  it('is 270 for passports and 90 otherwise', () => {
    expect(PASSPORT_WINDOW_DAYS).toBe(270);
    expect(expiryDefaultWindow('passport')).toBe(270);
    for (const t of EXPIRY_ITEM_TYPES.filter((x) => x !== 'passport')) expect(expiryDefaultWindow(t)).toBe(DEFAULT_EXPIRY_WINDOW_DAYS);
    expect(expiryDefaultWindow(null)).toBe(90);
    expect(expiryDefaultWindow(undefined)).toBe(90);
  });

  it('matches the SQL body', () => {
    expect(SQL).toContain("SELECT CASE WHEN p_item_type = 'passport' THEN 270 ELSE 90 END");
  });
});

describe('expiryWindowFor (SQL expiry_window_for: type rule > item rule > default)', () => {
  // The rules of supabase/tests/sql/fleet/expiry_bucket.test.sql, company A.
  const rules = toExpiryWindowRules([
    { item_type: 'crew_document', certificate_type_id: null, warn_days: 60 },
    { item_type: 'crew_document', certificate_type_id: 'seaman-book', warn_days: 120 },
    { item_type: 'passport', certificate_type_id: null, warn_days: 180 },
    { item_type: 'visa', certificate_type_id: 'schengen', warn_days: 45 },
  ]);

  it.each<[string, string | null, string | null, number]>([
    ['the type rule wins', 'crew_document', 'seaman-book', 120],
    ['another type falls back to the item rule', 'crew_document', 'other', 60],
    ['no type: the item rule', 'crew_document', null, 60],
    ['a company passport rule replaces 270', 'passport', null, 180],
    ['a type rule under another item type does not apply', 'crew_qualification', 'seaman-book', 90],
    ['a visa without its type gets the default', 'visa', null, 90],
    ['a visa type rule', 'visa', 'schengen', 45],
    ['no item type matches no rule', null, 'seaman-book', 90],
  ])('%s', (_label, itemType, certificateTypeId, want) => {
    expect(expiryWindowFor(rules, { itemType, certificateTypeId })).toBe(want);
  });

  it('with no rules, the item type default', () => {
    expect(expiryWindowFor([], { itemType: 'passport' })).toBe(270);
    expect(expiryWindowFor([], { itemType: 'contract' })).toBe(90);
  });

  it('feeds the one TS engine (passports are expiring nine months out)', () => {
    const windowDays = expiryWindowFor([], { itemType: 'passport' });
    expect(expiryStatus({ expiresOn: '2027-06-10', windowDays, today: '2026-11-22' }).bucket).toBe('expiring');
    expect(expiryStatus({ expiresOn: '2027-06-10', windowDays: expiryWindowFor([], { itemType: 'visa' }), today: '2026-11-22' }).bucket).toBe('valid');
  });

  it('maps rows to the engine’s rule shape', () => {
    expect(toExpiryWindowRules([{ item_type: 'visa', certificate_type_id: 't', warn_days: 3 }])).toEqual([{ itemType: 'visa', certificateTypeId: 't', warnDays: 3 }]);
  });
});

describe('warn days (expiry_window_rules_warn_days_check)', () => {
  it('match the SQL bounds', () => {
    expect(SQL).toContain(`CHECK (warn_days BETWEEN 0 AND ${MAX_WARN_DAYS})`);
    expect(SQL).toContain(`p_warn_days > ${MAX_WARN_DAYS}`);
  });

  it.each<[unknown, boolean]>([
    [0, true],
    [1095, true],
    [270, true],
    [-1, false],
    [1096, false],
    [1.5, false],
    [Number.NaN, false],
    ['30', false],
    [null, false],
  ])('%s → %s', (value, ok) => {
    expect(isValidWarnDays(value)).toBe(ok);
  });
});

describe('expiryWindowRefusal', () => {
  it('has a sentence for every refusal the definers raise', () => {
    const body = SQL.slice(SQL.indexOf('CREATE OR REPLACE FUNCTION public.set_expiry_window_rule'), SQL.indexOf('-- ---------------------------------------------------------------- grants'));
    const messages = Array.from(new Set(Array.from(body.matchAll(/MESSAGE = '([a-z_]+)'/g), (m) => m[1]))).filter((m) => m !== 'rule_not_saved');
    expect(messages.sort()).toEqual(['invalid_item_type', 'invalid_warn_days', 'not_permitted', 'rule_not_found', 'rule_required']);
    for (const m of messages) expect(expiryWindowRefusal(m)).toMatch(/\.$/);
  });

  it('leaves anything else to the caller', () => {
    expect(expiryWindowRefusal('rule_not_saved')).toBeNull();
    expect(expiryWindowRefusal('permission denied for function set_expiry_window_rule')).toBeNull();
    expect(expiryWindowRefusal(undefined)).toBeNull();
  });

  it('names the bounds', () => {
    expect(expiryWindowRefusal('invalid_warn_days')).toContain('1095');
  });
});
