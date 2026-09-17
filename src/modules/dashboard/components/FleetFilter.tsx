import React from 'react';
import { Ship } from 'lucide-react';
import { useVessel } from '@/modules/vessels/contexts/VesselContext';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/**
 * FleetFilter is bound to VesselContext (the single source of truth for the
 * active vessel scope) so changing it here updates every module.
 */
export const FleetFilter: React.FC = () => {
  const {
    vessels,
    selectedVesselId,
    isAllVessels,
    canAccessAllVessels,
    setSelectedVesselById,
    setAllVessels,
    loading,
  } = useVessel();

  if (loading || vessels.length === 0) return null;

  const currentValue = isAllVessels ? 'all' : selectedVesselId || '';

  function handleChange(value: string) {
    if (value === 'all') {
      setAllVessels();
    } else {
      setSelectedVesselById(value);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Ship className="w-4 h-4 text-muted-foreground" />
      <Select value={currentValue} onValueChange={handleChange}>
        <SelectTrigger className="w-[200px]">
          <SelectValue placeholder="Select vessel" />
        </SelectTrigger>
        <SelectContent>
          {canAccessAllVessels && <SelectItem value="all">All Vessels</SelectItem>}
          {vessels.map(vessel => (
            <SelectItem key={vessel.id} value={vessel.id}>
              {vessel.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};
