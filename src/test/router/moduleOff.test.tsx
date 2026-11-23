/**
 * Switched-off modules close their routes too (BUILD-PLAN S4 "routes
 * hidden"; gap/10 W4; spec §5.5): ModuleOff inside the shell for a module or
 * leaf whose `vessel_module_settings` key is off, for everyone; a missing
 * table means every module on (D-01); a failed read is an error with Retry
 * (fail closed); the vessel home and Calendar are never gated, whatever the
 * settings state. And the vessel switch: the target's settings decide where
 * it lands, and a failed read opens the target's home.
 */
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';

vi.mock('@/integrations/supabase/client', async () => (await import('../shell/fakeSupabase')).fakeSupabaseModule);
vi.mock('@/modules/auth/contexts/AuthContext', async () => {
  const { shellState } = await import('../shell/shellFakes');
  return { useAuth: () => shellState.auth };
});
vi.mock('@/modules/vessels/contexts/VesselContext', async () => {
  const { shellState } = await import('../shell/shellFakes');
  return { useVessel: () => shellState.vessel };
});
vi.mock('@/modules/auth/store/permissionsStore', async () => {
  const { shellState } = await import('../shell/shellFakes');
  return { usePermissionsStore: (selector: (s: object) => unknown) => selector(shellState.perm) };
});
vi.mock('@/shared/hooks/useSidebarBadgeCounts', () => ({ useSidebarBadgeCounts: () => ({ data: undefined }) }));
vi.mock('@/shared/contexts/BrandingContext', () => ({ useBrandingContext: () => ({ clientDisplayName: 'TEST', clientLogoUrl: null }) }));
vi.mock('@/shared/components/layout/InkfishFooter', () => ({ default: () => null }));
vi.mock('@/shared/components/InkfishWatermark', () => ({ default: () => null }));
vi.mock('@/shared/components/layout/topbar/TopBar', () => ({ default: () => null }));
vi.mock('@/shared/components/layout/topbar/KeyboardShortcutsDialog', () => ({ default: () => null }));
vi.mock('@/shared/components/layout/topbar/ShellShortcuts', () => ({ default: () => null }));
vi.mock('@/shared/components/layout/PageLocationHeader', () => ({ default: () => null }));
vi.mock('@/modules/feedback/components/FeedbackPanel', () => ({ default: () => null }));
vi.mock('@/modules/feedback/components/FeedbackResolvedToast', () => ({ default: () => null }));

import { VesselScopeRoute } from '@/app/router/scopes';
import { useVesselSwitch } from '@/app/nav/useVesselSwitch';
import { SHOW_ROADMAP_KEY } from '@/app/nav/roadmap';
import { SHELL_TEST_IDS } from '@/app/shell/testIds';
import { fakeDb, resetFakeDb } from '../shell/fakeSupabase';
import { DRAAK, HYDRA, XIPHIAS, asFleetUser, renderShell, resetShellState } from '../shell/shellFakes';

const MISSING = { code: '42P01', message: 'relation "public.vessel_module_settings" does not exist' };
const TIMEOUT = { code: '57014', message: 'canceling statement due to statement timeout' };
const row = (vesselId: string, moduleKey: string, enabled: boolean) => ({ vessel_id: vesselId, module_key: moduleKey, enabled, enabled_from: null, label_override: null });

const App: React.FC = () => (
  <Routes>
    <Route path="/v/:vesselCode" element={<VesselScopeRoute />}>
      <Route index element={<h1>Vessel home</h1>} />
      <Route path="technical" element={<h1>Technical overview</h1>} />
      <Route path="technical/jobs" element={<h1>Jobs page</h1>} />
      <Route path="technical/surveys" element={<h1>Surveys page</h1>} />
      <Route path="calendar" element={<h1>Vessel calendar</h1>} />
      <Route path="crew/list" element={<h1>Crew list page</h1>} />
    </Route>
  </Routes>
);

const renderAt = (path: string) => renderShell(<App />, { path });
const main = () => screen.getByTestId(SHELL_TEST_IDS.main);
const tabIds = () =>
  Array.from(document.querySelectorAll<HTMLElement>(`[data-testid^="${SHELL_TEST_IDS.moduleTabPrefix}"]`)).map((el) =>
    el.getAttribute('data-testid')?.slice(SHELL_TEST_IDS.moduleTabPrefix.length),
  );

beforeEach(() => {
  localStorage.clear();
  resetFakeDb();
  resetShellState();
  // HYDRA in scope and selected.
  asFleetUser([HYDRA, DRAAK, XIPHIAS]);
});

describe('a module switched off for the vessel', () => {
  it('renders ModuleOff in the shell, with its own h1, and the tab row has no Technical tab', async () => {
    fakeDb.tables.vessel_module_settings = [row(HYDRA.id, 'technical', false)];
    renderAt('/v/hyd/technical');
    const heading = await screen.findByRole('heading', { level: 1, name: 'Technical is switched off for HYDRA' });
    expect(main()).toContainElement(heading);
    expect(screen.queryByRole('heading', { name: 'Technical overview' })).toBeNull();
    expect(within(main()).getByText(/Ask an account admin to switch it on/)).toBeInTheDocument();
    await waitFor(() => expect(tabIds()).toContain('crew'));
    expect(tabIds()).not.toContain('technical');
  });

  it('offers Vessel Settings to someone who may open it (the cog’s rule)', async () => {
    localStorage.setItem(SHOW_ROADMAP_KEY, 'true');
    fakeDb.tables.vessel_module_settings = [row(HYDRA.id, 'technical', false)];
    renderAt('/v/hyd/technical');
    const open = await screen.findByRole('link', { name: 'Open Vessel Settings' });
    expect(open).toHaveAttribute('href', '/fleet/admin/vessel-settings/hyd');
  });

  it('gates a leaf-level key: technical.jobs off closes Jobs, not Surveys', async () => {
    fakeDb.tables.vessel_module_settings = [row(HYDRA.id, 'technical.jobs', false)];
    const { unmount } = renderAt('/v/hyd/technical/jobs');
    expect(await screen.findByRole('heading', { level: 1, name: 'Jobs is switched off for HYDRA' })).toBeInTheDocument();
    unmount();
    renderAt('/v/hyd/technical/surveys');
    expect(await screen.findByRole('heading', { name: 'Surveys page' })).toBeInTheDocument();
  });

  it('applies to the vessel whose settings say so only', async () => {
    fakeDb.tables.vessel_module_settings = [row(DRAAK.id, 'technical', false)];
    renderAt('/v/hyd/technical');
    expect(await screen.findByRole('heading', { name: 'Technical overview' })).toBeInTheDocument();
  });
});

describe('the settings table and its failures', () => {
  it('a missing table opens every module (D-01)', async () => {
    fakeDb.failures.vessel_module_settings = MISSING;
    renderAt('/v/hyd/technical');
    expect(await screen.findByRole('heading', { name: 'Technical overview' })).toBeInTheDocument();
  });

  it('a failed read is an error with Try again, never the page (fail closed), and a retry recovers', async () => {
    fakeDb.failures.vessel_module_settings = TIMEOUT;
    renderAt('/v/hyd/technical');
    const heading = await screen.findByRole('heading', { level: 1, name: "This vessel's modules could not load" }, { timeout: 4000 });
    expect(main()).toContainElement(heading);
    expect(screen.queryByRole('heading', { name: 'Technical overview' })).toBeNull();
    fakeDb.failures.vessel_module_settings = undefined;
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    });
    expect(await screen.findByRole('heading', { name: 'Technical overview' })).toBeInTheDocument();
  });

  it('waits (loading marker) while the settings load', async () => {
    fakeDb.delayMs = 40;
    renderAt('/v/hyd/technical');
    expect(within(main()).getByText('Opening HYDRA…').closest('[data-route-loading]')).toHaveAttribute('aria-busy', 'true');
    expect(await screen.findByRole('heading', { name: 'Technical overview' })).toBeInTheDocument();
  });
});

describe('pages no setting governs', () => {
  it('the vessel home and Calendar are never gated while the settings load', () => {
    fakeDb.delayMs = 1000;
    const { unmount } = renderAt('/v/hyd');
    expect(screen.getByRole('heading', { name: 'Vessel home' })).toBeInTheDocument();
    unmount();
    renderAt('/v/hyd/calendar');
    expect(screen.getByRole('heading', { name: 'Vessel calendar' })).toBeInTheDocument();
  });

  it('nor when they fail', async () => {
    fakeDb.failures.vessel_module_settings = TIMEOUT;
    renderAt('/v/hyd/calendar');
    expect(screen.getByRole('heading', { name: 'Vessel calendar' })).toBeInTheDocument();
    // Wait for the failed read itself (the shell's Retry strip shows it), not a fixed time.
    await screen.findByTestId(SHELL_TEST_IDS.moduleSettingsRetry, {}, { timeout: 4000 });
    expect(fakeDb.calls.some((c) => c.table === 'vessel_module_settings')).toBe(true);
    await act(async () => {});
    expect(screen.getByRole('heading', { name: 'Vessel calendar' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: "This vessel's modules could not load" })).toBeNull();
  });
});

describe('the vessel switch reads the target’s settings first', () => {
  const SwitchProbe: React.FC = () => {
    const switchTo = useVesselSwitch();
    return (
      <button type="button" onClick={() => switchTo({ id: HYDRA.id, code: 'HYD' })}>
        Open HYDRA
      </button>
    );
  };
  const switchFrom = async (path: string) => {
    renderShell(<SwitchProbe />, { path });
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Open HYDRA' }));
    });
  };
  const location = () => screen.getByTestId('location').textContent;

  it('keeps the sub-path when the module is on for the target', async () => {
    await switchFrom('/v/dra/crew/list?x=1');
    await waitFor(() => expect(location()).toBe('/v/hyd/crew/list?x=1'));
  });

  it('goes to the tab root when a leaf-level key is off for the target', async () => {
    fakeDb.tables.vessel_module_settings = [row(HYDRA.id, 'technical.jobs', false)];
    await switchFrom('/v/dra/technical/jobs');
    await waitFor(() => expect(location()).toBe('/v/hyd/technical'));
  });

  it('goes to the target’s home when the whole module is off there', async () => {
    fakeDb.tables.vessel_module_settings = [row(HYDRA.id, 'crew', false)];
    await switchFrom('/v/dra/crew/list');
    await waitFor(() => expect(location()).toBe('/v/hyd'));
  });

  it('opens the target’s home when its settings fail to load (fail closed)', async () => {
    fakeDb.failures.vessel_module_settings = TIMEOUT;
    await switchFrom('/v/dra/crew/list');
    await waitFor(() => expect(location()).toBe('/v/hyd'), { timeout: 4000 });
  });

  it('a missing table is every module on (D-01)', async () => {
    fakeDb.failures.vessel_module_settings = MISSING;
    await switchFrom('/fleet/training');
    await waitFor(() => expect(location()).toBe('/v/hyd/crew/training'));
  });
});
