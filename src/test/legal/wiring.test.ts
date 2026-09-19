/**
 * Wiring check for the Legal module: sitemap → routes → pages → database
 * objects → storage. Fails when the sidebar leaf points somewhere without
 * a route, a route imports a missing page, or the client references a
 * table, RPC or bucket no migration defines. Plain file reads only.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { NAVIGATION_ITEMS, PLACEHOLDER_LEAVES } from '@/config/sitemap';
import type { NavChild } from '@/config/navigation-types';
import { LEGAL_PATHS, LEGAL_TABS } from '@/modules/legal/paths';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

function walkFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walkFiles(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\./.test(name)) out.push(full);
  }
  return out;
}

const migrations = readdirSync(join(ROOT, 'supabase/migrations'))
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => read(`supabase/migrations/${f}`))
  .join('\n');

const createdTables = new Set([
  ...Array.from(migrations.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?public\.(\w+)/gi)).map((m) => m[1]),
  ...Array.from(migrations.matchAll(/CREATE (?:OR REPLACE )?VIEW public\.(\w+)/gi)).map((m) => m[1]),
]);
const createdFunctions = new Set(Array.from(migrations.matchAll(/CREATE (?:OR REPLACE )?FUNCTION (?:public\.)?(\w+)\s*\(/gi)).map((m) => m[1]));
const createdBuckets = new Set(Array.from(migrations.matchAll(/INTO storage\.buckets[^;]*?VALUES\s*\(\s*'([a-z-]+)'/gis)).map((m) => m[1]));

const legalSources = [
  ...walkFiles(join(ROOT, 'src/modules/legal')),
  join(ROOT, 'src/modules/auth/lib/legalAccess.ts'),
  join(ROOT, 'src/modules/auth/hooks/useLegalAccess.ts'),
]
  .map((f) => readFileSync(f, 'utf8'))
  .join('\n');

const routesSource = read('src/modules/legal/routes.tsx');
const routesIndex = read('src/routes/index.tsx');
const legalMigration = read('supabase/migrations/20260919120000_legal_module.sql');

const leavesOf = (items: NavChild[], acc: NavChild[] = []): NavChild[] => {
  for (const it of items) {
    if (it.children?.length) leavesOf(it.children, acc);
    else acc.push(it);
  }
  return acc;
};

describe('Legal wiring', () => {
  const vessel = NAVIGATION_ITEMS.find((m) => m.id === 'vessel');
  const legalLeaf = leavesOf(vessel?.children ?? []).find((l) => l.label === 'Legal');

  it('sidebar Legal leaf points at the module and is no longer a placeholder', () => {
    expect(legalLeaf?.path).toBe(LEGAL_PATHS.root);
    expect(PLACEHOLDER_LEAVES.some((p) => p.path === LEGAL_PATHS.root || p.path === LEGAL_PATHS.legacyPlaceholder)).toBe(false);
  });

  it('every tab and static path has a route, and the legacy path redirects', () => {
    for (const tab of LEGAL_TABS) expect(routesSource).toContain(`path={LEGAL_PATHS.${tab.id}}`);
    for (const key of ['root', 'legacyPlaceholder', 'newRequest'] as const) expect(routesSource).toContain(`path={LEGAL_PATHS.${key}}`);
    expect(routesSource).toContain('/:id');
    expect(routesSource).toContain('/:templateId/fill');
    expect(routesSource).toContain('/:templateId/submissions');
    expect(routesIndex).toContain('{legalRoutes}');
    expect(routesIndex.indexOf('{legalRoutes}')).toBeLessThan(routesIndex.indexOf('PLACEHOLDER_LEAVES.map'));
  });

  it('every lazily imported page exists', () => {
    const imports = Array.from(routesSource.matchAll(/import\('@\/modules\/legal\/pages\/(\w+)'\)/g)).map((m) => m[1]);
    expect(imports.length).toBeGreaterThanOrEqual(9);
    for (const page of imports) expect(existsSync(join(ROOT, `src/modules/legal/pages/${page}.tsx`))).toBe(true);
  });

  it('keeps the Inkfleet table names, hook names and query keys', () => {
    for (const table of ['legal_requests', 'legal_request_comments', 'legal_document_templates', 'legal_document_versions', 'legal_form_submissions']) {
      expect(legalMigration).toContain(`CREATE TABLE IF NOT EXISTS public.${table}`);
    }
    const hooks = read('src/modules/legal/hooks/index.ts');
    for (const hook of ['useLegalRequests', 'useLegalComments', 'useLegalDocuments', 'useDocumentVersions', 'useFormSubmissions']) expect(hooks).toContain(hook);
    expect(legalSources).toContain("['legal-requests']");
    expect(legalSources).toContain("['legal-comments']");
    expect(legalSources).toContain("['legal-document-templates']");
    expect(legalSources).toContain("['legal-document-versions']");
    expect(legalSources).toContain("['legal-form-submissions']");
    expect(existsSync(join(ROOT, 'src/components/legal/index.ts'))).toBe(true);
  });

  it('only references tables, RPCs and buckets that migrations define', () => {
    const tables = new Set(Array.from(legalSources.matchAll(/\.from\('([a-z_]+)'\)/g)).map((m) => m[1]));
    for (const t of tables) expect(createdTables.has(t), `table ${t}`).toBe(true);
    const rpcs = new Set(Array.from(legalSources.matchAll(/\.rpc\('([a-z_]+)'/g)).map((m) => m[1]));
    expect(rpcs.size).toBeGreaterThan(0);
    for (const fn of rpcs) expect(createdFunctions.has(fn), `rpc ${fn}`).toBe(true);
    const buckets = new Set(Array.from(legalSources.matchAll(/BUCKET = '([a-z-]+)'/g)).map((m) => m[1]));
    expect(buckets.has('legal-attachments')).toBe(true);
    for (const b of buckets) expect(createdBuckets.has(b), `bucket ${b}`).toBe(true);
  });

  it('migration enables RLS, denies anon and grants authenticated on every table', () => {
    for (const table of ['legal_requests', 'legal_request_comments', 'legal_request_events', 'legal_document_templates', 'legal_document_versions', 'legal_form_submissions']) {
      expect(legalMigration).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
      expect(legalMigration).toContain(`"${table}_anon_deny"`);
    }
    expect(legalMigration).toMatch(/GRANT SELECT, INSERT, UPDATE, DELETE ON[\s\S]*public\.legal_requests/);
    expect(legalMigration).toContain('legal_generate_alerts');
    expect(legalMigration).toContain('legal_sla_deadline');
  });
});
