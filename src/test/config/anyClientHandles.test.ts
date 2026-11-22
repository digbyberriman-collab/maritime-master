/**
 * Any-typed client handles may only lose importers (BUILD-PLAN B9; gap/00 D2,
 * F0.6 "Refit compiles against the shim").
 *
 * A module that exports the Supabase client typed `any` hands every importer
 * an untyped client: `handle.from('<any name>')` and `handle.rpc('<any fn>')`
 * need no cast, so the pending-table cast ratchet (pendingTables.test.ts)
 * never sees those calls. This test closes that gap:
 *
 * 1. It finds every non-test module under src that exports an any-typed
 *    client handle: a top-level `export const|let X: any = <init>` (or
 *    `X = <init> as any`), or such a declaration exported later
 *    (`export { X }`, `export { X as Y }`, `export default X`), where <init>,
 *    after parentheses and casts, is the client: the value import of
 *    `supabase` from @/integrations/supabase/client (any alias, relative
 *    paths resolved, or `ns.supabase` of a namespace import), a
 *    `pendingClient(…)` call, or a name bound in the same file to one of
 *    those (refit's `export const db: any = refitDb`, where
 *    `refitDb = pendingClient<…>()`). The set found must equal HANDLES: a new
 *    any-typed handle fails (type it with pendingClient<…>()), and a retired
 *    one must leave HANDLES.
 * 2. For each handle it pins, shrink only, the files that import it as a
 *    value: a named import under any alias, a namespace import, `export *`
 *    (also `export * as ns`), a named re-export, a dynamic `import()` or an
 *    `import x = require()`. Type-only imports carry no client and are fine.
 *    A new importer fails; a listed file that no longer imports the handle
 *    fails until it is deleted from the list; no list may grow past its
 *    pinned count.
 *
 * The legacy handles:
 * - `src/modules/refit/lib/db.ts` `db`: the ported Refit pages. Move a page
 *   to `refitDb` (the typed pending client) and delete it from the list;
 *   "Refit uses the shim" (B9) is met when the list is empty.
 * - `src/modules/new-build/lib/supabase.ts` `supabase`: the nb_* pages.
 *   It retires per BUILD-PLAN ("retire new-build/lib/supabase.ts", the
 *   new-build stream): move each page to a `pendingClient<…>()` client with a
 *   `types/db.pending.ts`, then delete the handle and its HANDLES entry.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import ts from 'typescript';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');
const CLIENT_MODULE = join(SRC, 'integrations/supabase/client');
const PENDING_MODULE = join(SRC, 'integrations/supabase/pending');

interface Handle {
  /** The exported name of the any-typed client. */
  name: string;
  /** The importer count when the list was pinned: the list may never grow past it. */
  pinned: number;
  /** Shrink only: the files that still import the handle as a value. */
  importers: readonly string[];
}

const HANDLES: Readonly<Record<string, Handle>> = {
  'src/modules/refit/lib/db.ts': {
    name: 'db',
    pinned: 13,
    importers: [
      'src/modules/refit/components/SimpleModule.tsx',
      'src/modules/refit/pages/Dashboard.tsx',
      'src/modules/refit/pages/admin.tsx',
      'src/modules/refit/pages/approvals.tsx',
      'src/modules/refit/pages/budget.tsx',
      'src/modules/refit/pages/change-orders.tsx',
      'src/modules/refit/pages/crew-requests.tsx',
      'src/modules/refit/pages/document-control.tsx',
      'src/modules/refit/pages/drawings.tsx',
      'src/modules/refit/pages/notifications.tsx',
      'src/modules/refit/pages/reporting.tsx',
      'src/modules/refit/pages/schedule.tsx',
      'src/modules/refit/pages/search.tsx',
    ],
  },
  'src/modules/new-build/lib/supabase.ts': {
    name: 'supabase',
    pinned: 28,
    importers: [
      'src/modules/new-build/components/interior/ContractorDemarcation.tsx',
      'src/modules/new-build/components/yard-standards/BulkUpload.tsx',
      'src/modules/new-build/contexts/NewBuildProjectContext.tsx',
      'src/modules/new-build/pages/Approvals.tsx',
      'src/modules/new-build/pages/Areas.tsx',
      'src/modules/new-build/pages/ChangeOrders.tsx',
      'src/modules/new-build/pages/Contacts.tsx',
      'src/modules/new-build/pages/Dashboard.tsx',
      'src/modules/new-build/pages/Decisions.tsx',
      'src/modules/new-build/pages/DeckPlan.tsx',
      'src/modules/new-build/pages/Equipment.tsx',
      'src/modules/new-build/pages/Files.tsx',
      'src/modules/new-build/pages/Import.tsx',
      'src/modules/new-build/pages/Interior.tsx',
      'src/modules/new-build/pages/Locations.tsx',
      'src/modules/new-build/pages/Phases.tsx',
      'src/modules/new-build/pages/Piping.tsx',
      'src/modules/new-build/pages/PurchaseOrders.tsx',
      'src/modules/new-build/pages/Rasci.tsx',
      'src/modules/new-build/pages/Regulations.tsx',
      'src/modules/new-build/pages/Requirements.tsx',
      'src/modules/new-build/pages/Suppliers.tsx',
      'src/modules/new-build/pages/Timeline.tsx',
      'src/modules/new-build/pages/YardStandards.tsx',
      'src/modules/new-build/pages/interior/InteriorApprovals.tsx',
      'src/modules/new-build/pages/interior/InteriorDrawings.tsx',
      'src/modules/new-build/pages/interior/InteriorMaterials.tsx',
      'src/modules/new-build/pages/interior/InteriorSchedule.tsx',
    ],
  },
};

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (full === join(SRC, 'test')) continue;
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(name) && !/\.(test|spec)\.(ts|tsx)$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

const parse = (file: string, text: string) =>
  ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);

/** Does `specifier`, written in `file`, point at `modulePathNoExt` (an absolute path without its extension)? */
function pointsAt(file: string, specifier: string, modulePathNoExt: string): boolean {
  let target: string;
  if (specifier.startsWith('@/')) target = join(SRC, specifier.slice(2));
  else if (specifier.startsWith('.')) target = resolve(dirname(file), specifier);
  else return false;
  return target.replace(/\.(ts|tsx)$/, '') === modulePathNoExt;
}

/** Strips parentheses, `!`, `satisfies` and `as` / `<T>` casts; `anyCast` says whether one of them was `any`. */
function unwrap(expr: ts.Expression): { base: ts.Expression; anyCast: boolean } {
  let e = expr;
  let anyCast = false;
  for (;;) {
    if (ts.isParenthesizedExpression(e) || ts.isNonNullExpression(e) || ts.isSatisfiesExpression(e)) {
      e = e.expression;
    } else if (ts.isAsExpression(e) || ts.isTypeAssertionExpression(e)) {
      if (e.type.kind === ts.SyntaxKind.AnyKeyword) anyCast = true;
      e = e.expression;
    } else {
      return { base: e, anyCast };
    }
  }
}

const hasExport = (node: ts.Node) =>
  ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);

/** The names under which one source file exports an any-typed client handle. */
export function anyHandleExports(file: string, text: string): string[] {
  const source = parse(file, text);
  // The bare name `supabase` counts as the client, as in the cast ratchet.
  const clients = new Set(['supabase']);
  const clientNamespaces = new Set<string>();
  const pendingFns = new Set(['pendingClient']);
  const pendingNamespaces = new Set<string>();

  for (const node of source.statements) {
    if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier)) continue;
    const clause = node.importClause;
    if (!clause || clause.isTypeOnly) continue;
    const fromClient = pointsAt(file, node.moduleSpecifier.text, CLIENT_MODULE);
    const fromPending = pointsAt(file, node.moduleSpecifier.text, PENDING_MODULE);
    const bindings = clause.namedBindings;
    if (bindings && ts.isNamespaceImport(bindings)) {
      if (fromClient) clientNamespaces.add(bindings.name.text);
      if (fromPending) pendingNamespaces.add(bindings.name.text);
    }
    if (bindings && ts.isNamedImports(bindings)) {
      for (const el of bindings.elements) {
        if (el.isTypeOnly) continue;
        const imported = (el.propertyName ?? el.name).text;
        if (fromClient && imported === 'supabase') clients.add(el.name.text);
        if (fromPending && imported === 'pendingClient') pendingFns.add(el.name.text);
      }
    }
  }

  const isPendingCall = (e: ts.Expression): boolean =>
    ts.isCallExpression(e) &&
    ((ts.isIdentifier(e.expression) && pendingFns.has(e.expression.text)) ||
      (ts.isPropertyAccessExpression(e.expression) &&
        ts.isIdentifier(e.expression.expression) &&
        pendingNamespaces.has(e.expression.expression.text) &&
        e.expression.name.text === 'pendingClient'));
  const isClient = (e: ts.Expression): boolean =>
    (ts.isIdentifier(e) && clients.has(e.text)) ||
    (ts.isPropertyAccessExpression(e) && ts.isIdentifier(e.expression) && clientNamespaces.has(e.expression.text) && e.name.text === 'supabase') ||
    isPendingCall(e);

  // Top-level names bound to the client, to a pendingClient(…) result, or to another such name.
  const declarations = source.statements.filter(ts.isVariableStatement).flatMap((s) => [...s.declarationList.declarations]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const d of declarations) {
      if (ts.isIdentifier(d.name) && d.initializer && !clients.has(d.name.text) && isClient(unwrap(d.initializer).base)) {
        clients.add(d.name.text);
        grew = true;
      }
    }
  }

  const anyHandles = new Set<string>();
  const exported = new Set<string>();
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const d of statement.declarationList.declarations) {
      if (!ts.isIdentifier(d.name) || !d.initializer) continue;
      const { base, anyCast } = unwrap(d.initializer);
      if ((d.type?.kind === ts.SyntaxKind.AnyKeyword || anyCast) && isClient(base)) {
        anyHandles.add(d.name.text);
        if (hasExport(statement)) exported.add(d.name.text);
      }
    }
  }
  for (const statement of source.statements) {
    if (ts.isExportDeclaration(statement) && !statement.moduleSpecifier && !statement.isTypeOnly && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
      for (const el of statement.exportClause.elements) {
        if (!el.isTypeOnly && anyHandles.has((el.propertyName ?? el.name).text)) exported.add(el.name.text);
      }
    }
    if (ts.isExportAssignment(statement)) {
      const { base, anyCast } = unwrap(statement.expression);
      if ((anyCast && isClient(base)) || (ts.isIdentifier(base) && anyHandles.has(base.text))) exported.add('default');
    }
  }
  return [...exported].sort();
}

/**
 * True when the source imports or re-exports `exportName` from the module at
 * `modulePathNoExt` as a value: a named import (any alias), a default import
 * of `default`, a namespace import, `export *` / `export * as ns`, a named
 * re-export, a dynamic `import()` or `import x = require()`. Type-only
 * imports and re-exports are not.
 */
export function importsValue(file: string, text: string, modulePathNoExt: string, exportName: string): boolean {
  const source = parse(file, text);
  const isModule = (spec: ts.Expression | undefined) => !!spec && ts.isStringLiteralLike(spec) && pointsAt(file, spec.text, modulePathNoExt);
  let found = false;
  const visit = (node: ts.Node): void => {
    if (found) return;
    if (ts.isImportDeclaration(node) && isModule(node.moduleSpecifier)) {
      const clause = node.importClause;
      if (!clause || clause.isTypeOnly) return;
      if (clause.name && exportName === 'default') found = true;
      const bindings = clause.namedBindings;
      if (bindings && ts.isNamespaceImport(bindings)) found = true;
      if (bindings && ts.isNamedImports(bindings)) {
        for (const el of bindings.elements) if (!el.isTypeOnly && (el.propertyName ?? el.name).text === exportName) found = true;
      }
      return;
    }
    if (ts.isExportDeclaration(node) && isModule(node.moduleSpecifier)) {
      if (node.isTypeOnly) return;
      const clause = node.exportClause;
      if (!clause || ts.isNamespaceExport(clause)) found = true; // export * from / export * as ns from
      else for (const el of clause.elements) if (!el.isTypeOnly && (el.propertyName ?? el.name).text === exportName) found = true;
      return;
    }
    if (ts.isImportEqualsDeclaration(node) && !node.isTypeOnly && ts.isExternalModuleReference(node.moduleReference) && isModule(node.moduleReference.expression)) {
      found = true;
      return;
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && isModule(node.arguments[0])) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

const files = walk(SRC);
const texts = new Map(files.map((f) => [f, readFileSync(f, 'utf8')]));
const noExt = (rel: string) => join(ROOT, rel).replace(/\.(ts|tsx)$/, '');

describe('any-typed client handles (BUILD-PLAN B9)', () => {
  const found = files.flatMap((f) => anyHandleExports(f, texts.get(f) ?? '').map((name) => `${relative(ROOT, f)}#${name}`)).sort();
  const pinned = Object.entries(HANDLES)
    .map(([file, h]) => `${file}#${h.name}`)
    .sort();

  it('no new module exports an any-typed client handle', () => {
    expect(
      found.filter((h) => !pinned.includes(h)),
      'A new any-typed client handle: type it with pendingClient<…>() from src/integrations/supabase/pending.ts',
    ).toEqual([]);
  });

  it('every pinned handle still exists (delete the HANDLES entry once a handle is retired)', () => {
    expect(pinned.filter((h) => !found.includes(h))).toEqual([]);
  });

  describe.each(Object.entries(HANDLES))('%s', (file, handle) => {
    const importers = files
      .filter((f) => relative(ROOT, f) !== file)
      .filter((f) => importsValue(f, texts.get(f) ?? '', noExt(file), handle.name))
      .map((f) => relative(ROOT, f))
      .sort();

    it(`no new file imports \`${handle.name}\``, () => {
      expect(
        importers.filter((f) => !handle.importers.includes(f)),
        `Use a typed client (pendingClient<…>() or the generated supabase client) instead of the any-typed ${handle.name} from ${file}`,
      ).toEqual([]);
    });

    it('the list only shrinks: drop files that no longer import it', () => {
      expect(handle.importers.filter((f) => !importers.includes(f))).toEqual([]);
      expect(handle.importers.length).toBeLessThanOrEqual(handle.pinned);
      expect(importers.length).toBeLessThanOrEqual(handle.pinned);
      expect([...handle.importers]).toEqual([...new Set(handle.importers)].sort());
    });
  });

  it.each([
    ['refit', 'src/modules/refit/lib/db.ts', 'db', 'refit', 'Risk', 'refitDb'],
    ['new-build', 'src/modules/new-build/lib/supabase.ts', 'supabase', 'new-build', 'NbProject', 'other'],
  ])('importsValue (%s) tells value imports from type-only ones, and follows relative paths', (_label, handleFile, name, mod, typeName, sibling) => {
    const target = noExt(handleFile);
    const base = handleFile.replace(/^src\//, '@/').replace(/\.ts$/, '');
    const leaf = handleFile.split('/').pop()?.replace(/\.ts$/, '') ?? '';
    const page = join(SRC, `modules/${mod}/pages/x.tsx`);
    const check = (text: string, at = page) => importsValue(at, text, target, name);
    expect(check(`import { ${name} } from "${base}";`)).toBe(true);
    expect(check(`import { ${name} as client, type ${typeName} } from "../lib/${leaf}";`)).toBe(true);
    expect(check(`import * as ns from "../lib/${leaf}.ts";`)).toBe(true);
    expect(check(`import { ${name} } from "./${leaf}";`, join(SRC, `modules/${mod}/lib/other.ts`))).toBe(true);
    expect(check(`export { ${name} } from "${base}";`)).toBe(true);
    expect(check(`export * from "${base}";`)).toBe(true);
    expect(check(`export * as ns from "${base}";`)).toBe(true);
    expect(check(`const load = () => import("${base}");`)).toBe(true);
    expect(check(`import type { ${typeName} } from "${base}";`)).toBe(false);
    expect(check(`import { type ${typeName}, ${sibling} } from "${base}";`)).toBe(false);
    expect(check(`import { type ${name} } from "${base}";`)).toBe(false);
    expect(check(`export type { ${name} } from "${base}";`)).toBe(false);
    expect(check(`import { ${name} } from "@/modules/other/lib/${leaf}";`)).toBe(false);
  });

  it('the generated client is not the new-build handle', () => {
    const page = join(SRC, 'modules/new-build/pages/x.tsx');
    expect(importsValue(page, 'import { supabase } from "@/integrations/supabase/client";', noExt('src/modules/new-build/lib/supabase.ts'), 'supabase')).toBe(false);
  });

  const lib = join(SRC, 'modules/x/lib/handle.ts');
  it.each([
    ['the new-build form', `import { supabase as typedClient } from "@/integrations/supabase/client";\nexport const supabase: any = typedClient;`, ['supabase']],
    ['the refit form', `import { pendingClient } from "@/integrations/supabase/pending";\nconst refitDb = pendingClient<T>();\nexport const db: any = refitDb;`, ['db']],
    ['an exported pendingClient result typed any', `export let db: any = pendingClient<T>();`, ['db']],
    ['a relative client import', `import { supabase as c } from "../../../integrations/supabase/client";\nexport const h: any = c;`, ['h']],
    ['a namespace import', `import * as c from "@/integrations/supabase/client";\nexport const h: any = c.supabase;`, ['h']],
    ['an alias of an alias', `import { supabase as c } from "@/integrations/supabase/client";\nconst a = c;\nconst b = a;\nexport const h: any = b;`, ['h']],
    ['a cast to any instead of an annotation', `import { supabase as c } from "@/integrations/supabase/client";\nexport const h = (c as unknown) as any;`, ['h']],
    ['a declaration exported later', `import { supabase as c } from "@/integrations/supabase/client";\nconst h: any = c;\nexport { h as client };`, ['client']],
    ['a default export', `import { supabase as c } from "@/integrations/supabase/client";\nexport default c as any;`, ['default']],
    ['an aliased pendingClient', `import { pendingClient as pc } from "@/integrations/supabase/pending";\nexport const h: any = pc<T>();`, ['h']],
  ])('finds %s', (_name, text, names) => {
    expect(anyHandleExports(lib, text)).toEqual(names);
  });

  it.each([
    ['a typed pendingClient result', `import { pendingClient } from "@/integrations/supabase/pending";\nexport const refitDb = pendingClient<T>();`],
    ['an any that is not the client', `const x: any = 1;\nexport { x };\nexport const y: any = other;`],
    ['an any handle that is not exported', `import { supabase as c } from "@/integrations/supabase/client";\nconst h: any = c;\nh.from("x");`],
    ['a type-only import', `import type { supabase as t } from "@/integrations/supabase/client";\nexport const h: any = t;`],
    ['a typed re-export of the client', `import { supabase as c } from "@/integrations/supabase/client";\nexport const h = c;`],
  ])('does not find %s', (_name, text) => {
    expect(anyHandleExports(lib, text)).toEqual([]);
  });
});
