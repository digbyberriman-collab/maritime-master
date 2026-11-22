/**
 * Sidebar and account chrome contrast (gap/10 A.2, §1.3; DECISIONS D-DS1, D-DS4).
 *
 * The sidebar is anchored Abyss chrome in both themes, so every text colour
 * on it must pass 4.5:1 on the sidebar and on its hover surface. Faded
 * `text-sidebar-foreground/NN` text is checked at the opacity it is drawn at;
 * headings and chips use the `sidebar-muted-foreground` token instead. The
 * sidebar (navigation tree and its footer with the Show roadmap switch) is
 * checked as one surface.
 *
 * The account avatar moved from the sidebar to the top bar (BUILD-PLAN S1):
 * its initials sit on Slate-900 with Drift-50 ink, a theme-independent pair
 * that reads on both top-bar surfaces, and never on the tenant brand colour
 * (D-DS4: brand colour belongs on the logo plate edge and PDF accents only).
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { contrast, loadTokens, readRepoFile, tokenRgb, type Rgb } from './cssTokens';

const mocks = vi.hoisted(() => ({
  auth: {
    user: { id: 'u1' },
    profile: { first_name: 'Test', last_name: 'Officer', role: 'crew', company_id: 'c1', user_id: 'u1' },
    loading: false,
    signOut: async () => undefined,
  },
  vessel: {
    vessels: [],
    loading: false,
    selectedVesselId: null,
    isAllVessels: false,
    canAccessAllVessels: false,
    loadedForUserId: 'u1',
    getVesselCodeById: () => null,
    findVesselByCode: () => undefined,
  },
  perm: { isInitialized: true, loadedFor: 'u1', hasFleetAccess: false, userRoles: [] },
  feedback: { setPanelOpen: () => undefined },
}));

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
vi.mock('@/modules/auth/contexts/AuthContext', () => ({ useAuth: () => mocks.auth }));
vi.mock('@/modules/vessels/contexts/VesselContext', () => ({ useVessel: () => mocks.vessel }));
vi.mock('@/modules/auth/store/permissionsStore', () => ({
  usePermissionsStore: (selector: (s: object) => unknown) => selector(mocks.perm),
}));
// A dark tenant brand: before D-DS4 the avatar was filled with it (1.87:1 initials).
vi.mock('@/shared/contexts/BrandingContext', () => ({ useBrandingContext: () => ({ brandColor: '#1E3A8A' }) }));
vi.mock('@/shared/hooks/useBranding', () => ({ canManageBranding: () => false }));
vi.mock('@/modules/feedback/store/feedbackStore', () => ({
  useFeedbackStore: (selector?: (s: typeof mocks.feedback) => unknown) => (selector ? selector(mocks.feedback) : mocks.feedback),
}));

import AccountMenu from '@/shared/components/layout/topbar/AccountMenu';

const tokens = loadTokens();
const TEXT = 4.5;

/** The colour a `/NN` opacity modifier paints, composited over the surface (8-bit, as browsers do). */
const over = (fg: Rgb, bg: Rgb, alpha: number): Rgb => fg.map((c, i) => Math.round(c * alpha + bg[i] * (1 - alpha))) as Rgb;

const SIDEBAR_SOURCES = ['src/shared/components/layout/SidebarNavigation.tsx', 'src/shared/components/layout/SidebarFooter.tsx'];

describe('sidebar text contrast', () => {
  it.each([
    ['Abyss', tokens.dark],
    ['Daylight', tokens.light],
  ])('%s: every faded sidebar-foreground in the sidebar passes 4.5:1 on the sidebar and its hover surface', (_name, theme) => {
    const fg = tokenRgb(tokens, theme, 'sidebar-foreground');
    const failures: string[] = [];
    let checked = 0;
    for (const file of SIDEBAR_SOURCES) {
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

  it('section headings, "Planned" chips and the roadmap switch use the muted token', () => {
    const nav = readRepoFile('src/shared/components/layout/SidebarNavigation.tsx');
    const footer = readRepoFile('src/shared/components/layout/SidebarFooter.tsx');
    expect(nav.match(/text-sidebar-muted-foreground/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(footer).toMatch(/sidebar-muted-foreground/);
  });

  it('the guard itself catches the old /50 headings', () => {
    const fg = tokenRgb(tokens, tokens.dark, 'sidebar-foreground');
    const bg = tokenRgb(tokens, tokens.dark, 'sidebar-background');
    expect(contrast(over(fg, bg, 0.5), bg)).toBeLessThan(TEXT);
  });

  it('the sidebar no longer carries the account menu or the bell (they live in the top bar)', () => {
    const shell = readRepoFile('src/shared/components/layout/AppShell.tsx');
    expect(shell).not.toMatch(/SidebarAccountMenu/);
    for (const file of SIDEBAR_SOURCES) expect(readRepoFile(file)).not.toMatch(/NotificationBell|AccountMenu/);
  });
});

describe('account avatar', () => {
  const renderMenu = () =>
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AccountMenu />
      </MemoryRouter>,
    );

  it('draws the initials on Slate-900 with Drift-50 ink, no inline brand fill', () => {
    renderMenu();
    const initials = screen.getByText('TO');
    expect(initials.getAttribute('style') ?? '').not.toMatch(/background/i);
    expect(initials.className).toContain('bg-slate-ui-900');
    expect(initials.className).toContain('text-drift-50');
    expect(initials.className).not.toContain('text-primary-foreground');
    expect(screen.getByRole('button', { name: 'Account menu for Test Officer' })).toHaveAttribute('data-testid', 'shell-account-trigger');
  });

  it('the avatar pair passes 4.5:1, in both themes (it is theme-independent)', () => {
    const ratio = contrast(tokenRgb(tokens, tokens.raw, 'drift-50'), tokenRgb(tokens, tokens.raw, 'slate-900'));
    expect(ratio).toBeGreaterThanOrEqual(TEXT);
  });

  it('the account menu never reads the tenant brand colour (D-DS4)', () => {
    const source = readRepoFile('src/shared/components/layout/topbar/AccountMenu.tsx');
    expect(source).not.toContain('brandColor');
    expect(source).not.toContain('useBrandingContext');
  });
});
