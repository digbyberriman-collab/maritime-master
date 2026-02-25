import React from 'react';
import NotificationBell from './NotificationBell';
import { cn } from '@/lib/utils';

interface GlobalHeaderControlsProps {
  className?: string;
}

/**
 * GlobalHeaderControls renders the Alerts Bell in the header.
 */
const GlobalHeaderControls: React.FC<GlobalHeaderControlsProps> = ({
  className,
}) => {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <NotificationBell />
    </div>
  );
};

export default GlobalHeaderControls;
