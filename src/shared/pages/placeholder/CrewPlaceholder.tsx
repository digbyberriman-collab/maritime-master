import React from 'react';
import { useLocation } from 'react-router-dom';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { PageHeader } from '@/shared/components/common/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Award, Plane, Clock, CalendarDays } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const CREW_PAGES: Record<string, { title: string; description: string; icon: React.ElementType }> = {
  '/crew/roster': { title: 'Crew List', description: 'Manage crew members and assignments', icon: Users },
  '/crew/certificates': { title: 'Crew Certificates', description: 'Crew certification and compliance tracking', icon: Award },
  '/crew/flights': { title: 'Flights & Travel', description: 'Travel arrangements and flight bookings', icon: Plane },
  '/crew/hours-of-rest': { title: 'Hours of Rest', description: 'STCW rest hour compliance tracking', icon: Clock },
  '/crew/leave': { title: 'Leave Management', description: 'Crew leave requests and approvals', icon: CalendarDays },
};

const CrewPlaceholder: React.FC = () => {
  const location = useLocation();
  const pageConfig = CREW_PAGES[location.pathname] || { 
    title: 'Crew Management',
    description: 'Crew management', 
    icon: Users 
  };
  const Icon = pageConfig.icon;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title={
            <span className="inline-flex items-center gap-3">
              {pageConfig.title}
              <Badge variant="secondary">Coming Soon</Badge>
            </span>
          }
          description={pageConfig.description}
        />

        <Card>
          <CardHeader>
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-primary/10">
                <Icon className="h-8 w-8 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base">{pageConfig.title}</CardTitle>
                <CardDescription>This module is under development</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-center py-12 text-muted-foreground">
              <Icon className="h-16 w-16 mx-auto mb-4 opacity-20" />
              <p className="text-lg font-medium">Module Coming Soon</p>
              <p className="text-sm mt-2 max-w-md mx-auto">
                The {pageConfig.title} module is currently being developed. 
                Check back soon for full functionality.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default CrewPlaceholder;
