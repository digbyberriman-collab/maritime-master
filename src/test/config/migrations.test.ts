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
 * Per-stream ledger fragments (Phase 3 wave 1, platform prep PP1): every
 * supabase/MIGRATIONS-LEDGER.d/*.md has the main ledger's "## Ledger" and
 * "## Apply queue" tables and declares its block (`**Block:** \`<10
 * digits>\``) and queue prefix (`**Queue prefix:** \`<letters>\``). Each
 * hand-written file is listed exactly once across the main ledger and the
 * fragments; a fragment lists only files of its block, blocks never
 * overlap, and every fragment row has exactly one Apply queue row in that
 * fragment, ordered <prefix>1, <prefix>2, … (no file of a fragment is in
 * the main queue). The integrator folds the fragments back at the wave merge.
 *
 * Every file from the build-out (version >= 20261123000000) is also
 * idempotent and safe, because the owner applies it by hand and Lovable may
 * re-run a pasted copy (D-01, D-12). The check is an allow-list: a top-level
 * statement must match one of the forms below, or it fails as
 * "unrecognised top-level statement (wrap it in a guarded DO block)". That
 * catches `ALTER PUBLICATION … ADD / DROP TABLE` (wrap it in a `DO` block
 * with an `EXCEPTION WHEN duplicate_object` / `undefined_object` guard), a
 * `CREATE RULE` that is not `OR REPLACE`, `CREATE ROLE` and
 * `CREATE EVENT TRIGGER`.
 * - `CREATE TABLE` / `CREATE INDEX` / `CREATE SEQUENCE` / `CREATE SCHEMA` /
 *   `CREATE EXTENSION` / `CREATE MATERIALIZED VIEW` (and any other
 *   `CREATE <kind> IF NOT EXISTS`) carry `IF NOT EXISTS`;
 * - `ALTER TABLE` actions (split on top-level commas) are an allow-list too:
 *   every `ADD COLUMN` (or bare `ADD <col>`) carries `IF NOT EXISTS`; every
 *   `ADD CONSTRAINT <name>` follows a `DROP CONSTRAINT IF EXISTS <name>` for
 *   the same table (an earlier statement or an earlier action in the same
 *   list; Postgres has no `ADD CONSTRAINT IF NOT EXISTS`); unnamed
 *   `ADD PRIMARY KEY` / `UNIQUE` / `CHECK` / `FOREIGN KEY` / `EXCLUDE`
 *   cannot be guarded and fail; `DROP COLUMN` / `DROP CONSTRAINT` carry
 *   `IF EXISTS`; otherwise only ENABLE / DISABLE / FORCE / NO FORCE ROW
 *   LEVEL SECURITY, `ALTER [COLUMN] …` (not `ADD GENERATED`, nor
 *   `DROP IDENTITY` / `DROP EXPRESSION` without `IF EXISTS`), `SET (…)` /
 *   `RESET (…)`, `SET LOGGED` / `UNLOGGED` / `TABLESPACE` /
 *   `WITHOUT CLUSTER`, `OWNER TO`, `REPLICA IDENTITY`, ENABLE / DISABLE
 *   [REPLICA | ALWAYS] TRIGGER / RULE, `VALIDATE CONSTRAINT` and
 *   `CLUSTER ON` pass; RENAME, ATTACH / DETACH PARTITION, INHERIT /
 *   NO INHERIT, SET SCHEMA, OF and the rest fail as unrecognised;
 * - `ALTER TYPE` allows only `ADD VALUE IF NOT EXISTS`, `OWNER TO` and
 *   `DROP ATTRIBUTE IF EXISTS` (RENAME VALUE / ATTRIBUTE / TO,
 *   ADD ATTRIBUTE and SET SCHEMA fail); any other `ALTER … RENAME` or
 *   `ALTER … SET SCHEMA` (a function, a policy, a view) fails; and every
 *   top-level `DROP`, of any object kind, carries `IF EXISTS`;
 * - each `CREATE POLICY` follows a `DROP POLICY IF EXISTS` for the same
 *   policy and table, each `CREATE TRIGGER` a `DROP TRIGGER IF EXISTS` (or
 *   is `CREATE OR REPLACE TRIGGER`);
 * - functions and views are `CREATE OR REPLACE`; a `CREATE TYPE` or
 *   `CREATE DOMAIN` sits in a guarded `DO` block; every `INSERT` (and every
 *   `WITH … INSERT`) has `ON CONFLICT` or a `NOT EXISTS` guard;
 * - the other safe shapes are `DO`, `CREATE OR REPLACE FUNCTION` /
 *   `PROCEDURE` / `VIEW` / `TRIGGER` / `RULE`, `GRANT`, `REVOKE`,
 *   `COMMENT ON`, `ALTER POLICY`, `ALTER FUNCTION` / `PROCEDURE` /
 *   `ROUTINE` attribute changes (`SET`, `RESET`, `OWNER TO`, `SECURITY …`,
 *   volatility, …), `ALTER VIEW` / `MATERIALIZED VIEW` / `INDEX` `SET`,
 *   `RESET`, `OWNER TO` or `ALTER COLUMN`, `ALTER SEQUENCE` `OWNED BY` /
 *   `RESTART` / `INCREMENT` / bounds / `CACHE`, `ALTER DEFAULT PRIVILEGES`,
 *   `UPDATE`, `DELETE`, `SELECT`, `WITH`, `REFRESH MATERIALIZED VIEW`,
 *   `NOTIFY`, `SET`, `RESET`, `BEGIN`, `COMMIT`, `START TRANSACTION` and
 *   `ANALYZE`;
 * - every table it creates has `ENABLE ROW LEVEL SECURITY` (a statement, or
 *   a `DO` loop that names the table), and no `CREATE POLICY` or
 *   `ALTER POLICY` is `USING (true)` / `WITH CHECK (true)` unless its role
 *   list is exactly `TO service_role` (no `TO` means PUBLIC; on
 *   `ALTER POLICY` it keeps roles the file cannot see, so both fail);
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
const LEDGER_FRAGMENTS = join(ROOT, 'supabase/MIGRATIONS-LEDGER.d');

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
/** A name as Postgres resolves it: unquoted parts fold to lower case, quoted parts keep theirs; `public.` dropped. */
const unquote = (name: string) =>
  (name.match(/"[^"]+"|[^."]+/g) ?? [])
    .map((part) => (part.startsWith('"') ? part.slice(1, -1) : part.toLowerCase()))
    .join('.')
    .replace(/^public\./, '');

/** Skips the quoted string or identifier that opens at `i`; returns the index of its closing quote. */
function skipQuoted(text: string, i: number): number {
  const quote = text[i];
  let j = i + 1;
  while (j < text.length) {
    if (text[j] === quote && text[j + 1] === quote) j += 2;
    else if (text[j] === quote) return j;
    else j += 1;
  }
  return text.length;
}

/**
 * A comma-separated list split on its top-level commas only: commas inside
 * parentheses (`numeric(10,2)`, `CHECK (a IN (1, 2))`) and inside quoted
 * strings or identifiers stay in their item.
 */
export function splitTopLevel(list: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < list.length; i += 1) {
    const ch = list[i];
    if (ch === "'" || ch === '"') i = skipQuoted(list, i);
    else if (ch === '(') depth += 1;
    else if (ch === ')') depth -= 1;
    else if (ch === ',' && depth === 0) {
      parts.push(list.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(list.slice(start).trim());
  return parts.filter(Boolean);
}

/** The text with every '…' string literal emptied (identifiers in "…" are kept). */
function withoutStringLiterals(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "'" || ch === '"') {
      const end = skipQuoted(text, i);
      out += ch === "'" ? "''" : text.slice(i, end + 1);
      i = end;
    } else out += ch;
  }
  return out;
}

const PERMISSIVE = /\b(?:USING|WITH CHECK)\s*\(+\s*true\s*\)+/i;

/**
 * The roles a policy statement names, from the text after `ON <table>`:
 * the `TO` list up to `USING` / `WITH CHECK` (or the end), split on commas,
 * unquoted and lower-cased. `null` when there is no `TO` list.
 */
export function policyRoles(afterTable: string): string[] | null {
  const head = withoutStringLiterals(afterTable).split(/\b(?:USING|WITH CHECK)\b/i)[0];
  const list = head.match(/\bTO\s+(.+)$/i)?.[1];
  if (!list) return null;
  return splitTopLevel(list).map((role) => role.replace(/"/g, '').trim().toLowerCase());
}

/**
 * A `USING (true)` / `WITH CHECK (true)` policy (any nesting of parentheses)
 * is allowed only when its role list is exactly `service_role`. `noRoles`
 * names who it applies to when there is no `TO` list.
 */
function permissivePolicyProblems(policy: string, afterTable: string, noRoles: string): string[] {
  if (!PERMISSIVE.test(withoutStringLiterals(afterTable))) return [];
  const roles = policyRoles(afterTable);
  if (roles?.length === 1 && roles[0] === 'service_role') return [];
  return [`policy ${policy} is USING (true) / WITH CHECK (true) for ${roles ? roles.join(', ') : noRoles}`];
}

/**
 * `ALTER TABLE` actions that are safe to run twice as written. The ADD and
 * DROP forms are checked on their own in `alterTableProblems`; any other
 * action (RENAME, ATTACH / DETACH PARTITION, INHERIT / NO INHERIT,
 * SET SCHEMA, OF / NOT OF, …) is unrecognised and fails.
 */
const SAFE_TABLE_ACTIONS: readonly RegExp[] = [
  /^(?:ENABLE|DISABLE|FORCE|NO FORCE) ROW LEVEL SECURITY\b/i,
  /^ALTER /i, // ALTER [COLUMN] …, ALTER CONSTRAINT …
  /^(?:SET|RESET) ?\(/i,
  /^SET (?:LOGGED|UNLOGGED|WITHOUT CLUSTER)$/i,
  /^SET TABLESPACE /i,
  /^OWNER TO /i,
  /^REPLICA IDENTITY /i,
  /^(?:ENABLE|DISABLE) (?:(?:REPLICA|ALWAYS) )?(?:TRIGGER|RULE)\b/i,
  /^VALIDATE CONSTRAINT /i,
  /^CLUSTER ON /i,
];

/** Column actions that fail on a second run: an identity added twice, or an identity / generation expression dropped without IF EXISTS. */
const UNSAFE_COLUMN_ACTION = /\b(?:ADD GENERATED\b|DROP (?:IDENTITY|EXPRESSION)\b(?! IF EXISTS\b))/i;

/** The idempotency problems in one `ALTER TABLE` action list, recording guarded drops as it goes. */
function alterTableProblems(table: string, actions: string, droppedConstraints: Set<string>, rlsEnabled: Set<string>, short: string): string[] {
  const problems: string[] = [];
  for (const action of splitTopLevel(actions)) {
    let m: RegExpMatchArray | null;
    if (/^ENABLE ROW LEVEL SECURITY\b/i.test(action)) {
      rlsEnabled.add(table);
    } else if ((m = action.match(new RegExp(String.raw`^DROP CONSTRAINT IF EXISTS (${IDENT})`, 'i')))) {
      droppedConstraints.add(`${unquote(m[1])}@${table}`);
    } else if ((m = action.match(new RegExp(String.raw`^ADD CONSTRAINT (${IDENT})`, 'i')))) {
      if (!droppedConstraints.has(`${unquote(m[1])}@${table}`)) {
        problems.push(`ADD CONSTRAINT ${m[1]} ON ${table} without a DROP CONSTRAINT IF EXISTS before it: ${short}`);
      }
    } else if (/^ADD (?:COLUMN )?IF NOT EXISTS /i.test(action)) {
      // guarded column
    } else if (/^ADD COLUMN /i.test(action)) {
      problems.push(`ADD COLUMN without IF NOT EXISTS on ${table}: ${action}`);
    } else if ((m = action.match(/^ADD (PRIMARY KEY|UNIQUE|CHECK|FOREIGN KEY|EXCLUDE)\b/i))) {
      problems.push(`unnamed ADD ${m[1].toUpperCase()} on ${table} (name it and DROP CONSTRAINT IF EXISTS first): ${action}`);
    } else if (/^ADD /i.test(action)) {
      problems.push(`ADD COLUMN without IF NOT EXISTS on ${table}: ${action}`);
    } else if (/^DROP (?:COLUMN |CONSTRAINT )?IF EXISTS /i.test(action)) {
      // guarded drop
    } else if (/^DROP /i.test(action)) {
      problems.push(`DROP without IF EXISTS on ${table}: ${action}`);
    } else if (/^ALTER /i.test(action) && UNSAFE_COLUMN_ACTION.test(withoutStringLiterals(action))) {
      problems.push(`ALTER COLUMN action that fails on a second run on ${table} (wrap it in a guarded DO block): ${action}`);
    } else if (!SAFE_TABLE_ACTIONS.some((safe) => safe.test(action))) {
      problems.push(`unrecognised ALTER TABLE action on ${table}: ${action}`);
    }
  }
  return problems;
}

/**
 * The idempotency problems in one `ALTER TYPE` action list. Only
 * `ADD VALUE IF NOT EXISTS`, `OWNER TO` and `DROP ATTRIBUTE IF EXISTS` are
 * safe to run twice; RENAME VALUE / ATTRIBUTE / TO, ADD ATTRIBUTE (which has
 * no IF NOT EXISTS), ALTER ATTRIBUTE, SET SCHEMA and the rest fail.
 */
function alterTypeProblems(type: string, actions: string, short: string): string[] {
  const problems: string[] = [];
  for (const action of splitTopLevel(actions)) {
    if (/^(?:ADD VALUE IF NOT EXISTS|OWNER TO|DROP ATTRIBUTE IF EXISTS) /i.test(action)) continue;
    if (/^ADD VALUE /i.test(action)) problems.push(`ALTER TYPE … ADD VALUE without IF NOT EXISTS: ${short}`);
    else if (/^DROP ATTRIBUTE /i.test(action)) problems.push(`DROP ATTRIBUTE without IF EXISTS on ${type}: ${action}`);
    else problems.push(`unrecognised ALTER TYPE action on ${type} (wrap it in a guarded DO block): ${action}`);
  }
  return problems;
}

/** The object kind a `DROP` names, for its message: multi-word kinds first, else the first word. */
const DROP_KIND =
  /^DROP (EVENT TRIGGER|FOREIGN (?:DATA WRAPPER|TABLE)|MATERIALIZED VIEW|TEXT SEARCH (?:CONFIGURATION|DICTIONARY|PARSER|TEMPLATE)|OPERATOR (?:CLASS|FAMILY)|USER MAPPING|ACCESS METHOD|INDEX CONCURRENTLY|[A-Z]+)\b/i;
/** `DROP <kind of one to three words> IF EXISTS …`: TABLE, EVENT TRIGGER, INDEX CONCURRENTLY, TEXT SEARCH CONFIGURATION, … */
const DROP_IF_EXISTS = /^DROP (?:[A-Z]+ ){1,3}IF EXISTS /i;

/** `ALTER …` clauses that fail on a second run (the object has its new name or schema by then). */
const ALTER_RENAME = /\bRENAME (?:TO|COLUMN|CONSTRAINT|VALUE|ATTRIBUTE)\b|\bRENAME (?:""|[A-Za-z_][\w$]*) TO\b/i;
const ALTER_SET_SCHEMA = /\bSET SCHEMA\b/i;

/** The text with every '…' string and "…" identifier emptied, so keywords inside them do not count. */
const withoutQuoted = (text: string) => withoutStringLiterals(text).replace(/"(?:[^"]|"")*"/g, '""');

/**
 * The rest of an `ALTER <object>` statement after the object's name and, for
 * a routine, its argument list (`f(uuid, numeric(10,2)) SET x` → `SET x`).
 */
function afterObjectName(rest: string, withArgs: boolean): string {
  const name = rest.match(new RegExp(String.raw`^${QUALIFIED}\s*`));
  if (!name) return '';
  let i = name[0].length;
  if (withArgs && rest[i] === '(') {
    let depth = 0;
    for (; i < rest.length; i += 1) {
      const ch = rest[i];
      if (ch === "'" || ch === '"') i = skipQuoted(rest, i);
      else if (ch === '(') depth += 1;
      else if (ch === ')' && (depth -= 1) === 0) {
        i += 1;
        break;
      }
    }
  }
  return rest.slice(i).trim();
}

const ROUTINE_ACTIONS =
  /^(?:SET|RESET|OWNER TO|(?:EXTERNAL )?SECURITY (?:DEFINER|INVOKER)|STABLE|IMMUTABLE|VOLATILE|STRICT|CALLED ON NULL INPUT|RETURNS NULL ON NULL INPUT|(?:NOT )?LEAKPROOF|PARALLEL|COST|ROWS)\b/i;
const RELATION_ACTIONS = /^(?:SET|RESET|OWNER TO|ALTER)\b/i;
const SEQUENCE_ACTIONS = /^(?:OWNED BY|RESTART|INCREMENT|MINVALUE|MAXVALUE|NO (?:MINVALUE|MAXVALUE|CYCLE)|CACHE|START|CYCLE|OWNER TO)\b/i;

/**
 * Top-level statement shapes that are safe to run twice as written, checked
 * after the guarded forms in `idempotencyProblems`. Anything else fails as
 * unrecognised: wrap it in a guarded `DO` block.
 */
const SAFE_STATEMENTS: readonly RegExp[] = [
  /^DO\b/i,
  /^CREATE OR REPLACE (?:(?:TEMP|TEMPORARY) )?(?:RECURSIVE )?(?:FUNCTION|PROCEDURE|VIEW|TRIGGER|RULE) /i,
  /^CREATE (?:[A-Z]+ ){1,3}IF NOT EXISTS /i,
  /^(?:GRANT|REVOKE) /i,
  /^COMMENT ON /i,
  /^ALTER DEFAULT PRIVILEGES /i,
  /^(?:UPDATE|DELETE|SELECT|WITH)\b/i,
  /^REFRESH MATERIALIZED VIEW /i,
  /^(?:NOTIFY|SET|RESET|BEGIN|COMMIT|ANALYZE)\b/i,
  /^START TRANSACTION\b/i,
];

/** Is this top-level statement one of the safe shapes (including ALTER FUNCTION / VIEW / INDEX / SEQUENCE attribute changes)? */
function isSafeStatement(s: string): boolean {
  let m: RegExpMatchArray | null;
  if ((m = s.match(/^ALTER (?:FUNCTION|PROCEDURE|ROUTINE) (?:IF EXISTS )?(.+)$/i))) return ROUTINE_ACTIONS.test(afterObjectName(m[1], true));
  if ((m = s.match(/^ALTER (?:MATERIALIZED VIEW|VIEW|INDEX) (?:IF EXISTS )?(.+)$/i))) return RELATION_ACTIONS.test(afterObjectName(m[1], false));
  if ((m = s.match(/^ALTER SEQUENCE (?:IF EXISTS )?(.+)$/i))) return SEQUENCE_ACTIONS.test(afterObjectName(m[1], false));
  return SAFE_STATEMENTS.some((safe) => safe.test(s));
}

const INSERT_GUARDED = (s: string) => /\bON CONFLICT\b/i.test(s) || /\bNOT EXISTS\b/i.test(s);

/** Everything that keeps a build-out file from being safe to run twice (or at all). */
export function idempotencyProblems(sql: string): string[] {
  const bodies: string[] = [];
  const statements = topLevelStatements(sql, bodies);
  const problems: string[] = [];
  const droppedPolicies = new Set<string>();
  const droppedTriggers = new Set<string>();
  const droppedConstraints = new Set<string>();
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
    if (/^DROP /i.test(s)) {
      if (!DROP_IF_EXISTS.test(s)) problems.push(`DROP ${(s.match(DROP_KIND)?.[1] ?? '').toUpperCase()} without IF EXISTS: ${short}`);
      continue;
    }
    if ((m = s.match(new RegExp(String.raw`^ALTER TABLE (?:IF EXISTS )?(?:ONLY )?(${QUALIFIED}) (.+)$`, 'i')))) {
      problems.push(...alterTableProblems(unquote(m[1]), m[2], droppedConstraints, rlsEnabled, short));
      continue;
    }
    if ((m = s.match(new RegExp(String.raw`^ALTER TYPE (${QUALIFIED}) (.+)$`, 'i')))) {
      problems.push(...alterTypeProblems(unquote(m[1]), m[2], short));
      continue;
    }
    if (/^ALTER /i.test(s) && (ALTER_RENAME.test(withoutQuoted(s)) || ALTER_SET_SCHEMA.test(withoutQuoted(s)))) {
      const clause = ALTER_RENAME.test(withoutQuoted(s)) ? 'RENAME' : 'SET SCHEMA';
      problems.push(`ALTER … ${clause} fails on a second run (wrap it in a guarded DO block): ${short}`);
      continue;
    }
    if ((m = s.match(new RegExp(String.raw`^ALTER POLICY (${IDENT}) ON (${QUALIFIED})`, 'i')))) {
      problems.push(...permissivePolicyProblems(`${m[1]} ON ${m[2]}`, s.slice(m[0].length), 'the roles it already has (no TO list)'));
      continue;
    }
    if (/^CREATE MATERIALIZED VIEW /i.test(s)) {
      if (!/^CREATE MATERIALIZED VIEW IF NOT EXISTS /i.test(s)) problems.push(`CREATE MATERIALIZED VIEW without IF NOT EXISTS: ${short}`);
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
      problems.push(...permissivePolicyProblems(`${m[1]} ON ${m[2]}`, s.slice(m[0].length), 'PUBLIC (no TO list)'));
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
    if ((m = s.match(/^CREATE (TYPE|DOMAIN) /i))) {
      problems.push(`CREATE ${m[1].toUpperCase()} outside a guarded DO block: ${short}`);
      continue;
    }
    // An INSERT, or a WITH … INSERT, needs ON CONFLICT or a NOT EXISTS guard.
    if (/^INSERT /i.test(s) || (/^WITH\b/i.test(s) && /\bINSERT INTO\b/i.test(withoutQuoted(s)))) {
      if (!INSERT_GUARDED(s)) problems.push(`INSERT without ON CONFLICT or a NOT EXISTS guard: ${short}`);
      continue;
    }
    if (!isSafeStatement(s)) problems.push(`unrecognised top-level statement (wrap it in a guarded DO block): ${short}`);
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

/** The text of one "## <heading>" section (up to the next "## "), or '' when absent. */
function section(markdown: string, heading: string): string {
  const start = markdown.indexOf(`\n## ${heading}`);
  if (start === -1) return '';
  const rest = markdown.slice(start + 1);
  const end = rest.indexOf('\n## ', 3);
  return end === -1 ? rest : rest.slice(0, end);
}

/** Table rows of a section whose second cell is a backticked .sql file: [first cell, file, third cell]. */
function fileRows(text: string): Array<[string, string, string]> {
  const rows: Array<[string, string, string]> = [];
  for (const line of text.split('\n')) {
    const cells = line.split('|').map((c) => c.trim());
    const file = cells[2]?.match(/^`([^`]+\.sql)`$/)?.[1];
    if (file) rows.push([cells[1] ?? '', file, cells[3] ?? '']);
  }
  return rows;
}

/** The rows of the ledger table (the "## Ledger" section only). */
export function ledgerRows(markdown: string): LedgerRow[] {
  return fileRows(section(markdown, 'Ledger')).map(([, file, status]) => ({ file, status }));
}

interface QueueRow {
  order: string;
  file: string;
}

/** The rows of the Apply queue table (the "## Apply queue" section only). */
export function queueRows(markdown: string): QueueRow[] {
  return fileRows(section(markdown, 'Apply queue')).map(([order, file]) => ({ order, file }));
}

export interface LedgerFragment {
  name: string;
  /** The 10-digit version prefix (date + hour) whose files the fragment holds. */
  block: string | null;
  /** The Apply queue order prefix (`F` -> F1, F2, …). */
  queuePrefix: string | null;
  rows: LedgerRow[];
  queue: QueueRow[];
}

/** One ledger fragment (supabase/MIGRATIONS-LEDGER.d/<name>.md), parsed. */
export function parseLedgerFragment(name: string, markdown: string): LedgerFragment {
  return {
    name,
    block: markdown.match(/\*\*Block:\*\* `(\d{10})`/)?.[1] ?? null,
    queuePrefix: markdown.match(/\*\*Queue prefix:\*\* `([A-Z]+)`/)?.[1] ?? null,
    rows: ledgerRows(markdown),
    queue: queueRows(markdown),
  };
}

/** What is wrong with the fragments, given the main ledger's rows and queue (the rules above). */
export function fragmentProblems(main: { rows: LedgerRow[]; queue: QueueRow[] }, fragments: LedgerFragment[]): string[] {
  const problems: string[] = [];
  const blocks = new Map<string, string>();
  const prefixes = new Map<string, string>();
  const mainQueued = new Set(main.queue.map((q) => q.file));
  for (const f of fragments) {
    if (!f.block) problems.push(`${f.name}: no **Block:** \`<10-digit version prefix>\` line`);
    else if (blocks.has(f.block)) problems.push(`${f.name}: block ${f.block} is also ${blocks.get(f.block)}'s`);
    else blocks.set(f.block, f.name);
    if (!f.queuePrefix) problems.push(`${f.name}: no **Queue prefix:** \`<letters>\` line`);
    else if (prefixes.has(f.queuePrefix)) problems.push(`${f.name}: queue prefix ${f.queuePrefix} is also ${prefixes.get(f.queuePrefix)}'s`);
    else prefixes.set(f.queuePrefix, f.name);
    for (const r of f.rows) {
      if (f.block && !r.file.startsWith(f.block)) problems.push(`${f.name}: ${r.file} is outside its block ${f.block}`);
      if (mainQueued.has(r.file)) problems.push(`${f.name}: ${r.file} is also in the main Apply queue`);
    }
    const listed = new Set(f.rows.map((r) => r.file));
    const queued = f.queue.map((q) => q.file);
    for (const q of f.queue) if (!listed.has(q.file)) problems.push(`${f.name}: Apply queue row ${q.file} has no ledger row in this fragment`);
    for (const file of listed) {
      const n = queued.filter((q) => q === file).length;
      if (n !== 1) problems.push(`${f.name}: ${file} has ${n} Apply queue rows (exactly one expected)`);
    }
    f.queue.forEach((q, i) => {
      const want = `${f.queuePrefix ?? '?'}${i + 1}`;
      if (q.order !== want) problems.push(`${f.name}: Apply queue order ${q.order} for ${q.file} (expected ${want})`);
    });
  }
  // A block file outside its fragment is in the main ledger or another fragment.
  for (const [block, name] of blocks) {
    for (const r of main.rows) if (r.file.startsWith(block)) problems.push(`main ledger: ${r.file} belongs to ${name} (block ${block})`);
    for (const f of fragments) {
      if (f.name === name) continue;
      for (const r of f.rows) if (r.file.startsWith(block)) problems.push(`${f.name}: ${r.file} belongs to ${name} (block ${block})`);
    }
  }
  return problems;
}

/** The fragments on disk, in name order. */
function readLedgerFragments(): LedgerFragment[] {
  let names: string[] = [];
  try {
    names = readdirSync(LEDGER_FRAGMENTS).filter((n) => n.endsWith('.md')).sort();
  } catch {
    names = [];
  }
  return names.map((n) => parseLedgerFragment(n, readFileSync(join(LEDGER_FRAGMENTS, n), 'utf8')));
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
  const mainText = readFileSync(LEDGER, 'utf8');
  const mainRows = ledgerRows(mainText);
  const fragments = readLedgerFragments();
  // The main ledger and every fragment (PP1): each file exactly once across all of them.
  const rows = [...mainRows, ...fragments.flatMap((f) => f.rows)];
  const handWritten = files.filter((f) => !LOVABLE_COPY.test(f));

  it('reads the ledger table', () => {
    expect(mainRows.length).toBeGreaterThanOrEqual(27);
  });

  it('reads the per-stream fragments (crew and fleet in Phase 3 wave 1)', () => {
    expect(fragments.map((f) => f.name)).toEqual(expect.arrayContaining(['crew.md', 'fleet.md']));
    expect(fragments.find((f) => f.name === 'crew.md')).toMatchObject({ block: '2026112406', queuePrefix: 'C' });
    expect(fragments.find((f) => f.name === 'fleet.md')).toMatchObject({ block: '2026112404', queuePrefix: 'F' });
  });

  it('keeps each fragment to its block, with one Apply queue row per file in prefix order', () => {
    expect(fragmentProblems({ rows: mainRows, queue: queueRows(mainText) }, fragments)).toEqual([]);
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
    expect(problems).toContain('policy "a_insert" ON public.a is USING (true) / WITH CHECK (true) for authenticated');
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

  // The vessel-code migration (P1, D-25) is an ADD COLUMN plus a UNIQUE constraint: these are its safe forms.
  const guarded: Record<string, string> = {
    addColumnIfNotExists: `ALTER TABLE public.vessels ADD COLUMN IF NOT EXISTS code text;`,
    bareAddIfNotExists: `ALTER TABLE public.vessels ADD IF NOT EXISTS code text;`,
    dropThenAddConstraint: `ALTER TABLE public.vessels DROP CONSTRAINT IF EXISTS vessels_code_key;
      ALTER TABLE public.vessels ADD CONSTRAINT vessels_code_key UNIQUE (company_id, code);`,
    dropThenAddInOneList: `ALTER TABLE public.vessels DROP CONSTRAINT IF EXISTS vessels_code_key, ADD CONSTRAINT vessels_code_key UNIQUE (code);`,
    quotedConstraintName: `ALTER TABLE ONLY public.vessels DROP CONSTRAINT IF EXISTS "Vessels code check", ADD CONSTRAINT "Vessels code check" CHECK (code ~ '^[A-Z][A-Z0-9]{2}$');`,
    unquotedFoldsToLowerCase: `ALTER TABLE public.vessels DROP CONSTRAINT IF EXISTS Vessels_Code_Key; ALTER TABLE "public"."vessels" ADD CONSTRAINT "vessels_code_key" UNIQUE (code);`,
    commasInsideParensAndStrings: `ALTER TABLE public.vessels ADD COLUMN IF NOT EXISTS price numeric(10,2),
      ADD COLUMN IF NOT EXISTS note text DEFAULT 'a, ADD b', DROP CONSTRAINT IF EXISTS c, ADD CONSTRAINT c CHECK (kind IN ('x', 'y'));`,
    dropsWithIfExists: `ALTER TABLE public.vessels DROP COLUMN IF EXISTS legacy_code, DROP IF EXISTS old_code;
      DROP TABLE IF EXISTS public.old_vessel_codes; DROP INDEX CONCURRENTLY IF EXISTS idx_old;
      DROP MATERIALIZED VIEW IF EXISTS public.mv_old; DROP FUNCTION IF EXISTS public.f(uuid);`,
    alterColumnIsNotAnAdd: `ALTER TABLE public.vessels ALTER COLUMN code SET NOT NULL, ALTER COLUMN code DROP DEFAULT;`,
    alterTypeAddValueIfNotExists: `ALTER TYPE public.permit_kind ADD VALUE IF NOT EXISTS 'cold_work';`,
    materializedViewIfNotExists: `CREATE MATERIALIZED VIEW IF NOT EXISTS public.permit_counts AS SELECT company_id, count(*) FROM public.safety_permits GROUP BY company_id;`,
    domainInGuardedDo: `DO $$ BEGIN CREATE DOMAIN public.vessel_code AS text CHECK (VALUE ~ '^[A-Z][A-Z0-9]{2}$'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
    serviceRolePolicy: `DROP POLICY IF EXISTS "svc" ON public.a; CREATE POLICY "svc" ON public.a FOR ALL TO service_role USING (true);`,
    quotedServiceRolePolicy: `DROP POLICY IF EXISTS "svc" ON public.a; CREATE POLICY "svc" ON public.a AS PERMISSIVE FOR ALL TO "service_role" USING ((true)) WITH CHECK (true);`,
    alterPolicyToServiceRole: `ALTER POLICY "svc" ON public.a TO service_role USING (true) WITH CHECK (true);`,
    alterPolicyScoped: `ALTER POLICY "a_select" ON public.a TO authenticated USING (public.user_belongs_to_company(auth.uid(), company_id));`,
    trueInsideAStringIsNotPermissive: `DROP POLICY IF EXISTS "p" ON public.a; CREATE POLICY "p" ON public.a FOR SELECT TO authenticated USING (note <> 'USING (true)');`,
    // The known-safe statement shapes (everything else is unrecognised and fails).
    publicationInGuardedDo: `DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.x; EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
    grantAndRevoke: `GRANT SELECT, INSERT ON public.a TO authenticated; GRANT EXECUTE ON FUNCTION public.f(uuid) TO authenticated; REVOKE ALL ON public.a FROM anon;`,
    commentOn: `COMMENT ON TABLE public.a IS 'Permits; one per job'; COMMENT ON COLUMN public.a.code IS NULL;`,
    enableRowLevelSecurity: `ALTER TABLE public.a ENABLE ROW LEVEL SECURITY;`,
    tableOwnerTo: `ALTER TABLE public.a OWNER TO postgres;`,
    otherSafeTableActions: `ALTER TABLE public.a FORCE ROW LEVEL SECURITY, NO FORCE ROW LEVEL SECURITY;
      ALTER TABLE public.a DISABLE ROW LEVEL SECURITY; ALTER TABLE public.a SET (fillfactor = 70), RESET (autovacuum_enabled);
      ALTER TABLE public.a SET LOGGED; ALTER TABLE public.a SET UNLOGGED; ALTER TABLE public.a SET TABLESPACE pg_default;
      ALTER TABLE public.a REPLICA IDENTITY FULL; ALTER TABLE public.a ENABLE TRIGGER trg_a, DISABLE TRIGGER ALL;
      ALTER TABLE public.a ENABLE REPLICA TRIGGER trg_b, ENABLE ALWAYS RULE r, DISABLE RULE r2;
      ALTER TABLE public.a VALIDATE CONSTRAINT c; ALTER TABLE public.a CLUSTER ON idx_a; ALTER TABLE public.a SET WITHOUT CLUSTER;
      ALTER TABLE public.a ALTER COLUMN c TYPE text USING c::text, ALTER c SET DEFAULT 'ADD GENERATED', ALTER COLUMN d DROP IDENTITY IF EXISTS;`,
    alterFunctionSearchPath: `ALTER FUNCTION public.f(uuid) SET search_path = public;`,
    alterRoutineAttributes: `ALTER FUNCTION public.reset_flags(p_ids uuid[], p_scale numeric(10,2)) SECURITY DEFINER;
      ALTER PROCEDURE public.p() OWNER TO postgres; ALTER FUNCTION public.g STABLE; ALTER ROUTINE public.h(int) RESET ALL;`,
    alterViewIndexSequence: `ALTER VIEW public.v SET (security_invoker = true); ALTER MATERIALIZED VIEW public.mv OWNER TO postgres;
      ALTER INDEX public.idx_a SET TABLESPACE pg_default; ALTER VIEW IF EXISTS public.v ALTER COLUMN c SET DEFAULT 1;
      ALTER SEQUENCE public.s OWNED BY public.a.id; ALTER SEQUENCE public.s RESTART WITH 1; ALTER SEQUENCE IF EXISTS public.s INCREMENT BY 1 CACHE 1;`,
    alterTypeOwnerAndGuardedDrop: `ALTER TYPE public.addr OWNER TO postgres; ALTER TYPE public.addr DROP ATTRIBUTE IF EXISTS zip;`,
    alterDefaultPrivileges: `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO authenticated;`,
    createOrReplaceTrigger: `CREATE OR REPLACE TRIGGER trg_a BEFORE UPDATE ON public.a FOR EACH ROW EXECUTE FUNCTION public.f();`,
    createOrReplaceRuleAndView: `CREATE OR REPLACE RULE r AS ON INSERT TO public.a DO INSTEAD NOTHING; CREATE OR REPLACE RECURSIVE VIEW public.v (n) AS SELECT 1;`,
    createAnyKindIfNotExists: `CREATE STATISTICS IF NOT EXISTS public.st ON a, b FROM public.t;`,
    select: `SELECT cron.unschedule('x') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'x');`,
    update: `UPDATE public.a SET status = 'open' WHERE status IS NULL;`,
    deleteAndRefresh: `DELETE FROM public.a WHERE code IS NULL; REFRESH MATERIALIZED VIEW public.mv;`,
    withInsertOnConflict: `WITH s AS (SELECT 1 AS id) INSERT INTO public.a (id) SELECT id FROM s ON CONFLICT DO NOTHING;`,
    notify: `NOTIFY pgrst, 'reload schema';`,
    sessionAndTransaction: `BEGIN; SET LOCAL statement_timeout = 0; RESET statement_timeout; ANALYZE public.a; COMMIT; START TRANSACTION; COMMIT;`,
    dropEventTriggerIfExists: `DROP EVENT TRIGGER IF EXISTS et;`,
    dropRuleIfExists: `DROP RULE IF EXISTS r ON public.a;`,
    dropRoutineIfExists: `DROP ROUTINE IF EXISTS public.f(uuid);`,
    dropOtherKindsIfExists: `DROP FOREIGN TABLE IF EXISTS public.ft; DROP TEXT SEARCH CONFIGURATION IF EXISTS public.cfg;
      DROP AGGREGATE IF EXISTS public.agg(int); DROP OPERATOR IF EXISTS public.=== (int, int); DROP CAST IF EXISTS (text AS int);`,
  };

  it.each(Object.entries(guarded))('passes the guarded form %s', (_name, sql) => {
    expect(idempotencyProblems(sql)).toEqual([]);
  });

  // [sql, the one problem it must raise]
  const unguarded: Record<string, [string, string]> = {
    addColumn: [`ALTER TABLE public.vessels ADD COLUMN code text;`, 'ADD COLUMN without IF NOT EXISTS on vessels'],
    bareAdd: [`ALTER TABLE public.vessels ADD code text;`, 'ADD COLUMN without IF NOT EXISTS on vessels'],
    addConstraintUnique: [`ALTER TABLE public.vessels ADD CONSTRAINT vessels_code_key UNIQUE (code);`, 'ADD CONSTRAINT vessels_code_key ON vessels without a DROP CONSTRAINT IF EXISTS'],
    addConstraintCheck: [`ALTER TABLE public.vessels ADD CONSTRAINT vessels_code_check CHECK (length(code) = 3);`, 'ADD CONSTRAINT vessels_code_check ON vessels without a DROP CONSTRAINT IF EXISTS'],
    dropAfterAdd: [
      `ALTER TABLE public.vessels ADD CONSTRAINT c UNIQUE (code), DROP CONSTRAINT IF EXISTS c;`,
      'ADD CONSTRAINT c ON vessels without a DROP CONSTRAINT IF EXISTS',
    ],
    dropOnAnotherTable: [
      `ALTER TABLE public.crew DROP CONSTRAINT IF EXISTS c; ALTER TABLE public.vessels ADD CONSTRAINT c UNIQUE (code);`,
      'ADD CONSTRAINT c ON vessels without a DROP CONSTRAINT IF EXISTS',
    ],
    quotedNameKeepsItsCase: [
      `ALTER TABLE public.vessels DROP CONSTRAINT IF EXISTS "Vessels_Code_Key"; ALTER TABLE public.vessels ADD CONSTRAINT vessels_code_key UNIQUE (code);`,
      'ADD CONSTRAINT vessels_code_key ON vessels without a DROP CONSTRAINT IF EXISTS',
    ],
    dropAnotherConstraint: [
      `ALTER TABLE public.vessels DROP CONSTRAINT IF EXISTS c_old, ADD CONSTRAINT c UNIQUE (code);`,
      'ADD CONSTRAINT c ON vessels without a DROP CONSTRAINT IF EXISTS',
    ],
    secondActionInTheList: [
      `ALTER TABLE public.vessels ADD COLUMN IF NOT EXISTS price numeric(10,2), ADD COLUMN qty int;`,
      'ADD COLUMN without IF NOT EXISTS on vessels: ADD COLUMN qty int',
    ],
    unnamedUnique: [`ALTER TABLE public.vessels ADD UNIQUE (code);`, 'unnamed ADD UNIQUE on vessels'],
    unnamedPrimaryKey: [`ALTER TABLE public.vessels ADD PRIMARY KEY (id);`, 'unnamed ADD PRIMARY KEY on vessels'],
    unnamedCheck: [`ALTER TABLE public.vessels ADD CHECK (length(code) = 3);`, 'unnamed ADD CHECK on vessels'],
    unnamedForeignKey: [`ALTER TABLE public.vessels ADD FOREIGN KEY (company_id) REFERENCES public.companies(id);`, 'unnamed ADD FOREIGN KEY on vessels'],
    unnamedExclude: [`ALTER TABLE public.vessels ADD EXCLUDE USING gist (period WITH &&);`, 'unnamed ADD EXCLUDE on vessels'],
    dropColumn: [`ALTER TABLE public.vessels DROP COLUMN legacy_code;`, 'DROP without IF EXISTS on vessels'],
    dropConstraint: [`ALTER TABLE public.vessels DROP CONSTRAINT vessels_code_key;`, 'DROP without IF EXISTS on vessels'],
    dropTable: [`DROP TABLE public.old_vessel_codes;`, 'DROP TABLE without IF EXISTS'],
    dropPolicy: [`DROP POLICY "p" ON public.a;`, 'DROP POLICY without IF EXISTS'],
    alterTypeAddValue: [`ALTER TYPE public.permit_kind ADD VALUE 'cold_work';`, 'ALTER TYPE … ADD VALUE without IF NOT EXISTS'],
    materializedView: [`CREATE MATERIALIZED VIEW public.permit_counts AS SELECT 1;`, 'CREATE MATERIALIZED VIEW without IF NOT EXISTS'],
    domain: [`CREATE DOMAIN public.vessel_code AS text CHECK (length(VALUE) = 3);`, 'CREATE DOMAIN outside a guarded DO block'],
    policyNamedForServiceRole: [
      `DROP POLICY IF EXISTS "open to service_role" ON public.a;
       CREATE POLICY "open to service_role" ON public.a FOR ALL TO authenticated USING (true) WITH CHECK (true);`,
      'policy "open to service_role" ON public.a is USING (true) / WITH CHECK (true) for authenticated',
    ],
    serviceRoleThenAuthenticated: [
      `DROP POLICY IF EXISTS "x" ON public.a; CREATE POLICY "x" ON public.a FOR ALL TO service_role, authenticated USING (true);`,
      'policy "x" ON public.a is USING (true) / WITH CHECK (true) for service_role, authenticated',
    ],
    authenticatedThenServiceRole: [
      `DROP POLICY IF EXISTS "x" ON public.a; CREATE POLICY "x" ON public.a FOR ALL TO authenticated, service_role USING (true);`,
      'policy "x" ON public.a is USING (true) / WITH CHECK (true) for authenticated, service_role',
    ],
    doubleParentheses: [
      `DROP POLICY IF EXISTS "x" ON public.a; CREATE POLICY "x" ON public.a FOR ALL TO authenticated USING ((true));`,
      'policy "x" ON public.a is USING (true) / WITH CHECK (true) for authenticated',
    ],
    noRoleListIsPublic: [
      `DROP POLICY IF EXISTS "x" ON public.a; CREATE POLICY "x" ON public.a FOR SELECT USING (true);`,
      'policy "x" ON public.a is USING (true) / WITH CHECK (true) for PUBLIC',
    ],
    alterPolicyTrue: [`ALTER POLICY "a_select" ON public.a USING (true);`, 'policy "a_select" ON public.a is USING (true) / WITH CHECK (true) for the roles it already has'],
    alterPolicyToAuthenticated: [
      `ALTER POLICY "a_select" ON public.a TO authenticated WITH CHECK ( true );`,
      'policy "a_select" ON public.a is USING (true) / WITH CHECK (true) for authenticated',
    ],
    // Statements no rule recognises fail until they sit in a guarded DO block.
    publicationAddTable: [
      `ALTER PUBLICATION supabase_realtime ADD TABLE public.frp_vessel_locations;`,
      'unrecognised top-level statement (wrap it in a guarded DO block): ALTER PUBLICATION supabase_realtime ADD TABLE',
    ],
    publicationDropTable: [`ALTER PUBLICATION supabase_realtime DROP TABLE public.x;`, 'unrecognised top-level statement'],
    createRule: [`CREATE RULE r AS ON INSERT TO public.a DO INSTEAD NOTHING;`, 'unrecognised top-level statement'],
    createRole: [`CREATE ROLE reporter;`, 'unrecognised top-level statement'],
    createEventTrigger: [`CREATE EVENT TRIGGER et ON ddl_command_start EXECUTE FUNCTION public.f();`, 'unrecognised top-level statement'],
    alterFunctionOtherAction: [`ALTER FUNCTION public.f(uuid) DEPENDS ON EXTENSION pgcrypto;`, 'unrecognised top-level statement'],
    alterIndexAttachPartition: [`ALTER INDEX public.idx_p ATTACH PARTITION public.idx_p1;`, 'unrecognised top-level statement'],
    // ALTER TABLE actions outside the safe list.
    renameColumn: [`ALTER TABLE public.vessels RENAME COLUMN code TO vessel_code;`, 'unrecognised ALTER TABLE action on vessels: RENAME COLUMN code TO vessel_code'],
    renameTable: [`ALTER TABLE public.vessels RENAME TO ships;`, 'unrecognised ALTER TABLE action on vessels: RENAME TO ships'],
    renameConstraint: [`ALTER TABLE public.vessels RENAME CONSTRAINT a TO b;`, 'unrecognised ALTER TABLE action on vessels: RENAME CONSTRAINT a TO b'],
    attachPartition: [`ALTER TABLE public.p ATTACH PARTITION public.p1 FOR VALUES IN (1);`, 'unrecognised ALTER TABLE action on p: ATTACH PARTITION'],
    detachPartition: [`ALTER TABLE public.p DETACH PARTITION public.p1;`, 'unrecognised ALTER TABLE action on p: DETACH PARTITION'],
    inherit: [`ALTER TABLE public.p INHERIT public.base;`, 'unrecognised ALTER TABLE action on p: INHERIT'],
    tableSetSchema: [`ALTER TABLE public.p SET SCHEMA archive;`, 'unrecognised ALTER TABLE action on p: SET SCHEMA'],
    secondActionUnrecognised: [`ALTER TABLE public.p OWNER TO postgres, NO INHERIT public.base;`, 'unrecognised ALTER TABLE action on p: NO INHERIT'],
    addIdentity: [`ALTER TABLE public.p ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY;`, 'ALTER COLUMN action that fails on a second run on p'],
    dropIdentity: [`ALTER TABLE public.p ALTER COLUMN id DROP IDENTITY;`, 'ALTER COLUMN action that fails on a second run on p'],
    // ALTER TYPE: only ADD VALUE IF NOT EXISTS, OWNER TO and DROP ATTRIBUTE IF EXISTS are safe.
    alterTypeRenameValue: [`ALTER TYPE public.permit_kind RENAME VALUE 'a' TO 'b';`, "unrecognised ALTER TYPE action on permit_kind (wrap it in a guarded DO block): RENAME VALUE 'a'"],
    alterTypeRenameAttribute: [`ALTER TYPE public.addr RENAME ATTRIBUTE zip TO postcode;`, 'unrecognised ALTER TYPE action on addr'],
    alterTypeRenameTo: [`ALTER TYPE public.addr RENAME TO address;`, 'unrecognised ALTER TYPE action on addr'],
    alterTypeAddAttribute: [`ALTER TYPE public.addr ADD ATTRIBUTE zip text;`, 'unrecognised ALTER TYPE action on addr (wrap it in a guarded DO block): ADD ATTRIBUTE zip text'],
    alterTypeDropAttribute: [`ALTER TYPE public.addr DROP ATTRIBUTE zip;`, 'DROP ATTRIBUTE without IF EXISTS on addr'],
    alterTypeSetSchema: [`ALTER TYPE public.addr SET SCHEMA archive;`, 'unrecognised ALTER TYPE action on addr'],
    // ALTER … RENAME / SET SCHEMA on any other object.
    alterFunctionRename: [`ALTER FUNCTION public.f(uuid) RENAME TO g;`, 'ALTER … RENAME fails on a second run'],
    alterPolicyRename: [`ALTER POLICY "p" ON public.a RENAME TO "q";`, 'ALTER … RENAME fails on a second run'],
    alterViewRenameColumn: [`ALTER VIEW public.v RENAME COLUMN a TO b;`, 'ALTER … RENAME fails on a second run'],
    alterFunctionSetSchema: [`ALTER FUNCTION public.reset(uuid) SET SCHEMA archive;`, 'ALTER … SET SCHEMA fails on a second run'],
    // IF EXISTS on a DROP of any object kind.
    dropRoutine: [`DROP ROUTINE public.f(uuid);`, 'DROP ROUTINE without IF EXISTS'],
    dropRule: [`DROP RULE r ON public.a;`, 'DROP RULE without IF EXISTS'],
    dropEventTrigger: [`DROP EVENT TRIGGER et;`, 'DROP EVENT TRIGGER without IF EXISTS'],
    dropAggregate: [`DROP AGGREGATE public.agg(int);`, 'DROP AGGREGATE without IF EXISTS'],
    dropOperator: [`DROP OPERATOR public.=== (int, int);`, 'DROP OPERATOR without IF EXISTS'],
    dropCast: [`DROP CAST (text AS int);`, 'DROP CAST without IF EXISTS'],
    dropForeignTable: [`DROP FOREIGN TABLE public.ft;`, 'DROP FOREIGN TABLE without IF EXISTS'],
    dropTrigger: [`DROP TRIGGER trg_a ON public.a;`, 'DROP TRIGGER without IF EXISTS'],
    dropIndexConcurrently: [`DROP INDEX CONCURRENTLY idx_old;`, 'DROP INDEX CONCURRENTLY without IF EXISTS'],
    withInsertUnguarded: [`WITH s AS (SELECT 1 AS id) INSERT INTO public.a (id) SELECT id FROM s;`, 'INSERT without ON CONFLICT or a NOT EXISTS guard'],
  };

  it.each(Object.entries(unguarded))('fails the unguarded form %s', (_name, [sql, problem]) => {
    const problems = idempotencyProblems(sql);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain(problem);
  });

  it('splits an action or role list on top-level commas only', () => {
    expect(splitTopLevel(`ADD COLUMN IF NOT EXISTS p numeric(10,2), ADD CONSTRAINT c CHECK (a IN ('x, y', 'z')), DROP "a,b"`)).toEqual([
      'ADD COLUMN IF NOT EXISTS p numeric(10,2)',
      "ADD CONSTRAINT c CHECK (a IN ('x, y', 'z'))",
      'DROP "a,b"',
    ]);
  });

  it('reads a policy role list after the table, not from its name', () => {
    expect(policyRoles(' FOR ALL TO service_role USING (true)')).toEqual(['service_role']);
    expect(policyRoles(' FOR ALL TO "service_role", authenticated WITH CHECK (true)')).toEqual(['service_role', 'authenticated']);
    expect(policyRoles(' FOR SELECT USING (x = 1)')).toBeNull();
    expect(policyRoles(` FOR SELECT USING (note = ' TO service_role')`)).toBeNull();
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
    expect(queueRows(`# Title\n\n${md}`)).toEqual([{ order: '1', file: '20260101000000_a.sql' }]);
  });

  it('checks ledger fragments: block, prefix, queue rows and their order, overlaps (PP1)', () => {
    const fragment = (name: string, block: string, prefix: string, rows: string[], queue: Array<[string, string]>) =>
      parseLedgerFragment(
        name,
        [
          `# Fragment ${name}`,
          `**Block:** \`${block}\``,
          `**Queue prefix:** \`${prefix}\``,
          '## Ledger',
          '| # | File | Status | Evidence | Lovable copy | Notes |',
          '|---|---|---|---|---|---|',
          ...rows.map((f, i) => `| ${i + 1} | \`${f}\` | written, not applied | x | — | |`),
          '',
          '## Apply queue',
          '| Order | File | Check first | If not live |',
          '|---|---|---|---|',
          ...queue.map(([o, f]) => `| ${o} | \`${f}\` | Query | Apply |`),
        ].join('\n'),
      );
    const fleet = fragment('fleet.md', '2026112404', 'F', ['20261124040000_fleet_a.sql', '20261124040100_fleet_b.sql'], [['F1', '20261124040000_fleet_a.sql'], ['F2', '20261124040100_fleet_b.sql']]);
    const crew = fragment('crew.md', '2026112406', 'C', ['20261124060100_crew_a.sql'], [['C1', '20261124060100_crew_a.sql']]);
    const main = { rows: [{ file: '20261123000100_platform_x.sql', status: 'written, not applied' }], queue: [{ order: '23', file: '20261123000100_platform_x.sql' }] };
    expect(fragmentProblems(main, [crew, fleet])).toEqual([]);
    expect(parseLedgerFragment('x.md', '## Ledger\n')).toMatchObject({ block: null, queuePrefix: null, rows: [], queue: [] });

    const bad = fragment('crew.md', '2026112406', 'C', ['20261124060100_crew_a.sql', '20261124040100_fleet_b.sql', '20261124060200_crew_b.sql'], [
      ['C2', '20261124060100_crew_a.sql'],
      ['C2', '20261124060100_crew_a.sql'],
      ['C3', '20261124069900_crew_ghost.sql'],
    ]);
    expect(fragmentProblems({ rows: [...main.rows, { file: '20261124040000_fleet_a.sql', status: 'applied' }], queue: [] }, [bad, fleet])).toEqual([
      'crew.md: 20261124040100_fleet_b.sql is outside its block 2026112406',
      'crew.md: Apply queue row 20261124069900_crew_ghost.sql has no ledger row in this fragment',
      'crew.md: 20261124060100_crew_a.sql has 2 Apply queue rows (exactly one expected)',
      'crew.md: 20261124040100_fleet_b.sql has 0 Apply queue rows (exactly one expected)',
      'crew.md: 20261124060200_crew_b.sql has 0 Apply queue rows (exactly one expected)',
      'crew.md: Apply queue order C2 for 20261124060100_crew_a.sql (expected C1)',
      'main ledger: 20261124040000_fleet_a.sql belongs to fleet.md (block 2026112404)',
      'crew.md: 20261124040100_fleet_b.sql belongs to fleet.md (block 2026112404)',
    ]);
    const twin = fragment('other.md', '2026112404', 'F', [], []);
    const anonymous = parseLedgerFragment('anon.md', '## Ledger\n');
    expect(fragmentProblems({ rows: [], queue: [{ order: '24', file: '20261124040000_fleet_a.sql' }] }, [fleet, twin, anonymous])).toEqual([
      'fleet.md: 20261124040000_fleet_a.sql is also in the main Apply queue',
      'other.md: block 2026112404 is also fleet.md\'s',
      'other.md: queue prefix F is also fleet.md\'s',
      'anon.md: no **Block:** `<10-digit version prefix>` line',
      'anon.md: no **Queue prefix:** `<letters>` line',
    ]);
  });
});
