// RBAC Permission Components and Hooks - Central exports

export { PermissionGate, ProtectedRoute, RequireRole, useCanAccess } from '@/components/auth/PermissionGate';
export { useRBACPermissions, useModulePermission, useRequiredPermission } from '@/hooks/useRBACPermissions';
export { usePermissionsStore } from '@/store/permissionsStore';
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
} from '@/types/permissions';
