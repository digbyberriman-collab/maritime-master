/**
 * Abyss token structure (BUILD-PLAN A1, A3, A4): every legacy variable is
 * remapped in both themes, anchors match DECISIONS §1, Tailwind exposes the
 * scales and new tokens, and density / motion / focus tokens exist.
 */
import { describe, expect, it } from 'vitest';
import tailwindConfig from '../../../tailwind.config';
import {
  contrast,
  declsFor,
  hexToRgb,
  loadTokens,
  readRepoFile,
  rgbToHex,
  tokenRgb,
} from './cssTokens';

const css = readRepoFile('src/index.css');
const tokens = loadTokens(css);

/** Every variable name that existed before Abyss; existing classes depend on them. */
const LEGACY_VARS = [
  'background', 'foreground', 'card', 'card-foreground', 'popover', 'popover-foreground',
  'primary', 'primary-foreground', 'secondary', 'secondary-foreground', 'muted', 'muted-foreground',
  'accent', 'accent-foreground', 'destructive', 'destructive-foreground', 'border', 'input', 'ring',
  ...['success', 'warning', 'info', 'critical', 'orange', 'purple', 'cyan', 'amber', 'pink', 'indigo', 'teal'].flatMap(
    (s) => [s, `${s}-foreground`, `${s}-muted`],
  ),
  'sidebar-background', 'sidebar-foreground', 'sidebar-primary', 'sidebar-primary-foreground',
  'sidebar-accent', 'sidebar-accent-foreground', 'sidebar-border', 'sidebar-ring',
  'chart-1', 'chart-2', 'chart-3', 'chart-4', 'chart-5', 'chart-6',
  'gradient-primary', 'gradient-card',
];

const NEW_SEMANTIC_VARS = [
  'overlay', 'overlay-opacity', 'field', 'surface-sunken', 'signal-muted', 'topbar', 'weekend', 'today', 'map-water', 'focus',
  'shadow-e1', 'shadow-e2', 'shadow-e3', 'shadow-glow-signal', 'scrollbar-thumb', 'scrollbar-thumb-hover',
];

describe('theme blocks', () => {
  it('holds the dark set on :root and .dark, and Daylight on .light', () => {
    expect(Object.keys(tokens.dark).length).toBeGreaterThan(60);
    expect(Object.keys(tokens.light).length).toBeGreaterThan(60);
    expect(tokens.dark['color-scheme']).toBe('dark');
    expect(tokens.light['color-scheme']).toBe('light');
  });

  it.each(LEGACY_VARS)('remaps legacy --%s in both themes', (name) => {
    expect(tokens.dark[`--${name}`], `dark --${name}`).toBeDefined();
    expect(tokens.light[`--${name}`], `light --${name}`).toBeDefined();
  });

  it.each(NEW_SEMANTIC_VARS)('defines new --%s in both themes', (name) => {
    expect(tokens.dark[`--${name}`], `dark --${name}`).toBeDefined();
    expect(tokens.light[`--${name}`], `light --${name}`).toBeDefined();
  });

  it('declares the same variables in both themes', () => {
    const vars = (t: Record<string, string>) => Object.keys(t).filter((k) => k.startsWith('--')).sort();
    expect(vars(tokens.light)).toEqual(vars(tokens.dark));
  });

  it('keeps the sidebar Abyss in Daylight (D-DS1)', () => {
    for (const k of Object.keys(tokens.dark).filter((key) => key.startsWith('--sidebar-'))) {
      expect(tokens.light[k], k).toBe(tokens.dark[k]);
    }
  });
});

describe('anchors (DECISIONS §1 replaces gap/10 A.1)', () => {
  it.each([
    ['abyss-900', '#0A0E14'],
    ['deep-900', '#111722'],
    ['slate-800', '#1C2533'],
    ['drift-400', '#8A94A6'],
    ['signal-500', '#00AFE6'],
    ['signal-700', '#00648F'],
  ])('--%s is %s', (name, hex) => {
    expect(rgbToHex(tokenRgb(tokens, tokens.raw, name))).toBe(hex);
  });

  it.each([
    ['background', 'abyss-900'],
    ['card', 'deep-900'],
    ['secondary', 'slate-800'],
    ['border', 'slate-800'],
    ['muted-foreground', 'drift-400'],
    ['foreground', 'drift-50'],
    ['primary', 'signal-500'],
    ['ring', 'signal-500'],
    ['signal-muted', 'signal-900'],
    ['sidebar-background', 'abyss-950'],
  ])('dark --%s uses the %s step', (semantic, step) => {
    expect(tokenRgb(tokens, tokens.dark, semantic)).toEqual(tokenRgb(tokens, tokens.raw, step));
  });

  it('Daylight primary is Signal-700 and ring Signal-600', () => {
    expect(tokenRgb(tokens, tokens.light, 'primary')).toEqual(tokenRgb(tokens, tokens.raw, 'signal-700'));
    expect(tokenRgb(tokens, tokens.light, 'ring')).toEqual(tokenRgb(tokens, tokens.raw, 'signal-600'));
  });

  it('popovers sit one step lighter than cards', () => {
    expect(tokenRgb(tokens, tokens.dark, 'popover')).toEqual(tokenRgb(tokens, tokens.raw, 'deep-800'));
  });

  it('raw scales get lighter as the step number falls', () => {
    const families: Record<string, number[]> = {
      abyss: [950, 900, 800],
      deep: [900, 850, 800, 700],
      slate: [900, 800, 700, 600, 500, 400],
      drift: [600, 500, 400, 300, 200, 100, 50],
      signal: [900, 800, 700, 600, 500],
    };
    const black = hexToRgb('#000000');
    for (const [family, steps] of Object.entries(families)) {
      const lum = steps.map((s) => contrast(tokenRgb(tokens, tokens.raw, `${family}-${s}`), black));
      expect([...lum].sort((a, b) => a - b), family).toEqual(lum);
    }
  });
});

describe('radius, elevation, focus, motion and density (A4)', () => {
  it('sets the 10 px radius', () => {
    expect(tokens.raw['--radius']).toBe('0.625rem');
  });

  it('has a glow only on dark', () => {
    expect(tokens.dark['--shadow-glow-signal']).toMatch(/16px/);
    expect(tokens.light['--shadow-glow-signal']).not.toMatch(/16px/);
  });

  it('defines the motion and focus tokens', () => {
    for (const k of ['--motion-quick', '--motion-menu', '--motion-panel', '--motion-indicator', '--motion-ping', '--ease-tide', '--ease-tide-out']) {
      expect(tokens.raw[k], k).toBeDefined();
    }
    expect(tokens.raw['--focus-ring-width']).toBe('2px');
    expect(tokens.raw['--focus-ring-offset']).toBe('2px');
  });

  it('collapses motion under prefers-reduced-motion', () => {
    const reduced = tokens.rules.find(
      (r) => r.atRules.includes('@media (prefers-reduced-motion: reduce)') && r.selector.startsWith('*'),
    );
    expect(reduced?.decls['transition-duration']).toBe('1ms !important');
    expect(reduced?.decls['animation-iteration-count']).toBe('1 !important');
  });

  it('switches row heights with data-density', () => {
    const def = tokens.raw;
    const comfortable = declsFor(tokens.rules, '[data-density="comfortable"]');
    const compact = declsFor(tokens.rules, '[data-density="compact"]');
    expect(def['--row-h']).toBe('40px');
    expect(comfortable['--row-h']).toBe('44px');
    expect(compact['--row-h']).toBe('32px');
    for (const set of [def, comfortable, compact]) {
      const row = parseInt(set['--row-h'], 10);
      const py = parseInt(set['--cell-py'], 10);
      // 20 px line box + vertical padding ≈ row height (the 1 px border is extra).
      expect(20 + 2 * py).toBe(row);
    }
  });

  it('keeps 44 px controls on touch even in compact density', () => {
    const coarse = declsFor(tokens.rules, '[data-density="compact"]', ['@layer base', '@media (pointer: coarse)']);
    expect(coarse['--control-h']).toBe('44px');
  });

  it('the table primitive reads the density tokens', () => {
    const table = readRepoFile('src/components/ui/table.tsx');
    expect(table).toContain('h-[var(--row-h)]');
    expect(table).toContain('py-[var(--cell-py)]');
  });

  it('keeps the .storm-compact rules, switched off in comfortable density', () => {
    const compactRules = tokens.rules.filter((r) => r.selector.includes('.storm-compact'));
    expect(compactRules.length).toBeGreaterThan(10);
    for (const r of compactRules) expect(r.selector).toContain(':root:not([data-density="comfortable"])');
  });

  it('provides the focus-ring utilities and the type scale', () => {
    for (const cls of ['.focus-ring:focus-visible', '.focus-ring-inset:focus-visible']) {
      expect(tokens.rules.some((r) => r.selector === cls), cls).toBe(true);
    }
    for (const cls of ['display-lg', 'display', 'title', 'subtitle', 'body', 'body-sm', 'caption', 'eyebrow', 'kpi', 'mono']) {
      expect(tokens.rules.some((r) => r.selector === `.type-${cls}`), `.type-${cls}`).toBe(true);
    }
    const kpi = tokens.rules.find((r) => r.selector === '.type-kpi');
    expect(kpi?.decls['font-variant-numeric']).toBe('tabular-nums');
    const table = tokens.rules.find((r) => r.selector === 'table');
    expect(table?.decls['font-variant-numeric']).toBe('tabular-nums');
  });
});

describe('tailwind exposure', () => {
  const extend = tailwindConfig.theme.extend as unknown as Record<string, unknown>;
  const colors = extend.colors as Record<string, string | Record<string, string>>;

  it('keeps class-based dark mode so existing dark: variants keep working', () => {
    expect(tailwindConfig.darkMode).toEqual(['class']);
  });

  it.each([
    ['abyss', ['950', '900', '800']],
    ['deep', ['900', '850', '800', '700']],
    ['slate-ui', ['900', '800', '700', '600', '500', '400']],
    ['drift', ['600', '500', '400', '300', '200', '100', '50']],
    ['signal', ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950']],
  ])('exposes the %s scale', (family, steps) => {
    const scale = colors[family] as Record<string, string>;
    expect(scale, family).toBeDefined();
    for (const step of steps) expect(scale[step], `${family}-${step}`).toMatch(/^hsl\(var\(--[a-z]+-\d+\) \/ <alpha-value>\)$/);
  });

  it('exposes the new semantic colours', () => {
    for (const key of ['overlay', 'scrim', 'field', 'topbar', 'focus', 'weekend', 'today', 'map-water']) expect(colors[key], key).toBeDefined();
    expect(colors.scrim).toBe('hsl(var(--overlay) / var(--overlay-opacity))');
    expect(colors.field).toBe('hsl(var(--field))');
    expect((colors.surface as Record<string, string>).sunken).toBe('hsl(var(--surface-sunken))');
    expect((colors.signal as Record<string, string>).muted).toBe('hsl(var(--signal-muted))');
  });

  it('every var() the config references is defined in index.css', () => {
    const serialised = JSON.stringify({ colors: extend.colors, boxShadow: extend.boxShadow, transitionDuration: extend.transitionDuration, transitionTimingFunction: extend.transitionTimingFunction, borderRadius: extend.borderRadius, animation: extend.animation });
    const refs = [...serialised.matchAll(/var\((--[\w-]+)\)/g)].map((m) => m[1]);
    expect(refs.length).toBeGreaterThan(50);
    for (const ref of new Set(refs)) {
      expect(tokens.dark[ref] ?? tokens.raw[ref], ref).toBeDefined();
    }
  });

  it('has the font families (D-DS3)', () => {
    const fonts = extend.fontFamily as Record<string, string[]>;
    expect(fonts.sans[0]).toBe('Inter');
    expect(fonts.display[0]).toBe('"Barlow Semi Condensed"');
    expect(fonts.mono[0]).toBe('"JetBrains Mono"');
  });

  it('has the elevation, glow and motion keys', () => {
    const shadow = extend.boxShadow as Record<string, string>;
    expect(shadow.e1).toBe('var(--shadow-e1)');
    expect(shadow.e2).toBe('var(--shadow-e2)');
    expect(shadow.e3).toBe('var(--shadow-e3)');
    expect(shadow['glow-signal']).toBe('var(--shadow-glow-signal)');
    // Legacy shadow names keep working, now on the elevation tokens.
    expect(shadow.card).toBe('var(--shadow-e1)');
    // Tailwind's own scale too, so primitives keep names tailwind-merge resolves (A5).
    expect([shadow.sm, shadow.DEFAULT, shadow.md, shadow.lg, shadow.xl, shadow['2xl']]).toEqual([
      'var(--shadow-e1)', 'var(--shadow-e1)', 'var(--shadow-e2)', 'var(--shadow-e2)', 'var(--shadow-e3)', 'var(--shadow-e3)',
    ]);
    const durations = extend.transitionDuration as Record<string, string>;
    expect(Object.keys(durations)).toEqual(['quick', 'menu', 'panel', 'indicator']);
    expect((extend.transitionTimingFunction as Record<string, string>).tide).toBe('var(--ease-tide)');
  });

  it('does not add text-* font sizes that tailwind-merge would treat as colours', () => {
    const fontSize = extend.fontSize as Record<string, unknown> | undefined;
    for (const key of ['display', 'display-lg', 'title', 'body', 'caption', 'kpi', 'eyebrow']) {
      expect(fontSize?.[key], key).toBeUndefined();
    }
  });
});

describe('token harness self-check', () => {
  it('detects a failing pair when a token regresses', () => {
    const broken = loadTokens(css.replace('--primary-foreground: 216 33.3% 5.9%;', '--primary-foreground: 0 0% 100%;'));
    const r = contrast(tokenRgb(broken, broken.dark, 'primary-foreground'), tokenRgb(broken, broken.dark, 'primary'));
    expect(r).toBeLessThan(4.5);
  });
});
