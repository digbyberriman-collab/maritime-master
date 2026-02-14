import React, { useRef, useCallback, useState } from 'react';
import { cn } from '@/lib/utils';
import { Lock, Users as UsersIcon, GripVertical } from 'lucide-react';
import type { ItineraryEntry, TripType } from '@/types/itinerary';
import { STATUS_CONFIG } from '@/types/itinerary';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

type DragMode = 'move' | 'resize-top' | 'resize-bottom' | null;

interface DraggableTripBlockProps {
  entry: ItineraryEntry;
  topPct: number;
  heightPct: number;
  periodStart: Date;
  periodEnd: Date;
  onClick?: (entry: ItineraryEntry) => void;
  onDateChange?: (entryId: string, newStart: string, newEnd: string) => void;
}

function pctToDate(pct: number, periodStart: Date, periodEnd: Date): Date {
  const ms = periodStart.getTime() + pct / 100 * (periodEnd.getTime() - periodStart.getTime());
  return new Date(ms);
}

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

const DraggableTripBlock: React.FC<DraggableTripBlockProps> = ({
  entry,
  topPct,
  heightPct,
  periodStart,
  periodEnd,
  onClick,
  onDateChange,
}) => {
  const tripType = entry.trip_type as TripType | null;
  const colour = tripType?.colour || '#6B7280';
  const statusConf = STATUS_CONFIG[entry.status];
  const isMultiVessel = (entry.vessels?.length || 0) > 1;

  const [dragState, setDragState] = useState<{
    mode: DragMode;
    startY: number;
    origTop: number;
    origHeight: number;
    containerHeight: number;
  } | null>(null);

  const [liveTop, setLiveTop] = useState(topPct);
  const [liveHeight, setLiveHeight] = useState(heightPct);
  const isDragging = dragState !== null;

  const blockRef = useRef<HTMLDivElement>(null);

  // Sync from props when not dragging
  React.useEffect(() => {
    if (!isDragging) {
      setLiveTop(topPct);
      setLiveHeight(heightPct);
    }
  }, [topPct, heightPct, isDragging]);

  const handleMouseDown = useCallback((e: React.MouseEvent, mode: DragMode) => {
    e.preventDefault();
    e.stopPropagation();
    const container = blockRef.current?.parentElement;
    if (!container) return;
    setDragState({
      mode,
      startY: e.clientY,
      origTop: liveTop,
      origHeight: liveHeight,
      containerHeight: container.getBoundingClientRect().height,
    });
  }, [liveTop, liveHeight]);

  React.useEffect(() => {
    if (!dragState) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaY = e.clientY - dragState.startY;
      const deltaPct = (deltaY / dragState.containerHeight) * 100;

      if (dragState.mode === 'move') {
        const newTop = Math.max(0, Math.min(100 - dragState.origHeight, dragState.origTop + deltaPct));
        setLiveTop(newTop);
      } else if (dragState.mode === 'resize-top') {
        const newTop = Math.max(0, dragState.origTop + deltaPct);
        const newHeight = dragState.origHeight - (newTop - dragState.origTop);
        if (newHeight > 1) {
          setLiveTop(newTop);
          setLiveHeight(newHeight);
        }
      } else if (dragState.mode === 'resize-bottom') {
        const newHeight = Math.max(1, dragState.origHeight + deltaPct);
        const capped = Math.min(newHeight, 100 - liveTop);
        setLiveHeight(capped);
      }
    };

    const handleMouseUp = () => {
      // Calculate new dates
      const newStart = pctToDate(liveTop, periodStart, periodEnd);
      const newEnd = pctToDate(liveTop + liveHeight, periodStart, periodEnd);
      setDragState(null);
      onDateChange?.(entry.id, formatDate(newStart), formatDate(newEnd));
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragState, liveTop, liveHeight, periodStart, periodEnd, entry.id, onDateChange]);

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
    <div
      ref={blockRef}
      className="absolute left-0.5 right-0.5 z-10"
      style={{
        top: `${liveTop}%`,
        height: `${liveHeight}%`,
        minHeight: '20px',
      }}
    >
      {/* Top resize handle */}
      <div
        onMouseDown={(e) => handleMouseDown(e, 'resize-top')}
        className="absolute top-0 left-0 right-0 h-1.5 cursor-n-resize z-20 group/handle"
      >
        <div className="absolute inset-x-2 top-0 h-0.5 bg-foreground/0 group-hover/handle:bg-foreground/40 rounded transition-colors" />
      </div>

      {/* Main block */}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onMouseDown={(e) => handleMouseDown(e, 'move')}
            onClick={(e) => {
              if (!isDragging) onClick?.(entry);
            }}
            className={cn(
              'w-full h-full text-left rounded px-1.5 py-0.5 text-xs transition-all cursor-grab active:cursor-grabbing',
              'flex flex-col justify-start overflow-hidden',
              isDragging && 'opacity-80 shadow-lg ring-2 ring-primary/40',
              entry.status === 'cancelled' && 'line-through opacity-50',
              entry.status === 'completed' && 'opacity-60',
            )}
            style={bgStyle}
          >
            <span className="truncate font-medium text-foreground text-[11px] leading-tight">
              {entry.title}
            </span>
            {entry.location && (
              <span className="truncate text-[9px] text-muted-foreground leading-tight">
                {entry.location}
              </span>
            )}
            <span className="flex-shrink-0 flex items-center gap-0.5 mt-auto">
              {entry.is_locked && <Lock className="w-2.5 h-2.5 text-muted-foreground" />}
              {isMultiVessel && <UsersIcon className="w-2.5 h-2.5 text-muted-foreground" />}
            </span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" className="max-w-xs">
          <div className="space-y-1">
            <p className="font-medium">{entry.title}</p>
            {entry.location && <p className="text-xs text-muted-foreground">{entry.location}{entry.country ? `, ${entry.country}` : ''}</p>}
            <p className="text-xs text-muted-foreground">{entry.start_date} → {entry.end_date}</p>
            <div className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: colour }} />
              <span className="text-xs">{tripType?.name || 'No type'}</span>
              <span className="text-xs px-1.5 py-0.5 rounded bg-muted">{statusConf.label}</span>
            </div>
          </div>
        </TooltipContent>
      </Tooltip>

      {/* Bottom resize handle */}
      <div
        onMouseDown={(e) => handleMouseDown(e, 'resize-bottom')}
        className="absolute bottom-0 left-0 right-0 h-1.5 cursor-s-resize z-20 group/handle"
      >
        <div className="absolute inset-x-2 bottom-0 h-0.5 bg-foreground/0 group-hover/handle:bg-foreground/40 rounded transition-colors" />
      </div>
    </div>
  );
};

export default DraggableTripBlock;
