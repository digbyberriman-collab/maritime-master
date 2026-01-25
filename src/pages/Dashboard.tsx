import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Ship, Users, Activity, Plus, Anchor, Clock, ArrowRightLeft } from 'lucide-react';
import { useVesselCount } from '@/hooks/useVessels';
import { useCrewCount, useRecentCrewChanges } from '@/hooks/useCrew';
import { format } from 'date-fns';

const Dashboard: React.FC = () => {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { data: vesselCount, isLoading: isVesselCountLoading } = useVesselCount();
  const { data: crewCount, isLoading: isCrewCountLoading } = useCrewCount();
  const { data: recentChanges, isLoading: isChangesLoading } = useRecentCrewChanges(5);

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
              <Button className="gap-2" onClick={() => navigate('/vessels')}>
                <Plus className="w-4 h-4" />
                Add Vessel
              </Button>
              <Button variant="outline" className="gap-2" onClick={() => navigate('/operations/crew')}>
                <Users className="w-4 h-4" />
                Manage Crew
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
    </DashboardLayout>
  );
};

export default Dashboard;
