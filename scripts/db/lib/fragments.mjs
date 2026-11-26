#!/usr/bin/env node
/**
 * Per-stream inventory fragments (Phase 3 wave 1, platform prep PP1).
 *
 * Two streams build in one working tree and commit by explicit path, so the
 * shared DB inventories take one fragment file per stream next to the main
 * file; the main files stay platform-only and the integrator folds the
 * fragments back at the wave merge:
 *
 *   scripts/db/contract-map.json            + scripts/db/contract-map.d/*.json
 *   supabase/tests/fixtures/function-grants.json + function-grants.d/*.json
 *   (inactive_gates.test.sql's own list)    + supabase/tests/fixtures/inactive-probes.d/*.json
 *
 * Fragments are read in file-name order. A name that two files claim is an
 * error, never a silent override:
 *   contract map  files[] concatenated (a `file` named twice is an error);
 *                 notMirrored.{tables, views, functions, columns} merged (a
 *                 key twice is an error); knownMismatches concatenated (a
 *                 key twice is an error). `sources` records which file
 *                 each entry came from, so stale-entry messages name it.
 *   grants        functions and relations merged (a key twice is an error)
 *   probes        arrays concatenated; each entry is
 *                 { "probe": { "callee", "expr" } } or
 *                 { "allow": { "callee", "reason" } }; a callee twice is an error
 *
 * CLI (the SQL tests read the merged documents through psql backticks):
 *   node scripts/db/lib/fragments.mjs grants         # merged function-grants JSON
 *   node scripts/db/lib/fragments.mjs probes         # merged probe entries JSON
 *   node scripts/db/lib/fragments.mjs contract-map   # merged contract map JSON
 *   [--root <repo>]
 * prints the merged JSON on stdout and exits 0, or prints nothing on stdout,
 * the problems on stderr, and exits 1 (a duplicate or an invalid fragment).
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

export const FRAGMENT_DIRS = {
  contractMap: 'scripts/db/contract-map.d',
  grants: 'supabase/tests/fixtures/function-grants.d',
  probes: 'supabase/tests/fixtures/inactive-probes.d',
};
export const MAIN_FILES = {
  contractMap: 'scripts/db/contract-map.json',
  grants: 'supabase/tests/fixtures/function-grants.json',
};

export class FragmentError extends Error {
  constructor(problems) {
    super(problems.join('\n'));
    this.name = 'FragmentError';
    this.problems = problems;
  }
}

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * The *.json files of `dir` (repo-relative), in name order, parsed:
 * [{ file, doc }]. A missing directory is no fragments. Invalid JSON throws
 * a FragmentError naming the file.
 */
export function readFragments(dir, { root = ROOT } = {}) {
  const abs = resolve(root, dir);
  if (!existsSync(abs)) return [];
  const names = readdirSync(abs).filter((n) => n.endsWith('.json')).sort();
  return names.map((name) => {
    const file = relative(root, join(abs, name)).split('\\').join('/');
    try {
      return { file, doc: JSON.parse(readFileSync(join(abs, name), 'utf8')) };
    } catch (err) {
      throw new FragmentError([`${file}: not valid JSON (${err.message})`]);
    }
  });
}

/**
 * Merges contract-map fragments into the main map. `main` is { file, doc };
 * `fragments` [{ file, doc }]. Returns the merged map with `sources`:
 * { 'file:<path>', 'notMirrored.<section>.<key>', 'known:<key>' } -> source file.
 */
export function mergeContractMap(main, fragments) {
  const problems = [];
  const merged = {
    ...main.doc,
    files: [],
    notMirrored: { tables: {}, views: {}, functions: {}, columns: {} },
    knownMismatches: [],
  };
  const sources = {};
  const take = ({ file, doc }, isMain) => {
    if (!isObject(doc)) return void problems.push(`${file}: a contract map must be a JSON object`);
    if (!isMain && doc.version !== 1) problems.push(`${file}: version must be 1`);
    const allowed = new Set(['version', 'description', 'files', 'notMirrored', 'knownMismatches']);
    if (!isMain) for (const k of Object.keys(doc)) if (!allowed.has(k)) problems.push(`${file}: unknown key "${k}"`);
    if (doc.files !== undefined && !Array.isArray(doc.files)) problems.push(`${file}: files must be an array`);
    for (const entry of Array.isArray(doc.files) ? doc.files : []) {
      if (!isObject(entry) || typeof entry.file !== 'string') {
        problems.push(`${file}: every files[] entry needs a "file"`);
        continue;
      }
      const key = `file:${entry.file}`;
      if (sources[key]) problems.push(`${file}: files[] names ${entry.file}, already named by ${sources[key]}`);
      else {
        sources[key] = file;
        merged.files.push(entry);
      }
    }
    const nm = doc.notMirrored ?? {};
    if (!isObject(nm)) problems.push(`${file}: notMirrored must be an object`);
    for (const [section, entries] of Object.entries(isObject(nm) ? nm : {})) {
      if (!(section in merged.notMirrored)) {
        problems.push(`${file}: notMirrored.${section} is not a section (tables, views, functions, columns)`);
        continue;
      }
      if (!isObject(entries)) {
        problems.push(`${file}: notMirrored.${section} must be an object`);
        continue;
      }
      for (const [name, reason] of Object.entries(entries)) {
        const key = `notMirrored.${section}.${name}`;
        if (sources[key]) problems.push(`${file}: ${key} is already listed by ${sources[key]}`);
        else {
          sources[key] = file;
          merged.notMirrored[section][name] = reason;
        }
      }
    }
    if (doc.knownMismatches !== undefined && !Array.isArray(doc.knownMismatches)) problems.push(`${file}: knownMismatches must be an array`);
    for (const k of Array.isArray(doc.knownMismatches) ? doc.knownMismatches : []) {
      if (!isObject(k) || typeof k.key !== 'string') {
        problems.push(`${file}: every knownMismatches entry needs a "key"`);
        continue;
      }
      const key = `known:${k.key}`;
      if (sources[key]) problems.push(`${file}: knownMismatches ${k.key} is already listed by ${sources[key]}`);
      else {
        sources[key] = file;
        merged.knownMismatches.push(k);
      }
    }
  };
  take(main, true);
  for (const f of fragments) take(f, false);
  if (problems.length) throw new FragmentError(problems);
  return { ...merged, sources };
}

/** Merges function-grants fragments ({ functions?, relations? }) into the main fixture. */
export function mergeGrants(main, fragments) {
  const problems = [];
  const merged = { ...main.doc, functions: { ...(main.doc.functions ?? {}) }, relations: { ...(main.doc.relations ?? {}) } };
  const sources = {};
  for (const section of ['functions', 'relations']) for (const k of Object.keys(merged[section])) sources[`${section}.${k}`] = main.file;
  for (const { file, doc } of fragments) {
    if (!isObject(doc)) {
      problems.push(`${file}: a grants fragment must be a JSON object`);
      continue;
    }
    for (const k of Object.keys(doc)) {
      if (!['version', 'description', 'functions', 'relations'].includes(k)) problems.push(`${file}: unknown key "${k}"`);
    }
    for (const section of ['functions', 'relations']) {
      if (doc[section] === undefined) continue;
      if (!isObject(doc[section])) {
        problems.push(`${file}: ${section} must be an object`);
        continue;
      }
      for (const [k, v] of Object.entries(doc[section])) {
        const key = `${section}.${k}`;
        if (sources[key]) problems.push(`${file}: ${section} "${k}" is already listed by ${sources[key]}`);
        else {
          sources[key] = file;
          merged[section][k] = v;
        }
      }
    }
  }
  if (problems.length) throw new FragmentError(problems);
  return merged;
}

/** Concatenates probe fragments (arrays of { probe } / { allow } entries), each tagged with its file. */
export function mergeProbes(fragments) {
  const problems = [];
  const out = [];
  const seen = {};
  for (const { file, doc } of fragments) {
    if (!Array.isArray(doc)) {
      problems.push(`${file}: a probes fragment must be a JSON array`);
      continue;
    }
    doc.forEach((entry, i) => {
      const at = `${file}[${i}]`;
      const kinds = isObject(entry) ? Object.keys(entry) : [];
      if (kinds.length !== 1 || !['probe', 'allow'].includes(kinds[0])) {
        problems.push(`${at}: each entry is { "probe": { callee, expr } } or { "allow": { callee, reason } }`);
        return;
      }
      const kind = kinds[0];
      const body = entry[kind];
      const second = kind === 'probe' ? 'expr' : 'reason';
      if (!isObject(body) || typeof body.callee !== 'string' || !/^[a-z0-9_]+$/.test(body.callee) || typeof body[second] !== 'string' || !body[second].trim()) {
        problems.push(`${at}: ${kind} needs a snake_case "callee" and a non-empty "${second}"`);
        return;
      }
      if (seen[body.callee]) {
        problems.push(`${at}: callee ${body.callee} is already listed by ${seen[body.callee]}`);
        return;
      }
      seen[body.callee] = at;
      out.push({ kind, callee: body.callee, [second]: body[second], source: file });
    });
  }
  if (problems.length) throw new FragmentError(problems);
  return out;
}

const readMain = (rel, root) => ({ file: rel, doc: JSON.parse(readFileSync(resolve(root, rel), 'utf8')) });

/** The merged contract map of a repo (main map + contract-map.d). */
export function loadContractMap({ root = ROOT, mainPath = MAIN_FILES.contractMap } = {}) {
  const rel = relative(root, resolve(root, mainPath)).split('\\').join('/');
  return mergeContractMap(readMain(rel, root), readFragments(FRAGMENT_DIRS.contractMap, { root }));
}

/** The merged function-grants fixture of a repo. */
export function loadGrants({ root = ROOT } = {}) {
  return mergeGrants(readMain(MAIN_FILES.grants, root), readFragments(FRAGMENT_DIRS.grants, { root }));
}

/** The merged inactive-gate probe entries of a repo. */
export function loadProbes({ root = ROOT } = {}) {
  return mergeProbes(readFragments(FRAGMENT_DIRS.probes, { root }));
}

function main(argv) {
  const [what, ...rest] = argv;
  let root = ROOT;
  for (let i = 0; i < rest.length; i += 1) {
    if (rest[i] === '--root' && rest[i + 1]) root = resolve(rest[(i += 1)]);
    else {
      process.stderr.write(`fragments: unknown argument ${rest[i]}\n`);
      return 3;
    }
  }
  const loaders = { grants: loadGrants, probes: loadProbes, 'contract-map': loadContractMap };
  if (!loaders[what]) {
    process.stderr.write('Usage: node scripts/db/lib/fragments.mjs grants|probes|contract-map [--root <repo>]\n');
    return 3;
  }
  try {
    process.stdout.write(`${JSON.stringify(loaders[what]({ root }))}\n`);
    return 0;
  } catch (err) {
    const problems = err instanceof FragmentError ? err.problems : [String(err.message ?? err)];
    for (const p of problems) process.stderr.write(`fragments: ${p}\n`);
    return 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = main(process.argv.slice(2));
}
