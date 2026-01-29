import { useEffect } from 'react';
import { usePermissionsStore } from '@/store/permissionsStore';
import { useAuth } from '@/contexts/AuthContext';
import type { PermissionLevel } from '@/types/permissions';

/**
 * useRBACPermissions - Main hook for accessing RBAC permissions
 * Automatically loads permissions when user is authenticated
 */
export function useRBACPermissions() {
  const { user } = useAuth();
  const store = usePermissionsStore();
  
  useEffect(() => {
    if (user && !store.isInitialized && !store.isLoading) {
      store.loadPermissions();
    }
  }, [user, store.isInitialized, store.isLoading]);

  // Reset permissions when user logs out
  useEffect(() => {
    if (!user && store.isInitialized) {
      store.reset();
    }
  }, [user, store.isInitialized]);

  return {
    // Permission checks
    hasPermission: store.hasPermission,
    canView: store.canView,
    canEdit: store.canEdit,
    canAdmin: store.canAdmin,
    
    // Role checks
    hasRole: store.hasRole,
    hasFleetAccess: store.hasFleetAccess,
    primaryRole: store.primaryRole,
    userRoles: store.userRoles,
    
    // Module access
    getVisibleModules: store.getVisibleModules,
    getRestrictions: store.getRestrictions,
    modules: store.modules,
    
    // State
    isLoading: store.isLoading,
    isInitialized: store.isInitialized,
    error: store.error,
    
    // Actions
    loadPermissions: store.loadPermissions,
    setCurrentVessel: store.setCurrentVessel,
    currentVesselId: store.currentVesselId,
  };
}

/**
 * useModulePermission - Check permission for a specific module
 */
export function useModulePermission(moduleKey: string) {
  const { hasPermission, getRestrictions, isInitialized } = useRBACPermissions();
  
  return {
    canView: isInitialized ? hasPermission(moduleKey, 'view') : false,
    canEdit: isInitialized ? hasPermission(moduleKey, 'edit') : false,
    canAdmin: isInitialized ? hasPermission(moduleKey, 'admin') : false,
    restrictions: getRestrictions(moduleKey),
    isReady: isInitialized,
  };
}

/**
 * useRequiredPermission - Check if user has required permission level
 */
export function useRequiredPermission(
  moduleKey: string, 
  requiredLevel: PermissionLevel
): { hasAccess: boolean; isLoading: boolean } {
  const { hasPermission, isLoading, isInitialized } = useRBACPermissions();
  
  return {
    hasAccess: isInitialized ? hasPermission(moduleKey, requiredLevel) : false,
    isLoading: !isInitialized || isLoading,
  };
}
