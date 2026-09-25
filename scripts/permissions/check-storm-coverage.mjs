#!/usr/bin/env node
// Checks that every leaf in src/config/sitemap.ts (L('Label', …)) is covered
// by a subcategory in docs/permissions/catalogues/storm.json — matched on the
// subcategory label or one of its navLabels. Exits 1 and lists gaps if not.
//
//   node scripts/permissions/check-storm-coverage.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sitemap = fs.readFileSync(path.join(ROOT, 'src/config/sitemap.ts'), 'utf8');
const cat = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/permissions/catalogues/storm.json'), 'utf8'));

const unquote = (s) => s.slice(1, -1).replace(/\\'/g, "'");
const leaves = new Set(
  [...sitemap.matchAll(/\bL\(\s*('(?:[^'\\]|\\.)*'|"[^"]*")/g)].map((m) => unquote(m[1])),
);

const covered = new Set();
for (const domain of cat.domains) {
  for (const mod of domain.modules) {
    for (const sub of mod.subcategories) {
      covered.add(sub.label);
      for (const alias of sub.navLabels ?? []) covered.add(alias);
    }
  }
}

const gaps = [...leaves].filter((label) => !covered.has(label)).sort();
console.log(`${leaves.size} distinct sitemap leaf labels, ${leaves.size - gaps.length} covered.`);
if (gaps.length) {
  console.error(`Uncovered leaves (add a subcategory or a navLabels alias):\n  ${gaps.join('\n  ')}`);
  process.exit(1);
}
