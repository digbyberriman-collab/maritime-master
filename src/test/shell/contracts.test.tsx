/**
 * Phase 1 cross-lane contracts owned by the shell (BUILD-PLAN S1–S5): the
 * visible-nav list the palette reads, the vessel switch target, keyboard
 * helpers and the harness test ids. The palette's own API contract is pinned
 * in src/shared/components/command-palette/contract.test.tsx. These pin the
 * shapes both lanes code against; behaviour tests live with each feature.
 */
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';

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

import { Circle } from 'lucide-react';
import { collectVisibleLeaves, useVisibleNavLeaves } from '@/app/nav/useVisibleNav';
import { SHOW_ROADMAP_KEY } from '@/app/nav/roadmap';
import type { ScopeValue } from '@/app/router/scopeContext';
import { fakeDb, resetFakeDb } from './fakeSupabase';
import { DRAAK, FAIL_CLOSED_NAV_ACCESS, asFleetUser, renderShell, resetShellState } from './shellFakes';
import { vesselSwitchTarget } from '@/app/nav/vesselSwitch';
import { isEditableTarget, isPaletteShortcut, KEYBOARD_SHORTCUTS } from '@/app/shell/keyboard';
import { PALETTE_TEST_IDS, SHELL_TEST_IDS } from '@/app/shell/testIds';
import type { NavChild, NavItem } from '@/config/navigation-types';

const leaf = (id: string, label: string, path: string, extra: Partial<NavChild> = {}): NavChild => ({
  id, label, path, icon: Circle, kind: 'leaf', status: 'live', ...extra,
});

describe('visible nav leaves', () => {
  const modules: NavItem[] = [
    {
      id: 'fleet', label: 'Fleet', icon: Circle, path: '/fleet', permissions: ['all'], scope: 'fleet',
      children: [
        { id: 's-overview', label: 'Overview', path: '/fleet', icon: Circle, kind: 'section', children: [
          leaf('dash', 'Dashboard', '/fleet/dashboard'),
          leaf('safety', 'Safety queue', '/fleet/safety', { status: 'planned' }),
        ] },
        { id: 's-ws', label: 'Workspaces', path: '/fleet', icon: Circle, kind: 'section', children: [
          leaf('hris-link', 'HRIS', '/hris', { crossLink: true, scope: 'workspace' }),
        ] },
      ],
    },
    {
      id: 'hris', label: 'HRIS', icon: Circle, path: '/hris', permissions: ['all'], scope: 'workspace',
      children: [leaf('hris-home', 'HRIS home', '/hris')],
    },
  ];

  it('fails closed: nothing when no node may show', () => {
    expect(collectVisibleLeaves(modules, () => false)).toEqual([]);
  });

  it('keeps leaves that pass, with their trail, own leaves before cross-links, one per path', () => {
    const leaves = collectVisibleLeaves(modules, (item) => item.status !== 'planned');
    expect(leaves.map((l) => [l.label, l.path, l.trail.join(' › '), l.scope])).toEqual([
      ['Dashboard', '/fleet/dashboard', 'Fleet › Overview', 'fleet'],
      ['HRIS home', '/hris', 'HRIS', 'workspace'],
    ]);
  });

  it('drops the leaves under a hidden group or section', () => {
    const leaves = collectVisibleLeaves(modules, (item) => item.id !== 's-overview');
    expect(leaves.map((l) => l.id)).toEqual(['hris-home']);
  });
});

describe('useVisibleNavLeaves on the resolved vessel nav (S4)', () => {
  const VESSEL: ScopeValue = { scope: 'vessel', vessel: DRAAK, vesselCode: 'DRA' };
  const Probe: React.FC = () => {
    const nav = useVisibleNavLeaves();
    return <pre data-testid="leaves">{JSON.stringify({ ready: nav.ready, leaves: nav.leaves.map((l) => [l.label, l.path, l.trail.join(' › ')]) })}</pre>;
  };
  const read = (): { ready: boolean; leaves: [string, string, string][] } => JSON.parse(screen.getByTestId('leaves').textContent ?? '{}');

  beforeEach(() => {
    localStorage.clear();
    resetFakeDb();
    resetShellState();
    fakeDb.tables.vessel_module_settings = [
      { vessel_id: DRAAK.id, module_key: 'planner', enabled: true, enabled_from: null, label_override: 'Leave' },
      { vessel_id: DRAAK.id, module_key: 'technical', enabled: false, enabled_from: null, label_override: null },
    ];
  });

  it('lists the vessel’s leaves with the real code and its labels, without the modules it switched off', async () => {
    renderShell(<Probe />, { path: '/v/dra/crew/list', scope: VESSEL });
    await waitFor(() => expect(read().ready).toBe(true));
    const { leaves } = read();
    expect(leaves).toContainEqual(['Crew List', '/v/dra/crew/list', 'Vessel › Crew']);
    expect(leaves).toContainEqual(['Leave', '/v/dra/crew/planner', 'Vessel › Crew']);
    expect(leaves).toContainEqual(['Home', '/v/dra', 'Vessel']);
    expect(leaves).toContainEqual(['Dashboard', '/fleet/dashboard', 'Fleet › Overview']);
    expect(leaves.some(([, path]) => path.includes(':vesselCode'))).toBe(false);
    expect(leaves.some(([, path]) => path.startsWith('/v/dra/technical'))).toBe(false);
    // The vessel's Planner goes by its override; Fleet › Planner keeps its own name.
    expect(leaves.filter(([label]) => label === 'Planner').map(([, path]) => path)).toEqual(['/fleet/planner']);
  });

  it('leaves out locked add-ons (Deck Plans, with Show roadmap on)', async () => {
    localStorage.setItem(SHOW_ROADMAP_KEY, 'true');
    fakeDb.tables.vessel_module_settings = [];
    renderShell(<Probe />, { path: '/v/dra', scope: VESSEL });
    await waitFor(() => expect(read().ready).toBe(true));
    const { leaves } = read();
    expect(leaves.some(([label]) => label === 'Jobs')).toBe(true);
    expect(leaves.some(([label]) => label === 'Deck Plans')).toBe(false);
  });

  it('fails closed while access or the vessel’s settings load', async () => {
    fakeDb.delayMs = 40;
    renderShell(<Probe />, { path: '/v/dra', scope: VESSEL });
    expect(read()).toEqual({ ready: false, leaves: [] });
    await waitFor(() => expect(read().ready).toBe(true));
    const { unmount } = renderShell(<Probe />, { path: '/fleet/dashboard', access: FAIL_CLOSED_NAV_ACCESS, scope: { scope: 'fleet' } });
    expect(screen.getAllByTestId('leaves').at(-1)?.textContent).toBe(JSON.stringify({ ready: false, leaves: [] }));
    unmount();
  });

  it('lists no vessel leaves when no vessel is known', async () => {
    asFleetUser([]);
    renderShell(<Probe />, { path: '/fleet/dashboard', scope: { scope: 'fleet' } });
    await waitFor(() => expect(read().ready).toBe(true));
    expect(read().leaves.some(([, path]) => path.startsWith('/v/'))).toBe(false);
    expect(read().leaves.length).toBeGreaterThan(0);
  });
});

describe('vessel switch target', () => {
  it('keeps the sub-path, query and hash inside the vessel scope', () => {
    expect(vesselSwitchTarget({ currentPath: '/v/dra/crew/list?tab=all#x', targetCode: 'HYD', isModuleOn: () => true })).toBe(
      '/v/hyd/crew/list?tab=all#x',
    );
  });

  it("opens the vessel's home from outside the vessel scope", () => {
    expect(vesselSwitchTarget({ currentPath: '/hris/people', targetCode: 'hyd', isModuleOn: () => true })).toBe('/v/hyd');
  });

  it('takes the optional isVisible (absent = visible) and falls back to the vessel home when nothing on the way is visible', () => {
    expect(vesselSwitchTarget({ currentPath: '/v/dra/crew/list', targetCode: 'hyd', isModuleOn: () => true, isVisible: () => false })).toBe('/v/hyd');
    expect(vesselSwitchTarget({ currentPath: '/fleet/training', targetCode: 'hyd', isModuleOn: () => true })).toBe('/v/hyd/crew/training');
  });
});

describe('shell actions', () => {
  it('default to none outside a shell, so callers hide what they cannot open', async () => {
    const { NO_SHELL_ACTIONS } = await import('@/app/shell/shellActions');
    expect(NO_SHELL_ACTIONS).toEqual({});
  });
});

describe('keyboard helpers', () => {
  it('knows when the user is typing', () => {
    const input = document.createElement('input');
    const div = document.createElement('div');
    expect(isEditableTarget(input)).toBe(true);
    expect(isEditableTarget(div)).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });

  it('accepts ⌘K and Ctrl+K only', () => {
    const base = { key: 'k', metaKey: false, ctrlKey: false, altKey: false, shiftKey: false };
    expect(isPaletteShortcut({ ...base, metaKey: true })).toBe(true);
    expect(isPaletteShortcut({ ...base, ctrlKey: true, key: 'K' })).toBe(true);
    expect(isPaletteShortcut(base)).toBe(false);
    expect(isPaletteShortcut({ ...base, ctrlKey: true, shiftKey: true })).toBe(false);
  });

  it('lists each shortcut once', () => {
    const ids = KEYBOARD_SHORTCUTS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('harness test ids', () => {
  it('are unique strings', () => {
    const values = [...Object.values(SHELL_TEST_IDS), ...Object.values(PALETTE_TEST_IDS)];
    expect(new Set(values).size).toBe(values.length);
    for (const v of values) expect(v).toMatch(/^[a-z][a-z0-9-]+$/);
  });
});
