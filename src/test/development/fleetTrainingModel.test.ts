/**
 * The pure model behind Fleet › Training and the vessel Crew Training
 * register (X5-07B; gap/02 TR1–TR3, TR8; gap/04 C62): which applications a
 * register counts, the URL filters, money per currency (never converted),
 * the by-vessel breakdown, the "awaiting approval > 7 days" list with its
 * approver level, crew proposals, phases, and the settings / correction
 * form conversions.
 */
import { describe, expect, it } from 'vitest';
import {
  APPROVER_PHRASES,
  STATUS_GROUPS,
  STATUS_GROUP_STATUSES,
  amountsByCurrency,
  applyRegisterFilters,
  approverLevel,
  countsInFleetRegister,
  courseProposals,
  formatCurrencyTotals,
  isClawbackActive,
  parseRegisterFilters,
  parseTrainingTab,
  registerFiltersToParams,
  staleApplications,
  sumByCurrency,
  trainingCounts,
  trainingPhase,
  vesselBreakdown,
  type FleetApplicationRow,
} from '@/modules/development/components/training/fleetTrainingModel';
import { changedSettings, settingsFormDefaults, settingsFormSchema } from '@/modules/development/components/training/settingsForm';
import { correctionDefaults, correctionPayload, correctionSchema } from '@/modules/development/components/training/correctionSchema';
import { APPLICATION_STATUSES } from '@/modules/development/lib/applicationMachine';
import { PROGRAM_POLICY_EXTRA_DEFAULTS, PROGRAM_SETTINGS_DEFAULTS, programSettingsSchema } from '@/modules/development/lib/settingsSchema';
import { FLEET_TRAINING_TABS } from '@/modules/development/paths';
import { V, application, daysAgo } from './fakeTrainingDb';

const row = (id: string, over: Record<string, unknown> = {}) => application(id, over) as unknown as FleetApplicationRow;
const VESSELS = [
  { id: V.dra, name: 'DRAAK', code: 'DRA' },
  { id: V.hyd, name: 'HYDRA', code: 'HYD' },
];

describe('tabs', () => {
  it('knows the five tabs and nothing else', () => {
    expect(FLEET_TRAINING_TABS).toEqual(['overview', 'by-vessel', 'applications', 'catalogue', 'settings']);
    for (const tab of FLEET_TRAINING_TABS) expect(parseTrainingTab(tab)).toBe(tab);
    for (const bad of [undefined, null, '', 'Overview', 'admin', 'budget']) expect(parseTrainingTab(bad)).toBeNull();
  });
});

describe('what a fleet register counts', () => {
  it('leaves out drafts and voided applications, keeps every other status', () => {
    for (const status of APPLICATION_STATUSES) expect(countsInFleetRegister(status)).toBe(status !== 'draft' && status !== 'voided');
  });

  it('the status groups cover every counted status exactly once', () => {
    const grouped = STATUS_GROUPS.flatMap((g) => STATUS_GROUP_STATUSES[g]);
    expect(new Set(grouped).size).toBe(grouped.length);
    expect([...grouped].sort()).toEqual(APPLICATION_STATUSES.filter(countsInFleetRegister).sort());
  });
});

describe('money per currency (never converted)', () => {
  it('counts a USD application as USD, the food per diem per course day', () => {
    expect([...amountsByCurrency(row('1'))]).toEqual([['USD', 1000 + 200 + 300 + 150]]);
  });

  it('keeps the parts typed in another currency in that currency, the rest in USD', () => {
    const eur = row('2', { application_currency: 'EUR', tuition_local_amount: 900, travel_local_amount: null, accommodation_local_amount: 280, estimated_food_per_diem_usd: 0 });
    expect(Object.fromEntries(amountsByCurrency(eur))).toEqual({ EUR: 1180, USD: 200 });
  });

  it('sums by currency, USD first, then alphabetical', () => {
    const totals = sumByCurrency([
      row('1'),
      row('2', { application_currency: 'GBP', tuition_local_amount: 100, travel_local_amount: 10, accommodation_local_amount: 0, estimated_food_per_diem_usd: null }),
      row('3', { application_currency: 'EUR', tuition_local_amount: 50, travel_local_amount: 5, accommodation_local_amount: 5, estimated_food_per_diem_usd: null }),
    ]);
    expect(formatCurrencyTotals(totals)).toBe('USD 1,650 · EUR 60 · GBP 110');
    expect(formatCurrencyTotals(new Map())).toBeNull();
  });

  it('treats an unknown currency code as USD rather than inventing one', () => {
    expect([...amountsByCurrency(row('4', { application_currency: 'euro', tuition_local_amount: 999 })).keys()]).toEqual(['USD']);
  });
});

describe('clawback', () => {
  const today = '2026-11-26';
  it('is active for a reimbursed or closed Professional or Extracurricular course until its end date', () => {
    expect(isClawbackActive({ status: 'reimbursed', category: 'professional', clawback_end_date: '2027-03-01' }, today)).toBe(true);
    expect(isClawbackActive({ status: 'closed', category: 'extracurricular', clawback_end_date: today }, today)).toBe(true);
    expect(isClawbackActive({ status: 'reimbursed', category: 'professional', clawback_end_date: '2026-11-25' }, today)).toBe(false);
    expect(isClawbackActive({ status: 'completed', category: 'professional', clawback_end_date: '2027-03-01' }, today)).toBe(false);
  });

  it('never applies to Company-required or Mandatory courses', () => {
    expect(isClawbackActive({ status: 'reimbursed', category: 'mandatory', clawback_end_date: '2027-03-01' }, today)).toBe(false);
    expect(isClawbackActive({ status: 'reimbursed', category: 'fleet_organised', clawback_end_date: '2027-03-01' }, today)).toBe(false);
  });
});

describe('register filters in the URL', () => {
  it('round-trips, keeps other parameters and ignores unknown values', () => {
    const params = registerFiltersToParams(
      { vessel: 'DRA', category: 'mandatory', status: 'awaiting', clawbackActive: true, q: ' fire ' },
      new URLSearchParams('application=a1'),
    );
    expect(params.toString()).toBe('application=a1&vessel=dra&category=mandatory&status=awaiting&clawback=active&q=fire');
    expect(parseRegisterFilters(params)).toEqual({ vessel: 'DRA', category: 'mandatory', status: 'awaiting', clawbackActive: true, q: 'fire' });
    expect(parseRegisterFilters(new URLSearchParams('vessel=../x&category=bogus&status=voided&clawback=yes'))).toEqual({
      vessel: null,
      category: null,
      status: null,
      clawbackActive: false,
      q: '',
    });
  });

  it('filters by vessel code, category, status group, clawback and search; an unknown code keeps nothing', () => {
    const rows = [
      row('1'),
      row('2', { vessel_id: V.hyd, category: 'mandatory', status: 'approved', course_name: 'Advanced firefighting' }),
      row('3', { status: 'reimbursed', clawback_end_date: '2027-06-01' }),
      row('4', { status: 'draft' }),
      row('5', { status: 'voided' }),
    ];
    const today = '2026-11-26';
    const base = { vessel: null, category: null, status: null, clawbackActive: false, q: '' };
    expect(applyRegisterFilters(rows, base, VESSELS, today).map((r) => r.id)).toEqual(['1', '2', '3']);
    expect(applyRegisterFilters(rows, { ...base, vessel: 'HYD' }, VESSELS, today).map((r) => r.id)).toEqual(['2']);
    expect(applyRegisterFilters(rows, { ...base, vessel: 'ZZZ' }, VESSELS, today)).toEqual([]);
    expect(applyRegisterFilters(rows, { ...base, category: 'mandatory' }, VESSELS, today).map((r) => r.id)).toEqual(['2']);
    expect(applyRegisterFilters(rows, { ...base, status: 'completed' }, VESSELS, today).map((r) => r.id)).toEqual(['3']);
    expect(applyRegisterFilters(rows, { ...base, clawbackActive: true }, VESSELS, today).map((r) => r.id)).toEqual(['3']);
    expect(applyRegisterFilters(rows, { ...base, q: 'FIREFIGHT' }, VESSELS, today).map((r) => r.id)).toEqual(['2']);
  });
});

describe('overview counts and by vessel', () => {
  const today = '2026-11-26';
  const rows = [
    row('1', { status: 'hod_review' }),
    row('2', { status: 'captain_purser_review', vessel_id: V.hyd }),
    row('3', { status: 'approved', category: 'mandatory' }),
    row('4', { status: 'completed', vessel_id: V.hyd, application_currency: 'EUR', tuition_local_amount: 500, travel_local_amount: 0, accommodation_local_amount: 0, estimated_food_per_diem_usd: null }),
    row('5', { status: 'rejected' }),
    row('6', { status: 'voided' }),
    row('7', { status: 'enrolled', vessel_id: 'v-elsewhere' }),
  ];

  it('counts by status group and category, never drafts or voided, spend only for approved and completed', () => {
    const c = trainingCounts(rows, today);
    expect(c).toMatchObject({ total: 6, awaiting: 2, approved: 2, completed: 1, rejected: 1, returned: 0, cancelled: 0 });
    expect(c.byCategory).toEqual({ fleet_organised: 0, mandatory: 1, professional: 5, extracurricular: 0 });
    expect(Object.fromEntries(c.committed)).toEqual({ USD: 1650 * 2, EUR: 500 });
  });

  it('gives one row per listed vessel, plus Other vessels for the rest', () => {
    const table = vesselBreakdown(rows, VESSELS);
    expect(table.map((r) => [r.name, r.awaiting, r.approved, r.completed])).toEqual([
      ['DRAAK', 1, 1, 0],
      ['HYDRA', 1, 0, 1],
      ['Other vessels', 0, 1, 0],
    ]);
    expect(Object.fromEntries(table[1].spend)).toEqual({ EUR: 500 });
    expect(vesselBreakdown([], VESSELS).map((r) => r.name)).toEqual(['DRAAK', 'HYDRA']);
  });
});

describe('awaiting approval for more than 7 days', () => {
  const now = new Date('2026-11-26T12:00:00Z');
  const at = (days: number) => daysAgo(days, now.getTime());

  it('lists only approval stages waiting more than 7 days, longest first, with the approver level', () => {
    const rows = [
      row('1', { status: 'hod_review', stage_entered_at: at(8) }),
      row('2', { status: 'captain_purser_review', stage_entered_at: at(20), captain_decision: 'approved' }),
      row('3', { status: 'hod_review', stage_entered_at: at(6) }),
      row('4', { status: 'approved', stage_entered_at: at(40) }),
    ];
    const stale = staleApplications(rows, 'both', now);
    expect(stale.map((s) => [s.row.id, s.waitingDays, s.approver])).toEqual([
      ['2', 20, 'Purser'],
      ['1', 8, 'Head of department'],
    ]);
    expect(staleApplications(rows, 'either', now)[0].approver).toBe('Captain or Purser');
  });

  it('falls back to the submission date before stage tracking is set up', () => {
    const stale = staleApplications([row('1', { status: 'submitted', stage_entered_at: null, submitted_at: at(10) })], 'both', now);
    expect(stale).toHaveLength(1);
    expect(stale[0].exact).toBe(false);
  });

  it('words every approver level', () => {
    expect(approverLevel({ status: 'captain_purser_review' }, 'both')).toBe('Captain and Purser');
    expect(approverLevel({ status: 'captain_purser_review', purser_decision: 'approved' }, 'both')).toBe('Captain');
    expect(approverLevel({ status: 'enrolled' }, 'both')).toBeNull();
    for (const phrase of Object.values(APPROVER_PHRASES)) expect(phrase).toMatch(/^(With the|Waiting for)/);
  });
});

describe('crew proposals', () => {
  it('are submitted custom courses not yet in the catalogue', () => {
    const rows = [
      row('1', { is_custom_course: true, course_id: null }),
      row('2', { is_custom_course: true, course_id: 'course-9' }),
      row('3', { is_custom_course: true, course_id: null, status: 'draft' }),
      row('4', { is_custom_course: false, course_id: null }),
    ];
    expect(courseProposals(rows).map((r) => r.id)).toEqual(['1']);
  });
});

describe('phase (vessel register)', () => {
  const today = '2026-11-26';
  it('is completed for a completed application, otherwise from the dates', () => {
    expect(trainingPhase({ status: 'reimbursed', course_start_date: '2027-01-01', course_end_date: null }, today)).toBe('completed');
    expect(trainingPhase({ status: 'approved', course_start_date: null, course_end_date: null }, today)).toBe('unscheduled');
    expect(trainingPhase({ status: 'approved', course_start_date: '2026-12-01', course_end_date: '2026-12-03' }, today)).toBe('upcoming');
    expect(trainingPhase({ status: 'enrolled', course_start_date: '2026-11-25', course_end_date: '2026-11-27' }, today)).toBe('current');
    expect(trainingPhase({ status: 'enrolled', course_start_date: '2026-11-26', course_end_date: null }, today)).toBe('current');
    expect(trainingPhase({ status: 'enrolled', course_start_date: '2026-11-01', course_end_date: '2026-11-02' }, today)).toBe('completed');
  });
});

describe('settings form', () => {
  it('starts from the column defaults when the company has no row', () => {
    const v = settingsFormDefaults(null, null);
    expect(v).toMatchObject({ ...PROGRAM_SETTINGS_DEFAULTS, final_approval_mode: PROGRAM_POLICY_EXTRA_DEFAULTS.final_approval_mode, fx: [] });
    expect(changedSettings(v, v)).toBeNull();
  });

  it('sends only what changed, as the definer takes it', () => {
    const initial = settingsFormDefaults(null, { ...PROGRAM_POLICY_EXTRA_DEFAULTS, fx_overrides: { EUR: 1.08 } });
    const next = { ...initial, final_approval_mode: 'either' as const, clawback_months: 6, fx: [...initial.fx, { code: 'GBP', rate: 1.27 }] };
    const payload = changedSettings(next, initial);
    expect(payload).toEqual({ final_approval_mode: 'either', clawback_months: 6, fx_overrides: { EUR: 1.08, GBP: 1.27 } });
    expect(programSettingsSchema.safeParse(payload).success).toBe(true);
    expect(changedSettings({ ...initial, fx: [...initial.fx].reverse() }, initial)).toBeNull();
  });

  it('refuses a currency listed twice and a bad code', () => {
    const base = settingsFormDefaults(null, null);
    expect(settingsFormSchema.safeParse({ ...base, fx: [{ code: 'EUR', rate: 1 }, { code: 'eur', rate: 2 }] }).success).toBe(false);
    expect(settingsFormSchema.safeParse({ ...base, fx: [{ code: 'EU', rate: 1 }] }).success).toBe(false);
    expect(settingsFormSchema.safeParse({ ...base, fx: [{ code: 'EUR', rate: 0 }] }).success).toBe(false);
  });
});

describe('correct details (edit_fields)', () => {
  const app = { course_name: 'Advanced firefighting', course_provider: 'Sea School', course_start_date: '2026-12-01', course_end_date: '2026-12-03', category: 'mandatory', estimated_tuition_usd: 900 };

  it('sends only the fields that changed, with the note', () => {
    const values = correctionSchema.parse({ ...correctionDefaults(app), course_end_date: '2026-12-04', estimated_tuition_usd: '950', comment: 'Provider moved the dates' });
    expect(correctionPayload(values, app)).toEqual({ fields: { course_end_date: '2026-12-04', estimated_tuition_usd: 950 }, comment: 'Provider moved the dates' });
    expect(correctionPayload(correctionSchema.parse(correctionDefaults(app)), app)).toBeNull();
  });

  it('refuses an end before the start and a blank course name', () => {
    expect(correctionSchema.safeParse({ ...correctionDefaults(app), course_end_date: '2026-11-30' }).success).toBe(false);
    expect(correctionSchema.safeParse({ ...correctionDefaults(app), course_name: '  ' }).success).toBe(false);
  });
});

describe('course dates', () => {
  it('read as short as they stay clear, never moving a day', async () => {
    const { formatCourseDates } = await import('@/modules/development/components/training/fleetTrainingModel');
    expect(formatCourseDates('2026-03-03', '2026-03-07')).toBe('3 – 7 Mar 2026');
    expect(formatCourseDates('2026-02-28', '2026-03-02')).toBe('28 Feb – 2 Mar 2026');
    expect(formatCourseDates('2026-12-30', '2027-01-02')).toBe('30 Dec 2026 – 2 Jan 2027');
    expect(formatCourseDates('2026-12-30', null)).toBe('30 Dec 2026');
    expect(formatCourseDates('2026-12-30', '2026-12-30')).toBe('30 Dec 2026');
    expect(formatCourseDates(null, '2026-12-30')).toBeNull();
  });
});
