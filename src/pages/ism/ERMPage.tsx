import React from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { AlertCircle } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import TabPlaceholder from '@/components/ism/TabPlaceholder';

const ERMPage: React.FC = () => {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-primary/10 rounded-lg">
              <AlertCircle className="w-6 h-6 text-primary" />
            </div>
            <h1 className="text-2xl font-semibold text-foreground">
              Emergency Response Manual (ERM)
            </h1>
          </div>
          <p className="text-muted-foreground">
            Emergency procedures and response checklists
          </p>
        </div>

        {/* Tabbed Content */}
        <Tabs defaultValue="emergency-checklists" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="emergency-checklists">Emergency Checklists</TabsTrigger>
            <TabsTrigger value="other-emergencies">Other Emergencies & Detailed Guidance</TabsTrigger>
            <TabsTrigger value="people-welfare">People & Welfare Issues</TabsTrigger>
          </TabsList>
          
          <TabsContent value="emergency-checklists" className="mt-6">
            <TabPlaceholder
              title="Emergency Checklists"
              description="Quick-reference checklists for emergency situations including fire, flooding, and abandon ship procedures."
            />
          </TabsContent>
          
          <TabsContent value="other-emergencies" className="mt-6">
            <TabPlaceholder
              title="Other Emergencies & Detailed Guidance"
              description="Comprehensive guidance for various emergency scenarios not covered by standard checklists."
            />
          </TabsContent>
          
          <TabsContent value="people-welfare" className="mt-6">
            <TabPlaceholder
              title="People & Welfare Issues"
              description="Procedures for crew welfare, medical emergencies, and personnel-related incidents."
            />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default ERMPage;
