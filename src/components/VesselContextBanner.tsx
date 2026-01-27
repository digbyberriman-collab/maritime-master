import React from 'react';
import { useVessel } from '@/contexts/VesselContext';
import { Ship, Globe, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface VesselContextBannerProps {
  className?: string;
  compact?: boolean;
}

export const VesselContextBanner: React.FC<VesselContextBannerProps> = ({ 
  className,
  compact = false 
}) => {
  const { selectedVessel, isAllVessels, vessels } = useVessel();

  if (isAllVessels) {
    return (
      <div className={cn(
        "flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/10 border border-primary/20",
        compact && "py-1 px-2",
        className
      )}>
        <Globe className={cn("text-primary", compact ? "w-4 h-4" : "w-5 h-5")} />
        <div className="flex flex-col">
          <span className={cn("font-medium text-primary", compact ? "text-xs" : "text-sm")}>
            Fleet-Wide View
          </span>
          {!compact && (
            <span className="text-xs text-muted-foreground">
              Showing data across {vessels.length} vessels
            </span>
          )}
        </div>
      </div>
    );
  }

  if (selectedVessel) {
    return (
      <div className={cn(
        "flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50 border border-border",
        compact && "py-1 px-2",
        className
      )}>
        <Ship className={cn("text-muted-foreground", compact ? "w-4 h-4" : "w-5 h-5")} />
        <div className="flex flex-col">
          <span className={cn("font-medium", compact ? "text-xs" : "text-sm")}>
            {selectedVessel.name}
          </span>
          {!compact && selectedVessel.imo_number && (
            <span className="text-xs text-muted-foreground">
              IMO: {selectedVessel.imo_number}
              {selectedVessel.flag_state && ` • ${selectedVessel.flag_state}`}
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={cn(
      "flex items-center gap-2 px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/20",
      compact && "py-1 px-2",
      className
    )}>
      <AlertCircle className={cn("text-destructive", compact ? "w-4 h-4" : "w-5 h-5")} />
      <span className={cn("text-destructive", compact ? "text-xs" : "text-sm")}>
        No vessel selected
      </span>
    </div>
  );
};

export default VesselContextBanner;
