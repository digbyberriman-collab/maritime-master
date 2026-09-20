import type { LucideIcon } from 'lucide-react';

export type NavPermissionLevel = 'view' | 'edit' | 'admin';

export interface NavChild {
  id: string;
  label: string;
  path: string;
  icon: LucideIcon;
  children?: NavChild[];
  /**
   * RBAC module key that gates this leaf/group (e.g. `hr`). When set, the
   * sidebar hides the entry unless the user holds `minPermission` (default
   * `view`) on that module. Module-level access is still checked separately
   * by `canAccessModule`.
   */
  moduleKey?: string;
  minPermission?: NavPermissionLevel;
  /**
   * Marks a leaf a self-service user may still open, showing only their own
   * record. Used by the Health section, where crew keep "My training" and
   * their own medical record but see none of the company-wide pages.
   */
  selfServe?: boolean;
  /**
   * Marks a leaf that points at a page owned by another module. Cross-links
   * are ignored when resolving which module a URL belongs to, so a reload on
   * `/crew/leave` lands in HRIS even though Vessel also links to it.
   */
  crossLink?: boolean;
}

export interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  path: string;
  permissions: string[];
  children?: NavChild[];
  defaultOpen?: boolean;
}
