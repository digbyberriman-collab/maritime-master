import React from 'react';
import { cn } from '@/lib/utils';
import { Lock, Users as UsersIcon } from 'lucide-react';
import type { ItineraryEntry, TripType, STATUS_CONFIG } from '@/modules/itinerary/types';
import { STATUS_CONFIG as statusConfig } from '@/modules/itinerary/types';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface TripBlockProps {
  entry: ItineraryEntry;
  compact?: boolean;
  onClick?: (entry: ItineraryEntry) => void;
}

const TripBlock: React.FC<TripBlockProps> = ({ entry, compact = false, onClick }) => {
  const tripType = entry.trip_type as TripType | null;
  const colour = tripType?.colour || '#6B7280';
  const statusConf = statusConfig[entry.status];
  const isMultiVessel = (entry.vessels?.length || 0) > 1;

  const bgStyle: React.CSSProperties = {
    backgroundColor: `${colour}${Math.round(statusConf.opacity * 255).toString(16).padStart(2, '0')}`,
    borderLeft: `3px solid ${colour}`,
  };

  if (entry.status === 'draft') {
    bgStyle.borderStyle = 'dashed';
    bgStyle.borderWidth = '1px';
    bgStyle.borderColor = colour;
    bgStyle.backgroundColor = `${colour}15`;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={() => onClick?.(entry)}
          className={cn(
            'w-full text-left rounded px-2 py-1 text-xs transition-all hover:brightness-110 cursor-pointer',
            'flex items-center gap-1 min-h-[24px]',
            entry.status === 'cancelled' && 'line-through opacity-50',
            entry.status === 'completed' && 'opacity-60',
          )}
          style={bgStyle}
        >
          <span className="truncate font-medium text-foreground" style={{ fontSize: compact ? '10px' : '11px' }}>
            {entry.title}
          </span>
          <span className="flex-shrink-0 flex items-center gap-0.5">
            {entry.is_locked && <Lock className="w-3 h-3 text-muted-foreground" />}
            {isMultiVessel && <UsersIcon className="w-3 h-3 text-muted-foreground" />}
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">
        <div className="space-y-1">
          <p className="font-medium">{entry.title}</p>
          {entry.location && <p className="text-xs text-muted-foreground">{entry.location}{entry.country ? `, ${entry.country}` : ''}</p>}
          <p className="text-xs text-muted-foreground">{entry.start_date} → {entry.end_date}</p>
          <div className="flex items-center gap-2">
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{ backgroundColor: colour }}
            />
            <span className="text-xs">{tripType?.name || 'No type'}</span>
            <span className="text-xs px-1.5 py-0.5 rounded bg-muted">{statusConf.label}</span>
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
};

export default TripBlock;
