/**
 * Fleet dashboard KPI rules (gap/02 W9; X5-02A): src/modules/dashboard/lib/fleetKpiRules.ts.
 *
 * - The tiles, their labels, module keys and capability keys, pinned
 *   against the adaptor (D-04), AuthContext's MODULE_ACCESS and the SQL
 *   (20261124040100_fleet_dashboard_kpis.sql: the per-tile gates, the
 *   module settings and the nav role block between its markers).
 * - The W9 red rule, the sub-text parts, links only for report keys the
 *   registry knows, and the KpiTile view of every state (loading, not set
 *   up, error, ready, no access, module off, real zeros).
 * - The module's wiring: the manifest's guard and nav leaf use the page's
 *   key, beta, and the module calls exactly the three RPCs of its pending
 *   types, each defined in an hour-04 migration.
 */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// The registry imports the route guards, which import the client.
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import manifest from '@/modules/dashboard/module';
import { MODULE_REGISTRY } from '@/app/registry/modules';
import { getCatalogueEntry } from '@/lib/permissions/catalogue';
import { ruleForCapability } from '@/lib/permissions/adaptor';
import { parseCapabilityKey } from '@/lib/permissions/types';
import {
  FLEET_DASHBOARD_VIEW,
  FLEET_KPI_CAPABILITIES,
  FLEET_KPI_LABELS,
  FLEET_KPI_MODULE_KEY,
  FLEET_KPI_REPORT_KEY,
  FLEET_KPI_TILES,
  LEAVE_NOT_ENABLED_REASON,
  NOT_SET_UP_REASON,
  buildFleetKpiTiles,
  fleetKpiParts,
  fleetKpiTone,
  fleetReportHref,
  formatFreshnessUtc,
  type FleetKpiTileView,
} from '@/modules/dashboard/lib/fleetKpiRules';
import type { FleetDashboardKpisJson } from '@/modules/dashboard/types/db.pending';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const SQL = read('supabase/migrations/20261124040100_fleet_dashboard_kpis.sql');
const AUTH = read('src/modules/auth/contexts/AuthContext.tsx');
const quoted = (text: string) => Array.from(text.matchAll(/'([a-z_]+)'/g), (m) => m[1]);

/** The body of one SQL function of the migration. */
function sqlBody(name: string): string {
  const start = SQL.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  expect(start, name).toBeGreaterThan(0);
  const end = SQL.indexOf('\n$$;', start);
  return SQL.slice(start, end);
}

function moduleAccess(): Record<string, string[]> {
  const start = AUTH.indexOf('const MODULE_ACCESS');
  const body = AUTH.slice(start, AUTH.indexOf('};', start));
  return Object.fromEntries(Array.from(body.matchAll(/'([a-z-]+)':\s*(\[[^\]]*\])/g), (m) => [m[1], quoted(m[2])]));
}

const KNOWN = new Set(['capa-tracker', 'drill-analytics']);

function kpis(overrides: Partial<FleetDashboardKpisJson['tiles']> = {}): FleetDashboardKpisJson {
  return {
    vessels: 3,
    today: '2026-11-26',
    tiles: {
      documents: {
        state: 'ok',
        value: 8,
        vessels: 3,
        parts: { expired_vessel_certificates: 2, expired_crew_documents: 1, expired_crew_qualifications: 1, endorsements_overdue: 1, expiring: 3 },
      },
      hours_of_rest: { state: 'ok', value: 4, breach_days: 4, near_threshold: 1, crew_without_entries: 1, vessels_logging: 2, vessels_off: 1 },
      safety: { state: 'ok', value: 5, vessels: 3, open_corrective_actions: 4, overdue_corrective_actions: 2, overdue_drills: 1 },
      technical: { state: 'ok', value: 4, vessels: 3, overdue_jobs: 3, pending_approval: 1, open_jobs: 5 },
      leave: { state: 'not_enabled' },
      finance: { state: 'hidden' },
      ...overrides,
    },
  };
}

const byKey = (tiles: FleetKpiTileView[]) => Object.fromEntries(tiles.map((t) => [t.key, t]));

describe('the tiles', () => {
  it('are the six W9 tiles in order, with fresh labels', () => {
    expect([...FLEET_KPI_TILES]).toEqual(['documents', 'hours_of_rest', 'leave', 'safety', 'technical', 'finance']);
    expect(FLEET_KPI_TILES.map((k) => FLEET_KPI_LABELS[k])).toEqual([
      'Document alerts',
      'Hours of rest',
      'Leave overdue',
      'Safety',
      'Technical',
      'Finance',
    ]);
  });

  it('switch off with the vessel module the SQL checks', () => {
    expect(FLEET_KPI_MODULE_KEY).toEqual({ documents: null, hours_of_rest: 'crew_hor', leave: null, safety: 'safety', technical: 'technical', finance: null });
    const scope = sqlBody('fleet_dashboard_scope_for');
    for (const key of ['crew_hor', 'safety', 'technical']) {
      expect(scope).toContain(`public.vessel_module_on_internal(d.id, '${key}', v_today)`);
    }
  });

  it('gate on keys that are in the catalogue', () => {
    for (const key of [FLEET_DASHBOARD_VIEW, ...Object.values(FLEET_KPI_CAPABILITIES).flat()]) {
      const parsed = parseCapabilityKey(key);
      expect(parsed, key).not.toBeNull();
      if (!parsed) continue;
      expect(getCatalogueEntry(parsed.path)?.actions, key).toContain(parsed.action);
    }
  });

  it('use the adaptor rule of each key in SQL (rbac module and nav per gate)', () => {
    const gates: Record<string, { key: string; module: string; nav: string }> = {
      corrective_actions: { key: 'vessel.safety.capa.view', module: 'capa', nav: 'ism' },
      drills: { key: 'vessel.safety.drills.view', module: 'drills', nav: 'ism' },
      safety_meetings: { key: 'vessel.safety.safety_meetings.view', module: 'meetings', nav: 'ism' },
      audits_surveys: { key: 'vessel.safety.audits_surveys.view', module: 'audits_surveys', nav: 'ism' },
      technical: { key: 'vessel.technical.tasks.view', module: 'maintenance', nav: 'maintenance' },
    };
    const body = sqlBody('fleet_dashboard_tile_can_for');
    for (const [gate, want] of Object.entries(gates)) {
      const parsed = parseCapabilityKey(want.key);
      expect(parsed, want.key).not.toBeNull();
      if (!parsed) continue;
      expect(ruleForCapability(parsed.path, parsed.modulePath, parsed.action), want.key).toEqual({ kind: 'rbac', module: want.module, nav: want.nav });
      expect(body, gate).toContain(`WHEN '${gate}' THEN '${want.module}'`.replace("WHEN 'technical' THEN 'maintenance'", "ELSE 'maintenance'"));
    }
    expect(body).toContain("v_nav := CASE WHEN _gate = 'technical' THEN 'maintenance' ELSE 'ism' END;");
    expect([...FLEET_KPI_CAPABILITIES.safety, ...FLEET_KPI_CAPABILITIES.technical]).toEqual([gates.corrective_actions.key, gates.drills.key, gates.technical.key]);
  });

  it('read hours of rest through has_capability_for, which answers the key (PP1)', () => {
    expect(FLEET_KPI_CAPABILITIES.hours_of_rest).toEqual(['vessel.crew.hours_of_rest.view']);
    expect(sqlBody('fleet_dashboard_tile_can_for')).toContain("public.has_capability_for(_user_id, 'vessel.crew.hours_of_rest.view', _company_id, _vessel_id)");
    expect(read('supabase/migrations/20261123000400_platform_capabilities.sql')).toContain("'vessel.crew.hours_of_rest.view'");
  });

  it('the SQL nav role block equals MODULE_ACCESS for ism and maintenance (canAccessModule at view)', () => {
    const body = sqlBody('fleet_dashboard_tile_can_for');
    const start = body.indexOf('-- dashboard-tile-nav-rules:start');
    const end = body.indexOf('-- dashboard-tile-nav-rules:end');
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const block = body.slice(start, end);
    const sqlRoles = Object.fromEntries(Array.from(block.matchAll(/WHEN '([a-z_]+)' THEN ARRAY\[([^\]]*)\]/g), (m) => [m[1], quoted(m[2])]));
    const access = moduleAccess();
    expect(sqlRoles).toEqual({ ism: access.ism, maintenance: access.maintenance });
    // Full access and fleet_master, as the adaptor and canAccessModule grant them.
    expect(body).toContain("v_role IN ('dpa', 'shore_management')");
    expect(body).toContain("lower(ro.name) IN ('superadmin', 'dpa')");
    expect(body).toContain("lower(ro.name) = 'fleet_master'");
  });
});

describe('report links', () => {
  it('link only report keys the registry knows', () => {
    expect(fleetReportHref('capa-tracker', KNOWN)).toBe('/fleet/reports/capa-tracker');
    expect(fleetReportHref('fleet-certificates', KNOWN)).toBeNull();
    expect(fleetReportHref(null, KNOWN)).toBeNull();
  });

  it('carry the vessels shown', () => {
    expect(fleetReportHref('capa-tracker', KNOWN, { vessels: 'dra,hyd' })).toBe('/fleet/reports/capa-tracker?vessels=dra%2Chyd');
  });

  it('name a report for every data tile', () => {
    expect(FLEET_KPI_REPORT_KEY).toEqual({
      documents: 'fleet-certificates',
      hours_of_rest: 'hours-of-rest',
      leave: null,
      safety: 'capa-tracker',
      technical: 'work-list',
      finance: null,
    });
  });
});

describe('the W9 red rule', () => {
  it('documents: danger for anything expired or an endorsement overdue, warn for expiring only', () => {
    expect(fleetKpiTone('documents', kpis().tiles)).toBe('danger');
    const parts = { expired_vessel_certificates: 0, expired_crew_documents: 0, expired_crew_qualifications: 0, endorsements_overdue: 1, expiring: 0 };
    expect(fleetKpiTone('documents', kpis({ documents: { state: 'ok', value: 1, vessels: 1, parts } }).tiles)).toBe('danger');
    expect(fleetKpiTone('documents', kpis({ documents: { state: 'ok', value: 2, vessels: 1, parts: { ...parts, endorsements_overdue: 0, expiring: 2 } } }).tiles)).toBe('warn');
    expect(fleetKpiTone('documents', kpis({ documents: { state: 'ok', value: 0, vessels: 1, parts: { ...parts, endorsements_overdue: 0 } } }).tiles)).toBeUndefined();
  });

  it('hours of rest: danger for any breach, warn for near the limit or no entries', () => {
    expect(fleetKpiTone('hours_of_rest', kpis().tiles)).toBe('danger');
    const calm = { state: 'ok' as const, value: 0, breach_days: 0, near_threshold: 0, crew_without_entries: 0, vessels_logging: 2, vessels_off: 0 };
    expect(fleetKpiTone('hours_of_rest', kpis({ hours_of_rest: { ...calm, near_threshold: 1 } }).tiles)).toBe('warn');
    expect(fleetKpiTone('hours_of_rest', kpis({ hours_of_rest: { ...calm, crew_without_entries: 2 } }).tiles)).toBe('warn');
    expect(fleetKpiTone('hours_of_rest', kpis({ hours_of_rest: calm }).tiles)).toBeUndefined();
  });

  it('safety: danger for overdue actions or drills only; open actions alone are no alert', () => {
    expect(fleetKpiTone('safety', kpis().tiles)).toBe('danger');
    const t = { state: 'ok' as const, value: 3, vessels: 2, open_corrective_actions: 3, overdue_corrective_actions: 0, overdue_drills: 0 };
    expect(fleetKpiTone('safety', kpis({ safety: t }).tiles)).toBeUndefined();
    expect(fleetKpiTone('safety', kpis({ safety: { ...t, overdue_drills: 1 } }).tiles)).toBe('danger');
    expect(fleetKpiTone('safety', kpis({ safety: { ...t, open_corrective_actions: null, overdue_corrective_actions: null } }).tiles)).toBeUndefined();
  });

  it('technical: danger for overdue jobs, warn for jobs awaiting approval', () => {
    expect(fleetKpiTone('technical', kpis().tiles)).toBe('danger');
    const t = { state: 'ok' as const, value: 1, vessels: 2, overdue_jobs: 0, pending_approval: 1, open_jobs: 4 };
    expect(fleetKpiTone('technical', kpis({ technical: t }).tiles)).toBe('warn');
    expect(fleetKpiTone('technical', kpis({ technical: { ...t, pending_approval: 0, value: 0 } }).tiles)).toBeUndefined();
  });

  it('no tone without numbers', () => {
    expect(fleetKpiTone('safety', kpis({ safety: { state: 'module_off' } }).tiles)).toBeUndefined();
    expect(fleetKpiTone('documents', kpis({ documents: { state: 'no_access' } }).tiles)).toBeUndefined();
  });
});

describe('the sub-text parts', () => {
  it('count each part separately and leave zeros out', () => {
    const tiles = kpis().tiles;
    expect(fleetKpiParts('documents', tiles)).toEqual([
      '2 expired certificates',
      '1 expired crew document',
      '1 expired qualification',
      '1 endorsement overdue',
      '3 expiring',
    ]);
    expect(fleetKpiParts('hours_of_rest', tiles)).toEqual(['4 breach days', '1 near the limit', '1 with no entries', '2 vessels logging']);
    expect(fleetKpiParts('safety', tiles)).toEqual(['4 open actions, 2 overdue', '1 overdue drill']);
    expect(fleetKpiParts('technical', tiles)).toEqual(['3 jobs overdue', '1 awaiting approval']);
  });

  it('leave out a part the caller cannot count (null), never write 0 for it', () => {
    const tiles = kpis({ safety: { state: 'ok', value: 2, vessels: 1, open_corrective_actions: null, overdue_corrective_actions: null, overdue_drills: 2 } }).tiles;
    expect(fleetKpiParts('safety', tiles)).toEqual(['2 overdue drills']);
  });

  it('keep the vessel count of hours of rest even with nothing else to say', () => {
    const tiles = kpis({ hours_of_rest: { state: 'ok', value: 0, breach_days: 0, near_threshold: 0, crew_without_entries: 0, vessels_logging: 1, vessels_off: 0 } }).tiles;
    expect(fleetKpiParts('hours_of_rest', tiles)).toEqual(['1 vessel logging']);
  });
});

describe('the tile views', () => {
  it('loading: skeletons; leave keeps its reason; finance is hidden', () => {
    const t = byKey(buildFleetKpiTiles({ kind: 'loading' }, { knownReportKeys: KNOWN }));
    for (const key of ['documents', 'hours_of_rest', 'safety', 'technical']) expect(t[key].state).toBe('loading');
    expect(t.leave).toMatchObject({ state: 'not-enabled', notEnabledReason: LEAVE_NOT_ENABLED_REASON });
    expect(t.finance.state).toBe('no-access');
  });

  it('not set up (D-01): every data tile says so, no number', () => {
    const t = byKey(buildFleetKpiTiles({ kind: 'not_set_up' }, { knownReportKeys: KNOWN }));
    for (const key of ['documents', 'hours_of_rest', 'safety', 'technical']) {
      expect(t[key]).toMatchObject({ state: 'not-enabled', notEnabledReason: NOT_SET_UP_REASON });
      expect(t[key].value).toBeUndefined();
    }
  });

  it('error: the error state, never zeros', () => {
    const t = byKey(buildFleetKpiTiles({ kind: 'error' }, { knownReportKeys: KNOWN }));
    for (const key of ['documents', 'hours_of_rest', 'safety', 'technical']) {
      expect(t[key].state).toBe('error');
      expect(t[key].value).toBeUndefined();
    }
  });

  it('ready: the server values, parts, tones; links only for registered report keys', () => {
    const t = byKey(buildFleetKpiTiles({ kind: 'ready', data: kpis() }, { knownReportKeys: KNOWN, vesselsParam: 'dra' }));
    expect(t.documents).toMatchObject({ state: undefined, value: 8, tone: 'danger' });
    expect(t.documents.sub).toBe('2 expired certificates · 1 expired crew document · 1 expired qualification · 1 endorsement overdue · 3 expiring');
    expect(t.documents.href).toBeUndefined();
    expect(t.safety).toMatchObject({ value: 5, tone: 'danger', href: '/fleet/reports/capa-tracker?vessels=dra' });
    expect(t.hours_of_rest.href).toBeUndefined();
    expect(t.technical.href).toBeUndefined();
  });

  it('ready: no access hides the tile; a module off everywhere says which', () => {
    const t = byKey(
      buildFleetKpiTiles(
        { kind: 'ready', data: kpis({ documents: { state: 'no_access' }, hours_of_rest: { state: 'module_off', vessels_off: 2 }, technical: { state: 'module_off' } }) },
        { knownReportKeys: KNOWN },
      ),
    );
    expect(t.documents.state).toBe('no-access');
    expect(t.hours_of_rest).toMatchObject({ state: 'not-enabled', notEnabledReason: 'Hours of Rest is off on every vessel shown' });
    expect(t.technical).toMatchObject({ state: 'not-enabled', notEnabledReason: 'Technical is off on every vessel shown' });
  });

  it('ready: a real zero is the zero state with its own words', () => {
    const zero = kpis({
      documents: {
        state: 'ok',
        value: 0,
        vessels: 3,
        parts: { expired_vessel_certificates: 0, expired_crew_documents: 0, expired_crew_qualifications: 0, endorsements_overdue: 0, expiring: 0 },
      },
      hours_of_rest: { state: 'ok', value: 0, breach_days: 0, near_threshold: 0, crew_without_entries: 0, vessels_logging: 3, vessels_off: 0 },
      safety: { state: 'ok', value: 0, vessels: 3, open_corrective_actions: 0, overdue_corrective_actions: 0, overdue_drills: 0 },
      technical: { state: 'ok', value: 0, vessels: 3, overdue_jobs: 0, pending_approval: 0, open_jobs: 2 },
    });
    const t = byKey(buildFleetKpiTiles({ kind: 'ready', data: zero }, { knownReportKeys: KNOWN }));
    expect(t.documents).toMatchObject({ state: undefined, value: 0, zeroLabel: 'All documents in date', tone: undefined });
    expect(t.hours_of_rest).toMatchObject({ state: undefined, value: 0, zeroLabel: 'No breaches · 3 vessels logging' });
    expect(t.safety).toMatchObject({ value: 0, zeroLabel: 'Nothing open or overdue' });
    expect(t.technical).toMatchObject({ value: 0, zeroLabel: 'Nothing overdue' });
  });

  it('ready: hours of rest with no breach but something to watch shows the 0 with its parts, not "all clear"', () => {
    const watch = kpis({ hours_of_rest: { state: 'ok', value: 0, breach_days: 0, near_threshold: 2, crew_without_entries: 0, vessels_logging: 2, vessels_off: 0 } });
    const t = byKey(buildFleetKpiTiles({ kind: 'ready', data: watch }, { knownReportKeys: KNOWN }));
    expect(t.hours_of_rest).toMatchObject({ state: 'ready', value: 0, tone: 'warn', sub: '2 near the limit · 2 vessels logging' });
  });
});

describe('the freshness stamp (D-88)', () => {
  it('is "Updated d MMM yyyy, HH:mm UTC"', () => {
    expect(formatFreshnessUtc(Date.UTC(2026, 10, 26, 14, 5))).toBe('Updated 26 Nov 2026, 14:05 UTC');
    expect(formatFreshnessUtc(new Date(Date.UTC(2026, 0, 3, 0, 0)))).toBe('Updated 3 Jan 2026, 00:00 UTC');
  });
});

describe('wiring', () => {
  const block04 = readdirSync(join(ROOT, 'supabase/migrations'))
    .filter((f) => /^2026112404\d{4}_.*\.sql$/.test(f))
    .map((f) => read(`supabase/migrations/${f}`))
    .join('\n');
  const definedFunctions = new Set(Array.from(block04.matchAll(/CREATE (?:OR REPLACE )?FUNCTION public\.(\w+)\s*\(/gi), (m) => m[1]));
  const hooks = read('src/modules/dashboard/hooks/useFleetDashboard.ts');
  const pending = read('src/modules/dashboard/types/db.pending.ts');

  it('the manifest routes the fleet dashboard page behind the page key, with a beta leaf on the same key', () => {
    expect(MODULE_REGISTRY.problems).toEqual([]);
    const route = (manifest.routes ?? [])[0];
    expect(route).toMatchObject({ scope: 'fleet', path: 'dashboard', guard: { kind: 'capability', capability: FLEET_DASHBOARD_VIEW } });
    expect(read('src/modules/dashboard/module.ts')).toContain("page: () => import('@/modules/dashboard/pages/FleetDashboardPage')");
    const leaf = manifest.nav?.[0];
    expect(leaf).toMatchObject({ slot: 'fleet.overview', order: 10 });
    expect(leaf?.node).toMatchObject({ label: 'Dashboard', path: '/fleet/dashboard', status: 'beta', capability: FLEET_DASHBOARD_VIEW });
    expect(manifest.capabilities).toEqual([FLEET_DASHBOARD_VIEW]);
  });

  it('calls exactly the three dashboard RPCs, each defined in an hour-04 migration and declared in the pending types', () => {
    const calls = Array.from(hooks.matchAll(/\.rpc\('(\w+)'/g), (m) => m[1]);
    expect(calls.sort()).toEqual(['fleet_dashboard_kpis', 'fleet_dashboard_panels', 'fleet_vessel_comparison']);
    for (const fn of calls) {
      expect(definedFunctions.has(fn), fn).toBe(true);
      expect(pending, fn).toContain(`${fn}: {`);
    }
    expect(hooks).toContain('pendingClient<NoPending, NoPending, DashboardPendingFunctions>()');
  });

  it('never reads get_vessel_dashboard_summary for the fleet numbers', () => {
    for (const file of ['src/modules/dashboard/pages/FleetDashboardPage.tsx', 'src/modules/dashboard/hooks/useFleetDashboard.ts', 'src/modules/dashboard/components/fleet/FleetKpiRow.tsx']) {
      expect(read(file), file).not.toContain('get_vessel_dashboard_summary');
    }
    expect(SQL).not.toMatch(/FROM public\.get_vessel_dashboard_summary/);
  });
});
