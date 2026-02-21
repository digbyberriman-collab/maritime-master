import React from 'react';
import { useVessel } from '@/modules/vessels/contexts/VesselContext';
import NotificationBell from './NotificationBell';
import VesselSelector from '@/modules/vessels/components/VesselSelector';
import HeaderQuickActions from './HeaderQuickActions';
import { cn } from '@/lib/utils';

interface GlobalHeaderControlsProps {
  className?: string;
  showVesselSelector?: boolean;
}

/**
 * GlobalHeaderControls renders the Quick Actions, Fleet Filter and Alerts Bell
 * in a consistent layout for the header. The Fleet Filter is only
 * visible to users with multi-vessel access (DPA, Shore Management).
 */
const GlobalHeaderControls: React.FC<GlobalHeaderControlsProps> = ({
  className,
  showVesselSelector = true,
}) => {
  const { canAccessAllVessels, vessels } = useVessel();

  // Show vessel selector only if user has multi-vessel access
  const shouldShowVesselSelector = showVesselSelector && (canAccessAllVessels || vessels.length > 1);

  return (
    <div className={cn('flex items-center gap-2', className)}>
      {/* Quick Actions - visible everywhere except settings */}
      <HeaderQuickActions />

      {/* Fleet Filter - Only for multi-vessel users */}
      {shouldShowVesselSelector && (
        <div className="hidden md:block">
          <VesselSelector className="w-auto" />
        </div>
      )}

      {/* Alerts Bell - Always visible */}
      <NotificationBell />
    </div>
  );
};

export default GlobalHeaderControls;
