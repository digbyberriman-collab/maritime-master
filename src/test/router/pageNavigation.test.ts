/**
 * Breadcrumbs and page titles on scoped URLs (gap/10 IA): the resolver
 * (src/shared/lib/pageNavigation.ts) as the shell calls it, with the vessel
 * code already swapped for the `/v/:vesselCode` pattern (toNavPathname).
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import { resolvePageNavigation } from '@/shared/lib/pageNavigation';
import { toNavPathname } from '@/app/router/legacyResolve';

const UUID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

/** Crumbs as `A > B > C` and the title, as the shell would get them. */
function nav(url: string, moduleId: string | null = null) {
  const [path, query = ''] = url.split('?');
  const page = resolvePageNavigation(toNavPathname(path), query ? `?${query}` : '', moduleId);
  return { crumbs: page.crumbs.map((c) => c.label).join(' > '), title: page.title, links: page.crumbs.map((c) => c.path ?? null) };
}

describe('scoped breadcrumbs', () => {
  it.each([null, 'vessel'])("a crew member's hours of rest sit under Crew › Hours of Rest, not Home (module %s)", (moduleId) => {
    for (const id of [UUID, '123']) {
      const page = nav(`/v/dra/crew/people/${id}/hours-of-rest`, moduleId);
      expect(page.crumbs).toBe('Vessel > Crew > Hours of Rest > Crew member hours');
      expect(page.title).toBe('Crew member hours');
      expect(page.links).toEqual(['/v/:vesselCode', '/v/:vesselCode/crew', '/v/:vesselCode/crew/hours-of-rest', null]);
    }
  });

  it('the vessel Hours of Rest board is unchanged', () => {
    expect(nav('/v/dra/crew/hours-of-rest')).toMatchObject({ crumbs: 'Vessel > Crew > Hours of Rest', title: 'Hours of Rest' });
  });

  it('the vessel home still matches exactly', () => {
    expect(nav('/v/dra', 'vessel')).toMatchObject({ crumbs: 'Vessel > Home', title: 'Home' });
  });

  it('an unrouted vessel page no longer lands under Home', () => {
    expect(nav('/v/dra/nonexistent/thing', 'vessel').crumbs).not.toContain('Home');
  });

  it('Users & Access tabs have their names', () => {
    expect(nav('/fleet/admin/users/crew')).toMatchObject({
      crumbs: 'Fleet > Administration > Users & Access > Vessel Crew',
      title: 'Vessel Crew',
    });
    expect(nav('/fleet/admin/users/sets')).toMatchObject({
      crumbs: 'Fleet > Administration > Users & Access > Access Sets',
      title: 'Access Sets',
    });
    expect(nav(`/fleet/admin/users/people/${UUID}`).title).toBe('Users & Access Details');
  });

  it('Crew Compliance and Planner tabs have their names', () => {
    expect(nav('/v/dra/crew/compliance/status')).toMatchObject({
      crumbs: 'Vessel > Crew > Crew Compliance > Compliance Status',
      title: 'Compliance Status',
    });
    expect(nav('/v/dra/crew/compliance/status?view=documents').title).toBe('Compliance Status');
    expect(nav('/v/dra/crew/planner/timeline')).toMatchObject({ crumbs: 'Vessel > Crew > Planner > Rotation Timeline', title: 'Rotation Timeline' });
    expect(nav('/v/dra/crew/planner/manning').title).toBe('Manning');
    expect(nav('/v/dra/crew/planner/requests').title).toBe('Leave Requests');
  });

  it('Fleet reports: the index and CAPA Tracker have their names', () => {
    expect(nav('/fleet/reports')).toMatchObject({ crumbs: 'Fleet > Overview > Fleet Reports', title: 'Fleet Reports' });
    expect(nav('/fleet/reports/capa-tracker')).toMatchObject({
      crumbs: 'Fleet > Overview > Reports > CAPA Tracker',
      title: 'CAPA Tracker',
    });
    expect(nav('/fleet/reports/capa-tracker').links[2]).toBe('/fleet/reports');
    expect(nav('/fleet/reports/incident-analytics').title).toBe('Incident Analytics');
  });

  it('pages with a leaf of their own are unchanged', () => {
    expect(nav('/v/dra/crew/list')).toMatchObject({ crumbs: 'Vessel > Crew > Crew List', title: 'Crew List' });
    expect(nav('/fleet/dashboard')).toMatchObject({ crumbs: 'Fleet > Overview > Dashboard', title: 'Dashboard' });
    expect(nav('/v/dra/logbooks/deck').title).toBe('Deck & Bridge Logbook');
  });

  it('a malformed escape in the URL does not throw', () => {
    expect(() => nav('/hris/%zz')).not.toThrow();
    expect(() => nav('/v/%E0%A4%A/crew/list')).not.toThrow();
  });
});
