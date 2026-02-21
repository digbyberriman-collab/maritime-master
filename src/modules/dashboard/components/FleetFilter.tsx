import React from 'react';
import { Ship } from 'lucide-react';
import { useDashboardStore } from '@/modules/dashboard/store/dashboardStore';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export const FleetFilter: React.FC = () => {
  const { 
    selectedVesselId, 
    isAllVessels, 
    userVessels, 
    canViewAllVessels,
    setSelectedVessel,
    setAllVessels,
  } = useDashboardStore();

  if (!canViewAllVessels) return null;

  const currentValue = isAllVessels ? 'all' : selectedVesselId || '';

  function handleChange(value: string) {
    if (value === 'all') {
      setAllVessels(true);
    } else {
      setSelectedVessel(value);
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
          <SelectItem value="all">
            All Vessels
          </SelectItem>
          {userVessels.map(vessel => (
            <SelectItem key={vessel.id} value={vessel.id}>
              {vessel.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};
