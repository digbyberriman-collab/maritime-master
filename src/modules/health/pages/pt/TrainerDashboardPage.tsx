import React from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  AlarmClock,
  CalendarClock,
  CalendarDays,
  ClipboardList,
  Dumbbell,
  Inbox,
  TrendingDown,
  Users,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { HealthPageHeader } from '@/modules/health/components/HealthPageHeader';
import { StatGrid, StatTile } from '@/modules/health/components/StatTile';
import { HealthEmpty, HealthError } from '@/modules/health/components/HealthStates';
import {
  AdherenceMeter,
  AppointmentStatusBadge,
  StaffOnlyNotice,
} from '@/modules/health/components/pt/PtCommon';
import { useWellnessAccess } from '@/modules/auth/hooks/useWellnessAccess';
import { useReferrals } from '@/modules/health/hooks/useReferrals';
import {
  appointmentTypeLabel,
  usePtDashboard,
} from '@/modules/health/hooks/usePtPrograms';
import { HEALTH_PATHS, healthLink } from '@/modules/health/paths';
import { formatDate, formatTime } from '@/modules/health/lib/format';

/**
 * What the trainer needs on waking: who is in the gym today, who is falling
 * behind, and who has been referred to them.
 */
const TrainerDashboardPage: React.FC = () => {
  const access = useWellnessAccess();
  const data = usePtDashboard();
  const referrals = useReferrals({ toDiscipline: 'pt', openOnly: true });

  if (!access.loading && !access.canView) {
    return (
      <div className="space-y-6">
        <HealthPageHeader
          icon={Dumbbell}
          title="Training dashboard"
          description="Today on the gym floor, programme adherence and open referrals."
        />
        <StaffOnlyNotice what="dashboard" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <HealthPageHeader
        icon={Dumbbell}
        title="Training dashboard"
        description="Today on the gym floor, programme adherence and open referrals."
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link to={HEALTH_PATHS.athleteRoster}>Athlete roster</Link>
            </Button>
            <Button asChild size="sm">
              <Link to={HEALTH_PATHS.trainerSchedule}>Open the diary</Link>
            </Button>
          </>
        }
      />

      {data.error ? <HealthError error={data.error} title="Could not load the training data" /> : null}

      <section aria-labelledby="today-heading" className="space-y-3">
        <h2 id="today-heading" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          This week
        </h2>
        <StatGrid>
          <StatTile
            icon={CalendarDays}
            label="Sessions today"
            value={data.loading ? null : data.today.length}
            hint={`${data.week.length} booked this week`}
            to={HEALTH_PATHS.trainerSchedule}
          />
          <StatTile
            icon={ClipboardList}
            label="Active programmes"
            value={data.loading ? null : data.activePrograms}
            hint={data.pausedPrograms ? `${data.pausedPrograms} paused` : 'None paused'}
            to={HEALTH_PATHS.activePrograms}
          />
          <StatTile
            icon={Users}
            label="Athletes training"
            value={data.loading ? null : data.athletesTrainingThisWeek}
            hint="With a session due this week"
            to={HEALTH_PATHS.athleteRoster}
          />
          <StatTile
            icon={Activity}
            label="Sessions completed"
            value={
              data.loading ? null : `${data.sessionsCompletedThisWeek}/${data.sessionsScheduledThisWeek}`
            }
            hint={data.adherencePct === null ? 'Nothing due yet' : `${data.adherencePct}% adherence`}
            tone={
              data.adherencePct === null
                ? 'default'
                : data.adherencePct >= 80
                  ? 'good'
                  : data.adherencePct >= 50
                    ? 'warning'
                    : 'critical'
            }
            to={HEALTH_PATHS.activePrograms}
          />
        </StatGrid>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Today&rsquo;s sessions</CardTitle>
            <CardDescription>
              {data.today.length ? 'In order of start time.' : 'Nothing booked today.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {data.loading ? (
              <div className="space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : data.today.length === 0 ? (
              <HealthEmpty
                icon={CalendarClock}
                title="The diary is clear"
                description="Book a session from the schedule, or use the time for programme reviews."
                className="border-0 p-6"
                action={
                  <Button asChild size="sm" variant="outline">
                    <Link to={HEALTH_PATHS.trainerSchedule}>Open the diary</Link>
                  </Button>
                }
              />
            ) : (
              <ul className="divide-y">
                {data.today.map((appointment) => (
                  <li key={appointment.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {appointment.title ?? appointmentTypeLabel(appointment.session_type)}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[
                          appointment.person_name ?? 'Open class',
                          appointment.trainer_name,
                          appointment.location,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-medium text-foreground">
                        {formatTime(appointment.starts_at)}
                      </p>
                      <AppointmentStatusBadge status={appointment.status} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Open referrals to training</CardTitle>
            <CardDescription>
              Sent by the medic, the physiotherapist or the crew member themselves.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {referrals.isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : referrals.isError ? (
              <HealthError error={referrals.error} title="Could not load referrals" />
            ) : referrals.referrals.length === 0 ? (
              <HealthEmpty
                icon={Inbox}
                title="No open referrals"
                description="Anything sent to the training team will land here."
                className="border-0 p-6"
              />
            ) : (
              <ul className="divide-y">
                {referrals.referrals.slice(0, 8).map((referral) => (
                  <li key={referral.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <Link
                        to={healthLink(HEALTH_PATHS.athleteWorkspace, referral.person_id)}
                        className="truncate text-sm font-medium text-foreground hover:underline"
                      >
                        {referral.person_name ?? 'Unnamed'}
                      </Link>
                      <p className="truncate text-xs text-muted-foreground">
                        {referral.reason ?? 'No reason given'}
                      </p>
                    </div>
                    <Badge variant="outline" className="shrink-0 text-[10px]">
                      {formatDate(referral.created_at)}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Programmes ending soon</CardTitle>
            <CardDescription>Within the next two weeks. Plan what follows.</CardDescription>
          </CardHeader>
          <CardContent>
            {data.loading ? (
              <Skeleton className="h-12 w-full" />
            ) : data.endingSoon.length === 0 ? (
              <HealthEmpty
                icon={CalendarClock}
                title="Nothing ending soon"
                description="No programme finishes in the next fortnight."
                className="border-0 p-6"
              />
            ) : (
              <ul className="divide-y">
                {data.endingSoon.slice(0, 8).map((program) => (
                  <li key={program.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <Link
                        to={healthLink(HEALTH_PATHS.athleteWorkspace, program.person_id)}
                        className="truncate text-sm font-medium text-foreground hover:underline"
                      >
                        {program.person_name ?? 'Unnamed'}
                      </Link>
                      <p className="truncate text-xs text-muted-foreground">{program.name}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-xs text-muted-foreground">Ends {formatDate(program.end_date)}</p>
                      <AdherenceMeter value={program.adherencePct} className="mt-1 w-28" />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Not logged a session in 14 days</CardTitle>
            <CardDescription>On an active programme but nothing recorded.</CardDescription>
          </CardHeader>
          <CardContent>
            {data.loading ? (
              <Skeleton className="h-12 w-full" />
            ) : data.staleAthletes.length === 0 ? (
              <HealthEmpty
                icon={TrendingDown}
                title="Everyone is training"
                description="Every athlete on a programme has logged something in the last fortnight."
                className="border-0 p-6"
              />
            ) : (
              <ul className="divide-y">
                {data.staleAthletes.slice(0, 8).map((athlete) => (
                  <li key={athlete.personId} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <Link
                        to={healthLink(HEALTH_PATHS.athleteWorkspace, athlete.personId)}
                        className="truncate text-sm font-medium text-foreground hover:underline"
                      >
                        {athlete.name}
                      </Link>
                      <p className="truncate text-xs text-muted-foreground">
                        {athlete.activeProgram?.name ?? 'On a programme'}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className="shrink-0 border-warning/20 bg-warning/10 text-[10px] text-warning"
                    >
                      <AlarmClock className="mr-1 h-3 w-3" />
                      {athlete.lastSessionOn ? formatDate(athlete.lastSessionOn) : 'Never'}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default TrainerDashboardPage;
