import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";

export type AppRole =
  | "owner"
  | "owner_rep"
  | "captain"
  | "chief_officer"
  | "chief_engineer"
  | "purser"
  | "hod"
  | "crew_member"
  | "project_manager"
  | "yard_pm"
  | "yard_trade_lead"
  | "contractor"
  | "supplier"
  | "shore_management"
  | "finance_controller"
  | "technical_manager"
  | "class_surveyor"
  | "flag_surveyor"
  | "auditor"
  | "guest";

export const ROLE_LABEL: Record<AppRole, string> = {
  owner: "Owner",
  owner_rep: "Owner's Representative",
  captain: "Captain",
  chief_officer: "Chief Officer",
  chief_engineer: "Chief Engineer",
  purser: "Purser",
  hod: "Head of Department",
  crew_member: "Crew Member",
  project_manager: "Project Manager",
  yard_pm: "Yard Project Manager",
  yard_trade_lead: "Yard Trade Lead",
  contractor: "Contractor",
  supplier: "Supplier",
  shore_management: "Shore Management",
  finance_controller: "Finance Controller",
  technical_manager: "Technical Manager",
  class_surveyor: "Class Surveyor",
  flag_surveyor: "Flag Surveyor",
  auditor: "Auditor",
  guest: "Guest (read-only)",
};

// Role groups — mirror the SQL helpers so UI can gate correctly without round-trips.
export const ROLE_GROUPS = {
  owner_side: [
    "owner",
    "owner_rep",
    "technical_manager",
    "finance_controller",
    "auditor",
    "shore_management",
  ],
  vessel_side: ["captain", "chief_officer", "chief_engineer", "purser", "hod", "crew_member"],
  yard_side: ["yard_pm", "yard_trade_lead", "contractor", "supplier"],
  authority: ["class_surveyor", "flag_surveyor"],
  pm: ["project_manager", "owner_rep", "technical_manager", "shore_management", "yard_pm"],
  finance_approver: ["finance_controller", "owner", "owner_rep", "shore_management"],
  captain_approver: ["captain", "chief_officer"],
  owner_approver: ["owner", "owner_rep"],
  yard_approver: ["yard_pm", "project_manager"],
  technical_approver: ["technical_manager", "project_manager"],
  read_only: ["guest", "auditor"],
} as const satisfies Record<string, AppRole[]>;

export type RoleGroup = keyof typeof ROLE_GROUPS;

export function inGroup(role: AppRole | null, group: RoleGroup): boolean {
  if (!role) return false;
  return (ROLE_GROUPS[group] as readonly string[]).includes(role);
}

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRoles = async (uid: string) => {
    const { data } = await supabase.from("user_roles").select("role").eq("user_id", uid);
    setRoles(((data ?? []) as { role: AppRole }[]).map((r) => r.role));
  };

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        setTimeout(() => fetchRoles(s.user.id), 0);
      } else {
        setRoles([]);
      }
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
      if (session?.user) fetchRoles(session.user.id);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Primary role — used for display and as a single role badge.
  // Picks the most "powerful" role for the user via a static priority list.
  const PRIORITY: AppRole[] = [
    "owner",
    "owner_rep",
    "shore_management",
    "project_manager",
    "technical_manager",
    "finance_controller",
    "captain",
    "chief_officer",
    "chief_engineer",
    "purser",
    "hod",
    "yard_pm",
    "yard_trade_lead",
    "contractor",
    "supplier",
    "class_surveyor",
    "flag_surveyor",
    "auditor",
    "crew_member",
    "guest",
  ];
  const realRole: AppRole | null = PRIORITY.find((p) => roles.includes(p)) ?? null;

  // Dev/admin role preview — lets admins see the UI as another role without
  // signing out. Server-side RLS still applies to the real account; this only
  // changes client-side gating so the navigation, banners, and feature flags
  // mirror the chosen persona.
  const previewRole = usePreviewRole();
  const canPreview =
    realRole === "owner" || realRole === "shore_management" || realRole === "project_manager";
  const effectivePreview = canPreview ? previewRole : null;
  const role: AppRole | null = effectivePreview ?? realRole;

  return {
    session,
    user,
    role,
    realRole,
    previewRole: effectivePreview,
    canPreview,
    roles,
    loading,
  };
}

// ---- Role preview (admin-only) ---------------------------------------------

const PREVIEW_KEY = "oceancos.previewRole";
const PREVIEW_EVENT = "oceancos:preview-role-changed";

export function setPreviewRole(role: AppRole | null) {
  if (typeof window === "undefined") return;
  if (role) localStorage.setItem(PREVIEW_KEY, role);
  else localStorage.removeItem(PREVIEW_KEY);
  window.dispatchEvent(new CustomEvent(PREVIEW_EVENT));
}

export function getPreviewRole(): AppRole | null {
  if (typeof window === "undefined") return null;
  const v = localStorage.getItem(PREVIEW_KEY);
  return (v as AppRole) || null;
}

function usePreviewRole(): AppRole | null {
  const [role, setRole] = useState<AppRole | null>(() => getPreviewRole());
  useEffect(() => {
    const sync = () => setRole(getPreviewRole());
    window.addEventListener(PREVIEW_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(PREVIEW_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return role;
}

