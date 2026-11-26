import React from 'react';
import { Briefcase } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PageError } from '@/shared/components/states';
import {
  formatDay,
  leaveAllowanceText,
  useCrewEmployment,
  type CrewProfileSummary,
  type ProfileVessel,
} from '@/modules/crew/hooks/useCrewProfile';

// ---------------------------------------------------------------- the fact list the profile cards share

/** A definition list of facts in one or two columns (the profile cards' read view). */
export const FactGrid: React.FC<{ children: React.ReactNode; columns?: 1 | 2; className?: string }> = ({ children, columns = 2, className }) => (
  <dl className={cn('grid gap-x-6 gap-y-3', columns === 2 && 'sm:grid-cols-2', className)}>{children}</dl>
);

/** One fact: its label and value; a missing value reads "Not recorded". */
export const Fact: React.FC<{ label: string; children?: React.ReactNode; wide?: boolean; testId?: string }> = ({ label, children, wide, testId }) => {
  const empty = children === null || children === undefined || children === '' || children === false;
  return (
    <div className={cn('min-w-0', wide && 'sm:col-span-2')} data-fact={testId}>
      <dt className="type-caption text-muted-foreground">{label}</dt>
      <dd className={cn('mt-0.5 break-words type-body', empty ? 'text-muted-foreground' : 'text-foreground')}>{empty ? 'Not recorded' : children}</dd>
    </div>
  );
};

// ---------------------------------------------------------------- the card

interface CurrentEmploymentCardProps {
  vessel: ProfileVessel & { name: string };
  profile: CrewProfileSummary;
  /** Names a vessel of the company. */
  nameOfVessel: (id: string) => string | null;
}

/**
 * Current employment (gap/04 C21): where the person serves now (the current
 * assignment, or a pending placement for someone without a login), with the
 * employment terms crew_assignments cannot hold (contract type, review date,
 * leave allowance, embarkation). D-01: without the terms table the card says
 * so and shows the assignment alone.
 */
export const CurrentEmploymentCard: React.FC<CurrentEmploymentCardProps> = ({ vessel, profile, nameOfVessel }) => {
  const state = useCrewEmployment(vessel, profile);
  return (
    <Card data-profile-card="employment">
      <CardHeader className="flex-row items-center gap-2 space-y-0">
        <Briefcase aria-hidden="true" className="size-4 text-muted-foreground" />
        <CardTitle className="type-subtitle">Current employment</CardTitle>
      </CardHeader>
      <CardContent>
        {state.status === 'idle' || state.status === 'loading' ? (
          <div className="space-y-3" aria-busy="true" aria-label="Loading employment">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-56" />
            <Skeleton className="h-4 w-32" />
          </div>
        ) : state.status === 'error' ? (
          <PageError variant="inline" error={state.error} onRetry={state.retry} title="Employment could not load" treatMissingAsOff={false} />
        ) : (
          <EmploymentFacts employment={state.employment} profile={profile} nameOfVessel={nameOfVessel} />
        )}
      </CardContent>
    </Card>
  );
};

const EmploymentFacts: React.FC<{
  employment: Extract<ReturnType<typeof useCrewEmployment>, { status: 'ready' }>['employment'];
  profile: CrewProfileSummary;
  nameOfVessel: (id: string) => string | null;
}> = ({ employment, profile, nameOfVessel }) => {
  const { assignment, placement, terms, termsMissing, contractTypeLabels } = employment;
  if (!assignment && !placement) {
    return <p className="type-body text-muted-foreground">Not on a vessel&rsquo;s crew at the moment.</p>;
  }
  const vesselId = assignment?.vesselId ?? placement?.vesselId ?? null;
  const position = profile.positionName ?? assignment?.position ?? placement?.position ?? null;
  const joined = assignment ? formatDay(assignment.joinDate ?? assignment.startDate) : formatDay(placement?.joinDate);
  return (
    <div className="space-y-3">
      <FactGrid columns={1}>
        <Fact label="Vessel">{vesselId ? nameOfVessel(vesselId) ?? 'Another vessel' : null}</Fact>
        <Fact label="Position">{position}</Fact>
        <Fact label={placement ? 'Expected to join' : 'Joined'}>{joined}</Fact>
        {assignment?.leaveDate ? <Fact label="Leaves">{formatDay(assignment.leaveDate)}</Fact> : null}
        {terms ? (
          <>
            <Fact label="Contract type">{terms.contract_type_key ? contractTypeLabels.get(terms.contract_type_key) ?? terms.contract_type_key : null}</Fact>
            <Fact label="Start date">{formatDay(terms.start_date)}</Fact>
            {terms.date_joining_vessel ? <Fact label="Joins the vessel">{formatDay(terms.date_joining_vessel)}</Fact> : null}
            <Fact label="Review date">{formatDay(terms.review_date)}</Fact>
            <Fact label="Leave allowance">{leaveAllowanceText(terms)}</Fact>
            <Fact label="Place of embarkation">{terms.place_of_embarkation}</Fact>
          </>
        ) : null}
      </FactGrid>
      {placement ? (
        <p className="type-caption text-muted-foreground">Added without a sign-in: the assignment starts once their login is linked.</p>
      ) : null}
      {termsMissing ? (
        <p className="type-caption text-muted-foreground" data-employment-terms="not-set-up">
          Contract type, review date and leave allowance appear once the crew update is applied.
        </p>
      ) : !terms ? (
        <p className="type-caption text-muted-foreground">No employment terms recorded for this vessel yet.</p>
      ) : null}
    </div>
  );
};

export default CurrentEmploymentCard;
