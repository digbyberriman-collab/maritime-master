import { AppRole, inGroup } from "@/modules/refit/lib/auth";

/**
 * Permission keys mirror the seed in `role_permissions`. UI gating is the
 * primary purpose; the DB enforces the perimeter via RLS.
 */
export type PermissionKey =
  | "change_order.create"
  | "change_order.approve.captain"
  | "change_order.approve.owner_rep"
  | "change_order.approve.yard"
  | "change_order.approve.finance"
  | "change_order.approve.technical"
  | "change_order.approve.class_flag"
  | "crew_request.create"
  | "crew_request.triage"
  | "budget.view"
  | "budget.edit"
  | "po.create"
  | "po.approve"
  | "invoice.manage"
  | "logistics.manage"
  | "inventory.manage"
  | "drawing.review"
  | "drawing.approve"
  | "document.manage"
  | "contractor.manage"
  | "meeting.manage"
  | "risk.manage"
  | "schedule.manage"
  | "admin.manage_users"
  | "admin.manage_settings"
  | "report.export";

const STATIC_GRANTS: Record<PermissionKey, AppRole[]> = {
  "change_order.create": [
    "captain",
    "chief_officer",
    "chief_engineer",
    "hod",
    "project_manager",
    "yard_pm",
    "shore_management",
    "owner_rep",
    "technical_manager",
  ],
  "change_order.approve.captain": ["captain", "chief_officer"],
  "change_order.approve.owner_rep": ["owner", "owner_rep"],
  "change_order.approve.yard": ["yard_pm", "project_manager"],
  "change_order.approve.finance": ["finance_controller", "owner", "owner_rep", "shore_management"],
  "change_order.approve.technical": ["technical_manager", "project_manager"],
  "change_order.approve.class_flag": ["class_surveyor", "flag_surveyor"],
  "crew_request.create": [
    "crew_member",
    "hod",
    "captain",
    "chief_officer",
    "chief_engineer",
    "purser",
    "project_manager",
    "owner_rep",
  ],
  "crew_request.triage": [
    "hod",
    "captain",
    "chief_officer",
    "chief_engineer",
    "project_manager",
    "shore_management",
  ],
  "budget.view": [
    "finance_controller",
    "project_manager",
    "owner",
    "owner_rep",
    "shore_management",
    "technical_manager",
    "captain",
    "auditor",
  ],
  "budget.edit": ["finance_controller", "project_manager", "shore_management"],
  "po.create": ["finance_controller", "project_manager", "shore_management"],
  "po.approve": ["finance_controller", "owner", "owner_rep", "shore_management"],
  "invoice.manage": ["finance_controller", "project_manager", "shore_management"],
  "logistics.manage": ["project_manager", "captain", "chief_officer", "purser", "shore_management"],
  "inventory.manage": [
    "project_manager",
    "captain",
    "chief_officer",
    "chief_engineer",
    "purser",
    "hod",
  ],
  "drawing.review": [
    "project_manager",
    "technical_manager",
    "captain",
    "chief_engineer",
    "class_surveyor",
    "flag_surveyor",
    "shore_management",
  ],
  "drawing.approve": [
    "project_manager",
    "technical_manager",
    "owner_rep",
    "shore_management",
    "class_surveyor",
    "flag_surveyor",
  ],
  "document.manage": ["project_manager", "shore_management", "captain", "purser"],
  "contractor.manage": ["project_manager", "shore_management", "yard_pm"],
  "meeting.manage": ["project_manager", "shore_management", "captain", "yard_pm", "owner_rep"],
  "risk.manage": [
    "project_manager",
    "shore_management",
    "captain",
    "chief_engineer",
    "technical_manager",
    "owner_rep",
  ],
  "schedule.manage": ["project_manager", "shore_management", "yard_pm", "captain"],
  "admin.manage_users": ["shore_management", "project_manager"],
  "admin.manage_settings": ["shore_management", "project_manager"],
  "report.export": [
    "shore_management",
    "project_manager",
    "owner",
    "owner_rep",
    "finance_controller",
    "auditor",
  ],
};

export function can(roles: AppRole[], key: PermissionKey): boolean {
  const allowed = STATIC_GRANTS[key];
  if (!allowed) return false;
  return roles.some((r) => allowed.includes(r));
}

export function canAny(roles: AppRole[], keys: PermissionKey[]): boolean {
  return keys.some((k) => can(roles, k));
}

export function isReadOnly(roles: AppRole[]): boolean {
  return roles.length > 0 && roles.every((r) => inGroup(r, "read_only"));
}

export type ApprovalStage =
  | "captain"
  | "owner_rep"
  | "yard"
  | "finance"
  | "technical"
  | "class_flag";

export const APPROVAL_PERMISSION: Record<ApprovalStage, PermissionKey> = {
  captain: "change_order.approve.captain",
  owner_rep: "change_order.approve.owner_rep",
  yard: "change_order.approve.yard",
  finance: "change_order.approve.finance",
  technical: "change_order.approve.technical",
  class_flag: "change_order.approve.class_flag",
};

export const APPROVAL_STAGE_LABEL: Record<ApprovalStage, string> = {
  captain: "Captain",
  owner_rep: "Owner's Rep",
  yard: "Yard PM",
  finance: "Finance",
  technical: "Technical",
  class_flag: "Class / Flag",
};
