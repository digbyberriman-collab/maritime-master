/**
 * The Crew Compliance page's model (X1-06B; gap/04 C33, C35, C5, W5): what
 * the status matrix and the configuration matrix show, computed from the
 * engine's answers (lib/compliance.ts shapes, read by useVesselCompliance
 * and useRequirementsConfig). Pure: no React, no client, "today" passed in.
 *
 * - URL state of the Status tab: ?view, ?show, ?group, ?layout, ?status, ?q
 *   (parseComplianceParams / withComplianceParams; defaults never written).
 * - KPIs: people counted by their status (W5 §4), with the people that
 *   have nothing required counted apart.
 * - Filtering (search, status, on board, gaps), sorting (department order,
 *   rank, name) and grouping (by department or flat).
 * - The matrix columns of a view (the requirement rows of a tab, or every
 *   row someone has a gap in) and the words of each cell: a state, a short
 *   label and a sentence, never a colour alone.
 * - The configuration matrix: rows in group order, position columns by
 *   department, "N options · held by X", and the staged ticks turned into
 *   crew_requirement_cell_set cells.
 * - The forms of the configuration tab (zod): a requirement row and a
 *   company document type, with the server's limits.
 */
import { z } from 'zod';
import type { DateInput } from '@/lib/records/dates';
import { daysBetween, toCalendarDate } from '@/lib/records/dates';
import { dayText } from './verification';
import {
  COMPLIANCE_STATUSES,
  COMPLIANCE_TABS,
  REQUIREMENT_GROUPS,
  REQUIREMENT_GROUP_LABEL,
  issueReason,
  type ComplianceIssue,
  type ComplianceIssueReason,
  type ComplianceStatus,
  type ComplianceTab,
  type RequirementGroup,
  type RequirementKind,
  type RequirementState,
  type RequirementStatus,
} from './compliance';
import type { CrewStatus } from './crewStatus';
import type { CrewPlacementKind } from './crewStatus';
import type { CrewRequirementCell, CrewRequirementRowPayload } from '../types/db.pending';
import { CREW_PATHS } from '../paths';

const cmpStr = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const collator = new Intl.Collator('en-GB', { sensitivity: 'base', numeric: true });

// ---------------------------------------------------------------- the page's tabs (crew/compliance/:tab)

export const COMPLIANCE_PAGE_TABS = ['status', 'configuration'] as const;
export type CompliancePageTab = (typeof COMPLIANCE_PAGE_TABS)[number];

export const COMPLIANCE_PAGE_TAB_LABEL: Readonly<Record<CompliancePageTab, string>> = {
  status: 'Current status',
  configuration: 'Configuration',
};

/** A tab's path, relative to `/v/:vesselCode` (crew/compliance/status). */
export const compliancePath = (tab: CompliancePageTab): string => `${CREW_PATHS.compliance}/${tab}`;

/** The route's :tab, or null for anything else (the page then lands on Status). */
export function parseCompliancePageTab(raw: string | null | undefined): CompliancePageTab | null {
  return raw === 'status' || raw === 'configuration' ? raw : null;
}

// ---------------------------------------------------------------- URL state of the Status tab

export const STATUS_VIEWS = ['overview', 'gaps', 'documents', 'stcw', 'qualifications', 'familiarisation'] as const;
export type StatusView = (typeof STATUS_VIEWS)[number];

export const STATUS_VIEW_LABEL: Readonly<Record<StatusView, string>> = {
  overview: 'Overview',
  gaps: 'Gaps',
  documents: 'Documents',
  stcw: 'STCW',
  qualifications: 'Qualifications',
  familiarisation: 'Familiarisation',
};

export const SHOW_OPTIONS = ['all', 'onboard'] as const;
export type ShowOption = (typeof SHOW_OPTIONS)[number];
export const GROUP_OPTIONS = ['dept', 'flat'] as const;
export type GroupOption = (typeof GROUP_OPTIONS)[number];
export const LAYOUT_OPTIONS = ['matrix', 'cards'] as const;
export type LayoutOption = (typeof LAYOUT_OPTIONS)[number];

export interface ComplianceParams {
  view: StatusView;
  show: ShowOption;
  group: GroupOption;
  layout: LayoutOption;
  /** Only people with this status (the KPI tiles and the status chips). */
  status: ComplianceStatus | null;
  /** Search over name, position and department. */
  q: string;
}

export const DEFAULT_COMPLIANCE_PARAMS: Readonly<ComplianceParams> = {
  view: 'overview',
  show: 'all',
  group: 'dept',
  layout: 'matrix',
  status: null,
  q: '',
};

/** The longest search kept in the URL. */
export const MAX_QUERY_LENGTH = 100;

const oneOf = <T extends string>(list: readonly T[], raw: string | null, fallback: T): T =>
  raw !== null && (list as readonly string[]).includes(raw) ? (raw as T) : fallback;

/**
 * The Status tab's state from the URL. Anything unknown reads as the
 * default, so an old or hand-typed link always opens a page.
 */
export function parseComplianceParams(search: URLSearchParams): ComplianceParams {
  const status = search.get('status');
  return {
    view: oneOf(STATUS_VIEWS, search.get('view'), DEFAULT_COMPLIANCE_PARAMS.view),
    show: oneOf(SHOW_OPTIONS, search.get('show'), DEFAULT_COMPLIANCE_PARAMS.show),
    group: oneOf(GROUP_OPTIONS, search.get('group'), DEFAULT_COMPLIANCE_PARAMS.group),
    layout: oneOf(LAYOUT_OPTIONS, search.get('layout'), DEFAULT_COMPLIANCE_PARAMS.layout),
    status: status !== null && (COMPLIANCE_STATUSES as readonly string[]).includes(status) ? (status as ComplianceStatus) : null,
    q: (search.get('q') ?? '').slice(0, MAX_QUERY_LENGTH),
  };
}

const PARAM_KEYS = ['view', 'show', 'group', 'layout', 'status', 'q'] as const satisfies readonly (keyof ComplianceParams)[];

/**
 * The URL after a change: every other parameter kept, a default removed (so
 * the plain page URL stays plain), a blank search removed.
 */
export function withComplianceParams(current: URLSearchParams, patch: Partial<ComplianceParams>): URLSearchParams {
  const next = new URLSearchParams(current);
  const merged: ComplianceParams = { ...parseComplianceParams(current), ...patch };
  for (const key of PARAM_KEYS) {
    if (!(key in patch)) continue;
    const value = merged[key];
    const text = key === 'q' ? String(value ?? '').trim().slice(0, MAX_QUERY_LENGTH) : value;
    if (text === null || text === '' || text === DEFAULT_COMPLIANCE_PARAMS[key]) next.delete(key);
    else next.set(key, String(text));
  }
  return next;
}

/** "?view=gaps&status=missing", or "" when nothing is set. */
export function complianceSearch(current: URLSearchParams, patch: Partial<ComplianceParams>): string {
  const s = withComplianceParams(current, patch).toString();
  return s ? `?${s}` : '';
}

/** Cards below 768 px whatever the URL asks (D-82: no sideways page scroll on phones). */
export function effectiveLayout(layout: LayoutOption, wide: boolean): LayoutOption {
  return wide ? layout : 'cards';
}

/** The views that read every person's requirement rows (the overview reads only the summaries, plus the rows for the tab cells). */
export const viewTab = (view: StatusView): ComplianceTab | null =>
  view === 'documents' || view === 'stcw' || view === 'qualifications' || view === 'familiarisation' ? view : null;

// ---------------------------------------------------------------- people

/** What the model needs of a crew member's summary (useVesselCompliance's CrewComplianceSummary is one). */
export interface CompliancePerson {
  profileId: string;
  displayName: string;
  preferredName: string | null;
  positionName: string | null;
  positionText: string | null;
  departmentKey: string | null;
  sortOrder: number | null;
  placementKind: CrewPlacementKind;
  status: ComplianceStatus;
  required: number;
  met: number;
  nextExpiry: string | null;
  issues: readonly ComplianceIssue[];
}

/** The person's position as the page shows it: the catalogue name, else the recorded title. */
export const personPosition = (p: Pick<CompliancePerson, 'positionName' | 'positionText'>): string | null =>
  p.positionName ?? p.positionText ?? null;

export interface ComplianceKpis {
  total: number;
  complete: number;
  expiring: number;
  expired: number;
  missing: number;
  /** Counted as complete, but nothing is required for their position (no position, or no ticks). */
  nothingRequired: number;
}

/** People by status (W5 §4: KPIs count people by status). */
export function complianceKpis(people: readonly Pick<CompliancePerson, 'status' | 'required'>[]): ComplianceKpis {
  const out: ComplianceKpis = { total: people.length, complete: 0, expiring: 0, expired: 0, missing: 0, nothingRequired: 0 };
  for (const p of people) {
    out[p.status] += 1;
    if (p.required === 0) out.nothingRequired += 1;
  }
  return out;
}

/** The status chips' counts, in severity order after "All". */
export function statusCounts(people: readonly Pick<CompliancePerson, 'status'>[]): Record<ComplianceStatus | 'all', number> {
  const out: Record<ComplianceStatus | 'all', number> = { all: people.length, complete: 0, expiring: 0, missing: 0, expired: 0 };
  for (const p of people) out[p.status] += 1;
  return out;
}

/** The chip order of the status filter (worst first after All). */
export const STATUS_FILTER_ORDER: readonly ComplianceStatus[] = ['expired', 'missing', 'expiring', 'complete'];

/** Anything to look at: an expired or missing requirement, one expiring with alerts on, a conditional approval or a missing date. */
export const hasGap = (p: Pick<CompliancePerson, 'issues'>): boolean => p.issues.length > 0;

/**
 * On board today: the crew list's derived status when it is known for the
 * person (crew_vessel_list), else a current placement (not a planned joiner
 * or a pending placement).
 */
export function isOnBoard(p: Pick<CompliancePerson, 'profileId' | 'placementKind'>, crewStatus: ReadonlyMap<string, CrewStatus> | null): boolean {
  const known = crewStatus?.get(p.profileId);
  if (known) return known === 'on_board';
  return p.placementKind === 'assignment';
}

export interface DepartmentInfo {
  label: string;
  sortOrder: number;
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Every search word must appear in the name, the position or the department. */
export function matchesQuery(p: CompliancePerson, q: string, departments: ReadonlyMap<string, DepartmentInfo>): boolean {
  const words = fold(q.trim()).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const dept = p.departmentKey ? departments.get(p.departmentKey)?.label ?? p.departmentKey : '';
  const hay = fold([p.displayName, p.preferredName ?? '', p.positionName ?? '', p.positionText ?? '', dept].join(' '));
  return words.every((w) => hay.includes(w));
}

/**
 * The people a view shows: the search, then on board only (show=onboard),
 * then the gaps view's people with something to look at, then the status
 * chip. The KPIs are counted before the status chip and the gaps view, so
 * a tile never counts itself away.
 */
export function filterPeople<P extends CompliancePerson>(
  people: readonly P[],
  params: Pick<ComplianceParams, 'q' | 'show' | 'view' | 'status'>,
  ctx: { crewStatus: ReadonlyMap<string, CrewStatus> | null; departments: ReadonlyMap<string, DepartmentInfo> },
): P[] {
  return people.filter(
    (p) =>
      matchesQuery(p, params.q, ctx.departments) &&
      (params.show === 'all' || isOnBoard(p, ctx.crewStatus)) &&
      (params.view !== 'gaps' || hasGap(p)) &&
      (params.status === null || p.status === params.status),
  );
}

/** The people the KPIs count: the search and on board only, before the status chip and the gaps view. */
export function kpiPeople<P extends CompliancePerson>(
  people: readonly P[],
  params: Pick<ComplianceParams, 'q' | 'show'>,
  ctx: { crewStatus: ReadonlyMap<string, CrewStatus> | null; departments: ReadonlyMap<string, DepartmentInfo> },
): P[] {
  return filterPeople(people, { q: params.q, show: params.show, view: 'overview', status: null }, ctx);
}

const UNKNOWN_DEPT_RANK = Number.MAX_SAFE_INTEGER;

const deptRank = (key: string | null, departments: ReadonlyMap<string, DepartmentInfo>) =>
  key === null ? UNKNOWN_DEPT_RANK : departments.get(key)?.sortOrder ?? UNKNOWN_DEPT_RANK - 1;

/** Rank order inside a department (the vessel's sort order), no position last, then the name. */
export function comparePeople(a: CompliancePerson, b: CompliancePerson): number {
  const sa = a.sortOrder ?? Number.MAX_SAFE_INTEGER;
  const sb = b.sortOrder ?? Number.MAX_SAFE_INTEGER;
  if (sa !== sb) return sa - sb;
  const n = collator.compare(a.displayName, b.displayName);
  return n !== 0 ? n : cmpStr(a.profileId, b.profileId);
}

/** Department order (the reference list; unknown departments next, no department last), then rank, then name. */
export function sortPeople<P extends CompliancePerson>(people: readonly P[], departments: ReadonlyMap<string, DepartmentInfo>): P[] {
  return [...people].sort((a, b) => {
    const d = deptRank(a.departmentKey, departments) - deptRank(b.departmentKey, departments);
    if (d !== 0) return d;
    const k = cmpStr(a.departmentKey ?? '', b.departmentKey ?? '');
    return k !== 0 ? k : comparePeople(a, b);
  });
}

export const NO_DEPARTMENT_KEY = '__none__';
export const NO_DEPARTMENT_LABEL = 'No department';
export const FLAT_GROUP_KEY = '__all__';

export interface PeopleGroup<P> {
  key: string;
  label: string;
  people: P[];
}

const humanise = (key: string) => key.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

/** The label of a department key (the reference list's, else the key in words). */
export const departmentLabel = (key: string | null, departments: ReadonlyMap<string, DepartmentInfo>): string =>
  key === null ? NO_DEPARTMENT_LABEL : departments.get(key)?.label ?? humanise(key);

/**
 * People by department in department order (group=dept), or one group of
 * everyone by rank and name (group=flat). Empty groups are never made.
 */
export function groupPeople<P extends CompliancePerson>(
  people: readonly P[],
  group: GroupOption,
  departments: ReadonlyMap<string, DepartmentInfo>,
): PeopleGroup<P>[] {
  if (people.length === 0) return [];
  if (group === 'flat') return [{ key: FLAT_GROUP_KEY, label: 'Everyone', people: [...people].sort(comparePeople) }];
  const out: PeopleGroup<P>[] = [];
  for (const p of sortPeople(people, departments)) {
    const key = p.departmentKey ?? NO_DEPARTMENT_KEY;
    const last = out[out.length - 1];
    if (last && last.key === key) last.people.push(p);
    else out.push({ key, label: departmentLabel(p.departmentKey, departments), people: [p] });
  }
  return out;
}

// ---------------------------------------------------------------- cells

/** What the model needs of a status row. */
export type StatusRowLike = Pick<
  RequirementStatus,
  | 'rowId'
  | 'label'
  | 'groupKey'
  | 'kind'
  | 'tab'
  | 'rowSort'
  | 'state'
  | 'satisfiedVia'
  | 'satisfyingName'
  | 'nextExpiry'
  | 'noExpiry'
  | 'isConditional'
  | 'isMuted'
  | 'missingDate'
  | 'gapReason'
  | 'nearestName'
>;

/** A requirement column of the status matrix. */
export interface RequirementColumn {
  rowId: string;
  label: string;
  groupKey: string;
  tab: ComplianceTab;
  kind: RequirementKind;
  rowSort: number;
}

const TAB_ORDER: Readonly<Record<ComplianceTab, number>> = { documents: 0, stcw: 1, qualifications: 2, familiarisation: 3 };

/** Columns in tab order, then the rows' sort order, then the id. */
const cmpColumn = (a: RequirementColumn, b: RequirementColumn) =>
  TAB_ORDER[a.tab] - TAB_ORDER[b.tab] || a.rowSort - b.rowSort || cmpStr(a.rowId, b.rowId);

/** A cell needs attention (lib/compliance.ts issueReason). */
export const cellHasIssue = (s: Pick<StatusRowLike, 'state' | 'isMuted' | 'isConditional' | 'missingDate'>): boolean => issueReason(s) !== null;

/**
 * The requirement columns of a view: every requirement of the tab that
 * anyone in `rows` is required to meet (tab views), or every requirement
 * someone among `profileIds` has a gap in (the gaps view). The overview has
 * no requirement columns.
 */
export function requirementColumns(
  rowsByProfile: ReadonlyMap<string, readonly StatusRowLike[]>,
  view: StatusView,
  profileIds: readonly string[],
): RequirementColumn[] {
  if (view === 'overview') return [];
  const tab = viewTab(view);
  const out = new Map<string, RequirementColumn>();
  for (const id of profileIds) {
    for (const s of rowsByProfile.get(id) ?? []) {
      if (tab !== null && s.tab !== tab) continue;
      if (view === 'gaps' && !cellHasIssue(s)) continue;
      if (!out.has(s.rowId)) out.set(s.rowId, { rowId: s.rowId, label: s.label, groupKey: s.groupKey, tab: s.tab, kind: s.kind, rowSort: s.rowSort });
    }
  }
  return [...out.values()].sort(cmpColumn);
}

/** The column groups of a view: by requirement group (tab views) or by tab (the gaps view), in column order. */
export function requirementColumnGroups(columns: readonly RequirementColumn[], view: StatusView): Array<{ id: string; label: string }> {
  const seen = new Map<string, string>();
  for (const c of columns) {
    const id = view === 'gaps' ? c.tab : c.groupKey;
    if (!seen.has(id)) seen.set(id, view === 'gaps' ? STATUS_VIEW_LABEL[c.tab] : groupLabel(c.groupKey));
  }
  return [...seen.entries()].map(([id, label]) => ({ id, label }));
}

/** The column's group id in a view. */
export const columnGroupId = (c: RequirementColumn, view: StatusView): string => (view === 'gaps' ? c.tab : c.groupKey);

/** A requirement group's name (STORM wording), else the key in words. */
export const groupLabel = (key: string): string =>
  (REQUIREMENT_GROUPS as readonly string[]).includes(key) ? REQUIREMENT_GROUP_LABEL[key as RequirementGroup] : humanise(key);

/** The person's row for a requirement, or null when it is not required for them. */
export function statusFor(rowsByProfile: ReadonlyMap<string, readonly StatusRowLike[]>, profileId: string, rowId: string): StatusRowLike | null {
  return rowsByProfile.get(profileId)?.find((s) => s.rowId === rowId) ?? null;
}

export type CellState = RequirementState | 'not_required';

/** What a requirement cell says: the state, a short line and the sentence of its tooltip. */
export interface RequirementCellWords {
  state: CellState;
  /** "Met", "Expiring", "Expired", "Missing", "Not required". */
  label: string;
  /** Under the label: the expiry ("Mar 2027", "No expiry"), or null. */
  detail: string | null;
  /** Amber although met: a conditional approval or a missing expiry date. */
  caution: boolean;
  /** The whole sentence (tooltip and screen readers). */
  sentence: string;
}

const STATE_LABEL: Readonly<Record<CellState, string>> = {
  met: 'Met',
  expiring: 'Expiring',
  expired: 'Expired',
  missing: 'Missing',
  not_required: 'Not required',
};

/** "Mar 2027" from a date-only string. */
export function monthText(day: string | null | undefined): string | null {
  const t = dayText(day ?? null);
  return t ? t.split(' ').slice(1).join(' ') : null;
}

/** The words of one cell: the state, its expiry, and why (every missing cell explains itself; every met cell names its document). */
export function requirementCellWords(s: StatusRowLike | null, explain: (s: StatusRowLike) => string): RequirementCellWords {
  if (!s) return { state: 'not_required', label: STATE_LABEL.not_required, detail: null, caution: false, sentence: 'Not required for this position.' };
  const detail =
    s.state === 'missing' ? null : s.noExpiry ? 'No expiry' : s.missingDate ? 'No date' : monthText(s.nextExpiry);
  return {
    state: s.state,
    label: STATE_LABEL[s.state],
    detail,
    caution: (s.state === 'met' || s.state === 'expiring') && (s.isConditional || s.missingDate),
    sentence: explain(s),
  };
}

/** One tab of a person: how many of its requirements are met, the worst state, the next expiring satisfier. */
export interface TabCell {
  tab: ComplianceTab;
  required: number;
  met: number;
  /** expired > missing > expiring (alerts on) > met; null when nothing is required. */
  worst: RequirementState | null;
  /** A met row needs a look (conditional, missing date, expiring with alerts off). */
  caution: boolean;
  /** The labels of the rows that are not met, worst first. */
  gaps: string[];
  next: { date: string; name: string | null } | null;
}

const WORST_ORDER: Readonly<Record<RequirementState, number>> = { expired: 0, missing: 1, expiring: 2, met: 3 };

/** The cell of one tab (the overview's Documents, STCW, Qualifications and Familiarisation columns). */
export function tabCell(rows: readonly StatusRowLike[], tab: ComplianceTab): TabCell {
  const mine = rows.filter((r) => r.tab === tab);
  let met = 0;
  let worst: RequirementState | null = null;
  let caution = false;
  let next: TabCell['next'] = null;
  const gaps: Array<{ label: string; order: number; sort: number }> = [];
  for (const r of mine) {
    const ok = r.state === 'met' || r.state === 'expiring';
    if (ok) met += 1;
    // An expiring row with its alerts off counts as met here (the engine's status rule).
    const effective: RequirementState = r.state === 'expiring' && r.isMuted ? 'met' : r.state;
    if (worst === null || WORST_ORDER[effective] < WORST_ORDER[worst]) worst = effective;
    if (ok && (r.isConditional || r.missingDate || (r.state === 'expiring' && r.isMuted))) caution = true;
    if (effective !== 'met') gaps.push({ label: r.label, order: WORST_ORDER[effective], sort: r.rowSort });
    if (ok && r.nextExpiry && (next === null || r.nextExpiry < next.date)) next = { date: r.nextExpiry, name: r.satisfyingName };
  }
  gaps.sort((a, b) => a.order - b.order || a.sort - b.sort || collator.compare(a.label, b.label));
  return { tab, required: mine.length, met, worst, caution, gaps: gaps.map((g) => g.label), next };
}

/** "3/5", or "—" with nothing required. */
export const ratioText = (met: number, required: number): string => (required === 0 ? '—' : `${met}/${required}`);

/** Days from today to a date (negative once passed); null without one. */
export function daysFrom(today: DateInput, day: string | null | undefined): number | null {
  return day ? daysBetween(toCalendarDate(today), toCalendarDate(day)) : null;
}

/** "in 12 days", "today", "3 days ago". */
export function relativeDays(days: number | null): string | null {
  if (days === null) return null;
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days === -1) return 'yesterday';
  return days > 0 ? `in ${days} days` : `${-days} days ago`;
}

// ---------------------------------------------------------------- the crew list's dots (C5)

export type DotKind = 'documents' | 'qualifications';

/** The issues behind one dot: the Documents tab, or STCW and Qualifications. */
export function dotIssues(issues: readonly ComplianceIssue[], dot: DotKind): ComplianceIssue[] {
  return issues.filter((i) => (dot === 'documents' ? i.tab === 'documents' : i.tab === 'stcw' || i.tab === 'qualifications'));
}

const ISSUE_WORDS: Readonly<Record<ComplianceIssueReason, string>> = {
  expired: 'expired',
  missing: 'missing',
  expiring: 'expiring soon',
  conditional: 'conditionally approved',
  missing_date: 'expiry date missing',
};

/** "Passport: expired". */
export const issueText = (issue: Pick<ComplianceIssue, 'label' | 'reason'>): string => `${issue.label}: ${ISSUE_WORDS[issue.reason]}`;

// ---------------------------------------------------------------- the profile's "Missing required" (C24)

/** A requirement of the person's role on a documents tab that is not met: missing, or held only expired. */
export interface MissingOnTab {
  rowId: string;
  label: string;
  state: 'missing' | 'expired';
  sentence: string;
  /** The document types that would satisfy it, in option order (empty when the options cannot be read). */
  optionTypeIds: string[];
}

/** The tab's missing and expired document requirements, missing first, then in row order. */
export function missingOnTab(
  rows: readonly StatusRowLike[],
  tab: ComplianceTab,
  optionsByRow: ReadonlyMap<string, readonly string[]>,
  explain: (s: StatusRowLike) => string,
): MissingOnTab[] {
  return rows
    .filter((r): r is StatusRowLike & { state: 'missing' | 'expired' } => r.tab === tab && r.kind === 'document' && (r.state === 'missing' || r.state === 'expired'))
    .sort((a, b) => (a.state === b.state ? 0 : a.state === 'missing' ? -1 : 1) || a.rowSort - b.rowSort || cmpStr(a.rowId, b.rowId))
    .map((r) => ({ rowId: r.rowId, label: r.label, state: r.state, sentence: explain(r), optionTypeIds: [...(optionsByRow.get(r.rowId) ?? [])] }));
}

// ---------------------------------------------------------------- the configuration matrix (C33)

/** What the model needs of a configuration row. */
export interface ConfigRowLike {
  id: string;
  groupKey: string;
  label: string;
  sortOrder: number;
  options: readonly unknown[];
  positionIds: readonly string[];
  heldBy: number;
}

const GROUP_ORDER = new Map<string, number>(REQUIREMENT_GROUPS.map((g, i) => [g, i]));

/** Rows in group order (W5 §1), then the vessel's sort order, then the name. */
export function sortConfigRows<R extends ConfigRowLike>(rows: readonly R[]): R[] {
  return [...rows].sort(
    (a, b) =>
      (GROUP_ORDER.get(a.groupKey) ?? 99) - (GROUP_ORDER.get(b.groupKey) ?? 99) ||
      a.sortOrder - b.sortOrder ||
      collator.compare(a.label, b.label) ||
      cmpStr(a.id, b.id),
  );
}

const plural = (n: number, one: string, other: string) => `${n} ${n === 1 ? one : other}`;

/** "2 options · held by 6". */
export const rowSummary = (row: Pick<ConfigRowLike, 'options' | 'heldBy'>): string =>
  `${plural(row.options.length, 'option', 'options')} · held by ${row.heldBy}`;

/** What the model needs of a position column. */
export interface ConfigPositionLike {
  positionId: string;
  name: string;
  departmentKey: string;
  departmentLabel: string;
  departmentSort: number;
  sortOrder: number;
  isListed: boolean;
}

/** Positions by department, then the vessel's rank order, then the name; listed ones before the others of a department. */
export function sortPositions<P extends ConfigPositionLike>(positions: readonly P[]): P[] {
  return [...positions].sort(
    (a, b) =>
      a.departmentSort - b.departmentSort ||
      cmpStr(a.departmentKey, b.departmentKey) ||
      Number(b.isListed) - Number(a.isListed) ||
      a.sortOrder - b.sortOrder ||
      collator.compare(a.name, b.name) ||
      cmpStr(a.positionId, b.positionId),
  );
}

/** The departments of the columns, in column order (the matrix's column groups). */
export function positionGroups(positions: readonly ConfigPositionLike[]): Array<{ id: string; label: string }> {
  const seen = new Map<string, string>();
  for (const p of positions) if (!seen.has(p.departmentKey)) seen.set(p.departmentKey, p.departmentLabel);
  return [...seen.entries()].map(([id, label]) => ({ id, label }));
}

/** The staged matrix changes as crew_requirement_cell_set cells (only real changes, each cell once, last change wins). */
export function changesToCells(changes: ReadonlyArray<{ rowId: string; columnId: string; from: boolean; to: boolean }>): CrewRequirementCell[] {
  const byCell = new Map<string, CrewRequirementCell>();
  for (const c of changes) {
    if (c.from === c.to) byCell.delete(`${c.rowId}:${c.columnId}`);
    else byCell.set(`${c.rowId}:${c.columnId}`, { row_id: c.rowId, position_id: c.columnId, required: c.to });
  }
  return [...byCell.values()];
}

// ---------------------------------------------------------------- forms of the configuration tab

/** The most options a requirement takes (the server refuses more: options_too_many). */
export const MAX_REQUIREMENT_OPTIONS = 20;
export const REQUIREMENT_LABEL_MAX = 120;

const DOCUMENT_GROUPS = REQUIREMENT_GROUPS.filter((g) => g !== 'familiarisation') as readonly RequirementGroup[];
export const DOCUMENT_REQUIREMENT_GROUPS: readonly RequirementGroup[] = DOCUMENT_GROUPS;

const trimmed = (max: number, message: string) =>
  z.preprocess((v) => (typeof v === 'string' ? v.trim() : v), z.string({ required_error: message, invalid_type_error: message }).min(1, message).max(max, `Keep it to ${max} characters or fewer`));

/**
 * A requirement row (the add-qualification dialog): a name, a group (the
 * Familiarisation group for familiarisation, any other for documents),
 * 1 to 20 options of the row's kind, and whether every listed position
 * requires it at once.
 */
export const requirementRowSchema = z
  .object({
    kind: z.enum(['document', 'familiarisation']),
    groupKey: z.enum(REQUIREMENT_GROUPS),
    label: trimmed(REQUIREMENT_LABEL_MAX, 'Give the requirement a name.'),
    optionIds: z
      .array(z.string().min(1))
      .min(1, 'Choose at least one document or familiarisation that satisfies it.')
      .max(MAX_REQUIREMENT_OPTIONS, `A requirement takes at most ${MAX_REQUIREMENT_OPTIONS} options.`),
    requireAll: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (v.kind === 'familiarisation' && v.groupKey !== 'familiarisation') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['groupKey'], message: 'Familiarisation requirements go in the Familiarisation group.' });
    }
    if (v.kind === 'document' && v.groupKey === 'familiarisation') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['groupKey'], message: 'Choose a group for a document requirement.' });
    }
    if (new Set(v.optionIds).size !== v.optionIds.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['optionIds'], message: 'Each option is chosen once.' });
    }
  });

export type RequirementRowValues = z.infer<typeof requirementRowSchema>;

/** crew_requirement_row_save's payload for a new row: the options of its kind and, with require all, every listed position ticked. */
export function toRequirementRowPayload(values: RequirementRowValues, listedPositionIds: readonly string[]): CrewRequirementRowPayload {
  return {
    kind: values.kind,
    group_key: values.groupKey,
    label: values.label.trim(),
    options: values.optionIds.map((id) => (values.kind === 'document' ? { document_type_id: id } : { familiarization_template_id: id })),
    ...(values.requireAll ? { position_ids: [...new Set(listedPositionIds)] } : {}),
  };
}

const optionalTrimmed = (max: number, message: string) =>
  z.preprocess((v) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null), z.string().max(max, message).nullable());

/**
 * A company document type (crew_document_type_create): a category, a name
 * of 1 to 120 characters, an optional code (up to 24 letters, digits and
 * dashes; stored in capitals), abbreviation (24) and default validity
 * (0 to 240 months).
 */
export const companyDocumentTypeSchema = z.object({
  categoryKey: z.string({ required_error: 'Choose a category.' }).min(1, 'Choose a category.'),
  name: trimmed(120, 'Give the document type a name.').refine((v) => /[\p{L}\p{N}]/u.test(v), 'Give the document type a name with letters or digits in it.'),
  code: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() !== '' ? v.trim().toUpperCase() : null),
    z.string().regex(/^[A-Z0-9][A-Z0-9-]{0,23}$/, 'A code has up to 24 letters, digits and dashes.').nullable(),
  ),
  abbreviation: optionalTrimmed(24, 'An abbreviation has up to 24 characters.'),
  defaultValidityMonths: z.preprocess(
    (v) => (v === '' || v === null || v === undefined || (typeof v === 'number' && Number.isNaN(v)) ? null : typeof v === 'string' ? Number(v) : v),
    z.number({ invalid_type_error: 'Enter a whole number of months.' }).int('Enter a whole number of months.').min(0, 'A default validity is 0 to 240 months.').max(240, 'A default validity is 0 to 240 months.').nullable(),
  ),
});

export type CompanyDocumentTypeValues = z.infer<typeof companyDocumentTypeSchema>;

// ---------------------------------------------------------------- equivalences (C34)

export const SATISFACTION_KIND_LABEL: Readonly<Record<'supersedes' | 'component' | 'equivalent', string>> = {
  supersedes: 'Higher certificate (covers the lower one)',
  component: 'Combined certificate (covers each part)',
  equivalent: 'Accepted equivalent',
};

/** What the drawer needs of a rule. */
export interface RuleLike {
  id: string;
  companyId: string | null;
  typeId: string;
  satisfiesTypeId: string;
  kind: 'supersedes' | 'component' | 'equivalent';
}

/** The company's rules first, then STORM's; each by the satisfied type's name, then the holder's. */
export function sortRules<R extends RuleLike>(rules: readonly R[], nameOf: (typeId: string) => string): R[] {
  return [...rules].sort(
    (a, b) =>
      Number(a.companyId === null) - Number(b.companyId === null) ||
      collator.compare(nameOf(a.satisfiesTypeId), nameOf(b.satisfiesTypeId)) ||
      collator.compare(nameOf(a.typeId), nameOf(b.typeId)) ||
      cmpStr(a.id, b.id),
  );
}

/** A rule for the pair exists already (either direction is a different rule). */
export const ruleExists = (rules: readonly RuleLike[], typeId: string, satisfiesTypeId: string): boolean =>
  rules.some((r) => r.typeId === typeId && r.satisfiesTypeId === satisfiesTypeId);

export { COMPLIANCE_TABS };
