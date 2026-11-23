/**
 * Loads pure TypeScript modules from `src/` into Node without tsx or esbuild
 * (Phase 2 spec §E, "shared loader"). The fixture generators use it to run
 * the frozen engines (vesselCode.ts, reference.ts, moduleSettings.ts, the
 * record engines) and write what they return as JSON fixtures that the SQL
 * tests compare with the SQL mirrors.
 *
 * How it works: every file in the set is transpiled with the repo's own
 * `typescript` package (`transpileModule`, ESM output, no type checking)
 * into a fresh temporary directory, keeping its path relative to the repo
 * root and the extension `.mjs`. Import and export specifiers are rewritten:
 * a relative specifier (`./dates`) and an `@/` alias (`@/lib/records/dates`)
 * become the relative path of the transpiled file (`./dates.mjs`). A
 * specifier that points outside the set is refused, so a fixture's
 * `sourceSha256` always covers every line of code that produced it; bare
 * package imports are refused too (the engines are pure). Type-only imports
 * vanish in the transpile.
 *
 *   const { modules, sourceSha256 } = await loadTs(['src/lib/records/reference.ts', 'src/lib/records/dates.ts']);
 *   modules['src/lib/records/reference.ts'].formatReference(...)
 *
 * The temporary directory is removed before the promise resolves (the
 * modules are already evaluated by then).
 */
import { createHash } from "node:crypto";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, posix, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

/** The repository root (two levels above scripts/db/lib). */
export const REPO_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
);

const COMPILER_OPTIONS = {
  module: ts.ModuleKind.ESNext,
  target: ts.ScriptTarget.ES2022,
  isolatedModules: true,
  sourceMap: false,
  removeComments: false,
};

/** sha256 (hex) of a file's bytes. */
export function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

/** `src/a/b.ts` with `/` separators, relative to the repo root. */
function normaliseRel(rel) {
  const clean = posix
    .normalize(String(rel).replace(/\\/g, "/"))
    .replace(/^\.\//, "");
  if (clean.startsWith("../") || posix.isAbsolute(clean))
    throw new Error(`load-ts: ${rel} is outside the repository`);
  if (!clean.endsWith(".ts") || clean.endsWith(".d.ts"))
    throw new Error(`load-ts: ${rel} is not a .ts source file`);
  return clean;
}

/** Every module specifier a source file imports or re-exports (static and dynamic). */
export function moduleSpecifiers(fileName, source) {
  const sf = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.ES2022,
    true,
    ts.ScriptKind.TS,
  );
  const out = [];
  const visit = (node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      const typeOnly = ts.isImportDeclaration(node)
        ? !!node.importClause?.isTypeOnly
        : node.isTypeOnly;
      out.push({ specifier: node.moduleSpecifier.text, typeOnly });
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      out.push({ specifier: node.arguments[0].text, typeOnly: false });
    } else if (ts.isImportTypeNode(node)) {
      out.push({
        specifier: node.argument?.literal?.text ?? "",
        typeOnly: true,
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

/**
 * The repo-relative `.ts` file a specifier names, or null for a bare package
 * specifier. `@/x` resolves to `src/x.ts`; a relative one against `fromRel`.
 */
export function resolveSpecifier(fromRel, specifier) {
  let target;
  if (specifier.startsWith("@/")) target = `src/${specifier.slice(2)}`;
  else if (specifier.startsWith("./") || specifier.startsWith("../"))
    target = posix.join(posix.dirname(fromRel), specifier);
  else return null;
  target = posix.normalize(target);
  if (target.endsWith(".js")) target = target.slice(0, -3);
  return target.endsWith(".ts") ? target : `${target}.ts`;
}

/**
 * Transpiles and imports `files` (repo-relative `.ts` paths). Returns
 * `{ modules, sourceSha256 }`: the evaluated module namespaces and the
 * sha256 of every source, both keyed by the repo-relative path, keys sorted.
 */
export async function loadTs(files, { root = REPO_ROOT } = {}) {
  const set = [...new Set(files.map(normaliseRel))].sort();
  if (set.length === 0) throw new Error("load-ts: no files given");
  const dir = mkdtempSync(join(tmpdir(), "storm-load-ts-"));
  const sourceSha256 = {};
  try {
    for (const rel of set) {
      const abs = join(root, rel);
      const source = readFileSync(abs, "utf8");
      sourceSha256[rel] = sha256File(abs);
      const rewrites = new Map();
      for (const { specifier, typeOnly } of moduleSpecifiers(rel, source)) {
        const target = resolveSpecifier(rel, specifier);
        if (target === null) {
          if (typeOnly) continue;
          throw new Error(
            `load-ts: ${rel} imports the package "${specifier}"; only pure modules in the set can be loaded`,
          );
        }
        if (!set.includes(target)) {
          if (typeOnly) continue;
          throw new Error(
            `load-ts: ${rel} imports "${specifier}" (${target}), which is not in the set; add it to the file list`,
          );
        }
        let relOut = posix
          .relative(posix.dirname(rel), target)
          .replace(/\.ts$/, ".mjs");
        if (!relOut.startsWith(".")) relOut = `./${relOut}`;
        rewrites.set(specifier, relOut);
      }
      const { outputText, diagnostics } = ts.transpileModule(source, {
        compilerOptions: COMPILER_OPTIONS,
        fileName: rel,
        reportDiagnostics: true,
      });
      const errors = (diagnostics ?? []).filter(
        (d) => d.category === ts.DiagnosticCategory.Error,
      );
      if (errors.length) {
        throw new Error(
          `load-ts: ${rel}: ${errors.map((d) => ts.flattenDiagnosticMessageText(d.messageText, " ")).join("; ")}`,
        );
      }
      let out = outputText;
      for (const [from, to] of rewrites) {
        const quoted = (q) => `${q}${from}${q}`;
        for (const q of ['"', "'"]) {
          out = out.split(`from ${quoted(q)}`).join(`from ${q}${to}${q}`);
          out = out.split(`import(${quoted(q)})`).join(`import(${q}${to}${q})`);
          out = out.split(`import ${quoted(q)}`).join(`import ${q}${to}${q}`);
        }
      }
      const outPath = join(dir, rel.replace(/\.ts$/, ".mjs"));
      mkdirSync(dirname(outPath), { recursive: true });
      writeFileSync(outPath, out);
    }
    const modules = {};
    for (const rel of set) {
      modules[rel] = await import(
        pathToFileURL(join(dir, rel.replace(/\.ts$/, ".mjs"))).href
      );
    }
    return { modules, sourceSha256 };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * JSON with sorted object keys, ending in a newline (stable fixtures).
 * Containers nested `compactDepth` levels deep or more are written on one
 * line (`compactDepth: 2` = one line per element of each top-level array or
 * object); `Infinity` indents everything.
 */
export function stableJson(value, { compactDepth = Infinity } = {}) {
  const sort = (v) => {
    if (Array.isArray(v)) return v.map(sort);
    if (v && typeof v === "object") {
      return Object.fromEntries(
        Object.keys(v)
          .sort()
          .map((k) => [k, sort(v[k])]),
      );
    }
    return v;
  };
  const write = (v, depth) => {
    if (v === null || typeof v !== "object" || depth >= compactDepth)
      return JSON.stringify(v);
    const pad = "  ".repeat(depth + 1);
    const close = "  ".repeat(depth);
    if (Array.isArray(v)) {
      if (v.length === 0) return "[]";
      return `[\n${v.map((x) => pad + write(x, depth + 1)).join(",\n")}\n${close}]`;
    }
    const keys = Object.keys(v);
    if (keys.length === 0) return "{}";
    return `{\n${keys.map((k) => `${pad}${JSON.stringify(k)}: ${write(v[k], depth + 1)}`).join(",\n")}\n${close}}`;
  };
  return `${write(sort(value), 0)}\n`;
}

/** A small seeded PRNG (mulberry32): deterministic fixtures across runs and machines. */
export function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A deterministic lower-case uuid-shaped id from a key (md5, like the SQL tests' tests.id()). */
export function keyUuid(key) {
  const h = createHash("md5").update(String(key)).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

/**
 * Writes `value` as a fixture (stable JSON) unless `--check` is given, in
 * which case it compares with the file on disk and exits 1 on a difference.
 */
export function writeFixture(
  path,
  value,
  { argv = process.argv.slice(2), compactDepth = Infinity } = {},
) {
  const text = stableJson(value, { compactDepth });
  if (argv.includes("--check")) {
    let current = null;
    try {
      current = readFileSync(path, "utf8");
    } catch {
      current = null;
    }
    if (current !== text) {
      process.stderr.write(
        `${path} is out of date: regenerate it (node ${process.argv[1]})\n`,
      );
      process.exit(1);
    }
    process.stdout.write(`${path}: up to date (${text.length} bytes)\n`);
    return;
  }
  writeFileSync(path, text);
  process.stdout.write(`${path}: written (${text.length} bytes)\n`);
}
