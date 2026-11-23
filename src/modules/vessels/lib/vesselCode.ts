/**
 * Vessel codes: the three-character id a vessel carries in URLs
 * (`/v/dra/crew/list`) and in record references (`PTW-DRA-2026-061`).
 *
 * DECISIONS D-03 and C20:
 *
 * - A vessel that already has a stored `code` keeps it (upper case). The
 *   `vessels.code` column is not live yet (D-01). When it lands, it is
 *   seeded from this same derivation, so the codes people already use in
 *   links do not change.
 * - Otherwise the code is derived from the name. Strip a leading `M/Y`,
 *   `S/Y`, `MY`, `SY`, `R/V` or `RV`, keep the letters A–Z, and take the
 *   first three in upper case: "M/Y DRAAK" → `DRA`, "GAME CHANGER" → `GAM`.
 * - Collisions are settled in a fixed order: by `created_at`, then by `id`.
 *   The earliest vessel keeps the plain code. Each later vessel tries
 *   these in turn:
 *   1. the first letter plus the next two consonants;
 *   2. the first two letters plus a digit (1–9, then 0);
 *   3. as a last resort, the first letter plus two characters from A–Z0–9.
 *   Y counts as a vowel here ("HYDRA" → `HYD`, then `HDR`), so the
 *   consonant fallback differs from the plain code more often.
 * - Codes are stored upper case. URLs use lower case and lookups ignore
 *   case.
 *
 * Every function here is pure: it depends only on its inputs. Pass the
 * whole company fleet, including sold vessels, as `allVessels`. That way
 * every user derives the same code for a vessel, whatever subset of vessels
 * they can reach.
 */

/** The vessel fields the derivation reads. */
export interface VesselCodeSource {
  id: string;
  name: string | null;
  created_at?: string | null;
  /** The stored code (`vessels.code`), once the column is live. */
  code?: string | null;
}

const PREFIX = /^\s*(?:M\/Y|S\/Y|R\/V|MY|SY|RV)(?=[\s.,:;-])[\s.,:;-]*/i;
const VOWELS = new Set(['A', 'E', 'I', 'O', 'U', 'Y']);
const STORED_CODE = /^[A-Z][A-Z0-9]{2}$/;
const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
const ALNUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
/** Used when a name has no letters at all. */
const NO_LETTERS = 'VSL';

/** The vessel's stored code, normalised, when it is a usable code. */
export function storedVesselCode(vessel: Pick<VesselCodeSource, 'code'>): string | null {
  const raw = (vessel.code ?? '').trim().toUpperCase();
  return STORED_CODE.test(raw) ? raw : null;
}

/** "M/Y Draak II" → "DRAAKII": the name without its prefix, letters A–Z only. */
export function vesselCodeLetters(name: string | null | undefined): string {
  const bare = (name ?? '').replace(PREFIX, '');
  const letters = bare
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '');
  return letters || NO_LETTERS;
}

/** The codes a vessel may take, in order of preference (lazily, without repeats). */
function* candidateCodes(name: string | null | undefined): Generator<string> {
  const letters = vesselCodeLetters(name);
  const padded = letters.padEnd(3, 'X');
  const first = padded[0];
  const seen = new Set<string>();
  const fresh = (code: string) => {
    if (seen.has(code)) return false;
    seen.add(code);
    return true;
  };

  const plain = padded.slice(0, 3);
  if (fresh(plain)) yield plain;

  const consonants = letters.slice(1).split('').filter((c) => !VOWELS.has(c));
  if (consonants.length >= 2) {
    const code = `${first}${consonants[0]}${consonants[1]}`;
    if (fresh(code)) yield code;
  }

  const firstTwo = padded.slice(0, 2);
  for (const d of DIGITS) {
    const code = `${firstTwo}${d}`;
    if (fresh(code)) yield code;
  }

  for (const a of ALNUM) {
    for (const b of ALNUM) {
      const code = `${first}${a}${b}`;
      if (fresh(code)) yield code;
    }
  }
}

/** The first `limit` codes a vessel may take, in order of preference. */
export function vesselCodeCandidates(name: string | null | undefined, limit = 12): string[] {
  const out: string[] = [];
  for (const code of candidateCodes(name)) {
    out.push(code);
    if (out.length >= limit) break;
  }
  return out;
}

/** created_at ascending, then id: the collision order D-03 fixes. Rows without a date sort last. */
function compareForCodes(a: VesselCodeSource, b: VesselCodeSource): number {
  const at = a.created_at ? Date.parse(a.created_at) : Number.POSITIVE_INFINITY;
  const bt = b.created_at ? Date.parse(b.created_at) : Number.POSITIVE_INFINITY;
  const an = Number.isNaN(at) ? Number.POSITIVE_INFINITY : at;
  const bn = Number.isNaN(bt) ? Number.POSITIVE_INFINITY : bt;
  if (an !== bn) return an < bn ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

const cache = new WeakMap<readonly VesselCodeSource[], Map<string, string>>();

/**
 * The code of every vessel in `allVessels`, keyed by vessel id.
 *
 * Stored codes are reserved first, so a derived code never takes one. When
 * two stored codes clash, which is invalid data, the earlier vessel keeps
 * it and the later one gets a derived code.
 */
export function assignVesselCodes(allVessels: readonly VesselCodeSource[]): Map<string, string> {
  const cached = cache.get(allVessels);
  if (cached) return cached;

  const unique = new Map<string, VesselCodeSource>();
  for (const v of allVessels) if (v && v.id && !unique.has(v.id)) unique.set(v.id, v);
  const ordered = Array.from(unique.values()).sort(compareForCodes);

  const taken = new Set<string>();
  const codes = new Map<string, string>();

  for (const v of ordered) {
    const stored = storedVesselCode(v);
    if (stored && !taken.has(stored)) {
      taken.add(stored);
      codes.set(v.id, stored);
    }
  }
  for (const v of ordered) {
    if (codes.has(v.id)) continue;
    let code: string | null = null;
    for (const candidate of candidateCodes(v.name)) {
      if (!taken.has(candidate)) {
        code = candidate;
        break;
      }
    }
    // 1,296 last-resort codes per first letter: unreachable for a real fleet.
    if (!code) throw new Error(`No free vessel code for ${v.id}`);
    taken.add(code);
    codes.set(v.id, code);
  }

  cache.set(allVessels, codes);
  return codes;
}

/**
 * The vessel's code (upper case), derived against the whole company fleet.
 * `allVessels` should include `vessel`; if it does not, the vessel is added
 * so the answer is still deterministic.
 */
export function getVesselCode(vessel: VesselCodeSource, allVessels: readonly VesselCodeSource[] = [vessel]): string {
  const stored = storedVesselCode(vessel);
  const fleet = allVessels.some((v) => v.id === vessel.id) ? allVessels : [...allVessels, vessel];
  const code = assignVesselCodes(fleet).get(vessel.id);
  return code ?? stored ?? vesselCodeCandidates(vessel.name)[0];
}

/** Normalise user or URL input to a stored-style code: trimmed, upper case. */
export function normaliseVesselCode(code: string | null | undefined): string {
  return (code ?? '').trim().toUpperCase();
}

/**
 * The vessel in `vessels` whose code is `code`, ignoring case. Codes are
 * derived against `allVessels` (default: `vessels`). Pass the full company
 * fleet so the codes match the ones other users see.
 */
export function resolveVesselByCode<T extends VesselCodeSource>(
  code: string | null | undefined,
  vessels: readonly T[],
  allVessels: readonly VesselCodeSource[] = vessels,
): T | undefined {
  const wanted = normaliseVesselCode(code);
  if (!wanted) return undefined;
  const fleet = vessels.every((v) => allVessels.some((a) => a.id === v.id)) ? allVessels : [...allVessels, ...vessels];
  const codes = assignVesselCodes(fleet);
  return vessels.find((v) => codes.get(v.id) === wanted);
}

/** URL prefix of the vessel scope. */
export const VESSEL_SCOPE_PREFIX = '/v';

/**
 * The route param, as written in route patterns and in the static nav tree
 * (`/v/:vesselCode/crew/list`). A URL that carries it literally means "the
 * current vessel": the vessel scope swaps in the selected (else first
 * reachable) vessel's code. A real code never starts with `:`.
 */
export const VESSEL_CODE_PARAM = ':vesselCode';

/** Base of the vessel scope as a route pattern: `/v/:vesselCode`. */
export const VESSEL_SCOPE_PATTERN = `${VESSEL_SCOPE_PREFIX}/${VESSEL_CODE_PARAM}`;

/** True when a URL's code segment is the literal `:vesselCode` param (any case). */
export function isVesselCodeParam(code: string | null | undefined): boolean {
  return (code ?? '').trim().toLowerCase() === VESSEL_CODE_PARAM.toLowerCase();
}

/**
 * A path inside the vessel scope as a pattern: `vesselPatternPath('crew/list')`
 * → `/v/:vesselCode/crew/list`. Same rules for `rel` as `vesselPath`.
 */
export function vesselPatternPath(rel = ''): string {
  const tail = rel.replace(/^\/+/, '');
  if (!tail) return VESSEL_SCOPE_PATTERN;
  if (tail.startsWith('?') || tail.startsWith('#')) return `${VESSEL_SCOPE_PATTERN}${tail}`;
  return `${VESSEL_SCOPE_PATTERN}/${tail}`;
}

/**
 * A path inside a vessel's scope. The code is lower case in the URL:
 * `vesselPath('DRA', 'crew/list')` → `/v/dra/crew/list`, and
 * `vesselPath('DRA')` → `/v/dra` (vessel home). A leading slash on `rel` is
 * ignored, and a query string or hash on `rel` is kept.
 */
export function vesselPath(code: string, rel = ''): string {
  const base = `${VESSEL_SCOPE_PREFIX}/${encodeURIComponent(normaliseVesselCode(code).toLowerCase())}`;
  const tail = rel.replace(/^\/+/, '');
  if (!tail) return base;
  if (tail.startsWith('?') || tail.startsWith('#')) return `${base}${tail}`;
  return `${base}/${tail}`;
}

/**
 * A URL segment, decoded; a malformed escape (`%zz`, a cut-off `%E0%A4%A`)
 * comes back as written, as React Router's own path decoding does, so a
 * garbage URL is an unknown vessel rather than a crash during render.
 */
function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/**
 * `/v/dra/crew/list?x=1` → `{ code: 'DRA', rest: 'crew/list' }`; null outside
 * the vessel scope. The prefix matches in any case (`/V/dra/…`), as the router
 * does (D-111), so a path the vessel scope renders always parses.
 */
export function parseVesselPath(pathname: string): { code: string; rest: string } | null {
  const match = /^\/v\/([^/?#]+)(?:\/([^?#]*))?/i.exec(pathname);
  if (!match) return null;
  return { code: normaliseVesselCode(safeDecode(match[1])), rest: (match[2] ?? '').replace(/\/+$/, '') };
}

const VESSEL_PREFIX_SEGMENT = /^\/v\/([^/?#]+)/i;

/**
 * A vessel-scope pathname in its canonical form (D-111): `/v/` and the code
 * lower case, as `vesselPath` writes them, and the rest exactly as written:
 * `/V/DRA/crew/list` → `/v/dra/crew/list`. A literal `:vesselCode` segment is
 * kept as written (`/V/:vesselCode/a` → `/v/:vesselCode/a`). Null when the
 * pathname is already canonical, outside the vessel scope, or has no stable
 * canonical form (so a redirect can never loop).
 */
export function canonicalVesselPathname(pathname: string): string | null {
  const canonical = canonicalVesselHead(pathname);
  if (canonical === null) return null;
  // A fixed point only: the target must already be canonical.
  return canonicalVesselHead(canonical) === null ? canonical : null;
}

function canonicalVesselHead(pathname: string): string | null {
  const match = VESSEL_PREFIX_SEGMENT.exec(pathname);
  const parsed = match ? parseVesselPath(pathname) : null;
  // A blank code (`/v/%20/…`) has no canonical form; the scope says "not found".
  if (!match || !parsed || !parsed.code) return null;
  let head: string;
  try {
    head = isVesselCodeParam(parsed.code) ? `${VESSEL_SCOPE_PREFIX}/${match[1]}` : vesselPath(parsed.code);
  } catch {
    return null;
  }
  return head === match[0] ? null : `${head}${pathname.slice(match[0].length)}`;
}

/**
 * The same page on another vessel (gap/10 IA23):
 * `/v/dra/safety/permits?tab=open` → `/v/hyd/safety/permits?tab=open`.
 * Outside the vessel scope it returns the other vessel's home.
 */
export function switchVesselInPath(pathnameWithQuery: string, code: string): string {
  const [pathAndQuery, hash = ''] = pathnameWithQuery.split('#');
  const [pathname, query = ''] = pathAndQuery.split('?');
  const parsed = parseVesselPath(pathname);
  const target = vesselPath(code, parsed?.rest ?? '');
  return `${target}${parsed && query ? `?${query}` : ''}${parsed && hash ? `#${hash}` : ''}`;
}
