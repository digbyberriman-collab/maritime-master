/**
 * Pure resolution of the legacy redirect table (./legacyRedirects.ts).
 * No React, no data access: the route element feeds it what the user can
 * reach, so every rule is unit-tested here. Whether a module serves an
 * entry's `pendingTarget` is read from the module registry by default (data
 * known at build time); tests pass a fixture registry's `hasPage` instead.
 */
import { MODULE_REGISTRY } from '@/app/registry/modules';
import { parseVesselPath, vesselPatternPath } from '@/modules/vessels/lib/vesselCode';
import { LEGACY_REDIRECTS, type LegacyRedirectEntry } from './legacyRedirects';

/** What a redirect needs to know about the signed-in user. */
export interface LegacyRedirectContext {
  /** The user can open the Fleet view. */
  fleetReach: boolean;
  /** A fleet user is looking at "All vessels": no single last vessel. */
  allVesselsMode: boolean;
  /** Code of the selected (last) vessel, else of the first reachable one. */
  lastVesselCode: string | null;
  /** Code of the reachable vessel this name slug belongs to (`/vessel/:slug`). */
  vesselCodeBySlug: (slug: string) => string | null;
  /** Code of the reachable vessel with this id. */
  vesselCodeById: (id: string) => string | null;
}

export type LegacyTargetKind = 'vessel' | 'fleet' | 'personal';

const pathOf = (target: string) => target.split(/[?#]/)[0];

/** Whether a registered module page serves a full route pattern (`ModuleRegistry.hasPage`). */
export type HasPage = (fullPath: string) => boolean;

const registryHasPage: HasPage = (fullPath) => MODULE_REGISTRY.hasPage(fullPath);

/**
 * Whether an entry applies yet: always, unless it waits on a `pendingTarget`
 * that no module page serves (then the old page renders where it is, D-27).
 */
export function legacyEntryApplies(entry: LegacyRedirectEntry, hasPage: HasPage = registryHasPage): boolean {
  return !entry.pendingTarget || hasPage(entry.pendingTarget);
}

/** Which scope a target lives in. */
export function targetKind(target: string): LegacyTargetKind {
  const path = pathOf(target);
  if (path.includes(':vesselCode')) return 'vessel';
  if (path === '/fleet' || path.startsWith('/fleet/')) return 'fleet';
  return 'personal';
}

/** The `:name` params a pattern declares. */
export function patternParams(pattern: string): string[] {
  return Array.from(pathOf(pattern).matchAll(/:([A-Za-z0-9_]+)/g)).map((m) => m[1]);
}

/**
 * Fill `:name` tokens. Returns null if a param is missing, so a redirect never
 * produces a URL with a literal `:name` in it.
 */
export function fillPattern(pattern: string, params: Readonly<Record<string, string | undefined>>): string | null {
  let missing = false;
  const filled = pattern.replace(/:([A-Za-z0-9_]+)/g, (_, name: string) => {
    const value = params[name];
    if (value === undefined || value === '') {
      missing = true;
      return '';
    }
    return encodeURIComponent(value);
  });
  return missing ? null : filled;
}

/**
 * Join a target (which may carry its own `?query`) with the incoming query and
 * hash. Parameters the target sets win; the rest of the incoming ones are kept.
 */
export function withSearch(target: string, search: string, hash: string): string {
  const [path, targetQuery = ''] = target.split('?');
  const params = new URLSearchParams(targetQuery);
  new URLSearchParams(search.startsWith('?') ? search.slice(1) : search).forEach((value, key) => {
    if (!params.has(key)) params.append(key, value);
  });
  const query = params.toString();
  return `${path}${query ? `?${query}` : ''}${hash && hash !== '#' ? (hash.startsWith('#') ? hash : `#${hash}`) : ''}`;
}

/**
 * The URL an old route should now open, or null to keep rendering the old
 * page where it is (its pending target has no page yet, no vessel to scope
 * to, or no fleet reach).
 */
export function resolveLegacyTarget(
  entry: LegacyRedirectEntry,
  params: Readonly<Record<string, string | undefined>>,
  search: string,
  hash: string,
  ctx: LegacyRedirectContext,
  hasPage: HasPage = registryHasPage,
): string | null {
  if (!legacyEntryApplies(entry, hasPage)) return null;

  if (entry.fleetTo && ctx.fleetReach) {
    const filled = fillPattern(entry.fleetTo, params);
    return filled ? withSearch(filled, search, hash) : null;
  }

  const kind = targetKind(entry.to);
  if (kind === 'fleet' && !ctx.fleetReach) return null;

  let vesselCode: string | null = null;
  if (kind === 'vessel') {
    const source = entry.vessel;
    if (source && 'slugParam' in source) {
      const slug = params[source.slugParam];
      vesselCode = slug ? ctx.vesselCodeBySlug(slug) : null;
    } else if (source && 'idParam' in source) {
      const id = params[source.idParam];
      vesselCode = id ? ctx.vesselCodeById(id) : null;
    } else if (!ctx.allVesselsMode) {
      vesselCode = ctx.lastVesselCode;
    }
    if (!vesselCode) return null;
  }

  const filled = fillPattern(entry.to, {
    ...params,
    ...(vesselCode ? { vesselCode: vesselCode.toLowerCase() } : {}),
  });
  return filled ? withSearch(filled, search, hash) : null;
}

const BY_FROM = new Map<string, LegacyRedirectEntry>(LEGACY_REDIRECTS.map((e) => [e.from, e]));

/** The table entry for an old route pattern. */
export function legacyEntryFor(from: string): LegacyRedirectEntry | undefined {
  return BY_FROM.get(from);
}

/**
 * The path the nav tree uses for a URL: `/v/dra/crew/list` →
 * `/v/:vesselCode/crew/list`.
 *
 * The static nav tree (src/config/sitemap.ts, BUILD-PLAN B7) writes vessel
 * pages on the `/v/:vesselCode` pattern, because it is the same for every
 * vessel. The shell uses this to work out which module and leaf a vessel page
 * belongs to. Fleet, personal and workspace URLs are already tree paths and
 * come back unchanged, as does a legacy URL that renders in place.
 */
export function toNavPathname(pathname: string): string {
  const scoped = parseVesselPath(pathname);
  return scoped ? vesselPatternPath(scoped.rest) : pathname;
}
