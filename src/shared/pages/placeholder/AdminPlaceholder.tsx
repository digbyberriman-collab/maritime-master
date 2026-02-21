import React from 'react';
import { useLocation } from 'react-router-dom';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Shield, Ship, Bell, Wrench, Settings } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const ADMIN_PAGES: Record<string, { title: string; description: string; icon: React.ElementType }> = {
  '/admin/users': { title: 'User Management', description: 'Manage users and access permissions', icon: Users },
  '/admin/roles': { title: 'Roles & Permissions', description: 'Configure roles and permission matrix', icon: Shield },
  '/admin/fleet-groups': { title: 'Fleet Groups', description: 'Manage fleet groupings and hierarchies', icon: Ship },
  '/admin/alerts': { title: 'Alert Configuration', description: 'Configure alert rules and escalation', icon: Bell },
  '/admin/integrations': { title: 'API Integrations', description: 'Third-party API and system integrations', icon: Wrench },
};

const AdminPlaceholder: React.FC = () => {
  const location = useLocation();
  const pageConfig = ADMIN_PAGES[location.pathname] || { 
    title: 'Admin Module', 
    description: 'Administration settings', 
    icon: Settings 
  };
  const Icon = pageConfig.icon;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-foreground">{pageConfig.title}</h1>
              <Badge variant="outline">Admin Only</Badge>
            </div>
            <p className="text-muted-foreground mt-1">{pageConfig.description}</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-primary/10">
                <Icon className="h-8 w-8 text-primary" />
              </div>
              <div>
                <CardTitle>{pageConfig.title}</CardTitle>
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

export default AdminPlaceholder;
