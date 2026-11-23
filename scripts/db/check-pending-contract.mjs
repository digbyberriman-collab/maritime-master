#!/usr/bin/env node
/**
 * Pending-type contract check (Phase 2 spec §D.7, §B.1; D4).
 *
 *   node scripts/db/check-pending-contract.mjs --export <export.json> [--map scripts/db/contract-map.json] [--root <repo>] [--json]
 *
 * Loads the files and type names of contract-map.json with a TypeScript
 * Program + TypeChecker (path alias '@/' -> src/, strictNullChecks on so
 * `| null` survives) and compares them with the build-out export of
 * scripts/db/schema-export.mjs. It fails on:
 *   - a pending table / view / column / function missing from the export;
 *   - a column type, nullability (tables and new columns; view columns are
 *     always nullable in the catalogue, so not compared) or literal-union
 *     mismatch: a union needs an IN (...) CHECK (or an enum) and equals it;
 *     a column without one is `string` (CC-13). A view has no CHECK: a
 *     text view column typed as a union is a warning, not a mismatch;
 *   - an argument name or optionality mismatch (optional = has a DEFAULT),
 *     an argument of another type class;
 *   - a return-shape mismatch (a table row type for RETURNS <table>, T[]
 *     for SETOF, the scalar class otherwise; text may be a literal union);
 *   - a pending function `authenticated` cannot execute (it would fail in
 *     the browser);
 *   - a "must mirror" object missing: every name the map expects, every new
 *     table / view / legacy column, and every new function authenticated
 *     may execute, unless contract-map.json lists it under notMirrored with
 *     a reason;
 *   - a stale map entry (notMirrored or knownMismatches naming nothing).
 * Mismatches listed in knownMismatches (each with its followup) are
 * reported but do not fail. It never edits a TS file: fixes are Lane 2
 * followups.
 *
 * Library: loadPending, compareContract, classifyColumnText (tests).
 * Exit 0 green; 1 mismatches; 3 usage or input error.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import { sqlTypeClass } from './schema-export.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

// ------------------------------------------------------------------ TS side

function makeClassifier(checker) {
  const merge = (parts, nullable, text) => {
    const kinds = new Set(parts.map((p) => p.kind));
    const base = { nullable, text, undefinedPart: kinds.has('undefined') };
    kinds.delete('undefined');
    if (kinds.has('string')) {
      const others = [...kinds].filter((k) => k !== 'string' && k !== 'literal');
      return others.length ? { ...base, kind: 'mixed' } : { ...base, kind: 'string' };
    }
    if (kinds.size === 1 && kinds.has('literal')) return { ...base, kind: 'literals', values: [...new Set(parts.map((p) => p.value))].sort() };
    if (kinds.size === 1) {
      const [kind] = kinds;
      if (kind === 'array') {
        const arrays = parts.filter((p) => p.kind === 'array');
        return arrays.length === 1 ? { ...base, kind: 'array', element: arrays[0].element } : { ...base, kind: 'mixed' };
      }
      if (kind === 'object') {
        const objects = parts.filter((p) => p.kind === 'object');
        return objects.length === 1 ? { ...base, kind: 'object', type: objects[0].type } : { ...base, kind: 'mixed' };
      }
      return { ...base, kind };
    }
    if (kinds.size === 0) return { ...base, kind: nullable ? 'null' : 'unknown' };
    return { ...base, kind: 'mixed' };
  };

  const classifyType = (type, text = checker.typeToString(type)) => {
    const parts = [];
    let nullable = false;
    const visit = (x) => {
      if (x.aliasSymbol?.getName() === 'Json') return void parts.push({ kind: 'json' });
      if (x.flags & ts.TypeFlags.Null) return void (nullable = true);
      if (x.flags & ts.TypeFlags.Undefined) return void parts.push({ kind: 'undefined' });
      if (x.isUnion()) return void x.types.forEach(visit);
      if (x.flags & ts.TypeFlags.StringLiteral) return void parts.push({ kind: 'literal', value: x.value });
      if (x.flags & ts.TypeFlags.String) return void parts.push({ kind: 'string' });
      if (x.flags & (ts.TypeFlags.Number | ts.TypeFlags.NumberLiteral)) return void parts.push({ kind: 'number' });
      if (x.flags & (ts.TypeFlags.Boolean | ts.TypeFlags.BooleanLiteral)) return void parts.push({ kind: 'boolean' });
      if (x.flags & ts.TypeFlags.Never) return void parts.push({ kind: 'never' });
      if (x.flags & ts.TypeFlags.Void) return void parts.push({ kind: 'void' });
      if (checker.isArrayType(x) || checker.isTupleType?.(x)) {
        const [element] = checker.getTypeArguments(x);
        return void parts.push({ kind: 'array', element: element ? classifyType(element) : { kind: 'unknown' } });
      }
      if (x.flags & ts.TypeFlags.Object || x.isIntersection()) return void parts.push({ kind: 'object', type: x });
      parts.push({ kind: 'unknown' });
    };
    visit(type);
    return merge(parts, nullable, text);
  };

  /** Syntax first (a declared `Json | null` keeps its null; Json itself contains null), then the checker. */
  const classifyNode = (node) => {
    const parts = [];
    let nullable = false;
    const take = (c) => {
      if (c.nullable) nullable = true;
      if (c.kind === 'literals') for (const v of c.values) parts.push({ kind: 'literal', value: v });
      else if (c.kind === 'null') return;
      else parts.push({ ...c });
      if (c.undefinedPart) parts.push({ kind: 'undefined' });
    };
    const visit = (n) => {
      while (ts.isParenthesizedTypeNode(n)) n = n.type;
      if (ts.isUnionTypeNode(n)) return void n.types.forEach(visit);
      if (ts.isLiteralTypeNode(n)) {
        if (n.literal.kind === ts.SyntaxKind.NullKeyword) return void (nullable = true);
        if (ts.isStringLiteral(n.literal) || ts.isNoSubstitutionTemplateLiteral(n.literal)) return void parts.push({ kind: 'literal', value: n.literal.text });
        if (ts.isNumericLiteral(n.literal)) return void parts.push({ kind: 'number' });
        if (n.literal.kind === ts.SyntaxKind.TrueKeyword || n.literal.kind === ts.SyntaxKind.FalseKeyword) return void parts.push({ kind: 'boolean' });
      }
      switch (n.kind) {
        case ts.SyntaxKind.StringKeyword:
          return void parts.push({ kind: 'string' });
        case ts.SyntaxKind.NumberKeyword:
          return void parts.push({ kind: 'number' });
        case ts.SyntaxKind.BooleanKeyword:
          return void parts.push({ kind: 'boolean' });
        case ts.SyntaxKind.UndefinedKeyword:
          return void parts.push({ kind: 'undefined' });
        case ts.SyntaxKind.NeverKeyword:
          return void parts.push({ kind: 'never' });
        case ts.SyntaxKind.VoidKeyword:
          return void parts.push({ kind: 'void' });
        case ts.SyntaxKind.NullKeyword:
          return void (nullable = true);
        default:
          break;
      }
      if (ts.isArrayTypeNode(n)) return void parts.push({ kind: 'array', element: classifyNode(n.elementType) });
      if (ts.isTypeReferenceNode(n)) {
        const name = n.typeName.getText();
        if ((name === 'Array' || name === 'ReadonlyArray') && n.typeArguments?.length === 1) return void parts.push({ kind: 'array', element: classifyNode(n.typeArguments[0]) });
        const t = checker.getTypeFromTypeNode(n);
        if (name === 'Json' || t.aliasSymbol?.getName() === 'Json') return void parts.push({ kind: 'json' });
        return void take(classifyType(t, n.getText()));
      }
      take(classifyType(checker.getTypeFromTypeNode(n), n.getText()));
    };
    visit(node);
    return merge(parts, nullable, node.getText());
  };

  const classifySymbol = (symbol, at) => {
    const decl = symbol.valueDeclaration ?? symbol.declarations?.[0];
    const optional = !!(symbol.flags & ts.SymbolFlags.Optional);
    if (decl && (ts.isPropertySignature(decl) || ts.isPropertyDeclaration(decl)) && decl.type) return { ...classifyNode(decl.type), optional };
    return { ...classifyType(checker.getTypeOfSymbolAtLocation(symbol, at)), optional };
  };

  return { classifyType, classifyNode, classifySymbol };
}

/** Columns of an object type: Map<name, class>. */
function columnsOf(checker, cls, type, at) {
  const out = new Map();
  for (const p of checker.getPropertiesOfType(type)) out.set(p.getName(), cls.classifySymbol(p, at));
  return out;
}

/**
 * Reads the pending types named by the map. Returns
 * { files: [{ file, tables, views, columns, functions }], problems: [] }
 * where tables / views / columns are Map<name, Map<column, class>> and
 * functions Map<name, { args: Map<arg, class> | null (never), returns: class, returnsColumns: Map | null }>.
 */
export function loadPending({ root = ROOT, map, compilerOptions = {} }) {
  const fileNames = map.files.map((f) => resolve(root, f.file));
  const options = {
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    strictNullChecks: true,
    noEmit: true,
    skipLibCheck: true,
    allowImportingTsExtensions: true,
    jsx: ts.JsxEmit.ReactJSX,
    lib: ['lib.es2020.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
    types: [],
    baseUrl: root,
    paths: { '@/*': ['src/*'] },
    ...compilerOptions,
  };
  const program = ts.createProgram(fileNames, options);
  const checker = program.getTypeChecker();
  const cls = makeClassifier(checker);
  const problems = [];
  const files = [];

  for (const entry of map.files) {
    const path = resolve(root, entry.file);
    const sf = program.getSourceFile(path);
    const loaded = { file: entry.file, tables: new Map(), views: new Map(), columns: new Map(), functions: new Map() };
    files.push(loaded);
    if (!sf) {
      problems.push({ key: `file:${entry.file}:missing`, message: `${entry.file}: file not found` });
      continue;
    }
    for (const d of program.getSemanticDiagnostics(sf)) {
      if (d.category !== ts.DiagnosticCategory.Error) continue;
      problems.push({ key: `file:${entry.file}:diagnostic`, message: `${entry.file}: TypeScript error: ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}` });
    }
    const declOf = (name) =>
      sf.statements.find((s) => (ts.isTypeAliasDeclaration(s) || ts.isInterfaceDeclaration(s)) && s.name.text === name) ?? null;

    for (const section of ['tables', 'views', 'columns', 'functions']) {
      const spec = entry[section];
      if (!spec) continue;
      const decl = declOf(spec.type);
      if (!decl) {
        problems.push({ key: `type:${entry.file}:${spec.type}:missing`, message: `${entry.file}: type ${spec.type} not found` });
        continue;
      }
      const container = checker.getDeclaredTypeOfSymbol(checker.getSymbolAtLocation(decl.name));
      for (const member of checker.getPropertiesOfType(container)) {
        const name = member.getName();
        const memberType = checker.getTypeOfSymbolAtLocation(member, decl);
        if (section === 'functions') {
          const argsSym = checker.getPropertyOfType(memberType, 'Args');
          const retSym = checker.getPropertyOfType(memberType, 'Returns');
          let args = null;
          if (argsSym) {
            const argsType = checker.getTypeOfSymbolAtLocation(argsSym, decl);
            args = argsType.flags & ts.TypeFlags.Never ? null : columnsOf(checker, cls, argsType, decl);
          }
          const returns = retSym ? cls.classifySymbol(retSym, decl) : { kind: 'unknown' };
          const objectOf = (c) => (c.kind === 'object' ? c.type : c.kind === 'array' && c.element?.kind === 'object' ? c.element.type : null);
          const objType = objectOf(returns);
          loaded.functions.set(name, { args, hasArgs: !!argsSym, returns, returnsColumns: objType ? columnsOf(checker, cls, objType, decl) : null, type: spec.type });
        } else {
          const rowSym = checker.getPropertyOfType(memberType, 'Row');
          if (!rowSym) {
            problems.push({ key: `type:${entry.file}:${spec.type}.${name}:no-row`, message: `${entry.file}: ${spec.type}.${name} has no Row` });
            continue;
          }
          const rowType = checker.getTypeOfSymbolAtLocation(rowSym, decl);
          loaded[section].set(name, { type: spec.type, columns: columnsOf(checker, cls, rowType, decl) });
        }
      }
    }
  }
  return { files, problems };
}

/** For tests: the class of a TS type written as text (with optional extra declarations). */
export function classifyColumnText(typeText, prelude = '') {
  const source = `${prelude}\nexport type __T = { c: ${typeText} };\n`;
  const fileName = join(ROOT, '__contract_probe__.ts');
  const host = ts.createCompilerHost({ strict: true, strictNullChecks: true, noEmit: true, types: [], lib: ['lib.es2020.d.ts'] });
  const orig = host.getSourceFile.bind(host);
  host.getSourceFile = (name, lang, ...rest) => (name === fileName ? ts.createSourceFile(name, source, lang, true) : orig(name, lang, ...rest));
  host.fileExists = ((f) => (n) => n === fileName || f(n))(host.fileExists.bind(host));
  host.readFile = ((f) => (n) => (n === fileName ? source : f(n)))(host.readFile.bind(host));
  const program = ts.createProgram([fileName], { strict: true, strictNullChecks: true, noEmit: true, types: [], lib: ['lib.es2020.d.ts'] }, host);
  const checker = program.getTypeChecker();
  const sf = program.getSourceFile(fileName);
  const decl = sf.statements.find((s) => ts.isTypeAliasDeclaration(s) && s.name.text === '__T');
  const type = checker.getDeclaredTypeOfSymbol(checker.getSymbolAtLocation(decl.name));
  const prop = checker.getPropertyOfType(type, 'c');
  const c = makeClassifier(checker).classifySymbol(prop, decl);
  return { kind: c.kind, values: c.values, nullable: c.nullable, element: c.element ? { kind: c.element.kind, values: c.element.values } : undefined };
}

// ------------------------------------------------------------------ comparison

const describe = (c) => {
  if (!c) return 'nothing';
  if (c.kind === 'literals') return `union ${c.values.map((v) => `'${v}'`).join(' | ')}`;
  if (c.kind === 'array') return `${describe(c.element)}[]`;
  return c.kind;
};
const family = (c) => (c.kind === 'literals' ? 'string' : c.kind === 'array' ? `array<${family(c.element)}>` : c.kind);
const sameSet = (a, b) => a.length === b.length && [...a].sort().every((v, i) => v === [...b].sort()[i]);

/** Type problems of a TS class against the SQL class (strict: literal unions exactly as the CHECK). */
function typeProblems(want, got) {
  if (want.kind === 'literals') {
    if (got.kind === 'literals') {
      if (sameSet(want.values, got.values)) return [];
      const missing = want.values.filter((v) => !got.values.includes(v));
      const extra = got.values.filter((v) => !want.values.includes(v));
      return [`literal union differs from the SQL list${missing.length ? `; missing ${missing.map((v) => `'${v}'`).join(', ')}` : ''}${extra.length ? `; not in SQL ${extra.map((v) => `'${v}'`).join(', ')}` : ''}`];
    }
    if (got.kind === 'string') return [`SQL has an IN (...) CHECK: type it as the literal union ${describe(want).replace(/^union /, '')}, not string`];
    return [`type ${describe(got)}, SQL ${describe(want)}`];
  }
  if (want.kind === 'string') {
    if (got.kind === 'literals') return [`literal union ${describe(got).replace(/^union /, '')} without an SQL IN (...) CHECK: type it as string (CC-13)`];
    return got.kind === 'string' ? [] : [`type ${describe(got)}, SQL string`];
  }
  if (want.kind === 'array') {
    if (got.kind !== 'array') return [`type ${describe(got)}, SQL ${describe(want)}`];
    return typeProblems(want.element, { ...got.element, nullable: false }).map((p) => `array element: ${p}`);
  }
  return got.kind === want.kind ? [] : [`type ${describe(got)}, SQL ${describe(want)}`];
}

function compareColumns({ where, keyBase, sqlColumns, tsColumns, checkNull, mismatches, view = false, warnings = [] }) {
  for (const [col, sql] of Object.entries(sqlColumns)) {
    const t = tsColumns.get(col);
    if (!t) {
      mismatches.push({ key: `${keyBase}.${col}:missing-in-ts`, message: `${where}: column ${col} (${sql.type}${sql.nullable ? ', nullable' : ', not null'}) is missing from the TS row` });
      continue;
    }
    const want = sqlTypeClass(sql);
    let problems = typeProblems(want, t);
    // A view has no CHECK: a text column typed as a literal union (a CASE or a checked base column) cannot be verified here.
    if (view && want.kind === 'string' && t.kind === 'literals') {
      problems = [];
      warnings.push(`${where}.${col}: view column typed as the union ${t.values.map((v) => `'${v}'`).join(' | ')}; views carry no CHECK, so the vocabulary is not verified`);
    }
    if (checkNull && t.nullable !== sql.nullable) problems.push(sql.nullable ? 'SQL column is nullable: add | null' : 'SQL column is NOT NULL: remove | null');
    if (t.optional) problems.push('the row property is optional (?): rows always carry every column');
    for (const p of problems) {
      const kind = p.startsWith('SQL column is') ? 'nullability' : p.includes('union') || p.includes('IN (...)') ? 'union' : 'type';
      mismatches.push({ key: `${keyBase}.${col}:${kind}`, message: `${where}.${col}: ${p} (SQL ${sql.type}${sql.nullable ? ' NULL' : ' NOT NULL'}${sql.inValues ? `, IN (${sql.inValues.join(', ')})` : ''})` });
    }
  }
  for (const col of tsColumns.keys()) {
    if (!(col in sqlColumns)) mismatches.push({ key: `${keyBase}.${col}:missing-in-sql`, message: `${where}: TS column ${col} does not exist in SQL` });
  }
}

/**
 * Compares the export with the loaded pending types. Returns
 * { mismatches, known, warnings, counts } (mismatches fail; known are
 * listed in map.knownMismatches; warnings never fail).
 */
export function compareContract(exportDoc, pending, map, { typesFunctions = new Set() } = {}) {
  const all = [];
  const warnings = [];
  const notMirrored = map.notMirrored ?? {};
  const relationColumns = (name) => exportDoc.tables[name]?.columns ?? exportDoc.views[name]?.columns ?? null;
  const seen = { tables: new Map(), views: new Map(), columns: new Map(), functions: new Map() };

  for (const p of pending.problems) all.push(p);

  for (const [i, loaded] of pending.files.entries()) {
    const entry = map.files[i];
    for (const section of ['tables', 'views', 'columns', 'functions']) {
      const spec = entry[section];
      if (!spec) continue;
      const declared = loaded[section];
      for (const name of spec.expect ?? []) {
        if (!declared.has(name)) all.push({ key: `${section}:${name}:missing-in-ts`, message: `${entry.file}: ${spec.type} must declare ${name} (spec §B.1, contract-map.json)` });
      }
      for (const name of declared.keys()) {
        if (!(spec.expect ?? []).includes(name)) warnings.push(`${entry.file}: ${spec.type}.${name} is not in contract-map.json (checked anyway)`);
        if (seen[section].has(name)) all.push({ key: `${section}:${name}:declared-twice`, message: `${name} is declared in both ${seen[section].get(name)} and ${entry.file}` });
        seen[section].set(name, entry.file);
      }
    }

    for (const [name, t] of loaded.tables) {
      const where = `${entry.file}: ${t.type}.${name}`;
      const sql = exportDoc.tables[name];
      if (!sql) {
        const isView = !!exportDoc.views[name];
        all.push({ key: `table:${name}:missing-in-sql`, message: `${where}: no table ${name} in the build-out${isView ? ' (it is a view: declare it in *PendingViews)' : ' (a live table gets *PendingColumns, D-133)'}` });
        continue;
      }
      compareColumns({ where, keyBase: `table:${name}`, sqlColumns: sql.columns, tsColumns: t.columns, checkNull: true, mismatches: all });
    }
    for (const [name, t] of loaded.views) {
      const where = `${entry.file}: ${t.type}.${name}`;
      const sql = exportDoc.views[name];
      if (!sql) {
        all.push({ key: `view:${name}:missing-in-sql`, message: `${where}: no view ${name} in the build-out` });
        continue;
      }
      compareColumns({ where, keyBase: `view:${name}`, sqlColumns: sql.columns, tsColumns: t.columns, checkNull: false, mismatches: all, view: true, warnings });
    }
    for (const [table, t] of loaded.columns) {
      const where = `${entry.file}: ${t.type}.${table}`;
      if (exportDoc.tables[table] || exportDoc.views[table]) {
        all.push({ key: `columns:${table}:new-table`, message: `${where}: ${table} is a new table; declare it in *PendingTables, not *PendingColumns` });
        continue;
      }
      const added = exportDoc.legacyColumns[table] ?? {};
      const sqlColumns = {};
      for (const col of t.columns.keys()) if (added[col]) sqlColumns[col] = added[col];
      for (const col of t.columns.keys()) {
        if (!added[col]) all.push({ key: `columns:${table}.${col}:missing-in-sql`, message: `${where}: ${col} is not a column the build-out adds to ${table}` });
      }
      const tsKnown = new Map([...t.columns].filter(([col]) => added[col]));
      compareColumns({ where, keyBase: `columns:${table}`, sqlColumns, tsColumns: tsKnown, checkNull: true, mismatches: all });
    }
    for (const [name, f] of loaded.functions) {
      const where = `${entry.file}: ${f.type}.${name}`;
      const overloads = Object.values(exportDoc.functions).filter((fn) => fn.name === name);
      if (!overloads.length) {
        all.push({ key: `function:${name}:missing-in-sql`, message: `${where}: no function ${name} in the build-out` });
        continue;
      }
      const tsArgNames = f.args ? [...f.args.keys()].sort() : [];
      const fn = overloads.length === 1 ? overloads[0] : overloads.find((o) => sameSet(o.args.map((a) => a.name), tsArgNames));
      if (!fn) {
        all.push({ key: `function:${name}:overload`, message: `${where}: ${overloads.length} overloads in SQL and none has the TS argument names (${tsArgNames.join(', ') || 'none'})` });
        continue;
      }
      if (!f.hasArgs) all.push({ key: `function:${name}:args`, message: `${where}: no Args (use Args: never for a function without arguments)` });
      if (!(fn.grants.includes('authenticated') || fn.grants.includes('PUBLIC'))) {
        all.push({ key: `function:${name}:grant`, message: `${where}: authenticated cannot execute ${name} (grants: ${fn.grants.join(', ') || 'none'}); a browser call would fail` });
      }
      const sqlArgs = new Map(fn.args.map((a) => [a.name, a]));
      if (f.args === null) {
        if (fn.args.length) all.push({ key: `function:${name}:args`, message: `${where}: Args is never, SQL takes ${fn.args.map((a) => a.name).join(', ')}` });
      } else {
        for (const [argName, a] of sqlArgs) {
          const t = f.args.get(argName);
          if (!t) {
            all.push({ key: `function:${name}(${argName}):missing-in-ts`, message: `${where}: argument ${argName} (${a.type}${a.hasDefault ? ', has a default' : ''}) is missing from Args` });
            continue;
          }
          if (t.optional !== a.hasDefault) {
            all.push({ key: `function:${name}(${argName}):optional`, message: `${where}: argument ${argName} is ${t.optional ? 'optional' : 'required'} in TS, SQL ${a.hasDefault ? 'has a DEFAULT (make it optional: ?)' : 'has no DEFAULT (make it required)'}` });
          }
          const want = sqlTypeClass({ type: a.type });
          if (family(want) !== family(t)) all.push({ key: `function:${name}(${argName}):type`, message: `${where}: argument ${argName} is ${describe(t)}, SQL ${a.type}` });
        }
        for (const argName of f.args.keys()) {
          if (!sqlArgs.has(argName)) all.push({ key: `function:${name}(${argName}):missing-in-sql`, message: `${where}: TS argument ${argName} is not an argument of ${name} in SQL (${fn.args.map((a) => a.name).join(', ') || 'none'})` });
        }
      }
      // Returns
      const r = f.returns;
      if (fn.returnsRelation) {
        const cols = relationColumns(fn.returnsRelation);
        const wantArray = fn.returnsSet;
        const okShape = wantArray ? r.kind === 'array' && r.element?.kind === 'object' : r.kind === 'object';
        if (!okShape) all.push({ key: `function:${name}:returns`, message: `${where}: Returns is ${describe(r)}, SQL returns ${wantArray ? 'SETOF ' : ''}${fn.returnsRelation} (its Row type${wantArray ? '[]' : ''})` });
        else if (cols && f.returnsColumns) {
          compareColumns({ where: `${where} Returns (${fn.returnsRelation})`, keyBase: `function:${name}:returns`, sqlColumns: cols, tsColumns: f.returnsColumns, checkNull: !!exportDoc.tables[fn.returnsRelation], mismatches: all });
        } else if (!cols) warnings.push(`${where}: returns the legacy relation ${fn.returnsRelation}; its columns are not compared`);
      } else if (fn.returnsTable) {
        if (!(r.kind === 'array' && r.element?.kind === 'object')) all.push({ key: `function:${name}:returns`, message: `${where}: Returns is ${describe(r)}, SQL returns TABLE (${fn.returnsTable.map((c) => c.name).join(', ')}): an array of rows` });
      } else {
        const want = fn.returns === 'void' ? { kind: 'void' } : sqlTypeClass({ type: fn.returns, enumValues: fn.returnsEnum });
        const got = fn.returnsSet ? (r.kind === 'array' ? r.element : null) : r;
        let ok;
        if (!got) ok = false;
        else if (want.kind === 'void') ok = ['void', 'undefined', 'null'].includes(got.kind);
        else if (want.kind === 'string') ok = got.kind === 'string' || got.kind === 'literals';
        else if (want.kind === 'literals') ok = got.kind === 'literals' && sameSet(want.values, got.values);
        else ok = family(want) === family(got);
        if (!ok) all.push({ key: `function:${name}:returns`, message: `${where}: Returns is ${describe(r)}, SQL returns ${fn.returnsSet ? 'SETOF ' : ''}${fn.returns}${fn.returnsSet ? ' (an array)' : ''}` });
        else if (!fn.returnsSet && got.nullable) warnings.push(`${where}: Returns allows null; the SQL function returns ${fn.returns}`);
      }
    }
  }

  // Must mirror: everything new in the build-out is declared somewhere, or listed with a reason.
  const declaredTables = seen.tables;
  for (const name of Object.keys(exportDoc.tables)) {
    if (!declaredTables.has(name) && !(notMirrored.tables ?? {})[name]) all.push({ key: `mirror:table:${name}`, message: `new table ${name} is declared in no pending file (add it to a *PendingTables, or to contract-map.json notMirrored.tables with a reason)` });
    if (declaredTables.has(name) && (notMirrored.tables ?? {})[name]) all.push({ key: `map:table:${name}:both`, message: `${name} is declared and also listed in notMirrored.tables` });
  }
  for (const name of Object.keys(exportDoc.views)) {
    if (!seen.views.has(name) && !(notMirrored.views ?? {})[name]) all.push({ key: `mirror:view:${name}`, message: `new view ${name} is declared in no pending file (add it to a *PendingViews, or to notMirrored.views with a reason)` });
  }
  for (const [table, cols] of Object.entries(exportDoc.legacyColumns)) {
    const declared = pending.files.flatMap((f) => (f.columns.get(table) ? [...f.columns.get(table).columns.keys()] : []));
    for (const col of Object.keys(cols)) {
      if (!declared.includes(col) && !(notMirrored.columns ?? {})[`${table}.${col}`]) all.push({ key: `mirror:column:${table}.${col}`, message: `new column ${table}.${col} is declared in no *PendingColumns (or notMirrored.columns)` });
    }
  }
  const browserCallable = (fn) => fn.status === 'new' && (fn.grants.includes('authenticated') || fn.grants.includes('PUBLIC'));
  const newCallable = new Set(Object.values(exportDoc.functions).filter(browserCallable).map((fn) => fn.name));
  for (const name of newCallable) {
    if (!seen.functions.has(name) && !(notMirrored.functions ?? {})[name]) all.push({ key: `mirror:function:${name}`, message: `new function ${name} is executable by authenticated but declared in no *PendingFunctions (add it, or list it in notMirrored.functions with a reason)` });
    if (seen.functions.has(name) && (notMirrored.functions ?? {})[name]) all.push({ key: `map:function:${name}:both`, message: `${name} is declared in a pending file and also listed in notMirrored.functions` });
  }
  for (const name of Object.keys(notMirrored.functions ?? {})) {
    if (!newCallable.has(name)) all.push({ key: `map:function:${name}:stale`, message: `contract-map.json notMirrored.functions.${name}: no new authenticated-executable function by that name (remove the entry)` });
  }
  for (const name of Object.keys(notMirrored.tables ?? {})) {
    if (!exportDoc.tables[name]) all.push({ key: `map:table:${name}:stale`, message: `contract-map.json notMirrored.tables.${name}: no new table by that name (remove the entry)` });
  }
  for (const name of Object.keys(notMirrored.views ?? {})) {
    if (!exportDoc.views[name]) all.push({ key: `map:view:${name}:stale`, message: `contract-map.json notMirrored.views.${name}: no new view by that name (remove the entry)` });
  }
  for (const key of Object.keys(notMirrored.columns ?? {})) {
    const [table, col] = key.split('.');
    if (!exportDoc.legacyColumns[table]?.[col]) all.push({ key: `map:column:${key}:stale`, message: `contract-map.json notMirrored.columns.${key}: no new legacy column by that name (remove the entry)` });
  }

  // Legacy functions (in types.ts) the build-out made non-executable for the browser.
  for (const fn of Object.values(exportDoc.functions)) {
    if (fn.status === 'redefined' && typesFunctions.has(fn.name) && !fn.grants.includes('authenticated') && !fn.grants.includes('PUBLIC')) {
      warnings.push(`${fn.name} is in types.ts but authenticated can no longer execute it after the build-out (grants: ${fn.grants.join(', ') || 'none'}); any browser caller must stop calling it`);
    }
  }

  // Known mismatches (each with its followup) are reported, not failed; a stale entry fails.
  const known = [];
  const mismatches = [];
  const knownKeys = new Map((map.knownMismatches ?? []).map((k) => [k.key, k]));
  const hit = new Set();
  for (const m of all) {
    if (knownKeys.has(m.key)) {
      known.push({ ...m, followup: knownKeys.get(m.key).followup });
      hit.add(m.key);
    } else mismatches.push(m);
  }
  for (const key of knownKeys.keys()) {
    if (!hit.has(key)) mismatches.push({ key: `map:known:${key}:stale`, message: `contract-map.json knownMismatches ${key}: no longer occurs (Lane 2 fixed it): remove the entry` });
  }
  const counts = {
    tables: [...declaredTables.keys()].length,
    views: seen.views.size,
    columnSets: seen.columns.size,
    functions: seen.functions.size,
    exportTables: Object.keys(exportDoc.tables).length,
    exportViews: Object.keys(exportDoc.views).length,
    exportFunctions: Object.keys(exportDoc.functions).length,
  };
  return { mismatches, known, warnings, counts };
}

// ------------------------------------------------------------------ CLI

function parseCli(argv) {
  const opts = { export: null, map: join(ROOT, 'scripts/db/contract-map.json'), root: ROOT, json: false, types: join(ROOT, 'src/integrations/supabase/types.ts') };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const value = () => {
      const v = argv[i + 1];
      if (v === undefined || v === '') throw new Error(`${a} needs a value`);
      i += 1;
      return v;
    };
    if (a === '--export') opts.export = resolve(value());
    else if (a === '--map') opts.map = resolve(value());
    else if (a === '--root') opts.root = resolve(value());
    else if (a === '--types') opts.types = resolve(value());
    else if (a === '--json') opts.json = true;
    else throw new Error(`unknown flag ${a}`);
  }
  if (!opts.export) throw new Error('--export <export.json> is required');
  return opts;
}

async function main() {
  let opts;
  let exportDoc;
  let map;
  try {
    opts = parseCli(process.argv.slice(2));
    exportDoc = JSON.parse(readFileSync(opts.export, 'utf8'));
    map = JSON.parse(readFileSync(opts.map, 'utf8'));
    if (exportDoc.kind !== 'buildout-export') throw new Error(`${opts.export} is not a build-out export (run schema-export.mjs with --baseline)`);
  } catch (err) {
    process.stderr.write(`check-pending-contract: ${err.message}\nUsage: node scripts/db/check-pending-contract.mjs --export <export.json> [--map <contract-map.json>] [--root <repo>] [--json]\n`);
    return 3;
  }
  let typesFunctions = new Set();
  try {
    const { parseTypesTs } = await import('./fidelity.mjs');
    typesFunctions = new Set(parseTypesTs(readFileSync(opts.types, 'utf8'), opts.types).functions.keys());
  } catch {
    // types.ts is only used for warnings
  }
  const pending = loadPending({ root: opts.root, map });
  const result = compareContract(exportDoc, pending, map, { typesFunctions });
  if (opts.json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else {
    for (const m of result.mismatches) process.stdout.write(`MISMATCH ${m.message} [${m.key}]\n`);
    for (const k of result.known) process.stdout.write(`known ${k.message} [${k.key}] (followup: ${k.followup})\n`);
    for (const w of result.warnings) process.stdout.write(`warning ${w}\n`);
    const c = result.counts;
    process.stdout.write(
      `contract: ${c.tables} tables, ${c.views} views, ${c.columnSets} column sets, ${c.functions} functions checked against ${c.exportTables} new tables, ${c.exportViews} views, ${c.exportFunctions} new or redefined functions: ${result.mismatches.length} mismatch(es), ${result.known.length} known, ${result.warnings.length} warning(s)\n`,
    );
  }
  return result.mismatches.length ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().then(
    (code) => {
      process.exitCode = code;
    },
    (err) => {
      process.stderr.write(`check-pending-contract: ${err.stack ?? err}\n`);
      process.exitCode = 3;
    },
  );
}
