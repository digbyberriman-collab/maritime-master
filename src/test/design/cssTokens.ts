/**
 * Minimal CSS reader for the design-token tests: parses src/index.css into
 * rules (selector, enclosing at-rules, declarations) and resolves HSL token
 * triplets to sRGB so WCAG contrast can be computed from the real file.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const ROOT = join(__dirname, '..', '..', '..');
export const readRepoFile = (p: string) => readFileSync(join(ROOT, p), 'utf8');

export interface CssRule {
  selector: string;
  atRules: string[];
  decls: Record<string, string>;
}

const normalise = (s: string) => s.replace(/\s+/g, ' ').trim();

function parseDecls(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of body.split(';')) {
    const i = part.indexOf(':');
    if (i === -1) continue;
    const prop = part.slice(0, i).trim();
    const value = normalise(part.slice(i + 1));
    if (prop) out[prop] = value;
  }
  return out;
}

/** Parse a stylesheet into leaf rules. Good enough for index.css (no braces in strings). */
export function parseCss(css: string): CssRule[] {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules: CssRule[] = [];
  const stack: string[] = [];
  let buf = '';
  for (const ch of src) {
    if (ch === '{') {
      stack.push(normalise(buf.split(';').pop() ?? ''));
      buf = '';
    } else if (ch === '}') {
      const prelude = stack.pop() ?? '';
      if (prelude && !prelude.startsWith('@')) {
        rules.push({ selector: prelude, atRules: stack.filter((p) => p.startsWith('@')), decls: parseDecls(buf) });
      }
      buf = '';
    } else {
      buf += ch;
    }
  }
  return rules;
}

/** Merge the declarations of every rule with this exact selector and at-rule context. */
export function declsFor(rules: CssRule[], selector: string, atRules: string[] = ['@layer base']): Record<string, string> {
  const want = normalise(selector);
  return rules
    .filter((r) => r.selector === want && r.atRules.join('|') === atRules.join('|'))
    .reduce<Record<string, string>>((acc, r) => ({ ...acc, ...r.decls }), {});
}

export interface ThemeTokens {
  raw: Record<string, string>;
  dark: Record<string, string>;
  light: Record<string, string>;
  print: Record<string, string>;
  rules: CssRule[];
}

export function loadTokens(css = readRepoFile('src/index.css')): ThemeTokens {
  const rules = parseCss(css);
  return {
    rules,
    raw: declsFor(rules, ':root'),
    dark: declsFor(rules, ':root, .dark'),
    light: declsFor(rules, '.light'),
    print: declsFor(rules, ':root, .dark, .light', ['@media print']),
  };
}

export type Rgb = [number, number, number];

/** Resolve `--name` in a theme (falling back to the raw scales), following var() references. */
export function resolveVar(tokens: ThemeTokens, theme: Record<string, string>, name: string, depth = 0): string {
  const key = name.startsWith('--') ? name : `--${name}`;
  const value = theme[key] ?? tokens.raw[key];
  if (value === undefined) throw new Error(`Token ${key} is not defined`);
  const ref = /^var\((--[\w-]+)\)$/.exec(value);
  if (ref) {
    if (depth > 8) throw new Error(`Token ${key} has a var() cycle`);
    return resolveVar(tokens, theme, ref[1], depth + 1);
  }
  return value;
}

export function hslTripletToRgb(triplet: string): Rgb {
  const m = /^(-?[\d.]+)\s+([\d.]+)%\s+([\d.]+)%$/.exec(triplet.trim());
  if (!m) throw new Error(`Not an HSL triplet: "${triplet}"`);
  const h = ((Number(m[1]) % 360) + 360) % 360;
  const s = Number(m[2]) / 100;
  const l = Number(m[3]) / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r1, g1, b1] =
    hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x] : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x];
  const mm = l - c / 2;
  // Browsers render 8-bit sRGB; contrast is measured on those values.
  return [r1 + mm, g1 + mm, b1 + mm].map((v) => Math.round(v * 255)) as Rgb;
}

export const rgbToHex = ([r, g, b]: Rgb) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase()}`;

export const hexToRgb = (hex: string): Rgb => {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;
};

const channel = (v: number) => {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
export const relativeLuminance = ([r, g, b]: Rgb) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);

export function contrast(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export const tokenRgb = (tokens: ThemeTokens, theme: Record<string, string>, name: string) =>
  hslTripletToRgb(resolveVar(tokens, theme, name));
