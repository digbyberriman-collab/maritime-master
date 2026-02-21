import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList, Plus, Eye, DollarSign } from 'lucide-react';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useMyApplications } from '@/modules/development/hooks/useDevelopment';
import { CATEGORY_CONFIG, APPLICATION_STATUS_CONFIG, type DevCategory, type ApplicationStatus } from '@/modules/development/constants';
import { format } from 'date-fns';
import ApplicationDetailModal from '@/modules/development/components/ApplicationDetailModal';
import ExpenseClaimModal from '@/modules/development/components/ExpenseClaimModal';

export default function DevelopmentApplications() {
  const { data: applications = [], isLoading } = useMyApplications();
  const [selectedApp, setSelectedApp] = useState<any>(null);
  const [expenseApp, setExpenseApp] = useState<any>(null);

  const activeApps = applications.filter((a) =>
    ['draft', 'submitted', 'hod_review', 'peer_review', 'captain_review', 'approved', 'enrolled'].includes(a.status)
  );
  const completedApps = applications.filter((a) => a.status === 'completed');
  const returnedApps = applications.filter((a) => ['returned', 'cancelled'].includes(a.status));

  const renderApp = (app: any) => {
    const catConfig = CATEGORY_CONFIG[app.category as DevCategory];
    const statusConfig = APPLICATION_STATUS_CONFIG[app.status as ApplicationStatus];
    const canExpense = ['approved', 'enrolled', 'completed', 'discretionary_approved'].includes(app.status);

    return (
      <Card key={app.id} className="hover:border-primary/30 transition-colors">
        <CardContent className="p-4">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h3 className="font-medium">{app.course_name}</h3>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <Badge variant="outline" className={`${catConfig.bgClass} ${catConfig.textClass} border-0 text-xs`}>
                  {catConfig.label}
                </Badge>
                <Badge variant="outline" className={`text-xs ${statusConfig?.color || ''}`}>
                  {statusConfig?.label || app.status}
                </Badge>
                <span className="text-xs text-muted-foreground">{app.application_number}</span>
              </div>
            </div>
            <div className="text-right flex flex-col items-end gap-1">
              {app.estimated_total_usd != null && (
                <p className="font-medium">${app.estimated_total_usd.toLocaleString()}</p>
              )}
              <p className="text-xs text-muted-foreground">
                {format(new Date(app.created_at), 'dd MMM yyyy')}
              </p>
              <div className="flex gap-1 mt-1">
                <Button variant="ghost" size="sm" onClick={() => setSelectedApp(app)}>
                  <Eye className="h-3.5 w-3.5 mr-1" /> View
                </Button>
                {canExpense && (
                  <Button variant="outline" size="sm" onClick={() => setExpenseApp(app)}>
                    <DollarSign className="h-3.5 w-3.5 mr-1" /> Expense
                  </Button>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">My Applications</h1>
            <p className="text-muted-foreground">
              {applications.length} application{applications.length !== 1 ? 's' : ''}
            </p>
          </div>
          <Button asChild>
            <Link to="/development/catalogue">
              <Plus className="h-4 w-4 mr-2" /> New Application
            </Link>
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center min-h-[300px]">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : applications.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <ClipboardList className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-1">No Applications Yet</h3>
              <p className="text-muted-foreground text-sm mb-4">
                Browse the course catalogue to start your first application.
              </p>
              <Button asChild>
                <Link to="/development/catalogue">Browse Catalogue</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Tabs defaultValue="active">
            <TabsList>
              <TabsTrigger value="active">Active ({activeApps.length})</TabsTrigger>
              <TabsTrigger value="completed">Completed ({completedApps.length})</TabsTrigger>
              <TabsTrigger value="returned">Returned ({returnedApps.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="active" className="space-y-3 mt-4">
              {activeApps.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No active applications</p>
              ) : activeApps.map(renderApp)}
            </TabsContent>
            <TabsContent value="completed" className="space-y-3 mt-4">
              {completedApps.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No completed applications</p>
              ) : completedApps.map(renderApp)}
            </TabsContent>
            <TabsContent value="returned" className="space-y-3 mt-4">
              {returnedApps.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No returned applications</p>
              ) : returnedApps.map(renderApp)}
            </TabsContent>
          </Tabs>
        )}
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
