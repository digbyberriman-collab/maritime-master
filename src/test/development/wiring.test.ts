/**
 * Wiring of Fleet › Training and the vessel's Crew Training (X5-07B;
 * gap/02 TR1–TR3, TR5–TR8, TR10, X1; gap/04 C62; DECISIONS D-01, D-04,
 * D-27, D-X1-7, D-X5-12, D-X5-20; gap/00 A2):
 *
 * - the manifest registers with no problems, data only: `/fleet/training`
 *   redirects to the overview, `/fleet/training/:tab` and
 *   `/v/:vesselCode/crew/training` are lazy pages behind their capability;
 *   the Training leaf is `fleet.people` 10 and Crew Training `vessel.crew`
 *   70 (crew_training module setting), both beta with their keys;
 * - registering `/fleet/training/:tab` arms the four legacy development
 *   redirects (PP3 pendingTarget);
 * - every key named is in the catalogue;
 * - the new code writes nothing directly: every change is a definer of
 *   20261124040600 granted to the browser and declared pending; the 040600
 *   columns and table are read through the typed pending client;
 * - exports name a valid source key and are personal data;
 * - the vessel page takes its vessel from the scope (no name filter).
 */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import manifest from '@/modules/development/module';
import * as development from '@/modules/development';
import {
  DEVELOPMENT_CAPABILITIES,
  DEVELOPMENT_FLEET_PATHS,
  DEVELOPMENT_VESSEL_PATHS,
  FLEET_TRAINING_TABS,
  TRAINING_CAPS,
  VESSEL_CREW_TRAINING_CAPS,
  fleetTrainingPath,
} from '@/modules/development/paths';
import { MODULE_REGISTRY } from '@/app/registry/modules';
import { listCatalogueCapabilities } from '@/lib/permissions/catalogue';
import { NAVIGATION_ITEMS } from '@/config/sitemap';
import { legacyEntryApplies, legacyEntryFor } from '@/app/router/legacyResolve';
import { SOURCE_KEY_PATTERN } from '@/lib/export';
import type { NavChild } from '@/config/navigation-types';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const TRAINING_DIR = 'src/modules/development/components/training';
const SLICE_FILES = [
  'src/modules/development/module.ts',
  'src/modules/development/paths.ts',
  'src/modules/development/pages/FleetTrainingPage.tsx',
  'src/modules/development/pages/CrewTraining.tsx',
  'src/modules/development/components/ApplicationDetailModal.tsx',
  ...readdirSync(join(ROOT, TRAINING_DIR)).map((f) => `${TRAINING_DIR}/${f}`),
];
const sources = SLICE_FILES.map((file) => ({ file, text: read(file) }));
const allSource = sources.map((s) => s.text).join('\n');
const SQL = read('supabase/migrations/20261124040600_fleet_training_core.sql');
const pending = read('src/modules/development/types/db.pending.ts');

const leaves = (items: readonly NavChild[], acc: NavChild[] = []): NavChild[] => {
  for (const it of items) {
    if (it.children?.length) leaves(it.children, acc);
    else acc.push(it);
  }
  return acc;
};

describe('development manifest', () => {
  it('registers the redirect and the two pages, lazy, each behind its capability', () => {
    expect(MODULE_REGISTRY.problems).toEqual([]);
    expect(MODULE_REGISTRY.manifests.find((m) => m.id === 'development')).toBe(manifest);
    const routes = MODULE_REGISTRY.routes.filter((r) => r.moduleId === 'development');
    expect(routes.map((r) => r.fullPath).sort()).toEqual(['/fleet/training', '/fleet/training/:tab', '/v/:vesselCode/crew/training']);
    expect(DEVELOPMENT_FLEET_PATHS).toEqual({ training: 'training', trainingTab: 'training/:tab' });
    expect(DEVELOPMENT_VESSEL_PATHS).toEqual({ crewTraining: 'crew/training' });
    const byPath = Object.fromEntries((manifest.routes ?? []).map((r) => [r.path, r]));
    expect(byPath.training).toEqual({ scope: 'fleet', path: 'training', redirectTo: 'overview' });
    expect(byPath['training/:tab']).toMatchObject({ scope: 'fleet', guard: { kind: 'capability', capability: 'fleet.operations.fleet_training.view' } });
    expect(byPath['crew/training']).toMatchObject({ scope: 'vessel', guard: { kind: 'capability', capability: 'vessel.crew.crew_training.view' } });
    const text = read('src/modules/development/module.ts');
    expect(text).toContain("page: () => import('@/modules/development/pages/FleetTrainingPage')");
    expect(text).toContain("page: () => import('@/modules/development/pages/CrewTraining')");
    expect(FLEET_TRAINING_TABS[0]).toBe('overview');
    expect(fleetTrainingPath('applications', new URLSearchParams({ vessel: 'dra' }))).toBe('/fleet/training/applications?vessel=dra');
  });

  it('is data only: icons, nav builders, types and paths', () => {
    const imports = Array.from(read('src/modules/development/module.ts').matchAll(/^import [^;]*? from '([^']+)';$/gm)).map((m) => m[1]);
    expect(imports.sort()).toEqual(['./paths', '@/app/registry/types', '@/config/navBuilders', '@/modules/fleet/paths', 'lucide-react']);
    const pathImports = Array.from(read('src/modules/development/paths.ts').matchAll(/^import (type )?.* from '([^']+)';$/gm)).map((m) => [m[1], m[2]]);
    expect(pathImports).toEqual([['type ', '@/lib/permissions/types']]);
  });

  it('contributes Training (fleet.people 10) and Crew Training (vessel.crew 70), beta, with their keys', () => {
    expect(manifest.nav?.map((f) => [f.slot, f.order, f.node.label, f.node.path, f.node.capability, f.node.status, f.node.moduleSetting ?? null])).toEqual([
      ['fleet.people', 10, 'Training', '/fleet/training', TRAINING_CAPS.view, 'beta', null],
      ['vessel.crew', 70, 'Crew Training', 'crew/training', VESSEL_CREW_TRAINING_CAPS.view, 'beta', 'crew_training'],
    ]);
    const leaf = leaves(NAVIGATION_ITEMS).find((l) => l.path === '/fleet/training');
    expect(leaf).toMatchObject({ label: 'Training', status: 'beta', capability: 'fleet.operations.fleet_training.view' });
  });

  it('arms the legacy development redirects', () => {
    expect(MODULE_REGISTRY.hasPage('/fleet/training/:tab')).toBe(true);
    for (const [from, to] of [
      ['/development/admin', '/fleet/training/overview'],
      ['/development/catalogue', '/fleet/training/catalogue'],
      ['/development/applications', '/fleet/training/applications'],
      ['/development/courses-register', '/fleet/training/applications'],
    ]) {
      const entry = legacyEntryFor(from);
      expect(entry?.to, from).toBe(to);
      expect(entry?.pendingTarget, from).toBe('/fleet/training/:tab');
      expect(entry && legacyEntryApplies(entry), from).toBe(true);
    }
  });

  it('every key the manifest declares or the pages name is in the catalogue', () => {
    const catalogue = new Set(listCatalogueCapabilities());
    expect(manifest.capabilities).toEqual(DEVELOPMENT_CAPABILITIES);
    for (const key of DEVELOPMENT_CAPABILITIES) expect(catalogue.has(key), key).toBe(true);
    const literal = new Set(Array.from(allSource.matchAll(/'((?:fleet|vessel)\.[a-z_]+\.[a-z_]+\.[a-z_]+)'/g)).map((m) => m[1]));
    expect(literal.size).toBeGreaterThanOrEqual(6);
    for (const key of literal) expect(catalogue.has(key), key).toBe(true);
  });

  it('exports the routes and keys from the module index', () => {
    expect(development.TRAINING_CAPS).toBe(TRAINING_CAPS);
    expect(development.fleetTrainingPath).toBe(fleetTrainingPath);
  });
});

describe('database objects', () => {
  const definedFunctions = new Set(Array.from(SQL.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)\s*\(/g), (m) => m[1]));
  const granted = new Set(Array.from(SQL.matchAll(/GRANT EXECUTE ON FUNCTION public\.(\w+)\([^)]*\) TO authenticated/g), (m) => m[1]));
  const rpcs = new Set(Array.from(allSource.matchAll(/\.rpc\(\s*'([a-z_]+)'/g), (m) => m[1]));

  it('every RPC the new code calls is a 040600 definer granted to the browser and declared pending', () => {
    expect([...rpcs].sort()).toEqual(['development_course_archive', 'development_course_promote', 'development_course_save', 'development_settings_save']);
    for (const fn of rpcs) {
      expect(definedFunctions.has(fn), fn).toBe(true);
      expect(granted.has(fn), fn).toBe(true);
      expect(pending, fn).toContain(`${fn}: {`);
    }
  });

  it('writes no table directly: every change goes through a definer', () => {
    for (const { file, text } of sources) {
      // A table delete takes no argument (`.delete()`); URLSearchParams#delete(key) does.
      expect(text, file).not.toMatch(/\.(insert|update|upsert)\(|\.delete\(\)/);
    }
  });

  it('reads the 040600 table and columns through the typed pending client', () => {
    const hooks = read(`${TRAINING_DIR}/useFleetTrainingData.ts`);
    expect(hooks).toContain("developmentDb\n        .from('development_application_events')");
    expect(hooks).toMatch(/developmentDb\s*\.from\('development_applications'\)\s*\.select\('id, stage_entered_at'\)/);
    expect(hooks).toMatch(/developmentDb\.from\('development_courses'\)\.select\(COURSE_RULE_COLUMNS\)/);
    // The live select never names a 040600 column (a missing one would blank the register).
    for (const column of ['stage_entered_at', 'voided_at', 'void_reason', 'valid_for_months', 'final_approval_mode']) {
      expect(read(`${TRAINING_DIR}/fleetTrainingModel.ts`).match(/FLEET_APPLICATION_COLUMNS = \[[\s\S]*?\] as const/)?.[0], column).not.toContain(`'${column}'`);
    }
    expect(SQL).toContain('CREATE TABLE IF NOT EXISTS public.development_application_events');
    expect(pending).toContain('development_application_events: PendingTable<DevelopmentApplicationEventRow>');
  });
});

describe('exports and scope', () => {
  it('names valid source keys and exports personal data', () => {
    const keys = Array.from(allSource.matchAll(/sourceKey: '([^']+)'/g), (m) => m[1]);
    expect(keys.sort()).toEqual(['development.fleet_training_applications', 'development.vessel_crew_training']);
    for (const key of keys) expect(SOURCE_KEY_PATTERN.test(key), key).toBe(true);
    expect(allSource.match(/personalData: true/g)?.length).toBe(2);
    expect(allSource).not.toMatch(/legacyUnlogged/);
  });

  it('the vessel page takes the vessel from the scope, never a name filter', () => {
    const page = read('src/modules/development/pages/CrewTraining.tsx');
    expect(page).toContain('useVesselScope()');
    expect(page).not.toMatch(/vessel\?\.name\s*!==|vessel\.name\s*===|ALLOWED_ROLES|DashboardLayout/);
    const hooks = read(`${TRAINING_DIR}/useFleetTrainingData.ts`);
    expect(hooks).toContain("query = query.eq('vessel_id', vesselId)");
  });
});
