/**
 * The Inkfish footer (gap/10 IA18, DS24; spec §2.1 L1c): caption size,
 * theme tokens only, 44 px hit areas on touch, copy unchanged, and ink that
 * reads at 4.5:1 on both page backgrounds.
 */
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import InkfishFooter from '@/shared/components/layout/InkfishFooter';
import { SHELL_TEST_IDS } from '@/app/shell/testIds';
import { contrast, loadTokens, readRepoFile, tokenRgb } from '../design/cssTokens';

const renderFooter = () =>
  render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <InkfishFooter />
    </MemoryRouter>,
  );

describe('InkfishFooter', () => {
  it('keeps its copy and links, as a labelled footer nav', () => {
    renderFooter();
    const footer = screen.getByTestId(SHELL_TEST_IDS.footer);
    expect(footer.tagName).toBe('FOOTER');
    const nav = within(footer).getByRole('navigation', { name: 'Footer' });
    expect(within(nav).getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', '/legal/privacy-policy');
    expect(within(nav).getByRole('link', { name: 'Terms of Service' })).toHaveAttribute('href', '/legal/terms-of-service');
    expect(within(nav).getByRole('button', { name: 'Help' })).toBeInTheDocument();
    expect(within(nav).getByRole('button', { name: 'Support' })).toBeInTheDocument();
    expect(footer).toHaveTextContent('© 2026 Inkfish. All rights reserved.');
    expect(footer).toHaveTextContent('Maritime Management');
  });

  it('is caption size with a 44 px hit area on touch and the focus ring on every control', () => {
    renderFooter();
    const footer = screen.getByTestId(SHELL_TEST_IDS.footer);
    const controls = [...within(footer).getAllByRole('link'), ...within(footer).getAllByRole('button')];
    expect(controls).toHaveLength(4);
    for (const control of controls) {
      expect(control).toHaveClass('type-caption', 'text-muted-foreground', '[@media(pointer:coarse)]:min-h-11', 'focus-visible:ring-2');
    }
  });

  it('uses theme tokens only (no raw palette, hex or dark: variants)', () => {
    const source = readRepoFile('src/shared/components/layout/InkfishFooter.tsx');
    expect(source).not.toMatch(/\b(text|bg|border)-(gray|slate|zinc|neutral|white|black)\b/);
    expect(source).not.toMatch(/dark:/);
    expect(source).not.toMatch(/text-\[1[01]px\]/);
  });

  it('its ink passes 4.5:1 on the page background in both themes', () => {
    const tokens = loadTokens();
    for (const theme of [tokens.dark, tokens.light]) {
      const ratio = contrast(tokenRgb(tokens, theme, 'muted-foreground'), tokenRgb(tokens, theme, 'background'));
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    }
  });
});
