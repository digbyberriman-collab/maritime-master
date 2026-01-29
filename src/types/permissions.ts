// STORM RBAC Types

export type PermissionLevel = 'view' | 'edit' | 'admin';
export type ScopeType = 'fleet' | 'vessel' | 'department' | 'self';

export type RoleName = 
  | 'dpa' | 'fleet_master' | 'captain' | 'purser'
  | 'chief_officer' | 'chief_engineer' | 'hod' 
  | 'officer' | 'crew' | 'auditor' | 'employer_api';

export interface Role {
  id: string;
  name: RoleName;
  display_name: string;
  description: string | null;
  is_system_role: boolean;
  default_scope: ScopeType;
  is_api_only: boolean;
  is_time_limited: boolean;
  max_session_hours: number | null;
  created_at: string;
  updated_at: string;
}

export interface Module {
  id: string;
  key: string;
  name: string;
  description: string | null;
  parent_key: string | null;
  icon: string | null;
  route: string | null;
  sort_order: number;
  is_active: boolean;
  supports_scoping: boolean;
  api_accessible: boolean;
  created_at: string;
}

export interface RolePermission {
  id: string;
  role_id: string;
  module_key: string;
  permission: PermissionLevel;
  scope: ScopeType;
  restrictions: Record<string, boolean>;
  created_at: string;
  updated_at: string;
}

export interface ModulePermission {
  module_key: string;
  module_name: string;
  can_view: boolean;
  can_edit: boolean;
  can_admin: boolean;
  scope: ScopeType | null;
  restrictions: Record<string, boolean> | null;
}

export interface UserRole {
  role_id: string;
  role_name: string;
  role_display_name: string;
  vessel_id: string | null;
  vessel_name: string | null;
  department: string | null;
  is_fleet_wide: boolean;
}

export interface RBACUserRole {
  id: string;
  user_id: string;
  role_id: string;
  vessel_id: string | null;
  department: string | null;
  valid_from: string;
  valid_until: string | null;
  assigned_by: string | null;
  assigned_at: string;
  is_active: boolean;
}

export interface UserPermissionOverride {
  id: string;
  user_id: string;
  module_key: string;
  permission: PermissionLevel;
  is_granted: boolean;
  scope: ScopeType | null;
  restrictions: Record<string, boolean>;
  reason: string;
  valid_until: string | null;
  created_by: string;
  created_at: string;
}

export interface AuditLogEntry {
  id: string;
  timestamp_utc: string;
  actor_user_id: string;
  actor_role: string;
  action_type: AuditActionType;
  target_user_id: string | null;
  target_role_id: string | null;
  target_module_key: string | null;
  before_state: unknown;
  after_state: unknown;
  reason_text: string | null;
  vessel_scope: string | null;
  ip_address: string | null;
  user_agent: string | null;
  session_id: string | null;
  is_high_impact: boolean;
}

export type AuditActionType =
  | 'role_assigned'
  | 'role_removed'
  | 'permission_granted'
  | 'permission_revoked'
  | 'permission_updated'
  | 'scope_changed'
  | 'override_added'
  | 'override_removed'
  | 'role_created'
  | 'role_updated'
  | 'role_deleted'
  | 'api_access_granted'
  | 'api_access_revoked'
  | 'audit_mode_enabled'
  | 'audit_mode_disabled';

// Helper type for permission checks
export interface PermissionCheck {
  moduleKey: string;
  permission: PermissionLevel;
  vesselId?: string;
}
