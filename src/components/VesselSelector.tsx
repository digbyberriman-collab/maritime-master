import React from 'react';
import { useVessel } from '@/contexts/VesselContext';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Ship, Globe, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface VesselSelectorProps {
  className?: string;
}

export const VesselSelector: React.FC<VesselSelectorProps> = ({ className }) => {
  const {
    selectedVessel,
    vessels,
    isAllVessels,
    setSelectedVesselById,
    setAllVessels,
    loading,
    canAccessAllVessels,
  } = useVessel();

  if (loading) {
    return (
      <div className={cn("flex items-center gap-2 px-3 py-2 text-muted-foreground", className)}>
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-sm">Loading vessels...</span>
      </div>
    );
  }

  if (vessels.length === 0) {
    return (
      <div className={cn("flex items-center gap-2 px-3 py-2 text-muted-foreground", className)}>
        <Ship className="w-4 h-4" />
        <span className="text-sm">No vessels assigned</span>
      </div>
    );
  }

  // Single vessel and can't access all - show as badge (not selectable)
  if (vessels.length === 1 && !canAccessAllVessels) {
    return (
      <div className={cn("flex items-center gap-2 px-3 py-2", className)}>
        <Ship className="w-4 h-4 text-primary" />
        <div className="flex flex-col">
          <span className="text-sm font-medium">{vessels[0].name}</span>
          {vessels[0].imo_number && (
            <span className="text-xs text-muted-foreground">IMO: {vessels[0].imo_number}</span>
          )}
        </div>
      </div>
    );
  }

  // Determine the current value for the Select
  const currentValue = isAllVessels ? '__all__' : (selectedVessel?.id || '');

  return (
    <div className={cn("relative", className)}>
      <Select
        value={currentValue}
        onValueChange={(value) => {
          if (value === '__all__') {
            setAllVessels();
          } else {
            setSelectedVesselById(value);
          }
        }}
      >
        <SelectTrigger 
          className="w-[280px] bg-background border-input"
          aria-label="Select vessel to filter data"
        >
          <div className="flex items-center gap-2">
            {isAllVessels ? (
              <Globe className="w-4 h-4 text-primary" />
            ) : (
              <Ship className="w-4 h-4 text-primary" />
            )}
            <SelectValue>
              {isAllVessels ? (
                <div className="flex items-center gap-2">
                  <span className="font-medium">All Vessels</span>
                  <Badge variant="secondary" className="text-xs py-0 h-5">
                    {vessels.length}
                  </Badge>
                </div>
              ) : selectedVessel ? (
                <div className="flex flex-col items-start">
                  <span className="font-medium">{selectedVessel.name}</span>
                </div>
              ) : (
                'Select vessel'
              )}
            </SelectValue>
          </div>
        </SelectTrigger>
        <SelectContent className="bg-popover z-50">
          {/* All Vessels option (DPA/Shore Management only) */}
          {canAccessAllVessels && (
            <>
              <SelectItem value="__all__" className="cursor-pointer">
                <div className="flex items-center gap-3 py-1">
                  <Globe className="w-4 h-4 text-primary" />
                  <div className="flex flex-col">
                    <span className="font-medium">All Vessels</span>
                    <span className="text-xs text-muted-foreground">
                      Fleet-wide view ({vessels.length} vessels)
                    </span>
                  </div>
                </div>
              </SelectItem>
              <div className="border-t border-border my-1" />
            </>
          )}

          {/* Individual vessels */}
          {vessels.map((vessel) => (
            <SelectItem key={vessel.id} value={vessel.id} className="cursor-pointer">
              <div className="flex items-center gap-3 py-1">
                <Ship className="w-4 h-4 text-muted-foreground" />
                <div className="flex flex-col">
                  <span className="font-medium">{vessel.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {vessel.imo_number && `IMO: ${vessel.imo_number}`}
                    {vessel.imo_number && vessel.flag_state && ' • '}
                    {vessel.flag_state}
                  </span>
                </div>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Active selection indicator */}
      {!isAllVessels && selectedVessel && (
        <div className="absolute -bottom-1 left-0 right-0 h-0.5 bg-primary rounded-full" />
      )}
    </div>
  );
};

export default VesselSelector;
