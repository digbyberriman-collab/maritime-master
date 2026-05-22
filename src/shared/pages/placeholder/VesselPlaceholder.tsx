import React from 'react';
import { useLocation } from 'react-router-dom';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { PageHeader } from '@/shared/components/common/PageHeader';
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

export default VesselPlaceholder;
