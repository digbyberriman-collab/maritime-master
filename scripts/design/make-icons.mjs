#!/usr/bin/env node
/**
 * Render the STORM app icons, favicon and social card (BUILD-PLAN S6, gap/10
 * IA26) from the hand-drawn SVGs in public/icons/.
 *
 *   node scripts/design/make-icons.mjs           render everything into public/
 *   node scripts/design/make-icons.mjs --check   only verify the files exist at their sizes
 *
 * Sources (committed, edited by hand):
 *   public/icons/storm-mark.svg   the mark, Signal on Abyss, full bleed, glyph in the maskable safe zone
 *   public/icons/favicon.svg      the mark on a rounded tile, glyph enlarged for 16 px
 *
 * Outputs (committed by the integrator; re-run after editing a source):
 *   public/icons/icon-192.png            manifest, purpose "any" (rounded tile, transparent corners)
 *   public/icons/icon-512.png            manifest, purpose "any"
 *   public/icons/icon-512-maskable.png   manifest, purpose "maskable" (full bleed)
 *   public/icons/apple-touch-icon.png    180 px, full bleed (iOS rounds it)
 *   public/favicon.ico                   16, 32 and 48 px PNGs in one ICO
 *   public/og-image.png                  1200 × 630 link preview
 *
 * Rendering uses Playwright's Chromium from the global install (as
 * scripts/visual does; not a project dependency, D-16) on `setContent`
 * pages: no dev server, no port, no network.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUBLIC = join(ROOT, 'public');
const ICONS = join(PUBLIC, 'icons');

/** Abyss and Signal anchors (DECISIONS §1). */
const ABYSS = '#0A0E14';
const DRIFT = '#8A94A6';
const FOREGROUND = '#EEF1F5';

/** Corner radius of the "any" tiles, as a share of the side (a squircle-like 22.5 %). */
const ANY_RADIUS = 0.225;

export const PNG_OUTPUTS = Object.freeze([
  { file: 'icons/icon-192.png', size: 192, source: 'storm-mark.svg', rounded: true },
  { file: 'icons/icon-512.png', size: 512, source: 'storm-mark.svg', rounded: true },
  { file: 'icons/icon-512-maskable.png', size: 512, source: 'storm-mark.svg', rounded: false },
  { file: 'icons/apple-touch-icon.png', size: 180, source: 'storm-mark.svg', rounded: false },
]);
export const FAVICON_SIZES = Object.freeze([16, 32, 48]);
export const OG_IMAGE = Object.freeze({ file: 'og-image.png', width: 1200, height: 630 });

/** Width and height from a PNG's IHDR chunk, or null when the bytes are not a PNG. */
export function pngSize(buffer) {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (buffer.length < 24 || signature.some((byte, i) => buffer[i] !== byte)) return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

/** An ICO file holding PNG images (supported by every current browser). */
export function icoFromPngs(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);
  const entries = [];
  let offset = 6 + 16 * images.length;
  for (const { size, data } of images) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2); // palette colours
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += data.length;
  }
  return Buffer.concat([header, ...entries, ...images.map((image) => image.data)]);
}

/** Image count and sizes from an ICO header (for --check). */
export function icoSizes(buffer) {
  if (buffer.length < 6 || buffer.readUInt16LE(0) !== 0 || buffer.readUInt16LE(2) !== 1) return null;
  const count = buffer.readUInt16LE(4);
  return Array.from({ length: count }, (_, i) => buffer.readUInt8(6 + i * 16) || 256);
}

const readSource = (name) => readFileSync(join(ICONS, name), 'utf8');

/** The inner markup of an SVG file, re-wrapped to fill its box. */
const fillBox = (svg) => svg.replace(/<svg\b([^>]*)>/, (_, attrs) => `<svg${attrs.replace(/\s(width|height)="[^"]*"/g, '')} width="100%" height="100%">`);

const page = (body, css = '') => `<!doctype html><html><head><meta charset="utf-8"><style>
  html, body { margin: 0; padding: 0; background: transparent; }
  ${css}
</style></head><body>${body}</body></html>`;

function iconHtml({ svg, size, rounded }) {
  const radius = rounded ? Math.round(size * ANY_RADIUS) : 0;
  return page(
    `<div id="icon">${fillBox(svg)}</div>`,
    `#icon { width: ${size}px; height: ${size}px; border-radius: ${radius}px; overflow: hidden; }
     #icon svg { display: block; }`,
  );
}

function ogHtml(markSvg) {
  const { width, height } = OG_IMAGE;
  const ticks = Array.from({ length: 36 }, (_, i) => {
    const a = (i * 10 * Math.PI) / 180;
    const r1 = i % 3 === 0 ? 184 : 190;
    const p = (r) => [200 + r * Math.sin(a), 200 - r * Math.cos(a)].map((n) => n.toFixed(2));
    const [x1, y1] = p(r1);
    const [x2, y2] = p(196);
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke-width="${i % 3 === 0 ? 1 : 0.6}"/>`;
  }).join('');
  return page(
    `<main id="card">
       <div class="glow"></div>
       <svg class="rings" viewBox="0 0 400 400" fill="none" stroke="#00AFE6">
         <circle cx="200" cy="200" r="196" stroke-width="0.75"/>
         <circle cx="200" cy="200" r="150" stroke-width="0.5"/>
         <circle cx="200" cy="200" r="104" stroke-width="0.5" stroke-dasharray="2 4"/>
         <line x1="200" y1="4" x2="200" y2="396" stroke-width="0.4"/>
         <line x1="4" y1="200" x2="396" y2="200" stroke-width="0.4"/>
         ${ticks}
       </svg>
       <div class="lockup">
         <div class="tile">${fillBox(markSvg)}</div>
         <div class="words">
           <div class="name">STORM</div>
           <div class="product">Maritime Master</div>
         </div>
       </div>
       <p class="tagline">Superyacht fleet and vessel operations</p>
     </main>`,
    `#card { position: relative; overflow: hidden; width: ${width}px; height: ${height}px; background: ${ABYSS};
       display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 36px;
       font-family: Inter, system-ui, sans-serif; }
     .glow { position: absolute; left: 50%; top: -360px; width: 1100px; height: 640px; transform: translateX(-50%);
       border-radius: 50%; background: linear-gradient(135deg, #00648F, #00AFE6); opacity: 0.32; filter: blur(140px); }
     .rings { position: absolute; left: 50%; top: -330px; width: 880px; height: 880px; transform: translateX(-50%); opacity: 0.1; }
     .lockup { position: relative; display: flex; align-items: center; gap: 36px; }
     .tile { width: 168px; height: 168px; border-radius: 38px; overflow: hidden;
       box-shadow: 0 0 0 2px rgba(0, 175, 230, 0.45), 0 0 48px rgba(0, 175, 230, 0.25); }
     .tile svg { display: block; }
     .name { color: ${FOREGROUND}; font-size: 112px; font-weight: 600; letter-spacing: 0.16em; line-height: 1; }
     .product { margin-top: 18px; color: ${DRIFT}; font-size: 30px; font-weight: 600; letter-spacing: 0.32em; text-transform: uppercase; }
     .tagline { position: relative; margin: 0; color: ${DRIFT}; font-size: 30px; font-weight: 500; }`,
  );
}

async function render(browser, html, { width, height, selector }) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  const tab = await context.newPage();
  await tab.setContent(html, { waitUntil: 'load' });
  await tab.evaluate(() => document.fonts.ready);
  const data = await tab.locator(selector).screenshot({ omitBackground: true, type: 'png' });
  await context.close();
  return data;
}

function check() {
  const problems = [];
  const expectPng = (file, width, height) => {
    const path = join(PUBLIC, file);
    if (!existsSync(path)) return problems.push(`${file}: missing`);
    const size = pngSize(readFileSync(path));
    if (!size) return problems.push(`${file}: not a PNG`);
    if (size.width !== width || size.height !== height) problems.push(`${file}: ${size.width}x${size.height}, expected ${width}x${height}`);
  };
  for (const out of PNG_OUTPUTS) expectPng(out.file, out.size, out.size);
  expectPng(OG_IMAGE.file, OG_IMAGE.width, OG_IMAGE.height);
  const ico = join(PUBLIC, 'favicon.ico');
  const sizes = existsSync(ico) ? icoSizes(readFileSync(ico)) : null;
  if (!sizes || sizes.join(',') !== FAVICON_SIZES.join(',')) problems.push(`favicon.ico: sizes ${sizes ? sizes.join(',') : 'unreadable'}, expected ${FAVICON_SIZES.join(',')}`);
  return problems;
}

async function main() {
  if (process.argv.includes('--check')) {
    const problems = check();
    for (const p of problems) console.error(`✗ ${p}`);
    if (problems.length) process.exit(1);
    console.log('Icons present at their sizes.');
    return;
  }

  const { loadPlaywright } = await import('../visual/lib/playwright.mjs');
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch();
  const written = [];
  try {
    const mark = readSource('storm-mark.svg');
    const favicon = readSource('favicon.svg');

    for (const out of PNG_OUTPUTS) {
      const svg = out.source === 'storm-mark.svg' ? mark : favicon;
      const data = await render(browser, iconHtml({ svg, size: out.size, rounded: out.rounded }), { width: out.size, height: out.size, selector: '#icon' });
      writeFileSync(join(PUBLIC, out.file), data);
      written.push(out.file);
    }

    const icoImages = [];
    for (const size of FAVICON_SIZES) {
      const data = await render(browser, iconHtml({ svg: favicon, size, rounded: false }), { width: size, height: size, selector: '#icon' });
      icoImages.push({ size, data });
    }
    writeFileSync(join(PUBLIC, 'favicon.ico'), icoFromPngs(icoImages));
    written.push('favicon.ico');

    const og = await render(browser, ogHtml(mark), { width: OG_IMAGE.width, height: OG_IMAGE.height, selector: '#card' });
    writeFileSync(join(PUBLIC, OG_IMAGE.file), og);
    written.push(OG_IMAGE.file);
  } finally {
    await browser.close();
  }

  const problems = check();
  for (const file of written) console.log(`wrote ${relative(ROOT, join(PUBLIC, file))}`);
  for (const p of problems) console.error(`✗ ${p}`);
  if (problems.length) process.exit(1);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
