import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Ship,
  UserPlus,
  FileText,
  AlertTriangle,
  CalendarDays,
  ChevronRight,
  ClipboardList,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useVessel } from '@/contexts/VesselContext';
import { useVesselDashboard } from '@/hooks/useVesselDashboard';
import { useRBACPermissions } from '@/hooks/useRBACPermissions';
import { useDashboardStore } from '@/store/dashboardStore';
import VesselHeader from '@/components/dashboard/VesselHeader';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { FleetFilter } from '@/components/dashboard/FleetFilter';
import { KPITiles } from '@/components/dashboard/KPITiles';
import { AlertsTriagePanel } from '@/components/dashboard/AlertsTriagePanel';
import { ComplianceSnapshot } from '@/components/dashboard/ComplianceSnapshot';
import { OperationsSnapshot } from '@/components/dashboard/OperationsSnapshot';
import { RecentActivityFeed } from '@/components/dashboard/RecentActivityFeed';
import { QuickActionsMenu } from '@/components/dashboard/QuickActionsMenu';
import { EmergencyContactsWidget } from '@/components/emergency/EmergencyContactsWidget';
import {
  AlertsWidget,
  CrewWidget,
  CertificatesWidget,
  MaintenanceWidget,
  DrillsWidget,
  TrainingWidget,
  ComplianceWidget,
  SignaturesWidget,
} from '@/components/dashboard/VesselDashboardWidgets';
import { useRecentIncidents } from '@/hooks/useCAPAAnalytics';
import { format } from 'date-fns';
import { getIncidentTypeColor } from '@/lib/incidentConstants';
import { getWidgetsForRole, type WidgetKey } from '@/types/dashboard';
import { cn } from '@/lib/utils';

const VesselDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { isAllVessels, selectedVessel, selectedVesselId, canAccessAllVessels } = useVessel();
  const { dashboardData, isLoading, refetch } = useVesselDashboard();
  const { canView, isInitialized } = useRBACPermissions();
  const { data: recentIncidents } = useRecentIncidents(5);

  // Initialize the dashboard store
  const {
    summary: storeSummary,
    isLoading: storeLoading,
    isRefreshing,
    error: storeError,
    lastRefreshed,
    initialize,
    refresh,
  } = useDashboardStore();

  const companyId = profile?.company_id;
  const userRole = profile?.role || 'crew';
  const visibleWidgets = getWidgetsForRole(userRole);

  // Initialize the store when component mounts
  useEffect(() => {
    if (companyId) {
      initialize(companyId, userRole, selectedVesselId, canAccessAllVessels);
    }
  }, [companyId, userRole, selectedVesselId, canAccessAllVessels, initialize]);

  // Role-based widget visibility
  const canViewAlerts = isInitialized ? canView('alerts') : true;
  const canViewCrew = isInitialized ? canView('crew') : true;
  const canViewCertificates = isInitialized ? canView('certificates') : true;
  const canViewMaintenance = isInitialized ? canView('maintenance') : true;
  const canViewDrills = isInitialized ? canView('drills') : true;
  const canViewTraining = isInitialized ? canView('training') : true;
  const canViewCompliance = isInitialized ? canView('audits') : true;
  const canViewForms = isInitialized ? canView('forms') : true;
  const canViewIncidents = isInitialized ? canView('incidents') : true;

  const canShowWidget = (widget: WidgetKey) => visibleWidgets.includes(widget);

  const handleRefresh = () => {
    refetch();
    refresh();
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Enhanced Header with Fleet Filter */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <VesselHeader
            data={dashboardData}
            isLoading={isLoading}
            isAllVessels={isAllVessels}
            onRefresh={handleRefresh}
            userName={profile?.first_name}
          />
          
          <div className="flex items-center gap-3 flex-wrap">
            {/* Fleet Filter (DPA/Fleet roles only) */}
            {canAccessAllVessels && <FleetFilter />}
            
            {/* Refresh Button */}
            <Button 
              variant="outline" 
              size="sm"
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              <RefreshCw className={cn('w-4 h-4 mr-2', isRefreshing && 'animate-spin')} />
              Refresh
            </Button>
            
            {/* Quick Actions Menu */}
            <QuickActionsMenu />
          </div>
        </div>

        {/* Last Updated */}
        {lastRefreshed && (
          <p className="text-xs text-muted-foreground -mt-4">
            Last updated: {lastRefreshed.toLocaleString()}
          </p>
        )}

        {/* KPI Widget Grid - Enhanced */}
        {storeSummary && (
          <KPITiles summary={storeSummary} visibleWidgets={visibleWidgets} />
        )}

        {/* Fallback KPI Widgets using existing hook */}
        {!storeSummary && (
          <>
            <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
              {canViewAlerts && (
                <AlertsWidget data={dashboardData} isLoading={isLoading} />
              )}
              {canViewCrew && (
                <CrewWidget data={dashboardData} isLoading={isLoading} />
              )}
              {canViewCertificates && (
                <CertificatesWidget data={dashboardData} isLoading={isLoading} />
              )}
              {canViewMaintenance && (
                <MaintenanceWidget data={dashboardData} isLoading={isLoading} />
              )}
            </div>

            {/* Secondary Widgets Row */}
            <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
              {canViewDrills && (
                <DrillsWidget data={dashboardData} isLoading={isLoading} />
              )}
              {canViewTraining && (
                <TrainingWidget data={dashboardData} isLoading={isLoading} />
              )}
              {canViewCompliance && (
                <ComplianceWidget data={dashboardData} isLoading={isLoading} />
              )}
              {canViewForms && (
                <SignaturesWidget data={dashboardData} isLoading={isLoading} />
              )}
            </div>
          </>
        )}

        {/* Emergency Contacts Widget - Always visible, top position */}
        {selectedVesselId && !isAllVessels && (
          <EmergencyContactsWidget vesselId={selectedVesselId} />
        )}

        {/* Main Widgets Grid - New Enhanced Panels */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column: Alerts & Compliance */}
          <div className="space-y-6">
            {canShowWidget('alerts') && <AlertsTriagePanel />}
            {canShowWidget('compliance') && <ComplianceSnapshot />}
          </div>
          
          {/* Right Column: Operations & Activity */}
          <div className="space-y-6">
            {canShowWidget('operations') && <OperationsSnapshot />}
            {canShowWidget('activity') && <RecentActivityFeed />}
          </div>
        </div>

        {/* Quick Actions */}
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Common tasks for this vessel</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {canViewIncidents && (
                <Button
                  className="gap-2"
                  variant="default"
                  onClick={() => navigate('/ism/incidents')}
                >
                  <AlertTriangle className="w-4 h-4" />
                  Report Incident
                </Button>
              )}
              {canViewForms && (
                <Button
                  className="gap-2"
                  variant="outline"
                  onClick={() => navigate('/ism/forms/templates')}
                >
                  <FileText className="w-4 h-4" />
                  Submit Form
                </Button>
              )}
              {canViewDrills && (
                <Button
                  className="gap-2"
                  variant="outline"
                  onClick={() => navigate('/ism/drills')}
                >
                  <CalendarDays className="w-4 h-4" />
                  Schedule Drill
                </Button>
              )}
              {canViewCrew && canAccessAllVessels && (
                <Button
                  className="gap-2"
                  variant="outline"
                  onClick={() => navigate('/operations/crew')}
                >
                  <UserPlus className="w-4 h-4" />
                  Manage Crew
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Recent Incidents */}
        {canViewIncidents && recentIncidents && recentIncidents.length > 0 && (
          <Card className="shadow-card">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5" />
                  Recent Incidents
                </CardTitle>
                <CardDescription>Latest reported incidents</CardDescription>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1"
                onClick={() => navigate('/ism/incidents')}
              >
                View All <ChevronRight className="w-4 h-4" />
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {recentIncidents.slice(0, 5).map((incident) => (
                  <div
                    key={incident.id}
                    className="flex items-center justify-between py-2 border-b border-border last:border-0 cursor-pointer hover:bg-muted/50 -mx-2 px-2 rounded"
                    onClick={() => navigate(`/ism/incidents?id=${incident.id}`)}
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
            </CardContent>
          </Card>
        )}

        {/* Vessel-Specific Modules Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {/* ISM Module Card */}
          {canViewCompliance && (
            <Card
              className="cursor-pointer transition-all hover:shadow-md hover:border-primary/50"
              onClick={() => navigate('/ism')}
            >
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ClipboardList className="w-5 h-5 text-primary" />
                  ISM Compliance
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Forms, checklists, audits, drills and safety management
                </p>
              </CardContent>
            </Card>
          )}

          {/* Maintenance Module Card */}
          {canViewMaintenance && (
            <Card
              className="cursor-pointer transition-all hover:shadow-md hover:border-primary/50"
              onClick={() => navigate('/maintenance')}
            >
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Ship className="w-5 h-5 text-primary" />
                  Maintenance
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Equipment, tasks, defects and spare parts management
                </p>
              </CardContent>
            </Card>
          )}

          {/* Certificates Module Card */}
          {canViewCertificates && (
            <Card
              className="cursor-pointer transition-all hover:shadow-md hover:border-primary/50"
              onClick={() => navigate('/certificates')}
            >
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileText className="w-5 h-5 text-primary" />
                  Certificates
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Vessel and crew certification tracking
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default VesselDashboard;
