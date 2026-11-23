/**
 * The vessel-list Retry strip (D-04, D-76; gap/10 A.12). While the vessel
 * list has failed to load, the shell says so under the top bar in every
 * scope and offers Retry: a polite status, warning tokens, a 44 px target on
 * touch. It stays while the retry runs (the button waits) and goes only once
 * a load succeeds (VesselContext latches `loadError` until then).
 *
 * VesselContext is a local fake (hoisted state); the strips are the real
 * ShellNotices.
 */
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const h = vi.hoisted(() => ({
  vessel: {
    loadError: null as { message: string } | null,
    loading: false,
    retryVessels: (() => Promise.resolve()) as () => Promise<void>,
  },
}));

vi.mock('@/integrations/supabase/client', async () => (await import('./fakeSupabase')).fakeSupabaseModule);
vi.mock('@/modules/vessels/contexts/VesselContext', () => ({ useVessel: () => h.vessel }));
// The vessel scope's module-settings strip reads the vessel's settings; here they loaded.
vi.mock('@/app/nav/useVesselNav', () => ({ useVesselNav: () => ({ status: 'ready', retrying: false, retry: () => undefined }) }));

import { usePermissionsStore } from '@/modules/auth/store/permissionsStore';
import ShellNotices from '@/shared/components/layout/topbar/ShellNotices';
import { VESSEL_LIST_ERROR_MESSAGE } from '@/shared/components/layout/topbar/VesselListNotice';
import { ScopeContext, type ScopeValue } from '@/app/router/scopeContext';
import { SHELL_TEST_IDS } from '@/app/shell/testIds';

const SCOPES: readonly ScopeValue[] = [
  { scope: 'fleet' },
  { scope: 'vessel', vesselCode: 'DRA' },
  { scope: 'personal' },
  { scope: 'workspace', workspace: 'hris' },
];

const retryVessels = vi.fn(async () => undefined);

function renderNotices(scope: ScopeValue = SCOPES[0]) {
  return render(
    <MemoryRouter>
      <ScopeContext.Provider value={scope}>
        <ShellNotices />
      </ScopeContext.Provider>
    </MemoryRouter>,
  );
}

const strip = () => screen.queryByText(VESSEL_LIST_ERROR_MESSAGE)?.closest('[role="status"]') ?? null;
const retryButton = () => screen.getByTestId(SHELL_TEST_IDS.vesselListRetry);

beforeEach(() => {
  retryVessels.mockClear();
  h.vessel = { loadError: null, loading: false, retryVessels };
  usePermissionsStore.setState({ error: null, isLoading: false, isInitialized: true });
});

describe('the vessel-list Retry strip', () => {
  it.each(SCOPES)('is absent in the $scope scope while the list has loaded', (scope) => {
    renderNotices(scope);
    expect(screen.getByTestId(SHELL_TEST_IDS.shellNotices)).toBeEmptyDOMElement();
    expect(screen.queryByTestId(SHELL_TEST_IDS.vesselListRetry)).toBeNull();
  });

  it.each(SCOPES)('shows in the $scope scope on an error, as a polite status with a Retry that reloads once', (scope) => {
    h.vessel = { loadError: { message: 'Service Unavailable' }, loading: false, retryVessels };
    renderNotices(scope);
    const region = strip();
    expect(region).not.toBeNull();
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(region).toHaveClass('border-warning/25', 'bg-warning-muted', 'text-warning');
    expect(retryButton()).toBeEnabled();
    expect(retryButton()).toHaveTextContent('Retry');
    expect(retryButton()).not.toHaveAttribute('aria-busy');
    expect(retryButton().className).toContain('[@media(pointer:coarse)]:h-11');
    fireEvent.click(retryButton());
    expect(retryVessels).toHaveBeenCalledTimes(1);
  });

  it('stays while the retry loads, with the button waiting, and goes once a load succeeds', () => {
    h.vessel = { loadError: { message: 'Service Unavailable' }, loading: false, retryVessels };
    const view = renderNotices();

    // The retry is running: the error is latched, so the strip stays.
    h.vessel = { loadError: { message: 'Service Unavailable' }, loading: true, retryVessels };
    view.rerender(
      <MemoryRouter>
        <ScopeContext.Provider value={SCOPES[0]}>
          <ShellNotices />
        </ScopeContext.Provider>
      </MemoryRouter>,
    );
    expect(strip()).not.toBeNull();
    expect(retryButton()).toBeDisabled();
    expect(retryButton()).toHaveAttribute('aria-busy', 'true');
    expect(retryButton()).toHaveTextContent('Retrying…');
    expect(retryButton().querySelector('svg')).toHaveClass('motion-safe:animate-spin');
    fireEvent.click(retryButton());
    expect(retryVessels).not.toHaveBeenCalled();

    // The load succeeded: VesselContext clears the error.
    h.vessel = { loadError: null, loading: false, retryVessels };
    view.rerender(
      <MemoryRouter>
        <ScopeContext.Provider value={SCOPES[0]}>
          <ShellNotices />
        </ScopeContext.Provider>
      </MemoryRouter>,
    );
    expect(strip()).toBeNull();
    expect(screen.getByTestId(SHELL_TEST_IDS.shellNotices)).toBeEmptyDOMElement();
  });

  it('sits after the RBAC strip when both show', () => {
    usePermissionsStore.setState({ error: 'Failed to load permissions' });
    h.vessel = { loadError: { message: 'Service Unavailable' }, loading: false, retryVessels };
    renderNotices();
    const container = screen.getByTestId(SHELL_TEST_IDS.shellNotices);
    const ids = Array.from(container.querySelectorAll('[data-testid]')).map((n) => n.getAttribute('data-testid'));
    expect(ids).toEqual([SHELL_TEST_IDS.rbacRetry, SHELL_TEST_IDS.vesselListRetry]);
    act(() => {
      usePermissionsStore.setState({ error: null });
    });
  });
});

describe('useVessel outside a VesselProvider', () => {
  it('throws, unless asked for optionally, which reads null (so the strip shows nothing)', async () => {
    const actual = await vi.importActual<typeof import('@/modules/vessels/contexts/VesselContext')>(
      '@/modules/vessels/contexts/VesselContext',
    );
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => actual.useVessel())).toThrow(/within a VesselProvider/);
    const { result } = renderHook(() => actual.useVessel({ optional: true }));
    expect(result.current).toBeNull();
  });
});
