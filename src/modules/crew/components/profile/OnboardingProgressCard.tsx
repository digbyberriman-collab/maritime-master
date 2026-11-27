import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, CircleAlert, CircleHelp, ClipboardCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { PageError } from '@/shared/components/states';
import { StatusPill } from '@/shared/components/status';
import { useCan } from '@/lib/permissions/useCan';
import { useScopedPath } from '@/app/router/scopes';
import { CREW_CAPS, CREW_PATHS } from '@/modules/crew/paths';
import type { CrewProfileSummary, ProfileVessel } from '@/modules/crew/hooks/useCrewProfile';
import { ONBOARDING_NOT_SET_UP_NOTICE, usePersonOnboarding } from '@/modules/crew/hooks/useOnboardingProgress';
import {
  checkFix,
  checkLine,
  familiarisationLine,
  fixHref,
  formatDay,
  onboardingCheckDef,
  scoreText,
  type OnboardingCheck,
  type OnboardingFamiliarisation,
  type OnboardingPerson,
} from '@/modules/crew/lib/onboarding';

/**
 * Onboarding (gap/04 C18; X1-10B) on the profile's Personal tab: the eight
 * checks of lib/onboarding.ts for this person on the route vessel, each
 * with what passes it and a link to where it is fixed, the percentage of
 * the checks that could be answered, and the person's familiarisations on
 * the vessel.
 *
 * Who sees it: crew list access on the vessel, or the person themselves
 * (view_own); the server gates the read again (crew_onboarding_progress)
 * and a refusal hides the card. Nothing is read for anyone else, nor for a
 * person who is not on the vessel's crew.
 *
 * D-01: while the RPC is missing the card says onboarding arrives with the
 * crew update; any other error is an inline error with Try again.
 */
export interface OnboardingProgressCardProps {
  vessel: ProfileVessel & { name: string };
  profile: CrewProfileSummary;
}

const linkClass =
  'inline-flex min-h-8 items-center gap-1 rounded-sm type-body-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:coarse)]:min-h-11';

export const OnboardingProgressCard: React.FC<OnboardingProgressCardProps> = ({ vessel, profile }) => {
  const crewList = useCan(CREW_CAPS.crewListView, { vesselId: vessel.id });
  const own = useCan(CREW_CAPS.profilesViewOwn, { vesselId: vessel.id });
  const canOpenFamiliarisation = useCan(CREW_CAPS.famView, { vesselId: vessel.id });
  const maySee = profile.onVessel && (crewList || (profile.isOwn && own));
  const state = usePersonOnboarding(maySee ? vessel : null, profile.profileId, maySee);

  if (!maySee || state.status === 'denied' || state.status === 'idle') return null;

  const percent = state.status === 'ready' && state.person ? state.person.score.percent : null;
  return (
    <Card data-profile-card="onboarding" data-onboarding-state={state.status === 'ready' ? (state.person ? 'ready' : 'none') : state.status}>
      <CardHeader className="flex-row items-center gap-2 space-y-0">
        <ClipboardCheck aria-hidden="true" className="size-4 text-muted-foreground" />
        <CardTitle className="type-subtitle">Onboarding</CardTitle>
        {percent !== null ? (
          <span className="ml-auto type-subtitle tabular-nums text-foreground" data-onboarding-percent={percent}>
            {percent}%
          </span>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        {state.status === 'loading' ? (
          <div className="space-y-3" aria-busy="true" aria-label="Loading the onboarding checks">
            <Skeleton className="h-2 w-full" />
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : state.status === 'not_set_up' ? (
          <p className="type-body text-muted-foreground" data-onboarding-notice="not-set-up">
            {ONBOARDING_NOT_SET_UP_NOTICE}
          </p>
        ) : state.status === 'error' ? (
          <PageError variant="inline" error={state.error} onRetry={state.retry} title="The onboarding checks could not load" treatMissingAsOff={false} />
        ) : state.person ? (
          <OnboardingBody person={state.person} profile={profile} canOpenFamiliarisation={canOpenFamiliarisation || profile.isOwn} />
        ) : (
          <p className="type-body text-muted-foreground" data-onboarding-notice="not-on-crew">
            Onboarding is checked for {vessel.name}&rsquo;s crew, and {profile.displayName} is not on it today.
          </p>
        )}
      </CardContent>
    </Card>
  );
};

const OnboardingBody: React.FC<{ person: OnboardingPerson; profile: CrewProfileSummary; canOpenFamiliarisation: boolean }> = ({
  person,
  profile,
  canOpenFamiliarisation,
}) => {
  const { score } = person;
  const unknownCount = score.unknown.length;
  return (
    <>
      <div className="space-y-2">
        <Progress
          value={score.percent ?? 0}
          className="h-2"
          aria-label={score.percent === null ? 'Onboarding not checked yet' : `Onboarding ${score.percent} percent complete`}
        />
        <p className="type-caption text-muted-foreground">
          {score.complete ? 'Every check is done' : scoreText(score)}
          {unknownCount > 0 ? ` · ${unknownCount} not checked yet` : ''}
        </p>
      </div>
      <ul className="grid gap-x-6 md:grid-cols-2" aria-label="Onboarding checks">
        {person.checks.map((check) => (
          <CheckRow key={check.key} check={check} profile={profile} />
        ))}
      </ul>
      <FamiliarisationList person={person} canOpen={canOpenFamiliarisation} />
    </>
  );
};

const STATE_ICON = {
  pass: { Icon: CheckCircle2, className: 'text-success', word: 'Done' },
  fail: { Icon: CircleAlert, className: 'text-warning', word: 'To do' },
  unknown: { Icon: CircleHelp, className: 'text-muted-foreground', word: 'Not checked' },
} as const;

const CheckRow: React.FC<{ check: OnboardingCheck; profile: CrewProfileSummary }> = ({ check, profile }) => {
  const scopedPath = useScopedPath();
  const { Icon, className, word } = STATE_ICON[check.state];
  const fix = check.state === 'fail' ? checkFix(check.key, { profileId: profile.profileId, isOwn: profile.isOwn }) : null;
  return (
    <li className="flex min-w-0 items-start gap-3 border-b border-border py-2.5" data-onboarding-check={check.key} data-check-state={check.state}>
      <Icon aria-hidden="true" className={cn('mt-0.5 size-4 shrink-0', className)} />
      <div className="min-w-0 flex-1">
        <p className="type-body font-medium text-foreground">
          {check.label}
          <span className="sr-only">: {word}</span>
        </p>
        <p className="type-caption text-muted-foreground">{checkLine(check)}</p>
        {fix?.note ? <p className="type-caption text-muted-foreground">{fix.note}</p> : null}
        {fix?.target ? (
          <Link to={fixHref(fix.target, scopedPath)} className={linkClass} data-onboarding-fix={check.key}>
            {onboardingCheckDef(check.key).fixLabel}
            <ArrowRight aria-hidden="true" className="size-3.5" />
          </Link>
        ) : null}
      </div>
    </li>
  );
};

const famStatus = (f: OnboardingFamiliarisation): string => (f.overdue && f.status !== 'completed' ? 'overdue' : f.status);

const FamiliarisationList: React.FC<{ person: OnboardingPerson; canOpen: boolean }> = ({ person, canOpen }) => {
  const scopedPath = useScopedPath();
  const line = familiarisationLine(person.famRequired, person.famCompleted);
  if (!line && person.familiarisation.length === 0) return null;
  return (
    <section aria-labelledby={`onboarding-fam-${person.profileId}`} className="space-y-2 pt-1" data-onboarding-familiarisation="">
      <h4 id={`onboarding-fam-${person.profileId}`} className="type-eyebrow text-muted-foreground">
        Familiarisation
      </h4>
      {line ? <p className="type-body-sm text-foreground">{line}</p> : null}
      {person.familiarisation.length > 0 ? (
        <ul className="space-y-1.5">
          {person.familiarisation.map((f) => (
            <li key={f.recordId} className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <span className="min-w-0 flex-1 basis-40">
                {canOpen ? (
                  <Link to={scopedPath(`${CREW_PATHS.familiarisation}/${encodeURIComponent(f.recordId)}`)} className={cn(linkClass, 'text-foreground')}>
                    {f.templateName}
                  </Link>
                ) : (
                  <span className="type-body-sm text-foreground">{f.templateName}</span>
                )}
                {f.dueDate && f.status !== 'completed' ? <span className="block type-caption text-muted-foreground">Due {formatDay(f.dueDate)}</span> : null}
              </span>
              <StatusPill domain="familiarization" status={famStatus(f)} />
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
};

export default OnboardingProgressCard;
