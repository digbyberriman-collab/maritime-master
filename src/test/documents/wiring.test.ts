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
 * - X5-04B: the publish flow uploads only through the records service, to
 *   the document as the file's entity (no envelope, D-X5-17); the only live
 *   table the library reads is `profiles` (the actors' names); the sample
 *   data pages are gone (gap/00 K1) and no documents page holds sample rows.
 * - X5-05A: the vessel Fleet documents page (`/v/:vesselCode/safety/fleet-documents`,
 *   guard `vessel.safety.fleet_documents.view_own`, lazy) and the Fleet
 *   Documents leaf (vessel.safety 110, beta, the same key); the
 *   acknowledgement code reads only through the typed pending client and
 *   only RPCs defined in 20261124040400 and declared pending; the file
 *   opens through a signed URL of the records bucket; the published and
 *   reminder notification types are live with their emitters in the SQL
 *   (D-238), the sweep's stay deferred; the vessel home and the fleet
 *   dashboard stop calling the legacy acknowledgement hooks.
 */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import manifest from '@/modules/documents/module';
import {
  DOCUMENTS_CAPABILITIES,
  DOCUMENTS_CAPS,
  DOCUMENTS_FLEET_PATHS,
  DOCUMENTS_VESSEL_PATHS,
  FLEET_DOCUMENT_DOC_PARAM,
  FLEET_DOCUMENTS_PARAMS,
  VESSEL_FLEET_DOCUMENTS_CAPS,
} from '@/modules/documents/paths';
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
  'src/modules/documents/lib/fleetDocumentSchema.ts',
  'src/modules/documents/hooks/useFleetDocumentHistory.ts',
  'src/modules/documents/hooks/usePublishFleetDocument.ts',
  'src/modules/documents/components/PublishDocumentDialog.tsx',
  'src/modules/documents/components/VersionHistoryDrawer.tsx',
  'src/modules/documents/components/WithdrawDocumentDialog.tsx',
];

/** Live tables the library reads (names of the people who acted); not pending, not in block 04. */
const LIVE_TABLES = new Set(['profiles']);
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
    expect(routes.map((r) => r.fullPath).sort()).toEqual(['/fleet/documents', '/fleet/documents/register', '/v/:vesselCode/safety/fleet-documents']);
    expect(DOCUMENTS_FLEET_PATHS).toEqual({ index: 'documents', register: 'documents/register' });
    expect(DOCUMENTS_VESSEL_PATHS).toEqual({ fleetDocuments: 'safety/fleet-documents' });
    const [library, register, vesselPage] = manifest.routes ?? [];
    expect(library).toMatchObject({ scope: 'fleet', path: 'documents', guard: { kind: 'capability', capability: 'fleet.operations.fleet_documents.view' } });
    expect(register).toMatchObject({ scope: 'fleet', path: 'documents/register', guard: { kind: 'scope' } });
    expect(vesselPage).toMatchObject({
      scope: 'vessel',
      path: 'safety/fleet-documents',
      guard: { kind: 'capability', capability: 'vessel.safety.fleet_documents.view_own' },
    });
    const text = read('src/modules/documents/module.ts');
    expect(text).toContain("page: () => import('@/modules/documents/pages/FleetDocumentsPage')");
    expect(text).toContain("page: () => import('@/modules/documents/pages/Documents')");
    expect(text).toContain("page: () => import('@/modules/documents/pages/VesselFleetDocumentsPage')");
    expect(FLEET_DOCUMENT_DOC_PARAM).toBe('doc');
    expect(FLEET_DOCUMENTS_PARAMS).toEqual({ tab: 'tab', section: 'section', vessel: 'vessel', settings: 'settings' });
  });

  it('is data only: icons, nav builders, types and paths', () => {
    const imports = Array.from(read('src/modules/documents/module.ts').matchAll(/^import [^;]*? from '([^']+)';$/gm)).map((m) => m[1]);
    expect(imports.sort()).toEqual(['./paths', '@/app/registry/types', '@/config/navBuilders', '@/modules/fleet/paths', 'lucide-react']);
    const pathImports = Array.from(read('src/modules/documents/paths.ts').matchAll(/^import (type )?.* from '([^']+)';$/gm)).map((m) => [m[1], m[2]]);
    expect(pathImports).toEqual([['type ', '@/lib/permissions/types']]);
  });

  it('contributes the Documents leaf (fleet.compliance 10) and the vessel Fleet Documents leaf (vessel.safety 110), both beta and gated', () => {
    expect(manifest.nav?.map((f) => [f.slot, f.order, f.node.label, f.node.path, f.node.capability, f.node.status])).toEqual([
      ['fleet.compliance', 10, 'Documents', '/fleet/documents', DOCUMENTS_CAPS.view, 'beta'],
      ['vessel.safety', 110, 'Fleet Documents', 'safety/fleet-documents', VESSEL_FLEET_DOCUMENTS_CAPS.viewOwn, 'beta'],
    ]);
    const leaf = leaves(NAVIGATION_ITEMS).find((l) => l.path === '/fleet/documents');
    expect(leaf).toMatchObject({ label: 'Documents', status: 'beta', capability: 'fleet.operations.fleet_documents.view' });
  });

  it('the published and reminder types are live (their emitters are in 040400); the sweep\'s stay deferred (D-238)', () => {
    const status = Object.fromEntries((manifest.notificationTypes ?? []).map((t) => [t.key, t.status]));
    expect(status).toEqual({
      fleet_document_published: 'live',
      fleet_document_ack_reminder: 'live',
      fleet_document_ack_due_soon: 'deferred',
      fleet_document_ack_overdue: 'deferred',
      fleet_document_ack_digest: 'deferred',
    });
    const acks = read('supabase/migrations/20261124040400_fleet_documents_acknowledgements.sql');
    for (const key of Object.keys(status)) {
      expect(acks.includes(`'${key}'`), key).toBe(status[key] === 'live');
    }
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
    expect([...tables].sort()).toEqual([
      'fleet_document_sections',
      'fleet_document_types',
      'fleet_document_versions',
      'fleet_document_vessel_targets',
      'fleet_documents',
      'profiles',
    ]);
  });

  it('everything it uses is defined in block 04 and declared pending', () => {
    for (const fn of rpcs) {
      expect(definedFunctions.has(fn), `${fn} in block 04`).toBe(true);
      expect(pending, `${fn} in db.pending.ts`).toMatch(new RegExp(`\\b${fn}: \\{`));
    }
    for (const t of tables) {
      if (LIVE_TABLES.has(t)) continue;
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
    // Every fleet document table of block 04 (the library's 040300 and the acknowledgements' 040400).
    for (const t of definedTables) {
      if (!t.startsWith('fleet_document')) continue;
      expect(block04, t).toContain(`ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY;`);
      expect(block04, t).toMatch(new RegExp(`CREATE POLICY ${t}_select ON public\\.${t}\\s+FOR SELECT TO authenticated`));
      expect(block04, t).toContain(`COMMENT ON TABLE public.${t} IS`);
    }
    expect(block04).not.toMatch(/CREATE POLICY \w+ ON public\.fleet_document\w*\s+FOR (INSERT|UPDATE|DELETE|ALL)/);
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

describe('publishing (X5-04B)', () => {
  it('uploads only through the records service, to the document as the file entity, with no envelope', () => {
    const flow = read('src/modules/documents/hooks/usePublishFleetDocument.ts');
    expect(flow).toMatch(/from '@\/lib\/records\/services\/attachments'/);
    expect(flow).toContain("moduleKey: 'documents', entityType: 'fleet_document'");
    expect(flow).not.toMatch(/envelopeId/);
    expect(flow).not.toMatch(/storage\.from\(|\.upload\(/);
    for (const { file, text } of sources) if (file !== 'src/modules/documents/hooks/usePublishFleetDocument.ts') expect(text, file).not.toMatch(/uploadRecordFile\(/);
  });

  it('runs the steps in the one order the server needs', () => {
    const flow = read('src/modules/documents/hooks/usePublishFleetDocument.ts');
    const order = ["case 'create'", "case 'upload'", "case 'add_version'", "case 'set_targets'", "case 'publish'"].map((c) => flow.indexOf(c));
    expect(order.every((i) => i > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('the sample-data pages are gone and no documents page holds sample rows (gap/00 K1)', () => {
    const pages = readdirSync(join(ROOT, 'src/modules/documents/pages'));
    for (const gone of ['Manuals.tsx', 'Policies.tsx', 'Procedures.tsx']) expect(pages, gone).not.toContain(gone);
    for (const page of pages) expect(read(`src/modules/documents/pages/${page}`), page).not.toMatch(/const mock|SAMPLE_/);
    expect(read('src/modules/documents/index.ts')).not.toMatch(/Manuals|Policies|Procedures/);
    expect(read('src/modules/documents/pages/Documents.tsx')).toMatch(/REGISTER_CATEGORY_PARAM/);
  });
});

describe('acknowledgements (X5-05A)', () => {
  const ACK_FILES = [
    'src/modules/documents/lib/ackState.ts',
    'src/modules/documents/hooks/useFleetDocumentAcks.ts',
    'src/modules/documents/pages/VesselFleetDocumentsPage.tsx',
    'src/modules/documents/components/PendingFleetDocumentsCard.tsx',
  ];
  const ackSources = ACK_FILES.map((file) => ({ file, text: read(file) }));
  const ackAll = ackSources.map((x) => x.text).join('\n');
  const ACK_SQL = read('supabase/migrations/20261124040400_fleet_documents_acknowledgements.sql');
  const ackRpcs = new Set(Array.from(ackAll.matchAll(/\.rpc\(\s*'([a-z_]+)'/g), (m) => m[1]));

  it('reads through the typed pending client only RPCs that 040400 defines and grants to the browser, and declares pending', () => {
    expect([...ackRpcs].sort()).toEqual(['fleet_document_acknowledge', 'fleet_document_my_pending', 'fleet_document_vessel_documents']);
    for (const fn of ackRpcs) {
      expect(ACK_SQL, fn).toMatch(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}\\(`));
      expect(ACK_SQL, fn).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\([^)]*\\) TO authenticated;`));
      expect(pending, fn).toMatch(new RegExp(`\\b${fn}: \\{`));
    }
    for (const t of ['fleet_document_acknowledgements', 'fleet_document_signer_rules', 'fleet_document_reminders']) {
      expect(pending, t).toMatch(new RegExp(`\\b${t}: PendingTable<`));
    }
    for (const { file, text } of ackSources) {
      expect(text, file).not.toMatch(/@\/integrations\/supabase\/client/);
      expect(text, file).not.toMatch(/\.from\(\s*'/);
      expect(text, file).not.toMatch(/\.(insert|update|upsert)\(|\.delete\(\)/);
      if (/\.rpc\(\s*'/.test(text)) expect(text, file).toMatch(/from '\.\.\/lib\/fleetDocumentsDb'/);
    }
  });

  it('opens the file through a signed URL of the private records bucket, never a public URL', () => {
    const hook = read('src/modules/documents/hooks/useFleetDocumentAcks.ts');
    expect(hook).toMatch(/\.storage\.from\(RECORD_FILES_BUCKET\)\.createSignedUrl\(/);
    expect(ackAll).not.toMatch(/getPublicUrl/);
  });

  it('the vessel page is reached only through the manifest (lazy); the card is imported by the two dashboards only', () => {
    const files = walk(join(ROOT, 'src')).map((f) => ({ f: relative(ROOT, f), text: readFileSync(f, 'utf8') }));
    const pageImporters = files.filter((x) => /(import\(|from )'[^']*VesselFleetDocumentsPage'/.test(x.text)).map((x) => x.f);
    expect(pageImporters).toEqual(['src/modules/documents/module.ts']);
    const cardImporters = files
      .filter((x) => /from '[^']*PendingFleetDocumentsCard'/.test(x.text) && x.f !== 'src/modules/documents/components/PendingFleetDocumentsCard.tsx')
      .map((x) => x.f)
      .sort();
    expect(cardImporters).toEqual(['src/modules/dashboard/pages/FleetDashboardPage.tsx', 'src/modules/vessels/pages/VesselDashboard.tsx']);
  });

  it('the dashboards no longer call the legacy acknowledgement hooks (the auth hooks stay untouched)', () => {
    for (const f of ['src/modules/vessels/pages/VesselDashboard.tsx', 'src/modules/dashboard/pages/FleetDashboardPage.tsx', ...ACK_FILES]) {
      expect(read(f), f).not.toMatch(/useMandatoryDocumentsPending|useAcknowledgmentStats/);
    }
  });

  it('the acknowledgement states are in the status-tone registry', () => {
    for (const state of ['pending', 'overdue', 'blocked', 'acknowledged', 'not_required']) {
      expect(statusMeta('document_ack', state).label, state).not.toBe('');
    }
    expect(statusMeta('document_ack', 'overdue').tone).toBe('danger');
    expect(statusMeta('document_ack', 'acknowledged').tone).toBe('ok');
  });

  it('040400 defines the storage read-hook predicate with the exact signature the hook names (PR-07)', () => {
    expect(ACK_SQL).toMatch(/CREATE OR REPLACE FUNCTION public\.fleet_document_file_readable\(p_user_id uuid, p_document_id uuid\)\s+RETURNS boolean/);
    expect(ACK_SQL).toMatch(/GRANT EXECUTE ON FUNCTION public\.fleet_document_file_readable\(uuid, uuid\) TO service_role;/);
    expect(ACK_SQL).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.fleet_document_file_readable\(uuid, uuid\) TO authenticated/);
  });

  it('every 040400 definer has a search_path, every emit is guarded, and no table has a browser write policy', () => {
    const defs = Array.from(ACK_SQL.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)\(/g), (m) => m[1]);
    for (const fn of defs) expect(ACK_SQL).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\([^)]*\\) FROM PUBLIC, anon, authenticated, service_role;`));
    expect(ACK_SQL).not.toMatch(/CREATE POLICY \w+ ON public\.fleet_document\w*\s+FOR (INSERT|UPDATE|DELETE|ALL)/);
    const emits = ACK_SQL.split('PERFORM public.emit_notification_event(').length - 1;
    expect(emits).toBe(2);
    expect(ACK_SQL.split('EXCEPTION WHEN others THEN\n      RAISE WARNING').length - 1).toBe(emits);
  });
});
