import { useEffect } from 'react';
import { usePermissionsStore } from '@/modules/auth/store/permissionsStore';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import type { PermissionLevel } from '@/modules/auth/types';

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

/**
 * useDashboardPermissions - Simplified permission checks for dashboard components
 * Returns role-based flags for common access patterns
 */
export function useDashboardPermissions() {
  const store = usePermissionsStore();
  const { hasRole, primaryRole, isInitialized } = useRBACPermissions();
  const hasFleetAccess = store.hasFleetAccess;
  
  // Role checks
  const isDPA = isInitialized ? hasRole('DPA') || hasRole('Fleet Master') : false;
  const isCaptain = isInitialized ? hasRole('Captain') || hasRole('Master') : false;
  const isChiefOfficer = isInitialized ? hasRole('Chief Officer') : false;
  const isChiefEngineer = isInitialized ? hasRole('Chief Engineer') : false;
  const isPurser = isInitialized ? hasRole('Purser') : false;
  const isHOD = isInitialized ? hasRole('HOD') || hasRole('HOD Deck') || hasRole('HOD Engine') : false;
  const isOfficer = isInitialized ? hasRole('Officer') : false;
  const isCrew = isInitialized ? hasRole('Crew') : false;
  
  // Access level checks
  const canViewAllVessels = isDPA || isCaptain || hasFleetAccess;
  const isShoreManagement = isDPA;
  const isVesselCommand = isCaptain || isChiefOfficer || isChiefEngineer;
  const isDepartmentHead = isHOD || isPurser;
  
  // Widget visibility based on role hierarchy
  const canViewOperations = isDPA || isCaptain || isChiefOfficer;
  const canViewActivity = isDPA || isCaptain;
  const canViewCompliance = isDPA || isCaptain || isChiefOfficer || isChiefEngineer || isPurser;
  const canViewAlerts = true; // All roles can view alerts
  
  // KPI visibility
  const canViewAllKPIs = isDPA || isCaptain;
  const canViewMaintenanceKPI = isDPA || isCaptain || isChiefEngineer;
  const canViewCrewKPI = isDPA || isCaptain || isChiefOfficer || isPurser;
  const canViewDrillsKPI = isDPA || isCaptain || isChiefOfficer || isChiefEngineer || isHOD || isOfficer;
  
  return {
    // Role flags
    isDPA,
    isCaptain,
    isChiefOfficer,
    isChiefEngineer,
    isPurser,
    isHOD,
    isOfficer,
    isCrew,
    
    // Access levels
    canViewAllVessels,
    isShoreManagement,
    isVesselCommand,
    isDepartmentHead,
    
    // Widget visibility
    canViewOperations,
    canViewActivity,
    canViewCompliance,
    canViewAlerts,
    
    // KPI visibility
    canViewAllKPIs,
    canViewMaintenanceKPI,
    canViewCrewKPI,
    canViewDrillsKPI,
    
    // State
    primaryRole,
    isReady: isInitialized,
  };
}
