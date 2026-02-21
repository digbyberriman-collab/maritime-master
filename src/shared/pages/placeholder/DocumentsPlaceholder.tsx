import React from 'react';
import { useLocation } from 'react-router-dom';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FileText, BookOpen, ClipboardList, Shield, FileCheck, Layers } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const DOCUMENT_PAGES: Record<string, { title: string; description: string; icon: React.ElementType }> = {
  '/documents/manuals': { title: 'Manuals', description: 'Operational and safety manuals', icon: BookOpen },
  '/documents/procedures': { title: 'Procedures & SOPs', description: 'Standard operating procedures', icon: ClipboardList },
  '/documents/ism-sms': { title: 'ISM / SMS', description: 'ISM code and Safety Management System documents', icon: Shield },
  '/documents/policies': { title: 'Policies', description: 'Company policies and guidelines', icon: FileCheck },
  '/documents/drawings': { title: 'Drawings', description: 'Technical drawings and plans', icon: Layers },
};

const DocumentsPlaceholder: React.FC = () => {
  const location = useLocation();
  const pageConfig = DOCUMENT_PAGES[location.pathname] || { 
    title: 'Documents Module', 
    description: 'Document management', 
    icon: FileText 
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

export default DocumentsPlaceholder;
