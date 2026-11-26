/**
 * Wiring of the fleet document library (X5-04A; gap/02 FD1, FD2, FD10,
 * X1; DECISIONS D-01, D-04, D-27, D-X5-03; gap/00 A2):
 *
 * - the manifest registers with no problems, data only (no page import),
 *   with `/fleet/documents` on FleetDocumentsPage guarded by
 *   `fleet.operations.fleet_documents.view` and `/fleet/documents/register`
 *   on the unchanged register with guard `scope`; the Documents leaf is
 *   `fleet.compliance` 10, beta, with the same key;
 * - every capability key it declares or names is in the catalogue;
 * - every RPC and table the library code uses is defined in the hour-04
 *   migration and declared in the module's pending types, and the library
 *   reads only through its typed pending client (D-01);
 * - the migration's grants, guards and policies: definers with a
 *   search_path, no write policy, the status vocabulary in the status-tone
 *   registry; the read-hook predicate is not defined yet (X5-05A, after the
 *   platform read-hook test is updated).
 */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import manifest from '@/modules/documents/module';
import { DOCUMENTS_CAPABILITIES, DOCUMENTS_CAPS, DOCUMENTS_FLEET_PATHS, FLEET_DOCUMENTS_PARAMS } from '@/modules/documents/paths';
import { MODULE_REGISTRY } from '@/app/registry/modules';
import { listCatalogueCapabilities } from '@/lib/permissions/catalogue';
import { NAVIGATION_ITEMS } from '@/config/sitemap';
import type { NavChild } from '@/config/navigation-types';
import { statusMeta } from '@/shared/components/status';
import { FLEET_DOCUMENT_STATUSES } from '@/modules/documents/lib/fleetDocumentMachine';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\./.test(name)) out.push(full);
  }
  return out;
}

/** The library's files (the controlled register's older files keep the plain client). */
const LIBRARY_FILES = [
  'src/modules/documents/module.ts',
  'src/modules/documents/paths.ts',
  'src/modules/documents/types/db.pending.ts',
  'src/modules/documents/lib/fleetDocumentsDb.ts',
  'src/modules/documents/lib/fleetDocumentMachine.ts',
  'src/modules/documents/lib/fleetDocumentLibrary.ts',
  'src/modules/documents/lib/documentTaxonomySchema.ts',
  'src/modules/documents/hooks/keys.ts',
  'src/modules/documents/hooks/useFleetDocuments.ts',
  'src/modules/documents/hooks/useFleetDocumentTaxonomy.ts',
  'src/modules/documents/hooks/useFleetDocumentMutations.ts',
  'src/modules/documents/pages/FleetDocumentsPage.tsx',
  'src/modules/documents/components/DocumentSettingsDrawer.tsx',
];
const sources = LIBRARY_FILES.map((file) => ({ file, text: read(file) }));
const allSource = sources.map((s) => s.text).join('\n');
const SQL = read('supabase/migrations/20261124040300_fleet_documents_library.sql');
const pending = read('src/modules/documents/types/db.pending.ts');

const leaves = (items: readonly NavChild[], acc: NavChild[] = []): NavChild[] => {
  for (const it of items) {
    if (it.children?.length) leaves(it.children, acc);
    else acc.push(it);
  }
  return acc;
};

describe('documents manifest', () => {
  it('registers the library and the register in the Fleet scope', () => {
    expect(MODULE_REGISTRY.problems).toEqual([]);
    expect(MODULE_REGISTRY.manifests.find((m) => m.id === 'documents')).toBe(manifest);
    const routes = MODULE_REGISTRY.routes.filter((r) => r.moduleId === 'documents');
    expect(routes.map((r) => r.fullPath).sort()).toEqual(['/fleet/documents', '/fleet/documents/register']);
    expect(DOCUMENTS_FLEET_PATHS).toEqual({ index: 'documents', register: 'documents/register' });
    const [library, register] = manifest.routes ?? [];
    expect(library).toMatchObject({ scope: 'fleet', path: 'documents', guard: { kind: 'capability', capability: 'fleet.operations.fleet_documents.view' } });
    expect(register).toMatchObject({ scope: 'fleet', path: 'documents/register', guard: { kind: 'scope' } });
    const text = read('src/modules/documents/module.ts');
    expect(text).toContain("page: () => import('@/modules/documents/pages/FleetDocumentsPage')");
    expect(text).toContain("page: () => import('@/modules/documents/pages/Documents')");
    expect(FLEET_DOCUMENTS_PARAMS).toEqual({ tab: 'tab', section: 'section', vessel: 'vessel', settings: 'settings' });
  });

  it('is data only: icons, nav builders, types and paths', () => {
    const imports = Array.from(read('src/modules/documents/module.ts').matchAll(/^import .* from '([^']+)';$/gm)).map((m) => m[1]);
    expect(imports.sort()).toEqual(['./paths', '@/app/registry/types', '@/config/navBuilders', '@/modules/fleet/paths', 'lucide-react']);
    const pathImports = Array.from(read('src/modules/documents/paths.ts').matchAll(/^import (type )?.* from '([^']+)';$/gm)).map((m) => [m[1], m[2]]);
    expect(pathImports).toEqual([['type ', '@/lib/permissions/types']]);
  });

  it('contributes the Documents leaf (fleet.compliance 10, beta, gated) and keeps the vessel leaf planned', () => {
    expect(manifest.nav?.map((f) => [f.slot, f.order, f.node.label, f.node.path, f.node.capability, f.node.status])).toEqual([
      ['fleet.compliance', 10, 'Documents', '/fleet/documents', DOCUMENTS_CAPS.view, 'beta'],
      ['vessel.safety', 110, 'Fleet Documents', 'safety/fleet-documents', undefined, undefined],
    ]);
    const leaf = leaves(NAVIGATION_ITEMS).find((l) => l.path === '/fleet/documents');
    expect(leaf).toMatchObject({ label: 'Documents', status: 'beta', capability: 'fleet.operations.fleet_documents.view' });
  });

  it('the notification types stay deferred until their emitters land', () => {
    expect(manifest.notificationTypes?.every((t) => t.status === 'deferred')).toBe(true);
  });
});

describe('capabilities', () => {
  const catalogue = new Set(listCatalogueCapabilities());

  it('every key the manifest declares, and every key the library names, is in the catalogue', () => {
    expect(manifest.capabilities).toEqual(DOCUMENTS_CAPABILITIES);
    for (const key of DOCUMENTS_CAPABILITIES) expect(catalogue.has(key), key).toBe(true);
    const literal = new Set(Array.from(allSource.matchAll(/'((?:fleet|vessel)\.[a-z_]+\.[a-z_]+\.[a-z_]+)'/g)).map((m) => m[1]));
    expect(literal.size).toBeGreaterThanOrEqual(4);
    for (const key of literal) expect(catalogue.has(key), key).toBe(true);
  });
});

describe('database objects', () => {
  const block04 = readdirSync(join(ROOT, 'supabase/migrations'))
    .filter((f) => /^2026112404\d{4}_.*\.sql$/.test(f))
    .map((f) => read(`supabase/migrations/${f}`))
    .join('\n');
  const definedFunctions = new Set(Array.from(block04.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)\s*\(/g), (m) => m[1]));
  const definedTables = new Set(Array.from(block04.matchAll(/CREATE TABLE IF NOT EXISTS public\.(\w+)/g), (m) => m[1]));
  const rpcs = new Set(Array.from(allSource.matchAll(/\.rpc\(\s*'([a-z_]+)'/g), (m) => m[1]));
  const tables = new Set(Array.from(allSource.matchAll(/\.from\(\s*'([a-z_]+)'/g), (m) => m[1]));

  it('calls every library definer and reads the six library tables', () => {
    expect([...rpcs].sort()).toEqual([
      'fleet_document_add_version',
      'fleet_document_create',
      'fleet_document_delete_draft',
      'fleet_document_publish',
      'fleet_document_section_delete',
      'fleet_document_section_save',
      'fleet_document_sections_reorder',
      'fleet_document_set_targets',
      'fleet_document_type_delete',
      'fleet_document_type_save',
      'fleet_document_withdraw',
    ]);
    expect([...tables].sort()).toEqual(['fleet_document_sections', 'fleet_document_types', 'fleet_document_versions', 'fleet_document_vessel_targets', 'fleet_documents']);
  });

  it('everything it uses is defined in block 04 and declared pending', () => {
    for (const fn of rpcs) {
      expect(definedFunctions.has(fn), `${fn} in block 04`).toBe(true);
      expect(pending, `${fn} in db.pending.ts`).toMatch(new RegExp(`\\b${fn}: \\{`));
    }
    for (const t of tables) {
      expect(definedTables.has(t), `${t} in block 04`).toBe(true);
      expect(pending, `${t} in db.pending.ts`).toMatch(new RegExp(`\\b${t}: PendingTable<`));
    }
    expect(pending).toMatch(/\bfleet_document_events: PendingTable</);
    expect(pending).toMatch(/\bfleet_document_update: \{/);
  });

  it('reads and writes only through its typed pending client, never the raw client', () => {
    for (const { file, text } of sources) {
      expect(text, file).not.toMatch(/@\/integrations\/supabase\/client/);
      if (/\.(rpc|from)\(\s*'/.test(text)) expect(text, file).toMatch(/from '\.\.\/lib\/fleetDocumentsDb'/);
    }
    expect(read('src/modules/documents/lib/fleetDocumentsDb.ts')).toMatch(/pendingClient<DocumentsPendingTables, NoPending, DocumentsPendingFunctions>\(\)/);
    for (const s of sources) expect(s.text, s.file).not.toMatch(/\.(insert|update|upsert)\(|\.delete\(\)/);
  });

  it('the page is reached only through the manifest (lazy), and the register page is unchanged', () => {
    const importers = walk(join(ROOT, 'src'))
      .filter((f) => /(import\(|from )'[^']*FleetDocumentsPage'/.test(readFileSync(f, 'utf8')))
      .map((f) => relative(ROOT, f))
      .filter((f) => f !== 'src/modules/documents/pages/FleetDocumentsPage.tsx');
    expect(importers).toEqual(['src/modules/documents/module.ts']);
    expect(read('src/modules/documents/pages/Documents.tsx')).not.toMatch(/fleet_document/);
  });

  it('every definer is SECURITY DEFINER with a search_path; the browser gets only the listed ones', () => {
    const defs = Array.from(SQL.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)\(/g), (m) => m[1]);
    expect(SQL.match(/SECURITY DEFINER\s+SET search_path = public/g)?.length).toBe(defs.length);
    const granted = Array.from(SQL.matchAll(/GRANT EXECUTE ON FUNCTION public\.(\w+)\([^)]*\) TO authenticated[,;]/g), (m) => m[1]).sort();
    expect(granted).toEqual([...rpcs, 'fleet_document_update', 'fleet_document_visible'].sort());
    for (const fn of defs) expect(SQL).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\([^)]*\\) FROM PUBLIC, anon, authenticated, service_role;`));
    expect(SQL).not.toMatch(/FUNCTION public\.fleet_document_file_readable\(/);
  });

  it('RLS is on for every table, with read policies only, and the guards cover every role', () => {
    for (const t of definedTables) {
      if (!t.startsWith('fleet_document')) continue;
      expect(SQL, t).toContain(`ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY;`);
      expect(SQL, t).toMatch(new RegExp(`CREATE POLICY ${t}_select ON public\\.${t}\\s+FOR SELECT TO authenticated`));
      expect(SQL, t).toContain(`COMMENT ON TABLE public.${t} IS`);
    }
    expect(SQL).not.toMatch(/CREATE POLICY \w+ ON public\.fleet_document\w*\s+FOR (INSERT|UPDATE|DELETE|ALL)/);
    for (const g of ['fleet_documents_guard', 'fleet_document_versions_guard', 'fleet_document_vessel_targets_guard', 'fleet_document_events_guard']) {
      expect(SQL).toMatch(new RegExp(`BEFORE INSERT OR UPDATE OR DELETE ON public\\.\\w+\\s+FOR EACH ROW EXECUTE FUNCTION public\\.${g}\\(\\)`));
    }
    expect(SQL.match(/current_setting\('storm\.fleet_tx', true\) = 'on'/g)?.length).toBe(4);
  });

  it('the document statuses are in the status-tone registry', () => {
    for (const status of FLEET_DOCUMENT_STATUSES) expect(statusMeta('fleet_document', status).label, status).not.toBe('');
    expect(statusMeta('fleet_document', 'published').tone).toBe('ok');
    expect(statusMeta('fleet_document', 'draft').tone).toBe('neutral');
  });
});
