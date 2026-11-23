/**
 * The target nav tree (BUILD-PLAN B7; gap/10 "Target information
 * architecture", IA7; DECISIONS R1, R3, R4, G1, G5, D-09, D-17).
 *
 * Shape only. src/test/router/navStatus.test.tsx checks the same trees
 * against the real router (live leaves open pages, planned ones open their
 * placeholder).
 */
import { describe, expect, it } from 'vitest';
import {
  FLEET_PLACEHOLDER_LEAVES,
  NAVIGATION_ITEMS,
  VESSEL_MODULES,
  VESSEL_PLACEHOLDER_LEAVES,
  VESSEL_ROOT_REDIRECTS,
  buildVesselNav,
  navLeaves,
  vesselModuleForPath,
  vesselModuleNav,
} from '@/config/sitemap';
import type { NavChild, NavItem } from '@/config/navigation-types';
import { VESSEL_SCOPE_PATTERN } from '@/modules/vessels/lib/vesselCode';
import workspaceBaseline from './workspaceNav.baseline.json';

const module = (id: string) => NAVIGATION_ITEMS.find((m) => m.id === id) as NavItem;
const fleet = module('fleet');
const fleetSections = fleet.children ?? [];
const sectionNamed = (label: string) => fleetSections.find((s) => s.label === label) as NavChild;

const walk = (items: NavChild[], visit: (n: NavChild) => void) => {
  for (const it of items) {
    visit(it);
    if (it.children) walk(it.children, visit);
  }
};

describe('Fleet tree (gap/10 IA7, R1)', () => {
  it('is six section headings, in the order gap/10 gives', () => {
    expect(fleetSections.map((s) => [s.label, s.kind])).toEqual([
      ['Overview', 'section'],
      ['Compliance', 'section'],
      ['People', 'section'],
      ['Workspaces', 'section'],
      ['Administration', 'section'],
      ['Configuration', 'section'],
    ]);
  });

  it('lists the gap/10 leaves under each heading', () => {
    const labels = (section: string) => (sectionNamed(section).children ?? []).map((c) => c.label);
    expect(labels('Overview')).toEqual(['Dashboard', 'Tracker', 'Reports', 'Calendar', 'Planner', 'Safety queue']);
    expect(labels('Compliance')).toEqual(['Documents', 'Forms & Checklists']);
    expect(labels('People')).toEqual(['Training', 'Medical', 'Visits', 'Employment']);
    expect(labels('Workspaces')).toEqual(['HRIS', 'Health & Wellness', 'Yard', 'Legal', 'Shoreside']);
    expect(labels('Administration')).toEqual([
      'Users & Access', 'Notifications', 'Support', 'Company FAQs', 'Data protection', 'Account', 'Security',
    ]);
    expect(labels('Configuration')).toEqual([
      'Vessels', 'Vessel Settings', 'Fleet Groups', 'Add-ons', 'Certificate catalogue', 'Job library', 'Suppliers', 'Integrations',
    ]);
  });

  it('keeps every list to eight entries or fewer', () => {
    for (const s of fleetSections) expect(s.children?.length ?? 0, s.label).toBeLessThanOrEqual(8);
  });

  it('puts every fleet page under /fleet/, and nothing else outside Workspaces', () => {
    const stray: string[] = [];
    for (const s of fleetSections.filter((x) => x.label !== 'Workspaces')) {
      for (const leaf of navLeaves([s])) {
        if (!leaf.path.startsWith('/fleet/')) stray.push(`${leaf.label} -> ${leaf.path}`);
        if (leaf.scope !== 'fleet') stray.push(`${leaf.label} scope ${leaf.scope}`);
      }
    }
    expect(stray).toEqual([]);
  });

  it('has no Feedback inbox leaf (R3)', () => {
    const all: string[] = [];
    walk(fleetSections, (n) => all.push(`${n.label} ${n.path}`));
    expect(all.filter((x) => /feedback/i.test(x))).toEqual([]);
  });

  it('links the workspaces as cross-links in their own scope (D-09), Legal at /departments/legal (R4)', () => {
    const ws = sectionNamed('Workspaces');
    expect(ws.scope).toBe('workspace');
    const leaves = ws.children ?? [];
    expect(leaves.every((l) => l.crossLink && l.scope === 'workspace')).toBe(true);
    expect(Object.fromEntries(leaves.map((l) => [l.label, l.path]))).toEqual({
      HRIS: '/hris',
      'Health & Wellness': '/health',
      Yard: '/yard',
      Legal: '/departments/legal',
      Shoreside: '/shoreside',
    });
  });

  it('gives Shoreside one landing leaf, planned until the service cards are built (D-17)', () => {
    const shoreside = sectionNamed('Workspaces').children?.find((l) => l.label === 'Shoreside');
    expect(shoreside?.status).toBe('planned');
  });

  it('marks as live exactly the leaves whose page the Fleet scope mounts', () => {
    const live = navLeaves(fleetSections).filter((l) => !l.crossLink && l.status === 'live').map((l) => l.path);
    expect(live).toEqual([
      '/fleet/dashboard', '/fleet/tracker', '/fleet/reports', '/fleet/calendar', '/fleet/planner',
      '/fleet/documents', '/fleet/training',
      '/fleet/admin/users', '/fleet/admin/notifications', '/fleet/admin/vessels',
    ]);
  });

  it('gates the administration leaves on PMS keys the catalogue has', () => {
    const caps = Object.fromEntries(
      navLeaves([sectionNamed('Administration'), sectionNamed('Configuration')])
        .filter((l) => l.capability)
        .map((l) => [l.label, l.capability]),
    );
    expect(caps).toEqual({
      'Users & Access': 'admin.access.users_access.view',
      Notifications: 'fleet.administration.notification_management.view',
      Support: 'fleet.administration.support_tickets.view',
      Account: 'fleet.administration.account.view',
      Vessels: 'fleet.operations.vessels.view',
      'Fleet Groups': 'admin.system.fleet_groups.view',
      Integrations: 'admin.system.api_integrations.view',
    });
  });

  it('section headings share the Fleet root as their path (no made-up URLs)', () => {
    for (const s of fleetSections) expect(s.path, s.label).toBe('/fleet');
  });

  it('every planned fleet page has a placeholder inside the scope', () => {
    const planned = navLeaves(fleetSections).filter((l) => l.status === 'planned' && !l.crossLink).map((l) => l.path);
    expect(FLEET_PLACEHOLDER_LEAVES.map((p) => `/fleet/${p.path}`).sort()).toEqual([...planned].sort());
  });
});

describe('Vessel modules (gap/10 "Vessel view")', () => {
  it('are the tabs in gap/10 order', () => {
    expect(VESSEL_MODULES.map((m) => m.label)).toEqual([
      'Home', 'Crew', 'Safety', 'Certificates', 'Technical', 'Charter', 'Vessel', 'Logbooks', 'Finance', 'Departments', 'Calendar', 'Reports',
    ]);
    expect(new Set(VESSEL_MODULES.map((m) => m.id)).size).toBe(VESSEL_MODULES.length);
  });

  it('keep Finance and Departments as hidden planned slots (G1, G5)', () => {
    const status = Object.fromEntries(VESSEL_MODULES.map((m) => [m.id, m.status]));
    expect(status.finance).toBe('planned');
    expect(status.departments).toBe('planned');
    for (const id of ['home', 'crew', 'safety', 'certificates', 'technical', 'vessel', 'logbooks', 'calendar']) {
      expect(status[id], id).toBe('live');
    }
  });

  it('declare roots and leaves relative to /v/:vesselCode, each under its own module', () => {
    const bad: string[] = [];
    for (const m of VESSEL_MODULES) {
      if (m.root.startsWith('/')) bad.push(`${m.id} root ${m.root}`);
      for (const leaf of navLeaves(m.children)) {
        if (leaf.crossLink) {
          if (!leaf.path.startsWith('/')) bad.push(`${leaf.label}: cross-link ${leaf.path} is not absolute`);
          continue;
        }
        if (leaf.path.startsWith('/')) bad.push(`${leaf.label}: ${leaf.path} is absolute`);
        else if (leaf.path !== m.root && !leaf.path.startsWith(`${m.root}/`)) bad.push(`${leaf.label}: ${leaf.path} is outside ${m.root}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('name their vessel_module_settings keys (G3)', () => {
    expect(VESSEL_MODULES.map((m) => m.moduleSetting ?? null)).toEqual([
      null, 'crew', 'safety', 'certificates', 'technical', 'charter', 'vessel', 'logbooks', 'finance', 'departments', null, null,
    ]);
    const leafKeys = Object.fromEntries(
      VESSEL_MODULES.flatMap((m) => navLeaves(m.children)).filter((l) => l.moduleSetting).map((l) => [l.path, l.moduleSetting]),
    );
    expect(leafKeys).toMatchObject({
      'crew/planner': 'planner',
      'crew/hours-of-rest': 'crew_hor',
      'crew/training': 'crew_training',
      'safety/manual': 'safety_manual',
      'technical/jobs': 'technical.jobs',
      'technical/purchase-orders': 'technical.purchasing',
    });
  });

  it('only Finance links out (to HRIS pay pages), and Departments to Health', () => {
    const links = VESSEL_MODULES.flatMap((m) => navLeaves(m.children).filter((l) => l.crossLink).map((l) => `${m.id}:${l.path}`));
    expect(links.sort()).toEqual([
      'departments:/health/medical', 'departments:/health/spa', 'finance:/hris/compensation/gratuities', 'finance:/hris/compensation/payroll',
    ]);
  });

  it('drop the Management / Office group and the hard-coded single-vessel logbook (gap/10)', () => {
    const labels: string[] = [];
    for (const m of VESSEL_MODULES) walk(m.children, (n) => labels.push(n.label));
    expect(labels).not.toContain('Management / Office');
    expect(labels.some((l) => /DAGON/i.test(l))).toBe(false);
  });

  it('give every planned own leaf a placeholder inside the scope, and nothing else', () => {
    const planned = new Set<string>();
    for (const m of VESSEL_MODULES) {
      if (!m.children.length && m.status === 'planned') planned.add(m.root);
      for (const leaf of navLeaves(m.children)) if (leaf.status === 'planned' && !leaf.crossLink) planned.add(leaf.path);
    }
    expect(VESSEL_PLACEHOLDER_LEAVES.map((p) => p.path).sort()).toEqual([...planned].sort());
  });

  it('send module roots and groups without a page to their first leaf, preferring a real page', () => {
    const to = Object.fromEntries(VESSEL_ROOT_REDIRECTS.map((r) => [r.from, r.to]));
    expect(to.crew).toBe('list');
    expect(to.safety).toBe('drills');
    expect(to.vessel).toBe('emergency');
    expect(to.departments).toBe('bridge/handover-notes');
    // Roots that are a page themselves get no redirect.
    for (const root of ['', 'certificates', 'technical', 'logbooks', 'charter', 'finance', 'calendar', 'reports']) {
      expect(to[root], root).toBeUndefined();
    }
  });

  it('buildVesselNav resolves every path for one vessel, lower case', () => {
    const nav = buildVesselNav('DRA');
    expect(nav.map((m) => m.path)).toEqual([
      '/v/dra', '/v/dra/crew', '/v/dra/safety', '/v/dra/certificates', '/v/dra/technical', '/v/dra/charter',
      '/v/dra/vessel', '/v/dra/logbooks', '/v/dra/finance', '/v/dra/departments', '/v/dra/calendar', '/v/dra/reports',
    ]);
    const crew = nav.find((m) => m.id === 'crew');
    expect(crew?.children.find((c) => c.label === 'Crew List')?.path).toBe('/v/dra/crew/list');
    const finance = nav.find((m) => m.id === 'finance');
    expect(finance?.children.find((c) => c.label === 'Payroll')?.path).toBe('/hris/compensation/payroll');
    const leaves = nav.flatMap((m) => navLeaves(m.children));
    expect(leaves.filter((l) => !l.crossLink && !l.path.startsWith('/v/dra')).map((l) => l.path)).toEqual([]);
    expect(leaves.every((l) => l.id.startsWith('vessel-'))).toBe(true);
  });

  it('buildVesselNav drops what a vessel switched off and applies its labels (gap/10 W4)', () => {
    const off = new Set(['charter', 'crew_hor', 'technical.jobs']);
    const nav = buildVesselNav('hyd', {
      isModuleOn: (key) => !off.has(key),
      labelFor: (key) => (key === 'planner' ? 'Leave' : null),
    });
    expect(nav.some((m) => m.id === 'charter')).toBe(false);
    const crew = nav.find((m) => m.id === 'crew');
    expect(crew?.children.map((c) => c.label)).toContain('Leave');
    expect(crew?.children.map((c) => c.label)).not.toContain('Hours of Rest');
    const technical = nav.find((m) => m.id === 'technical');
    expect(technical?.children.map((c) => c.label)).not.toContain('Jobs');
    expect(technical?.children.map((c) => c.label)).toContain('Equipment');

    const trip = buildVesselNav('hyd', { labelFor: (key) => (key === 'charter' ? 'Trip' : undefined) });
    expect(trip.find((m) => m.id === 'charter')?.label).toBe('Trip');
    // Labels change, routes do not (gap/10 principle 4).
    expect(trip.find((m) => m.id === 'charter')?.path).toBe('/v/hyd/charter');
  });

  it('vesselModuleForPath finds the tab a page belongs to', () => {
    expect(vesselModuleForPath('')?.id).toBe('home');
    expect(vesselModuleForPath('crew/list')?.id).toBe('crew');
    expect(vesselModuleForPath('crew/people/p1/hours-of-rest')?.id).toBe('crew');
    expect(vesselModuleForPath('/safety/risk-assessments/new/')?.id).toBe('safety');
    expect(vesselModuleForPath('logbooks/engine-log?x=1')?.id).toBe('logbooks');
    expect(vesselModuleForPath('nothing-here')).toBeNull();
  });
});

describe("today's shell (NAVIGATION_ITEMS)", () => {
  it('keeps the seven top modules (Legal’s tree last, D-83), then the personal tree (titles and breadcrumbs for /me, spec §8)', () => {
    expect(NAVIGATION_ITEMS.map((m) => m.id)).toEqual(['fleet', 'vessel', 'shoreside', 'health', 'yard', 'hris', 'legal', 'personal']);
    const personal = module('personal');
    expect(personal.path).toBe('/me');
    expect(personal.scope).toBe('personal');
    expect(navLeaves(personal.children ?? []).every((l) => l.scope === 'personal')).toBe(true);
  });

  it('feeds the Vessel module from the vessel tree, on the /v/:vesselCode pattern', () => {
    const vessel = module('vessel');
    expect(vessel.path).toBe(VESSEL_SCOPE_PATTERN);
    const pattern = vesselModuleNav(VESSEL_SCOPE_PATTERN);
    expect((vessel.children ?? []).map((c) => [c.label, c.path])).toEqual(pattern.map((m) => [m.label, m.path]));
    const leaves = navLeaves(vessel.children ?? []).filter((l) => !l.crossLink);
    expect(leaves.filter((l) => l.path !== VESSEL_SCOPE_PATTERN && !l.path.startsWith(`${VESSEL_SCOPE_PATTERN}/`))).toEqual([]);
    expect(navLeaves(vessel.children ?? []).every((l) => l.scope === (l.crossLink ? 'workspace' : 'vessel'))).toBe(true);
  });

  it('opens each module on its first leaf the way the rail does', () => {
    const first = (items: NavChild[] | undefined): string | null => {
      for (const c of items ?? []) {
        const nested = first(c.children);
        if (nested) return nested;
        if (!c.children?.length) return c.path;
      }
      return null;
    };
    expect(first(module('fleet').children)).toBe('/fleet/dashboard');
    expect(first(module('vessel').children)).toBe('/v/:vesselCode');
  });

  it('hides a planned vessel module even when it holds live cross-links', () => {
    const finance = module('vessel').children?.find((c) => c.label === 'Finance');
    expect(finance?.status).toBe('planned');
    expect(navLeaves([finance as NavChild]).some((l) => l.status === 'live')).toBe(true);
  });

  it('has no duplicate own leaf paths anywhere', () => {
    const own = navLeaves(NAVIGATION_ITEMS).filter((l) => !l.crossLink).map((l) => l.path);
    expect(own.filter((p, i) => own.indexOf(p) !== i)).toEqual([]);
  });

  it('leaves the workspace trees unchanged (D-09)', () => {
    const flat = (items: NavChild[], acc: object[] = []) => {
      for (const i of items) {
        if (i.children?.length) {
          acc.push({ kind: 'group', id: i.id, label: i.label, path: i.path });
          flat(i.children, acc);
        } else {
          acc.push({
            kind: 'leaf', id: i.id, label: i.label, path: i.path, status: i.status,
            moduleKey: i.moduleKey ?? null, minPermission: i.minPermission ?? null,
            selfServe: !!i.selfServe, crossLink: !!i.crossLink,
          });
        }
      }
      return acc;
    };
    // Legal's tree is its four tabs (D-83), held to the baseline like the others.
    for (const id of ['shoreside', 'health', 'yard', 'hris', 'legal'] as const) {
      expect(flat(module(id).children ?? []), id).toEqual(workspaceBaseline[id]);
    }
  });
});
