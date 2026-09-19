import React from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Loader2, Ship } from 'lucide-react';
import { useVessel } from '@/modules/vessels/contexts/VesselContext';
import { findVesselBySlug } from '@/modules/vessels/lib/vesselSlug';

/**
 * `/vessel/:vesselSlug` and `/vessel/:vesselSlug/dashboard`.
 *
 * This page used to render a fixture: crew from `src/data/seedData.ts` and
 * KPI figures from `Math.random()`, presented as that vessel's real position.
 * It now resolves the slug against the vessels the signed-in user can
 * actually see, selects that vessel, and hands over to the real vessel
 * dashboard, which reads live data through `get_vessel_dashboard_summary`.
 */
const IndividualVesselDashboard: React.FC = () => {
  const { vesselSlug } = useParams<{ vesselSlug: string }>();
  const navigate = useNavigate();
  const { vessels, loading, selectedVesselId, setSelectedVessel } = useVessel();

  const vessel = React.useMemo(
    () => findVesselBySlug(vessels, vesselSlug ?? ''),
    [vessels, vesselSlug],
  );

  React.useEffect(() => {
    if (vessel && vessel.id !== selectedVesselId) setSelectedVessel(vessel);
  }, [vessel, selectedVesselId, setSelectedVessel]);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex min-h-[400px] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  if (!vessel) {
    return (
      <DashboardLayout>
        <div className="flex min-h-[400px] items-center justify-center">
          <div className="text-center">
            <Ship className="mx-auto mb-4 h-16 w-16 text-muted-foreground/30" />
            <h2 className="text-xl font-bold text-foreground">Vessel not found</h2>
            <p className="mt-2 text-muted-foreground">
              No vessel you can access matches “{vesselSlug}”.
            </p>
            <Button className="mt-4" onClick={() => navigate('/vessels/dashboard')}>
              Go to the vessel dashboard
            </Button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // The dashboard reads the selected vessel from context, so once the slug is
  // resolved the canonical route renders it with real data.
  return <Navigate to="/vessels/dashboard" replace />;
};

export default IndividualVesselDashboard;
