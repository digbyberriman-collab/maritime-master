// RBAC Permission Components and Hooks - Central exports

export { PermissionGate, ProtectedRoute, RequireRole, useCanAccess } from '@/modules/auth/components/PermissionGate';
export { useRBACPermissions, useModulePermission, useRequiredPermission } from '@/modules/auth/hooks/useRBACPermissions';
export { usePermissionsStore } from '@/modules/auth/store/permissionsStore';
export type {
  PermissionLevel,
  ScopeType,
  RoleName,
  Role,
  Module,
  ModulePermission,
  UserRole,
  RolePermission,
  AuditLogEntry,
  AuditActionType,
} from '@/modules/auth/types';
