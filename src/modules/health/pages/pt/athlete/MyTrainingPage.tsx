import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, Dumbbell, Flame } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { HealthPageHeader } from '@/modules/health/components/HealthPageHeader';
import {
  HealthEmpty,
  HealthError,
  HealthLoading,
  NoSubjectRecord,
} from '@/modules/health/components/HealthStates';
import {
  AdherenceMeter,
  Fact,
  ProgramStatusBadge,
  SessionStatusBadge,
} from '@/modules/health/components/pt/PtCommon';
import { WorkoutLogger } from '@/modules/health/components/pt/WorkoutLogger';
import { useSelectedPerson } from '@/modules/health/hooks/useSelectedPerson';
import {
  useAthleteTraining,
  usePersonSetLogs,
  useWorkoutSession,
} from '@/modules/health/hooks/usePtPrograms';
import { HEALTH_PATHS } from '@/modules/health/paths';
import { formatDate } from '@/modules/health/lib/format';

/**
 * The athlete's own training. Opened on a phone in the gym, so the session in
 * hand is the first thing on screen.
 */
const MyTrainingPage: React.FC = () => {
  const { personId, myPerson, selfOnly, person, directoryLoading } = useSelectedPerson('wellness');
  // Staff opening this page see their own training unless a person is named.
  const athleteId = selfOnly ? personId : personId ?? myPerson?.id ?? null;

  const training = useAthleteTraining(athleteId);
  const setLogs = usePersonSetLogs(athleteId);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const workout = useWorkoutSession(sessionId);

  useEffect(() => {
    if (sessionId) return;
    const next = training.todaySession ?? training.nextSession ?? training.thisWeek[0] ?? null;
    if (next) setSessionId(next.id);
  }, [sessionId, training.todaySession, training.nextSession, training.thisWeek]);

  if (!athleteId) {
    return (
      <div className="space-y-6">
        <HealthPageHeader icon={Dumbbell} title="My training" description="Your programme and today's session." />
        {directoryLoading ? <HealthLoading rows={2} /> : <NoSubjectRecord />}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <HealthPageHeader
        icon={Dumbbell}
        title="My training"
        description={
          person && !selfOnly && person.id !== myPerson?.id
            ? `Training for ${person.displayName}`
            : "Your programme, this week's sessions and today's workout."
        }
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to={HEALTH_PATHS.myProgress}>My progress</Link>
          </Button>
        }
      />

      {training.isLoading ? (
        <HealthLoading rows={4} />
      ) : training.isError ? (
        <HealthError error={training.error} title="Could not load your training" />
      ) : !training.program ? (
        <HealthEmpty
          icon={Dumbbell}
          title="No programme yet"
          description="Ask a trainer to put you on a programme, or book an assessment so they can write one for you."
          action={
            <Button asChild size="sm" variant="outline">
              <Link to={HEALTH_PATHS.myAthleteProfile}>See my profile</Link>
            </Button>
          }
        />
      ) : (
        <>
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-base">{training.program.name}</CardTitle>
                  <CardDescription>
                    {training.program.goals ?? 'No goals written on this programme.'}
                  </CardDescription>
                </div>
                <ProgramStatusBadge status={training.program.status} />
              </div>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Fact label="Trainer" value={training.program.trainer_name ?? 'Unassigned'} />
              <Fact
                label="Sessions done"
                value={`${training.program.completedSessions}/${training.program.totalSessions}`}
              />
              <Fact label="Finishes" value={formatDate(training.program.end_date)} />
              <AdherenceMeter value={training.program.adherencePct} label="Last 4 weeks" />
            </CardContent>
          </Card>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              This week
            </h2>
            {training.thisWeek.length === 0 ? (
              <HealthEmpty
                icon={CalendarDays}
                title="Nothing scheduled this week"
                description="Pick any session from your programme below, or take the week as recovery."
                className="p-6"
              />
            ) : (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {training.thisWeek.map((session) => (
                  <button
                    key={session.id}
                    type="button"
                    onClick={() => setSessionId(session.id)}
                    className={cn(
                      'rounded-lg border p-3 text-left transition-colors hover:bg-accent/50',
                      session.id === sessionId ? 'border-primary bg-accent' : 'border-border bg-card',
                    )}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-foreground">{session.title}</span>
                      <SessionStatusBadge status={session.status} />
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {session.scheduled_on ? formatDate(session.scheduled_on) : 'Unscheduled'} ·{' '}
                      {session.items.length} exercises
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {workout.session?.title ?? 'Session'}
              </h2>
              {workout.session?.focus && (
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Flame className="h-3.5 w-3.5" />
                  {workout.session.focus}
                </span>
              )}
            </div>

            {!sessionId ? (
              <HealthEmpty
                icon={Dumbbell}
                title="Choose a session"
                description="Pick one from this week, or from the full programme below."
              />
            ) : workout.isLoading ? (
              <HealthLoading rows={3} />
            ) : workout.isError ? (
              <HealthError error={workout.error} title="Could not load the session" />
            ) : !workout.session ? (
              <HealthEmpty
                icon={Dumbbell}
                title="That session is no longer there"
                description="Your trainer may have changed the programme. Pick another session from this week."
              />
            ) : (
              <WorkoutLogger
                session={workout.session}
                personId={athleteId}
                canLog
                logsByItem={workout.logsByItem}
                totalVolume={workout.totalVolume}
                previousFor={setLogs.previousFor}
                busy={workout.isMutating}
                onLogSet={(input) => workout.logSet.mutate(input)}
                onRemoveSet={(id) => workout.removeSet.mutate(id)}
                onComplete={(values) =>
                  workout.completeSession.mutate({ id: workout.session!.id, ...values })
                }
              />
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              The whole programme
            </h2>
            <div className="space-y-3">
              {training.weeks.map((week) => (
                <Card key={week.week}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Week {week.week}</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {week.sessions.map((session) => (
                      <button
                        key={session.id}
                        type="button"
                        onClick={() => setSessionId(session.id)}
                        className={cn(
                          'rounded-md border p-2 text-left transition-colors hover:bg-accent/50',
                          session.id === sessionId ? 'border-primary bg-accent' : 'border-border',
                        )}
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate text-xs font-medium text-foreground">
                            Day {session.day_number} · {session.title}
                          </span>
                          <SessionStatusBadge status={session.status} />
                        </span>
                        <span className="mt-0.5 block text-[11px] text-muted-foreground">
                          {session.scheduled_on ? formatDate(session.scheduled_on) : 'Unscheduled'}
                        </span>
                      </button>
                    ))}
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
};

export default MyTrainingPage;
