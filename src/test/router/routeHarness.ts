/**
 * The real route tree, as React Router builds it from <AppRoutes/>, plus a
 * resolver that follows <Navigate> redirects (and <KeepSearchNavigate>, the
 * same redirect keeping the query and hash). Nothing is rendered and no page
 * chunk is loaded.
 *
 * Test files that import this must mock the Supabase client first:
 *   vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
 */
import React from 'react';
import { Navigate, Routes, createRoutesFromChildren, matchRoutes, resolvePath, type RouteObject } from 'react-router-dom';
import { AppRoutes } from '@/routes';
import { LegacyRoute, ScopeNotFound } from '@/app/router/scopes';
import KeepSearchNavigate from '@/app/router/KeepSearchNavigate';
import ModuleRoute from '@/shared/components/ModuleRoute';

type WithChildren = React.ReactElement<{ children?: React.ReactNode }>;

/** Find the <Routes> element under whatever providers AppRoutes wraps it in. */
function findRoutes(node: React.ReactNode): WithChildren | null {
  if (!React.isValidElement(node)) return null;
  const el = node as WithChildren;
  if (el.type === Routes) return el;
  const children = React.Children.toArray(el.props.children);
  for (const child of children) {
    const found = findRoutes(child);
    if (found) return found;
  }
  return null;
}

export function appRouteObjects(): RouteObject[] {
  const routesEl = findRoutes(AppRoutes({}) as React.ReactNode);
  if (!routesEl) throw new Error('AppRoutes renders no <Routes>');
  return createRoutesFromChildren(routesEl.props.children);
}

/** Every declared path pattern, nested ones joined onto their parents. */
export function allRoutePatterns(routes: RouteObject[], base = '', acc = new Set<string>()): Set<string> {
  for (const r of routes) {
    const full = joinPattern(base, r.path);
    if (r.path) acc.add(full);
    if (r.children) allRoutePatterns(r.children, full, acc);
  }
  return acc;
}

/** Raw `path` props as written (relative ones unjoined), for older baselines. */
export function rawRoutePaths(routes: RouteObject[], acc = new Set<string>()): Set<string> {
  for (const r of routes) {
    if (r.path) acc.add(r.path);
    if (r.children) rawRoutePaths(r.children, acc);
  }
  return acc;
}

function joinPattern(base: string, path: string | undefined): string {
  if (!path) return base || '/';
  if (path.startsWith('/')) return path;
  return `${base.replace(/\/$/, '')}/${path}`;
}

/** A redirect element: <Navigate>, or <KeepSearchNavigate>, which is one that keeps the query and hash. */
export const isRedirectElement = (el: React.ReactElement | null | undefined): el is React.ReactElement<{ to: string }> =>
  !!el && (el.type === Navigate || el.type === KeepSearchNavigate);

export interface Resolved {
  /** The matched route's full pattern (parents joined). '*' for the catch-all. */
  pattern: string;
  /** The matched route's own `path` prop. */
  path: string;
  element: React.ReactElement | null;
  /** URLs passed through on the way (redirects followed). */
  hops: string[];
  /** The URL finally matched. */
  url: string;
}

/** Match a URL, following <Navigate> redirects (relative ones too), at most five hops. */
export function resolveUrl(routes: RouteObject[], url: string): Resolved {
  const hops: string[] = [];
  let current = url.split(/[?#]/)[0];
  for (let i = 0; i < 6; i += 1) {
    const matches = matchRoutes(routes, current);
    const last = matches?.[matches.length - 1];
    const route = last?.route;
    const element = (route?.element ?? null) as React.ReactElement | null;
    const pattern = (matches ?? []).reduce((acc, m) => joinPattern(acc, m.route.path), '');
    // The top-level catch-all is a redirect to the dashboard; stop there so a
    // URL that only "works" by bouncing home is reported as unmatched.
    if (route?.path === '*' && (matches?.length ?? 0) === 1) {
      return { pattern: '*', path: '*', element, hops, url: current };
    }
    if (isRedirectElement(element)) {
      hops.push(current);
      const to = String((element.props as { to: string }).to);
      current = resolvePath(to, last?.pathname ?? '/').pathname;
      continue;
    }
    return { pattern, path: route?.path ?? '', element, hops, url: current };
  }
  throw new Error(`redirect loop from ${url}: ${hops.join(' -> ')}`);
}

/** The lazy page element itself (lazyPage(), src/app/router/lazyPage.tsx). */
const isBareLazyPage = (el: React.ReactElement | null | undefined): boolean =>
  !!el &&
  typeof el.type === 'function' &&
  String((el.type as { displayName?: string }).displayName ?? '').startsWith('LazyPage');

/**
 * A route opens a page: a lazy page, or a manifest page behind its module or
 * capability guard (`<ModuleRoute …><Page/></ModuleRoute>`, manifestRoutes.tsx),
 * which Phase 3 streams use for every rebuilt page.
 */
export const isLazyPage = (el: React.ReactElement | null): boolean => {
  if (isBareLazyPage(el)) return true;
  if (!el || el.type !== ModuleRoute) return false;
  const child = (el.props as { children?: React.ReactNode }).children;
  return React.isValidElement(child) && isBareLazyPage(child);
};

const isPlaceholderWrapper = (el: React.ReactElement | null | undefined): boolean =>
  !!el && typeof el.type === 'function' && (el.type as { name?: string }).name === 'PlaceholderWrapper';

/**
 * A sitemap Coming Soon route: `<Guard><PlaceholderWrapper/></Guard>` at the
 * top level (workspaces), or a bare `<PlaceholderWrapper/>` inside the Fleet
 * and vessel scopes, whose layout routes guard it.
 */
export function isPlaceholderElement(el: React.ReactElement | null | undefined): boolean {
  if (isPlaceholderWrapper(el)) return true;
  const child = (el?.props as { children?: unknown } | undefined)?.children as React.ReactElement | undefined;
  return isPlaceholderWrapper(child);
}

export const isLegacyRouteElement = (el: React.ReactElement | null | undefined): el is React.ReactElement<{ from: string; children: React.ReactElement }> =>
  !!el && el.type === LegacyRoute;

export const isScopeNotFound = (el: React.ReactElement | null | undefined): boolean => !!el && el.type === ScopeNotFound;

/** The route tree with the Coming Soon placeholder routes removed. */
export function withoutPlaceholders(routes: RouteObject[]): RouteObject[] {
  return routes
    .filter((r) => !isPlaceholderElement(r.element as React.ReactElement | null))
    .map((r): RouteObject => {
      if (r.index === true || !r.children) return r;
      return { ...r, children: withoutPlaceholders(r.children) };
    });
}

/** Every route object, nested ones included, with its full pattern. */
export function flatRoutes(routes: RouteObject[], base = '', acc: { pattern: string; route: RouteObject }[] = []) {
  for (const r of routes) {
    const full = joinPattern(base, r.path);
    if (r.path || r.index) acc.push({ pattern: full, route: r });
    if (r.children) flatRoutes(r.children, full, acc);
  }
  return acc;
}

// ─── Describing the route tree (BUILD-PLAN B8 snapshot) ────────────────────
// A text form of every route: its full pattern, the pathless layouts above
// it, and what its element does (page, guard, layout, redirect target). Used
// to prove that moving routes into module manifests changed nothing.

const componentName = (type: unknown): string => {
  if (typeof type === 'string') return type;
  if (typeof type === 'function' || (typeof type === 'object' && type !== null)) {
    const t = type as { displayName?: string; name?: string };
    return t.displayName || t.name || 'Anonymous';
  }
  return String(type);
};

const propSummary = (props: Record<string, unknown>): string => {
  const keys = Object.keys(props).filter((k) => k !== 'children' && props[k] !== undefined).sort();
  if (!keys.length) return '';
  const parts = keys.map((k) => {
    const v = props[k];
    if (typeof v === 'function') return `${k}=fn`;
    if (React.isValidElement(v)) return `${k}=<${componentName(v.type)}>`;
    return `${k}=${JSON.stringify(v)}`;
  });
  return `{${parts.join(',')}}`;
};

/** `/src/modules/hris/pages/X.tsx` from a `() => import(...)` loader. */
export const loaderTarget = (loader: unknown): string => {
  const source = String(loader);
  const m = source.match(/import(?:__)?\(\s*["'`]([^"'`]+)["'`]/) ?? source.match(/["'`](\/src\/[^"'`]+)["'`]/);
  return m ? m[1] : source;
};

const describeWrapper = (wrapper: unknown): string => {
  if (!wrapper) return '-';
  if (React.isValidElement(wrapper)) {
    return `${componentName(wrapper.type)}${propSummary(wrapper.props as Record<string, unknown>)}`;
  }
  return componentName(wrapper);
};

interface LazyMeta {
  loader?: unknown;
  guard?: unknown;
  layout?: unknown;
  label?: string;
}

/** One route element as text: what renders and what guards it. */
export function describeElement(node: React.ReactNode): string {
  if (node === null || node === undefined || node === false) return 'none';
  if (Array.isArray(node)) return node.map(describeElement).join(' + ');
  if (!React.isValidElement(node)) return JSON.stringify(node);
  const props = node.props as Record<string, unknown> & { children?: React.ReactNode };
  if (node.type === Navigate || node.type === KeepSearchNavigate) return `redirect(${String(props.to)})`;
  if (node.type === LegacyRoute) return `legacy(${String(props.from)}) > ${describeElement(props.children)}`;
  if (isBareLazyPage(node)) {
    const meta = ((node.type as { meta?: LazyMeta }).meta ?? {}) as LazyMeta;
    const label = meta.label ? ` label=${meta.label}` : '';
    return `page(${loaderTarget(meta.loader)}) guard=${describeWrapper(meta.guard)} layout=${describeWrapper(meta.layout)}${label}${propSummary(props)}`;
  }
  const name = `<${componentName(node.type)}${propSummary(props)}>`;
  return props.children !== undefined ? `${name} > ${describeElement(props.children)}` : name;
}

/**
 * Every route as `pattern [pathless layouts] :: element`, sorted. Duplicate
 * patterns stay as separate lines, so a doubled route shows up too.
 */
export function describeRouteTree(routes: RouteObject[], base = '', layouts: string[] = [], acc: string[] = []): string[] {
  for (const r of routes) {
    const full = joinPattern(base, r.path);
    const element = r.element as React.ReactElement | null | undefined;
    if (!r.path && !r.index && r.children) {
      describeRouteTree(r.children, base, [...layouts, describeElement(element)], acc);
      continue;
    }
    const where = layouts.length ? ` [${layouts.join(' / ')}]` : '';
    acc.push(`${full}${r.index ? ' (index)' : ''}${where} :: ${describeElement(element)}`);
    if (r.children) describeRouteTree(r.children, full, [], acc);
  }
  return acc.sort();
}
