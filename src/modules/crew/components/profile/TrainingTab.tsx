import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Award, BookOpen, GraduationCap, Info } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { isMissingTable } from '@/integrations/supabase/missingRelation';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ExpiryPill, StatusPill } from '@/shared/components/status';
import { EmptyState, PageError } from '@/shared/components/states';
import { useCan } from '@/lib/permissions/useCan';
import { useMembershipReach } from '@/app/router/useMembershipReach';
import { todayDateOnly } from '@/shared/lib/form';
import { crewKeys } from '@/modules/crew/hooks/crewKeys';
import { formatDay } from '@/modules/crew/hooks/useCrewProfile';
import type { ProfileTabProps } from '@/modules/crew/lib/profileTabs';

/** Fleet › Training (the course catalogue and applications), for people with fleet reach. */
export const FLEET_TRAINING_PATH = '/fleet/training';

/** Who reads training applications (X5-07A narrows the table to them; X1 spec, X5 agreement 9). */
export const APPLICATIONS_RESTRICTED =
  'Training applications are shown to the crew member, the people reviewing them and the training managers of this vessel. None are shown to you.';
export const NO_LOGIN_TRAINING =
  'Training records and applications are kept against a STORM sign-in. They appear here once this person has joined STORM.';

/** A completed course or certificate (training_records, column-limited). */
export interface TrainingRecordItem {
  id: string;
  courseName: string;
  courseCode: string | null;
  provider: string;
  completedOn: string;
  expiresOn: string | null;
}

/** A training application (development_applications, column-limited: no costs, no reviewer comments). */
export interface TrainingApplicationItem {
  id: string;
  number: string;
  courseName: string;
  provider: string | null;
  status: string;
  startsOn: string | null;
  endsOn: string | null;
  submittedAt: string | null;
}

type Section<T> =
  | { status: 'loading' }
  | { status: 'not-enabled' }
  | { status: 'error'; error: unknown; retry: () => void }
  | { status: 'ready'; items: T[] };

const sectionOf = <T,>(query: { data?: T[] | null; error: unknown; refetch: () => unknown }): Section<T> => {
  if (query.error) {
    if (isMissingTable(query.error)) return { status: 'not-enabled' };
    return { status: 'error', error: query.error, retry: () => void query.refetch() };
  }
  if (!query.data) return { status: 'loading' };
  return { status: 'ready', items: query.data };
};

async function fetchTrainingRecords(userId: string): Promise<TrainingRecordItem[]> {
  const { data, error } = await supabase
    .from('training_records')
    .select('id, completion_date, expiry_date, training_provider, training_courses:course_id(course_name, course_code)')
    .eq('user_id', userId)
    .order('completion_date', { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []).map((r) => {
    const course = Array.isArray(r.training_courses) ? r.training_courses[0] : r.training_courses;
    return {
      id: r.id,
      courseName: course?.course_name ?? 'Course name not recorded',
      courseCode: course?.course_code ?? null,
      provider: r.training_provider,
      completedOn: r.completion_date,
      expiresOn: r.expiry_date,
    };
  });
}

async function fetchTrainingApplications(userId: string): Promise<TrainingApplicationItem[]> {
  const { data, error } = await supabase
    .from('development_applications')
    .select('id, application_number, course_name, course_provider, status, course_start_date, course_end_date, submitted_at')
    .eq('crew_member_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []).map((a) => ({
    id: a.id,
    number: a.application_number,
    courseName: a.course_name,
    provider: a.course_provider,
    status: a.status,
    startsOn: a.course_start_date,
    endsOn: a.course_end_date,
    submittedAt: a.submitted_at,
  }));
}

const SectionLoading: React.FC<{ label: string }> = ({ label }) => (
  <div className="space-y-2" aria-busy="true" aria-label={label}>
    <Skeleton className="h-10 w-full" />
    <Skeleton className="h-10 w-full" />
  </div>
);

const dateRange = (from: string | null, to: string | null): string | null => {
  const a = formatDay(from);
  const b = formatDay(to);
  if (a && b) return a === b ? a : `${a} to ${b}`;
  return a ?? b;
};

/**
 * The profile's Training tab (gap/04 C62 read-only part; X1-03B): the
 * person's completed courses and certificates (training_records) and their
 * training applications (development_applications), column-limited, with
 * "See courses" to Fleet › Training for people with fleet reach.
 *
 * Both tables key on the person's login, so someone without one has none
 * yet, and the tab says so. Applications are readable only by the person,
 * their reviewers and the vessel's training managers (X5-07A): when the
 * viewer is none of those as far as the client can tell and nothing comes
 * back, the tab says applications are not shown to them, never "no training".
 * The tab gate is the profile's (crew profiles view, or the own profile).
 */
const TrainingTab: React.FC<ProfileTabProps> = ({ profile, vessel }) => {
  const ctx = { vesselId: vessel.id };
  const reach = useMembershipReach();
  const canVesselTraining = useCan('vessel.crew.crew_training.view', ctx);
  const canFleetTraining = useCan('fleet.operations.fleet_training.view', ctx);
  const userId = profile.userId;
  const keyBase = [...crewKeys.vessel(vessel.companyId, vessel.id), 'profile', profile.profileId, 'training'] as const;

  const records = useQuery({
    queryKey: [...keyBase, 'records', userId],
    queryFn: () => fetchTrainingRecords(userId as string),
    enabled: Boolean(userId),
    retry: (n, e) => !isMissingTable(e) && n < 1,
    staleTime: 60_000,
  });
  const applications = useQuery({
    queryKey: [...keyBase, 'applications', userId],
    queryFn: () => fetchTrainingApplications(userId as string),
    enabled: Boolean(userId),
    retry: (n, e) => !isMissingTable(e) && n < 1,
    staleTime: 60_000,
  });

  const seeCourses = reach.fleetReach ? (
    <Button asChild variant="outline" className="[@media(pointer:coarse)]:h-11">
      <Link to={FLEET_TRAINING_PATH}>
        <BookOpen aria-hidden="true" />
        See courses
      </Link>
    </Button>
  ) : null;

  const header = (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-[min(18rem,100%)] flex-1">
        <h2 className="type-title text-foreground">Training</h2>
        <p className="type-body text-muted-foreground">Courses completed and training applied for. Read-only here.</p>
      </div>
      {seeCourses}
    </div>
  );

  if (!userId) {
    return (
      <div className="min-w-0 space-y-4" data-training-state="no-login">
        {header}
        <EmptyState kind="first-use" icon={GraduationCap} title="No training records yet" body={NO_LOGIN_TRAINING} bordered />
      </div>
    );
  }

  const recordsSection = sectionOf<TrainingRecordItem>(records);
  const applicationsSection = sectionOf<TrainingApplicationItem>(applications);
  const entitled = profile.isOwn || canVesselTraining || canFleetTraining;

  return (
    <div className="min-w-0 space-y-4" data-training-state="ready">
      {header}
      <div className="grid min-w-0 gap-4 xl:grid-cols-2">
        <Card className="min-w-0" data-training-card="records">
          <CardHeader className="flex-row items-center gap-2 space-y-0 pb-3">
            <Award aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
            <CardTitle className="type-subtitle">Courses and certificates</CardTitle>
          </CardHeader>
          <CardContent className="min-w-0">
            <RecordsBody section={recordsSection} />
          </CardContent>
        </Card>
        <Card className="min-w-0" data-training-card="applications">
          <CardHeader className="flex-row items-center gap-2 space-y-0 pb-3">
            <GraduationCap aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
            <CardTitle className="type-subtitle">Training applications</CardTitle>
          </CardHeader>
          <CardContent className="min-w-0">
            <ApplicationsBody section={applicationsSection} entitled={entitled} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

const RecordsBody: React.FC<{ section: Section<TrainingRecordItem> }> = ({ section }) => {
  const today = React.useMemo(() => todayDateOnly(), []);
  if (section.status === 'loading') return <SectionLoading label="Loading courses" />;
  if (section.status === 'not-enabled') return <p className="type-body text-muted-foreground">Training records are not set up for this account yet.</p>;
  if (section.status === 'error') {
    return <PageError variant="inline" error={section.error} onRetry={section.retry} title="The courses could not load" treatMissingAsOff={false} />;
  }
  if (section.items.length === 0) return <p className="type-body text-muted-foreground">No completed courses recorded.</p>;
  return (
    <ul className="divide-y divide-border">
      {section.items.map((r) => (
        <li key={r.id} className="flex min-w-0 flex-wrap items-start justify-between gap-x-4 gap-y-1.5 py-2.5" data-training-record="">
          <div className="min-w-0 flex-1">
            <p className="break-words type-body font-medium text-foreground">
              {r.courseName}
              {r.courseCode ? <span className="ml-2 type-mono text-muted-foreground">{r.courseCode}</span> : null}
            </p>
            <p className="type-caption text-muted-foreground">
              {r.provider} · completed {formatDay(r.completedOn) ?? 'on an unknown date'}
            </p>
          </div>
          <ExpiryPill expiresOn={r.expiresOn} today={today} />
        </li>
      ))}
    </ul>
  );
};

const ApplicationsBody: React.FC<{ section: Section<TrainingApplicationItem>; entitled: boolean }> = ({ section, entitled }) => {
  if (section.status === 'loading') return <SectionLoading label="Loading applications" />;
  if (section.status === 'not-enabled') return <p className="type-body text-muted-foreground">Training applications are not set up for this account yet.</p>;
  if (section.status === 'error') {
    return <PageError variant="inline" error={section.error} onRetry={section.retry} title="The applications could not load" treatMissingAsOff={false} />;
  }
  if (section.items.length === 0) {
    return entitled ? (
      <p className="type-body text-muted-foreground">No training applications yet.</p>
    ) : (
      <Alert variant="info" data-training-applications="restricted">
        <Info aria-hidden="true" className="size-4" />
        <AlertDescription>{APPLICATIONS_RESTRICTED}</AlertDescription>
      </Alert>
    );
  }
  return (
    <ul className="divide-y divide-border">
      {section.items.map((a) => {
        const range = dateRange(a.startsOn, a.endsOn);
        return (
          <li key={a.id} className="flex min-w-0 flex-wrap items-start justify-between gap-x-4 gap-y-1.5 py-2.5" data-training-application="">
            <div className="min-w-0 flex-1">
              <p className="break-words type-body font-medium text-foreground">{a.courseName}</p>
              <p className="type-caption text-muted-foreground">
                <span className="type-mono">{a.number}</span>
                {a.provider ? ` · ${a.provider}` : ''}
                {range ? ` · ${range}` : ''}
                {a.submittedAt ? ` · applied ${format(new Date(a.submittedAt), 'd MMM yyyy')}` : ''}
              </p>
            </div>
            <StatusPill domain="training_application" status={a.status} />
          </li>
        );
      })}
    </ul>
  );
};

export default TrainingTab;
