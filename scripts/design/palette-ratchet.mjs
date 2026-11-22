#!/usr/bin/env node
/**
 * Palette ratchet (gap/10 DS21, §C.3 step 3; DECISIONS D-10; BUILD-PLAN A10).
 *
 * Counts hard-coded colour per source file under src/ (.ts and .tsx, the
 * generated Supabase types, declaration files and tests excluded):
 *
 *   palette  raw Tailwind palette classes: bg-white, text-gray-500,
 *            hover:bg-blue-50, border-l-red-300/50, from-sky-400 … (STORM's
 *            own token names such as bg-orange, text-purple-foreground,
 *            bg-amber/10 or slate-ui are not palette classes)
 *   hex      hex colour literals: '#0066CC', fill="#fff", bg-[#123456],
 *            "border:1px solid #eee"
 *   dark     `dark:` variants (tokens already switch with the theme)
 *
 * src/test/design/paletteRatchet.test.ts compares the counts with
 * src/test/design/palette-baseline.json: a file may never exceed its
 * baseline in any category and a file missing from the baseline must be at
 * zero. Migration PRs lower the baseline:
 *
 *   node scripts/design/palette-ratchet.mjs              report vs baseline
 *   node scripts/design/palette-ratchet.mjs --write      lower the baseline to today's counts
 *   node scripts/design/palette-ratchet.mjs --write --allow-increase
 *                                                        accept increases too (needs a reason in the PR)
 *   node scripts/design/palette-ratchet.mjs --top 20     the worst files
 *
 * Allow-list (counts in these categories are not taken): PDF / spreadsheet /
 * email generators, which draw on paper with the light palette, and the few
 * design-system files that must carry a literal colour (see ALLOW_LIST).
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const CATEGORIES = Object.freeze(['palette', 'hex', 'dark']);

export const PALETTE_FAMILIES = Object.freeze([
  'slate', 'gray', 'zinc', 'neutral', 'stone',
  'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal',
  'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose',
]);

export const COLOR_UTILITIES = Object.freeze([
  'bg', 'text', 'border', 'border-x', 'border-y', 'border-t', 'border-r', 'border-b', 'border-l', 'border-s', 'border-e',
  'ring', 'ring-offset', 'outline', 'divide', 'from', 'via', 'to', 'fill', 'stroke', 'shadow', 'placeholder',
  'decoration', 'caret', 'accent',
]);

const SHADES = '(?:50|100|200|300|400|500|600|700|800|900|950)';
const UTIL_GROUP = [...COLOR_UTILITIES].sort((a, b) => b.length - a.length).join('|');
const FAMILY_GROUP = PALETTE_FAMILIES.join('|');

/** One raw palette class, with any variant prefix in front of it left out of the match. */
export const PALETTE_CLASS_RE = new RegExp(
  `(?<![\\w-])(?:${UTIL_GROUP})-(?:(?:white|black)|(?:${FAMILY_GROUP})-${SHADES})(?:\\/\\d{1,3})?(?![\\w-])`,
  'g',
);

/** Hex colour literal after a quote, bracket, colon, comma, equals or space. */
const HEX_RE = /(?<=['"`([:,=\s])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})(?![\w-])/g;

/** A `dark:` variant, anywhere in a class list. */
const DARK_RE = /(?<![\w-])dark:(?=[!\w[-])/g;

function countHex(text) {
  let n = 0;
  for (const match of text.matchAll(HEX_RE)) {
    const before = text[match.index - 1];
    // "Ticket #123" in copy is not a colour; "#333" after a space in a CSS string is, after a quote too.
    if (/\s/.test(before) && /^#\d{3,4}$/.test(match[0])) continue;
    n += 1;
  }
  return n;
}

/** Counts for one file's text. */
export function scanSource(text) {
  return {
    palette: (text.match(PALETTE_CLASS_RE) ?? []).length,
    hex: countHex(text),
    dark: (text.match(DARK_RE) ?? []).length,
  };
}

/** Every raw palette class in a text (for reports and the codemod). */
export function paletteClasses(text) {
  return text.match(PALETTE_CLASS_RE) ?? [];
}

const GENERATOR_IMPORT_RE = /from\s+['"](?:jspdf|jspdf-autotable|exceljs|xlsx)['"]|import\(\s*['"](?:jspdf|jspdf-autotable|exceljs|xlsx)['"]\s*\)/;

/**
 * Files whose literal colours are legitimate. `categories` lists what is not
 * counted for them. Paths are repo-relative with forward slashes.
 */
export const ALLOW_LIST = Object.freeze([
  { path: 'src/lib/pdf/pdfTemplate.ts', categories: ['hex'], reason: 'PDF generator (paper uses the light palette)' },
  { path: 'src/modules/logbooks/lib/logbookPdf.ts', categories: ['hex'], reason: 'PDF generator' },
  { path: 'src/modules/hris/lib/payroll/payslip.ts', categories: ['hex'], reason: 'PDF generator' },
  { path: 'src/modules/hris/lib/reviewPdf.ts', categories: ['hex'], reason: 'PDF generator' },
  { path: 'src/modules/rotation-planner/lib/pdfExporter.ts', categories: ['hex'], reason: 'PDF generator' },
  { path: 'src/lib/integrations/email/types.ts', categories: ['hex'], reason: 'Email templates (inline styles, no CSS variables in mail clients)' },
  { path: 'src/components/ui/theme-config.ts', categories: ['hex'], reason: 'theme-color meta needs literal colours; mirrors index.html' },
  { path: 'src/components/ui/chart.tsx', categories: ['hex'], reason: "Attribute selectors that match Recharts' own default colours" },
]);

/**
 * Any other `.ts` module under `lib/` or `reports/` that imports a PDF or
 * spreadsheet library, or is named for one (`*Pdf.ts`, `pdf.ts`,
 * `*Exporter.ts`), is a generator too. Pages and components never qualify.
 */
export function allowedCategories(path, text) {
  const listed = ALLOW_LIST.find((entry) => entry.path === path);
  if (listed) return listed.categories;
  const generatorModule = /(^|\/)(lib|reports)\//.test(path) && /\.ts$/.test(path);
  if (generatorModule && (GENERATOR_IMPORT_RE.test(text) || /(pdf|xlsx|export)[^/]*\.ts$/i.test(path))) return ['hex'];
  return [];
}

const EXCLUDE = [
  /^src\/integrations\/supabase\/types\.ts$/,
  /^src\/test\//,
  /\.(test|spec)\.tsx?$/,
  /\.d\.ts$/,
];

export const isScanned = (path) => /\.(ts|tsx)$/.test(path) && path.startsWith('src/') && !EXCLUDE.some((re) => re.test(path));

function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const toPosix = (p) => p.split(sep).join('/');

/** `{ 'src/x.tsx': { palette, hex, dark } }` for every scanned file with any count. */
export function scanRepo(root) {
  const files = walk(join(root, 'src'), []).map((f) => toPosix(relative(root, f))).filter(isScanned).sort();
  const result = {};
  for (const path of files) {
    const text = readFileSync(join(root, path), 'utf8');
    const counts = scanSource(text);
    for (const category of allowedCategories(path, text)) counts[category] = 0;
    if (CATEGORIES.some((c) => counts[c] > 0)) result[path] = counts;
  }
  return result;
}

export function totals(counts) {
  const sum = { palette: 0, hex: 0, dark: 0, files: 0 };
  for (const entry of Object.values(counts)) {
    sum.files += 1;
    for (const c of CATEGORIES) sum[c] += entry[c] ?? 0;
  }
  return sum;
}

/**
 * Compare today's counts with the baseline. `increases` lists every file and
 * category above its baseline (a file missing from the baseline has a
 * baseline of zero); `decreases` lists the ones that can be locked lower.
 */
export function compareToBaseline(current, baseline) {
  const increases = [];
  const decreases = [];
  const paths = new Set([...Object.keys(current), ...Object.keys(baseline)]);
  for (const path of [...paths].sort()) {
    const now = current[path] ?? {};
    const was = baseline[path] ?? {};
    for (const c of CATEGORIES) {
      const a = now[c] ?? 0;
      const b = was[c] ?? 0;
      if (a > b) increases.push({ path, category: c, baseline: b, current: a, isNew: !(path in baseline) });
      else if (a < b) decreases.push({ path, category: c, baseline: b, current: a });
    }
  }
  return { increases, decreases };
}

/** The baseline to write: today's counts, never above the old baseline unless increases are allowed. */
export function nextBaseline(current, baseline, allowIncrease = false) {
  const out = {};
  const paths = new Set([...Object.keys(current), ...(allowIncrease ? [] : Object.keys(baseline))]);
  for (const path of [...paths].sort()) {
    const entry = {};
    for (const c of CATEGORIES) {
      const now = current[path]?.[c] ?? 0;
      const was = baseline[path]?.[c];
      // Without --allow-increase a file can only keep or lower its count; one
      // missing from the baseline is held at zero.
      entry[c] = allowIncrease ? now : Math.min(now, was ?? 0);
    }
    if (CATEGORIES.some((c) => entry[c] > 0)) out[path] = entry;
  }
  return out;
}

export const BASELINE_PATH = 'src/test/design/palette-baseline.json';

export function readBaseline(root) {
  const file = join(root, BASELINE_PATH);
  if (!existsSync(file)) return {};
  const json = JSON.parse(readFileSync(file, 'utf8'));
  return json.files ?? {};
}

/** One line per file, so a migration PR's baseline diff reads file by file. */
export function serialiseBaseline(files) {
  const sum = totals(files);
  const comment =
    'Palette ratchet baseline (gap/10 DS21). Counts of raw palette classes, hex literals and dark: variants per file. Counts may only go down: lower them with `node scripts/design/palette-ratchet.mjs --write`. New files must be at zero.';
  const entries = Object.keys(files)
    .sort()
    .map((path) => {
      const c = files[path];
      return `    ${JSON.stringify(path)}: { "palette": ${c.palette ?? 0}, "hex": ${c.hex ?? 0}, "dark": ${c.dark ?? 0} }`;
    });
  return [
    '{',
    `  "$comment": ${JSON.stringify(comment)},`,
    `  "totals": ${JSON.stringify(sum).replace(/,/g, ', ').replace(/:/g, ': ')},`,
    '  "files": {',
    entries.join(',\n'),
    '  }',
    '}',
    '',
  ].join('\n');
}

function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const args = process.argv.slice(2);
  const current = scanRepo(root);
  const baseline = readBaseline(root);
  const sum = totals(current);
  const topIndex = args.indexOf('--top');
  if (topIndex !== -1) {
    const n = Number(args[topIndex + 1] ?? 20);
    const rows = Object.entries(current)
      .map(([path, c]) => ({ path, total: c.palette + c.hex + c.dark, ...c }))
      .sort((a, b) => b.total - a.total)
      .slice(0, n);
    for (const r of rows) console.log(`${String(r.total).padStart(5)}  palette ${r.palette}  hex ${r.hex}  dark ${r.dark}  ${r.path}`);
    return;
  }
  const { increases, decreases } = compareToBaseline(current, baseline);
  if (args.includes('--write')) {
    // The first run seeds the baseline from today's tree.
    const allowIncrease = args.includes('--allow-increase') || !existsSync(join(root, BASELINE_PATH));
    if (increases.length && !allowIncrease) {
      for (const i of increases.slice(0, 40)) console.error(`  above baseline: ${i.path} ${i.category} ${i.baseline} → ${i.current}`);
      if (increases.length > 40) console.error(`  … and ${increases.length - 40} more`);
      console.error('Refusing to raise the baseline. Fix the files, or pass --allow-increase with a reason in the PR.');
      process.exitCode = 1;
      return;
    }
    const next = nextBaseline(current, baseline, allowIncrease);
    writeFileSync(join(root, BASELINE_PATH), serialiseBaseline(next));
    const t = totals(next);
    console.log(`Wrote ${BASELINE_PATH}: ${t.files} files, palette ${t.palette}, hex ${t.hex}, dark ${t.dark}.`);
    return;
  }
  console.log(`Now: ${sum.files} files, palette ${sum.palette}, hex ${sum.hex}, dark ${sum.dark}.`);
  for (const i of increases.slice(0, 40)) console.log(`  ABOVE baseline${i.isNew ? ' (new file)' : ''}: ${i.path} ${i.category} ${i.baseline} → ${i.current}`);
  if (increases.length > 40) console.log(`  … and ${increases.length - 40} more`);
  if (decreases.length) console.log(`  ${decreases.length} file/category counts are below baseline; run --write to lock them in.`);
  if (increases.length) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
