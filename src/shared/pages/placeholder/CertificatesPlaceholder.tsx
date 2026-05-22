import React from 'react';
import { useLocation } from 'react-router-dom';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { PageHeader } from '@/shared/components/common/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Award, Ship, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const CERTIFICATE_PAGES: Record<string, { title: string; description: string; icon: React.ElementType }> = {
  '/certificates/vessel': { title: 'Vessel Certificates', description: 'Statutory and class certificates for vessels', icon: Ship },
  '/certificates/crew': { title: 'Crew Certificates', description: 'Crew certification overview and compliance', icon: Users },
};

const CertificatesPlaceholder: React.FC = () => {
  const location = useLocation();
  const pageConfig = CERTIFICATE_PAGES[location.pathname] || { 
    title: 'Certificates Module', 
    description: 'Certificate management', 
    icon: Award 
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

export default CertificatesPlaceholder;
