/**
 * Access tables, columns and RPCs the app reads before their migrations are
 * applied (gap/00 D2; DECISIONS D-01, D-26, C16, C17, C19; gap/01 F6, F11,
 * F22–F24, F46, F47, F53; gap/03 B7, B10). Phase 2 contract: these shapes
 * mirror the SQL in the Phase 2 spec (§A.3, §A.4, §A.8, §A.9) exactly:
 *
 *   20261123000300_platform_account_memberships.sql
 *     account_memberships, account_membership_vessels, user_is_active(),
 *     my_account_status(), record_session_start(), user_vessel_reach(),
 *     user_can_reach_vessel(), user_has_fleet_reach()
 *   20261123000400_platform_capabilities.sql
 *     has_capability(), is_company_actor()
 *   20261123010100_platform_access_rls.sql
 *     user_permission_overrides.company_id / vessel_id,
 *     permission_audit_log.company_id
 *   20261123010200_platform_user_invitations.sql
 *     user_invitations, revoke_invitation()
 *
 * Service-role-only RPCs the edge functions call (`record_invitation_send`,
 * `auth_user_id_for_email`, `set_membership_status`) are not listed: no
 * browser code may call them. Their contract is in the spec.
 *
 * Every read through these shapes must classify a missing table, column or
 * function (`isMissingRelation` / `isMissingTable`) and fall back exactly as
 * the spec says for that call site (memberships missing → the D-26 legacy
 * reach rules; my_account_status missing → the profile's account_status);
 * any other error fails closed.
 */
import type { PendingColumns, PendingTable } from '@/integrations/supabase/pending';

/** `account_memberships.kind` (gap/01 F22; C17 external viewers). */
export type MembershipKind = 'owner' | 'admin' | 'shore' | 'crew' | 'external';
/** `account_memberships.status` (gap/01 W2, W7). */
export type MembershipStatus = 'invited' | 'active' | 'disabled' | 'removed';
/** `all` = every non-archived vessel of the company; `assigned` = membership vessels + current crew assignments. */
export type MembershipVesselScope = 'all' | 'assigned';
export type UsersAccessLevel = 'none' | 'read' | 'write';
export type MembershipSource = 'backfill' | 'profile_sync' | 'invite' | 'admin' | 'platform';

export type AccountMembershipRow = {
  id: string;
  company_id: string;
  /** auth user; null for imported crew without a login. */
  user_id: string | null;
  profile_id: string | null;
  kind: MembershipKind;
  status: MembershipStatus;
  /**
   * Backfilled or profile-synced row: reach and fleet access are evaluated
   * live from the D-26 legacy sources (profiles.role, RBAC roles, crew
   * assignments), not from the stored flags below.
   */
  legacy_managed: boolean;
  /** May open the Fleet view. */
  fleet_access: boolean;
  vessel_scope: MembershipVesselScope;
  /** DECISIONS C19: DPA is a flag on the membership. */
  is_dpa: boolean;
  manages_admins: boolean;
  users_access_level: UsersAccessLevel;
  job_role_key: string | null;
  valid_from: string | null;
  /** Required for `external` (C17). */
  valid_until: string | null;
  invited_by: string | null;
  invited_at: string | null;
  accepted_at: string | null;
  disabled_at: string | null;
  disabled_by: string | null;
  disabled_reason: string | null;
  removed_at: string | null;
  last_active_at: string | null;
  source: MembershipSource;
  created_at: string;
  updated_at: string;
};

export type AccountMembershipVesselRow = {
  membership_id: string;
  company_id: string;
  vessel_id: string;
  valid_from: string | null;
  valid_until: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

/** `user_invitations.status` (Phase 2 honest vocabulary; gap/01 F46). */
export type InvitationStatus = 'pending' | 'sent' | 'send_failed' | 'accepted' | 'expired' | 'revoked';

export type UserInvitationRow = {
  id: string;
  company_id: string;
  profile_id: string;
  user_id: string | null;
  membership_id: string | null;
  kind: MembershipKind;
  status: InvitationStatus;
  send_attempts: number;
  last_attempt_at: string | null;
  last_sent_at: string | null;
  /** Stable snake_case code only (`provider_rejected`, `legacy_unverified`, …); never provider text. */
  last_error_code: string | null;
  provider_message_id: string | null;
  expires_at: string | null;
  accepted_at: string | null;
  revoked_at: string | null;
  revoked_by: string | null;
  invited_by: string | null;
  created_at: string;
  updated_at: string;
};

/** What `my_account_status()` / `record_session_start()` return. */
export type AccountStatus = 'active' | 'disabled' | 'no_profile';

export type AuthPendingTables = {
  account_memberships: PendingTable<AccountMembershipRow, 'company_id' | 'kind'>;
  account_membership_vessels: PendingTable<AccountMembershipVesselRow, 'membership_id' | 'vessel_id'>;
  user_invitations: PendingTable<UserInvitationRow, 'company_id' | 'profile_id'>;
};

export type AuthPendingColumns = {
  user_permission_overrides: PendingColumns<{ company_id: string | null; vessel_id: string | null }>;
  permission_audit_log: PendingColumns<{ company_id: string | null }>;
};

export type AuthPendingFunctions = {
  user_is_active: { Args: { _user_id: string }; Returns: boolean };
  my_account_status: { Args: never; Returns: AccountStatus };
  record_session_start: { Args: never; Returns: AccountStatus };
  user_vessel_reach: { Args: { _user_id: string }; Returns: string[] };
  user_can_reach_vessel: { Args: { _user_id: string; _vessel_id: string }; Returns: boolean };
  user_has_fleet_reach: { Args: { _user_id: string; _company_id?: string }; Returns: boolean };
  has_capability: { Args: { p_key: string; p_company_id: string; p_vessel_id?: string }; Returns: boolean };
  /** `_vessel_id` omitted = a fleet-level record (no vessel). */
  is_company_actor: { Args: { _user_id: string; _vessel_id?: string }; Returns: boolean };
  revoke_invitation: { Args: { p_invitation_id: string }; Returns: UserInvitationRow };
};
