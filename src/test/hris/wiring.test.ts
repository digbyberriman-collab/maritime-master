/**
 * End-to-end wiring check for the HRIS module: navigation → routes → pages →
 * database objects → edge functions. Fails when a nav leaf has no route, a
 * route imports a missing page, or the client references a table, view,
 * RPC, bucket or edge function that no migration / function directory
 * defines. Runs on plain file reads so it needs no browser or database.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { NAVIGATION_ITEMS, PLACEHOLDER_LEAVES } from '@/config/sitemap';
import type { NavChild } from '@/config/navigation-types';
import { HRIS_PATHS } from '@/modules/hris/paths';

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

const hrisSources = [
  ...walkFiles(join(ROOT, 'src/modules/hris')),
  join(ROOT, 'src/modules/compliance/pages/HRPage.tsx'),
  join(ROOT, 'src/lib/storage/crewDocuments.ts'),
].map((f) => readFileSync(f, 'utf8')).join('\n');

const routesSource = read('src/modules/hris/routes.tsx');
const routesIndex = read('src/routes/index.tsx');

const leavesOf = (items: NavChild[], acc: NavChild[] = []): NavChild[] => {
  for (const it of items) {
    if (it.children?.length) leavesOf(it.children, acc);
    else acc.push(it);
  }
  return acc;
};

describe('HRIS wiring', () => {
  const hris = NAVIGATION_ITEMS.find((m) => m.id === 'hris');
  const hrisLeaves = leavesOf(hris?.children ?? []);
  const hrisRoutePaths = new Set(
    Array.from(routesSource.matchAll(/path=\{HRIS_PATHS\.(\w+)\}/g)).map((m) => (HRIS_PATHS as Record<string, string>)[m[1]]),
  );
  const explicitRoutes = new Set(Array.from(routesIndex.matchAll(/path="([^"]+)"/g)).map((m) => m[1]));

  it('every HRIS nav leaf lands on a registered route, not a placeholder', () => {
    const placeholders = new Set(PLACEHOLDER_LEAVES.map((l) => l.path));
    const unrouted = hrisLeaves
      .map((l) => l.path.split('?')[0])
      .filter((p) => !hrisRoutePaths.has(p) && !explicitRoutes.has(p));
    expect(unrouted).toEqual([]);
    // A leaf may still appear in PLACEHOLDER_LEAVES (the sitemap generates
    // them), but the explicit route above must exist so it never renders.
    const stillPlaceholderOnly = hrisLeaves
      .map((l) => l.path.split('?')[0])
      .filter((p) => placeholders.has(p) && !hrisRoutePaths.has(p) && !explicitRoutes.has(p));
    expect(stillPlaceholderOnly).toEqual([]);
  });

  it('every HRIS route imports a page file that exists and is not a stub', () => {
    const pages = Array.from(routesSource.matchAll(/import\('@\/modules\/hris\/pages\/(\w+)'\)/g)).map((m) => m[1]);
    expect(pages.length).toBeGreaterThan(15);
    for (const page of pages) {
      const file = join(ROOT, 'src/modules/hris/pages', `${page}.tsx`);
      expect(existsSync(file), `${page}.tsx missing`).toBe(true);
      expect(readFileSync(file, 'utf8').includes('PlaceholderPage'), `${page}.tsx is still a stub`).toBe(false);
    }
  });

  it('every table and view the HRIS client reads or writes is created by a migration', () => {
    const used = new Set(Array.from(hrisSources.matchAll(/(?<!storage\s*)\.from\('([a-z_]+)'\)/g)).map((m) => m[1]));
    const missing = Array.from(used).filter((t) => !createdTables.has(t));
    expect(missing).toEqual([]);
  });

  it('every RPC the HRIS client calls is defined by a migration', () => {
    const used = new Set(Array.from(hrisSources.matchAll(/\.rpc\('([a-z_]+)'/g)).map((m) => m[1]));
    const missing = Array.from(used).filter((fn) => !createdFunctions.has(fn));
    expect(missing).toEqual([]);
  });

  it('every storage bucket the HRIS client uses exists', () => {
    const used = new Set(Array.from(hrisSources.matchAll(/storage\s*\.from\('([a-z-]+)'\)/g)).map((m) => m[1]));
    // `documents` and `crew-travel-documents` predate HRIS and are created with
    // a different INSERT shape; assert the migrations mention them at all.
    const missing = Array.from(used).filter((b) => !createdBuckets.has(b) && !migrations.includes(`'${b}'`));
    expect(missing).toEqual([]);
  });

  it('every edge function the HRIS client invokes has a function directory', () => {
    const used = new Set(Array.from(hrisSources.matchAll(/functions\.invoke\('([a-z-]+)'/g)).map((m) => m[1]));
    const missing = Array.from(used).filter((fn) => !existsSync(join(ROOT, 'supabase/functions', fn)));
    expect(missing).toEqual([]);
  });

  it('the daily sweeper calls only functions the migrations define', () => {
    const sweeper = read('supabase/functions/hr-daily-sweeper/index.ts');
    const called = Array.from(sweeper.matchAll(/'(hr_[a-z_]+)'/g)).map((m) => m[1]);
    expect(called.length).toBeGreaterThan(0);
    expect(called.filter((fn) => !createdFunctions.has(fn))).toEqual([]);
  });
});
