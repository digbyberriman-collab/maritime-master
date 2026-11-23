/**
 * The inbox bell's badge and panel (gap/03 C9; gap/10 top bar element 8,
 * IA15; Phase 2 spec §B.7) on `notification_inbox`. The bell itself (one
 * trigger, one popover, the reads) is
 * src/shared/components/layout/NotificationBell.tsx.
 *
 * - Badge: the exact unread head count (D-91), critical tone when any unread
 *   item is critical; only the critical badge pulses, never under reduced
 *   motion. No badge until a count is in; if only the counts fail, the
 *   panel list's unread rows (`<n>+` when the list is full, none when a full
 *   list holds no unread row). The accessible name says "n unread
 *   notifications": it counts inbox items, not the Fleet tiles' open alerts.
 * - Panel: the latest 20 unarchived items, newest first. Opening the panel
 *   marks the items it shows read (they keep their unread dot until it
 *   closes); a click opens the item's deep link (../lib/deepLink.ts) and marks
 *   it read; "Mark all read" marks the rest. A link the viewer cannot open
 *   says "No longer available" and is not a link.
 * - States: loading, error with Retry (never "no notifications" for a failed
 *   read), empty. A failed explicit write says so.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { UseQueryResult } from '@tanstack/react-query';
import { Bell, CheckCheck, Inbox, Loader2, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { TONE_BAR } from '@/components/ui/tones';
import { notify } from '@/shared/lib/notify';
import { useVessel } from '@/modules/vessels/contexts/VesselContext';
import type { InboxCounts, InboxItem, InboxList } from '../services/inbox';
import { useInboxMutations } from '../hooks/useInbox';
import { useInboxLinks } from '../hooks/useInboxLinks';
import { inboxPlace, inboxSeverityMeta } from '../lib/inboxPresentation';
import type { BellBadge } from '../lib/bellBadge';
import { InboxItemSummary } from './InboxItemSummary';
import { linkStateFor } from '../lib/inboxLinkState';

export const INBOX_PAGE_PATH = '/inbox';

export interface InboxBellPanelProps {
  counts: UseQueryResult<InboxCounts>;
  list: UseQueryResult<InboxList>;
  badge: BellBadge | null;
  onClose: () => void;
  focusPanelStart: () => void;
}

/** Mounted only while the panel is open, so its "unread when opened" snapshot is per opening. */
export function InboxBellPanel({ counts, list, badge, onClose, focusPanelStart }: InboxBellPanelProps) {
  const navigate = useNavigate();
  const { markRead, markAllRead } = useInboxMutations();
  const links = useInboxLinks();
  const { vessels } = useVessel();
  const items = useMemo(() => (list.data?.source === 'table' ? list.data.items : []), [list.data]);
  const headingId = useId();

  // Unread when this opening saw them: they keep the unread dot until the panel closes.
  const [seenUnread, setSeenUnread] = useState<ReadonlySet<string>>(() => new Set());
  const sent = useRef(new Set<string>());
  const { mutate: markReadNow } = markRead;
  useEffect(() => {
    const fresh = items.filter((item) => !item.read_at && !sent.current.has(item.id)).map((item) => item.id);
    if (!fresh.length) return;
    for (const id of fresh) sent.current.add(id);
    setSeenUnread((prev) => new Set([...prev, ...fresh]));
    // Opening the panel reads what it shows (gap/03 C9). A failure leaves them unread, and the badge says so.
    markReadNow(fresh);
  }, [items, markReadNow]);

  // Focus the first row once the list arrives after the panel opened on a loader.
  const hadRows = useRef(false);
  useEffect(() => {
    if (!hadRows.current && items.length) {
      hadRows.current = true;
      const active = document.activeElement;
      const panel = active instanceof HTMLElement ? active.closest('[data-bell-source]') : null;
      if (panel && active === panel) focusPanelStart();
    }
  }, [items.length, focusPanelStart]);

  const vesselName = useCallback((id: string) => vessels.find((v) => v.id === id)?.name ?? null, [vessels]);
  const unreadTotal = counts.data?.source === 'table' ? counts.data.unread : badge?.count ?? 0;
  const newest = items[0]?.created_at;

  const onMarkAllRead = () => {
    markAllRead.mutate(newest, {
      onError: (error) =>
        notify.error(error, { title: 'Could not mark all as read', fallback: 'Your notifications were not marked read. Try again.' }),
    });
  };

  const openItem = (item: InboxItem, href: string) => {
    onClose();
    if (!item.read_at && !sent.current.has(item.id)) {
      sent.current.add(item.id);
      markReadNow([item.id]);
    }
    navigate(href);
  };

  const loading = list.isPending;
  const failed = list.isError && !items.length;

  return (
    <>
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <Bell className="h-4 w-4 shrink-0 text-primary" strokeWidth={1.75} aria-hidden="true" />
          <h2 id={headingId} className="type-subtitle truncate text-foreground">
            Notifications
          </h2>
          {unreadTotal > 0 && badge ? (
            <Badge variant="outline" className="shrink-0 text-xs">
              {badge.label} unread
            </Badge>
          ) : null}
        </div>
        {unreadTotal > 0 ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="shrink-0 gap-1.5 px-2 text-xs aria-disabled:cursor-wait aria-disabled:opacity-60 [@media(pointer:coarse)]:h-11"
            onClick={() => {
              if (!markAllRead.isPending) onMarkAllRead();
            }}
            aria-disabled={markAllRead.isPending || undefined}
            aria-busy={markAllRead.isPending || undefined}
          >
            {markAllRead.isPending ? (
              <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />
            ) : (
              <CheckCheck className="h-4 w-4" aria-hidden="true" />
            )}
            Mark all read
          </Button>
        ) : null}
      </div>

      {loading ? (
        <div role="status" className="flex shrink-0 items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />
          Loading notifications…
        </div>
      ) : failed ? (
        <div role="alert" className="shrink-0 p-6 text-center">
          <p className="text-sm font-medium text-foreground">Notifications could not load</p>
          <p className="mt-1 text-xs text-muted-foreground">Check your connection and try again.</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3 gap-1.5 [@media(pointer:coarse)]:h-11"
            onClick={() => {
              void list.refetch();
              void counts.refetch();
            }}
          >
            <RotateCw className="h-4 w-4" aria-hidden="true" />
            Try again
          </Button>
        </div>
      ) : items.length ? (
        // A plain scroller (rows truncate at the panel's width); up to 400 px, shrinking with the panel.
        <ul aria-labelledby={headingId} className="min-h-0 max-h-[400px] shrink divide-y divide-border overflow-y-auto overflow-x-hidden overscroll-contain">
          {items.map((item) => {
            const link = linkStateFor(links.ready, links.reachUnknown, links.resolve, item, links.fleetReachUnknown);
            const unread = !item.read_at || seenUnread.has(item.id);
            const tone = inboxSeverityMeta(item.severity).tone;
            const summary = (
              <InboxItemSummary item={item} place={inboxPlace(item, vesselName)} link={link} unread={unread} />
            );
            const rowClass = cn('flex items-start gap-3 border-l-4 px-3 py-3', TONE_BAR[tone]);
            return (
              <li key={item.id}>
                {link.kind === 'link' ? (
                  <Link
                    to={link.href}
                    data-inbox-row=""
                    onClick={(event) => {
                      if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
                      event.preventDefault();
                      openItem(item, link.href);
                    }}
                    className={cn(
                      rowClass,
                      'transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                    )}
                  >
                    {summary}
                  </Link>
                ) : (
                  <div className={rowClass}>{summary}</div>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="shrink-0 p-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Bell className="h-6 w-6 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
          </div>
          <p className="text-sm font-medium text-foreground">No notifications</p>
          <p className="mt-1 text-xs text-muted-foreground">Updates on the records you work on appear here.</p>
        </div>
      )}

      <div className="shrink-0 border-t border-border px-4 py-3">
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-center [@media(pointer:coarse)]:h-11"
          onClick={() => {
            onClose();
            navigate(INBOX_PAGE_PATH);
          }}
        >
          <Inbox className="mr-2 h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          Open inbox
        </Button>
      </div>
    </>
  );
}

