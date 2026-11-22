/**
 * Route tree checks against the real router config (BUILD-PLAN B1, B2).
 *
 * Builds the route objects React Router itself builds from <AppRoutes/> and
 * resolves paths with `matchRoutes`, so route ranking is the router's, not a
 * regex's. Nothing is rendered and no page chunk is loaded.
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Importing the route tree imports the guards, which import the client.
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import { type RouteObject } from 'react-router-dom';
import { NAVIGATION_ITEMS } from '@/config/sitemap';
import type { NavChild } from '@/config/navigation-types';
import { REFIT_PATHS } from '@/modules/refit/paths';
import baseline from './routePaths.baseline.json';
import { allRoutePatterns, appRouteObjects, flatRoutes, isLazyPage, resolveUrl } from './routeHarness';

const ROOT = process.cwd();

const routes: RouteObject[] = appRouteObjects();
const declared = allRoutePatterns(routes);

/** Match a URL, following <Navigate> redirects; `path` is the full pattern. */
const resolve = (url: string) => {
  const r = resolveUrl(routes, url);
  return { ...r, path: r.pattern };
};

const leavesOf = (items: NavChild[], acc: NavChild[] = []): NavChild[] => {
  for (const it of items) {
    if (it.children?.length) leavesOf(it.children, acc);
    else acc.push(it);
  }
  return acc;
};
const leaves = leavesOf(NAVIGATION_ITEMS.flatMap((m) => m.children ?? []));

function walkFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walkFiles(full, out);
    else if (/\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

describe('route tree', () => {
  it('builds', () => {
    expect(flatRoutes(routes).length).toBeGreaterThan(300);
  });

  it('keeps every route path the router had before the lazyPage change', () => {
    const missing = (baseline as string[]).filter((p) => !declared.has(p));
    expect(missing, `routes that disappeared:\n${missing.join('\n')}`).toEqual([]);
  });

  it('every sitemap leaf reaches a route, never the catch-all', () => {
    const fallthrough = leaves.filter((l) => resolve(l.path).path === '*').map((l) => `${l.label} -> ${l.path}`);
    expect(fallthrough, `leaves that bounce to the dashboard:\n${fallthrough.join('\n')}`).toEqual([]);
  });
});

describe('Refit routing', () => {
  const refitLeaves = leaves.filter((l) => l.path.startsWith(`${REFIT_PATHS.root}/`) && !l.path.startsWith(`${REFIT_PATHS.root}/projects/`));
  const pages = new Set<string>(Object.entries(REFIT_PATHS).filter(([k]) => k !== 'root').map(([, p]) => p));

  it('every built Refit leaf opens its registered Refit page, not a placeholder', () => {
    expect(refitLeaves).toHaveLength(32);
    const wrong = refitLeaves
      .map((l) => ({ l, r: resolve(l.path) }))
      .filter(({ r }) => !pages.has(r.path) || !isLazyPage(r.element) || r.hops.length > 0)
      .map(({ l, r }) => `${l.label} -> ${l.path} (matched ${r.path || 'nothing'})`);
    expect(wrong, `Refit leaves not opening a page:\n${wrong.join('\n')}`).toEqual([]);
  });

  it('every hard-coded Refit link inside the Refit pages lands on a Refit page', () => {
    const sources = walkFiles(join(ROOT, 'src/modules/refit')).map((f) => readFileSync(f, 'utf8')).join('\n');
    const links = Array.from(new Set(Array.from(sources.matchAll(/to="(\/yard\/refit[^"]*)"/g)).map((m) => m[1])));
    expect(links.length).toBeGreaterThan(5);
    const broken = links.filter((url) => {
      const r = resolve(url);
      return !pages.has(r.path) || !isLazyPage(r.element);
    });
    expect(broken, `Refit links that do not reach a page:\n${broken.join('\n')}`).toEqual([]);
  });

  it('the old doubled Refit compliance URL redirects to the page', () => {
    const r = resolve('/yard/refit/compliance/compliance');
    expect(r.hops).toEqual(['/yard/refit/compliance/compliance']);
    expect(r.path).toBe(REFIT_PATHS.compliance);
  });
});

describe('New Build routing', () => {
  it('the old doubled equipment URL redirects to the equipment register', () => {
    const r = resolve('/yard/new-build/equipment/equipment');
    expect(r.hops).toEqual(['/yard/new-build/equipment/equipment']);
    expect(r.path).toBe('/yard/new-build/equipment/register');
    expect(isLazyPage(r.element)).toBe(true);
  });

  it('the sidebar equipment leaf opens the register', () => {
    const leaf = leaves.find((l) => l.path.startsWith('/yard/new-build/equipment/') && l.label === 'Equipment');
    expect(leaf?.path).toBe('/yard/new-build/equipment/register');
  });
});

describe('route elements', () => {
  const LAZY = Symbol.for('react.lazy');

  /** Walk an element and its static children (no rendering). */
  function findInline(node: React.ReactNode, found: string[]): void {
    if (Array.isArray(node)) {
      node.forEach((n) => findInline(n, found));
      return;
    }
    if (!React.isValidElement(node)) return;
    const type = node.type as unknown;
    if (type === React.Suspense) found.push('Suspense');
    if (typeof type === 'object' && type !== null && (type as { $$typeof?: symbol }).$$typeof === LAZY) found.push('lazy');
    findInline((node.props as { children?: React.ReactNode }).children, found);
  }

  it('no route element builds a lazy component or its own Suspense inline', () => {
    const offenders: string[] = [];
    for (const { pattern, route: r } of flatRoutes(routes)) {
      const found: string[] = [];
      findInline(r.element as React.ReactNode, found);
      if (found.length) offenders.push(`${pattern}: ${found.join(', ')}`);
    }
    expect(offenders, `routes with inline lazies or fallbacks:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('the walker does catch an inline lazy and a Suspense', () => {
    const Inline = React.lazy(() => Promise.resolve({ default: () => null }));
    const found: string[] = [];
    findInline(
      <div>
        <React.Suspense fallback={null}>
          <Inline />
        </React.Suspense>
      </div>,
      found,
    );
    expect(found).toEqual(['Suspense', 'lazy']);
  });
});
