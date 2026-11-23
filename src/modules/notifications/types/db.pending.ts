/**
 * The per-user inbox behind the bell and /inbox (gap/03 C1, C9, C11; gap/08
 * NO1–NO3, NO6; DECISIONS D-62; Phase 2 spec §A.15,
 * `20261123030000_platform_notification_outbox.sql`).
 *
 * `notification_inbox` holds one row per recipient, fanned out from
 * `notification_outbox` (service-only, not readable by the browser). A user
 * reads and updates only their own rows, and may change only `read_at` and
 * `archived_at` (column grants). The bell and /inbox read it through the
 * pending client; a missing table means "inbox not set up yet": the bell
 * falls back to today's alerts source and /inbox shows its "not set up"
 * state (D-01). Any other error is an error with Retry.
 *
 * Deep links: `link_scope` + `link_vessel_code` + `link_path` (relative to
 * the scope root, no leading slash) or `record_kind` + `record_id`; the one
 * resolver is ../lib/deepLink.ts.
 */
import type { PendingTable } from '@/integrations/supabase/pending';
import type { Json } from '@/integrations/supabase/types';

export type InboxSeverity = 'info' | 'success' | 'warning' | 'critical';
export type InboxLinkScope = 'fleet' | 'vessel' | 'workspace' | 'personal';
/** Workspace keys for `link_scope = 'workspace'` (D-09). */
export type InboxWorkspace = 'hris' | 'health' | 'yard' | 'shoreside' | 'legal';

export type NotificationInboxRow = {
  id: string;
  outbox_id: string;
  user_id: string;
  company_id: string;
  vessel_id: string | null;
  type_key: string;
  module_key: string | null;
  title: string;
  body: string | null;
  severity: InboxSeverity;
  link_scope: InboxLinkScope;
  link_vessel_code: string | null;
  link_workspace: InboxWorkspace | null;
  link_path: string | null;
  record_kind: string | null;
  record_id: string | null;
  record_ref: string | null;
  payload: Json;
  read_at: string | null;
  archived_at: string | null;
  created_at: string;
};

export type NotificationsPendingTables = {
  notification_inbox: PendingTable<NotificationInboxRow, 'outbox_id' | 'user_id' | 'company_id' | 'type_key' | 'title' | 'severity' | 'link_scope'>;
};

export type NotificationsPendingFunctions = {
  notification_inbox_mark_all_read: { Args: { p_before?: string }; Returns: number };
};
