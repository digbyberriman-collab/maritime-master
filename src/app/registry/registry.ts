/**
 * Builds the module registry from the manifests (gap/00 A2, B8).
 *
 * Pure: no React, no router, no Supabase. `./modules.ts` feeds it every
 * `src/modules/*\/module.ts`; tests feed it fixtures.
 *
 * A malformed manifest never throws here (a bad module must not take the
 * whole app down at load): each problem is recorded in `problems`, the
 * offending entry is skipped, and src/test/config/registry.test.tsx fails
 * while any problem is left.
 */
import { matchPath } from 'react-router-dom';
import { isNavSlot, type NavSlotId } from '@/config/navSlots';
import {
  isRedirectDef,
  type AlertRoute,
  type BadgeProvider,
  type ModuleManifest,
  type NavFragment,
  type RecordKindRef,
  type RouteDef,
  type RouteGuardKind,
  type RouteScope,
} from './types';

/** Where each scope's routes mount; workspace routes carry absolute paths. */
export const SCOPE_ROOTS: Readonly<Record<Exclude<RouteScope, 'workspace'>, string>> = {
  fleet: '/fleet',
  vessel: '/v/:vesselCode',
  personal: '/me',
};

const ROUTE_SCOPES: readonly RouteScope[] = ['fleet', 'vessel', 'personal', 'workspace'];
const GUARD_KINDS: readonly RouteGuardKind[] = ['login', 'scope', 'module', 'capability'];

export interface RegisteredRoute {
  moduleId: string;
  def: RouteDef;
  /** The full pattern the router matches: `/v/:vesselCode/crew/list`, `/hris/…`. */
  fullPath: string;
}

export interface RegisteredFragment extends NavFragment {
  moduleId: string;
}

export interface ModuleRegistry {
  /** Every manifest that loaded, by id. */
  manifests: readonly ModuleManifest[];
  routes: readonly RegisteredRoute[];
  nav: readonly RegisteredFragment[];
  alertRoutes: readonly (AlertRoute & { moduleId: string })[];
  badges: readonly (BadgeProvider & { moduleId: string })[];
  recordKinds: readonly (RecordKindRef & { moduleId: string })[];
  /** Everything wrong with the manifests; empty when they are sound. */
  problems: readonly string[];
  /** Routes of one scope, in manifest order. */
  routesFor: (scope: RouteScope) => RegisteredRoute[];
  /** Fragments of one slot, in manifest order (the slot merge sorts by `order`). */
  fragmentsFor: (slot: NavSlotId) => RegisteredFragment[];
  /** Whether a registered page route serves this full path (params match literally too). */
  hasPage: (fullPath: string) => boolean;
}

/** The full router pattern of a route definition. */
export function fullRoutePath(def: Pick<RouteDef, 'scope' | 'path'>): string {
  if (def.scope === 'workspace') return def.path;
  const root = SCOPE_ROOTS[def.scope];
  return def.path ? `${root}/${def.path}` : root;
}

/** The folder name in a glob key (`../../modules/hris/module.ts` → `hris`). */
export function moduleFolder(key: string): string | null {
  const m = key.match(/modules\/([^/]+)\/module\.tsx?$/);
  return m ? m[1] : null;
}

const isDynamic = (pattern: string) => pattern.includes(':') || pattern.includes('*');

function checkRoute(def: RouteDef, manifest: ModuleManifest): string[] {
  const where = `${manifest.id}: route ${JSON.stringify(def.path)}`;
  const out: string[] = [];
  if (!ROUTE_SCOPES.includes(def.scope)) out.push(`${where} has unknown scope ${JSON.stringify(def.scope)}`);
  else if (!manifest.scopes.includes(def.scope)) out.push(`${where} is in scope ${def.scope}, which the manifest does not list`);
  if (typeof def.path !== 'string') out.push(`${where} has no path`);
  else if (def.scope === 'workspace') {
    if (!def.path.startsWith('/')) out.push(`${where} is a workspace route and must be absolute`);
    if (!def.workspace) out.push(`${where} is a workspace route with no workspace`);
  } else {
    if (def.path.startsWith('/')) out.push(`${where} must be relative to ${SCOPE_ROOTS[def.scope] ?? 'its scope'}`);
    if (def.workspace) out.push(`${where} names a workspace but is not a workspace route`);
  }
  if (typeof def.path === 'string' && /\/\/|\/$/.test(def.path)) out.push(`${where} has an empty segment`);
  const redirect = isRedirectDef(def);
  const hasPage = typeof (def as { page?: unknown }).page === 'function';
  if (redirect && hasPage) out.push(`${where} is both a page and a redirect`);
  if (!redirect && !hasPage) out.push(`${where} has neither a page loader nor a redirect`);
  if (redirect && !def.redirectTo) out.push(`${where} redirects nowhere`);
  if (!redirect) {
    const guard = (def as { guard?: { kind?: string } }).guard;
    if (!guard || !GUARD_KINDS.includes(guard.kind as RouteGuardKind)) {
      out.push(`${where} declares no guard`);
    } else if (guard.kind === 'module' && !(guard as { moduleId?: string }).moduleId) {
      out.push(`${where} has a module guard with no moduleId`);
    } else if (guard.kind === 'capability' && !(guard as { capability?: string }).capability) {
      out.push(`${where} has a capability guard with no key`);
    }
  }
  return out;
}

/**
 * Collect manifests into one registry. Accepts the glob result
 * (`{ '<path>/module.ts': manifest }`) or a plain list (tests).
 */
export function buildRegistry(source: Record<string, ModuleManifest> | readonly ModuleManifest[]): ModuleRegistry {
  const problems: string[] = [];
  const entries: [string | null, ModuleManifest][] = Array.isArray(source)
    ? (source as readonly ModuleManifest[]).map((m) => [null, m])
    : Object.entries(source as Record<string, ModuleManifest>).map(([key, m]) => [moduleFolder(key), m]);

  const manifests: ModuleManifest[] = [];
  const ids = new Set<string>();
  for (const [folder, manifest] of entries) {
    if (!manifest || typeof manifest !== 'object' || typeof manifest.id !== 'string' || !manifest.id) {
      problems.push(`${folder ?? '?'}: module.ts has no default-exported manifest with an id`);
      continue;
    }
    if (folder && folder !== manifest.id) problems.push(`${folder}: manifest id ${JSON.stringify(manifest.id)} does not match its folder`);
    if (ids.has(manifest.id)) {
      problems.push(`${manifest.id}: two manifests share this id`);
      continue;
    }
    if (!Array.isArray(manifest.scopes) || !manifest.scopes.length) problems.push(`${manifest.id}: manifest lists no scopes`);
    ids.add(manifest.id);
    manifests.push(manifest);
  }
  manifests.sort((a, b) => a.id.localeCompare(b.id));

  const routes: RegisteredRoute[] = [];
  const byPath = new Map<string, string>();
  const nav: RegisteredFragment[] = [];
  const alertRoutes: (AlertRoute & { moduleId: string })[] = [];
  const badges: (BadgeProvider & { moduleId: string })[] = [];
  const recordKinds: (RecordKindRef & { moduleId: string })[] = [];
  const alertTypes = new Map<string, string>();
  const badgeKeys = new Map<string, string>();
  const kindKeys = new Map<string, string>();

  for (const manifest of manifests) {
    for (const def of manifest.routes ?? []) {
      const found = checkRoute(def, manifest);
      if (found.length) {
        problems.push(...found);
        continue;
      }
      const fullPath = fullRoutePath(def);
      const owner = byPath.get(fullPath);
      if (owner) {
        problems.push(`${manifest.id}: route ${fullPath} is already registered by ${owner}`);
        continue;
      }
      byPath.set(fullPath, manifest.id);
      routes.push({ moduleId: manifest.id, def, fullPath });
    }
    for (const fragment of manifest.nav ?? []) {
      if (!isNavSlot(fragment.slot)) {
        problems.push(`${manifest.id}: nav node ${fragment.node?.id ?? '?'} names unknown slot ${JSON.stringify(fragment.slot)}`);
        continue;
      }
      if (typeof fragment.order !== 'number' || !Number.isFinite(fragment.order)) {
        problems.push(`${manifest.id}: nav node ${fragment.node?.id ?? '?'} has no order`);
        continue;
      }
      nav.push({ ...fragment, moduleId: manifest.id });
    }
    for (const alert of manifest.alertRoutes ?? []) {
      const owner = alertTypes.get(alert.entityType);
      if (owner) problems.push(`${manifest.id}: alert route for ${alert.entityType} is already registered by ${owner}`);
      else {
        alertTypes.set(alert.entityType, manifest.id);
        alertRoutes.push({ ...alert, moduleId: manifest.id });
      }
    }
    for (const badge of manifest.badges ?? []) {
      const owner = badgeKeys.get(badge.key);
      if (owner) problems.push(`${manifest.id}: badge ${badge.key} is already registered by ${owner}`);
      else {
        badgeKeys.set(badge.key, manifest.id);
        badges.push({ ...badge, moduleId: manifest.id });
      }
    }
    for (const kind of manifest.recordKinds ?? []) {
      const owner = kindKeys.get(kind.key);
      if (owner) problems.push(`${manifest.id}: record kind ${kind.key} is already registered by ${owner}`);
      else if (kind.moduleKey !== manifest.id) problems.push(`${manifest.id}: record kind ${kind.key} belongs to ${kind.moduleKey}`);
      else {
        kindKeys.set(kind.key, manifest.id);
        recordKinds.push({ ...kind, moduleId: manifest.id });
      }
    }
  }

  const pagePatterns = routes.filter((r) => !isRedirectDef(r.def)).map((r) => r.fullPath);
  const staticPages = new Set(pagePatterns.filter((p) => !isDynamic(p)));
  const dynamicPages = pagePatterns.filter(isDynamic);

  return {
    manifests,
    routes,
    nav,
    alertRoutes,
    badges,
    recordKinds,
    problems,
    routesFor: (scope) => routes.filter((r) => r.def.scope === scope),
    fragmentsFor: (slot) => nav.filter((f) => f.slot === slot),
    hasPage: (fullPath) => {
      const path = fullPath.split(/[?#]/)[0];
      if (staticPages.has(path)) return true;
      return dynamicPages.some((pattern) => matchPath({ path: pattern, end: true }, path) !== null);
    },
  };
}
