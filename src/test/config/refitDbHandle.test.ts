/**
 * Refit's untyped `db` handle may only lose importers (BUILD-PLAN B9; gap/00
 * F0.6 "Refit compiles against the shim").
 *
 * `src/modules/refit/lib/db.ts` exports `refitDb`, the typed pending-table
 * client, and `db`, the same client typed `any`. A page that calls
 * `db.from('<any name>')` needs no cast, so the pending-table cast ratchet
 * (pendingTables.test.ts) never sees it. This test pins the files that still
 * import `db` as a value. Move a file to `refitDb` (or the generated client),
 * then delete it from REFIT_DB_IMPORTERS. A new importer fails.
 *
 * Type-only imports (`import type { Risk } from '…/lib/db'`) are fine: they
 * carry no untyped client.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import ts from 'typescript';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');
const DB_MODULE = join(SRC, 'modules/refit/lib/db');

/** Shrink only. */
const REFIT_DB_IMPORTERS: readonly string[] = [
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
];

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

/** Does `specifier`, written in `file`, point at src/modules/refit/lib/db? */
function isDbModule(file: string, specifier: string): boolean {
  let target: string;
  if (specifier.startsWith('@/')) target = join(SRC, specifier.slice(2));
  else if (specifier.startsWith('.')) target = resolve(dirname(file), specifier);
  else return false;
  return target.replace(/\.(ts|tsx)$/, '') === DB_MODULE;
}

/** True when the source imports or re-exports `db` from the module as a value. */
function importsDbValue(file: string, text: string): boolean {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  let found = false;
  source.forEachChild((node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      if (!isDbModule(file, node.moduleSpecifier.text)) return;
      const clause = node.importClause;
      if (!clause || clause.isTypeOnly) return;
      const bindings = clause.namedBindings;
      if (bindings && ts.isNamespaceImport(bindings)) found = true;
      if (bindings && ts.isNamedImports(bindings)) {
        for (const el of bindings.elements) {
          const imported = (el.propertyName ?? el.name).text;
          if (imported === 'db' && !el.isTypeOnly) found = true;
        }
      }
    }
    if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      if (!isDbModule(file, node.moduleSpecifier.text) || node.isTypeOnly) return;
      const clause = node.exportClause;
      if (!clause) found = true; // export * from
      else if (ts.isNamedExports(clause)) {
        for (const el of clause.elements) if ((el.propertyName ?? el.name).text === 'db' && !el.isTypeOnly) found = true;
      }
    }
  });
  return found;
}

describe('Refit untyped db handle', () => {
  const importers = walk(SRC)
    .filter((f) => f !== `${DB_MODULE}.ts`)
    .filter((f) => importsDbValue(f, readFileSync(f, 'utf8')))
    .map((f) => relative(ROOT, f))
    .sort();

  it('no new file imports the untyped db handle', () => {
    expect(
      importers.filter((f) => !REFIT_DB_IMPORTERS.includes(f)),
      'Use refitDb (typed pending client) or the generated supabase client instead of db',
    ).toEqual([]);
  });

  it('the allow-list only shrinks: drop files that no longer import db', () => {
    expect(REFIT_DB_IMPORTERS.filter((f) => !importers.includes(f))).toEqual([]);
    expect(importers.length).toBeLessThanOrEqual(13);
  });

  it('tells value imports from type-only ones, and follows relative paths', () => {
    const page = join(SRC, 'modules/refit/pages/x.tsx');
    expect(importsDbValue(page, 'import { db } from "@/modules/refit/lib/db";')).toBe(true);
    expect(importsDbValue(page, 'import { db as client, type Risk } from "../lib/db";')).toBe(true);
    expect(importsDbValue(page, 'import * as refit from "../lib/db.ts";')).toBe(true);
    expect(importsDbValue(join(SRC, 'modules/refit/lib/other.ts'), 'import { db } from "./db";')).toBe(true);
    expect(importsDbValue(page, 'export { db } from "@/modules/refit/lib/db";')).toBe(true);
    expect(importsDbValue(page, 'import type { Risk } from "@/modules/refit/lib/db";')).toBe(false);
    expect(importsDbValue(page, 'import { type Risk, refitDb } from "@/modules/refit/lib/db";')).toBe(false);
    expect(importsDbValue(page, 'import { db } from "@/modules/other/lib/db";')).toBe(false);
  });
});
