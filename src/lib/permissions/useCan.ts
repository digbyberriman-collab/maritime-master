/**
 * `useCan(key, ctx?)`: the capability check every new page and action uses.
 *
 * Today it runs the interim adaptor (`./adaptor.ts`, DECISIONS D-04) over
 * the access state STORM already loads (AuthContext + permissionsStore). The
 * PMS runtime will replace the adaptor without changing call sites.
 *
 * It fails closed: false while anything it needs is loading, false for an
 * unknown key (logged once per key in development), false when signed out.
 */
import { useMemo } from 'react';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { usePermissionsStore } from '@/modules/auth/store/permissionsStore';
import { resolveCapability, type AccessSnapshot, type CapabilityDecision } from './adaptor';
import type { CanContext, CapabilityKey } from './types';

/** The access state today's checks read, captured for the adaptor. */
export function useAccessSnapshot(): AccessSnapshot {
  const {
    user,
    profile,
    loading,
    canAccessModule,
    practitionerDisciplines,
    practitionerDisciplinesLoaded,
  } = useAuth();
  const permissions = usePermissionsStore((s) => s.permissions);
  const userRoles = usePermissionsStore((s) => s.userRoles);
  const rbacInitialized = usePermissionsStore((s) => s.isInitialized);
  const rbacLoading = usePermissionsStore((s) => s.isLoading);

  return useMemo<AccessSnapshot>(
    () => ({
      authLoading: loading,
      signedIn: Boolean(user),
      profileId: profile?.id ?? null,
      legacyRole: profile?.role ?? null,
      rbacInitialized,
      rbacLoading,
      rbacRoles: userRoles.map((r) => r.role_name).filter((name): name is string => Boolean(name)),
      permissions,
      practitionerDisciplines: practitionerDisciplines ?? [],
      practitionerDisciplinesLoaded: Boolean(practitionerDisciplinesLoaded),
      canAccessModule,
    }),
    [
      loading,
      user,
      profile?.id,
      profile?.role,
      rbacInitialized,
      rbacLoading,
      userRoles,
      permissions,
      practitionerDisciplines,
      practitionerDisciplinesLoaded,
      canAccessModule,
    ],
  );
}

/**
 * The full decision for one capability: `allowed`, plus a `status` that
 * separates loading from denied (route guards show a spinner for one and
 * `AccessDenied` for the other).
 */
export function useCapability(key: CapabilityKey, ctx?: CanContext): CapabilityDecision {
  const snapshot = useAccessSnapshot();
  const vesselId = ctx?.vesselId ?? null;
  const departmentId = ctx?.departmentId ?? null;
  const subjectProfileId = ctx?.subjectProfileId ?? null;
  return useMemo(
    () => resolveCapability(key, snapshot, { vesselId, departmentId, subjectProfileId }),
    [key, snapshot, vesselId, departmentId, subjectProfileId],
  );
}

/** True only when the caller holds `key`. False while loading and for unknown keys. */
export function useCan(key: CapabilityKey, ctx?: CanContext): boolean {
  return useCapability(key, ctx).allowed;
}
