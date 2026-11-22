import React, { useMemo } from 'react';
import { resolveCapability, useAccessSnapshot } from '@/lib/permissions';
import { useScopeAccess } from '@/app/router/useScopeAccess';
import { NavAccessContext, type NavAccess } from './navAccess';

/** Feeds `NavAccessContext` from the auth state (see ./navAccess.ts). */
const NavAccessProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const snapshot = useAccessSnapshot();
  const scopeAccess = useScopeAccess();
  const fleetReach = scopeAccess.ready && scopeAccess.fleetReach;
  const vesselReach = scopeAccess.ready && scopeAccess.lastVesselCode !== null;
  const value = useMemo<NavAccess>(
    () => ({
      ready: !snapshot.authLoading && snapshot.rbacInitialized,
      legacyRole: snapshot.legacyRole,
      rbacRoles: snapshot.rbacRoles,
      can: (capability: string) => resolveCapability(capability, snapshot).allowed,
      fleetReach,
      vesselReach,
    }),
    [snapshot, fleetReach, vesselReach],
  );
  return <NavAccessContext.Provider value={value}>{children}</NavAccessContext.Provider>;
};

export default NavAccessProvider;
