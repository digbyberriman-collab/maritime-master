/**
 * Pending-table ratchet (BUILD-PLAN B9; gap/00 D2, W1 "types_regenerated →
 * shim_removed"; DECISIONS D-01).
 *
 * 1. A table, view or RPC listed in any `src/modules/<m>/types/db.pending.ts`
 *    must not exist in the generated types. When a migration is applied and
 *    `types.ts` regenerated, this fails until the module deletes its entry
 *    and uses the generated type, so a shim never outlives its table.
 * 2. `supabase as any`, `supabase as unknown as any` and
 *    `.from('<table>' as any)` / `.rpc('<fn>' as any)` may appear only in
 *    a file that imports the shim (src/integrations/supabase/pending.ts) or
 *    in a file on the allow-list (pendingTables.allowlist.json), at no more
 *    than its listed count. The list only shrinks: after removing casts,
 *    run `UPDATE_PENDING_ALLOWLIST=1 npx vitest run <this file>`, which
 *    lowers counts and drops clean files but never raises a count.
 *
 * Test files are exempt (mocks cast the client on purpose), as is the
 * generated types.ts. Comments are ignored.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
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

const CAST = /\bsupabase\s+as\s+(?:unknown\s+as\s+)?any\b|\.(?:from|rpc)\(\s*(['"`])[^'"`]*\1\s+as\s+any\s*\)/g;
const IMPORTS_SHIM = /from\s+['"](?:@\/integrations\/supabase\/pending|\.\/pending)['"]/;

/** Source with comments removed (strings kept), so a doc example is not a cast. */
function withoutComments(source: string, file: string): string {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, file.endsWith('x') ? ts.LanguageVariant.JSX : ts.LanguageVariant.Standard, source);
  let out = '';
  for (let kind = scanner.scan(); kind !== ts.SyntaxKind.EndOfFileToken; kind = scanner.scan()) {
    if (kind === ts.SyntaxKind.SingleLineCommentTrivia || kind === ts.SyntaxKind.MultiLineCommentTrivia) continue;
    out += scanner.getTokenText();
  }
  return out;
}

/** Files that cast the client, with their cast count, outside tests and the shim's importers. */
function castOffenders(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const file of walk(join(ROOT, 'src'))) {
    const rel = relative(ROOT, file);
    if (/\.(test|spec)\.tsx?$/.test(rel) || rel.startsWith('src/test/') || rel === 'src/integrations/supabase/types.ts') continue;
    const raw = readFileSync(file, 'utf8');
    if (!/\bas\s+(?:unknown\s+as\s+)?any\b/.test(raw)) continue;
    const source = withoutComments(raw, file);
    if (IMPORTS_SHIM.test(source)) continue;
    const count = source.match(CAST)?.length ?? 0;
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
    const sample = "const a = supabase as any; // supabase as any\n/* .from('x' as any) */ q.from('t' as any); r.rpc(\"f\" as any)";
    expect(withoutComments(sample, 'x.ts').match(CAST)?.length).toBe(3);
  });
});
