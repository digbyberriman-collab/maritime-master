import React, { useMemo, useRef } from 'react';
import {
  format,
  parseISO,
  differenceInDays,
  startOfMonth,
  endOfMonth,
  eachMonthOfInterval,
  addMonths,
  isToday,
  isSameMonth,
} from 'date-fns';
import { cn } from '@/lib/utils';
import { Lock, Users as UsersIcon } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { ItineraryEntry, ItineraryStatus, TripType } from '@/types/itinerary';
import { STATUS_CONFIG } from '@/types/itinerary';

interface TimelineViewProps {
  entries: ItineraryEntry[];
  vessels: { id: string; name: string }[];
  currentDate: Date;
  statusFilter: ItineraryStatus[];
  vesselFilter: string[];
  onSelectEntry: (entry: ItineraryEntry) => void;
}

const MONTHS_VISIBLE = 12;
const DAY_WIDTH = 4; // px per day
const ROW_HEIGHT = 56; // px per vessel row
const HEADER_HEIGHT = 48;

const TimelineView: React.FC<TimelineViewProps> = ({
  entries,
  vessels,
  currentDate,
  statusFilter,
  vesselFilter,
  onSelectEntry,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const months = useMemo(() => {
    const start = startOfMonth(currentDate);
    return eachMonthOfInterval({
      start,
      end: addMonths(start, MONTHS_VISIBLE - 1),
    });
  }, [currentDate]);

  const timelineStart = months[0];
  const timelineEnd = endOfMonth(months[months.length - 1]);
  const totalDays = differenceInDays(timelineEnd, timelineStart) + 1;
  const totalWidth = totalDays * DAY_WIDTH;

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
  const todayX = todayOffset * DAY_WIDTH;
  const showTodayLine = todayOffset >= 0 && todayOffset <= totalDays;

  const getEntryPosition = (entry: ItineraryEntry) => {
    const start = parseISO(entry.start_date);
    const end = parseISO(entry.end_date);
    const startOffset = Math.max(0, differenceInDays(start, timelineStart));
    const duration = Math.max(1, differenceInDays(end, start) + 1);
    const left = startOffset * DAY_WIDTH;
    const width = Math.min(duration * DAY_WIDTH, totalWidth - left);
    return { left, width };
  };

  const getVesselEntries = (vesselId: string) => {
    return filteredEntries.filter(entry =>
      entry.vessels?.some(ev => ev.vessel_id === vesselId)
    );
  };

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      <div className="flex flex-1 overflow-hidden">
        {/* Vessel labels (fixed left) */}
        <div className="flex-shrink-0 w-[140px] border-r border-border bg-card z-10">
          <div className="h-[48px] border-b border-border flex items-center px-3">
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
            {/* Month headers */}
            <div className="sticky top-0 z-10 flex bg-card border-b border-border" style={{ height: HEADER_HEIGHT }}>
              {months.map(month => {
                const monthStart = differenceInDays(month, timelineStart);
                const monthEnd = differenceInDays(endOfMonth(month), timelineStart);
                const monthWidth = (monthEnd - monthStart + 1) * DAY_WIDTH;
                const isCurrent = isSameMonth(month, new Date());

                return (
                  <div
                    key={format(month, 'yyyy-MM')}
                    className={cn(
                      'flex-shrink-0 border-r border-border flex items-center justify-center text-xs font-medium',
                      isCurrent ? 'text-primary bg-primary/5' : 'text-muted-foreground'
                    )}
                    style={{ width: monthWidth }}
                  >
                    {format(month, 'MMM yyyy')}
                  </div>
                );
              })}
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
                  {/* Month grid lines */}
                  {months.map(month => {
                    const offset = differenceInDays(month, timelineStart) * DAY_WIDTH;
                    return (
                      <div
                        key={format(month, 'yyyy-MM')}
                        className="absolute top-0 bottom-0 border-r border-border/30"
                        style={{ left: offset }}
                      />
                    );
                  })}

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
