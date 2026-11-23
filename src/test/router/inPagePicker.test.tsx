/**
 * In-page vessel pickers inside the vessel scope (LogbookWorkspace, the
 * drills tabs, certificates, IncidentAnalytics: `setSelectedVessel…`) go
 * through the same vessel switch as the top bar (D-71, IA23; D-64, gap/10
 * W2; spec §6.1 "one module-settings check for every way of entering a
 * vessel"): the picked vessel keeps the page only where it is on and visible
 * there, else its tab root, else its home; a failed settings read opens its
 * home (fail closed). A user who moves on before the switch lands keeps the
 * URL's vessel: the selection goes back to it.
 *
 * The VesselContext fake here is stateful (the shared shellFakes one ignores
 * `setSelectedVessel`), so the scope's selection sync runs for real.
 */
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { Route, Routes, useNavigate } from 'react-router-dom';

const store = vi.hoisted(() => ({
  selectedId: null as string | null,
  version: 0,
  listeners: new Set<() => void>(),
}));

vi.mock('@/integrations/supabase/client', async () => (await import('../shell/fakeSupabase')).fakeSupabaseModule);
vi.mock('@/modules/auth/contexts/AuthContext', async () => {
  const { shellState } = await import('../shell/shellFakes');
  return { useAuth: () => shellState.auth };
});
vi.mock('@/modules/vessels/contexts/VesselContext', async () => {
  const react = await import('react');
  const { shellState } = await import('../shell/shellFakes');
  const subscribe = (listener: () => void) => {
    store.listeners.add(listener);
    return () => store.listeners.delete(listener);
  };
  const select = (id: string | null) => {
    store.selectedId = id;
    store.version += 1;
    store.listeners.forEach((listener) => listener());
  };
  let cache: { version: number; base: unknown; value: unknown } | null = null;
  const snapshot = () => {
    const base = shellState.vessel;
    if (!cache || cache.version !== store.version || cache.base !== base) {
      const selected = base.vessels.find((v) => v.id === store.selectedId) ?? null;
      cache = {
        version: store.version,
        base,
        value: {
          ...base,
          selectedVesselId: selected?.id ?? null,
          selectedVessel: selected,
          setSelectedVessel: (v: { id: string } | null) => select(v?.id ?? null),
          setSelectedVesselById: (id: string | null) => select(id),
        },
      };
    }
    return cache.value;
  };
  return { useVessel: () => react.useSyncExternalStore(subscribe, snapshot) };
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
import { useVessel } from '@/modules/vessels/contexts/VesselContext';
import { vesselModuleSettingsKeys } from '@/modules/vessels/hooks/useVesselModuleSettings';
import { fakeDb, resetFakeDb } from '../shell/fakeSupabase';
import { DRAAK, HYDRA, XIPHIAS, asFleetUser, renderShell, resetShellState, testQueryClient } from '../shell/shellFakes';

const TIMEOUT = { code: '57014', message: 'canceling statement due to statement timeout' };
const row = (vesselId: string, moduleKey: string, enabled: boolean) => ({ vessel_id: vesselId, module_key: moduleKey, enabled, enabled_from: null, label_override: null });

/** As LogbookWorkspace's in-page Select does: `onValueChange={(id) => setSelectedVesselById(id)}`. */
const Picker: React.FC<{ title: string }> = ({ title }) => {
  const { setSelectedVesselById } = useVessel();
  return (
    <>
      <h1>{title}</h1>
      <button type="button" onClick={() => setSelectedVesselById(HYDRA.id)}>
        Pick HYDRA
      </button>
    </>
  );
};

/** The shell around the page (a tab, the sidebar): it can move the user while the page waits. */
const ShellLink: React.FC = () => {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate('/v/dra/crew/list')}>
      Crew tab
    </button>
  );
};

const SelectionProbe: React.FC = () => <output data-testid="selected">{useVessel().selectedVessel?.name ?? 'none'}</output>;

const App: React.FC = () => (
  <>
    <Routes>
      <Route path="/v/:vesselCode" element={<VesselScopeRoute />}>
        <Route index element={<h1>Vessel home</h1>} />
        <Route path="logbooks" element={<h1>Logbooks root</h1>} />
        <Route path="logbooks/:logbookSlug" element={<Picker title="Official log page" />} />
        <Route path="crew" element={<h1>Crew root</h1>} />
        <Route path="crew/list" element={<h1>Crew list page</h1>} />
        <Route path="crew/hours-of-rest" element={<Picker title="Hours of rest page" />} />
      </Route>
    </Routes>
    <ShellLink />
    <SelectionProbe />
  </>
);

const location = () => screen.getByTestId('location').textContent;
const selected = () => screen.getByTestId('selected').textContent;

async function pickHydraFrom(path: string, title: string, queryClient = testQueryClient()) {
  renderShell(<App />, { path, queryClient });
  expect(await screen.findByRole('heading', { name: title })).toBeInTheDocument();
  act(() => {
    fireEvent.click(screen.getByRole('button', { name: 'Pick HYDRA' }));
  });
}

beforeEach(() => {
  localStorage.clear();
  resetFakeDb();
  resetShellState();
  asFleetUser([DRAAK, HYDRA, XIPHIAS]);
  store.selectedId = DRAAK.id;
  store.version += 1;
});

describe('an in-page pick inside the vessel scope', () => {
  it('keeps the page when it is on for the picked vessel', async () => {
    await pickHydraFrom('/v/dra/logbooks/official-log?day=2', 'Official log page');
    await waitFor(() => expect(location()).toBe('/v/hyd/logbooks/official-log?day=2'));
    expect(await screen.findByRole('heading', { name: 'Official log page' })).toBeInTheDocument();
    expect(selected()).toBe('HYDRA');
  });

  it('opens the vessel home when the module is off there (never ModuleOff)', async () => {
    fakeDb.tables.vessel_module_settings = [row(HYDRA.id, 'logbooks', false)];
    await pickHydraFrom('/v/dra/logbooks/official-log', 'Official log page');
    // The wait is named after the picked vessel.
    expect(screen.getByText('Opening HYDRA…')).toBeInTheDocument();
    await waitFor(() => expect(location()).toBe('/v/hyd'));
    expect(await screen.findByRole('heading', { name: 'Vessel home' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /is switched off/ })).toBeNull();
  });

  it('opens the tab root when a leaf-level key is off there', async () => {
    fakeDb.tables.vessel_module_settings = [row(HYDRA.id, 'crew_hor', false)];
    await pickHydraFrom('/v/dra/crew/hours-of-rest', 'Hours of rest page');
    await waitFor(() => expect(location()).toBe('/v/hyd/crew'));
    expect(await screen.findByRole('heading', { name: 'Crew root' })).toBeInTheDocument();
  });

  it('opens the vessel home when the picked vessel’s settings fail to load (fail closed)', async () => {
    const queryClient = testQueryClient();
    renderShell(<App />, { path: '/v/dra/logbooks/official-log', queryClient });
    expect(await screen.findByRole('heading', { name: 'Official log page' })).toBeInTheDocument();
    // DRAAK's settings are in; from now on every read fails, so HYDRA's does.
    fakeDb.failures.vessel_module_settings = TIMEOUT;
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Pick HYDRA' }));
    });
    await waitFor(() => expect(location()).toBe('/v/hyd'), { timeout: 4000 });
  });

  it('gives the URL back its vessel when the user moves on before the switch lands', async () => {
    const queryClient = testQueryClient();
    renderShell(<App />, { path: '/v/dra/logbooks/official-log', queryClient });
    expect(await screen.findByRole('heading', { name: 'Official log page' })).toBeInTheDocument();
    fakeDb.delayMs = 200;
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Pick HYDRA' }));
    });
    expect(screen.getByText('Opening HYDRA…')).toBeInTheDocument();
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Crew tab' }));
    });
    // Right after the navigation, before HYDRA's settings arrive: DRAAK again.
    expect(await screen.findByRole('heading', { name: 'Crew list page' })).toBeInTheDocument();
    expect(selected()).toBe('DRAAK');
    expect(queryClient.getQueryState(vesselModuleSettingsKeys.vessel(HYDRA.id))?.status).not.toBe('success');
    // Once they arrive, the abandoned switch does not move the user.
    await waitFor(() => expect(queryClient.getQueryState(vesselModuleSettingsKeys.vessel(HYDRA.id))?.status).toBe('success'));
    await act(async () => {});
    expect(location()).toBe('/v/dra/crew/list');
    expect(selected()).toBe('DRAAK');
  });
});
