import React from 'react';
import { Users } from 'lucide-react';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/shared/components/common/PageHeader';

const CrewList: React.FC = () => {
  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <PageHeader
          title="Crew List"
          description="Operational crew roster — manage who is currently assigned, on board, or scheduled."
        />

        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="w-5 h-5" />
              Coming soon
            </CardTitle>
            <CardDescription>
              This module will house the operational crew list, separate from the system Users
              registry. Tell us which columns and actions you want here and we'll wire it up.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            For system user accounts and access, see <strong>Users</strong> in the Crew menu.
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default CrewList;