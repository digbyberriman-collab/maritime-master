/**
 * Pending-table ratchet (BUILD-PLAN B9; gap/00 D2, W1 "types_regenerated →
 * shim_removed"; DECISIONS D-01).
 *
 * 1. A table, view or RPC listed in any `src/modules/<m>/types/db.pending.ts`
 *    must not exist in the generated types. When a migration is applied and
 *    `types.ts` regenerated, this fails until the module deletes its entry
 *    and uses the generated type, so a shim never outlives its table.
 * 2. Casts of the client may appear only in a file on the allow-list
 *    (pendingTables.allowlist.json), at no more than its listed count. A
 *    TypeScript AST walk (`clientCasts`) counts `.from(…)` / `.rpc(…)`
 *    arguments cast `as any` or `as never` (any argument expression;
 *    `as never` is allowed where `pendingClient(` is called), the client
 *    cast `as any` / `as unknown as any` under whatever local name it is
 *    imported, and declarations typed `any` that hold the client
 *    (`const supabase: any = supabaseClient`), once where defined. The list
 *    only shrinks: after removing casts, run
 *    `UPDATE_PENDING_ALLOWLIST=1 npx vitest run <this file>`, which lowers
 *    counts and drops clean files but never raises a count.
 *
 * Only src/integrations/supabase/pending.ts (where `pendingClient` casts the
 * client once, on purpose), test files (mocks cast the client on purpose)
 * and the generated types.ts are exempt; a file that merely imports from
 * the shim is scanned like any other. Comments are ignored. Refit's
 * `db: any` handle is built from `pendingClient`, not the client import, so
 * refitDbHandle.test.ts pins its importers instead.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
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

/** Table, view and function names in the generated `Database['public']`. */
function generatedNames(): { tables: Set<string>; views: Set<string>; functions: Set<string> } {
  const source = parse(TYPES_FILE);
  let db: ts.TypeNode | undefined;
  source.forEachChild((node) => {
    if (ts.isTypeAliasDeclaration(node) && node.name.text === 'Database') db = node.type;
  });
  const pub = memberType(db, 'public');
  return {
    tables: new Set(memberNames(memberType(pub, 'Tables'))),
    views: new Set(memberNames(memberType(pub, 'Views'))),
    functions: new Set(memberNames(memberType(pub, 'Functions'))),
  };
}

interface PendingFile {
  file: string;
  tables: string[];
  views: string[];
  functions: string[];
}

/** Every `*PendingTables`, `*PendingViews` and `*PendingFunctions` type in a module's db.pending.ts. */
function pendingFiles(): PendingFile[] {
  const modules = join(ROOT, 'src/modules');
  const out: PendingFile[] = [];
  for (const m of readdirSync(modules)) {
    const file = join(modules, m, 'types/db.pending.ts');
    if (!existsSync(file)) continue;
    const entry: PendingFile = { file: relative(ROOT, file), tables: [], views: [], functions: [] };
    parse(file).forEachChild((node) => {
      const name = ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node) ? node.name.text : '';
      const members = ts.isTypeAliasDeclaration(node)
        ? memberNames(node.type)
        : ts.isInterfaceDeclaration(node)
          ? node.members.filter(ts.isPropertySignature).map((p) => p.name.getText())
          : [];
      if (name.endsWith('PendingTables')) entry.tables.push(...members);
      if (name.endsWith('PendingViews')) entry.views.push(...members);
      if (name.endsWith('PendingFunctions')) entry.functions.push(...members);
    });
    out.push(entry);
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
 *    documented fallback, so it is allowed in a file that calls
 *    `pendingClient(`;
 * 2. each `X as any` / `X as unknown as any` where X is the client: a local
 *    name bound to the value import from @/integrations/supabase/client
 *    (whatever the alias), a plain alias of one, or the name `supabase`;
 * 3. each declaration typed `any` and initialised with the client
 *    (`const supabase: any = supabaseClient`,
 *    `export const supabase: any = typedClient`). A handle like that is
 *    counted once, where it is defined: its re-exports and importers are not
 *    counted again.
 *
 * The AST carries no comments, so a doc example is never a cast.
 */
export function clientCasts(file: string, text: string): number {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const clientNames = new Set(['supabase']);
  const namespaces = new Set<string>();
  let buildsPendingClient = false;

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

  // Plain aliases (`const db = supabaseClient`) are the client too; `pendingClient(` allows `as never`.
  const collect = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && node.type?.kind !== ts.SyntaxKind.AnyKeyword) {
      const { base, cast } = unwrap(node.initializer);
      if (cast === null && isClient(base)) clientNames.add(node.name.text);
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'pendingClient') buildsPendingClient = true;
    ts.forEachChild(node, collect);
  };
  collect(source);

  let count = 0;
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && /^(?:from|rpc)$/.test(node.expression.name.text)) {
      const receiver = node.expression.expression;
      const first = node.arguments[0];
      if (first && !(ts.isIdentifier(receiver) && NOT_A_CLIENT.test(receiver.text))) {
        const { cast } = unwrap(first);
        if (cast === 'any' || (cast === 'never' && !buildsPendingClient)) count += 1;
      }
    }
    if ((ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) && node.type.kind === ts.SyntaxKind.AnyKeyword) {
      if (isClient(unwrap(node.expression).base)) count += 1;
    }
    if ((ts.isVariableDeclaration(node) || ts.isPropertyDeclaration(node) || ts.isParameter(node)) && node.type?.kind === ts.SyntaxKind.AnyKeyword && node.initializer) {
      const { base, cast } = unwrap(node.initializer);
      if (cast !== 'any' && isClient(base)) count += 1;
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
      .map((f) => f.file.replace(/\/types\/db\.pending\.ts$/, ''))
      .filter((dir) => !walk(join(ROOT, dir)).some((file) => IMPORTS_SHIM.test(readFileSync(file, 'utf8')) && !file.endsWith('db.pending.ts')));
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

  it('allows as never in a file that builds its client with pendingClient, and ignores what is not the client', () => {
    const page = join(SRC, 'modules/x/lib/db.ts');
    const withShim = `import { pendingClient } from "@/integrations/supabase/pending";\nexport const refitDb = pendingClient<T>();\nrefitDb.from(name as never).select("*");`;
    expect(clientCasts(page, withShim)).toBe(0);
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
