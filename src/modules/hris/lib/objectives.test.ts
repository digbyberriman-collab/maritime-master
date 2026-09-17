import { describe, expect, it } from 'vitest';
import {
  DEFAULT_OBJECTIVE_FILTERS,
  auditObjectiveSnapshot,
  canDeleteObjective,
  computeObjectiveKpis,
  countByStatus,
  emptyObjectiveFormValues,
  filterObjectives,
  formValuesToObjectivePayload,
  groupByCategory,
  isDueSoon,
  isOverdue,
  objectiveFormSchema,
  objectiveToFormValues,
  sortObjectives,
  statusLabel,
  statusTone,
  weightedCompletion,
  type CrewObjectiveRow,
  type ObjectiveSearchable,
} from '@/modules/hris/lib/objectives';

const TODAY = new Date(2026, 8, 17); // 17 Sep 2026

const row = (overrides: Partial<CrewObjectiveRow> = {}): CrewObjectiveRow => ({
  id: overrides.id ?? 'o1',
  company_id: 'co',
  profile_id: 'p1',
  owner_profile_id: null,
  review_id: null,
  title: 'Complete STCW refresher',
  description: null,
  category: 'training',
  measure: null,
  target_date: null,
  weight: 1,
  progress_pct: 0,
  status: 'not_started',
  linked_course_id: null,
  linked_application_id: null,
  completed_at: null,
  notes: null,
  created_by: 'u1',
  updated_by: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...overrides,
});

const searchable = (overrides: Partial<ObjectiveSearchable> = {}): ObjectiveSearchable => ({
  ...row(overrides),
  crew_name: overrides.crew_name ?? 'Ada Lovelace',
  owner_name: overrides.owner_name ?? null,
});

describe('weightedCompletion', () => {
  it('weights progress by objective weight', () => {
    const value = weightedCompletion([
      row({ weight: 3, progress_pct: 100 }),
      row({ weight: 1, progress_pct: 0 }),
    ]);
    expect(value).toBe(75);
  });

  it('ignores cancelled objectives and returns null when nothing counts', () => {
    expect(weightedCompletion([row({ status: 'cancelled', progress_pct: 100, weight: 10 })])).toBeNull();
    expect(weightedCompletion([])).toBeNull();
    expect(weightedCompletion([row({ weight: 2, progress_pct: 50 }), row({ status: 'cancelled', weight: 10, progress_pct: 100 })])).toBe(50);
  });

  it('clamps out-of-range progress', () => {
    expect(weightedCompletion([row({ weight: 1, progress_pct: 250 })])).toBe(100);
  });
});

describe('overdue and due-soon detection', () => {
  it('flags open objectives past their target date only', () => {
    expect(isOverdue(row({ target_date: '2026-09-16', status: 'in_progress' }), TODAY)).toBe(true);
    expect(isOverdue(row({ target_date: '2026-09-17', status: 'in_progress' }), TODAY)).toBe(false);
    expect(isOverdue(row({ target_date: '2026-09-01', status: 'achieved' }), TODAY)).toBe(false);
    expect(isOverdue(row({ target_date: null, status: 'in_progress' }), TODAY)).toBe(false);
  });

  it('due soon is within 14 days inclusive and not already overdue', () => {
    expect(isDueSoon(row({ target_date: '2026-10-01' }), 14, TODAY)).toBe(true);
    expect(isDueSoon(row({ target_date: '2026-10-02' }), 14, TODAY)).toBe(false);
    expect(isDueSoon(row({ target_date: '2026-09-10' }), 14, TODAY)).toBe(false);
    expect(isDueSoon(row({ target_date: '2026-09-20', status: 'missed' }), 14, TODAY)).toBe(false);
  });
});

describe('statusTone / statusLabel', () => {
  it('maps statuses to tones and surfaces overdue', () => {
    expect(statusTone(row({ status: 'achieved' }), TODAY)).toBe('success');
    expect(statusTone(row({ status: 'missed' }), TODAY)).toBe('danger');
    expect(statusTone(row({ status: 'in_progress' }), TODAY)).toBe('active');
    expect(statusTone(row({ status: 'cancelled' }), TODAY)).toBe('muted');
    expect(statusTone(row({ status: 'not_started' }), TODAY)).toBe('muted');
    expect(statusTone(row({ status: 'not_started', target_date: '2026-09-25' }), TODAY)).toBe('warning');
    expect(statusTone(row({ status: 'in_progress', target_date: '2026-09-01' }), TODAY)).toBe('danger');
    expect(statusLabel(row({ status: 'in_progress', target_date: '2026-09-01' }), TODAY)).toBe('Overdue');
    expect(statusLabel(row({ status: 'not_started' }), TODAY)).toBe('Not started');
  });
});

describe('grouping and sorting', () => {
  it('groups by category in canonical order, skipping empties', () => {
    const groups = groupByCategory([
      row({ id: 'a', category: 'career' }),
      row({ id: 'b', category: 'performance' }),
      row({ id: 'c', category: 'career' }),
      row({ id: 'd', category: 'bogus' }),
    ]);
    expect(groups.map((g) => g.category)).toEqual(['performance', 'career']);
    expect(groups[0].objectives.map((o) => o.id)).toEqual(['b', 'd']);
    expect(groups[1].objectives.map((o) => o.id)).toEqual(['a', 'c']);
  });

  it('sorts open (overdue first) before closed, then by target date', () => {
    const sorted = sortObjectives(
      [
        row({ id: 'done', status: 'achieved', target_date: '2026-01-01' }),
        row({ id: 'later', status: 'in_progress', target_date: '2026-12-01' }),
        row({ id: 'overdue', status: 'in_progress', target_date: '2026-08-01' }),
        row({ id: 'soon', status: 'not_started', target_date: '2026-10-01' }),
        row({ id: 'nodate', status: 'not_started', target_date: null }),
      ],
      TODAY,
    );
    expect(sorted.map((o) => o.id)).toEqual(['overdue', 'soon', 'later', 'nodate', 'done']);
  });

  it('counts by status', () => {
    const counts = countByStatus([row({ status: 'achieved' }), row({ status: 'achieved' }), row({ status: 'missed' }), row({ status: 'weird' })]);
    expect(counts).toEqual({ not_started: 0, in_progress: 0, achieved: 2, missed: 1, cancelled: 0 });
  });
});

describe('computeObjectiveKpis', () => {
  it('computes the overview tiles', () => {
    const kpis = computeObjectiveKpis(
      [
        row({ id: '1', profile_id: 'p1', status: 'in_progress', target_date: '2026-09-25', weight: 1, progress_pct: 50 }),
        row({ id: '2', profile_id: 'p1', status: 'not_started', target_date: '2026-09-01', weight: 1, progress_pct: 0 }),
        row({ id: '3', profile_id: 'p2', status: 'achieved', completed_at: '2026-03-01T00:00:00Z', weight: 1, progress_pct: 100 }),
        row({ id: '4', profile_id: 'p2', status: 'achieved', completed_at: '2025-03-01T00:00:00Z', weight: 1, progress_pct: 100 }),
        row({ id: '5', profile_id: 'p3', status: 'cancelled', weight: 5, progress_pct: 0 }),
      ],
      TODAY,
    );
    expect(kpis.open).toBe(2);
    expect(kpis.dueSoon).toBe(1);
    expect(kpis.overdue).toBe(1);
    expect(kpis.achievedThisYear).toBe(1);
    // p1 = 25%, p2 = 100%, p3 has nothing counted → mean of 25 and 100.
    expect(kpis.avgPdpCompletion).toBe(63);
  });

  it('returns null average when no crew member has a counted objective', () => {
    expect(computeObjectiveKpis([], TODAY).avgPdpCompletion).toBeNull();
  });
});

describe('filterObjectives', () => {
  const rows = [
    searchable({ id: 'a', profile_id: 'p1', status: 'in_progress', category: 'training', owner_profile_id: 'm1', crew_name: 'Ada Lovelace' }),
    searchable({ id: 'b', profile_id: 'p2', status: 'achieved', category: 'career', crew_name: 'Grace Hopper', title: 'Master licence' }),
    searchable({ id: 'c', profile_id: 'p3', status: 'not_started', category: 'training', target_date: '2026-01-01', crew_name: 'Alan Turing' }),
  ];
  const vesselOf = (id: string) => ({ p1: 'v1', p2: 'v2' }[id] ?? null);

  it('applies status, category, owner, crew and vessel filters', () => {
    expect(filterObjectives(rows, DEFAULT_OBJECTIVE_FILTERS, vesselOf, TODAY).map((o) => o.id)).toEqual(['a', 'c']);
    expect(filterObjectives(rows, { ...DEFAULT_OBJECTIVE_FILTERS, status: 'overdue' }, vesselOf, TODAY).map((o) => o.id)).toEqual(['c']);
    expect(filterObjectives(rows, { ...DEFAULT_OBJECTIVE_FILTERS, status: 'all', category: 'career' }, vesselOf, TODAY).map((o) => o.id)).toEqual(['b']);
    expect(filterObjectives(rows, { ...DEFAULT_OBJECTIVE_FILTERS, ownerId: 'm1' }, vesselOf, TODAY).map((o) => o.id)).toEqual(['a']);
    expect(filterObjectives(rows, { ...DEFAULT_OBJECTIVE_FILTERS, status: 'all', crewId: 'p2' }, vesselOf, TODAY).map((o) => o.id)).toEqual(['b']);
    expect(filterObjectives(rows, { ...DEFAULT_OBJECTIVE_FILTERS, status: 'all', vesselId: 'none' }, vesselOf, TODAY).map((o) => o.id)).toEqual(['c']);
    expect(filterObjectives(rows, { ...DEFAULT_OBJECTIVE_FILTERS, status: 'all', vesselId: 'v2' }, vesselOf, TODAY).map((o) => o.id)).toEqual(['b']);
  });

  it('searches title and crew name case-insensitively', () => {
    expect(filterObjectives(rows, { ...DEFAULT_OBJECTIVE_FILTERS, status: 'all', search: 'master' }, vesselOf, TODAY).map((o) => o.id)).toEqual(['b']);
    expect(filterObjectives(rows, { ...DEFAULT_OBJECTIVE_FILTERS, status: 'all', search: 'turing' }, vesselOf, TODAY).map((o) => o.id)).toEqual(['c']);
  });
});

describe('form helpers', () => {
  it('validates title and weight', () => {
    expect(objectiveFormSchema.safeParse(emptyObjectiveFormValues()).success).toBe(false);
    expect(objectiveFormSchema.safeParse(emptyObjectiveFormValues({ title: 'Go' })).success).toBe(true);
    expect(objectiveFormSchema.safeParse(emptyObjectiveFormValues({ title: 'Go', weight: '11' })).success).toBe(false);
    expect(objectiveFormSchema.safeParse(emptyObjectiveFormValues({ title: 'Go', target_date: 'nope' })).success).toBe(false);
  });

  it('round-trips a row through form values and back to a payload', () => {
    const original = row({ owner_profile_id: 'm1', target_date: '2026-11-30', weight: 7, description: 'desc', linked_course_id: 'c1' });
    const values = objectiveToFormValues(original);
    expect(values.weight).toBe('7');
    const payload = formValuesToObjectivePayload({ ...values, notes: '  ', measure: 'Pass exam' });
    expect(payload).toEqual({
      title: 'Complete STCW refresher',
      category: 'training',
      description: 'desc',
      measure: 'Pass exam',
      target_date: '2026-11-30',
      weight: 7,
      owner_profile_id: 'm1',
      linked_course_id: 'c1',
      linked_application_id: null,
      review_id: null,
      notes: null,
    });
  });

  it('delete is admin-or-creator-while-not-started', () => {
    expect(canDeleteObjective(row({ created_by: 'u1' }), { canAdmin: false, userId: 'u1' })).toBe(true);
    expect(canDeleteObjective(row({ created_by: 'u1', status: 'in_progress' }), { canAdmin: false, userId: 'u1' })).toBe(false);
    expect(canDeleteObjective(row({ created_by: 'u2' }), { canAdmin: false, userId: 'u1' })).toBe(false);
    expect(canDeleteObjective(row({ created_by: 'u2', status: 'achieved' }), { canAdmin: true, userId: 'u1' })).toBe(true);
  });

  it('audit snapshot keeps structured fields only', () => {
    const snap = auditObjectiveSnapshot(row({ description: 'long text', progress_pct: 40 }));
    expect(snap.progress_pct).toBe(40);
    expect('description' in snap).toBe(false);
  });
});
