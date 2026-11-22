/**
 * Sitemap path hygiene (BUILD-PLAN B1; gap/00 B7, gap/10 IA11).
 *
 * The Refit sidebar once built every leaf as `<base>/<slug>` where the base
 * already ended in the slug, so the links read
 * `/yard/refit/overview/dashboard/dashboard`. None of the 32 leaves matched
 * a route; each one rendered Coming Soon while the real page sat unused.
 * These tests stop that class of bug from coming back.
 */
import { describe, expect, it } from 'vitest';
import {
  FLEET_PLACEHOLDER_LEAVES,
  NAVIGATION_ITEMS,
  PLACEHOLDER_LEAVES,
  SECTION_REDIRECTS,
  VESSEL_PLACEHOLDER_LEAVES,
  VESSEL_ROOT_REDIRECTS,
} from '@/config/sitemap';
import { RETIRED_NAV_REDIRECTS } from '@/app/router/retiredNavPaths';
import { vesselPatternPath } from '@/modules/vessels/lib/vesselCode';
import type { NavChild, NavItem } from '@/config/navigation-types';
import { REFIT_PATHS, REFIT_REDIRECTS } from '@/modules/refit/paths';
import refitManifest from '@/modules/refit/module';
import { isRedirectDef } from '@/app/registry/types';

/** The first segment that repeats the one before it, or null. */
function repeatedSegment(path: string): string | null {
  const segments = path.split(/[?#]/)[0].split('/').filter(Boolean);
  for (let i = 1; i < segments.length; i += 1) {
    if (segments[i] === segments[i - 1]) return segments[i];
  }
  return null;
}

type Node = NavItem | NavChild;
const nodes: Node[] = [];
const leaves: NavChild[] = [];
(function walk(items: Node[]) {
  for (const item of items) {
    nodes.push(item);
    if (item.children?.length) walk(item.children);
    else if ('id' in item && !('permissions' in item)) leaves.push(item as NavChild);
  }
})(NAVIGATION_ITEMS);

const yard = NAVIGATION_ITEMS.find((m) => m.id === 'yard');
const refitGroup = yard?.children?.find((c) => c.label === 'Refit');

function leavesOf(items: NavChild[] | undefined, acc: NavChild[] = []): NavChild[] {
  for (const item of items ?? []) {
    if (item.children?.length) leavesOf(item.children, acc);
    else acc.push(item);
  }
  return acc;
}

const PLANNED_REFIT_GROUP = 'Refit / Projects';
const refitPages = Object.entries(REFIT_PATHS)
  .filter(([key]) => key !== 'root')
  .map(([, path]) => path);

describe('repeatedSegment', () => {
  it('finds a segment repeated back to back', () => {
    expect(repeatedSegment('/yard/refit/overview/dashboard/dashboard')).toBe('dashboard');
    expect(repeatedSegment('/a/b/b?x=1')).toBe('b');
  });

  it('ignores repeats that are not adjacent, and query strings', () => {
    expect(repeatedSegment('/yard/refit/overview/dashboard')).toBeNull();
    expect(repeatedSegment('/vessel/crew/vessel')).toBeNull();
    expect(repeatedSegment('/vessel/logbooks/engine-log?vessel=vessel')).toBeNull();
  });
});

describe('sitemap paths', () => {
  it('has a tree to check', () => {
    expect(leaves.length).toBeGreaterThan(200);
  });

  it('no leaf or group path repeats a segment back to back', () => {
    const bad = nodes
      .filter((n) => repeatedSegment(n.path))
      .map((n) => `${n.label} -> ${n.path}`);
    expect(bad, `paths with a doubled segment:\n${bad.join('\n')}`).toEqual([]);
  });

  it('no placeholder or section redirect target repeats a segment', () => {
    expect(PLACEHOLDER_LEAVES.filter((l) => repeatedSegment(l.path)).map((l) => l.path)).toEqual([]);
    expect(SECTION_REDIRECTS.filter((r) => repeatedSegment(r.to)).map((r) => r.to)).toEqual([]);
  });

  it('nor do the placeholders and redirects inside the Fleet and vessel scopes (B7)', () => {
    const urls = [
      ...FLEET_PLACEHOLDER_LEAVES.map((l) => `/fleet/${l.path}`),
      ...VESSEL_PLACEHOLDER_LEAVES.map((l) => vesselPatternPath(l.path)),
      ...VESSEL_ROOT_REDIRECTS.map((r) => vesselPatternPath(`${r.from}/${r.to}`)),
      ...RETIRED_NAV_REDIRECTS.map((r) => r.to),
    ];
    expect(urls.length).toBeGreaterThan(100);
    expect(urls.filter((u) => repeatedSegment(u))).toEqual([]);
  });
});

describe('Refit leaves', () => {
  const groups = refitGroup?.children ?? [];
  const built = leavesOf(groups.filter((g) => g.label !== PLANNED_REFIT_GROUP));
  const planned = leavesOf(groups.filter((g) => g.label === PLANNED_REFIT_GROUP));

  it('the Refit group exists with its eight sub-groups', () => {
    expect(refitGroup).toBeTruthy();
    expect(groups).toHaveLength(8);
  });

  it('every built Refit leaf points at a Refit page path', () => {
    const pages = new Set<string>(refitPages);
    const stray = built.filter((l) => !pages.has(l.path)).map((l) => `${l.label} -> ${l.path}`);
    expect(stray, `Refit leaves that do not open a page:\n${stray.join('\n')}`).toEqual([]);
  });

  it('every Refit page path is registered as a page route by the Refit manifest', () => {
    // src/test/router/routeTree.test.tsx resolves the same leaves through the
    // real router; this is the cheap static half of that check (B8: the
    // routes are manifest data now, not JSX in routes.tsx).
    const registered = new Set<string>(
      refitManifest.routes?.filter((r) => !isRedirectDef(r)).map((r) => r.path) ?? [],
    );
    expect(refitPages.filter((p) => !registered.has(p))).toEqual([]);
    for (const leaf of built) expect(registered.has(leaf.path), `${leaf.label} -> ${leaf.path}`).toBe(true);
  });

  it('every Refit page has exactly one sidebar leaf', () => {
    expect(built).toHaveLength(32);
    expect(built.map((l) => l.path).sort()).toEqual([...refitPages].sort());
  });

  it('no Refit page is also generated as a Coming Soon placeholder', () => {
    const placeholders = new Set(PLACEHOLDER_LEAVES.map((l) => l.path));
    expect(refitPages.filter((p) => placeholders.has(p))).toEqual([]);
  });

  it('the unbuilt Refit / Projects leaves stay placeholders, so they do not fall to the catch-all', () => {
    const placeholders = new Set(PLACEHOLDER_LEAVES.map((l) => l.path));
    expect(planned.length).toBeGreaterThan(0);
    expect(planned.filter((l) => !placeholders.has(l.path)).map((l) => l.path)).toEqual([]);
  });

  it('the Refit section and its groups redirect to real pages', () => {
    const pages = new Set<string>(refitPages);
    const refitRedirects = SECTION_REDIRECTS.filter(
      (r) => r.from === REFIT_PATHS.root || (r.from.startsWith(`${REFIT_PATHS.root}/`) && r.from !== `${REFIT_PATHS.root}/projects`),
    );
    expect(refitRedirects.length).toBeGreaterThanOrEqual(8);
    for (const r of refitRedirects) {
      expect(pages.has(r.to.split('?')[0]), `${r.from} -> ${r.to}`).toBe(true);
    }
    const yardRoot = SECTION_REDIRECTS.find((r) => r.from === '/yard');
    expect(yardRoot?.to.split('?')[0]).toBe(REFIT_PATHS.dashboard);
  });

  it('Refit paths and their redirects never repeat a segment on the target side', () => {
    expect(refitPages.filter((p) => repeatedSegment(p))).toEqual([]);
    for (const r of REFIT_REDIRECTS) expect(repeatedSegment(r.to)).toBeNull();
  });
});
