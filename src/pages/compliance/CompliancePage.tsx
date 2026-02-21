import React from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Shield, Anchor, Users } from 'lucide-react';
import ISMTab from '@/components/compliance/ISMTab';
import ISPSTab from '@/components/compliance/ISPSTab';
import MLCTab from '@/components/compliance/MLCTab';
import { useVessel } from '@/contexts/VesselContext';

const CompliancePage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') || 'ism';
  const { selectedVessel } = useVessel();

  const handleTabChange = (value: string) => {
    setSearchParams({ tab: value });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Compliance</h1>
          <p className="text-muted-foreground">
            ISM, ISPS & MLC compliance management
            {selectedVessel && <span className="ml-1">— {selectedVessel.name}</span>}
          </p>
        </div>

        <Tabs value={tab} onValueChange={handleTabChange}>
          <TabsList>
            <TabsTrigger value="ism" className="gap-2">
              <Shield className="w-4 h-4" />
              ISM Code
            </TabsTrigger>
            <TabsTrigger value="isps" className="gap-2">
              <Anchor className="w-4 h-4" />
              ISPS
            </TabsTrigger>
            <TabsTrigger value="mlc" className="gap-2">
              <Users className="w-4 h-4" />
              MLC
            </TabsTrigger>
          </TabsList>

          <TabsContent value="ism" className="mt-6">
            <ISMTab />
          </TabsContent>

          <TabsContent value="isps" className="mt-6">
            <ISPSTab />
          </TabsContent>

          <TabsContent value="mlc" className="mt-6">
            <MLCTab />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default CompliancePage;
