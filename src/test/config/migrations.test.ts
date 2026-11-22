/**
 * Migration invariants (BUILD-PLAN B10; gap/00 E1, E2, §3; DECISIONS D-01,
 * D-12).
 *
 * Every file in supabase/migrations:
 * - is named `<14-digit version>_<name>.sql`, and no two files share a
 *   version, except the one accepted legacy duplicate 20260919120000 (two
 *   applied files, which the Supabase CLI sees as one version);
 * - is listed in supabase/MIGRATIONS-LEDGER.md with a known status, unless it
 *   is a Lovable UUID-named copy (Lovable ran it).
 *
 * Every file from the build-out (version >= 20261123000000) is also
 * idempotent and safe, because the owner applies it by hand and Lovable may
 * re-run a pasted copy (D-01, D-12):
 * - `CREATE TABLE` / `CREATE INDEX` / `CREATE SEQUENCE` / `CREATE SCHEMA` /
 *   `CREATE EXTENSION` carry `IF NOT EXISTS`;
 * - each `CREATE POLICY` follows a `DROP POLICY IF EXISTS` for the same
 *   policy and table, each `CREATE TRIGGER` a `DROP TRIGGER IF EXISTS`;
 * - functions and views are `CREATE OR REPLACE`; a `CREATE TYPE` sits in a
 *   guarded `DO` block; every `INSERT` has `ON CONFLICT` or a `NOT EXISTS`
 *   guard;
 * - every table it creates has `ENABLE ROW LEVEL SECURITY` (a statement, or
 *   a `DO` loop that names the table), and no policy is
 *   `USING (true)` / `WITH CHECK (true)` for anyone but `service_role`;
 * - its name is `<version>_<module>_<topic>.sql` in lower snake case, with the
 *   hour inside a stream block (00–13, gap/00 §3).
 *
 * Statements inside dollar-quoted bodies (functions, `DO` blocks) are not
 * checked: they are code, and dynamic SQL cannot be read statically.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const MIGRATIONS = join(ROOT, 'supabase/migrations');
const LEDGER = join(ROOT, 'supabase/MIGRATIONS-LEDGER.md');

/** The first build-out version (D-12): files from here on must be idempotent. */
export const BUILD_OUT_FROM = '20261123000000';
/** The one shared version that predates the rule (gap/00 E1). */
const ACCEPTED_DUPLICATES = new Map([['20260919120000', ['20260919120000_health_phase3_wellness.sql', '20260919120000_legal_module.sql']]]);
const LEDGER_STATUSES = new Set(['applied', 'written, not applied', 'unknown']);

const FILE_NAME = /^(\d{14})_(.+)\.sql$/;
const LOVABLE_COPY = /^\d{14}_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.sql$/;
const BUILD_OUT_NAME = /^(\d{8})(\d{2})(\d{4})_[a-z][a-z0-9]*(?:_[a-z0-9]+)+\.sql$/;

/**
 * Top-level SQL statements, without comments and without the contents of
 * dollar-quoted bodies (each body is kept as `$$…$$` so `DO $$…$$` still
 * reads as a DO block). Quoted strings and identifiers are kept as written.
 * The bodies themselves are collected in `bodies` when given.
 */
export function topLevelStatements(sql: string, bodies: string[] = []): string[] {
  const out: string[] = [];
  let current = '';
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i];
    const next = sql[i + 1];
    if (ch === '-' && next === '-') {
      const end = sql.indexOf('\n', i);
      i = end === -1 ? sql.length : end;
      continue;
    }
    if (ch === '/' && next === '*') {
      const end = sql.indexOf('*/', i + 2);
      i = end === -1 ? sql.length : end + 2;
      current += ' ';
      continue;
    }
    if (ch === "'" || ch === '"') {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === ch && sql[j + 1] === ch) j += 2;
        else if (sql[j] === ch) break;
        else j += 1;
      }
      current += sql.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (ch === '$') {
      const tag = sql.slice(i).match(/^\$[A-Za-z_]*\$/)?.[0];
      if (tag) {
        const end = sql.indexOf(tag, i + tag.length);
        bodies.push(sql.slice(i + tag.length, end === -1 ? sql.length : end));
        current += '$$…$$';
        i = end === -1 ? sql.length : end + tag.length;
        continue;
      }
    }
    if (ch === ';') {
      if (current.trim()) out.push(current.replace(/\s+/g, ' ').trim());
      current = '';
      i += 1;
      continue;
    }
    current += ch;
    i += 1;
  }
  if (current.trim()) out.push(current.replace(/\s+/g, ' ').trim());
  return out;
}

const IDENT = String.raw`(?:"[^"]+"|[A-Za-z_][\w$]*)`;
const QUALIFIED = String.raw`(?:${IDENT}\.)?${IDENT}`;
const unquote = (name: string) => name.replace(/"/g, '').replace(/^public\./i, '').toLowerCase();

/** Everything that keeps a build-out file from being safe to run twice (or at all). */
export function idempotencyProblems(sql: string): string[] {
  const bodies: string[] = [];
  const statements = topLevelStatements(sql, bodies);
  const problems: string[] = [];
  const droppedPolicies = new Set<string>();
  const droppedTriggers = new Set<string>();
  const createdTables: string[] = [];
  const rlsEnabled = new Set<string>();

  for (const raw of statements) {
    const s = raw;
    const short = s.length > 120 ? `${s.slice(0, 117)}...` : s;
    let m: RegExpMatchArray | null;

    if ((m = s.match(new RegExp(String.raw`^DROP POLICY IF EXISTS (${IDENT}) ON (${QUALIFIED})`, 'i')))) {
      droppedPolicies.add(`${unquote(m[1])}@${unquote(m[2])}`);
      continue;
    }
    if ((m = s.match(new RegExp(String.raw`^DROP TRIGGER IF EXISTS (${IDENT}) ON (${QUALIFIED})`, 'i')))) {
      droppedTriggers.add(`${unquote(m[1])}@${unquote(m[2])}`);
      continue;
    }
    if ((m = s.match(new RegExp(String.raw`^ALTER TABLE (?:IF EXISTS )?(?:ONLY )?(${QUALIFIED}) ENABLE ROW LEVEL SECURITY`, 'i')))) {
      rlsEnabled.add(unquote(m[1]));
      continue;
    }
    if (/^CREATE (?:UNLOGGED |TEMP |TEMPORARY )?TABLE /i.test(s)) {
      if (!/^CREATE (?:UNLOGGED )?TABLE IF NOT EXISTS /i.test(s)) problems.push(`CREATE TABLE without IF NOT EXISTS: ${short}`);
      const name = s.match(new RegExp(String.raw`^CREATE (?:UNLOGGED )?TABLE (?:IF NOT EXISTS )?(${QUALIFIED})`, 'i'))?.[1];
      if (name) createdTables.push(unquote(name));
      continue;
    }
    if (/^CREATE (?:UNIQUE )?INDEX /i.test(s)) {
      if (!/^CREATE (?:UNIQUE )?INDEX (?:CONCURRENTLY )?IF NOT EXISTS /i.test(s)) problems.push(`CREATE INDEX without IF NOT EXISTS: ${short}`);
      continue;
    }
    if ((m = s.match(/^CREATE (SEQUENCE|SCHEMA|EXTENSION) /i))) {
      if (!new RegExp(`^CREATE ${m[1]} IF NOT EXISTS `, 'i').test(s)) problems.push(`CREATE ${m[1].toUpperCase()} without IF NOT EXISTS: ${short}`);
      continue;
    }
    if ((m = s.match(new RegExp(String.raw`^CREATE POLICY (${IDENT}) ON (${QUALIFIED})`, 'i')))) {
      if (!droppedPolicies.has(`${unquote(m[1])}@${unquote(m[2])}`)) {
        problems.push(`CREATE POLICY ${m[1]} ON ${m[2]} without a DROP POLICY IF EXISTS before it`);
      }
      const permissive = /\b(?:USING|WITH CHECK) \(\s*true\s*\)/i.test(s);
      if (permissive && !/\bTO service_role\b/i.test(s)) problems.push(`policy ${m[1]} ON ${m[2]} is USING (true) / WITH CHECK (true)`);
      continue;
    }
    if ((m = s.match(new RegExp(String.raw`^CREATE (?:CONSTRAINT )?TRIGGER (${IDENT}) .*? ON (${QUALIFIED})`, 'i')))) {
      if (!/^CREATE OR REPLACE /i.test(s) && !droppedTriggers.has(`${unquote(m[1])}@${unquote(m[2])}`)) {
        problems.push(`CREATE TRIGGER ${m[1]} ON ${m[2]} without a DROP TRIGGER IF EXISTS before it`);
      }
      continue;
    }
    if (/^CREATE (?:FUNCTION|PROCEDURE|VIEW) /i.test(s)) {
      problems.push(`CREATE without OR REPLACE: ${short}`);
      continue;
    }
    if (/^CREATE TYPE /i.test(s)) {
      problems.push(`CREATE TYPE outside a guarded DO block: ${short}`);
      continue;
    }
    if (/^INSERT INTO /i.test(s) && !/\bON CONFLICT\b/i.test(s) && !/\bNOT EXISTS\b/i.test(s)) {
      problems.push(`INSERT without ON CONFLICT or a NOT EXISTS guard: ${short}`);
    }
  }

  // RLS may also be switched on in a DO loop over table names
  // (`FOREACH t IN ARRAY ARRAY['a','b'] LOOP EXECUTE format('ALTER TABLE … ENABLE ROW LEVEL SECURITY', t)`).
  const loopEnabled = (table: string) =>
    bodies.some((b) => /ENABLE ROW LEVEL SECURITY/i.test(b) && new RegExp(`'${table}'`, 'i').test(b));
  for (const table of createdTables) {
    if (!rlsEnabled.has(table) && !loopEnabled(table)) problems.push(`table ${table} is created without ENABLE ROW LEVEL SECURITY`);
  }
  return problems;
}

/** Problems with a build-out file's name (D-12 blocks, gap/00 §3). */
export function buildOutNameProblems(file: string): string[] {
  const m = file.match(BUILD_OUT_NAME);
  if (!m) return [`${file}: name must be <version>_<module>_<topic>.sql in lower snake case`];
  const hour = Number(m[2]);
  return hour <= 13 ? [] : [`${file}: hour ${m[2]} is outside the stream blocks 00–13 (gap/00 §3)`];
}

interface LedgerRow {
  file: string;
  status: string;
}

/** The rows of the ledger table (the "## Ledger" section only). */
export function ledgerRows(markdown: string): LedgerRow[] {
  const start = markdown.indexOf('\n## Ledger');
  if (start === -1) return [];
  const rest = markdown.slice(start + 1);
  const end = rest.indexOf('\n## ', 3);
  const section = end === -1 ? rest : rest.slice(0, end);
  const rows: LedgerRow[] = [];
  for (const line of section.split('\n')) {
    const cells = line.split('|').map((c) => c.trim());
    const file = cells[2]?.match(/^`([^`]+\.sql)`$/)?.[1];
    if (file) rows.push({ file, status: cells[3] ?? '' });
  }
  return rows;
}

const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();
const read = (f: string) => readFileSync(join(MIGRATIONS, f), 'utf8');
const versionOf = (f: string) => f.match(FILE_NAME)?.[1] ?? '';

describe('migration files (gap/00 E1)', () => {
  it('has the migration history', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it('every file is named <14-digit version>_<name>.sql', () => {
    expect(files.filter((f) => !FILE_NAME.test(f))).toEqual([]);
  });

  it('no two files share a version, except the accepted legacy 20260919120000', () => {
    const byVersion = new Map<string, string[]>();
    for (const f of files) byVersion.set(versionOf(f), [...(byVersion.get(versionOf(f)) ?? []), f]);
    const dupes = Array.from(byVersion).filter(([version, names]) => {
      if (names.length < 2) return false;
      const accepted = ACCEPTED_DUPLICATES.get(version);
      return !accepted || names.length !== accepted.length || names.some((n) => !accepted.includes(n));
    });
    expect(dupes).toEqual([]);
  });

  it('every build-out file is idempotent, enables RLS and is named in its block (D-12)', () => {
    const buildOut = files.filter((f) => versionOf(f) >= BUILD_OUT_FROM);
    const problems = buildOut.flatMap((f) => [...buildOutNameProblems(f), ...idempotencyProblems(read(f)).map((p) => `${f}: ${p}`)]);
    expect(problems).toEqual([]);
  });
});

describe('migrations ledger (gap/00 E2, D-01)', () => {
  const rows = ledgerRows(readFileSync(LEDGER, 'utf8'));
  const handWritten = files.filter((f) => !LOVABLE_COPY.test(f));

  it('reads the ledger table', () => {
    expect(rows.length).toBeGreaterThanOrEqual(27);
  });

  it('lists every hand-written migration exactly once', () => {
    const listed = rows.map((r) => r.file);
    expect(handWritten.filter((f) => !listed.includes(f))).toEqual([]);
    expect(listed.filter((f, i) => listed.indexOf(f) !== i)).toEqual([]);
  });

  it('lists only files that exist and are not Lovable copies', () => {
    expect(rows.map((r) => r.file).filter((f) => !handWritten.includes(f))).toEqual([]);
  });

  it('gives every row a known status', () => {
    expect(rows.filter((r) => !LEDGER_STATUSES.has(r.status)).map((r) => `${r.file}: ${r.status}`)).toEqual([]);
  });

  it('records the security fixes whose live state is not known yet', () => {
    const status = (f: string) => rows.find((r) => r.file === f)?.status;
    expect(status('20260919170000_nb_company_scope.sql')).not.toBe('applied');
    expect(status('20260919170100_signup_backstop.sql')).not.toBe('applied');
  });
});

describe('the checks catch what they should (fixtures)', () => {
  const good = `
-- =================================================================
-- SAFETY permits
-- =================================================================
CREATE TABLE IF NOT EXISTS public.safety_permits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  note text DEFAULT 'it''s fine; really'
);
CREATE INDEX IF NOT EXISTS idx_safety_permits_company ON public.safety_permits(company_id);
ALTER TABLE public.safety_permits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "safety_permits_select" ON public.safety_permits;
CREATE POLICY "safety_permits_select" ON public.safety_permits FOR SELECT TO authenticated
  USING (public.user_belongs_to_company(auth.uid(), company_id));
DROP POLICY IF EXISTS "safety_permits_service" ON public.safety_permits;
CREATE POLICY "safety_permits_service" ON public.safety_permits FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE OR REPLACE FUNCTION public.safety_touch() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  CREATE TABLE should_not_count (id int);
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS trg_safety_touch ON public.safety_permits;
CREATE TRIGGER trg_safety_touch BEFORE UPDATE ON public.safety_permits FOR EACH ROW EXECUTE FUNCTION public.safety_touch();
DO $$ BEGIN CREATE TYPE public.permit_kind AS ENUM ('hot_work'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
INSERT INTO public.modules (key) VALUES ('safety.permits') ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS public.safety_permit_steps (id uuid PRIMARY KEY);
CREATE TABLE IF NOT EXISTS public.safety_permit_checks (id uuid PRIMARY KEY);
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['safety_permit_steps', 'safety_permit_checks'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;
INSERT INTO public.safety_permit_steps (id) SELECT gen_random_uuid() WHERE NOT EXISTS (SELECT 1 FROM public.safety_permit_steps);
INSERT INTO public.safety_permit_checks (id)
  SELECT p.id FROM public.safety_permits p WHERE p.company_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.safety_permit_checks c WHERE c.id = p.id);
/* CREATE TABLE in a comment; */
`;

  it('passes an idempotent file', () => {
    expect(idempotencyProblems(good)).toEqual([]);
  });

  it('splits statements around strings, comments and dollar-quoted bodies', () => {
    const statements = topLevelStatements(good);
    expect(statements.some((s) => s.includes('should_not_count'))).toBe(false);
    expect(statements.some((s) => s.includes("'it''s fine; really'"))).toBe(true);
    expect(statements.some((s) => s.startsWith('DO $$…$$'))).toBe(true);
  });

  it('fails each kind of non-idempotent CREATE', () => {
    const bad = `
CREATE TABLE public.a (id int);
CREATE INDEX idx_a ON public.a(id);
CREATE UNIQUE INDEX idx_a2 ON public.a(id);
CREATE POLICY "a_select" ON public.a FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "other" ON public.a;
CREATE POLICY "a_insert" ON public.a FOR INSERT TO authenticated WITH CHECK (true);
CREATE FUNCTION public.f() RETURNS int LANGUAGE sql AS $$ SELECT 1 $$;
CREATE VIEW public.v AS SELECT 1;
CREATE TRIGGER trg_a BEFORE UPDATE ON public.a FOR EACH ROW EXECUTE FUNCTION public.f();
CREATE TYPE public.k AS ENUM ('x');
INSERT INTO public.modules (key) VALUES ('x');
CREATE SEQUENCE public.s;
`;
    const problems = idempotencyProblems(bad).join('\n');
    expect(problems).toContain('CREATE TABLE without IF NOT EXISTS');
    expect(problems.match(/CREATE INDEX without IF NOT EXISTS/g)).toHaveLength(2);
    expect(problems).toContain('CREATE POLICY "a_select" ON public.a without a DROP POLICY IF EXISTS');
    expect(problems).toContain('CREATE POLICY "a_insert" ON public.a without a DROP POLICY IF EXISTS');
    expect(problems).toContain('policy "a_insert" ON public.a is USING (true) / WITH CHECK (true)');
    expect(problems.match(/CREATE without OR REPLACE/g)).toHaveLength(2);
    expect(problems).toContain('CREATE TRIGGER trg_a ON public.a without a DROP TRIGGER IF EXISTS');
    expect(problems).toContain('CREATE TYPE outside a guarded DO block');
    expect(problems).toContain('INSERT without ON CONFLICT or a NOT EXISTS guard');
    expect(problems).toContain('CREATE SEQUENCE without IF NOT EXISTS');
    expect(problems).toContain('table a is created without ENABLE ROW LEVEL SECURITY');
  });

  it('a DROP POLICY for another table does not count', () => {
    const sql = `DROP POLICY IF EXISTS "p" ON public.b; CREATE POLICY "p" ON public.a FOR SELECT USING (false);`;
    expect(idempotencyProblems(sql)).toEqual(['CREATE POLICY "p" ON public.a without a DROP POLICY IF EXISTS before it']);
  });

  it('checks build-out names and blocks', () => {
    expect(buildOutNameProblems('20261124070000_safety_permits.sql')).toEqual([]);
    expect(buildOutNameProblems('20261124010000_platform_vessel_code.sql')).toEqual([]);
    expect(buildOutNameProblems('20261124140000_safety_permits.sql')[0]).toContain('outside the stream blocks');
    expect(buildOutNameProblems('20261124070000_Safety-Permits.sql')[0]).toContain('lower snake case');
    expect(buildOutNameProblems('20261124070000_permits.sql')[0]).toContain('<module>_<topic>');
  });

  it('only the build-out is held to the rules', () => {
    expect('20260919170000' >= BUILD_OUT_FROM).toBe(false);
    expect('20261123000000' >= BUILD_OUT_FROM).toBe(true);
  });

  it('parses ledger rows from the Ledger section only', () => {
    const md = [
      '## Ledger',
      '| # | File | Status | Evidence | Lovable copy | Notes |',
      '|---|---|---|---|---|---|',
      '| 1 | `20260101000000_a.sql` | applied | x | — | |',
      '',
      '## Apply queue',
      '| 1 | `20260101000000_a.sql` | Query A | Apply |',
    ].join('\n');
    expect(ledgerRows(`# Title\n\n${md}`)).toEqual([{ file: '20260101000000_a.sql', status: 'applied' }]);
  });
});
