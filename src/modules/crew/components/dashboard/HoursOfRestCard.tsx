import React from 'react';
import { Clock } from 'lucide-react';
import { PageError } from '@/shared/components/states';
import { StatusPill } from '@/shared/components/status';
import { useScopedPath } from '@/app/router/scopes';
import {
  DASHBOARD_ANCHORS,
  DASHBOARD_PEOPLE_LIMIT,
  horBoardHref,
  horReportHref,
  isCapped,
  monthName,
  plural,
  type CardState,
  type HoursOfRestSection,
} from '@/modules/crew/lib/dashboardModel';
import { profileTabPath } from '@/modules/crew/lib/onboarding';
import { CardLink, CardNote, CardRowsLoading, DashboardCard, PersonName } from './DashboardCard';

/**
 * Hours of rest (gap/04 C2): the vessel's open breaches (not yet reviewed)
 * and who has not submitted last month, by crew member, most breaches
 * first, at most 20. Each name opens the person's Hours of rest tab on that
 * month (with crew profile access); the board (approvers) and the year's
 * report are linked below.
 */
export interface HoursOfRestCardProps {
  state: CardState<HoursOfRestSection>;
  canOpenProfiles: boolean;
  canApprove: boolean;
  onRetry: () => void;
}

export const HoursOfRestCard: React.FC<HoursOfRestCardProps> = ({ state, canOpenProfiles, canApprove, onRetry }) => {
  const scopedPath = useScopedPath();
  if (state.kind === 'hidden') return null;
  const data = state.kind === 'ready' ? state.data : null;
  const month = data ? monthName(data.month) : null;
  return (
    <DashboardCard
      anchor={DASHBOARD_ANCHORS.hoursOfRest}
      title="Hours of rest"
      subtitle={month ? `Open breaches, and who has not submitted ${month}` : 'Open breaches, and who has not submitted last month'}
      icon={Clock}
      data-dashboard-card="hours-of-rest"
      footer={
        data ? (
          <>
            {canApprove ? (
              <CardLink to={scopedPath(horBoardHref({ month: data.month }))} data-card-link="hor-board">
                Open the board
              </CardLink>
            ) : null}
            <CardLink to={scopedPath(horReportHref(data.month))} data-card-link="hor-report">
              Report
            </CardLink>
          </>
        ) : null
      }
    >
      {state.kind === 'loading' ? (
        <CardRowsLoading label="Loading the hours of rest" />
      ) : state.kind === 'not_set_up' ? (
        <CardNote data-card-note="not-set-up">Turns on once the crew update is applied.</CardNote>
      ) : state.kind === 'off' ? (
        <CardNote data-card-note="off">Hours of rest is off on this vessel.</CardNote>
      ) : state.kind === 'error' || state.kind === 'invalid' ? (
        <PageError variant="inline" title="The hours of rest could not load" onRetry={onRetry} treatMissingAsOff={false} error={state.kind === 'invalid' ? 'This list could not be read.' : undefined} />
      ) : state.data.people.length === 0 ? (
        <CardNote data-card-note="empty">No open breaches, and everyone has submitted {month}.</CardNote>
      ) : (
        <>
          <ul className="divide-y divide-border" aria-label="Crew with hours of rest to deal with">
            {state.data.people.map((p) => (
              <li key={p.profileId} className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2.5" data-hor-person={p.profileId}>
                <div className="min-w-0 flex-1 basis-32">
                  <PersonName
                    name={p.displayName}
                    href={canOpenProfiles ? `${scopedPath(profileTabPath(p.profileId, 'hours-of-rest'))}?month=${state.data.month}` : null}
                  />
                </div>
                <div className="flex shrink-0 flex-wrap gap-1.5">
                  {p.openBreaches > 0 ? <StatusPill tone="danger">{plural(p.openBreaches, 'open breach', 'open breaches')}</StatusPill> : null}
                  {p.unsubmitted ? <StatusPill tone="warn">Not submitted</StatusPill> : null}
                </div>
              </li>
            ))}
          </ul>
          {isCapped(state.data.people) ? <p className="type-caption text-muted-foreground">The {DASHBOARD_PEOPLE_LIMIT} crew members with most to deal with are shown.</p> : null}
        </>
      )}
    </DashboardCard>
  );
};
