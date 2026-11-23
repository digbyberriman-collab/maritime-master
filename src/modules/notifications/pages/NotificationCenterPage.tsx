import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { format, formatDistanceToNowStrict, parseISO } from 'date-fns';
import { AlertTriangle, Bell, CheckCircle2, ChevronRight, ClipboardCheck, MessageSquare, RefreshCw, Settings, Ship } from 'lucide-react';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import PageHeader from '@/shared/components/layout/PageHeader';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { useNotificationCenter, type NotificationAlert, type OverdueOperationalTask } from '@/modules/notifications/hooks/useNotificationCenter';
import { getAlertDestination, getTaskDestination } from '@/modules/notifications/lib/notificationLinks';
import { ALERT_SEVERITY_TONE } from '@/modules/notifications/lib/alertSeverityTone';

const TABS = ['compliance', 'messages', 'tasks'] as const;
type CenterTab = typeof TABS[number];

const formatDueDate = (value: string | null) => value ? format(parseISO(value), 'd MMM yyyy') : null;

function ListShell({ children }: { children: React.ReactNode }) {
  return <div className="overflow-hidden rounded-md border border-border bg-card divide-y divide-border">{children}</div>;
}

function EmptyState({ icon: Icon, title, description }: { icon: React.ElementType; title: string; description: string }) {
  return (
    <div className="flex min-h-56 flex-col items-center justify-center rounded-md border border-dashed border-border bg-muted/20 px-6 text-center">
      <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-success/10 text-success">
        <Icon className="h-6 w-6" aria-hidden="true" />
      </span>
      <h2 className="font-semibold text-foreground">{title}</h2>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function LoadingList() {
  return (
    <div className="space-y-2" role="status" aria-busy="true" aria-label="Loading notifications">
      {[0, 1, 2].map((item) => <Skeleton key={item} className="h-24 w-full rounded-md" />)}
    </div>
  );
}

function AlertRow({ alert }: { alert: NotificationAlert }) {
  const destination = getAlertDestination(alert);
  const dueDate = formatDueDate(alert.due_at);
  const vesselName = alert.vessel?.name ?? (alert.vessel_id ? 'Vessel' : 'Fleet-wide');
  return (
    <Link
      to={destination}
      className="group flex min-h-24 items-start gap-3 p-4 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      aria-label={`Open ${alert.title}`}
    >
      <span className={cn('mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md border', ALERT_SEVERITY_TONE[alert.severity_color].badge)}>
        <AlertTriangle className="h-4 w-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-foreground">{alert.title}</span>
          <Badge variant="outline" className="capitalize">{alert.status?.toLowerCase() ?? 'Open'}</Badge>
        </span>
        {alert.description && <span className="mt-1 block line-clamp-2 text-sm text-muted-foreground">{alert.description}</span>}
        <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1"><Ship className="h-3.5 w-3.5" aria-hidden="true" />{vesselName}</span>
          {alert.source_module && <span>{alert.source_module}</span>}
          {dueDate && <span>Due {dueDate}</span>}
          {alert.created_at && <span>{formatDistanceToNowStrict(parseISO(alert.created_at), { addSuffix: true })}</span>}
        </span>
      </span>
      <ChevronRight className="mt-2 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
    </Link>
  );
}

function TaskRow({ task }: { task: OverdueOperationalTask }) {
  const vesselName = task.equipment?.vessel?.name ?? 'Vessel';
  return (
    <Link
      to={getTaskDestination(task.id)}
      className="group flex min-h-24 items-start gap-3 p-4 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      aria-label={`Open overdue task ${task.task_name}`}
    >
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-destructive/40 bg-destructive/10 text-destructive">
        <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-foreground">{task.task_name}</span>
          <Badge variant="destructive">Overdue</Badge>
          <Badge variant="outline" className="capitalize">{task.priority}</Badge>
        </span>
        {task.work_description && <span className="mt-1 block line-clamp-2 text-sm text-muted-foreground">{task.work_description}</span>}
        <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1"><Ship className="h-3.5 w-3.5" aria-hidden="true" />{vesselName}</span>
          <span>{task.equipment?.equipment_name ?? 'Equipment'}</span>
          <span>{task.task_number}</span>
          <span>Due {format(parseISO(task.due_date), 'd MMM yyyy')}</span>
        </span>
      </span>
      <ChevronRight className="mt-2 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
    </Link>
  );
}

/** A tab's count, only once the list has loaded: never a 0 while loading or after a failed read (D-04). */
function TabCount({ count, loaded }: { count: number; loaded: boolean }) {
  return loaded ? <Badge variant="secondary">{count}</Badge> : null;
}

/**
 * The Inbox (/inbox, personal scope; the legacy /notifications/center shares
 * it). `useNotificationCenter` scopes the lists: here, the vessels the viewer
 * can reach (company-wide with fleet reach). The page heading is the shared
 * PageHeader, so the shell adds no fallback h1 (D-58).
 */
export default function NotificationCenterPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const activeTab: CenterTab = TABS.includes(requestedTab as CenterTab) ? requestedTab as CenterTab : 'compliance';
  // A query waiting for scope access and the vessel list is pending, not loading (React Query v5): show the
  // loading list for both, so no empty state flashes before the read starts.
  const { data, isPending, isFetching, isError, error, refetch, dataUpdatedAt } = useNotificationCenter();
  const loaded = data !== undefined;
  const compliance = data?.pendingCompliance ?? [];
  const messages = data?.unreadMessages ?? [];
  const tasks = data?.overdueTasks ?? [];

  const selectTab = (tab: string) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', tab);
    setSearchParams(next, { replace: true });
  };

  return (
    <DashboardLayout>
      <div className="max-w-6xl space-y-5">
        <PageHeader
          title="Inbox"
          description="Items that need your attention across the vessels you can reach."
          actions={
            <>
              <Button variant="outline" asChild>
                <Link to="/notifications">
                  <Settings className="h-4 w-4" aria-hidden="true" />
                  Preferences
                </Link>
              </Button>
              <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
                <RefreshCw className={cn('h-4 w-4', isFetching && 'motion-safe:animate-spin')} aria-hidden="true" />
                Refresh
              </Button>
            </>
          }
        />

        <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
          {isFetching
            ? 'Refreshing the inbox'
            : loaded
              ? `Inbox updated. ${compliance.length} compliance items, ${messages.length} unread messages, ${tasks.length} overdue tasks.`
              : isPending
                ? 'Loading the inbox'
                : ''}
        </p>

        {isError && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            <AlertTitle>Notifications could not be loaded</AlertTitle>
            <AlertDescription>{error instanceof Error ? error.message : 'Please refresh and try again.'}</AlertDescription>
          </Alert>
        )}

        <Tabs value={activeTab} onValueChange={selectTab}>
          <TabsList className="grid h-auto w-full grid-cols-1 gap-1 sm:grid-cols-3" aria-label="Notification categories">
            <TabsTrigger value="compliance" className="min-h-11 gap-2 whitespace-normal px-3">
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
              Pending compliance <TabCount count={compliance.length} loaded={loaded} />
            </TabsTrigger>
            <TabsTrigger value="messages" className="min-h-11 gap-2 whitespace-normal px-3">
              <MessageSquare className="h-4 w-4" aria-hidden="true" />
              Unread messages <TabCount count={messages.length} loaded={loaded} />
            </TabsTrigger>
            <TabsTrigger value="tasks" className="min-h-11 gap-2 whitespace-normal px-3">
              <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
              Overdue tasks <TabCount count={tasks.length} loaded={loaded} />
            </TabsTrigger>
          </TabsList>

          <TabsContent value="compliance" className="mt-4 space-y-3">
            <div className="flex items-center justify-between gap-3"><h2 className="font-semibold">Pending compliance items</h2><Button variant="link" size="sm" asChild><Link to="/alerts?category=compliance">View all alerts</Link></Button></div>
            {isPending ? <LoadingList /> : !loaded ? null : compliance.length ? <ListShell>{compliance.map((item) => <AlertRow key={item.id} alert={item} />)}</ListShell> : <EmptyState icon={CheckCircle2} title="No pending compliance items" description="There are no active compliance alerts for the vessels you can reach." />}
          </TabsContent>

          <TabsContent value="messages" className="mt-4 space-y-3">
            <div className="flex items-center justify-between gap-3"><h2 className="font-semibold">Unread messages</h2><Button variant="link" size="sm" asChild><Link to="/alerts?status=open">View all alerts</Link></Button></div>
            {isPending ? <LoadingList /> : !loaded ? null : messages.length ? <ListShell>{messages.map((item) => <AlertRow key={item.id} alert={item} />)}</ListShell> : <EmptyState icon={Bell} title="No unread messages" description="You are up to date with all open fleet notifications." />}
          </TabsContent>

          <TabsContent value="tasks" className="mt-4 space-y-3">
            <div className="flex items-center justify-between gap-3"><h2 className="font-semibold">Overdue operational tasks</h2><Button variant="link" size="sm" asChild><Link to="/maintenance?tab=schedule">View maintenance schedule</Link></Button></div>
            {isPending ? <LoadingList /> : !loaded ? null : tasks.length ? <ListShell>{tasks.map((item) => <TaskRow key={item.id} task={item} />)}</ListShell> : <EmptyState icon={CheckCircle2} title="No overdue operational tasks" description="No maintenance tasks are overdue for the vessels you can reach." />}
          </TabsContent>
        </Tabs>

        {dataUpdatedAt > 0 && <p className="text-right text-xs text-muted-foreground">Last refreshed {formatDistanceToNowStrict(dataUpdatedAt, { addSuffix: true })}</p>}
      </div>
    </DashboardLayout>
  );
}
