import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { format, formatDistanceToNowStrict, parseISO } from 'date-fns';
import { AlertTriangle, Bell, CheckCircle2, ChevronRight, ClipboardCheck, MessageSquare, RefreshCw, Settings, Ship } from 'lucide-react';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { useNotificationCenter, type NotificationAlert, type OverdueOperationalTask } from '@/modules/notifications/hooks/useNotificationCenter';
import { getAlertDestination, getTaskDestination } from '@/modules/notifications/lib/notificationLinks';

const TABS = ['compliance', 'messages', 'tasks'] as const;
type CenterTab = typeof TABS[number];

const severityStyle = {
  RED: 'border-destructive/40 bg-destructive/10 text-destructive',
  ORANGE: 'border-warning/40 bg-warning/10 text-warning-foreground',
  YELLOW: 'border-accent bg-accent/30 text-accent-foreground',
  GREEN: 'border-success/40 bg-success/10 text-success',
} as const;

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
    <div className="space-y-2" aria-label="Loading notifications">
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
      <span className={cn('mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md border', severityStyle[alert.severity_color])}>
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

export default function NotificationCenterPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const activeTab: CenterTab = TABS.includes(requestedTab as CenterTab) ? requestedTab as CenterTab : 'compliance';
  const { data, isLoading, isFetching, isError, error, refetch, dataUpdatedAt } = useNotificationCenter();
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
      <div className="mx-auto max-w-6xl space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <p className="text-sm text-muted-foreground">Items requiring attention in the current vessel scope.</p>
          <div className="flex flex-wrap gap-2 self-start sm:self-auto">
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
          </div>
        </div>

        <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
          {isFetching ? 'Refreshing notification center' : `Notification center updated. ${compliance.length} compliance items, ${messages.length} unread messages, ${tasks.length} overdue tasks.`}
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
              Pending compliance <Badge variant="secondary">{compliance.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="messages" className="min-h-11 gap-2 whitespace-normal px-3">
              <MessageSquare className="h-4 w-4" aria-hidden="true" />
              Unread messages <Badge variant="secondary">{messages.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="tasks" className="min-h-11 gap-2 whitespace-normal px-3">
              <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
              Overdue tasks <Badge variant="secondary">{tasks.length}</Badge>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="compliance" className="mt-4 space-y-3">
            <div className="flex items-center justify-between gap-3"><h2 className="font-semibold">Pending compliance items</h2><Button variant="link" size="sm" asChild><Link to="/alerts?category=compliance">View all alerts</Link></Button></div>
            {isLoading ? <LoadingList /> : compliance.length ? <ListShell>{compliance.map((item) => <AlertRow key={item.id} alert={item} />)}</ListShell> : <EmptyState icon={CheckCircle2} title="No pending compliance items" description="There are no active compliance alerts in this vessel scope." />}
          </TabsContent>

          <TabsContent value="messages" className="mt-4 space-y-3">
            <div className="flex items-center justify-between gap-3"><h2 className="font-semibold">Unread messages</h2><Button variant="link" size="sm" asChild><Link to="/alerts?status=open">View all alerts</Link></Button></div>
            {isLoading ? <LoadingList /> : messages.length ? <ListShell>{messages.map((item) => <AlertRow key={item.id} alert={item} />)}</ListShell> : <EmptyState icon={Bell} title="No unread messages" description="You are up to date with all open fleet notifications." />}
          </TabsContent>

          <TabsContent value="tasks" className="mt-4 space-y-3">
            <div className="flex items-center justify-between gap-3"><h2 className="font-semibold">Overdue operational tasks</h2><Button variant="link" size="sm" asChild><Link to="/maintenance?tab=schedule">View maintenance schedule</Link></Button></div>
            {isLoading ? <LoadingList /> : tasks.length ? <ListShell>{tasks.map((item) => <TaskRow key={item.id} task={item} />)}</ListShell> : <EmptyState icon={CheckCircle2} title="No overdue operational tasks" description="No maintenance tasks are currently overdue in this vessel scope." />}
          </TabsContent>
        </Tabs>

        {dataUpdatedAt > 0 && <p className="text-right text-xs text-muted-foreground">Last refreshed {formatDistanceToNowStrict(dataUpdatedAt, { addSuffix: true })}</p>}
      </div>
    </DashboardLayout>
  );
}
