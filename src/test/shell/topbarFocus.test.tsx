/**
 * Where focus starts in the top bar's popovers (gap/10 improvement 12; spec
 * §6.5): Help on its first row (How-to guides), Apps on the current
 * workspace's tile else the first, the bell on its first alert else the
 * panel itself; never on the bell's first-run "Got it", and dismissing that
 * hint keeps focus in the panel.
 */
import React from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';

vi.mock('@/integrations/supabase/client', async () => (await import('./fakeSupabase')).fakeSupabaseModule);
vi.mock('@/modules/auth/contexts/AuthContext', async () => {
  const { shellState } = await import('./shellFakes');
  return { useAuth: () => shellState.auth };
});
vi.mock('@/modules/vessels/contexts/VesselContext', async () => {
  const { shellState } = await import('./shellFakes');
  return { useVessel: () => shellState.vessel };
});
vi.mock('@/modules/auth/store/permissionsStore', async () => {
  const { shellState } = await import('./shellFakes');
  return { usePermissionsStore: (selector: (s: object) => unknown) => selector(shellState.perm) };
});
vi.mock('@/modules/feedback/store/feedbackStore', async () => {
  const { shellState } = await import('./shellFakes');
  return { useFeedbackStore: (selector?: (s: object) => unknown) => (selector ? selector(shellState.feedback) : shellState.feedback) };
});

import HelpMenu from '@/shared/components/layout/topbar/HelpMenu';
import AppsMenu from '@/shared/components/layout/topbar/AppsMenu';
import NotificationBell from '@/shared/components/layout/NotificationBell';
import { ShellActionsContext } from '@/app/shell/shellActions';
import { SHELL_TEST_IDS } from '@/app/shell/testIds';
import { fakeDb, resetFakeDb } from './fakeSupabase';
import { COMPANY_ID, DRAAK, FLEET_ACCESS, renderShell, resetShellState } from './shellFakes';

beforeAll(() => {
  Element.prototype.scrollIntoView = () => undefined;
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => undefined;
});

beforeEach(() => {
  localStorage.clear();
  resetFakeDb();
  resetShellState();
});

const alertRow = (id: string, severity = 'RED') => ({
  id,
  title: `Alert ${id}`,
  description: null,
  severity_color: severity,
  status: 'OPEN',
  vessel_id: DRAAK.id,
  due_at: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  related_entity_type: null,
  related_entity_id: null,
  source_module: null,
  company_id: COMPANY_ID,
});

const openWithKeyboard = (trigger: HTMLElement) => {
  act(() => trigger.focus());
  // A popover trigger is a button: Enter clicks it.
  fireEvent.click(trigger);
};

describe('Help', () => {
  it('starts on the first row, How-to guides (not on "Report a problem")', async () => {
    renderShell(
      <ShellActionsContext.Provider value={{ openKeyboardShortcuts: () => undefined }}>
        <HelpMenu />
      </ShellActionsContext.Provider>,
    );
    openWithKeyboard(screen.getByTestId(SHELL_TEST_IDS.helpTrigger));
    const menu = await screen.findByTestId(SHELL_TEST_IDS.helpMenu);
    await waitFor(() => expect(within(menu).getByRole('link', { name: /How-to guides/ })).toHaveFocus());
  });
});

describe('Apps', () => {
  it('starts on the first tile', async () => {
    renderShell(<AppsMenu />, { path: '/fleet/dashboard', access: FLEET_ACCESS });
    openWithKeyboard(await screen.findByTestId(SHELL_TEST_IDS.appsTrigger));
    const menu = await screen.findByTestId(SHELL_TEST_IDS.appsMenu);
    await waitFor(() => expect(within(menu).getAllByRole('link')[0]).toHaveFocus());
    expect(document.activeElement).toHaveTextContent('HRIS');
  });

  it('starts on the current workspace tile', async () => {
    renderShell(<AppsMenu />, { path: '/health/spa/dashboard', access: FLEET_ACCESS });
    openWithKeyboard(await screen.findByTestId(SHELL_TEST_IDS.appsTrigger));
    const menu = await screen.findByTestId(SHELL_TEST_IDS.appsMenu);
    await waitFor(() => expect(document.activeElement?.getAttribute('aria-current')).toBe('true'));
    expect(menu.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toHaveTextContent('Health & Wellness');
  });
});

describe('the bell', () => {
  it('starts on the first alert, never on the first-run "Got it"', async () => {
    fakeDb.tables.alerts = [alertRow('a'), alertRow('b', 'YELLOW')];
    renderShell(<NotificationBell />);
    const trigger = screen.getByTestId(SHELL_TEST_IDS.notificationsTrigger);
    // Open once the alerts are in, as a user would after seeing the badge.
    await waitFor(() => expect(trigger.querySelector('[data-tone]')).not.toBeNull());
    openWithKeyboard(trigger);
    const panel = await screen.findByTestId(SHELL_TEST_IDS.notificationsPanel);
    expect(within(panel).getByRole('button', { name: 'Got it' })).toBeInTheDocument();
    await waitFor(() => expect(document.activeElement).toHaveAttribute('data-alert-row'));
    expect(document.activeElement).toHaveTextContent('Alert a');
  });

  it('with no alerts, starts on the panel itself', async () => {
    fakeDb.tables.alerts = [];
    renderShell(<NotificationBell />);
    const trigger = screen.getByTestId(SHELL_TEST_IDS.notificationsTrigger);
    await waitFor(() => expect(fakeDb.calls.filter((c) => c.table === 'alerts').length).toBe(3));
    openWithKeyboard(trigger);
    const panel = await screen.findByTestId(SHELL_TEST_IDS.notificationsPanel);
    await waitFor(() => expect(panel).toHaveFocus());
    expect(panel).toHaveAccessibleName('Notifications');
  });

  it('"Got it" keeps focus in the panel (on the first alert), never on the page', async () => {
    fakeDb.tables.alerts = [alertRow('a')];
    renderShell(<NotificationBell />);
    const trigger = screen.getByTestId(SHELL_TEST_IDS.notificationsTrigger);
    await waitFor(() => expect(trigger.querySelector('[data-tone]')).not.toBeNull());
    openWithKeyboard(trigger);
    const panel = await screen.findByTestId(SHELL_TEST_IDS.notificationsPanel);
    const gotIt = within(panel).getByRole('button', { name: 'Got it' });
    act(() => gotIt.focus());
    fireEvent.click(gotIt);
    await waitFor(() => expect(within(panel).queryByRole('button', { name: 'Got it' })).toBeNull());
    expect(document.activeElement).not.toBe(document.body);
    expect(panel.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toHaveAttribute('data-alert-row');
  });
});
