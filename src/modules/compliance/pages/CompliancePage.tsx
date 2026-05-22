import React from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Shield, Anchor, Users } from 'lucide-react';
import ISMTab from '@/modules/compliance/components/ISMTab';
import ISPSTab from '@/modules/compliance/components/ISPSTab';
import MLCTab from '@/modules/compliance/components/MLCTab';
import { useVessel } from '@/modules/vessels/contexts/VesselContext';

const PATH_TABS: Record<string, string> = {
  '/compliance/ism': 'ism',
  '/compliance/isps': 'isps',
  '/compliance/mlc': 'mlc',
};

const CompliancePage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // Tab is derived from the URL path first (new IA), then ?tab= query
  // (legacy in-app links), then defaults to ISM.
  const tab = PATH_TABS[location.pathname] ?? searchParams.get('tab') ?? 'ism';
  const { selectedVessel } = useVessel();
  const isPathRouted = location.pathname in PATH_TABS || location.pathname === '/compliance';

  const handleTabChange = (value: string) => {
    if (isPathRouted) {
      navigate(`/compliance/${value}`);
    } else {
      navigate({ pathname: location.pathname, search: `?tab=${value}` });
    }
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
