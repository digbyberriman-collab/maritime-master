import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart3, Users, DollarSign, BookOpen, TrendingUp, ClipboardList,
  CheckCircle, Clock, XCircle, Eye, Filter
} from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/contexts/AuthContext';
import { useFleetApplications, useFleetExpenses } from '@/hooks/useDevelopmentMutations';
import ApplicationDetailModal from '@/components/development/ApplicationDetailModal';
import {
  CATEGORY_CONFIG,
  APPLICATION_STATUS_CONFIG,
  type DevCategory,
  type ApplicationStatus,
} from '@/lib/developmentConstants';
import { format } from 'date-fns';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';

export default function DevelopmentAdmin() {
  const { profile } = useAuth();
  const fleetAppsConfig = useFleetApplications();
  const fleetExpensesConfig = useFleetExpenses();

  const { data: applications = [], isLoading: appsLoading } = useQuery(fleetAppsConfig);
  const { data: expenses = [], isLoading: expLoading } = useQuery(fleetExpensesConfig);

  const [selectedApp, setSelectedApp] = useState<any>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // Determine review capability
  const canReview = true; // Admin can review
  const getReviewStage = (status: string): 'hod' | 'peer' | 'captain' | null => {
    if (status === 'submitted' || status === 'hod_review') return 'hod';
    if (status === 'peer_review') return 'peer';
    if (status === 'captain_review') return 'captain';
    return null;
  };

  // Stats
  const stats = useMemo(() => {
    const pending = applications.filter((a: any) =>
      ['submitted', 'hod_review', 'peer_review', 'captain_review'].includes(a.status)
    ).length;
    const approved = applications.filter((a: any) =>
      ['approved', 'enrolled', 'completed', 'discretionary_approved'].includes(a.status)
    ).length;
    const totalSpend = expenses
      .filter((e: any) => ['approved', 'paid', 'partially_paid'].includes(e.status))
      .reduce((sum: number, e: any) => sum + (e.approved_reimbursement_usd || e.actual_total_usd || 0), 0);
    const pendingExpenses = expenses
      .filter((e: any) => ['submitted', 'under_review'].includes(e.status)).length;

    return { pending, approved, totalSpend, pendingExpenses, total: applications.length };
  }, [applications, expenses]);

  // Charts data
  const categoryData = useMemo(() => {
    const counts: Record<string, number> = {};
    applications.forEach((a: any) => {
      const cat = a.category as string;
      counts[cat] = (counts[cat] || 0) + 1;
    });
    return Object.entries(counts).map(([key, value]) => ({
      name: CATEGORY_CONFIG[key as DevCategory]?.label || key,
      value,
      color: CATEGORY_CONFIG[key as DevCategory]?.color || 'hsl(var(--muted))',
    }));
  }, [applications]);

  const statusData = useMemo(() => {
    const counts: Record<string, number> = {};
    applications.forEach((a: any) => {
      const label = APPLICATION_STATUS_CONFIG[a.status as ApplicationStatus]?.label || a.status;
      counts[label] = (counts[label] || 0) + 1;
    });
    return Object.entries(counts).map(([name, count]) => ({ name, count }));
  }, [applications]);

  // Filtered applications
  const filteredApps = useMemo(() => {
    return applications.filter((a: any) => {
      if (statusFilter !== 'all' && a.status !== statusFilter) return false;
      if (categoryFilter !== 'all' && a.category !== categoryFilter) return false;
      return true;
    });
  }, [applications, statusFilter, categoryFilter]);

  const isLoading = appsLoading || expLoading;

  const PIE_COLORS = ['hsl(var(--primary))', 'hsl(var(--info))', 'hsl(var(--success))', 'hsl(var(--amber))'];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Crew Development Admin</h1>
          <p className="text-muted-foreground">
            Fleet-wide development overview, applications pipeline, and expense tracking
          </p>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Total Applications</p>
                  <p className="text-2xl font-bold mt-1">{stats.total}</p>
                </div>
                <div className="p-2 rounded-lg bg-muted text-muted-foreground">
                  <ClipboardList className="h-4 w-4" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-amber/30">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Pending Review</p>
                  <p className="text-2xl font-bold mt-1">{stats.pending}</p>
                </div>
                <div className="p-2 rounded-lg bg-amber/10 text-amber">
                  <Clock className="h-4 w-4" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">YTD Spend</p>
                  <p className="text-2xl font-bold mt-1">${stats.totalSpend.toLocaleString()}</p>
                </div>
                <div className="p-2 rounded-lg bg-muted text-muted-foreground">
                  <DollarSign className="h-4 w-4" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Pending Expenses</p>
                  <p className="text-2xl font-bold mt-1">{stats.pendingExpenses}</p>
                </div>
                <div className="p-2 rounded-lg bg-muted text-muted-foreground">
                  <TrendingUp className="h-4 w-4" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Applications by Category</CardTitle>
            </CardHeader>
            <CardContent>
              {categoryData.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={categoryData}
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      dataKey="value"
                      label={({ name, value }) => `${name}: ${value}`}
                    >
                      {categoryData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-center text-muted-foreground py-8">No data</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Applications by Status</CardTitle>
            </CardHeader>
            <CardContent>
              {statusData.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={statusData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-20} textAnchor="end" height={60} />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-center text-muted-foreground py-8">No data</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Applications Pipeline */}
        <Tabs defaultValue="pipeline">
          <TabsList>
            <TabsTrigger value="pipeline">Application Pipeline</TabsTrigger>
            <TabsTrigger value="expenses">Expense Claims</TabsTrigger>
          </TabsList>

          <TabsContent value="pipeline" className="space-y-4 mt-4">
            <div className="flex items-center gap-3">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="submitted">Submitted</SelectItem>
                  <SelectItem value="hod_review">HOD Review</SelectItem>
                  <SelectItem value="peer_review">Peer Review</SelectItem>
                  <SelectItem value="captain_review">Captain Review</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="enrolled">Enrolled</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="returned">Returned</SelectItem>
                </SelectContent>
              </Select>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {Object.entries(CATEGORY_CONFIG).map(([key, config]) => (
                    <SelectItem key={key} value={key}>{config.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              </div>
            ) : filteredApps.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No applications match your filters</p>
            ) : (
              <div className="space-y-2">
                {filteredApps.map((app: any) => {
                  const catConfig = CATEGORY_CONFIG[app.category as DevCategory];
                  const statusConfig = APPLICATION_STATUS_CONFIG[app.status as ApplicationStatus];
                  const crewName = app.crew_member
                    ? `${app.crew_member.first_name} ${app.crew_member.last_name}`
                    : 'Unknown';

                  return (
                    <Card key={app.id} className="hover:border-primary/30 transition-colors">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div>
                            <h3 className="font-medium text-sm">{app.course_name}</h3>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              <span className="text-xs text-muted-foreground">{crewName}</span>
                              {app.vessel?.name && (
                                <span className="text-xs text-muted-foreground">• {app.vessel.name}</span>
                              )}
                              <Badge variant="outline" className={`${catConfig?.bgClass} ${catConfig?.textClass} border-0 text-xs`}>
                                {catConfig?.label}
                              </Badge>
                              <Badge variant="outline" className={`text-xs ${statusConfig?.color || ''}`}>
                                {statusConfig?.label || app.status}
                              </Badge>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {app.estimated_total_usd != null && (
                              <span className="text-sm font-medium">${app.estimated_total_usd.toLocaleString()}</span>
                            )}
                            <Button variant="ghost" size="sm" onClick={() => setSelectedApp(app)}>
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="expenses" className="space-y-3 mt-4">
            {expenses.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No expense claims submitted</p>
            ) : (
              expenses.map((exp: any) => (
                <Card key={exp.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-medium text-sm">{exp.application?.course_name || 'Unknown Course'}</h3>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className="text-xs text-muted-foreground">
                            {exp.crew_member ? `${exp.crew_member.first_name} ${exp.crew_member.last_name}` : ''}
                          </span>
                          <Badge variant="outline" className="text-xs">
                            {exp.status}
                          </Badge>
                          {exp.is_split_payment && (
                            <Badge variant="outline" className="text-xs bg-amber/10 text-amber border-0">
                              Split Payment
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-medium">${(exp.actual_total_usd || 0).toLocaleString()}</p>
                        {exp.approved_reimbursement_usd != null && (
                          <p className="text-xs text-success">
                            Approved: ${exp.approved_reimbursement_usd.toLocaleString()}
                          </p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>

      <ApplicationDetailModal
        open={!!selectedApp}
        onOpenChange={(open) => !open && setSelectedApp(null)}
        application={selectedApp}
        canReview={canReview}
        reviewStage={selectedApp ? getReviewStage(selectedApp.status) : null}
      />
    </DashboardLayout>
  );
}
