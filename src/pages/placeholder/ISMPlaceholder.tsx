import React from 'react';
import { useLocation } from 'react-router-dom';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Shield, CheckSquare, Siren, GraduationCap, MessageSquare, AlertCircle, Search, Clipboard, AlertTriangle, Eye, ClipboardList } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const ISM_PAGES: Record<string, { title: string; description: string; icon: React.ElementType }> = {
  '/ism/checklists': { title: 'Checklists & Forms', description: 'ISM checklists and digital forms for vessel operations', icon: CheckSquare },
  '/ism/drills': { title: 'Drills', description: 'Emergency drills scheduling and completion tracking', icon: Siren },
  '/ism/training': { title: 'Training', description: 'Crew training records and compliance tracking', icon: GraduationCap },
  '/ism/meetings': { title: 'Meetings', description: 'Safety meetings and committee records', icon: MessageSquare },
  '/ism/incidents': { title: 'Incidents', description: 'Incident reporting and management', icon: AlertCircle },
  '/ism/investigations': { title: 'Investigations', description: 'Incident investigation and root cause analysis', icon: Search },
  '/ism/capa': { title: 'CAPA', description: 'Corrective and Preventive Actions tracking', icon: Clipboard },
  '/ism/non-conformities': { title: 'Non-Conformities', description: 'Non-conformity reports and closeout tracking', icon: AlertTriangle },
  '/ism/observations': { title: 'Observations', description: 'Safety observations and near-miss reporting', icon: Eye },
  '/ism/risk-assessments': { title: 'Risk Assessments', description: 'Risk assessment management and work permits', icon: AlertTriangle },
  '/ism/audits': { title: 'Audits & Surveys', description: 'Internal and external audit management', icon: ClipboardList },
};

const ISMPlaceholder: React.FC = () => {
  const location = useLocation();
  const pageConfig = ISM_PAGES[location.pathname] || { 
    title: 'ISM Module', 
    description: 'ISM management', 
    icon: Shield 
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

export default ISMPlaceholder;
