import React, { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  CalendarCheck,
  CalendarDays,
  Check,
  Plus,
  TrendingDown,
  Trash2,
  Waves,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { HealthPageHeader } from '@/modules/health/components/HealthPageHeader';
import { StatGrid, StatTile } from '@/modules/health/components/StatTile';
import {
  HealthEmpty,
  HealthError,
  HealthLoading,
  NoSubjectRecord,
} from '@/modules/health/components/HealthStates';
import { PersonPicker } from '@/modules/health/components/PersonPicker';
import { PainChange, SessionStatusBadge } from '@/modules/health/components/physio/PhysioBadges';
import { SessionDialog } from '@/modules/health/components/physio/SessionDialog';
import { ConfirmDeleteDialog } from '@/modules/health/components/physio/ConfirmDeleteDialog';
import {
  SESSION_STATUSES,
  usePhysioAccess,
  usePhysioSessions,
  usePhysioTreatmentPlans,
  type PhysioSessionEntry,
} from '@/modules/health/hooks/usePhysio';
import { usePractitioners } from '@/modules/health/hooks/usePractitioners';
import { useSelectedPerson } from '@/modules/health/hooks/useSelectedPerson';
import { formatDate, formatDuration, formatTime } from '@/modules/health/lib/format';

const ALL = '__all__';

/** Monday of the week a date falls in, as an ISO date. */
const weekStart = (iso: string): string => {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  const offset = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - offset);
  return d.toISOString().slice(0, 10);
};

const tooltipStyle = {
  backgroundColor: 'hsl(var(--popover))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '8px',
  color: 'hsl(var(--popover-foreground))',
  fontSize: 12,
};

/**
 * The physiotherapy session log: every contact in date order, with the pain
 * before and after each one and how busy the last two months have been.
 */
const SessionLogPage: React.FC = () => {
  const access = usePhysioAccess();
  const { personId, setPersonId, myPerson, selfOnly } = useSelectedPerson('wellness');
  const { practitioners } = usePractitioners();

  const [planFilter, setPlanFilter] = useState<string>(ALL);
  const [practitionerFilter, setPractitionerFilter] = useState<string>(ALL);
  const [statusFilter, setStatusFilter] = useState<string>(ALL);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PhysioSessionEntry | null>(null);
  const [deleting, setDeleting] = useState<PhysioSessionEntry | null>(null);

  // Physio notes are clinical, so a reader without physio view access is
  // pinned to their own sessions and sees them read-only.
  const restrictedToSelf = !access.loading && (!access.canView || selfOnly);
  const effectivePersonId = restrictedToSelf ? myPerson?.id ?? null : personId;
  const enabled = !access.loading && (!restrictedToSelf || Boolean(effectivePersonId));

  const plansQuery = usePhysioTreatmentPlans({ personId: effectivePersonId, enabled });

  const query = usePhysioSessions({
    personId: effectivePersonId,
    planId: planFilter === ALL ? null : planFilter,
    practitionerId: practitionerFilter === ALL ? null : practitionerFilter,
    status: statusFilter === ALL ? null : statusFilter,
    from: from || null,
    to: to || null,
    enabled,
  });

  const weekly = useMemo(() => {
    const counts = new Map<string, number>();
    for (const session of query.sessions) {
      if (session.status === 'cancelled') continue;
      const key = weekStart(session.session_date);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const buckets: { week: string; sessions: number }[] = [];
    const cursor = new Date(`${weekStart(new Date().toISOString().slice(0, 10))}T00:00:00Z`);
    for (let i = 7; i >= 0; i -= 1) {
      const d = new Date(cursor);
      d.setUTCDate(d.getUTCDate() - i * 7);
      const key = d.toISOString().slice(0, 10);
      buckets.push({ week: formatDate(key, 'dd MMM'), sessions: counts.get(key) ?? 0 });
    }
    return buckets;
  }, [query.sessions]);

  const openNew = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  if (restrictedToSelf && !access.loading && !myPerson) {
    return (
      <div className="space-y-6">
        <HealthPageHeader
          icon={Waves}
          title="Session log"
          description="Every physiotherapy contact, in date order."
        />
        <NoSubjectRecord />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <HealthPageHeader
        icon={Waves}
        title="Session log"
        description={
          restrictedToSelf
            ? 'Your physiotherapy sessions, read-only.'
            : 'Every treatment session, scheduled or done, with pain before and after.'
        }
        actions={
          access.canEdit ? (
            <Button size="sm" onClick={openNew}>
              <Plus className="mr-2 h-4 w-4" />
              Record a session
            </Button>
          ) : undefined
        }
        toolbar={
          <div className="grid w-full gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {!restrictedToSelf && (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Person</Label>
                <PersonPicker value={personId} onChange={(id) => setPersonId(id)} />
              </div>
            )}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Plan</Label>
              <Select value={planFilter} onValueChange={setPlanFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All plans</SelectItem>
                  {plansQuery.plans.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Practitioner</Label>
              <Select value={practitionerFilter} onValueChange={setPractitionerFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Anyone</SelectItem>
                  {practitioners
                    .filter((p) => p.discipline === 'physio' || p.discipline === 'medical')
                    .map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.full_name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Any status</SelectItem>
                  {SESSION_STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="session-from" className="text-xs text-muted-foreground">
                From
              </Label>
              <Input
                id="session-from"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="session-to" className="text-xs text-muted-foreground">
                To
              </Label>
              <Input id="session-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>
        }
      />

      <StatGrid>
        <StatTile
          icon={Waves}
          label="Sessions"
          value={query.isLoading ? null : query.summary.total}
          hint={`${query.summary.completed} completed`}
        />
        <StatTile
          icon={CalendarDays}
          label="This week"
          value={query.isLoading ? null : query.summary.thisWeek}
          hint="Last seven days"
        />
        <StatTile
          icon={CalendarCheck}
          label="Scheduled"
          value={query.isLoading ? null : query.summary.scheduled}
          hint={`${query.summary.didNotAttend} did not attend`}
          tone={query.summary.didNotAttend > 0 ? 'warning' : 'default'}
        />
        <StatTile
          icon={TrendingDown}
          label="Average pain drop"
          value={query.isLoading ? null : query.summary.averagePainDrop ?? '—'}
          hint={`${query.summary.improvedCount} sessions improved pain`}
          tone={query.summary.averagePainDrop ? 'good' : 'default'}
        />
      </StatGrid>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Sessions per week</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-44 text-xs">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weekly} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                  dataKey="week"
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'hsl(var(--muted))' }} />
                <Bar dataKey="sessions" name="Sessions" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            The last eight weeks, cancelled sessions excluded.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Session log</CardTitle>
        </CardHeader>
        <CardContent>
          {query.isLoading || access.loading ? (
            <HealthLoading rows={4} />
          ) : query.isError ? (
            <HealthError title="Could not load the session log" error={query.error} />
          ) : query.sessions.length === 0 ? (
            <HealthEmpty
              icon={Waves}
              title="No sessions logged"
              description={
                access.canEdit
                  ? 'Record a session to start the log: what you did, and how the pain moved either side of it.'
                  : 'Nothing matches these filters. Widen the dates or clear the plan and practitioner filters.'
              }
              action={
                access.canEdit ? (
                  <Button size="sm" onClick={openNew}>
                    <Plus className="mr-2 h-4 w-4" />
                    Record a session
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Person</TableHead>
                      <TableHead>Plan</TableHead>
                      <TableHead>Treatment</TableHead>
                      <TableHead>Pain</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Practitioner</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {query.sessions.map((session) => (
                      <TableRow key={session.id}>
                        <TableCell className="whitespace-nowrap text-sm">
                          <span className="text-foreground">{formatDate(session.session_date)}</span>
                          {session.starts_at && (
                            <span className="block text-xs text-muted-foreground">
                              {formatTime(session.starts_at)}
                              {session.duration_minutes
                                ? ` · ${formatDuration(session.duration_minutes)}`
                                : ''}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm font-medium text-foreground">
                          {session.person_name ?? '—'}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {session.plan_title ?? 'No plan'}
                        </TableCell>
                        <TableCell className="max-w-[220px] text-sm">
                          <span className="line-clamp-2">{session.treatment_given ?? '—'}</span>
                        </TableCell>
                        <TableCell>
                          <PainChange before={session.pain_before} after={session.pain_after} />
                        </TableCell>
                        <TableCell>
                          <SessionStatusBadge value={session.status} />
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {session.practitioner_name ?? '—'}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            {access.canEdit && session.status === 'scheduled' && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => query.complete.mutate({ id: session.id })}
                                disabled={query.complete.isPending}
                              >
                                <Check className="mr-1 h-4 w-4" />
                                Complete
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setEditing(session);
                                setDialogOpen(true);
                              }}
                            >
                              {access.canEdit ? 'Open' : 'View'}
                            </Button>
                            {access.canEdit && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive"
                                aria-label="Delete session"
                                onClick={() => setDeleting(session)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <ul className="space-y-3 md:hidden">
                {query.sessions.map((session) => (
                  <li key={session.id} className="rounded-lg border bg-card p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">
                          {session.person_name ?? '—'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(session.session_date)}
                          {session.starts_at ? ` · ${formatTime(session.starts_at)}` : ''}
                          {session.plan_title ? ` · ${session.plan_title}` : ''}
                        </p>
                      </div>
                      <SessionStatusBadge value={session.status} />
                    </div>
                    {session.treatment_given && (
                      <p className="mt-2 line-clamp-2 text-sm text-foreground">
                        {session.treatment_given}
                      </p>
                    )}
                    <div className="mt-2">
                      <PainChange before={session.pain_before} after={session.pain_after} />
                    </div>
                    <div className="mt-3 flex gap-2">
                      {access.canEdit && session.status === 'scheduled' && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={() => query.complete.mutate({ id: session.id })}
                          disabled={query.complete.isPending}
                        >
                          <Check className="mr-1 h-4 w-4" />
                          Complete
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="flex-1"
                        onClick={() => {
                          setEditing(session);
                          setDialogOpen(true);
                        }}
                      >
                        {access.canEdit ? 'Open' : 'View'}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </CardContent>
      </Card>

      <SessionDialog
        open={dialogOpen}
        onOpenChange={(next) => {
          setDialogOpen(next);
          if (!next) setEditing(null);
        }}
        session={editing}
        defaultPersonId={effectivePersonId}
        canEdit={access.canEdit}
      />

      <ConfirmDeleteDialog
        open={Boolean(deleting)}
        onOpenChange={(next) => !next && setDeleting(null)}
        title="Delete this session?"
        description="The session and its notes are removed for good."
        onConfirm={() => {
          if (deleting) query.remove.mutate(deleting.id);
          setDeleting(null);
        }}
      />
    </div>
  );
};

export default SessionLogPage;
