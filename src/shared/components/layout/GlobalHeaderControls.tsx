import React from 'react';
import NotificationBell from './NotificationBell';
import HeaderQuickActions from './HeaderQuickActions';
import { cn } from '@/lib/utils';

interface GlobalHeaderControlsProps {
  className?: string;
}

/**
 * GlobalHeaderControls renders the Quick Actions and Alerts Bell
 * in a consistent layout for the header.
 */
const GlobalHeaderControls: React.FC<GlobalHeaderControlsProps> = ({
  className,
}) => {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      {/* Quick Actions - visible everywhere except settings */}
      <HeaderQuickActions />

      {/* Alerts Bell - Always visible */}
      <NotificationBell />
    </div>
  );
};

export default GlobalHeaderControls;
