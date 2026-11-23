/**
 * The per-user inbox (gap/03 C9, C11; gap/08 NO3, NO6; DECISIONS D-62, D-91;
 * Phase 2 spec §A.15, §B.7). RLS returns the caller's own rows only; the
 * caller may change only `read_at` and `archived_at` (column grants).
 *
 * - Table missing (D-01): `source: 'table-missing'`; the bell falls back to
 *   today's alerts source and /inbox shows its "not set up" state.
 * - Any other error is thrown (error state with Retry; never "no
 *   notifications"). A head count that comes back without a number is an
 *   error too: a count is never invented (D-91, D-04).
 *
 * The hooks on these are ../hooks/useInbox.ts; the bell is
 * src/shared/components/layout/NotificationBell.tsx and the page
 * ../pages/InboxPage.tsx.
 */
import { isMissingTable, pendingClient } from '@/integrations/supabase/pending';
import type { NotificationInboxRow, NotificationsPendingFunctions, NotificationsPendingTables } from '../types/db.pending';

export const inboxDb = pendingClient<NotificationsPendingTables, Record<never, never>, NotificationsPendingFunctions>();

export type InboxTab = 'all' | 'attention' | 'archived';

export interface InboxFilters {
  archived: boolean;
  scope?: NotificationInboxRow['link_scope'];
  vesselId?: string;
  moduleKey?: string;
  limit?: number;
}

/** Every inbox read starts with `['notification-inbox', userId]`, so one invalidation refreshes them all. */
export const inboxKeys = {
  all: ['notification-inbox'] as const,
  user: (userId: string) => ['notification-inbox', userId] as const,
  list: (userId: string, filters: InboxFilters) => ['notification-inbox', userId, 'list', filters] as const,
  counts: (userId: string) => ['notification-inbox', userId, 'counts'] as const,
};

export type InboxItem = Pick<
  NotificationInboxRow,
  | 'id' | 'type_key' | 'module_key' | 'title' | 'body' | 'severity' | 'vessel_id' | 'link_scope' | 'link_vessel_code'
  | 'link_workspace' | 'link_path' | 'record_kind' | 'record_id' | 'record_ref' | 'read_at' | 'archived_at' | 'created_at'
>;

const INBOX_COLUMNS =
  'id, type_key, module_key, title, body, severity, vessel_id, link_scope, link_vessel_code, link_workspace, link_path, record_kind, record_id, record_ref, read_at, archived_at, created_at';

/** The bell's panel: the latest 20 unarchived rows (gap/10 top bar element 8). */
export const BELL_INBOX_LIMIT = 20;

export type InboxList = { source: 'table'; items: InboxItem[] } | { source: 'table-missing'; items: [] };

export async function fetchInbox(userId: string, filters: InboxFilters): Promise<InboxList> {
  let query = inboxDb.from('notification_inbox').select(INBOX_COLUMNS).eq('user_id', userId);
  query = filters.archived ? query.not('archived_at', 'is', null) : query.is('archived_at', null);
  if (filters.scope) query = query.eq('link_scope', filters.scope);
  if (filters.vesselId) query = query.eq('vessel_id', filters.vesselId);
  if (filters.moduleKey) query = query.eq('module_key', filters.moduleKey);
  const { data, error } = await query.order('created_at', { ascending: false }).limit(filters.limit ?? BELL_INBOX_LIMIT);
  if (error) {
    if (isMissingTable(error)) return { source: 'table-missing', items: [] };
    throw error;
  }
  return { source: 'table', items: data ?? [] };
}

export type InboxCounts = { source: 'table'; unread: number; criticalUnread: number } | { source: 'table-missing' };

/** Exact head counts for the bell badge (D-91): unread, and unread critical (both unarchived). */
export async function fetchInboxCounts(userId: string): Promise<InboxCounts> {
  const base = () =>
    inboxDb.from('notification_inbox').select('id', { count: 'exact', head: true }).eq('user_id', userId).is('read_at', null).is('archived_at', null);
  const [all, critical] = await Promise.all([base(), base().eq('severity', 'critical')]);
  const error = all.error ?? critical.error;
  if (error) {
    if (isMissingTable(error)) return { source: 'table-missing' };
    throw error;
  }
  if (typeof all.count !== 'number' || typeof critical.count !== 'number') {
    throw new Error('The notification count was not returned.');
  }
  return { source: 'table', unread: all.count, criticalUnread: critical.count };
}

/** Mark rows read (own rows only, by RLS); returns how many changed (rows already read do not count). */
export async function markInboxRead(ids: readonly string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const { data, error } = await inboxDb
    .from('notification_inbox')
    .update({ read_at: new Date().toISOString() })
    .in('id', [...ids])
    .is('read_at', null)
    .select('id');
  if (error) throw error;
  return data?.length ?? 0;
}

/**
 * Mark every own unread, unarchived row read (`notification_inbox_mark_all_read`).
 * `before` (ISO time) limits it to rows created at or before then, so a row
 * that arrives while the user is reading stays unread; default: now.
 */
export async function markAllInboxRead(before?: string): Promise<number> {
  const { data, error } = await inboxDb.rpc('notification_inbox_mark_all_read', before ? { p_before: before } : {});
  if (error) throw error;
  if (typeof data !== 'number') throw new Error('The inbox did not say how many notifications it marked read.');
  return data;
}

/** Archive (or bring back) own rows; returns how many changed. */
export async function setInboxArchived(ids: readonly string[], archived: boolean): Promise<number> {
  if (ids.length === 0) return 0;
  const { data, error } = await inboxDb
    .from('notification_inbox')
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .in('id', [...ids])
    .select('id');
  if (error) throw error;
  return data?.length ?? 0;
}
