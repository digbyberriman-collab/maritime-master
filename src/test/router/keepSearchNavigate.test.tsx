/**
 * The router's own redirects keep the query string and hash (the rule in the
 * header of src/app/router/legacyRedirects.ts, applied by
 * KeepSearchNavigate). The real redirect elements are taken from the route
 * tree and mounted under their parent path, with a spy as the catch-all.
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import { MemoryRouter, Route, Routes, useLocation, type RouteObject } from 'react-router-dom';
import KeepSearchNavigate from '@/app/router/KeepSearchNavigate';
import { RETIRED_NAV_REDIRECTS } from '@/app/router/retiredNavPaths';
import { SECTION_REDIRECTS, VESSEL_ROOT_REDIRECTS } from '@/config/sitemap';
import { appRouteObjects } from './routeHarness';

const routes = appRouteObjects();

/** The element of the route with this full pattern. */
function elementAt(items: RouteObject[], pattern: string, base = ''): React.ReactElement | null {
  for (const r of items) {
    const full = r.index ? base || '/' : r.path ? (r.path.startsWith('/') ? r.path : `${base.replace(/\/$/, '')}/${r.path}`) : base;
    if ((r.path || r.index) && full === pattern && r.element) return r.element as React.ReactElement;
    if (r.children) {
      const found = elementAt(r.children, pattern, full);
      if (found) return found;
    }
  }
  return null;
}

let seen = '';
const Spy: React.FC = () => {
  const l = useLocation();
  seen = `${l.pathname}${l.search}${l.hash}`;
  return null;
};

/** Open `url` on the redirect declared at `pattern` (`child` under `parent`) and report where it lands. */
function land(url: string, pattern: string, parent: string | null, child: string, index = false): string {
  const element = index ? routes.flatMap((r) => (r.path === parent ? r.children ?? [] : [])).find((r) => r.index)?.element : elementAt(routes, pattern);
  expect((element as React.ReactElement | undefined)?.type, `no KeepSearchNavigate at ${pattern}`).toBe(KeepSearchNavigate);
  seen = '';
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        {parent ? (
          <Route path={parent}>
            {index ? <Route index element={element} /> : <Route path={child} element={element} />}
            <Route path="*" element={<Spy />} />
          </Route>
        ) : (
          <>
            <Route path={child} element={element} />
            <Route path="*" element={<Spy />} />
          </>
        )}
      </Routes>
    </MemoryRouter>,
  );
  return seen;
}

describe('KeepSearchNavigate in the route tree', () => {
  it('a scoped sub-root redirect keeps the query and hash (relative target)', () => {
    expect(land('/v/dra/crew/compliance?a=1#h', '/v/:vesselCode/crew/compliance', '/v/:vesselCode', 'crew/compliance')).toBe(
      '/v/dra/crew/compliance/status?a=1#h',
    );
    expect(land('/v/dra/crew/planner?week=2026-W48#x', '/v/:vesselCode/crew/planner', '/v/:vesselCode', 'crew/planner')).toBe(
      '/v/dra/crew/planner/timeline?week=2026-W48#x',
    );
  });

  it('the Fleet index and admin redirects keep the query and hash', () => {
    expect(land('/fleet?a=1#h', '/fleet', '/fleet', '', true)).toBe('/fleet/dashboard?a=1#h');
    expect(land('/fleet/admin?a=1#h', '/fleet/admin', '/fleet', 'admin')).toBe('/fleet/admin/users/crew?a=1#h');
    expect(land('/fleet/admin/users?a=1#h', '/fleet/admin/users', '/fleet', 'admin/users')).toBe('/fleet/admin/users/crew?a=1#h');
  });

  it('a vessel module-root redirect (VESSEL_ROOT_REDIRECTS) keeps the query and hash', () => {
    // The crew root is a page (the crew dashboard, X1-10B), so Safety is the example here.
    expect(VESSEL_ROOT_REDIRECTS.find((r) => r.from === 'safety')?.to).toBe('drills');
    expect(land('/v/dra/safety?a=1#h', '/v/:vesselCode/safety', '/v/:vesselCode', 'safety')).toBe('/v/dra/safety/drills?a=1#h');
  });

  it('a retired Coming Soon redirect (RETIRED_NAV_REDIRECTS) keeps the query and hash', () => {
    expect(RETIRED_NAV_REDIRECTS.find((r) => r.from === '/vessel/safety/*')?.to).toBe('/v/:vesselCode/safety');
    expect(land('/vessel/safety/sms-summary?a=1#h', '/vessel/safety/*', null, '/vessel/safety/*')).toBe('/v/:vesselCode/safety?a=1#h');
    expect(land('/fleet/fleet-scheduler?a=1#h', '/fleet/fleet-scheduler', null, '/fleet/fleet-scheduler')).toBe('/fleet/planner?a=1#h');
  });

  it("a section redirect keeps the query and hash, and its own ?module= wins", () => {
    const hris = SECTION_REDIRECTS.find((r) => r.from === '/hris/recruitment');
    expect(hris?.to).toBe('/hris/recruitment/vacancies?module=hris');
    expect(land('/hris/recruitment?module=fleet&a=1#h', '/hris/recruitment', null, '/hris/recruitment')).toBe(
      '/hris/recruitment/vacancies?module=hris&a=1#h',
    );
  });

  it('a workspace manifest redirect keeps the query (the sidebar\'s ?module=)', () => {
    expect(land('/yard/refit/approvals?module=yard', '/yard/refit/approvals', null, '/yard/refit/approvals')).toBe(
      '/yard/refit/overview/approvals?module=yard',
    );
  });
});

describe('KeepSearchNavigate', () => {
  const mount = (url: string, to: string, at = '/from') => {
    seen = '';
    render(
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path={at} element={<KeepSearchNavigate to={to} />} />
          <Route path="*" element={<Spy />} />
        </Routes>
      </MemoryRouter>,
    );
    return seen;
  };

  it('keeps a relative target relative to the route', () => {
    expect(mount('/from?a=1', 'next')).toBe('/from/next?a=1');
  });

  it("lets the target's own query win and adds the rest", () => {
    expect(mount('/from?module=x&a=1#h', '/to?module=y')).toBe('/to?module=y&a=1#h');
  });

  it('is a plain redirect without a query or hash', () => {
    expect(mount('/from', '/to')).toBe('/to');
  });

  it('passes the navigation state on', () => {
    let state: unknown = null;
    const StateSpy: React.FC = () => {
      state = useLocation().state;
      return null;
    };
    render(
      <MemoryRouter initialEntries={[{ pathname: '/from', state: { from: 'x' } }]}>
        <Routes>
          <Route path="/from" element={<KeepSearchNavigate to="/to" />} />
          <Route path="/to" element={<StateSpy />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(state).toEqual({ from: 'x' });
  });
});
