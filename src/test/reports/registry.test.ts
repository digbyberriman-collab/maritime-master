/**
 * The one report registry (src/modules/reports/registry.ts; DECISIONS C12,
 * D-X5-11; gap/02 R1):
 *
 * - keys are unique, kebab-case and stable; every report names a known
 *   group, a scope, a module chip, a description and export formats the
 *   engine knows;
 * - every capability is a key of the PMS catalogue (a typo would fail
 *   closed and hide the report from everyone);
 * - every loader resolves to a component, and every legacy href resolves to
 *   the static page it names (not to the registry's own `:reportKey`
 *   route, which would loop), inside the Fleet scope;
 * - lookups: unknown keys and other scopes' reports are null; paths carry a
 *   query; the dashboard's known keys are exactly the fleet reports.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import {
  FLEET_REPORT_KEYS,
  REPORTS,
  REPORT_GROUPS,
  fleetReportPath,
  getReport,
  reportsForScope,
  type ReportDefinition,
} from '@/modules/reports/registry';
import { listCatalogueCapabilities } from '@/lib/permissions/catalogue';
import { EXPORT_FORMATS } from '@/lib/export';
import { appRouteObjects, isPlaceholderElement, isScopeNotFound, resolveUrl } from '../router/routeHarness';

const routes = appRouteObjects();

describe('report registry', () => {
  it('has unique, kebab-case keys', () => {
    const keys = REPORTS.map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) expect(key, key).toMatch(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/);
  });

  it('lists the wave-1 fleet reports: the registry pages and the four legacy pages', () => {
    expect(REPORTS.map((r) => [r.key, r.load ? 'page' : 'href'])).toEqual([
      ['vessel-comparison', 'page'],
      ['fleet-list', 'page'],
      ['fleet-certificates', 'page'],
      ['crew-documents', 'page'],
      ['incident-analytics', 'href'],
      ['capa-tracker', 'href'],
      ['drill-analytics', 'href'],
      ['risk-overview', 'href'],
    ]);
  });

  it('gives every report a group, a scope, a chip, a description and engine formats', () => {
    const groups = new Set<string>(REPORT_GROUPS.map((g) => g.id));
    for (const r of REPORTS) {
      expect(groups.has(r.group), `${r.key}: group ${r.group}`).toBe(true);
      expect(['fleet', 'vessel', 'both']).toContain(r.scope);
      expect(r.title.trim(), r.key).not.toBe('');
      expect(r.moduleChip.trim(), r.key).not.toBe('');
      expect(r.description, r.key).toMatch(/\.$/);
      for (const f of r.exporters) expect(EXPORT_FORMATS, `${r.key}: ${f}`).toContain(f);
      expect(Boolean(r.load) !== Boolean(r.href), `${r.key}: exactly one of load and href`).toBe(true);
    }
    expect(new Set(REPORT_GROUPS.map((g) => g.id)).size).toBe(REPORT_GROUPS.length);
  });

  it('every capability is in the catalogue', () => {
    const catalogue = new Set(listCatalogueCapabilities());
    for (const r of REPORTS) expect(catalogue.has(r.capability), `${r.key}: ${r.capability}`).toBe(true);
  });

  it('a legacy page keeps its own exports; a registry page exports through the engine', () => {
    for (const r of REPORTS) {
      if (r.href) expect(r.exporters, r.key).toEqual([]);
      else expect(r.exporters.length, r.key).toBeGreaterThan(0);
    }
    expect(getReport('vessel-comparison', 'fleet')).toMatchObject({ personalData: false, exporters: ['csv', 'xlsx', 'pdf'] });
  });

  it('every loader resolves to a component', async () => {
    for (const r of REPORTS.filter((x): x is ReportDefinition & { load: NonNullable<ReportDefinition['load']> } => Boolean(x.load))) {
      const mod = await r.load();
      expect(typeof mod.default, r.key).toBe('function');
    }
  });

  it('every href resolves to its own static page in the Fleet scope, never the :reportKey route', () => {
    for (const r of REPORTS.filter((x) => x.href)) {
      const url = fleetReportPath(r);
      const resolved = resolveUrl(routes, url);
      expect(resolved.pattern, r.key).toBe(url);
      expect(resolved.pattern, r.key).not.toContain(':reportKey');
      expect(resolved.hops, r.key).toEqual([]);
      expect(isPlaceholderElement(resolved.element), r.key).toBe(false);
      expect(isScopeNotFound(resolved.element), r.key).toBe(false);
    }
  });

  it('a registry key opens the report page route', () => {
    const resolved = resolveUrl(routes, '/fleet/reports/vessel-comparison');
    expect(resolved.pattern).toBe('/fleet/reports/:reportKey');
    expect(resolved.hops).toEqual([]);
    expect(isScopeNotFound(resolved.element)).toBe(false);
    // The hub itself is the module's page (guarded by its capability).
    expect(resolveUrl(routes, '/fleet/reports').pattern).toBe('/fleet/reports');
  });

  it('looks reports up by key and scope', () => {
    expect(getReport('vessel-comparison', 'fleet')?.title).toBe('Vessel comparison');
    expect(getReport('vessel-comparison', 'vessel')).toBeNull();
    expect(getReport('no-such-report', 'fleet')).toBeNull();
    expect(getReport(undefined, 'fleet')).toBeNull();
    expect(getReport('', 'fleet')).toBeNull();
    expect(reportsForScope('vessel')).toEqual([]);
    expect(reportsForScope('fleet').map((r) => r.key)).toEqual(REPORTS.map((r) => r.key));
  });

  it('builds fleet paths with an optional query', () => {
    const vc = getReport('vessel-comparison', 'fleet') as ReportDefinition;
    const capa = getReport('capa-tracker', 'fleet') as ReportDefinition;
    expect(fleetReportPath(vc)).toBe('/fleet/reports/vessel-comparison');
    expect(fleetReportPath(vc, new URLSearchParams({ vessels: 'DRA,HYD' }))).toBe('/fleet/reports/vessel-comparison?vessels=DRA%2CHYD');
    expect(fleetReportPath(vc, '?tab=safety')).toBe('/fleet/reports/vessel-comparison?tab=safety');
    expect(fleetReportPath(capa)).toBe('/fleet/reports/capa-tracker');
  });

  it('the keys the dashboard may link to are the fleet reports', () => {
    expect([...FLEET_REPORT_KEYS].sort()).toEqual(reportsForScope('fleet').map((r) => r.key).sort());
    expect(FLEET_REPORT_KEYS.has('vessel-comparison')).toBe(true);
    expect(FLEET_REPORT_KEYS.has('fleet-certificates')).toBe(true);
    expect(FLEET_REPORT_KEYS.has('crew-documents')).toBe(true);
    expect(FLEET_REPORT_KEYS.has('crew-qualifications')).toBe(false);
  });
});
