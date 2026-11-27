import React, { Suspense, lazy, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRightLeft, CalendarRange, ChevronLeft, ChevronRight, Pencil } from 'lucide-react';
import PageHeader from '@/shared/components/layout/PageHeader';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { StatusPill } from '@/shared/components/status';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { PendingLoginChip } from '@/modules/crew/components/crew-list/CrewStatusPill';
import { profileStatusDetail, type CrewProfileSummary } from '@/modules/crew/hooks/useCrewProfile';
import { CREW_CAPS, CREW_PATHS } from '@/modules/crew/paths';
import { useCan } from '@/lib/permissions/useCan';
import { useScope } from '@/app/router/scopeContext';

// The transfer wizard (X1-11) loads only when it opens.
const TransferEntry = lazy(() => import('@/modules/crew/components/transfer/TransferEntry'));

/** The URL parameter that opens one transfer on the profile (crew_transfer_submitted links here). */
export const TRANSFER_PARAM = 'transfer';
/** D-225: a pending placement is changed on the profile, never transferred. */
export const PENDING_TRANSFER_SENTENCE = 'Change the pending vessel on the profile.';

const initials = (summary: CrewProfileSummary): string =>
  [summary.preferredName || summary.firstName, summary.lastName]
    .map((part) => (part ?? '').trim().charAt(0).toUpperCase())
    .join('') || '?';

const coarse = '[@media(pointer:coarse)]:size-11';

interface ProfileHeaderProps {
  summary: CrewProfileSummary;
  vesselName: string;
  /** Names another vessel of the company (transfers). */
  nameOfVessel: (id: string) => string | null;
  /** Scope-relative link builder (useScopedPath). */
  scopedPath: (rel: string) => string;
  /** The URL of the same tab for another person (the switcher). */
  pathFor: (profileId: string) => string;
  /** The Personal tab in edit mode, when the viewer may change something; null hides Edit profile. */
  editPath: string | null;
  /** Why Edit profile is unavailable (D-01), shown instead of the link. */
  editUnavailableReason?: string | null;
  today: string;
}

/**
 * The profile header (gap/04 C16): the person's name (the page's h1), crew
 * number, position, department, their status on this vessel with its
 * reason, the switcher through the vessel's crew in rank order, the
 * Rotation schedule link, Transfer (X1-11: the reviewed transfer wizard for
 * a holder of crew_assignments.assign; a pending placement says why not,
 * D-225; `?transfer=<id>` opens one transfer, the link of
 * crew_transfer_submitted) and Edit profile.
 */
export const ProfileHeader: React.FC<ProfileHeaderProps> = ({
  summary,
  vesselName,
  nameOfVessel,
  scopedPath,
  pathFor,
  editPath,
  editUnavailableReason,
  today,
}) => {
  const scope = useScope();
  const routeVessel = scope.scope === 'vessel' ? scope.vessel ?? null : null;
  const canAssign = useCan(CREW_CAPS.assignmentsAssign, { vesselId: routeVessel?.id ?? null });
  const [params, setParams] = useSearchParams();
  const linkedTransfer = params.get(TRANSFER_PARAM);
  const [transferOpen, setTransferOpen] = useState(false);
  const closeTransfer = () => {
    setTransferOpen(false);
    if (linkedTransfer) {
      const next = new URLSearchParams(params);
      next.delete(TRANSFER_PARAM);
      setParams(next, { replace: true });
    }
  };
  const position = summary.positionName ?? summary.positionText;
  const detail = profileStatusDetail(summary, nameOfVessel, today);
  const hasSwitcher = summary.memberCount !== null && summary.memberCount > 1;

  const switcher = hasSwitcher ? (
    <div role="group" aria-label="Move through the crew" className="flex items-center gap-1" data-profile-switcher="">
      {summary.prev ? (
        <Button asChild variant="outline" size="icon" className={coarse}>
          <Link to={pathFor(summary.prev.profileId)} aria-label={`Previous: ${summary.prev.name}`} title={`Previous: ${summary.prev.name}`}>
            <ChevronLeft aria-hidden="true" />
          </Link>
        </Button>
      ) : (
        <Button variant="outline" size="icon" className={coarse} disabled aria-label="No previous crew member">
          <ChevronLeft aria-hidden="true" />
        </Button>
      )}
      <span className="min-w-[4.5rem] px-1 text-center type-caption tabular-nums text-muted-foreground" aria-live="polite">
        {summary.memberIndex} of {summary.memberCount}
      </span>
      {summary.next ? (
        <Button asChild variant="outline" size="icon" className={coarse}>
          <Link to={pathFor(summary.next.profileId)} aria-label={`Next: ${summary.next.name}`} title={`Next: ${summary.next.name}`}>
            <ChevronRight aria-hidden="true" />
          </Link>
        </Button>
      ) : (
        <Button variant="outline" size="icon" className={coarse} disabled aria-label="No next crew member">
          <ChevronRight aria-hidden="true" />
        </Button>
      )}
    </div>
  ) : null;

  // Transfer (gap/04 C58): a holder of crew_assignments.assign on this vessel, for someone else on its crew.
  const showTransfer = Boolean(routeVessel) && canAssign && summary.onVessel && !summary.isOwn && summary.source === 'server';
  const pendingPlacement = summary.placementKind === 'pending_placement';
  const transfer = showTransfer ? (
    pendingPlacement ? (
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" aria-disabled="true" onClick={(event) => event.preventDefault()} aria-describedby="profile-transfer-unavailable">
              <ArrowRightLeft aria-hidden="true" />
              Transfer
            </Button>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">{PENDING_TRANSFER_SENTENCE}</TooltipContent>
        </Tooltip>
        <span id="profile-transfer-unavailable" className="sr-only">
          {PENDING_TRANSFER_SENTENCE}
        </span>
      </TooltipProvider>
    ) : (
      <Button variant="outline" onClick={() => setTransferOpen(true)}>
        <ArrowRightLeft aria-hidden="true" />
        Transfer
      </Button>
    )
  ) : null;

  const edit = editPath ? (
    <Button asChild variant="signal">
      <Link to={editPath}>
        <Pencil aria-hidden="true" />
        Edit profile
      </Link>
    </Button>
  ) : editUnavailableReason ? (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="outline" aria-disabled="true" onClick={(event) => event.preventDefault()} aria-describedby="profile-edit-unavailable">
            <Pencil aria-hidden="true" />
            Edit profile
          </Button>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">{editUnavailableReason}</TooltipContent>
      </Tooltip>
      <span id="profile-edit-unavailable" className="sr-only">
        {editUnavailableReason}
      </span>
    </TooltipProvider>
  ) : null;

  return (
    <PageHeader
      eyebrow={vesselName}
      title={
        <span className="flex min-w-0 items-center gap-3">
          <Avatar className="size-12 shrink-0 border border-border" aria-hidden="true">
            {summary.avatarUrl ? <AvatarImage src={summary.avatarUrl} alt="" /> : null}
            <AvatarFallback className="bg-muted type-subtitle text-muted-foreground">{initials(summary)}</AvatarFallback>
          </Avatar>
          <span className="min-w-0 break-words">{summary.displayName}</span>
        </span>
      }
      reference={summary.crewNumber ?? undefined}
      actions={
        <>
          {switcher}
          <Button asChild variant="outline">
            <Link to={`${scopedPath(CREW_PATHS.plannerTimeline)}?crew=${encodeURIComponent(summary.profileId)}`}>
              <CalendarRange aria-hidden="true" />
              Rotation schedule
            </Link>
          </Button>
          {transfer}
          {edit}
        </>
      }
    >
      <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2" data-profile-meta="">
        {position ? <span className="type-body text-foreground">{position}</span> : <span className="type-body text-muted-foreground">No position recorded</span>}
        {summary.departmentLabel ? (
          <span className="inline-flex h-6 items-center rounded-full border border-border px-2.5 type-caption text-muted-foreground" data-profile-department="">
            {summary.departmentLabel}
          </span>
        ) : null}
        {summary.status ? <StatusPill domain="crew_status" status={summary.status} size="md" /> : null}
        {summary.loginState === 'pending_login' ? <PendingLoginChip /> : null}
        {summary.loginState === 'disabled' ? <StatusPill tone="neutral" size="md">Access off</StatusPill> : null}
        {!summary.onVessel && summary.source === 'server' ? (
          <span className="type-caption text-muted-foreground">Not on {vesselName}&rsquo;s crew today</span>
        ) : null}
      </div>
      {detail ? <p className="mt-1 type-caption text-muted-foreground">{detail}</p> : null}
      {routeVessel && (transferOpen || linkedTransfer) ? (
        <Suspense fallback={null}>
          <TransferEntry
            open
            onClose={closeTransfer}
            vessel={{ id: routeVessel.id, companyId: routeVessel.company_id ?? null }}
            profileId={summary.profileId}
            personName={summary.displayName}
            transferId={transferOpen ? null : linkedTransfer}
          />
        </Suspense>
      ) : null}
    </PageHeader>
  );
};

export default ProfileHeader;
