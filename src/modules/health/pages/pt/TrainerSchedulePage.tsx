import React, { useMemo, useState } from 'react';
import { CalendarDays, CalendarRange, Check, ChevronLeft, ChevronRight, Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { HealthPageHeader } from '@/modules/health/components/HealthPageHeader';
import { HealthEmpty, HealthError, HealthLoading } from '@/modules/health/components/HealthStates';
import { AppointmentDialog } from '@/modules/health/components/pt/AppointmentDialog';
import { AppointmentStatusBadge, StaffOnlyNotice } from '@/modules/health/components/pt/PtCommon';
import { useWellnessAccess } from '@/modules/auth/hooks/useWellnessAccess';
import { usePractitioners } from '@/modules/health/hooks/usePractitioners';
import {
  addDaysIsoDate,
  appointmentTypeLabel,
  todayIsoDate,
  usePtAppointments,
  weekStartIso,
  type PtAppointmentEntry,
} from '@/modules/health/hooks/usePtPrograms';
import { formatDate, formatTime, localDayOf } from '@/modules/health/lib/format';

const DAY_LABELS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** The trainer's diary: a day at a time or the whole week. */
const TrainerSchedulePage: React.FC = () => {
  const access = useWellnessAccess();
  const canEdit = access.canEdit;
  const trainers = usePractitioners('pt');

  const [view, setView] = useState<'day' | 'week'>('day');
  const [anchor, setAnchor] = useState(todayIsoDate());
  const [trainerFilter, setTrainerFilter] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PtAppointmentEntry | null>(null);
  const [defaultStart, setDefaultStart] = useState<string | null>(null);

  // The week is always loaded so a double booking anywhere in it is seen.
  const weekStart = weekStartIso(anchor);
  const weekEnd = addDaysIsoDate(weekStart, 7);
  const diary = usePtAppointments({
    from: weekStart,
    to: weekEnd,
    trainerId: trainerFilter === 'all' ? null : trainerFilter,
  });

  const byDay = useMemo(() => {
    const map = new Map<string, PtAppointmentEntry[]>();
    for (let i = 0; i < 7; i += 1) map.set(addDaysIsoDate(weekStart, i), []);
    for (const appointment of diary.appointments) {
      // The columns are local days, so the appointment has to be bucketed by
      // its local day too. Slicing the stored UTC timestamp drops an evening
      // session west of Greenwich into tomorrow's column, and since only the
      // seven local keys are rendered, off-grid keys disappear from the diary.
      const key = localDayOf(appointment.starts_at);
      if (!key || !map.has(key)) continue;
      map.set(key, [...(map.get(key) ?? []), appointment]);
    }
    return map;
  }, [diary.appointments, weekStart]);

  const dayAppointments = byDay.get(anchor) ?? [];

  const openNew = (startIso: string | null) => {
    setEditing(null);
    setDefaultStart(startIso);
    setDialogOpen(true);
  };

  if (!access.loading && !access.canView) {
    return (
      <div className="space-y-6">
        <HealthPageHeader icon={CalendarRange} title="Training schedule" description="The trainer's diary." />
        <StaffOnlyNotice what="diary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <HealthPageHeader
        icon={CalendarRange}
        title="Training schedule"
        description="One to one sessions, classes, assessments and rehabilitation slots."
        actions={
          canEdit ? (
            <Button size="sm" onClick={() => openNew(`${anchor}T08:00:00`)}>
              <Plus className="mr-2 h-4 w-4" />
              Book a session
            </Button>
          ) : undefined
        }
        toolbar={
          <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                aria-label="Previous"
                onClick={() => setAnchor(addDaysIsoDate(anchor, view === 'day' ? -1 : -7))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Input
                type="date"
                value={anchor}
                onChange={(e) => e.target.value && setAnchor(e.target.value)}
                className="w-[10.5rem]"
              />
              <Button
                variant="outline"
                size="icon"
                aria-label="Next"
                onClick={() => setAnchor(addDaysIsoDate(anchor, view === 'day' ? 1 : 7))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setAnchor(todayIsoDate())}>
                Today
              </Button>
            </div>

            <Select value={trainerFilter} onValueChange={setTrainerFilter}>
              <SelectTrigger className="sm:w-56">
                <SelectValue placeholder="All trainers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All trainers</SelectItem>
                {trainers.active.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Tabs value={view} onValueChange={(value) => setView(value as 'day' | 'week')} className="sm:ml-auto">
              <TabsList>
                <TabsTrigger value="day">
                  <CalendarDays className="mr-1.5 h-4 w-4" />
                  Day
                </TabsTrigger>
                <TabsTrigger value="week">
                  <CalendarRange className="mr-1.5 h-4 w-4" />
                  Week
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        }
      />

      {diary.isLoading ? (
        <HealthLoading rows={4} />
      ) : diary.isError ? (
        <HealthError error={diary.error} title="Could not load the diary" />
      ) : view === 'day' ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{formatDate(anchor, 'EEEE d MMMM yyyy')}</CardTitle>
          </CardHeader>
          <CardContent>
            {dayAppointments.length === 0 ? (
              <HealthEmpty
                icon={CalendarDays}
                title="Nothing booked on this day"
                description={
                  canEdit
                    ? 'Book a session to put it in the diary and on the athlete’s own page.'
                    : 'Ask a trainer to book you in.'
                }
                className="border-0 p-8"
                action={
                  canEdit ? (
                    <Button size="sm" onClick={() => openNew(`${anchor}T08:00:00`)}>
                      <Plus className="mr-2 h-4 w-4" />
                      Book a session
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <ul className="space-y-2">
                {dayAppointments.map((appointment) => (
                  <AppointmentRow
                    key={appointment.id}
                    appointment={appointment}
                    canEdit={canEdit}
                    busy={diary.isMutating}
                    onEdit={() => {
                      setEditing(appointment);
                      setDefaultStart(null);
                      setDialogOpen(true);
                    }}
                    onStatus={(status) => diary.setStatus.mutate({ id: appointment.id, status })}
                  />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 7 }, (_, i) => addDaysIsoDate(weekStart, i)).map((date, index) => {
            const rows = byDay.get(date) ?? [];
            const isToday = date === todayIsoDate();
            return (
              <Card key={date} className={cn(isToday && 'border-primary/40')}>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center justify-between text-sm">
                    <span>{DAY_LABELS[index]}</span>
                    <span className={cn('text-xs font-normal', isToday ? 'text-primary' : 'text-muted-foreground')}>
                      {formatDate(date, 'd MMM')}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {rows.length === 0 ? (
                    <p className="py-3 text-center text-xs text-muted-foreground">Nothing booked</p>
                  ) : (
                    rows.map((appointment) => (
                      <button
                        key={appointment.id}
                        type="button"
                        onClick={() => {
                          setEditing(appointment);
                          setDefaultStart(null);
                          setDialogOpen(true);
                        }}
                        className="w-full rounded-md border border-border p-2 text-left transition-colors hover:bg-accent/50"
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium text-foreground">
                            {formatTime(appointment.starts_at)}
                          </span>
                          <AppointmentStatusBadge status={appointment.status} />
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {appointment.title ?? appointmentTypeLabel(appointment.session_type)}
                        </span>
                        <span className="block truncate text-[11px] text-muted-foreground/80">
                          {appointment.person_name ?? 'Open class'}
                        </span>
                      </button>
                    ))
                  )}
                  {canEdit && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full"
                      onClick={() => {
                        setAnchor(date);
                        openNew(`${date}T08:00:00`);
                      }}
                    >
                      <Plus className="mr-1.5 h-3.5 w-3.5" />
                      Add
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <AppointmentDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        appointment={editing}
        defaultStart={defaultStart}
        saving={diary.isMutating}
        findConflicts={diary.findConflicts}
        onSave={(values) => diary.save.mutate(values, { onSuccess: () => setDialogOpen(false) })}
      />
    </div>
  );
};

interface AppointmentRowProps {
  appointment: PtAppointmentEntry;
  canEdit: boolean;
  busy: boolean;
  onEdit: () => void;
  onStatus: (status: string) => void;
}

const AppointmentRow: React.FC<AppointmentRowProps> = ({ appointment, canEdit, busy, onEdit, onStatus }) => (
  <li className="flex flex-col gap-3 rounded-md border border-border p-3 sm:flex-row sm:items-center sm:justify-between">
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-foreground">
          {formatTime(appointment.starts_at)} to {formatTime(appointment.ends_at)}
        </span>
        <AppointmentStatusBadge status={appointment.status} />
      </div>
      <p className="truncate text-sm text-foreground">
        {appointment.title ?? appointmentTypeLabel(appointment.session_type)}
      </p>
      <p className="truncate text-xs text-muted-foreground">
        {[
          appointment.person_name ?? 'Open class',
          appointment.trainer_name ?? 'No trainer set',
          appointment.location,
          appointment.capacity ? `Capacity ${appointment.capacity}` : null,
          appointment.program_session_title ? `Linked: ${appointment.program_session_title}` : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      </p>
    </div>
    {canEdit && (
      <div className="flex shrink-0 flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={onEdit}>
          Edit
        </Button>
        {appointment.status !== 'completed' && (
          <Button variant="outline" size="sm" disabled={busy} onClick={() => onStatus('completed')}>
            <Check className="mr-1.5 h-4 w-4" />
            Complete
          </Button>
        )}
        {appointment.status !== 'cancelled' && (
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive"
            disabled={busy}
            onClick={() => onStatus('cancelled')}
          >
            <X className="mr-1.5 h-4 w-4" />
            Cancel
          </Button>
        )}
      </div>
    )}
  </li>
);

export default TrainerSchedulePage;
