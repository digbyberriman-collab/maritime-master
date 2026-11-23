/**
 * One inbox row's text, shared by the bell and /inbox: the severity (icon
 * and, for screen readers, its word), the title, the body, and the meta line
 * (where it belongs · reference · when). When the deep link cannot be opened
 * the row says "No longer available" and why (no navigation, gap/03 C11);
 * while access is still loading it says "Checking access…".
 */
import React from 'react';
import { cn } from '@/lib/utils';
import { TONE_TEXT } from '@/components/ui/tones';
import { DEEP_LINK_UNAVAILABLE_DETAIL, DEEP_LINK_UNAVAILABLE_TITLE } from '../lib/deepLink';
import { relativeTime, type InboxLinkState } from '../lib/inboxLinkState';
import { inboxSeverityMeta } from '../lib/inboxPresentation';
import type { InboxItem } from '../services/inbox';

export interface InboxItemSummaryProps {
  item: InboxItem;
  place: string;
  link: InboxLinkState;
  /** Unread (or unread when the panel opened): bold title and an unread dot. */
  unread: boolean;
  /** Body lines shown (the bell clamps to 2, the page to 3). */
  bodyLines?: 2 | 3;
  /** The id of the title element, for an outer control's `aria-labelledby`. */
  titleId?: string;
  /**
   * The severity icon (and its word for screen readers). Off where a
   * `StatusPill` beside the row already says it (/inbox).
   */
  showSeverityIcon?: boolean;
}

export function InboxItemSummary({ item, place, link, unread, bodyLines = 2, titleId, showSeverityIcon = true }: InboxItemSummaryProps) {
  const severity = inboxSeverityMeta(item.severity);
  const Icon = severity.icon;
  const when = relativeTime(item.created_at);
  return (
    <span className="flex min-w-0 flex-1 items-start gap-3">
      {showSeverityIcon ? (
        <span className={cn('mt-0.5 shrink-0', TONE_TEXT[severity.tone])}>
          <Icon className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
        </span>
      ) : (
        // Without the icon (a StatusPill says the severity) the unread dot leads the row, in a fixed slot so titles align.
        <span aria-hidden="true" className="mt-1.5 flex h-2 w-2 shrink-0">
          {unread ? <span data-unread-dot="" className="h-2 w-2 rounded-full bg-primary" /> : null}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-start gap-2">
          <span id={titleId} className={cn('min-w-0 flex-1 break-words text-sm text-foreground', unread ? 'font-semibold' : 'font-normal')}>
            {showSeverityIcon || unread ? (
              <span className="sr-only">{`${[showSeverityIcon ? severity.label : null, unread ? 'unread' : null].filter(Boolean).join(', ')}: `}</span>
            ) : null}
            {item.title}
          </span>
          {unread && showSeverityIcon ? <span aria-hidden="true" data-unread-dot="" className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" /> : null}
        </span>
        {item.body ? (
          <span className={cn('mt-0.5 block break-words text-xs text-muted-foreground', bodyLines === 2 ? 'line-clamp-2' : 'line-clamp-3')}>
            {item.body}
          </span>
        ) : null}
        <span className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
          <span className="font-medium">{place}</span>
          {item.record_ref ? (
            <>
              <span aria-hidden="true">·</span>
              <span className="type-mono">{item.record_ref}</span>
            </>
          ) : null}
          {when ? (
            <>
              <span aria-hidden="true">·</span>
              <time dateTime={item.created_at}>{when}</time>
            </>
          ) : null}
        </span>
        {link.kind === 'unavailable' ? (
          <span className="mt-1 block text-xs text-muted-foreground" data-link-unavailable={link.reason}>
            <span className="font-medium text-foreground">{DEEP_LINK_UNAVAILABLE_TITLE}.</span> {DEEP_LINK_UNAVAILABLE_DETAIL[link.reason]}
          </span>
        ) : link.kind === 'checking' ? (
          <span className="mt-1 block text-xs text-muted-foreground">Checking access…</span>
        ) : link.kind === 'reach-unknown' ? (
          <span className="mt-1 block text-xs text-muted-foreground">Your vessels could not load, so this link cannot be checked yet.</span>
        ) : null}
      </span>
    </span>
  );
}

