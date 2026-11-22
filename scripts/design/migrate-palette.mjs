#!/usr/bin/env node
/**
 * Palette codemod (gap/10 §C.3 step 2; BUILD-PLAN A10, used by S7 and H1).
 *
 * Rewrites raw Tailwind palette classes onto Abyss semantic tokens inside
 * every string literal of a .ts / .tsx file: `className="…"`, `cn('…')`,
 * `cva('…')`, template literals and colour-map objects alike. Files are parsed
 * with the TypeScript compiler, so JSX text ("Don't …") is never touched.
 *
 * DRY RUN BY DEFAULT. It prints every change per file and the classes it
 * leaves for a person to decide; nothing is written without --write.
 *
 *   node scripts/design/migrate-palette.mjs src/modules/crew          dry run (default: src)
 *   node scripts/design/migrate-palette.mjs --write src/modules/crew  apply
 *   node scripts/design/migrate-palette.mjs --json src/modules/crew   machine-readable report
 *
 * After a --write, review the pages in dark and light (gap/10 §C.3 step 4),
 * replace status pairs with <StatusPill> where the report suggests it, then
 * lower the ratchet: node scripts/design/palette-ratchet.mjs --write
 *
 * Mapping table (gap/10 §C.3; DECISIONS §1 tokens):
 *
 *   bg-white                                   → bg-card (bg-popover inside menus: by hand)
 *   text-black, text-{gray,slate}-800…950      → text-foreground
 *   text-{gray,slate}-400…700                  → text-muted-foreground
 *   bg-{gray,slate}-50/100                     → bg-muted
 *   bg-{gray,slate}-200                        → bg-secondary
 *   hover:/focus:/active: bg-{gray,slate}-50…200, bg-white → bg-accent (the hover surface)
 *   border-{gray,slate}-*  (any side)          → border-border (border-input for controls: by hand)
 *   divide-{gray,slate}-*                      → divide-border
 *   bg-blue-500/600/700 (+ text-white)         → bg-primary (+ text-primary-foreground)
 *   text-blue-500…900                          → text-primary, or text-info beside a blue tint
 *   bg-blue-50/100/200 (+ text-blue-…)         → bg-info-muted (+ text-info)
 *   {green,emerald,lime}                       → success
 *   {red,rose}                                 → critical
 *   {yellow,amber}                             → warning
 *   orange → orange · purple, violet → purple · indigo → indigo · pink, fuchsia → pink
 *   teal → teal · cyan → cyan · sky → info
 *     bg-{hue}-50/100/200   → bg-{token}-muted     text-{hue}-500…900 → text-{token}
 *     bg-{hue}-500/600/700  → bg-{token}           border-{hue}-100…300 → border-{token}/25
 *     border-{hue}-400…700  → border-{token}       ring-{hue}-400…700 → ring-{token}
 *   text-white beside a solid token fill        → text-{fill}-foreground
 *   bg-black/30…90 (overlays)                   → bg-scrim
 *   ring-{blue,sky}-*                           → ring-ring · ring-{gray,slate}-* → ring-border
 *   ring-offset-white                           → ring-offset-background
 *   placeholder-{gray,slate}-*                  → placeholder:text-muted-foreground
 *   dark:<palette class> with a token for the same utility → removed (tokens already switch)
 *   from-/via-/to-, fill-, stroke-, shadow-, outline- colours, solid neutrals, light text
 *   shades and lone text-white                  → reported for review, unchanged
 */
import { readFileSync, writeFileSync, statSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { isScanned, PALETTE_FAMILIES } from './palette-ratchet.mjs';

export const NEUTRALS = Object.freeze(['gray', 'slate', 'zinc', 'neutral', 'stone']);

/** Hue family → Abyss token family. */
export const HUE_TOKEN = Object.freeze({
  green: 'success',
  emerald: 'success',
  lime: 'success',
  red: 'critical',
  rose: 'critical',
  yellow: 'warning',
  amber: 'warning',
  orange: 'orange',
  purple: 'purple',
  violet: 'purple',
  indigo: 'indigo',
  pink: 'pink',
  fuchsia: 'pink',
  teal: 'teal',
  cyan: 'cyan',
  sky: 'info',
  blue: 'info',
});

const SOLID_TOKENS = [
  'primary', 'destructive', 'success', 'warning', 'info', 'critical',
  'orange', 'purple', 'cyan', 'amber', 'pink', 'indigo', 'teal',
];

const UTILITIES = [
  'border-x', 'border-y', 'border-t', 'border-r', 'border-b', 'border-l', 'border-s', 'border-e',
  'ring-offset', 'placeholder', 'decoration', 'outline', 'divide', 'border', 'shadow', 'stroke',
  'caret', 'accent', 'fill', 'from', 'text', 'ring', 'via', 'bg', 'to',
];

const PALETTE_BASE_RE = new RegExp(
  `^(${UTILITIES.join('|')})-(white|black|(${PALETTE_FAMILIES.join('|')})-(50|100|200|300|400|500|600|700|800|900|950))(\\/\\d{1,3})?$`,
);

/** Token colour names (for spotting a class's token counterpart). */
const TOKEN_COLOR_RE =
  /^(?:background|foreground|card|popover|primary|secondary|muted|accent|destructive|border|input|ring|scrim|field|success|warning|info|critical|orange|purple|cyan|amber|pink|indigo|teal|signal-muted|surface-sunken|topbar)(?:-(?:foreground|muted))?(?:\/\d{1,3})?$/;

const COLOR_UTIL_RE = new RegExp(`^(${UTILITIES.join('|')})-(.+)$`);

const INTERACTIVE_VARIANT_RE = /^(?:hover|focus|focus-visible|focus-within|active|group-hover|peer-hover|group-focus|data-\[state=(?:open|on|active|checked)\])$/;

/** Split `md:hover:!bg-white/50` into its variant prefix and the class proper (brackets respected). */
export function splitVariants(raw) {
  let depth = 0;
  let last = -1;
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    if (ch === '[') depth += 1;
    else if (ch === ']') depth = Math.max(0, depth - 1);
    else if (ch === ':' && depth === 0) last = i;
  }
  return { variants: raw.slice(0, last + 1), base: raw.slice(last + 1) };
}

/** Parse one class; `null` when it is not a raw palette class. */
export function parsePaletteClass(raw) {
  const { variants, base } = splitVariants(raw);
  const important = base.startsWith('!');
  const body = important ? base.slice(1) : base;
  const m = PALETTE_BASE_RE.exec(body);
  if (!m) return null;
  const [, util, color, family, shade, opacity] = m;
  return {
    raw,
    variants,
    variantList: variants ? variants.slice(0, -1).split(':') : [],
    important,
    util,
    color: family ?? color,
    shade: shade ? Number(shade) : null,
    opacity: opacity ?? '',
  };
}

const isDark = (p) => p.variantList.includes('dark');
const isInteractive = (p) => p.variantList.some((v) => INTERACTIVE_VARIANT_RE.test(v));
const withoutDark = (variants) =>
  variants
    .split(':')
    .filter((v) => v && v !== 'dark')
    .map((v) => `${v}:`)
    .join('');
const between = (n, lo, hi) => n !== null && n >= lo && n <= hi;
const opacityValue = (opacity) => (opacity ? Number(opacity.slice(1)) : null);

/** Context of one class list that pairs depend on. */
function listContext(parsedBase, rawBase) {
  const tints = new Set();
  let solid = null;
  for (const p of parsedBase) {
    if (p.util !== 'bg' || !p.shade || p.opacity) continue;
    if (between(p.shade, 50, 200) && HUE_TOKEN[p.color]) tints.add(p.color);
    if (between(p.shade, 500, 700)) solid = p.color === 'blue' ? 'primary' : (HUE_TOKEN[p.color] ?? solid);
  }
  if (!solid) {
    for (const cls of rawBase) {
      const m = /^bg-([a-z]+)$/.exec(cls);
      if (m && SOLID_TOKENS.includes(m[1])) solid = m[1];
    }
  }
  return { tints, solid };
}

/**
 * The token class for one palette class, or a reason it needs a person.
 * Returns { to } (a class) or { manual: reason }.
 */
export function mapPaletteClass(p, context = { tints: new Set(), solid: null }) {
  const prefix = `${p.variants}${p.important ? '!' : ''}`;
  const out = (util, token, opacity = p.opacity) => ({ to: `${prefix}${util}-${token}${opacity}` });
  const neutral = NEUTRALS.includes(p.color);
  const hueToken = HUE_TOKEN[p.color];
  const s = p.shade;

  switch (p.util) {
    case 'bg': {
      if (isInteractive(p) && (p.color === 'white' || (neutral && between(s, 50, 200)))) return out('bg', 'accent');
      if (p.color === 'white') return out('bg', 'card');
      if (p.color === 'black') {
        const o = opacityValue(p.opacity);
        return o !== null && o >= 30 ? out('bg', 'scrim', '') : { manual: 'solid black fill: choose a surface token' };
      }
      if (neutral) {
        if (between(s, 50, 100)) return out('bg', 'muted');
        if (s === 200) return out('bg', 'secondary');
        return { manual: 'dark neutral surface: choose card, popover or muted' };
      }
      const solid = p.color === 'blue' ? 'primary' : hueToken;
      // A darker hover on a solid fill becomes the token at 90 %, as the Button primitive does.
      if (solid && between(s, 500, 800) && isInteractive(p)) return out('bg', solid, '/90');
      if (solid && between(s, 500, 700)) return out('bg', solid);
      if (hueToken && between(s, 50, 200)) return out('bg', `${hueToken}-muted`);
      return { manual: 'mid or dark hue fill: choose a status or chart token' };
    }
    case 'text': {
      if (p.color === 'white') {
        return context.solid
          ? out('text', `${context.solid}-foreground`, '')
          : { manual: 'text-white: use the -foreground token of the fill behind it' };
      }
      if (p.color === 'black') return out('text', 'foreground');
      if (neutral) {
        if (between(s, 800, 950)) return out('text', 'foreground');
        if (between(s, 400, 700)) return out('text', 'muted-foreground');
        return { manual: 'light text shade: check the surface behind it' };
      }
      if (p.color === 'blue' && between(s, 500, 900)) return out('text', context.tints.has('blue') ? 'info' : 'primary');
      if (hueToken && between(s, 500, 900)) return out('text', hueToken);
      return { manual: 'light hue text: check the surface behind it' };
    }
    case 'divide':
      return neutral ? out('divide', 'border') : { manual: 'coloured divider: choose a token' };
    case 'ring-offset':
      if (p.color === 'white' || (neutral && between(s, 50, 100))) return out('ring-offset', 'background', '');
      return { manual: 'ring offset colour: use ring-offset-background' };
    case 'ring':
      if (neutral) return out('ring', 'border');
      if ((p.color === 'blue' || p.color === 'sky') && between(s, 300, 700)) return out('ring', 'ring');
      if (hueToken && between(s, 400, 700)) return out('ring', hueToken);
      return { manual: 'ring colour: choose ring-ring or a status token' };
    case 'placeholder':
      if (neutral && between(s, 300, 700)) return { to: `${prefix}placeholder:text-muted-foreground` };
      return { manual: 'placeholder colour: use placeholder:text-muted-foreground' };
    default:
      break;
  }

  if (p.util.startsWith('border')) {
    if (neutral) return out(p.util, 'border');
    if (p.color === 'blue' && between(s, 400, 700)) return out(p.util, 'primary');
    if (hueToken && between(s, 100, 300)) return out(p.util, hueToken, '/25');
    if (hueToken && between(s, 400, 700)) return out(p.util, hueToken);
    return { manual: 'border colour: choose border, input or a status token' };
  }

  return { manual: `${p.util}- colour: gradients, strokes, fills and shadows are mapped by hand` };
}

/**
 * Migrate one class list (the text of one string literal). Whitespace is kept
 * as it was. Returns the new text, the changes made, the classes left for
 * review, and hints (status pairs that should become <StatusPill>).
 */
export function migrateClassString(text) {
  const leading = /^\s*/.exec(text)[0];
  const trailing = /\s*$/.exec(text)[0];
  const core = text.trim();
  if (!core) return { output: text, changes: [], manual: [], hints: [] };
  const parts = core.split(/(\s+)/);
  const tokens = [];
  for (let i = 0; i < parts.length; i += 2) tokens.push({ cls: parts[i], before: i > 0 ? parts[i - 1] : '' });

  const parsed = tokens.map((t) => (t.cls ? parsePaletteClass(t.cls) : null));
  const baseParsed = parsed.filter((p) => p && !p.variants);
  const baseRaw = tokens.filter((_, i) => !parsed[i]).map((t) => t.cls);
  const context = listContext(baseParsed, baseRaw);

  const changes = [];
  const manual = [];
  const result = tokens.map((t, i) => ({ ...t, to: t.cls, remove: false }));

  // Pass 1: every class that is not a dark: variant.
  parsed.forEach((p, i) => {
    if (!p || isDark(p)) return;
    const mapped = mapPaletteClass(p, context);
    if (mapped.to) result[i].to = mapped.to;
    else manual.push({ cls: p.raw, reason: mapped.manual });
  });

  // Token colour classes now present, keyed by utility + non-dark variants.
  const tokenKeys = new Set();
  result.forEach((r) => {
    const { variants, base } = splitVariants(r.to);
    if (variants.split(':').includes('dark')) return;
    const body = base.startsWith('!') ? base.slice(1) : base;
    const m = COLOR_UTIL_RE.exec(body);
    if (m && TOKEN_COLOR_RE.test(m[2])) tokenKeys.add(`${variants}|${m[1]}`);
    if (/^placeholder:text-/.test(r.to)) tokenKeys.add(`${variants}|placeholder`);
  });

  // Pass 2: dark: variants that only compensated for a light palette class.
  parsed.forEach((p, i) => {
    if (!p || !isDark(p)) return;
    if (tokenKeys.has(`${withoutDark(p.variants)}|${p.util}`)) result[i].remove = true;
    else manual.push({ cls: p.raw, reason: 'dark: variant with no token for the same utility: map the light class first' });
  });

  // Drop removed classes and exact duplicates created by the mapping.
  const seen = new Set();
  const kept = [];
  result.forEach((r) => {
    if (r.remove) {
      changes.push({ from: r.cls, to: null });
      return;
    }
    if (seen.has(r.to)) {
      changes.push({ from: r.cls, to: null });
      return;
    }
    if (r.to !== r.cls) changes.push({ from: r.cls, to: r.to });
    seen.add(r.to);
    kept.push(r);
  });

  // A removed class takes its leading whitespace with it.
  const output = leading + kept.map((r, i) => (i === 0 ? r.to : r.before + r.to)).join('') + trailing;

  // Status pairs (tinted background + text of the same family) read better as a pill.
  const hints = [];
  const final = kept.map((r) => r.to);
  for (const family of new Set(Object.values(HUE_TOKEN))) {
    if (final.includes(`bg-${family}-muted`) && final.includes(`text-${family}`)) {
      hints.push(`bg-${family}-muted + text-${family}: a status pair; consider <StatusPill tone=…> (gap/10 §A.8)`);
    }
  }

  return { output: changes.length ? output : text, changes, manual, hints };
}

const HEX_IN_TEXT_RE = /(?<=^|['"`([:,=\s])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])/g;

function literalSpans(sourceFile) {
  const spans = [];
  const visit = (node) => {
    let span = null;
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      const parent = node.parent;
      const isModuleSpecifier =
        parent && (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent)) && parent.moduleSpecifier === node;
      if (!isModuleSpecifier) span = [node.getStart(sourceFile) + 1, node.end - 1];
    } else if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node)) {
      span = [node.getStart(sourceFile) + 1, node.end - 2];
    } else if (ts.isTemplateTail(node)) {
      span = [node.getStart(sourceFile) + 1, node.end - 1];
    }
    if (span && span[1] >= span[0]) spans.push(span);
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return spans;
}

/**
 * Migrate a whole file. Returns the new source and a report with 1-based
 * line numbers: `changes` (from → to, `to: null` = removed), `manual`
 * (classes left for review), `hex` (hex colours, always by hand) and `hints`.
 */
export function migrateSource(source, fileName = 'file.tsx') {
  const kind = fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, kind);
  const lineOf = (pos) => sourceFile.getLineAndCharacterOfPosition(pos).line + 1;
  const edits = [];
  const report = { changes: [], manual: [], hex: [], hints: [] };

  for (const [start, end] of literalSpans(sourceFile)) {
    const text = source.slice(start, end);
    const line = lineOf(start);
    for (const match of text.matchAll(HEX_IN_TEXT_RE)) {
      report.hex.push({ line: lineOf(start + match.index), value: match[0] });
    }
    if (!/(?:^|[\s:!])(?:[a-z-]+)-(?:white|black|[a-z]+-\d{2,3})/.test(text)) continue;
    const result = migrateClassString(text);
    for (const c of result.changes) report.changes.push({ line, ...c });
    for (const m of result.manual) report.manual.push({ line, ...m });
    for (const h of result.hints) report.hints.push({ line, hint: h });
    if (result.output !== text) edits.push({ start, end, text: result.output });
  }

  let output = source;
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);
  }
  return { output, report };
}

function collectFiles(root, targets) {
  const files = [];
  const walk = (abs) => {
    const st = statSync(abs);
    if (st.isDirectory()) {
      for (const name of readdirSync(abs)) {
        if (name === 'node_modules' || name.startsWith('.')) continue;
        walk(join(abs, name));
      }
    } else {
      const rel = relative(root, abs).split(sep).join('/');
      if (isScanned(rel)) files.push(rel);
    }
  };
  for (const t of targets) walk(resolve(root, t));
  return [...new Set(files)].sort();
}

function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const args = process.argv.slice(2);
  const write = args.includes('--write');
  const json = args.includes('--json');
  const targets = args.filter((a) => !a.startsWith('--'));
  const files = collectFiles(root, targets.length ? targets : ['src']);
  const summary = { files: 0, changed: 0, rewritten: 0, removed: 0, manual: 0, hex: 0 };
  const all = [];

  for (const file of files) {
    const source = readFileSync(join(root, file), 'utf8');
    const { output, report } = migrateSource(source, file);
    const touched = output !== source;
    if (!touched && !report.manual.length && !report.hex.length) continue;
    summary.files += 1;
    if (touched) summary.changed += 1;
    summary.rewritten += report.changes.filter((c) => c.to).length;
    summary.removed += report.changes.filter((c) => !c.to).length;
    summary.manual += report.manual.length;
    summary.hex += report.hex.length;
    all.push({ file, report });
    if (!json) {
      console.log(`\n${file}${touched ? '' : '  (nothing automatic)'}`);
      for (const c of report.changes) console.log(`  L${c.line}  ${c.from} → ${c.to ?? '(removed)'}`);
      for (const m of report.manual) console.log(`  L${m.line}  review: ${m.cls}  (${m.reason})`);
      for (const h of report.hex) console.log(`  L${h.line}  review: ${h.value}  (hex colour: move to a token, or the chart palette for data)`);
      for (const h of report.hints) console.log(`  L${h.line}  hint: ${h.hint}`);
    }
    if (write && touched) writeFileSync(join(root, file), output);
  }

  if (json) {
    console.log(JSON.stringify({ write, summary, files: all }, null, 2));
    return;
  }
  console.log(
    `\n${write ? 'Wrote' : 'Dry run:'} ${summary.changed} of ${summary.files} files; ${summary.rewritten} classes rewritten, ${summary.removed} removed; ${summary.manual} classes and ${summary.hex} hex colours left for review.`,
  );
  if (!write) console.log('Nothing was written. Re-run with --write to apply.');
  else console.log('Next: check the pages in dark and light, then: node scripts/design/palette-ratchet.mjs --write');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
