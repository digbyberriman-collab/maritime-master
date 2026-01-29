import React from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { BookOpen } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import TabPlaceholder from '@/components/ism/TabPlaceholder';

const SOPsPage: React.FC = () => {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-primary/10 rounded-lg">
              <BookOpen className="w-6 h-6 text-primary" />
            </div>
            <h1 className="text-2xl font-semibold text-foreground">
              Standard Operating Procedures (SOPs)
            </h1>
          </div>
          <p className="text-muted-foreground">
            Departmental procedures and operational guidelines
          </p>
        </div>

        {/* Tabbed Content */}
        <Tabs defaultValue="bridge" className="w-full">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="bridge">Bridge SOPs</TabsTrigger>
            <TabsTrigger value="deck">Deck SOPs</TabsTrigger>
            <TabsTrigger value="engineering">Engineering SOPs</TabsTrigger>
            <TabsTrigger value="galley">Galley SOPs</TabsTrigger>
            <TabsTrigger value="interior">Interior SOPs</TabsTrigger>
          </TabsList>
          
          <TabsContent value="bridge" className="mt-6">
            <TabPlaceholder
              title="Bridge SOPs"
              description="Standard operating procedures for bridge operations including navigation, communications, and safety protocols."
            />
          </TabsContent>
          
          <TabsContent value="deck" className="mt-6">
            <TabPlaceholder
              title="Deck SOPs"
              description="Standard operating procedures for deck operations including anchoring, mooring, and tender launching."
            />
          </TabsContent>
          
          <TabsContent value="engineering" className="mt-6">
            <TabPlaceholder
              title="Engineering SOPs"
              description="Standard operating procedures for engineering operations including machinery, systems, and maintenance."
            />
          </TabsContent>
          
          <TabsContent value="galley" className="mt-6">
            <TabPlaceholder
              title="Galley SOPs"
              description="Standard operating procedures for galley operations including food safety, hygiene, and provisioning."
            />
          </TabsContent>
          
          <TabsContent value="interior" className="mt-6">
            <TabPlaceholder
              title="Interior SOPs"
              description="Standard operating procedures for interior operations including housekeeping, service, and guest relations."
            />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default SOPsPage;
