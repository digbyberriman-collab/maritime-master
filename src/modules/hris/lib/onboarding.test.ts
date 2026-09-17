import { describe, expect, it } from 'vitest';
import {
  canCompleteItem,
  completionPercent,
  computeOnboardingKpis,
  computeReadinessScore,
  countOverdueItems,
  countTemplateItems,
  filterJoiners,
  groupItemsBySection,
  isItemOverdue,
  itemTone,
  mergeJoinerSources,
  nextSortOrder,
  parseTemplateSections,
  serialiseTemplateSections,
  validateTemplate,
  DEFAULT_JOINER_FILTERS,
  type OnboardingItemRow,
  type OnboardingRecordRow,
  type TemplateSection,
} from '@/modules/hris/lib/onboarding';

const TODAY = new Date(2026, 8, 17); // 17 Sep 2026

const item = (overrides: Partial<OnboardingItemRow> = {}): OnboardingItemRow => ({
  id: overrides.id ?? 'i1',
  record_id: 'r1',
  company_id: 'co',
  section: 'Before joining',
  title: 'Item',
  owner: 'hr',
  due_date: null,
  required: true,
  sort_order: 1,
  completed: false,
  completed_at: null,
  completed_by: null,
  evidence_path: null,
  notes: null,
  created_at: '2026-09-01T00:00:00Z',
  updated_at: '2026-09-01T00:00:00Z',
  ...overrides,
});

const record = (overrides: Partial<OnboardingRecordRow> = {}): OnboardingRecordRow => ({
  id: overrides.id ?? 'r1',
  company_id: 'co',
  profile_id: 'p1',
  vessel_id: null,
  template_id: null,
  start_date: '2026-09-20',
  buddy_profile_id: null,
  status: 'in_progress',
  completion_pct: 40,
  completed_at: null,
  notes: null,
  created_by: null,
  created_at: '2026-09-01T00:00:00Z',
  updated_at: '2026-09-01T00:00:00Z',
  ...overrides,
});

describe('parseTemplateSections', () => {
  it('parses well-formed jsonb and applies defaults', () => {
    const parsed = parseTemplateSections([
      { section: 'Before joining', items: [{ title: 'SEA on file', owner: 'hr', due_offset_days: -7, required: true }, { title: 'Reading', owner: 'employee' }] },
    ]);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].items[1]).toEqual({ title: 'Reading', owner: 'employee', due_offset_days: 0, required: true });
  });

  it('drops malformed entries and unknown owners fall back to hr', () => {
    const parsed = parseTemplateSections([null, 'x', { section: '', items: [{ title: '' }, { title: 'ok', owner: 'pirate', due_offset_days: '3' }] }]);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].section).toBe('General');
    expect(parsed[0].items).toEqual([{ title: 'ok', owner: 'hr', due_offset_days: 3, required: true }]);
  });

  it('returns an empty array for non-arrays', () => {
    expect(parseTemplateSections(null)).toEqual([]);
    expect(parseTemplateSections({ section: 'x' })).toEqual([]);
  });

  it('round-trips through serialise', () => {
    const sections: TemplateSection[] = [{ section: 'A', items: [{ title: 't', owner: 'buddy', due_offset_days: 2, required: false }] }];
    expect(parseTemplateSections(serialiseTemplateSections(sections))).toEqual(sections);
  });
});

describe('validateTemplate', () => {
  it('accepts a valid draft', () => {
    expect(validateTemplate({ name: 'Std', sections: [{ section: 'A', items: [{ title: 't', owner: 'hr', due_offset_days: 0, required: true }] }] })).toEqual([]);
  });

  it('reports missing name, empty sections, duplicate names and bad offsets', () => {
    const errors = validateTemplate({
      name: ' ',
      sections: [
        { section: 'A', items: [] },
        { section: 'a', items: [{ title: '', owner: 'hr', due_offset_days: 1.5, required: true }, { title: 'x', owner: 'hr', due_offset_days: 400, required: true }] },
      ],
    });
    expect(errors).toContain('Template name is required.');
    expect(errors).toContain('"A" has no items.');
    expect(errors).toContain('Duplicate section name "a".');
    expect(errors.some((e) => e.includes('needs a title'))).toBe(true);
    expect(errors.some((e) => e.includes('whole number'))).toBe(true);
    expect(errors.some((e) => e.includes('±365'))).toBe(true);
  });

  it('requires at least one section', () => {
    expect(validateTemplate({ name: 'x', sections: [] })).toContain('Add at least one section.');
  });

  it('counts items', () => {
    expect(countTemplateItems([{ section: 'A', items: [{ title: 'a', owner: 'hr', due_offset_days: 0, required: true }, { title: 'b', owner: 'hr', due_offset_days: 0, required: false }] }])).toEqual({ total: 2, required: 1 });
  });
});

describe('overdue detection', () => {
  it('flags open items due before today only', () => {
    expect(isItemOverdue(item({ due_date: '2026-09-16' }), TODAY)).toBe(true);
    expect(isItemOverdue(item({ due_date: '2026-09-17' }), TODAY)).toBe(false);
    expect(isItemOverdue(item({ due_date: '2026-09-16', completed: true }), TODAY)).toBe(false);
    expect(isItemOverdue(item({ due_date: null }), TODAY)).toBe(false);
  });

  it('derives tones', () => {
    expect(itemTone(item({ completed: true }), TODAY)).toBe('done');
    expect(itemTone(item({ due_date: '2026-09-10' }), TODAY)).toBe('overdue');
    expect(itemTone(item({ due_date: '2026-09-19' }), TODAY)).toBe('due_soon');
    expect(itemTone(item({ due_date: '2026-10-19' }), TODAY)).toBe('upcoming');
    expect(itemTone(item(), TODAY)).toBe('undated');
  });

  it('counts overdue items', () => {
    expect(countOverdueItems([item({ due_date: '2026-09-01' }), item({ id: 'i2', due_date: '2026-09-01', completed: true }), item({ id: 'i3' })], TODAY)).toBe(1);
  });
});

describe('groupItemsBySection', () => {
  it('groups in sort_order order and tallies each section', () => {
    const groups = groupItemsBySection(
      [
        item({ id: 'c', section: 'First day', sort_order: 3, due_date: '2026-09-01' }),
        item({ id: 'a', section: 'Before joining', sort_order: 1, completed: true }),
        item({ id: 'b', section: 'Before joining', sort_order: 2, required: false }),
      ],
      TODAY,
    );
    expect(groups.map((g) => g.section)).toEqual(['Before joining', 'First day']);
    expect(groups[0].items.map((i) => i.id)).toEqual(['a', 'b']);
    expect(groups[0]).toMatchObject({ total: 2, done: 1, requiredTotal: 1, requiredDone: 1, overdue: 0 });
    expect(groups[1]).toMatchObject({ total: 1, done: 0, overdue: 1 });
  });

  it('completion percent counts required items only, like the SQL trigger', () => {
    expect(completionPercent([])).toBe(0);
    expect(completionPercent([item({ completed: true }), item({ required: false }), item({ id: 'x' })])).toBe(50);
  });

  it('next sort order follows the max', () => {
    expect(nextSortOrder([])).toBe(1);
    expect(nextSortOrder([item({ sort_order: 4 }), item({ sort_order: 2 })])).toBe(5);
  });
});

describe('canCompleteItem', () => {
  it('mirrors RLS', () => {
    expect(canCompleteItem({ owner: 'hr' }, { canEdit: true, isSubject: false, isBuddy: false })).toBe(true);
    expect(canCompleteItem({ owner: 'hr' }, { canEdit: false, isSubject: true, isBuddy: false })).toBe(false);
    expect(canCompleteItem({ owner: 'employee' }, { canEdit: false, isSubject: true, isBuddy: false })).toBe(true);
    expect(canCompleteItem({ owner: 'buddy' }, { canEdit: false, isSubject: false, isBuddy: true })).toBe(true);
    expect(canCompleteItem({ owner: 'buddy' }, { canEdit: false, isSubject: true, isBuddy: false })).toBe(false);
  });
});

describe('computeReadinessScore', () => {
  it('ignores unknown checks and rounds', () => {
    expect(computeReadinessScore([])).toBe(0);
    expect(computeReadinessScore([{ ok: true }, { ok: false }, { ok: false, unknown: true }])).toBe(50);
    expect(computeReadinessScore([{ ok: true }, { ok: true }, { ok: false }])).toBe(67);
  });
});

describe('mergeJoinerSources', () => {
  const directory = [
    { id: 'p1', user_id: 'u1', displayName: 'Ann Able', rank: 'Deckhand', department: 'Deck', vessel_id: null, vessel_name: null },
    { id: 'p2', user_id: 'u2', displayName: 'Bob Baker', rank: 'Chef', department: 'Interior', vessel_id: 'v1', vessel_name: 'Draak' },
    { id: 'p3', user_id: null, displayName: 'Cy Cole', rank: null, department: null, vessel_id: null, vessel_name: null },
    { id: 'p4', user_id: 'u4', displayName: 'Dee Dunn', rank: null, department: null, vessel_id: null, vessel_name: null },
  ];

  it('prefers onboarding records, then contracts, then assignments, and sorts by start date', () => {
    const rows = mergeJoinerSources({
      records: [record({ id: 'r1', profile_id: 'p1', start_date: '2026-09-25', vessel_id: 'v2' })],
      contracts: [
        { profile_id: 'p1', start_date: '2026-09-01', status: 'active', vessel_id: null },
        { profile_id: 'p3', start_date: '2026-09-20', status: 'draft', vessel_id: 'v1' },
        { profile_id: 'p4', start_date: '2026-09-22', status: 'terminated', vessel_id: null },
      ],
      assignments: [
        { user_id: 'u2', join_date: '2026-09-18', vessel_id: 'v1' },
        { user_id: 'u4', join_date: '2026-12-01', vessel_id: 'v1' },
      ],
      directory,
      vesselName: (id) => (id === 'v1' ? 'Draak' : id === 'v2' ? 'Nemo' : null),
      today: TODAY,
    });
    expect(rows.map((r) => [r.profileId, r.source])).toEqual([
      ['p2', 'assignment'],
      ['p3', 'contract'],
      ['p1', 'onboarding'],
    ]);
    const ann = rows.find((r) => r.profileId === 'p1');
    expect(ann).toMatchObject({ vesselName: 'Nemo', status: 'in_progress', completionPct: 40, daysUntilStart: 8 });
    expect(rows.find((r) => r.profileId === 'p3')).toMatchObject({ vesselName: 'Draak', record: null, daysUntilStart: 3 });
  });

  it('keeps open onboarding records outside the window but drops closed ones', () => {
    const rows = mergeJoinerSources({
      records: [
        record({ id: 'r-old', profile_id: 'p1', start_date: '2026-01-01', status: 'in_progress' }),
        record({ id: 'r-done', profile_id: 'p2', start_date: '2026-01-01', status: 'completed' }),
      ],
      contracts: [],
      assignments: [],
      directory,
      today: TODAY,
    });
    expect(rows.map((r) => r.profileId)).toEqual(['p1']);
  });

  it('ignores people missing from the directory', () => {
    const rows = mergeJoinerSources({ records: [record({ profile_id: 'ghost' })], contracts: [], assignments: [], directory, today: TODAY });
    expect(rows).toEqual([]);
  });

  it('filters joiners', () => {
    const rows = mergeJoinerSources({
      records: [record({ profile_id: 'p1', start_date: '2026-09-25' })],
      contracts: [{ profile_id: 'p3', start_date: '2026-09-20', status: 'active', vessel_id: 'v1' }],
      assignments: [],
      directory,
      today: TODAY,
    });
    expect(filterJoiners(rows, { ...DEFAULT_JOINER_FILTERS, status: 'none' }).map((r) => r.profileId)).toEqual(['p3']);
    expect(filterJoiners(rows, { ...DEFAULT_JOINER_FILTERS, status: 'in_progress' }).map((r) => r.profileId)).toEqual(['p1']);
    expect(filterJoiners(rows, { ...DEFAULT_JOINER_FILTERS, vesselId: 'v1' }).map((r) => r.profileId)).toEqual(['p3']);
    expect(filterJoiners(rows, { ...DEFAULT_JOINER_FILTERS, search: 'ann' }).map((r) => r.profileId)).toEqual(['p1']);
  });
});

describe('computeOnboardingKpis', () => {
  it('computes the four tiles', () => {
    const records = [
      record({ id: 'r1', status: 'in_progress' }),
      record({ id: 'r2', profile_id: 'p2', status: 'completed', completed_at: '2026-08-01T00:00:00Z' }),
      record({ id: 'r3', profile_id: 'p3', status: 'completed', completed_at: '2026-05-01T00:00:00Z' }),
      record({ id: 'r4', profile_id: 'p4', status: 'cancelled' }),
    ];
    const joiners = mergeJoinerSources({
      records,
      contracts: [],
      assignments: [],
      directory: [
        { id: 'p1', user_id: null, displayName: 'A', rank: null, department: null, vessel_id: null, vessel_name: null },
        { id: 'p2', user_id: null, displayName: 'B', rank: null, department: null, vessel_id: null, vessel_name: null },
      ],
      today: TODAY,
    });
    const kpis = computeOnboardingKpis({
      joiners,
      records,
      openItems: [
        { record_id: 'r1', completed: false, due_date: '2026-09-01' },
        { record_id: 'r1', completed: false, due_date: '2026-10-01' },
        { record_id: 'r4', completed: false, due_date: '2026-09-01' },
      ],
      today: TODAY,
    });
    expect(kpis).toEqual({ joinersNext30: 2, inProgress: 1, overdueItems: 1, completedThisQuarter: 1 });
  });
});
