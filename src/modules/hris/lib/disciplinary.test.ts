import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DISCIPLINARY_FILTERS,
  appealTone,
  auditDisciplinarySnapshot,
  caseFormSchema,
  caseFormToPayload,
  computeDisciplinaryKpis,
  countLiveWarnings,
  defaultExpiryDate,
  emptyCaseFormValues,
  escalationLadder,
  filterDisciplinaryRecords,
  incidentYears,
  isLiveWarning,
  lifecycleState,
  recordToCaseFormValues,
  retentionYears,
  severityTone,
  sortRecordsNewestFirst,
  stageTone,
  suggestNextStage,
  type DisciplinaryRecordRow,
  type DisciplinarySearchable,
} from '@/modules/hris/lib/disciplinary';

const TODAY = new Date(2026, 8, 17); // 17 Sep 2026

const row = (overrides: Partial<DisciplinaryRecordRow> = {}): DisciplinaryRecordRow => ({
  id: overrides.id ?? 'd1',
  company_id: 'co',
  profile_id: 'p1',
  vessel_id: null,
  incident_id: null,
  incident_date: '2026-06-01',
  category: 'conduct',
  severity: 'minor',
  stage: 'verbal_warning',
  description: 'Late for watch',
  investigation_notes: null,
  witness_statements: null,
  outcome: null,
  outcome_date: null,
  issued_by_profile_id: null,
  expiry_date: '2026-12-01',
  appeal_status: 'none',
  appeal_notes: null,
  status: 'open',
  document_path: null,
  document_name: null,
  acknowledged_by_crew_at: null,
  created_by: 'u1',
  updated_by: null,
  created_at: '2026-06-01T00:00:00Z',
  updated_at: '2026-06-01T00:00:00Z',
  ...overrides,
});

const searchable = (overrides: Partial<DisciplinarySearchable> = {}): DisciplinarySearchable => ({
  ...row(overrides),
  crew_name: overrides.crew_name ?? 'Ada Lovelace',
  issued_by_name: overrides.issued_by_name ?? null,
  incident_number: overrides.incident_number ?? null,
});

describe('defaultExpiryDate', () => {
  it('uses 6 / 12 / 24 months for verbal / written / final warnings', () => {
    expect(defaultExpiryDate('verbal_warning', '2026-01-15')).toBe('2026-07-15');
    expect(defaultExpiryDate('written_warning', '2026-01-15')).toBe('2027-01-15');
    expect(defaultExpiryDate('final_warning', '2026-01-15')).toBe('2028-01-15');
  });

  it('returns null for stages that do not lapse or bad dates', () => {
    expect(defaultExpiryDate('investigation', '2026-01-15')).toBeNull();
    expect(defaultExpiryDate('dismissal', '2026-01-15')).toBeNull();
    expect(defaultExpiryDate('verbal_warning', 'nope')).toBeNull();
  });

  it('retention is 2 years for minor and 7 otherwise', () => {
    expect(retentionYears('minor')).toBe(2);
    expect(retentionYears('serious')).toBe(7);
    expect(retentionYears('gross')).toBe(7);
  });
});

describe('tones', () => {
  it('maps severity, stage and appeal to tones', () => {
    expect(severityTone('gross')).toBe('danger');
    expect(severityTone('serious')).toBe('warning');
    expect(severityTone('minor')).toBe('info');
    expect(stageTone('investigation')).toBe('info');
    expect(stageTone('no_action')).toBe('success');
    expect(stageTone('verbal_warning')).toBe('warning');
    expect(stageTone('dismissal')).toBe('danger');
    expect(appealTone('lodged')).toBe('warning');
    expect(appealTone('overturned')).toBe('success');
    expect(appealTone('none')).toBe('muted');
  });
});

describe('live warnings and lifecycle', () => {
  it('counts warnings that have not lapsed, been expired or overturned', () => {
    const records = [
      row({ id: 'live', stage: 'written_warning', expiry_date: '2027-01-01', status: 'closed' }),
      row({ id: 'lapsed', stage: 'verbal_warning', expiry_date: '2026-09-16', status: 'open' }),
      row({ id: 'expired', stage: 'verbal_warning', expiry_date: '2027-01-01', status: 'expired' }),
      row({ id: 'overturned', stage: 'final_warning', expiry_date: '2027-01-01', status: 'overturned', appeal_status: 'overturned' }),
      row({ id: 'no-expiry', stage: 'final_warning', expiry_date: null, status: 'open' }),
      row({ id: 'investigation', stage: 'investigation', expiry_date: null, status: 'open' }),
      row({ id: 'suspension', stage: 'suspension', expiry_date: '2027-01-01', status: 'open' }),
    ];
    expect(records.filter((r) => isLiveWarning(r, TODAY)).map((r) => r.id)).toEqual(['live', 'no-expiry']);
    expect(countLiveWarnings(records, TODAY)).toBe(2);
    expect(isLiveWarning(row({ expiry_date: '2026-09-17' }), TODAY)).toBe(true); // expires today, still live
  });

  it('derives a display lifecycle', () => {
    expect(lifecycleState(row({ stage: 'investigation', expiry_date: null }), TODAY)).toBe('investigating');
    expect(lifecycleState(row({ expiry_date: '2027-01-01' }), TODAY)).toBe('live');
    expect(lifecycleState(row({ expiry_date: '2026-01-01' }), TODAY)).toBe('expired');
    expect(lifecycleState(row({ status: 'expired', expiry_date: '2027-01-01' }), TODAY)).toBe('expired');
    expect(lifecycleState(row({ status: 'overturned' }), TODAY)).toBe('overturned');
    expect(lifecycleState(row({ stage: 'no_action', status: 'closed', expiry_date: null }), TODAY)).toBe('closed');
    expect(lifecycleState(row({ stage: 'suspension', status: 'open', expiry_date: null }), TODAY)).toBe('open');
  });
});

describe('progressive discipline', () => {
  it('escalates one rung above the highest live warning', () => {
    expect(suggestNextStage([], 'minor', TODAY)).toBe('verbal_warning');
    expect(suggestNextStage([row({ stage: 'verbal_warning', expiry_date: '2027-01-01' })], 'minor', TODAY)).toBe('written_warning');
    expect(suggestNextStage([row({ stage: 'written_warning', expiry_date: '2027-01-01' })], 'minor', TODAY)).toBe('final_warning');
    expect(suggestNextStage([row({ stage: 'final_warning', expiry_date: '2027-01-01' })], 'minor', TODAY)).toBe('dismissal');
  });

  it('ignores lapsed warnings and applies the severity floor', () => {
    expect(suggestNextStage([row({ stage: 'final_warning', expiry_date: '2026-01-01' })], 'minor', TODAY)).toBe('verbal_warning');
    expect(suggestNextStage([], 'serious', TODAY)).toBe('written_warning');
    expect(suggestNextStage([], 'gross', TODAY)).toBe('final_warning');
    expect(suggestNextStage([row({ stage: 'verbal_warning', expiry_date: '2027-01-01' })], 'gross', TODAY)).toBe('final_warning');
    expect(suggestNextStage([row({ stage: 'final_warning', expiry_date: '2027-01-01' })], 'gross', TODAY)).toBe('dismissal');
  });

  it('places records on the ladder', () => {
    const ladder = escalationLadder(
      [
        row({ id: 'old', stage: 'verbal_warning', incident_date: '2025-01-01', expiry_date: '2025-07-01' }),
        row({ id: 'new', stage: 'verbal_warning', incident_date: '2026-08-01', expiry_date: '2027-02-01' }),
        row({ id: 'w', stage: 'written_warning', incident_date: '2024-01-01', expiry_date: '2025-01-01', status: 'expired' }),
      ],
      TODAY,
    );
    expect(ladder.map((r) => r.stage)).toEqual(['verbal_warning', 'written_warning', 'final_warning', 'dismissal']);
    expect(ladder[0].live?.id).toBe('new');
    expect(ladder[0].latest?.id).toBe('new');
    expect(ladder[1].live).toBeNull();
    expect(ladder[1].latest?.id).toBe('w');
    expect(ladder[3].latest).toBeNull();
  });
});

describe('KPIs and filters', () => {
  const rows = [
    searchable({ id: 'a', status: 'open', stage: 'investigation', expiry_date: null, severity: 'serious', category: 'safety', incident_date: '2026-09-01' }),
    searchable({ id: 'b', status: 'closed', stage: 'written_warning', expiry_date: '2026-10-01', appeal_status: 'lodged', crew_name: 'Grace Hopper', vessel_id: 'v1' }),
    searchable({ id: 'c', status: 'closed', stage: 'verbal_warning', expiry_date: '2027-06-01', incident_date: '2025-03-03', incident_number: 'INC-042' }),
    searchable({ id: 'd', status: 'expired', stage: 'verbal_warning', expiry_date: '2026-01-01', incident_date: '2025-01-01' }),
  ];

  it('computes the tiles', () => {
    expect(computeDisciplinaryKpis(rows, TODAY)).toEqual({ openCases: 1, liveWarnings: 2, expiring30: 1, appealsLodged: 1 });
  });

  it('filters by status / live, severity, category, stage, vessel, year and crew', () => {
    const ids = (f: Partial<typeof DEFAULT_DISCIPLINARY_FILTERS>) => filterDisciplinaryRecords(rows, { ...DEFAULT_DISCIPLINARY_FILTERS, ...f }, TODAY).map((r) => r.id);
    expect(ids({})).toEqual(['a', 'b', 'c', 'd']);
    expect(ids({ status: 'live' })).toEqual(['b', 'c']);
    expect(ids({ status: 'open' })).toEqual(['a']);
    expect(ids({ severity: 'serious' })).toEqual(['a']);
    expect(ids({ category: 'safety' })).toEqual(['a']);
    expect(ids({ stage: 'verbal_warning' })).toEqual(['c', 'd']);
    expect(ids({ vesselId: 'v1' })).toEqual(['b']);
    expect(ids({ vesselId: 'none' })).toEqual(['a', 'c', 'd']);
    expect(ids({ year: '2025' })).toEqual(['c', 'd']);
    expect(ids({ search: 'grace' })).toEqual(['b']);
    expect(ids({ search: 'inc-042' })).toEqual(['c']);
  });

  it('sorts newest first and lists years', () => {
    expect(sortRecordsNewestFirst(rows).map((r) => r.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(incidentYears(rows)).toEqual(['2026', '2025']);
  });
});

describe('form helpers', () => {
  it('requires a subject and description and validates date order', () => {
    expect(caseFormSchema.safeParse(emptyCaseFormValues({}, TODAY)).success).toBe(false);
    expect(caseFormSchema.safeParse(emptyCaseFormValues({ profile_id: 'p1', description: 'x' }, TODAY)).success).toBe(true);
    expect(
      caseFormSchema.safeParse(emptyCaseFormValues({ profile_id: 'p1', description: 'x', outcome_date: '2026-09-20', expiry_date: '2026-09-19' }, TODAY)).success,
    ).toBe(false);
    expect(
      caseFormSchema.safeParse(emptyCaseFormValues({ profile_id: 'p1', description: 'x', incident_date: '2026-09-20', outcome_date: '2026-09-19' }, TODAY)).success,
    ).toBe(false);
  });

  it('round-trips a record to form values and a payload', () => {
    const original = row({ vessel_id: 'v1', stage: 'written_warning', outcome: 'Warned', outcome_date: '2026-06-02', investigation_notes: 'secret' });
    const values = recordToCaseFormValues(original);
    expect(values.stage).toBe('written_warning');
    const payload = caseFormToPayload({ ...values, witness_statements: '  ' });
    expect(payload).toEqual({
      vessel_id: 'v1',
      incident_id: null,
      incident_date: '2026-06-01',
      category: 'conduct',
      severity: 'minor',
      stage: 'written_warning',
      description: 'Late for watch',
      outcome: 'Warned',
      outcome_date: '2026-06-02',
      expiry_date: '2026-12-01',
      issued_by_profile_id: null,
      investigation_notes: 'secret',
      witness_statements: null,
    });
  });

  it('audit snapshot never carries the investigation file', () => {
    const snap = auditDisciplinarySnapshot(row({ investigation_notes: 'secret', witness_statements: null }));
    expect(snap.has_investigation_notes).toBe(true);
    expect(snap.has_witness_statements).toBe(false);
    expect(Object.values(snap)).not.toContain('secret');
    expect('description' in snap).toBe(false);
  });
});
