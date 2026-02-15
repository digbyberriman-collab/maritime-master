import React, { useRef, useCallback, useState } from 'react';
import { cn } from '@/lib/utils';
import { Lock, Users as UsersIcon } from 'lucide-react';
import { format, parseISO } from 'date-fns';
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
  /** horizontal lane index for staggering overlapping blocks */
  laneIndex?: number;
  /** total number of lanes in the overlap group */
  totalLanes?: number;
  onClick?: (entry: ItineraryEntry) => void;
  onDateChange?: (entryId: string, newStart: string, newEnd: string) => void;
}

function pctToDate(pct: number, periodStart: Date, periodEnd: Date): Date {
  const ms = periodStart.getTime() + pct / 100 * (periodEnd.getTime() - periodStart.getTime());
  return new Date(ms);
}

function formatDateStr(d: Date): string {
  return d.toISOString().split('T')[0];
}

const DraggableTripBlock: React.FC<DraggableTripBlockProps> = ({
  entry,
  topPct,
  heightPct,
  periodStart,
  periodEnd,
  laneIndex = 0,
  totalLanes = 1,
  onClick,
  onDateChange,
}) => {
  const tripType = entry.trip_type as TripType | null;
  const colour = tripType?.colour || '#6B7280';
  const statusConf = STATUS_CONFIG[entry.status];
  const isMultiVessel = (entry.vessels?.length || 0) > 1;
  const isLocked = entry.is_locked || entry.status === 'completed';

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
  const didDragRef = useRef(false);

  const blockRef = useRef<HTMLDivElement>(null);

  // Sync from props when not dragging
  React.useEffect(() => {
    if (!isDragging) {
      setLiveTop(topPct);
      setLiveHeight(heightPct);
    }
  }, [topPct, heightPct, isDragging]);

  const handleMouseDown = useCallback((e: React.MouseEvent, mode: DragMode) => {
    if (isLocked) return;
    e.preventDefault();
    e.stopPropagation();
    const container = blockRef.current?.parentElement;
    if (!container) return;
    didDragRef.current = false;
    setDragState({
      mode,
      startY: e.clientY,
      origTop: liveTop,
      origHeight: liveHeight,
      containerHeight: container.getBoundingClientRect().height,
    });
  }, [liveTop, liveHeight, isLocked]);

  React.useEffect(() => {
    if (!dragState) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaY = e.clientY - dragState.startY;
      if (Math.abs(deltaY) > 3) didDragRef.current = true;
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
      if (didDragRef.current) {
        const newStart = pctToDate(liveTop, periodStart, periodEnd);
        const newEnd = pctToDate(liveTop + liveHeight, periodStart, periodEnd);
        onDateChange?.(entry.id, formatDateStr(newStart), formatDateStr(newEnd));
      }
      setDragState(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragState, liveTop, liveHeight, periodStart, periodEnd, entry.id, onDateChange]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (!didDragRef.current) {
      onClick?.(entry);
    }
  }, [onClick, entry]);

  // Stagger positioning: divide the cell width among overlapping lanes
  const laneWidthPct = totalLanes > 1 ? 100 / totalLanes : 100;
  const laneLeftPct = totalLanes > 1 ? laneIndex * laneWidthPct : 0;

  // Formatted dates for display inside block
  const startLabel = (() => {
    try { return format(parseISO(entry.start_date), 'd MMM'); } catch { return ''; }
  })();
  const endLabel = (() => {
    try { return format(parseISO(entry.end_date), 'd MMM'); } catch { return ''; }
  })();

  return (
    <div
      ref={blockRef}
      className="absolute z-10"
      style={{
        top: `${liveTop}%`,
        height: `${liveHeight}%`,
        minHeight: '24px',
        left: totalLanes > 1 ? `${laneLeftPct}%` : '2px',
        width: totalLanes > 1 ? `${laneWidthPct}%` : 'calc(100% - 4px)',
      }}
    >
      {/* Top resize handle — large hit area */}
      {!isLocked && (
        <div
          onMouseDown={(e) => handleMouseDown(e, 'resize-top')}
          className="absolute top-0 left-0 right-0 h-2 cursor-n-resize z-20 group/handle"
          style={{ marginTop: '-4px' }}
        >
          <div className="absolute inset-x-1 top-1/2 h-[2px] bg-foreground/0 group-hover/handle:bg-foreground/50 rounded transition-colors" />
        </div>
      )}

      {/* Main block */}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onMouseDown={(e) => handleMouseDown(e, 'move')}
            onClick={handleClick}
            className={cn(
              'w-full h-full text-left rounded px-1.5 py-0.5 text-xs transition-all overflow-hidden',
              isLocked ? 'cursor-default' : 'cursor-grab active:cursor-grabbing',
              'flex flex-col justify-start gap-0',
              isDragging && 'shadow-lg ring-2 ring-primary/40',
              entry.status === 'cancelled' && 'line-through',
            )}
            style={{
              backgroundColor: `${colour}CC`, // 80% opacity background
              borderLeft: `3px solid ${colour}`,
              ...(entry.status === 'draft' ? {
                borderStyle: 'dashed',
                borderWidth: '1px',
                borderColor: colour,
                backgroundColor: `${colour}33`,
              } : {}),
            }}
          >
            <span className="truncate font-semibold text-foreground text-[11px] leading-tight" style={{ opacity: 0.9 }}>
              {entry.title}
            </span>
            {entry.location && (
              <span className="truncate text-[9px] text-foreground/80 leading-tight">
                {entry.location}{entry.country ? `, ${entry.country}` : ''}
              </span>
            )}
            <span className="truncate text-[8px] text-foreground/70 leading-tight">
              {startLabel} – {endLabel}
            </span>
            {tripType && (
              <span className="truncate text-[8px] text-foreground/70 leading-tight">
                {tripType.name}
              </span>
            )}
            <span className="flex-shrink-0 flex items-center gap-0.5 mt-auto">
              {entry.is_locked && <Lock className="w-2.5 h-2.5 text-foreground/60" />}
              {isMultiVessel && <UsersIcon className="w-2.5 h-2.5 text-foreground/60" />}
              {statusConf.label !== 'Confirmed' && (
                <span className="text-[7px] text-foreground/60 uppercase tracking-wide">{statusConf.label}</span>
              )}
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

      {/* Bottom resize handle — large hit area */}
      {!isLocked && (
        <div
          onMouseDown={(e) => handleMouseDown(e, 'resize-bottom')}
          className="absolute bottom-0 left-0 right-0 h-2 cursor-s-resize z-20 group/handle"
          style={{ marginBottom: '-4px' }}
        >
          <div className="absolute inset-x-1 bottom-1/2 h-[2px] bg-foreground/0 group-hover/handle:bg-foreground/50 rounded transition-colors" />
        </div>
      )}
    </div>
  );
};

export default DraggableTripBlock;
