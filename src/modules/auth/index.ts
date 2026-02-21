// Auth module public API

// Components
export { PermissionGate, ProtectedRoute, RequireRole, useCanAccess } from './components/PermissionGate';

// Contexts
export { useAuth, AuthProvider } from './contexts/AuthContext';

// Hooks
export { useRBACPermissions, useModulePermission, useRequiredPermission, useDashboardPermissions } from './hooks/useRBACPermissions';
export { useUserRoles, useActiveRoles, useHasPermission, usePermissions, useAssignRole, useRevokeRole, useCompanyRoles } from './hooks/useUserRoles';
export {
  useDocumentAcknowledgments,
  useUserAcknowledgment,
  useDocumentVersions,
  useAcknowledgeMutation,
  useCompanyCrew,
  useAcknowledgmentStats,
  useMandatoryDocumentsPending,
} from './hooks/useAcknowledgments';
export { useAdminActions } from './hooks/useAdminActions';
export { useAuditLog } from './hooks/useAuditLog';

// Store
export { usePermissionsStore } from './store/permissionsStore';

// Types
export type {
  PermissionLevel,
  ScopeType,
  RoleName,
  Role,
  Module,
  RolePermission,
  ModulePermission,
  UserRole,
  RBACUserRole,
  UserPermissionOverride,
  AuditLogEntry,
  AuditActionType,
  PermissionCheck,
} from './types';

// Lib - permissions
export { hasPermission, Permission, ROLE_PERMISSIONS, getEditableFields, canEditField, DEPARTMENTS, GENDERS, CREW_STATUSES } from './lib/permissions';
export type { RolePermissions, PermissionContext, EditableField, Department, Gender, CrewStatus } from './lib/permissions';

// Pages
export { default as AuthPage } from './pages/Auth';
export { default as ResetPasswordPage } from './pages/ResetPassword';
