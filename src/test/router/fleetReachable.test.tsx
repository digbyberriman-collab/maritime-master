/**
 * Every page of the Fleet scope can be reached from the UI: from a Fleet nav
 * leaf (redirects followed), from a link on a page that is itself reachable,
 * or from a link the shell shows on every page (D-27: nobody loses a page they
 * could open before). The risk overview (the old /ism/erm page) is reached
 * through the reports index.
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import { NAVIGATION_ITEMS, navLeaves } from '@/config/sitemap';
import { MODULE_REGISTRY } from '@/app/registry/modules';
import { isRedirectDef } from '@/app/registry/types';
import { legacyEntryFor } from '@/app/router/legacyResolve';
import {
  appRouteObjects,
  flatRoutes,
  isPlaceholderElement,
  isRedirectElement,
  isScopeNotFound,
  resolveUrl,
} from './routeHarness';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const routes = appRouteObjects();

/**
 * The four legacy report pages (static routes in src/routes/index.tsx), which
 * the Reports page links. A local list since platform-prep PP2: the page is
 * the dashboard module's, and its own links are pinned in
 * src/test/dashboard/fleetReportsIndex.test.tsx.
 */
const LEGACY_REPORT_PATHS: readonly string[] = ['incident-analytics', 'capa-tracker', 'drill-analytics', 'risk-overview'];
const fleetModule = NAVIGATION_ITEMS.filter((m) => m.id === 'fleet');

/** The Fleet scope's page routes: no redirects, placeholders or not-found. */
const fleetPages = flatRoutes(routes)
  .filter(({ pattern }) => pattern.startsWith('/fleet/'))
  .filter(({ route }) => {
    const el = route.element as React.ReactElement | null | undefined;
    return !!el && !isRedirectElement(el) && !isPlaceholderElement(el) && !isScopeNotFound(el);
  })
  .map(({ pattern }) => pattern);

/**
 * Links on reachable pages that open a Fleet page: [page route, source file,
 * the link as written there, the URL it opens].
 */
const IN_PAGE_LINKS: readonly [from: string, file: string, needle: string, opens: string][] = [
  // The users list opens a person's access page through its old URL, which
  // redirects into the Fleet scope for fleet users (legacyRedirects.ts).
  ['/fleet/admin/users/crew', 'src/modules/users-access/pages/UsersAccessListPage.tsx', '/users-access/${r.userId}', '/users-access/:userId'],
];

/**
 * Links the shell shows on every page that open a Fleet page: [source file,
 * the link as written there, the URL it opens].
 */
const SHELL_LINKS: readonly [file: string, needle: string, opens: string][] = [
  // A document notification in the inbox and the bell opens the old /documents
  // URL, which lands fleet users on the controlled register (legacyRedirects.ts).
  ['src/modules/notifications/lib/notificationLinks.ts', "['document', '/documents']", '/documents'],
];

/**
 * A module's page under another page of the same module that is reachable
 * (its tabs and sub-pages: `/fleet/reports/:reportKey` under `/fleet/reports`)
 * counts as reachable: the module links it from that page and pins the link in
 * its own tests (platform-prep PP3), so a stream adding a sub-page edits no
 * platform test. Repeated until nothing changes, for sub-pages of sub-pages.
 */
function addModuleSubPages(reachable: Set<string>): void {
  const pages = MODULE_REGISTRY.routesFor('fleet').filter((r) => !isRedirectDef(r.def));
  for (let grew = true; grew; ) {
    grew = false;
    for (const page of pages) {
      if (reachable.has(page.fullPath)) continue;
      const parent = pages.find(
        (p) => p.moduleId === page.moduleId && reachable.has(p.fullPath) && page.fullPath.startsWith(`${p.fullPath}/`),
      );
      if (parent) {
        reachable.add(page.fullPath);
        grew = true;
      }
    }
  }
}

/**
 * Pages no nav leaf or link opens yet, each with the reason. Keep empty
 * unless the page was already unlinked before the Fleet scope existed.
 */
const NOT_LINKED_YET: Readonly<Record<string, string>> = {
  // RolesPermissionsPage was not in the nav before Phase 0 either (gap/03 B6
  // "global role matrix, not in nav"); it becomes the Users & Access "Access
  // Sets" tab, which links it (gap/03 B6).
  '/fleet/admin/users/sets': 'gap/03 B6: the Access Sets tab of Users & Access',
};

describe('Fleet scope reachability', () => {
  const reachable = new Set<string>();
  for (const leaf of navLeaves(fleetModule)) {
    if (leaf.status === 'planned' || leaf.crossLink) continue;
    reachable.add(resolveUrl(routes, leaf.path).pattern);
  }
  for (const rel of LEGACY_REPORT_PATHS) reachable.add(resolveUrl(routes, `/fleet/reports/${rel}`).pattern);
  for (const [from, file, needle, opens] of IN_PAGE_LINKS) {
    if (!reachable.has(from) || !read(file).includes(needle)) continue;
    const entry = legacyEntryFor(opens);
    reachable.add(entry ? entry.fleetTo ?? entry.to : opens);
  }
  for (const [file, needle, opens] of SHELL_LINKS) {
    if (!read(file).includes(needle)) continue;
    const entry = legacyEntryFor(opens);
    reachable.add(resolveUrl(routes, entry ? entry.fleetTo ?? entry.to : opens).pattern);
  }
  addModuleSubPages(reachable);

  it('finds the Fleet pages', () => {
    expect(fleetPages.length).toBeGreaterThan(12);
    expect(fleetPages).toContain('/fleet/reports/risk-overview');
  });

  it('every Fleet page is reachable from a nav leaf or a link', () => {
    const orphans = fleetPages.filter((p) => !reachable.has(p) && !NOT_LINKED_YET[p]);
    expect(orphans, `Fleet pages nothing opens:\n${orphans.join('\n')}`).toEqual([]);
  });

  it('a module sub-page counts only under a reachable page of the same module', () => {
    const only = (paths: string[]) => {
      const set = new Set(paths);
      addModuleSubPages(set);
      return set;
    };
    // The documents register sits under the documents page (both the documents module's).
    expect(only(['/fleet/documents']).has('/fleet/documents/register')).toBe(true);
    // Not under a page of another module, nor with its parent unreachable.
    expect(only(['/fleet/tracker']).has('/fleet/documents/register')).toBe(false);
    expect(only([]).has('/fleet/documents/register')).toBe(false);
  });

  it('the not-linked-yet list only names pages that exist and are still unlinked', () => {
    for (const page of Object.keys(NOT_LINKED_YET)) {
      expect(fleetPages, page).toContain(page);
      expect(reachable.has(page), `${page} is linked now: drop it from NOT_LINKED_YET`).toBe(false);
    }
  });

  it('the Reports leaf opens the reports page, and the legacy report pages are these four', () => {
    const leaf = navLeaves(fleetModule).find((l) => l.label === 'Reports');
    expect(leaf?.path).toBe('/fleet/reports');
    expect(resolveUrl(routes, '/fleet/reports')).toMatchObject({ pattern: '/fleet/reports', hops: [] });
    const reports = fleetPages.filter((p) => p.startsWith('/fleet/reports/'));
    expect(reports.map((p) => p.slice('/fleet/reports/'.length)).sort()).toEqual([...LEGACY_REPORT_PATHS].sort());
  });
});
