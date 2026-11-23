#!/usr/bin/env node
/**
 * Schema export of the Phase 2 build-out (spec §D.7; D4).
 *
 * Two calls, both against the harness database:
 *
 *   node scripts/db/schema-export.mjs --psql "<connection args>" --out <legacy.json>
 *        (after the legacy replay: a full snapshot of the public schema)
 *   node scripts/db/schema-export.mjs --psql "<connection args>" --baseline <legacy.json> --out <export.json>
 *        (after the build-out: the difference against the baseline)
 *
 * A snapshot (`kind: "snapshot"`) holds every public table and view with
 * its columns (name, format_type, nullability, default, enum labels, the
 * single-column CHECK definitions and the IN (...) value list when a CHECK
 * is one), and every public function by identity (name + argument types)
 * with argument names, modes and defaults, return type (set, relation,
 * enum), SECURITY DEFINER, volatility, language, EXECUTE grantees and a
 * body hash.
 *
 * The export (`kind: "buildout-export"`) keeps what the build-out added or
 * changed: new tables and views, new columns on legacy tables, and
 * functions that are new or redefined (same identity, a different body,
 * grants, config, security or return). check-pending-contract.mjs compares
 * it with the pending TS types. Never contacts anything but the given
 * psql connection.
 *
 * Library: snapshotSql, buildSnapshot, parseInList, sqlTypeClass,
 * diffSnapshots. Exit 0 written; 1 a query failed; 3 usage error.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** The one query of a snapshot: a single JSON document. */
export const snapshotSql = `
WITH rels AS (
  SELECT c.oid, c.relname, c.relkind
  FROM pg_class AS c JOIN pg_namespace AS n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm')
),
cols AS (
  SELECT r.relname,
         json_object_agg(a.attname, json_build_object(
           'ordinal', a.attnum,
           'type', format_type(a.atttypid, a.atttypmod),
           'typeCategory', t.typcategory,
           'typeType', t.typtype,
           'elementType', CASE WHEN t.typcategory = 'A' THEN format_type(t.typelem, NULL) END,
           'nullable', NOT a.attnotnull,
           'default', pg_get_expr(d.adbin, d.adrelid),
           'enumValues', CASE WHEN t.typtype = 'e' THEN (SELECT json_agg(e.enumlabel ORDER BY e.enumsortorder) FROM pg_enum AS e WHERE e.enumtypid = t.oid) END,
           'checks', (SELECT json_agg(pg_get_constraintdef(k.oid) ORDER BY k.conname) FROM pg_constraint AS k
                      WHERE k.conrelid = r.oid AND k.contype = 'c' AND k.conkey = ARRAY[a.attnum]::int2[])
         ) ORDER BY a.attnum) AS columns
  FROM rels AS r
  JOIN pg_attribute AS a ON a.attrelid = r.oid AND a.attnum > 0 AND NOT a.attisdropped
  JOIN pg_type AS t ON t.oid = a.atttypid
  LEFT JOIN pg_attrdef AS d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
  GROUP BY r.relname
),
fns AS (
  SELECT p.proname || '(' || oidvectortypes(p.proargtypes) || ')' AS ident,
         json_build_object(
           'name', p.proname,
           'argTypes', ARRAY(SELECT format_type(x.t, NULL) FROM unnest(p.proargtypes::oid[]) WITH ORDINALITY AS x(t, i) ORDER BY x.i),
           'allArgTypes', CASE WHEN p.proallargtypes IS NOT NULL THEN ARRAY(SELECT format_type(x.t, NULL) FROM unnest(p.proallargtypes) WITH ORDINALITY AS x(t, i) ORDER BY x.i) END,
           'argNames', p.proargnames,
           'argModes', p.proargmodes,
           'nargs', p.pronargs,
           'nargDefaults', p.pronargdefaults,
           'returns', format_type(p.prorettype, NULL),
           'returnsSet', p.proretset,
           'returnsRelation', (SELECT c2.relname FROM pg_class AS c2 JOIN pg_namespace AS n2 ON n2.oid = c2.relnamespace
                               WHERE c2.oid = rt.typrelid AND n2.nspname = 'public' AND c2.relkind IN ('r', 'p', 'v', 'm')),
           'returnsEnum', CASE WHEN rt.typtype = 'e' THEN (SELECT json_agg(e.enumlabel ORDER BY e.enumsortorder) FROM pg_enum AS e WHERE e.enumtypid = rt.oid) END,
           'secdef', p.prosecdef,
           'volatility', p.provolatile,
           'language', l.lanname,
           'kind', p.prokind,
           'grants', ARRAY(SELECT CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE r.rolname::text END
                           FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) AS a
                           LEFT JOIN pg_roles AS r ON r.oid = a.grantee
                           WHERE a.privilege_type = 'EXECUTE' AND a.grantee <> p.proowner
                           ORDER BY 1),
           'config', p.proconfig,
           'bodyHash', md5(coalesce(p.prosrc, ''))
         ) AS def
  FROM pg_proc AS p
  JOIN pg_namespace AS n ON n.oid = p.pronamespace
  JOIN pg_language AS l ON l.oid = p.prolang
  JOIN pg_type AS rt ON rt.oid = p.prorettype
  WHERE n.nspname = 'public' AND p.prokind IN ('f', 'p')
)
SELECT json_build_object(
  'relations', coalesce((SELECT json_object_agg(r.relname, json_build_object(
                  'kind', CASE WHEN r.relkind IN ('v', 'm') THEN 'view' ELSE 'table' END,
                  'columns', coalesce(c.columns, '{}'::json)) ORDER BY r.relname)
                FROM rels AS r LEFT JOIN cols AS c ON c.relname = r.relname), '{}'::json),
  'functions', coalesce((SELECT json_object_agg(f.ident, f.def ORDER BY f.ident) FROM fns AS f), '{}'::json)
)::text`;

/**
 * The value list of a single-column CHECK that is exactly an IN (...) list
 * (optionally "col IS NULL OR col IN (...)"), as Postgres prints it:
 *   CHECK ((status = ANY (ARRAY['a'::text, 'b'::text])))
 *   CHECK (((x IS NULL) OR (x = ANY (ARRAY['a'::text]))))
 *   CHECK (((x)::text = ANY ((ARRAY['a'::character varying])::text[])))
 * Anything else (a regex, a range, one equality, other logic) -> null.
 */
export function parseInList(def, column) {
  const text = String(def ?? '').replace(/\s+/g, ' ').trim();
  const arrays = [];
  // Pull out ARRAY[...] bodies first (quotes respected), so the shape test below sees no values.
  let shape = '';
  for (let i = 0; i < text.length; i += 1) {
    if (text.startsWith('ARRAY[', i)) {
      let j = i + 6;
      let inQuote = false;
      for (; j < text.length; j += 1) {
        const ch = text[j];
        if (inQuote) {
          if (ch === "'" && text[j + 1] === "'") j += 1;
          else if (ch === "'") inQuote = false;
        } else if (ch === "'") inQuote = true;
        else if (ch === ']') break;
      }
      arrays.push(text.slice(i + 6, j));
      shape += 'ARRAY';
      i = j;
    } else shape += text[i];
  }
  if (arrays.length !== 1) return null;
  const col = `(?:"${column}"|${column})`;
  const normal = shape.replace(/[()]/g, ' ').replace(/\s+/g, ' ').replace(/ ::/g, '::').trim();
  const re = new RegExp(`^CHECK (?:${col} IS NULL OR )?${col}(?:::[a-z ]+)? = ANY ARRAY(?:::[a-z ]+\\[\\])?$`);
  if (!re.test(normal)) return null;
  const values = [];
  const item = /'((?:[^']|'')*)'(?:::[a-z ]+)?/g;
  let m;
  let rest = arrays[0];
  while ((m = item.exec(arrays[0])) !== null) {
    values.push(m[1].replace(/''/g, "'"));
    rest = rest.replace(m[0], '');
  }
  if (rest.replace(/[\s,]/g, '') !== '') return null;
  return values;
}

/** The TS class a SQL type maps to (spec §B.1 conventions). */
export function sqlTypeClass(column) {
  const type = String(column.type ?? '');
  if (column.enumValues) return { kind: 'literals', values: [...column.enumValues] };
  if (type.endsWith('[]')) {
    const element = sqlTypeClass({ type: type.slice(0, -2) });
    return { kind: 'array', element };
  }
  if (type === 'jsonb' || type === 'json') return { kind: 'json' };
  if (type === 'boolean') return { kind: 'boolean' };
  if (/^(smallint|integer|bigint|numeric|real|double precision)(\(.*\))?$/.test(type)) return { kind: 'number' };
  if (column.inValues) return { kind: 'literals', values: [...column.inValues] };
  return { kind: 'string' };
}

/** A snapshot from the raw query result: relations, columns (with inValues), functions. */
export function buildSnapshot(raw) {
  const relations = {};
  for (const [name, rel] of Object.entries(raw.relations ?? {})) {
    const columns = {};
    for (const [col, def] of Object.entries(rel.columns ?? {})) {
      let inValues = null;
      for (const check of def.checks ?? []) {
        const values = parseInList(check, col);
        if (values) {
          inValues = values;
          break;
        }
      }
      columns[col] = { ...def, checks: def.checks ?? [], inValues };
    }
    relations[name] = { kind: rel.kind, columns };
  }
  const functions = {};
  for (const [ident, def] of Object.entries(raw.functions ?? {})) {
    const modes = def.argModes ?? null;
    const names = def.argNames ?? [];
    const allTypes = def.allArgTypes ?? def.argTypes ?? [];
    const args = [];
    const table = [];
    allTypes.forEach((type, i) => {
      const mode = modes ? modes[i] : 'i';
      const name = names[i] ?? '';
      if (mode === 'i' || mode === 'b' || mode === 'v') args.push({ name, type, mode });
      if (mode === 't' || mode === 'o' || mode === 'b') table.push({ name, type });
    });
    const firstDefault = args.length - (def.nargDefaults ?? 0);
    args.forEach((a, i) => {
      a.hasDefault = i >= firstDefault;
    });
    functions[ident] = {
      name: def.name,
      args,
      returns: def.returns,
      returnsSet: !!def.returnsSet,
      returnsRelation: def.returnsRelation ?? null,
      returnsEnum: def.returnsEnum ?? null,
      returnsTable: modes && modes.includes('t') ? table : null,
      secdef: !!def.secdef,
      volatility: def.volatility,
      language: def.language,
      grants: def.grants ?? [],
      config: def.config ?? null,
      bodyHash: def.bodyHash,
    };
  }
  return { version: 1, kind: 'snapshot', relations, functions };
}

const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * The build-out export: what `current` adds or changes against `baseline`.
 * New tables and views (with every column), new columns on legacy tables,
 * new or redefined functions (status new / redefined), and what vanished
 * (informational).
 */
export function diffSnapshots(baseline, current) {
  const out = { version: 1, kind: 'buildout-export', tables: {}, views: {}, legacyColumns: {}, changedLegacyColumns: {}, functions: {}, removed: { relations: [], columns: [], functions: [] } };
  for (const [name, rel] of Object.entries(current.relations)) {
    const before = baseline.relations[name];
    if (!before) {
      (rel.kind === 'view' ? out.views : out.tables)[name] = rel;
      continue;
    }
    for (const [col, def] of Object.entries(rel.columns)) {
      const old = before.columns[col];
      if (!old) (out.legacyColumns[name] ??= {})[col] = def;
      else if (old.type !== def.type || old.nullable !== def.nullable || !sameJson(old.inValues, def.inValues)) (out.changedLegacyColumns[name] ??= {})[col] = { before: old, after: def };
    }
    for (const col of Object.keys(before.columns)) if (!rel.columns[col]) out.removed.columns.push(`${name}.${col}`);
  }
  for (const name of Object.keys(baseline.relations)) if (!current.relations[name]) out.removed.relations.push(name);
  for (const [ident, fn] of Object.entries(current.functions)) {
    const before = baseline.functions[ident];
    if (!before) out.functions[ident] = { ...fn, status: 'new' };
    else {
      const changed = ['bodyHash', 'grants', 'config', 'secdef', 'returns', 'returnsSet', 'volatility', 'args'].filter((k) => !sameJson(before[k], fn[k]));
      if (changed.length) out.functions[ident] = { ...fn, status: 'redefined', changed };
    }
  }
  for (const ident of Object.keys(baseline.functions)) if (!current.functions[ident]) out.removed.functions.push(ident);
  return out;
}

/** Runs the snapshot query through psql; returns the snapshot. */
export function takeSnapshot({ psqlBin = 'psql', connection }) {
  const res = spawnSync(psqlBin, ['-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1', ...connection, '-c', snapshotSql], {
    encoding: 'utf8',
    maxBuffer: 512 * 1024 * 1024,
    env: { ...process.env, PGOPTIONS: '', PGTZ: 'UTC' },
  });
  if (res.status !== 0) throw new Error(`psql failed: ${(res.stderr || res.error?.message || '').trim()}`);
  return buildSnapshot(JSON.parse(res.stdout.trim()));
}

export function parseCli(argv) {
  const opts = { psql: null, out: null, baseline: null, psqlBin: 'psql' };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const value = () => {
      const v = argv[i + 1];
      if (v === undefined || v === '') throw new Error(`${a} needs a value`);
      i += 1;
      return v;
    };
    if (a === '--psql') opts.psql = value();
    else if (a === '--out') opts.out = resolve(value());
    else if (a === '--baseline') opts.baseline = resolve(value());
    else if (a === '--psql-bin') opts.psqlBin = value();
    else throw new Error(`unknown flag ${a}`);
  }
  if (!opts.psql) throw new Error('--psql "<connection args>" is required');
  if (!opts.out) throw new Error('--out <file> is required');
  return opts;
}

function main() {
  let opts;
  try {
    opts = parseCli(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`schema-export: ${err.message}\nUsage: node scripts/db/schema-export.mjs --psql "<connection args>" --out <file> [--baseline <snapshot.json>] [--psql-bin <psql>]\n`);
    return 3;
  }
  let snapshot;
  try {
    snapshot = takeSnapshot({ psqlBin: opts.psqlBin, connection: opts.psql.split(/\s+/).filter(Boolean) });
  } catch (err) {
    process.stderr.write(`schema-export: ${err.message}\n`);
    return 1;
  }
  const doc = opts.baseline ? diffSnapshots(JSON.parse(readFileSync(opts.baseline, 'utf8')), snapshot) : snapshot;
  writeFileSync(opts.out, `${JSON.stringify(doc, null, 2)}\n`);
  if (doc.kind === 'buildout-export') {
    const lc = Object.values(doc.legacyColumns).reduce((n, c) => n + Object.keys(c).length, 0);
    process.stdout.write(`schema-export: ${Object.keys(doc.tables).length} new tables, ${Object.keys(doc.views).length} new views, ${lc} new legacy columns, ${Object.keys(doc.functions).length} new or redefined functions -> ${opts.out}\n`);
  } else process.stdout.write(`schema-export: snapshot of ${Object.keys(doc.relations).length} relations, ${Object.keys(doc.functions).length} functions -> ${opts.out}\n`);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) process.exitCode = main();
