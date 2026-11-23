/**
 * Static SQL reading for the harness: top-level statements (the same
 * splitter as `src/test/config/migrations.test.ts`: comments dropped,
 * dollar-quoted bodies kept as `$$…$$`) and the one-definition scanner of
 * Phase 2 rule §0.2 (proposed D-120):
 *
 *   no build-out file creates (or `CREATE OR REPLACE`s) a function, view or
 *   policy that another build-out file creates, and every legacy function
 *   is redefined in at most one build-out file.
 *
 * Functions are keyed by schema-qualified name (all overloads together),
 * views by schema-qualified name, policies by name and table. Statements
 * inside `DO` blocks and function bodies are code and are not read.
 */

/** Top-level SQL statements, without comments; dollar-quoted bodies become `$$…$$` (and are pushed to `bodies`). */
export function topLevelStatements(sql, bodies = []) {
  const out = [];
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

const IDENT = String.raw`(?:"(?:[^"]|"")+"|[A-Za-z_][\w$]*)`;
const QUALIFIED = String.raw`(?:${IDENT}\s*\.\s*)?${IDENT}`;

/** A name as Postgres resolves it, schema-qualified (`public` by default): unquoted parts fold to lower case. */
export function qualifiedName(raw) {
  const parts = (String(raw).match(/"(?:[^"]|"")+"|[^."\s]+/g) ?? []).map((p) => (p.startsWith('"') ? p.slice(1, -1).replace(/""/g, '"') : p.toLowerCase()));
  return parts.length === 1 ? `public.${parts[0]}` : parts.join('.');
}

const FUNCTION_RE = new RegExp(String.raw`^CREATE (?:OR REPLACE )?(FUNCTION|PROCEDURE) (${QUALIFIED})\s*\(`, 'i');
const VIEW_RE = new RegExp(String.raw`^CREATE (?:OR REPLACE )?(?:(?:TEMP|TEMPORARY) )?(?:RECURSIVE )?VIEW (${QUALIFIED})`, 'i');
const MATVIEW_RE = new RegExp(String.raw`^CREATE MATERIALIZED VIEW (?:IF NOT EXISTS )?(${QUALIFIED})`, 'i');
const POLICY_RE = new RegExp(String.raw`^CREATE POLICY (${IDENT}) ON (${QUALIFIED})`, 'i');

const unquoteIdent = (raw) => (raw.startsWith('"') ? raw.slice(1, -1).replace(/""/g, '"') : raw.toLowerCase());

/** The functions, views and policies one file creates at top level: `[{ kind, key, label }]`. */
export function definitionsIn(sql) {
  const defs = [];
  for (const s of topLevelStatements(sql)) {
    let m;
    if ((m = s.match(FUNCTION_RE))) {
      const key = qualifiedName(m[2]);
      defs.push({ kind: 'function', key, label: `${m[1].toLowerCase()} ${key}` });
    } else if ((m = s.match(MATVIEW_RE)) || (m = s.match(VIEW_RE))) {
      const key = qualifiedName(m[1]);
      defs.push({ kind: 'view', key, label: `view ${key}` });
    } else if ((m = s.match(POLICY_RE))) {
      const table = qualifiedName(m[2]);
      const name = unquoteIdent(m[1]);
      defs.push({ kind: 'policy', key: `${name}@${table}`, label: `policy "${name}" on ${table}` });
    }
  }
  return defs;
}

/** Function names (schema-qualified) the legacy files create at top level. */
export function legacyFunctionNames(legacyFiles) {
  const names = new Set();
  for (const { sql } of legacyFiles) for (const d of definitionsIn(sql)) if (d.kind === 'function') names.add(d.key);
  return names;
}

/**
 * Rule §0.2 problems over the build-out files (`[{ file, sql }]`, in
 * order). `legacyFunctions` (a Set of qualified names) only sharpens the
 * message: any object defined in two build-out files is a problem.
 */
export function redefinitionProblems(buildOutFiles, legacyFunctions = new Set()) {
  const owners = new Map();
  for (const { file, sql } of buildOutFiles) {
    const seenHere = new Set();
    for (const d of definitionsIn(sql)) {
      const id = `${d.kind}:${d.key}`;
      if (seenHere.has(id)) continue;
      seenHere.add(id);
      owners.set(id, [...(owners.get(id) ?? []), { file, def: d }]);
    }
  }
  const problems = [];
  for (const [, list] of owners) {
    if (list.length < 2) continue;
    const { def } = list[0];
    const files = list.map((x) => x.file).join(', ');
    const legacy = def.kind === 'function' && legacyFunctions.has(def.key);
    problems.push(
      legacy
        ? `legacy ${def.label} is redefined in more than one build-out file (${files}); redefine it in exactly one (rule §0.2)`
        : `${def.label} is created in more than one build-out file (${files}); one definition per object (rule §0.2)`,
    );
  }
  return problems;
}
