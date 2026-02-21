import React, { useMemo, useRef, useEffect } from 'react';
import {
  format,
  parseISO,
  differenceInDays,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachMonthOfInterval,
  eachWeekOfInterval,
  eachDayOfInterval,
  addMonths,
  addWeeks,
  addDays,
  isSameMonth,
  isSameDay,
  isWeekend,
} from 'date-fns';
import { cn } from '@/lib/utils';
import { Lock, Users as UsersIcon } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { ItineraryEntry, ItineraryStatus, TripType, ViewMode } from '@/modules/itinerary/types';
import { STATUS_CONFIG } from '@/modules/itinerary/types';

interface TimelineViewProps {
  entries: ItineraryEntry[];
  vessels: { id: string; name: string }[];
  currentDate: Date;
  viewMode?: ViewMode;
  statusFilter: ItineraryStatus[];
  vesselFilter: string[];
  onSelectEntry: (entry: ItineraryEntry) => void;
}

const ROW_HEIGHT = 56;
const HEADER_HEIGHT = 48;

/** Per-mode config: how many days to show and pixel width per day */
function getViewConfig(viewMode: ViewMode) {
  switch (viewMode) {
    case 'day':
      return { dayWidth: 48 };
    case 'week':
      return { dayWidth: 24 };
    case 'quarter':
      return { dayWidth: 12 };
    case 'month':
      return { dayWidth: 32 };   // single month, detailed
    case 'year':
    default:
      return { dayWidth: 2 };    // 12 months compressed
  }
}

function getTimelineRange(viewMode: ViewMode, currentDate: Date) {
  switch (viewMode) {
    case 'day': {
      const start = startOfWeek(currentDate, { weekStartsOn: 1 });
      const end = addDays(start, 6);
      return { start, end };
    }
    case 'week': {
      const start = startOfWeek(currentDate, { weekStartsOn: 1 });
      const end = addDays(start, 27); // 4 weeks
      return { start, end };
    }
    case 'quarter': {
      const start = startOfMonth(currentDate);
      const end = endOfMonth(addMonths(start, 2));
      return { start, end };
    }
    case 'month': {
      const start = startOfMonth(currentDate);
      const end = endOfMonth(start); // single month
      return { start, end };
    }
    case 'year':
    default: {
      const start = startOfMonth(currentDate);
      const end = endOfMonth(addMonths(start, 11)); // 12 months
      return { start, end };
    }
  }
}

const TimelineView: React.FC<TimelineViewProps> = ({
  entries,
  vessels,
  currentDate,
  viewMode = 'month',
  statusFilter,
  vesselFilter,
  onSelectEntry,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const { dayWidth } = getViewConfig(viewMode);
  const { start: timelineStart, end: timelineEnd } = useMemo(
    () => getTimelineRange(viewMode, currentDate),
    [viewMode, currentDate]
  );
  const totalDays = differenceInDays(timelineEnd, timelineStart) + 1;
  const totalWidth = totalDays * dayWidth;

  // Generate header segments based on view mode
  const headerSegments = useMemo(() => {
    if (viewMode === 'day' || viewMode === 'week' || viewMode === 'month') {
      // Individual days
      return eachDayOfInterval({ start: timelineStart, end: timelineEnd }).map(day => ({
        key: format(day, 'yyyy-MM-dd'),
        label: viewMode === 'day'
          ? format(day, 'EEE d MMM')
          : viewMode === 'month'
            ? format(day, 'd')
            : format(day, 'EEE d'),
        startOffset: differenceInDays(day, timelineStart),
        days: 1,
        isCurrent: isSameDay(day, new Date()),
        isWeekend: isWeekend(day),
      }));
    }
    // Quarter & month: month-based headers
    const months = eachMonthOfInterval({ start: timelineStart, end: timelineEnd });
    return months.map(month => {
      const monthStart = differenceInDays(month, timelineStart);
      const monthEnd = differenceInDays(endOfMonth(month), timelineStart);
      return {
        key: format(month, 'yyyy-MM'),
        label: viewMode === 'quarter' ? format(month, 'MMMM yyyy') : format(month, 'MMM yyyy'),
        startOffset: monthStart,
        days: monthEnd - monthStart + 1,
        isCurrent: isSameMonth(month, new Date()),
        isWeekend: false,
      };
    });
  }, [viewMode, timelineStart, timelineEnd]);

  // Week group headers for week view (shown above day headers)
  const weekGroups = useMemo(() => {
    if (viewMode !== 'week') return [];
    const weeks = eachWeekOfInterval(
      { start: timelineStart, end: timelineEnd },
      { weekStartsOn: 1 }
    );
    return weeks.map(weekStart => {
      const weekEnd = addDays(weekStart, 6);
      const startOffset = Math.max(0, differenceInDays(weekStart, timelineStart));
      const endOffset = Math.min(totalDays - 1, differenceInDays(weekEnd, timelineStart));
      return {
        key: format(weekStart, 'yyyy-ww'),
        label: `${format(weekStart, 'd MMM')} – ${format(weekEnd, 'd MMM')}`,
        startOffset,
        days: endOffset - startOffset + 1,
      };
    });
  }, [viewMode, timelineStart, timelineEnd, totalDays]);

  // Grid lines for vessel rows
  const gridLines = useMemo(() => {
    if (viewMode === 'day' || viewMode === 'week' || viewMode === 'month') {
      return eachDayOfInterval({ start: timelineStart, end: timelineEnd }).map(day => ({
        key: format(day, 'yyyy-MM-dd'),
        offset: differenceInDays(day, timelineStart) * dayWidth,
        isWeekend: isWeekend(day),
      }));
    }
    // Quarter & year: line per month
    const months = eachMonthOfInterval({ start: timelineStart, end: timelineEnd });
    return months.map(month => ({
      key: format(month, 'yyyy-MM'),
      offset: differenceInDays(month, timelineStart) * dayWidth,
      isWeekend: false,
    }));
  }, [viewMode, timelineStart, timelineEnd, dayWidth]);

  const visibleVessels = useMemo(() =>
    vessels.filter(v => vesselFilter.includes(v.id)),
    [vessels, vesselFilter]
  );

  const filteredEntries = useMemo(() =>
    entries.filter(e => statusFilter.includes(e.status)),
    [entries, statusFilter]
  );

  // Today position
  const todayOffset = differenceInDays(new Date(), timelineStart);
  const todayX = todayOffset * dayWidth;
  const showTodayLine = todayOffset >= 0 && todayOffset <= totalDays;

  // Auto-scroll to today on mount / view change
  useEffect(() => {
    if (containerRef.current && showTodayLine) {
      const scrollTarget = Math.max(0, todayX - containerRef.current.clientWidth / 3);
      containerRef.current.scrollLeft = scrollTarget;
    }
  }, [viewMode, currentDate]);

  const getEntryPosition = (entry: ItineraryEntry) => {
    const start = parseISO(entry.start_date);
    const end = parseISO(entry.end_date);
    const startOffset = Math.max(0, differenceInDays(start, timelineStart));
    const duration = Math.max(1, differenceInDays(end, start) + 1);
    const left = startOffset * dayWidth;
    const width = Math.min(duration * dayWidth, totalWidth - left);
    return { left, width };
  };

  const getVesselEntries = (vesselId: string) => {
    return filteredEntries.filter(entry =>
      entry.vessels?.some(ev => ev.vessel_id === vesselId)
    );
  };

  const showDualHeaders = viewMode === 'week';
  const topHeaderHeight = showDualHeaders ? 24 : 0;
  const mainHeaderHeight = HEADER_HEIGHT;
  const fullHeaderHeight = topHeaderHeight + mainHeaderHeight;

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      <div className="flex flex-1 overflow-hidden">
        {/* Vessel labels (fixed left) */}
        <div className="flex-shrink-0 w-[140px] border-r border-border bg-card z-10">
          <div className="border-b border-border flex items-center px-3" style={{ height: fullHeaderHeight }}>
            <span className="text-xs font-semibold text-muted-foreground">Vessel</span>
          </div>
          {visibleVessels.map(vessel => (
            <div
              key={vessel.id}
              className="flex items-center px-3 border-b border-border text-xs font-medium text-foreground"
              style={{ height: ROW_HEIGHT }}
            >
              <span className="truncate">{vessel.name.replace('M/Y ', '').replace('R/V ', '')}</span>
            </div>
          ))}
        </div>

        {/* Timeline area (scrollable) */}
        <div ref={containerRef} className="flex-1 overflow-x-auto overflow-y-auto">
          <div style={{ width: totalWidth, minWidth: '100%' }} className="relative">
            {/* Week group headers (week view only) */}
            {showDualHeaders && (
              <div className="sticky top-0 z-10 flex bg-card border-b border-border" style={{ height: topHeaderHeight }}>
                {weekGroups.map(wg => (
                  <div
                    key={wg.key}
                    className="flex-shrink-0 border-r border-border flex items-center justify-center text-[10px] font-semibold text-muted-foreground"
                    style={{ width: wg.days * dayWidth }}
                  >
                    {wg.label}
                  </div>
                ))}
              </div>
            )}

            {/* Main headers */}
            <div
              className={cn('sticky z-10 flex bg-card border-b border-border', showDualHeaders ? 'top-[24px]' : 'top-0')}
              style={{ height: mainHeaderHeight }}
            >
              {headerSegments.map(seg => (
                <div
                  key={seg.key}
                  className={cn(
                    'flex-shrink-0 border-r border-border flex items-center justify-center text-xs font-medium',
                    seg.isCurrent ? 'text-primary bg-primary/5' : 'text-muted-foreground',
                    seg.isWeekend && 'bg-muted/30',
                  )}
                  style={{ width: seg.days * dayWidth }}
                >
                  {seg.label}
                </div>
              ))}
            </div>

            {/* Vessel rows */}
            {visibleVessels.map(vessel => {
              const vesselEntries = getVesselEntries(vessel.id);

              return (
                <div
                  key={vessel.id}
                  className="relative border-b border-border"
                  style={{ height: ROW_HEIGHT }}
                >
                  {/* Grid lines */}
                  {gridLines.map(gl => (
                    <div
                      key={gl.key}
                      className={cn(
                        'absolute top-0 bottom-0 border-r',
                        gl.isWeekend ? 'border-border/20 bg-muted/10' : 'border-border/30'
                      )}
                      style={{ left: gl.offset, width: gl.isWeekend ? dayWidth : undefined }}
                    />
                  ))}

                  {/* Entry bars */}
                  {vesselEntries.map(entry => {
                    const { left, width } = getEntryPosition(entry);
                    const tripType = entry.trip_type as TripType | null;
                    const colour = tripType?.colour || '#6B7280';
                    const sc = STATUS_CONFIG[entry.status];
                    const isMultiVessel = (entry.vessels?.length || 0) > 1;

                    return (
                      <Tooltip key={entry.id}>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() => onSelectEntry(entry)}
                            className={cn(
                              'absolute top-2 rounded-sm cursor-pointer transition-all hover:brightness-110 flex items-center gap-1 px-1 overflow-hidden',
                              entry.status === 'cancelled' && 'line-through',
                              entry.status === 'draft' && 'border border-dashed',
                            )}
                            style={{
                              left,
                              width: Math.max(width, 8),
                              height: ROW_HEIGHT - 16,
                              backgroundColor: `${colour}${Math.round(sc.opacity * 200).toString(16).padStart(2, '0')}`,
                              borderColor: entry.status === 'draft' ? colour : 'transparent',
                              borderLeft: `3px solid ${colour}`,
                            }}
                          >
                            {width > 40 && (
                              <span className="text-[10px] font-medium text-foreground truncate">
                                {entry.title}
                              </span>
                            )}
                            {entry.is_locked && <Lock className="w-2.5 h-2.5 text-muted-foreground flex-shrink-0" />}
                            {isMultiVessel && <UsersIcon className="w-2.5 h-2.5 text-muted-foreground flex-shrink-0" />}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs">
                          <p className="font-medium">{entry.title}</p>
                          {entry.location && <p className="text-xs text-muted-foreground">{entry.location}</p>}
                          <p className="text-xs text-muted-foreground">{entry.start_date} → {entry.end_date}</p>
                          <div className="flex items-center gap-1 mt-1">
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: colour }} />
                            <span className="text-xs">{tripType?.name}</span>
                            <span className="text-xs px-1 rounded bg-muted capitalize">{entry.status}</span>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </div>
              );
            })}

            {/* Today line */}
            {showTodayLine && (
              <div
                className="absolute top-0 bottom-0 w-px bg-primary z-20 pointer-events-none"
                style={{ left: todayX }}
              >
                <div className="absolute -top-0 -left-2 w-4 h-3 bg-primary rounded-b text-[8px] text-primary-foreground flex items-center justify-center font-bold">
                  T
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TimelineView;
