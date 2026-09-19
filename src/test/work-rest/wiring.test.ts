/**
 * Wiring check for Hours of Work & Rest: sidebar → route → service →
 * database objects. The module shipped for months against tables that
 * were never created on the live project (20260501100000 was not applied)
 * and the sidebar route rendered a broken page. This test fails when the
 * service references a table no migration defines or the generated types
 * do not know, when the sidebar leaf stops pointing at the route, or when
 * the old unrouted hours-of-rest page comes back. Plain file reads only.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NAVIGATION_ITEMS } from '@/config/sitemap';
import type { NavChild } from '@/config/navigation-types';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const migrations = readdirSync(join(ROOT, 'supabase/migrations'))
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => read(`supabase/migrations/${f}`))
  .join('\n');
const createdTables = new Set(
  Array.from(migrations.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?public\.(\w+)/gi)).map((m) => m[1]),
);

const types = read('src/integrations/supabase/types.ts');
const typedTables = new Set(Array.from(types.matchAll(/^ {6}([a-z0-9_]+): \{\n {8}Row: \{/gm)).map((m) => m[1]));

const service = read('src/modules/work-rest/services/workRestService.ts');
const routesIndex = read('src/routes/index.tsx');

const WORK_REST_TABLES = [
  'work_rest_rule_sets',
  'vessel_work_rest_settings',
  'work_rest_monthly_submissions',
  'work_rest_records',
  'work_rest_blocks',
  'work_rest_compliance_checks',
  'work_rest_non_conformities',
  'work_rest_notes',
  'work_rest_signatures',
  'work_rest_audit_log',
];

const leavesOf = (items: NavChild[], acc: NavChild[] = []): NavChild[] => {
  for (const it of items) {
    if (it.children?.length) leavesOf(it.children, acc);
    else acc.push(it);
  }
  return acc;
};

describe('Work & Rest wiring', () => {
  it('the migration defines every table the service uses, and the types know them', () => {
    for (const t of WORK_REST_TABLES) {
      expect(createdTables.has(t), `migration creates ${t}`).toBe(true);
      expect(typedTables.has(t), `types.ts knows ${t}`).toBe(true);
    }
    const referenced = new Set(Array.from(service.matchAll(/\.from\('([a-z_]+)'\)/g)).map((m) => m[1]));
    expect(referenced.size).toBeGreaterThan(0);
    for (const t of referenced) {
      expect(createdTables.has(t), `service table ${t} is created by a migration`).toBe(true);
      expect(typedTables.has(t), `service table ${t} is in types.ts`).toBe(true);
    }
  });

  it('the sidebar leaf and the routes agree on /crew/work-rest', () => {
    const leaf = leavesOf(NAVIGATION_ITEMS.flatMap((m) => m.children ?? [])).find((l) => l.path === '/crew/work-rest');
    expect(leaf, 'sidebar leaf for /crew/work-rest').toBeTruthy();
    expect(routesIndex).toContain('path="/crew/work-rest"');
    expect(routesIndex).toContain('path="/crew/work-rest/overview"');
    expect(routesIndex).toContain("import('@/modules/work-rest/pages/MyWorkRestMonth')");
    expect(routesIndex).toContain("import('@/modules/work-rest/pages/WorkRestOverview')");
  });

  it('the superseded hours-of-rest page is gone and the old path redirects', () => {
    expect(existsSync(join(ROOT, 'src/modules/crew/pages/HoursOfRest.tsx'))).toBe(false);
    expect(routesIndex).toMatch(/path="\/crew\/hours-of-rest"[^>]*<Navigate to="\/crew\/work-rest"/);
  });

  it('the leave upgrade tables the crew module reads are defined and typed', () => {
    for (const t of ['crew_leave_policies', 'crew_leave_balance_adjustments']) {
      expect(createdTables.has(t), `migration creates ${t}`).toBe(true);
      expect(typedTables.has(t), `types.ts knows ${t}`).toBe(true);
    }
  });
});
