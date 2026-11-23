/**
 * The /inbox URL (gap/10 IA15 `/inbox?tab=inbox|attention`; gap/03 inbox
 * rows; D-62). Pure, so the page and the redirects read it the same way.
 *
 * - `tab`: `all` (alias `inbox`, gap/10's name), `attention`, `archived`.
 *   No (or an unknown) tab opens All once the inbox exists, and Attention
 *   while `notification_inbox` is missing (D-01): Attention is today's
 *   Notification Center and works without it.
 * - `view` (Attention only): `compliance`, `messages`, `tasks`. The old
 *   Notification Center's `?tab=compliance|messages|tasks` (sidebar badges,
 *   bookmarks) map to `tab=attention&view=…`.
 * - Filters (All and Archived): `scope` (fleet / vessel / workspace /
 *   personal), `vessel` (a vessel code, any case), `module` (a module key).
 *
 * `/notifications/center` (and anything else that pointed at the old
 * Notification Center) opens `/inbox?tab=attention`, the query and hash
 * kept: `notificationCenterTarget`.
 */
import { withSearch } from '@/app/router/legacyResolve';
import type { InboxLinkScope } from '../types/db.pending';
import type { InboxTab } from '../services/inbox';

export const INBOX_TABS: readonly InboxTab[] = ['all', 'attention', 'archived'];
export const ATTENTION_VIEWS = ['compliance', 'messages', 'tasks'] as const;
export type AttentionView = (typeof ATTENTION_VIEWS)[number];

const isAttentionView = (value: string | null): value is AttentionView =>
  value !== null && (ATTENTION_VIEWS as readonly string[]).includes(value);

/** The tab the URL asks for, or null (none, or unknown). Old Notification Center tabs are Attention. */
export function requestedInboxTab(tab: string | null): InboxTab | null {
  if (tab === 'inbox') return 'all';
  if (tab !== null && (INBOX_TABS as readonly string[]).includes(tab)) return tab as InboxTab;
  if (isAttentionView(tab)) return 'attention';
  return null;
}

/** The Attention view the URL asks for (`view`, else an old `tab=compliance|messages|tasks`), default compliance. */
export function attentionViewFrom(params: URLSearchParams): AttentionView {
  const view = params.get('view');
  if (isAttentionView(view)) return view;
  const tab = params.get('tab');
  return isAttentionView(tab) ? tab : 'compliance';
}

/**
 * The tab to show: the requested one, else All when the inbox exists and
 * Attention when it is missing; null while that is not known yet.
 */
export function activeInboxTab(requested: InboxTab | null, inbox: 'table' | 'table-missing' | 'unknown' | 'error'): InboxTab | null {
  if (requested) return requested;
  if (inbox === 'table-missing') return 'attention';
  if (inbox === 'table' || inbox === 'error') return 'all';
  return null;
}

/**
 * Where the old Notification Center URL now goes: `/inbox?tab=attention`,
 * with an old `tab=compliance|messages|tasks` kept as `view`, and every
 * other parameter and the hash kept.
 */
export function notificationCenterTarget(search: string, hash: string): string {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const oldTab = params.get('tab');
  params.delete('tab');
  if (isAttentionView(oldTab) && !params.has('view')) params.set('view', oldTab);
  const rest = params.toString();
  return withSearch('/inbox?tab=attention', rest ? `?${rest}` : '', hash);
}

const SCOPES: readonly InboxLinkScope[] = ['fleet', 'vessel', 'workspace', 'personal'];

export interface InboxUrlFilters {
  scope: InboxLinkScope | null;
  /** The vessel code as written (matched without regard to case). */
  vessel: string | null;
  module: string | null;
}

export function inboxFiltersFrom(params: URLSearchParams): InboxUrlFilters {
  const scope = params.get('scope');
  const vessel = params.get('vessel')?.trim() || null;
  const moduleKey = params.get('module')?.trim() || null;
  return {
    scope: scope && (SCOPES as readonly string[]).includes(scope) ? (scope as InboxLinkScope) : null,
    vessel,
    module: moduleKey,
  };
}
