/**
 * The temporary legacy dark compatibility layer (gap/10 §C.1, §C.3) is
 * generated, narrowly scoped and in step with its generator.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import colors from 'tailwindcss/colors';
import postcss, { type AtRule, type Rule } from 'postcss';
import tailwindcss from 'tailwindcss';
import tailwindConfig from '../../../tailwind.config';
import {
  BLOCK_END,
  BLOCK_MEDIA,
  BLOCK_START,
  DEEP_CARD_HEX,
  HUE_TOKEN,
  LIGHT_SUBTREE,
  NEUTRALS,
  REPURPOSED_TOKENS,
  TAILWIND_PALETTE,
  TOKEN_FILLS,
  buildLegacyDarkCompatCss,
  buildLegacyDarkCompatRules,
  contrastRatio,
  escapeClass,
  extractLegacyDarkCompatBlock,
  hoverSel,
  remappedTextShades,
} from '../../../scripts/design/legacy-dark-compat.mjs';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { loadTokens, parseCss, readRepoFile } from './cssTokens';

type Specificity = [number, number, number];
const compareSpecificity = (a: Specificity, b: Specificity) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

/** Index just past the identifier starting at `i` (escapes such as `\:` included). */
function skipIdent(s: string, i: number): number {
  let j = i;
  while (j < s.length && (/[\w-]/.test(s[j]) || s[j] === '\\')) j += s[j] === '\\' ? 2 : 1;
  return j;
}

/** Index of the `)` matching the `(` at `open`. */
function closingParen(s: string, open: number): number {
  let depth = 0;
  for (let j = open; j < s.length; j += 1) {
    if (s[j] === '\\') j += 1;
    else if (s[j] === '(') depth += 1;
    else if (s[j] === ')' && --depth === 0) return j;
  }
  throw new Error(`Unbalanced parentheses in ${s}`);
}

/** Split a selector list on its top-level commas. */
function splitSelectorList(list: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let j = 0; j < list.length; j += 1) {
    if (list[j] === '\\') j += 1;
    else if (list[j] === '(') depth += 1;
    else if (list[j] === ')') depth -= 1;
    else if (list[j] === ',' && depth === 0) {
      parts.push(list.slice(start, j).trim());
      start = j + 1;
    }
  }
  parts.push(list.slice(start).trim());
  return parts.filter(Boolean);
}

/**
 * Selectors Level 4 specificity of one complex selector: `:where()` counts
 * zero, `:is()` / `:not()` / `:has()` count their most specific argument.
 * Enough for the compat layer and Tailwind's output.
 */
function specificity(selector: string): Specificity {
  const total: Specificity = [0, 0, 0];
  const add = ([a, b, c]: Specificity) => {
    total[0] += a;
    total[1] += b;
    total[2] += c;
  };
  let i = 0;
  while (i < selector.length) {
    const ch = selector[i];
    if (ch === '\\') i += 2;
    else if (ch === '#') {
      add([1, 0, 0]);
      i = skipIdent(selector, i + 1);
    } else if (ch === '.') {
      add([0, 1, 0]);
      i = skipIdent(selector, i + 1);
    } else if (ch === '[') {
      add([0, 1, 0]);
      i = selector.indexOf(']', i) + 1;
    } else if (ch === ':' && selector[i + 1] === ':') {
      add([0, 0, 1]);
      i = skipIdent(selector, i + 2);
    } else if (ch === ':') {
      const end = skipIdent(selector, i + 1);
      const name = selector.slice(i + 1, end);
      if (selector[end] === '(') {
        const close = closingParen(selector, end);
        const args = splitSelectorList(selector.slice(end + 1, close));
        if (['is', 'not', 'has'].includes(name)) add(args.map(specificity).sort(compareSpecificity).pop() ?? [0, 0, 0]);
        else if (name !== 'where') add([0, 1, 0]);
        i = close + 1;
      } else {
        add([0, 1, 0]);
        i = end;
      }
    } else if (/[a-zA-Z]/.test(ch)) {
      add([0, 0, 1]);
      i = skipIdent(selector, i);
    } else i += 1;
  }
  return total;
}

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

  it('scopes every rule to .dark on screen, outside .light subtrees', () => {
    const block = extractLegacyDarkCompatBlock(css) ?? '';
    const rules = parseCss(block);
    expect(rules.length).toBeGreaterThan(80);
    const bothThemes = rules.filter((r) => !r.selector.startsWith(':where(.dark) :is('));
    // Every rule is dark-only: Daylight renders the legacy classes as authored.
    expect(bothThemes.map((r) => r.selector)).toEqual([]);
    // Screen only: print and PDF get the print tokens and the classes as authored.
    expect(BLOCK_MEDIA).toBe('@media screen');
    for (const r of rules) expect(r.atRules, r.selector).toEqual([BLOCK_MEDIA]);
    // A `.light` subtree (paper previews, signature pads) is left untouched.
    expect(LIGHT_SUBTREE).toBe('.light, .light *');
    for (const r of rules) expect(r.selector.endsWith(`${LIGHT_SUBTREE}))`), r.selector).toBe(true);
  });

  it('gives each remap the specificity of the class it replaces, and hover remaps (0,3,0)', () => {
    for (const rule of buildLegacyDarkCompatRules()) {
      for (const selector of rule.selectors) {
        const spec = specificity(selector);
        if (selector.includes(':hover')) expect(spec, selector).toEqual([0, 3, 0]);
        else if (selector.includes('>')) expect(spec, selector).toEqual([0, 3, 0]);
        else if (/^\.[^.]+\.[^.]+$/.test(selector)) expect(spec, selector).toEqual([0, 2, 0]);
        else expect(spec, selector).toEqual([0, 1, 0]);
      }
    }
    expect(hoverSel('bg-red-100')).toBe('.hover\\:bg-red-100.hover\\:bg-red-100:hover');
  });

  it('emits no neutral hover remaps (no source uses them; the ratchet keeps new ones out)', () => {
    const selectors = buildLegacyDarkCompatRules().flatMap((r) => r.selectors);
    const neutral = new RegExp(`^\\.hover\\\\:(?:bg|text)-(?:white|${NEUTRALS.join('|')})\\b`);
    expect(selectors.filter((s) => neutral.test(s))).toEqual([]);
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

  it('paper previews opt out with .light (the logbook print view stays white with black rules)', () => {
    const printBook = readRepoFile('src/modules/logbooks/components/PrintBook.tsx');
    expect(printBook).toMatch(/id="logbook-print" className="light\s/);
  });

  it('keeps real white on replaced elements (QR codes, drawing canvases)', () => {
    const block = extractLegacyDarkCompatBlock(css) ?? '';
    expect(block).toContain(':where(.dark) :is(.bg-white):where(:not(img, canvas, svg, video, picture, iframe, .light, .light *))');
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

/**
 * The layer only works if the compiled cascade puts it where the generator
 * assumes. Compile the real index.css through PostCSS + Tailwind with the repo
 * config (as Vite does), over class strings taken from legacy call sites, and
 * check order and specificity in the output.
 */
describe('legacy dark compatibility layer in the compiled stylesheet', () => {
  // Refit approvals / change orders, SecuritySection MFA badges, RedRoomPanel,
  // and the logbook paper preview (PrintBook).
  const CALL_SITES = [
    'bg-red-50 hover:bg-red-100 text-red-700',
    'bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
    'bg-amber-50 text-amber-800 hover:bg-amber-100 dark:hover:bg-amber-950',
    'text-red-600 hover:text-red-700',
    'bg-white p-6 text-black border border-black md:bg-white',
  ];
  const rules: Rule[] = [];

  beforeAll(async () => {
    const html = CALL_SITES.map((classes) => `<div class="${classes}"></div>`).join('\n');
    const result = await postcss([tailwindcss({ ...tailwindConfig, content: [{ raw: html, extension: 'html' }] })]).process(css, {
      from: undefined,
    });
    result.root.walkRules((rule) => {
      rules.push(rule);
    });
  }, 30_000);

  const isCompat = (rule: Rule) => rule.selector.startsWith(':where(.dark) :is(');
  const plainRule = (selector: string) => {
    const index = rules.findIndex((r) => r.selector === selector);
    expect(index, `${selector} in the compiled CSS`).toBeGreaterThanOrEqual(0);
    return { rule: rules[index], index };
  };
  const compatRule = (selector: string) => {
    const index = rules.findIndex((r) => isCompat(r) && splitSelectorList(/^:where\(\.dark\) :is\((.*)\):where\(/.exec(r.selector)?.[1] ?? '').includes(selector));
    expect(index, `compat rule for ${selector}`).toBeGreaterThanOrEqual(0);
    return { rule: rules[index], index };
  };
  const enclosingAtRules = (rule: Rule) => {
    const out: string[] = [];
    for (let node = rule.parent; node && node.type !== 'root'; node = node.parent) {
      if (node.type === 'atrule') out.push(`@${(node as AtRule).name} ${(node as AtRule).params}`);
    }
    return out;
  };

  it.each(['bg-red-100', 'bg-emerald-100', 'bg-amber-100', 'text-red-700'])(
    'the hover:%s remap outranks the plain hover utility Tailwind emits after it',
    (cls) => {
      const plain = plainRule(`.${escapeClass(`hover:${cls}`)}:hover`);
      const compat = compatRule(hoverSel(cls));
      expect(plain.index, 'the plain hover utility is emitted after the layer').toBeGreaterThan(compat.index);
      expect(compareSpecificity(specificity(compat.rule.selector), specificity(plain.rule.selector))).toBeGreaterThan(0);
    },
  );

  it('an author dark:hover: variant ties with the hover remap and wins by order', () => {
    const author = rules.findIndex((r) => r.selector.startsWith(`.${escapeClass('dark:hover:bg-amber-950')}:hover`));
    expect(author).toBeGreaterThanOrEqual(0);
    const compat = compatRule(hoverSel('bg-amber-100'));
    expect(specificity(rules[author].selector)).toEqual(specificity(compat.rule.selector));
    expect(author).toBeGreaterThan(compat.index);
  });

  it.each(['bg-red-50', 'text-red-700', 'bg-white', 'border-black'])(
    'the %s remap ties with the plain utility and wins by order',
    (cls) => {
      const plain = plainRule(`.${escapeClass(cls)}`);
      const compat = compatRule(`.${escapeClass(cls)}`);
      expect(specificity(compat.rule.selector)).toEqual(specificity(plain.rule.selector));
      expect(compat.index).toBeGreaterThan(plain.index);
    },
  );

  it('responsive variants still come after the layer, so they win', () => {
    const responsive = rules.findIndex((r) => r.selector === `.${escapeClass('md:bg-white')}`);
    expect(responsive).toBeGreaterThan(compatRule('.bg-white').index);
  });

  it('every compiled compat rule sits inside @media screen, never under print', () => {
    const compat = rules.filter(isCompat);
    expect(compat.length).toBeGreaterThan(80);
    for (const rule of compat) expect(enclosingAtRules(rule), rule.selector).toEqual(['@media screen']);
  });

  it('a .light subtree is excluded from the compiled remaps', () => {
    document.body.innerHTML = `
      <div class="light"><p id="paper" class="bg-white border-black"></p><span id="pill" class="bg-red-50"></span></div>
      <p id="card" class="bg-white border-black"></p><span id="tint" class="bg-red-50"></span><img id="qr" class="bg-white" alt="" />`;
    document.documentElement.classList.add('dark');
    try {
      const byId = (id: string) => document.getElementById(id) as HTMLElement;
      const bgWhite = compatRule('.bg-white').rule.selector;
      const borderBlack = compatRule('.border-black').rule.selector;
      const tint = compatRule('.bg-red-50').rule.selector;
      expect(byId('card').matches(bgWhite)).toBe(true);
      expect(byId('card').matches(borderBlack)).toBe(true);
      expect(byId('tint').matches(tint)).toBe(true);
      expect(byId('paper').matches(bgWhite)).toBe(false);
      expect(byId('paper').matches(borderBlack)).toBe(false);
      expect(byId('pill').matches(tint)).toBe(false);
      expect(byId('qr').matches(bgWhite)).toBe(false);
    } finally {
      document.documentElement.classList.remove('dark');
      document.body.innerHTML = '';
    }
  });
});
