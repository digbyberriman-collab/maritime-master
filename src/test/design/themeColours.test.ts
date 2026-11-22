/**
 * Every colour utility in src/ must name a colour the theme defines
 * (D-DS1: no invisible controls; Phase 0 audit).
 *
 * Tailwind silently drops a class it cannot resolve: Refit's primary button
 * was `bg-navy text-white`, and with no `navy` in tailwind.config.ts it had no
 * fill at all, white text on white in Daylight. The palette ratchet only
 * counts raw palette names, so it never saw `bg-navy`, `bg-paper` or
 * `text-ink`.
 *
 * How: collect every whitespace-separated token in the string and template
 * literals of src/**\/*.{ts,tsx} that looks like a colour-prefixed utility
 * (bg-, text-, border-, ring-, fill-, stroke-, from-, via-, to-, divide-,
 * outline-, after any variants), compile them all through PostCSS + Tailwind
 * with the repo config and src/index.css, and report the ones that emit no
 * CSS. Non-colour utilities (text-sm, border-b, ring-2 …) and the classes
 * index.css defines compile, so they pass on their own.
 *
 * KNOWN_UNDEFINED is a shrink-only allow-list of hits in files outside the
 * fixing stream's reach: fix the class (map it to a theme token), then delete
 * the entry. A new hit, or an entry that no longer occurs, fails.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import tailwindConfig from '../../../tailwind.config';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');

/**
 * `file: class` pairs that are undefined today, in files the Phase 0 audit
 * fix did not own. Shrink only. Token mapping used for the Refit files it did
 * fix: danger → destructive, ocean → primary, slate-deep → foreground (or
 * secondary-foreground on a secondary chip), navy → primary (sidebar-coloured
 * controls → sidebar), paper → card / background / muted, ink → foreground.
 * `ring-dashed` is not a utility at all (a dashed ring needs an outline or
 * border style).
 */
const KNOWN_UNDEFINED: readonly string[] = [
  'src/modules/dashboard/components/DashboardGrid.tsx: ring-dashed',
  'src/modules/refit/components/AuthBanner.tsx: bg-danger',
  'src/modules/refit/components/AuthBanner.tsx: bg-danger/10',
  'src/modules/refit/components/AuthBanner.tsx: bg-ocean',
  'src/modules/refit/components/AuthBanner.tsx: bg-ocean/5',
  'src/modules/refit/components/AuthBanner.tsx: border-danger/40',
  'src/modules/refit/components/AuthBanner.tsx: border-ocean/30',
  'src/modules/refit/components/AuthBanner.tsx: text-danger',
  'src/modules/refit/components/AuthBanner.tsx: text-ocean',
  'src/modules/refit/components/AuthBanner.tsx: text-slate-deep',
  'src/modules/refit/pages/access-check.tsx: bg-ocean',
  'src/modules/refit/pages/access-check.tsx: bg-ocean/90',
  'src/modules/refit/pages/admin.tsx: text-danger',
  'src/modules/refit/pages/admin.tsx: text-ocean',
  'src/modules/refit/pages/approvals.tsx: text-ocean',
  'src/modules/refit/pages/document-control.tsx: text-danger',
  'src/modules/refit/pages/logistics.tsx: text-ocean',
  'src/modules/refit/pages/meetings.tsx: text-ocean',
  'src/modules/refit/pages/reporting.tsx: text-danger',
  'src/modules/refit/pages/reporting.tsx: text-ocean',
  'src/modules/refit/pages/risks.tsx: bg-danger/10',
  'src/modules/refit/pages/risks.tsx: text-danger',
  'src/modules/refit/pages/schedule.tsx: text-danger',
  'src/modules/refit/pages/search.tsx: text-ocean',
];

const PREFIX = '(?:bg|text|border(?:-[xytrblse])?|ring(?:-offset)?|fill|stroke|from|via|to|divide(?:-[xy])?|outline)';
/** A colour-prefixed utility, with optional variants, `!` and an opacity modifier. */
const CANDIDATE = new RegExp(
  `^((?:[a-z0-9@-]+(?:-\\[[^\\]\\s]+\\])?:|\\[[^\\]\\s]+\\]:|[a-z-]+-\\[[^\\]\\s]+\\]:)*)!?(${PREFIX}-[a-z][a-z0-9-]*(?:\\/(?:\\d{1,3}|\\[[^\\]\\s]+\\]))?)$`,
);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === 'test' && dir === SRC) continue;
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(name) && !/\.(test|spec)\.(ts|tsx)$/.test(name) && !name.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

/** Text of every string and template-literal chunk in a source file. */
function literalTexts(file: string): string[] {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const out: string[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      out.push(node.text);
    } else if (ts.isJsxText(node)) {
      // Visible copy, not classes.
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return out;
}

/** Colour-prefixed utility (variants stripped) → files that use it. */
function candidatesIn(texts: readonly string[]): string[] {
  const found = new Set<string>();
  for (const text of texts) {
    for (const token of text.split(/\s+/)) {
      const m = CANDIDATE.exec(token);
      if (m) found.add(m[2]);
    }
  }
  return [...found];
}

/** Class names in the CSS Tailwind emits for `candidates`, with src/index.css. */
async function emittedClasses(candidates: readonly string[]): Promise<Set<string>> {
  const css = readFileSync(join(SRC, 'index.css'), 'utf8');
  const result = await postcss([
    tailwindcss({ ...tailwindConfig, content: [{ raw: candidates.join('\n'), extension: 'html' }] }),
  ]).process(css, { from: join(SRC, 'index.css') });
  const classes = new Set<string>();
  result.root.walkRules((rule) => {
    for (const m of rule.selector.matchAll(/\.((?:\\.|[^\s.:#[\]>+~,()\\])+)/g)) {
      classes.add(m[1].replace(/\\(.)/g, '$1'));
    }
  });
  return classes;
}

describe('theme colours', () => {
  it('extracts colour utilities from class strings, with variants and opacity, and nothing else', () => {
    expect(
      candidatesIn([
        'px-3 bg-navy text-white hover:bg-primary/90 md:!border-l-ink data-[state=checked]:bg-signal-muted',
        'ring-offset-background focus-visible:ring-ring group-hover:text-foreground [&_svg]:text-muted-foreground',
        'A to-do list from-the start, text-heavy copy',
      ]).sort(),
    ).toEqual(
      [
        'bg-navy',
        'text-white',
        'bg-primary/90',
        'border-l-ink',
        'bg-signal-muted',
        'ring-offset-background',
        'ring-ring',
        'text-foreground',
        'text-muted-foreground',
        'to-do',
        'from-the',
        'text-heavy',
      ].sort(),
    );
  });

  it('flags a colour Tailwind cannot resolve and passes theme tokens and non-colour utilities', async () => {
    const probe = ['bg-navy', 'text-ink', 'bg-paper', 'bg-primary', 'bg-primary/5', 'text-sm', 'border-b', 'ring-2', 'bg-signal-muted'];
    const emitted = await emittedClasses(probe);
    expect(probe.filter((c) => !emitted.has(c))).toEqual(['bg-navy', 'text-ink', 'bg-paper']);
  }, 60_000);

  it('every colour utility in src/ names a theme colour', async () => {
    const uses = new Map<string, Set<string>>();
    for (const file of walk(SRC)) {
      const rel = relative(ROOT, file);
      for (const c of candidatesIn(literalTexts(file))) {
        if (!uses.has(c)) uses.set(c, new Set());
        uses.get(c)!.add(rel);
      }
    }
    const emitted = await emittedClasses([...uses.keys()]);
    const hits: string[] = [];
    for (const [c, files] of uses) {
      if (emitted.has(c)) continue;
      for (const f of files) hits.push(`${f}: ${c}`);
    }
    hits.sort();
    const allowed = new Set(KNOWN_UNDEFINED);
    expect(
      hits.filter((h) => !allowed.has(h)),
      'Map these to theme tokens (tailwind.config.ts colours), e.g. bg-navy → bg-primary, text-ink → text-foreground',
    ).toEqual([]);
    expect(
      KNOWN_UNDEFINED.filter((h) => !hits.includes(h)),
      'Fixed: delete these from KNOWN_UNDEFINED',
    ).toEqual([]);
  }, 120_000);
});
