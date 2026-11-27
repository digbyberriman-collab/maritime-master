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
 * - Each part links to a registry report that holds what it counts, with
 *   its bucket in the query (D-381): certificate parts to the report on
 *   CERTIFICATE_SOURCES, crew parts to Crew documents, drills to Overdue
 *   drills, actions to the CAPA tracker; the tile's own link is the most
 *   urgent part's.
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
import { FLEET_REPORT_KEYS, getReport } from '@/modules/reports/registry';
import { CERTIFICATE_SOURCES, CREW_SOURCE_KEYS, STATUS_FILTER } from '@/modules/reports/lib/expiryReports';
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
  fleetKpiPartLinks,
  fleetKpiParts,
  fleetKpiTileHref,
  fleetKpiTileOwnHref,
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

  it('carry the status and type filters after the vessels, and leave empty values out', () => {
    expect(fleetReportHref('capa-tracker', KNOWN, { vessels: 'dra', status: 'open' })).toBe('/fleet/reports/capa-tracker?vessels=dra&status=open');
    expect(fleetReportHref('capa-tracker', KNOWN, { status: 'expired', type: 'training_records' })).toBe(
      '/fleet/reports/capa-tracker?status=expired&type=training_records',
    );
    expect(fleetReportHref('capa-tracker', KNOWN, { vessels: null, status: '', type: null })).toBe('/fleet/reports/capa-tracker');
    expect(fleetReportHref('fleet-certificates', KNOWN, { status: 'expired' })).toBeNull();
  });

  it('name the report a tile opens when none of its parts links (a zero, hours of rest, technical)', () => {
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
    expect(t.documents.partLinks?.every((p) => p.href === undefined)).toBe(true);
    // Overdue drills are the most urgent part, but this registry does not know their report: the actions link leads.
    expect(t.safety).toMatchObject({ value: 5, tone: 'danger', href: '/fleet/reports/capa-tracker?vessels=dra&status=open' });
    expect(t.safety.partLinks).toEqual([
      { text: '4 open actions, 2 overdue', href: '/fleet/reports/capa-tracker?vessels=dra&status=open' },
      { text: '1 overdue drill' },
    ]);
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

describe('part links (gap/02 W9, D9; D-381)', () => {
  const OPTIONS = { knownReportKeys: FLEET_REPORT_KEYS, vesselsParam: 'DRA,ABC' };
  const REGISTRY = read('src/modules/reports/registry.ts');
  const EXPIRY = read('src/modules/reports/components/ExpiryItemsReport.tsx');

  /** The component source of a registry report page (null for a legacy href page). */
  function componentSource(key: string): string | null {
    const block = REGISTRY.split(/\n {2}\{\n/).find((b) => b.includes(`key: '${key}',`));
    const m = block ? /load: \(\) => import\('\.\/reports\/(\w+)'\)/.exec(block) : null;
    return m ? read(`src/modules/reports/reports/${m[1]}.tsx`) : null;
  }

  /** What a part counts, by its words. */
  type Holds = 'certificates' | 'crew' | 'drills' | 'corrective_actions';
  function holds(text: string): Holds {
    if (/overdue drill/.test(text)) return 'drills';
    if (/open action/.test(text)) return 'corrective_actions';
    if (/crew|qualification/.test(text)) return 'crew';
    return 'certificates';
  }
  /** The bucket each part carries (undefined: the report's default view). */
  function bucket(text: string): string | undefined {
    if (/expired/.test(text)) return 'expired';
    if (/expiring/.test(text)) return 'due';
    if (/open action/.test(text)) return 'open';
    return undefined;
  }

  /** Every part's link names a registry report whose sources cover the part, with the bucket and the vessels shown. */
  function expectCovered(links: { text: string; href?: string }[]) {
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link.href, link.text).toBeDefined();
      const url = new URL(link.href ?? '', 'https://storm.example.test');
      const key = url.pathname.replace('/fleet/reports/', '');
      const report = getReport(key, 'fleet');
      expect(report, `${link.text}: ${key} is a fleet report`).not.toBeNull();
      expect(url.searchParams.get('vessels'), link.text).toBe('DRA,ABC');
      expect(url.searchParams.get('status') ?? undefined, link.text).toBe(bucket(link.text));
      const source = componentSource(key);
      switch (holds(link.text)) {
        case 'certificates':
          // The certificates variant reads CERTIFICATE_SOURCES (the vessel certificates).
          expect(source, link.text).toContain('variant="certificates"');
          expect([...CERTIFICATE_SOURCES]).toEqual(['vessel_certificates']);
          break;
        case 'crew':
          // The crew variant reads every crew source, qualifications and training records among them.
          expect(source, link.text).toContain('variant="crew"');
          for (const src of ['crew_documents', 'crew_certificates_legacy', 'training_records']) expect(CREW_SOURCE_KEYS, src).toContain(src);
          break;
        case 'drills':
          expect(key, link.text).toBe('overdue-drills');
          expect(report?.capability).toBe('vessel.safety.drills.view');
          break;
        case 'corrective_actions':
          expect(key, link.text).toBe('capa-tracker');
          expect(report?.capability).toBe('vessel.safety.capa.view');
          break;
      }
      // An expiry report only gets a bucket its Status filter offers.
      if (source?.includes('ExpiryItemsReport') && url.searchParams.get('status')) {
        expect(STATUS_FILTER.options.map((o) => o.value), link.text).toContain(url.searchParams.get('status'));
      }
    }
    expect(EXPIRY).toContain("variant === 'crew' ? crewSourcesFor(applied) : [...CERTIFICATE_SOURCES]");
  }

  it('documents without the expiring split: certificate parts to Fleet certificates, crew parts to Crew documents', () => {
    const links = fleetKpiPartLinks('documents', kpis().tiles, OPTIONS);
    expect(links.map((l) => l.text)).toEqual(['2 expired certificates', '1 expired crew document', '1 expired qualification', '1 endorsement overdue', '3 expiring']);
    expectCovered(links);
    expect(links.map((l) => l.href)).toEqual([
      '/fleet/reports/fleet-certificates?vessels=DRA%2CABC&status=expired',
      '/fleet/reports/crew-documents?vessels=DRA%2CABC&status=expired',
      '/fleet/reports/crew-documents?vessels=DRA%2CABC&status=expired',
      '/fleet/reports/fleet-certificates?vessels=DRA%2CABC',
      '/fleet/reports/fleet-certificates?vessels=DRA%2CABC&status=due',
    ]);
  });

  it('documents with the expiring split (C-1): one link per source that has items', () => {
    const parts = { expired_vessel_certificates: 0, expired_crew_documents: 0, expired_crew_qualifications: 1, endorsements_overdue: 0, expiring: 7, expiring_vessel_certificates: 2, expiring_crew_items: 5 };
    const tiles = kpis({ documents: { state: 'ok', value: 8, vessels: 2, parts } }).tiles;
    const links = fleetKpiPartLinks('documents', tiles, OPTIONS);
    expect(links.map((l) => l.text)).toEqual(['1 expired qualification', '2 expiring certificates', '5 expiring crew items']);
    expectCovered(links);
    expect(links[2].href).toBe('/fleet/reports/crew-documents?vessels=DRA%2CABC&status=due');
    // One source with nothing expiring: only the other is linked.
    const one = kpis({ documents: { state: 'ok', value: 4, vessels: 2, parts: { ...parts, expired_crew_qualifications: 0, expiring: 4, expiring_vessel_certificates: 0, expiring_crew_items: 4 } } }).tiles;
    expect(fleetKpiPartLinks('documents', one, OPTIONS)).toEqual([{ text: '4 expiring crew items', href: '/fleet/reports/crew-documents?vessels=DRA%2CABC&status=due' }]);
    // A split that does not add up is not trusted: one "expiring" part, as before.
    const off = kpis({ documents: { state: 'ok', value: 7, vessels: 2, parts: { ...parts, expired_crew_qualifications: 0, expiring_crew_items: 9 } } }).tiles;
    expect(fleetKpiParts('documents', off)).toEqual(['7 expiring']);
  });

  it('safety: actions to the CAPA tracker on open actions, overdue drills to Overdue drills', () => {
    const links = fleetKpiPartLinks('safety', kpis().tiles, OPTIONS);
    expect(links.map((l) => l.text)).toEqual(['4 open actions, 2 overdue', '1 overdue drill']);
    expectCovered(links);
    expect(links.map((l) => l.href)).toEqual([
      '/fleet/reports/capa-tracker?vessels=DRA%2CABC&status=open',
      '/fleet/reports/overdue-drills?vessels=DRA%2CABC',
    ]);
  });

  it('hours of rest and technical parts are plain text; the tile opens its report', () => {
    for (const key of ['hours_of_rest', 'technical'] as const) {
      expect(fleetKpiPartLinks(key, kpis().tiles, OPTIONS).every((l) => l.href === undefined), key).toBe(true);
    }
    expect(fleetKpiTileHref('hours_of_rest', kpis().tiles, OPTIONS)).toBe('/fleet/reports/hours-of-rest?vessels=DRA%2CABC');
    expect(fleetKpiTileHref('technical', kpis().tiles, OPTIONS)).toBe('/fleet/reports/work-list?vessels=DRA%2CABC');
  });

  it('the tile opens its most urgent part: expired, then endorsements, then expiring; overdue drills before actions', () => {
    const tiles = kpis().tiles;
    expect(fleetKpiTileHref('documents', tiles, OPTIONS)).toBe('/fleet/reports/fleet-certificates?vessels=DRA%2CABC&status=expired');
    const zeroParts = { expired_vessel_certificates: 0, expired_crew_documents: 0, expired_crew_qualifications: 0, endorsements_overdue: 0, expiring: 0 };
    const crewOnly = kpis({ documents: { state: 'ok', value: 3, vessels: 1, parts: { ...zeroParts, expired_crew_documents: 1, endorsements_overdue: 1, expiring: 1 } } }).tiles;
    expect(fleetKpiTileHref('documents', crewOnly, OPTIONS)).toBe('/fleet/reports/crew-documents?vessels=DRA%2CABC&status=expired');
    const endorsements = kpis({ documents: { state: 'ok', value: 2, vessels: 1, parts: { ...zeroParts, endorsements_overdue: 1, expiring: 1 } } }).tiles;
    expect(fleetKpiTileHref('documents', endorsements, OPTIONS)).toBe('/fleet/reports/fleet-certificates?vessels=DRA%2CABC');
    const expiring = kpis({ documents: { state: 'ok', value: 1, vessels: 1, parts: { ...zeroParts, expiring: 1 } } }).tiles;
    expect(fleetKpiTileHref('documents', expiring, OPTIONS)).toBe('/fleet/reports/fleet-certificates?vessels=DRA%2CABC&status=due');
    // A real zero opens the tile's report.
    const zero = kpis({ documents: { state: 'ok', value: 0, vessels: 1, parts: zeroParts } }).tiles;
    expect(fleetKpiTileHref('documents', zero, OPTIONS)).toBe('/fleet/reports/fleet-certificates?vessels=DRA%2CABC');
    expect(fleetKpiTileHref('safety', tiles, OPTIONS)).toBe('/fleet/reports/overdue-drills?vessels=DRA%2CABC');
    const noDrills = kpis({ safety: { state: 'ok', value: 4, vessels: 3, open_corrective_actions: 4, overdue_corrective_actions: 2, overdue_drills: 0 } }).tiles;
    expect(fleetKpiTileHref('safety', noDrills, OPTIONS)).toBe('/fleet/reports/capa-tracker?vessels=DRA%2CABC&status=open');
  });

  it('the view carries the part links; a tile whose parts link is not itself a link (no link inside a link)', () => {
    const t = byKey(buildFleetKpiTiles({ kind: 'ready', data: kpis() }, OPTIONS));
    expect(t.documents.parts).toEqual(fleetKpiParts('documents', kpis().tiles));
    expect(t.documents.partLinks?.map((p) => p.text)).toEqual(t.documents.parts);
    expect(t.documents.href).toBe('/fleet/reports/fleet-certificates?vessels=DRA%2CABC&status=expired');
    expect(fleetKpiTileOwnHref(t.documents)).toBeUndefined();
    expect(fleetKpiTileOwnHref(t.safety)).toBeUndefined();
    expect(fleetKpiTileOwnHref(t.hours_of_rest)).toBe('/fleet/reports/hours-of-rest?vessels=DRA%2CABC');
    expect(fleetKpiTileOwnHref(t.technical)).toBe('/fleet/reports/work-list?vessels=DRA%2CABC');
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
