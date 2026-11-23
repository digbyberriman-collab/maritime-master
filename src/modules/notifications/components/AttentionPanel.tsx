/**
 * The inbox's Attention tab (/inbox?tab=attention; gap/03 "Needs
 * attention", gap/10 IA15; D-62): today's Notification Center, unchanged in
 * what it reads (`useNotificationCenter`: open alerts and overdue
 * operational tasks in the viewer's alert scope, D-71). Three views, in the
 * URL as `?view=compliance|messages|tasks` (the old Notification Center's
 * `?tab=` values, which /notifications/center maps here).
 *
 * It does not depend on `notification_inbox`, so it works before the inbox
 * migration is applied. A failed read is an error with Retry, never "no
 * items"; counts show only once a list has loaded (D-04).
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { format, formatDistanceToNowStrict, parseISO } from 'date-fns';
import { AlertTriangle, CheckCircle2, ChevronRight, ClipboardCheck, MessageSquare, Ship } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageEmpty, PageError, PageLoading } from '@/shared/components/states';
import { StatusPill } from '@/shared/components/status';
import { cn } from '@/lib/utils';
import { TONE_SURFACE } from '@/components/ui/tones';
import { useNotificationCenter, type NotificationAlert, type OverdueOperationalTask } from '@/modules/notifications/hooks/useNotificationCenter';
import { getAlertDestination, getTaskDestination } from '@/modules/notifications/lib/notificationLinks';
import { ALERT_SEVERITY_TONE } from '@/modules/notifications/lib/alertSeverityTone';
import { ATTENTION_VIEWS, type AttentionView } from '../lib/inboxTabs';

const formatDueDate = (value: string | null) => (value ? format(parseISO(value), 'd MMM yyyy') : null);

function ListShell({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <ul aria-label={label} className="divide-y divide-border overflow-hidden rounded-md border border-border bg-card">
      {children}
    </ul>
  );
}

const rowClass =
  'group flex min-h-24 items-start gap-3 p-4 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring';

function AlertRow({ alert }: { alert: NotificationAlert }) {
  const dueDate = formatDueDate(alert.due_at);
  const vesselName = alert.vessel?.name ?? (alert.vessel_id ? 'Vessel' : 'Fleet-wide');
  return (
    <li>
      <Link to={getAlertDestination(alert)} className={rowClass} aria-label={`Open ${alert.title}`}>
        <span className={cn('mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md border', ALERT_SEVERITY_TONE[alert.severity_color].badge)}>
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="break-words font-semibold text-foreground">{alert.title}</span>
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
        <ChevronRight className="mt-2 h-4 w-4 shrink-0 text-muted-foreground transition-transform motion-safe:group-hover:translate-x-0.5" aria-hidden="true" />
      </Link>
    </li>
  );
}

function TaskRow({ task }: { task: OverdueOperationalTask }) {
  const vesselName = task.equipment?.vessel?.name ?? 'Vessel';
  return (
    <li>
      <Link to={getTaskDestination(task.id)} className={rowClass} aria-label={`Open overdue task ${task.task_name}`}>
        <span className={cn('mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md border', TONE_SURFACE.danger)}>
          <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="break-words font-semibold text-foreground">{task.task_name}</span>
            <StatusPill tone="danger">Overdue</StatusPill>
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
        <ChevronRight className="mt-2 h-4 w-4 shrink-0 text-muted-foreground transition-transform motion-safe:group-hover:translate-x-0.5" aria-hidden="true" />
      </Link>
    </li>
  );
}

/** A view's count, only once the lists have loaded: never a 0 while loading or after a failed read (D-04). */
function ViewCount({ count, loaded }: { count: number; loaded: boolean }) {
  return loaded ? <Badge variant="secondary">{count}</Badge> : null;
}

const VIEW_META: Record<AttentionView, { label: string; heading: string; icon: React.ElementType }> = {
  compliance: { label: 'Pending compliance', heading: 'Pending compliance items', icon: AlertTriangle },
  messages: { label: 'Unacknowledged alerts', heading: 'Unacknowledged alerts', icon: MessageSquare },
  tasks: { label: 'Overdue tasks', heading: 'Overdue operational tasks', icon: ClipboardCheck },
};

export interface AttentionPanelProps {
  view: AttentionView;
  onViewChange: (view: AttentionView) => void;
}

export function AttentionPanel({ view, onViewChange }: AttentionPanelProps) {
  // A query waiting for scope access and the vessel list is pending (React Query v5): show the loader for both.
  const { data, isPending, isError, error, refetch } = useNotificationCenter();
  const loaded = data !== undefined;
  const compliance = data?.pendingCompliance ?? [];
  const messages = data?.unreadMessages ?? [];
  const tasks = data?.overdueTasks ?? [];
  const counts: Record<AttentionView, number> = { compliance: compliance.length, messages: messages.length, tasks: tasks.length };

  const body = (current: AttentionView) => {
    if (isPending) return <PageLoading variant="list" rows={3} label="Loading items that need your attention" />;
    if (isError && !loaded) {
      return <PageError variant="inline" title="Items that need your attention could not load" error={error} onRetry={() => void refetch()} />;
    }
    if (!loaded) return null;
    if (current === 'tasks') {
      return tasks.length ? (
        <ListShell label={VIEW_META.tasks.heading}>{tasks.map((task) => <TaskRow key={task.id} task={task} />)}</ListShell>
      ) : (
        <PageEmpty bordered icon={CheckCircle2} title="No overdue operational tasks" body="No maintenance tasks are overdue for the vessels you can reach." />
      );
    }
    const rows = current === 'compliance' ? compliance : messages;
    return rows.length ? (
      <ListShell label={VIEW_META[current].heading}>{rows.map((alert) => <AlertRow key={alert.id} alert={alert} />)}</ListShell>
    ) : current === 'compliance' ? (
      <PageEmpty bordered icon={CheckCircle2} title="No pending compliance items" body="There are no active compliance alerts for the vessels you can reach." />
    ) : (
      <PageEmpty bordered icon={CheckCircle2} title="No unacknowledged alerts" body="Every open alert for the vessels you can reach has been acknowledged." />
    );
  };

  return (
    <Tabs value={view} onValueChange={(next) => onViewChange(next as AttentionView)}>
      <TabsList className="grid h-auto w-full grid-cols-1 gap-1 sm:grid-cols-3" aria-label="Attention categories">
        {ATTENTION_VIEWS.map((key) => {
          const Icon = VIEW_META[key].icon;
          return (
            <TabsTrigger key={key} value={key} className="min-h-11 gap-2 whitespace-normal px-3">
              <Icon className="h-4 w-4" aria-hidden="true" />
              {VIEW_META[key].label} <ViewCount count={counts[key]} loaded={loaded} />
            </TabsTrigger>
          );
        })}
      </TabsList>
      {ATTENTION_VIEWS.map((key) => (
        <TabsContent key={key} value={key} className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="type-subtitle text-foreground">{VIEW_META[key].heading}</h2>
            {key === 'tasks' ? (
              <Button variant="link" size="sm" className="[@media(pointer:coarse)]:min-h-11" asChild>
                <Link to="/maintenance?tab=schedule">View maintenance schedule</Link>
              </Button>
            ) : null}
          </div>
          {body(key)}
        </TabsContent>
      ))}
    </Tabs>
  );
}

export default AttentionPanel;
