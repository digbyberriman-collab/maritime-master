import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { 
  Anchor, 
  Bell,
  Settings as SettingsIcon,
  User,
  UserPlus,
  Plus,
  Ship,
  Clock,
  ArrowRightLeft,
  Activity
} from 'lucide-react';
import { useVesselCount, useVessels } from '@/hooks/useVessels';
import { useCrewCount, useRecentCrewChanges, useCrew } from '@/hooks/useCrew';
import { useOverdueCAPAs, useRecentIncidents } from '@/hooks/useCAPAAnalytics';
import { format } from 'date-fns';
import AlertKPITiles from '@/components/dashboard/AlertKPITiles';
import RedRoomAlerts, { RedAlert } from '@/components/dashboard/RedRoomAlerts';
import AlertSections from '@/components/dashboard/AlertSections';
import VesselFilter from '@/components/dashboard/VesselFilter';
import CrewFormModal from '@/components/crew/CrewFormModal';

const DPADashboard: React.FC = () => {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [isAddCrewModalOpen, setIsAddCrewModalOpen] = useState(false);
  
  // Vessel filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedVesselIds, setSelectedVesselIds] = useState<string[]>([]);
  const [alertFilters, setAlertFilters] = useState({
    red: true,
    orange: true,
    yellow: true,
    green: false,
  });
  
  const { data: vesselCount } = useVesselCount();
  const { vessels } = useVessels();
  const { data: crewCount, refetch: refetchCrewCount } = useCrewCount();
  const { data: recentChanges, refetch: refetchRecentChanges } = useRecentCrewChanges(5);
  const { addCrewMember } = useCrew();
  const { data: overdueCapas } = useOverdueCAPAs();
  const { data: recentIncidents } = useRecentIncidents(5);

  const roleLabels: Record<string, string> = {
    master: 'Master',
    chief_engineer: 'Chief Engineer',
    chief_officer: 'Chief Officer',
    crew: 'Crew',
    dpa: 'DPA',
    shore_management: 'Shore Management',
  };

  // Mock alert data - in production these would come from hooks
  const redAlerts: RedAlert[] = recentIncidents
    ?.filter(i => (i.severity_actual ?? 0) >= 4)
    .slice(0, 3)
    .map(incident => ({
      id: incident.id,
      type: 'incident' as const,
      vesselName: (incident.vessel as { name: string })?.name || 'Unknown',
      title: incident.incident_number,
      description: incident.description || 'High-severity incident reported',
      timestamp: incident.incident_date,
      severity: 'high' as const,
      status: 'pending' as const,
    })) || [];

  // Add overdue CAPAs to red alerts
  if (overdueCapas?.length) {
    overdueCapas.slice(0, 2).forEach(capa => {
      redAlerts.push({
        id: capa.id,
        type: 'capa',
        vesselName: 'Fleet',
        title: capa.action_number,
        description: `Critical CAPA overdue: ${capa.description}`,
        timestamp: capa.due_date,
        severity: 'high',
        status: 'pending',
      });
    });
  }

  const handleViewAlert = (alert: RedAlert) => {
    if (alert.type === 'incident') {
      navigate(`/compliance?incident=${alert.id}`);
    } else if (alert.type === 'capa') {
      navigate('/reports/capa-tracker');
    }
  };

  const handleAcknowledgeAlert = (alert: RedAlert) => {
    console.log('Acknowledging alert:', alert.id);
    // In production, this would call an API to acknowledge
  };

  const handleVesselToggle = (vesselId: string) => {
    setSelectedVesselIds(prev => 
      prev.includes(vesselId) 
        ? prev.filter(id => id !== vesselId)
        : [...prev, vesselId]
    );
  };

  const vesselList = vessels?.map(v => ({
    id: v.id,
    name: v.name,
    status: v.status,
  })) || [];

  return (
    <DashboardLayout>
      <div className="animate-fade-in">

        {/* Main Content */}
        <div className="space-y-6">
          {/* Welcome Header */}
          <Card className="gradient-primary text-primary-foreground border-0">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-primary-foreground/20 flex items-center justify-center">
                    <Anchor className="w-6 h-6" />
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold">
                      Welcome, {profile?.first_name}!
                    </h1>
                    <p className="text-primary-foreground/80">
                      {profile?.role ? roleLabels[profile.role] : 'Loading...'} • DPA Portal
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="secondary" size="icon">
                    <Bell className="w-4 h-4" />
                  </Button>
                  <Button variant="secondary" size="icon">
                    <SettingsIcon className="w-4 h-4" />
                  </Button>
                  <Button variant="secondary" size="icon">
                    <User className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* KPI Tiles */}
          <AlertKPITiles
            redAlerts={redAlerts.length}
            orangeAlerts={overdueCapas?.length || 0}
            yellowAlerts={5} // Mock - would come from cert expiry hook
            greenItems={45}
            activeCrew={crewCount || 0}
            activeVessels={vesselCount || 0}
            onTileClick={(type) => {
              switch (type) {
                case 'red':
                  // Scroll to red room
                  break;
                case 'orange':
                  navigate('/reports/capa-tracker');
                  break;
                case 'yellow':
                  navigate('/certificates/alerts');
                  break;
                case 'crew':
                  navigate('/operations/crew');
                  break;
                case 'vessels':
                  navigate('/vessels');
                  break;
              }
            }}
          />

          {/* Red Room */}
          <RedRoomAlerts
            alerts={redAlerts}
            onView={handleViewAlert}
            onAcknowledge={handleAcknowledgeAlert}
            onAssign={(alert) => console.log('Assign:', alert.id)}
            onViewAll={() => navigate('/compliance')}
          />

          {/* Orange and Yellow Sections */}
          <AlertSections
            orangeAlerts={{
              overdueCAPAs: overdueCapas?.length || 0,
              overdueTraining: 2,
              drillGaps: 2,
            }}
            yellowAlerts={{
              expiringCerts: 5,
              upcomingAudits: 4,
              incompleteMeetings: 3,
            }}
            onNavigate={navigate}
          />

          {/* Quick Actions */}
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
                <Button variant="outline" className="gap-2" onClick={() => navigate('/fleet-map')}>
                  <Ship className="w-4 h-4" />
                  Fleet Map
                </Button>
                <Button variant="outline" className="gap-2" onClick={() => navigate('/compliance')}>
                  Report Incident
                </Button>
              </div>
            </CardContent>
          </Card>

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
              {recentChanges && recentChanges.length > 0 ? (
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
        </div>
      </div>

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
    </DashboardLayout>
  );
};

export default DPADashboard;
