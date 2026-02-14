import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  GraduationCap, BookOpen, ClipboardList, DollarSign,
  CheckCircle, Clock, ChevronRight, AlertTriangle, Loader2, FileText
} from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useAuth } from '@/contexts/AuthContext';
import { useMyApplications, useMyRepayments, useDevelopmentStats } from '@/hooks/useDevelopment';
import {
  CATEGORY_CONFIG,
  APPLICATION_STATUS_CONFIG,
  APPROVAL_STEPS,
  ELIGIBILITY_MONTHS,
  type DevCategory,
  type ApplicationStatus,
} from '@/lib/developmentConstants';
import { differenceInDays, differenceInMonths, addMonths, format } from 'date-fns';
import ApplicationDetailModal from '@/components/development/ApplicationDetailModal';
import ExpenseClaimModal from '@/components/development/ExpenseClaimModal';

export default function MyDevelopment() {
  const [selectedApp, setSelectedApp] = useState<any>(null);
  const [expenseApp, setExpenseApp] = useState<any>(null);
  const { user, profile } = useAuth();
  const { data: applications = [], isLoading: appsLoading } = useMyApplications();
  const { data: repayments = [], isLoading: repLoading } = useMyRepayments();
  const { data: stats, isLoading: statsLoading } = useDevelopmentStats();

  // Calculate eligibility
  const eligibility = useMemo(() => {
    if (!profile) return { eligible: false, reason: 'Loading...', daysRemaining: 0 };

    const joinDate = (profile as any).join_date || (profile as any).created_at;
    if (!joinDate) return { eligible: false, reason: 'Join date not set', daysRemaining: 0 };

    const eligibilityDate = addMonths(new Date(joinDate), ELIGIBILITY_MONTHS);
    const today = new Date();
    const daysRemaining = differenceInDays(eligibilityDate, today);

    if (daysRemaining > 0) {
      return {
        eligible: false,
        reason: `${daysRemaining} days until eligible (${format(eligibilityDate, 'dd MMM yyyy')})`,
        daysRemaining,
      };
    }

    return { eligible: true, reason: 'Eligible', daysRemaining: 0 };
  }, [profile]);

  const activeApps = applications.filter((a) =>
    ['submitted', 'hod_review', 'peer_review', 'captain_review', 'approved', 'enrolled'].includes(a.status)
  );

  const completedApps = applications.filter((a) => a.status === 'completed');

  const isLoading = appsLoading || repLoading || statsLoading;

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">My Development</h1>
            <p className="text-muted-foreground">
              Track your courses, applications, and reimbursements
            </p>
          </div>
          <div className="flex items-center gap-2">
            {eligibility.eligible ? (
              <Badge className="bg-success/10 text-success border-success/30 text-sm px-3 py-1">
                <CheckCircle className="h-3.5 w-3.5 mr-1.5" /> Eligible
              </Badge>
            ) : (
              <Badge variant="outline" className="bg-amber/10 text-amber border-amber/30 text-sm px-3 py-1">
                <Clock className="h-3.5 w-3.5 mr-1.5" /> {eligibility.reason}
              </Badge>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Active Applications" value={stats?.activeApps || 0} icon={ClipboardList} />
          <StatCard label="Completed Courses" value={stats?.completedCourses || 0} icon={CheckCircle} />
          <StatCard
            label="Total Reimbursed"
            value={`$${(stats?.totalReimbursed || 0).toLocaleString()}`}
            icon={DollarSign}
          />
          <StatCard
            label="Outstanding Obligations"
            value={`$${repayments.reduce((s, r) => s + r.remaining_obligation_usd, 0).toLocaleString()}`}
            icon={AlertTriangle}
            alert={repayments.length > 0}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Active Applications */}
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-base font-medium flex items-center gap-2">
                  <ClipboardList className="h-4 w-4" />
                  Active Applications
                </CardTitle>
                <Badge variant="secondary">{activeApps.length}</Badge>
              </CardHeader>
              <CardContent>
                {activeApps.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <GraduationCap className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No active applications</p>
                    <Button variant="outline" size="sm" className="mt-3" asChild>
                      <Link to="/development/catalogue">Browse Catalogue</Link>
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {activeApps.map((app) => (
                      <ApplicationCard key={app.id} application={app} />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Course History */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-base font-medium flex items-center gap-2">
                  <BookOpen className="h-4 w-4" />
                  Course History
                </CardTitle>
                <Badge variant="secondary">{completedApps.length}</Badge>
              </CardHeader>
              <CardContent>
                {completedApps.length === 0 ? (
                  <p className="text-center py-6 text-muted-foreground">No completed courses yet</p>
                ) : (
                  <div className="space-y-2">
                    {completedApps.slice(0, 5).map((app) => (
                      <div
                        key={app.id}
                        className="flex items-center justify-between p-3 rounded-lg border"
                      >
                        <div>
                          <p className="font-medium text-sm">{app.course_name}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <CategoryBadge category={app.category as DevCategory} />
                            {app.course_end_date && (
                              <span className="text-xs text-muted-foreground">
                                {format(new Date(app.course_end_date), 'MMM yyyy')}
                              </span>
                            )}
                          </div>
                        </div>
                        <CheckCircle className="h-4 w-4 text-success" />
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Quick Actions */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-medium">Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button variant="outline" size="sm" className="w-full justify-start" asChild>
                  <Link to="/development/catalogue">
                    <BookOpen className="h-4 w-4 mr-2" />
                    Browse Course Catalogue
                  </Link>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start"
                  disabled={!eligibility.eligible}
                  asChild={eligibility.eligible}
                  title={!eligibility.eligible ? eligibility.reason : 'Start a new application'}
                >
                  {eligibility.eligible ? (
                    <Link to="/development/catalogue">
                      <FileText className="h-4 w-4 mr-2" />
                      Start New Application
                    </Link>
                  ) : (
                    <>
                      <FileText className="h-4 w-4 mr-2" />
                      Start New Application
                    </>
                  )}
                </Button>
                <Button variant="outline" size="sm" className="w-full justify-start" asChild>
                  <Link to="/development/applications">
                    <DollarSign className="h-4 w-4 mr-2" />
                    View Applications & Expenses
                  </Link>
                </Button>
              </CardContent>
            </Card>

            {/* Repayment Obligations */}
            {repayments.length > 0 && (
              <Card className="border-amber/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-medium flex items-center gap-2 text-amber">
                    <AlertTriangle className="h-4 w-4" />
                    Repayment Obligations
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {repayments.map((rep) => {
                      const totalDays = differenceInDays(
                        new Date(rep.amortisation_end_date),
                        new Date(rep.reimbursement_date)
                      );
                      const elapsedDays = differenceInDays(
                        new Date(),
                        new Date(rep.reimbursement_date)
                      );
                      const progress = Math.min(100, Math.max(0, (elapsedDays / totalDays) * 100));

                      return (
                        <div key={rep.id} className="p-3 rounded-lg border space-y-2">
                          <p className="text-sm font-medium">{rep.application?.course_name || 'Course'}</p>
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>${rep.total_reimbursed_usd.toLocaleString()} reimbursed</span>
                            <span>${rep.remaining_obligation_usd.toLocaleString()} remaining</span>
                          </div>
                          <Progress value={progress} className="h-1.5" />
                          <p className="text-xs text-muted-foreground">
                            Amortises: {format(new Date(rep.amortisation_end_date), 'dd MMM yyyy')}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
      <ApplicationDetailModal
        open={!!selectedApp}
        onOpenChange={(open) => !open && setSelectedApp(null)}
        application={selectedApp}
      />
      <ExpenseClaimModal
        open={!!expenseApp}
        onOpenChange={(open) => !open && setExpenseApp(null)}
        application={expenseApp}
      />
    </DashboardLayout>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  alert,
}: {
  label: string;
  value: number | string;
  icon: React.ElementType;
  alert?: boolean;
}) {
  return (
    <Card className={alert ? 'border-amber/30' : ''}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
          </div>
          <div className={`p-2 rounded-lg ${alert ? 'bg-amber/10 text-amber' : 'bg-muted text-muted-foreground'}`}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CategoryBadge({ category }: { category: DevCategory }) {
  const config = CATEGORY_CONFIG[category];
  return (
    <Badge variant="outline" className={`${config.bgClass} ${config.textClass} border-0 text-xs`}>
      {config.label}
    </Badge>
  );
}

function ApplicationCard({ application }: { application: any }) {
  const catConfig = CATEGORY_CONFIG[application.category as DevCategory];
  const statusConfig = APPLICATION_STATUS_CONFIG[application.status as ApplicationStatus];
  const currentStep = statusConfig?.step || 0;

  return (
    <div className="p-4 rounded-lg border hover:border-primary/30 transition-colors">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h4 className="font-medium">{application.course_name}</h4>
          <div className="flex items-center gap-2 mt-1">
            <CategoryBadge category={application.category as DevCategory} />
            <span className="text-xs text-muted-foreground">{application.application_number}</span>
          </div>
        </div>
        {application.estimated_total_usd != null && (
          <span className="text-sm font-medium">${application.estimated_total_usd.toLocaleString()}</span>
        )}
      </div>

      {/* Approval Stepper */}
      {currentStep >= 0 && (
        <div className="flex items-center gap-1 mt-3">
          {APPROVAL_STEPS.map((step, i) => {
            const stepIndex = i + 1;
            const isDone = currentStep > stepIndex;
            const isCurrent = currentStep === stepIndex;

            return (
              <div key={step} className="flex-1">
                <div
                  className={`h-1.5 rounded-full ${
                    isDone
                      ? 'bg-success'
                      : isCurrent
                      ? 'bg-amber'
                      : 'bg-muted'
                  }`}
                />
                {(isCurrent || i === 0 || i === APPROVAL_STEPS.length - 1) && (
                  <p className={`text-[10px] mt-1 ${isCurrent ? 'text-amber font-medium' : 'text-muted-foreground'}`}>
                    {step}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
