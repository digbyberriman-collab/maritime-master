/**
 * Wiring of the reports module (X5-03A; gap/02 R1; DECISIONS C12,
 * D-X5-11; gap/00 A2):
 *
 * - the manifest registers with no problems, data only (it imports neither
 *   the registry nor a page), with the hub and the report route guarded by
 *   `fleet.operations.fleet_reports.view`, and the Reports leaf beta with
 *   the same key;
 * - every capability key the module declares or gates with is in the
 *   catalogue;
 * - every RPC the module calls is defined in an hour-04 migration and
 *   declared in the module's pending types, and it reads only through its
 *   typed pending client (D-01);
 * - the SQL report gate's nav role block equals AuthContext's MODULE_ACCESS
 *   for `ism` (the adaptor's canAccessModule rule for incidents, D-04);
 * - Recharts is reached only through the lazily loaded TrendCharts, and the
 *   old reports index is gone with every caller moved to the registry.
 */
import { describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import manifest from '@/modules/reports/module';
import { REPORTS_CAPABILITIES, REPORTS_CAPS, REPORTS_FLEET_PATHS } from '@/modules/reports/paths';
import { MODULE_REGISTRY } from '@/app/registry/modules';
import { listCatalogueCapabilities } from '@/lib/permissions/catalogue';
import { NAVIGATION_ITEMS } from '@/config/sitemap';
import type { NavChild } from '@/config/navigation-types';

const ROOT = process.cwd();
const MODULE_DIR = join(ROOT, 'src/modules/reports');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\./.test(name)) out.push(full);
  }
  return out;
}

const sources = walk(MODULE_DIR).map((f) => ({ file: relative(ROOT, f), text: readFileSync(f, 'utf8') }));
const allSource = sources.map((s) => s.text).join('\n');

const block04 = readdirSync(join(ROOT, 'supabase/migrations'))
  .filter((f) => /^2026112404\d{4}_.*\.sql$/.test(f))
  .map((f) => read(`supabase/migrations/${f}`))
  .join('\n');
const definedFunctions = new Set(Array.from(block04.matchAll(/CREATE (?:OR REPLACE )?FUNCTION public\.(\w+)\s*\(/gi)).map((m) => m[1]));
const pending = read('src/modules/reports/types/db.pending.ts');
const HUB_SQL = read('supabase/migrations/20261124040200_fleet_reports_hub.sql');

const leaves = (items: readonly NavChild[], acc: NavChild[] = []): NavChild[] => {
  for (const it of items) {
    if (it.children?.length) leaves(it.children, acc);
    else acc.push(it);
  }
  return acc;
};

const quoted = (list: string) => Array.from(list.matchAll(/'([a-z_]+)'/g), (m) => m[1]).sort();

describe('reports manifest', () => {
  it('registers the hub and the report route in the Fleet scope, guarded by the reports capability', () => {
    expect(MODULE_REGISTRY.problems).toEqual([]);
    expect(MODULE_REGISTRY.manifests.find((m) => m.id === 'reports')).toBe(manifest);
    expect(manifest).toMatchObject({ id: 'reports', label: 'Reports', scopes: ['fleet'] });
    const routes = MODULE_REGISTRY.routes.filter((r) => r.moduleId === 'reports');
    expect(routes.map((r) => r.fullPath).sort()).toEqual(['/fleet/reports', '/fleet/reports/:reportKey']);
    for (const r of manifest.routes ?? []) {
      expect(r).toMatchObject({ scope: 'fleet', guard: { kind: 'capability', capability: 'fleet.operations.fleet_reports.view' } });
    }
    expect(REPORTS_FLEET_PATHS).toEqual({ index: 'reports', report: 'reports/:reportKey' });
  });

  it('is data only: icons, nav builders, types and paths; the pages are lazy and the registry is not imported', () => {
    const text = read('src/modules/reports/module.ts');
    const imports = Array.from(text.matchAll(/^import .* from '([^']+)';$/gm)).map((m) => m[1]);
    expect(imports.sort()).toEqual(['./paths', '@/app/registry/types', '@/config/navBuilders', '@/modules/fleet/paths', 'lucide-react']);
    expect(text).toContain("page: () => import('@/modules/reports/pages/ReportsHubPage')");
    expect(text).toContain("page: () => import('@/modules/reports/pages/ReportPage')");
    expect(text).not.toMatch(/import\(?['(]?\.\/registry/);
    expect(text).not.toMatch(/from '\.\/registry'/);
    const pathImports = Array.from(read('src/modules/reports/paths.ts').matchAll(/^import (type )?.* from '([^']+)';$/gm)).map((m) => [m[1], m[2]]);
    expect(pathImports).toEqual([['type ', '@/lib/permissions/types']]);
  });

  it('contributes the Reports leaf: fleet.overview at 30, beta, gated by the same key', () => {
    expect(manifest.nav?.map((f) => [f.slot, f.order, f.node.label, f.node.path, f.node.capability, f.node.status])).toEqual([
      ['fleet.overview', 30, 'Reports', '/fleet/reports', REPORTS_CAPS.view, 'beta'],
    ]);
    const leaf = leaves(NAVIGATION_ITEMS).find((l) => l.path === '/fleet/reports');
    expect(leaf).toMatchObject({ label: 'Reports', status: 'beta', capability: 'fleet.operations.fleet_reports.view' });
  });
});

describe('capabilities', () => {
  const catalogue = new Set(listCatalogueCapabilities());

  it('every key the manifest declares is in the catalogue', () => {
    expect(manifest.capabilities).toEqual(REPORTS_CAPABILITIES);
    for (const key of REPORTS_CAPABILITIES) expect(catalogue.has(key), key).toBe(true);
  });

  it('every capability literal in the module is in the catalogue', () => {
    const literal = new Set(Array.from(allSource.matchAll(/'((?:fleet|vessel|hris|health)\.[a-z_]+\.[a-z_]+\.[a-z_]+)'/g)).map((m) => m[1]));
    expect(literal.size).toBeGreaterThan(3);
    for (const key of literal) expect(catalogue.has(key), key).toBe(true);
  });
});

describe('database objects', () => {
  const rpcs = new Set(Array.from(allSource.matchAll(/\.rpc\(\s*'([a-z_]+)'/g)).map((m) => m[1]));

  it('calls the two report RPCs and reads no table directly', () => {
    expect([...rpcs].sort()).toEqual(['fleet_report_trends', 'fleet_vessel_list']);
    expect(allSource).not.toMatch(/\.from\(\s*'/);
  });

  it('every RPC it calls is defined in a 2026112404 migration and declared pending', () => {
    for (const fn of rpcs) {
      expect(definedFunctions.has(fn), `${fn} in block 04`).toBe(true);
      expect(pending, `${fn} in db.pending.ts`).toMatch(new RegExp(`\\b${fn}: \\{`));
    }
  });

  it('reads only through its typed pending client, never the raw client', () => {
    for (const { file, text } of sources) {
      expect(text, file).not.toMatch(/@\/integrations\/supabase\/client/);
      if (/\.rpc\(\s*'/.test(text)) expect(text, file).toMatch(/from '\.\.\/lib\/reportsDb'/);
    }
    expect(read('src/modules/reports/lib/reportsDb.ts')).toMatch(/pendingClient<NoPending, NoPending, ReportsPendingFunctions>\(\)/);
  });

  it('the SQL nav role block for incidents equals MODULE_ACCESS for ism (canAccessModule at view)', () => {
    const start = HUB_SQL.indexOf('-- report-gate-nav-rules:start');
    const end = HUB_SQL.indexOf('-- report-gate-nav-rules:end');
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const block = HUB_SQL.slice(start, end);
    const sqlRoles = Object.fromEntries(Array.from(block.matchAll(/WHEN '([a-z_]+)' THEN ARRAY\[([^\]]*)\]/g), (m) => [m[1], quoted(m[2])]));
    const auth = read('src/modules/auth/contexts/AuthContext.tsx');
    const at = auth.indexOf('const MODULE_ACCESS');
    const body = auth.slice(at, auth.indexOf('};', at));
    const access = Object.fromEntries(Array.from(body.matchAll(/'([a-z-]+)':\s*(\[[^\]]*\])/g), (m) => [m[1], quoted(m[2])]));
    expect(access.ism?.length).toBeGreaterThan(0);
    expect(sqlRoles).toEqual({ incidents: access.ism });
    // Full access and fleet_master, as the adaptor and canAccessModule grant them; the RBAC module is incidents.
    expect(HUB_SQL).toContain("v_role IN ('dpa', 'shore_management')");
    expect(HUB_SQL).toContain("lower(ro.name) IN ('superadmin', 'dpa')");
    expect(HUB_SQL).toContain("lower(ro.name) = 'fleet_master'");
    expect(HUB_SQL).toContain("public.user_has_permission(_user_id, 'incidents'");
    expect(HUB_SQL).toContain("'vessel.crew.crew_list.view'");
  });

  it('every definer sets search_path and the browser RPCs are the only ones granted to authenticated', () => {
    const defs = Array.from(HUB_SQL.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)\(/g)).map((m) => m[1]);
    expect(defs.sort()).toEqual(['fleet_report_corrective_actions', 'fleet_report_gate_can_for', 'fleet_report_scope_for', 'fleet_report_trends', 'fleet_vessel_list']);
    expect(HUB_SQL.match(/SET search_path = public/g)?.length).toBe(defs.length);
    const granted = Array.from(HUB_SQL.matchAll(/GRANT EXECUTE ON FUNCTION public\.(\w+)\([^)]*\) TO authenticated;/g)).map((m) => m[1]);
    expect(granted.sort()).toEqual(['fleet_report_trends', 'fleet_vessel_list']);
    for (const fn of defs) expect(HUB_SQL).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\([^)]*\\) FROM PUBLIC, anon, authenticated, service_role;`));
  });
});

describe('bundling and the old index', () => {
  it('Recharts is imported only by TrendCharts, which the hub loads lazily', () => {
    const recharts = sources.filter((s) => /from 'recharts'/.test(s.text)).map((s) => s.file);
    expect(recharts).toEqual(['src/modules/reports/components/TrendCharts.tsx']);
    const hub = read('src/modules/reports/pages/ReportsHubPage.tsx');
    expect(hub).toContain("lazy(() => import('../components/TrendCharts'))");
    expect(hub).not.toMatch(/^import .*TrendCharts/m);
    for (const s of sources) expect(s.text, s.file).not.toMatch(/from '(exceljs|papaparse|jspdf|jspdf-autotable)'/);
  });

  it('report components are loaded lazily from the registry', () => {
    const registry = read('src/modules/reports/registry.ts');
    expect(registry).toContain("load: () => import('./reports/VesselComparisonReport')");
    for (const s of sources.filter((x) => !x.file.endsWith('registry.ts'))) {
      expect(s.text, s.file).not.toMatch(/^import .* from '\.\.?\/reports\/VesselComparisonReport'/m);
    }
  });

  it('the old reports index is gone and the dashboard links through the registry', () => {
    expect(existsSync(join(ROOT, 'src/modules/dashboard/pages/FleetReportsIndex.tsx'))).toBe(false);
    const offenders = walk(join(ROOT, 'src')).filter((f) => /FleetReportsIndex|FLEET_REPORT_PATHS/.test(readFileSync(f, 'utf8')));
    expect(offenders.map((f) => relative(ROOT, f)).filter((f) => !f.startsWith('src/test/'))).toEqual([]);
    expect(read('src/modules/dashboard/pages/FleetDashboardPage.tsx')).toContain("import { FLEET_REPORT_KEYS } from '@/modules/reports/registry';");
  });
});
