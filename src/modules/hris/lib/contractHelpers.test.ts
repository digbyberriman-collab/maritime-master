import { describe, expect, it } from 'vitest';
import {
  computeContractKpis,
  contractFormSchema,
  contractToFormValues,
  deriveContractStatus,
  emptyContractFormValues,
  filterCompanyContracts,
  formValuesToPayload,
  pickCurrentContract,
  resolveCurrency,
  signatureState,
  sortContractsNewestFirst,
  validateContractDates,
  DEFAULT_CONTRACT_FILTERS,
  OTHER_CURRENCY,
  type CrewContractRow,
} from '@/modules/hris/lib/contractHelpers';

const TODAY = new Date(2026, 8, 17); // 17 Sep 2026

const row = (overrides: Partial<CrewContractRow> = {}): CrewContractRow => ({
  id: overrides.id ?? 'c1',
  company_id: 'co',
  profile_id: 'p1',
  vessel_id: null,
  contract_type: 'rotational',
  contract_number: null,
  position: null,
  department: null,
  rank: null,
  start_date: '2026-01-01',
  end_date: null,
  probation_end_date: null,
  rotation_pattern: null,
  notice_period_days: null,
  sea_reference: null,
  flag_state: null,
  governing_law: null,
  wage_currency: null,
  base_wage_minor: null,
  wage_frequency: null,
  status: 'active',
  signed_by_crew_at: null,
  signed_by_company_at: null,
  document_path: null,
  document_name: null,
  supersedes_contract_id: null,
  termination_reason: null,
  terminated_at: null,
  notes: null,
  created_by: null,
  updated_by: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...overrides,
});

describe('deriveContractStatus', () => {
  it('keeps active contracts with no end date active', () => {
    expect(deriveContractStatus(row(), TODAY)).toBe('active');
  });
  it('keeps active contracts ending today or later active', () => {
    expect(deriveContractStatus(row({ end_date: '2026-09-17' }), TODAY)).toBe('active');
    expect(deriveContractStatus(row({ end_date: '2027-01-01' }), TODAY)).toBe('active');
  });
  it('derives expired for active contracts whose end date has passed', () => {
    expect(deriveContractStatus(row({ end_date: '2026-09-16' }), TODAY)).toBe('expired');
  });
  it('passes other stored statuses through untouched', () => {
    expect(deriveContractStatus(row({ status: 'terminated', end_date: '2020-01-01' }), TODAY)).toBe('terminated');
    expect(deriveContractStatus(row({ status: 'draft' }), TODAY)).toBe('draft');
    expect(deriveContractStatus(row({ status: 'superseded' }), TODAY)).toBe('superseded');
  });
  it('treats unknown statuses as draft', () => {
    expect(deriveContractStatus(row({ status: 'bogus' }), TODAY)).toBe('draft');
  });
});

describe('signatureState', () => {
  it('reports each combination', () => {
    expect(signatureState(row())).toBe('unsigned');
    expect(signatureState(row({ signed_by_crew_at: '2026-01-01T00:00:00Z' }))).toBe('awaiting_company');
    expect(signatureState(row({ signed_by_company_at: '2026-01-01T00:00:00Z' }))).toBe('awaiting_crew');
    expect(signatureState(row({ signed_by_crew_at: '2026-01-01T00:00:00Z', signed_by_company_at: '2026-01-02T00:00:00Z' }))).toBe('signed');
  });
});

describe('validateContractDates', () => {
  it('requires a start date', () => {
    expect(validateContractDates({ start_date: '' })).toEqual([{ field: 'start_date', message: 'Start date is required' }]);
  });
  it('accepts end on or after start', () => {
    expect(validateContractDates({ start_date: '2026-01-01', end_date: '2026-01-01' })).toEqual([]);
    expect(validateContractDates({ start_date: '2026-01-01', end_date: '2026-06-30' })).toEqual([]);
  });
  it('rejects end before start', () => {
    const issues = validateContractDates({ start_date: '2026-01-01', end_date: '2025-12-31' });
    expect(issues.map((i) => i.field)).toEqual(['end_date']);
  });
  it('requires probation between start and end', () => {
    expect(validateContractDates({ start_date: '2026-01-01', end_date: '2026-06-30', probation_end_date: '2026-03-01' })).toEqual([]);
    expect(validateContractDates({ start_date: '2026-01-01', probation_end_date: '2025-12-01' }).map((i) => i.field)).toEqual(['probation_end_date']);
    expect(validateContractDates({ start_date: '2026-01-01', end_date: '2026-06-30', probation_end_date: '2026-07-01' }).map((i) => i.field)).toEqual(['probation_end_date']);
  });
  it('flags unparseable dates', () => {
    expect(validateContractDates({ start_date: '2026-01-01', end_date: 'nope' }).map((i) => i.field)).toEqual(['end_date']);
  });
});

describe('contractFormSchema', () => {
  it('accepts a minimal draft', () => {
    const result = contractFormSchema.safeParse(emptyContractFormValues({ start_date: '2026-01-01' }));
    expect(result.success).toBe(true);
  });
  it('surfaces cross-field date errors on the right path', () => {
    const result = contractFormSchema.safeParse(emptyContractFormValues({ start_date: '2026-01-01', end_date: '2025-01-01' }));
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].path).toEqual(['end_date']);
  });
  it('rejects a negative or non-numeric wage', () => {
    expect(contractFormSchema.safeParse(emptyContractFormValues({ start_date: '2026-01-01', base_wage: '-1' })).success).toBe(false);
    expect(contractFormSchema.safeParse(emptyContractFormValues({ start_date: '2026-01-01', base_wage: 'abc' })).success).toBe(false);
  });
  it('requires a code when "Other" currency is chosen', () => {
    const result = contractFormSchema.safeParse(
      emptyContractFormValues({ start_date: '2026-01-01', wage_currency: OTHER_CURRENCY, wage_currency_other: 'x' }),
    );
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.some((i) => i.path[0] === 'wage_currency_other')).toBe(true);
  });
  it('rejects a non-integer notice period', () => {
    expect(contractFormSchema.safeParse(emptyContractFormValues({ start_date: '2026-01-01', notice_period_days: '1.5' })).success).toBe(false);
  });
});

describe('resolveCurrency', () => {
  it('uses the preset when selected', () => {
    expect(resolveCurrency('EUR', '')).toBe('EUR');
  });
  it('uses the free-text code when Other is selected, normalised to upper case', () => {
    expect(resolveCurrency(OTHER_CURRENCY, 'nok ')).toBe('NOK');
    expect(resolveCurrency(OTHER_CURRENCY, 'NO')).toBeNull();
  });
});

describe('formValuesToPayload', () => {
  it('converts the wage from major to minor units and blanks to nulls', () => {
    const payload = formValuesToPayload(
      emptyContractFormValues({
        start_date: '2026-01-01',
        base_wage: '4500.50',
        wage_currency: 'USD',
        wage_frequency: 'monthly',
        notice_period_days: '30',
        signed_by_crew_at: '2026-01-05',
      }),
    );
    expect(payload.base_wage_minor).toBe(450050);
    expect(payload.wage_currency).toBe('USD');
    expect(payload.wage_frequency).toBe('monthly');
    expect(payload.notice_period_days).toBe(30);
    expect(payload.end_date).toBeNull();
    expect(payload.contract_number).toBeNull();
    expect(payload.signed_by_crew_at).toMatch(/^2026-01-0[45]T/);
    expect(payload.signed_by_company_at).toBeNull();
  });
  it('drops wage frequency when no wage is set', () => {
    const payload = formValuesToPayload(emptyContractFormValues({ start_date: '2026-01-01' }));
    expect(payload.base_wage_minor).toBeNull();
    expect(payload.wage_frequency).toBeNull();
  });
});

describe('contractToFormValues', () => {
  it('round-trips a stored contract into form values', () => {
    const values = contractToFormValues(
      row({ base_wage_minor: 123456, wage_currency: 'GBP', wage_frequency: 'daily', notice_period_days: 14, end_date: '2026-12-31' }),
    );
    expect(values.base_wage).toBe('1234.56');
    expect(values.wage_currency).toBe('GBP');
    expect(values.wage_frequency).toBe('daily');
    expect(values.notice_period_days).toBe('14');
    expect(values.end_date).toBe('2026-12-31');
    expect(values.status).toBe('active');
  });
  it('routes a non-preset currency to the free-text field', () => {
    const values = contractToFormValues(row({ wage_currency: 'NOK', base_wage_minor: 100 }));
    expect(values.wage_currency).toBe(OTHER_CURRENCY);
    expect(values.wage_currency_other).toBe('NOK');
  });
});

describe('sorting and current contract selection', () => {
  const older = row({ id: 'old', start_date: '2025-01-01', status: 'superseded', created_at: '2025-01-01T00:00:00Z' });
  const draft = row({ id: 'draft', start_date: '2027-01-01', status: 'draft', created_at: '2026-09-01T00:00:00Z' });
  const active = row({ id: 'act', start_date: '2026-01-01', status: 'active', created_at: '2026-01-01T00:00:00Z' });

  it('sorts newest start date first', () => {
    expect(sortContractsNewestFirst([older, active, draft]).map((c) => c.id)).toEqual(['draft', 'act', 'old']);
  });
  it('prefers the in-force contract for the card', () => {
    const { current, history } = pickCurrentContract([older, draft, active], TODAY);
    expect(current?.id).toBe('act');
    expect(history.map((c) => c.id)).toEqual(['draft', 'old']);
  });
  it('falls back to the newest draft, then anything', () => {
    expect(pickCurrentContract([older, draft], TODAY).current?.id).toBe('draft');
    expect(pickCurrentContract([older], TODAY).current?.id).toBe('old');
    expect(pickCurrentContract([], TODAY).current).toBeNull();
  });
});

describe('computeContractKpis', () => {
  it('counts active, expiring, probation and missing contracts', () => {
    const contracts = [
      row({ id: 'a', profile_id: 'p1', end_date: '2026-10-01' }), // 14d
      row({ id: 'b', profile_id: 'p2', end_date: '2026-11-30', probation_end_date: '2026-10-10' }), // 74d, probation 23d
      row({ id: 'c', profile_id: 'p3', end_date: '2026-09-01' }), // expired
      row({ id: 'd', profile_id: 'p4', status: 'draft' }),
    ];
    const kpis = computeContractKpis(contracts, ['p1', 'p2', 'p3', 'p4', 'p5'], TODAY);
    expect(kpis).toEqual({ activeContracts: 2, expiring30: 1, expiring90: 2, missingContract: 3, probationEnding30: 1 });
  });
});

describe('filterCompanyContracts', () => {
  const rows = [
    { ...row({ id: 'a', vessel_id: 'v1', end_date: '2026-10-01' }), crew_name: 'Ann Able', vessel_name: 'Draak' },
    { ...row({ id: 'b', vessel_id: null, status: 'terminated' }), crew_name: 'Bob Baker', vessel_name: null },
    { ...row({ id: 'c', vessel_id: 'v2', end_date: '2027-06-01', contract_number: 'SEA-42' }), crew_name: 'Cy Cole', vessel_name: 'Marlin' },
  ];
  it('returns everything with default filters', () => {
    expect(filterCompanyContracts(rows, DEFAULT_CONTRACT_FILTERS, TODAY)).toHaveLength(3);
  });
  it('filters by derived status, vessel and expiry window', () => {
    expect(filterCompanyContracts(rows, { ...DEFAULT_CONTRACT_FILTERS, status: 'terminated' }, TODAY).map((c) => c.id)).toEqual(['b']);
    expect(filterCompanyContracts(rows, { ...DEFAULT_CONTRACT_FILTERS, vesselId: 'v2' }, TODAY).map((c) => c.id)).toEqual(['c']);
    expect(filterCompanyContracts(rows, { ...DEFAULT_CONTRACT_FILTERS, vesselId: 'none' }, TODAY).map((c) => c.id)).toEqual(['b']);
    expect(filterCompanyContracts(rows, { ...DEFAULT_CONTRACT_FILTERS, expiringWithinDays: 30 }, TODAY).map((c) => c.id)).toEqual(['a']);
  });
  it('searches across crew, vessel and contract number', () => {
    expect(filterCompanyContracts(rows, { ...DEFAULT_CONTRACT_FILTERS, search: 'sea-42' }, TODAY).map((c) => c.id)).toEqual(['c']);
    expect(filterCompanyContracts(rows, { ...DEFAULT_CONTRACT_FILTERS, search: 'draak' }, TODAY).map((c) => c.id)).toEqual(['a']);
  });
});
