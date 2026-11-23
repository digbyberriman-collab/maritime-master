/**
 * The Health & Wellness workspace entry (Fleet › Workspaces, the Apps tile)
 * carries moduleKey `health`: it passes when medical or wellness access is
 * anything but `none`, the rule of `canAccessModule('health')`
 * (`canEnterHealth`), for every pair of levels. It fails closed while either
 * resolver loads, and `health` never reaches the RBAC `hasPermission` check
 * (there is no RBAC module of that name).
 */
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { MedicalAccessLevel } from '@/modules/auth/lib/medicalAccess';
import type { WellnessAccessLevel } from '@/modules/auth/lib/wellnessAccess';

const h = vi.hoisted(() => ({
  medical: { level: 'none' as string, loading: false },
  wellness: { level: 'none' as string, loading: false },
  hasPermission: vi.fn((_module: string, _level: string) => true),
}));

const access = (level: string, loading: boolean) => ({
  level,
  loading,
  canView: level === 'view' || level === 'edit' || level === 'admin',
  canEdit: level === 'edit' || level === 'admin',
  canAdmin: level === 'admin',
  selfOnly: level === 'self',
});

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
vi.mock('@/modules/auth/hooks/useMedicalAccess', () => ({
  useMedicalAccess: () => ({ ...access(h.medical.level, h.medical.loading), isPractitioner: false, canViewFitness: false }),
}));
vi.mock('@/modules/auth/hooks/useWellnessAccess', () => ({
  useWellnessAccess: () => ({ ...access(h.wellness.level, h.wellness.loading), disciplines: [] }),
}));
vi.mock('@/modules/auth/hooks/useHrAccess', () => ({ useHrAccess: () => ({ ...access('none', false) }) }));
vi.mock('@/modules/auth/hooks/usePayrollAccess', () => ({ usePayrollAccess: () => ({ ...access('none', false) }) }));
vi.mock('@/modules/auth/store/permissionsStore', () => {
  const state = { hasPermission: h.hasPermission, isInitialized: true, userRoles: [] };
  return { usePermissionsStore: (selector: (s: typeof state) => unknown) => selector(state) };
});

import { useNavNodeFilter } from '@/app/nav/useNavNodeFilter';
import { NavAccessContext, type NavAccess } from '@/app/nav/navAccess';
import { canEnterHealth } from '@/modules/auth/lib/healthAccess';
import { NAVIGATION_ITEMS } from '@/config/sitemap';
import type { NavChild } from '@/config/navigation-types';

const ACCESS: NavAccess = { ready: true, legacyRole: 'steward', rbacRoles: [], can: () => true, fleetReach: true, vesselReach: true };

const wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <NavAccessContext.Provider value={ACCESS}>{children}</NavAccessContext.Provider>
);

const findNode = (nodes: readonly NavChild[] | undefined, match: (n: NavChild) => boolean): NavChild | undefined => {
  for (const node of nodes ?? []) {
    if (match(node)) return node;
    const found = findNode(node.children, match);
    if (found) return found;
  }
  return undefined;
};

const FLEET = NAVIGATION_ITEMS.find((m) => m.id === 'fleet');
const ENTRY = findNode(FLEET?.children, (n) => n.label === 'Health & Wellness' && Boolean(n.crossLink));

const LEVELS: ReadonlyArray<MedicalAccessLevel & WellnessAccessLevel> = ['none', 'self', 'view', 'edit', 'admin'];

const decideEntry = () => {
  if (!ENTRY) throw new Error('no Health & Wellness entry in the Fleet tree');
  const { result } = renderHook(() => useNavNodeFilter(), { wrapper });
  return result.current.decide(ENTRY);
};

beforeEach(() => {
  h.medical = { level: 'none', loading: false };
  h.wellness = { level: 'none', loading: false };
  h.hasPermission.mockClear();
  localStorage.clear();
});

describe('the Health & Wellness entry gate', () => {
  it('is the Fleet tree’s workspace entry, gated by moduleKey health and self-serve', () => {
    expect(ENTRY).toMatchObject({ path: '/health', moduleKey: 'health', selfServe: true, crossLink: true });
  });

  it.each(LEVELS.flatMap((medical) => LEVELS.map((wellness) => [medical, wellness] as const)))(
    'medical %s, wellness %s: the same answer as canEnterHealth',
    (medical, wellness) => {
      h.medical = { level: medical, loading: false };
      h.wellness = { level: wellness, loading: false };
      const expected = canEnterHealth({ level: medical }, { level: wellness });
      expect(expected).toBe(medical !== 'none' || wellness !== 'none');
      expect(decideEntry() !== 'hidden').toBe(expected);
      expect(h.hasPermission).not.toHaveBeenCalledWith('health', expect.anything());
    },
  );

  it.each([
    ['medical', { medical: true, wellness: false }],
    ['wellness', { medical: false, wellness: true }],
    ['both', { medical: true, wellness: true }],
  ])('fails closed while %s access loads', (_which, loading) => {
    h.medical = { level: 'admin', loading: loading.medical };
    h.wellness = { level: 'admin', loading: loading.wellness };
    expect(decideEntry()).toBe('hidden');
  });
});
