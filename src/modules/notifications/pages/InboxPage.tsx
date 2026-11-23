/**
 * The Inbox (/inbox, personal scope; gap/03 C9, gap/10 IA15; D-62; Phase 2
 * spec §B.7, P5). The bell's "Open inbox" and the palette go here, and the
 * old /notifications/center redirects to its Attention tab.
 *
 * Tabs (in the URL, `?tab=`; ../lib/inboxTabs.ts):
 * - All: the user's unarchived `notification_inbox` items, newest first,
 *   filtered by scope, vessel and module (`?scope=`, `?vessel=<code>`,
 *   `?module=`), with severity pills, mark read, archive and "Mark all
 *   read". A deep link the viewer cannot open says "No longer available" and
 *   is not a link (../lib/deepLink.ts).
 * - Attention: today's Notification Center (open alerts and overdue tasks in
 *   the viewer's alert scope, ../components/AttentionPanel.tsx).
 * - Archived: archived items, with "Move back to the inbox".
 *
 * While `notification_inbox` is missing (D-01) All and Archived say the inbox
 * is not set up yet and Attention works as before; /inbox without a tab then
 * opens Attention. Any other failure is an error with Retry, never "no
 * notifications" (D-04). Nothing is read for a vessel filter until the
 * vessel list has loaded, and a vessel code outside the viewer's reach never
 * widens the list.
 */
import React, { useId, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Archive, ArchiveRestore, Bell, CheckCheck, Inbox as InboxIcon, Loader2, MailCheck, RefreshCw, Settings } from 'lucide-react';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import PageHeader from '@/shared/components/layout/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageEmpty, PageError, PageLoading } from '@/shared/components/states';
import { StatusPill } from '@/shared/components/status';
import { notify } from '@/shared/lib/notify';
import { cn } from '@/lib/utils';
import { useVessel } from '@/modules/vessels/contexts/VesselContext';
import { useScopeAccess } from '@/app/router/useScopeAccess';
import { useInbox, useInboxCounts, useInboxMutations, useInboxRealtime, useInboxUserId } from '../hooks/useInbox';
import { useInboxLinks } from '../hooks/useInboxLinks';
import { AttentionPanel } from '../components/AttentionPanel';
import { InboxItemSummary } from '../components/InboxItemSummary';
import { linkStateFor, type InboxLinkState } from '../lib/inboxLinkState';
import { INBOX_MODULE_KEYS, INBOX_SCOPES, INBOX_SCOPE_LABELS, inboxModuleLabel, inboxPlace, inboxSeverityMeta } from '../lib/inboxPresentation';
import { activeInboxTab, attentionViewFrom, inboxFiltersFrom, requestedInboxTab, type AttentionView } from '../lib/inboxTabs';
import type { InboxFilters, InboxItem, InboxTab } from '../services/inbox';

/** Rows per page of the All and Archived lists; "Show more" adds this many, up to the cap. */
export const INBOX_PAGE_SIZE = 50;
const INBOX_MAX_ROWS = 500;
const ANY = 'any';

type InboxState = 'table' | 'table-missing' | 'unknown' | 'error';

export default function InboxPage() {
  const [params, setParams] = useSearchParams();
  const queryClient = useQueryClient();
  const userId = useInboxUserId();
  const counts = useInboxCounts();
  const access = useScopeAccess();
  const { vessels, findVesselByCode } = useVessel();

  const requested = requestedInboxTab(params.get('tab'));
  const urlFilters = inboxFiltersFrom(params);
  const listTab = requested === 'archived' ? 'archived' : 'all';

  // A vessel filter names a code; it applies only once the vessel list is in, and only to a vessel in reach.
  const filterVessel = urlFilters.vessel ? findVesselByCode(urlFilters.vessel) : undefined;
  const vesselPending = Boolean(urlFilters.vessel) && !access.ready;
  const vesselOutOfReach = Boolean(urlFilters.vessel) && access.ready && !filterVessel;

  const [limitFor, setLimitFor] = useState<{ key: string; limit: number }>({ key: '', limit: INBOX_PAGE_SIZE });
  const filterKey = `${listTab}|${urlFilters.scope ?? ''}|${filterVessel?.id ?? urlFilters.vessel ?? ''}|${urlFilters.module ?? ''}`;
  const limit = limitFor.key === filterKey ? limitFor.limit : INBOX_PAGE_SIZE;
  const filters = useMemo<InboxFilters>(
    () => ({
      archived: listTab === 'archived',
      scope: urlFilters.scope ?? undefined,
      vesselId: filterVessel?.id,
      moduleKey: urlFilters.module ?? undefined,
      limit,
    }),
    [listTab, urlFilters.scope, filterVessel?.id, urlFilters.module, limit],
  );
  const listWanted = requested !== 'attention' && !vesselPending && !vesselOutOfReach;
  const list = useInbox(filters, { enabled: listWanted });

  const inboxState: InboxState =
    counts.data?.source === 'table-missing' || list.data?.source === 'table-missing'
      ? 'table-missing'
      : counts.data?.source === 'table' || list.data?.source === 'table'
        ? 'table'
        : counts.isError
          ? 'error'
          : 'unknown';
  const tab = activeInboxTab(requested, inboxState);
  useInboxRealtime(userId, inboxState === 'table');

  const setParam = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === '') next.delete(key);
      else next.set(key, value);
    }
    setParams(next, { replace: true });
  };
  const selectTab = (next: string) => setParam({ tab: next, view: next === 'attention' ? params.get('view') : null });
  const clearFilters = () => setParam({ scope: null, vessel: null, module: null });
  const hasFilters = Boolean(urlFilters.scope || urlFilters.vessel || urlFilters.module);

  const unread = counts.data?.source === 'table' ? counts.data.unread : null;
  const { markAllRead } = useInboxMutations();
  const refresh = () => {
    if (userId) void queryClient.invalidateQueries({ queryKey: ['notification-inbox', userId] });
    void queryClient.invalidateQueries({ queryKey: ['notification-center'] });
  };
  const refreshing = list.isFetching || counts.isFetching;

  const onMarkAllRead = () =>
    markAllRead.mutate(undefined, {
      onSuccess: (n) => notify.success(n === 1 ? '1 notification marked read' : `${n} notifications marked read`),
      onError: (error) => notify.error(error, { title: 'Could not mark all as read', fallback: 'Your notifications were not marked read. Try again.' }),
    });

  return (
    <DashboardLayout>
      <div className="max-w-6xl space-y-5">
        <PageHeader
          title="Inbox"
          description="Notifications for you, and the items that need your attention."
          actions={
            <>
              {tab === 'all' && inboxState === 'table' && unread !== null && unread > 0 ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    if (!markAllRead.isPending) onMarkAllRead();
                  }}
                  aria-disabled={markAllRead.isPending || undefined}
                  aria-busy={markAllRead.isPending || undefined}
                  className="aria-disabled:cursor-wait aria-disabled:opacity-60"
                >
                  {markAllRead.isPending ? <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" /> : <CheckCheck className="h-4 w-4" aria-hidden="true" />}
                  Mark all read
                </Button>
              ) : null}
              <Button variant="outline" asChild>
                <Link to="/me/notifications">
                  <Settings className="h-4 w-4" aria-hidden="true" />
                  Preferences
                </Link>
              </Button>
              <Button variant="outline" onClick={refresh} aria-busy={refreshing || undefined}>
                <RefreshCw className={cn('h-4 w-4', refreshing && 'motion-safe:animate-spin')} aria-hidden="true" />
                Refresh
              </Button>
            </>
          }
        />

        {tab === null ? (
          <PageLoading variant="list" rows={4} label="Loading the inbox" />
        ) : (
          <Tabs value={tab} onValueChange={selectTab}>
            <TabsList className="grid h-auto w-full grid-cols-3 gap-1 sm:w-auto sm:inline-grid" aria-label="Inbox views">
              <TabsTrigger value="all" className="min-h-11 gap-2 px-3">
                <InboxIcon className="h-4 w-4" aria-hidden="true" />
                All
                {unread !== null && unread > 0 ? (
                  <Badge variant="secondary" aria-label={`${unread} unread`}>
                    {unread > 99 ? '99+' : unread}
                  </Badge>
                ) : null}
              </TabsTrigger>
              <TabsTrigger value="attention" className="min-h-11 gap-2 px-3">
                <Bell className="h-4 w-4" aria-hidden="true" />
                Attention
              </TabsTrigger>
              <TabsTrigger value="archived" className="min-h-11 gap-2 px-3">
                <Archive className="h-4 w-4" aria-hidden="true" />
                Archived
              </TabsTrigger>
            </TabsList>

            {(['all', 'archived'] as const).map((key) => (
              <TabsContent key={key} value={key} className="mt-4 space-y-4">
                {tab === key ? (
                  <InboxListTab
                    tab={key}
                    inboxState={inboxState}
                    list={list}
                    countsError={counts.error}
                    retryCounts={() => void counts.refetch()}
                    vesselPending={vesselPending}
                    vesselOutOfReach={vesselOutOfReach}
                    hasFilters={hasFilters}
                    clearFilters={clearFilters}
                    filters={
                      inboxState === 'table' ? (
                        <InboxFilterBar
                          scope={urlFilters.scope}
                          vesselCode={urlFilters.vessel}
                          moduleKey={urlFilters.module}
                          vessels={vessels}
                          onChange={setParam}
                          onClear={hasFilters ? clearFilters : undefined}
                        />
                      ) : null
                    }
                    limit={limit}
                    showMore={() => setLimitFor({ key: filterKey, limit: Math.min(limit + INBOX_PAGE_SIZE, INBOX_MAX_ROWS) })}
                    openAttention={() => selectTab('attention')}
                  />
                ) : null}
              </TabsContent>
            ))}

            <TabsContent value="attention" className="mt-4 space-y-3">
              {tab === 'attention' ? (
                <AttentionPanel view={attentionViewFrom(params)} onViewChange={(view: AttentionView) => setParam({ tab: 'attention', view })} />
              ) : null}
            </TabsContent>
          </Tabs>
        )}
      </div>
    </DashboardLayout>
  );
}

// ─── Filters ─────────────────────────────────────────────────────────────

interface InboxFilterBarProps {
  scope: string | null;
  vesselCode: string | null;
  moduleKey: string | null;
  vessels: ReadonlyArray<{ id: string; name: string }>;
  onChange: (changes: Record<string, string | null>) => void;
  onClear?: () => void;
}

function InboxFilterBar({ scope, vesselCode, moduleKey, vessels, onChange, onClear }: InboxFilterBarProps) {
  const { getVesselCodeById } = useVessel();
  const vesselOptions = useMemo(
    () =>
      vessels
        .map((v) => ({ code: getVesselCodeById(v.id), name: v.name }))
        .filter((v): v is { code: string; name: string } => Boolean(v.code))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [vessels, getVesselCodeById],
  );
  const vesselValue = vesselCode ? vesselCode.toUpperCase() : ANY;
  const moduleOptions = moduleKey && !INBOX_MODULE_KEYS.includes(moduleKey) ? [...INBOX_MODULE_KEYS, moduleKey] : INBOX_MODULE_KEYS;
  const knownVessel = vesselOptions.some((v) => v.code === vesselValue);

  return (
    // Two columns on a phone (scope and vessel, then module and Clear), one row from 640 px.
    <div role="group" aria-label="Filter notifications" className="grid grid-cols-2 items-center gap-2 sm:flex sm:flex-wrap">
      <div className="min-w-0 sm:w-44">
        <Select value={scope ?? ANY} onValueChange={(value) => onChange({ scope: value === ANY ? null : value })}>
          <SelectTrigger aria-label="Scope">
            <SelectValue placeholder="Scope" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>All scopes</SelectItem>
            {INBOX_SCOPES.map((s) => (
              <SelectItem key={s} value={s}>
                {INBOX_SCOPE_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="min-w-0 sm:w-52">
        <Select value={vesselValue} onValueChange={(value) => onChange({ vessel: value === ANY ? null : value.toLowerCase() })}>
          <SelectTrigger aria-label="Vessel">
            <SelectValue placeholder="Vessel" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>All vessels</SelectItem>
            {vesselOptions.map((v) => (
              <SelectItem key={v.code} value={v.code}>
                {v.name}
              </SelectItem>
            ))}
            {vesselValue !== ANY && !knownVessel ? <SelectItem value={vesselValue}>{vesselValue}</SelectItem> : null}
          </SelectContent>
        </Select>
      </div>
      <div className="min-w-0 sm:w-48">
        <Select value={moduleKey ?? ANY} onValueChange={(value) => onChange({ module: value === ANY ? null : value })}>
          <SelectTrigger aria-label="Module">
            <SelectValue placeholder="Module" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>All modules</SelectItem>
            {moduleOptions.map((key) => (
              <SelectItem key={key} value={key}>
                {inboxModuleLabel(key)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {onClear ? (
        <Button type="button" variant="ghost" size="sm" className="justify-self-start [@media(pointer:coarse)]:h-11" onClick={onClear}>
          Clear filters
        </Button>
      ) : null}
    </div>
  );
}

// ─── All / Archived ──────────────────────────────────────────────────────

interface InboxListTabProps {
  tab: Extract<InboxTab, 'all' | 'archived'>;
  inboxState: InboxState;
  list: ReturnType<typeof useInbox>;
  countsError: unknown;
  retryCounts: () => void;
  vesselPending: boolean;
  vesselOutOfReach: boolean;
  hasFilters: boolean;
  clearFilters: () => void;
  filters: React.ReactNode;
  /** The rows the list was asked for: a full page may have more behind it. */
  limit: number;
  showMore: () => void;
  openAttention: () => void;
}

function InboxListTab({
  tab,
  inboxState,
  list,
  countsError,
  retryCounts,
  vesselPending,
  vesselOutOfReach,
  hasFilters,
  clearFilters,
  filters,
  limit,
  showMore,
  openAttention,
}: InboxListTabProps) {
  const items = list.data?.source === 'table' ? list.data.items : [];
  const archived = tab === 'archived';

  if (inboxState === 'table-missing') {
    return (
      <PageEmpty
        bordered
        icon={InboxIcon}
        title="Your inbox is not set up yet"
        body={
          archived
            ? 'Archived notifications will be kept here once the inbox is switched on.'
            : 'Notifications about the records you work on will arrive here once the inbox is switched on. Attention already lists the alerts and overdue tasks that need you.'
        }
        action={
          <Button type="button" variant="outline" onClick={openAttention}>
            Open Attention
          </Button>
        }
      />
    );
  }

  let body: React.ReactNode;
  if (vesselOutOfReach) {
    body = <PageEmpty bordered filtered title="That vessel is not one you can reach" body="Pick another vessel, or clear the filters." onClearFilters={clearFilters} />;
  } else if (vesselPending || list.isPending) {
    body = <PageLoading variant="list" rows={4} label={archived ? 'Loading archived notifications' : 'Loading notifications'} />;
  } else if (list.isError && !items.length) {
    body = <PageError variant="inline" title="Notifications could not load" error={list.error} onRetry={() => void list.refetch()} />;
  } else if (!list.data && countsError) {
    body = <PageError variant="inline" title="Notifications could not load" error={countsError} onRetry={retryCounts} />;
  } else if (!items.length) {
    body = hasFilters ? (
      <PageEmpty bordered filtered onClearFilters={clearFilters} />
    ) : archived ? (
      <PageEmpty bordered icon={Archive} title="Nothing archived" body="Notifications you archive are kept here." />
    ) : (
      <PageEmpty bordered icon={MailCheck} title="No notifications" body="Updates on the records you work on appear here." />
    );
  } else {
    body = (
      <>
        <InboxItems items={items} archived={archived} />
        {items.length >= limit && limit < INBOX_MAX_ROWS ? (
          <div className="flex justify-center">
            <Button type="button" variant="outline" onClick={showMore} disabled={list.isFetching}>
              {list.isFetching ? <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" /> : null}
              Show more
            </Button>
          </div>
        ) : null}
      </>
    );
  }

  return (
    <>
      {filters}
      {body}
    </>
  );
}

function InboxItems({ items, archived }: { items: InboxItem[]; archived: boolean }) {
  const links = useInboxLinks();
  const { vessels } = useVessel();
  const { markRead, setArchived } = useInboxMutations();
  const [busy, setBusy] = useState<ReadonlySet<string>>(() => new Set());
  const vesselName = (id: string) => vessels.find((v) => v.id === id)?.name ?? null;
  const unreadCount = items.filter((i) => !i.read_at).length;

  const withBusy = (id: string, on: boolean) =>
    setBusy((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const archive = (item: InboxItem, to: boolean) => {
    if (busy.has(item.id)) return;
    withBusy(item.id, true);
    setArchived.mutate(
      { ids: [item.id], archived: to },
      {
        onSuccess: () =>
          notify.success(to ? 'Archived' : 'Moved back to the inbox', {
            action: to ? { label: 'Undo', onClick: () => setArchived.mutate({ ids: [item.id], archived: false }) } : undefined,
          }),
        onError: (error) =>
          notify.error(error, { title: to ? 'Could not archive the notification' : 'Could not move the notification back', fallback: 'Nothing was changed. Try again.' }),
        onSettled: () => withBusy(item.id, false),
      },
    );
  };

  const read = (item: InboxItem) => {
    if (busy.has(item.id) || item.read_at) return;
    withBusy(item.id, true);
    markRead.mutate([item.id], {
      onError: (error) => notify.error(error, { title: 'Could not mark the notification read', fallback: 'Nothing was changed. Try again.' }),
      onSettled: () => withBusy(item.id, false),
    });
  };

  return (
    <>
      <p className="sr-only" role="status" aria-live="polite">
        {archived ? `${items.length} archived notifications` : `${items.length} notifications, ${unreadCount} unread`}
      </p>
      <ul aria-label={archived ? 'Archived notifications' : 'Notifications'} className="divide-y divide-border overflow-hidden rounded-md border border-border bg-card">
        {items.map((item) => (
          <InboxRow
            key={item.id}
            item={item}
            archived={archived}
            link={linkStateFor(links.ready, links.reachUnknown, links.resolve, item)}
            place={inboxPlace(item, vesselName)}
            busy={busy.has(item.id)}
            onOpen={() => {
              if (!item.read_at) markRead.mutate([item.id]);
            }}
            onRead={() => read(item)}
            onArchive={(to) => archive(item, to)}
          />
        ))}
      </ul>
    </>
  );
}

interface InboxRowProps {
  item: InboxItem;
  archived: boolean;
  link: InboxLinkState;
  place: string;
  busy: boolean;
  onOpen: () => void;
  onRead: () => void;
  onArchive: (archived: boolean) => void;
}

function InboxRow({ item, archived, link, place, busy, onOpen, onRead, onArchive }: InboxRowProps) {
  const titleId = useId();
  const unread = !item.read_at;
  const severity = inboxSeverityMeta(item.severity);
  const summary = <InboxItemSummary item={item} place={place} link={link} unread={unread} bodyLines={3} titleId={titleId} showSeverityIcon={false} />;
  const iconButton = 'h-9 w-9 shrink-0 aria-disabled:cursor-wait aria-disabled:opacity-60 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11';

  return (
    <li data-inbox-item={item.id} data-unread={unread || undefined} className={cn('flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:gap-4', unread && 'bg-signal-muted/40')}>
      {link.kind === 'link' ? (
        <Link
          to={link.href}
          onClick={onOpen}
          className="-m-1 flex min-w-0 flex-1 rounded-md p-1 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {summary}
        </Link>
      ) : (
        <div className="flex min-w-0 flex-1">{summary}</div>
      )}
      {/* Under the text on a phone (indented past the unread dot), beside it from 640 px. */}
      <div className="flex shrink-0 items-center gap-1 pl-5 sm:pl-0 sm:pt-0.5">
        <StatusPill tone={severity.tone} icon={severity.tone === 'danger' || severity.tone === 'warn' ? undefined : null}>
          {severity.label}
        </StatusPill>
        {unread && !archived ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={iconButton}
            onClick={onRead}
            aria-disabled={busy || undefined}
            aria-label={`Mark "${item.title}" read`}
            title="Mark read"
          >
            <CheckCheck className="h-4 w-4" aria-hidden="true" />
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={iconButton}
          onClick={() => onArchive(!archived)}
          aria-disabled={busy || undefined}
          aria-busy={busy || undefined}
          aria-label={archived ? `Move "${item.title}" back to the inbox` : `Archive "${item.title}"`}
          title={archived ? 'Move back to the inbox' : 'Archive'}
        >
          {busy ? (
            <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />
          ) : archived ? (
            <ArchiveRestore className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Archive className="h-4 w-4" aria-hidden="true" />
          )}
        </Button>
      </div>
    </li>
  );
}
