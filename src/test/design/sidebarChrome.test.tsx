/**
 * Sidebar chrome contrast (gap/10 A.2, §1.3; DECISIONS D-DS1, D-DS4).
 *
 * The sidebar is anchored Abyss chrome in both themes, so every text colour
 * on it must pass 4.5:1 on the sidebar and on its hover surface. Faded
 * `text-sidebar-foreground/NN` text is checked at the opacity it is drawn at;
 * headings and chips use the `sidebar-muted-foreground` token instead. The
 * account avatar is drawn with sidebar tokens, never the tenant brand colour
 * (D-DS4: brand colour belongs on the logo plate edge and PDF accents only).
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { contrast, loadTokens, readRepoFile, tokenRgb, type Rgb } from './cssTokens';

const mocks = vi.hoisted(() => ({
  auth: {
    profile: { first_name: 'Test', last_name: 'Officer', role: 'crew' },
    signOut: async () => undefined,
  },
  vessel: { vessels: [], loading: false, selectedVessel: null, setSelectedVesselById: () => undefined },
  filter: { selectedVesselIds: [], setSelectedVesselIds: () => undefined },
  feedback: { setPanelOpen: () => undefined },
}));

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
vi.mock('@/modules/auth/contexts/AuthContext', () => ({ useAuth: () => mocks.auth }));
vi.mock('@/modules/vessels/contexts/VesselContext', () => ({ useVessel: () => mocks.vessel }));
vi.mock('@/modules/dashboard/contexts/DashboardFilterContext', () => ({ useDashboardFilter: () => mocks.filter }));
// A dark tenant brand: before D-DS4 the avatar was filled with it (1.87:1 initials).
vi.mock('@/shared/contexts/BrandingContext', () => ({ useBrandingContext: () => ({ brandColor: '#1E3A8A' }) }));
vi.mock('@/shared/hooks/useBranding', () => ({ canManageBranding: () => false }));
vi.mock('@/modules/feedback/store/feedbackStore', () => ({ useFeedbackStore: () => mocks.feedback }));

import SidebarAccountMenu from '@/shared/components/layout/SidebarAccountMenu';

const tokens = loadTokens();
const TEXT = 4.5;

/** The colour a `/NN` opacity modifier paints, composited over the surface (8-bit, as browsers do). */
const over = (fg: Rgb, bg: Rgb, alpha: number): Rgb => fg.map((c, i) => Math.round(c * alpha + bg[i] * (1 - alpha))) as Rgb;

describe('sidebar text contrast', () => {
  const SOURCES = ['src/shared/components/layout/SidebarNavigation.tsx', 'src/shared/components/layout/SidebarAccountMenu.tsx'];

  it.each([
    ['Abyss', tokens.dark],
    ['Daylight', tokens.light],
  ])('%s: every faded sidebar-foreground in the sidebar passes 4.5:1 on the sidebar and its hover surface', (_name, theme) => {
    const fg = tokenRgb(tokens, theme, 'sidebar-foreground');
    const failures: string[] = [];
    let checked = 0;
    for (const file of SOURCES) {
      for (const [, pct] of readRepoFile(file).matchAll(/text-sidebar-foreground\/(\d+)/g)) {
        checked += 1;
        for (const surface of ['sidebar-background', 'sidebar-accent']) {
          const bg = tokenRgb(tokens, theme, surface);
          const ratio = contrast(over(fg, bg, Number(pct) / 100), bg);
          if (ratio < TEXT) failures.push(`${file}: text-sidebar-foreground/${pct} on ${surface} is ${ratio.toFixed(2)}:1`);
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
    expect(failures).toEqual([]);
  });

  it('section headings, "Planned" chips and the roadmap "Off" label use the muted token', () => {
    const nav = readRepoFile('src/shared/components/layout/SidebarNavigation.tsx');
    expect(nav.match(/text-sidebar-muted-foreground/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  });

  it('the guard itself catches the old /50 headings', () => {
    const fg = tokenRgb(tokens, tokens.dark, 'sidebar-foreground');
    const bg = tokenRgb(tokens, tokens.dark, 'sidebar-background');
    expect(contrast(over(fg, bg, 0.5), bg)).toBeLessThan(TEXT);
  });
});

describe('sidebar account avatar', () => {
  const renderMenu = (collapsed: boolean) =>
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <SidebarAccountMenu collapsed={collapsed} />
      </MemoryRouter>,
    );

  it.each([
    ['expanded', false],
    ['collapsed', true],
  ])('%s: initials on the sidebar hover surface, no inline brand fill', (_label, collapsed) => {
    renderMenu(collapsed);
    const initials = screen.getByText('TO');
    expect(initials.getAttribute('style') ?? '').not.toMatch(/background/i);
    expect(initials.className).toContain('bg-sidebar-accent');
    expect(initials.className).toContain('text-sidebar-accent-foreground');
    expect(initials.className).not.toContain('text-primary-foreground');
  });

  it('the avatar pair passes 4.5:1 in both themes', () => {
    for (const theme of [tokens.dark, tokens.light]) {
      const ratio = contrast(tokenRgb(tokens, theme, 'sidebar-accent-foreground'), tokenRgb(tokens, theme, 'sidebar-accent'));
      expect(ratio).toBeGreaterThanOrEqual(TEXT);
    }
  });

  it('the account menu no longer reads the tenant brand colour (D-DS4)', () => {
    const source = readRepoFile('src/shared/components/layout/SidebarAccountMenu.tsx');
    expect(source).not.toContain('brandColor');
    expect(source).not.toContain('useBrandingContext');
  });
});
