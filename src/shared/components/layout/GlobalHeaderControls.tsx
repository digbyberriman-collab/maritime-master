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
  // Safe usage: filter context may not be available on non-dashboard pages
  let filterProps = null;
  try {
    const { selectedVesselIds, setSelectedVesselIds } = useDashboardFilter();
    filterProps = { selectedVesselIds, setSelectedVesselIds };
  } catch {
    // Not inside DashboardFilterProvider — skip vessel filter
  }

  return (
    <div className={cn('flex items-center gap-2', className)}>
      {filterProps && (
        <DashboardVesselFilter
          selectedVesselIds={filterProps.selectedVesselIds}
          onSelectionChange={filterProps.setSelectedVesselIds}
        />
      )}
      <NotificationBell />
    </div>
  );
};

export default GlobalHeaderControls;
