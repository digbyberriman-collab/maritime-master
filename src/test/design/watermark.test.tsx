/**
 * Inkfish watermark (D-DS5, gap/10 DS24; Phase 1 spec §3 / §11.3).
 *
 * Two-sided stacking contract: the watermark is `fixed inset-0 -z-10` and the
 * shell root is `relative isolate`, so it paints above the page background and
 * below every in-flow block (it used to be `z-[1]` and painted over cards).
 * Its strength comes from the theme: `--watermark-opacity` at the faint end
 * of DS24's "about 3 %" on Abyss, and fainter still in Daylight and on paper.
 */
import { describe, expect, it } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import InkfishWatermark, { InkfishWatermark as NamedWatermark } from '@/shared/components/InkfishWatermark';
import { loadTokens } from './cssTokens';

const tokens = loadTokens();

function renderRoot() {
  const { container } = render(<InkfishWatermark />);
  const root = container.querySelector<HTMLElement>('[data-watermark="inkfish"]');
  if (!root) throw new Error('watermark root not rendered');
  return root;
}

describe('InkfishWatermark', () => {
  it('is a fixed full-viewport layer behind the content (-z-10), never above it', () => {
    const root = renderRoot();
    for (const cls of ['fixed', 'inset-0', '-z-10', 'pointer-events-none', 'select-none']) {
      expect(root.classList.contains(cls), cls).toBe(true);
    }
    expect(root.className).not.toMatch(/(^|\s)z-\[1\]|(^|\s)z-\d/);
  });

  it('is decorative: aria-hidden with an empty alt', () => {
    const root = renderRoot();
    expect(root.getAttribute('aria-hidden')).toBe('true');
    expect(root.querySelector('img')?.getAttribute('alt')).toBe('');
  });

  it('takes its opacity and silhouette from theme variables, not from the component', () => {
    const root = renderRoot();
    expect(root.classList.contains('opacity-[var(--watermark-opacity)]')).toBe(true);
    const img = root.querySelector('img');
    expect(img?.className).toContain('[filter:brightness(0)_invert(var(--watermark-invert))]');
    // No fixed opacity values or theme variants baked into the markup.
    expect(root.outerHTML).not.toMatch(/opacity-\[0|opacity-\d|dark:|light:/);
  });

  it('falls back to text with the same layer and opacity when the image fails', () => {
    const root = renderRoot();
    fireEvent.error(root.querySelector('img')!);
    expect(root.querySelector('img')).toBeNull();
    expect(root.textContent).toContain('Inkfish');
    expect(root.classList.contains('opacity-[var(--watermark-opacity)]')).toBe(true);
  });

  it('takes no props and keeps the named export for old imports', () => {
    expect(InkfishWatermark.length).toBeLessThanOrEqual(1);
    expect(NamedWatermark).toBe(InkfishWatermark);
  });
});

describe('--watermark-opacity (src/index.css)', () => {
  const opacity = (theme: Record<string, string>) => Number.parseFloat(theme['--watermark-opacity']);

  // gap/10 DS24 asks for about 3 %; the owner's review found the mark too
  // prominent, so it sits at the faint end of that range.
  it('is faint on Abyss (2–4 %)', () => {
    expect(opacity(tokens.dark)).toBeGreaterThanOrEqual(0.02);
    expect(opacity(tokens.dark)).toBeLessThanOrEqual(0.04);
  });

  it('is fainter in Daylight, and paper prints like Daylight', () => {
    expect(opacity(tokens.light)).toBeGreaterThan(0);
    expect(opacity(tokens.light)).toBeLessThan(opacity(tokens.dark));
    expect(tokens.print['--watermark-opacity']).toBe(tokens.light['--watermark-opacity']);
  });

  it('draws a light silhouette on dark and a dark one on light', () => {
    expect(tokens.dark['--watermark-invert']).toBe('1');
    expect(tokens.light['--watermark-invert']).toBe('0');
  });
});
