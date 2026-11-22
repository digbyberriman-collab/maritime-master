/**
 * Installable app (gap/10 IA26, BUILD-PLAN S6): the web manifest, its icon
 * files at their stated sizes, index.html's links to them, the STORM mark
 * kept in step across the SVGs, the boot screen and the TSX component, and
 * no service worker (D-60).
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT, readRepoFile } from '../design/cssTokens';
import { STORM_MARK_ARMS, STORM_MARK_EYE } from '@/modules/auth/components/brand/stormMark';

interface ManifestIcon {
  src: string;
  sizes: string;
  type: string;
  purpose?: string;
}

const manifest = JSON.parse(readRepoFile('public/manifest.webmanifest')) as Record<string, unknown> & { icons: ManifestIcon[] };
const html = readRepoFile('index.html');

const publicPath = (src: string) => join(ROOT, 'public', src.replace(/^\//, ''));

/** Width and height from a PNG's IHDR chunk. */
function pngSize(file: string): { width: number; height: number } | null {
  const buffer = readFileSync(file);
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (buffer.length < 24 || signature.some((byte, i) => buffer[i] !== byte)) return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

/** `<link rel="…" href="…">` hrefs in index.html for a rel. */
const linkHrefs = (rel: string) =>
  [...html.matchAll(/<link\b[^>]*>/g)]
    .map((m) => m[0])
    .filter((tag) => new RegExp(`\\brel="${rel}"`).test(tag))
    .map((tag) => /\bhref="([^"]+)"/.exec(tag)?.[1] ?? '');

const metaContent = (attr: 'name' | 'property', key: string) =>
  [...html.matchAll(/<meta\b[^>]*>/g)]
    .map((m) => m[0])
    .filter((tag) => tag.includes(`${attr}="${key}"`))
    .map((tag) => /\bcontent="([^"]*)"/.exec(tag)?.[1] ?? '');

describe('public/manifest.webmanifest', () => {
  it('names STORM and opens standalone at the root on Abyss', () => {
    expect(manifest.name).toBe('STORM — Maritime Master');
    expect(manifest.short_name).toBe('STORM');
    expect(manifest.start_url).toBe('/');
    expect(manifest.scope).toBe('/');
    expect(manifest.display).toBe('standalone');
    expect(manifest.background_color).toBe('#0A0E14');
    expect(manifest.theme_color).toBe('#0A0E14');
  });

  it('lists 192 and 512 PNGs, a 512 maskable PNG and an SVG', () => {
    const find = (sizes: string, purpose: string, type: string) =>
      manifest.icons.find((icon) => icon.sizes === sizes && (icon.purpose ?? 'any').split(' ').includes(purpose) && icon.type === type);
    expect(find('192x192', 'any', 'image/png')).toBeDefined();
    expect(find('512x512', 'any', 'image/png')).toBeDefined();
    expect(find('512x512', 'maskable', 'image/png')).toBeDefined();
    expect(find('any', 'any', 'image/svg+xml')).toBeDefined();
  });

  it.each(
    JSON.parse(readRepoFile('public/manifest.webmanifest')).icons.map((icon: ManifestIcon) => [icon.src, icon] as const),
  )('icon %s exists at its stated size', (src, icon) => {
    const file = publicPath(src);
    expect(existsSync(file), `${src} is missing; run node scripts/design/make-icons.mjs`).toBe(true);
    if (icon.type === 'image/png') {
      const [width, height] = icon.sizes.split('x').map(Number);
      expect(pngSize(file)).toEqual({ width, height });
    } else {
      expect(readFileSync(file, 'utf8')).toMatch(/^<svg\b/);
    }
  });
});

describe('index.html links the app icons', () => {
  it('links the manifest, an SVG and an ICO favicon, and the apple-touch-icon', () => {
    expect(linkHrefs('manifest')).toEqual(['/manifest.webmanifest']);
    const icons = linkHrefs('icon');
    expect(icons).toContain('/icons/favicon.svg');
    expect(icons).toContain('/favicon.ico');
    for (const href of icons) expect(existsSync(publicPath(href)), href).toBe(true);
    const [apple] = linkHrefs('apple-touch-icon');
    expect(apple).toBe('/icons/apple-touch-icon.png');
    expect(pngSize(publicPath(apple))).toEqual({ width: 180, height: 180 });
  });

  it('ships a STORM favicon.ico with 16, 32 and 48 px images', () => {
    const ico = readFileSync(join(ROOT, 'public', 'favicon.ico'));
    expect(ico.readUInt16LE(0)).toBe(0);
    expect(ico.readUInt16LE(2)).toBe(1);
    const count = ico.readUInt16LE(4);
    const sizes = Array.from({ length: count }, (_, i) => ico.readUInt8(6 + i * 16) || 256);
    expect(sizes).toEqual([16, 32, 48]);
  });

  it('uses a repo asset for the link preview, not an external image', () => {
    for (const key of ['og:image']) {
      const [src] = metaContent('property', key);
      expect(src).toBe('/og-image.png');
    }
    expect(metaContent('name', 'twitter:image')).toEqual(['/og-image.png']);
    expect(pngSize(publicPath('/og-image.png'))).toEqual({ width: 1200, height: 630 });
    expect(html).not.toMatch(/lovable\.dev/);
  });

  it('keeps the pre-paint script ahead of the stylesheet and the app', () => {
    const prepaint = html.indexOf('data-storm-prepaint');
    expect(prepaint).toBeGreaterThan(0);
    expect(prepaint).toBeLessThan(html.indexOf('fonts.googleapis.com/css2'));
    expect(prepaint).toBeLessThan(html.indexOf('/src/main.tsx'));
  });
});

describe('the STORM mark stays one drawing', () => {
  const sources = {
    'public/icons/storm-mark.svg': readRepoFile('public/icons/storm-mark.svg'),
    'public/icons/favicon.svg': readRepoFile('public/icons/favicon.svg'),
    'index.html boot screen': html,
  };

  it.each(Object.entries(sources))('%s draws the stormMark.ts paths', (_, text) => {
    for (const d of STORM_MARK_ARMS) expect(text).toContain(`d="${d}"`);
    expect(text).toContain(`cx="${STORM_MARK_EYE.cx}" cy="${STORM_MARK_EYE.cy}"`);
  });

  it('is Signal on Abyss in the icon sources', () => {
    for (const name of ['storm-mark.svg', 'favicon.svg']) {
      const svg = readRepoFile(`public/icons/${name}`);
      expect(svg).toContain('#0A0E14');
      expect(svg).toContain('#00AFE6');
    }
  });

  it('keeps the maskable glyph inside the safe zone (radius 40 % of the side)', () => {
    const svg = readRepoFile('public/icons/storm-mark.svg');
    const scale = Number(/scale\(([\d.]+)\)/.exec(svg)?.[1] ?? '1');
    // Furthest point of the glyph: an arm tip (33.5, 10.5) plus half the 3.6 stroke, from the centre (24, 24).
    const reach = (Math.hypot(33.5 - 24, 10.5 - 24) + 1.8) * scale;
    expect(reach).toBeLessThanOrEqual(0.4 * 48);
  });
});

describe('no service worker (D-60)', () => {
  it('registers none and ships none', () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) files.push(path);
      }
    };
    walk(join(ROOT, 'src'));
    const registering = files.filter((file) => /serviceWorker\s*\.\s*register\(/.test(readFileSync(file, 'utf8')));
    expect(registering).toEqual([]);
    expect(html).not.toMatch(/serviceWorker/);
    expect(readdirSync(join(ROOT, 'public')).filter((f) => /^(sw|service-worker)\.js$/.test(f))).toEqual([]);
  });
});

describe('icon tooling', () => {
  it('keeps scripts/design/make-icons.mjs with the outputs the manifest lists', () => {
    const script = readRepoFile('scripts/design/make-icons.mjs');
    for (const icon of manifest.icons.filter((i) => i.type === 'image/png')) {
      expect(script).toContain(icon.src.replace(/^\//, ''));
    }
    expect(script).toContain('apple-touch-icon.png');
    expect(script).toContain('favicon.ico');
    expect(script).toContain('og-image.png');
  });
});
