/**
 * Positions, pure (X1-01; gap/04 C12, C49, C70; DECISIONS C22, D-X1-1,
 * D-X1-2). No client, no React.
 *
 * - officeKey: the normalised title (record_normalise_office), the key
 *   positions and aliases are matched on.
 * - POSITION_SYNONYMS / positionSynonym: the fixed synonym map, the TS
 *   mirror of crew_position_synonym() in
 *   supabase/migrations/20261124060100_crew_reference_positions.sql.
 * - resolvePositionFor: the TS mirror of crew_position_for(). Parity cases:
 *   src/test/crew/fixtures/positionCases.json, asserted here (vitest) and
 *   by supabase/tests/sql/crew/reference_positions.test.sql.
 * - rankSort, groupByDepartment, moveWithin, assignSortSlots,
 *   manningProblem, toSaveRows: the positions drawer's model (rank order,
 *   department groups, keyboard and drag reordering inside a department,
 *   the min / max rule, the one save payload).
 * - positionRefusalMessage: one STORM sentence for an RPC refusal.
 */
import { normaliseOffice, crewRefusalMessage } from './crewUpdateErrors';
import type { CrewPositionSaveRow } from '../types/db.pending';
import type { VesselPosition } from '../types/domain';

/** The office key of a title: ASCII lower case, runs outside [a-z0-9] become '_', trimmed (as the SQL). */
export const officeKey = normaliseOffice;

/** A normalised title -> the key of a STORM position. Mirrors crew_position_synonym(). */
export const POSITION_SYNONYMS: Readonly<Record<string, string>> = Object.freeze({
  captain: 'master',
  skipper: 'master',
  first_officer: 'chief_officer',
  chief_mate: 'chief_officer',
  first_mate: 'chief_officer',
  mate: 'chief_officer',
  '2nd_officer': 'second_officer',
  second_mate: 'second_officer',
  '3rd_officer': 'third_officer',
  third_mate: 'third_officer',
  oow: 'officer_of_the_watch',
  boatswain: 'bosun',
  able_seaman: 'ab_seaman',
  able_bodied_seaman: 'ab_seaman',
  ab: 'ab_seaman',
  ordinary_seaman: 'os_seaman',
  os: 'os_seaman',
  '2nd_engineer': 'second_engineer',
  '3rd_engineer': 'third_engineer',
  '4th_engineer': 'fourth_engineer',
  electro_technical_officer: 'eto',
  electrotechnical_officer: 'eto',
  electro_technical_rating: 'electrician',
  etr: 'electrician',
  chief_stewardess: 'chief_stew',
  chief_steward: 'chief_stew',
  chief_steward_ess: 'chief_stew',
  stewardess: 'steward',
  stew: 'steward',
  steward_ess: 'steward',
  second_stewardess: 'second_stew',
  second_steward: 'second_stew',
  '2nd_stew': 'second_stew',
  third_stewardess: 'third_stew',
  third_steward: 'third_stew',
  '3rd_stew': 'third_stew',
  junior_stewardess: 'junior_stew',
  junior_steward: 'junior_stew',
  head_of_housekeeping: 'head_housekeeper',
  chef: 'head_chef',
  second_chef: 'sous_chef',
  ship_s_doctor: 'ships_doctor',
  doctor: 'ships_doctor',
  av_technician: 'av_it_technician',
  it_officer: 'av_it_officer',
  masseuse: 'massage_therapist',
  masseur: 'massage_therapist',
  beautician: 'beauty_therapist',
});

/** The STORM position key a normalised title is a synonym of, or null. */
export function positionSynonym(key: string | null | undefined): string | null {
  if (!key) return null;
  return Object.prototype.hasOwnProperty.call(POSITION_SYNONYMS, key) ? POSITION_SYNONYMS[key] : null;
}

/** The fields of a position row the matcher reads. */
export interface PositionLike {
  id: string;
  companyId: string | null;
  vesselId: string | null;
  key: string;
  name: string;
  isActive: boolean;
}

/** The fields of an alias row the matcher reads. */
export interface AliasLike {
  companyId: string;
  aliasKey: string;
  positionId: string;
}

/** Visible on the vessel of the company: STORM's rows, the company's, and the vessel's own. */
export function positionVisibleOn(p: PositionLike, companyId: string | null, vesselId: string | null): boolean {
  if (p.companyId === null) return true;
  if (companyId === null || p.companyId !== companyId) return false;
  return p.vesselId === null || (vesselId !== null && p.vesselId === vesselId);
}

/** Precedence on a vessel: its own row (0), then the company's (1), then STORM's (2). */
const scopeRank = (p: PositionLike): number => (p.vesselId !== null ? 0 : p.companyId !== null ? 1 : 2);

const byPrecedence = (a: PositionLike, b: PositionLike): number =>
  scopeRank(a) - scopeRank(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** The alias of a title for a company: the company's row with that normalised key, if any. */
export function aliasMatch(aliases: readonly AliasLike[], companyId: string | null, title: string | null | undefined): AliasLike | null {
  const key = officeKey(title);
  if (!key || companyId === null) return null;
  return aliases.find((a) => a.companyId === companyId && a.aliasKey === key) ?? null;
}

/**
 * The position a free-text title holds on a vessel of a company, or null.
 * Mirrors crew_position_for():
 *   1. an active position visible on the vessel whose key or normalised
 *      name is the normalised title: the vessel's row, then the company's,
 *      then STORM's (a key match before a name match at the same scope);
 *   2. else the company's alias for the title: the key of the position it
 *      names, by rule 1's precedence (a vessel's or the company's own row
 *      with that key still wins; an alias to another vessel's row resolves
 *      only where that key is visible);
 *   3. else the synonym map's key, by rule 1's precedence.
 */
export function resolvePositionFor(
  world: { positions: readonly PositionLike[]; aliases: readonly AliasLike[] },
  companyId: string | null,
  vesselId: string | null,
  title: string | null | undefined,
): PositionLike | null {
  const key = officeKey(title);
  if (!key) return null;
  const visible = world.positions.filter((p) => p.isActive && positionVisibleOn(p, companyId, vesselId));

  const direct = visible
    .filter((p) => p.key === key || officeKey(p.name) === key)
    .sort((a, b) => scopeRank(a) - scopeRank(b) || Number(a.key !== key) - Number(b.key !== key) || byPrecedence(a, b));
  if (direct.length) return direct[0];

  const alias = aliasMatch(world.aliases, companyId, title);
  const aliasTarget = alias ? world.positions.find((p) => p.id === alias.positionId) : undefined;
  if (aliasTarget) {
    const viaAlias = visible.filter((p) => p.key === aliasTarget.key).sort(byPrecedence);
    if (viaAlias.length) return viaAlias[0];
  }

  const synonym = positionSynonym(key);
  if (!synonym) return null;
  const viaSynonym = visible.filter((p) => p.key === synonym).sort(byPrecedence);
  return viaSynonym[0] ?? null;
}

// ---------------------------------------------------------------- the drawer's model

/** Rank order on the vessel: its sort order, then name, then id (stable). */
export function rankSort<T extends Pick<VesselPosition, 'sortOrder' | 'name' | 'positionId'>>(a: T, b: T): number {
  return a.sortOrder - b.sortOrder || a.name.localeCompare(b.name) || (a.positionId < b.positionId ? -1 : a.positionId > b.positionId ? 1 : 0);
}

export interface DepartmentGroup<T> {
  departmentKey: string;
  departmentLabel: string;
  departmentSort: number;
  positions: T[];
}

/** Positions grouped by department (in the department's order), each group in the order given. */
export function groupByDepartment<T extends Pick<VesselPosition, 'departmentKey' | 'departmentLabel' | 'departmentSort'>>(
  positions: readonly T[],
): DepartmentGroup<T>[] {
  const groups = new Map<string, DepartmentGroup<T>>();
  for (const p of positions) {
    let g = groups.get(p.departmentKey);
    if (!g) {
      g = { departmentKey: p.departmentKey, departmentLabel: p.departmentLabel, departmentSort: p.departmentSort, positions: [] };
      groups.set(p.departmentKey, g);
    }
    g.positions.push(p);
  }
  return [...groups.values()].sort((a, b) => a.departmentSort - b.departmentSort || a.departmentLabel.localeCompare(b.departmentLabel));
}

/**
 * Move one item of a list to another index (drag) or one step (Move up /
 * Move down). Out-of-range targets clamp; an unknown id returns the list
 * unchanged. Pure: returns a new array.
 */
export function moveWithin<T>(items: readonly T[], idOf: (item: T) => string, id: string, toIndex: number): T[] {
  const from = items.findIndex((item) => idOf(item) === id);
  if (from < 0) return [...items];
  const to = Math.max(0, Math.min(items.length - 1, toIndex));
  if (to === from) return [...items];
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/** The manning range rule (the server's 22023 manning_range_invalid): null when valid, else a sentence. */
export function manningProblem(min: number | null | undefined, max: number | null | undefined): string | null {
  const lo = min ?? 0;
  if (!Number.isInteger(lo) || lo < 0 || lo > 500) return 'The minimum on board must be a whole number from 0 to 500.';
  if (max === null || max === undefined) return null;
  if (!Number.isInteger(max) || max > 500) return 'The maximum on board must be a whole number up to 500.';
  if (max < lo) return 'The maximum cannot be lower than the minimum.';
  return null;
}

/**
 * The rank slots of one department after a reorder: the department keeps
 * the sort values it had (so the vessel's ranks stay interleaved by tier
 * across departments, as STORM's catalogue orders them), handed out in
 * the new order; equal values are spread so the new order holds.
 */
export function assignSortSlots(positionsInNewOrder: readonly Pick<VesselPosition, 'positionId' | 'sortOrder'>[]): Map<string, number> {
  const slots = positionsInNewOrder.map((p) => p.sortOrder).sort((a, b) => a - b);
  for (let i = 1; i < slots.length; i += 1) if (slots[i] <= slots[i - 1]) slots[i] = slots[i - 1] + 1;
  return new Map(positionsInNewOrder.map((p, i) => [p.positionId, slots[i]]));
}

/**
 * The one save payload (crew_vessel_positions_save): every listed
 * position, department by department in the drawer's order, with its rank
 * slot (assignSortSlots), minimum and maximum; and every position the
 * drawer took off the list (its override cleared). Pure.
 */
export function toSaveRows(
  listedGroups: readonly { positions: readonly Pick<VesselPosition, 'positionId' | 'sortOrder' | 'minOnBoard' | 'maxOnBoard'>[] }[],
  unlisted: readonly Pick<VesselPosition, 'positionId'>[] = [],
): CrewPositionSaveRow[] {
  const rows: CrewPositionSaveRow[] = [];
  for (const group of listedGroups) {
    const slots = assignSortSlots(group.positions);
    for (const p of group.positions) {
      rows.push({
        position_id: p.positionId,
        sort_order: slots.get(p.positionId) ?? p.sortOrder,
        is_listed: true,
        min_on_board: p.minOnBoard,
        max_on_board: p.maxOnBoard,
      });
    }
  }
  for (const p of unlisted) {
    rows.push({ position_id: p.positionId, sort_order: null, is_listed: false, min_on_board: 0, max_on_board: null });
  }
  return rows;
}

/** A head count as typed in the drawer: digits only (up to 3), blank as null, anything else NaN. */
export function parseCount(text: string): number | null {
  const t = text.trim();
  if (t === '') return null;
  return /^\d{1,3}$/.test(t) ? Number(t) : Number.NaN;
}

export type HeldBand = 'critical' | 'at_minimum' | 'normal' | 'overmanned';

/**
 * The people holding a position now against its range (statusTone domain
 * manning_band): below the minimum, at it, above the maximum, or within.
 * Null when the position sets no range (minimum 0, no maximum). Held, not
 * qualified: the planner's manning by day (X1-09) adds the qualification.
 */
export function heldBand(holders: number, min: number, max: number | null): HeldBand | null {
  if (min <= 0 && max === null) return null;
  if (holders < min) return 'critical';
  if (max !== null && holders > max) return 'overmanned';
  if (min > 0 && holders === min) return 'at_minimum';
  return 'normal';
}

/** STORM sentences for the 22023 refusals of the positions RPCs (the server's MESSAGE codes). */
export const POSITION_REFUSALS: Readonly<Record<string, string>> = Object.freeze({
  position_exists: 'A position with this name already exists. List it on this vessel instead.',
  position_name_invalid: 'Start the position name with a letter and keep it to 80 characters.',
  department_unknown: 'Choose a department.',
  rank_tier_invalid: 'Choose a rank tier.',
  access_set_invalid: 'Choose a default access set.',
  position_unknown: 'One of these positions is not available on this vessel. Reload and try again.',
  manning_range_invalid: 'The minimum on board must be 0 to 500, and a maximum no lower than the minimum.',
  rows_invalid: 'The positions could not be saved as sent. Reload and try again.',
  alias_invalid: 'Give a job title of 1 to 120 characters.',
  alias_is_position: 'This job title already names a position.',
  vessel_required: 'Open a vessel first.',
});

interface RpcErrorLike {
  code?: unknown;
  message?: unknown;
  details?: unknown;
}

/**
 * One sentence for a refused positions RPC: a 22023 with a DETAIL sentence
 * shows it (the server writes them for people), else the code's sentence
 * above; anything else goes through crewRefusalMessage (42501 DETAIL as
 * is, D-225; never a raw code).
 */
export function positionRefusalMessage(error: unknown): string {
  if (error !== null && typeof error === 'object') {
    const { code, message, details } = error as RpcErrorLike;
    if (code === '22023') {
      const detail = typeof details === 'string' ? details.trim() : '';
      if (detail && !/^[a-z0-9_]+$/.test(detail)) return detail;
      const key = typeof message === 'string' ? message.trim() : '';
      if (key && POSITION_REFUSALS[key]) return POSITION_REFUSALS[key];
    }
  }
  return crewRefusalMessage(error);
}
