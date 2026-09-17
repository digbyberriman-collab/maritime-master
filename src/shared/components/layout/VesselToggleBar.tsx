import React from 'react';
import { useVessel } from '@/modules/vessels/contexts/VesselContext';
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

/**
 * Quick vessel scope switcher. Reflects VesselContext directly — one active
 * vessel (or all vessels) at a time, so a click here changes scope app-wide.
 */
const VesselToggleBar: React.FC<VesselToggleBarProps> = ({ className }) => {
  const {
    vessels,
    selectedVessel,
    isAllVessels,
    setSelectedVesselById,
    setAllVessels,
    canAccessAllVessels,
    loading,
  } = useVessel();

  if (loading || vessels.length === 0) return null;

  const pill = (active: boolean) =>
    cn(
      'px-2 py-1 rounded text-xs font-semibold transition-all duration-200 min-h-[28px]',
      active
        ? 'bg-[#3B82F6]/20 text-[#3B82F6] border border-[#3B82F6]/50'
        : 'bg-[#1A2740]/50 text-[#94A3B8] border border-[#94A3B8]/30 opacity-60 hover:opacity-80'
    );

  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      <Ship className="w-4 h-4 text-[#94A3B8] mr-1 hidden sm:block" />

      {canAccessAllVessels && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button onClick={() => setAllVessels()} className={pill(isAllVessels)}>
              ALL
            </button>
          </TooltipTrigger>
          <TooltipContent>
            <p>All vessels (fleet-wide)</p>
          </TooltipContent>
        </Tooltip>
      )}

      {vessels.map((vessel) => {
        const isActive = !isAllVessels && selectedVessel?.id === vessel.id;
        const abbrev = VESSEL_ABBREVIATIONS[vessel.name] || vessel.name.split(' ').pop();

        return (
          <Tooltip key={vessel.id}>
            <TooltipTrigger asChild>
              <button
                onClick={() => setSelectedVesselById(vessel.id)}
                className={pill(isActive)}
              >
                {abbrev}
                {isActive && (
                  <span className="ml-0.5 inline-block w-1.5 h-1.5 rounded-full bg-[#22C55E]" />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{vessel.name}</p>
            </TooltipContent>
          </Tooltip>
        );
      })}

      <span className="text-xs text-[#94A3B8] ml-1.5 hidden sm:inline">
        {isAllVessels ? `${vessels.length}/${vessels.length}` : `1/${vessels.length}`}
      </span>
    </div>
  );
};

export default VesselToggleBar;
