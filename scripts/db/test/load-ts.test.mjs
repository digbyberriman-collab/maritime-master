// Unit tests of scripts/db/lib/load-ts.mjs (the fixture generators' TS
// loader): transpile + specifier rewriting, refusals, stable JSON.
import { strict as assert } from 'node:assert';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { keyUuid, loadTs, moduleSpecifiers, resolveSpecifier, seededRandom, stableJson } from '../lib/load-ts.mjs';

function fakeRepo(files) {
  const root = mkdtempSync(join(tmpdir(), 'storm-load-ts-test-'));
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(join(root, rel, '..'), { recursive: true });
    writeFileSync(join(root, rel), text);
  }
  return root;
}

test('loads a module and its relative and @/ imports, dropping type-only imports', async () => {
  const root = fakeRepo({
    'src/lib/a.ts': "import { twice } from './b';\nimport type { Shape } from '@/lib/types';\nimport { PREFIX } from '@/lib/c';\nexport const run = (s: Shape): string => PREFIX + twice(s.n);\n",
    'src/lib/b.ts': 'export function twice(n: number): number { return n * 2; }\n',
    'src/lib/c.ts': "export const PREFIX: string = 'x';\n",
    'src/lib/types.ts': 'export interface Shape { n: number }\n',
  });
  try {
    const { modules, sourceSha256 } = await loadTs(['src/lib/a.ts', 'src/lib/b.ts', 'src/lib/c.ts'], { root });
    assert.equal(modules['src/lib/a.ts'].run({ n: 21 }), 'x42');
    assert.deepEqual(Object.keys(sourceSha256), ['src/lib/a.ts', 'src/lib/b.ts', 'src/lib/c.ts']);
    assert.match(sourceSha256['src/lib/b.ts'], /^[0-9a-f]{64}$/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('refuses a value import outside the set and a package import', async () => {
  const root = fakeRepo({
    'src/a.ts': "import { b } from './b';\nexport const a = b;\n",
    'src/b.ts': 'export const b = 1;\n',
    'src/p.ts': "import { x } from 'some-package';\nexport const p = x;\n",
  });
  try {
    await assert.rejects(loadTs(['src/a.ts'], { root }), /not in the set/);
    await assert.rejects(loadTs(['src/p.ts'], { root }), /imports the package "some-package"/);
    await assert.rejects(loadTs(['../outside.ts'], { root }), /outside the repository/);
    await assert.rejects(loadTs(['src/a.js'], { root }), /not a \.ts source file/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the real frozen engines load', async () => {
  const { modules } = await loadTs(['src/lib/records/reference.ts', 'src/lib/records/dates.ts']);
  assert.equal(modules['src/lib/records/reference.ts'].formatReference({ type: 'ptw', vesselCode: 'dra', date: '2026-11-23', seq: 61 }), 'PTW-DRA-2026-061');
});

test('specifier helpers', () => {
  assert.equal(resolveSpecifier('src/lib/records/a.ts', './b'), 'src/lib/records/b.ts');
  assert.equal(resolveSpecifier('src/lib/records/a.ts', '../x/y.js'), 'src/lib/x/y.ts');
  assert.equal(resolveSpecifier('src/a.ts', '@/lib/z'), 'src/lib/z.ts');
  assert.equal(resolveSpecifier('src/a.ts', 'react'), null);
  const specs = moduleSpecifiers('a.ts', "import type { T } from './t';\nexport * from './e';\nconst m = import('./d');\n");
  assert.deepEqual(specs, [
    { specifier: './t', typeOnly: true },
    { specifier: './e', typeOnly: false },
    { specifier: './d', typeOnly: false },
  ]);
});

test('stableJson sorts keys and can compact deep containers', () => {
  const value = { b: [{ y: 1, x: [2, 3] }], a: { d: null, c: 'é' } };
  assert.equal(stableJson(value), `${JSON.stringify({ a: { c: 'é', d: null }, b: [{ x: [2, 3], y: 1 }] }, null, 2)}\n`);
  assert.equal(stableJson(value, { compactDepth: 2 }), '{\n  "a": {\n    "c": "é",\n    "d": null\n  },\n  "b": [\n    {"x":[2,3],"y":1}\n  ]\n}\n');
  assert.equal(stableJson({ e: [], f: {} }, { compactDepth: 1 }), '{\n  "e": [],\n  "f": {}\n}\n');
});

test('seededRandom is deterministic and keyUuid matches md5(key)::uuid', () => {
  const a = seededRandom(7);
  const b = seededRandom(7);
  assert.deepEqual([a(), a(), a()], [b(), b(), b()]);
  // SELECT md5('company:A')::uuid
  assert.equal(keyUuid('company:A'), 'dd93094b-a263-80ee-fdf6-71bf15f30cc0');
});
