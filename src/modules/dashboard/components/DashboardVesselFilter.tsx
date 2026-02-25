import React, { useState } from 'react';
import { Ship, Check, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useVessel } from '@/modules/vessels/contexts/VesselContext';

interface DashboardVesselFilterProps {
  selectedVesselIds: string[];
  onSelectionChange: (vesselIds: string[]) => void;
  className?: string;
}

const DashboardVesselFilter: React.FC<DashboardVesselFilterProps> = ({
  selectedVesselIds,
  onSelectionChange,
  className,
}) => {
  const { vessels, loading } = useVessel();
  const [open, setOpen] = useState(false);

  if (loading || vessels.length === 0) return null;

  const allSelected = selectedVesselIds.length === vessels.length;
  const noneSelected = selectedVesselIds.length === 0;
  const someSelected = !allSelected && !noneSelected;

  const handleToggleAll = () => {
    if (allSelected) {
      // Deselect all → select first vessel (must have at least one)
      onSelectionChange([vessels[0].id]);
    } else {
      onSelectionChange(vessels.map((v) => v.id));
    }
  };

  const handleToggleVessel = (vesselId: string) => {
    const isSelected = selectedVesselIds.includes(vesselId);
    if (isSelected) {
      // Don't allow deselecting the last one
      if (selectedVesselIds.length <= 1) return;
      onSelectionChange(selectedVesselIds.filter((id) => id !== vesselId));
    } else {
      onSelectionChange([...selectedVesselIds, vesselId]);
    }
  };

  const getLabel = () => {
    if (allSelected) return 'All Vessels';
    if (selectedVesselIds.length === 1) {
      const vessel = vessels.find((v) => v.id === selectedVesselIds[0]);
      return vessel?.name || '1 Vessel';
    }
    return `${selectedVesselIds.length} Vessels`;
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            'h-7 px-2.5 text-xs gap-1.5 font-medium',
            someSelected && 'border-primary/50 text-primary',
            className
          )}
        >
          <Ship className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">{getLabel()}</span>
          <Badge
            variant="secondary"
            className="h-4 px-1 text-[10px] font-semibold sm:hidden"
          >
            {allSelected ? 'ALL' : selectedVesselIds.length}
          </Badge>
          <ChevronsUpDown className="w-3 h-3 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2" align="start">
        {/* Select All */}
        <button
          onClick={handleToggleAll}
          className={cn(
            'w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm transition-colors',
            allSelected
              ? 'bg-primary/10 text-primary font-medium'
              : 'hover:bg-muted text-foreground'
          )}
        >
          <Checkbox
            checked={allSelected}
            className="pointer-events-none"
          />
          <Ship className="w-4 h-4" />
          <span>All Vessels</span>
          <Badge variant="secondary" className="ml-auto h-4 px-1 text-[10px]">
            {vessels.length}
          </Badge>
        </button>

        <Separator className="my-1.5" />

        {/* Individual vessels */}
        <div className="max-h-[240px] overflow-y-auto space-y-0.5">
          {vessels.map((vessel) => {
            const isSelected = selectedVesselIds.includes(vessel.id);
            return (
              <button
                key={vessel.id}
                onClick={() => handleToggleVessel(vessel.id)}
                className={cn(
                  'w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm transition-colors',
                  isSelected
                    ? 'bg-primary/10 text-primary'
                    : 'hover:bg-muted text-muted-foreground hover:text-foreground'
                )}
              >
                <Checkbox
                  checked={isSelected}
                  className="pointer-events-none"
                />
                <span className="truncate">{vessel.name}</span>
                {isSelected && (
                  <Check className="w-3 h-3 ml-auto shrink-0 text-primary" />
                )}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default DashboardVesselFilter;
