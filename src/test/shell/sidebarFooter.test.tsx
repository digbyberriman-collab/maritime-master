/**
 * The sidebar footer's collapse toggle names itself and its shortcut in the
 * shell's icon tooltip on keyboard focus, in both states, with no native
 * title (D-92, D-106; gap/10 improvement 12). Collapsed it is icon-only, so
 * the tooltip is the only visible name; its aria-label stays the name.
 */
import { describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/modules/auth/store/permissionsStore', () => ({
  usePermissionsStore: (selector: (state: object) => unknown) => selector({ userRoles: [] }),
}));

import SidebarFooter from '@/shared/components/layout/SidebarFooter';
import { SHELL_TEST_IDS } from '@/app/shell/testIds';
import { NavAccessContext, type NavAccess } from '@/app/nav/navAccess';

const admin: NavAccess = { ready: true, legacyRole: 'dpa', rbacRoles: ['dpa'], can: () => false, fleetReach: true, vesselReach: true };

const renderFooter = (collapsed: boolean) =>
  render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <NavAccessContext.Provider value={admin}>
        <SidebarFooter collapsed={collapsed} onToggleCollapsed={() => undefined} />
      </NavAccessContext.Provider>
    </MemoryRouter>,
  );

const tooltipText = () => screen.queryByRole('tooltip')?.textContent ?? null;

describe('sidebar footer collapse toggle', () => {
  it('collapsed: the icon-only Expand button shows its name and Ctrl+B on keyboard focus, with no native title', async () => {
    renderFooter(true);
    const toggle = screen.getByTestId(SHELL_TEST_IDS.sidebarCollapse);
    expect(toggle).toHaveAccessibleName('Expand sidebar');
    expect(toggle.textContent).toBe('');
    expect(toggle).not.toHaveAttribute('title');
    expect(screen.queryByRole('tooltip')).toBeNull();
    act(() => toggle.focus());
    await waitFor(() => expect(tooltipText()).toBe('Expand sidebarCtrl+B'));
    expect(toggle).toHaveAttribute('aria-describedby');
    // The tooltip describes; the name stays the aria-label.
    expect(toggle).toHaveAccessibleName('Expand sidebar');
  });

  it('expanded: the Collapse button shows "Collapse sidebar" and Ctrl+B on keyboard focus, with no native title', async () => {
    renderFooter(false);
    const toggle = screen.getByTestId(SHELL_TEST_IDS.sidebarCollapse);
    expect(toggle).toHaveAccessibleName('Collapse sidebar to icons');
    expect(toggle).not.toHaveAttribute('title');
    act(() => toggle.focus());
    await waitFor(() => expect(tooltipText()).toBe('Collapse sidebarCtrl+B'));
    expect(toggle).toHaveAccessibleName('Collapse sidebar to icons');
  });
});
