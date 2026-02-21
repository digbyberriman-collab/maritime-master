import React, { useState, useMemo } from 'react';
import { useVessel } from '@/modules/vessels/contexts/VesselContext';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Ship, Globe, Loader2, Search, ChevronDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

interface VesselSelectorProps {
  className?: string;
}

// Severity filter options
const SEVERITY_FILTERS = [
  { id: 'red', label: 'Red', color: 'bg-red-500' },
  { id: 'orange', label: 'Orange', color: 'bg-orange-500' },
  { id: 'yellow', label: 'Yellow', color: 'bg-yellow-500' },
  { id: 'green', label: 'Green', color: 'bg-green-500' },
];

// Fleet group options (placeholder for now)
const FLEET_GROUPS = [
  { id: 'private', label: 'Private' },
  { id: 'charter', label: 'Charter' },
  { id: 'yard', label: 'Yard' },
];

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

  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedVesselIds, setSelectedVesselIds] = useState<Set<string>>(new Set());
  const [severityFilters, setSeverityFilters] = useState<Set<string>>(
    new Set(['red', 'orange', 'yellow', 'green'])
  );
  const [fleetGroups, setFleetGroups] = useState<Set<string>>(new Set());

  // Initialize selected vessels when opening
  React.useEffect(() => {
    if (open) {
      if (isAllVessels) {
        setSelectedVesselIds(new Set(vessels.map(v => v.id)));
      } else if (selectedVessel) {
        setSelectedVesselIds(new Set([selectedVessel.id]));
      }
    }
  }, [open, isAllVessels, selectedVessel, vessels]);

  // Filter vessels by search query
  const filteredVessels = useMemo(() => {
    if (!searchQuery.trim()) return vessels;
    const query = searchQuery.toLowerCase();
    return vessels.filter(
      v =>
        v.name.toLowerCase().includes(query) ||
        v.imo_number?.toLowerCase().includes(query)
    );
  }, [vessels, searchQuery]);

  // Count vessels per fleet group (placeholder - will need real data)
  const fleetGroupCounts = useMemo(() => {
    return {
      private: 0,
      charter: 0,
      yard: 0,
    };
  }, []);

  const handleSelectAll = () => {
    setSelectedVesselIds(new Set(vessels.map(v => v.id)));
  };

  const handleSelectNone = () => {
    setSelectedVesselIds(new Set());
  };

  const handleVesselToggle = (vesselId: string) => {
    const newSet = new Set(selectedVesselIds);
    if (newSet.has(vesselId)) {
      newSet.delete(vesselId);
    } else {
      newSet.add(vesselId);
    }
    setSelectedVesselIds(newSet);

    // Update context based on selection
    if (newSet.size === vessels.length && canAccessAllVessels) {
      setAllVessels();
    } else if (newSet.size === 1) {
      const [id] = newSet;
      setSelectedVesselById(id);
    } else if (newSet.size === 0) {
      // Keep at least one selected or all
      if (canAccessAllVessels) {
        setAllVessels();
      }
    }
  };

  const handleSeverityToggle = (severity: string) => {
    const newSet = new Set(severityFilters);
    if (newSet.has(severity)) {
      newSet.delete(severity);
    } else {
      newSet.add(severity);
    }
    setSeverityFilters(newSet);
  };

  const handleFleetGroupToggle = (group: string) => {
    const newSet = new Set(fleetGroups);
    if (newSet.has(group)) {
      newSet.delete(group);
    } else {
      newSet.add(group);
    }
    setFleetGroups(newSet);
  };

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

  // Determine display text
  const displayText = isAllVessels
    ? 'All Vessels'
    : selectedVessel?.name || 'Select vessel';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label="Select vessel to filter data"
          className={cn(
            "w-auto min-w-[180px] justify-between bg-background border-input",
            className
          )}
        >
          <div className="flex items-center gap-2">
            {isAllVessels ? (
              <Globe className="w-4 h-4 text-primary" />
            ) : (
              <Ship className="w-4 h-4 text-primary" />
            )}
            <span className="font-medium truncate max-w-[140px]">{displayText}</span>
            {isAllVessels && (
              <Badge variant="secondary" className="text-xs py-0 h-5 ml-1">
                {vessels.length}
              </Badge>
            )}
          </div>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent 
        className="w-[280px] p-0 bg-popover" 
        align="start"
        sideOffset={8}
      >
        <div className="p-4 space-y-4">
          {/* Header */}
          <h4 className="font-semibold text-sm text-foreground">Fleet Filter</h4>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search vessels..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-9 text-sm"
            />
          </div>

          {/* Vessels Section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Vessels
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSelectAll}
                  className="text-xs text-primary hover:underline"
                >
                  All
                </button>
                <button
                  onClick={handleSelectNone}
                  className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                >
                  None
                </button>
              </div>
            </div>
            <div className="space-y-1 max-h-[360px] overflow-y-auto">
              {filteredVessels.map((vessel) => (
                <label
                  key={vessel.id}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted cursor-pointer"
                >
                  <Checkbox
                    checked={selectedVesselIds.has(vessel.id)}
                    onCheckedChange={() => handleVesselToggle(vessel.id)}
                    className="h-4 w-4"
                  />
                  <Ship className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-sm truncate flex-1">{vessel.name}</span>
                </label>
              ))}
              {filteredVessels.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-2">
                  No vessels found
                </p>
              )}
            </div>
          </div>

          <Separator />

          {/* Severity Filters */}
          <div className="space-y-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Filters
            </span>
            <div className="space-y-1">
              {SEVERITY_FILTERS.map((filter) => (
                <label
                  key={filter.id}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted cursor-pointer"
                >
                  <Checkbox
                    checked={severityFilters.has(filter.id)}
                    onCheckedChange={() => handleSeverityToggle(filter.id)}
                    className="h-4 w-4"
                  />
                  <span className={cn("h-3 w-3 rounded-full", filter.color)} />
                  <span className="text-sm">{filter.label}</span>
                </label>
              ))}
            </div>
          </div>

          <Separator />

          {/* Fleet Groups */}
          <div className="space-y-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Fleet Groups
            </span>
            <div className="space-y-1">
              {FLEET_GROUPS.map((group) => (
                <label
                  key={group.id}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted cursor-pointer"
                >
                  <Checkbox
                    checked={fleetGroups.has(group.id)}
                    onCheckedChange={() => handleFleetGroupToggle(group.id)}
                    className="h-4 w-4"
                  />
                  <span className="text-sm flex-1">{group.label}</span>
                  <span className="text-xs text-muted-foreground">
                    ({fleetGroupCounts[group.id as keyof typeof fleetGroupCounts]})
                  </span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default VesselSelector;
