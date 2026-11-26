/**
 * Wiring of the Fleet operations module (X5-01B; gap/02; gap/00 A2):
 *
 * - the manifest registers with no problems, data only (it imports no page,
 *   hook, component or heavy library), with its two planned leaves gated by
 *   the capability their page will need, and no route yet;
 * - every capability key the module declares or gates with is in the
 *   catalogue;
 * - every RPC and table the module calls is defined in an hour-04 migration
 *   (`2026112404*.sql`) and declared in the module's pending types (D-01:
 *   read through the pending client);
 * - the public API exposes the hooks and components later slices build on,
 *   and nothing else imports the module's internals.
 */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

// The registry imports the route guards, which import the client.
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import manifest from '@/modules/fleet/module';
import * as fleet from '@/modules/fleet';
import { FLEET_CAPABILITIES, FLEET_CAPS } from '@/modules/fleet/paths';
import { FLEET_OPS_AREA_CAPABILITY } from '@/modules/fleet/lib/fleetOpsAccess';
import { MODULE_REGISTRY } from '@/app/registry/modules';
import { listCatalogueCapabilities } from '@/lib/permissions/catalogue';
import { NAVIGATION_ITEMS, VESSEL_MODULES } from '@/config/sitemap';
import type { NavChild } from '@/config/navigation-types';

const ROOT = process.cwd();
const MODULE_DIR = join(ROOT, 'src/modules/fleet');
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
const definedTables = new Set(Array.from(block04.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?public\.(\w+)/gi)).map((m) => m[1]));
const pending = read('src/modules/fleet/types/db.pending.ts');

const leaves = (items: readonly NavChild[], acc: NavChild[] = []): NavChild[] => {
  for (const it of items) {
    if (it.children?.length) leaves(it.children, acc);
    else acc.push(it);
  }
  return acc;
};

describe('fleet manifest', () => {
  it('registers with no problems, in both scopes, with no route yet', () => {
    expect(MODULE_REGISTRY.problems).toEqual([]);
    expect(MODULE_REGISTRY.manifests.find((m) => m.id === 'fleet')).toBe(manifest);
    expect(MODULE_REGISTRY.routes.filter((r) => r.moduleId === 'fleet')).toEqual([]);
    expect(MODULE_REGISTRY.nav.filter((f) => f.moduleId === 'fleet').map((f) => f.slot)).toEqual(['fleet.people', 'vessel.crew']);
    expect(manifest).toMatchObject({ id: 'fleet', label: 'Fleet operations', scopes: ['fleet', 'vessel'] });
    expect(manifest.routes ?? []).toEqual([]);
  });

  it('is data only: icons, nav builders, types and its own paths', () => {
    const imports = Array.from(read('src/modules/fleet/module.ts').matchAll(/^import .* from '([^']+)';$/gm)).map((m) => m[1]);
    expect(imports.sort()).toEqual(['./paths', '@/app/registry/types', '@/config/navBuilders', 'lucide-react']);
    const pathsImports = Array.from(read('src/modules/fleet/paths.ts').matchAll(/^import (type )?.* from '([^']+)';$/gm)).map((m) => [m[1], m[2]]);
    expect(pathsImports).toEqual([['type ', '@/lib/permissions/types']]);
  });

  it('contributes the two planned leaves, each gated by the capability its page will need', () => {
    expect(manifest.nav?.map((f) => [f.slot, f.order, f.node.label, f.node.path, f.node.capability, f.node.status ?? null])).toEqual([
      ['fleet.people', 20, 'Medical', '/fleet/medical', FLEET_CAPS.medicalView, null],
      ['vessel.crew', 60, 'Crew Medical', 'crew/medical', FLEET_CAPS.crewMedicalView, null],
    ]);
    const fleetLeaf = leaves(NAVIGATION_ITEMS).find((l) => l.path === '/fleet/medical');
    expect(fleetLeaf).toMatchObject({ status: 'planned', capability: 'fleet.operations.fleet_medical.view' });
    const vesselLeaf = leaves(VESSEL_MODULES.flatMap((m) => m.children)).find((l) => l.path === 'crew/medical');
    expect(vesselLeaf).toMatchObject({ status: 'planned', capability: 'vessel.crew.crew_medical.view' });
  });
});

describe('capabilities', () => {
  const catalogue = new Set(listCatalogueCapabilities());

  it('every key the manifest declares is in the catalogue', () => {
    expect(manifest.capabilities).toEqual(FLEET_CAPABILITIES);
    expect(FLEET_CAPABILITIES.length).toBeGreaterThan(0);
    for (const key of FLEET_CAPABILITIES) expect(catalogue.has(key), key).toBe(true);
  });

  it('every key the module gates with (area keys, nav leaves) is in the catalogue', () => {
    for (const key of Object.values(FLEET_OPS_AREA_CAPABILITY)) expect(catalogue.has(key), key).toBe(true);
    for (const f of manifest.nav ?? []) if (f.node.capability) expect(catalogue.has(f.node.capability), f.node.capability).toBe(true);
    const literal = new Set(Array.from(allSource.matchAll(/'((?:fleet|vessel|hris|health)\.[a-z_]+\.[a-z_]+\.[a-z_]+)'/g)).map((m) => m[1]));
    expect(literal.size).toBeGreaterThan(0);
    for (const key of literal) expect(catalogue.has(key), key).toBe(true);
  });
});

describe('database objects', () => {
  const rpcs = new Set(Array.from(allSource.matchAll(/\.rpc\(\s*'([a-z_]+)'/g)).map((m) => m[1]));
  const tables = new Set(Array.from(allSource.matchAll(/\.from\(\s*'([a-z_]+)'/g)).map((m) => m[1]));

  it('calls the expiry RPCs and reads the window rules', () => {
    expect([...rpcs].sort()).toEqual(['clear_expiry_window_rule', 'fleet_expiry_items', 'fleet_expiry_summary', 'set_expiry_window_rule']);
    expect([...tables].sort()).toEqual(['expiry_window_rules']);
  });

  it('every RPC it calls is defined in a 2026112404 migration and declared pending', () => {
    for (const fn of rpcs) {
      expect(definedFunctions.has(fn), `${fn} in block 04`).toBe(true);
      expect(pending, `${fn} in db.pending.ts`).toMatch(new RegExp(`\\b${fn}: \\{`));
    }
  });

  it('every table it reads is created in a 2026112404 migration and declared pending', () => {
    for (const t of tables) {
      expect(definedTables.has(t), `${t} in block 04`).toBe(true);
      expect(pending, `${t} in db.pending.ts`).toMatch(new RegExp(`\\b${t}: PendingTable<`));
    }
  });

  it('reads and writes only through the typed pending client, never the raw client', () => {
    for (const { file, text } of sources) {
      if (file.endsWith('lib/fleetDb.ts')) continue;
      expect(text, file).not.toMatch(/@\/integrations\/supabase\/client/);
      if (/\.(rpc|from)\(\s*'/.test(text)) expect(text, file).toMatch(/from '\.\.\/lib\/fleetDb'/);
    }
  });

  it('never writes a status or a window rule directly (definers only)', () => {
    expect(allSource).not.toMatch(/\.from\('expiry_window_rules'\)[\s\S]{0,80}\.(insert|update|upsert|delete)\(/);
  });
});

describe('public API', () => {
  it('exposes the hooks and components the dashboard, reports and documents build on', () => {
    for (const name of [
      'useFleetVesselsShown',
      'useFleetExpiryItems',
      'useFleetExpirySummary',
      'useExpiryWindowRules',
      'useSetExpiryWindowRule',
      'useClearExpiryWindowRule',
      'FleetVesselsFilter',
      'VesselTickHelpers',
      'VesselChecklist',
      'ExpiryBucketSummary',
      'fleetKeys',
      'tallyExpirySummary',
    ]) {
      expect(fleet, name).toHaveProperty(name);
    }
  });

  it('no other module imports the fleet internals (only the public API, paths and the manifest)', () => {
    const others = walk(join(ROOT, 'src')).filter((f) => !f.startsWith(MODULE_DIR) && !f.includes(`${join(ROOT, 'src/test')}`));
    const offenders: string[] = [];
    for (const f of others) {
      const text = readFileSync(f, 'utf8');
      for (const m of text.matchAll(/from '@\/modules\/fleet\/([^']+)'/g)) {
        if (!['paths', 'module'].includes(m[1])) offenders.push(`${relative(ROOT, f)} → ${m[1]}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
