import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { Droplet, ExternalLink, FilePlus2, HeartPulse, Pill, ShieldAlert, Stethoscope, Syringe, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Tone } from '@/components/ui/tones';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusPill } from '@/shared/components/status';
import { AccessDenied, EmptyState, PageError } from '@/shared/components/states';
import { useCan, useCapability } from '@/lib/permissions/useCan';
import { todayDateOnly } from '@/shared/lib/form';
import { HEALTH_PATHS, healthLink } from '@/modules/health/paths';
import { CREW_CAPS } from '@/modules/crew/paths';
import { formatDay } from '@/modules/crew/hooks/useCrewProfile';
import {
  useCrewMedicalSummary,
  type CrewMedicalSummary,
  type MedicalAllergy,
  type MedicalReport,
} from '@/modules/crew/hooks/useCrewMedicalSummary';
import {
  STANDARD_VACCINES,
  VACCINATION_STATE_META,
  vaccinationSummary,
  type StandardVaccinationRow,
  type VaccinationState,
} from '@/modules/crew/lib/vaccines';
import type { ProfileTabProps } from '@/modules/crew/lib/profileTabs';

/** Editing the record is Health's (the medical team's), never this tab's. */
const MEDICAL_EDIT = 'health.personnel_medical.crew_medical_records.edit';

export const MEDICAL_DENIED_TITLE = 'Medical details are for the medical team';
export const MEDICAL_DENIED_DETAIL =
  "Seeing a crew member's medical summary needs crew medical records access on this vessel. Ask your fleet manager if your role needs it.";
export const MEDICAL_NOT_ENABLED = 'Medical records are not set up for this account yet.';

const coarse = '[@media(pointer:coarse)]:h-11';

const ALLERGY_TONE: Record<string, Tone> = { anaphylaxis: 'danger', severe: 'danger', moderate: 'warn', mild: 'neutral' };
const SEVERITY_LABEL: Record<string, string> = { anaphylaxis: 'Anaphylaxis', severe: 'Severe', moderate: 'Moderate', mild: 'Mild' };
const ALLERGY_TYPE_LABEL: Record<string, string> = {
  food: 'Food',
  drug: 'Medicine',
  environmental: 'Environmental',
  insect: 'Insect sting',
  latex: 'Latex',
  other: 'Other',
};
const CONDITION_CATEGORY_LABEL: Record<string, string> = {
  cardiac: 'Cardiac',
  respiratory: 'Respiratory',
  musculoskeletal: 'Musculoskeletal',
  neurological: 'Neurological',
  endocrine: 'Endocrine',
  mental_health: 'Mental health',
  dermatological: 'Skin',
  gastrointestinal: 'Digestive',
  other: 'Other',
};
const REPORT_TYPE_LABEL: Record<string, string> = {
  walk_in: 'Walk-in',
  scheduled: 'Scheduled',
  emergency: 'Emergency',
  follow_up: 'Follow-up',
  screening: 'Screening',
  telemedicine: 'Telemedicine',
};
const OUTCOME_META: Record<string, { tone: Tone; label: string }> = {
  resolved: { tone: 'ok', label: 'Resolved' },
  monitoring: { tone: 'info', label: 'Monitoring' },
  referred_physio: { tone: 'info', label: 'Referred to physio' },
  referred_shoreside: { tone: 'warn', label: 'Referred ashore' },
  referred_specialist: { tone: 'warn', label: 'Referred to a specialist' },
  medevac: { tone: 'danger', label: 'Medevac' },
  hospitalised: { tone: 'danger', label: 'Hospitalised' },
  deceased: { tone: 'danger', label: 'Deceased' },
  other: { tone: 'neutral', label: 'Other outcome' },
};
const FIT_META: Record<string, { tone: Tone; label: string }> = {
  fit: { tone: 'ok', label: 'Fit for duty' },
  light_duties: { tone: 'warn', label: 'Light duties' },
  unfit: { tone: 'danger', label: 'Unfit for duty' },
};

const label = (map: Record<string, string>, value: string | null | undefined): string | null =>
  value ? map[value.trim().toLowerCase()] ?? value.replace(/_/g, ' ') : null;

const when = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : format(d, 'd MMM yyyy');
};

/** A link into Health, scoped to this person (`?person=`), styled as a quiet button. */
const HealthLink: React.FC<{ to: string; children: React.ReactNode; ariaLabel?: string; variant?: 'ghost' | 'outline' | 'signal' }> = ({
  to,
  children,
  ariaLabel,
  variant = 'ghost',
}) => (
  <Button asChild variant={variant} size="sm" className={coarse}>
    <Link to={to} aria-label={ariaLabel}>
      {children}
    </Link>
  </Button>
);

const SummaryCard: React.FC<{
  icon: LucideIcon;
  title: string;
  count?: number;
  action?: React.ReactNode;
  children: React.ReactNode;
  testId: string;
}> = ({ icon: Icon, title, count, action, children, testId }) => (
  <Card className="flex min-w-0 flex-col" data-medical-card={testId}>
    <CardHeader className="flex-row items-center gap-2 space-y-0 pb-3">
      <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      <CardTitle className="type-subtitle min-w-0 flex-1 truncate">
        {title}
        {count !== undefined ? <span className="ml-2 type-caption tabular-nums text-muted-foreground">{count}</span> : null}
      </CardTitle>
      {action}
    </CardHeader>
    <CardContent className="min-w-0 flex-1">{children}</CardContent>
  </Card>
);

const NoneRecorded: React.FC<{ children: React.ReactNode }> = ({ children }) => <p className="type-body text-muted-foreground">{children}</p>;

const TabLoading: React.FC = () => (
  <div className="space-y-4" aria-busy="true" aria-label="Loading medical summary">
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i}>
          <CardContent className="space-y-3 p-4">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-4 w-full" />
          </CardContent>
        </Card>
      ))}
    </div>
    <Card>
      <CardContent className="space-y-3 p-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </CardContent>
    </Card>
  </div>
);

/**
 * The profile's Medical tab (gap/04 C60; X1-03B): a read-only summary of
 * the person's Health record (blood group, allergies, conditions,
 * medication, the standard vaccinations with their boosters, and the
 * latest medical reports), with links into the Health pages for this
 * person to edit or raise a case.
 *
 * Gate: health.personnel_medical.crew_medical_records.view on the vessel.
 * Nothing is read while the answer is loading or when it is no (the tab
 * then says who sees medical details); the med_* RLS decides again on the
 * server. Only summary fields are read (useCrewMedicalSummary).
 *
 * D-01: a missing Health table reads "not set up"; any other error is an
 * error with Retry.
 */
const MedicalTab: React.FC<ProfileTabProps> = ({ profile, vessel }) => {
  const ctx = { vesselId: vessel.id };
  const gate = useCapability(CREW_CAPS.medicalRecordsView, ctx);
  const canEdit = useCan(MEDICAL_EDIT, ctx);
  const allowed = gate.status !== 'loading' && gate.allowed;
  const state = useCrewMedicalSummary(vessel, profile.profileId, { enabled: allowed });

  if (gate.status === 'loading') return <TabLoading />;
  if (!gate.allowed || state.status === 'denied') {
    return <AccessDenied headingLevel={2} title={MEDICAL_DENIED_TITLE} detail={MEDICAL_DENIED_DETAIL} backTo={null} />;
  }
  if (state.status === 'idle' || state.status === 'loading') return <TabLoading />;
  if (state.status === 'not-enabled') {
    return <EmptyState kind="not-enabled" title="Medical records are not set up" body={MEDICAL_NOT_ENABLED} data-medical-state="not-enabled" />;
  }
  if (state.status === 'error') {
    return <PageError error={state.error} onRetry={state.retry} title="The medical summary could not load" treatMissingAsOff={false} headingLevel={2} />;
  }
  if (state.status === 'no-record') {
    return (
      <EmptyState
        kind="first-use"
        icon={HeartPulse}
        title="No medical record yet"
        body={`${profile.displayName} has no record in Health. The medical team creates it there.`}
        action={
          canEdit ? (
            <HealthLink to={HEALTH_PATHS.crewMedicalRecords} variant="outline">
              <ExternalLink aria-hidden="true" />
              Open Health
            </HealthLink>
          ) : undefined
        }
        data-medical-state="no-record"
      />
    );
  }
  return <MedicalSummaryView summary={state.summary} displayName={profile.displayName} canEdit={canEdit} />;
};

const MedicalSummaryView: React.FC<{ summary: CrewMedicalSummary; displayName: string; canEdit: boolean }> = ({ summary, displayName, canEdit }) => {
  const person = summary.personId;
  const link = (path: string) => healthLink(path, person);
  const verb = canEdit ? 'Edit' : 'Open';
  const editAction = (path: string, what: string) => (
    <HealthLink to={link(path)} ariaLabel={`${verb} ${what} in Health`}>
      {verb}
    </HealthLink>
  );

  return (
    <div className="min-w-0 space-y-4" data-medical-state="ready">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-[min(18rem,100%)] flex-1">
          <h2 className="type-title text-foreground">Medical summary</h2>
          <p className="type-body text-muted-foreground">
            Read-only here. The medical team keeps {displayName}&rsquo;s record in Health.
            {!summary.personActive ? ' Their Health record is marked inactive.' : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <HealthLink to={link(HEALTH_PATHS.crewMedicalRecords)} variant="outline">
            <ExternalLink aria-hidden="true" />
            Open in Health
          </HealthLink>
          {canEdit ? (
            <HealthLink to={link(HEALTH_PATHS.treatmentHistory)} variant="signal">
              <FilePlus2 aria-hidden="true" />
              Raise a new case
            </HealthLink>
          ) : null}
        </div>
      </div>

      <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard icon={Droplet} title="Blood group" testId="blood-group" action={editAction(HEALTH_PATHS.crewMedicalRecords, 'the blood group')}>
          <p className={cn('type-kpi', summary.bloodGroup && summary.bloodGroup !== 'unknown' ? 'text-foreground' : 'text-muted-foreground')}>
            {summary.bloodGroup && summary.bloodGroup !== 'unknown' ? summary.bloodGroup : 'Unknown'}
          </p>
          <p className="mt-1 type-caption text-muted-foreground">
            {summary.lastReviewedOn ? `Record reviewed ${formatDay(summary.lastReviewedOn)}` : 'The record has not been reviewed yet.'}
          </p>
        </SummaryCard>

        <SummaryCard
          icon={ShieldAlert}
          title="Allergies"
          count={summary.allergies.length}
          testId="allergies"
          action={editAction(HEALTH_PATHS.allergiesConditions, 'allergies')}
        >
          {summary.allergies.length === 0 ? (
            <NoneRecorded>No allergies recorded.</NoneRecorded>
          ) : (
            <ul className="space-y-2">
              {summary.allergies.map((a) => (
                <AllergyItem key={a.id} allergy={a} />
              ))}
            </ul>
          )}
        </SummaryCard>

        <SummaryCard
          icon={Stethoscope}
          title="Conditions"
          count={summary.conditions.length}
          testId="conditions"
          action={editAction(HEALTH_PATHS.allergiesConditions, 'conditions')}
        >
          {summary.conditions.length === 0 ? (
            <NoneRecorded>No current conditions recorded.</NoneRecorded>
          ) : (
            <ul className="space-y-2">
              {summary.conditions.map((c) => (
                <li key={c.id} className="min-w-0">
                  <p className="break-words type-body font-medium text-foreground">{c.name}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    {c.category ? <span className="type-caption text-muted-foreground">{label(CONDITION_CATEGORY_LABEL, c.category)}</span> : null}
                    {c.affectsFitness ? <StatusPill tone="warn">Affects fitness</StatusPill> : null}
                    {c.status === 'managed' ? <StatusPill tone="neutral">Managed</StatusPill> : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SummaryCard>

        <SummaryCard
          icon={Pill}
          title="Medication"
          count={summary.medications.length}
          testId="medications"
          action={editAction(HEALTH_PATHS.medications, 'medication')}
        >
          {summary.medications.length === 0 ? (
            <NoneRecorded>No current medication recorded.</NoneRecorded>
          ) : (
            <ul className="space-y-2">
              {summary.medications.map((m) => (
                <li key={m.id} className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                  <span className="min-w-0 break-words type-body font-medium text-foreground">{m.name}</span>
                  <span className="type-caption text-muted-foreground">{m.isRegular ? 'Regular' : 'When needed'}</span>
                </li>
              ))}
            </ul>
          )}
        </SummaryCard>
      </div>

      <VaccinationsCard summary={summary} action={editAction(HEALTH_PATHS.vaccinations, 'vaccinations')} />

      <ReportsCard
        reports={summary.reports}
        allHref={link(HEALTH_PATHS.treatmentHistory)}
        raiseHref={canEdit ? link(HEALTH_PATHS.treatmentHistory) : null}
      />
    </div>
  );
};

const AllergyItem: React.FC<{ allergy: MedicalAllergy }> = ({ allergy }) => {
  const severity = allergy.severity.trim().toLowerCase();
  return (
    <li className="min-w-0">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <span className="min-w-0 break-words type-body font-medium text-foreground">{allergy.allergen}</span>
        <StatusPill tone={ALLERGY_TONE[severity] ?? 'neutral'}>{SEVERITY_LABEL[severity] ?? label(SEVERITY_LABEL, severity)}</StatusPill>
      </div>
      <p className="type-caption text-muted-foreground">
        {label(ALLERGY_TYPE_LABEL, allergy.allergyType)}
        {allergy.carriesAutoinjector ? ' · Carries an auto-injector' : ''}
      </p>
    </li>
  );
};

// ---------------------------------------------------------------- vaccinations

const COUNTED: readonly VaccinationState[] = ['valid', 'complete', 'due_soon', 'overdue', 'not_recorded'];
const COUNT_LABEL: Record<VaccinationState, (n: number) => string> = {
  valid: () => 'up to date',
  complete: (n) => (n === 1 ? 'course recorded' : 'courses recorded'),
  due_soon: (n) => (n === 1 ? 'booster due' : 'boosters due'),
  overdue: () => 'overdue',
  not_recorded: () => 'not recorded',
  date_missing: (n) => (n === 1 ? 'dose date missing' : 'dose dates missing'),
  exempt: () => 'exempt',
};

const VaccinationsCard: React.FC<{ summary: CrewMedicalSummary; action: React.ReactNode }> = ({ summary, action }) => {
  const today = useMemo(() => todayDateOnly(), []);
  const vaccines = useMemo(() => vaccinationSummary(summary.vaccinations, today), [summary.vaccinations, today]);
  const counted = [...COUNTED, ...(['date_missing', 'exempt'] as const).filter((s) => vaccines.counts[s] > 0)];

  return (
    <Card className="min-w-0" data-medical-card="vaccinations">
      <CardHeader className="flex-row flex-wrap items-center gap-2 space-y-0 pb-3">
        <Syringe aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        <CardTitle className="type-subtitle min-w-0 flex-1">Vaccinations</CardTitle>
        {action}
        <p className="w-full type-caption text-muted-foreground" data-vaccine-counts="">
          {counted.map((s, i) => (
            <React.Fragment key={s}>
              {i > 0 ? <span aria-hidden="true"> · </span> : null}
              <span className={cn('tabular-nums', (s === 'overdue' || s === 'due_soon') && vaccines.counts[s] > 0 && 'font-semibold text-foreground')}>
                {vaccines.counts[s]} {COUNT_LABEL[s](vaccines.counts[s])}
              </span>
            </React.Fragment>
          ))}
          <span aria-hidden="true"> · </span>
          STORM&rsquo;s standard list of {STANDARD_VACCINES.length}
        </p>
      </CardHeader>
      <CardContent className="min-w-0">
        <div role="table" aria-label="Standard vaccinations" className="min-w-0 divide-y divide-border">
          <div role="row" className="hidden gap-4 pb-2 type-caption text-muted-foreground md:grid md:grid-cols-[minmax(0,1.7fr)_minmax(0,0.8fr)_minmax(0,0.9fr)_10rem]">
            <span role="columnheader">Vaccine</span>
            <span role="columnheader">Latest dose</span>
            <span role="columnheader">Booster due</span>
            <span role="columnheader">Status</span>
          </div>
          {vaccines.rows.map((row) => (
            <VaccineRow key={row.vaccine.key} row={row} />
          ))}
        </div>
        {vaccines.other.length > 0 ? (
          <div className="mt-4 border-t border-border pt-3" data-vaccines-other="">
            <h3 className="type-eyebrow text-muted-foreground">Other vaccinations recorded</h3>
            <ul className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
              {vaccines.other.map((d) => (
                <li key={d.id} className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3">
                  <span className="min-w-0 break-words type-body text-foreground">{d.vaccine}</span>
                  <span className="type-caption tabular-nums text-muted-foreground">{formatDay(d.administeredOn) ?? 'Date not recorded'}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
};

const VaccineRow: React.FC<{ row: StandardVaccinationRow }> = ({ row }) => {
  const meta = VACCINATION_STATE_META[row.state];
  const latest = row.latest;
  const latestText = latest ? formatDay(latest.administeredOn) ?? 'Date not recorded' : '—';
  const boosterText = row.boosterDue
    ? formatDay(row.boosterDue)
    : row.state === 'complete'
      ? 'No routine booster'
      : row.state === 'date_missing'
        ? 'Needs the dose date'
        : '—';
  return (
    <div
      role="row"
      className="grid min-w-0 gap-x-4 gap-y-1 py-2.5 md:grid-cols-[minmax(0,1.7fr)_minmax(0,0.8fr)_minmax(0,0.9fr)_10rem] md:items-center"
      data-vaccine={row.vaccine.key}
      data-vaccine-state={row.state}
    >
      <div role="cell" className="flex min-w-0 items-start justify-between gap-3 md:block">
        <div className="min-w-0">
          <p className="break-words type-body font-medium text-foreground">{row.vaccine.name}</p>
          <p className="type-caption text-muted-foreground">{row.vaccine.schedule}</p>
        </div>
        <StatusPill tone={meta.tone} className="md:hidden">
          {meta.label}
        </StatusPill>
      </div>
      <p role="cell" className="type-body-sm tabular-nums text-foreground">
        <span className="text-muted-foreground md:sr-only">Latest dose </span>
        {latestText}
        {latest?.doseLabel ? <span className="text-muted-foreground"> · {latest.doseLabel}</span> : null}
      </p>
      <p role="cell" className="type-body-sm tabular-nums text-foreground">
        <span className="text-muted-foreground md:sr-only">Booster due </span>
        {boosterText}
        {row.boosterSource === 'interval' ? <span className="text-muted-foreground"> (planned)</span> : null}
      </p>
      <div role="cell" className="hidden md:block">
        <StatusPill tone={meta.tone}>{meta.label}</StatusPill>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------- medical reports

const ReportsCard: React.FC<{ reports: readonly MedicalReport[]; allHref: string; raiseHref: string | null }> = ({ reports, allHref, raiseHref }) => (
  <Card className="min-w-0" data-medical-card="reports">
    <CardHeader className="flex-row flex-wrap items-center gap-2 space-y-0 pb-3">
      <HeartPulse aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      <CardTitle className="type-subtitle min-w-0 flex-1">Medical reports</CardTitle>
      <HealthLink to={allHref}>See all in Health</HealthLink>
    </CardHeader>
    <CardContent className="min-w-0">
      {reports.length === 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <NoneRecorded>No medical reports recorded.</NoneRecorded>
          {raiseHref ? (
            <HealthLink to={raiseHref} variant="outline">
              <FilePlus2 aria-hidden="true" />
              Raise a new case
            </HealthLink>
          ) : null}
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {reports.map((r) => (
            <li key={r.id} className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1.5 py-2.5" data-medical-report={r.confidential ? 'confidential' : 'open'}>
              <span className="type-mono text-muted-foreground">{r.number}</span>
              <span className="type-body-sm tabular-nums text-foreground">{when(r.occurredAt)}</span>
              {r.confidential ? (
                <span className="type-body-sm text-muted-foreground">Confidential: the details stay with the medical team.</span>
              ) : (
                <>
                  <span className="type-body-sm text-foreground">{label(REPORT_TYPE_LABEL, r.type) ?? 'Consultation'}</span>
                  <span className="flex flex-wrap items-center gap-1.5">
                    {r.outcome ? <StatusPill tone={OUTCOME_META[r.outcome]?.tone ?? 'neutral'}>{OUTCOME_META[r.outcome]?.label ?? label({}, r.outcome)}</StatusPill> : null}
                    {r.fitForDuty ? <StatusPill tone={FIT_META[r.fitForDuty]?.tone ?? 'neutral'}>{FIT_META[r.fitForDuty]?.label ?? label({}, r.fitForDuty)}</StatusPill> : null}
                  </span>
                  {r.followUpOn ? <span className="type-caption text-muted-foreground">Follow-up {formatDay(r.followUpOn)}</span> : null}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </CardContent>
  </Card>
);

export default MedicalTab;
