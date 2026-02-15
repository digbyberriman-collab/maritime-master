import React, { useMemo, useCallback } from 'react';
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachMonthOfInterval,
  eachWeekOfInterval,
  eachDayOfInterval,
  parseISO,
  isSameMonth,
  isToday as isDateToday,
  addMonths,
  addWeeks,
  addDays,
  getDaysInMonth,
  getDay,
} from 'date-fns';
import { cn } from '@/lib/utils';
import { Plus } from 'lucide-react';
import DraggableTripBlock from './DraggableTripBlock';
import { useUpdateEntry } from '@/hooks/useItinerary';
import type { ItineraryEntry, ViewMode, ItineraryStatus } from '@/types/itinerary';

interface PlanningGridProps {
  entries: ItineraryEntry[];
  vessels: { id: string; name: string }[];
  viewMode: ViewMode;
  currentDate: Date;
  statusFilter: ItineraryStatus[];
  vesselFilter: string[];
  onSelectEntry: (entry: ItineraryEntry) => void;
  onCreateEntry: (vesselId: string, date: string) => void;
}

const DAY_HEIGHT = 22; // px per day in month view

const PlanningGrid: React.FC<PlanningGridProps> = ({
  entries,
  vessels,
  viewMode,
  currentDate,
  statusFilter,
  vesselFilter,
  onSelectEntry,
  onCreateEntry,
}) => {
  const updateEntry = useUpdateEntry();

  // Build time periods based on view mode
  const timePeriods = useMemo(() => {
    const periodsCount = viewMode === 'month' ? 12 : viewMode === 'week' ? 12 : 28;

    if (viewMode === 'month') {
      const start = startOfMonth(currentDate);
      return eachMonthOfInterval({
        start,
        end: addMonths(start, periodsCount - 1),
      }).map(d => ({
        key: format(d, 'yyyy-MM'),
        label: format(d, 'MMM yyyy'),
        shortLabel: format(d, 'MMM'),
        start: startOfMonth(d),
        end: endOfMonth(d),
        isToday: isSameMonth(d, new Date()),
        days: getDaysInMonth(d),
      }));
    }

    if (viewMode === 'week') {
      const start = startOfWeek(currentDate, { weekStartsOn: 1 });
      return eachWeekOfInterval(
        { start, end: addWeeks(start, periodsCount - 1) },
        { weekStartsOn: 1 }
      ).map(d => ({
        key: format(d, 'yyyy-ww'),
        label: `${format(d, 'MMM d')} – ${format(endOfWeek(d, { weekStartsOn: 1 }), 'MMM d')}`,
        shortLabel: format(d, 'MMM d'),
        start: d,
        end: endOfWeek(d, { weekStartsOn: 1 }),
        isToday: false,
        days: 7,
      }));
    }

    // Day view
    const start = currentDate;
    return eachDayOfInterval({
      start,
      end: addDays(start, periodsCount - 1),
    }).map(d => ({
      key: format(d, 'yyyy-MM-dd'),
      label: format(d, 'EEE, MMM d'),
      shortLabel: format(d, 'EEE d'),
      start: d,
      end: d,
      isToday: isDateToday(d),
      days: 1,
    }));
  }, [viewMode, currentDate]);

  // Filter vessels
  const visibleVessels = useMemo(() =>
    vessels.filter(v => vesselFilter.includes(v.id)),
    [vessels, vesselFilter]
  );

  // Filter entries
  const filteredEntries = useMemo(() =>
    entries.filter(e => statusFilter.includes(e.status)),
    [entries, statusFilter]
  );

  // Get entries for a vessel + time period, with vertical positioning and lane staggering
  const getEntriesForCell = useCallback((vesselId: string, period: typeof timePeriods[0]) => {
    const periodStart = period.start.getTime();
    const periodEnd = period.end.getTime();
    const periodDuration = periodEnd - periodStart || 1;

    const items = filteredEntries
      .filter(entry => {
        const hasVessel = entry.vessels?.some(ev => ev.vessel_id === vesselId);
        if (!hasVessel) return false;
        const entryStart = parseISO(entry.start_date);
        const entryEnd = parseISO(entry.end_date);
        return entryStart <= period.end && entryEnd >= period.start;
      })
      .map(entry => {
        const entryStart = Math.max(parseISO(entry.start_date).getTime(), periodStart);
        const entryEnd = Math.min(parseISO(entry.end_date).getTime(), periodEnd);
        const topPct = ((entryStart - periodStart) / periodDuration) * 100;
        const heightPct = Math.max(((entryEnd - entryStart) / periodDuration) * 100, 3);
        return { entry, topPct, heightPct, laneIndex: 0, totalLanes: 1 };
      });

    // Compute overlap lanes: assign each item to the first lane where it doesn't overlap
    if (items.length > 1) {
      // Sort by topPct
      items.sort((a, b) => a.topPct - b.topPct);
      const lanes: { endPct: number }[] = [];
      for (const item of items) {
        const itemEnd = item.topPct + item.heightPct;
        let placed = false;
        for (let l = 0; l < lanes.length; l++) {
          if (item.topPct >= lanes[l].endPct) {
            item.laneIndex = l;
            lanes[l].endPct = itemEnd;
            placed = true;
            break;
          }
        }
        if (!placed) {
          item.laneIndex = lanes.length;
          lanes.push({ endPct: itemEnd });
        }
      }
      const totalLanes = lanes.length;
      items.forEach(it => { it.totalLanes = totalLanes; });
    }

    return items;
  }, [filteredEntries]);

  const handleDateChange = useCallback((entryId: string, newStart: string, newEnd: string) => {
    updateEntry.mutate({ id: entryId, start_date: newStart, end_date: newEnd });
  }, [updateEntry]);

  if (visibleVessels.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
        No vessels selected. Use the filter to show vessel columns.
      </div>
    );
  }

  return (
    <div className="overflow-auto flex-1">
      <table className="w-full border-collapse min-w-[600px]">
        {/* Header: vessel names */}
        <thead className="sticky top-0 z-20 bg-card">
          <tr>
            <th className="sticky left-0 z-30 bg-card border-b border-r border-border px-1 py-2 text-left text-xs font-semibold text-muted-foreground w-[56px] min-w-[56px]">
              Period
            </th>
            {visibleVessels.map(vessel => (
              <th
                key={vessel.id}
                className="border-b border-r border-border px-2 py-2 text-center text-xs font-semibold text-foreground min-w-[160px]"
              >
                {vessel.name.replace('M/Y ', '').replace('R/V ', '')}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {timePeriods.map(period => {
            // Cell height based on days in period
            const cellHeight = Math.max(period.days * DAY_HEIGHT, 60);

            return (
              <tr key={period.key} className={cn(period.isToday && 'bg-primary/5')}>
                {/* Time label */}
                <td className={cn(
                  'sticky left-0 z-10 bg-card border-b border-r border-border px-0 py-0 text-xs font-medium whitespace-nowrap align-top',
                  period.isToday ? 'text-primary bg-primary/5' : 'text-muted-foreground'
                )} style={{ height: cellHeight }}>
                  {/* Month label pinned at top */}
                  <div className="px-1 pt-0.5 pb-0 text-[10px] font-bold text-foreground/70 leading-tight sticky top-0">
                    {period.shortLabel}
                  </div>
                  {/* Per-day labels */}
                  {viewMode === 'month' && (() => {
                    const daysInMonth = period.days;
                    const dayDates = eachDayOfInterval({ start: period.start, end: period.end });
                    return (
                      <div className="flex flex-col" style={{ height: cellHeight - 16 }}>
                        {dayDates.map((d, i) => {
                          const isWeekend = getDay(d) === 0 || getDay(d) === 6;
                          const isTodayDate = isDateToday(d);
                          return (
                            <div
                              key={i}
                              className={cn(
                                'flex items-center px-1 text-[9px] leading-none border-t border-border/15',
                                isWeekend && 'bg-muted/30 text-muted-foreground/50',
                                isTodayDate && 'bg-primary/10 text-primary font-bold',
                              )}
                              style={{ height: (cellHeight - 16) / daysInMonth, minHeight: 0 }}
                            >
                              <span className="w-3 text-right">{i + 1}</span>
                              {isTodayDate && <span className="ml-0.5 w-1 h-1 rounded-full bg-primary inline-block" />}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </td>

                {/* Vessel cells */}
                {visibleVessels.map(vessel => {
                  const cellEntries = getEntriesForCell(vessel.id, period);

                  return (
                    <td
                      key={`${period.key}-${vessel.id}`}
                      className={cn(
                        'border-b border-r border-border px-0 py-0 align-top group/cell relative',
                        period.isToday && 'bg-primary/5'
                      )}
                      style={{ height: cellHeight }}
                    >
                      <div className="relative w-full h-full">
                        {/* Per-day gridlines */}
                        {viewMode === 'month' && Array.from({ length: period.days - 1 }, (_, i) => {
                          const frac = (i + 1) / period.days;
                          return (
                            <div
                              key={i}
                              className={cn(
                                'absolute left-0 right-0 border-t',
                                (i + 1) % 7 === 0 ? 'border-border/30' : 'border-border/10'
                              )}
                              style={{ top: `${frac * 100}%` }}
                            />
                          );
                        })}

                        {cellEntries.map(({ entry, topPct, heightPct, laneIndex, totalLanes }) => (
                          <DraggableTripBlock
                            key={entry.id}
                            entry={entry}
                            topPct={topPct}
                            heightPct={heightPct}
                            laneIndex={laneIndex}
                            totalLanes={totalLanes}
                            periodStart={period.start}
                            periodEnd={period.end}
                            onClick={onSelectEntry}
                            onDateChange={handleDateChange}
                          />
                        ))}
                      </div>

                      {/* Add button on hover */}
                      <button
                        onClick={() => onCreateEntry(vessel.id, format(period.start, 'yyyy-MM-dd'))}
                        className="absolute top-1 right-1 w-5 h-5 rounded flex items-center justify-center bg-muted/80 text-muted-foreground opacity-0 group-hover/cell:opacity-100 transition-opacity hover:bg-primary hover:text-primary-foreground z-30"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default PlanningGrid;
