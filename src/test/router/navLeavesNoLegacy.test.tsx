/**
 * A workspace leaf stays in its workspace or is an explicit cross-link: no
 * live leaf of the nav tree bounces through a legacy redirect (BUILD-PLAN B7;
 * D-09). Cross-links may still point at an old URL (the HRIS Leave &
 * Rotation leaves, gap/04 implementation notes); following one lands in the
 * scope without the workspace's `?module=`, since the scopes pick their
 * sidebar from the path.
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

const access = vi.hoisted(() => ({
  value: {
    ready: true,
    signedIn: true,
    signedOut: false,
    fleetReach: false,
    lastVesselCode: 'DRA' as string | null,
    homePath: '/v/dra',
    legacy: {
      fleetReach: false,
      allVesselsMode: false,
      lastVesselCode: 'DRA' as string | null,
      vesselCodeBySlug: () => null,
      vesselCodeById: () => null,
    },
  },
}));

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
vi.mock('@/app/router/useScopeAccess', () => ({ PROFILE_GRACE_MS: 5000, useScopeAccess: () => access.value }));

import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { NAVIGATION_ITEMS, navLeaves } from '@/config/sitemap';
import { appRouteObjects, isLegacyRouteElement, resolveUrl } from './routeHarness';

const routes = appRouteObjects();
const leaves = navLeaves(NAVIGATION_ITEMS);
const hris = navLeaves(NAVIGATION_ITEMS.filter((m) => m.id === 'hris'));
const leaf = (label: string) => {
  const found = hris.find((l) => l.label === label);
  if (!found) throw new Error(`no HRIS leaf ${label}`);
  return found;
};

describe('nav leaves and legacy redirects', () => {
  it('no live own leaf opens a legacy route', () => {
    const bouncing = leaves
      .filter((l) => l.status !== 'planned' && !l.crossLink)
      .map((l) => ({ l, r: resolveUrl(routes, l.path) }))
      .filter(({ r }) => isLegacyRouteElement(r.element))
      .map(({ l, r }) => `${l.label} -> ${l.path} (legacy ${r.pattern})`);
    expect(bouncing, `leaves that bounce through a legacy redirect:\n${bouncing.join('\n')}`).toEqual([]);
  });

  it("the HRIS leaves that leave the workspace say so", () => {
    for (const label of ['Leave Planner', 'Leave Requests', 'Rotation Planner', 'Training & Development']) {
      expect(leaf(label).crossLink, label).toBe(true);
    }
    // Training & Development opens the personal training page directly.
    expect(leaf('Training & Development').path).toBe('/me/training');
    expect(isLegacyRouteElement(resolveUrl(routes, '/me/training').element)).toBe(false);
    // The Leave Calculator is still an HRIS page.
    expect(leaf('Leave Calculator').crossLink).toBeFalsy();
  });
});

describe('following an HRIS cross-link', () => {
  let seen = '';
  const Spy: React.FC = () => {
    const l = useLocation();
    seen = `${l.pathname}${l.search}${l.hash}`;
    return null;
  };

  /** Open `url` (as the HRIS sidebar links it) on its real route element. */
  function follow(url: string): string {
    const r = resolveUrl(routes, url);
    expect(isLegacyRouteElement(r.element), url).toBe(true);
    seen = '';
    render(
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path={r.pattern} element={r.element} />
          <Route path="*" element={<Spy />} />
        </Routes>
      </MemoryRouter>,
    );
    return seen;
  }

  it('Leave Planner lands in the vessel planner without ?module=hris', () => {
    expect(follow(`${leaf('Leave Planner').path}?module=hris`)).toBe('/v/dra/crew/planner/manning');
  });

  it('Leave Requests keeps any other query and the hash', () => {
    expect(follow(`${leaf('Leave Requests').path}?module=hris&status=pending#top`)).toBe('/v/dra/crew/planner/requests?status=pending#top');
  });

  it('Rotation Planner lands in the Fleet planner for a fleet user, without ?module=hris', () => {
    access.value = { ...access.value, fleetReach: true, legacy: { ...access.value.legacy, fleetReach: true } };
    try {
      expect(follow(`${leaf('Rotation Planner').path}?module=hris`)).toBe('/fleet/planner');
    } finally {
      access.value = { ...access.value, fleetReach: false, legacy: { ...access.value.legacy, fleetReach: false } };
    }
  });
});
