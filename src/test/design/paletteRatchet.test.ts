/**
 * Palette ratchet (BUILD-PLAN A10; gap/10 DS21, §C.3 step 3; DECISIONS D-10).
 *
 * Hard-coded colour in src/ (raw Tailwind palette classes, hex literals and
 * `dark:` variants) may only go down. Each file is held to its count in
 * palette-baseline.json; a file that is not in the baseline must have none.
 * PDF / spreadsheet / email generators and a few design-system files are
 * allow-listed (scripts/design/palette-ratchet.mjs ALLOW_LIST).
 *
 * When a migration lowers a file, lock it in:
 *   node scripts/design/palette-ratchet.mjs --write
 */
import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  ALLOW_LIST,
  CATEGORIES,
  allowedCategories,
  compareToBaseline,
  isScanned,
  nextBaseline,
  paletteClasses,
  readBaseline,
  scanRepo,
  scanSource,
  serialiseBaseline,
  totals,
} from '../../../scripts/design/palette-ratchet.mjs';
import { ROOT, readRepoFile } from './cssTokens';

const baseline = readBaseline(ROOT);
const current = scanRepo(ROOT);

/** Files that are migrated or new design-system code: they must stay at zero. */
const LOCKED_AT_ZERO = [
  'src/shared/components/data/DataTable.tsx',
  'src/shared/components/data/MatrixGrid.tsx',
  'src/shared/components/data/tableParts.tsx',
  'src/shared/components/data/tableModel.ts',
  'src/shared/components/data/useTableVirtualizer.ts',
  'src/shared/components/data/mapTheme.ts',
  'src/shared/components/data/KpiTile.tsx',
  'src/shared/components/status/StatusPill.tsx',
  'src/shared/components/states/EmptyState.tsx',
  'src/modules/development/pages/CoursesRegister.tsx',
  'src/modules/training/components/TrainingMatrixTab.tsx',
  'src/modules/dashboard/pages/FleetMap.tsx',
  'src/modules/dashboard/components/fleet/FleetGroupMaps.tsx',
  'src/modules/itinerary/components/HeatMapTab.tsx',
];

describe('palette ratchet', () => {
  it('no file has more hard-coded colour than its baseline, and new files have none', () => {
    const { increases } = compareToBaseline(current, baseline);
    const report = increases.map(
      (i) =>
        `${i.path}: ${i.category} ${i.baseline} → ${i.current}${i.isNew ? ' (not in the baseline: new code must use tokens)' : ''}`,
    );
    expect(report, 'Use semantic tokens, StatusPill or KpiTile instead of raw colour (gap/10 §C.3).').toEqual([]);
  });

  it('the total never rises above the baseline total', () => {
    const now = totals(current);
    const was = totals(baseline);
    for (const c of CATEGORIES) expect(now[c], c).toBeLessThanOrEqual(was[c]);
  });

  it.each(LOCKED_AT_ZERO)('%s stays at zero', (path) => {
    expect(existsSync(join(ROOT, path)), `${path} exists`).toBe(true);
    expect(current[path] ?? { palette: 0, hex: 0, dark: 0 }).toEqual({ palette: 0, hex: 0, dark: 0 });
    expect(baseline[path], `${path} must not be in the baseline`).toBeUndefined();
  });
});

describe('baseline file', () => {
  it('is written by the script (sorted, one line per file, totals that add up)', () => {
    const text = readRepoFile('src/test/design/palette-baseline.json');
    expect(text).toBe(serialiseBaseline(baseline));
    const json = JSON.parse(text) as { totals: Record<string, number> };
    expect(json.totals).toEqual(totals(baseline));
  });

  it('lists only scanned files with at least one positive count', () => {
    for (const [path, counts] of Object.entries(baseline)) {
      expect(isScanned(path), path).toBe(true);
      expect(CATEGORIES.some((c) => counts[c] > 0), path).toBe(true);
      for (const c of CATEGORIES) expect(Number.isInteger(counts[c]) && counts[c] >= 0, `${path} ${c}`).toBe(true);
    }
  });

  it('never records allow-listed categories', () => {
    for (const entry of ALLOW_LIST) {
      for (const c of entry.categories) expect(baseline[entry.path]?.[c] ?? 0, `${entry.path} ${c}`).toBe(0);
    }
  });
});

describe('allow-list', () => {
  it.each(ALLOW_LIST.map((e) => [e.path, e] as const))('%s exists and says why', (path, entry) => {
    expect(existsSync(join(ROOT, path)), path).toBe(true);
    expect(entry.reason.length).toBeGreaterThan(10);
    expect(entry.categories.length).toBeGreaterThan(0);
  });

  it('treats PDF / spreadsheet modules under lib/ as generators, never pages or components', () => {
    expect(allowedCategories('src/modules/x/lib/report.ts', "import jsPDF from 'jspdf';")).toEqual(['hex']);
    expect(allowedCategories('src/modules/x/lib/crewListPdf.ts', '')).toEqual(['hex']);
    expect(allowedCategories('src/modules/x/reports/exports.ts', "const ExcelJS = await import('exceljs');")).toEqual(['hex']);
    expect(allowedCategories('src/modules/x/pages/Report.tsx', "import jsPDF from 'jspdf';")).toEqual([]);
    expect(allowedCategories('src/modules/x/components/Exporter.tsx', "import * as XLSX from 'xlsx';")).toEqual([]);
    expect(allowedCategories('src/modules/x/lib/helpers.ts', '')).toEqual([]);
  });
});

describe('scope', () => {
  it('scans module and shared source but not generated types, declarations or tests', () => {
    expect(isScanned('src/modules/crew/pages/CrewList.tsx')).toBe(true);
    expect(isScanned('src/modules/crew/constants.ts')).toBe(true);
    expect(isScanned('src/integrations/supabase/types.ts')).toBe(false);
    expect(isScanned('src/vite-env.d.ts')).toBe(false);
    expect(isScanned('src/test/design/dataTable.test.tsx')).toBe(false);
    expect(isScanned('src/modules/vessels/lib/vesselCode.test.ts')).toBe(false);
    expect(isScanned('src/index.css')).toBe(false);
  });
});

describe('scanner', () => {
  it('counts raw palette classes with any variant, side or opacity', () => {
    const text =
      'bg-white text-gray-500 hover:bg-blue-50 border-l-red-300/50 from-sky-400 md:!text-red-600 dark:bg-gray-800 ring-offset-white divide-slate-200 placeholder-gray-400 [&_svg]:text-emerald-600';
    expect(paletteClasses(text)).toEqual([
      'bg-white',
      'text-gray-500',
      'bg-blue-50',
      'border-l-red-300/50',
      'from-sky-400',
      'text-red-600',
      'bg-gray-800',
      'ring-offset-white',
      'divide-slate-200',
      'placeholder-gray-400',
      'text-emerald-600',
    ]);
  });

  it("ignores STORM's own token names that share a hue name", () => {
    const tokens =
      'bg-orange text-purple-foreground bg-amber/10 bg-teal-muted border-cyan/25 text-pink bg-indigo-muted bg-slate-ui text-drift-400 bg-signal-muted bg-success-muted text-critical';
    expect(scanSource(tokens)).toEqual({ palette: 0, hex: 0, dark: 0 });
  });

  it('does not match inside other words', () => {
    expect(scanSource('context-red-500 nottext-white text-whitesmoke bg-red-5000')).toEqual({ palette: 0, hex: 0, dark: 0 });
  });

  it('counts hex colour literals in strings, attributes, arbitrary values and CSS text', () => {
    expect(scanSource(`'#0066CC' fill="#fff" bg-[#123456] "border:1px solid #eee" color:#888 rgba(0,0,0,.2)`).hex).toBe(5);
  });

  it('does not count ticket numbers, entities or anchors as colours', () => {
    expect(scanSource('Ticket #123 and #42 &#123; href="#add-form" #section').hex).toBe(0);
  });

  it('counts dark: variants', () => {
    expect(scanSource('bg-card dark:bg-muted dark:hover:text-foreground md:dark:!p-2').dark).toBe(3);
    expect(scanSource('darkMode: true, dark-mode').dark).toBe(0);
  });
});

describe('baseline maintenance', () => {
  const was = { 'src/a.tsx': { palette: 5, hex: 1, dark: 0 }, 'src/b.tsx': { palette: 2, hex: 0, dark: 0 } };

  it('reports increases (including new files) and decreases', () => {
    const now = { 'src/a.tsx': { palette: 6, hex: 0, dark: 0 }, 'src/c.tsx': { palette: 1, hex: 0, dark: 0 } };
    const { increases, decreases } = compareToBaseline(now, was);
    expect(increases).toEqual([
      { path: 'src/a.tsx', category: 'palette', baseline: 5, current: 6, isNew: false },
      { path: 'src/c.tsx', category: 'palette', baseline: 0, current: 1, isNew: true },
    ]);
    expect(decreases).toEqual([
      { path: 'src/a.tsx', category: 'hex', baseline: 1, current: 0 },
      { path: 'src/b.tsx', category: 'palette', baseline: 2, current: 0 },
    ]);
  });

  it('only ever writes the baseline downward unless increases are allowed', () => {
    const now = { 'src/a.tsx': { palette: 7, hex: 0, dark: 0 }, 'src/c.tsx': { palette: 1, hex: 0, dark: 0 } };
    expect(nextBaseline(now, was)).toEqual({ 'src/a.tsx': { palette: 5, hex: 0, dark: 0 } });
    expect(nextBaseline(now, was, true)).toEqual(now);
  });
});
