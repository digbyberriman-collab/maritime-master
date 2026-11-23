/**
 * One workspace-access decision for Apps, the palette and the sidebar (gap/10
 * nav visibility rule step 2; D-09; spec §6.3; BUILD-PLAN S5 "results respect
 * nav visibility"). The Apps entry of a workspace (the Fleet tree's
 * WORKSPACES section) carries its gate; the workspace's own tree mostly
 * carries none, so the palette's pages and the workspace sidebar ask the same
 * entry before they walk that tree. A user the Apps menu offers no Yard gets
 * no Yard page in the palette and no Yard sidebar, even on a typed /yard URL.
 */
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';

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

import { WORKSPACE_TREES } from '@/config/navSlots';
import type { NavChild } from '@/config/navigation-types';
import { useVisibleNavLeaves } from '@/app/nav/useVisibleNav';
import { canOpenWorkspaceRoot, workspaceEntryForRoot } from '@/app/nav/workspaceAccess';
import { useWorkspaceApps } from '@/shared/components/layout/topbar/useWorkspaceApps';
import { useShellSidebar } from '@/shared/components/layout/useShellSidebar';
import type { ScopeValue } from '@/app/router/scopeContext';
import { resetFakeDb } from '../shell/fakeSupabase';
import {
  DRAAK,
  FAIL_CLOSED_NAV_ACCESS,
  VESSEL_ONLY_ACCESS,
  asVesselMaster,
  renderShell,
  resetShellState,
  shellState,
} from '../shell/shellFakes';
import type { NavAccess } from '@/app/nav/navAccess';

interface ProbeOut {
  ready: boolean;
  apps: string[];
  yardLeaves: string[];
  legalLeaves: number;
  sidebar: { available: boolean; loading: boolean; heading: string | null; nodes: number };
}

const Probe: React.FC = () => {
  const nav = useVisibleNavLeaves();
  const apps = useWorkspaceApps();
  const sidebar = useShellSidebar('workspace');
  const out: ProbeOut = {
    ready: nav.ready && apps.ready,
    apps: apps.apps.map((a) => a.label),
    yardLeaves: nav.leaves.filter((l) => l.path === '/yard' || l.path.startsWith('/yard/')).map((l) => l.path),
    legalLeaves: nav.leaves.filter((l) => l.path.startsWith('/departments/legal')).length,
    sidebar: { available: sidebar.available, loading: sidebar.loading, heading: sidebar.heading?.label ?? null, nodes: sidebar.nodes.length },
  };
  return <pre data-testid="out">{JSON.stringify(out)}</pre>;
};

const YARD: ScopeValue = { scope: 'workspace', workspace: 'yard' };
const read = (): ProbeOut => JSON.parse(screen.getByTestId('out').textContent ?? '{}');

function renderAtYard(access: NavAccess) {
  return renderShell(<Probe />, { path: '/yard/refit/overview/dashboard', scope: YARD, access });
}

beforeEach(() => {
  localStorage.clear();
  resetFakeDb();
  resetShellState();
  asVesselMaster([DRAAK]);
});

describe('a user without Yard (maintenance) access', () => {
  beforeEach(() => {
    shellState.perm = { ...shellState.perm, hasPermission: (module: string) => module !== 'maintenance' };
  });

  it('gets no Yard in Apps, no Yard page in the palette and no Yard sidebar on a /yard URL', async () => {
    renderAtYard(VESSEL_ONLY_ACCESS);
    await waitFor(() => expect(read().ready).toBe(true));
    const out = read();
    expect(out.apps).not.toContain('Yard');
    expect(out.yardLeaves).toEqual([]);
    expect(out.sidebar).toEqual({ available: false, loading: false, heading: null, nodes: 0 });
    // The other workspaces are untouched: Legal's entry is ungated.
    expect(out.apps).toContain('Legal');
    expect(out.legalLeaves).toBeGreaterThan(0);
  });
});

describe('the control: maintenance granted', () => {
  it('shows Yard in Apps, its pages in the palette and its sidebar', async () => {
    shellState.perm = { ...shellState.perm, hasPermission: () => true };
    renderAtYard(VESSEL_ONLY_ACCESS);
    await waitFor(() => expect(read().ready).toBe(true));
    const out = read();
    expect(out.apps).toContain('Yard');
    expect(out.yardLeaves.length).toBeGreaterThan(0);
    expect(out.sidebar).toMatchObject({ available: true, loading: false, heading: 'Yard' });
    expect(out.sidebar.nodes).toBeGreaterThan(0);
  });
});

describe('while access loads (fail closed)', () => {
  it('lists no Yard page and shows a skeleton sidebar, never the unfiltered tree', () => {
    shellState.perm = { ...shellState.perm, hasPermission: () => true };
    renderAtYard(FAIL_CLOSED_NAV_ACCESS);
    const out = read();
    expect(out.ready).toBe(false);
    expect(out.yardLeaves).toEqual([]);
    expect(out.sidebar).toEqual({ available: true, loading: true, heading: 'Yard', nodes: 0 });
  });
});

describe('the gate itself (pure)', () => {
  it('finds the Apps entry of every workspace tree root', () => {
    for (const tree of WORKSPACE_TREES) {
      expect(workspaceEntryForRoot(tree.path)?.path.split('?')[0], tree.id).toBe(tree.path);
    }
    expect(workspaceEntryForRoot('/nowhere')).toBeUndefined();
  });

  it('fails closed: an unknown root, a hidden entry and a planned one (Shoreside without the roadmap) do not open', () => {
    const shown = (item: NavChild) => item.status !== 'planned' && item.moduleKey !== 'maintenance';
    expect(canOpenWorkspaceRoot('/nowhere', () => true)).toBe(false);
    expect(canOpenWorkspaceRoot('/yard', shown)).toBe(false);
    expect(canOpenWorkspaceRoot('/shoreside', shown)).toBe(false);
    expect(canOpenWorkspaceRoot('/departments/legal', shown)).toBe(true);
    expect(canOpenWorkspaceRoot('/shoreside', () => true)).toBe(true);
    expect(canOpenWorkspaceRoot('/yard', () => false)).toBe(false);
  });
});
