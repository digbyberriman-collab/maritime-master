/**
 * Palette codemod (BUILD-PLAN A10; gap/10 §C.3 step 2): the mapping table,
 * pair rules, dark: clean-up, what is left for review, and a source-level
 * rewrite that never touches JSX text. The codemod is not run across the
 * repo here (BUILD-PLAN S7 does that).
 */
import { describe, expect, it } from 'vitest';
import {
  migrateClassString,
  migrateSource,
  parsePaletteClass,
  splitVariants,
} from '../../../scripts/design/migrate-palette.mjs';
import { scanSource } from '../../../scripts/design/palette-ratchet.mjs';

const out = (text: string) => migrateClassString(text).output;
const review = (text: string) => migrateClassString(text).manual.map((m) => m.cls);

describe('parsing', () => {
  it('splits variants, keeping arbitrary variants whole', () => {
    expect(splitVariants('md:hover:!bg-white/50')).toEqual({ variants: 'md:hover:', base: '!bg-white/50' });
    expect(splitVariants('[&:hover]:text-gray-500')).toEqual({ variants: '[&:hover]:', base: 'text-gray-500' });
    expect(splitVariants('bg-white')).toEqual({ variants: '', base: 'bg-white' });
  });

  it('parses palette classes and ignores token classes', () => {
    expect(parsePaletteClass('dark:border-l-red-300/40')).toMatchObject({
      variantList: ['dark'],
      util: 'border-l',
      color: 'red',
      shade: 300,
      opacity: '/40',
    });
    expect(parsePaletteClass('!text-white')).toMatchObject({ important: true, util: 'text', color: 'white', shade: null });
    for (const token of ['bg-orange', 'text-purple-foreground', 'bg-amber/10', 'bg-slate-ui', 'text-sm', 'bg-card']) {
      expect(parsePaletteClass(token), token).toBeNull();
    }
  });
});

describe('mapping table (gap/10 §C.3)', () => {
  it.each([
    ['bg-white', 'bg-card'],
    ['bg-white/80', 'bg-card/80'],
    ['text-black', 'text-foreground'],
    ['text-gray-900', 'text-foreground'],
    ['text-slate-800', 'text-foreground'],
    ['text-gray-700', 'text-muted-foreground'],
    ['text-gray-400', 'text-muted-foreground'],
    ['text-slate-600', 'text-muted-foreground'],
    ['bg-gray-50', 'bg-muted'],
    ['bg-slate-100', 'bg-muted'],
    ['bg-gray-200', 'bg-secondary'],
    ['bg-slate-200', 'bg-secondary'],
    ['border-gray-200', 'border-border'],
    ['border-slate-300', 'border-border'],
    ['border-b-gray-100', 'border-b-border'],
    ['divide-gray-200', 'divide-border'],
    ['bg-blue-600 text-white', 'bg-primary text-primary-foreground'],
    ['bg-blue-500 text-white', 'bg-primary text-primary-foreground'],
    ['text-blue-600 hover:underline', 'text-primary hover:underline'],
    ['text-blue-700', 'text-primary'],
    ['bg-blue-50 text-blue-700', 'bg-info-muted text-info'],
    ['bg-blue-100 text-blue-800', 'bg-info-muted text-info'],
    ['bg-green-100 text-green-800', 'bg-success-muted text-success'],
    ['bg-emerald-50 text-emerald-700', 'bg-success-muted text-success'],
    ['bg-red-50 text-red-700', 'bg-critical-muted text-critical'],
    ['bg-rose-100 text-rose-600', 'bg-critical-muted text-critical'],
    ['bg-yellow-100 text-yellow-800', 'bg-warning-muted text-warning'],
    ['bg-amber-50 text-amber-700', 'bg-warning-muted text-warning'],
    ['bg-orange-100 text-orange-700', 'bg-orange-muted text-orange'],
    ['bg-green-500 text-white', 'bg-success text-success-foreground'],
    ['bg-red-600 text-white', 'bg-critical text-critical-foreground'],
    ['bg-amber-500 text-white', 'bg-warning text-warning-foreground'],
    ['bg-orange-600 text-white', 'bg-orange text-orange-foreground'],
    ['bg-purple-100 text-purple-700', 'bg-purple-muted text-purple'],
    ['bg-violet-100 text-violet-700', 'bg-purple-muted text-purple'],
    ['bg-indigo-50 text-indigo-700', 'bg-indigo-muted text-indigo'],
    ['bg-pink-100 text-pink-700', 'bg-pink-muted text-pink'],
    ['bg-teal-100 text-teal-700', 'bg-teal-muted text-teal'],
    ['bg-cyan-100 text-cyan-700', 'bg-cyan-muted text-cyan'],
    ['bg-sky-100 text-sky-700', 'bg-info-muted text-info'],
    ['bg-black/80', 'bg-scrim'],
    ['bg-black/50 backdrop-blur-sm', 'bg-scrim backdrop-blur-sm'],
  ])('%s → %s', (from, to) => {
    expect(out(from)).toBe(to);
  });

  it('keeps variants, important and opacity, and maps state backgrounds to the hover surface', () => {
    expect(out('md:text-gray-500 !bg-white/80')).toBe('md:text-muted-foreground !bg-card/80');
    expect(out('hover:bg-gray-100')).toBe('hover:bg-accent');
    expect(out('hover:bg-white focus:bg-slate-50')).toBe('hover:bg-accent focus:bg-accent');
    expect(out('bg-blue-600 text-white hover:bg-blue-700')).toBe('bg-primary text-primary-foreground hover:bg-primary/90');
    expect(out('bg-green-500/10 text-green-600 border-green-200')).toBe('bg-success/10 text-success border-success/25');
    expect(out('border-red-500')).toBe('border-critical');
  });

  it('maps rings, ring offsets and placeholders', () => {
    expect(out('ring-blue-500 focus:ring-blue-500 ring-offset-white')).toBe('ring-ring focus:ring-ring ring-offset-background');
    expect(out('ring-gray-200')).toBe('ring-border');
    expect(out('placeholder-gray-400')).toBe('placeholder:text-muted-foreground');
  });

  it('gives text-white the foreground of the token fill behind it', () => {
    expect(out('bg-primary text-white')).toBe('bg-primary text-primary-foreground');
    expect(out('bg-destructive text-white')).toBe('bg-destructive text-destructive-foreground');
    expect(review('text-white')).toEqual(['text-white']);
    expect(out('text-white')).toBe('text-white');
  });
});

describe('dark: variants', () => {
  it('removes a dark: variant once the light class it compensated for is a token', () => {
    expect(out('bg-white dark:bg-gray-800 text-gray-900 dark:text-white')).toBe('bg-card text-foreground');
    expect(out('hover:bg-gray-100 dark:hover:bg-gray-800')).toBe('hover:bg-accent');
    expect(out('bg-card dark:bg-slate-900')).toBe('bg-card');
  });

  it('leaves a dark: variant with no token counterpart for review', () => {
    expect(out('dark:bg-gray-800')).toBe('dark:bg-gray-800');
    expect(review('dark:bg-gray-800')).toEqual(['dark:bg-gray-800']);
    expect(out('bg-gray-900 dark:bg-gray-800')).toBe('bg-gray-900 dark:bg-gray-800');
  });
});

describe('left for review', () => {
  it.each([
    ['from-blue-500 to-cyan-500', ['from-blue-500', 'to-cyan-500']],
    ['bg-gray-900', ['bg-gray-900']],
    ['text-gray-200', ['text-gray-200']],
    ['bg-black', ['bg-black']],
    ['fill-white stroke-gray-500 shadow-black/10', ['fill-white', 'stroke-gray-500', 'shadow-black/10']],
  ])('%s', (text, expected) => {
    expect(out(text)).toBe(text);
    expect(review(text)).toEqual(expected);
  });

  it('suggests StatusPill for a tinted background with text of the same family', () => {
    expect(migrateClassString('bg-green-100 text-green-800').hints[0]).toMatch(/StatusPill/);
    expect(migrateClassString('bg-green-100 text-red-800').hints).toEqual([]);
  });
});

describe('properties', () => {
  it('leaves token classes and non-colour classes alone', () => {
    const text = 'flex items-center gap-2 bg-orange text-purple-foreground px-2 text-sm';
    expect(migrateClassString(text)).toEqual({ output: text, changes: [], manual: [], hints: [] });
  });

  it('keeps the original whitespace and drops a removed class with its separator', () => {
    expect(out('  flex  bg-white ')).toBe('  flex  bg-card ');
    expect(out('p-2  dark:bg-gray-800 bg-white')).toBe('p-2 bg-card');
    expect(out('text-gray-900 text-foreground')).toBe('text-foreground');
  });

  it('is idempotent', () => {
    for (const text of ['bg-white text-gray-900 dark:bg-gray-800', 'bg-blue-600 text-white hover:bg-blue-700', 'from-sky-400 bg-black/80']) {
      const once = out(text);
      expect(out(once)).toBe(once);
    }
  });

  it('every automatic rewrite leaves no raw palette class behind', () => {
    const text = 'bg-white text-gray-900 border-gray-200 hover:bg-gray-50 bg-green-100 text-green-800 dark:bg-gray-800';
    expect(scanSource(out(text))).toEqual({ palette: 0, hex: 0, dark: 0 });
  });
});

describe('migrateSource', () => {
  const source = [
    "import { cn } from '@/lib/utils';",
    'export const X = ({ active, x }: { active: boolean; x: string }) => (',
    '  <div className="bg-white text-gray-900">',
    "    <p>Don't break on apostrophes; it's text-white in prose</p>",
    "    <span className={cn('px-2', active ? 'bg-blue-600 text-white' : 'bg-gray-100')} />",
    "    <b className={`p-1 ${x} border-gray-200`} style={{ color: '#ff0000' }} />",
    '  </div>',
    ');',
    "const COLORS = { ok: 'bg-green-100 text-green-800', bad: `bg-red-50 ${'text-red-700'}` };",
  ].join('\n');

  it('rewrites class strings in JSX attributes, cn() calls, template literals and colour maps', () => {
    const { output } = migrateSource(source, 'X.tsx');
    expect(output).toContain('<div className="bg-card text-foreground">');
    expect(output).toContain("cn('px-2', active ? 'bg-primary text-primary-foreground' : 'bg-muted')");
    expect(output).toContain('className={`p-1 ${x} border-border`}');
    expect(output).toContain("ok: 'bg-success-muted text-success'");
    expect(output).toContain("bad: `bg-critical-muted ${'text-critical'}`");
  });

  it('never touches JSX text or import paths', () => {
    const { output } = migrateSource(source, 'X.tsx');
    expect(output).toContain("<p>Don't break on apostrophes; it's text-white in prose</p>");
    expect(output).toContain("import { cn } from '@/lib/utils';");
  });

  it('reports each change with its line, and hex colours for review', () => {
    const { report } = migrateSource(source, 'X.tsx');
    expect(report.changes).toContainEqual({ line: 3, from: 'bg-white', to: 'bg-card' });
    expect(report.changes).toContainEqual({ line: 5, from: 'text-white', to: 'text-primary-foreground' });
    expect(report.hex).toEqual([{ line: 6, value: '#ff0000' }]);
    expect(report.hints.some((h) => h.line === 9)).toBe(true);
  });

  it('returns the source unchanged when there is nothing to do', () => {
    const clean = "export const a = 'bg-card text-foreground';\n";
    expect(migrateSource(clean, 'a.ts')).toEqual({ output: clean, report: { changes: [], manual: [], hex: [], hints: [] } });
  });
});
