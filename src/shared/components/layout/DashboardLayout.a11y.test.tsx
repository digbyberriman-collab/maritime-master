import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
vi.mock('@/modules/auth/contexts/AuthContext', () => ({ useAuth: () => ({ user: null, profile: null, loading: false }) }));
vi.mock('@/shared/contexts/BrandingContext', () => ({
  useBrandingContext: () => ({ clientDisplayName: 'INKFISH', clientLogoUrl: null }),
}));
vi.mock('@/shared/components/layout/InkfishFooter', () => ({ default: () => null }));
vi.mock('@/shared/components/InkfishWatermark', () => ({ default: () => null }));
vi.mock('@/shared/components/layout/PageLocationHeader', () => ({ default: () => null }));
vi.mock('@/modules/feedback/components/FeedbackPanel', () => ({ default: () => null }));
vi.mock('@/modules/feedback/components/FeedbackResolvedToast', () => ({ default: () => null }));
// The top bar's own controls are covered by src/test/shell; the frame and the drawer matter here.
vi.mock('@/shared/components/layout/topbar/TenantLogo', () => ({ default: () => null }));
vi.mock('@/shared/components/layout/topbar/ScopeControl', () => ({ default: () => null }));
vi.mock('@/shared/components/layout/topbar/AppsMenu', () => ({ default: () => null }));
vi.mock('@/shared/components/layout/topbar/FavouritesControl', () => ({ default: () => null }));
vi.mock('@/shared/components/layout/topbar/HelpMenu', () => ({ default: () => null }));
vi.mock('@/shared/components/layout/topbar/AccountMenu', () => ({ default: () => null }));
vi.mock('@/shared/components/layout/topbar/ShellShortcuts', () => ({ default: () => null }));
vi.mock('@/shared/components/layout/topbar/useVesselSwitcherAvailable', () => ({ useVesselSwitcherAvailable: () => false }));
vi.mock('@/shared/components/layout/NotificationBell', () => ({ default: () => null }));
// A page with a sidebar; which tree it draws is covered by src/test/shell/sidebarScopes.test.tsx.
vi.mock('@/shared/components/layout/useShellSidebar', async () => {
  const icons = await import('lucide-react');
  return {
    useShellSidebar: () => ({
      available: true,
      loading: false,
      nodes: [],
      heading: { label: 'Test', icon: icons.Ship },
      moduleParam: null,
      rootPath: null,
      roadmapApplies: false,
    }),
  };
});
vi.mock('@/shared/components/layout/SidebarNavigation', () => ({
  default: ({ collapsed, onNavigate }: { collapsed: boolean; onNavigate: () => void }) => (
    <nav aria-label="Test navigation" data-collapsed={collapsed}>
      <button type="button" onClick={onNavigate}>Test destination</button>
    </nav>
  ),
}));

const realMatchMedia = window.matchMedia;

/** A desktop window: the static sidebar (and ⌘/Ctrl+B) exist from 1024 px. */
function desktop() {
  window.matchMedia = ((query: string) => ({
    ...realMatchMedia(query),
    matches: /min-width:\s*(768|1024)px/.test(query),
  })) as typeof window.matchMedia;
}

function renderLayout() {
  return render(<MemoryRouter initialEntries={['/dashboard']}><DashboardLayout><p>Page</p></DashboardLayout></MemoryRouter>);
}

describe('DashboardLayout sidebar accessibility regressions', () => {
  beforeEach(() => {
    localStorage.clear();
    desktop();
  });
  afterEach(() => {
    window.matchMedia = realMatchMedia;
  });

  it('supports Ctrl+B collapse and preserves a visible keyboard focus indicator', async () => {
    renderLayout();
    const collapse = screen.getByRole('button', { name: 'Collapse sidebar to icons' });
    expect(collapse.className).toContain('focus-visible:ring-2');
    expect(collapse).toHaveAttribute('data-testid', 'shell-sidebar-collapse');

    collapse.focus();
    expect(collapse).toHaveFocus();
    fireEvent.keyDown(window, { key: 'b', code: 'KeyB', ctrlKey: true });

    await waitFor(() => expect(screen.getByRole('button', { name: 'Expand sidebar' })).toBeInTheDocument());
    expect(screen.getByRole('navigation', { name: 'Test navigation' })).toHaveAttribute('data-collapsed', 'true');
    expect(localStorage.getItem('storm-sidebar-collapsed')).toBe('true');
  });

  it('does not hijack Ctrl+B while typing in a form field', () => {
    render(<MemoryRouter initialEntries={['/dashboard']}><DashboardLayout><input aria-label="Notes" /></DashboardLayout></MemoryRouter>);
    const input = screen.getByRole('textbox', { name: 'Notes' });
    input.focus();
    fireEvent.keyDown(input, { key: 'b', code: 'KeyB', ctrlKey: true });

    expect(screen.getByRole('button', { name: 'Collapse sidebar to icons' })).toBeInTheDocument();
    expect(localStorage.getItem('storm-sidebar-collapsed')).toBeNull();
  });

  it('leaves Ctrl+B to the browser where there is no static sidebar', () => {
    window.matchMedia = realMatchMedia;
    renderLayout();
    const event = new KeyboardEvent('keydown', { key: 'b', code: 'KeyB', ctrlKey: true, cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(screen.queryByRole('button', { name: 'Collapse sidebar to icons' })).toBeNull();
    expect(localStorage.getItem('storm-sidebar-collapsed')).toBeNull();
  });

  it('wires the mobile drawer ARIA state, Escape dismissal, and focus return', async () => {
    window.matchMedia = realMatchMedia;
    renderLayout();
    const trigger = screen.getByRole('button', { name: 'Open navigation drawer' });
    expect(trigger).toHaveAttribute('aria-controls', 'mobile-navigation-drawer');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger.className).toContain('focus-visible:ring-2');
    // No static column below 1024 px; the drawer is not mounted while closed.
    expect(screen.queryByTestId('shell-sidebar')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();

    trigger.focus();
    fireEvent.click(trigger);
    const drawer = await screen.findByRole('dialog', { name: 'Main navigation' });
    expect(drawer).toHaveAttribute('id', 'mobile-navigation-drawer');
    expect(drawer).toHaveAttribute('data-testid', 'shell-mobile-nav-drawer');
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Close navigation drawer' })).toHaveFocus());

    act(() => {
      fireEvent.keyDown(document.activeElement as Element, { key: 'Escape', code: 'Escape' });
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('puts the skip link first and points it at the main landmark', () => {
    renderLayout();
    const skip = screen.getByRole('link', { name: 'Skip to content' });
    expect(skip).toHaveAttribute('href', '#main-content');
    const focusables = Array.from(document.querySelectorAll<HTMLElement>('a[href], button:not([tabindex="-1"]), input, [tabindex]:not([tabindex="-1"])'));
    expect(focusables[0]).toBe(skip);
    const main = screen.getByRole('main');
    expect(main).toHaveAttribute('id', 'main-content');
    fireEvent.click(skip);
    expect(main).toHaveFocus();
  });
});
