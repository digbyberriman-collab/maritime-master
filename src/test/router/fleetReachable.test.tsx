/**
 * Every page of the Fleet scope can be reached from the UI: from a Fleet nav
 * leaf (redirects followed), or from a link on a page that is itself
 * reachable (D-27: nobody loses a page they could open before). The risk
 * overview (the old /ism/erm page) is reached through the reports index.
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { NAVIGATION_ITEMS, navLeaves } from '@/config/sitemap';
import { legacyEntryFor } from '@/app/router/legacyResolve';
import FleetReportsIndex, { FLEET_REPORT_PATHS } from '@/modules/dashboard/pages/FleetReportsIndex';
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
  for (const rel of FLEET_REPORT_PATHS) reachable.add(resolveUrl(routes, `/fleet/reports/${rel}`).pattern);
  for (const [from, file, needle, opens] of IN_PAGE_LINKS) {
    if (!reachable.has(from) || !read(file).includes(needle)) continue;
    const entry = legacyEntryFor(opens);
    reachable.add(entry ? entry.fleetTo ?? entry.to : opens);
  }

  it('finds the Fleet pages', () => {
    expect(fleetPages.length).toBeGreaterThan(12);
    expect(fleetPages).toContain('/fleet/reports/risk-overview');
  });

  it('every Fleet page is reachable from a nav leaf or a link', () => {
    const orphans = fleetPages.filter((p) => !reachable.has(p) && !NOT_LINKED_YET[p]);
    expect(orphans, `Fleet pages nothing opens:\n${orphans.join('\n')}`).toEqual([]);
  });

  it('the not-linked-yet list only names pages that exist and are still unlinked', () => {
    for (const page of Object.keys(NOT_LINKED_YET)) {
      expect(fleetPages, page).toContain(page);
      expect(reachable.has(page), `${page} is linked now: drop it from NOT_LINKED_YET`).toBe(false);
    }
  });

  it('the Reports leaf opens the reports index, which links every report', () => {
    const leaf = navLeaves(fleetModule).find((l) => l.label === 'Reports');
    expect(leaf?.path).toBe('/fleet/reports');
    expect(resolveUrl(routes, '/fleet/reports')).toMatchObject({ pattern: '/fleet/reports', hops: [] });
    const reports = fleetPages.filter((p) => p.startsWith('/fleet/reports/'));
    expect(reports.map((p) => p.slice('/fleet/reports/'.length)).sort()).toEqual([...FLEET_REPORT_PATHS].sort());
  });

  it('the reports index renders relative links that stay in the Fleet scope', () => {
    render(
      <MemoryRouter initialEntries={['/fleet/reports']}>
        <Routes>
          <Route path="/fleet/reports" element={<FleetReportsIndex />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Fleet Reports' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Risk overview/ })).toHaveAttribute('href', '/fleet/reports/risk-overview');
    expect(screen.getByRole('link', { name: /CAPA tracker/ })).toHaveAttribute('href', '/fleet/reports/capa-tracker');
    expect(screen.getAllByRole('link')).toHaveLength(FLEET_REPORT_PATHS.length);
  });

  it('the reports index uses design tokens only', () => {
    const source = read('src/modules/dashboard/pages/FleetReportsIndex.tsx');
    expect(source).not.toMatch(/(?<![\w-])(?:bg|text|border|ring|from|to)-(?:white|black|(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3})/);
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(source).not.toMatch(/\bdark:/);
  });
});
