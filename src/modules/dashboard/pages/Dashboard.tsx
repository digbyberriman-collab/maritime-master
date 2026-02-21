import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Ship, Users, Activity, Plus, Anchor, Clock, ArrowRightLeft, FileCheck, AlertCircle, AlertTriangle, TrendingUp, Wrench, UserPlus } from 'lucide-react';
import { useVesselCount } from '@/modules/vessels/hooks/useVessels';
import { useCrewCount, useRecentCrewChanges, useCrew } from '@/modules/crew/hooks/useCrew';
import { useMandatoryDocumentsPending, useAcknowledgmentStats } from '@/modules/auth/hooks/useAcknowledgments';
import { useOverdueCAPAs, useRecentIncidents } from '@/modules/analytics/hooks/useCAPAAnalytics';
import { useMaintenance } from '@/modules/maintenance/hooks/useMaintenance';
import { format } from 'date-fns';
import { getIncidentTypeColor } from '@/modules/incidents/constants';
import MaintenanceWidgets from '@/modules/dashboard/components/MaintenanceWidgets';
import CrewFormModal from '@/modules/crew/components/CrewFormModal';
import DPADashboard from './DPADashboard';

const Dashboard: React.FC = () => {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [isAddCrewModalOpen, setIsAddCrewModalOpen] = useState(false);
  
  // All hooks must be called before any conditional returns
  const { data: vesselCount, isLoading: isVesselCountLoading } = useVesselCount();
  const { data: crewCount, isLoading: isCrewCountLoading, refetch: refetchCrewCount } = useCrewCount();
  const { data: recentChanges, isLoading: isChangesLoading, refetch: refetchRecentChanges } = useRecentCrewChanges(5);
  const { addCrewMember } = useCrew();
  const { data: pendingDocs } = useMandatoryDocumentsPending();
  const { data: ackStats } = useAcknowledgmentStats();
  const { data: overdueCapas } = useOverdueCAPAs();
  const { data: recentIncidents } = useRecentIncidents(5);

  // Show DPA Dashboard for DPA and Shore Management users
  if (profile?.role === 'dpa' || profile?.role === 'shore_management') {
    return <DPADashboard />;
  }

  const roleLabels: Record<string, string> = {
    master: 'Master',
    chief_engineer: 'Chief Engineer',
    chief_officer: 'Chief Officer',
    crew: 'Crew',
    dpa: 'DPA',
    shore_management: 'Shore Management',
  };

  const stats = [
    {
      title: 'Total Vessels',
      value: isVesselCountLoading ? '...' : String(vesselCount ?? 0),
      icon: Ship,
      description: 'In your fleet',
    },
    {
      title: 'Active Crew',
      value: isCrewCountLoading ? '...' : String(crewCount ?? 0),
      icon: Users,
      description: 'Team members',
    },
    {
      title: 'System Status',
      value: 'Online',
      icon: Activity,
      description: 'All systems operational',
      status: 'success',
    },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Welcome card */}
        <Card className="gradient-primary text-primary-foreground border-0">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-primary-foreground/20 flex items-center justify-center">
                <Anchor className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">
                  Welcome, {profile?.first_name}!
                </h1>
                <p className="text-primary-foreground/80">
                  {profile?.role ? roleLabels[profile.role] : 'Loading...'} • Ready to manage your fleet
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stats grid */}
        <div className="grid gap-4 md:grid-cols-3">
          {stats.map((stat) => (
            <Card key={stat.title} className="shadow-card hover:shadow-card-hover transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.title}
                </CardTitle>
                <stat.icon className="w-5 h-5 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-bold">{stat.value}</span>
                  {stat.status === 'success' && (
                    <span className="inline-flex w-2 h-2 rounded-full bg-success animate-pulse-soft" />
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">{stat.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Quick actions */}
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Get started with common tasks</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              <Button 
                className="gap-2 bg-primary hover:bg-primary/90" 
                onClick={() => setIsAddCrewModalOpen(true)}
              >
                <UserPlus className="w-4 h-4" />
                Add Crew Member
              </Button>
              <Button className="gap-2" onClick={() => navigate('/vessels')}>
                <Plus className="w-4 h-4" />
                Add Vessel
              </Button>
              <Button variant="outline" className="gap-2" onClick={() => navigate('/crew')}>
                <Users className="w-4 h-4" />
                Manage Crew
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Overdue CAPAs Alert */}
        {overdueCapas && overdueCapas.length > 0 && (
          <Card className="shadow-card border-destructive/50 bg-destructive/5">
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-lg bg-destructive/20 flex items-center justify-center">
                  <AlertTriangle className="w-6 h-6 text-destructive" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-destructive">
                    Overdue Corrective Actions
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    {overdueCapas.length} CAPA{overdueCapas.length > 1 ? 's' : ''} past due date
                  </p>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="mt-4 border-destructive text-destructive hover:bg-destructive/10"
                    onClick={() => navigate('/reports/capa-tracker')}
                  >
                    View CAPAs
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Recent Incidents */}
        {recentIncidents && recentIncidents.length > 0 && (
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5" />
                Recent Incidents
              </CardTitle>
              <CardDescription>Latest reported incidents</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {recentIncidents.map((incident) => (
                  <div
                    key={incident.id}
                    className="flex items-center justify-between py-2 border-b border-border last:border-0"
                  >
                    <div className="flex items-center gap-3">
                      <Badge className={getIncidentTypeColor(incident.incident_type)}>
                        {incident.incident_type}
                      </Badge>
                      <div>
                        <p className="text-sm font-medium">{incident.incident_number}</p>
                        <p className="text-xs text-muted-foreground">
                          {(incident.vessel as { name: string })?.name || 'Unknown vessel'}
                        </p>
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(incident.incident_date), 'dd MMM yyyy')}
                    </span>
                  </div>
                ))}
              </div>
              <Button 
                variant="link" 
                className="p-0 h-auto mt-3"
                onClick={() => navigate('/incidents')}
              >
                View all incidents →
              </Button>
            </CardContent>
          </Card>
        )}
        {/* Pending Acknowledgments Alert */}
        {pendingDocs && pendingDocs.length > 0 && (
          <Card className="shadow-card border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-900/20">
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-lg bg-yellow-100 dark:bg-yellow-900/50 flex items-center justify-center">
                  <AlertCircle className="w-6 h-6 text-yellow-600 dark:text-yellow-400" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-yellow-800 dark:text-yellow-200">
                    Documents Requiring Your Acknowledgment
                  </h3>
                  <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                    You have {pendingDocs.length} mandatory document{pendingDocs.length > 1 ? 's' : ''} pending acknowledgment.
                  </p>
                  <div className="flex flex-wrap gap-2 mt-3">
                    {pendingDocs.slice(0, 3).map((doc) => (
                      <Badge key={doc.id} variant="outline" className="border-yellow-400 text-yellow-800 dark:text-yellow-200">
                        {doc.title}
                      </Badge>
                    ))}
                    {pendingDocs.length > 3 && (
                      <Badge variant="outline" className="border-yellow-400 text-yellow-800 dark:text-yellow-200">
                        +{pendingDocs.length - 3} more
                      </Badge>
                    )}
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="mt-4 border-yellow-400 text-yellow-800 hover:bg-yellow-100 dark:text-yellow-200 dark:hover:bg-yellow-900/50"
                    onClick={() => navigate('/documents')}
                  >
                    View Documents
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Acknowledgment Statistics */}
        {ackStats && ackStats.length > 0 && (
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileCheck className="w-5 h-5" />
                Document Acknowledgment Status
              </CardTitle>
              <CardDescription>Mandatory documents acknowledgment progress across crew</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {ackStats.slice(0, 4).map((stat) => (
                  <div key={stat.documentId} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{stat.documentTitle}</p>
                        <p className="text-xs text-muted-foreground">{stat.documentNumber}</p>
                      </div>
                      <span className="text-sm text-muted-foreground ml-2">
                        {stat.acknowledged}/{stat.totalCrew}
                      </span>
                    </div>
                    <Progress value={stat.percentComplete} className="h-2" />
                  </div>
                ))}
                {ackStats.length > 4 && (
                  <Button 
                    variant="link" 
                    className="p-0 h-auto"
                    onClick={() => navigate('/acknowledgments')}
                  >
                    View all {ackStats.length} documents →
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Recent Crew Changes */}
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ArrowRightLeft className="w-5 h-5" />
              Recent Crew Changes
            </CardTitle>
            <CardDescription>Latest crew movements and assignments</CardDescription>
          </CardHeader>
          <CardContent>
            {isChangesLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading...</div>
            ) : recentChanges && recentChanges.length > 0 ? (
              <div className="space-y-3">
                {recentChanges.map((change) => (
                  <div
                    key={change.id}
                    className="flex items-center justify-between py-2 border-b border-border last:border-0"
                  >
                    <div className="flex items-center gap-3">
                      <Badge variant={change.type === 'join' ? 'default' : 'secondary'}>
                        {change.type === 'join' ? 'Joined' : 'Signed Off'}
                      </Badge>
                      <div>
                        <p className="text-sm font-medium">{change.crewName}</p>
                        <p className="text-xs text-muted-foreground">
                          {change.position} • {change.vesselName}
                        </p>
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(change.createdAt), 'dd MMM yyyy')}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <ArrowRightLeft className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No recent crew changes</p>
                <p className="text-sm">Crew movements will appear here</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Maintenance Widgets */}
        <MaintenanceWidgets />

        {/* Recent Activity */}
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Recent Activity
            </CardTitle>
            <CardDescription>Your latest actions and updates</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8 text-muted-foreground">
              <Activity className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No recent activity</p>
              <p className="text-sm">Your activity will appear here</p>
            </div>
          </CardContent>
        </Card>

        {/* Add Crew Member Modal */}
        <CrewFormModal
          isOpen={isAddCrewModalOpen}
          onClose={() => setIsAddCrewModalOpen(false)}
          onSubmit={async (data) => {
            await addCrewMember.mutateAsync(data);
            refetchCrewCount();
            refetchRecentChanges();
          }}
          isLoading={addCrewMember.isPending}
        />
      </div>
    </DashboardLayout>
  );
};

export default Dashboard;
