/**
 * The temporary legacy dark compatibility layer (gap/10 §C.1, §C.3) is
 * generated, narrowly scoped and in step with its generator.
 */
import { describe, expect, it } from 'vitest';
import colors from 'tailwindcss/colors';
import {
  BLOCK_END,
  BLOCK_START,
  DEEP_CARD_HEX,
  HUE_TOKEN,
  REPURPOSED_TOKENS,
  TAILWIND_PALETTE,
  TOKEN_FILLS,
  buildLegacyDarkCompatCss,
  buildLegacyDarkCompatRules,
  contrastRatio,
  extractLegacyDarkCompatBlock,
  remappedTextShades,
} from '../../../scripts/design/legacy-dark-compat.mjs';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { loadTokens, parseCss, readRepoFile } from './cssTokens';

/** Every .ts/.tsx file under a repo-relative directory, as repo-relative paths. */
function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(join(process.cwd(), dir))) {
    const rel = `${dir}/${name}`;
    if (statSync(join(process.cwd(), rel)).isDirectory()) sourceFiles(rel, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(rel);
  }
  return out;
}

const css = readRepoFile('src/index.css');

describe('legacy dark compatibility layer', () => {
  it('is present in index.css and matches the generator output (run --write to refresh)', () => {
    const block = extractLegacyDarkCompatBlock(css);
    expect(block, 'markers missing from src/index.css').not.toBeNull();
    expect(block).toBe(buildLegacyDarkCompatCss());
  });

  it('is the last thing in index.css, after the utilities, so it beats bare classes', () => {
    expect(css.trimEnd().endsWith(BLOCK_END)).toBe(true);
    expect(css.indexOf(BLOCK_START)).toBeGreaterThan(css.indexOf('@tailwind utilities;'));
  });

  it('scopes every rule to .dark with the specificity of the class it replaces', () => {
    const block = extractLegacyDarkCompatBlock(css) ?? '';
    const rules = parseCss(block);
    expect(rules.length).toBeGreaterThan(80);
    const bothThemes = rules.filter((r) => !r.selector.startsWith(':where(.dark) :is('));
    // Every rule is dark-only: Daylight renders the legacy classes as authored.
    expect(bothThemes.map((r) => r.selector)).toEqual([]);
    for (const r of rules) expect(r.atRules).toEqual([]);
  });

  it('no module uses the re-purposed secondary/accent tokens as a text or border colour', () => {
    // `secondary` and `accent` are neutral surfaces under Abyss, invisible as
    // text or borders. The call sites moved to primary; keep new ones out.
    expect(REPURPOSED_TOKENS).toEqual(['secondary', 'accent']);
    const pattern = new RegExp(`(?<![\\w-])(?:[\\w-]+:)*(?:text|border)-(?:${REPURPOSED_TOKENS.join('|')})(?![\\w-])`);
    const offenders = sourceFiles('src')
      .filter((file) => !file.includes('/test/') && !file.endsWith('.d.ts'))
      .filter((file) => pattern.test(readRepoFile(file)));
    expect(offenders).toEqual([]);
  });

  it('gives token fills paired with text-white their Abyss foreground on dark', () => {
    const rules = buildLegacyDarkCompatRules();
    for (const fill of TOKEN_FILLS) {
      const rule = rules.find((r) => r.selectors.includes(`.bg-${fill}.text-white`));
      expect(rule?.scope, fill).toBe('dark');
      expect(rule?.declaration).toBe(`color: hsl(var(--${fill}-foreground));`);
    }
  });

  it('never mixes selectors of different specificity in one :is() list', () => {
    for (const rule of buildLegacyDarkCompatRules()) {
      const kind = (s: string) =>
        s.includes(':hover') ? 'hover' : s.includes('>') ? 'divide' : /^\.[^.]+\.[^.]+$/.test(s) ? 'compound' : 'plain';
      const kinds = new Set(rule.selectors.map(kind));
      expect(kinds.size, rule.selectors.join(', ')).toBe(1);
    }
  });

  it('only references tokens that exist', () => {
    const tokens = loadTokens(css);
    const block = extractLegacyDarkCompatBlock(css) ?? '';
    for (const [, name] of block.matchAll(/var\((--[\w-]+)\)/g)) {
      expect(tokens.dark[name], name).toBeDefined();
      expect(tokens.light[name], name).toBeDefined();
    }
  });

  it('leaves white text, black overlays, vivid fills and translucent tints alone', () => {
    const selectors = buildLegacyDarkCompatRules().flatMap((r) => r.selectors);
    for (const untouched of ['.text-white', '.bg-black\\/80', '.bg-green-500', '.bg-green-500\\/10', '.bg-white\\/10', '.text-green-500']) {
      expect(selectors, untouched).not.toContain(untouched);
    }
  });

  it('keeps real white on replaced elements (QR codes, drawing canvases)', () => {
    const block = extractLegacyDarkCompatBlock(css) ?? '';
    expect(block).toContain(':where(.dark) :is(.bg-white):where(:not(img, canvas, svg, video, picture, iframe))');
  });

  it('remaps the light status pairs the legacy code uses most', () => {
    const selectors = buildLegacyDarkCompatRules().flatMap((r) => r.selectors);
    for (const cls of ['bg-white', 'bg-gray-100', 'text-gray-900', 'text-gray-500', 'border-gray-200', 'bg-green-100', 'text-green-800', 'bg-red-100', 'text-red-700', 'bg-yellow-100', 'text-yellow-800', 'bg-blue-100', 'text-blue-700', 'text-slate-700', 'bg-slate-100']) {
      expect(selectors.some((s) => s === `.${cls}` || s.startsWith(`.${cls}:`)), cls).toBe(true);
    }
  });

  it('remaps every text shade that fails AA on the Deep card', () => {
    for (const hue of Object.keys(HUE_TOKEN)) {
      const remapped = remappedTextShades(hue);
      for (const [shade, hex] of Object.entries(TAILWIND_PALETTE[hue])) {
        const s = Number(shade);
        if (s < 300) continue;
        if (contrastRatio(hex, DEEP_CARD_HEX) < 4.5) expect(remapped, `${hue}-${shade}`).toContain(s);
      }
    }
  });

  it("uses Tailwind's real default palette", () => {
    const palette = colors as unknown as Record<string, Record<string, string>>;
    for (const [hue, shades] of Object.entries(TAILWIND_PALETTE)) {
      for (const [shade, hex] of Object.entries(shades)) expect(hex, `${hue}-${shade}`).toBe(palette[hue][shade]);
    }
  });
});
