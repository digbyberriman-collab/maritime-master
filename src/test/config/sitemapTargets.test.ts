/**
 * Every sidebar leaf that claims a real page must reach one.
 *
 * `/account` and `/admin/notifications` sat in the sidebar for months with no
 * route behind them: clicking either fell through the catch-all to the
 * dashboard, with no error. This test asserts that each leaf carrying an
 * `existing` target resolves to a declared route, counting the routes that
 * live in module route files and the generated section redirects, not just
 * the literals in the main router.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { NAVIGATION_ITEMS, PLACEHOLDER_LEAVES, SECTION_REDIRECTS } from '@/config/sitemap';
import type { NavChild } from '@/config/navigation-types';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

/** Literal `path="..."` values, excluding the `*` catch-all which matches everything. */
function literalPaths(source: string): string[] {
  return Array.from(source.matchAll(/path="([^"]+)"/g))
    .map((m) => m[1])
    .filter((p) => p !== '*');
}

/** Paths a module route file mounts, e.g. `path={LEGAL_PATHS.root}`, resolved from its paths module. */
function modulePaths(): string[] {
  const out: string[] = [];
  for (const dir of readdirSync(join(ROOT, 'src/modules'))) {
    const routesFile = join('src/modules', dir, 'routes.tsx');
    try {
      out.push(...literalPaths(read(routesFile)));
    } catch {
      continue; // module has no routes file
    }
    // Module routers commonly mount a base path plus children; record the base
    // so leaves pointing at the module root resolve.
    try {
      const paths = read(join('src/modules', dir, 'paths.ts'));
      for (const m of paths.matchAll(/'(\/[a-z0-9/-]+)'/gi)) out.push(m[1]);
    } catch {
      // no paths module
    }
  }
  return out;
}

const declared = new Set<string>([
  ...literalPaths(read('src/routes/index.tsx')),
  ...modulePaths(),
  ...SECTION_REDIRECTS.map((r) => r.from),
  ...PLACEHOLDER_LEAVES.map((l) => l.path),
]);

function isDeclared(target: string): boolean {
  const path = target.split('?')[0];
  if (declared.has(path)) return true;
  for (const d of declared) {
    if (!d.includes(':') && !d.endsWith('/*')) continue;
    const pattern = '^' + d.replace(/:[^/]+/g, '[^/]+').replace(/\/\*$/, '(/.*)?') + '$';
    if (new RegExp(pattern).test(path)) return true;
  }
  return false;
}

const leaves: NavChild[] = [];
(function walk(items: NavChild[]) {
  for (const item of items) {
    if (item.children?.length) walk(item.children);
    else leaves.push(item);
  }
})(NAVIGATION_ITEMS.flatMap((m) => m.children ?? []));

const placeholderPaths = new Set(PLACEHOLDER_LEAVES.map((l) => l.path));
const explicitLeaves = leaves.filter((l) => l.path && !placeholderPaths.has(l.path));

describe('sitemap targets', () => {
  it('has leaves to check', () => {
    expect(leaves.length).toBeGreaterThan(100);
    expect(explicitLeaves.length).toBeGreaterThan(20);
  });

  it('every leaf with a real target resolves to a declared route', () => {
    const broken = explicitLeaves
      .filter((l) => !isDeclared(l.path as string))
      .map((l) => `${l.label} -> ${l.path}`);
    expect(broken, `sidebar leaves with no route:\n${broken.join('\n')}`).toEqual([]);
  });

  it('keeps the leaves that were previously dead pointed at their real pages', () => {
    const target = (label: string) => leaves.find((l) => l.label === label)?.path;
    expect(target('Notification Management')).toBe('/settings/notifications');
    expect(target('Account')).toBe('/settings');
    expect(target('Support Tickets')).toBe('/help/support');
    expect(target('Fleet Rotation Planner')).toBe('/crew/rotation-planner');
    expect(target('Users & Access')).toBe('/users-access');
  });
});
