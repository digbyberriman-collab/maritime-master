import React from 'react';
import NotificationBell from './NotificationBell';
import DashboardVesselFilter from '@/modules/dashboard/components/DashboardVesselFilter';
import { useDashboardFilter } from '@/modules/dashboard/contexts/DashboardFilterContext';
import { cn } from '@/lib/utils';

interface GlobalHeaderControlsProps {
  className?: string;
}

/**
 * GlobalHeaderControls renders the Vessel Filter and Alerts Bell in the header.
 */
const GlobalHeaderControls: React.FC<GlobalHeaderControlsProps> = ({
  className,
}) => {
  const { selectedVesselIds, setSelectedVesselIds } = useDashboardFilter();

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <DashboardVesselFilter
        selectedVesselIds={selectedVesselIds}
        onSelectionChange={setSelectedVesselIds}
      />
      <NotificationBell />
    </div>
  );
};

export default GlobalHeaderControls;
