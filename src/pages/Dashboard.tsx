import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Ship, Users, Activity, Plus, Anchor, Clock } from 'lucide-react';
import { useVesselCount } from '@/hooks/useVessels';

const Dashboard: React.FC = () => {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { data: vesselCount, isLoading: isVesselCountLoading } = useVesselCount();

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
      value: '0',
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
              <Button variant="outline" className="gap-2">
                <Users className="w-4 h-4" />
                Add Crew Member
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Recent activity placeholder */}
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
