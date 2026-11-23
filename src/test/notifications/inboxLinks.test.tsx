/**
 * What the bell and /inbox tell the deep-link resolver about the viewer
 * (Phase 2 spec §B.7; D-04, D-97, D-119): fleet reach from the scope access,
 * reachable vessel codes from VesselContext, workspaces from their Apps
 * entry, record kinds from the registry; not ready while any of them loads;
 * "reach unknown" while the vessel list is in error; no vessels without a
 * readable profile.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

const h = vi.hoisted(() => ({
  profile: { id: 'p1', company_id: 'c1' } as { id: string; company_id: string } | null,
  access: { ready: true, fleetReach: false, vesselsError: null as { message: string } | null },
  vessels: [
    { id: 'v-dra', name: 'Draak' },
    { id: 'v-hyd', name: 'Hydra' },
  ],
  codes: { 'v-dra': 'DRA', 'v-hyd': 'HYD' } as Record<string, string>,
  workspace: { ready: true, open: new Set<string>(['/hris']) },
}));

vi.mock('@/modules/auth/contexts/AuthContext', () => ({ useAuth: () => ({ profile: h.profile }) }));
vi.mock('@/app/router/useScopeAccess', () => ({ useScopeAccess: () => h.access }));
vi.mock('@/modules/vessels/contexts/VesselContext', () => ({
  useVessel: () => ({ vessels: h.vessels, getVesselCodeById: (id: string | null | undefined) => (id ? h.codes[id] ?? null : null) }),
}));
vi.mock('@/app/nav/workspaceAccess', () => ({
  useWorkspaceRootGate: () => ({ ready: h.workspace.ready, canOpen: (root: string) => h.workspace.ready && h.workspace.open.has(root) }),
}));

import { useInboxLinks } from '@/modules/notifications/hooks/useInboxLinks';
import { registerRecordKind } from '@/lib/records/registry';
import type { DeepLinkSource } from '@/modules/notifications/lib/deepLink';

const row = (over: Partial<DeepLinkSource>): DeepLinkSource => ({
  link_scope: 'vessel',
  link_vessel_code: null,
  link_workspace: null,
  link_path: null,
  record_kind: null,
  record_id: null,
  ...over,
});

beforeEach(() => {
  h.profile = { id: 'p1', company_id: 'c1' };
  h.access = { ready: true, fleetReach: false, vesselsError: null };
  h.workspace = { ready: true, open: new Set(['/hris']) };
});

describe('useInboxLinks', () => {
  it('resolves vessels in reach by their VesselContext codes, any case', () => {
    const { result } = renderHook(() => useInboxLinks());
    expect(result.current.ready).toBe(true);
    expect(result.current.resolve(row({ link_vessel_code: 'hyd', link_path: 'crew/list' }))).toEqual({ kind: 'link', href: '/v/hyd/crew/list' });
    expect(result.current.resolve(row({ link_vessel_code: 'GAM', link_path: 'crew/list' }))).toEqual({ kind: 'unavailable', reason: 'no_reach' });
  });

  it('fleet links follow the scope access fleet reach', () => {
    const without = renderHook(() => useInboxLinks());
    expect(without.result.current.resolve(row({ link_scope: 'fleet', link_path: 'documents' }))).toEqual({ kind: 'unavailable', reason: 'no_fleet_reach' });
    h.access = { ...h.access, fleetReach: true };
    const withReach = renderHook(() => useInboxLinks());
    expect(withReach.result.current.resolve(row({ link_scope: 'fleet', link_path: 'documents' }))).toEqual({ kind: 'link', href: '/fleet/documents' });
  });

  it('workspaces follow their Apps entry (D-97)', () => {
    const { result } = renderHook(() => useInboxLinks());
    expect(result.current.resolve(row({ link_scope: 'workspace', link_workspace: 'hris', link_path: 'leave' }))).toEqual({ kind: 'link', href: '/hris/leave' });
    expect(result.current.resolve(row({ link_scope: 'workspace', link_workspace: 'health', link_path: 'x' }))).toEqual({
      kind: 'unavailable',
      reason: 'workspace_denied',
    });
  });

  it('record kinds come from the registry', () => {
    registerRecordKind({
      key: 'safety.test_permit',
      moduleKey: 'safety',
      label: 'Test permit',
      refPrefix: 'TPX',
      scope: 'vessel',
      routePattern: '/v/:vesselCode/safety/test-permits/:id',
      enveloped: false,
      companyStep: 'none',
      editAfterSign: 'allow_with_flag',
      deleteRule: 'free',
      slotTemplate: [],
    });
    const { result } = renderHook(() => useInboxLinks());
    expect(result.current.resolve(row({ link_vessel_code: 'DRA', record_kind: 'safety.test_permit', record_id: 'r-1' }))).toEqual({
      kind: 'link',
      href: '/v/dra/safety/test-permits/r-1',
    });
    expect(result.current.resolve(row({ link_vessel_code: 'DRA', record_kind: 'safety.unregistered', record_id: 'r-1' }))).toEqual({
      kind: 'unavailable',
      reason: 'no_target',
    });
  });

  it('is not ready while access or the workspace gate loads (fail closed)', () => {
    h.access = { ...h.access, ready: false };
    expect(renderHook(() => useInboxLinks()).result.current.ready).toBe(false);
    h.access = { ...h.access, ready: true };
    h.workspace = { ...h.workspace, ready: false };
    expect(renderHook(() => useInboxLinks()).result.current.ready).toBe(false);
  });

  it('says reach is unknown while the vessel list is in error (D-119)', () => {
    h.access = { ...h.access, vesselsError: { message: 'timeout' } };
    expect(renderHook(() => useInboxLinks()).result.current.reachUnknown).toBe(true);
  });

  it('reaches no vessel without a readable profile', () => {
    h.profile = null;
    const { result } = renderHook(() => useInboxLinks());
    expect(result.current.resolve(row({ link_vessel_code: 'DRA' }))).toEqual({ kind: 'unavailable', reason: 'no_reach' });
  });
});
