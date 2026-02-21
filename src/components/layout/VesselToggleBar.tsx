import React from 'react';
import { useVessel } from '@/contexts/VesselContext';
import { cn } from '@/lib/utils';
import { Ship } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const VESSEL_ABBREVIATIONS: Record<string, string> = {
  'M/Y DRAAK': 'DRAAK',
  'M/Y GAME CHANGER': 'GC',
  'M/Y LEVIATHAN': 'LEV',
  'M/Y ROCINANTE': 'ROC',
  'M/Y XIPHIAS': 'XIP',
  'R/V DAGON': 'DAG',
  'R/V HYDRA': 'HYD',
};

interface VesselToggleBarProps {
  className?: string;
}

const VesselToggleBar: React.FC<VesselToggleBarProps> = ({ className }) => {
  const {
    vessels,
    selectedVessel,
    isAllVessels,
    setSelectedVesselById,
    setAllVessels,
    loading,
  } = useVessel();

  const [activeVessels, setActiveVessels] = React.useState<Set<string>>(
    () => new Set(vessels.map(v => v.id))
  );

  React.useEffect(() => {
    if (isAllVessels) {
      setActiveVessels(new Set(vessels.map(v => v.id)));
    } else if (selectedVessel) {
      setActiveVessels(new Set([selectedVessel.id]));
    }
  }, [vessels, isAllVessels, selectedVessel]);

  const handleToggle = (vesselId: string) => {
    const newActive = new Set(activeVessels);
    if (newActive.has(vesselId)) {
      if (newActive.size > 1) {
        newActive.delete(vesselId);
      }
    } else {
      newActive.add(vesselId);
    }
    setActiveVessels(newActive);

    if (newActive.size === vessels.length) {
      setAllVessels();
    } else if (newActive.size === 1) {
      const [id] = newActive;
      setSelectedVesselById(id);
    }
  };

  if (loading || vessels.length === 0) return null;

  const activeCount = activeVessels.size;

  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      <Ship className="w-4 h-4 text-[#94A3B8] mr-1 hidden sm:block" />
      {vessels.map((vessel) => {
        const isActive = activeVessels.has(vessel.id);
        const abbrev = VESSEL_ABBREVIATIONS[vessel.name] || vessel.name.split(' ').pop();

        return (
          <Tooltip key={vessel.id}>
            <TooltipTrigger asChild>
              <button
                onClick={() => handleToggle(vessel.id)}
                className={cn(
                  'px-2 py-1 rounded text-xs font-semibold transition-all duration-200 min-h-[28px]',
                  isActive
                    ? 'bg-[#3B82F6]/20 text-[#3B82F6] border border-[#3B82F6]/50'
                    : 'bg-[#1A2740]/50 text-[#94A3B8] border border-[#94A3B8]/30 opacity-60 hover:opacity-80'
                )}
              >
                {abbrev}
                {isActive && <span className="ml-0.5 inline-block w-1.5 h-1.5 rounded-full bg-[#22C55E]" />}
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{vessel.name}</p>
            </TooltipContent>
          </Tooltip>
        );
      })}
      <span className="text-xs text-[#94A3B8] ml-1.5 hidden sm:inline">
        {activeCount}/{vessels.length}
      </span>
    </div>
  );
};

export default VesselToggleBar;
