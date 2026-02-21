import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { usePermissionsStore } from '@/modules/auth/store/permissionsStore';
import { Loader2, ShieldX } from 'lucide-react';
import type { PermissionLevel } from '@/modules/auth/types';

interface PermissionGateProps {
  children: React.ReactNode;
  moduleKey: string;
  permission?: PermissionLevel;
  fallback?: React.ReactNode;
  redirectTo?: string;
}

/**
 * PermissionGate - Wraps content that requires specific module permissions
 * 
 * Usage:
 * <PermissionGate moduleKey="crew_roster" permission="edit">
 *   <EditCrewButton />
 * </PermissionGate>
 */
export function PermissionGate({ 
  children, 
  moduleKey, 
  permission = 'view',
  fallback,
  redirectTo,
}: PermissionGateProps) {
  const location = useLocation();
  const { hasPermission, isLoading, isInitialized } = usePermissionsStore();

  // Show loading state while permissions are being fetched
  if (!isInitialized || isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  // Check permission
  const hasAccess = hasPermission(moduleKey, permission);

  if (!hasAccess) {
    // If fallback is provided, render it
    if (fallback) {
      return <>{fallback}</>;
    }
    
    // If redirectTo is provided, navigate there
    if (redirectTo) {
      return <Navigate to={redirectTo} state={{ from: location }} replace />;
    }
    
    // Default: render nothing (hide the content)
    return null;
  }

  return <>{children}</>;
}

/**
 * ProtectedRoute - Full-page protection for routes requiring permissions
 */
interface ProtectedRouteProps {
  children: React.ReactNode;
  moduleKey: string;
  permission?: PermissionLevel;
}

export function ProtectedRoute({ 
  children, 
  moduleKey, 
  permission = 'view',
}: ProtectedRouteProps) {
  const location = useLocation();
  const { hasPermission, isLoading, isInitialized } = usePermissionsStore();

  // Show loading state
  if (!isInitialized || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <span className="text-3xl font-black tracking-tight text-primary">STORM</span>
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading permissions...</p>
        </div>
      </div>
    );
  }

  // Check permission
  const hasAccess = hasPermission(moduleKey, permission);

  if (!hasAccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4 text-center max-w-md px-4">
          <ShieldX className="w-16 h-16 text-destructive" />
          <h1 className="text-2xl font-bold">Access Denied</h1>
          <p className="text-muted-foreground">
            You don't have permission to access this page. 
            Contact your administrator if you believe this is an error.
          </p>
          <Navigate to="/" state={{ from: location }} replace />
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

/**
 * useCanAccess - Hook for programmatic permission checks
 */
export function useCanAccess(moduleKey: string, permission: PermissionLevel = 'view'): boolean {
  const { hasPermission, isInitialized } = usePermissionsStore();
  
  if (!isInitialized) return false;
  return hasPermission(moduleKey, permission);
}

/**
 * RequireRole - Gate content by specific role
 */
interface RequireRoleProps {
  children: React.ReactNode;
  roles: string[];
  fallback?: React.ReactNode;
}

export function RequireRole({ children, roles, fallback }: RequireRoleProps) {
  const { hasRole, isLoading, isInitialized } = usePermissionsStore();

  if (!isInitialized || isLoading) {
    return (
      <div className="flex items-center justify-center p-4">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const hasRequiredRole = roles.some(role => hasRole(role));

  if (!hasRequiredRole) {
    return fallback ? <>{fallback}</> : null;
  }

  return <>{children}</>;
}
