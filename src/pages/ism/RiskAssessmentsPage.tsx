import React from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Shield } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import TabPlaceholder from '@/components/ism/TabPlaceholder';

const RiskAssessmentsPage: React.FC = () => {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Shield className="w-6 h-6 text-primary" />
            </div>
            <h1 className="text-2xl font-semibold text-foreground">
              Risk Assessments
            </h1>
          </div>
          <p className="text-muted-foreground">
            Departmental risk assessment forms and templates
          </p>
        </div>

        {/* Tabbed Content */}
        <Tabs defaultValue="bridge" className="w-full">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="bridge">Bridge</TabsTrigger>
            <TabsTrigger value="deck">Deck</TabsTrigger>
            <TabsTrigger value="engineering">Engineering</TabsTrigger>
            <TabsTrigger value="galley">Galley</TabsTrigger>
            <TabsTrigger value="interior">Interior</TabsTrigger>
          </TabsList>
          
          <TabsContent value="bridge" className="mt-6">
            <TabPlaceholder
              title="Bridge Risk Assessments"
              description="Risk assessment forms for bridge operations including navigation, watchkeeping, and maneuvering."
            />
          </TabsContent>
          
          <TabsContent value="deck" className="mt-6">
            <TabPlaceholder
              title="Deck Risk Assessments"
              description="Risk assessment forms for deck operations including anchoring, mooring, and tender operations."
            />
          </TabsContent>
          
          <TabsContent value="engineering" className="mt-6">
            <TabPlaceholder
              title="Engineering Risk Assessments"
              description="Risk assessment forms for engineering operations including machinery maintenance and fuel handling."
            />
          </TabsContent>
          
          <TabsContent value="galley" className="mt-6">
            <TabPlaceholder
              title="Galley Risk Assessments"
              description="Risk assessment forms for galley operations including food safety and cooking hazards."
            />
          </TabsContent>
          
          <TabsContent value="interior" className="mt-6">
            <TabPlaceholder
              title="Interior Risk Assessments"
              description="Risk assessment forms for interior operations including housekeeping and guest services."
            />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default RiskAssessmentsPage;
