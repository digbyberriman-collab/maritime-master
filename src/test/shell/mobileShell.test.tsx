/**
 * The mobile and tablet shell (gap/10 IA19; spec §9; D-35).
 *
 * - Below 1024 px the sidebar is a left Sheet: a modal dialog named "Main
 *   navigation" with a focus trap, closed by Esc, the overlay, its 44 px
 *   close button and a route change; focus goes back to the menu button.
 * - Its header carries the tenant logo; it shows the same sidebar, never
 *   collapsed (even when the desktop column is stored collapsed).
 * - From 1024 px the sidebar is the static column and there is no menu
 *   button; a page that asks for the wide layout gets the drawer at every width.
 * - A scope with no sidebar tree here (vessel Home, …) has no menu button.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

const h = vi.hoisted(() => ({ sidebarAvailable: true }));

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
vi.mock('@/modules/auth/contexts/AuthContext', () => ({ useAuth: () => ({ user: null, profile: null, loading: false }) }));
vi.mock('@/modules/vessels/contexts/VesselContext', () => ({
  useVessel: () => ({
    vessels: [], companyVessels: [], vesselCodes: new Map(), loading: false, selectedVesselId: null, isAllVessels: false,
    canAccessAllVessels: false, loadedForUserId: null, getVesselCodeById: () => null, findVesselByCode: () => undefined,
  }),
}));
vi.mock('@/modules/auth/store/permissionsStore', () => ({
  usePermissionsStore: (selector: (s: object) => unknown) =>
    selector({ isInitialized: false, isLoading: false, loadedFor: null, hasFleetAccess: false, userRoles: [], error: null, loadPermissions: async () => undefined }),
}));
vi.mock('@/shared/contexts/BrandingContext', () => ({
  useBrandingContext: () => ({ clientDisplayName: 'Demo Fleet', clientLogoUrl: null, brandColor: '', isLoading: false }),
}));
vi.mock('@/modules/dashboard/contexts/DashboardFilterContext', () => ({ DashboardFilterProvider: ({ children }: { children: React.ReactNode }) => children }));
vi.mock('@/shared/components/layout/InkfishFooter', () => ({ default: () => null }));
vi.mock('@/shared/components/InkfishWatermark', () => ({ default: () => null }));
vi.mock('@/shared/components/layout/PageLocationHeader', () => ({ default: () => null }));
vi.mock('@/modules/feedback/components/FeedbackPanel', () => ({ default: () => null }));
vi.mock('@/modules/feedback/components/FeedbackResolvedToast', () => ({ default: () => null }));
vi.mock('@/shared/components/layout/topbar/ScopeControl', () => ({ default: () => null }));
vi.mock('@/shared/components/layout/topbar/AppsMenu', () => ({ default: () => null }));
vi.mock('@/shared/components/layout/topbar/FavouritesControl', () => ({ default: () => null }));
vi.mock('@/shared/components/layout/topbar/HelpMenu', () => ({ default: () => null }));
vi.mock('@/shared/components/layout/topbar/AccountMenu', () => ({ default: () => null }));
vi.mock('@/shared/components/layout/topbar/ShellShortcuts', () => ({ default: () => null }));
vi.mock('@/shared/components/layout/topbar/useVesselSwitcherAvailable', () => ({ useVesselSwitcherAvailable: () => false }));
vi.mock('@/shared/components/layout/NotificationBell', () => ({ default: () => null }));
vi.mock('@/shared/hooks/useSidebarBadgeCounts', () => ({ useSidebarBadgeCounts: () => ({ data: undefined }) }));
vi.mock('@/shared/components/layout/useShellSidebar', async () => {
  const icons = await import('lucide-react');
  const leaf = (id: string, label: string, path: string) => ({ id, label, path, icon: icons.Ship, kind: 'leaf' as const, status: 'live' as const });
  return {
    useShellSidebar: () =>
      h.sidebarAvailable
        ? {
            available: true,
            loading: false,
            nodes: [leaf('alpha', 'Alpha page', '/alpha'), leaf('beta', 'Beta page', '/beta')],
            heading: { label: 'Test tree', icon: icons.Ship },
            moduleParam: null,
            rootPath: null,
            roadmapApplies: false,
          }
        : { available: false, loading: false, nodes: [], heading: null, moduleParam: null, rootPath: null, roadmapApplies: false },
  };
});

import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { SHELL_TEST_IDS } from '@/app/shell/testIds';

const realMatchMedia = window.matchMedia;

/** A window `width` px wide (the shell's breakpoints read min-width queries). */
function viewport(width: number) {
  window.matchMedia = ((query: string) => {
    const min = /min-width:\s*(\d+)px/.exec(query);
    return {
      matches: min ? width >= Number(min[1]) : false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    };
  }) as typeof window.matchMedia;
}

const Location: React.FC = () => <output aria-label="location">{useLocation().pathname}</output>;

const Page: React.FC<{ title: string; wide?: boolean }> = ({ title, wide = false }) => (
  <DashboardLayout collapseSidebar={wide}>
    <h1>{title}</h1>
    <input aria-label="Search the page" />
  </DashboardLayout>
);

function renderShell(path = '/alpha', options: { wide?: boolean } = {}) {
  return render(
    <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/alpha" element={<Page title="Alpha" wide={options.wide} />} />
        <Route path="/beta" element={<Page title="Beta" wide={options.wide} />} />
      </Routes>
      <Location />
    </MemoryRouter>,
  );
}

const trigger = () => screen.getByTestId(SHELL_TEST_IDS.mobileNavTrigger);

async function openDrawer() {
  const button = trigger();
  button.focus();
  fireEvent.click(button);
  return screen.findByRole('dialog', { name: 'Main navigation' });
}

beforeEach(() => {
  localStorage.clear();
  h.sidebarAvailable = true;
  viewport(390);
});
afterEach(() => {
  window.matchMedia = realMatchMedia;
});

describe('the navigation drawer below 1024 px', () => {
  it('is a modal dialog with the tenant logo, a 44 px close button and the sidebar', async () => {
    renderShell();
    expect(screen.queryByTestId(SHELL_TEST_IDS.sidebar)).toBeNull();
    expect(trigger()).toHaveAttribute('aria-haspopup', 'dialog');
    const drawer = await openDrawer();
    expect(drawer).toHaveAttribute('data-testid', SHELL_TEST_IDS.mobileNavDrawer);
    expect(drawer.className).toContain('w-[min(20rem,calc(100vw-3rem))]');
    expect(drawer.className).toContain('bg-sidebar');
    expect(drawer.className).toContain('pl-[env(safe-area-inset-left)]');
    expect(within(drawer).getByTestId(SHELL_TEST_IDS.tenantLogo)).toHaveTextContent('Demo Fleet');
    const close = within(drawer).getByTestId(SHELL_TEST_IDS.mobileNavClose);
    expect(close).toHaveAccessibleName('Close navigation drawer');
    expect(close.className).toContain('h-11');
    expect(close.className).toContain('w-11');
    await waitFor(() => expect(close).toHaveFocus());
    // The Sheet's own 16 px close button is left out (hideClose), not hidden by a selector.
    expect(within(drawer).queryByRole('button', { name: 'Close' })).toBeNull();
    expect(within(drawer).getAllByRole('button', { name: /close/i })).toHaveLength(1);
    expect(within(drawer).getByRole('link', { name: 'Alpha page, current page' })).toBeInTheDocument();
    // The page behind is inert to assistive tech while it is open.
    expect(screen.queryByRole('heading', { name: 'Alpha' })).toBeNull();
  });

  it('traps focus inside the drawer', async () => {
    renderShell();
    const drawer = await openDrawer();
    const page = screen.getByLabelText('Search the page', { selector: 'input' });
    act(() => {
      page.focus();
    });
    // Radix moves focus straight back inside the trap.
    await waitFor(() => expect(drawer.contains(document.activeElement)).toBe(true));
  });

  it('closes on Esc and returns focus to the menu button', async () => {
    renderShell();
    await openDrawer();
    act(() => {
      fireEvent.keyDown(document.activeElement as Element, { key: 'Escape' });
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(trigger()).toHaveFocus());
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes with its close button', async () => {
    renderShell();
    const drawer = await openDrawer();
    fireEvent.click(within(drawer).getByTestId(SHELL_TEST_IDS.mobileNavClose));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(trigger()).toHaveFocus());
  });

  it('closes when a link is followed (route change)', async () => {
    renderShell();
    const drawer = await openDrawer();
    fireEvent.click(within(drawer).getByRole('link', { name: 'Beta page' }));
    await waitFor(() => expect(screen.getByLabelText('location')).toHaveTextContent('/beta'));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('heading', { name: 'Beta' })).toBeInTheDocument();
  });

  it('closes on a tap outside it (the overlay)', async () => {
    renderShell();
    await openDrawer();
    // Radix's DismissableLayer listens for a pointer down outside the content.
    act(() => {
      fireEvent.pointerDown(document.body, { button: 0, pointerType: 'touch' });
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('never shows the sidebar collapsed, even when the desktop column is stored collapsed', async () => {
    localStorage.setItem('storm-sidebar-collapsed', 'true');
    renderShell();
    const drawer = await openDrawer();
    // Labels, not icons only, and no collapse toggle in the drawer.
    expect(within(drawer).getByText('Alpha page')).toBeVisible();
    expect(within(drawer).queryByTestId(SHELL_TEST_IDS.sidebarCollapse)).toBeNull();
  });

  it('is the tablet layout too (768–1023 px)', async () => {
    viewport(900);
    renderShell();
    expect(screen.queryByTestId(SHELL_TEST_IDS.sidebar)).toBeNull();
    expect(await openDrawer()).toBeInTheDocument();
  });
});

describe('the menu button', () => {
  it('is not there when the scope has no sidebar tree here', () => {
    h.sidebarAvailable = false;
    renderShell();
    expect(screen.queryByTestId(SHELL_TEST_IDS.mobileNavTrigger)).toBeNull();
    expect(screen.queryByTestId(SHELL_TEST_IDS.sidebar)).toBeNull();
  });

  it('gives way to the static sidebar from 1024 px', () => {
    viewport(1280);
    renderShell();
    expect(screen.queryByTestId(SHELL_TEST_IDS.mobileNavTrigger)).toBeNull();
    const aside = screen.getByTestId(SHELL_TEST_IDS.sidebar);
    expect(aside.tagName).toBe('ASIDE');
    expect(aside).toHaveAccessibleName('Main navigation');
    expect(aside.className).toContain('w-[248px]');
  });

  it('opens the drawer at every width on a page that asks for the wide layout', async () => {
    viewport(1440);
    renderShell('/alpha', { wide: true });
    await waitFor(() => expect(screen.queryByTestId(SHELL_TEST_IDS.sidebar)).toBeNull());
    expect(await openDrawer()).toBeInTheDocument();
  });

  it('closes an open drawer when the window grows to the static layout', async () => {
    const view = renderShell();
    await openDrawer();
    viewport(1280);
    // Re-render as a resize would (the media query store notifies its subscribers).
    view.rerender(
      <MemoryRouter initialEntries={['/alpha']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/alpha" element={<Page title="Alpha" />} />
        </Routes>
        <Location />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByTestId(SHELL_TEST_IDS.sidebar)).toBeInTheDocument();
  });
});
