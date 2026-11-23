/**
 * The one resolver from an inbox row to an app path (gap/03 C11; gap/08
 * NO3; gap/10 IA15; DECISIONS D-27, D-97, D-111; Phase 2 spec §B.7). Pure:
 * the bell and /inbox feed it what the viewer can reach
 * (../hooks/useInboxLinks.ts) and never navigate on an "unavailable".
 *
 * A row links either by a path or by a record:
 *
 * - `link_path` (relative to the scope root: no leading slash; a query and
 *   hash are kept) under `link_scope`:
 *   - `vessel`: `/v/<code>/<path>` (`vesselPath`, so the code is written in
 *     its canonical lower case, D-111), only when the viewer reaches that
 *     vessel; the code is matched without regard to case. No code, or one
 *     that is not a vessel code, has no target.
 *   - `fleet`: `/fleet/<path>`, only with fleet reach (no path: the Fleet
 *     dashboard).
 *   - `personal`: `/me/<path>` (no path: `/inbox`). Always the viewer's own.
 *   - `workspace`: `WORKSPACE_ROOTS[link_workspace]/<path>`, only when the
 *     workspace's Apps entry admits the viewer (D-97); an unknown workspace
 *     has no target.
 *   A path that is only a query or hash (`?tab=open`) opens the scope's home
 *   with it.
 * - No path, but `record_kind` + `record_id`: the kind's `routePattern` from
 *   the record registry (src/lib/records/registry.ts), with `:vesselCode`
 *   (from `link_vessel_code`) and `:id` filled in. A pattern that names a
 *   vessel needs reach to that vessel; one under `/fleet/` needs fleet reach;
 *   any other must sit under a `WORKSPACE_ROOTS` entry the viewer may open
 *   (else no target, or "workspace denied"). An unregistered kind, a kind
 *   without a route, or a pattern with any other `:param` has no target.
 *
 * Paths are never trusted: a leading slash, `..`, `//`, a backslash, a
 * scheme, a percent-encoded dot (`%2e`) or a control character is refused
 * (the inbox's SQL CHECK refuses the same; never an open redirect, never a
 * way out of the scope root).
 */
import { normaliseVesselCode, vesselPath } from '@/modules/vessels/lib/vesselCode';
import type { InboxWorkspace, NotificationInboxRow } from '../types/db.pending';

export const WORKSPACE_ROOTS: Readonly<Record<InboxWorkspace, string>> = {
  hris: '/hris',
  health: '/health',
  yard: '/yard',
  shoreside: '/shoreside',
  legal: '/departments/legal',
};

/** Where a link with no path lands, per scope. */
export const FLEET_HOME = '/fleet/dashboard';
export const PERSONAL_HOME_FOR_INBOX = '/inbox';
const FLEET_ROOT = '/fleet';
const PERSONAL_ROOT = '/me';

export interface DeepLinkContext {
  fleetReach: boolean;
  /** Codes of the vessels the viewer reaches (matched without regard to case). */
  reachableVesselCodes: ReadonlySet<string>;
  canOpenWorkspace: (workspace: InboxWorkspace) => boolean;
  /** `routePattern` of a registered record kind (src/lib/records/registry.ts), if any. */
  routeForKind?: (kindKey: string) => string | undefined;
}

export type DeepLinkUnavailable = 'no_reach' | 'no_fleet_reach' | 'workspace_denied' | 'invalid_path' | 'no_target';
export type DeepLinkResult = { kind: 'link'; href: string } | { kind: 'unavailable'; reason: DeepLinkUnavailable };

export type DeepLinkSource = Pick<
  NotificationInboxRow,
  'link_scope' | 'link_vessel_code' | 'link_workspace' | 'link_path' | 'record_kind' | 'record_id'
>;

/** What the bell and /inbox say for a link that cannot be opened (no navigation). */
export const DEEP_LINK_UNAVAILABLE_TITLE = 'No longer available';
export const DEEP_LINK_UNAVAILABLE_DETAIL: Readonly<Record<DeepLinkUnavailable, string>> = {
  no_reach: 'You no longer have access to this vessel.',
  no_fleet_reach: 'This opens in the Fleet view, which your access does not include.',
  workspace_denied: 'Your access does not include this workspace.',
  invalid_path: 'This link cannot be opened.',
  no_target: 'This link cannot be opened.',
};

/** Leading slash, `..`, `//`, backslash, a scheme or a percent-encoded dot (`%2e`). */
const UNSAFE_PATH = /(^\/)|(\.\.)|(\/\/)|(\\)|(^[a-z][a-z0-9+.-]*:)|(%2e)/i;

/** C0 controls, DEL and the C1 controls (what Postgres' `[[:cntrl:]]` matches in a UTF-8 database). */
const isControl = (codePoint: number): boolean => codePoint < 0x20 || (codePoint >= 0x7f && codePoint <= 0x9f);

const hasControlCharacter = (path: string): boolean => Array.from(path).some((ch) => isControl(ch.codePointAt(0) ?? 0));

/** The inbox's `link_path` CHECK, in TS: 1–500 characters, relative, no escape from the scope root. */
export function isSafeRelativePath(path: string): boolean {
  return path.length > 0 && path.length <= 500 && !UNSAFE_PATH.test(path) && !hasControlCharacter(path);
}

/** A stored vessel code (D-03): a letter, then two letters or digits. */
const VESSEL_CODE = /^[A-Z][A-Z0-9]{2}$/;

const unavailable = (reason: DeepLinkUnavailable): DeepLinkResult => ({ kind: 'unavailable', reason });
const link = (href: string): DeepLinkResult => ({ kind: 'link', href });

const isWorkspace = (value: unknown): value is InboxWorkspace =>
  typeof value === 'string' && Object.prototype.hasOwnProperty.call(WORKSPACE_ROOTS, value);

const WORKSPACE_KEYS = Object.keys(WORKSPACE_ROOTS) as InboxWorkspace[];

/** The workspace whose root `pathname` sits under, if any. */
export function workspaceForPath(pathname: string): InboxWorkspace | undefined {
  return WORKSPACE_KEYS.find((ws) => pathname === WORKSPACE_ROOTS[ws] || pathname.startsWith(`${WORKSPACE_ROOTS[ws]}/`));
}

function reachesVessel(ctx: DeepLinkContext, code: string): boolean {
  if (ctx.reachableVesselCodes.has(code)) return true;
  for (const reachable of ctx.reachableVesselCodes) if (normaliseVesselCode(reachable) === code) return true;
  return false;
}

/** `root/path`, or `home` (+ a bare query or hash) when the path names no page. */
function underRoot(root: string, home: string, path: string): string {
  if (!path) return home;
  if (path.startsWith('?') || path.startsWith('#')) return `${home}${path}`;
  return `${root}/${path}`;
}

const PATTERN_PARAM = /:([A-Za-z][A-Za-z0-9_]*)/g;

/** A kind's route with `:vesselCode` and `:id` filled in; null when it needs anything else. */
function fillKindRoute(pattern: string, code: string | null, id: string): { href: string; namesVessel: boolean } | null {
  let namesVessel = false;
  let missing = false;
  const href = pattern.replace(PATTERN_PARAM, (_, name: string) => {
    if (name === 'id') return encodeURIComponent(id);
    if (name === 'vesselCode' && code) {
      namesVessel = true;
      return encodeURIComponent(code.toLowerCase());
    }
    missing = true;
    return '';
  });
  return missing ? null : { href, namesVessel };
}

function resolveKindRoute(kindKey: string, recordId: string, code: string | null, ctx: DeepLinkContext): DeepLinkResult {
  const pattern = ctx.routeForKind?.(kindKey);
  if (!pattern || !pattern.startsWith('/')) return unavailable('no_target');
  const filled = fillKindRoute(pattern, code, recordId);
  if (!filled) return unavailable('no_target');
  const { href, namesVessel } = filled;
  // A route that names a vessel opens only for someone who reaches it.
  if (namesVessel && code && !reachesVessel(ctx, code)) return unavailable('no_reach');
  if (href.startsWith('/v/')) return namesVessel ? link(href) : unavailable('no_target');
  if (href === FLEET_ROOT || href.startsWith(`${FLEET_ROOT}/`)) return ctx.fleetReach ? link(href) : unavailable('no_fleet_reach');
  // Any other kind route must sit under a workspace root the viewer may open (D-97).
  const ws = workspaceForPath(href.split(/[?#]/)[0]);
  if (!ws) return unavailable('no_target');
  return ctx.canOpenWorkspace(ws) ? link(href) : unavailable('workspace_denied');
}

export function resolveInboxLink(row: DeepLinkSource, ctx: DeepLinkContext): DeepLinkResult {
  const rawCode = row.link_vessel_code ? normaliseVesselCode(row.link_vessel_code) : '';
  const code = VESSEL_CODE.test(rawCode) ? rawCode : null;
  const path = row.link_path ?? '';

  if (!path && row.record_kind && row.record_id) {
    // A code that is present but malformed names no vessel: never fill a route with it.
    if (rawCode && !code) return unavailable('no_target');
    return resolveKindRoute(row.record_kind, row.record_id, code, ctx);
  }
  if (path && !isSafeRelativePath(path)) return unavailable('invalid_path');

  switch (row.link_scope) {
    case 'vessel':
      if (!code) return unavailable('no_target');
      if (!reachesVessel(ctx, code)) return unavailable('no_reach');
      return link(vesselPath(code, path));
    case 'fleet':
      if (!ctx.fleetReach) return unavailable('no_fleet_reach');
      return link(underRoot(FLEET_ROOT, FLEET_HOME, path));
    case 'personal':
      return link(underRoot(PERSONAL_ROOT, PERSONAL_HOME_FOR_INBOX, path));
    case 'workspace': {
      const ws = row.link_workspace;
      if (!isWorkspace(ws)) return unavailable('no_target');
      if (!ctx.canOpenWorkspace(ws)) return unavailable('workspace_denied');
      const root = WORKSPACE_ROOTS[ws];
      return link(underRoot(root, root, path));
    }
    default:
      return unavailable('no_target');
  }
}
