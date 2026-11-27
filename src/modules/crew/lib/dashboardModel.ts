/**
 * The vessel crew dashboard's model (gap/04 C2; X1-10B). Pure: no client,
 * no React, so the parse of crew_vessel_dashboard (061000), the five KPI
 * tiles, the Action required list and the cards' rows are unit-tested.
 *
 * The RPC answers one jsonb with a section per tile, each for its own read
 * capability on the vessel ({allowed: false} otherwise; hours of rest also
 * {enabled: false} when the vessel has it off):
 *
 *   crewing        on board / total (crew list)
 *   compliance     compliant / total, by worst status (crew compliance)
 *   onboarding     open joiners of the last 90 days (crew list)
 *   documents      expired + expiring, by person (crew certificates)
 *   hours_of_rest  open breaches + last month's months not submitted (hours of rest)
 *
 * Each tile has its own state (DS13): loading, ready, zero, not enabled,
 * error, or no access (hidden). While the RPC is not applied (D-01) every
 * tile says it is not enabled yet, never 0; any other failure is each
 * tile's error with Try again. A section the server sent malformed is that
 * tile's error only. Every number links to the list it summarises.
 */
import type { KpiTileState } from '@/shared/components/data/KpiTile';
import type { Tone } from '@/components/ui/tones';
import { CREW_PATHS, CREW_ROOT } from '../paths';
import {
  formatDay,
  parseOnboardingFamiliarisation,
  personName,
  profileTabPath,
  type OnboardingFamiliarisation,
  type OnboardingPlacement,
} from './onboarding';

/** How far back the dashboard counts joiners (the RPC's onboarding window). */
export const DASHBOARD_JOINER_DAYS = 90;

/** At most this many people per card, as the server caps them. */
export const DASHBOARD_PEOPLE_LIMIT = 20;

/** In-page anchors of the cards a tile can point at. */
export const DASHBOARD_ANCHORS = {
  onboarding: 'crew-dashboard-onboarding',
  documents: 'crew-dashboard-documents',
  hoursOfRest: 'crew-dashboard-hours-of-rest',
} as const;

export const NOT_SET_UP_REASON = 'Turns on once the crew update is applied';

// ---------------------------------------------------------------- sections

export type SectionState<T> =
  | { kind: 'ready'; data: T }
  /** The viewer may not see this source on the vessel: the tile and its card are hidden. */
  | { kind: 'no_access' }
  /** The source is switched off on the vessel (hours of rest). */
  | { kind: 'off' }
  /** The server sent something that is not the contract. */
  | { kind: 'invalid' };

export interface CrewingSection {
  total: number;
  onBoard: number;
  onLeave: number;
  pending: number;
  onTransfer: number;
  ashore: number;
}

export interface ComplianceSection {
  total: number;
  complete: number;
  expiring: number;
  missing: number;
  expired: number;
}

export interface DashboardJoiner {
  profileId: string;
  displayName: string;
  positionName: string | null;
  placementKind: OnboardingPlacement;
  joinDate: string | null;
  percent: number;
  passed: number;
  known: number;
  famRequired: number;
  famCompleted: number;
  familiarisation: OnboardingFamiliarisation[];
}

export interface OnboardingSection {
  joiners: number;
  open: number;
  people: DashboardJoiner[];
  /** Familiarisations past their due date among the open joiners. */
  overdueFamiliarisations: number;
}

export interface DocumentsPerson {
  profileId: string;
  displayName: string;
  expired: number;
  expiring: number;
  nextExpiry: string | null;
}

export interface DocumentsSection {
  expired: number;
  expiring: number;
  people: DocumentsPerson[];
}

export interface HoursOfRestPerson {
  profileId: string;
  displayName: string;
  openBreaches: number;
  unsubmitted: boolean;
}

export interface HoursOfRestSection {
  openBreaches: number;
  unsubmitted: number;
  /** The month counted for "not submitted" (last month), yyyy-MM. */
  month: string;
  people: HoursOfRestPerson[];
}

export interface CrewDashboard {
  vesselId: string;
  today: string;
  crewing: SectionState<CrewingSection>;
  compliance: SectionState<ComplianceSection>;
  onboarding: SectionState<OnboardingSection>;
  documents: SectionState<DocumentsSection>;
  hoursOfRest: SectionState<HoursOfRestSection>;
}

export class DashboardShapeError extends Error {
  readonly answer: unknown;
  constructor(message: string, answer: unknown) {
    super(message);
    this.name = 'DashboardShapeError';
    this.answer = answer;
  }
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => v !== null && typeof v === 'object' && !Array.isArray(v);
const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);
const DAY = /^\d{4}-\d{2}-\d{2}/;
const day = (v: unknown): string | null => (typeof v === 'string' && DAY.test(v) ? v.slice(0, 10) : null);
const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** Counts named in `keys`, all whole and not negative; null when one is not. */
function counts<K extends string>(o: Obj, keys: readonly K[]): Record<K, number> | null {
  const out = {} as Record<K, number>;
  for (const k of keys) {
    const v = o[k];
    if (!isCount(v)) return null;
    out[k] = v;
  }
  return out;
}

/** allowed: false → no access; not an object, or allowed not true → invalid; else the section's own reading (null → invalid). */
function readSection<T>(value: unknown, parse: (o: Obj) => SectionState<T> | null): SectionState<T> {
  if (!isObj(value)) return { kind: 'invalid' };
  if (value.allowed === false) return { kind: 'no_access' };
  if (value.allowed !== true) return { kind: 'invalid' };
  return parse(value) ?? { kind: 'invalid' };
}

const ready = <T>(data: T | null): SectionState<T> | null => (data === null ? null : { kind: 'ready', data });

function parseCrewing(o: Obj): CrewingSection | null {
  const c = counts(o, ['total', 'on_board', 'on_leave', 'pending', 'on_transfer', 'ashore'] as const);
  if (!c || c.on_board > c.total) return null;
  return { total: c.total, onBoard: c.on_board, onLeave: c.on_leave, pending: c.pending, onTransfer: c.on_transfer, ashore: c.ashore };
}

function parseCompliance(o: Obj): ComplianceSection | null {
  const c = counts(o, ['total', 'complete', 'expiring', 'missing', 'expired'] as const);
  if (!c || c.complete > c.total) return null;
  return c;
}

function parseJoiner(v: unknown): DashboardJoiner | null {
  if (!isObj(v)) return null;
  const profileId = str(v.profile_id);
  if (!profileId) return null;
  const n = (x: unknown) => (isCount(x) ? x : 0);
  const famRequired = n(v.fam_required);
  const percent = typeof v.percent === 'number' && Number.isFinite(v.percent) ? Math.min(Math.max(Math.round(v.percent), 0), 100) : 0;
  return {
    profileId,
    displayName: personName(str(v.first_name), str(v.last_name), str(v.preferred_name)),
    positionName: str(v.position_name),
    placementKind: v.placement_kind === 'planned' || v.placement_kind === 'pending_placement' ? v.placement_kind : 'assignment',
    joinDate: day(v.join_date),
    percent,
    passed: n(v.passed),
    known: n(v.known),
    famRequired,
    famCompleted: Math.min(n(v.fam_completed), famRequired),
    familiarisation: parseOnboardingFamiliarisation(v.familiarisation),
  };
}

function parseOnboarding(o: Obj): OnboardingSection | null {
  const c = counts(o, ['joiners', 'open'] as const);
  if (!c || c.open > c.joiners || !Array.isArray(o.people)) return null;
  const people = o.people.map(parseJoiner).filter((p): p is DashboardJoiner => p !== null);
  const overdueFamiliarisations = people.reduce((sum, p) => sum + p.familiarisation.filter((f) => f.overdue && f.status !== 'completed').length, 0);
  return { joiners: c.joiners, open: c.open, people, overdueFamiliarisations };
}

function parseDocumentsPerson(v: unknown): DocumentsPerson | null {
  if (!isObj(v)) return null;
  const profileId = str(v.profile_id);
  if (!profileId || !isCount(v.expired) || !isCount(v.expiring)) return null;
  return {
    profileId,
    displayName: personName(str(v.first_name), str(v.last_name), str(v.preferred_name)),
    expired: v.expired,
    expiring: v.expiring,
    nextExpiry: day(v.next_expiry),
  };
}

function parseDocuments(o: Obj): DocumentsSection | null {
  const c = counts(o, ['expired', 'expiring'] as const);
  if (!c || !Array.isArray(o.people)) return null;
  return { ...c, people: o.people.map(parseDocumentsPerson).filter((p): p is DocumentsPerson => p !== null) };
}

function parseHorPerson(v: unknown): HoursOfRestPerson | null {
  if (!isObj(v)) return null;
  const profileId = str(v.profile_id);
  if (!profileId || !isCount(v.open_breaches)) return null;
  return {
    profileId,
    displayName: personName(str(v.first_name), str(v.last_name), str(v.preferred_name)),
    openBreaches: v.open_breaches,
    unsubmitted: v.unsubmitted === true,
  };
}

function parseHoursOfRest(o: Obj): SectionState<HoursOfRestSection> | null {
  if (o.enabled === false) return { kind: 'off' };
  if (o.enabled !== true) return null;
  const c = counts(o, ['open_breaches', 'unsubmitted'] as const);
  const month = typeof o.month === 'string' && MONTH.test(o.month) ? o.month : null;
  if (!c || !month || !Array.isArray(o.people)) return null;
  return {
    kind: 'ready',
    data: {
      openBreaches: c.open_breaches,
      unsubmitted: c.unsubmitted,
      month,
      people: o.people.map(parseHorPerson).filter((p): p is HoursOfRestPerson => p !== null),
    },
  };
}

/**
 * The RPC's answer. Not an object, or no vessel id or day: the whole answer
 * is not the contract (DashboardShapeError). Each section is read on its
 * own, so one malformed section is one tile's error.
 */
export function parseCrewDashboard(value: unknown): CrewDashboard {
  if (!isObj(value)) throw new DashboardShapeError('The crew dashboard answer is not an object.', value);
  const vesselId = str(value.vessel_id);
  const today = day(value.today);
  if (!vesselId || !today) throw new DashboardShapeError('The crew dashboard answer names no vessel or day.', value);
  return {
    vesselId,
    today,
    crewing: readSection(value.crewing, (o) => ready(parseCrewing(o))),
    compliance: readSection(value.compliance, (o) => ready(parseCompliance(o))),
    onboarding: readSection(value.onboarding, (o) => ready(parseOnboarding(o))),
    documents: readSection(value.documents, (o) => ready(parseDocuments(o))),
    hoursOfRest: readSection(value.hours_of_rest, parseHoursOfRest),
  };
}

// ---------------------------------------------------------------- words

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "October 2026" for 2026-10. */
export function monthName(month: string): string {
  const m = MONTH.exec(month);
  return m ? `${MONTH_NAMES[Number(m[2]) - 1]} ${m[1]}` : month;
}

/** "Oct" for 2026-10 (the tile's short line). */
export function monthShort(month: string): string {
  const m = MONTH.exec(month);
  return m ? MONTH_NAMES[Number(m[2]) - 1].slice(0, 3) : month;
}

/** "1 document", "3 documents". */
export const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

// ---------------------------------------------------------------- links (relative to /v/:vesselCode)

export const crewListHref = (status?: string): string => (status ? `${CREW_PATHS.list}?status=${status}` : CREW_PATHS.list);

export function complianceHref(params: { view?: string; status?: string | null } = {}): string {
  const q = new URLSearchParams();
  if (params.view) q.set('view', params.view);
  if (params.status) q.set('status', params.status);
  const s = q.toString();
  return `${CREW_PATHS.complianceStatus}${s ? `?${s}` : ''}`;
}

export const anchorHref = (anchor: string): string => `${CREW_ROOT}#${anchor}`;

export const horReportHref = (month?: string | null): string =>
  `${CREW_PATHS.hoursOfRest}/report${month && MONTH.test(month) ? `?year=${month.slice(0, 4)}` : ''}`;

export const horBoardHref = (params: { month?: string | null; queue?: string } = {}): string => {
  const q = new URLSearchParams();
  if (params.month && MONTH.test(params.month)) q.set('month', params.month);
  if (params.queue) q.set('queue', params.queue);
  const s = q.toString();
  return `${CREW_PATHS.hoursOfRest}${s ? `?${s}` : ''}`;
};

/** Where the documents tile and the card's Full report go: the compliance documents view when the viewer has it, else the card. */
export function documentsHref(d: CrewDashboard, focus: 'expired' | 'expiring' | null): string {
  if (d.compliance.kind === 'ready') return complianceHref({ view: 'documents', status: focus });
  return anchorHref(DASHBOARD_ANCHORS.documents);
}

export const profileHref = profileTabPath;

// ---------------------------------------------------------------- tiles

export const DASHBOARD_TILE_KEYS = ['crewing', 'compliance', 'onboarding', 'documents', 'hours_of_rest'] as const;
export type DashboardTileKey = (typeof DASHBOARD_TILE_KEYS)[number];

export const DASHBOARD_TILE_LABEL: Readonly<Record<DashboardTileKey, string>> = {
  crewing: 'Crewing',
  compliance: 'Compliance',
  onboarding: 'Onboarding',
  documents: 'Documents',
  hours_of_rest: 'Hours of rest',
};

/** What the page knows of the dashboard RPC. */
export type DashboardQuery =
  | { status: 'loading' }
  /** The RPC is not applied yet (D-01). */
  | { status: 'not_set_up' }
  | { status: 'error' }
  | { status: 'ready'; dashboard: CrewDashboard };

/**
 * What the viewer may see, from their capabilities on the vessel: while the
 * answer is not in (loading, not set up, error) a tile the viewer could not
 * see anyway stays hidden. Once it is in, the server's `allowed` decides.
 */
export interface DashboardAccess {
  compliance: boolean;
  documents: boolean;
  hoursOfRest: boolean;
}

export interface TileModel {
  key: DashboardTileKey;
  label: string;
  state: KpiTileState;
  value?: number | null;
  unit?: string;
  sub?: string;
  tone?: Tone;
  /** Relative to /v/:vesselCode (a `crew#…` anchor for an in-page card). */
  href?: string;
  zeroLabel?: string;
  notEnabledReason?: string;
  errorMessage?: string;
}

const SECTION_ERROR = 'This figure could not be read';

const tileAccess = (key: DashboardTileKey, access: DashboardAccess): boolean =>
  key === 'compliance' ? access.compliance : key === 'documents' ? access.documents : key === 'hours_of_rest' ? access.hoursOfRest : true;

function crewingTile(s: SectionState<CrewingSection>): TileModel {
  const base = { key: 'crewing' as const, label: DASHBOARD_TILE_LABEL.crewing };
  if (s.kind !== 'ready') return { ...base, state: s.kind === 'no_access' ? 'no-access' : 'error', errorMessage: SECTION_ERROR };
  const c = s.data;
  if (c.total === 0) return { ...base, state: 'ready', value: 0, sub: 'No one on the crew list yet', href: crewListHref() };
  const parts = [
    c.pending > 0 ? `${c.pending} pending` : null,
    c.onLeave > 0 ? `${c.onLeave} on leave` : null,
    c.onTransfer > 0 ? `${c.onTransfer} on transfer` : null,
    c.ashore > 0 ? `${c.ashore} ashore` : null,
  ].filter(Boolean);
  return {
    ...base,
    state: 'ready',
    value: c.onBoard,
    unit: `/ ${c.total}`,
    sub: parts.length ? parts.join(' · ') : 'Everyone on the list is on board',
    href: crewListHref('on_board'),
  };
}

/** The worst problem in a compliance count, the status filter its tile opens. */
export function worstComplianceStatus(c: ComplianceSection): 'expired' | 'missing' | 'expiring' | null {
  if (c.expired > 0) return 'expired';
  if (c.missing > 0) return 'missing';
  if (c.expiring > 0) return 'expiring';
  return null;
}

function complianceTile(s: SectionState<ComplianceSection>): TileModel {
  const base = { key: 'compliance' as const, label: DASHBOARD_TILE_LABEL.compliance };
  if (s.kind !== 'ready') return { ...base, state: s.kind === 'no_access' ? 'no-access' : 'error', errorMessage: SECTION_ERROR };
  const c = s.data;
  if (c.total === 0) return { ...base, state: 'ready', value: 0, sub: 'No one to check yet', href: complianceHref() };
  const parts = [
    c.expired > 0 ? `${c.expired} expired` : null,
    c.missing > 0 ? `${c.missing} missing` : null,
    c.expiring > 0 ? `${c.expiring} expiring` : null,
  ].filter(Boolean);
  const worst = worstComplianceStatus(c);
  return {
    ...base,
    state: 'ready',
    value: c.complete,
    unit: `/ ${c.total}`,
    sub: parts.length ? parts.join(' · ') : 'Everyone holds what their position needs',
    tone: worst === 'expired' || worst === 'missing' ? 'danger' : worst === 'expiring' ? 'warn' : undefined,
    href: complianceHref({ status: worst }),
  };
}

function onboardingTile(s: SectionState<OnboardingSection>): TileModel {
  const base = { key: 'onboarding' as const, label: DASHBOARD_TILE_LABEL.onboarding, href: anchorHref(DASHBOARD_ANCHORS.onboarding) };
  if (s.kind !== 'ready') return { ...base, href: undefined, state: s.kind === 'no_access' ? 'no-access' : 'error', errorMessage: SECTION_ERROR };
  const o = s.data;
  if (o.open === 0) {
    return { ...base, state: 'zero', value: 0, zeroLabel: o.joiners > 0 ? 'Every recent joiner is onboarded' : `No joiners in the last ${DASHBOARD_JOINER_DAYS} days` };
  }
  const overdue = o.overdueFamiliarisations > 0 ? ` · ${plural(o.overdueFamiliarisations, 'familiarisation')} overdue` : '';
  return {
    ...base,
    state: 'ready',
    value: o.open,
    sub: `of ${plural(o.joiners, 'recent joiner')}${overdue}`,
    tone: o.overdueFamiliarisations > 0 ? 'danger' : 'info',
  };
}

function documentsTile(d: CrewDashboard): TileModel {
  const s = d.documents;
  const base = { key: 'documents' as const, label: DASHBOARD_TILE_LABEL.documents };
  if (s.kind !== 'ready') return { ...base, state: s.kind === 'no_access' ? 'no-access' : 'error', errorMessage: SECTION_ERROR };
  const c = s.data;
  const total = c.expired + c.expiring;
  if (total === 0) return { ...base, state: 'zero', value: 0, zeroLabel: 'Nothing expired or expiring', href: documentsHref(d, null) };
  return {
    ...base,
    state: 'ready',
    value: total,
    sub: `${c.expired} expired · ${c.expiring} expiring`,
    tone: c.expired > 0 ? 'danger' : 'warn',
    href: documentsHref(d, c.expired > 0 ? 'expired' : 'expiring'),
  };
}

function hoursOfRestTile(s: SectionState<HoursOfRestSection>): TileModel {
  const base = { key: 'hours_of_rest' as const, label: DASHBOARD_TILE_LABEL.hours_of_rest };
  if (s.kind === 'off') return { ...base, state: 'not-enabled', notEnabledReason: 'Hours of rest is off on this vessel' };
  if (s.kind !== 'ready') return { ...base, state: s.kind === 'no_access' ? 'no-access' : 'error', errorMessage: SECTION_ERROR };
  const h = s.data;
  const month = monthShort(h.month);
  const total = h.openBreaches + h.unsubmitted;
  const href = horReportHref(h.month);
  if (total === 0) return { ...base, state: 'zero', value: 0, zeroLabel: `No open breaches · ${month} submitted`, href };
  return {
    ...base,
    state: 'ready',
    value: total,
    sub: `${plural(h.openBreaches, 'open breach', 'open breaches')} · ${h.unsubmitted} unsubmitted for ${month}`,
    tone: h.openBreaches > 0 ? 'danger' : 'warn',
    href,
  };
}

/** The five tiles, in order, for what the page knows. */
export function dashboardTiles(query: DashboardQuery, access: DashboardAccess): TileModel[] {
  if (query.status !== 'ready') {
    return DASHBOARD_TILE_KEYS.map((key): TileModel => {
      const base = { key, label: DASHBOARD_TILE_LABEL[key] };
      if (!tileAccess(key, access)) return { ...base, state: 'no-access' };
      if (query.status === 'loading') return { ...base, state: 'loading' };
      if (query.status === 'not_set_up') return { ...base, state: 'not-enabled', notEnabledReason: NOT_SET_UP_REASON };
      return { ...base, state: 'error', errorMessage: 'Could not load' };
    });
  }
  const d = query.dashboard;
  return [crewingTile(d.crewing), complianceTile(d.compliance), onboardingTile(d.onboarding), documentsTile(d), hoursOfRestTile(d.hoursOfRest)];
}

// ---------------------------------------------------------------- Action required

export interface ActionItem {
  key: 'documents_expired' | 'compliance_missing' | 'hor_breaches' | 'hor_unsubmitted' | 'familiarisation_overdue' | 'documents_expiring';
  tone: 'danger' | 'warn';
  count: number;
  text: string;
  href: string;
}

export interface ActionContext {
  /** May open the hours-of-rest board (hours_of_rest.approve); else the report. */
  canApproveHor: boolean;
  /** May open the familiarisation list (familiarisation.view); else the onboarding card. */
  canViewFamiliarisation: boolean;
}

/** What needs someone today, most urgent first (danger before warn). */
export function dashboardActions(d: CrewDashboard, ctx: ActionContext): ActionItem[] {
  const out: ActionItem[] = [];
  const docs = d.documents.kind === 'ready' ? d.documents.data : null;
  const comp = d.compliance.kind === 'ready' ? d.compliance.data : null;
  const hor = d.hoursOfRest.kind === 'ready' ? d.hoursOfRest.data : null;
  const onb = d.onboarding.kind === 'ready' ? d.onboarding.data : null;
  if (docs && docs.expired > 0) {
    out.push({ key: 'documents_expired', tone: 'danger', count: docs.expired, text: `${plural(docs.expired, 'document')} expired`, href: documentsHref(d, 'expired') });
  }
  if (comp && comp.missing > 0) {
    out.push({
      key: 'compliance_missing',
      tone: 'danger',
      count: comp.missing,
      text: `${plural(comp.missing, 'crew member')} missing something their position requires`,
      href: complianceHref({ status: 'missing' }),
    });
  }
  if (hor && hor.openBreaches > 0) {
    out.push({
      key: 'hor_breaches',
      tone: 'danger',
      count: hor.openBreaches,
      text: `${plural(hor.openBreaches, 'hours-of-rest breach', 'hours-of-rest breaches')} to review`,
      href: horReportHref(hor.month),
    });
  }
  if (onb && onb.overdueFamiliarisations > 0) {
    out.push({
      key: 'familiarisation_overdue',
      tone: 'danger',
      count: onb.overdueFamiliarisations,
      text: `${plural(onb.overdueFamiliarisations, 'familiarisation')} overdue`,
      href: ctx.canViewFamiliarisation ? `${CREW_PATHS.familiarisation}?all=1` : anchorHref(DASHBOARD_ANCHORS.onboarding),
    });
  }
  if (hor && hor.unsubmitted > 0) {
    out.push({
      key: 'hor_unsubmitted',
      tone: 'warn',
      count: hor.unsubmitted,
      text: `${plural(hor.unsubmitted, 'crew member')} yet to submit ${monthName(hor.month)}`,
      href: ctx.canApproveHor ? horBoardHref({ month: hor.month, queue: 'waiting' }) : horReportHref(hor.month),
    });
  }
  if (docs && docs.expiring > 0) {
    out.push({ key: 'documents_expiring', tone: 'warn', count: docs.expiring, text: `${plural(docs.expiring, 'document')} expiring soon`, href: documentsHref(d, 'expiring') });
  }
  return out;
}

/**
 * Nothing needs action, and every source the viewer reads answered (hours
 * of rest switched off counts as answered). A hidden or unreadable source
 * never lets the page say "all clear".
 */
export function dashboardAllClear(d: CrewDashboard, actions: readonly ActionItem[]): boolean {
  if (actions.length > 0) return false;
  const answered = (s: SectionState<unknown>) => s.kind === 'ready';
  return answered(d.crewing) && answered(d.compliance) && answered(d.onboarding) && answered(d.documents) && (answered(d.hoursOfRest) || d.hoursOfRest.kind === 'off');
}

// ---------------------------------------------------------------- the cards' rows

/** "Expired 3 Nov 2026" / "Next expires 12 Dec 2026", or null without a date. */
export function nextExpiryText(person: Pick<DocumentsPerson, 'nextExpiry'>, today: string): string | null {
  const text = formatDay(person.nextExpiry);
  if (!text || !person.nextExpiry) return null;
  return person.nextExpiry < today ? `Expired ${text}` : `Next expires ${text}`;
}

/** The card says when it shows only the most urgent people. */
export const isCapped = (people: readonly unknown[]): boolean => people.length >= DASHBOARD_PEOPLE_LIMIT;

// ---------------------------------------------------------------- the cards' states

/** What a card built on one dashboard section shows. */
export type CardState<T> =
  | { kind: 'hidden' }
  | { kind: 'loading' }
  | { kind: 'not_set_up' }
  | { kind: 'error' }
  | { kind: 'off' }
  | { kind: 'invalid' }
  | { kind: 'ready'; data: T };

/**
 * A card's state from the query and its section: hidden when the viewer may
 * not see the source (by capability before the answer, by the server's
 * `allowed` after it), else the query's state, else the section's.
 */
export function cardState<T>(query: DashboardQuery, pick: (d: CrewDashboard) => SectionState<T>, visible: boolean): CardState<T> {
  if (query.status !== 'ready') {
    if (!visible) return { kind: 'hidden' };
    return { kind: query.status === 'loading' ? 'loading' : query.status === 'not_set_up' ? 'not_set_up' : 'error' };
  }
  const s = pick(query.dashboard);
  return s.kind === 'no_access' ? { kind: 'hidden' } : s;
}
