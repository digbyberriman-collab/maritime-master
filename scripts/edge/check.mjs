#!/usr/bin/env node
/**
 * Edge function checker (Phase 2 spec §C.1, §C.2; gap/00 F1, F2).
 *
 *   node scripts/edge/check.mjs            deno check every entrypoint whose imports resolve here
 *   node scripts/edge/check.mjs --list     scan only (no Deno): which entrypoints are checkable
 *   node scripts/edge/check.mjs --json     machine-readable summary on stdout
 *   node scripts/edge/check.mjs --strict   also fail while any entrypoint still imports esm.sh / deno.land / https URLs
 *   node scripts/edge/check.mjs --deno "<cmd>"   Deno command (default: npx -y deno@2.9.6)
 *
 * For every `supabase/functions/<name>/index.ts` it follows relative imports
 * and classifies every specifier: `npm:` / `jsr:` / `node:` resolve from
 * this box; `https://esm.sh/…`, `https://deno.land/…` and any other remote
 * URL do not (those hosts are blocked here), so those entrypoints are listed
 * as "remote" instead of checked. Checkable entrypoints (and the non-test
 * `_shared/*.ts` helpers) are type-checked with
 * `deno check --config supabase/functions/deno.json`, one entrypoint at a
 * time so a failure names its function.
 *
 * It also enforces the verify_jwt policy's first rule: every function folder
 * has an explicit `[functions.<name>]` entry in `supabase/config.toml`, and
 * warns (never fails) about every function with `verify_jwt = true` whose own
 * files show no in-code caller check (`getAuthContext(`, `auth.getUser(`,
 * `getClaims(`, or a constant-time compare of the bearer with the
 * service-role key). For those the gateway flag is the only check, and it
 * stops working for asymmetric signing keys (D-129), so they need an in-code
 * check before the flag can be turned off.
 *
 * Exit codes: 0 all checkable entrypoints pass and every function has a
 * config entry (remote entrypoints are listed, not failed, unless --strict);
 * 1 a check failed, an entry is missing, or (--strict) remote imports remain;
 * 2 usage error.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const FUNCTIONS = join(ROOT, 'supabase', 'functions');
const CONFIG_TOML = join(ROOT, 'supabase', 'config.toml');
const DENO_CONFIG = 'supabase/functions/deno.json';
const DEFAULT_DENO = 'npx -y deno@2.9.6';

/** `local` (relative path), `package` (npm:/jsr:/node:), `esm.sh`, `deno.land`, `remote` (other URL), `bare`. */
export function classifySpecifier(spec) {
  if (spec.startsWith('./') || spec.startsWith('../') || spec.startsWith('/')) return 'local';
  if (/^(npm|jsr|node):/.test(spec)) return 'package';
  if (/^https?:\/\/esm\.sh\//.test(spec)) return 'esm.sh';
  if (/^https?:\/\/deno\.land\//.test(spec)) return 'deno.land';
  if (/^https?:\/\//.test(spec)) return 'remote';
  return 'bare';
}

const IMPORT_PATTERNS = [
  // Static imports and re-exports start a line; the clause holds no quotes or semicolons.
  /^\s*import\s+(?:type\s+)?[^'";]*?\bfrom\s*['"]([^'"\n]+)['"]/gm,
  /^\s*import\s*['"]([^'"\n]+)['"]/gm,
  /^\s*export\s+(?:type\s+)?[^'";]*?\bfrom\s*['"]([^'"\n]+)['"]/gm,
  /\bimport\s*\(\s*['"]([^'"\n]+)['"]\s*\)/g,
];

/** Strip comments so documented example imports do not count. Strings are kept (specifiers live in them). */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"\\])\/\/.*$/gm, '$1');
}

/** Every import specifier of one file's text. */
export function importsOf(source) {
  const text = stripComments(source);
  const out = new Set();
  for (const pattern of IMPORT_PATTERNS) {
    for (const match of text.matchAll(pattern)) out.add(match[1]);
  }
  return [...out];
}

/** Follow relative imports from `entry`; return `{ files, specifiers: [{ spec, kind, from }] }` for non-local specifiers. */
export function scanEntrypoint(entry) {
  const seen = new Set();
  const external = [];
  const missing = [];
  const stack = [resolve(entry)];
  while (stack.length > 0) {
    const file = stack.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    if (!existsSync(file)) {
      missing.push(file);
      continue;
    }
    for (const spec of importsOf(readFileSync(file, 'utf8'))) {
      const kind = classifySpecifier(spec);
      if (kind === 'local') stack.push(resolve(dirname(file), spec));
      else external.push({ spec, kind, from: file });
    }
  }
  return { files: [...seen], external, missing };
}

/** The `[functions.<name>]` table names in a config.toml text, with their verify_jwt value when set. */
export function configFunctions(toml) {
  const out = new Map();
  let current = null;
  for (const raw of toml.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const table = /^\[functions\.([A-Za-z0-9_-]+)\]$/.exec(line);
    if (table) {
      current = table[1];
      out.set(current, null);
      continue;
    }
    if (line.startsWith('[')) {
      current = null;
      continue;
    }
    const jwt = /^verify_jwt\s*=\s*(true|false)$/.exec(line);
    if (jwt && current) out.set(current, jwt[1] === 'true');
  }
  return out;
}

const IN_CODE_AUTH = [
  /(?<!function\s)\bgetAuthContext\s*\(/,
  /\.auth\.getUser\s*\(/,
  /\bgetClaims\s*\(/,
  /\btimingSafeEqual\s*\([^)]*(?:serviceRoleKey|SUPABASE_SERVICE_ROLE_KEY)/,
];

/** True when a function's own source (comments stripped) calls one of the in-code caller checks. */
export function hasInCodeAuth(sources) {
  return sources.some((source) => {
    const text = stripComments(source);
    return IN_CODE_AUTH.some((pattern) => pattern.test(text));
  });
}

/** The function's own non-test files among `files` (shared helpers define the checks; they do not prove a call). */
export function ownFiles(files, functionDir) {
  const dir = resolve(functionDir);
  return files.filter((f) => f.startsWith(`${dir}${sep}`) && !f.endsWith('.test.ts'));
}

/** Names of verify_jwt = true functions without an in-code caller check. */
export function jwtOnlyFunctions(entries) {
  return entries.filter((e) => e.verifyJwt === true && !e.inCodeAuth).map((e) => e.name);
}

export function functionNames(dir = FUNCTIONS) {
  return readdirSync(dir)
    .filter((name) => !name.startsWith('_') && !name.startsWith('.'))
    .filter((name) => statSync(join(dir, name)).isDirectory() && existsSync(join(dir, name, 'index.ts')))
    .sort();
}

function parseArgs(argv) {
  const opts = { list: false, json: false, strict: false, deno: DEFAULT_DENO };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--list') opts.list = true;
    else if (a === '--json') opts.json = true;
    else if (a === '--strict') opts.strict = true;
    else if (a === '--deno') {
      const v = argv[++i];
      if (!v) throw new Error('--deno needs a command');
      opts.deno = v;
    } else if (a === '--help' || a === '-h') opts.help = true;
    else throw new Error(`unknown flag ${a}`);
  }
  return opts;
}

function denoCheck(denoCmd, files) {
  const [cmd, ...args] = denoCmd.split(/\s+/).filter(Boolean);
  const res = spawnSync(cmd, [...args, 'check', '--config', DENO_CONFIG, ...files], { cwd: ROOT, encoding: 'utf8' });
  const output = `${res.stdout ?? ''}${res.stderr ?? ''}`.replace(/\x1b\[[0-9;]*m/g, '');
  return { ok: res.status === 0, output: output.split('\n').filter((l) => l && !/^(Check|Download) /.test(l)).join('\n') };
}

export function main(argv = process.argv.slice(2)) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (err) {
    console.error(`edge check: ${err.message}`);
    return 2;
  }
  if (opts.help) {
    console.log('usage: node scripts/edge/check.mjs [--list] [--json] [--strict] [--deno "<cmd>"]');
    return 0;
  }

  const names = functionNames();
  const config = existsSync(CONFIG_TOML) ? configFunctions(readFileSync(CONFIG_TOML, 'utf8')) : new Map();
  const missingConfig = names.filter((n) => !config.has(n) || config.get(n) === null);
  const entries = names.map((name) => {
    const entry = join(FUNCTIONS, name, 'index.ts');
    const scan = scanEntrypoint(entry);
    const blocked = scan.external.filter((e) => e.kind === 'esm.sh' || e.kind === 'deno.land' || e.kind === 'remote' || e.kind === 'bare');
    const own = ownFiles(scan.files, join(FUNCTIONS, name)).filter((f) => existsSync(f));
    return {
      name,
      entry: relative(ROOT, entry),
      verifyJwt: config.get(name) ?? null,
      inCodeAuth: hasInCodeAuth(own.map((f) => readFileSync(f, 'utf8'))),
      checkable: blocked.length === 0 && scan.missing.length === 0,
      blocked: [...new Set(blocked.map((b) => b.spec))],
      missing: scan.missing.map((m) => relative(ROOT, m)),
      result: null,
    };
  });

  const shared = readdirSync(join(FUNCTIONS, '_shared'))
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    .map((f) => `supabase/functions/_shared/${f}`);
  let sharedResult = null;
  if (!opts.list) {
    sharedResult = denoCheck(opts.deno, shared);
    for (const e of entries) if (e.checkable) e.result = denoCheck(opts.deno, [e.entry]);
  }

  const failed = entries.filter((e) => e.result && !e.result.ok);
  const remote = entries.filter((e) => !e.checkable);
  const summary = {
    functions: entries.length,
    checkable: entries.filter((e) => e.checkable).map((e) => e.name),
    passed: entries.filter((e) => e.result?.ok).map((e) => e.name),
    failed: failed.map((e) => e.name),
    remote: remote.map((e) => ({ name: e.name, imports: e.blocked, missing: e.missing })),
    shared: sharedResult ? (sharedResult.ok ? 'pass' : 'fail') : 'not run',
    missingConfig,
    /** Warnings only: verify_jwt = true with no in-code caller check. */
    jwtOnly: jwtOnlyFunctions(entries),
  };

  if (opts.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(`Edge functions: ${entries.length} (${summary.checkable.length} checkable here, ${remote.length} still on remote imports)`);
    console.log(`_shared helpers: ${summary.shared}`);
    if (sharedResult && !sharedResult.ok) console.log(sharedResult.output);
    for (const e of entries.filter((x) => x.checkable)) {
      const state = e.result ? (e.result.ok ? 'pass' : 'FAIL') : 'checkable';
      console.log(`  ${state.padEnd(9)} ${e.name}`);
      if (e.result && !e.result.ok) console.log(e.result.output.replace(/^/gm, '      '));
    }
    if (remote.length > 0) {
      console.log('Not checkable here (esm.sh / deno.land / remote imports are blocked; migrate to npm:/jsr: specifiers):');
      for (const e of remote) console.log(`  remote    ${e.name}: ${[...e.blocked, ...e.missing.map((m) => `missing ${m}`)].join(', ')}`);
    }
    if (missingConfig.length > 0) console.log(`Missing verify_jwt entry in supabase/config.toml: ${missingConfig.join(', ')}`);
    if (summary.jwtOnly.length > 0) {
      console.log('Warning: verify_jwt = true with no in-code caller check (the gateway flag is the only check; it 401s every call under asymmetric signing keys, D-129):');
      for (const name of summary.jwtOnly) console.log(`  warn      ${name}`);
    }
  }

  if (failed.length > 0 || (sharedResult && !sharedResult.ok) || missingConfig.length > 0) return 1;
  if (opts.strict && remote.length > 0) return 1;
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = main();
}
