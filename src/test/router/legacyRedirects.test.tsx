/**
 * Legacy redirects (BUILD-PLAN B6; gap/00 B5; gap/01 legacy list; R3, R8).
 *
 * - The table is data only, and every entry is wired to the route it names.
 * - Every target of an entry that applies resolves to a real page in the
 *   scoped trees.
 * - An entry armed with a `pendingTarget` (platform-prep PP3) applies only
 *   once a module page serves that target; until then the old page renders
 *   for everyone, and with a fixture registry serving it, it applies.
 * - Every path the old sitemap claimed as `existing` still resolves, by
 *   redirect or by route, for every kind of user.
 * - The resolver's rules, one by one.
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import { matchPath } from 'react-router-dom';
import { buildRegistry } from '@/app/registry/registry';
import type { ModuleManifest } from '@/app/registry/types';
import { LEGACY_REDIRECTS, type LegacyRedirectEntry } from '@/app/router/legacyRedirects';
import {
  fillPattern,
  legacyEntryApplies,
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

/** Entries armed with a pending target, and those of them no module page serves yet. */
const ARMED = LEGACY_REDIRECTS.filter((e) => e.pendingTarget);
const WAITING = ARMED.filter((e) => !legacyEntryApplies(e));

/** The armed entries PP3 added: [from, to, fleetTo, pendingTarget]. */
const ARMED_ENTRIES: readonly [string, string, string | undefined, string][] = [
  ['/acknowledgments', '/v/:vesselCode/safety/fleet-documents', '/fleet/documents?tab=acknowledgements', '/v/:vesselCode/safety/fleet-documents'],
  ['/crew/acknowledgements', '/v/:vesselCode/safety/fleet-documents', undefined, '/v/:vesselCode/safety/fleet-documents'],
  ['/development/admin', '/fleet/training/overview', undefined, '/fleet/training/:tab'],
  ['/development/catalogue', '/fleet/training/catalogue', undefined, '/fleet/training/:tab'],
  ['/development/applications', '/fleet/training/applications', undefined, '/fleet/training/:tab'],
  ['/development/courses-register', '/fleet/training/applications', undefined, '/fleet/training/:tab'],
  ['/ism/forms/templates', '/fleet/forms', undefined, '/fleet/forms'],
];

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

  it('every target of an entry that applies resolves to a real page in its scope', () => {
    const broken: string[] = [];
    for (const e of LEGACY_REDIRECTS) {
      if (!legacyEntryApplies(e)) continue;
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
    // The controlled register, the documents module's page (PP3).
    const fleet = landOn('/documents', ctx({ fleetReach: true }));
    expect(fleet.pattern).toBe('/fleet/documents/register');
    expect(isLazyPage(fleet.element)).toBe(true);
    expect(landOn('/documents', ctx()).pattern).toBe('/documents');
  });

  it('/crew and /crew/roster open the one crew list (gap/04)', () => {
    for (const from of ['/crew', '/crew/roster']) {
      const r = landOn(from, ctx());
      expect(r.pattern, from).toBe('/v/:vesselCode/crew/list');
      expect(r.url, from).toBe('/v/dra/crew/list');
      expect(isLazyPage(r.element), from).toBe(true);
      // Without a vessel the old roster renders where it is (D-27).
      expect(landOn(from, ctx({ lastVesselCode: null })).pattern, from).toBe(from);
    }
  });

  it('the old documents sample-data pages open the fleet register on their category (gap/00 K1)', () => {
    for (const name of ['manuals', 'policies', 'procedures']) {
      const r = resolveUrl(routes, `/documents/${name}`);
      expect(r.hops, name).toEqual([`/documents/${name}`]);
      expect(r.pattern, name).toBe('/fleet/documents/register');
      expect(isLazyPage(r.element), name).toBe(true);
      const redirect = flat.find((f) => f.pattern === `/documents/${name}`)?.route.element as React.ReactElement<{ to: string }>;
      expect(redirect.props.to, name).toBe(`/fleet/documents/register?category=${name}`);
    }
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
    expect(resolveLegacyTarget(entry('/documents'), {}, '', '', ctx({ fleetReach: true }))).toBe('/fleet/documents/register');
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

describe('pending targets (armed redirects)', () => {
  const page = () => Promise.resolve({ default: () => null });
  /** A fixture registry that serves every pending target as a page. */
  const serving = buildRegistry([
    {
      id: 'pending-fixture',
      label: 'Pending targets (fixture)',
      scopes: ['fleet', 'vessel'],
      routes: [
        { scope: 'fleet', path: 'training/:tab', page, guard: { kind: 'login' } },
        { scope: 'fleet', path: 'forms', page, guard: { kind: 'login' } },
        { scope: 'vessel', path: 'safety/fleet-documents', page, guard: { kind: 'login' } },
      ],
    } satisfies ModuleManifest,
  ]);
  const users: Record<string, LegacyRedirectContext> = {
    'vessel user': ctx(),
    'fleet user on a vessel': ctx({ fleetReach: true }),
    'fleet user, all vessels': ctx({ fleetReach: true, allVesselsMode: true, lastVesselCode: null }),
    'user with no vessel': ctx({ lastVesselCode: null }),
  };

  it('arms exactly the entries the handover names, each with its target', () => {
    expect(serving.problems).toEqual([]);
    const byFrom = (a: readonly unknown[], b: readonly unknown[]) => String(a[0]).localeCompare(String(b[0]));
    expect(ARMED.map((e) => [e.from, e.to, e.fleetTo, e.pendingTarget]).sort(byFrom)).toEqual([...ARMED_ENTRIES].sort(byFrom));
  });

  it('each pending target is a full route pattern its `to` opens', () => {
    for (const e of ARMED) {
      const target = e.pendingTarget as string;
      expect(target, e.from).toMatch(/^\/(v\/:vesselCode|fleet|me)(\/|$)/);
      expect(matchPath({ path: target, end: true }, e.to.split('?')[0]), `${e.from}: ${e.to} is not ${target}`).not.toBeNull();
    }
  });

  it('is wired like any entry: the old route renders LegacyRoute around its page', () => {
    for (const e of ARMED) {
      const el = flat.find((f) => f.pattern === e.from)?.route.element as React.ReactElement<{ from: string; children: React.ReactElement }>;
      expect(isLegacyRouteElement(el), e.from).toBe(true);
      expect(el.props.from, e.from).toBe(e.from);
      expect(isLazyPage(el.props.children), e.from).toBe(true);
    }
  });

  it.each(Object.keys(users))('until a module serves the target, the old page renders for a %s', (who) => {
    for (const e of WAITING) {
      const r = landOn(e.from, users[who]);
      expect(r.pattern, e.from).toBe(e.from);
      expect(isLazyPage(r.element), e.from).toBe(true);
      expect(resolveLegacyTarget(e, sampleParams(e.from), '', '', users[who]), e.from).toBeNull();
    }
  });

  it('once a module serves the target, the entry applies as any other', () => {
    const resolve = (from: string, c: LegacyRedirectContext) => {
      const e = legacyEntryFor(from) as LegacyRedirectEntry;
      expect(legacyEntryApplies(e, serving.hasPage), from).toBe(true);
      return resolveLegacyTarget(e, {}, '?x=1', '', c, serving.hasPage);
    };
    const vessel = ctx();
    const fleet = ctx({ fleetReach: true });
    expect(resolve('/acknowledgments', vessel)).toBe('/v/dra/safety/fleet-documents?x=1');
    expect(resolve('/acknowledgments', fleet)).toBe('/fleet/documents?tab=acknowledgements&x=1');
    expect(resolve('/crew/acknowledgements', vessel)).toBe('/v/dra/safety/fleet-documents?x=1');
    expect(resolve('/crew/acknowledgements', ctx({ lastVesselCode: null }))).toBeNull();
    expect(resolve('/development/admin', fleet)).toBe('/fleet/training/overview?x=1');
    expect(resolve('/development/catalogue', fleet)).toBe('/fleet/training/catalogue?x=1');
    expect(resolve('/development/applications', fleet)).toBe('/fleet/training/applications?x=1');
    expect(resolve('/development/courses-register', fleet)).toBe('/fleet/training/applications?x=1');
    // A fleet target still needs fleet reach (D-27).
    expect(resolve('/development/admin', vessel)).toBeNull();
    expect(resolve('/ism/forms/templates', fleet)).toBe('/fleet/forms?x=1');
    expect(resolve('/ism/forms/templates', vessel)).toBeNull();
  });

  it('a redirect, or a page on another path, does not serve a pending target', () => {
    const e = legacyEntryFor('/development/admin') as LegacyRedirectEntry;
    const near = buildRegistry([
      {
        id: 'near-fixture',
        label: 'Near misses (fixture)',
        scopes: ['fleet'],
        routes: [
          { scope: 'fleet', path: 'training/:tab', redirectTo: '/fleet/training' },
          { scope: 'fleet', path: 'training/overview/more', page, guard: { kind: 'login' } },
        ],
      } satisfies ModuleManifest,
    ]);
    expect(near.problems).toEqual([]);
    expect(legacyEntryApplies(e, near.hasPage)).toBe(false);
    expect(resolveLegacyTarget(e, {}, '', '', ctx({ fleetReach: true }), near.hasPage)).toBeNull();
  });

  it('an entry with no pending target always applies', () => {
    const e = legacyEntryFor('/documents') as LegacyRedirectEntry;
    expect(legacyEntryApplies(e, () => false)).toBe(true);
    expect(resolveLegacyTarget(e, {}, '', '', ctx({ fleetReach: true }), () => false)).toBe('/fleet/documents/register');
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
