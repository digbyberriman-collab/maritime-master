import React, { Suspense, lazy, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, Briefcase, ClipboardCheck, ExternalLink, FileCheck, FileSignature, Pencil, Repeat, UserMinus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusPill } from '@/shared/components/status';
import type { Tone } from '@/components/ui/tones';
import { AccessDenied, EmptyState, PageError } from '@/shared/components/states';
import { notify } from '@/shared/lib/notify';
import { todayDateOnly } from '@/shared/lib/form';
import { useCan, useCapability } from '@/lib/permissions/useCan';
import { useScopedPath } from '@/app/router/scopes';
import { downloadCrewDocument, getCrewDocumentSignedUrl } from '@/lib/storage/crewDocuments';
import { ContractCard, Timeline, useCrewContracts, useEmploymentHistory } from '@/modules/hris';
import type { CrewContract } from '@/modules/hris/hooks/useCrewContracts';
import { HRIS_PATHS } from '@/modules/hris/paths';
import { reviewTypeLabel, statusLabel as reviewStatusLabel } from '@/modules/hris/lib/reviews';
import { CREW_CAPS, CREW_PATHS } from '@/modules/crew/paths';
import { useCrew } from '@/modules/crew/hooks/useCrew';
import { formatDay, leaveAllowanceText, useCrewEmployment } from '@/modules/crew/hooks/useCrewProfile';
import { useDepartments } from '@/modules/crew/hooks/useReferenceData';
import {
  TERMS_UNAVAILABLE,
  useProfileAppraisals,
  useProfileFamiliarisation,
  useProfileTransfers,
  type ProfileAppraisal,
  type ProfileFamiliarisationRecord,
} from '@/modules/crew/hooks/useEmployment';
import {
  EMPLOYMENT_SUBTABS,
  EMPLOYMENT_SUBTAB_LABEL,
  EMPLOYMENT_SUBTAB_PARAM,
  END_EMPLOYMENT_PENDING_MESSAGE,
  contractNoticeOf,
  noticeText,
  probationText,
  resolveEmploymentSubTab,
  type EmploymentSubTab,
} from '@/modules/crew/lib/employment';
import { TRANSFER_PARAM } from '@/modules/crew/components/profile/ProfileHeader';
import type { Transfer } from '@/modules/crew/lib/transfer';
import { formatTransferDay } from '@/modules/crew/lib/transfer';
import type { ProfileTabProps } from '@/modules/crew/lib/profileTabs';
import { FactGrid, Fact } from '@/modules/crew/components/profile/CurrentEmploymentCard';
import { LegacySignOffForm } from '@/modules/crew/components/SignOffDialog';

// The dialogs load only when they open (gap/00 I6).
const TermsEditDialog = lazy(() => import('@/modules/crew/components/profile/TermsEditDialog'));
const EndEmploymentDialog = lazy(() => import('@/modules/crew/components/profile/EndEmploymentDialog'));

export const EMPLOYMENT_DENIED_TITLE = 'Employment is kept for HR';

/**
 * The crew profile's Employment tab (gap/04 C57, C58, C59; W8; X1-11B), at
 * crew/people/:profileId/employment?sub=details|transfers|appraisals|familiarisation.
 *
 * - Gate: hris.employee_records.contracts_employment.view on the route
 *   vessel (the tab registry names it, and the server's tab list too).
 *   Nothing is read while it loads; denied shows who sees it.
 * - Details: the current terms on the vessel with the active contract's
 *   probation and two notice periods; Edit terms (TermsEditDialog, terms
 *   through crew_onboarding_save's terms path, the periods on the
 *   contract); End employment (EndEmploymentDialog, crew_end_employment;
 *   D-01: the legacy sign-off). HRIS's contract card and the employment
 *   timeline.
 * - Transfers: the person's transfers (crew_transfers_for_profile); Open
 *   sets `?transfer=<id>`, which the profile header opens in the wizard.
 * - Appraisals: the person's performance reviews, read-only, linking into
 *   HR (behind the appraisal view key).
 * - Familiarisation: the person's familiarisation forms on every vessel the
 *   viewer may see, linking to the record page on this vessel.
 */
const EmploymentTab: React.FC<ProfileTabProps> = ({ profile, vessel }) => {
  const gate = useCapability(CREW_CAPS.employmentView, { vesselId: vessel.id });
  if (gate.status === 'loading') {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Loading employment">
        <Skeleton className="h-9 w-80 max-w-full" />
        <Skeleton className="h-40" />
      </div>
    );
  }
  if (!gate.allowed) {
    return (
      <AccessDenied
        title={EMPLOYMENT_DENIED_TITLE}
        detail="The employment record (terms, contract, transfers and appraisals) needs contracts and employment access in HR. Ask your fleet manager if you need it."
        headingLevel={2}
      />
    );
  }
  return <EmploymentBody profile={profile} vessel={vessel} />;
};

const subTabLink = (active: boolean) =>
  cn(
    'inline-flex min-h-9 shrink-0 items-center whitespace-nowrap rounded-md px-3 type-body-sm font-medium transition-colors duration-quick ease-tide [@media(pointer:coarse)]:min-h-11',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
    active ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
  );

const EmploymentBody: React.FC<ProfileTabProps> = ({ profile, vessel }) => {
  const [params] = useSearchParams();
  const sub = resolveEmploymentSubTab(params.get(EMPLOYMENT_SUBTAB_PARAM));
  const hrefFor = (key: EmploymentSubTab) => {
    const next = new URLSearchParams(params);
    next.set(EMPLOYMENT_SUBTAB_PARAM, key);
    return `?${next.toString()}`;
  };
  return (
    <div className="min-w-0 space-y-4" data-employment-tab={sub}>
      <nav aria-label="Employment sections" className="min-w-0 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <ul className="inline-flex gap-1 rounded-lg border border-border bg-muted/50 p-1">
          {EMPLOYMENT_SUBTABS.map((key) => (
            <li key={key} className="flex">
              <Link to={hrefFor(key)} aria-current={key === sub ? 'page' : undefined} className={subTabLink(key === sub)} replace>
                {EMPLOYMENT_SUBTAB_LABEL[key]}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {sub === 'details' ? <DetailsPanel profile={profile} vessel={vessel} /> : null}
      {sub === 'transfers' ? <TransfersPanel profile={profile} vessel={vessel} /> : null}
      {sub === 'appraisals' ? <AppraisalsPanel profile={profile} vessel={vessel} /> : null}
      {sub === 'familiarisation' ? <FamiliarisationPanel profile={profile} vessel={vessel} /> : null}
    </div>
  );
};

// ---------------------------------------------------------------- Details

/** The active contract for the vessel (or for no vessel), as crew_end_employment picks it. */
function activeContractFor(contracts: readonly CrewContract[], vesselId: string): CrewContract | null {
  const active = contracts.filter((c) => c.status === 'active');
  return active.find((c) => c.vessel_id === vesselId) ?? active.find((c) => !c.vessel_id) ?? null;
}

const DetailsPanel: React.FC<ProfileTabProps> = ({ profile, vessel }) => {
  const ctx = { vesselId: vessel.id };
  const canEditTerms = useCan(CREW_CAPS.profilesCreate, ctx);
  const canEditContract = useCan(CREW_CAPS.employmentEdit, ctx);
  const employment = useCrewEmployment(vessel, profile);
  const contracts = useCrewContracts(profile.profileId);
  const history = useEmploymentHistory(profile.profileId);
  const departments = useDepartments();
  const crew = useCrew(undefined, { enabled: false });
  const [dialog, setDialog] = useState<'terms' | 'end' | null>(null);
  const today = useMemo(() => todayDateOnly(), []);

  const active = useMemo(() => activeContractFor(contracts.contracts, vessel.id), [contracts.contracts, vessel.id]);
  const shown = active ?? contracts.contracts.find((c) => c.status === 'draft') ?? null;
  const notice = contractNoticeOf(active);

  const ready = employment.status === 'ready' ? employment.employment : null;
  const assignmentHere = ready?.assignment && ready.assignment.vesselId === vessel.id ? ready.assignment : null;
  const placementHere = ready?.placement && ready.placement.vesselId === vessel.id ? ready.placement : null;
  const onCrewHere = Boolean(assignmentHere || placementHere);
  const terms = ready && (assignmentHere || placementHere) ? ready.terms : null;
  const departmentLabel = (key: string | null | undefined) => (key ? departments.items.find((d) => d.key === key)?.label ?? key : null);

  const preview = async (contract: CrewContract) => {
    try {
      const url = await getCrewDocumentSignedUrl(contract.document_path);
      if (!url) throw new Error('The contract has no stored document.');
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      notify.error(err, { title: 'The document could not be opened' });
    }
  };
  const download = async (contract: CrewContract) => {
    try {
      await downloadCrewDocument(contract.document_path, contract.document_name ?? `contract-${contract.id}.pdf`);
    } catch (err) {
      notify.error(err, { title: 'The document could not be downloaded' });
    }
  };

  const editReason = ready?.termsMissing ? TERMS_UNAVAILABLE : null;
  const showEdit = (canEditTerms || canEditContract) && onCrewHere;
  const showEnd = canEditContract && onCrewHere;

  const actions = (
    <div className="flex flex-wrap gap-2">
      {showEdit ? (
        editReason ? (
          <span className="inline-flex flex-col">
            <Button variant="outline" size="sm" aria-disabled="true" aria-describedby="employment-edit-unavailable" className="[@media(pointer:coarse)]:h-11" onClick={(e) => e.preventDefault()}>
              <Pencil aria-hidden="true" className="mr-2 size-4" />
              Edit terms
            </Button>
            <span id="employment-edit-unavailable" className="sr-only">
              {editReason}
            </span>
          </span>
        ) : (
          <Button variant="outline" size="sm" className="[@media(pointer:coarse)]:h-11" onClick={() => setDialog('terms')}>
            <Pencil aria-hidden="true" className="mr-2 size-4" />
            {terms ? 'Edit terms' : 'Add terms'}
          </Button>
        )
      ) : null}
      {showEnd ? (
        <Button variant="outline" size="sm" className="text-critical hover:text-critical [@media(pointer:coarse)]:h-11" onClick={() => setDialog('end')}>
          <UserMinus aria-hidden="true" className="mr-2 size-4" />
          End employment
        </Button>
      ) : null}
    </div>
  );

  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]" data-employment-panel="details">
      <div className="min-w-0 space-y-4">
        <Card data-profile-card="employment-terms">
          <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-center gap-2">
              <Briefcase aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
              <CardTitle className="type-subtitle">Employment on {vessel.name}</CardTitle>
            </div>
            {ready ? actions : null}
          </CardHeader>
          <CardContent className="space-y-3">
            {employment.status === 'idle' || employment.status === 'loading' ? (
              <div className="space-y-3" aria-busy="true" aria-label="Loading employment terms">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 w-56" />
                <Skeleton className="h-4 w-32" />
              </div>
            ) : employment.status === 'error' ? (
              <PageError variant="inline" error={employment.error} onRetry={employment.retry} title="The employment terms could not load" treatMissingAsOff={false} />
            ) : !onCrewHere ? (
              <p className="type-body text-muted-foreground">
                Not on {vessel.name}’s crew at the moment. Their earlier employment is in the timeline{ready?.assignment ? ' and on their current vessel’s profile' : ''}.
              </p>
            ) : (
              <>
                <FactGrid>
                  <Fact label="Position">{profile.positionName ?? assignmentHere?.position ?? placementHere?.position ?? null}</Fact>
                  <Fact label="Department">{profile.departmentLabel ?? departmentLabel(terms?.department_key) ?? assignmentHere?.department ?? null}</Fact>
                  <Fact label="Contract type">
                    {terms?.contract_type_key ? ready?.contractTypeLabels.get(terms.contract_type_key) ?? terms.contract_type_key : null}
                  </Fact>
                  <Fact label="Start date">{formatDay(terms?.start_date ?? assignmentHere?.startDate ?? null)}</Fact>
                  <Fact label={placementHere ? 'Expected to join the vessel' : 'Joined the vessel'}>
                    {formatDay(terms?.date_joining_vessel ?? assignmentHere?.joinDate ?? placementHere?.joinDate ?? null)}
                  </Fact>
                  <Fact label="Review date">{formatDay(terms?.review_date ?? null)}</Fact>
                  <Fact label="Probation" testId="probation">
                    {active ? (notice.known ? probationText(notice.probationMonths) : active.probation_end_date ? `Until ${formatDay(active.probation_end_date)}` : null) : null}
                  </Fact>
                  <Fact label="Notice during probation" testId="notice-during">
                    {active && notice.known ? noticeText(notice.noticeDuringProbationDays) : null}
                  </Fact>
                  <Fact label="Notice after probation" testId="notice-after">
                    {active ? noticeText(notice.noticeAfterProbationDays) : null}
                  </Fact>
                  <Fact label="Leave allowance">{terms ? leaveAllowanceText(terms) : null}</Fact>
                  <Fact label="Place of embarkation">{terms?.place_of_embarkation ?? null}</Fact>
                  <Fact label="Ends">{formatDay(assignmentHere?.leaveDate ?? null) ?? (assignmentHere ? 'Open-ended' : null)}</Fact>
                </FactGrid>
                {placementHere ? (
                  <p className="type-caption text-muted-foreground">Added without a sign-in: the assignment starts once their login is linked.</p>
                ) : null}
                {ready?.termsMissing ? (
                  <p className="type-caption text-muted-foreground" data-employment-terms="not-set-up">
                    {TERMS_UNAVAILABLE}
                  </p>
                ) : !terms ? (
                  <p className="type-caption text-muted-foreground">No employment terms recorded for this vessel yet.</p>
                ) : null}
                {!active && !contracts.isLoading ? (
                  <p className="type-caption text-muted-foreground" data-employment-contract="none">
                    No active contract: the probation and notice periods are kept on the contract.
                  </p>
                ) : active && !notice.known ? (
                  <p className="type-caption text-muted-foreground" data-employment-contract="legacy">
                    The probation length and the two notice periods arrive with the crew update; until then the contract’s one notice period is shown.
                  </p>
                ) : null}
                {placementHere && showEnd ? (
                  <p className="type-caption text-muted-foreground">{END_EMPLOYMENT_PENDING_MESSAGE}</p>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>

        <section aria-labelledby="employment-contract-heading" className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 id="employment-contract-heading" className="flex items-center gap-2 type-subtitle text-foreground">
              <FileSignature aria-hidden="true" className="size-4 text-muted-foreground" />
              Contract
            </h3>
            <Link className="inline-flex items-center gap-1 type-body-sm text-primary underline-offset-4 hover:underline" to={`${HRIS_PATHS.contracts}?crew=${encodeURIComponent(profile.profileId)}`}>
              All contracts in HR
              <ExternalLink aria-hidden="true" className="size-3.5" />
            </Link>
          </div>
          {contracts.isLoading ? (
            <Skeleton className="h-40" aria-label="Loading the contract" />
          ) : contracts.error ? (
            <PageError variant="inline" error={contracts.error} onRetry={() => void contracts.refetch()} title="The contract could not load" treatMissingAsOff={false} />
          ) : shown ? (
            <div className="min-w-0 [&_dl]:grid-cols-1 sm:[&_dl]:grid-cols-2" data-employment-contract-card="">
              <ContractCard
                contract={shown}
                canEdit={false}
                canAdmin={false}
                showWage={false}
                onEdit={() => undefined}
                onActivate={() => undefined}
                onTerminate={() => undefined}
                onUpload={() => undefined}
                onDelete={() => undefined}
                onDownload={() => void download(shown)}
                onPreview={() => void preview(shown)}
              />
            </div>
          ) : (
            <EmptyState
              compact
              bordered
              icon={FileSignature}
              title="No contract on record"
              body="Contracts are drawn up and signed in HR. The probation and notice periods live on the active one."
            />
          )}
        </section>
      </div>

      <div className="min-w-0" data-employment-timeline="">
        {history.error ? (
          <PageError variant="inline" error={history.error} onRetry={() => void history.refetch()} title="The employment timeline could not load" treatMissingAsOff={false} />
        ) : (
          <Timeline events={history.timeline} isLoading={history.isLoading} todayIso={today} />
        )}
      </div>

      {dialog === 'terms' && ready ? (
        <Suspense fallback={null}>
          <TermsEditDialog
            open
            onOpenChange={(open) => !open && setDialog(null)}
            vessel={{ id: vessel.id, companyId: vessel.companyId, name: vessel.name }}
            profileId={profile.profileId}
            personName={profile.displayName}
            terms={terms}
            fallbackStart={assignmentHere?.joinDate ?? assignmentHere?.startDate ?? placementHere?.joinDate ?? null}
            contract={
              active
                ? {
                    id: active.id,
                    contractNumber: active.contract_number,
                    startDate: active.start_date,
                    probationEndDate: active.probation_end_date,
                    noticePeriodDays: active.notice_period_days,
                  }
                : null
            }
            notice={notice}
            canEditTerms={canEditTerms}
            canEditContract={canEditContract}
          />
        </Suspense>
      ) : null}
      {dialog === 'end' ? (
        <Suspense fallback={null}>
          <EndEmploymentDialog
            open
            onOpenChange={(open) => !open && setDialog(null)}
            vessel={{ id: vessel.id, companyId: vessel.companyId, name: vessel.name }}
            person={{
              profileId: profile.profileId,
              displayName: profile.displayName,
              joinDate: assignmentHere?.joinDate ?? assignmentHere?.startDate ?? null,
              pendingPlacement: !assignmentHere && Boolean(placementHere),
            }}
            renderFallback={(fallbackNotice, carry) => (
              <LegacySignOffForm
                open
                onClose={() => setDialog(null)}
                personName={profile.displayName}
                vesselName={vessel.name}
                assignmentId={assignmentHere?.id ?? null}
                pendingPlacement={!assignmentHere && Boolean(placementHere)}
                isLoading={crew.signOffCrew.isPending}
                notice={fallbackNotice}
                initial={{ leaveDate: carry.endDate, reason: carry.reason, notes: carry.notes }}
                onConfirm={async (data) => {
                  await crew.signOffCrew.mutateAsync(data);
                  setDialog(null);
                }}
              />
            )}
          />
        </Suspense>
      ) : null}
    </div>
  );
};

// ---------------------------------------------------------------- Transfers

const TransferCard: React.FC<{ transfer: Transfer; openHref: string }> = ({ transfer: t, openHref }) => {
  const reason = t.status === 'cancelled' ? t.declineReason ?? t.cancelledReason : null;
  const position = t.sameRole
    ? `Same position${t.fromPosition ? `: ${t.fromPosition.name}` : ''}`
    : `${t.fromPosition?.name ?? 'Their position'} to ${t.toPosition?.name ?? 'a new position'}`;
  return (
    <li className="rounded-lg border border-border bg-card p-4" data-transfer-row={t.id}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 type-body font-medium text-foreground">
            <span>{t.fromVessel.name}</span>
            <ArrowRight aria-label="to" className="size-4 text-muted-foreground" />
            <span>{t.toVessel.name}</span>
            <StatusPill domain="crew_transfer" status={t.status} size="sm" />
            {t.requiresApproval && t.status !== 'completed' && t.status !== 'cancelled' ? <StatusPill tone="purple" label="Fleet approval" icon={null} size="sm" /> : null}
          </p>
          <p className="type-body-sm text-muted-foreground">
            Signs off {formatTransferDay(t.signOffDate)} · signs on {formatTransferDay(t.signOnDate)}
          </p>
          <p className="type-body-sm text-muted-foreground">{position}</p>
          {reason ? <p className="type-caption text-muted-foreground">Reason: {reason}</p> : null}
          <p className="type-caption text-muted-foreground">
            {t.createdByName ? `Started by ${t.createdByName}` : 'Started'}
            {t.createdAt ? ` on ${formatTransferDay(t.createdAt.slice(0, 10))}` : ''}
            {t.completedAt ? ` · completed ${formatTransferDay(t.completedAt.slice(0, 10))}` : ''}
          </p>
        </div>
        <Button asChild variant="outline" size="sm" className="shrink-0 self-start [@media(pointer:coarse)]:h-11">
          <Link to={openHref} aria-label={`Open the transfer to ${t.toVessel.name}`}>
            Open
          </Link>
        </Button>
      </div>
    </li>
  );
};

const TransfersPanel: React.FC<ProfileTabProps> = ({ profile, vessel }) => {
  const [params] = useSearchParams();
  const transfers = useProfileTransfers(vessel.companyId, profile.profileId);
  const openHref = (id: string) => {
    const next = new URLSearchParams(params);
    next.set(TRANSFER_PARAM, id);
    return `?${next.toString()}`;
  };
  return (
    <section aria-labelledby="employment-transfers-heading" className="min-w-0 space-y-3" data-employment-panel="transfers" data-transfers-state={transfers.status}>
      <h3 id="employment-transfers-heading" className="flex items-center gap-2 type-subtitle text-foreground">
        <Repeat aria-hidden="true" className="size-4 text-muted-foreground" />
        Transfers between vessels
      </h3>
      {transfers.status === 'idle' || transfers.status === 'loading' ? (
        <div className="space-y-2" aria-busy="true" aria-label="Loading transfers">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      ) : transfers.status === 'missing' ? (
        <EmptyState kind="not-enabled" compact bordered icon={Repeat} title="Transfers are not set up yet" body="Reviewed transfers between vessels appear here once the crew update is applied." />
      ) : transfers.status === 'denied' ? (
        <EmptyState kind="no-access" compact bordered icon={Repeat} title="Transfers are not shown to you" body={transfers.message} />
      ) : transfers.status === 'error' ? (
        <PageError variant="inline" error={transfers.error} onRetry={transfers.retry} title="The transfers could not load" treatMissingAsOff={false} />
      ) : transfers.transfers.length === 0 ? (
        <EmptyState compact bordered icon={Repeat} title="No transfers" body={`${profile.displayName} has not been transferred between vessels in STORM.`} />
      ) : (
        <ul className="space-y-2">
          {transfers.transfers.map((t) => (
            <TransferCard key={t.id} transfer={t} openHref={openHref(t.id)} />
          ))}
        </ul>
      )}
    </section>
  );
};

// ---------------------------------------------------------------- Appraisals

function appraisalTone(status: string): Tone {
  switch (status) {
    case 'completed':
      return 'ok';
    case 'awaiting_acknowledgement':
      return 'warn';
    case 'self_assessment':
    case 'in_review':
      return 'info';
    default:
      return 'neutral';
  }
}

function appraisalPath(type: string): string {
  if (type === 'annual_review') return HRIS_PATHS.annualReviews;
  if (type === 'end_of_rotation') return HRIS_PATHS.endOfRotation;
  return HRIS_PATHS.annualEvaluations;
}

const period = (from: string | null, to: string | null): string | null => {
  const a = formatDay(from);
  const b = formatDay(to);
  if (a && b) return `${a} to ${b}`;
  return a ?? b ?? null;
};

const AppraisalRow: React.FC<{ appraisal: ProfileAppraisal; profileId: string }> = ({ appraisal: a, profileId }) => (
  <li className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between" data-appraisal-row={a.id}>
    <div className="min-w-0 space-y-1">
      <p className="flex flex-wrap items-center gap-2 type-body font-medium text-foreground">
        {reviewTypeLabel(a.reviewType)}
        <StatusPill tone={appraisalTone(a.status)} label={reviewStatusLabel(a.status)} icon={null} size="sm" />
      </p>
      <p className="type-body-sm text-muted-foreground">
        {[period(a.periodStart, a.periodEnd), a.completedAt ? `completed ${formatDay(a.completedAt)}` : a.dueDate ? `due ${formatDay(a.dueDate)}` : null]
          .filter(Boolean)
          .join(' · ') || 'No period recorded'}
      </p>
      {a.overallRating !== null ? <p className="type-caption text-muted-foreground">Overall rating {a.overallRating.toFixed(1)}</p> : null}
    </div>
    <Button asChild variant="ghost" size="sm" className="shrink-0 self-start [@media(pointer:coarse)]:h-11 sm:self-center">
      <Link to={`${appraisalPath(a.reviewType)}?crew=${encodeURIComponent(profileId)}&review=${encodeURIComponent(a.id)}`}>
        Open in HR
        <ExternalLink aria-hidden="true" className="ml-1.5 size-3.5" />
      </Link>
    </Button>
  </li>
);

const AppraisalsPanel: React.FC<ProfileTabProps> = ({ profile, vessel }) => {
  const gate = useCapability(CREW_CAPS.appraisalsView, { vesselId: vessel.id });
  const appraisals = useProfileAppraisals(vessel.companyId, profile.profileId, gate.status !== 'loading' && gate.allowed);
  return (
    <section aria-labelledby="employment-appraisals-heading" className="min-w-0 space-y-3" data-employment-panel="appraisals">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="employment-appraisals-heading" className="flex items-center gap-2 type-subtitle text-foreground">
          <ClipboardCheck aria-hidden="true" className="size-4 text-muted-foreground" />
          Appraisals
        </h3>
        {gate.allowed ? (
          <Link
            className="inline-flex items-center gap-1 type-body-sm text-primary underline-offset-4 hover:underline"
            to={`${HRIS_PATHS.annualEvaluations}?crew=${encodeURIComponent(profile.profileId)}`}
          >
            Appraisals in HR
            <ExternalLink aria-hidden="true" className="size-3.5" />
          </Link>
        ) : null}
      </div>
      {gate.status === 'loading' ? (
        <Skeleton className="h-24" aria-label="Loading appraisals" />
      ) : !gate.allowed ? (
        <EmptyState kind="no-access" compact bordered icon={ClipboardCheck} title="Appraisals are not shown to you" body="Appraisals are shown to HR and to the person’s reviewers." />
      ) : appraisals.status === 'idle' || appraisals.status === 'loading' ? (
        <div className="space-y-2" aria-busy="true" aria-label="Loading appraisals">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      ) : appraisals.status === 'error' ? (
        <PageError variant="inline" error={appraisals.error} onRetry={appraisals.retry} title="The appraisals could not load" treatMissingAsOff={false} />
      ) : appraisals.items.length === 0 ? (
        <EmptyState compact bordered icon={ClipboardCheck} title="No appraisals" body="Annual evaluations, reviews and end-of-rotation catch-ups are started in HR." />
      ) : (
        <ul className="space-y-2">
          {appraisals.items.map((a) => (
            <AppraisalRow key={a.id} appraisal={a} profileId={profile.profileId} />
          ))}
        </ul>
      )}
    </section>
  );
};

// ---------------------------------------------------------------- Familiarisation

function familiarisationStatus(r: ProfileFamiliarisationRecord, today: string): string {
  if (r.status !== 'completed' && r.dueDate && r.dueDate.slice(0, 10) < today) return 'overdue';
  return r.status;
}

const FamiliarisationPanel: React.FC<ProfileTabProps> = ({ profile, vessel }) => {
  const scopedPath = useScopedPath();
  const canViewVessel = useCan(CREW_CAPS.famView, { vesselId: vessel.id });
  const records = useProfileFamiliarisation(vessel.companyId, { profileId: profile.profileId, userId: profile.userId });
  const today = useMemo(() => todayDateOnly(), []);
  return (
    <section aria-labelledby="employment-fam-heading" className="min-w-0 space-y-3" data-employment-panel="familiarisation">
      <h3 id="employment-fam-heading" className="flex items-center gap-2 type-subtitle text-foreground">
        <FileCheck aria-hidden="true" className="size-4 text-muted-foreground" />
        Familiarisation
      </h3>
      {records.status === 'idle' || records.status === 'loading' ? (
        <div className="space-y-2" aria-busy="true" aria-label="Loading familiarisation">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      ) : records.status === 'error' ? (
        <PageError variant="inline" error={records.error} onRetry={records.retry} title="The familiarisation forms could not load" treatMissingAsOff={false} />
      ) : records.items.length === 0 ? (
        canViewVessel || profile.isOwn ? (
          <EmptyState
            compact
            bordered
            icon={FileCheck}
            title="No familiarisation forms"
            body={records.legacy && !profile.userId ? 'Forms of a person without a login appear once the crew update is applied.' : 'Forms open when they join a vessel, or are started on the Familiarisation page.'}
          />
        ) : (
          <EmptyState kind="no-access" compact bordered icon={FileCheck} title="Familiarisation forms are not shown to you" body="They are shown to familiarisation viewers of the vessel and to the person." />
        )
      ) : (
        <ul className="space-y-2">
          {records.items.map((r) => {
            const status = familiarisationStatus(r, today);
            const here = r.vesselId === vessel.id;
            const signed = [r.crewSignedAt ? 'crew signed' : null, r.supervisorSignedAt ? 'supervisor signed' : null].filter(Boolean).join(' · ');
            return (
              <li key={r.id} className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between" data-fam-row={r.id}>
                <div className="min-w-0 space-y-1">
                  <p className="flex flex-wrap items-center gap-2 type-body font-medium text-foreground">
                    {r.templateName}
                    <StatusPill domain="familiarization" status={status} size="sm" />
                  </p>
                  <p className="type-body-sm text-muted-foreground">
                    {[r.vesselName ?? 'Another vessel', r.joinDate ? `joined ${formatDay(r.joinDate)}` : null, r.completedOn ? `completed ${formatDay(r.completedOn)}` : r.dueDate ? `due ${formatDay(r.dueDate)}` : null]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                  {r.percent !== null || signed ? (
                    <p className="type-caption text-muted-foreground">{[r.percent !== null ? `${Math.round(r.percent)}% done` : null, signed || null].filter(Boolean).join(' · ')}</p>
                  ) : null}
                </div>
                {here ? (
                  <Button asChild variant="ghost" size="sm" className="shrink-0 self-start [@media(pointer:coarse)]:h-11 sm:self-center">
                    <Link to={scopedPath(`${CREW_PATHS.familiarisation}/${r.id}`)}>Open</Link>
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {records.status === 'ready' && records.items.length > 0 && records.legacy ? (
        <p className="type-caption text-muted-foreground">Shown from their login’s forms until the crew update is applied.</p>
      ) : null}
    </section>
  );
};

export default EmploymentTab;
