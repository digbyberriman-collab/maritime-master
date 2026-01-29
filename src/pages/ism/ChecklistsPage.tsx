import React from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { CheckSquare } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import TabPlaceholder from '@/components/ism/TabPlaceholder';

const ChecklistsPage: React.FC = () => {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-primary/10 rounded-lg">
              <CheckSquare className="w-6 h-6 text-primary" />
            </div>
            <h1 className="text-2xl font-semibold text-foreground">
              Checklists
            </h1>
          </div>
          <p className="text-muted-foreground">
            Departmental and operational checklists
          </p>
        </div>

        {/* Tabbed Content */}
        <Tabs defaultValue="bridge" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="bridge">Bridge Checklists</TabsTrigger>
            <TabsTrigger value="engine-room">Engine Room Checklists</TabsTrigger>
            <TabsTrigger value="interior">Interior Checklists</TabsTrigger>
            <TabsTrigger value="ism">ISM Checklists</TabsTrigger>
          </TabsList>
          
          <TabsContent value="bridge" className="mt-6">
            <TabPlaceholder
              title="Bridge Checklists"
              description="Bridge operational and navigation checklists including watchkeeping, departure, and arrival procedures."
            />
          </TabsContent>
          
          <TabsContent value="engine-room" className="mt-6">
            <TabPlaceholder
              title="Engine Room Checklists"
              description="Engineering department operational checklists for machinery, systems, and maintenance procedures."
            />
          </TabsContent>
          
          <TabsContent value="interior" className="mt-6">
            <TabPlaceholder
              title="Interior Checklists"
              description="Interior department service and safety checklists for housekeeping and guest services."
            />
          </TabsContent>
          
          <TabsContent value="ism" className="mt-6">
            <TabPlaceholder
              title="ISM Checklists"
              description="General ISM compliance checklists for safety management system requirements."
            />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default ChecklistsPage;
