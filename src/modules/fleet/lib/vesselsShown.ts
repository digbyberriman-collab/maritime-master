/**
 * "Vessels shown" (gap/02 D1, X3; DECISIONS D-123; D-X5-09, D-X5-22): which
 * of the vessels a user reaches a Fleet page counts and lists. Pure: the
 * hook (../hooks/useFleetVesselsShown.ts) feeds it the URL, the stored
 * choice and the vessel list.
 *
 * Resolution, in order:
 *
 * 1. `?vessels=DRA,GAM` (vessel codes, any case): the codes that name a
 *    vessel the user reaches win. Unknown codes are dropped (and reported,
 *    so the page can say so); a parameter with no known code is ignored.
 * 2. The choice stored on this device for this user
 *    (`storm-fleet-vessels:<userId>`): ids, unknown ones dropped. Storage
 *    may be missing or throw (private mode, a blocked accessor): a read or a
 *    write that throws is ignored, never an error.
 * 3. The default: every counted vessel the user reaches.
 *
 * Counted (X3; the client mirror of SQL `fleet_counted_vessels_for` with
 * NULL ids): `is_counted` and `lifecycle_status = 'active'` where those
 * columns are present (migration P1), and in every case the reach state
 * rule of D-123 (not archived, status set and not Sold). Before P1 is
 * applied neither column arrives, so counted means the D-123 rule alone.
 *
 * An explicit choice (URL or stored) may include vessels that are not
 * counted, such as a demo vessel: explicit lists are reach-checked, not
 * counted-filtered (D-X5-22). A choice equal to the default is not stored
 * and not put in the URL, so a later change to the fleet (a vessel added or
 * counted) reaches the user without a stale list.
 *
 * The tick helpers (by flag state, classification society and fleet group)
 * are shared with the publish dialog of the fleet documents library
 * (X5-04B): they return the vessel ids to tick and never invent a group
 * name (a fleet group whose name did not load is left out).
 */
import { vesselInReachableState } from '@/app/router/membershipReach';

/** The query parameter that carries the codes (`?vessels=DRA,GAM`). */
export const VESSELS_SHOWN_PARAM = 'vessels';

/** The localStorage key prefix; the key is `storm-fleet-vessels:<userId>`. */
export const VESSELS_SHOWN_STORAGE_PREFIX = 'storm-fleet-vessels:';

/** The stored value's shape version. */
const STORED_VERSION = 1;

/** The most codes a URL may carry (a fleet is far smaller; this bounds parsing). */
const MAX_URL_CODES = 200;

/** The key the choice of this user is stored under on this device. */
export function vesselsShownStorageKey(userId: string): string {
  return `${VESSELS_SHOWN_STORAGE_PREFIX}${userId}`;
}

/**
 * A vessel as the filter reads it: the VesselContext row (read with
 * `select('*')`, so the P1 columns arrive once they are live) plus its
 * vessel code (D-03).
 */
export interface ShownVesselInput {
  id: string;
  name: string;
  /** Upper-case vessel code (D-03); null if the code could not be derived. */
  code: string | null;
  status: string | null;
  /** `vessels.lifecycle_status` (P1); absent before the column is live. */
  lifecycle_status?: string | null;
  /** `vessels.is_counted` (P1); absent before the column is live. */
  is_counted?: boolean | null;
  flag_state?: string | null;
  classification_society?: string | null;
  fleet_group_id?: string | null;
}

/** A vessel the filter lists. */
export interface ShownVessel {
  id: string;
  name: string;
  code: string | null;
  /** Counted in fleet totals and in the default selection. */
  counted: boolean;
  flagState: string | null;
  classificationSociety: string | null;
  fleetGroupId: string | null;
}

export type VesselsShownSource = 'url' | 'storage' | 'default';

export interface VesselsShownResolution {
  /** The vessels shown, in list order. Empty only when the user reaches no counted vessel and chose none. */
  vesselIds: string[];
  source: VesselsShownSource;
  /** The selection is the default (every counted vessel). */
  isDefault: boolean;
  /** The default: every counted vessel, in list order. */
  countedIds: string[];
  /** Codes in the URL that name no vessel the user reaches (upper case, de-duplicated). */
  droppedCodes: string[];
}

const blank = (value: string | null | undefined): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

/**
 * Whether a vessel counts in fleet totals (X3; D-123): the P1 columns where
 * present, and the reach state rule always.
 */
export function isCountedVessel(v: Pick<ShownVesselInput, 'status' | 'lifecycle_status' | 'is_counted'>): boolean {
  const lifecycle = v.lifecycle_status ?? null;
  const reachable = vesselInReachableState({
    status: v.status,
    lifecycleStatus: lifecycle === 'active' || lifecycle === 'inactive' || lifecycle === 'archived' ? lifecycle : null,
  });
  if (!reachable) return false;
  if (typeof v.is_counted === 'boolean' && !v.is_counted) return false;
  if (typeof lifecycle === 'string' && lifecycle !== 'active') return false;
  return true;
}

/** The vessels a filter lists, sorted by name (then id), with their counted flag. */
export function toShownVessels(vessels: readonly ShownVesselInput[]): ShownVessel[] {
  const seen = new Set<string>();
  const out: ShownVessel[] = [];
  for (const v of vessels) {
    if (!v || typeof v.id !== 'string' || seen.has(v.id)) continue;
    seen.add(v.id);
    out.push({
      id: v.id,
      name: v.name,
      code: blank(v.code)?.toUpperCase() ?? null,
      counted: isCountedVessel(v),
      flagState: blank(v.flag_state),
      classificationSociety: blank(v.classification_society),
      fleetGroupId: blank(v.fleet_group_id),
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || a.id.localeCompare(b.id));
}

/** Every counted vessel, in list order (the default selection). */
export function countedVesselIds(vessels: readonly ShownVessel[]): string[] {
  return vessels.filter((v) => v.counted).map((v) => v.id);
}

/** The known ids among `ids`, once each, in list order. */
export function normaliseSelection(vessels: readonly ShownVessel[], ids: Iterable<string>): string[] {
  const wanted = new Set(ids);
  return vessels.filter((v) => wanted.has(v.id)).map((v) => v.id);
}

/** Two selections hold the same vessels (order ignored). */
export function sameSelection(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((id) => set.has(id));
}

/** Upper-case, trimmed, de-duplicated codes of a `?vessels=` value (comma or space separated). */
export function parseVesselCodes(param: string | null | undefined): string[] {
  if (typeof param !== 'string') return [];
  const out: string[] = [];
  for (const part of param.split(/[\s,]+/)) {
    const code = part.trim().toUpperCase();
    if (code && !out.includes(code)) out.push(code);
    if (out.length >= MAX_URL_CODES) break;
  }
  return out;
}

/** The `?vessels=` value for a selection (codes in list order); null when a vessel has no code. */
export function formatVesselCodes(vessels: readonly ShownVessel[], ids: readonly string[]): string | null {
  const wanted = new Set(ids);
  const codes: string[] = [];
  for (const v of vessels) {
    if (!wanted.has(v.id)) continue;
    if (!v.code) return null;
    codes.push(v.code);
  }
  return codes.join(',');
}

/** What storage the stored choice is read from and written to (a getter: the accessor itself may throw). */
export type VesselsShownStorage = () => Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null | undefined;

/**
 * The stored choice of this user, or null when there is none, it is not
 * readable or storage throws. Ids only; unknown ids are dropped later.
 */
export function readStoredVesselsShown(storage: VesselsShownStorage, userId: string | null | undefined): string[] | null {
  if (!userId) return null;
  try {
    const raw = storage()?.getItem(vesselsShownStorageKey(userId));
    if (typeof raw !== 'string' || raw === '') return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const { version, vesselIds } = parsed as { version?: unknown; vesselIds?: unknown };
    if (version !== STORED_VERSION || !Array.isArray(vesselIds)) return null;
    const ids = vesselIds.filter((id): id is string => typeof id === 'string' && id !== '');
    return ids.length ? ids : null;
  } catch {
    return null;
  }
}

/**
 * Stores this user's choice on this device; `null` (the default) removes
 * it. Returns false when storage is missing or throws (the choice then
 * lasts as long as the URL, which is not an error).
 */
export function writeStoredVesselsShown(storage: VesselsShownStorage, userId: string | null | undefined, ids: readonly string[] | null): boolean {
  if (!userId) return false;
  try {
    const target = storage();
    if (!target) return false;
    const key = vesselsShownStorageKey(userId);
    if (ids === null || ids.length === 0) target.removeItem(key);
    else target.setItem(key, JSON.stringify({ version: STORED_VERSION, vesselIds: [...ids] }));
    return true;
  } catch {
    return false;
  }
}

export interface ResolveVesselsShownInput {
  vessels: readonly ShownVessel[];
  /** The raw `?vessels=` value (null when absent). */
  urlParam: string | null | undefined;
  /** The stored ids (`readStoredVesselsShown`), or null. */
  stored: readonly string[] | null | undefined;
}

/** Resolves the vessels shown: URL codes win, then the stored choice, then every counted vessel. */
export function resolveVesselsShown({ vessels, urlParam, stored }: ResolveVesselsShownInput): VesselsShownResolution {
  const countedIds = countedVesselIds(vessels);
  const result = (vesselIds: string[], source: VesselsShownSource, droppedCodes: string[]): VesselsShownResolution => ({
    vesselIds,
    source,
    isDefault: sameSelection(vesselIds, countedIds),
    countedIds,
    droppedCodes,
  });

  const codes = parseVesselCodes(urlParam);
  const byCode = new Map<string, string>();
  for (const v of vessels) if (v.code) byCode.set(v.code, v.id);
  const fromUrl = normaliseSelection(vessels, codes.map((c) => byCode.get(c)).filter((id): id is string => Boolean(id)));
  const droppedCodes = codes.filter((c) => !byCode.has(c));
  if (fromUrl.length) return result(fromUrl, 'url', droppedCodes);

  const fromStorage = stored ? normaliseSelection(vessels, stored) : [];
  if (fromStorage.length) return result(fromStorage, 'storage', droppedCodes);

  return result(countedIds, 'default', droppedCodes);
}

// ─── Tick helpers (flag, class, fleet group) ─────────────────────────────

/** One "tick these vessels" choice: a flag state, a class society or a fleet group. */
export interface VesselTickOption {
  /** Stable key (the lower-cased value, or the fleet group id). */
  key: string;
  label: string;
  /** The vessels it ticks, in list order. */
  vesselIds: string[];
}

export interface VesselTickOptions {
  flags: VesselTickOption[];
  classes: VesselTickOption[];
  fleetGroups: VesselTickOption[];
}

/** A fleet group as `fleet_groups` names it (names only; colours are tenant data and are not drawn). */
export interface FleetGroupName {
  id: string;
  name: string;
}

function groupBy(vessels: readonly ShownVessel[], pick: (v: ShownVessel) => string | null): VesselTickOption[] {
  const groups = new Map<string, VesselTickOption>();
  for (const v of vessels) {
    const value = pick(v);
    if (!value) continue;
    const key = value.toLocaleLowerCase();
    const group = groups.get(key);
    if (group) group.vesselIds.push(v.id);
    else groups.set(key, { key, label: value, vesselIds: [v.id] });
  }
  return [...groups.values()].sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
}

/**
 * The tick choices for a vessel list: by flag state, by classification
 * society and by fleet group (named groups only). Vessels without the
 * value are in no choice.
 */
export function vesselTickOptions(vessels: readonly ShownVessel[], fleetGroups: readonly FleetGroupName[] = []): VesselTickOptions {
  const names = new Map(fleetGroups.filter((g) => g && typeof g.id === 'string' && blank(g.name)).map((g) => [g.id, (g.name as string).trim()]));
  const groups = new Map<string, VesselTickOption>();
  for (const v of vessels) {
    const id = v.fleetGroupId;
    const name = id ? names.get(id) : undefined;
    if (!id || !name) continue;
    const group = groups.get(id);
    if (group) group.vesselIds.push(v.id);
    else groups.set(id, { key: id, label: name, vesselIds: [v.id] });
  }
  return {
    flags: groupBy(vessels, (v) => v.flagState),
    classes: groupBy(vessels, (v) => v.classificationSociety),
    fleetGroups: [...groups.values()].sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' })),
  };
}

/** `selected` with `ids` added, in list order. */
export function tickVessels(vessels: readonly ShownVessel[], selected: readonly string[], ids: readonly string[]): string[] {
  return normaliseSelection(vessels, [...selected, ...ids]);
}

/** `selected` with `id` toggled, in list order. */
export function toggleVessel(vessels: readonly ShownVessel[], selected: readonly string[], id: string): string[] {
  return selected.includes(id) ? selected.filter((x) => x !== id) : normaliseSelection(vessels, [...selected, id]);
}

export interface VesselsShownSummaryInput {
  /** Vessels shown. */
  selected: number;
  /** Vessels listed (every vessel the user reaches). */
  total: number;
  /** Counted vessels among them. */
  counted: number;
  /** The selection is the default (every counted vessel). */
  isDefault: boolean;
}

/**
 * A short summary of a selection for the filter's button: "All vessels",
 * "All 6 counted" (when some listed vessels are not counted), "3 of 7
 * vessels", "No vessels".
 */
export function vesselsShownSummary({ selected, total, counted, isDefault }: VesselsShownSummaryInput): string {
  if (selected === 0) return 'No vessels';
  if (isDefault) return counted === total ? 'All vessels' : `All ${counted} counted`;
  return `${selected} of ${total} ${total === 1 ? 'vessel' : 'vessels'}`;
}
