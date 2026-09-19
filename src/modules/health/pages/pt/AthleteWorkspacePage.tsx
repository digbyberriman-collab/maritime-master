import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  CalendarClock,
  ClipboardList,
  LineChart,
  Ruler,
  Send,
  Target,
  UserRound,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { HealthPageHeader } from '@/modules/health/components/HealthPageHeader';
import {
  HealthEmpty,
  HealthError,
  HealthLoading,
  PickPersonPrompt,
} from '@/modules/health/components/HealthStates';
import { PersonPicker } from '@/modules/health/components/PersonPicker';
import { AssignProgramDialog } from '@/modules/health/components/pt/AssignProgramDialog';
import { MeasurementDialog } from '@/modules/health/components/pt/MeasurementDialog';
import { PtBarChart, PtTrendChart } from '@/modules/health/components/pt/PtCharts';
import {
  AdherenceMeter,
  Fact,
  ProgramStatusBadge,
  SessionStatusBadge,
  StaffOnlyNotice,
} from '@/modules/health/components/pt/PtCommon';
import { SessionEditor } from '@/modules/health/components/pt/SessionEditor';
import { useWellnessAccess } from '@/modules/auth/hooks/useWellnessAccess';
import { useSelectedPerson } from '@/modules/health/hooks/useSelectedPerson';
import { useReferrals } from '@/modules/health/hooks/useReferrals';
import {
  useMeasurements,
  usePersonSetLogs,
  useProgramSessions,
  usePtAppointments,
  usePtPrograms,
  useTrainingGoals,
  appointmentTypeLabel,
  addDaysIsoDate,
  todayIsoDate,
  type HwMeasurement,
} from '@/modules/health/hooks/usePtPrograms';
import { HEALTH_PATHS } from '@/modules/health/paths';
import { formatDate, formatTime } from '@/modules/health/lib/format';

/** One athlete, everything about their training in four tabs. */
const AthleteWorkspacePage: React.FC = () => {
  const access = useWellnessAccess();
  const canEdit = access.canEdit;
  const { personId, person, setPersonId, selfOnly } = useSelectedPerson('wellness');

  const programs = usePtPrograms({ personId });
  const [programId, setProgramId] = useState<string | null>(null);
  const sessions = useProgramSessions(programId);
  const measurements = useMeasurements(personId);
  const setLogs = usePersonSetLogs(personId);
  const appointments = usePtAppointments({ personId, from: addDaysIsoDate(todayIsoDate(), -180) });
  const goals = useTrainingGoals({ personId });
  const referrals = useReferrals({ personId, toDiscipline: 'pt' });

  const [assignOpen, setAssignOpen] = useState(false);
  const [measurementOpen, setMeasurementOpen] = useState(false);
  const [editingMeasurement, setEditingMeasurement] = useState<HwMeasurement | null>(null);

  const current = useMemo(
    () => programs.programs.find((p) => p.id === programId) ?? programs.programs[0] ?? null,
    [programs.programs, programId],
  );

  useEffect(() => {
    if (!programId && programs.programs.length) setProgramId(programs.programs[0].id);
  }, [programId, programs.programs]);

  const measurementChart = useMemo(
    () =>
      measurements.chronological.map((m) => ({
        label: formatDate(m.measured_on, 'd MMM'),
        weight: m.weight_kg,
        bodyFat: m.body_fat_pct,
        waist: m.waist_cm,
        chest: m.chest_cm,
        hip: m.hip_cm,
        arm: m.arm_cm,
        thigh: m.thigh_cm,
      })),
    [measurements.chronological],
  );

  const volumeChart = useMemo(
    () =>
      setLogs.volumeByWeek.slice(-12).map((row) => ({
        label: formatDate(row.week, 'd MMM'),
        volume: row.volume,
      })),
    [setLogs.volumeByWeek],
  );

  if (!access.loading && !access.canView) {
    return (
      <div className="space-y-6">
        <HealthPageHeader icon={UserRound} title="Athlete workspace" description="One athlete's training." />
        <StaffOnlyNotice what="workspace" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <HealthPageHeader
        icon={UserRound}
        title="Athlete workspace"
        description="Programme, history and measurements for one athlete."
        actions={
          canEdit && personId ? (
            <>
              <Button variant="outline" size="sm" onClick={() => setMeasurementOpen(true)}>
                <Ruler className="mr-2 h-4 w-4" />
                Record measurements
              </Button>
              <Button size="sm" onClick={() => setAssignOpen(true)}>
                <Send className="mr-2 h-4 w-4" />
                Assign a programme
              </Button>
            </>
          ) : undefined
        }
        toolbar={
          selfOnly ? undefined : (
            <PersonPicker
              value={personId}
              onChange={(id) => {
                setPersonId(id);
                setProgramId(null);
              }}
              className="md:w-96"
              placeholder="Choose an athlete"
            />
          )
        }
      />

      {!personId ? (
        <PickPersonPrompt what="training" icon={UserRound} />
      ) : programs.isError ? (
        <HealthError error={programs.error} title="Could not load this athlete" />
      ) : (
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="programme">Programme</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
            <TabsTrigger value="measurements">Measurements</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">{person?.displayName ?? 'Athlete'}</CardTitle>
                    <CardDescription>
                      {[person?.rank, person?.vessel_name, person?.cabin].filter(Boolean).join(' · ') ||
                        'No vessel or cabin recorded'}
                    </CardDescription>
                  </div>
                  {current && <ProgramStatusBadge status={current.status} />}
                </div>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Fact label="Programme" value={current?.name ?? 'None assigned'} />
                <Fact label="Trainer" value={current?.trainer_name ?? 'Unassigned'} />
                <Fact
                  label="Runs"
                  value={
                    current
                      ? `${formatDate(current.start_date)} to ${formatDate(current.end_date)}`
                      : '—'
                  }
                />
                <Fact
                  label="Sessions done"
                  value={current ? `${current.completedSessions}/${current.totalSessions}` : '—'}
                />
                <AdherenceMeter value={current?.adherencePct ?? null} label="Last 4 weeks" />
                <Fact
                  label="Last session"
                  value={current?.lastCompletedOn ? formatDate(current.lastCompletedOn) : 'Never'}
                />
                <Fact
                  label="Next booking"
                  value={
                    appointments.appointments.find((a) => a.starts_at >= new Date().toISOString())
                      ? formatDate(
                          appointments.appointments.find((a) => a.starts_at >= new Date().toISOString())!
                            .starts_at,
                        )
                      : 'None'
                  }
                />
                <Fact
                  label="Sets logged"
                  value={setLogs.isLoading ? '—' : setLogs.logs.length}
                />
              </CardContent>
            </Card>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Training load</CardTitle>
                  <CardDescription>Volume each week, reps multiplied by load.</CardDescription>
                </CardHeader>
                <CardContent>
                  <PtBarChart
                    data={volumeChart}
                    xKey="label"
                    series={[{ key: 'volume', label: 'Volume (kg)' }]}
                    emptyMessage="Nothing logged yet. Volume appears once sets are recorded in the gym."
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Goals</CardTitle>
                  <CardDescription>Shared with nutrition and physiotherapy.</CardDescription>
                </CardHeader>
                <CardContent>
                  {goals.isLoading ? (
                    <HealthLoading rows={2} />
                  ) : goals.goals.length === 0 ? (
                    <HealthEmpty
                      icon={Target}
                      title="No goals set"
                      description="Agree a goal with the athlete so progress has something to measure against."
                      className="border-0 p-6"
                    />
                  ) : (
                    <ul className="divide-y">
                      {goals.goals.slice(0, 6).map((goal) => (
                        <li key={goal.id} className="flex items-center justify-between gap-3 py-2.5">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-foreground">{goal.title}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {[
                                goal.target_value !== null ? `Target ${goal.target_value}${goal.unit ?? ''}` : null,
                                goal.target_date ? `by ${formatDate(goal.target_date)}` : null,
                              ]
                                .filter(Boolean)
                                .join(' · ')}
                            </p>
                          </div>
                          <Badge variant="outline" className="shrink-0 text-[10px] capitalize">
                            {goal.status}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </div>

            {referrals.referrals.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Referrals to training</CardTitle>
                  <CardDescription>Why this athlete was sent to the gym.</CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="divide-y">
                    {referrals.referrals.slice(0, 5).map((referral) => (
                      <li key={referral.id} className="py-2.5">
                        <div className="flex items-center justify-between gap-3">
                          <p className="truncate text-sm text-foreground">
                            {referral.reason ?? 'No reason given'}
                          </p>
                          <Badge variant="outline" className="shrink-0 text-[10px] capitalize">
                            {referral.status}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(referral.created_at)} · from {referral.from_discipline}
                        </p>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="programme" className="space-y-4">
            {programs.isLoading ? (
              <HealthLoading rows={3} />
            ) : programs.programs.length === 0 ? (
              <HealthEmpty
                icon={ClipboardList}
                title="No programme assigned"
                description="Assign a published template to start them off. The template is copied, so later edits to it will not disturb this athlete."
                action={
                  canEdit ? (
                    <Button size="sm" onClick={() => setAssignOpen(true)}>
                      Assign a programme
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <Select value={programId ?? ''} onValueChange={setProgramId}>
                    <SelectTrigger className="sm:w-96">
                      <SelectValue placeholder="Choose a programme" />
                    </SelectTrigger>
                    <SelectContent>
                      {programs.programs.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name} · {formatDate(p.start_date)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {current && canEdit && (
                    <div className="flex flex-wrap gap-2">
                      {current.status === 'active' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => programs.setStatus.mutate({ id: current.id, status: 'paused' })}
                        >
                          Pause
                        </Button>
                      )}
                      {current.status === 'paused' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => programs.setStatus.mutate({ id: current.id, status: 'active' })}
                        >
                          Resume
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => programs.setStatus.mutate({ id: current.id, status: 'completed' })}
                      >
                        Complete
                      </Button>
                    </div>
                  )}
                </div>

                {sessions.isLoading ? (
                  <HealthLoading rows={3} />
                ) : sessions.isError ? (
                  <HealthError error={sessions.error} title="Could not load the sessions" />
                ) : sessions.weeks.length === 0 ? (
                  <HealthEmpty
                    icon={ClipboardList}
                    title="This programme has no sessions"
                    description="The template it came from had no days. Add sessions to the template and assign it again."
                  />
                ) : (
                  <div className="space-y-6">
                    {sessions.weeks.map((week) => (
                      <section key={week.week} className="space-y-3">
                        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                          Week {week.week}
                        </h3>
                        {week.sessions.map((session) => (
                          <SessionEditor
                            key={session.id}
                            session={session}
                            canEdit={canEdit}
                            busy={sessions.isMutating}
                            onUpdateSession={(values) =>
                              sessions.updateSession.mutate({ id: session.id, values })
                            }
                            onAddItem={(input) => sessions.addItem.mutate(input)}
                            onUpdateItem={(id, values) => sessions.updateItem.mutate({ id, values })}
                            onRemoveItem={(id) => sessions.removeItem.mutate(id)}
                            onMoveItem={(id, direction) => sessions.moveItem.mutate({ id, direction })}
                          />
                        ))}
                      </section>
                    ))}
                  </div>
                )}
              </>
            )}
          </TabsContent>

          <TabsContent value="history" className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Completed sessions</CardTitle>
                <CardDescription>Across every programme this athlete has been given.</CardDescription>
              </CardHeader>
              <CardContent>
                {programs.isLoading ? (
                  <HealthLoading rows={3} />
                ) : (
                  (() => {
                    const rows = programs.programs
                      .flatMap((p) => p.sessions.map((s) => ({ program: p, session: s })))
                      .filter((row) => row.session.status === 'completed')
                      .sort((a, b) =>
                        (b.session.completed_at ?? b.session.scheduled_on ?? '').localeCompare(
                          a.session.completed_at ?? a.session.scheduled_on ?? '',
                        ),
                      );
                    return rows.length === 0 ? (
                      <HealthEmpty
                        icon={Activity}
                        title="Nothing logged yet"
                        description="Sessions appear here once the athlete marks them complete in My training."
                        className="border-0 p-6"
                      />
                    ) : (
                      <ul className="divide-y">
                        {rows.slice(0, 30).map((row) => (
                          <li key={row.session.id} className="flex items-center justify-between gap-3 py-2.5">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-foreground">
                                {row.session.title}
                              </p>
                              <p className="truncate text-xs text-muted-foreground">
                                {row.program.name} · Week {row.session.week_number} Day{' '}
                                {row.session.day_number}
                              </p>
                            </div>
                            <div className="shrink-0 text-right">
                              <p className="text-xs text-muted-foreground">
                                {formatDate(row.session.completed_at ?? row.session.scheduled_on)}
                              </p>
                              <SessionStatusBadge status={row.session.status} />
                            </div>
                          </li>
                        ))}
                      </ul>
                    );
                  })()
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Booked sessions</CardTitle>
                <CardDescription>The diary for this athlete, past and upcoming.</CardDescription>
              </CardHeader>
              <CardContent>
                {appointments.isLoading ? (
                  <HealthLoading rows={2} />
                ) : appointments.appointments.length === 0 ? (
                  <HealthEmpty
                    icon={CalendarClock}
                    title="No bookings"
                    description="Book a session from the schedule to put one in the diary."
                    className="border-0 p-6"
                    action={
                      <Button asChild size="sm" variant="outline">
                        <Link to={HEALTH_PATHS.trainerSchedule}>Open the diary</Link>
                      </Button>
                    }
                  />
                ) : (
                  <ul className="divide-y">
                    {appointments.appointments.slice(0, 20).map((appointment) => (
                      <li key={appointment.id} className="flex items-center justify-between gap-3 py-2.5">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">
                            {appointment.title ?? appointmentTypeLabel(appointment.session_type)}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {[appointment.trainer_name, appointment.location].filter(Boolean).join(' · ')}
                          </p>
                        </div>
                        <div className="shrink-0 text-right text-xs text-muted-foreground">
                          <p>{formatDate(appointment.starts_at)}</p>
                          <p>{formatTime(appointment.starts_at)}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="measurements" className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Weight and body fat</CardTitle>
                  <CardDescription>Every measurement recorded, oldest first.</CardDescription>
                </CardHeader>
                <CardContent>
                  <PtTrendChart
                    data={measurementChart}
                    xKey="label"
                    series={[
                      { key: 'weight', label: 'Weight (kg)' },
                      { key: 'bodyFat', label: 'Body fat (%)' },
                    ]}
                    emptyMessage="No measurements yet. Record the first set to start the trend."
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Key girths</CardTitle>
                  <CardDescription>Waist, chest, hip, arm and thigh in centimetres.</CardDescription>
                </CardHeader>
                <CardContent>
                  <PtTrendChart
                    data={measurementChart}
                    xKey="label"
                    series={[
                      { key: 'waist', label: 'Waist' },
                      { key: 'chest', label: 'Chest' },
                      { key: 'hip', label: 'Hip' },
                      { key: 'arm', label: 'Arm' },
                      { key: 'thigh', label: 'Thigh' },
                    ]}
                    emptyMessage="No girths recorded yet."
                  />
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader className="flex-row items-center justify-between gap-3 pb-3">
                <div>
                  <CardTitle className="text-base">Measurement history</CardTitle>
                  <CardDescription>Most recent first.</CardDescription>
                </div>
                {canEdit && (
                  <Button
                    size="sm"
                    onClick={() => {
                      setEditingMeasurement(null);
                      setMeasurementOpen(true);
                    }}
                  >
                    <Ruler className="mr-2 h-4 w-4" />
                    Record
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                {measurements.isLoading ? (
                  <HealthLoading rows={3} />
                ) : measurements.isError ? (
                  <HealthError error={measurements.error} title="Could not load measurements" />
                ) : measurements.measurements.length === 0 ? (
                  <HealthEmpty
                    icon={LineChart}
                    title="No measurements recorded"
                    description="Record weight and girths so progress can be seen rather than guessed at."
                    className="border-0 p-6"
                    action={
                      canEdit ? (
                        <Button size="sm" onClick={() => setMeasurementOpen(true)}>
                          Record measurements
                        </Button>
                      ) : undefined
                    }
                  />
                ) : (
                  <ul className="divide-y">
                    {measurements.measurements.map((measurement) => (
                      <li key={measurement.id} className="flex items-center justify-between gap-3 py-2.5">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground">
                            {formatDate(measurement.measured_on)}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {[
                              measurement.weight_kg !== null ? `${measurement.weight_kg} kg` : null,
                              measurement.body_fat_pct !== null ? `${measurement.body_fat_pct}% fat` : null,
                              measurement.waist_cm !== null ? `waist ${measurement.waist_cm} cm` : null,
                              measurement.resting_hr !== null ? `RHR ${measurement.resting_hr}` : null,
                            ]
                              .filter(Boolean)
                              .join(' · ') || 'No values recorded'}
                          </p>
                        </div>
                        {canEdit && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditingMeasurement(measurement);
                              setMeasurementOpen(true);
                            }}
                          >
                            Edit
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      <AssignProgramDialog
        open={assignOpen}
        onOpenChange={setAssignOpen}
        personId={personId}
        onAssigned={(newProgramId) => setProgramId(newProgramId)}
      />

      <MeasurementDialog
        open={measurementOpen}
        onOpenChange={(open) => {
          setMeasurementOpen(open);
          if (!open) setEditingMeasurement(null);
        }}
        measurement={editingMeasurement}
        saving={measurements.isMutating}
        defaultSource="pt"
        onSave={(values) =>
          measurements.save.mutate(values, { onSuccess: () => setMeasurementOpen(false) })
        }
      />
    </div>
  );
};

export default AthleteWorkspacePage;
