import { describe, expect, it } from 'vitest';
import {
  authorisationEffectiveStatus,
  authorisationFormSchema,
  authorisationFormToPayload,
  authorisationToFormValues,
  buildMatrix,
  computeRtwKpis,
  filterMatrix,
  matrixToCsv,
  nationalityMatches,
  requiredAuthorisationsFor,
  sortByWorst,
  statusFromDate,
  statusFromDays,
  worstStatus,
  DEFAULT_MATRIX_FILTERS,
  type MatrixDirectoryEntry,
  type WorkAuthorisationRow,
} from '@/modules/hris/lib/rightToWork';

const TODAY = new Date(2026, 8, 17); // 17 Sep 2026

const entry = (overrides: Partial<MatrixDirectoryEntry> = {}): MatrixDirectoryEntry => ({
  id: 'p1',
  user_id: 'u1',
  displayName: 'Ann Able',
  rank: 'Deckhand',
  department: 'Deck',
  vessel_id: 'v1',
  vessel_name: 'Draak',
  nationality: 'British',
  ...overrides,
});

const auth = (overrides: Partial<WorkAuthorisationRow> = {}): WorkAuthorisationRow => ({
  id: 'a1',
  company_id: 'co',
  profile_id: 'p1',
  authorisation_type: 'b1_b2',
  country: 'United States',
  reference_number: null,
  issued_date: null,
  expiry_date: '2027-01-01',
  entries: null,
  status: 'valid',
  document_path: null,
  document_name: null,
  verified_at: null,
  verified_by: null,
  notes: null,
  created_by: null,
  updated_by: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...overrides,
});

describe('status helpers', () => {
  it('maps days to status', () => {
    expect(statusFromDays(null)).toBe('missing');
    expect(statusFromDays(-1)).toBe('expired');
    expect(statusFromDays(0)).toBe('critical');
    expect(statusFromDays(30)).toBe('critical');
    expect(statusFromDays(31)).toBe('warning');
    expect(statusFromDays(90)).toBe('warning');
    expect(statusFromDays(91)).toBe('ok');
  });

  it('maps dates to status relative to today', () => {
    expect(statusFromDate('2026-09-16', TODAY)).toBe('expired');
    expect(statusFromDate('2026-10-01', TODAY)).toBe('critical');
    expect(statusFromDate('2026-12-01', TODAY)).toBe('warning');
    expect(statusFromDate('2027-12-01', TODAY)).toBe('ok');
    expect(statusFromDate(null, TODAY)).toBe('missing');
    expect(statusFromDate('not a date', TODAY)).toBe('missing');
  });

  it('picks the worst status with missing as least severe', () => {
    expect(worstStatus([])).toBe('missing');
    expect(worstStatus(['ok', 'missing'])).toBe('ok');
    expect(worstStatus(['ok', 'warning', 'critical'])).toBe('critical');
    expect(worstStatus(['warning', 'expired', 'ok'])).toBe('expired');
  });

  it('derives an authorisation effective status', () => {
    expect(authorisationEffectiveStatus(auth({ status: 'revoked' }), TODAY)).toBe('revoked');
    expect(authorisationEffectiveStatus(auth({ status: 'pending' }), TODAY)).toBe('pending');
    expect(authorisationEffectiveStatus(auth({ status: 'valid', expiry_date: null }), TODAY)).toBe('ok');
    expect(authorisationEffectiveStatus(auth({ status: 'valid', expiry_date: '2026-09-01' }), TODAY)).toBe('expired');
  });
});

describe('buildMatrix', () => {
  const directory = [entry(), entry({ id: 'p2', user_id: 'u2', displayName: 'Bob Baker', vessel_id: 'v2', vessel_name: 'Nemo', department: 'Interior', nationality: 'Filipino' })];

  it('builds cells per column and the overall status', () => {
    const rows = buildMatrix({
      directory,
      expiryItems: [
        { item_type: 'passport', profile_id: 'p1', label: 'Passport', due_date: '2028-01-01', days_remaining: 500 },
        { item_type: 'medical', profile_id: 'p1', label: 'Medical certificate', due_date: '2026-10-01', days_remaining: 14 },
        { item_type: 'certificate', profile_id: 'p1', label: 'STCW Basic', due_date: '2026-09-01', days_remaining: -16 },
        { item_type: 'certificate', profile_id: 'p1', label: 'ENG1', due_date: '2027-09-01', days_remaining: 349 },
        { item_type: 'work_authorisation', profile_id: 'p1', label: 'b1_b2 · United States', due_date: '2027-01-01', days_remaining: 106 },
        { item_type: 'passport', profile_id: 'p2', label: 'Passport', due_date: '2029-01-01', days_remaining: 900 },
        { item_type: 'medical', profile_id: 'p2', label: 'Medical certificate', due_date: '2029-01-01', days_remaining: 900 },
      ],
      authorisations: [auth(), auth({ id: 'a2', profile_id: 'p2', authorisation_type: 'seamans_book', country: 'Philippines', expiry_date: null })],
      today: TODAY,
    });
    const ann = rows[0];
    expect(ann.cells.passport.status).toBe('ok');
    expect(ann.cells.medical.status).toBe('critical');
    expect(ann.cells.certificates.status).toBe('expired');
    expect(ann.cells.certificates.items.map((i) => i.label)).toEqual(['STCW Basic', 'ENG1']);
    expect(ann.cells.authorisations.items).toHaveLength(1); // feed row deduplicated against the table row
    expect(ann.cells.visa.status).toBe('missing');
    expect(ann.overall).toBe('expired');
    expect(ann.soonestDays).toBe(-16);
    expect(ann.fullyCompliant).toBe(false);

    const bob = rows[1];
    expect(bob.cells.authorisations.status).toBe('ok');
    expect(bob.cells.authorisations.items[0].dueDate).toBeNull();
    expect(bob.overall).toBe('ok');
    expect(bob.fullyCompliant).toBe(true);
  });

  it('is not fully compliant without a passport or medical', () => {
    const rows = buildMatrix({ directory: [entry()], expiryItems: [{ item_type: 'passport', profile_id: 'p1', label: 'Passport', due_date: '2029-01-01', days_remaining: 900 }], authorisations: [], today: TODAY });
    expect(rows[0].overall).toBe('ok');
    expect(rows[0].fullyCompliant).toBe(false);
  });

  it('respects the selected columns for the overall status', () => {
    const rows = buildMatrix({
      directory: [entry()],
      expiryItems: [
        { item_type: 'passport', profile_id: 'p1', label: 'Passport', due_date: '2029-01-01', days_remaining: 900 },
        { item_type: 'certificate', profile_id: 'p1', label: 'STCW', due_date: '2026-01-01', days_remaining: -200 },
      ],
      authorisations: [],
      columns: ['passport'],
      today: TODAY,
    });
    expect(rows[0].overall).toBe('ok');
  });

  it('ignores revoked authorisations and flags expired ones', () => {
    const rows = buildMatrix({
      directory: [entry()],
      expiryItems: [],
      authorisations: [auth({ status: 'revoked' }), auth({ id: 'a3', status: 'expired', expiry_date: '2026-01-01' })],
      today: TODAY,
    });
    expect(rows[0].cells.authorisations.items).toHaveLength(1);
    expect(rows[0].cells.authorisations.status).toBe('expired');
  });
});

describe('filter / sort / kpis / csv', () => {
  const rows = buildMatrix({
    directory: [
      entry(),
      entry({ id: 'p2', displayName: 'Bob Baker', vessel_id: 'v2', vessel_name: 'Nemo', department: 'Interior' }),
      entry({ id: 'p3', displayName: 'Cy Cole', vessel_id: 'v2', vessel_name: 'Nemo', department: 'Deck' }),
    ],
    expiryItems: [
      { item_type: 'passport', profile_id: 'p1', label: 'Passport', due_date: '2026-09-01', days_remaining: -16 },
      { item_type: 'medical', profile_id: 'p1', label: 'Medical', due_date: '2026-10-01', days_remaining: 14 },
      { item_type: 'passport', profile_id: 'p2', label: 'Passport', due_date: '2026-11-15', days_remaining: 59 },
      { item_type: 'medical', profile_id: 'p2', label: 'Medical', due_date: '2029-01-01', days_remaining: 900 },
      { item_type: 'passport', profile_id: 'p3', label: 'Passport', due_date: '2029-01-01', days_remaining: 900 },
      { item_type: 'medical', profile_id: 'p3', label: 'Medical', due_date: '2029-01-01', days_remaining: 900 },
    ],
    authorisations: [],
    today: TODAY,
  });

  it('sorts worst first then soonest', () => {
    expect(sortByWorst([rows[2], rows[1], rows[0]]).map((r) => r.profileId)).toEqual(['p1', 'p2', 'p3']);
  });

  it('filters by vessel, department, status, withinDays and search', () => {
    expect(filterMatrix(rows, { ...DEFAULT_MATRIX_FILTERS, vesselId: 'v2' }).map((r) => r.profileId)).toEqual(['p2', 'p3']);
    expect(filterMatrix(rows, { ...DEFAULT_MATRIX_FILTERS, department: 'deck' }).map((r) => r.profileId)).toEqual(['p1', 'p3']);
    expect(filterMatrix(rows, { ...DEFAULT_MATRIX_FILTERS, status: 'warning' }).map((r) => r.profileId)).toEqual(['p2']);
    expect(filterMatrix(rows, { ...DEFAULT_MATRIX_FILTERS, withinDays: 30 }).map((r) => r.profileId)).toEqual(['p1']);
    expect(filterMatrix(rows, { ...DEFAULT_MATRIX_FILTERS, withinDays: 90 }).map((r) => r.profileId)).toEqual(['p1', 'p2']);
    expect(filterMatrix(rows, { ...DEFAULT_MATRIX_FILTERS, search: 'nemo' }).map((r) => r.profileId)).toEqual(['p2', 'p3']);
    expect(filterMatrix(rows, { ...DEFAULT_MATRIX_FILTERS, columns: ['medical'], status: 'ok' }).map((r) => r.profileId)).toEqual(['p2', 'p3']);
  });

  it('computes KPIs', () => {
    expect(computeRtwKpis(rows)).toEqual({ fullyCompliant: 1, expired: 1, within30: 1, within90: 1, missingPassportOrMedical: 0 });
  });

  it('exports CSV with escaping', () => {
    const csv = matrixToCsv([{ ...rows[0], name: 'Able, "Ann"' }]);
    const lines = csv.split('\r\n');
    expect(lines[0].startsWith('Crew,Rank,Department,Vessel,Nationality,Overall,Passport status,Passport detail')).toBe(true);
    expect(lines[1].startsWith('"Able, ""Ann""",Deckhand,Deck,Draak,British,Expired,Expired,Passport (2026-09-01)')).toBe(true);
    expect(lines[1]).toContain('Not recorded');
  });
});

describe('requiredAuthorisationsFor', () => {
  it('matches nationalities loosely', () => {
    expect(nationalityMatches('British', ['british'])).toBe(true);
    expect(nationalityMatches('United Kingdom', ['united kingdom'])).toBe(true);
    expect(nationalityMatches(null, ['x'])).toBe(false);
  });

  it('requires US visa for non-US crew and exempts EU crew from Schengen', () => {
    const results = requiredAuthorisationsFor({ regions: ['us', 'schengen'], nationality: 'French', authorisations: [], today: TODAY });
    expect(results.map((r) => [r.rule.region, r.status])).toEqual([
      ['us', 'missing'],
      ['schengen', 'exempt'],
    ]);
  });

  it('is satisfied by a live authorisation and lapsed by an expired one', () => {
    const ok = requiredAuthorisationsFor({ regions: ['us'], nationality: 'Filipino', authorisations: [auth({ authorisation_type: 'c1_d' })], today: TODAY });
    expect(ok[0].status).toBe('ok');
    expect(ok[0].satisfiedBy?.authorisation_type).toBe('c1_d');
    const lapsed = requiredAuthorisationsFor({ regions: ['us'], nationality: 'Filipino', authorisations: [auth({ expiry_date: '2026-01-01' })], today: TODAY });
    expect(lapsed[0].status).toBe('lapsed');
    const schengen = requiredAuthorisationsFor({ regions: ['schengen'], nationality: 'Filipino', authorisations: [auth({ authorisation_type: 'residence_permit', country: 'Spain', expiry_date: null })], today: TODAY });
    expect(schengen[0].status).toBe('ok');
  });
});

describe('form schema', () => {
  it('validates and converts', () => {
    const parsed = authorisationFormSchema.safeParse({ authorisation_type: 'schengen', country: ' France ', reference_number: '', issued_date: '2026-01-01', expiry_date: '2026-06-30', entries: 'multiple', status: 'valid', notes: '' });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(authorisationFormToPayload(parsed.data)).toEqual({
        authorisation_type: 'schengen',
        country: 'France',
        reference_number: null,
        issued_date: '2026-01-01',
        expiry_date: '2026-06-30',
        entries: 'multiple',
        status: 'valid',
        notes: null,
      });
    }
  });

  it('rejects expiry before issue and missing country', () => {
    const bad = authorisationFormSchema.safeParse({ authorisation_type: 'visa', country: '', issued_date: '2026-06-30', expiry_date: '2026-01-01', entries: 'none', status: 'valid' });
    expect(bad.success).toBe(false);
    if (!bad.success) {
      const paths = bad.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('country');
      expect(paths).toContain('expiry_date');
    }
  });

  it('maps a row to form values with safe defaults', () => {
    expect(authorisationToFormValues(null).authorisation_type).toBe('visa');
    expect(authorisationToFormValues(auth({ entries: 'single', status: 'pending' }))).toMatchObject({ entries: 'single', status: 'pending', country: 'United States' });
  });
});
