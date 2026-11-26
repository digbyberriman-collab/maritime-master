/**
 * Training programme settings (X5-07A, TR10; D-X5-06, D-X5-19): the policy
 * numbers live once, as the program_settings column defaults
 * (20260611052722, and 20261124040600 for the extras), and
 * lib/settingsSchema.ts holds the same numbers; the zod schema is the
 * check development_settings_save() makes; the category labels and FX
 * overrides read from the row ignore anything malformed. The constants
 * file no longer carries policy numbers or operator-specific labels.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CATEGORY_LABELS,
  DEV_CATEGORIES,
  PROGRAM_POLICY_EXTRA_DEFAULTS,
  PROGRAM_SETTINGS_DEFAULTS,
  parseCategoryLabels,
  parseFinalApprovalMode,
  parseFxOverrides,
  programSettingsSchema,
  settingsRefusalMessage,
  toSettingsPayload,
} from '@/modules/development/lib/settingsSchema';
import { CATEGORY_CONFIG } from '@/modules/development/constants';
import { DEFAULT_SETTINGS } from '@/modules/development/services/rulesEngine';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const CREATE = read('supabase/migrations/20260611052722_7c7545d0-a069-46bb-b9e7-7f2197b992bb.sql');
const CORE = read('supabase/migrations/20261124040600_fleet_training_core.sql');

function functionBody(name: string): string {
  const at = CORE.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  expect(at, name).toBeGreaterThan(-1);
  const start = CORE.indexOf('AS $$', at);
  return CORE.slice(start, CORE.indexOf('\n$$;', start));
}

/** The DEFAULT of `column` in the program_settings CREATE TABLE. */
function columnDefault(sql: string, column: string): string | null {
  const m = sql.match(new RegExp(`(?:^|\\s)${column}\\s+[a-z][^\\n]*?DEFAULT\\s+([^,\\n]+)`));
  return m ? m[1].trim() : null;
}

describe('the policy defaults', () => {
  it('are the program_settings column defaults of 20260611052722', () => {
    for (const [column, value] of Object.entries(PROGRAM_SETTINGS_DEFAULTS)) {
      const sqlDefault = columnDefault(CREATE, column);
      expect(sqlDefault, column).not.toBeNull();
      expect(sqlDefault, column).toBe(String(value));
    }
  });

  it('include the 040600 extras: both approvers, no mileage rate, no overrides, no renamed categories', () => {
    expect(columnDefault(CORE, 'final_approval_mode')).toBe("'both'");
    expect(PROGRAM_POLICY_EXTRA_DEFAULTS.final_approval_mode).toBe('both');
    expect(columnDefault(CORE, 'mileage_rate_per_mile')).toBeNull();
    expect(PROGRAM_POLICY_EXTRA_DEFAULTS.mileage_rate_per_mile).toBeNull();
    expect(columnDefault(CORE, 'fx_overrides')).toBe("'{}'::jsonb");
    expect(columnDefault(CORE, 'category_labels')).toBe("'{}'::jsonb");
    expect(PROGRAM_POLICY_EXTRA_DEFAULTS.category_labels).toEqual(DEFAULT_CATEGORY_LABELS);
  });

  it('are the rules engine defaults', () => {
    expect(DEFAULT_SETTINGS).toEqual(PROGRAM_SETTINGS_DEFAULTS);
  });

  it('are not hard-coded in the constants file, which names no operator', () => {
    const constants = read('src/modules/development/constants.ts');
    expect(constants).not.toMatch(/Inkfish/i);
    for (const name of ['ACCOMMODATION_CAP', 'FOOD_PER_DIEM', 'PROFESSIONAL_SPLIT', 'CLAWBACK_MONTHS', 'ELIGIBILITY_MONTHS', 'ELIGIBILITY_DAYS']) {
      expect(constants, name).not.toContain(name);
    }
    expect(CATEGORY_CONFIG.fleet_organised.label).toBe(DEFAULT_CATEGORY_LABELS.fleet_organised);
  });
});

describe('category labels and FX overrides from the row', () => {
  it('lays the account labels over the defaults and ignores the rest', () => {
    expect(parseCategoryLabels(null)).toEqual(DEFAULT_CATEGORY_LABELS);
    expect(parseCategoryLabels({ fleet_organised: '  Owner required ', mandatory: '', professional: 7, other: 'x', extracurricular: 'x'.repeat(61) })).toEqual({
      ...DEFAULT_CATEGORY_LABELS,
      fleet_organised: 'Owner required',
    });
    expect(parseCategoryLabels(['fleet_organised'])).toEqual(DEFAULT_CATEGORY_LABELS);
  });

  it('keeps ISO codes with positive rates only', () => {
    expect(parseFxOverrides({ EUR: 1.08, GBP: 1.27, usd: 1, JPY: 0, CHF: -1, AUD: '0.66', NZD: 2_000_000 })).toEqual({ EUR: 1.08, GBP: 1.27 });
    expect(parseFxOverrides('EUR')).toEqual({});
  });

  it("reads 'either' and treats anything else as 'both'", () => {
    expect(parseFinalApprovalMode('either')).toBe('either');
    expect(parseFinalApprovalMode('both')).toBe('both');
    expect(parseFinalApprovalMode(null)).toBe('both');
    expect(parseFinalApprovalMode('any')).toBe('both');
  });
});

describe('programSettingsSchema', () => {
  it('takes a partial save and coerces typed numbers', () => {
    expect(programSettingsSchema.parse({ clawback_months: '18' })).toEqual({ clawback_months: 18 });
    expect(programSettingsSchema.parse({})).toEqual({});
    expect(programSettingsSchema.parse({ mileage_rate_per_km: '' })).toEqual({ mileage_rate_per_km: null });
  });

  it('refuses what the server refuses', () => {
    const bad: Array<Record<string, unknown>> = [
      { clawback_months: 121 },
      { clawback_months: 1.5 },
      { eligibility_service_days: -1 },
      { accommodation_cap_per_night_usd: 1_000_001 },
      { online_neutral_threshold_hours: 1001 },
      { final_approval_mode: 'any' },
      { mileage_rate_per_mile: 1001 },
      { fx_overrides: { eur: 1.1 } },
      { fx_overrides: { EUR: 0 } },
      { category_labels: { ...DEFAULT_CATEGORY_LABELS, mandatory: ' ' } },
      { unknown_key: 1 },
    ];
    for (const input of bad) expect(programSettingsSchema.safeParse(input).success, JSON.stringify(input)).toBe(false);
    const body = functionBody('development_settings_save');
    expect(body).toContain('"clawback_months": [0, 120, true]');
    expect(body).toContain('"online_neutral_threshold_hours": [0, 1000, false]');
    expect(body).toContain("'^[A-Z]{3}$'");
    expect(body).toContain('length(btrim(e.value #>> \'{}\')) > 60');
  });

  it('knows every key development_settings_save takes, and no other', () => {
    const known = functionBody('development_settings_save').match(/v_known text\[\] := ARRAY\[([^\]]+)\]/)?.[1] ?? '';
    const serverKeys = [...known.matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]).filter((k) => k !== 'expected_updated_at');
    expect(Object.keys(programSettingsSchema.shape).sort()).toEqual(serverKeys.sort());
  });

  it('builds the payload with the last seen updated_at', () => {
    const values = programSettingsSchema.parse({ final_approval_mode: 'either', category_labels: { ...DEFAULT_CATEGORY_LABELS, mandatory: 'Flag state' } });
    expect(toSettingsPayload(values, '2026-11-01T00:00:00Z')).toEqual({
      final_approval_mode: 'either',
      category_labels: { ...DEFAULT_CATEGORY_LABELS, mandatory: 'Flag state' },
      expected_updated_at: '2026-11-01T00:00:00Z',
    });
    expect(DEV_CATEGORIES).toEqual(['fleet_organised', 'mandatory', 'professional', 'extracurricular']);
  });
});

describe('settingsRefusalMessage', () => {
  it('has a sentence for every refusal development_settings_save raises', () => {
    const codes = new Set<string>();
    for (const fn of ['development_settings_save', 'development_admin_gate']) {
      for (const m of functionBody(fn).matchAll(/MESSAGE = '([a-z_]+)'/g)) codes.add(m[1]);
    }
    expect([...codes].sort()).toEqual(['field_invalid', 'field_unknown', 'not_permitted', 'stale_settings']);
    for (const code of codes) expect(settingsRefusalMessage({ message: code }), code).toBeTruthy();
    expect(settingsRefusalMessage({ message: 'field_invalid', hint: 'clawback_months' })).toBe('Check the clawback window: the value is not allowed.');
    expect(settingsRefusalMessage({ message: 'timeout' })).toBeNull();
  });
});
