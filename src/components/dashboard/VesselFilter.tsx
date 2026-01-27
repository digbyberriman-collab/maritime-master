import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { 
  Ship, 
  Search,
  Filter,
  X
} from 'lucide-react';

interface Vessel {
  id: string;
  name: string;
  status: string;
}

interface FleetGroup {
  id: string;
  name: string;
  vesselIds: string[];
}

interface AlertFilters {
  red: boolean;
  orange: boolean;
  yellow: boolean;
  green: boolean;
}

interface VesselFilterProps {
  vessels: Vessel[];
  selectedVesselIds: string[];
  onVesselToggle: (vesselId: string) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  alertFilters: AlertFilters;
  onAlertFilterChange: (filter: keyof AlertFilters, value: boolean) => void;
  fleetGroups?: FleetGroup[];
  selectedFleetGroup?: string;
  onFleetGroupChange?: (groupId: string | undefined) => void;
}

export const VesselFilter: React.FC<VesselFilterProps> = ({
  vessels,
  selectedVesselIds,
  onVesselToggle,
  onSelectAll,
  onClearAll,
  searchQuery,
  onSearchChange,
  alertFilters,
  onAlertFilterChange,
  fleetGroups = [],
  selectedFleetGroup,
  onFleetGroupChange,
}) => {
  const filteredVessels = vessels.filter(vessel =>
    vessel.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search vessels..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9"
        />
        {searchQuery && (
          <button
            onClick={() => onSearchChange('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Vessel List */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-muted-foreground">VESSELS</h4>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={onSelectAll}>
              All
            </Button>
            <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={onClearAll}>
              None
            </Button>
          </div>
        </div>
        <ScrollArea className="h-[200px]">
          <div className="space-y-1">
            {filteredVessels.map((vessel) => (
              <button
                key={vessel.id}
                onClick={() => onVesselToggle(vessel.id)}
                className={`
                  w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm transition-colors
                  ${selectedVesselIds.includes(vessel.id) 
                    ? 'bg-primary/10 text-primary' 
                    : 'hover:bg-muted text-muted-foreground hover:text-foreground'}
                `}
              >
                <span className={`
                  w-2 h-2 rounded-full
                  ${selectedVesselIds.includes(vessel.id) ? 'bg-primary' : 'bg-muted-foreground/30'}
                `} />
                <Ship className="w-4 h-4" />
                <span className="truncate">{vessel.name}</span>
              </button>
            ))}
          </div>
        </ScrollArea>
      </div>

      <Separator />

      {/* Alert Filters */}
      <div className="space-y-2">
        <h4 className="text-sm font-semibold text-muted-foreground">FILTERS</h4>
        <div className="space-y-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox
              checked={alertFilters.red}
              onCheckedChange={(checked) => onAlertFilterChange('red', !!checked)}
            />
            <span className="flex items-center gap-2 text-sm">
              <span className="w-3 h-3 rounded-full bg-destructive" />
              Red
            </span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox
              checked={alertFilters.orange}
              onCheckedChange={(checked) => onAlertFilterChange('orange', !!checked)}
            />
            <span className="flex items-center gap-2 text-sm">
              <span className="w-3 h-3 rounded-full bg-warning" />
              Orange
            </span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox
              checked={alertFilters.yellow}
              onCheckedChange={(checked) => onAlertFilterChange('yellow', !!checked)}
            />
            <span className="flex items-center gap-2 text-sm">
              <span className="w-3 h-3 rounded-full bg-warning" />
              Yellow
            </span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox
              checked={alertFilters.green}
              onCheckedChange={(checked) => onAlertFilterChange('green', !!checked)}
            />
            <span className="flex items-center gap-2 text-sm">
              <span className="w-3 h-3 rounded-full bg-success" />
              Green
            </span>
          </label>
        </div>
      </div>

      {/* Fleet Groups */}
      {fleetGroups.length > 0 && (
        <>
          <Separator />
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-muted-foreground">FLEET GROUPS</h4>
            <div className="space-y-1">
              {fleetGroups.map((group) => (
                <button
                  key={group.id}
                  onClick={() => onFleetGroupChange?.(
                    selectedFleetGroup === group.id ? undefined : group.id
                  )}
                  className={`
                    w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm transition-colors
                    ${selectedFleetGroup === group.id 
                      ? 'bg-primary/10 text-primary' 
                      : 'hover:bg-muted text-muted-foreground hover:text-foreground'}
                  `}
                >
                  <Checkbox checked={selectedFleetGroup === group.id} />
                  <span>{group.name}</span>
                  <span className="text-xs text-muted-foreground ml-auto">
                    ({group.vesselIds.length})
                  </span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default VesselFilter;
