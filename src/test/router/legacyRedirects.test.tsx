/**
 * Legacy redirects (BUILD-PLAN B6; gap/00 B5; gap/01 legacy list; R3, R8).
 *
 * - The table is data only, and every entry is wired to the route it names.
 * - Every target resolves to a real page in the scoped trees.
 * - Every path the old sitemap claimed as `existing` still resolves, by
 *   redirect or by route, for every kind of user.
 * - The resolver's rules, one by one.
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import { LEGACY_REDIRECTS } from '@/app/router/legacyRedirects';
import {
  fillPattern,
  legacyEntryFor,
  patternParams,
  resolveLegacyTarget,
  targetKind,
  toNavPathname,
  withSearch,
  type LegacyRedirectContext,
} from '@/app/router/legacyResolve';
import {
  appRouteObjects,
  flatRoutes,
  isLazyPage,
  isLegacyRouteElement,
  isPlaceholderElement,
  isScopeNotFound,
  resolveUrl,
} from './routeHarness';
import existingBaseline from './sitemapExisting.baseline.json';

const routes = appRouteObjects();
const flat = flatRoutes(routes);

const ctx = (over: Partial<LegacyRedirectContext> = {}): LegacyRedirectContext => ({
  fleetReach: false,
  allVesselsMode: false,
  lastVesselCode: 'DRA',
  vesselCodeBySlug: (slug) => (slug === 'draak' ? 'DRA' : null),
  vesselCodeById: (id) => (id === 'v-draak' ? 'DRA' : null),
  ...over,
});

/** Sample values for any `:param` a pattern needs. */
const sampleParams = (pattern: string): Record<string, string> =>
  Object.fromEntries(patternParams(pattern).map((p) => [p, p === 'vesselCode' ? 'dra' : `sample-${p}`]));

/** The page a URL ends on, for a user described by `c`. */
function landOn(url: string, c: LegacyRedirectContext): ReturnType<typeof resolveUrl> {
  let r = resolveUrl(routes, url);
  for (let i = 0; i < 4 && isLegacyRouteElement(r.element); i += 1) {
    const el = r.element as React.ReactElement<{ from: string; children: React.ReactElement }>;
    const entry = legacyEntryFor(el.props.from);
    const match = flat.find((f) => f.pattern === el.props.from);
    expect(entry, `no table entry for ${el.props.from}`).toBeTruthy();
    expect(match).toBeTruthy();
    const params = Object.fromEntries(
      patternParams(el.props.from).map((p, idx) => [p, r.url.split('/').filter(Boolean)[el.props.from.split('/').filter(Boolean).indexOf(`:${p}`)] ?? `x${idx}`]),
    );
    const target = entry ? resolveLegacyTarget(entry, params, '', '', c) : null;
    if (!target) {
      // The old page renders in place.
      return { ...r, element: el.props.children };
    }
    r = resolveUrl(routes, target);
  }
  return r;
}

const isRealPage = (r: ReturnType<typeof resolveUrl>) =>
  r.pattern !== '*' && !isScopeNotFound(r.element) && !isPlaceholderElement(r.element) && r.element !== null;

describe('legacy redirect table', () => {
  it('is data only: plain strings and plain objects', () => {
    expect(LEGACY_REDIRECTS.length).toBeGreaterThan(40);
    for (const entry of LEGACY_REDIRECTS) {
      expect(typeof entry.from).toBe('string');
      expect(typeof entry.to).toBe('string');
      for (const value of Object.values(entry)) expect(typeof value).not.toBe('function');
      expect(JSON.parse(JSON.stringify(entry))).toEqual(entry);
    }
  });

  it('lists each old route once', () => {
    const froms = LEGACY_REDIRECTS.map((e) => e.from);
    expect(froms.filter((f, i) => froms.indexOf(f) !== i)).toEqual([]);
  });

  it('only redirects into the scopes', () => {
    for (const e of LEGACY_REDIRECTS) {
      for (const t of [e.to, e.fleetTo].filter(Boolean) as string[]) {
        expect(t, `${e.from} -> ${t}`).toMatch(/^\/(v\/:vesselCode|fleet|me)(\/|$|\?)/);
      }
    }
  });

  it('every `to` param comes from `from` (or is the vessel code)', () => {
    for (const e of LEGACY_REDIRECTS) {
      const have = new Set([...patternParams(e.from), 'vesselCode']);
      for (const t of [e.to, e.fleetTo].filter(Boolean) as string[]) {
        expect(patternParams(t).filter((p) => !have.has(p)), `${e.from} -> ${t}`).toEqual([]);
      }
    }
  });

  it('every entry is wired: its `from` route renders LegacyRoute with that `from`', () => {
    const unwired = LEGACY_REDIRECTS.filter((e) => {
      const route = flat.find((f) => f.pattern === e.from);
      const el = route?.route.element as React.ReactElement | undefined;
      return !(isLegacyRouteElement(el) && el.props.from === e.from);
    }).map((e) => e.from);
    expect(unwired).toEqual([]);
  });

  it('every LegacyRoute in the router has a table entry', () => {
    const orphans = flat
      .filter((f) => isLegacyRouteElement(f.route.element as React.ReactElement))
      .filter((f) => !legacyEntryFor((f.route.element as React.ReactElement<{ from: string }>).props.from))
      .map((f) => f.pattern);
    expect(orphans).toEqual([]);
  });

  it('every target resolves to a real page in its scope', () => {
    const broken: string[] = [];
    for (const e of LEGACY_REDIRECTS) {
      for (const t of [e.to, e.fleetTo].filter(Boolean) as string[]) {
        const url = fillPattern(t.split('?')[0], sampleParams(t)) ?? '';
        const r = resolveUrl(routes, url);
        if (!isRealPage(r)) broken.push(`${e.from} -> ${url} (${r.pattern || 'nothing'})`);
      }
    }
    expect(broken, `targets with no page:\n${broken.join('\n')}`).toEqual([]);
  });

  it('every old route keeps its page behind the redirect', () => {
    const missing = LEGACY_REDIRECTS.filter((e) => {
      const el = flat.find((f) => f.pattern === e.from)?.route.element as React.ReactElement<{ children: React.ReactElement }> | undefined;
      return !el?.props.children;
    }).map((e) => e.from);
    expect(missing).toEqual([]);
  });
});

describe('old sitemap paths still resolve', () => {
  const users: Record<string, LegacyRedirectContext> = {
    'vessel user': ctx(),
    'fleet user on a vessel': ctx({ fleetReach: true }),
    'fleet user, all vessels': ctx({ fleetReach: true, allVesselsMode: true, lastVesselCode: null }),
    'user with no vessel': ctx({ lastVesselCode: null }),
  };

  it.each(Object.keys(users))('for a %s, every old `existing` path opens a page', (who) => {
    const broken: string[] = [];
    for (const url of existingBaseline as string[]) {
      const r = landOn(url, users[who]);
      if (!isRealPage(r)) broken.push(`${url} -> ${r.pattern || 'nothing'}`);
    }
    expect(broken, `old paths that no longer open a page:\n${broken.join('\n')}`).toEqual([]);
  });

  it('the old vessel pages land in the vessel scope for a vessel user', () => {
    const r = landOn('/crew/list', ctx());
    expect(r.pattern).toBe('/v/:vesselCode/crew/list');
    expect(r.url).toBe('/v/dra/crew/list');
    expect(isLazyPage(r.element)).toBe(true);
  });

  it('the old fleet pages land in the fleet scope for a fleet user, and stay put otherwise', () => {
    expect(landOn('/documents', ctx({ fleetReach: true })).pattern).toBe('/fleet/documents');
    expect(landOn('/documents', ctx()).pattern).toBe('/documents');
  });

  it('/dpa-dashboard opens the fleet dashboard for fleet reach, and keeps its page for anyone else (D-27)', () => {
    const fleet = landOn('/dpa-dashboard', ctx({ fleetReach: true }));
    expect(fleet.pattern).toBe('/fleet/dashboard');
    expect(isRealPage(fleet)).toBe(true);
    expect(landOn('/dpa-dashboard', ctx({ fleetReach: true, allVesselsMode: true, lastVesselCode: null })).pattern).toBe('/fleet/dashboard');
    const other = landOn('/dpa-dashboard', ctx());
    expect(other.pattern).toBe('/dpa-dashboard');
    expect(isLazyPage(other.element)).toBe(true);
    const entry = legacyEntryFor('/dpa-dashboard');
    if (!entry) throw new Error('no entry for /dpa-dashboard');
    expect(resolveLegacyTarget(entry, {}, '?x=1', '#k', ctx({ fleetReach: true }))).toBe('/fleet/dashboard?x=1#k');
    expect(resolveLegacyTarget(entry, {}, '', '', ctx())).toBeNull();
  });

  it('/crew/work-rest goes to /me/hours-of-rest (R8)', () => {
    expect(landOn('/crew/work-rest', ctx()).pattern).toBe('/me/hours-of-rest');
    expect(landOn('/crew/hours-of-rest', ctx()).pattern).toBe('/me/hours-of-rest');
  });

  it('/admin/feedback stays until the support page exists (R3)', () => {
    expect(LEGACY_REDIRECTS.some((e) => e.from === '/admin/feedback')).toBe(false);
    // Support is a planned Fleet leaf (B7): its URL opens Coming Soon, not a page.
    const support = resolveUrl(routes, '/fleet/admin/support');
    expect(support.pattern).toBe('/fleet/admin/support');
    expect(isPlaceholderElement(support.element)).toBe(true);
    expect(isLazyPage(resolveUrl(routes, '/admin/feedback').element)).toBe(true);
  });
});

describe('resolveLegacyTarget', () => {
  const entry = (from: string) => {
    const e = legacyEntryFor(from);
    if (!e) throw new Error(`no entry for ${from}`);
    return e;
  };

  it('scopes a vessel page to the last vessel, lower-case, keeping query and hash', () => {
    expect(resolveLegacyTarget(entry('/crew/list'), {}, '?module=vessel', '#top', ctx())).toBe('/v/dra/crew/list?module=vessel#top');
  });

  it('fills params from the old URL', () => {
    expect(resolveLegacyTarget(entry('/crew/work-rest/:crewId'), { crewId: 'p1' }, '', '', ctx())).toBe(
      '/v/dra/crew/people/p1/hours-of-rest',
    );
  });

  it('adds the query a target carries, without dropping the incoming one', () => {
    expect(resolveLegacyTarget(entry('/crew/certificates'), {}, '?module=vessel', '', ctx())).toBe(
      '/v/dra/crew/compliance/status?view=documents&module=vessel',
    );
  });

  it('keeps the old page when there is no vessel, or a fleet user is in All vessels mode', () => {
    expect(resolveLegacyTarget(entry('/crew/list'), {}, '', '', ctx({ lastVesselCode: null }))).toBeNull();
    expect(resolveLegacyTarget(entry('/crew/list'), {}, '', '', ctx({ fleetReach: true, allVesselsMode: true }))).toBeNull();
  });

  it('takes the vessel from a slug or an id in the old URL', () => {
    expect(resolveLegacyTarget(entry('/vessel/:vesselSlug'), { vesselSlug: 'draak' }, '', '', ctx({ lastVesselCode: 'HYD' }))).toBe('/v/dra');
    expect(resolveLegacyTarget(entry('/vessel/:vesselSlug'), { vesselSlug: 'nope' }, '', '', ctx())).toBeNull();
    expect(resolveLegacyTarget(entry('/vessels/:vesselId/emergency'), { vesselId: 'v-draak' }, '', '', ctx())).toBe('/v/dra/vessel/emergency');
    expect(resolveLegacyTarget(entry('/vessels/:vesselId/emergency'), { vesselId: 'other' }, '', '', ctx())).toBeNull();
  });

  it('sends fleet pages only to users with fleet reach', () => {
    expect(resolveLegacyTarget(entry('/documents'), {}, '', '', ctx())).toBeNull();
    expect(resolveLegacyTarget(entry('/documents'), {}, '', '', ctx({ fleetReach: true }))).toBe('/fleet/documents');
    expect(resolveLegacyTarget(entry('/users-access/:userId'), { userId: 'u1' }, '', '', ctx({ fleetReach: true }))).toBe(
      '/fleet/admin/users/people/u1',
    );
  });

  it('prefers the fleet counterpart for fleet users', () => {
    expect(resolveLegacyTarget(entry('/crew/rotation-planner'), {}, '', '', ctx({ fleetReach: true }))).toBe('/fleet/planner');
    expect(resolveLegacyTarget(entry('/crew/rotation-planner'), {}, '', '', ctx())).toBe('/v/dra/crew/planner/timeline');
  });

  it('always sends personal pages to /me', () => {
    expect(resolveLegacyTarget(entry('/settings'), {}, '', '', ctx({ lastVesselCode: null }))).toBe('/me');
    expect(resolveLegacyTarget(entry('/notifications'), {}, '', '', ctx({ lastVesselCode: null }))).toBe('/me/notifications');
  });
});

describe('helpers', () => {
  it('targetKind', () => {
    expect(targetKind('/v/:vesselCode/crew/list')).toBe('vessel');
    expect(targetKind('/fleet/documents')).toBe('fleet');
    expect(targetKind('/me/hours-of-rest')).toBe('personal');
  });

  it('fillPattern refuses to leave a param unfilled', () => {
    expect(fillPattern('/a/:id', { id: 'x y' })).toBe('/a/x%20y');
    expect(fillPattern('/a/:id', {})).toBeNull();
  });

  it('withSearch merges queries and keeps the hash', () => {
    expect(withSearch('/a?x=1', '?x=2&y=3', '#h')).toBe('/a?x=1&y=3#h');
    expect(withSearch('/a', '', '')).toBe('/a');
  });

  // B7: the nav tree links to the scoped URLs themselves, so a scoped URL
  // maps to the tree's pattern path instead of back to its old URL.
  it('toNavPathname maps a vessel URL onto the nav tree\'s :vesselCode pattern', () => {
    expect(toNavPathname('/v/dra/crew/list')).toBe('/v/:vesselCode/crew/list');
    expect(toNavPathname('/v/HYD/logbooks/review')).toBe('/v/:vesselCode/logbooks/review');
    expect(toNavPathname('/v/dra/crew/people/p1/hours-of-rest')).toBe('/v/:vesselCode/crew/people/p1/hours-of-rest');
    expect(toNavPathname('/v/dra')).toBe('/v/:vesselCode');
    expect(toNavPathname('/v/dra/')).toBe('/v/:vesselCode');
    expect(toNavPathname('/v/:vesselCode/crew/list')).toBe('/v/:vesselCode/crew/list');
  });

  it('toNavPathname leaves fleet, personal, workspace and legacy paths alone', () => {
    expect(toNavPathname('/fleet/documents')).toBe('/fleet/documents');
    expect(toNavPathname('/fleet/admin/users/crew')).toBe('/fleet/admin/users/crew');
    expect(toNavPathname('/me')).toBe('/me');
    expect(toNavPathname('/me/hours-of-rest')).toBe('/me/hours-of-rest');
    expect(toNavPathname('/crew/list')).toBe('/crew/list');
    expect(toNavPathname('/hris/compensation/payroll')).toBe('/hris/compensation/payroll');
    expect(toNavPathname('/vessel/logbooks/review')).toBe('/vessel/logbooks/review');
  });
});
