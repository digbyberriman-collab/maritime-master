import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import SidebarNavigation from '@/shared/components/layout/SidebarNavigation';

const mocks = vi.hoisted(() => ({
  order: { map: {} },
  hrAccess: { loading: false },
  payrollAccess: { loading: false },
  badgeCounts: { data: { pendingCompliance: 0, unreadMessages: 0, overdueTasks: 0 } },
}));

vi.mock('@/shared/hooks/useSidebarOrder', () => ({
  useSidebarOrder: () => mocks.order,
  applySidebarOrder: <T,>(items: T[]) => items,
}));
vi.mock('@/modules/auth/store/permissionsStore', () => ({
  usePermissionsStore: (selector: (state: object) => unknown) => selector({
    hasPermission: () => true,
    isInitialized: true,
  }),
}));
vi.mock('@/modules/auth/hooks/useHrAccess', () => ({ useHrAccess: () => mocks.hrAccess }));
vi.mock('@/modules/auth/lib/hrAccess', () => ({ hrAccessSatisfies: () => true }));
vi.mock('@/modules/auth/hooks/usePayrollAccess', () => ({ usePayrollAccess: () => mocks.payrollAccess }));
vi.mock('@/modules/auth/lib/payrollAccess', () => ({ payrollAccessSatisfies: () => true }));
vi.mock('@/shared/hooks/useSidebarBadgeCounts', () => ({
  useSidebarBadgeCounts: () => mocks.badgeCounts,
}));

const LocationProbe = () => <output aria-label="Current route">{useLocation().pathname}{useLocation().search}</output>;

function renderSidebar(path = '/vessel/logbooks/review?module=vessel', collapsed = false, onExpand = vi.fn()) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SidebarNavigation moduleId="vessel" collapsed={collapsed} onExpand={onExpand} />
      <LocationProbe />
    </MemoryRouter>,
  );
}

function activateWithKeyboard(control: HTMLElement) {
  control.focus();
  fireEvent.keyDown(control, { key: 'Enter', code: 'Enter' });
  control.click();
  fireEvent.keyUp(control, { key: 'Enter', code: 'Enter' });
}

describe('SidebarNavigation accessibility regressions', () => {
  beforeEach(() => localStorage.clear());

  it('identifies one active page and announces it through a polite atomic live region', async () => {
    renderSidebar();
    const navigation = screen.getByRole('navigation', { name: 'Vessel folders' });
    const current = within(navigation).getAllByRole('button').filter((button) => button.getAttribute('aria-current') === 'page');

    expect(current).toHaveLength(1);
    expect(current[0]).toHaveAccessibleName(/Review & Sign-off, current page/i);

    const status = within(navigation).getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveAttribute('aria-atomic', 'true');
    await waitFor(() => expect(status).toHaveTextContent('Current page: Review & Sign-off'));
  });

  it('keeps focus indicators and valid ARIA state while keyboard-toggling a section', async () => {
    renderSidebar();
    const navigation = screen.getByRole('navigation', { name: 'Vessel folders' });
    const safety = within(navigation).getByRole('button', { name: /Safety section, collapsed/i });

    expect(safety.className).toContain('focus-visible:ring-2');
    expect(safety).toHaveAttribute('aria-expanded', 'false');
    const closedPanelId = safety.getAttribute('aria-controls');
    expect(closedPanelId).toBeTruthy();
    expect(document.getElementById(closedPanelId ?? '')).toBeInTheDocument();

    activateWithKeyboard(safety);
    expect(safety).toHaveFocus();
    await waitFor(() => expect(safety).toHaveAttribute('aria-expanded', 'true'));
    expect(safety).toHaveAccessibleName(/Safety section, expanded/i);
    expect(document.getElementById(safety.getAttribute('aria-controls') ?? '')).toBeInTheDocument();
    expect(within(navigation).getByRole('status')).toHaveTextContent('Safety section expanded');

    activateWithKeyboard(safety);
    await waitFor(() => expect(safety).toHaveAttribute('aria-expanded', 'false'));
    expect(within(navigation).getByRole('status')).toHaveTextContent('Safety section collapsed');
  });

  it('retains accessible names, active state, and focus styling in icon-only mode', () => {
    const onExpand = vi.fn();
    renderSidebar('/vessel/logbooks/review?module=vessel', true, onExpand);
    const navigation = screen.getByRole('navigation', { name: 'Vessel folders' });
    const logbooks = within(navigation).getByRole('button', { name: /Electronic Logbooks section, contains current page.*Expand sidebar to view/i });

    expect(logbooks).toHaveAccessibleName(/Electronic Logbooks section/i);
    expect(logbooks.className).toContain('focus-visible:ring-2');
    activateWithKeyboard(logbooks);
    expect(logbooks).toHaveFocus();
    expect(onExpand).toHaveBeenCalledOnce();
  });

  it('navigates a focused leaf control and keeps its accessible name', async () => {
    renderSidebar('/vessel/logbooks/review?module=vessel');
    const crew = screen.getByRole('button', { name: /Crew section, collapsed/i });
    activateWithKeyboard(crew);
    const crewList = await screen.findByRole('button', { name: 'Crew List' });

    expect(crewList.className).toContain('focus-visible:ring-2');
    activateWithKeyboard(crewList);
    expect(crewList).toHaveFocus();
    await waitFor(() => expect(screen.getByLabelText('Current route')).toHaveTextContent('/crew/list?module=vessel'));
  });
});
