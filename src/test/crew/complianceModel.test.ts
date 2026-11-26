/**
 * The Crew Compliance page's model (X1-06B; gap/04 C33, C35, C5, C24):
 *
 * - the route tab and the Status tab's URL state (every value, unknown
 *   values, defaults never written, other parameters kept);
 * - the layout below 768 px; the views that read the tabs;
 * - KPIs by status, the status chip counts, the gaps rule, on board (the
 *   crew list's status first, else the placement);
 * - search, the filter order (KPIs before the status chip and the gaps
 *   view), sorting (department order, rank, name) and grouping;
 * - the matrix columns of each view, their groups, a cell's words (every
 *   state, caution, not required), a tab cell (worst state, muted
 *   expiring, caution, gaps, next expiry), ratios and relative days;
 * - the crew list's dot issues and their words; the profile's missing
 *   block; the configuration rows, positions, groups and staged cells;
 * - the zod forms (a requirement row, a company document type) with the
 *   server's limits; the equivalence rules' order and duplicates.
 */
import { describe, expect, it } from 'vitest';
import {
  COMPLIANCE_PAGE_TABS,
  DEFAULT_COMPLIANCE_PARAMS,
  DOCUMENT_REQUIREMENT_GROUPS,
  FLAT_GROUP_KEY,
  GROUP_OPTIONS,
  LAYOUT_OPTIONS,
  MAX_QUERY_LENGTH,
  MAX_REQUIREMENT_OPTIONS,
  NO_DEPARTMENT_KEY,
  NO_DEPARTMENT_LABEL,
  SHOW_OPTIONS,
  STATUS_FILTER_ORDER,
  STATUS_VIEWS,
  STATUS_VIEW_LABEL,
  cellHasIssue,
  changesToCells,
  columnGroupId,
  companyDocumentTypeSchema,
  comparePeople,
  complianceKpis,
  complianceSearch,
  daysFrom,
  departmentLabel,
  dotIssues,
  effectiveLayout,
  filterPeople,
  groupLabel,
  groupPeople,
  hasGap,
  isOnBoard,
  issueText,
  kpiPeople,
  matchesQuery,
  missingOnTab,
  monthText,
  parseCompliancePageTab,
  parseComplianceParams,
  personPosition,
  positionGroups,
  ratioText,
  relativeDays,
  requirementCellWords,
  requirementColumnGroups,
  requirementColumns,
  requirementRowSchema,
  rowSummary,
  ruleExists,
  sortConfigRows,
  sortPeople,
  sortPositions,
  sortRules,
  statusCounts,
  statusFor,
  tabCell,
  toRequirementRowPayload,
  viewTab,
  withComplianceParams,
  type CompliancePerson,
  type ComplianceParams,
  type DepartmentInfo,
  type StatusRowLike,
} from '@/modules/crew/lib/complianceModel';
import { REQUIREMENT_GROUPS, requirementExplanation, type ComplianceIssue, type ComplianceStatus } from '@/modules/crew/lib/compliance';
import type { CrewStatus } from '@/modules/crew/lib/crewStatus';

const DEPTS: ReadonlyMap<string, DepartmentInfo> = new Map([
  ['bridge', { label: 'Bridge', sortOrder: 10 }],
  ['deck', { label: 'Deck', sortOrder: 20 }],
  ['interior', { label: 'Interior', sortOrder: 40 }],
]);

const person = (over: Partial<CompliancePerson> & { profileId: string }): CompliancePerson => ({
  displayName: `Crew, ${over.profileId}`,
  preferredName: null,
  positionName: 'Deckhand',
  positionText: null,
  departmentKey: 'deck',
  sortOrder: 40203,
  placementKind: 'assignment',
  status: 'complete',
  required: 4,
  met: 4,
  nextExpiry: null,
  issues: [],
  ...over,
});

const issue = (over: Partial<ComplianceIssue>): ComplianceIssue => ({ rowId: 'r', label: 'Passport', tab: 'documents', state: 'missing', reason: 'missing', ...over });

const row = (over: Partial<StatusRowLike> & { rowId: string }): StatusRowLike => ({
  label: over.rowId.toUpperCase(),
  groupKey: 'stcw_basic',
  kind: 'document',
  tab: 'stcw',
  rowSort: 10,
  state: 'met',
  satisfiedVia: 'option',
  satisfyingName: 'Certificate',
  nextExpiry: '2027-06-01',
  noExpiry: false,
  isConditional: false,
  isMuted: false,
  missingDate: false,
  gapReason: null,
  nearestName: null,
  ...over,
});

const params = (over: Partial<ComplianceParams> = {}): ComplianceParams => ({ ...DEFAULT_COMPLIANCE_PARAMS, ...over });
const ctx = (crewStatus: ReadonlyMap<string, CrewStatus> | null = null) => ({ crewStatus, departments: DEPTS });

describe('the route tab', () => {
  it('accepts status and configuration, nothing else', () => {
    expect(COMPLIANCE_PAGE_TABS).toEqual(['status', 'configuration']);
    expect(parseCompliancePageTab('status')).toBe('status');
    expect(parseCompliancePageTab('configuration')).toBe('configuration');
    for (const bad of ['', 'Status', 'config', 'documents', null, undefined]) expect(parseCompliancePageTab(bad)).toBeNull();
  });
});

describe('the Status tab URL state', () => {
  it('reads the defaults from an empty URL', () => {
    expect(parseComplianceParams(new URLSearchParams())).toEqual({ view: 'overview', show: 'all', group: 'dept', layout: 'matrix', status: null, q: '' });
  });

  it.each(STATUS_VIEWS.map((v) => [v]))('reads view=%s', (v) => {
    expect(parseComplianceParams(new URLSearchParams({ view: v })).view).toBe(v);
  });
  it.each(SHOW_OPTIONS.map((v) => [v]))('reads show=%s', (v) => {
    expect(parseComplianceParams(new URLSearchParams({ show: v })).show).toBe(v);
  });
  it.each(GROUP_OPTIONS.map((v) => [v]))('reads group=%s', (v) => {
    expect(parseComplianceParams(new URLSearchParams({ group: v })).group).toBe(v);
  });
  it.each(LAYOUT_OPTIONS.map((v) => [v]))('reads layout=%s', (v) => {
    expect(parseComplianceParams(new URLSearchParams({ layout: v })).layout).toBe(v);
  });
  it.each((['complete', 'expiring', 'missing', 'expired'] as ComplianceStatus[]).map((v) => [v]))('reads status=%s', (v) => {
    expect(parseComplianceParams(new URLSearchParams({ status: v })).status).toBe(v);
  });

  it('reads anything unknown as the default (an old or hand-typed link still opens a page)', () => {
    const p = parseComplianceParams(new URLSearchParams({ view: 'medical', show: 'some', group: 'rank', layout: 'grid', status: 'ok' }));
    expect(p).toEqual({ ...DEFAULT_COMPLIANCE_PARAMS });
  });

  it('keeps the legacy certificates landing (?view=documents) and caps the search', () => {
    expect(parseComplianceParams(new URLSearchParams('view=documents&module=vessel')).view).toBe('documents');
    expect(parseComplianceParams(new URLSearchParams({ q: 'x'.repeat(300) })).q).toHaveLength(MAX_QUERY_LENGTH);
  });

  it('writes a change, removes defaults and blanks, and keeps every other parameter', () => {
    const base = new URLSearchParams('view=gaps&module=vessel&q=bosun');
    expect(withComplianceParams(base, { status: 'missing' }).toString()).toBe('view=gaps&module=vessel&q=bosun&status=missing');
    expect(withComplianceParams(base, { view: 'overview' }).toString()).toBe('module=vessel&q=bosun');
    expect(withComplianceParams(base, { q: '   ' }).toString()).toBe('view=gaps&module=vessel');
    expect(withComplianceParams(base, { q: ' chief ' }).get('q')).toBe('chief');
    expect(withComplianceParams(new URLSearchParams('status=missing'), { status: null }).toString()).toBe('');
    expect(withComplianceParams(new URLSearchParams(), { show: 'onboard', group: 'flat', layout: 'cards' }).toString()).toBe('show=onboard&group=flat&layout=cards');
    expect(withComplianceParams(new URLSearchParams('show=onboard'), { show: 'all', layout: 'matrix', group: 'dept' }).toString()).toBe('');
  });

  it('builds the KPI links ("?…", "" when nothing is set)', () => {
    expect(complianceSearch(new URLSearchParams('view=gaps'), { status: 'expired' })).toBe('?view=gaps&status=expired');
    expect(complianceSearch(new URLSearchParams('status=expired'), { status: null })).toBe('');
  });

  it('cards below 768 px whatever the URL asks; the URL choice from there up', () => {
    expect(effectiveLayout('matrix', false)).toBe('cards');
    expect(effectiveLayout('cards', false)).toBe('cards');
    expect(effectiveLayout('matrix', true)).toBe('matrix');
    expect(effectiveLayout('cards', true)).toBe('cards');
  });

  it('the tab views read one tab; the overview and the gaps view none', () => {
    expect(STATUS_VIEWS.map(viewTab)).toEqual([null, null, 'documents', 'stcw', 'qualifications', 'familiarisation']);
    expect(STATUS_VIEW_LABEL.stcw).toBe('STCW');
  });
});

describe('KPIs and status counts', () => {
  const people = [
    person({ profileId: 'a', status: 'complete' }),
    person({ profileId: 'b', status: 'complete', required: 0, met: 0 }),
    person({ profileId: 'c', status: 'expiring' }),
    person({ profileId: 'd', status: 'expired' }),
    person({ profileId: 'e', status: 'expired' }),
    person({ profileId: 'f', status: 'missing' }),
  ];

  it('counts people by status, the ones with nothing required apart (W5 §4)', () => {
    expect(complianceKpis(people)).toEqual({ total: 6, complete: 2, expiring: 1, expired: 2, missing: 1, nothingRequired: 1 });
    expect(complianceKpis([])).toEqual({ total: 0, complete: 0, expiring: 0, expired: 0, missing: 0, nothingRequired: 0 });
  });

  it('counts the status chips; the chip order is worst first', () => {
    expect(statusCounts(people)).toEqual({ all: 6, complete: 2, expiring: 1, missing: 1, expired: 2 });
    expect(STATUS_FILTER_ORDER).toEqual(['expired', 'missing', 'expiring', 'complete']);
  });

  it('a gap is any issue, a conditional approval or a missing date included', () => {
    expect(hasGap(person({ profileId: 'x' }))).toBe(false);
    expect(hasGap(person({ profileId: 'x', issues: [issue({ reason: 'conditional', state: 'met' })] }))).toBe(true);
  });
});

describe('on board', () => {
  it('uses the crew list status when it knows the person', () => {
    const map = new Map<string, CrewStatus>([['a', 'on_board'], ['b', 'on_leave'], ['c', 'pending']]);
    expect(isOnBoard(person({ profileId: 'a' }), map)).toBe(true);
    expect(isOnBoard(person({ profileId: 'b' }), map)).toBe(false);
    expect(isOnBoard(person({ profileId: 'c', placementKind: 'assignment' }), map)).toBe(false);
  });

  it('falls back to a current placement (not joining, not a pending placement)', () => {
    expect(isOnBoard(person({ profileId: 'z', placementKind: 'assignment' }), null)).toBe(true);
    expect(isOnBoard(person({ profileId: 'z', placementKind: 'planned' }), null)).toBe(false);
    expect(isOnBoard(person({ profileId: 'z', placementKind: 'pending_placement' }), new Map())).toBe(false);
  });
});

describe('search, filters, sorting and groups', () => {
  const a = person({ profileId: 'a', displayName: 'Bosun, Demo', positionName: 'Bosun', sortOrder: 30201, status: 'missing', issues: [issue({})] });
  const b = person({ profileId: 'b', displayName: 'Master, Demo', positionName: 'Master', departmentKey: 'bridge', sortOrder: 10101 });
  const c = person({ profileId: 'c', displayName: 'Steward, Demo', positionName: null, positionText: 'Steward', departmentKey: 'interior', sortOrder: null, placementKind: 'planned' });
  const d = person({ profileId: 'd', displayName: 'Deckhand, Demo', positionName: 'Deckhand', sortOrder: 40203, status: 'expired', issues: [issue({ reason: 'expired', state: 'expired' })] });
  const e = person({ profileId: 'e', displayName: 'Electrician, Demo', positionName: null, positionText: null, departmentKey: null, sortOrder: null });
  const f = person({ profileId: 'f', displayName: 'Diver, Demo', positionName: 'Diver', departmentKey: 'diving', sortOrder: 70101 });
  const all = [a, b, c, d, e, f];

  it('the position is the catalogue name, else the recorded title', () => {
    expect(personPosition(b)).toBe('Master');
    expect(personPosition(c)).toBe('Steward');
    expect(personPosition(e)).toBeNull();
  });

  it('search matches every word in name, position or department, accents and case folded', () => {
    expect(matchesQuery(a, '', DEPTS)).toBe(true);
    expect(matchesQuery(a, 'BOSUN deck', DEPTS)).toBe(true);
    expect(matchesQuery(c, 'interior stew', DEPTS)).toBe(true);
    expect(matchesQuery(b, 'deck', DEPTS)).toBe(false);
    expect(matchesQuery(person({ profileId: 'x', displayName: 'Müller, Démo' }), 'muller demo', DEPTS)).toBe(true);
  });

  it('filters by search, on board, the gaps view and the status chip', () => {
    expect(filterPeople(all, params(), ctx()).map((p) => p.profileId)).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    expect(filterPeople(all, params({ q: 'demo deck' }), ctx()).map((p) => p.profileId)).toEqual(['a', 'd']);
    expect(filterPeople(all, params({ show: 'onboard' }), ctx()).map((p) => p.profileId)).toEqual(['a', 'b', 'd', 'e', 'f']);
    expect(filterPeople(all, params({ view: 'gaps' }), ctx()).map((p) => p.profileId)).toEqual(['a', 'd']);
    expect(filterPeople(all, params({ status: 'expired' }), ctx()).map((p) => p.profileId)).toEqual(['d']);
    expect(filterPeople(all, params({ view: 'gaps', status: 'complete' }), ctx())).toEqual([]);
  });

  it('the KPIs count before the status chip and the gaps view, after the search and on board', () => {
    expect(kpiPeople(all, params({ status: 'expired', view: 'gaps' }), ctx()).map((p) => p.profileId)).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    expect(kpiPeople(all, params({ show: 'onboard', q: 'deck' }), ctx()).map((p) => p.profileId)).toEqual(['a', 'd']);
  });

  it('sorts by department order (unknown next, none last), then rank (no position last), then name', () => {
    expect(sortPeople(all, DEPTS).map((p) => p.profileId)).toEqual(['b', 'a', 'd', 'c', 'f', 'e']);
    expect(comparePeople(a, d)).toBeLessThan(0);
    const twin = person({ profileId: 'z', displayName: 'Bosun, Demo', sortOrder: 30201 });
    expect(comparePeople(a, twin)).toBeLessThan(0);
    expect(comparePeople(twin, a)).toBeGreaterThan(0);
  });

  it('groups by department with labels, unknown keys in words, no department last', () => {
    const groups = groupPeople(all, 'dept', DEPTS);
    expect(groups.map((g) => [g.key, g.label, g.people.map((p) => p.profileId)])).toEqual([
      ['bridge', 'Bridge', ['b']],
      ['deck', 'Deck', ['a', 'd']],
      ['interior', 'Interior', ['c']],
      ['diving', 'Diving', ['f']],
      [NO_DEPARTMENT_KEY, NO_DEPARTMENT_LABEL, ['e']],
    ]);
    expect(departmentLabel('purser_office', DEPTS)).toBe('Purser office');
    expect(departmentLabel(null, DEPTS)).toBe(NO_DEPARTMENT_LABEL);
  });

  it('one list (flat): everyone by rank then name; nothing for nobody', () => {
    const [g] = groupPeople(all, 'flat', DEPTS);
    expect(g.key).toBe(FLAT_GROUP_KEY);
    expect(g.people.map((p) => p.profileId)).toEqual(['b', 'a', 'd', 'f', 'e', 'c']);
    expect(groupPeople([], 'dept', DEPTS)).toEqual([]);
    expect(groupPeople([], 'flat', DEPTS)).toEqual([]);
  });
});

describe('matrix columns', () => {
  const rowsByProfile = new Map<string, StatusRowLike[]>([
    [
      'a',
      [
        row({ rowId: 'pst', rowSort: 21, tab: 'stcw', groupKey: 'stcw_basic' }),
        row({ rowId: 'pp', rowSort: 5, tab: 'documents', groupKey: 'documents', state: 'missing', satisfiedVia: null }),
        row({ rowId: 'fam', rowSort: 90, tab: 'familiarisation', groupKey: 'familiarisation', kind: 'familiarisation' }),
      ],
    ],
    [
      'b',
      [
        row({ rowId: 'pst', rowSort: 21, tab: 'stcw', groupKey: 'stcw_basic', state: 'expired' }),
        row({ rowId: 'gmdss', rowSort: 40, tab: 'qualifications', groupKey: 'coc_gmdss', isConditional: true }),
        row({ rowId: 'efa', rowSort: 23, tab: 'stcw', groupKey: 'stcw_basic', state: 'expiring', isMuted: true }),
      ],
    ],
  ]);

  it('the overview has none; a tab view has every row of its tab that someone needs, in row order', () => {
    expect(requirementColumns(rowsByProfile, 'overview', ['a', 'b'])).toEqual([]);
    expect(requirementColumns(rowsByProfile, 'stcw', ['a', 'b']).map((c) => c.rowId)).toEqual(['pst', 'efa']);
    expect(requirementColumns(rowsByProfile, 'documents', ['a', 'b']).map((c) => c.rowId)).toEqual(['pp']);
    expect(requirementColumns(rowsByProfile, 'stcw', ['a']).map((c) => c.rowId)).toEqual(['pst']);
    expect(requirementColumns(rowsByProfile, 'qualifications', []).map((c) => c.rowId)).toEqual([]);
  });

  it('the gaps view has every row someone shown has a gap in, in tab order (a muted expiring row is no gap)', () => {
    expect(requirementColumns(rowsByProfile, 'gaps', ['a', 'b']).map((c) => c.rowId)).toEqual(['pp', 'pst', 'gmdss']);
    expect(requirementColumns(rowsByProfile, 'gaps', ['a']).map((c) => c.rowId)).toEqual(['pp']);
  });

  it('groups by requirement group in a tab view, by tab in the gaps view', () => {
    const tabCols = requirementColumns(rowsByProfile, 'stcw', ['a', 'b']);
    expect(requirementColumnGroups(tabCols, 'stcw')).toEqual([{ id: 'stcw_basic', label: 'Basic safety (STCW VI/1)' }]);
    const gapCols = requirementColumns(rowsByProfile, 'gaps', ['a', 'b']);
    expect(requirementColumnGroups(gapCols, 'gaps')).toEqual([
      { id: 'documents', label: 'Documents' },
      { id: 'stcw', label: 'STCW' },
      { id: 'qualifications', label: 'Qualifications' },
    ]);
    expect(columnGroupId(gapCols[0], 'gaps')).toBe('documents');
    expect(columnGroupId(gapCols[0], 'documents')).toBe('documents');
    expect(groupLabel('coc_gmdss')).toBe('Certificates of competency and GMDSS');
    expect(groupLabel('made_up_group')).toBe('Made up group');
  });

  it('finds a person\'s row, null when not required', () => {
    expect(statusFor(rowsByProfile, 'a', 'pst')?.state).toBe('met');
    expect(statusFor(rowsByProfile, 'a', 'gmdss')).toBeNull();
    expect(statusFor(rowsByProfile, 'nobody', 'pst')).toBeNull();
  });

  it('a cell needs attention for expired, missing, expiring with alerts on, conditional or a missing date', () => {
    expect(cellHasIssue(row({ rowId: 'x' }))).toBe(false);
    expect(cellHasIssue(row({ rowId: 'x', state: 'expired' }))).toBe(true);
    expect(cellHasIssue(row({ rowId: 'x', state: 'missing' }))).toBe(true);
    expect(cellHasIssue(row({ rowId: 'x', state: 'expiring' }))).toBe(true);
    expect(cellHasIssue(row({ rowId: 'x', state: 'expiring', isMuted: true }))).toBe(false);
    expect(cellHasIssue(row({ rowId: 'x', isConditional: true }))).toBe(true);
    expect(cellHasIssue(row({ rowId: 'x', missingDate: true }))).toBe(true);
  });
});

describe('the words of a cell', () => {
  it('not required', () => {
    expect(requirementCellWords(null, requirementExplanation)).toEqual({
      state: 'not_required',
      label: 'Not required',
      detail: null,
      caution: false,
      sentence: 'Not required for this position.',
    });
  });

  it('met with its expiry month, "No expiry" or "No date" (amber), and the document that satisfies it', () => {
    const met = requirementCellWords(row({ rowId: 'x', satisfyingName: 'Basic safety training', satisfiedVia: 'component' }), requirementExplanation);
    expect(met).toMatchObject({ state: 'met', label: 'Met', detail: 'Jun 2027', caution: false });
    expect(met.sentence).toBe('Covered by Basic safety training (a combined certificate).');
    expect(requirementCellWords(row({ rowId: 'x', noExpiry: true, nextExpiry: null }), requirementExplanation).detail).toBe('No expiry');
    const noDate = requirementCellWords(row({ rowId: 'x', missingDate: true, nextExpiry: null }), requirementExplanation);
    expect(noDate).toMatchObject({ detail: 'No date', caution: true });
    expect(noDate.sentence).toContain('Expiry date missing.');
  });

  it('conditional approval is amber although met; expiring, expired and missing each say so', () => {
    expect(requirementCellWords(row({ rowId: 'x', isConditional: true }), requirementExplanation)).toMatchObject({ caution: true, label: 'Met' });
    expect(requirementCellWords(row({ rowId: 'x', state: 'expiring', isConditional: true }), requirementExplanation)).toMatchObject({ caution: true, label: 'Expiring' });
    const expired = requirementCellWords(row({ rowId: 'x', state: 'expired', nextExpiry: '2025-01-10' }), requirementExplanation);
    expect(expired).toMatchObject({ label: 'Expired', detail: 'Jan 2025', caution: false });
    expect(expired.sentence).toBe('Expired: Certificate.');
    const missing = requirementCellWords(row({ rowId: 'x', state: 'missing', gapReason: 'not_linked', nearestName: 'GMDSS restricted', nextExpiry: null }), requirementExplanation);
    expect(missing).toMatchObject({ label: 'Missing', detail: null, caution: false });
    expect(missing.sentence).toBe('Missing. Nearest held: GMDSS restricted, which does not count for this requirement.');
  });

  it('formats months and relative days', () => {
    expect(monthText('2027-03-15')).toBe('Mar 2027');
    expect(monthText(null)).toBeNull();
    expect(daysFrom('2026-11-26', '2026-12-08')).toBe(12);
    expect(daysFrom('2026-11-26', null)).toBeNull();
    expect([0, 1, -1, 12, -3, null].map((d) => relativeDays(d))).toEqual(['today', 'tomorrow', 'yesterday', 'in 12 days', '3 days ago', null]);
    expect(ratioText(3, 5)).toBe('3/5');
    expect(ratioText(0, 0)).toBe('—');
  });
});

describe('a tab cell', () => {
  it('nothing required', () => {
    expect(tabCell([], 'stcw')).toEqual({ tab: 'stcw', required: 0, met: 0, worst: null, caution: false, gaps: [], next: null });
  });

  it('counts met and expiring as met, takes the worst state, lists the gaps worst first and the next expiry', () => {
    const rows = [
      row({ rowId: 'a', label: 'PST', rowSort: 1, nextExpiry: '2027-06-01', satisfyingName: 'PST cert' }),
      row({ rowId: 'b', label: 'FPFF', rowSort: 2, state: 'expiring', nextExpiry: '2026-12-20', satisfyingName: 'FPFF cert' }),
      row({ rowId: 'c', label: 'EFA', rowSort: 3, state: 'missing', nextExpiry: null }),
      row({ rowId: 'd', label: 'PSSR', rowSort: 4, state: 'expired', nextExpiry: '2025-01-01' }),
      row({ rowId: 'e', label: 'Passport', tab: 'documents' }),
    ];
    expect(tabCell(rows, 'stcw')).toEqual({
      tab: 'stcw',
      required: 4,
      met: 2,
      worst: 'expired',
      caution: false,
      gaps: ['PSSR', 'EFA', 'FPFF'],
      next: { date: '2026-12-20', name: 'FPFF cert' },
    });
  });

  it('an expiring row with alerts off counts as met and as a caution', () => {
    const cell = tabCell([row({ rowId: 'a', state: 'expiring', isMuted: true })], 'stcw');
    expect(cell).toMatchObject({ met: 1, worst: 'met', caution: true, gaps: [] });
  });

  it('conditional and missing-date rows are a caution, not a gap', () => {
    expect(tabCell([row({ rowId: 'a', isConditional: true })], 'stcw')).toMatchObject({ worst: 'met', caution: true, gaps: [] });
    expect(tabCell([row({ rowId: 'a', missingDate: true, nextExpiry: null })], 'stcw')).toMatchObject({ worst: 'met', caution: true, next: null });
  });

  it('missing beats expiring; ties keep row order', () => {
    const cell = tabCell([row({ rowId: 'a', label: 'B', state: 'expiring', rowSort: 1 }), row({ rowId: 'b', label: 'A', state: 'missing', rowSort: 2 })], 'stcw');
    expect(cell.worst).toBe('missing');
    expect(cell.gaps).toEqual(['A', 'B']);
  });
});

describe('the crew list dots', () => {
  const issues = [
    issue({ rowId: '1', label: 'Passport', tab: 'documents', reason: 'expired', state: 'expired' }),
    issue({ rowId: '2', label: 'PST', tab: 'stcw', reason: 'missing' }),
    issue({ rowId: '3', label: 'GMDSS', tab: 'qualifications', reason: 'conditional', state: 'met' }),
    issue({ rowId: '4', label: 'Vessel familiarisation', tab: 'familiarisation', reason: 'missing' }),
  ];

  it('documents dot: the Documents tab; second dot: STCW and Qualifications; familiarisation in neither', () => {
    expect(dotIssues(issues, 'documents').map((i) => i.rowId)).toEqual(['1']);
    expect(dotIssues(issues, 'qualifications').map((i) => i.rowId)).toEqual(['2', '3']);
  });

  it('words each reason', () => {
    expect(issues.map(issueText)).toEqual(['Passport: expired', 'PST: missing', 'GMDSS: conditionally approved', 'Vessel familiarisation: missing']);
    expect(issueText({ label: 'ENG1', reason: 'expiring' })).toBe('ENG1: expiring soon');
    expect(issueText({ label: 'ENG1', reason: 'missing_date' })).toBe('ENG1: expiry date missing');
  });
});

describe('the profile\'s missing required (C24)', () => {
  it('lists the tab\'s missing and expired document requirements, missing first, then row order, with their options', () => {
    const rows = [
      row({ rowId: 'pst', rowSort: 2, state: 'expired', nextExpiry: '2025-01-01' }),
      row({ rowId: 'efa', rowSort: 3, state: 'missing', nextExpiry: null }),
      row({ rowId: 'fpff', rowSort: 1, state: 'missing', nextExpiry: null, gapReason: 'rejected', nearestName: 'FPFF cert' }),
      row({ rowId: 'pssr', rowSort: 4 }),
      row({ rowId: 'pp', tab: 'documents', state: 'missing' }),
      row({ rowId: 'fam', tab: 'stcw', kind: 'familiarisation', state: 'missing' }),
    ];
    const out = missingOnTab(rows, 'stcw', new Map([['efa', ['t-efa', 't-basic']]]), requirementExplanation);
    expect(out.map((m) => [m.rowId, m.state, m.optionTypeIds])).toEqual([
      ['fpff', 'missing', []],
      ['efa', 'missing', ['t-efa', 't-basic']],
      ['pst', 'expired', []],
    ]);
    expect(out[0].sentence).toBe('Missing: FPFF cert was rejected.');
    expect(missingOnTab(rows, 'qualifications', new Map(), requirementExplanation)).toEqual([]);
  });
});

describe('the configuration matrix (C33)', () => {
  it('orders rows by the W5 group order, then sort order, then name', () => {
    const rows = [
      { id: '1', groupKey: 'documents', label: 'Passport', sortOrder: 5, options: [], positionIds: [], heldBy: 0 },
      { id: '2', groupKey: 'stcw_basic', label: 'PST', sortOrder: 20, options: [], positionIds: [], heldBy: 0 },
      { id: '3', groupKey: 'stcw_basic', label: 'FPFF', sortOrder: 10, options: [], positionIds: [], heldBy: 0 },
      { id: '4', groupKey: 'custom', label: 'B', sortOrder: 1, options: [], positionIds: [], heldBy: 0 },
      { id: '5', groupKey: 'custom', label: 'A', sortOrder: 1, options: [], positionIds: [], heldBy: 0 },
    ];
    expect(sortConfigRows(rows).map((r) => r.id)).toEqual(['3', '2', '1', '5', '4']);
  });

  it('says "N options · held by X"', () => {
    expect(rowSummary({ options: [1], heldBy: 6 })).toBe('1 option · held by 6');
    expect(rowSummary({ options: [1, 2], heldBy: 0 })).toBe('2 options · held by 0');
  });

  it('orders positions by department, listed first, then rank and name; groups them by department', () => {
    const p = (positionId: string, departmentKey: string, departmentSort: number, sortOrder: number, isListed = true) => ({
      positionId,
      name: positionId,
      departmentKey,
      departmentLabel: departmentKey.toUpperCase(),
      departmentSort,
      sortOrder,
      isListed,
    });
    const sorted = sortPositions([p('bosun', 'deck', 20, 30201), p('master', 'bridge', 10, 10101), p('lead', 'deck', 20, 30000, false), p('co', 'deck', 20, 20201)]);
    expect(sorted.map((x) => x.positionId)).toEqual(['master', 'co', 'bosun', 'lead']);
    expect(positionGroups(sorted)).toEqual([
      { id: 'bridge', label: 'BRIDGE' },
      { id: 'deck', label: 'DECK' },
    ]);
  });

  it('turns staged edits into cells: real changes only, each cell once, the last change wins', () => {
    expect(
      changesToCells([
        { rowId: 'r1', columnId: 'p1', from: false, to: true },
        { rowId: 'r1', columnId: 'p2', from: true, to: false },
        { rowId: 'r2', columnId: 'p1', from: false, to: false },
        { rowId: 'r1', columnId: 'p2', from: true, to: true },
      ]),
    ).toEqual([{ row_id: 'r1', position_id: 'p1', required: true }]);
    expect(changesToCells([])).toEqual([]);
  });
});

describe('the requirement row form', () => {
  const valid = { kind: 'document' as const, groupKey: 'custom' as const, label: ' Yacht rating ', optionIds: ['t1'], requireAll: true };

  it('accepts a document requirement in any group but Familiarisation, trims the name', () => {
    for (const g of DOCUMENT_REQUIREMENT_GROUPS) expect(requirementRowSchema.safeParse({ ...valid, groupKey: g }).success, g).toBe(true);
    expect(DOCUMENT_REQUIREMENT_GROUPS).toEqual(REQUIREMENT_GROUPS.filter((g) => g !== 'familiarisation'));
    expect(requirementRowSchema.parse(valid).label).toBe('Yacht rating');
  });

  it('a familiarisation goes in the Familiarisation group only, and a document never there', () => {
    expect(requirementRowSchema.safeParse({ ...valid, kind: 'familiarisation', groupKey: 'familiarisation' }).success).toBe(true);
    const f = requirementRowSchema.safeParse({ ...valid, kind: 'familiarisation', groupKey: 'custom' });
    expect(f.success).toBe(false);
    const d = requirementRowSchema.safeParse({ ...valid, groupKey: 'familiarisation' });
    expect(d.success).toBe(false);
  });

  it('needs a name of 1 to 120 characters and 1 to 20 distinct options', () => {
    expect(requirementRowSchema.safeParse({ ...valid, label: '   ' }).success).toBe(false);
    expect(requirementRowSchema.safeParse({ ...valid, label: 'x'.repeat(121) }).success).toBe(false);
    expect(requirementRowSchema.safeParse({ ...valid, label: 'x'.repeat(120) }).success).toBe(true);
    expect(requirementRowSchema.safeParse({ ...valid, optionIds: [] }).success).toBe(false);
    const many = Array.from({ length: MAX_REQUIREMENT_OPTIONS + 1 }, (_, i) => `t${i}`);
    expect(requirementRowSchema.safeParse({ ...valid, optionIds: many }).success).toBe(false);
    expect(requirementRowSchema.safeParse({ ...valid, optionIds: many.slice(0, MAX_REQUIREMENT_OPTIONS) }).success).toBe(true);
    expect(requirementRowSchema.safeParse({ ...valid, optionIds: ['t1', 't1'] }).success).toBe(false);
    expect(requirementRowSchema.safeParse({ ...valid, groupKey: 'nonsense' }).success).toBe(false);
  });

  it('becomes the save payload: options of its kind, and every listed position with require all', () => {
    expect(toRequirementRowPayload(requirementRowSchema.parse(valid), ['p1', 'p2', 'p1'])).toEqual({
      kind: 'document',
      group_key: 'custom',
      label: 'Yacht rating',
      options: [{ document_type_id: 't1' }],
      position_ids: ['p1', 'p2'],
    });
    const fam = requirementRowSchema.parse({ ...valid, kind: 'familiarisation', groupKey: 'familiarisation', optionIds: ['f1', 'f2'], requireAll: false });
    expect(toRequirementRowPayload(fam, ['p1'])).toEqual({
      kind: 'familiarisation',
      group_key: 'familiarisation',
      label: 'Yacht rating',
      options: [{ familiarization_template_id: 'f1' }, { familiarization_template_id: 'f2' }],
    });
  });
});

describe('the company document type form', () => {
  const base = { categoryKey: 'ratings', name: 'Tender driver', code: '', abbreviation: '', defaultValidityMonths: '' };

  it('blank optional fields are null; the code is stored in capitals', () => {
    expect(companyDocumentTypeSchema.parse(base)).toEqual({ categoryKey: 'ratings', name: 'Tender driver', code: null, abbreviation: null, defaultValidityMonths: null });
    expect(companyDocumentTypeSchema.parse({ ...base, code: ' td-1 ', abbreviation: ' TD ', defaultValidityMonths: '60' })).toMatchObject({ code: 'TD-1', abbreviation: 'TD', defaultValidityMonths: 60 });
  });

  it('refuses what the server refuses', () => {
    expect(companyDocumentTypeSchema.safeParse({ ...base, categoryKey: '' }).success).toBe(false);
    expect(companyDocumentTypeSchema.safeParse({ ...base, name: '  ' }).success).toBe(false);
    expect(companyDocumentTypeSchema.safeParse({ ...base, name: '---' }).success).toBe(false);
    expect(companyDocumentTypeSchema.safeParse({ ...base, name: 'x'.repeat(121) }).success).toBe(false);
    expect(companyDocumentTypeSchema.safeParse({ ...base, code: '-AB' }).success).toBe(false);
    expect(companyDocumentTypeSchema.safeParse({ ...base, code: 'A'.repeat(25) }).success).toBe(false);
    expect(companyDocumentTypeSchema.safeParse({ ...base, code: 'A B' }).success).toBe(false);
    expect(companyDocumentTypeSchema.safeParse({ ...base, abbreviation: 'x'.repeat(25) }).success).toBe(false);
    for (const v of ['-1', '241', '1.5', 'twelve']) expect(companyDocumentTypeSchema.safeParse({ ...base, defaultValidityMonths: v }).success, v).toBe(false);
    for (const v of ['0', '240', 12]) expect(companyDocumentTypeSchema.safeParse({ ...base, defaultValidityMonths: v }).success, String(v)).toBe(true);
  });
});

describe('the equivalence rules (C34)', () => {
  const names: Record<string, string> = { a: 'Advanced fire fighting', b: 'Basic fire fighting', c: 'Combined basic', p: 'PST' };
  const rules = [
    { id: '1', companyId: null, typeId: 'c', satisfiesTypeId: 'p', kind: 'component' as const },
    { id: '2', companyId: 'co', typeId: 'a', satisfiesTypeId: 'b', kind: 'supersedes' as const },
    { id: '3', companyId: null, typeId: 'a', satisfiesTypeId: 'b', kind: 'supersedes' as const },
  ];

  it('the company\'s first, then STORM\'s, each by the satisfied type, then the holder', () => {
    expect(sortRules(rules, (id) => names[id] ?? id).map((r) => r.id)).toEqual(['2', '3', '1']);
  });

  it('knows a pair that has a rule already (direction matters)', () => {
    expect(ruleExists(rules, 'a', 'b')).toBe(true);
    expect(ruleExists(rules, 'b', 'a')).toBe(false);
  });
});
