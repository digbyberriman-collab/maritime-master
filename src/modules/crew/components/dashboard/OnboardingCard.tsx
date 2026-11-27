import React from 'react';
import { Link } from 'react-router-dom';
import { ClipboardCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';
import { PageError } from '@/shared/components/states';
import { StatusPill } from '@/shared/components/status';
import { useScopedPath } from '@/app/router/scopes';
import { CREW_PATHS } from '@/modules/crew/paths';
import { ONBOARDING_NOT_SET_UP_NOTICE, type OnboardingListState } from '@/modules/crew/hooks/useOnboardingProgress';
import { DASHBOARD_ANCHORS, DASHBOARD_JOINER_DAYS } from '@/modules/crew/lib/dashboardModel';
import {
  familiarisationLine,
  joinText,
  outstandingText,
  profileTabPath,
  scoreText,
  type OnboardingFamiliarisation,
  type OnboardingPerson,
} from '@/modules/crew/lib/onboarding';
import { CardLink, CardNote, CardRowsLoading, DashboardCard, PersonName } from './DashboardCard';

/**
 * Onboarding (gap/04 C2, C18): the vessel's recent joiners (the last 90
 * days, and those still to join) whose onboarding is open, latest first:
 * how far the eight checks are, what is still to do, and the
 * familiarisation for each (the records on this vessel with their status;
 * overdue in red). The rest are counted as fully onboarded. Each name opens
 * the person's Personal tab, where the Onboarding card links every fix.
 */
export interface OnboardingCardProps {
  state: OnboardingListState;
  vesselName: string;
  today: string;
  canOpenProfiles: boolean;
  canOpenFamiliarisation: boolean;
}

const famStatus = (f: OnboardingFamiliarisation): string => (f.overdue && f.status !== 'completed' ? 'overdue' : f.status);

export const OnboardingCard: React.FC<OnboardingCardProps> = ({ state, vesselName, today, canOpenProfiles, canOpenFamiliarisation }) => {
  const scopedPath = useScopedPath();
  if (state.status === 'idle' || state.status === 'denied') return null;
  const open = state.status === 'ready' ? state.people.filter((p) => p.isOpen) : [];
  const done = state.status === 'ready' ? state.people.length - open.length : 0;
  return (
    <DashboardCard
      anchor={DASHBOARD_ANCHORS.onboarding}
      title="Onboarding"
      subtitle={`Joiners of the last ${DASHBOARD_JOINER_DAYS} days, and those still to join`}
      icon={ClipboardCheck}
      data-dashboard-card="onboarding"
      aside={state.status === 'ready' && open.length > 0 ? <span className="type-caption tabular-nums text-muted-foreground">{open.length} open</span> : null}
      footer={
        state.status === 'ready' && (done > 0 || canOpenFamiliarisation) ? (
          <>
            {done > 0 && open.length > 0 ? (
              <p className="type-caption text-muted-foreground">
                {done === 1 ? '1 more recent joiner is fully onboarded.' : `${done} more recent joiners are fully onboarded.`}
              </p>
            ) : null}
            {canOpenFamiliarisation ? (
              <CardLink to={scopedPath(CREW_PATHS.familiarisation)} data-card-link="familiarisation">
                Familiarisation
              </CardLink>
            ) : null}
          </>
        ) : null
      }
    >
      {state.status === 'loading' ? (
        <CardRowsLoading rows={4} label="Loading the joiners" />
      ) : state.status === 'not_set_up' ? (
        <CardNote data-card-note="not-set-up">{ONBOARDING_NOT_SET_UP_NOTICE}</CardNote>
      ) : state.status === 'error' ? (
        <PageError variant="inline" error={state.error} onRetry={state.retry} title="The joiners could not load" treatMissingAsOff={false} />
      ) : state.people.length === 0 ? (
        <CardNote data-card-note="empty">
          No one joined {vesselName} in the last {DASHBOARD_JOINER_DAYS} days, and no one is due to join.
        </CardNote>
      ) : open.length === 0 ? (
        <CardNote data-card-note="all-done">
          Every recent joiner is onboarded: all checks done and every required familiarisation completed.
        </CardNote>
      ) : (
        <ul className="divide-y divide-border" aria-label="Joiners with onboarding open">
          {open.map((p) => (
            <JoinerRow
              key={p.profileId}
              person={p}
              today={today}
              profileHref={canOpenProfiles ? scopedPath(profileTabPath(p.profileId, 'personal')) : null}
              recordHref={canOpenFamiliarisation ? (id) => scopedPath(`${CREW_PATHS.familiarisation}/${encodeURIComponent(id)}`) : null}
            />
          ))}
        </ul>
      )}
    </DashboardCard>
  );
};

const JoinerRow: React.FC<{
  person: OnboardingPerson;
  today: string;
  profileHref: string | null;
  recordHref: ((recordId: string) => string) | null;
}> = ({ person, today, profileHref, recordHref }) => {
  const { score } = person;
  const todo = outstandingText(score.outstanding);
  const famLine = familiarisationLine(person.famRequired, person.famCompleted);
  return (
    <li className="space-y-2 py-3" data-onboarding-person={person.profileId}>
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1 basis-48">
          <PersonName name={person.displayName} href={profileHref} />
          <p className="type-caption text-muted-foreground">
            {[person.positionName, joinText(person, today)].filter(Boolean).join(' · ')}
          </p>
        </div>
        <div className="flex w-full items-center gap-2 sm:w-48" title={scoreText(score)}>
          <Progress
            value={score.percent ?? 0}
            className="h-1.5 flex-1"
            aria-label={score.percent === null ? `${person.displayName}: not checked yet` : `${person.displayName}: ${score.percent} percent onboarded, ${scoreText(score)}`}
          />
          <span className="w-10 text-right type-caption tabular-nums text-foreground">{score.percent === null ? '—' : `${score.percent}%`}</span>
        </div>
      </div>
      {todo ? (
        <p className="type-caption text-muted-foreground">
          <span className="font-medium text-foreground">To do:</span> {todo}
        </p>
      ) : null}
      {famLine || person.familiarisation.length > 0 ? (
        <div className="space-y-1.5">
          {famLine ? <p className="type-caption text-muted-foreground">{famLine}</p> : null}
          {person.familiarisation.length > 0 ? (
            <ul className="flex flex-wrap gap-x-3 gap-y-1.5" aria-label={`${person.displayName}: familiarisation`}>
              {person.familiarisation.map((f) => (
                <li key={f.recordId} className="inline-flex min-w-0 max-w-full items-center gap-1.5">
                  {recordHref ? (
                    <Link
                      to={recordHref(f.recordId)}
                      className={cn(
                        'min-w-0 truncate rounded-sm type-caption text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        '[@media(pointer:coarse)]:inline-flex [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:items-center',
                      )}
                    >
                      {f.templateName}
                    </Link>
                  ) : (
                    <span className="min-w-0 truncate type-caption text-foreground">{f.templateName}</span>
                  )}
                  <StatusPill domain="familiarization" status={famStatus(f)} />
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </li>
  );
};
