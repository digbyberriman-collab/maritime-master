import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Ship, Users, Activity, Anchor, Clock, ArrowRightLeft, FileCheck, AlertCircle, AlertTriangle, TrendingUp, Wrench, UserPlus, Plus, Shield, BookOpen, ClipboardCheck, Navigation, BarChart3, PieChart } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useVesselCount } from '@/modules/vessels/hooks/useVessels';
import { useCrewCount, useRecentCrewChanges, useCrew } from '@/modules/crew/hooks/useCrew';
import { useMandatoryDocumentsPending, useAcknowledgmentStats } from '@/modules/auth/hooks/useAcknowledgments';
import { useOverdueCAPAs, useRecentIncidents } from '@/modules/analytics/hooks/useCAPAAnalytics';
import { format } from 'date-fns';
import { getIncidentTypeColor } from '@/modules/incidents/constants';
import MaintenanceWidgets from '@/modules/dashboard/components/MaintenanceWidgets';
import CrewFormModal from '@/modules/crew/components/CrewFormModal';
import DPADashboard from './DPADashboard';
import DashboardGrid from '@/modules/dashboard/components/DashboardGrid';
import type { WidgetDefinition } from '@/modules/dashboard/hooks/useDashboardLayout';
import { DashboardFilterProvider } from '@/modules/dashboard/contexts/DashboardFilterContext';

const WIDGET_DEFS: WidgetDefinition[] = [
  { id: 'welcome', label: 'Welcome', description: 'Welcome card with role info', defaultOrder: 0, defaultVisible: true, defaultColSpan: 2 },
  { id: 'stats', label: 'Fleet Stats', description: 'Vessels, crew, system status', defaultOrder: 1, defaultVisible: true, defaultColSpan: 2 },
  { id: 'quick-links', label: 'Quick Navigation', description: 'Quick links to key modules', defaultOrder: 2, defaultVisible: true, defaultColSpan: 2 },
  { id: 'overdue-capas', label: 'Overdue CAPAs', description: 'Overdue corrective actions alert', defaultOrder: 3, defaultVisible: true, defaultColSpan: 1 },
  { id: 'recent-incidents', label: 'Recent Incidents', description: 'Latest reported incidents', defaultOrder: 4, defaultVisible: true, defaultColSpan: 1 },
  { id: 'pending-docs', label: 'Pending Acknowledgments', description: 'Documents requiring acknowledgment', defaultOrder: 5, defaultVisible: true, defaultColSpan: 1 },
  { id: 'ack-stats', label: 'Acknowledgment Status', description: 'Document acknowledgment progress', defaultOrder: 6, defaultVisible: true, defaultColSpan: 1 },
  { id: 'compliance-summary', label: 'Compliance Overview', description: 'Fleet compliance summary tiles', defaultOrder: 7, defaultVisible: true, defaultColSpan: 2 },
  { id: 'crew-changes', label: 'Recent Crew Changes', description: 'Latest crew movements', defaultOrder: 8, defaultVisible: true, defaultColSpan: 1 },
  { id: 'maintenance', label: 'Maintenance', description: 'Maintenance overview widgets', defaultOrder: 9, defaultVisible: true, defaultColSpan: 1 },
  { id: 'activity', label: 'Recent Activity', description: 'Latest actions and updates', defaultOrder: 10, defaultVisible: true, defaultColSpan: 1 },
];

const Dashboard: React.FC = () => {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [isAddCrewModalOpen, setIsAddCrewModalOpen] = useState(false);

  const { data: vesselCount, isLoading: isVesselCountLoading } = useVesselCount();
  const { data: crewCount, isLoading: isCrewCountLoading, refetch: refetchCrewCount } = useCrewCount();
  const { data: recentChanges, isLoading: isChangesLoading, refetch: refetchRecentChanges } = useRecentCrewChanges(5);
  const { addCrewMember } = useCrew();
  const { data: pendingDocs } = useMandatoryDocumentsPending();
  const { data: ackStats } = useAcknowledgmentStats();
  const { data: overdueCapas } = useOverdueCAPAs();
  const { data: recentIncidents } = useRecentIncidents(5);

  if (profile?.role === 'dpa' || profile?.role === 'shore_management') {
    return <DPADashboard />;
  }

  const roleLabels: Record<string, string> = {
    master: 'Master', chief_engineer: 'Chief Engineer', chief_officer: 'Chief Officer',
    crew: 'Crew', dpa: 'DPA', shore_management: 'Shore Management',
  };

  const stats = [
    { title: 'Total Vessels', value: isVesselCountLoading ? '...' : String(vesselCount ?? 0), icon: Ship, description: 'In your fleet' },
    { title: 'Active Crew', value: isCrewCountLoading ? '...' : String(crewCount ?? 0), icon: Users, description: 'Team members' },
    { title: 'System Status', value: 'Online', icon: Activity, description: 'All systems operational', status: 'success' },
  ];

  const widgetContent: Record<string, React.ReactNode> = {
    welcome: (
      <Card className="gradient-primary text-primary-foreground border-0">
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary-foreground/20 flex items-center justify-center">
              <Anchor className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Welcome, {profile?.first_name}!</h1>
              <p className="text-primary-foreground/80">
                {profile?.role ? roleLabels[profile.role] : 'Loading...'} • Ready to manage your fleet
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    ),

    stats: (
      <div className="grid gap-4 md:grid-cols-3">
        {stats.map((stat) => (
          <Card key={stat.title} className="shadow-card hover:shadow-card-hover transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{stat.title}</CardTitle>
              <stat.icon className="w-5 h-5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold">{stat.value}</span>
                {stat.status === 'success' && <span className="inline-flex w-2 h-2 rounded-full bg-success animate-pulse-soft" />}
              </div>
              <p className="text-xs text-muted-foreground mt-1">{stat.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    ),

    'overdue-capas': overdueCapas && overdueCapas.length > 0 ? (
      <Card className="shadow-card border-destructive/50 bg-destructive/5">
        <CardContent className="pt-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-lg bg-destructive/20 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-destructive" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-destructive">Overdue Corrective Actions</h3>
              <p className="text-sm text-muted-foreground mt-1">{overdueCapas.length} CAPA{overdueCapas.length > 1 ? 's' : ''} past due date</p>
              <Button variant="outline" size="sm" className="mt-4 border-destructive text-destructive hover:bg-destructive/10" onClick={() => navigate('/reports/capa-tracker')}>View CAPAs</Button>
            </div>
          </div>
        </CardContent>
      </Card>
    ) : <></>,

    'recent-incidents': recentIncidents && recentIncidents.length > 0 ? (
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><AlertCircle className="w-5 h-5" />Recent Incidents</CardTitle>
          <CardDescription>Latest reported incidents</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {recentIncidents.map((incident) => (
              <div key={incident.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <div className="flex items-center gap-3">
                  <Badge className={getIncidentTypeColor(incident.incident_type)}>{incident.incident_type}</Badge>
                  <div>
                    <p className="text-sm font-medium">{incident.incident_number}</p>
                    <p className="text-xs text-muted-foreground">{(incident.vessel as { name: string })?.name || 'Unknown vessel'}</p>
                  </div>
                </div>
                <span className="text-xs text-muted-foreground">{format(new Date(incident.incident_date), 'dd MMM yyyy')}</span>
              </div>
            ))}
          </div>
          <Button variant="link" className="p-0 h-auto mt-3" onClick={() => navigate('/incidents')}>View all incidents →</Button>
        </CardContent>
      </Card>
    ) : <></>,

    'pending-docs': pendingDocs && pendingDocs.length > 0 ? (
      <Card className="shadow-card border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-900/20">
        <CardContent className="pt-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-lg bg-yellow-100 dark:bg-yellow-900/50 flex items-center justify-center">
              <AlertCircle className="w-6 h-6 text-yellow-600 dark:text-yellow-400" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-yellow-800 dark:text-yellow-200">Documents Requiring Your Acknowledgment</h3>
              <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">You have {pendingDocs.length} mandatory document{pendingDocs.length > 1 ? 's' : ''} pending acknowledgment.</p>
              <div className="flex flex-wrap gap-2 mt-3">
                {pendingDocs.slice(0, 3).map((doc) => (
                  <Badge key={doc.id} variant="outline" className="border-yellow-400 text-yellow-800 dark:text-yellow-200">{doc.title}</Badge>
                ))}
                {pendingDocs.length > 3 && <Badge variant="outline" className="border-yellow-400 text-yellow-800 dark:text-yellow-200">+{pendingDocs.length - 3} more</Badge>}
              </div>
              <Button variant="outline" size="sm" className="mt-4 border-yellow-400 text-yellow-800 hover:bg-yellow-100 dark:text-yellow-200 dark:hover:bg-yellow-900/50" onClick={() => navigate('/documents')}>View Documents</Button>
            </div>
          </div>
        </CardContent>
      </Card>
    ) : <></>,

    'ack-stats': ackStats && ackStats.length > 0 ? (
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><FileCheck className="w-5 h-5" />Document Acknowledgment Status</CardTitle>
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
                  <span className="text-sm text-muted-foreground ml-2">{stat.acknowledged}/{stat.totalCrew}</span>
                </div>
                <Progress value={stat.percentComplete} className="h-2" />
              </div>
            ))}
            {ackStats.length > 4 && <Button variant="link" className="p-0 h-auto" onClick={() => navigate('/acknowledgments')}>View all {ackStats.length} documents →</Button>}
          </div>
        </CardContent>
      </Card>
    ) : <></>,

    'crew-changes': (
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ArrowRightLeft className="w-5 h-5" />Recent Crew Changes</CardTitle>
          <CardDescription>Latest crew movements and assignments</CardDescription>
        </CardHeader>
        <CardContent>
          {isChangesLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : recentChanges && recentChanges.length > 0 ? (
            <div className="space-y-3">
              {recentChanges.map((change) => (
                <div key={change.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <div className="flex items-center gap-3">
                    <Badge variant={change.type === 'join' ? 'default' : 'secondary'}>{change.type === 'join' ? 'Joined' : 'Signed Off'}</Badge>
                    <div>
                      <p className="text-sm font-medium">{change.crewName}</p>
                      <p className="text-xs text-muted-foreground">{change.position} • {change.vesselName}</p>
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground">{format(new Date(change.createdAt), 'dd MMM yyyy')}</span>
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
    ),

    'quick-links': (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
        {[
          { label: 'Vessels', icon: Ship, path: '/vessels', color: 'text-blue-500' },
          { label: 'Crew', icon: Users, path: '/crew', color: 'text-emerald-500' },
          { label: 'Certificates', icon: Shield, path: '/certificates', color: 'text-amber-500' },
          { label: 'Incidents', icon: AlertCircle, path: '/incidents', color: 'text-red-500' },
          { label: 'Drills', icon: ClipboardCheck, path: '/drills', color: 'text-purple-500' },
          { label: 'Documents', icon: BookOpen, path: '/documents', color: 'text-cyan-500' },
        ].map((link) => (
          <Card
            key={link.label}
            className="shadow-card hover:shadow-card-hover transition-all cursor-pointer hover:scale-[1.02]"
            onClick={() => navigate(link.path)}
          >
            <CardContent className="pt-4 pb-3 flex flex-col items-center gap-2 text-center">
              <link.icon className={cn('w-6 h-6', link.color)} />
              <span className="text-xs font-medium">{link.label}</span>
            </CardContent>
          </Card>
        ))}
      </div>
    ),

    'compliance-summary': (
      <Card className="shadow-card">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><BarChart3 className="w-5 h-5" />Fleet Compliance Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Active Vessels', value: String(vesselCount ?? 0), trend: 'stable' },
              { label: 'Crew Onboard', value: String(crewCount ?? 0), trend: 'up' },
              { label: 'Overdue CAPAs', value: String(overdueCapas?.length ?? 0), trend: overdueCapas?.length ? 'alert' : 'good' },
              { label: 'Recent Incidents', value: String(recentIncidents?.length ?? 0), trend: recentIncidents?.length ? 'warn' : 'good' },
            ].map((item) => (
              <div key={item.label} className="text-center p-3 rounded-lg bg-muted/50">
                <p className="text-2xl font-bold">{item.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{item.label}</p>
                <span className={cn(
                  'inline-flex w-2 h-2 rounded-full mt-2',
                  item.trend === 'good' && 'bg-success',
                  item.trend === 'up' && 'bg-success',
                  item.trend === 'stable' && 'bg-primary',
                  item.trend === 'warn' && 'bg-warning',
                  item.trend === 'alert' && 'bg-destructive animate-pulse-soft',
                )} />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    ),

    maintenance: <MaintenanceWidgets />,

    activity: (
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Clock className="w-5 h-5" />Recent Activity</CardTitle>
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
    ),
  };

  return (
    <DashboardFilterProvider>
      <DashboardLayout>
        <div className="animate-fade-in">
          <DashboardGrid widgetDefs={WIDGET_DEFS}>
            {widgetContent}
          </DashboardGrid>

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
    </DashboardFilterProvider>
  );
};

export default Dashboard;
