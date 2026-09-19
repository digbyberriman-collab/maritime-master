/**
 * Wiring check for New Build: every table, RPC and storage bucket the module
 * touches must be created by a migration.
 *
 * The module shipped writing to `regulations`, `yard_standards` and
 * `schedule_tasks` while reading from their `nb_` equivalents, so saving a
 * record always failed; it uploaded to three buckets that did not exist; and
 * it called two search functions that were never created. This test fails if
 * any of that comes back.
 *
 * Note: the module also calls four edge functions that do not exist in
 * `supabase/functions` — detect-rooms, extract-yard-metadata,
 * index-regulation and index-yard-standard. They are AI-assist paths on top
 * of flows that work manually, and they are tracked as an open gap rather
 * than asserted here.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

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

const migrations = readdirSync(join(ROOT, 'supabase/migrations'))
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => read(`supabase/migrations/${f}`))
  .join('\n');

const createdTables = new Set(
  Array.from(migrations.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?public\.(\w+)/gi)).map((m) => m[1]),
);
const createdFunctions = new Set(
  Array.from(migrations.matchAll(/CREATE (?:OR REPLACE )?FUNCTION (?:public\.)?(\w+)\s*\(/gi)).map((m) => m[1]),
);
const createdBuckets = new Set(
  Array.from(migrations.matchAll(/INTO storage\.buckets[^;]*?VALUES\s*(.+?);/gis))
    .flatMap((m) => Array.from(m[1].matchAll(/\(\s*'([a-z0-9_-]+)'/gi)).map((b) => b[1])),
);

const source = walk(join(ROOT, 'src/modules/new-build'))
  .map((f) => readFileSync(f, 'utf8'))
  .join('\n');

const tables = new Set(
  Array.from(source.matchAll(/\.from\(\s*["']([a-z_]+)["']/g)).map((m) => m[1]),
);
const buckets = new Set(
  Array.from(source.matchAll(/storage\s*\.from\(\s*["']([a-z0-9_-]+)["']/g)).map((m) => m[1]),
);
const rpcs = new Set(
  Array.from(source.matchAll(/\.rpc\(\s*["']([a-z_]+)["']/g)).map((m) => m[1]),
);

describe('New Build wiring', () => {
  it('reads and writes only tables a migration creates', () => {
    expect(tables.size).toBeGreaterThan(10);
    for (const t of tables) {
      expect(createdTables.has(t), `table ${t} is created by a migration`).toBe(true);
    }
  });

  it('no longer writes to the un-prefixed twins of the nb_ tables', () => {
    for (const wrong of ['regulations', 'yard_standards', 'schedule_tasks', 'notifications']) {
      expect(tables.has(wrong), `new-build must not use "${wrong}"`).toBe(false);
    }
    expect(tables.has('nb_regulations')).toBe(true);
    expect(tables.has('nb_yard_standards')).toBe(true);
    expect(tables.has('nb_schedule_tasks')).toBe(true);
  });

  it('uploads only to buckets a migration creates', () => {
    expect(buckets.size).toBeGreaterThan(0);
    for (const b of buckets) {
      expect(createdBuckets.has(b), `bucket ${b} is created by a migration`).toBe(true);
    }
  });

  it('calls only RPCs a migration creates', () => {
    expect(rpcs.has('search_regulations')).toBe(true);
    expect(rpcs.has('search_yard_standards')).toBe(true);
    for (const fn of rpcs) {
      expect(createdFunctions.has(fn), `rpc ${fn} is created by a migration`).toBe(true);
    }
  });

  it('renders search highlights without dangerouslySetInnerHTML', () => {
    expect(source).not.toMatch(/dangerouslySetInnerHTML[\s\S]{0,80}headline/);
    expect(source).toContain('SearchHighlight');
  });
});
