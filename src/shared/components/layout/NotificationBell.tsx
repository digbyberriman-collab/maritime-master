/**
 * The notification bell in the top bar (gap/10 top bar element 8, IA15;
 * gap/03 C9; Phase 2 spec §B.7, P5).
 *
 * The bell reads the per-user inbox, `notification_inbox`, through the
 * pending shim (src/modules/notifications/services/inbox.ts): the exact
 * unread head counts for the badge (D-91; critical tone when an unread item
 * is critical, the only pulse, never under reduced motion) and the latest 20
 * unarchived items for the panel
 * (src/modules/notifications/components/InboxBell.tsx), with a realtime
 * channel on the user's own rows once the table is known to exist. Its name
 * says "n unread notifications": it counts inbox items, not the Fleet KPI
 * tiles' open alerts.
 *
 * Fallback (D-01), and ONLY this one: while the inbox migration
 * (`20261123030000_platform_notification_outbox.sql`) is not applied, the
 * inbox reads answer "table missing" (`source: 'table-missing'`) and the bell
 * shows today's alerts (src/modules/notifications/hooks/useAlertsBell.ts and
 * src/modules/notifications/components/AlertsBell.tsx:
 * unacknowledged alerts in the viewer's alert scope, D-71, D-91). Any other
 * inbox error stays on the inbox panel, which shows the error with Retry and
 * never "no notifications" (D-04). Until the first inbox answer the bell has
 * no badge and the panel says it is loading.
 *
 * One trigger and one popover serve both sources, so the button (and its
 * focus) stays put when the source is decided. The open state is the
 * shell's (`ShellActions.openNotifications` opens it from the command
 * palette); outside a shell it keeps its own.
 */
import React, { useCallback, useRef } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useShellSurface } from '@/app/shell/shellUi';
import { SHELL_TEST_IDS } from '@/app/shell/testIds';
import TopBarTooltip from '@/shared/components/layout/topbar/TopBarTooltip';
import { AlertsBellPanel } from '@/modules/notifications/components/AlertsBell';
import { InboxBellPanel } from '@/modules/notifications/components/InboxBell';
import { BellButton } from '@/modules/notifications/components/BellButton';
import { useAlertsBell } from '@/modules/notifications/hooks/useAlertsBell';
import { bellLabel, inboxBellBadge } from '@/modules/notifications/lib/bellBadge';
import { useInbox, useInboxCounts, useInboxRealtime, useInboxUserId } from '@/modules/notifications/hooks/useInbox';
import { BELL_INBOX_LIMIT, type InboxFilters } from '@/modules/notifications/services/inbox';

export interface NotificationBellProps {
  /** Controlled open state; defaults to the shell's. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}

/** The bell's list: the latest 20 unarchived items. One object, so the query key is stable. */
const BELL_FILTERS: InboxFilters = Object.freeze({ archived: false, limit: BELL_INBOX_LIMIT });

const NotificationBell: React.FC<NotificationBellProps> = ({ open, onOpenChange, className }) => {
  const [shellOpen, setShellOpen] = useShellSurface('notifications');
  const isOpen = open ?? shellOpen;
  const setIsOpen = useCallback((next: boolean) => (onOpenChange ?? setShellOpen)(next), [onOpenChange, setShellOpen]);
  const close = useCallback(() => setIsOpen(false), [setIsOpen]);
  const panelRef = useRef<HTMLDivElement>(null);

  const userId = useInboxUserId();
  const counts = useInboxCounts();
  const list = useInbox(BELL_FILTERS);
  const source = counts.data?.source === 'table-missing' || list.data?.source === 'table-missing' ? 'alerts' : 'inbox';
  const inboxLive = source === 'inbox' && (counts.data?.source === 'table' || list.data?.source === 'table');
  useInboxRealtime(userId, inboxLive);
  const alerts = useAlertsBell(source === 'alerts');

  const badge = source === 'alerts' ? alerts.badge : inboxBellBadge(counts, list);
  const label =
    source === 'alerts'
      ? bellLabel(badge, 'unacknowledged alert', 'unacknowledged alerts')
      : bellLabel(badge, 'unread notification', 'unread notifications');

  /** The first row (an alert or an inbox item), else the panel itself; never a hint, never the page. */
  const focusPanelStart = useCallback(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const row = panel.querySelector<HTMLElement>('[data-alert-row], [data-inbox-row]');
    (row ?? panel).focus();
  }, []);

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <TopBarTooltip label="Notifications" suppressed={isOpen}>
          <BellButton badge={badge} className={className} aria-label={label} />
        </TopBarTooltip>
      </PopoverTrigger>
      <PopoverContent
        ref={panelRef}
        tabIndex={-1}
        align="end"
        // A flex column capped at the room Radix measures below the trigger: on a
        // short viewport (a landscape phone) the list shrinks, and the header,
        // hint and footer ("Open inbox") stay on screen.
        className="w-[min(24rem,calc(100vw-2rem))] p-0 bg-popover flex flex-col max-h-[var(--radix-popover-content-available-height)]"
        sideOffset={8}
        collisionPadding={8}
        data-testid={SHELL_TEST_IDS.notificationsPanel}
        data-bell-source={source}
        aria-label="Notifications"
        onOpenAutoFocus={(event) => {
          // Start at the first row, else the panel; never on the first-run hint.
          event.preventDefault();
          focusPanelStart();
        }}
      >
        {source === 'alerts' ? (
          <AlertsBellPanel data={alerts} onClose={close} focusPanelStart={focusPanelStart} />
        ) : (
          <InboxBellPanel counts={counts} list={list} badge={badge} onClose={close} focusPanelStart={focusPanelStart} />
        )}
      </PopoverContent>
    </Popover>
  );
};

export default NotificationBell;
