import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Anchor, Bell, Settings as SettingsIcon, User, Ship, Clock, ArrowRightLeft, Activity
} from 'lucide-react';
import { useVesselCount } from '@/modules/vessels/hooks/useVessels';
import { useCrewCount, useRecentCrewChanges, useCrew } from '@/modules/crew/hooks/useCrew';
import { useOverdueCAPAs, useRecentIncidents } from '@/modules/analytics/hooks/useCAPAAnalytics';
import { format } from 'date-fns';
import AlertKPITiles from '@/modules/dashboard/components/AlertKPITiles';
import RedRoomPanel from '@/modules/red-room/components/RedRoomPanel';
import AlertSections from '@/modules/red-room/components/AlertSections';
import CrewFormModal from '@/modules/crew/components/CrewFormModal';
import DashboardGrid from '@/modules/dashboard/components/DashboardGrid';
import type { WidgetDefinition } from '@/modules/dashboard/hooks/useDashboardLayout';
import { DashboardFilterProvider } from '@/modules/dashboard/contexts/DashboardFilterContext';

const DPA_WIDGET_DEFS: WidgetDefinition[] = [
  { id: 'welcome', label: 'Welcome', description: 'Welcome card', defaultOrder: 0, defaultVisible: true, defaultColSpan: 1 },
  { id: 'kpi-tiles', label: 'KPI Tiles', description: 'Alert severity overview tiles', defaultOrder: 1, defaultVisible: true, defaultColSpan: 1 },
  { id: 'red-room', label: 'Red Room', description: 'Critical alerts requiring immediate action', defaultOrder: 2, defaultVisible: true, defaultColSpan: 1 },
  { id: 'alert-sections', label: 'Alert Sections', description: 'Orange and yellow alert categories', defaultOrder: 3, defaultVisible: true, defaultColSpan: 1 },
  { id: 'crew-changes', label: 'Recent Crew Changes', description: 'Latest crew movements', defaultOrder: 4, defaultVisible: true, defaultColSpan: 1 },
  { id: 'activity', label: 'Recent Activity', description: 'Latest actions and updates', defaultOrder: 5, defaultVisible: true, defaultColSpan: 1 },
];

const DPADashboard: React.FC = () => {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [isAddCrewModalOpen, setIsAddCrewModalOpen] = useState(false);
  
  const { data: vesselCount } = useVesselCount();
  const { data: crewCount, refetch: refetchCrewCount } = useCrewCount();
  const { data: recentChanges, refetch: refetchRecentChanges } = useRecentCrewChanges(5);
  const { addCrewMember } = useCrew();
  const { data: overdueCapas } = useOverdueCAPAs();
  const { data: recentIncidents } = useRecentIncidents(5);

  const roleLabels: Record<string, string> = {
    master: 'Master', chief_engineer: 'Chief Engineer', chief_officer: 'Chief Officer',
    crew: 'Crew', dpa: 'DPA', shore_management: 'Shore Management',
  };

  const redAlertsCount = (recentIncidents?.filter(i => (i.severity_actual ?? 0) >= 4).length || 0) + 
    (overdueCapas?.slice(0, 2).length || 0);

  const widgetContent: Record<string, React.ReactNode> = {
    welcome: (
      <Card className="gradient-primary text-primary-foreground border-0">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-primary-foreground/20 flex items-center justify-center">
                <Anchor className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">Welcome, {profile?.first_name}!</h1>
                <p className="text-primary-foreground/80">{profile?.role ? roleLabels[profile.role] : 'Loading...'} • DPA Portal</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="icon"><Bell className="w-4 h-4" /></Button>
              <Button variant="secondary" size="icon"><SettingsIcon className="w-4 h-4" /></Button>
              <Button variant="secondary" size="icon"><User className="w-4 h-4" /></Button>
            </div>
          </div>
        </CardContent>
      </Card>
    ),

    'kpi-tiles': (
      <AlertKPITiles
        redAlerts={redAlertsCount}
        orangeAlerts={overdueCapas?.length || 0}
        yellowAlerts={5}
        greenItems={45}
        activeCrew={crewCount || 0}
        activeVessels={vesselCount || 0}
        onTileClick={(type) => {
          switch (type) {
            case 'red': navigate('/alerts?severity=red'); break;
            case 'orange': navigate('/reports/capa-tracker'); break;
            case 'yellow': navigate('/certificates/alerts'); break;
            case 'crew': navigate('/crew'); break;
            case 'vessels': navigate('/vessels'); break;
          }
        }}
      />
    ),

    'red-room': <RedRoomPanel />,

    'alert-sections': (
      <AlertSections
        orangeAlerts={{ overdueCAPAs: overdueCapas?.length || 0, overdueTraining: 2, drillGaps: 2 }}
        yellowAlerts={{ expiringCerts: 5, upcomingAudits: 4, incompleteMeetings: 3 }}
        onNavigate={navigate}
      />
    ),

    'crew-changes': (
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ArrowRightLeft className="w-5 h-5" />Recent Crew Changes</CardTitle>
          <CardDescription>Latest crew movements and assignments</CardDescription>
        </CardHeader>
        <CardContent>
          {recentChanges && recentChanges.length > 0 ? (
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
            </div>
          )}
        </CardContent>
      </Card>
    ),

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
          </div>
        </CardContent>
      </Card>
    ),
  };

  return (
    <DashboardLayout>
      <DashboardFilterProvider>
        <div className="animate-fade-in">
          <DashboardGrid widgetDefs={DPA_WIDGET_DEFS}>
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
      </DashboardFilterProvider>
    </DashboardLayout>
  );
};

export default DPADashboard;
