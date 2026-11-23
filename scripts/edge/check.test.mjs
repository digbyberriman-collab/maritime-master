// node --test scripts/edge/check.test.mjs
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { classifySpecifier, configFunctions, functionNames, importsOf, scanEntrypoint } from './check.mjs';

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
  const { readFileSync } = await import('node:fs');
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
