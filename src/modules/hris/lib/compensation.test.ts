import { describe, expect, it } from 'vitest';
import {
  annualisedBaseMinor,
  bankDetailFormSchema,
  compensationCost,
  compensationFormSchema,
  compensationToFormValues,
  computePayrollKpis,
  convertMinor,
  currentFxRates,
  emptyCompensationFormValues,
  filterOverviewRows,
  formValuesToBankDetailPayload,
  formValuesToCompensationPayload,
  generatePeriods,
  gradeDefaults,
  isValidIban,
  isValidSwiftBic,
  maskAccountNumber,
  maskIban,
  monthlyEquivalentMinor,
  parseAllowances,
  periodTransitions,
  pickCurrentCompensation,
  skipExistingPeriods,
  sortPayGrades,
  sumAllowancesMinor,
  validateAllowances,
  DEFAULT_OVERVIEW_FILTERS,
  type CompensationOverviewRow,
  type CrewCompensationRow,
} from '@/modules/hris/lib/compensation';

const comp = (overrides: Partial<CrewCompensationRow> = {}): CrewCompensationRow => ({
  id: overrides.id ?? 'c1',
  company_id: 'co',
  profile_id: 'p1',
  pay_grade_id: null,
  currency: 'EUR',
  base_salary_minor: 500_000,
  pay_frequency: 'monthly',
  allowances: [],
  gratuity_points: 1,
  gratuity_eligible: true,
  effective_from: '2026-01-01',
  effective_to: null,
  status: 'active',
  reason: null,
  approved_by: null,
  approved_at: null,
  notes: null,
  created_by: null,
  updated_by: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...overrides,
});

describe('allowances', () => {
  it('parses the jsonb column defensively', () => {
    const parsed = parseAllowances([
      { name: ' Uniform ', amount_minor: 10000, taxable: false },
      { name: '', amount_minor: 5 },
      { amount_minor: 5 },
      { name: 'Phone', amount_minor: '2500' },
      'junk',
      null,
    ]);
    expect(parsed).toEqual([
      { name: 'Uniform', amount_minor: 10000, taxable: false, recurring: undefined, prorate: undefined },
      { name: 'Phone', amount_minor: 2500, taxable: undefined, recurring: undefined, prorate: undefined },
    ]);
    expect(parseAllowances(null)).toEqual([]);
    expect(parseAllowances('nope')).toEqual([]);
  });

  it('validates names and amounts', () => {
    const issues = validateAllowances([
      { name: 'Uniform', amount_minor: 100 },
      { name: 'uniform', amount_minor: -1 },
      { name: '  ', amount_minor: 1.5 },
    ]);
    expect(issues).toEqual([
      { index: 1, field: 'name', message: 'Allowance names must be unique' },
      { index: 1, field: 'amount_minor', message: 'Amount must be zero or more' },
      { index: 2, field: 'name', message: 'Allowance name is required' },
      { index: 2, field: 'amount_minor', message: 'Amount must be zero or more' },
    ]);
    expect(validateAllowances([{ name: 'Ok', amount_minor: 0 }])).toEqual([]);
  });

  it('sums allowances, optionally recurring only', () => {
    const list = [
      { name: 'A', amount_minor: 100 },
      { name: 'B', amount_minor: 250, recurring: false },
      { name: 'C', amount_minor: 50, recurring: true },
    ];
    expect(sumAllowancesMinor(list)).toBe(400);
    expect(sumAllowancesMinor(list, { recurringOnly: true })).toBe(150);
  });
});

describe('cost maths', () => {
  it('annualises by frequency', () => {
    expect(annualisedBaseMinor(100, 'monthly')).toBe(1200);
    expect(annualisedBaseMinor(100, 'weekly')).toBe(5200);
    expect(annualisedBaseMinor(100, 'daily')).toBe(36500);
    expect(annualisedBaseMinor(100, 'annual')).toBe(100);
  });

  it('computes a monthly equivalent with half-away rounding', () => {
    expect(monthlyEquivalentMinor(500_000, 'monthly')).toBe(500_000);
    expect(monthlyEquivalentMinor(1_200_000, 'annual')).toBe(100_000);
    expect(monthlyEquivalentMinor(10_000, 'daily')).toBe(304_167); // 3,650,000 / 12 = 304,166.67
    expect(monthlyEquivalentMinor(100, 'weekly')).toBe(433); // 5200 / 12 = 433.33
  });

  it('breaks down a package including allowances', () => {
    const cost = compensationCost(
      comp({
        base_salary_minor: 20_000,
        pay_frequency: 'daily',
        allowances: [
          { name: 'Phone', amount_minor: 5_000 },
          { name: 'Bonus', amount_minor: 100_000, recurring: false },
        ],
      }),
    );
    expect(cost.annualBaseMinor).toBe(7_300_000);
    expect(cost.monthlyBaseMinor).toBe(608_333);
    expect(cost.monthlyAllowancesMinor).toBe(5_000);
    expect(cost.monthlyTotalMinor).toBe(613_333);
    expect(cost.annualAllowancesMinor).toBe(160_000);
    expect(cost.annualTotalMinor).toBe(7_460_000);
  });

  it('converts with an FX rate and treats unknown as 1', () => {
    expect(convertMinor(10_000, 1.1)).toBe(11_000);
    expect(convertMinor(333, 0.5)).toBe(167);
    expect(convertMinor(999, null)).toBe(999);
  });
});

describe('IBAN and masking', () => {
  it('accepts valid IBANs regardless of spacing and case', () => {
    expect(isValidIban('GB82 WEST 1234 5698 7654 32')).toBe(true);
    expect(isValidIban('de89370400440532013000')).toBe(true);
    expect(isValidIban('FR1420041010050500013M02606')).toBe(true);
  });

  it('rejects bad checksums, shapes and lengths', () => {
    expect(isValidIban('GB82WEST12345698765433')).toBe(false);
    expect(isValidIban('1234567890')).toBe(false);
    expect(isValidIban('')).toBe(false);
    expect(isValidIban(null)).toBe(false);
  });

  it('checks SWIFT/BIC shape', () => {
    expect(isValidSwiftBic('DEUTDEFF')).toBe(true);
    expect(isValidSwiftBic('deutdeff500')).toBe(true);
    expect(isValidSwiftBic('DEUTDE')).toBe(false);
  });

  it('masks showing the first and last four characters', () => {
    expect(maskIban('GB82 WEST 1234 5698 7654 32')).toBe('GB82 •••• •••• •••• ••54 32');
    expect(maskIban('GB82WEST')).toBe('•••• ••••');
    expect(maskIban('')).toBe('');
    expect(maskAccountNumber('12345678')).toBe('••••5678');
  });
});

describe('picking and ordering', () => {
  it('prefers the active package, then drafts, then newest', () => {
    const rows = [
      comp({ id: 'old', status: 'superseded', effective_from: '2024-01-01' }),
      comp({ id: 'draft', status: 'draft', effective_from: '2027-01-01' }),
      comp({ id: 'active', status: 'active', effective_from: '2026-01-01' }),
    ];
    const picked = pickCurrentCompensation(rows);
    expect(picked.current?.id).toBe('active');
    expect(picked.history.map((r) => r.id)).toEqual(['draft', 'old']);
    expect(pickCurrentCompensation([rows[0], rows[1]]).current?.id).toBe('draft');
    expect(pickCurrentCompensation([rows[0]]).current?.id).toBe('old');
    expect(pickCurrentCompensation([]).current).toBeNull();
  });

  it('sorts pay grades by department, level desc, step, code', () => {
    const sorted = sortPayGrades([
      { department: 'Deck', grade_level: 3, step: 1, code: 'DH' },
      { department: 'Deck', grade_level: 10, step: 1, code: 'CAPT' },
      { department: 'Interior', grade_level: 7, step: 1, code: 'CS' },
      { department: 'Deck', grade_level: 3, step: 2, code: 'DH2' },
    ]);
    expect(sorted.map((g) => g.code)).toEqual(['CAPT', 'DH', 'DH2', 'CS']);
  });
});

describe('compensation form', () => {
  it('round-trips a row through form values and back to a payload', () => {
    const row = comp({
      currency: 'NOK',
      base_salary_minor: 123_456,
      pay_frequency: 'weekly',
      allowances: [{ name: 'Phone', amount_minor: 2_500, taxable: false, recurring: true, prorate: false }],
      gratuity_points: 1.5,
      pay_grade_id: 'g1',
      effective_to: '2026-12-31',
      reason: 'Promotion',
    });
    const values = compensationToFormValues(row);
    expect(values.currency).toBe('__other__');
    expect(values.currency_other).toBe('NOK');
    expect(values.base_salary).toBe('1234.56');
    expect(values.allowances).toEqual([{ name: 'Phone', amount: '25.00', taxable: false, recurring: true, prorate: false }]);
    const parsed = compensationFormSchema.safeParse(values);
    expect(parsed.success).toBe(true);
    const payload = formValuesToCompensationPayload(values);
    expect(payload).toMatchObject({
      status: 'active',
      pay_grade_id: 'g1',
      currency: 'NOK',
      base_salary_minor: 123_456,
      pay_frequency: 'weekly',
      allowances: [{ name: 'Phone', amount_minor: 2_500, taxable: false, recurring: true, prorate: false }],
      gratuity_points: 1.5,
      effective_from: '2026-01-01',
      effective_to: '2026-12-31',
      reason: 'Promotion',
      notes: null,
    });
  });

  it('rejects bad dates, currencies and duplicate allowances', () => {
    const base = emptyCompensationFormValues({ base_salary: '100', effective_from: '2026-02-01' });
    expect(compensationFormSchema.safeParse(base).success).toBe(true);
    const badTo = compensationFormSchema.safeParse({ ...base, effective_to: '2026-01-01' });
    expect(badTo.success).toBe(false);
    const badCurrency = compensationFormSchema.safeParse({ ...base, currency: '__other__', currency_other: 'EURO' });
    expect(badCurrency.success).toBe(false);
    const dupes = compensationFormSchema.safeParse({
      ...base,
      allowances: [
        { name: 'A', amount: '1', taxable: true, recurring: true, prorate: true },
        { name: 'a', amount: '1', taxable: true, recurring: true, prorate: true },
      ],
    });
    expect(dupes.success).toBe(false);
    expect(compensationFormSchema.safeParse({ ...base, base_salary: '-5' }).success).toBe(false);
  });

  it('applies grade defaults according to frequency', () => {
    const grade = { currency: 'USD', monthly_base_minor: 650_000, daily_rate_minor: 25_000, gratuity_points: 1.6 };
    expect(gradeDefaults(grade, 'monthly')).toEqual({ currency: 'USD', currency_other: '', gratuity_points: '1.6', base_salary: '6500.00', pay_frequency: 'monthly' });
    expect(gradeDefaults(grade, 'daily')).toMatchObject({ base_salary: '250.00', pay_frequency: 'daily' });
    expect(gradeDefaults({ ...grade, daily_rate_minor: null }, 'daily')).toMatchObject({ base_salary: '6500.00', pay_frequency: 'monthly' });
    expect(gradeDefaults({ ...grade, monthly_base_minor: 0, daily_rate_minor: null }, 'monthly')).toEqual({
      currency: 'USD',
      currency_other: '',
      gratuity_points: '1.6',
    });
  });
});

describe('bank details form', () => {
  it('requires an IBAN or account number and normalises on write', () => {
    const noAccount = bankDetailFormSchema.safeParse({ account_holder: 'A', is_primary: true });
    expect(noAccount.success).toBe(false);
    const values = {
      account_holder: ' Jane Doe ',
      bank_name: 'Test Bank',
      bank_country: 'gb',
      iban: 'gb82 west 1234 5698 7654 32',
      swift_bic: 'deut de ff',
      account_number: '',
      sort_code: '',
      routing_number: '',
      currency: 'gbp',
      is_primary: true,
      notes: '',
    };
    expect(bankDetailFormSchema.safeParse(values).success).toBe(true);
    expect(formValuesToBankDetailPayload(values)).toEqual({
      account_holder: 'Jane Doe',
      bank_name: 'Test Bank',
      bank_country: 'GB',
      iban: 'GB82WEST12345698765432',
      swift_bic: 'DEUTDEFF',
      account_number: null,
      sort_code: null,
      routing_number: null,
      currency: 'GBP',
      is_primary: true,
      notes: null,
    });
    expect(bankDetailFormSchema.safeParse({ ...values, iban: 'GB82WEST12345698765433' }).success).toBe(false);
  });
});

describe('overview KPIs and filters', () => {
  const row = (overrides: Partial<CompensationOverviewRow>): CompensationOverviewRow => ({
    profile_id: overrides.profile_id ?? 'p',
    user_id: null,
    crew_name: 'Crew',
    rank: null,
    department: null,
    vessel_id: null,
    vessel_name: null,
    compensation: null,
    ...overrides,
  });
  const withComp = (id: string, overrides: Partial<CrewCompensationRow>, extra: Partial<CompensationOverviewRow> = {}) =>
    row({ profile_id: id, compensation: { ...comp({ id, profile_id: id, ...overrides }), pay_grade_code: null, pay_grade_name: null }, ...extra });

  it('computes coverage, converted monthly cost and department averages', () => {
    const rows = [
      withComp('a', { base_salary_minor: 100_000, currency: 'EUR' }, { department: 'Deck' }),
      withComp('b', { base_salary_minor: 100_000, currency: 'USD' }, { department: 'Deck' }),
      withComp('c', { base_salary_minor: 50_000, currency: 'CHF' }, { department: 'Interior' }),
      row({ profile_id: 'd', department: 'Interior' }),
    ];
    const kpis = computePayrollKpis(rows, new Map([['USD', 0.9], ['CHF', null]]), 'EUR');
    expect(kpis.withCompensation).toBe(3);
    expect(kpis.missingCompensation).toBe(1);
    expect(kpis.monthlyCostMinor).toBe(100_000 + 90_000 + 50_000);
    expect(kpis.unconvertedCurrencies).toEqual(['CHF']);
    expect(kpis.byDepartment).toEqual([
      { department: 'Deck', crew: 2, averageMonthlyMinor: 95_000 },
      { department: 'Interior', crew: 1, averageMonthlyMinor: 50_000 },
    ]);
  });

  it('filters by vessel, department, coverage and search', () => {
    const rows = [
      withComp('a', {}, { crew_name: 'Ann Able', vessel_id: 'v1', department: 'Deck' }),
      row({ profile_id: 'b', crew_name: 'Bob Baker', vessel_id: null, department: 'Interior' }),
    ];
    expect(filterOverviewRows(rows, DEFAULT_OVERVIEW_FILTERS)).toHaveLength(2);
    expect(filterOverviewRows(rows, { ...DEFAULT_OVERVIEW_FILTERS, vesselId: 'v1' }).map((r) => r.profile_id)).toEqual(['a']);
    expect(filterOverviewRows(rows, { ...DEFAULT_OVERVIEW_FILTERS, vesselId: 'none' }).map((r) => r.profile_id)).toEqual(['b']);
    expect(filterOverviewRows(rows, { ...DEFAULT_OVERVIEW_FILTERS, department: 'Interior' }).map((r) => r.profile_id)).toEqual(['b']);
    expect(filterOverviewRows(rows, { ...DEFAULT_OVERVIEW_FILTERS, coverage: 'missing' }).map((r) => r.profile_id)).toEqual(['b']);
    expect(filterOverviewRows(rows, { ...DEFAULT_OVERVIEW_FILTERS, search: 'baker' }).map((r) => r.profile_id)).toEqual(['b']);
  });
});

describe('FX rates', () => {
  it('finds the effective rate per pair on a date', () => {
    const rows = [
      { id: '1', base_currency: 'USD', quote_currency: 'EUR', valid_from: '2026-01-01', created_at: '2026-01-01T00:00:00Z' },
      { id: '2', base_currency: 'USD', quote_currency: 'EUR', valid_from: '2026-06-01', created_at: '2026-06-01T00:00:00Z' },
      { id: '3', base_currency: 'USD', quote_currency: 'EUR', valid_from: '2027-01-01', created_at: '2027-01-01T00:00:00Z' },
      { id: '4', base_currency: 'GBP', quote_currency: 'EUR', valid_from: '2026-03-01', created_at: '2026-03-01T00:00:00Z' },
    ];
    const current = currentFxRates(rows, '2026-09-17');
    expect(current.get('USD/EUR')?.id).toBe('2');
    expect(current.get('GBP/EUR')?.id).toBe('4');
    expect(current.size).toBe(2);
  });
});

describe('pay periods', () => {
  it('generates calendar months', () => {
    const periods = generatePeriods({ year: 2026, type: 'calendar_month' });
    expect(periods).toHaveLength(12);
    expect(periods[0]).toEqual({ period_type: 'calendar_month', label: 'January 2026', start_date: '2026-01-01', end_date: '2026-01-31' });
    expect(periods[1].end_date).toBe('2026-02-28');
    expect(periods[11].end_date).toBe('2026-12-31');
  });

  it('generates four-weekly periods from a start date within the year', () => {
    const periods = generatePeriods({ year: 2026, type: 'four_weekly', startDate: '2026-01-05' });
    expect(periods[0].start_date).toBe('2026-01-05');
    expect(periods[0].end_date).toBe('2026-02-01');
    expect(periods[1].start_date).toBe('2026-02-02');
    expect(periods.every((p) => p.start_date.startsWith('2026'))).toBe(true);
    expect(periods).toHaveLength(13);
    expect(periods[12].end_date).toBe('2027-01-03');
  });

  it('skips periods that already exist', () => {
    const periods = generatePeriods({ year: 2026, type: 'calendar_month' });
    const remaining = skipExistingPeriods(periods, ['2026-01-01', '2026-03-01']);
    expect(remaining).toHaveLength(10);
    expect(remaining.map((p) => p.start_date)).not.toContain('2026-03-01');
  });

  it('exposes the allowed transitions', () => {
    expect(periodTransitions('open')).toEqual({ canLock: true, canUnlock: false, canClose: true });
    expect(periodTransitions('locked')).toEqual({ canLock: false, canUnlock: true, canClose: true });
    expect(periodTransitions('closed')).toEqual({ canLock: false, canUnlock: false, canClose: false });
  });
});
