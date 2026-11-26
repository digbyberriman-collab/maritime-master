/**
 * My training (/me/training; gap/02 W3 from the applicant's side, TR10):
 * the person's own applications (drafts and returned ones first, then
 * those in progress), their course history, reimbursements and repayment
 * obligations. Opening an application offers the applicant's steps
 * (submit, cancel before approval, enrol, record completion) through
 * development_transition (ApplicationDetailModal). Eligibility reads the
 * company's programme settings (eligibility_service_days), not a number in
 * the code. Errors show as errors with Retry, never as an empty page.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { differenceInDays, addDays, format } from 'date-fns';
import { GraduationCap, BookOpen, ClipboardList, DollarSign, CheckCircle, Clock, AlertTriangle, FileText } from 'lucide-react';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import PageHeader from '@/shared/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { KpiTile } from '@/shared/components/data';
import { PageError, PageLoading } from '@/shared/components/states';
import { StatusPill } from '@/shared/components/status';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import {
  useMyApplications,
  useMyRepayments,
  useDevelopmentStats,
  type DevelopmentApplication,
} from '@/modules/development/hooks/useDevelopment';
import { useCategoryLabels, useProgramSettings } from '@/modules/development/hooks/useProgramSettings';
import { DEFAULT_SETTINGS } from '@/modules/development/services/rulesEngine';
import { CATEGORY_CONFIG, APPLICATION_STATUS_CONFIG, APPROVAL_STEPS, type DevCategory, type ApplicationStatus } from '@/modules/development/constants';
import { ACTIVE_STATUSES, APPROVED_OR_LATER_STATUSES } from '@/modules/development/lib/applicationMachine';
import ApplicationDetailModal from '@/modules/development/components/ApplicationDetailModal';
import ExpenseClaimModal, { type ExpenseClaimApplication } from '@/modules/development/components/ExpenseClaimModal';
import NewApplicationFlow from '@/modules/development/components/NewApplicationFlow';

const OPEN_FOR_APPLICANT: readonly string[] = ['draft', 'returned', ...ACTIVE_STATUSES];
const HISTORY: readonly string[] = ['completed', 'reimbursed', 'closed'];
const EXPENSE_OPEN: readonly string[] = APPROVED_OR_LATER_STATUSES.filter((s) => s !== 'closed');

/** Profile fields the eligibility rule reads (not every profile carries them). */
interface EligibilityProfile {
  role?: string | null;
  join_date?: string | null;
  contract_start_date?: string | null;
  created_at?: string | null;
}

export default function MyDevelopment() {
  const [selectedApp, setSelectedApp] = useState<DevelopmentApplication | null>(null);
  const [expenseApp, setExpenseApp] = useState<ExpenseClaimApplication | null>(null);
  const [showNewApp, setShowNewApp] = useState(false);
  const { profile } = useAuth();
  const apps = useMyApplications();
  const reps = useMyRepayments();
  const stats = useDevelopmentStats();
  const { data: settings = DEFAULT_SETTINGS } = useProgramSettings();
  const labels = useCategoryLabels();
  const applications = useMemo(() => apps.data ?? [], [apps.data]);
  const repayments = reps.data ?? [];

  const eligibility = useMemo(() => {
    const p = (profile ?? null) as EligibilityProfile | null;
    if (!p) return { eligible: false, reason: 'Checking eligibility' };
    if (p.role === 'dpa' || p.role === 'fleet_master') return { eligible: true, reason: 'Eligible' };
    const joined = p.contract_start_date || p.join_date || p.created_at;
    if (!joined) return { eligible: false, reason: 'Join date not set' };
    const eligibleOn = addDays(new Date(joined), settings.eligibility_service_days);
    const daysLeft = differenceInDays(eligibleOn, new Date());
    if (daysLeft > 0) return { eligible: false, reason: `Eligible from ${format(eligibleOn, 'dd MMM yyyy')} (${daysLeft} days)` };
    return { eligible: true, reason: 'Eligible' };
  }, [profile, settings.eligibility_service_days]);

  const openApps = applications
    .filter((a) => OPEN_FOR_APPLICANT.includes(a.status))
    .sort((a, b) => Number(b.status === 'returned' || b.status === 'draft') - Number(a.status === 'returned' || a.status === 'draft'));
  const historyApps = applications.filter((a) => HISTORY.includes(a.status));
  const closedOther = applications.filter((a) => ['rejected', 'cancelled'].includes(a.status));
  const obligations = repayments.reduce((s, r) => s + r.remaining_obligation_usd, 0);

  const loading = apps.isLoading || reps.isLoading || stats.isLoading;
  const error = apps.error ?? reps.error ?? stats.error;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="My training"
          description="Your course applications, completed courses and reimbursements."
          actions={
            eligibility.eligible ? (
              <StatusPill tone="ok" label="Eligible to apply" icon={CheckCircle} />
            ) : (
              <StatusPill tone="warn" label={eligibility.reason} icon={Clock} />
            )
          }
        />

        {loading ? (
          <PageLoading variant="tiles" rows={4} label="Loading your training" />
        ) : error ? (
          <PageError
            error={error}
            title="Your training could not be loaded"
            onRetry={() => {
              void apps.refetch();
              void reps.refetch();
              void stats.refetch();
            }}
          />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <KpiTile label="Active applications" icon={ClipboardList} value={stats.data?.activeApps ?? 0} zeroLabel="None in progress" />
              <KpiTile label="Completed courses" icon={CheckCircle} value={stats.data?.completedCourses ?? 0} zeroLabel="None yet" />
              <KpiTile label="Reimbursed" icon={DollarSign} textValue value={`$${(stats.data?.totalReimbursed ?? 0).toLocaleString('en-GB')}`} />
              <KpiTile
                label="Outstanding obligations"
                icon={AlertTriangle}
                textValue
                value={`$${obligations.toLocaleString('en-GB')}`}
                tone={repayments.length > 0 ? 'warn' : undefined}
              />
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <div className="space-y-6 lg:col-span-2">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                    <CardTitle className="flex items-center gap-2 text-base font-medium">
                      <ClipboardList className="h-4 w-4" aria-hidden="true" />
                      Applications
                    </CardTitle>
                    <Badge variant="secondary">{openApps.length}</Badge>
                  </CardHeader>
                  <CardContent>
                    {openApps.length === 0 ? (
                      <div className="py-8 text-center text-muted-foreground">
                        <GraduationCap className="mx-auto mb-2 h-12 w-12 opacity-50" aria-hidden="true" />
                        <p>No applications in progress</p>
                        <Button variant="outline" size="sm" className="mt-3 min-h-11" asChild>
                          <Link to="/development/catalogue">Browse the catalogue</Link>
                        </Button>
                      </div>
                    ) : (
                      <ul className="space-y-3">
                        {openApps.map((app) => (
                          <li key={app.id}>
                            <ApplicationCard
                              application={app}
                              categoryLabel={labels[app.category] ?? CATEGORY_CONFIG[app.category]?.label ?? app.category}
                              onView={() => setSelectedApp(app)}
                              onClaim={EXPENSE_OPEN.includes(app.status) ? () => setExpenseApp(app) : undefined}
                            />
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                    <CardTitle className="flex items-center gap-2 text-base font-medium">
                      <BookOpen className="h-4 w-4" aria-hidden="true" />
                      Course history
                    </CardTitle>
                    <Badge variant="secondary">{historyApps.length}</Badge>
                  </CardHeader>
                  <CardContent>
                    {historyApps.length === 0 && closedOther.length === 0 ? (
                      <p className="py-6 text-center text-muted-foreground">No completed courses yet</p>
                    ) : (
                      <ul className="space-y-2">
                        {[...historyApps, ...closedOther].slice(0, 8).map((app) => (
                          <li key={app.id}>
                            <button
                              type="button"
                              onClick={() => setSelectedApp(app)}
                              className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg border border-input p-3 text-left hover:border-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              <span className="min-w-0">
                                <span className="block truncate text-sm font-medium">{app.course_name}</span>
                                <span className="mt-1 flex flex-wrap items-center gap-2">
                                  <CategoryBadge category={app.category} label={labels[app.category]} />
                                  {app.course_end_date ? (
                                    <span className="text-xs text-muted-foreground">{format(new Date(app.course_end_date), 'MMM yyyy')}</span>
                                  ) : null}
                                </span>
                              </span>
                              <StatusPill domain="training_application" status={app.status} size="sm" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-6">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base font-medium">Quick actions</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <Button variant="outline" size="sm" className="min-h-11 w-full justify-start" asChild>
                      <Link to="/development/catalogue">
                        <BookOpen className="mr-2 h-4 w-4" aria-hidden="true" />
                        Browse the course catalogue
                      </Link>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="min-h-11 w-full justify-start"
                      disabled={!eligibility.eligible}
                      onClick={() => eligibility.eligible && setShowNewApp(true)}
                      title={!eligibility.eligible ? eligibility.reason : 'Start a new application'}
                    >
                      <FileText className="mr-2 h-4 w-4" aria-hidden="true" />
                      Start a new application
                    </Button>
                    <Button variant="outline" size="sm" className="min-h-11 w-full justify-start" asChild>
                      <Link to="/development/applications">
                        <DollarSign className="mr-2 h-4 w-4" aria-hidden="true" />
                        Applications and expenses
                      </Link>
                    </Button>
                  </CardContent>
                </Card>

                {repayments.length > 0 ? (
                  <Card className="border-amber/30">
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center gap-2 text-base font-medium text-amber">
                        <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                        Repayment obligations
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-3">
                        {repayments.map((rep) => {
                          const totalDays = Math.max(1, differenceInDays(new Date(rep.amortisation_end_date), new Date(rep.reimbursement_date)));
                          const elapsedDays = differenceInDays(new Date(), new Date(rep.reimbursement_date));
                          const progress = Math.min(100, Math.max(0, (elapsedDays / totalDays) * 100));
                          return (
                            <li key={rep.id} className="space-y-2 rounded-lg border border-input p-3">
                              <p className="text-sm font-medium">{rep.application?.course_name || 'Course'}</p>
                              <div className="flex justify-between text-xs text-muted-foreground">
                                <span>${rep.total_reimbursed_usd.toLocaleString('en-GB')} reimbursed</span>
                                <span>${rep.remaining_obligation_usd.toLocaleString('en-GB')} remaining</span>
                              </div>
                              <Progress value={progress} className="h-1.5" aria-label="Amortised so far" />
                              <p className="text-xs text-muted-foreground">Amortises {format(new Date(rep.amortisation_end_date), 'dd MMM yyyy')}</p>
                            </li>
                          );
                        })}
                      </ul>
                    </CardContent>
                  </Card>
                ) : null}
              </div>
            </div>
          </>
        )}
      </div>
      <ApplicationDetailModal open={!!selectedApp} onOpenChange={(open) => !open && setSelectedApp(null)} application={selectedApp} />
      <ExpenseClaimModal open={!!expenseApp} onOpenChange={(open) => !open && setExpenseApp(null)} application={expenseApp} />
      <NewApplicationFlow open={showNewApp} onOpenChange={setShowNewApp} />
    </DashboardLayout>
  );
}

function CategoryBadge({ category, label }: { category: DevCategory; label?: string }) {
  const config = CATEGORY_CONFIG[category];
  if (!config) return null;
  return (
    <Badge variant="outline" className={`${config.bgClass} ${config.textClass} border-0 text-xs`}>
      {label ?? config.label}
    </Badge>
  );
}

function ApplicationCard({
  application,
  categoryLabel,
  onView,
  onClaim,
}: {
  application: DevelopmentApplication;
  categoryLabel: string;
  onView: () => void;
  onClaim?: () => void;
}) {
  const statusConfig = APPLICATION_STATUS_CONFIG[application.status as ApplicationStatus];
  const currentStep = statusConfig?.step ?? 0;
  const needsYou = application.status === 'draft' || application.status === 'returned';

  return (
    <div className="rounded-lg border border-input p-4 transition-colors hover:border-primary/30">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="break-words font-medium">{application.course_name}</h4>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <CategoryBadge category={application.category} label={categoryLabel} />
            <StatusPill domain="training_application" status={application.status} size="sm" />
            <span className="type-mono text-muted-foreground">{application.application_number}</span>
          </div>
          {needsYou ? (
            <p className="mt-2 text-xs text-muted-foreground">
              {application.status === 'returned' ? 'Returned to you: open it to see what to change, then submit it again.' : 'Not submitted yet.'}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {application.estimated_total_usd != null ? (
            <span className="text-sm font-medium">${application.estimated_total_usd.toLocaleString('en-GB')}</span>
          ) : null}
          {onClaim ? (
            <Button variant="outline" size="sm" className="min-h-11" onClick={onClaim}>
              Claim expenses
            </Button>
          ) : null}
          <Button variant={needsYou ? 'default' : 'ghost'} size="sm" className="min-h-11" onClick={onView} aria-label={`Open ${application.course_name}`}>
            Open
          </Button>
        </div>
      </div>

      {currentStep > 0 ? (
        <ol className="mt-3 flex items-center gap-1" aria-label="Approval progress">
          {APPROVAL_STEPS.map((step, i) => {
            const stepIndex = i + 1;
            const isDone = currentStep > stepIndex;
            const isCurrent = currentStep === stepIndex;
            return (
              <li key={step} className="flex-1" aria-current={isCurrent ? 'step' : undefined}>
                <div className={`h-1.5 rounded-full ${isDone ? 'bg-success' : isCurrent ? 'bg-amber' : 'bg-muted'}`} />
                {isCurrent || i === 0 || i === APPROVAL_STEPS.length - 1 ? (
                  <p className={`type-caption mt-1 ${isCurrent ? 'font-medium text-amber' : 'text-muted-foreground'}`}>{step}</p>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : null}
    </div>
  );
}
