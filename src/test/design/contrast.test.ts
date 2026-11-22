/**
 * WCAG AA contrast for the Abyss token pairs, measured on the values actually
 * shipped in src/index.css (A1; gap/10 A.2; DECISIONS §1).
 * Text pairs need 4.5:1; UI boundaries (input borders, focus ring, chart
 * marks) need 3:1 (WCAG 1.4.11).
 */
import { describe, expect, it } from 'vitest';
import { contrast, hexToRgb, loadTokens, relativeLuminance, resolveVar, tokenRgb, type ThemeTokens } from './cssTokens';

const tokens = loadTokens();

const STATUS_FAMILIES = [
  'success',
  'warning',
  'info',
  'critical',
  'orange',
  'purple',
  'cyan',
  'amber',
  'pink',
  'indigo',
  'teal',
] as const;

type Pair = { fg: string; bg: string; min: number };

const TEXT = 4.5;
const UI = 3;

function pairsFor(): Pair[] {
  const pairs: Pair[] = [];
  const add = (fg: string, bg: string, min: number) => pairs.push({ fg, bg, min });

  // Core text.
  for (const bg of ['background', 'card', 'popover', 'muted', 'accent', 'secondary', 'signal-muted', 'surface-sunken', 'topbar']) {
    add('foreground', bg, TEXT);
  }
  add('card-foreground', 'card', TEXT);
  // Also the Recharts default tooltip: index.css maps its background to popover and its label and item text to popover-foreground.
  add('popover-foreground', 'popover', TEXT);
  add('secondary-foreground', 'secondary', TEXT);
  add('accent-foreground', 'accent', TEXT);
  // Includes Recharts default axis tick text on card and popover (index.css maps #666 to muted-foreground).
  for (const bg of ['background', 'card', 'popover', 'muted', 'accent']) add('muted-foreground', bg, TEXT);

  // Primary (fill and link text).
  add('primary-foreground', 'primary', TEXT);
  for (const bg of ['background', 'card', 'popover', 'signal-muted']) add('primary', bg, TEXT);

  // Destructive.
  add('destructive-foreground', 'destructive', TEXT);
  add('destructive', 'card', TEXT);
  add('destructive', 'background', TEXT);

  // Highlighted menu / select / command option (A5): the signal-muted fill is
  // too close to the popover to be the cue on its own, so the 2px primary bar
  // carries it (a 3:1 graphic against the popover around it, WCAG 1.4.11).
  // Item text, destructive items included, stays readable on the fill.
  add('primary', 'popover', UI);
  add('destructive', 'signal-muted', TEXT);

  // Status and decorative families: label on solid fill, text on surfaces, text on own tint.
  for (const s of STATUS_FAMILIES) {
    add(`${s}-foreground`, s, TEXT);
    add(s, 'card', TEXT);
    add(s, 'background', TEXT);
    add(s, 'popover', TEXT);
    add(s, `${s}-muted`, TEXT);
  }

  // Sidebar (anchored Abyss chrome in both themes).
  add('sidebar-foreground', 'sidebar-background', TEXT);
  add('sidebar-foreground', 'sidebar-accent', TEXT);
  // Section headings, "Planned" chips and the roadmap "Off" label (Drift-500).
  add('sidebar-muted-foreground', 'sidebar-background', TEXT);
  add('sidebar-muted-foreground', 'sidebar-accent', TEXT);
  add('sidebar-accent-foreground', 'sidebar-accent', TEXT);
  add('sidebar-primary', 'sidebar-background', TEXT);
  add('sidebar-primary-foreground', 'sidebar-primary', TEXT);
  add('sidebar-ring', 'sidebar-background', UI);

  // Form fields (A5): typed text and placeholders on the field fill.
  add('foreground', 'field', TEXT);
  add('muted-foreground', 'field', TEXT);

  // Non-text UI.
  for (const bg of ['card', 'background', 'popover', 'muted', 'field']) add('input', bg, UI);
  for (const bg of ['background', 'card', 'popover']) add('ring', bg, UI);
  for (const bg of ['background', 'card']) add('focus', bg, UI);
  // Chart palette (A9, DS18): every series mark is a 3:1 graphic on the surfaces charts sit on
  // (cards, the page, and the popover that holds the tooltip swatch).
  for (let i = 1; i <= 6; i += 1) {
    for (const bg of ['card', 'background', 'popover']) add(`chart-${i}`, bg, UI);
  }

  // Map marks (A9, DS17, A.11) on the sea colour shown while tiles load, and the
  // marker against its own ring so the halo reads.
  for (const mark of ['map-vessel', 'map-track', 'map-route', 'map-stale', 'chart-2', 'chart-3', 'chart-4', 'success', 'warning', 'info']) {
    add(mark, 'map-water', UI);
  }
  for (const mark of ['map-vessel', 'chart-2', 'chart-3', 'chart-4']) add(mark, 'map-marker-ring', UI);
  add('map-cluster-foreground', 'map-cluster', TEXT);

  return pairs;
}

const ratio = (t: ThemeTokens, theme: Record<string, string>, fg: string, bg: string) =>
  contrast(tokenRgb(t, theme, fg), tokenRgb(t, theme, bg));

/**
 * Print as the browser resolves it: <html> carries `.dark` by default, so a
 * token the print block leaves out keeps its Abyss value on paper.
 */
const printTheme = { ...tokens.dark, ...tokens.print };

describe.each([
  ['Abyss (dark, default)', tokens.dark],
  ['Daylight (light)', tokens.light],
  ['Print (from the default dark page)', printTheme],
])('%s token pairs meet WCAG AA', (_name, theme) => {
  it.each(pairsFor().map((p) => [`${p.fg} on ${p.bg}`, p] as const))('%s', (_label, p) => {
    const r = ratio(tokens, theme, p.fg, p.bg);
    expect(r, `${p.fg} on ${p.bg} is ${r.toFixed(2)}:1, needs ${p.min}:1`).toBeGreaterThanOrEqual(p.min);
  });
});

describe('Signal fills carry Abyss text, never white (DECISIONS §1)', () => {
  it('dark primary-foreground is Abyss-900, and white on Signal would fail', () => {
    expect(tokenRgb(tokens, tokens.dark, 'primary-foreground')).toEqual(tokenRgb(tokens, tokens.raw, 'abyss-900'));
    const white = hexToRgb('#FFFFFF');
    expect(contrast(white, tokenRgb(tokens, tokens.dark, 'primary'))).toBeLessThan(TEXT);
  });

  it('every dark solid fill carries the Abyss foreground', () => {
    for (const s of ['primary', 'destructive', ...STATUS_FAMILIES]) {
      expect(tokenRgb(tokens, tokens.dark, `${s}-foreground`), `${s}-foreground`).toEqual(
        tokenRgb(tokens, tokens.raw, 'abyss-900'),
      );
    }
  });

  it('Daylight primary (Signal-700) carries white text', () => {
    expect(tokenRgb(tokens, tokens.light, 'primary-foreground')).toEqual([255, 255, 255]);
    expect(ratio(tokens, tokens.light, 'primary-foreground', 'primary')).toBeGreaterThanOrEqual(TEXT);
  });
});

describe('dialog backdrop (A5)', () => {
  it('dims more on dark than on Daylight', () => {
    expect(Number(tokens.dark['--overlay-opacity'])).toBeCloseTo(0.7);
    expect(Number(tokens.light['--overlay-opacity'])).toBeCloseTo(0.4);
  });

  it('Daylight fields are white', () => {
    expect(tokenRgb(tokens, tokens.light, 'field')).toEqual([255, 255, 255]);
  });
});

describe('raw text steps', () => {
  it('Drift-500 (tertiary text, placeholders) passes 4.5:1 on Deep cards and muted wells', () => {
    for (const bg of ['card', 'muted']) {
      const r = contrast(tokenRgb(tokens, tokens.raw, 'drift-500'), tokenRgb(tokens, tokens.dark, bg));
      expect(r, `drift-500 on ${bg} = ${r.toFixed(2)}`).toBeGreaterThanOrEqual(TEXT);
    }
  });

  it('Drift-400 matches the anchor ratios (6.3:1 on Abyss, 5.9:1 on Deep)', () => {
    const drift = tokenRgb(tokens, tokens.raw, 'drift-400');
    expect(contrast(drift, tokenRgb(tokens, tokens.raw, 'abyss-900'))).toBeCloseTo(6.3, 1);
    expect(contrast(drift, tokenRgb(tokens, tokens.raw, 'deep-900'))).toBeCloseTo(5.9, 1);
  });
});

describe('print stays light', () => {
  /** The only print values that differ from Daylight: white paper, no elevation. */
  const PRINT_ONLY = ['--background', '--shadow-e1', '--shadow-e2', '--shadow-e3', '--shadow-glow-signal'];

  it('declares every token Daylight declares, so nothing prints with its Abyss value', () => {
    const missing = Object.keys(tokens.light).filter((key) => !(key in tokens.print));
    expect(missing).toEqual([]);
  });

  it('uses the Daylight value for every token except white paper and no elevation', () => {
    const drift = Object.keys(tokens.light)
      .filter((key) => !PRINT_ONLY.includes(key) && tokens.print[key] !== tokens.light[key])
      .map((key) => `${key}: print "${tokens.print[key]}" vs Daylight "${tokens.light[key]}"`);
    expect(drift).toEqual([]);
    expect(tokens.print['--background']).toBe('0 0% 100%');
    for (const key of PRINT_ONLY.slice(1)) expect(tokens.print[key], key).toBe('none');
  });

  it('resolves no token to its Abyss value unless Daylight shares it (the sidebar)', () => {
    const leaks = Object.keys(tokens.dark)
      .filter((key) => key.startsWith('--') && tokens.dark[key] !== tokens.light[key])
      .filter((key) => printTheme[key] === tokens.dark[key]);
    expect(leaks).toEqual([]);
  });

  it('prints dark ink on white paper', () => {
    expect(tokenRgb(tokens, printTheme, 'background')).toEqual([255, 255, 255]);
    expect(relativeLuminance(tokenRgb(tokens, printTheme, 'foreground'))).toBeLessThan(0.02);
  });

  it.each([
    ['foreground', 'card'],
    ['muted-foreground', 'card'],
    ['primary', 'card'],
    ['critical', 'critical-muted'],
    ['success', 'success-muted'],
  ])('%s on %s passes in print', (fg, bg) => {
    expect(ratio(tokens, printTheme, fg, bg)).toBeGreaterThanOrEqual(TEXT);
  });
});

describe('chart palette (DS18) is categorical in both themes', () => {
  it.each([
    ['Abyss', tokens.dark],
    ['Daylight', tokens.light],
  ])('%s: six distinct series colours, the sixth a low-chroma "Other"', (_name, theme) => {
    const hexes = [1, 2, 3, 4, 5, 6].map((i) => resolveVar(tokens, theme, `chart-${i}`));
    expect(new Set(hexes).size).toBe(6);
    const saturation = (triplet: string) => Number(/\s([\d.]+)%/.exec(triplet)?.[1]);
    expect(saturation(hexes[5])).toBeLessThan(20);
    for (const triplet of hexes.slice(0, 5)) expect(saturation(triplet)).toBeGreaterThan(50);
  });

  it('series stay in the same hue order across themes, so a colour keeps its meaning', () => {
    const hue = (triplet: string) => Number(triplet.split(/\s+/)[0]);
    for (let i = 1; i <= 6; i += 1) {
      const dark = hue(resolveVar(tokens, tokens.dark, `chart-${i}`));
      const light = hue(resolveVar(tokens, tokens.light, `chart-${i}`));
      expect(Math.abs(dark - light), `chart-${i}`).toBeLessThanOrEqual(5);
    }
  });
});
