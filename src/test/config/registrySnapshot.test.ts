/**
 * Moving routes and nav into module manifests changed nothing (BUILD-PLAN
 * B8; gap/00 F0.3 "sitemap output identical (snapshot test)").
 *
 * Both baselines were written from the router and site map as they stood
 * before the registry existed:
 *
 * - registry.routes.baseline.json: every route of <AppRoutes/>, with its
 *   full pattern, the pathless layout above it, and what its element does
 *   (page module, guard, layout, redirect target).
 * - sitemap.snapshot.baseline.json: every node of every nav tree with every
 *   field, and the placeholder and redirect lists built from them.
 *
 * A change that is meant (a new route, a moved leaf) updates the baseline in
 * the same commit: UPDATE_REGISTRY_BASELINE=1 npx vitest run <this file>.
 */
import { describe, expect, it, vi } from 'vitest';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Importing the route tree imports the guards, which import the client.
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import { appRouteObjects, describeRouteTree } from '@/test/router/routeHarness';
import { sitemapSnapshot } from './navSnapshot';
import routesBaseline from './registry.routes.baseline.json';
import sitemapBaseline from './sitemap.snapshot.baseline.json';

const HERE = join(process.cwd(), 'src/test/config');
const update = process.env.UPDATE_REGISTRY_BASELINE === '1';

describe('route set and site map are unchanged by the registry', () => {
  const routes = describeRouteTree(appRouteObjects());
  const nav = sitemapSnapshot();

  if (update) {
    writeFileSync(join(HERE, 'registry.routes.baseline.json'), `${JSON.stringify(routes, null, 2)}\n`);
    writeFileSync(join(HERE, 'sitemap.snapshot.baseline.json'), `${JSON.stringify(nav, null, 2)}\n`);
  }

  it('describes a full route tree', () => {
    expect(routes.length).toBeGreaterThan(300);
  });

  it('every route has the same pattern, layout, page, guard and redirect as before', () => {
    expect(routes).toEqual(routesBaseline);
  });

  it('every nav tree and generated list is identical', () => {
    for (const key of Object.keys(sitemapBaseline) as (keyof typeof sitemapBaseline)[]) {
      expect(nav[key], key).toEqual(sitemapBaseline[key]);
    }
    expect(Object.keys(nav).sort()).toEqual(Object.keys(sitemapBaseline).sort());
  });
});
