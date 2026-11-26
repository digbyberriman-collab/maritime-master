/**
 * The crew profile's read-only Health and Training tabs (X1-03B; gap/04
 * C60, C62 read-only part; X1 spec risk 15):
 *
 * - lib/vaccines: STORM's standard list of 17, the text matching (combined
 *   vaccines count for each part), the booster arithmetic and every state;
 * - MedicalTab: the medical gate (loading and denied send no request), the
 *   D-01 and error states, no record, the populated summary with only
 *   summary columns selected, a confidential report kept to its number and
 *   date, and links into Health for this person;
 * - TrainingTab: a person without a login has none (no request), courses
 *   and applications, "not shown to you" instead of "no training" for a
 *   viewer who is not entitled, and "See courses" for fleet reach.
 */
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

type Result = { data: unknown; error: unknown };

const h = vi.hoisted(() => ({
  gate: 'granted' as 'granted' | 'loading' | 'denied',
  denied: new Set<string>(),
  fleetReach: false,
  tables: {} as Record<string, Result>,
  selects: {} as Record<string, string>,
  fromCalls: [] as string[],
}));

vi.mock('@/integrations/supabase/client', () => {
  const from = (table: string) => {
    h.fromCalls.push(table);
    const result = (): Result => h.tables[table] ?? { data: [], error: null };
    const chain: Record<string, unknown> = {};
    for (const m of ['eq', 'in', 'or', 'is', 'order', 'limit', 'neq']) chain[m] = () => chain;
    chain.select = (columns: string) => {
      h.selects[table] = columns;
      return chain;
    };
    chain.maybeSingle = () => {
      const r = result();
      return Promise.resolve({ data: Array.isArray(r.data) ? r.data[0] ?? null : r.data, error: r.error });
    };
    chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result()).then(resolve);
    return chain;
  };
  return { supabase: { from, rpc: vi.fn() } };
});
vi.mock('@/lib/permissions/useCan', () => ({
  useCapability: (key: string) => {
    const status = h.gate === 'granted' && h.denied.has(key) ? 'denied' : h.gate;
    return { allowed: status === 'granted', status, reason: 'test' };
  },
  useCan: (key: string) => h.gate === 'granted' && !h.denied.has(key),
}));
vi.mock('@/app/router/useMembershipReach', () => ({ useMembershipReach: () => ({ source: 'legacy', fleetReach: h.fleetReach, reachUnknown: false }) }));

import MedicalTab, { MEDICAL_DENIED_TITLE } from '@/modules/crew/components/profile/MedicalTab';
import TrainingTab, { APPLICATIONS_RESTRICTED, FLEET_TRAINING_PATH, NO_LOGIN_TRAINING } from '@/modules/crew/components/profile/TrainingTab';
import {
  BOOSTER_WINDOW_DAYS,
  STANDARD_VACCINES,
  VACCINATION_STATES,
  VACCINATION_STATE_META,
  addMonthsDateOnly,
  matchStandardVaccines,
  normaliseVaccineText,
  vaccinationRow,
  vaccinationSummary,
  type VaccineDose,
} from '@/modules/crew/lib/vaccines';
import type { CrewProfileSummary } from '@/modules/crew/hooks/useCrewProfile';

// ---------------------------------------------------------------- lib/vaccines

const dose = (over: Partial<VaccineDose>): VaccineDose => ({
  id: 'd',
  vaccine: 'Typhoid',
  doseLabel: null,
  administeredOn: '2026-01-10',
  validUntil: null,
  exempt: false,
  ...over,
});
const vaccine = (key: string) => {
  const v = STANDARD_VACCINES.find((x) => x.key === key);
  if (!v) throw new Error(key);
  return v;
};

describe('the standard list', () => {
  it('has 17 vaccines with unique keys, a name, a schedule sentence and a whole booster interval or none', () => {
    expect(STANDARD_VACCINES).toHaveLength(17);
    expect(new Set(STANDARD_VACCINES.map((v) => v.key)).size).toBe(17);
    for (const v of STANDARD_VACCINES) {
      expect(v.name.trim(), v.key).not.toBe('');
      expect(v.schedule, v.key).toMatch(/\.$/);
      expect(v.boosterMonths === null || (Number.isInteger(v.boosterMonths) && v.boosterMonths > 0), v.key).toBe(true);
      expect(v.patterns.length, v.key).toBeGreaterThan(0);
      // Each vaccine's own name finds it.
      expect(matchStandardVaccines(v.name).map((m) => m.key), v.key).toContain(v.key);
    }
  });

  it('every state has a pill label and tone', () => {
    for (const s of VACCINATION_STATES) expect(VACCINATION_STATE_META[s].label).toBeTruthy();
  });
});

describe('matching recorded vaccine text', () => {
  it('normalises case, accents and separators', () => {
    expect(normaliseVaccineText('  Tétanus / Diphtheria (booster) ')).toBe('tetanus diphtheria booster');
    expect(normaliseVaccineText(null)).toBe('');
  });

  it.each([
    ['Yellow Fever', ['yellow_fever']],
    ['Td/IPV', ['tetanus_diphtheria', 'polio']],
    ['Tetanus / diphtheria / polio', ['tetanus_diphtheria', 'polio']],
    ['Hepatitis A and B', ['hepatitis_a', 'hepatitis_b']],
    ['Hep B', ['hepatitis_b']],
    ['Hepatitis A', ['hepatitis_a']],
    ['MMR', ['mmr']],
    ['Measles, mumps and rubella', ['mmr']],
    ['Flu (seasonal)', ['influenza']],
    ['COVID-19 booster', ['covid_19']],
    ['MenACWY', ['meningococcal_acwy']],
    ['Meningococcal', ['meningococcal_acwy']],
    ['Meningococcal B', []],
    ['BCG', ['tuberculosis_bcg']],
    ['Tick-borne encephalitis', ['tick_borne_encephalitis']],
    ['Japanese encephalitis', ['japanese_encephalitis']],
    ['Shingles', []],
    ['', []],
  ] as const)('%s → %j', (text, keys) => {
    expect(matchStandardVaccines(text).map((v) => v.key)).toEqual(keys);
  });
});

describe('booster arithmetic', () => {
  it.each([
    ['2026-01-31', 1, '2026-02-28'],
    ['2024-01-31', 1, '2024-02-29'],
    ['2026-03-15', 12, '2027-03-15'],
    ['2026-11-30', 3, '2027-02-28'],
    ['2016-02-29', 120, '2026-02-28'],
    ['2026-05-10', -5, '2025-12-10'],
  ] as const)('%s + %i months = %s', (day, months, expected) => {
    expect(addMonthsDateOnly(day, months)).toBe(expected);
  });

  it('refuses a non-date or a fraction of a month', () => {
    expect(() => addMonthsDateOnly('2026-02-30', 1)).toThrow(RangeError);
    expect(() => addMonthsDateOnly('2026-02-01', 1.5)).toThrow(RangeError);
  });
});

describe('vaccinationRow states', () => {
  const today = '2026-11-26';
  it('no dose: not recorded', () => {
    expect(vaccinationRow(vaccine('typhoid'), [], today).state).toBe('not_recorded');
  });
  it('the latest dose exempt: exempt (no date shown)', () => {
    const r = vaccinationRow(vaccine('yellow_fever'), [dose({ exempt: true, vaccine: 'Yellow fever' })], today);
    expect(r).toMatchObject({ state: 'exempt', boosterDue: null });
  });
  it('the record\'s own "valid until" wins over the interval', () => {
    const r = vaccinationRow(vaccine('typhoid'), [dose({ administeredOn: '2026-01-10', validUntil: '2026-12-01' })], today);
    expect(r).toMatchObject({ boosterDue: '2026-12-01', boosterSource: 'record', state: 'due_soon', daysToBooster: 5 });
  });
  it('else the latest dose plus the interval (planned)', () => {
    const r = vaccinationRow(vaccine('typhoid'), [dose({ id: 'old', administeredOn: '2020-01-01' }), dose({ id: 'new', administeredOn: '2026-01-10' })], today);
    expect(r).toMatchObject({ boosterDue: '2029-01-10', boosterSource: 'interval', state: 'valid' });
    expect(r.latest?.id).toBe('new');
  });
  it(`a booster in the next ${BOOSTER_WINDOW_DAYS} days is due; a past one is overdue; the due day itself is still due`, () => {
    expect(vaccinationRow(vaccine('influenza'), [dose({ vaccine: 'Flu', administeredOn: '2025-12-20' })], today).state).toBe('due_soon');
    expect(vaccinationRow(vaccine('influenza'), [dose({ vaccine: 'Flu', administeredOn: '2025-11-25' })], today).state).toBe('overdue');
    expect(vaccinationRow(vaccine('influenza'), [dose({ vaccine: 'Flu', administeredOn: '2025-11-26' })], today).state).toBe('due_soon');
    expect(vaccinationRow(vaccine('influenza'), [dose({ vaccine: 'Flu', administeredOn: '2026-05-01' })], today).state).toBe('valid');
  });
  it('no routine booster: the course is recorded; a booster vaccine without a dose date cannot be dated', () => {
    expect(vaccinationRow(vaccine('mmr'), [dose({ vaccine: 'MMR', administeredOn: null })], today)).toMatchObject({ state: 'complete', boosterDue: null });
    expect(vaccinationRow(vaccine('typhoid'), [dose({ administeredOn: null })], today).state).toBe('date_missing');
  });
});

describe('vaccinationSummary', () => {
  it('fills the 17 rows, lists the rest under other and counts each state', () => {
    const s = vaccinationSummary(
      [
        dose({ id: 'a', vaccine: 'Td/IPV', administeredOn: '2018-06-01' }),
        dose({ id: 'b', vaccine: 'Yellow fever', administeredOn: '2019-03-01' }),
        dose({ id: 'c', vaccine: 'Shingles', administeredOn: '2025-03-01' }),
      ],
      '2026-11-26',
    );
    expect(s.rows).toHaveLength(17);
    expect(s.rows.find((r) => r.vaccine.key === 'tetanus_diphtheria')?.state).toBe('valid');
    expect(s.rows.find((r) => r.vaccine.key === 'polio')?.state).toBe('valid');
    expect(s.rows.find((r) => r.vaccine.key === 'yellow_fever')?.state).toBe('complete');
    expect(s.other.map((d) => d.id)).toEqual(['c']);
    expect(s.counts.valid).toBe(2);
    expect(s.counts.complete).toBe(1);
    expect(s.counts.not_recorded).toBe(14);
    expect(Object.values(s.counts).reduce((a, b) => a + b, 0)).toBe(17);
  });
});

// ---------------------------------------------------------------- the tabs

const PERSON = 'hw-15';
const profile = (over: Partial<CrewProfileSummary> = {}): CrewProfileSummary => ({
  profileId: 'b0000000-0000-4000-8000-000000000015',
  userId: 'a0000000-0000-4000-8000-000000000015',
  firstName: 'Demo',
  lastName: 'Chief Stew',
  preferredName: null,
  displayName: 'Demo Chief Stew',
  avatarUrl: null,
  crewNumber: null,
  positionName: 'Chief Stew',
  positionText: 'Chief Stew',
  departmentKey: 'interior',
  departmentLabel: 'Interior',
  rankTier: 'hod',
  onVessel: true,
  placementKind: 'assignment',
  assignmentId: 'a-1',
  joinDate: '2026-07-01',
  leaveDate: null,
  status: 'on_board',
  statusDetail: null,
  transferVesselId: null,
  leaveCode: null,
  loginState: 'active',
  prev: null,
  next: null,
  memberIndex: 1,
  memberCount: 1,
  isOwn: false,
  canEdit: false,
  canEditSelf: false,
  tabs: ['personal', 'contact', 'training', 'medical', 'activity'],
  source: 'server',
  ...over,
});
const VESSEL = { id: 'v-dra', companyId: 'c-1', name: 'DRAAK' };

const renderTab = (Tab: React.FC<{ profile: CrewProfileSummary; vessel: typeof VESSEL }>, p = profile()) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Tab profile={p} vessel={VESSEL} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

const populatedHealth = () => {
  h.tables = {
    hw_people: { data: [{ id: PERSON, is_active: true }], error: null },
    med_patient_records: { data: [{ blood_group: 'O+', last_reviewed_on: '2026-09-01' }], error: null },
    med_allergies: {
      data: [
        { id: 'al-1', allergen: 'Shellfish', allergy_type: 'food', severity: 'mild', carries_autoinjector: false },
        { id: 'al-2', allergen: 'Peanuts', allergy_type: 'food', severity: 'anaphylaxis', carries_autoinjector: true },
      ],
      error: null,
    },
    med_conditions: { data: [{ id: 'c-1', condition_name: 'Asthma', category: 'respiratory', status: 'managed', affects_fitness: true, requires_medication: true }], error: null },
    med_medications: { data: [{ id: 'm-1', medication_name: 'Inhaler', is_regular: false }], error: null },
    med_vaccinations: {
      data: [
        { id: 'v-1', vaccine: 'Yellow fever', dose_label: null, administered_on: '2019-03-01', valid_until: null, exemption_reason: null },
        { id: 'v-2', vaccine: 'Typhoid', dose_label: 'Booster', administered_on: '2022-01-10', valid_until: null, exemption_reason: null },
      ],
      error: null,
    },
    med_consultations: {
      data: [
        { id: 'r-1', consultation_number: 'MED-2026-014', occurred_at: '2026-10-02T09:30:00Z', is_confidential: false, consultation_type: 'walk_in', outcome: 'resolved', fit_for_duty: 'fit', follow_up_on: null },
        { id: 'r-2', consultation_number: 'MED-2026-009', occurred_at: '2026-08-12T14:00:00Z', is_confidential: true, consultation_type: 'emergency', outcome: 'medevac', fit_for_duty: 'unfit', follow_up_on: '2026-08-20' },
      ],
      error: null,
    },
  };
};

beforeEach(() => {
  h.gate = 'granted';
  h.denied = new Set();
  h.fleetReach = false;
  h.tables = {};
  h.selects = {};
  h.fromCalls = [];
});

describe('MedicalTab: the gate', () => {
  it('loading: no request, a loading state only', () => {
    h.gate = 'loading';
    renderTab(MedicalTab);
    expect(screen.getByLabelText('Loading medical summary')).toBeInTheDocument();
    expect(h.fromCalls).toEqual([]);
  });

  it('no medical clearance: AccessDenied, no request', () => {
    h.denied.add('health.personnel_medical.crew_medical_records.view');
    renderTab(MedicalTab);
    expect(screen.getByRole('heading', { name: MEDICAL_DENIED_TITLE })).toBeInTheDocument();
    expect(h.fromCalls).toEqual([]);
  });

  it('the database refuses (42501): the same no-access state', async () => {
    h.tables.hw_people = { data: null, error: { code: '42501', message: 'permission denied for table hw_people' } };
    renderTab(MedicalTab);
    expect(await screen.findByRole('heading', { name: MEDICAL_DENIED_TITLE })).toBeInTheDocument();
  });
});

describe('MedicalTab: D-01, errors, empty', () => {
  it('a Health table missing: not set up', async () => {
    h.tables.hw_people = { data: [{ id: PERSON, is_active: true }], error: null };
    h.tables.med_vaccinations = { data: null, error: { code: '42P01', message: 'relation "public.med_vaccinations" does not exist' } };
    renderTab(MedicalTab);
    expect(await screen.findByRole('heading', { name: 'Medical records are not set up' })).toBeInTheDocument();
  });

  it('any other error: PageError with Retry', async () => {
    h.tables.hw_people = { data: null, error: { code: '500', message: 'boom' } };
    renderTab(MedicalTab);
    // A real error is retried once before it is shown.
    expect(await screen.findByRole('heading', { name: 'The medical summary could not load' }, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Try again/ })).toBeInTheDocument();
  });

  it('no Health record for the person: says so (with the way in for the medical team)', async () => {
    renderTab(MedicalTab);
    expect(await screen.findByRole('heading', { name: 'No medical record yet' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open Health/ })).toHaveAttribute('href', '/health/medical/personnel/crew-medical-records');
  });
});

describe('MedicalTab: populated', () => {
  it('blood group, allergies worst first, conditions, medication, vaccinations and reports', async () => {
    populatedHealth();
    const { container } = renderTab(MedicalTab);
    expect(await screen.findByRole('heading', { name: 'Medical summary' })).toBeInTheDocument();
    expect(within(container.querySelector('[data-medical-card="blood-group"]') as HTMLElement).getByText('O+')).toBeInTheDocument();
    const allergies = within(container.querySelector('[data-medical-card="allergies"]') as HTMLElement).getAllByRole('listitem');
    expect(allergies.map((li) => li.textContent)).toEqual([expect.stringMatching(/^PeanutsAnaphylaxis.*auto-injector/), expect.stringMatching(/^ShellfishMild/)]);
    expect(screen.getByText('Asthma')).toBeInTheDocument();
    expect(screen.getByText('Affects fitness')).toBeInTheDocument();
    expect(screen.getByText('Inhaler')).toBeInTheDocument();
    expect(screen.getByText('When needed')).toBeInTheDocument();
    // 17 standard rows; yellow fever recorded for life, typhoid's booster overdue (2022 + 3 years).
    expect(container.querySelectorAll('[data-vaccine]')).toHaveLength(17);
    expect(container.querySelector('[data-vaccine="yellow_fever"]')?.getAttribute('data-vaccine-state')).toBe('complete');
    expect(container.querySelector('[data-vaccine="typhoid"]')?.getAttribute('data-vaccine-state')).toBe('overdue');
    expect(container.querySelector('[data-vaccine="rabies"]')?.getAttribute('data-vaccine-state')).toBe('not_recorded');
  });

  it('a confidential report shows its number and date only', async () => {
    populatedHealth();
    const { container } = renderTab(MedicalTab);
    await screen.findByRole('heading', { name: 'Medical summary' });
    const confidential = container.querySelector('[data-medical-report="confidential"]') as HTMLElement;
    expect(confidential).toHaveTextContent('MED-2026-009');
    expect(confidential).toHaveTextContent('Confidential');
    expect(confidential).not.toHaveTextContent(/Medevac|Emergency|Unfit/);
    const open = container.querySelector('[data-medical-report="open"]') as HTMLElement;
    expect(open).toHaveTextContent(/Walk-in.*Resolved.*Fit for duty/);
  });

  it('selects summary columns only: no notes, reactions, treatment, dosage or consultation narrative', async () => {
    populatedHealth();
    renderTab(MedicalTab);
    await screen.findByRole('heading', { name: 'Medical summary' });
    const all = Object.values(h.selects).join(',');
    for (const column of ['notes', 'reaction', 'treatment', 'dosage', 'frequency', 'medical_history', 'presenting_complaint', 'history', 'assessment', 'observations', 'treatment_given', 'critical_alert', 'insurance', 'gp_']) {
      expect(all, column).not.toMatch(new RegExp(`(^|[ ,])${column}`));
    }
    expect(h.selects.med_patient_records).toBe('blood_group, last_reviewed_on');
  });

  it('links into Health for this person; Raise a new case only for someone who may edit', async () => {
    populatedHealth();
    const { unmount } = renderTab(MedicalTab);
    await screen.findByRole('heading', { name: 'Medical summary' });
    expect(screen.getAllByRole('link', { name: /Raise a new case/ })[0]).toHaveAttribute('href', `/health/medical/personnel/incident-and-treatment-history?person=${PERSON}`);
    expect(screen.getByRole('link', { name: 'Edit vaccinations in Health' })).toHaveAttribute('href', `/health/medical/personnel/vaccinations-and-immunisations?person=${PERSON}`);
    unmount();
    h.denied.add('health.personnel_medical.crew_medical_records.edit');
    populatedHealth();
    renderTab(MedicalTab);
    await screen.findByRole('heading', { name: 'Medical summary' });
    expect(screen.queryByRole('link', { name: /Raise a new case/ })).toBeNull();
    expect(screen.getByRole('link', { name: 'Open vaccinations in Health' })).toBeInTheDocument();
  });
});

describe('TrainingTab', () => {
  it('a person without a login has no training records yet: said, and nothing is read', () => {
    renderTab(TrainingTab, profile({ userId: null }));
    expect(screen.getByText(NO_LOGIN_TRAINING)).toBeInTheDocument();
    expect(h.fromCalls).toEqual([]);
  });

  it('lists courses and applications (column-limited)', async () => {
    h.tables.training_records = {
      data: [{ id: 'tr-1', completion_date: '2025-05-02', expiry_date: '2030-05-02', training_provider: 'A training centre', training_courses: { course_name: 'Proficiency in survival craft', course_code: 'PSC' } }],
      error: null,
    };
    h.tables.development_applications = {
      data: [{ id: 'da-1', application_number: 'DEV-2026-004', course_name: 'Wine service', course_provider: 'A school', status: 'hod_review', course_start_date: '2027-01-10', course_end_date: '2027-01-12', submitted_at: '2026-10-01T10:00:00Z' }],
      error: null,
    };
    renderTab(TrainingTab);
    expect(await screen.findByText('Proficiency in survival craft')).toBeInTheDocument();
    expect(screen.getByText('PSC')).toBeInTheDocument();
    expect(await screen.findByText('Wine service')).toBeInTheDocument();
    expect(screen.getByText('HoD review')).toBeInTheDocument();
    expect(h.selects.development_applications).not.toMatch(/usd|amount|comments|reimbursement|denial/);
  });

  it('no applications for a viewer who is not entitled: "not shown to you", never "no training"', async () => {
    h.denied.add('vessel.crew.crew_training.view');
    h.denied.add('fleet.operations.fleet_training.view');
    renderTab(TrainingTab);
    expect(await screen.findByText(APPLICATIONS_RESTRICTED)).toBeInTheDocument();
    expect(screen.queryByText('No training applications yet.')).toBeNull();
  });

  it('no applications for an entitled viewer (or the person): "No training applications yet."', async () => {
    renderTab(TrainingTab);
    expect(await screen.findByText('No training applications yet.')).toBeInTheDocument();
    expect(screen.getByText('No completed courses recorded.')).toBeInTheDocument();
  });

  it('See courses goes to Fleet › Training only for people with fleet reach', async () => {
    const { unmount } = renderTab(TrainingTab);
    await screen.findByText('No training applications yet.');
    expect(screen.queryByRole('link', { name: /See courses/ })).toBeNull();
    unmount();
    h.fleetReach = true;
    renderTab(TrainingTab);
    expect(await screen.findByRole('link', { name: /See courses/ })).toHaveAttribute('href', FLEET_TRAINING_PATH);
  });

  it('a missing table reads not set up; another error is an inline error with Retry', async () => {
    h.tables.training_records = { data: null, error: { code: '42P01', message: 'relation "public.training_records" does not exist' } };
    h.tables.development_applications = { data: null, error: { code: '500', message: 'boom' } };
    renderTab(TrainingTab);
    expect(await screen.findByText('Training records are not set up for this account yet.')).toBeInTheDocument();
    expect(await screen.findByText('The applications could not load')).toBeInTheDocument();
  });
});
