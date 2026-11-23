/**
 * Pending-table ratchet (BUILD-PLAN B9; gap/00 D2, W1 "types_regenerated →
 * shim_removed"; DECISIONS D-01).
 *
 * 1. A table, view or RPC listed in any `db.pending.ts` under `src/` (the
 *    module shims in `src/modules/<m>/types/` and shared ones such as
 *    `src/lib/records/services/db.pending.ts`) must not exist in the
 *    generated types. When a migration is applied and `types.ts`
 *    regenerated, this fails until the shim deletes its entry and the code
 *    uses the generated type, so a shim never outlives its table. New
 *    columns on a live table (`*PendingColumns`, D-133) are checked the
 *    other way round: the table must be in the generated types (else it
 *    belongs in `*PendingTables`) and none of the listed columns may be
 *    ("remove <table>.<column> from the shim" once they are generated).
 * 2. Casts of the client may appear only in a file on the allow-list
 *    (pendingTables.allowlist.json), at no more than its listed count. A
 *    TypeScript AST walk (`clientCasts`) counts `.from(…)` / `.rpc(…)`
 *    arguments cast `as any` or `as never` (any argument expression;
 *    `as never` is allowed only when the receiver is a pending client: a
 *    name declared from `pendingClient(…)`, a plain alias of one, or the
 *    call itself), the client or its `.from` / `.rpc` method cast `as any` /
 *    `as unknown as any` under whatever local name it is imported
 *    (`(supabase.from as any)("x")`), and declarations typed `any` that hold
 *    the client (`const supabase: any = supabaseClient`), once where
 *    defined. The list only shrinks: after removing casts, run
 *    `UPDATE_PENDING_ALLOWLIST=1 npx vitest run <this file>`, which lowers
 *    counts and drops clean files but never raises a count.
 *
 * Only src/integrations/supabase/pending.ts (where `pendingClient` casts the
 * client once, on purpose), test files (mocks cast the client on purpose)
 * and the generated types.ts are exempt; a file that merely imports from
 * the shim is scanned like any other. Comments are ignored. An exported
 * `any` handle hides its importers' calls from this count (`handle.from('x')`
 * needs no cast), so anyClientHandles.test.ts pins, shrink only, the
 * importers of every such handle: new-build's `supabase`
 * (new-build/lib/supabase.ts, counted here once where it is defined) as well
 * as refit's `db` (refit/lib/db.ts, built from `pendingClient`, so not
 * counted here), and fails on a new one.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import ts from 'typescript';
import allowlist from './pendingTables.allowlist.json';

const ROOT = process.cwd();
const ALLOWLIST_FILE = join(ROOT, 'src/test/config/pendingTables.allowlist.json');
const TYPES_FILE = join(ROOT, 'src/integrations/supabase/types.ts');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

const parse = (file: string) => ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);

const memberNames = (node: ts.TypeNode | undefined): string[] => {
  if (!node || !ts.isTypeLiteralNode(node)) return [];
  return node.members
    .filter((m): m is ts.PropertySignature => ts.isPropertySignature(m))
    .map((m) => m.name.getText().replace(/^['"]|['"]$/g, ''));
};

const memberType = (node: ts.TypeNode | undefined, name: string): ts.TypeNode | undefined => {
  if (!node || !ts.isTypeLiteralNode(node)) return undefined;
  const m = node.members.find((x): x is ts.PropertySignature => ts.isPropertySignature(x) && x.name.getText() === name);
  return m?.type;
};

/** Table, view and function names in the generated `Database['public']`, with each table's Row columns. */
function generatedNames(): { tables: Set<string>; views: Set<string>; functions: Set<string>; columns: Map<string, Set<string>> } {
  const source = parse(TYPES_FILE);
  let db: ts.TypeNode | undefined;
  source.forEachChild((node) => {
    if (ts.isTypeAliasDeclaration(node) && node.name.text === 'Database') db = node.type;
  });
  const pub = memberType(db, 'public');
  const tables = memberType(pub, 'Tables');
  const columns = new Map<string, Set<string>>();
  for (const t of memberNames(tables)) columns.set(t, new Set(memberNames(memberType(memberType(tables, t), 'Row'))));
  return {
    tables: new Set(memberNames(tables)),
    views: new Set(memberNames(memberType(pub, 'Views'))),
    functions: new Set(memberNames(memberType(pub, 'Functions'))),
    columns,
  };
}

interface PendingFile {
  file: string;
  tables: string[];
  views: string[];
  functions: string[];
  /** `*PendingColumns`: live table → the new columns the shim declares on it. */
  columns: Record<string, string[]>;
  /** `*PendingColumns` entries whose column list could not be read (a shape the scanner does not know). */
  unreadable: string[];
}

/** Every `db.pending.ts` under src/ (module shims and shared ones such as src/lib/records/services). */
function pendingShimPaths(): string[] {
  return walk(SRC)
    .filter((file) => file.endsWith('/db.pending.ts'))
    .map((file) => relative(ROOT, file))
    .sort();
}

/** Property names of an object type: a type literal, or a type alias / interface declared in the same file. */
function objectMembers(node: ts.TypeNode | undefined, locals: Map<string, ts.TypeNode | ts.InterfaceDeclaration>): string[] | null {
  if (!node) return null;
  if (ts.isTypeLiteralNode(node)) return memberNames(node);
  if (ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName)) {
    const local = locals.get(node.typeName.text);
    if (!local) return null;
    if (ts.isInterfaceDeclaration(local)) return local.members.filter(ts.isPropertySignature).map((p) => p.name.getText().replace(/^['"]|['"]$/g, ''));
    return objectMembers(local, locals);
  }
  return null;
}

/**
 * The new columns one `*PendingColumns` entry declares: `PendingColumns<Row>`
 * (Row a literal or a local alias / interface) or a literal `{ Row: {…} }`.
 */
function pendingColumnNames(node: ts.TypeNode | undefined, locals: Map<string, ts.TypeNode | ts.InterfaceDeclaration>): string[] | null {
  if (!node) return null;
  if (ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName) && node.typeName.text === 'PendingColumns') {
    return objectMembers(node.typeArguments?.[0], locals);
  }
  if (ts.isTypeLiteralNode(node)) return objectMembers(memberType(node, 'Row'), locals);
  if (ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName)) {
    const local = locals.get(node.typeName.text);
    return local && !ts.isInterfaceDeclaration(local) ? pendingColumnNames(local, locals) : null;
  }
  return null;
}

/** Every `*PendingTables`, `*PendingViews`, `*PendingFunctions` and `*PendingColumns` type in a db.pending.ts. */
export function readPendingFile(rel: string, text: string): PendingFile {
  const source = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true);
  const entry: PendingFile = { file: rel, tables: [], views: [], functions: [], columns: {}, unreadable: [] };
  const locals = new Map<string, ts.TypeNode | ts.InterfaceDeclaration>();
  source.forEachChild((node) => {
    if (ts.isTypeAliasDeclaration(node)) locals.set(node.name.text, node.type);
    if (ts.isInterfaceDeclaration(node)) locals.set(node.name.text, node);
  });
  source.forEachChild((node) => {
    const name = ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node) ? node.name.text : '';
    const props: ts.PropertySignature[] = ts.isTypeAliasDeclaration(node)
      ? ts.isTypeLiteralNode(node.type)
        ? node.type.members.filter(ts.isPropertySignature)
        : []
      : ts.isInterfaceDeclaration(node)
        ? node.members.filter(ts.isPropertySignature)
        : [];
    const members = props.map((p) => p.name.getText().replace(/^['"]|['"]$/g, ''));
    if (name.endsWith('PendingTables')) entry.tables.push(...members);
    if (name.endsWith('PendingViews')) entry.views.push(...members);
    if (name.endsWith('PendingFunctions')) entry.functions.push(...members);
    if (name.endsWith('PendingColumns')) {
      props.forEach((p, i) => {
        const cols = pendingColumnNames(p.type, locals);
        if (cols === null) entry.unreadable.push(`${name}.${members[i]}`);
        else entry.columns[members[i]] = [...(entry.columns[members[i]] ?? []), ...cols];
      });
    }
  });
  return entry;
}

function pendingFiles(): PendingFile[] {
  return pendingShimPaths().map((rel) => readPendingFile(rel, readFileSync(join(ROOT, rel), 'utf8')));
}

/** Pending columns that are no longer pending, or that sit on a table types.ts does not have. */
export function pendingColumnProblems(files: PendingFile[], generated: { tables: Set<string>; columns: Map<string, Set<string>> }): string[] {
  const out: string[] = [];
  for (const f of files) {
    for (const u of f.unreadable) out.push(`${f.file}: ${u} is not PendingColumns<{…}> or a local row type; the ratchet cannot read its columns`);
    for (const [table, cols] of Object.entries(f.columns)) {
      if (!generated.tables.has(table)) {
        out.push(`${f.file}: ${table} is not a generated table; new tables belong in *PendingTables, not *PendingColumns`);
        continue;
      }
      const live = generated.columns.get(table) ?? new Set<string>();
      for (const c of cols) if (live.has(c)) out.push(`${f.file}: ${table}.${c} is now generated; remove ${table}.${c} from the shim`);
    }
  }
  return out;
}

const SRC = join(ROOT, 'src');
const CLIENT_MODULE = join(SRC, 'integrations/supabase/client');
/** The shim itself: the one file allowed to cast the client (`pendingClient`). */
const SHIM_FILE = 'src/integrations/supabase/pending.ts';
const IMPORTS_SHIM = /from\s+['"](?:@\/integrations\/supabase\/pending|\.\/pending)['"]/;
/** `.from()` receivers that are never a Supabase client. */
const NOT_A_CLIENT = /^(?:Array|Buffer|Iterator|(?:Big)?(?:Int|Uint|Float)(?:8|16|32|64)(?:Clamped)?Array)$/;

/** Does `specifier`, written in `file`, point at src/integrations/supabase/client? */
function isClientModule(file: string, specifier: string): boolean {
  let target: string;
  if (specifier.startsWith('@/')) target = join(SRC, specifier.slice(2));
  else if (specifier.startsWith('.')) target = resolve(dirname(file), specifier);
  else return false;
  return target.replace(/\.(ts|tsx)$/, '') === CLIENT_MODULE;
}

type CastKind = 'any' | 'never' | null;

/** Strips parentheses, `!`, `satisfies` and `as` / `<T>` casts; `cast` is the widest of them (`any`, then `never`). */
function unwrap(expr: ts.Expression): { base: ts.Expression; cast: CastKind } {
  let e = expr;
  let cast: CastKind = null;
  for (;;) {
    if (ts.isParenthesizedExpression(e) || ts.isNonNullExpression(e) || ts.isSatisfiesExpression(e)) {
      e = e.expression;
    } else if (ts.isAsExpression(e) || ts.isTypeAssertionExpression(e)) {
      if (e.type.kind === ts.SyntaxKind.AnyKeyword) cast = 'any';
      else if (e.type.kind === ts.SyntaxKind.NeverKeyword && cast === null) cast = 'never';
      e = e.expression;
    } else {
      return { base: e, cast };
    }
  }
}

/**
 * How many times one file casts the Supabase client (gap/00 D2). Counted:
 *
 * 1. each `.from(…)` / `.rpc(…)` whose first argument is cast `as any` or
 *    `as never` (through any parentheses or `as unknown as`), whatever the
 *    argument: a literal, a variable, `t.key`. `as never` is the shim's
 *    documented fallback, so it is allowed only on a pending client: the
 *    receiver is a name declared from `pendingClient(…)` (or a plain alias
 *    of one) or is the `pendingClient(…)` call itself. The typed client in
 *    the same file is still counted (`supabase.from("x" as never)` next to
 *    `const c = pendingClient<T>()`);
 * 2. each `X as any` / `X as unknown as any` / `<any>X` where X is the
 *    client: a local name bound to the value import from
 *    @/integrations/supabase/client (whatever the alias), a plain alias of
 *    one, or the name `supabase`; or where X is the client's `.from` /
 *    `.rpc` method (`(supabase.from as any)("x")`,
 *    `(supabase.rpc as unknown as any)("f")`);
 * 3. each declaration typed `any` and initialised with the client (or its
 *    method) (`const supabase: any = supabaseClient`,
 *    `export const supabase: any = typedClient`). A handle like that is
 *    counted once, where it is defined: its re-exports and importers are not
 *    counted again (anyClientHandles.test.ts pins those importers).
 *
 * Out of reach: a client passed to a helper with an `any` parameter
 * (`const q = (c: any) => c.from("x"); q(supabase)`). An any-typed
 * parameter cannot be resolved statically; the cast it hides is the
 * parameter type, which lint only warns about
 * (`@typescript-eslint/no-explicit-any`).
 *
 * The AST carries no comments, so a doc example is never a cast.
 */
export function clientCasts(file: string, text: string): number {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const clientNames = new Set(['supabase']);
  const namespaces = new Set<string>();
  /** Names declared from a `pendingClient(…)` call, and plain aliases of them: the only receivers allowed `as never`. */
  const pendingNames = new Set<string>();

  for (const node of source.statements) {
    if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier) || !isClientModule(file, node.moduleSpecifier.text)) continue;
    const clause = node.importClause;
    if (!clause || clause.isTypeOnly) continue;
    const bindings = clause.namedBindings;
    if (bindings && ts.isNamespaceImport(bindings)) namespaces.add(bindings.name.text);
    if (bindings && ts.isNamedImports(bindings)) {
      for (const el of bindings.elements) if (!el.isTypeOnly && (el.propertyName ?? el.name).text === 'supabase') clientNames.add(el.name.text);
    }
  }

  const isClient = (e: ts.Expression): boolean =>
    (ts.isIdentifier(e) && clientNames.has(e.text)) ||
    (ts.isPropertyAccessExpression(e) && ts.isIdentifier(e.expression) && namespaces.has(e.expression.text) && e.name.text === 'supabase');

  const isPendingCall = (e: ts.Expression): boolean => ts.isCallExpression(e) && ts.isIdentifier(e.expression) && e.expression.text === 'pendingClient';
  /** A pending client, uncast: `pendingClient<…>()` itself or a name bound to it. */
  const isPending = (e: ts.Expression): boolean => {
    const { base, cast } = unwrap(e);
    return cast === null && (isPendingCall(base) || (ts.isIdentifier(base) && pendingNames.has(base.text)));
  };
  /** `X.from` / `X.rpc` (or `X['from']` / `X['rpc']`): its receiver X, else null. */
  const clientMethod = (e: ts.Expression): { receiver: ts.Expression } | null => {
    if (ts.isPropertyAccessExpression(e) && /^(?:from|rpc)$/.test(e.name.text)) return { receiver: e.expression };
    if (ts.isElementAccessExpression(e) && ts.isStringLiteralLike(e.argumentExpression) && /^(?:from|rpc)$/.test(e.argumentExpression.text)) return { receiver: e.expression };
    return null;
  };
  /** The client's `.from` / `.rpc` method itself (cast instead of its argument: `(supabase.from as any)("x")`). */
  const isClientMethod = (e: ts.Expression): boolean => {
    const method = clientMethod(e);
    return !!method && isClient(unwrap(method.receiver).base);
  };

  // Plain aliases (`const db = supabaseClient`) are the client too. Names
  // declared from `pendingClient(…)`, and plain aliases of them, are pending
  // clients. Collected to a fixed point, so declaration order does not matter.
  const declarations: ts.VariableDeclaration[] = [];
  const gather = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) declarations.push(node);
    ts.forEachChild(node, gather);
  };
  gather(source);
  for (let grew = true; grew; ) {
    grew = false;
    for (const d of declarations) {
      const name = (d.name as ts.Identifier).text;
      const init = d.initializer as ts.Expression;
      const { base, cast } = unwrap(init);
      if (cast !== null || d.type?.kind === ts.SyntaxKind.AnyKeyword) continue;
      if (!clientNames.has(name) && isClient(base)) {
        clientNames.add(name);
        grew = true;
      }
      if (!pendingNames.has(name) && !d.type && isPending(init)) {
        pendingNames.add(name);
        grew = true;
      }
    }
  }

  let count = 0;
  const visit = (node: ts.Node): void => {
    const method = ts.isCallExpression(node) ? clientMethod(node.expression) : null;
    if (method && ts.isCallExpression(node)) {
      const { receiver } = method;
      const first = node.arguments[0];
      if (first && !(ts.isIdentifier(receiver) && NOT_A_CLIENT.test(receiver.text))) {
        const { cast } = unwrap(first);
        if (cast === 'any' || (cast === 'never' && !isPending(receiver))) count += 1;
      }
    }
    if ((ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) && node.type.kind === ts.SyntaxKind.AnyKeyword) {
      const { base } = unwrap(node.expression);
      if (isClient(base) || isClientMethod(base)) count += 1;
    }
    if ((ts.isVariableDeclaration(node) || ts.isPropertyDeclaration(node) || ts.isParameter(node)) && node.type?.kind === ts.SyntaxKind.AnyKeyword && node.initializer) {
      const { base, cast } = unwrap(node.initializer);
      if (cast !== 'any' && (isClient(base) || isClientMethod(base))) count += 1;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return count;
}

/**
 * Tests (mocks cast the client on purpose), the generated types and the shim
 * itself. A file that imports from the shim (`isMissingRelation`, types,
 * `pendingClient`) is scanned like any other.
 */
export const isExempt = (rel: string): boolean =>
  /\.(test|spec)\.tsx?$/.test(rel) || rel.startsWith('src/test/') || rel === 'src/integrations/supabase/types.ts' || rel === SHIM_FILE;

/** Files that cast the client, with their cast count. */
export function castOffenders(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const file of walk(SRC)) {
    const rel = relative(ROOT, file);
    if (isExempt(rel)) continue;
    const count = clientCasts(file, readFileSync(file, 'utf8'));
    if (count) out[rel] = count;
  }
  return out;
}

describe('pending tables (gap/00 D2)', () => {
  const generated = generatedNames();
  const files = pendingFiles();

  it('reads the generated types', () => {
    expect(generated.tables.size).toBeGreaterThan(200);
    expect(generated.views.size).toBeGreaterThan(0);
    expect(generated.functions.size).toBeGreaterThan(50);
    expect(generated.tables.has('vessels')).toBe(true);
  });

  it('scans every db.pending.ts under src/, not only module folders', () => {
    const paths = files.map((f) => f.file);
    expect(paths).toContain('src/modules/refit/types/db.pending.ts');
    expect(paths).toContain('src/lib/records/services/db.pending.ts');
    expect(paths).toContain('src/modules/vessels/types/db.pending.ts');
    expect(paths).toContain('src/modules/settings/types/db.pending.ts');
    const records = files.find((f) => f.file === 'src/lib/records/services/db.pending.ts');
    expect(records?.tables).toContain('record_envelopes');
    expect(records?.views).toEqual(['record_signature_slot_states']);
    expect(records?.functions).toContain('record_transition');
  });

  it('reads the pending columns of live tables (D-133)', () => {
    const vessels = files.find((f) => f.file === 'src/modules/vessels/types/db.pending.ts');
    expect(vessels?.columns.vessels).toEqual(['code', 'short_code', 'lifecycle_status', 'is_counted', 'vessel_purpose', 'archived_at', 'archived_by', 'archive_reason']);
    const settings = files.find((f) => f.file === 'src/modules/settings/types/db.pending.ts');
    expect(settings?.columns.user_preferences).toEqual(['density', 'show_roadmap']);
    const auth = files.find((f) => f.file === 'src/modules/auth/types/db.pending.ts');
    expect(auth?.columns.user_permission_overrides).toEqual(['company_id', 'vessel_id']);
    expect(auth?.columns.permission_audit_log).toEqual(['company_id']);
    expect(files.flatMap((f) => f.unreadable)).toEqual([]);
  });

  it('no pending column is in types.ts yet, and every one sits on a generated table', () => {
    expect(pendingColumnProblems(files, generated)).toEqual([]);
  });

  it('the column check names the column to remove, and refuses new tables declared as columns', () => {
    const sample = readPendingFile(
      'src/modules/x/types/db.pending.ts',
      `type Cols = { code: string; theme: string | null };
       export type XPendingColumns = {
         vessels: PendingColumns<Cols>;
         user_preferences: PendingColumns<{ theme: string | null }>;
         brand_new_table: PendingColumns<{ id: string }>;
         odd: SomethingElse<Cols>;
       };`,
    );
    expect(sample.columns).toEqual({ vessels: ['code', 'theme'], user_preferences: ['theme'], brand_new_table: ['id'] });
    expect(sample.unreadable).toEqual(['XPendingColumns.odd']);
    const fake = { tables: new Set(['vessels', 'user_preferences']), columns: new Map([['vessels', new Set(['id', 'name'])], ['user_preferences', new Set(['id', 'theme'])]]) };
    expect(pendingColumnProblems([sample], fake)).toEqual([
      'src/modules/x/types/db.pending.ts: XPendingColumns.odd is not PendingColumns<{…}> or a local row type; the ratchet cannot read its columns',
      'src/modules/x/types/db.pending.ts: user_preferences.theme is now generated; remove user_preferences.theme from the shim',
      'src/modules/x/types/db.pending.ts: brand_new_table is not a generated table; new tables belong in *PendingTables, not *PendingColumns',
    ]);
  });

  it('finds the module shims, Refit first', () => {
    const refit = files.find((f) => f.file === 'src/modules/refit/types/db.pending.ts');
    expect(refit?.tables.length).toBeGreaterThanOrEqual(30);
    expect(refit?.tables).toContain('rf_change_orders');
    expect(refit?.views).toEqual(['v_pending_approvals']);
    expect(refit?.functions).toEqual(['next_reference']);
  });

  it('no pending table, view or RPC is in types.ts yet (delete the shim entry once it is)', () => {
    const live: string[] = [];
    for (const f of files) {
      for (const t of [...f.tables, ...f.views]) {
        if (generated.tables.has(t) || generated.views.has(t)) live.push(`${f.file}: ${t} is now generated; remove it from the shim`);
      }
      for (const fn of f.functions) {
        if (generated.functions.has(fn)) live.push(`${f.file}: ${fn}() is now generated; remove it from the shim`);
      }
    }
    expect(live).toEqual([]);
  });

  it('each shim lists a name once', () => {
    const dupes = files.flatMap((f) =>
      [f.tables, f.views, f.functions].flatMap((names) => names.filter((n, i) => names.indexOf(n) !== i).map((n) => `${f.file}: ${n}`)),
    );
    expect(dupes).toEqual([]);
  });

  it('every module with a shim builds its client through pending.ts', () => {
    const missing = files
      .filter((f) => /^src\/modules\/[^/]+\/types\/db\.pending\.ts$/.test(f.file))
      .map((f) => f.file.replace(/\/types\/db\.pending\.ts$/, ''))
      .filter((dir) => !walk(join(ROOT, dir)).some((file) => IMPORTS_SHIM.test(readFileSync(file, 'utf8')) && !file.endsWith('db.pending.ts')));
    expect(missing).toEqual([]);
  });

  it('every shared shim outside a module folder builds its client through pending.ts next to it', () => {
    const missing = files
      .filter((f) => !/^src\/modules\/[^/]+\/types\/db\.pending\.ts$/.test(f.file))
      .map((f) => dirname(f.file))
      .filter((dir) => !readdirSync(join(ROOT, dir)).some((name) => /\.tsx?$/.test(name) && name !== 'db.pending.ts' && IMPORTS_SHIM.test(readFileSync(join(ROOT, dir, name), 'utf8'))));
    expect(missing).toEqual([]);
  });
});

describe('client cast ratchet (gap/00 D2)', () => {
  const offenders = castOffenders();
  const allowed = allowlist.files as Record<string, number>;

  if (process.env.UPDATE_PENDING_ALLOWLIST === '1') {
    const next: Record<string, number> = {};
    for (const [file, count] of Object.entries(allowed).sort(([a], [b]) => a.localeCompare(b))) {
      const now = offenders[file] ?? 0;
      if (now > 0) next[file] = Math.min(count, now);
    }
    writeFileSync(ALLOWLIST_FILE, `${JSON.stringify({ ...allowlist, files: next }, null, 2)}\n`);
  }

  it('finds the known offenders', () => {
    expect(Object.keys(offenders).length).toBeGreaterThan(10);
    expect(offenders['src/modules/refit/pages/change-orders.tsx']).toBeGreaterThan(0);
  });

  it('no file outside the allow-list casts the client', () => {
    const fresh = Object.keys(offenders).filter((file) => !(file in allowed));
    expect(fresh, 'use pendingClient<…>() from src/integrations/supabase/pending.ts and a types/db.pending.ts').toEqual([]);
  });

  it('no allow-listed file casts the client more than before', () => {
    const grew = Object.entries(offenders)
      .filter(([file, count]) => file in allowed && count > allowed[file])
      .map(([file, count]) => `${file}: ${count} > ${allowed[file]}`);
    expect(grew).toEqual([]);
  });

  it('the scanner sees casts and ignores comments', () => {
    const page = join(SRC, 'modules/x/pages/Page.tsx');
    const sample = "const a = supabase as any; // supabase as any\n/* .from('x' as any) */ q.from('t' as any); r.rpc(\"f\" as any)";
    expect(clientCasts(page, sample)).toBe(3);
  });

  it.each([
    ['an any-typed alias', `import { supabase as supabaseClient } from "@/integrations/supabase/client";\nconst supabase: any = supabaseClient;\nsupabase.from("rf_new");`],
    ['an exported any-typed handle, counted once', `import { supabase as typedClient } from "@/integrations/supabase/client";\nexport const supabase: any = typedClient;\nexport { supabase as client };`],
    ['an any-typed alias of a relative import', `import { supabase as c } from "../../../integrations/supabase/client";\nconst sb: any = c;`],
    ['an expression argument as any', `supabase.from(tableName as any).delete().eq("id", id);`],
    ['an expression argument as never, outside a pendingClient file', `supabase.from(t.key as never).select("id");`],
    ['a literal argument as never', `db.from("rf_x" as never).select("*");`],
    ['the client under another name, as any', `import { supabase as client } from "@/integrations/supabase/client";\nconst sb = client as any;`],
    ['the client as unknown as any', `import { supabase as client } from "@/integrations/supabase/client";\nconst sb = (client as unknown) as any;`],
    ['a plain alias of the client, as any', `import { supabase as client } from "@/integrations/supabase/client";\nconst typed = client;\nconst sb = typed as any;`],
    ['a literal argument as any', `db.from("rf_x" as any).select("*");`],
    ['an rpc with arguments after the cast', `supabase.rpc("search_x" as any, { q });`],
    ['nested parentheses and as unknown as any', `supabase.from((("rf_x" as unknown) as any));`],
  ])('the scanner counts %s once', (_name, sample) => {
    expect(clientCasts(join(SRC, 'modules/x/pages/Page.tsx'), sample)).toBe(1);
  });

  it.each([
    ['the from method cast as any', `(supabase.from as any)("x");`, 1],
    ['the rpc method cast as unknown as any', `(supabase.rpc as unknown as any)("f");`, 1],
    ['the from method of an imported alias, stored first', `import { supabase as c } from "@/integrations/supabase/client";\nconst f = c.from as any;\nf("x");`, 1],
    ['the from method by element access', `(supabase["from"] as any)("x"); supabase["rpc"]("f" as any);`, 2],
    ['as never on a name declared from pendingClient', `const c = pendingClient<T>(); c.from("x" as never);`, 0],
    ['as never on a plain alias of a pendingClient name, declared before it', `function q() { return d.from("x" as never); }\nconst d = c;\nconst c = pendingClient<T>();`, 0],
    ['as never on the typed client next to a pendingClient', `const c = pendingClient<T>(); supabase.from("x" as never);`, 1],
    ['as never on the pendingClient call itself', `pendingClient<T>().from("x" as never);`, 0],
    ['as never on an any-typed copy of a pendingClient name', `const c = pendingClient<T>(); const d: any = c; d.from("x" as never);`, 1],
    ['as never on a pendingClient name cast as any', `const c = pendingClient<T>(); (c as any).rpc("f" as never);`, 1],
  ])('the scanner counts %s', (_name, sample, expected) => {
    expect(clientCasts(join(SRC, 'modules/x/pages/Page.tsx'), sample)).toBe(expected);
  });

  it('counts an <any> method assertion in a .ts file', () => {
    expect(clientCasts(join(SRC, 'modules/x/lib/a.ts'), `(<any>supabase.rpc)("f");`)).toBe(1);
  });

  it('allows as never on a pendingClient receiver only, and ignores what is not the client', () => {
    const page = join(SRC, 'modules/x/lib/db.ts');
    const withShim = `import { pendingClient } from "@/integrations/supabase/pending";\nexport const refitDb = pendingClient<T>();\nrefitDb.from(name as never).select("*");`;
    expect(clientCasts(page, withShim)).toBe(0);
    expect(clientCasts(page, `${withShim}\nsupabase.from(name as never).select("*");`)).toBe(1);
    const shimImportOnly = `import { isMissingRelation } from "@/integrations/supabase/pending";\nsupabase.from(name as never).select("*");`;
    expect(clientCasts(page, shimImportOnly)).toBe(1);
    expect(clientCasts(page, `const rows = Array.from(set as any); const x = other as any; const y: any = 3;`)).toBe(0);
    expect(clientCasts(page, `import type { supabase as t } from "@/integrations/supabase/client";\nconst z: any = t;`)).toBe(0);
  });

  it('exempts only tests, the generated types and pending.ts itself, not the files that import from it', () => {
    expect(isExempt(SHIM_FILE)).toBe(true);
    expect(isExempt('src/integrations/supabase/types.ts')).toBe(true);
    expect(isExempt('src/modules/x/lib/a.test.ts')).toBe(true);
    expect(isExempt('src/test/mocks/supabase.ts')).toBe(true);
    expect(isExempt('src/modules/refit/lib/db.ts')).toBe(false);
    expect(isExempt('src/modules/refit/types/db.pending.ts')).toBe(false);
    expect(offenders[SHIM_FILE]).toBeUndefined();
  });
});
