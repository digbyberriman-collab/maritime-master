/**
 * The vessel switch as callers use it (gap/10 W2, IA23; spec §6.2): the
 * latest selection wins across every caller, and a switch is abandoned when
 * the user navigates elsewhere before it lands (the top bar mounts
 * `useInvalidateVesselSwitchOnNavigate` for the whole shell) or closes the
 * switcher (`cancelPendingVesselSwitch`). A switch the user waits for still
 * lands, and a failed settings read still opens the vessel home.
 *
 * No sleeps: each "it did not move" check first waits for the target's
 * settings read to answer, so a slow read fails the test instead of passing.
 */
import React from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { QueryClient } from '@tanstack/react-query';

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

import { cancelPendingVesselSwitch, useInvalidateVesselSwitchOnNavigate, useVesselSwitch } from '@/app/nav/useVesselSwitch';
import { readRecentVessels } from '@/app/nav/recentVessels';
import { vesselModuleSettingsQueryOptions } from '@/modules/vessels/hooks/useVesselModuleSettings';
import { fakeDb, resetFakeDb } from '../shell/fakeSupabase';
import { DRAAK, HYDRA, USER_ID, XIPHIAS, asFleetUser, renderShell, resetShellState } from '../shell/shellFakes';

beforeAll(() => {
  Element.prototype.scrollIntoView = () => undefined;
});

beforeEach(() => {
  localStorage.clear();
  resetFakeDb();
  resetShellState();
  asFleetUser([HYDRA, DRAAK, XIPHIAS]);
});

const location = () => screen.getByTestId('location').textContent;

/** Every location the router showed, in order. */
let visited: string[] = [];
const History: React.FC = () => {
  const { pathname } = useLocation();
  React.useEffect(() => {
    visited.push(pathname);
  }, [pathname]);
  return null;
};

/** What the top bar does for the whole shell. */
const ShellInvalidator: React.FC = () => {
  useInvalidateVesselSwitchOnNavigate();
  return null;
};

const Picker: React.FC<{ name: string; onPick?: () => void }> = ({ name, onPick }) => {
  const switchTo = useVesselSwitch();
  return (
    <>
      <button type="button" onClick={() => { onPick?.(); switchTo({ id: HYDRA.id, code: 'HYD' }); }}>{`${name}: HYDRA`}</button>
      <button type="button" onClick={() => switchTo({ id: XIPHIAS.id, code: 'XIP' })}>{`${name}: XIPHIAS`}</button>
    </>
  );
};

const Elsewhere: React.FC = () => {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate('/fleet/documents')}>
      Documents
    </button>
  );
};

function renderCallers(ui: React.ReactNode, path = '/v/dra/crew/list') {
  visited = [];
  return renderShell(
    <>
      <ShellInvalidator />
      <History />
      {ui}
      <Elsewhere />
    </>,
    { path },
  );
}

/** Wait until the target's settings read has answered, then let its continuation run. */
async function settingsAnswered(queryClient: QueryClient, vesselId: string) {
  await waitFor(() => {
    const status = queryClient.getQueryState(vesselModuleSettingsQueryOptions(vesselId).queryKey)?.status;
    expect(status === 'success' || status === 'error').toBe(true);
  });
  await act(async () => {});
}

const click = (name: string) => act(() => fireEvent.click(screen.getByRole('button', { name })));

describe('a switch the user waits for', () => {
  it('lands, keeping the sub-path, and records the vessel', async () => {
    renderCallers(<Picker name="switcher" />);
    click('switcher: HYDRA');
    await waitFor(() => expect(location()).toBe('/v/hyd/crew/list'));
    expect(readRecentVessels(USER_ID)[0]).toBe(HYDRA.id);
  });

  it('a failed settings read opens the vessel home', async () => {
    fakeDb.failures.vessel_module_settings = { code: '57014', message: 'canceling statement due to statement timeout' };
    renderCallers(<Picker name="switcher" />);
    click('switcher: HYDRA');
    await waitFor(() => expect(location()).toBe('/v/hyd'), { timeout: 5000 });
  });
});

describe('an abandoned switch never navigates later', () => {
  it('the user navigates elsewhere while the settings load: they stay there', async () => {
    fakeDb.delayMs = 200;
    const { queryClient } = renderCallers(<Picker name="switcher" />);
    click('switcher: HYDRA');
    click('Documents');
    expect(location()).toBe('/fleet/documents');
    await settingsAnswered(queryClient, HYDRA.id);
    expect(location()).toBe('/fleet/documents');
    expect(visited).not.toContain('/v/hyd/crew/list');
    expect(readRecentVessels(USER_ID)).not.toContain(HYDRA.id);
  });

  it('a caller that unmounts on pick (the palette), then the user navigates: no late navigation', async () => {
    fakeDb.delayMs = 200;
    const Palette: React.FC = () => {
      const [open, setOpen] = React.useState(true);
      return open ? <Picker name="palette" onPick={() => setOpen(false)} /> : null;
    };
    const { queryClient } = renderCallers(<Palette />);
    click('palette: HYDRA');
    expect(screen.queryByRole('button', { name: 'palette: HYDRA' })).toBeNull();
    click('Documents');
    await settingsAnswered(queryClient, HYDRA.id);
    expect(location()).toBe('/fleet/documents');
  });

  it('a caller that unmounts on pick still lands when the user waits', async () => {
    fakeDb.delayMs = 50;
    const Palette: React.FC = () => {
      const [open, setOpen] = React.useState(true);
      return open ? <Picker name="palette" onPick={() => setOpen(false)} /> : null;
    };
    renderCallers(<Palette />);
    click('palette: HYDRA');
    await waitFor(() => expect(location()).toBe('/v/hyd/crew/list'));
  });

  it('closing the switcher cancels the switch in flight', async () => {
    fakeDb.delayMs = 200;
    const { queryClient } = renderCallers(<Picker name="switcher" />);
    click('switcher: HYDRA');
    act(() => cancelPendingVesselSwitch());
    await settingsAnswered(queryClient, HYDRA.id);
    expect(location()).toBe('/v/dra/crew/list');
  });
});

describe('latest selection wins across callers', () => {
  it('two callers: the later switch wins and the earlier never navigates', async () => {
    fakeDb.delayMs = 100;
    const { queryClient } = renderCallers(
      <>
        <Picker name="switcher" />
        <Picker name="palette" />
      </>,
    );
    click('switcher: HYDRA');
    click('palette: XIPHIAS');
    await waitFor(() => expect(location()).toBe('/v/xip/crew/list'));
    await settingsAnswered(queryClient, HYDRA.id);
    expect(location()).toBe('/v/xip/crew/list');
    expect(visited).not.toContain('/v/hyd/crew/list');
  });
});
