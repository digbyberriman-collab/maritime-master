import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';

vi.mock('@/shared/contexts/BrandingContext', () => ({
  useBrandingContext: () => ({ clientDisplayName: 'INKFISH', clientLogoUrl: null }),
}));
vi.mock('@/modules/dashboard/contexts/DashboardFilterContext', () => ({ DashboardFilterProvider: ({ children }: { children: React.ReactNode }) => children }));
vi.mock('@/shared/components/layout/InkfishFooter', () => ({ default: () => null }));
vi.mock('@/shared/components/InkfishWatermark', () => ({ default: () => null }));
vi.mock('@/shared/components/layout/FloatingQuickActions', () => ({ default: () => null }));
vi.mock('@/shared/components/layout/SidebarAccountMenu', () => ({ default: () => null }));
vi.mock('@/shared/components/layout/NotificationBell', () => ({ default: () => null }));
vi.mock('@/shared/components/layout/PageLocationHeader', () => ({ default: () => null }));
vi.mock('@/shared/components/layout/ModuleTopNav', () => ({ default: () => null }));
vi.mock('@/modules/feedback/components/FeedbackPanel', () => ({ default: () => null }));
vi.mock('@/modules/feedback/components/FeedbackResolvedToast', () => ({ default: () => null }));
vi.mock('@/shared/components/layout/SidebarNavigation', () => ({
  default: ({ collapsed, onNavigate }: { collapsed: boolean; onNavigate: () => void }) => (
    <nav aria-label="Test navigation" data-collapsed={collapsed}>
      <button type="button" onClick={onNavigate}>Test destination</button>
    </nav>
  ),
}));

function renderLayout() {
  return render(<MemoryRouter initialEntries={['/dashboard']}><DashboardLayout><p>Page</p></DashboardLayout></MemoryRouter>);
}

describe('DashboardLayout sidebar accessibility regressions', () => {
  beforeEach(() => localStorage.clear());

  it('supports Ctrl+B collapse and preserves a visible keyboard focus indicator', async () => {
    renderLayout();
    const collapse = screen.getByRole('button', { name: 'Collapse folder panel to icons' });
    expect(collapse.className).toContain('focus-visible:ring-2');

    collapse.focus();
    expect(collapse).toHaveFocus();
    fireEvent.keyDown(window, { key: 'b', code: 'KeyB', ctrlKey: true });

    await waitFor(() => expect(screen.getByRole('button', { name: 'Expand folder panel' })).toBeInTheDocument());
    expect(screen.getByRole('navigation', { name: 'Test navigation' })).toHaveAttribute('data-collapsed', 'true');
    expect(localStorage.getItem('storm-sidebar-collapsed')).toBe('true');
  });

  it('does not hijack Ctrl+B while typing in a form field', () => {
    render(<MemoryRouter initialEntries={['/dashboard']}><DashboardLayout><input aria-label="Notes" /></DashboardLayout></MemoryRouter>);
    const input = screen.getByRole('textbox', { name: 'Notes' });
    input.focus();
    fireEvent.keyDown(input, { key: 'b', code: 'KeyB', ctrlKey: true });

    expect(screen.getByRole('button', { name: 'Collapse folder panel to icons' })).toBeInTheDocument();
    expect(localStorage.getItem('storm-sidebar-collapsed')).toBeNull();
  });

  it('wires the mobile drawer ARIA state, Escape dismissal, and focus return', async () => {
    renderLayout();
    const trigger = screen.getByRole('button', { name: 'Open navigation drawer' });
    const drawer = screen.getByLabelText('Main navigation');

    expect(trigger).toHaveAttribute('aria-controls', 'mobile-navigation-drawer');
    expect(drawer).toHaveAttribute('id', 'mobile-navigation-drawer');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger.className).toContain('focus-visible:ring-2');

    trigger.focus();
    fireEvent.click(trigger);
    await waitFor(() => expect(trigger).toHaveAttribute('aria-expanded', 'true'));
    expect(drawer).toHaveAttribute('aria-modal', 'true');
    expect(screen.getAllByRole('button', { name: 'Close navigation drawer' })[1]).toHaveFocus();
    expect(document.body.style.overflow).toBe('hidden');

    act(() => fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' }));
    await waitFor(() => expect(trigger).toHaveAttribute('aria-expanded', 'false'));
    expect(trigger).toHaveFocus();
    expect(drawer).not.toHaveAttribute('aria-modal');
    expect(document.body.style.overflow).toBe('');
  });
});
