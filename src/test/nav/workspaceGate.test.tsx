/**
 * One workspace-access decision for Apps, the palette and the sidebar (gap/10
 * nav visibility rule step 2; D-09; spec §6.3; BUILD-PLAN S5 "results respect
 * nav visibility"). The Apps entry of a workspace (the Fleet tree's
 * WORKSPACES section) carries its gate; the workspace's own tree mostly
 * carries none, so the palette's pages and the workspace sidebar ask the same
 * entry before they walk that tree. A user the Apps menu offers no Yard gets
 * no Yard page in the palette and no Yard sidebar, even on a typed /yard URL.
 *
 * The Health entry passes on medical or wellness access (moduleKey `health`,
 * the rule of `canAccessModule('health')`), so a medical-only user gets the
 * workspace and the tree's own gates keep them to the Medical group. HRIS is
 * unchanged: its entry needs HR access, so finance without HR opens nothing.
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

// ─── Health & HRIS personas (D-97: the Apps entry decides; the Health entry
// passes on medical OR wellness access, as canAccessModule('health') does) ──

interface PersonaOut {
  ready: boolean;
  apps: Array<{ label: string; path: string }>;
  /** Palette leaves whose path is under the prefix. */
  leaves: string[];
  /** Palette leaves of the workspace tree itself (trail starts with its label). */
  treeLeaves: string[];
  sidebar: { available: boolean; loading: boolean; heading: string | null; groups: string[] };
}

const PersonaProbe: React.FC<{ prefix: string; tree: string }> = ({ prefix, tree }) => {
  const nav = useVisibleNavLeaves();
  const apps = useWorkspaceApps();
  const sidebar = useShellSidebar('workspace');
  const out: PersonaOut = {
    ready: nav.ready && apps.ready,
    apps: apps.apps.map((a) => ({ label: a.label, path: a.path })),
    leaves: nav.leaves.filter((l) => l.path === prefix || l.path.startsWith(`${prefix}/`)).map((l) => l.path),
    treeLeaves: nav.leaves.filter((l) => l.trail[0] === tree).map((l) => l.path),
    sidebar: {
      available: sidebar.available,
      loading: sidebar.loading,
      heading: sidebar.heading?.label ?? null,
      groups: sidebar.nodes.map((n) => n.label),
    },
  };
  return <pre data-testid="persona">{JSON.stringify(out)}</pre>;
};
const readPersona = (): PersonaOut => JSON.parse(screen.getByTestId('persona').textContent ?? '{}');

/** An RBAC permission row (fleet scope unless said). */
const permRow = (module_key: string, scope = 'fleet') => ({
  module_key, module_name: module_key, can_view: true, can_edit: false, can_admin: false, scope, restrictions: null,
});

/** A user with a legacy role that grants nothing here, the given RBAC roles and rows, and no other module. */
function persona(legacyRole: string, roles: string[], permissions: ReturnType<typeof permRow>[]) {
  shellState.auth.profile = { ...shellState.auth.profile, role: legacyRole };
  shellState.perm = { ...shellState.perm, userRoles: roles.map((role_name) => ({ role_name })), permissions, hasPermission: () => false };
}

const HEALTH_SCOPE: ScopeValue = { scope: 'workspace', workspace: 'health' };
const HRIS_SCOPE: ScopeValue = { scope: 'workspace', workspace: 'hris' };
const atHealth = (path = '/health/medical/dashboard') =>
  renderShell(<PersonaProbe prefix="/health" tree="Health & Wellness" />, { path, scope: HEALTH_SCOPE, access: VESSEL_ONLY_ACCESS });
const atHris = (path = '/hris/compensation/payroll') =>
  renderShell(<PersonaProbe prefix="/hris" tree="HRIS" />, { path, scope: HRIS_SCOPE, access: VESSEL_ONLY_ACCESS });
const labels = (out: PersonaOut) => out.apps.map((a) => a.label);

describe('medical view only (no wellness access)', () => {
  beforeEach(() => persona('steward', ['medical_reviewer'], [permRow('medical')]));

  it('Apps offers Health & Wellness, opening the Medical dashboard', async () => {
    atHealth();
    await waitFor(() => expect(readPersona().ready).toBe(true));
    expect(readPersona().apps.find((a) => a.label === 'Health & Wellness')?.path).toBe('/health/medical/dashboard?module=health');
  });

  it('the Health sidebar is available and holds the Medical group only', async () => {
    atHealth();
    await waitFor(() => expect(readPersona().ready).toBe(true));
    expect(readPersona().sidebar).toEqual({ available: true, loading: false, heading: 'Health & Wellness', groups: ['Medical'] });
  });

  it('the palette lists Medical pages only under /health', async () => {
    atHealth();
    await waitFor(() => expect(readPersona().ready).toBe(true));
    const { leaves, treeLeaves } = readPersona();
    expect(treeLeaves.length).toBeGreaterThan(0);
    expect(treeLeaves.every((p) => p.startsWith('/health/medical/')), treeLeaves.join('\n')).toBe(true);
    // Besides the workspace's own entry (Fleet › Workspaces › Health & Wellness, at /health).
    const pages = leaves.filter((p) => p !== '/health');
    expect(pages.every((p) => p === '/health/medical' || p.startsWith('/health/medical/')), pages.join('\n')).toBe(true);
    expect(pages).toContain('/health/medical/dashboard');
    expect(pages.some((p) => p.startsWith('/health/spa') || p.startsWith('/health/nutrition'))).toBe(false);
  });
});

describe('wellness only (unchanged)', () => {
  it('a wellness viewer gets Health, opening Spa, without the Medical group', async () => {
    persona('steward', ['wellness_viewer'], [permRow('wellness')]);
    atHealth('/health/spa/dashboard');
    await waitFor(() => expect(readPersona().ready).toBe(true));
    const out = readPersona();
    expect(out.apps.find((a) => a.label === 'Health & Wellness')?.path).toBe('/health/spa/dashboard?module=health');
    expect(out.sidebar).toMatchObject({ available: true, loading: false, heading: 'Health & Wellness' });
    expect(out.sidebar.groups).not.toContain('Medical');
    expect(out.sidebar.groups).toContain('Spa');
    expect(out.treeLeaves.some((p) => p.startsWith('/health/medical/'))).toBe(false);
  });

  it('crew (self-service medical and wellness) still get Health, on the self-service pages', async () => {
    persona('crew', [], []);
    atHealth('/health/medical/chek');
    await waitFor(() => expect(readPersona().ready).toBe(true));
    const out = readPersona();
    expect(out.apps.find((a) => a.label === 'Health & Wellness')?.path).toBe('/health/medical/chek?module=health');
    expect(out.sidebar.available).toBe(true);
    expect(out.treeLeaves).not.toContain('/health/medical/dashboard');
  });
});

describe('finance view with no HR access', () => {
  beforeEach(() => persona('steward', ['accountant'], [permRow('finance')]));

  it('gets no HRIS in Apps, the sidebar or the palette', async () => {
    atHris();
    await waitFor(() => expect(readPersona().ready).toBe(true));
    const out = readPersona();
    expect(labels(out)).not.toContain('HRIS');
    expect(out.sidebar).toEqual({ available: false, loading: false, heading: null, groups: [] });
    expect(out.treeLeaves).toEqual([]);
    expect(out.leaves).toEqual([]);
  });
});

describe('no HR, medical or wellness access at all', () => {
  beforeEach(() => persona('steward', [], []));

  it('neither HRIS nor Health opens anywhere', async () => {
    atHealth();
    await waitFor(() => expect(readPersona().ready).toBe(true));
    const health = readPersona();
    expect(labels(health)).not.toContain('HRIS');
    expect(labels(health)).not.toContain('Health & Wellness');
    expect(health.sidebar.available).toBe(false);
    expect(health.treeLeaves).toEqual([]);
    expect(health.leaves).toEqual([]);
  });

  it('nor on an HRIS URL', async () => {
    atHris();
    await waitFor(() => expect(readPersona().ready).toBe(true));
    const hris = readPersona();
    expect(hris.sidebar.available).toBe(false);
    expect(hris.treeLeaves).toEqual([]);
  });
});

describe('the Health entry while access loads (fail closed)', () => {
  it('offers no Health while roles load, even for a medical viewer', () => {
    persona('steward', ['medical_reviewer'], [permRow('medical')]);
    shellState.perm = { ...shellState.perm, isInitialized: false, isLoading: true };
    atHealth();
    const out = readPersona();
    expect(labels(out)).not.toContain('Health & Wellness');
    expect(out.leaves).toEqual([]);
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
