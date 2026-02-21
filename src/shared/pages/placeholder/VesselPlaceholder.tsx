import React from 'react';
import { useLocation } from 'react-router-dom';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Ship, LayoutGrid, Building2, Phone } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const VESSEL_PAGES: Record<string, { title: string; description: string; icon: React.ElementType }> = {
  '/vessels/dashboard': { title: 'Vessel Dashboard', description: 'Comprehensive vessel overview and status', icon: LayoutGrid },
  '/vessels/company-details': { title: 'Company Details', description: 'Company information and management contacts', icon: Building2 },
  '/vessels/emergency-details': { title: 'Emergency Details', description: 'Emergency contacts and procedures', icon: Phone },
};

const VesselPlaceholder: React.FC = () => {
  const location = useLocation();
  const pageConfig = VESSEL_PAGES[location.pathname] || { 
    title: 'Vessel Module', 
    description: 'Vessel management', 
    icon: Ship 
  };
  const Icon = pageConfig.icon;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-foreground">{pageConfig.title}</h1>
              <Badge variant="secondary">Coming Soon</Badge>
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

export default VesselPlaceholder;
