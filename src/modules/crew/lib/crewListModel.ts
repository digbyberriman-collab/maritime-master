/**
 * The vessel crew list's model (gap/04 C3, C4, C7; X1-02). Pure: no client,
 * no React, so the URL rules, search, counts, sorting and the mapping of
 * both data sources are unit-tested directly.
 *
 * - URL state: `tab` (crew | movements), `q`, `dept`, `status`, `sort`
 *   (rank | name | join), `dir` (asc | desc), and the Movements range
 *   `from` / `to`. Defaults are left out of the URL, so a plain
 *   `/v/:vc/crew/list` is the default view; unknown values fall back to the
 *   defaults instead of failing.
 * - Rows: one shape for the server list (crew_vessel_list) and for the
 *   documented D-01 fallback (the legacy useCrew rows of the vessel), so the
 *   page renders either the same way. The fallback's status comes from the
 *   same rule (crewStatusDecide): a pending placement or a later join is
 *   Pending, else today's leave-planner code decides On leave / On board.
 */
import { format } from 'date-fns';
import type { CrewMember } from '@/modules/crew/hooks/useCrew';
import { STATUS_CODE_MAP } from '@/modules/crew/leaveConstants';
import { isMasterOffice, isPendingPlacementAssignment, normaliseOffice, PENDING_PLACEMENT_ID_PREFIX } from './crewUpdateErrors';
import { crewStatusDecide, CREW_STATUSES, type CrewPlacementKind, type CrewStatus, type CrewStatusDetail } from './crewStatus';
import type { CrewInvitationStatus, CrewVesselListRpcRow, CrewVesselMovementRpcRow } from '../types/db.pending';
import type { RankTier } from '../types/domain';

// ---------------------------------------------------------------- URL state

export const CREW_LIST_TABS = ['crew', 'movements'] as const;
export type CrewListTab = (typeof CREW_LIST_TABS)[number];

export const CREW_LIST_SORTS = ['rank', 'name', 'join'] as const;
export type CrewListSort = (typeof CREW_LIST_SORTS)[number];

export type SortDirection = 'asc' | 'desc';

export interface CrewListParams {
  tab: CrewListTab;
  q: string;
  /** A department key, or null for every department. */
  dept: string | null;
  /** A derived status, or null for every status (the Total chip). */
  status: CrewStatus | null;
  sort: CrewListSort;
  dir: SortDirection;
}

export const CREW_LIST_DEFAULTS: CrewListParams = { tab: 'crew', q: '', dept: null, status: null, sort: 'rank', dir: 'asc' };

const DEPT_KEY = /^[a-z][a-z0-9_]{0,63}$/;
const isOneOf = <T extends string>(list: readonly T[], value: string | null): value is T => value !== null && (list as readonly string[]).includes(value);

export function parseCrewListParams(search: URLSearchParams): CrewListParams {
  const tab = search.get('tab');
  const status = search.get('status');
  const sort = search.get('sort');
  const dir = search.get('dir');
  const dept = search.get('dept');
  return {
    tab: isOneOf(CREW_LIST_TABS, tab) ? tab : CREW_LIST_DEFAULTS.tab,
    q: (search.get('q') ?? '').slice(0, 120),
    dept: dept && DEPT_KEY.test(dept) ? dept : null,
    status: isOneOf(CREW_STATUSES, status) ? status : null,
    sort: isOneOf(CREW_LIST_SORTS, sort) ? sort : CREW_LIST_DEFAULTS.sort,
    dir: dir === 'desc' ? 'desc' : 'asc',
  };
}

/**
 * The next search params after a change: the patched keys are written,
 * defaults (and empty values) are removed, every other parameter (e.g.
 * `positions=1`, the Movements range) is kept.
 */
export function withCrewListParams(current: URLSearchParams, patch: Partial<CrewListParams>): URLSearchParams {
  const next = new URLSearchParams(current);
  const set = (key: keyof CrewListParams, value: string | null) => {
    const fallback = CREW_LIST_DEFAULTS[key];
    if (value === null || value === '' || value === fallback) next.delete(key);
    else next.set(key, value);
  };
  if ('tab' in patch) set('tab', patch.tab ?? null);
  if ('q' in patch) set('q', (patch.q ?? '').trim() === '' ? null : (patch.q ?? '').slice(0, 120));
  if ('dept' in patch) set('dept', patch.dept ?? null);
  if ('status' in patch) set('status', patch.status ?? null);
  if ('sort' in patch) set('sort', patch.sort ?? null);
  if ('dir' in patch) set('dir', patch.dir ?? null);
  return next;
}

// ---------------------------------------------------------------- dates

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A local calendar day as yyyy-MM-dd (never the UTC day). */
export function localDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** True for a real yyyy-MM-dd day. */
export function isDay(value: string | null | undefined): value is string {
  if (!value) return false;
  const m = DAY.exec(value);
  if (!m) return false;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.getFullYear() === Number(m[1]) && d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[3]);
}

/** A day plus n days (local), as yyyy-MM-dd. */
export function addDays(day: string, n: number): string {
  const m = DAY.exec(day);
  if (!m) return day;
  return localDay(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + n));
}

const dayValue = (day: string) => {
  const m = DAY.exec(day);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime() : Number.NaN;
};

/** Whole days from a to b (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((dayValue(b) - dayValue(a)) / 86_400_000);
}

/** The as-at range the server accepts (crew_vessel_list: two years either side of today). */
export const AS_AT_RANGE_DAYS = 730;

export function asAtInRange(day: string, today: string): boolean {
  return isDay(day) && Math.abs(daysBetween(today, day)) <= AS_AT_RANGE_DAYS;
}

// ---------------------------------------------------------------- Movements range

export interface MovementRange {
  from: string;
  to: string;
}

/** The server's limit (crew_vessel_movements: three years at most). */
export const MOVEMENT_RANGE_MAX_DAYS = 1095;

/** The default Movements range: the last 90 days and the next 30. */
export function defaultMovementRange(today: string): MovementRange {
  return { from: addDays(today, -90), to: addDays(today, 30) };
}

/**
 * The Movements range from the URL (`from`, `to`), else the default. A
 * reversed range is swapped; one longer than the server allows is cut to
 * the last three years before `to`.
 */
export function parseMovementRange(search: URLSearchParams, today: string): MovementRange {
  const fallback = defaultMovementRange(today);
  let from = isDay(search.get('from')) ? (search.get('from') as string) : fallback.from;
  let to = isDay(search.get('to')) ? (search.get('to') as string) : fallback.to;
  if (daysBetween(from, to) < 0) [from, to] = [to, from];
  if (daysBetween(from, to) > MOVEMENT_RANGE_MAX_DAYS) from = addDays(to, -MOVEMENT_RANGE_MAX_DAYS);
  return { from, to };
}

export function withMovementRange(current: URLSearchParams, range: MovementRange, today: string): URLSearchParams {
  const next = new URLSearchParams(current);
  const fallback = defaultMovementRange(today);
  if (range.from === fallback.from) next.delete('from');
  else next.set('from', range.from);
  if (range.to === fallback.to) next.delete('to');
  else next.set('to', range.to);
  return next;
}

// ---------------------------------------------------------------- rows

export type CrewLoginState = 'active' | 'pending_login' | 'disabled';

export interface CrewListInvitation {
  id: string;
  status: CrewInvitationStatus;
  expiresAt: string | null;
  lastSentAt: string | null;
  lastErrorCode: string | null;
}

/** One person on the vessel's crew list, from either source. */
export interface CrewListRow {
  profileId: string;
  userId: string | null;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  /** "Last, First" (the register's reading order). */
  displayName: string;
  email: string | null;
  positionId: string | null;
  /** The catalogue position's name, when the title maps to one. */
  positionName: string | null;
  /** The free-text title (assignment position, else rank; pending: profile position, else rank, else Crew). */
  positionText: string | null;
  departmentKey: string | null;
  departmentLabel: string | null;
  rankTier: RankTier | null;
  /** The vessel's rank order; null when the title maps to no position. */
  sortOrder: number | null;
  assignmentId: string | null;
  placementKind: CrewPlacementKind;
  joinDate: string | null;
  leaveDate: string | null;
  status: CrewStatus;
  statusDetail: CrewStatusDetail | null;
  transferVesselId: string | null;
  leaveCode: string | null;
  travelToday: boolean;
  loginState: CrewLoginState;
  accountStatus: string | null;
  /** The newest invitation row; null when there is none (or in the basic list). */
  invitation: CrewListInvitation | null;
  nationality: string | null;
  isMasterOffice: boolean;
  /** Arrives with crew_personal_details (060300); merged on the client (D-X1-8). */
  crewNumber: string | null;
  /** `server`: crew_vessel_list; `basic`: the D-01 fallback from the legacy crew list. */
  source: 'server' | 'basic';
}

const text = (value: string | null | undefined): string | null => {
  const t = (value ?? '').trim();
  return t === '' ? null : t;
};

export function displayNameOf(firstName: string | null | undefined, lastName: string | null | undefined): string {
  const first = text(firstName);
  const last = text(lastName);
  if (last && first) return `${last}, ${first}`;
  return last ?? first ?? 'Unnamed crew member';
}

/** The title to show: the catalogue name, else the free text. */
export function positionLabel(row: Pick<CrewListRow, 'positionName' | 'positionText'>): string | null {
  return row.positionName ?? row.positionText;
}

export function fromRpcRow(row: CrewVesselListRpcRow): CrewListRow {
  return {
    profileId: row.profile_id,
    userId: row.user_id,
    firstName: row.first_name ?? '',
    lastName: row.last_name ?? '',
    preferredName: text(row.preferred_name),
    displayName: displayNameOf(row.first_name, row.last_name),
    email: text(row.email),
    positionId: row.position_id,
    positionName: text(row.position_name),
    positionText: text(row.position_text),
    departmentKey: row.department_key,
    departmentLabel: text(row.department_label),
    rankTier: row.rank_tier,
    sortOrder: row.sort_order,
    assignmentId: row.assignment_id,
    placementKind: row.placement_kind,
    joinDate: row.join_date,
    leaveDate: row.leave_date,
    status: row.status,
    statusDetail: row.status_detail,
    transferVesselId: row.transfer_vessel_id,
    leaveCode: row.leave_code,
    travelToday: row.travel_today === true,
    loginState: row.login_state,
    accountStatus: row.account_status,
    invitation:
      row.invitation_id && row.invitation_status
        ? {
            id: row.invitation_id,
            status: row.invitation_status,
            expiresAt: row.invitation_expires_at,
            lastSentAt: row.invitation_last_sent_at,
            lastErrorCode: row.invitation_last_error_code,
          }
        : null,
    nationality: text(row.nationality),
    isMasterOffice: row.is_master_office === true,
    crewNumber: null,
    source: 'server',
  };
}

const loginStateOf = (userId: string | null, accountStatus: string | null | undefined): CrewLoginState => {
  if (!userId) return 'pending_login';
  const status = (accountStatus ?? '').trim().toLowerCase();
  return status === 'disabled' || status === 'deactivated' ? 'disabled' : 'active';
};

export interface LegacyMappingContext {
  /** The route's vessel. */
  vesselId: string;
  /** Today, local (yyyy-MM-dd). */
  today: string;
  /** Today's leave-planner code per login (crew_leave_entries). */
  leaveCodeByUserId: ReadonlyMap<string, string>;
  /** Show emails (the caller holds crew_profiles.view). */
  includeEmail: boolean;
}

/**
 * A legacy useCrew row as a crew list row (the D-01 fallback), or null when
 * it is not on this vessel's list today: no assignment or placement on the
 * vessel, or an assignment whose leave date has passed (stale, D-227).
 */
export function fromLegacyCrew(member: CrewMember, ctx: LegacyMappingContext): CrewListRow | null {
  const assignment = member.current_assignment ?? null;
  if (!assignment || assignment.vessel_id !== ctx.vesselId) return null;
  const ends = assignment.leave_date ?? assignment.end_date ?? null;
  if (ends && ends.slice(0, 10) <= ctx.today) return null;
  const pending = isPendingPlacementAssignment(assignment);
  const joinDate = assignment.join_date ? assignment.join_date.slice(0, 10) : null;
  const placementKind: CrewPlacementKind = pending ? 'pending_placement' : joinDate && joinDate > ctx.today ? 'planned' : 'assignment';
  const leaveCode = member.user_id ? (ctx.leaveCodeByUserId.get(member.user_id) ?? null) : null;
  const status = crewStatusDecide({ transferActive: false, placementKind, leaveCode, inOutLast: null });
  const positionText = text(assignment.position) ?? text(assignment.rank) ?? text(member.rank);
  const department = text(member.department);
  const statusDetail: CrewStatusDetail | null =
    status === 'pending' ? (placementKind === 'pending_placement' ? 'pending_placement' : 'planned') : status === 'on_leave' ? 'leave' : null;
  const master = isMasterOffice(assignment.position) || isMasterOffice(assignment.rank ?? member.rank);
  return {
    profileId: member.id,
    userId: member.user_id,
    firstName: member.first_name ?? '',
    lastName: member.last_name ?? '',
    preferredName: text(member.preferred_name),
    displayName: displayNameOf(member.first_name, member.last_name),
    email: ctx.includeEmail ? text(member.email) : null,
    positionId: null,
    positionName: null,
    positionText,
    departmentKey: department ? normaliseOffice(department) || null : null,
    departmentLabel: department,
    rankTier: null,
    // Without the catalogue the Master still leads; everyone else sorts by name.
    sortOrder: master ? 0 : null,
    assignmentId: pending ? null : assignment.id,
    placementKind,
    joinDate,
    leaveDate: ends ? ends.slice(0, 10) : null,
    status,
    statusDetail,
    transferVesselId: null,
    leaveCode: leaveCode ? leaveCode.trim().toUpperCase() : null,
    travelToday: false,
    loginState: loginStateOf(member.user_id, member.account_status),
    accountStatus: member.account_status ?? null,
    invitation: null,
    nationality: text(member.nationality),
    isMasterOffice: master,
    crewNumber: null,
    source: 'basic',
  };
}

/**
 * The legacy CrewMember shape of a list row, for the dialogs that still
 * take it (transfer, sign off, reset, access, reallocate) until their
 * replacements arrive (X1-03, X1-11). A pending placement keeps its
 * placement id prefix, so isPendingPlacementAssignment() refuses it (D-225).
 */
export function toCrewMemberStub(row: CrewListRow, vessel: { id: string; name: string }): CrewMember {
  const pending = row.placementKind === 'pending_placement';
  return {
    id: row.profileId,
    user_id: row.userId,
    email: row.email ?? '',
    first_name: row.firstName,
    last_name: row.lastName,
    rank: row.positionText,
    nationality: row.nationality,
    phone: null,
    status: null,
    role: 'crew',
    created_at: '',
    preferred_name: row.preferredName,
    department: row.departmentLabel,
    account_status: row.accountStatus,
    is_imported: pending,
    imported_vessel_id: pending ? vessel.id : null,
    current_assignment: {
      id: row.assignmentId ?? `${PENDING_PLACEMENT_ID_PREFIX}${row.profileId}`,
      vessel_id: vessel.id,
      vessel_name: vessel.name,
      position: positionLabel(row) ?? 'Crew',
      join_date: row.joinDate ?? '',
      rank: null,
      leave_date: row.leaveDate,
      end_date: null,
      ...(pending || !row.assignmentId ? { pending_placement: true } : {}),
    },
  };
}

// ---------------------------------------------------------------- search, filters, counts, sort

/** What a row is searched by: names, position (catalogue and free text) and crew number. */
export function crewSearchText(row: CrewListRow): string {
  return [row.firstName, row.lastName, row.preferredName, row.positionName, row.positionText, row.crewNumber].filter(Boolean).join(' ');
}

export interface CrewDepartmentOption {
  key: string;
  label: string;
}

/** The departments present on the list, in label order. */
export function departmentOptions(rows: readonly CrewListRow[]): CrewDepartmentOption[] {
  const seen = new Map<string, string>();
  for (const row of rows) {
    if (row.departmentKey && !seen.has(row.departmentKey)) seen.set(row.departmentKey, row.departmentLabel ?? row.departmentKey);
  }
  return [...seen.entries()].map(([key, label]) => ({ key, label })).sort((a, b) => a.label.localeCompare(b.label, 'en-GB'));
}

export function filterByDepartment(rows: readonly CrewListRow[], dept: string | null): CrewListRow[] {
  return dept ? rows.filter((row) => row.departmentKey === dept) : rows.slice();
}

export type CrewStatusCounts = Record<CrewStatus | 'total', number>;

/** The count chips: Total, then each status. */
export function statusCounts(rows: readonly CrewListRow[]): CrewStatusCounts {
  const counts: CrewStatusCounts = { total: rows.length, on_board: 0, ashore: 0, on_leave: 0, pending: 0, on_transfer: 0 };
  for (const row of rows) counts[row.status] += 1;
  return counts;
}

/** The chip order on the page (gap/04 C3): Total first, then these. */
export const STATUS_CHIP_ORDER: readonly CrewStatus[] = ['on_board', 'ashore', 'on_leave', 'pending', 'on_transfer'];

const collator = new Intl.Collator('en-GB', { sensitivity: 'base', numeric: true });

/** By last name, then first name, then id (stable). */
export function compareByName(a: CrewListRow, b: CrewListRow): number {
  return collator.compare(a.lastName, b.lastName) || collator.compare(a.firstName, b.firstName) || a.profileId.localeCompare(b.profileId);
}

/** The vessel's rank order (unmapped titles last), then by name. */
export function compareByRank(a: CrewListRow, b: CrewListRow): number {
  if (a.sortOrder !== b.sortOrder) {
    if (a.sortOrder === null) return 1;
    if (b.sortOrder === null) return -1;
    return a.sortOrder - b.sortOrder;
  }
  return compareByName(a, b);
}

/** By join date (no date last), then by name. */
export function compareByJoin(a: CrewListRow, b: CrewListRow): number {
  if (a.joinDate !== b.joinDate) {
    if (!a.joinDate) return 1;
    if (!b.joinDate) return -1;
    return a.joinDate < b.joinDate ? -1 : 1;
  }
  return compareByName(a, b);
}

export const CREW_SORT_COMPARE: Readonly<Record<CrewListSort, (a: CrewListRow, b: CrewListRow) => number>> = {
  rank: compareByRank,
  name: compareByName,
  join: compareByJoin,
};

/**
 * Rows in the chosen order. Descending reverses the comparison but keeps
 * rows without a rank order or a join date last, as the table does.
 */
export function sortCrewRows(rows: readonly CrewListRow[], sort: CrewListSort, dir: SortDirection): CrewListRow[] {
  const compare = CREW_SORT_COMPARE[sort];
  const missing = (row: CrewListRow) => (sort === 'rank' ? row.sortOrder === null : sort === 'join' ? !row.joinDate : false);
  return rows.slice().sort((a, b) => {
    const am = missing(a);
    const bm = missing(b);
    if (am !== bm) return am ? 1 : -1;
    const result = compare(a, b);
    return dir === 'asc' ? result : -result;
  });
}

// ---------------------------------------------------------------- the crew list report (as at a day)

/** Who an as-at crew list (FAL 5) lists: on board or ashore for the day; the rest are counted apart. */
export interface AsAtSplit {
  aboard: CrewListRow[];
  onLeave: number;
  pending: number;
  onTransfer: number;
}

export function splitForReport(rows: readonly CrewListRow[]): AsAtSplit {
  const aboard = sortCrewRows(
    rows.filter((r) => r.status === 'on_board' || r.status === 'ashore'),
    'rank',
    'asc',
  );
  return {
    aboard,
    onLeave: rows.filter((r) => r.status === 'on_leave').length,
    pending: rows.filter((r) => r.status === 'pending').length,
    onTransfer: rows.filter((r) => r.status === 'on_transfer').length,
  };
}

// ---------------------------------------------------------------- movements

export interface CrewMovement {
  key: string;
  movementId: string | null;
  profileId: string;
  displayName: string;
  positionText: string | null;
  kind: CrewVesselMovementRpcRow['kind'];
  occurredOn: string;
  occurredAt: string | null;
  port: string | null;
  source: CrewVesselMovementRpcRow['source'];
  notes: string | null;
}

export function fromMovementRow(row: CrewVesselMovementRpcRow, index: number): CrewMovement {
  return {
    key: row.movement_id ?? `${row.source}:${row.source_id ?? row.profile_id}:${row.kind}:${row.occurred_on}:${index}`,
    movementId: row.movement_id,
    profileId: row.profile_id,
    displayName: displayNameOf(row.first_name, row.last_name),
    positionText: text(row.position_text),
    kind: row.kind,
    occurredOn: row.occurred_on,
    occurredAt: row.occurred_at,
    port: text(row.port),
    source: row.source,
    notes: text(row.notes),
  };
}

export const MOVEMENT_KIND_LABEL: Readonly<Record<CrewMovement['kind'], string>> = {
  embark: 'Joined',
  disembark: 'Left',
  transfer_in: 'Transferred in',
  transfer_out: 'Transferred out',
};

export const MOVEMENT_SOURCE_LABEL: Readonly<Record<CrewMovement['source'], string>> = {
  assignment: 'Assignment dates',
  manual: 'Recorded',
  planner: 'Planner',
  transfer: 'Transfer',
  toggle: 'On / off board',
};

// ---------------------------------------------------------------- the D-01 classifier

interface ErrorLike {
  code?: unknown;
  message?: unknown;
}

/**
 * True when crew_vessel_list itself is not in the database yet (D-01):
 * PostgREST's function schema-cache miss (PGRST202), or Postgres' undefined
 * function (42883) naming it. Any other error, a 42883 for another function
 * included, is a real error with Retry.
 */
export function isMissingRpc(error: unknown, fn: string): boolean {
  if (!error || typeof error !== 'object') return false;
  const { code, message } = error as ErrorLike;
  const msg = typeof message === 'string' ? message : '';
  if (code === 'PGRST202') return true;
  if (code === '42883') return msg.includes(fn);
  return false;
}

// ---------------------------------------------------------------- row text

const fmtListDay = (day: string | null | undefined): string | null => {
  if (!day) return null;
  const [y, m, d] = day.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  return format(new Date(y, m - 1, d), 'd MMM yyyy');
};

/**
 * Why the status holds, in words (crew_vessel_list's status_detail):
 * "Joins 12 Dec 2026", "Expected 12 Dec 2026, once their login is linked"
 * (a pending placement with a join date still ahead; one whose date has
 * passed, or that only has its creation date, reads "Joins once their login
 * is linked"), "Leave used (L)", "Transferring in from HYDRA". Null when
 * there is nothing to add. `today` is the viewer's local day.
 */
export function crewStatusDetailText(
  row: CrewListRow,
  vesselName: (id: string) => string | null,
  today: string = localDay(new Date()),
): string | null {
  switch (row.statusDetail) {
    case 'planned': {
      const day = fmtListDay(row.joinDate);
      return day ? `Joins ${day}` : 'Joins later';
    }
    case 'pending_placement': {
      const day = row.joinDate && row.joinDate.slice(0, 10) > today ? fmtListDay(row.joinDate) : null;
      return day ? `Expected ${day}, once their login is linked` : 'Joins once their login is linked';
    }
    case 'leave': {
      const code = row.leaveCode ?? '';
      const label = STATUS_CODE_MAP[code]?.label;
      return label ? `${label} (${code})` : code ? `Leave code ${code}` : 'On leave today';
    }
    case 'transfer_in': {
      const name = row.transferVesselId ? vesselName(row.transferVesselId) : null;
      return name ? `Transferring in from ${name}` : 'Transferring in';
    }
    case 'transfer_out': {
      const name = row.transferVesselId ? vesselName(row.transferVesselId) : null;
      return name ? `Transferring out to ${name}` : 'Transferring out';
    }
    default:
      return null;
  }
}
