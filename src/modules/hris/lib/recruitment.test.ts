import { describe, expect, it } from 'vitest';
import {
  ACTIVE_STAGES,
  PIPELINE_STAGES,
  buildReference,
  candidateFormSchema,
  candidateFormToPayload,
  candidateMatchScore,
  combineDateTime,
  computeVacancyKpis,
  emptyCandidateFormValues,
  emptyVacancyFormValues,
  filterCandidates,
  filterVacancies,
  DEFAULT_CANDIDATE_FILTERS,
  DEFAULT_VACANCY_FILTERS,
  matchTone,
  nextStages,
  parseScorecard,
  scorecardAverage,
  splitList,
  stageCounts,
  timeInStage,
  vacancyFormSchema,
  vacancyFormToPayload,
  vacancyProgress,
  vacancyTransitions,
  vacancyToFormValues,
  type ApplicationRow,
  type CandidateRow,
  type VacancyRow,
} from '@/modules/hris/lib/recruitment';

const TODAY = new Date(2026, 8, 17); // 17 Sep 2026

const vacancy = (overrides: Partial<VacancyRow> = {}): VacancyRow => ({
  id: 'v1',
  company_id: 'co',
  vessel_id: null,
  reference: null,
  title: 'Second Engineer',
  department: 'Engineering',
  rank: '2nd Engineer',
  pay_grade_id: null,
  contract_type: 'rotational',
  rotation_pattern: null,
  start_date: '2026-10-01',
  end_date: null,
  headcount: 1,
  salary_currency: null,
  salary_min_minor: null,
  salary_max_minor: null,
  description: null,
  requirements: null,
  required_certificates: [],
  status: 'open',
  priority: 'normal',
  hiring_manager_profile_id: null,
  replaces_profile_id: null,
  opened_at: null,
  filled_at: null,
  closed_at: null,
  notes: null,
  created_by: null,
  updated_by: null,
  created_at: '2026-09-01T00:00:00Z',
  updated_at: '2026-09-01T00:00:00Z',
  ...overrides,
});

const candidate = (overrides: Partial<CandidateRow> = {}): CandidateRow => ({
  id: 'c1',
  company_id: 'co',
  first_name: 'Ana',
  last_name: 'Silva',
  preferred_name: null,
  email: null,
  phone: null,
  nationality: null,
  date_of_birth: null,
  current_location: null,
  home_airport: null,
  rank: '2nd Engineer',
  department: 'Engineering',
  years_experience: null,
  source: 'direct',
  agency_name: null,
  referred_by_profile_id: null,
  cv_path: null,
  cv_name: null,
  linkedin_url: null,
  certificates: [],
  languages: [],
  salary_expectation_currency: null,
  salary_expectation_minor: null,
  available_from: null,
  status: 'active',
  rating: null,
  notes: null,
  hired_profile_id: null,
  gdpr_consent_at: null,
  gdpr_retention_until: null,
  created_by: null,
  updated_by: null,
  created_at: '2026-09-01T00:00:00Z',
  updated_at: '2026-09-01T00:00:00Z',
  ...overrides,
});

const application = (overrides: Partial<ApplicationRow> = {}): ApplicationRow => ({
  id: overrides.id ?? 'a1',
  company_id: 'co',
  vacancy_id: 'v1',
  candidate_id: 'c1',
  stage: 'applied',
  rejection_reason: null,
  offer_currency: null,
  offer_base_minor: null,
  offer_start_date: null,
  offer_sent_at: null,
  offer_accepted_at: null,
  applied_at: '2026-09-01T00:00:00Z',
  stage_changed_at: '2026-09-10T00:00:00Z',
  rating: null,
  notes: null,
  created_by: null,
  updated_by: null,
  created_at: '2026-09-01T00:00:00Z',
  updated_at: '2026-09-01T00:00:00Z',
  ...overrides,
});

describe('pipeline stages', () => {
  it('orders the pipeline with six active columns', () => {
    expect(PIPELINE_STAGES.map((s) => s.key)).toEqual([
      'applied', 'screening', 'interview', 'reference_check', 'offer', 'accepted', 'hired', 'rejected', 'withdrawn',
    ]);
    expect(ACTIVE_STAGES).toEqual(['applied', 'screening', 'interview', 'reference_check', 'offer', 'accepted']);
  });

  it('offers only forward moves plus reject / withdraw', () => {
    expect(nextStages('applied')).toEqual(['screening', 'interview', 'reference_check', 'offer', 'accepted', 'rejected', 'withdrawn']);
    expect(nextStages('offer')).toEqual(['accepted', 'rejected', 'withdrawn']);
    expect(nextStages('accepted')).toEqual(['rejected', 'withdrawn']);
  });

  it('never moves into hired manually and lets closed applications reopen', () => {
    expect(nextStages('hired')).toEqual([]);
    expect(nextStages('rejected')).toEqual(['applied']);
    expect(nextStages('withdrawn')).toEqual(['applied']);
    expect(nextStages('bogus')).toEqual([]);
  });

  it('counts applications per stage, ignoring unknown stages', () => {
    const counts = stageCounts([
      application({ stage: 'applied' }),
      application({ stage: 'applied' }),
      application({ stage: 'offer' }),
      application({ stage: 'nonsense' }),
    ]);
    expect(counts.applied).toBe(2);
    expect(counts.offer).toBe(1);
    expect(counts.hired).toBe(0);
  });

  it('measures days in the current stage and never goes negative', () => {
    expect(timeInStage(application({ stage_changed_at: '2026-09-10T08:00:00Z' }), TODAY)).toBe(7);
    expect(timeInStage(application({ stage_changed_at: '2026-09-20T08:00:00Z' }), TODAY)).toBe(0);
  });
});

describe('vacancyProgress', () => {
  it('reports hires against headcount', () => {
    const progress = vacancyProgress(vacancy({ headcount: 3 }), [
      application({ stage: 'hired' }),
      application({ stage: 'offer' }),
      application({ stage: 'accepted' }),
      application({ stage: 'rejected' }),
    ]);
    expect(progress).toEqual({ hired: 1, headcount: 3, remaining: 2, pct: 33, inOffer: 2 });
  });

  it('caps at 100% and treats a bad headcount as one', () => {
    expect(vacancyProgress(vacancy({ headcount: 0 }), [application({ stage: 'hired' }), application({ stage: 'hired' })]).pct).toBe(100);
  });
});

describe('vacancyTransitions', () => {
  it('follows the lifecycle', () => {
    expect(vacancyTransitions('draft')).toEqual(['open', 'cancelled']);
    expect(vacancyTransitions('open')).toEqual(['on_hold', 'filled', 'cancelled']);
    expect(vacancyTransitions('on_hold')).toEqual(['open', 'cancelled']);
    expect(vacancyTransitions('filled')).toEqual(['open']);
    expect(vacancyTransitions('cancelled')).toEqual(['draft']);
    expect(vacancyTransitions('x')).toEqual([]);
  });
});

describe('candidateMatchScore', () => {
  it('scores 100 when everything matches', () => {
    const result = candidateMatchScore(
      candidate({ certificates: ['STCW Basic Training', 'ENG1'], available_from: '2026-09-20' }),
      vacancy({ required_certificates: ['STCW basic training', 'ENG1'] }),
    );
    expect(result.score).toBe(100);
    expect(result.reasons.every((r) => r.met)).toBe(true);
    expect(result.reasons.map((r) => r.key)).toEqual(['rank', 'department', 'certificates', 'availability']);
  });

  it('gives partial credit for partial certificate coverage and late availability', () => {
    const result = candidateMatchScore(
      candidate({ rank: 'Chief Engineer', certificates: ['ENG1'], available_from: '2026-10-15' }),
      vacancy({ required_certificates: ['STCW', 'ENG1'] }),
    );
    // rank 0/35, department 20/20, certificates 15/30, availability 0/15 → 35/100
    expect(result.score).toBe(35);
    const certs = result.reasons.find((r) => r.key === 'certificates');
    expect(certs?.met).toBe(false);
    expect(certs?.label).toContain('missing: STCW');
    expect(result.reasons.find((r) => r.key === 'availability')?.label).toContain('14 days after');
  });

  it('gives half credit when availability is unknown', () => {
    const result = candidateMatchScore(candidate({ rank: null, department: null }), vacancy({ rank: null, department: null }));
    // only availability applies: 0.5 × 15 / 15
    expect(result.score).toBe(50);
    expect(result.reasons).toHaveLength(1);
  });

  it('returns null when the vacancy defines nothing to match', () => {
    const result = candidateMatchScore(candidate(), vacancy({ rank: null, department: null, start_date: null }));
    expect(result.score).toBeNull();
    expect(result.reasons).toEqual([]);
    expect(matchTone(null)).toBe('none');
  });

  it('maps scores to tones', () => {
    expect(matchTone(95)).toBe('strong');
    expect(matchTone(65)).toBe('good');
    expect(matchTone(45)).toBe('weak');
    expect(matchTone(10)).toBe('poor');
  });
});

describe('buildReference', () => {
  it('uses the first three letters of the vessel name without the M/Y prefix', () => {
    expect(buildReference({ name: 'M/Y Draak' }, 4)).toBe('DRA-0004');
    expect(buildReference('MY Sea Breeze', 12)).toBe('SEA-0012');
    expect(buildReference('S/Y Ax', 1)).toBe('AXX-0001');
  });

  it('falls back to VAC without a vessel', () => {
    expect(buildReference(null, 7)).toBe('VAC-0007');
    expect(buildReference('', 0)).toBe('VAC-0001');
  });
});

describe('computeVacancyKpis', () => {
  it('summarises open, urgent, offers, hires this year and days to fill', () => {
    const kpis = computeVacancyKpis(
      [
        vacancy({ status: 'open', priority: 'urgent' }),
        vacancy({ status: 'open', priority: 'normal' }),
        vacancy({ status: 'filled', opened_at: '2026-06-01T00:00:00Z', filled_at: '2026-07-01T00:00:00Z' }),
        vacancy({ status: 'filled', opened_at: null, created_at: '2026-08-01T00:00:00Z', filled_at: '2026-08-11T00:00:00Z' }),
        vacancy({ status: 'cancelled', priority: 'urgent' }),
      ],
      [
        application({ stage: 'offer' }),
        application({ stage: 'hired', stage_changed_at: '2026-03-01T00:00:00Z' }),
        application({ stage: 'hired', stage_changed_at: '2025-12-01T00:00:00Z' }),
      ],
      TODAY,
    );
    expect(kpis).toEqual({ openVacancies: 2, urgent: 1, offersOut: 1, hiredThisYear: 1, avgDaysToFill: 20 });
  });

  it('reports null average when nothing has been filled', () => {
    expect(computeVacancyKpis([vacancy()], [], TODAY).avgDaysToFill).toBeNull();
  });
});

describe('filters', () => {
  const rows = [
    { ...vacancy({ id: 'a', status: 'open', vessel_id: 'ves1', department: 'Deck', priority: 'urgent', title: 'Bosun' }), vessel_name: 'Draak' },
    { ...vacancy({ id: 'b', status: 'filled', vessel_id: null, department: 'Interior', title: 'Chief Stew' }), vessel_name: null },
    { ...vacancy({ id: 'c', status: 'draft', vessel_id: 'ves2', department: 'Deck', title: 'Deckhand', reference: 'SEA-0002' }), vessel_name: 'Sea Breeze' },
  ];

  it('filters vacancies by status, vessel, department, priority and search', () => {
    expect(filterVacancies(rows, DEFAULT_VACANCY_FILTERS).map((v) => v.id)).toEqual(['a', 'c']);
    expect(filterVacancies(rows, { ...DEFAULT_VACANCY_FILTERS, status: 'all' })).toHaveLength(3);
    expect(filterVacancies(rows, { ...DEFAULT_VACANCY_FILTERS, status: 'all', vesselId: 'none' }).map((v) => v.id)).toEqual(['b']);
    expect(filterVacancies(rows, { ...DEFAULT_VACANCY_FILTERS, department: 'Deck', priority: 'urgent' }).map((v) => v.id)).toEqual(['a']);
    expect(filterVacancies(rows, { ...DEFAULT_VACANCY_FILTERS, status: 'all', search: 'sea-0002' }).map((v) => v.id)).toEqual(['c']);
    expect(filterVacancies(rows, { ...DEFAULT_VACANCY_FILTERS, status: 'all', search: 'draak' }).map((v) => v.id)).toEqual(['a']);
  });

  it('filters candidates', () => {
    const cands = [
      candidate({ id: '1', status: 'active', rank: 'Bosun', department: 'Deck', source: 'agency', agency_name: 'Blue Crew' }),
      candidate({ id: '2', status: 'archived', rank: 'Bosun', department: 'Deck', source: 'direct' }),
      candidate({ id: '3', status: 'active', rank: 'Chef', department: 'Galley', source: 'referral', certificates: ['Ship\'s Cook'] }),
    ];
    expect(filterCandidates(cands, DEFAULT_CANDIDATE_FILTERS).map((c) => c.id)).toEqual(['1', '3']);
    expect(filterCandidates(cands, { ...DEFAULT_CANDIDATE_FILTERS, status: 'all', rank: 'Bosun' }).map((c) => c.id)).toEqual(['1', '2']);
    expect(filterCandidates(cands, { ...DEFAULT_CANDIDATE_FILTERS, source: 'referral' }).map((c) => c.id)).toEqual(['3']);
    expect(filterCandidates(cands, { ...DEFAULT_CANDIDATE_FILTERS, search: 'blue crew' }).map((c) => c.id)).toEqual(['1']);
    expect(filterCandidates(cands, { ...DEFAULT_CANDIDATE_FILTERS, search: "ship's cook" }).map((c) => c.id)).toEqual(['3']);
  });
});

describe('scorecards', () => {
  it('parses stored JSON defensively', () => {
    const rows = parseScorecard([
      { competency: 'Safety', score: 4, comment: 'Good' },
      { competency: 'Teamwork', score: 9 },
      { competency: 42 },
      'junk',
    ]);
    expect(rows).toEqual([
      { competency: 'Safety', score: 4, comment: 'Good' },
      { competency: 'Teamwork', score: null, comment: '' },
    ]);
    expect(parseScorecard(null)).toEqual([]);
    expect(parseScorecard({ competency: 'x' })).toEqual([]);
  });

  it('averages rated rows only', () => {
    expect(scorecardAverage([
      { competency: 'a', score: 4, comment: '' },
      { competency: 'b', score: 5, comment: '' },
      { competency: 'c', score: null, comment: '' },
    ])).toBe(4.5);
    expect(scorecardAverage([{ competency: 'a', score: null, comment: '' }])).toBeNull();
  });
});

describe('forms', () => {
  it('splits comma / newline lists and dedupes case-insensitively', () => {
    expect(splitList('STCW, ENG1\nstcw;  Yachtmaster ')).toEqual(['STCW', 'ENG1', 'Yachtmaster']);
    expect(splitList(null)).toEqual([]);
  });

  it('round-trips a vacancy through the form', () => {
    const row = vacancy({
      reference: 'DRA-0001',
      vessel_id: 'ves1',
      salary_currency: 'EUR',
      salary_min_minor: 450000,
      salary_max_minor: 520000,
      required_certificates: ['STCW', 'ENG1'],
      headcount: 2,
      priority: 'high',
    });
    const values = vacancyToFormValues(row);
    expect(values.salary_min).toBe('4500.00');
    expect(values.required_certificates).toBe('STCW, ENG1');
    expect(vacancyFormSchema.safeParse(values).success).toBe(true);
    const payload = vacancyFormToPayload(values);
    expect(payload.salary_min_minor).toBe(450000);
    expect(payload.salary_max_minor).toBe(520000);
    expect(payload.required_certificates).toEqual(['STCW', 'ENG1']);
    expect(payload.headcount).toBe(2);
    expect(payload.status).toBe('open');
  });

  it('rejects an inverted salary range or date range and a range without currency', () => {
    const base = emptyVacancyFormValues({ title: 'Bosun' });
    expect(vacancyFormSchema.safeParse({ ...base, salary_currency: 'EUR', salary_min: '5000', salary_max: '4000' }).success).toBe(false);
    expect(vacancyFormSchema.safeParse({ ...base, start_date: '2026-10-01', end_date: '2026-09-01' }).success).toBe(false);
    expect(vacancyFormSchema.safeParse({ ...base, salary_min: '5000' }).success).toBe(false);
    expect(vacancyFormSchema.safeParse({ ...base, salary_currency: 'EUR', salary_min: '4000', salary_max: '5000' }).success).toBe(true);
  });

  it('builds a candidate payload and only stamps consent once', () => {
    const values = emptyCandidateFormValues({
      first_name: ' Ana ',
      last_name: 'Silva',
      email: 'Ana@Example.com',
      source: 'agency',
      agency_name: 'Blue Crew',
      referred_by_profile_id: 'p9',
      certificates: 'STCW, ENG1',
      years_experience: '7.25',
      rating: '4',
      gdpr_consent: true,
      salary_expectation_currency: 'usd',
      salary_expectation: '6,500',
    });
    expect(candidateFormSchema.safeParse(values).success).toBe(true);
    const now = new Date('2026-09-17T10:00:00Z');
    const fresh = candidateFormToPayload(values, { now });
    expect(fresh.first_name).toBe('Ana');
    expect(fresh.email).toBe('ana@example.com');
    expect(fresh.agency_name).toBe('Blue Crew');
    expect(fresh.referred_by_profile_id).toBeNull(); // only kept for referrals
    expect(fresh.certificates).toEqual(['STCW', 'ENG1']);
    expect(fresh.years_experience).toBe(7.3);
    expect(fresh.rating).toBe(4);
    expect(fresh.salary_expectation_minor).toBe(650000);
    expect(fresh.gdpr_consent_at).toBe(now.toISOString());

    const kept = candidateFormToPayload(values, { existingConsentAt: '2026-01-01T00:00:00Z', now });
    expect(kept.gdpr_consent_at).toBe('2026-01-01T00:00:00Z');
    const withdrawn = candidateFormToPayload({ ...values, gdpr_consent: false }, { existingConsentAt: '2026-01-01T00:00:00Z', now });
    expect(withdrawn.gdpr_consent_at).toBeNull();
  });

  it('validates candidate email and experience', () => {
    const base = emptyCandidateFormValues({ first_name: 'A', last_name: 'B' });
    expect(candidateFormSchema.safeParse({ ...base, email: 'not-an-email' }).success).toBe(false);
    expect(candidateFormSchema.safeParse({ ...base, years_experience: '99' }).success).toBe(false);
    expect(candidateFormSchema.safeParse(base).success).toBe(true);
  });

  it('combines a local date and time into an ISO timestamp', () => {
    const iso = combineDateTime('2026-09-20', '14:30');
    const d = new Date(iso);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(8);
    expect(d.getDate()).toBe(20);
    expect(d.getHours()).toBe(14);
    expect(d.getMinutes()).toBe(30);
  });
});
