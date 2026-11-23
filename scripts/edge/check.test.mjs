// node --test scripts/edge/check.test.mjs
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { classifySpecifier, configFunctions, functionNames, hasInCodeAuth, importsOf, jwtOnlyFunctions, ownFiles, scanEntrypoint } from './check.mjs';

test('classifySpecifier', () => {
  assert.equal(classifySpecifier('./x.ts'), 'local');
  assert.equal(classifySpecifier('../_shared/http.ts'), 'local');
  assert.equal(classifySpecifier('npm:@supabase/supabase-js@2.49.2'), 'package');
  assert.equal(classifySpecifier('jsr:@std/assert@1.0.13'), 'package');
  assert.equal(classifySpecifier('https://esm.sh/@supabase/supabase-js@2'), 'esm.sh');
  assert.equal(classifySpecifier('https://deno.land/std@0.190.0/http/server.ts'), 'deno.land');
  assert.equal(classifySpecifier('https://cdn.example.test/x.js'), 'remote');
  assert.equal(classifySpecifier('@supabase/supabase-js'), 'bare');
});

test('importsOf: static, type, re-export and dynamic imports; comments ignored', () => {
  const src = [
    "import { a } from './a.ts';",
    "import type { B } from 'npm:b@1';",
    "import './side.ts';",
    "export { c } from '../c.ts';",
    "const d = await import('https://esm.sh/d');",
    "// import { e } from 'https://deno.land/e.ts';",
    "/* import { f } from 'https://deno.land/f.ts'; */",
    "const url = 'https://deno.land/not-an-import';",
  ].join('\n');
  assert.deepEqual(importsOf(src).sort(), ['../c.ts', './a.ts', './side.ts', 'https://esm.sh/d', 'npm:b@1'].sort());
});

test('scanEntrypoint follows relative imports and reports remote ones', () => {
  const dir = mkdtempSync(join(tmpdir(), 'edge-check-'));
  try {
    mkdirSync(join(dir, 'fn'));
    mkdirSync(join(dir, '_shared'));
    writeFileSync(join(dir, 'fn', 'index.ts'), "import { h } from './handler.ts';\nDeno.serve(h);\n");
    writeFileSync(join(dir, 'fn', 'handler.ts'), "import { x } from '../_shared/x.ts';\nimport { y } from 'npm:y@1';\nexport const h = x;\n");
    writeFileSync(join(dir, '_shared', 'x.ts'), "import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';\nexport const x = serve;\n");
    const scan = scanEntrypoint(join(dir, 'fn', 'index.ts'));
    assert.equal(scan.files.length, 3);
    assert.deepEqual(scan.external.map((e) => e.kind).sort(), ['deno.land', 'package']);
    assert.deepEqual(scan.missing, []);
    assert.deepEqual(functionNames(dir), ['fn']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('configFunctions reads every [functions.x] table and its verify_jwt', () => {
  const toml = [
    'project_id = "abc"',
    '# comment [functions.fake]',
    '[functions.a]',
    'verify_jwt = true # signed-in',
    '',
    '[functions.b]',
    'verify_jwt = false',
    '[functions.c]',
    '[auth]',
    'verify_jwt = true',
  ].join('\n');
  const map = configFunctions(toml);
  assert.deepEqual([...map.entries()], [['a', true], ['b', false], ['c', null]]);
});

test('the repo config.toml has an entry for every function, false only for the six machine / token callers', async () => {
  const { fileURLToPath } = await import('node:url');
  const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
  const map = configFunctions(readFileSync(join(root, 'supabase', 'config.toml'), 'utf8'));
  const names = functionNames(join(root, 'supabase', 'functions'));
  for (const name of names) assert.equal(typeof map.get(name), 'boolean', `${name} has an explicit verify_jwt`);
  const off = [...map.entries()].filter(([, v]) => v === false).map(([k]) => k).sort();
  assert.deepEqual(off, ['accept-invitation', 'ais-refresh', 'external-api', 'hr-daily-sweeper', 'idea-sync', 'inbound-webhook']);
  assert.equal(map.get('send-email'), true);
  assert.equal(map.get('pt-exercise-import'), true);
});

test('importsOf: words like "import" inside strings and code are not imports', () => {
  const src = [
    "import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';",
    "const label = 'Airtable import ' + name;",
    "if (mode === 'import' || action === 'sync') imported++;",
    "log('import \"x\" done');",
  ].join('\n');
  assert.deepEqual(importsOf(src), ['https://deno.land/std@0.190.0/http/server.ts']);
});

test('hasInCodeAuth: getAuthContext / getUser / getClaims calls and a service-role bearer compare count; definitions and comments do not', () => {
  assert.equal(hasInCodeAuth(['const ctx = await getAuthContext(req, deps);']), true);
  assert.equal(hasInCodeAuth(['const { data } = await supabase.auth.getUser(token);']), true);
  assert.equal(hasInCodeAuth(['const { data } = await client.auth.getClaims(token);']), true);
  assert.equal(hasInCodeAuth(['if (!token || !timingSafeEqual(token, env.serviceRoleKey)) throw x;']), true);
  assert.equal(hasInCodeAuth(['export async function getAuthContext(req) { return null; }']), false, 'a definition is not a check');
  assert.equal(hasInCodeAuth(['// const ctx = await getAuthContext(req);', '/* supabase.auth.getUser(token) */']), false);
  assert.equal(hasInCodeAuth(['Deno.serve(async (req) => new Response(await callModel(req)));']), false);
  assert.equal(hasInCodeAuth(['if (timingSafeEqual(a, b)) ok();']), false, 'a compare that is not the service-role key');
});

test('verify_jwt = true without an in-code check is a warning (ownFiles ignores shared helpers and tests)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'edge-check-'));
  try {
    for (const fn of ['guarded', 'open', 'shared-only']) mkdirSync(join(dir, fn));
    mkdirSync(join(dir, '_shared'));
    writeFileSync(join(dir, '_shared', 'auth.ts'), 'export async function getAuthContext(req) { return await client.auth.getUser(req); }\n');
    writeFileSync(join(dir, 'guarded', 'index.ts'), "import { getAuthContext } from '../_shared/auth.ts';\nDeno.serve(async (req) => { await getAuthContext(req); return new Response(); });\n");
    writeFileSync(join(dir, 'open', 'index.ts'), 'Deno.serve(() => new Response());\n');
    writeFileSync(join(dir, 'open', 'index.test.ts'), 'await getAuthContext(req);\n');
    writeFileSync(join(dir, 'shared-only', 'index.ts'), "import { NO_SESSION } from '../_shared/auth.ts';\nDeno.serve(() => new Response(String(NO_SESSION)));\n");
    const entries = ['guarded', 'open', 'shared-only'].map((name) => {
      const scan = scanEntrypoint(join(dir, name, 'index.ts'));
      const own = ownFiles([...scan.files, join(dir, name, 'index.test.ts')], join(dir, name)).filter((f) => existsSync(f));
      return { name, verifyJwt: true, inCodeAuth: hasInCodeAuth(own.map((f) => readFileSync(f, 'utf8'))) };
    });
    assert.deepEqual(jwtOnlyFunctions(entries), ['open', 'shared-only']);
    assert.deepEqual(jwtOnlyFunctions([{ name: 'machine', verifyJwt: false, inCodeAuth: false }]), [], 'verify_jwt = false is not warned here');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the repo: only the four documented followups rely on the gateway flag alone; create-crew-member is migrated', async () => {
  const { main } = await import('./check.mjs');
  const lines = [];
  const original = console.log;
  console.log = (line) => lines.push(String(line));
  let code;
  try {
    code = main(['--list', '--json']);
  } finally {
    console.log = original;
  }
  assert.equal(code, 0);
  const summary = JSON.parse(lines.join('\n'));
  assert.deepEqual(summary.jwtOnly, ['ai-route-planner', 'extract-flight-data', 'extract-form-fields', 'geocode-search']);
  assert.ok(summary.checkable.includes('create-crew-member'), 'create-crew-member is on npm: specifiers');
  assert.ok(!summary.remote.some((r) => r.name === 'create-crew-member'));
});

/**
 * The run command of the named step in a GitHub Actions workflow text. Reads
 * `run: <command>` on one line, or a `run: |` / `run: >` block (its indented
 * lines joined with spaces). Returns null when the step or its run is missing.
 */
function workflowStepRun(yaml, stepName) {
  const lines = yaml.split(/\r?\n/);
  const nameRe = /^(\s*)-\s+name:\s*(.+?)\s*$/;
  for (let i = 0; i < lines.length; i++) {
    const m = nameRe.exec(lines[i]);
    if (!m || m[2].replace(/^['"]|['"]$/g, '') !== stepName) continue;
    const stepIndent = m[1].length;
    for (let j = i + 1; j < lines.length; j++) {
      const line = lines[j];
      if (!line.trim()) continue;
      const indent = line.length - line.trimStart().length;
      if (indent <= stepIndent) return null;
      const run = /^\s*run:\s*(.*)$/.exec(line);
      if (!run) continue;
      const value = run[1].trim();
      if (value && !/^[|>][-+]?$/.test(value)) return value;
      const block = [];
      for (let k = j + 1; k < lines.length; k++) {
        const next = lines[k];
        if (next.trim() && next.length - next.trimStart().length <= indent) break;
        if (next.trim()) block.push(next.trim());
      }
      return block.join(' ');
    }
    return null;
  }
  return null;
}

test('workflowStepRun reads a one-line and a block run of the named step only', () => {
  const yaml = [
    'jobs:',
    '  edge:',
    '    steps:',
    '      - name: other',
    '        run: echo other',
    "      - name: 'deno lint (migrated functions)'",
    '        run: deno lint a b',
    '      - name: block',
    '        run: |',
    '          deno lint c',
    '          d',
    '      - name: no run',
    '        uses: actions/checkout@v4',
    '      - name: after',
    '        run: echo after',
  ].join('\n');
  assert.equal(workflowStepRun(yaml, 'deno lint (migrated functions)'), 'deno lint a b');
  assert.equal(workflowStepRun(yaml, 'block'), 'deno lint c d');
  assert.equal(workflowStepRun(yaml, 'no run'), null);
  assert.equal(workflowStepRun(yaml, 'missing'), null);
});

test('CI lints _shared and every checkable (migrated) function', async () => {
  const { fileURLToPath } = await import('node:url');
  const { main } = await import('./check.mjs');
  const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
  const run = workflowStepRun(readFileSync(join(root, '.github', 'workflows', 'ci.yml'), 'utf8'), 'deno lint (migrated functions)');
  assert.ok(run, "ci.yml has a 'deno lint (migrated functions)' step with a run line");
  const words = new Set(run.split(/\s+/).map((w) => w.replace(/\/+$/, '')));
  assert.ok(words.has('lint'), 'the step runs deno lint');
  assert.ok(words.has('supabase/functions/_shared'), 'the step lints supabase/functions/_shared');

  const lines = [];
  const original = console.log;
  console.log = (line) => lines.push(String(line));
  let code;
  try {
    code = main(['--list', '--json']);
  } finally {
    console.log = original;
  }
  assert.equal(code, 0);
  const { checkable } = JSON.parse(lines.join('\n'));
  for (const name of ['accept-invitation', 'admin-actions', 'bulk-invite', 'create-crew-member', 'send-email', 'send-invitation']) {
    assert.ok(checkable.includes(name), `${name} stays checkable (npm:/jsr:/relative imports only)`);
  }
  const missing = checkable.filter((name) => !words.has(`supabase/functions/${name}`));
  assert.deepEqual(missing, [], `every checkable function is in the CI lint step (missing: ${missing.join(', ')})`);
});

test('every function the build plan tells the owner to delete live (D-191) has neither a source folder nor a config entry', async () => {
  const { fileURLToPath } = await import('node:url');
  const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
  const plan = readFileSync(join(root, 'docs', 'blueprint', 'BUILD-PLAN.md'), 'utf8');
  const retired = [...new Set([...plan.matchAll(/`supabase functions delete ([a-z0-9_-]+)`/g)].map((m) => m[1]))];
  assert.ok(retired.length >= 2, 'BUILD-PLAN names the retired functions as owner delete actions');
  const map = configFunctions(readFileSync(join(root, 'supabase', 'config.toml'), 'utf8'));
  for (const name of retired) {
    assert.equal(existsSync(join(root, 'supabase', 'functions', name)), false, `${name} source is removed`);
    assert.equal(map.has(name), false, `${name} has no [functions.${name}] entry`);
  }
});
