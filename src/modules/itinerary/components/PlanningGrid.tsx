import React, { useMemo, useCallback } from 'react';
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  startOfYear,
  endOfYear,
  eachMonthOfInterval,
  eachWeekOfInterval,
  eachDayOfInterval,
  parseISO,
  isSameMonth,
  isSameDay,
  isToday as isDateToday,
  addMonths,
  addDays,
  getDaysInMonth,
  getDay,
  getQuarter,
  startOfQuarter,
  endOfQuarter,
} from 'date-fns';
import { cn } from '@/lib/utils';
import { Plus } from 'lucide-react';
import DraggableTripBlock from './DraggableTripBlock';
import { useUpdateEntry } from '@/modules/itinerary/hooks/useItinerary';
import type { ItineraryEntry, ViewMode, ItineraryStatus } from '@/modules/itinerary/types';

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

interface TimePeriod {
  key: string;
  label: string;
  shortLabel: string;
  start: Date;
  end: Date;
  isToday: boolean;
  days: number;
  isWeekend?: boolean;
}

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
  const timePeriods = useMemo((): TimePeriod[] => {
    if (viewMode === 'year') {
      // All 12 months of the current year
      const yearStart = startOfYear(currentDate);
      const yearEnd = endOfYear(currentDate);
      return eachMonthOfInterval({ start: yearStart, end: yearEnd }).map(d => ({
        key: format(d, 'yyyy-MM'),
        label: format(d, 'MMMM'),
        shortLabel: format(d, 'MMM'),
        start: startOfMonth(d),
        end: endOfMonth(d),
        isToday: isSameMonth(d, new Date()),
        days: getDaysInMonth(d),
      }));
    }

    if (viewMode === 'quarter') {
      // 3 months of the current quarter
      const qStart = startOfQuarter(currentDate);
      const qEnd = endOfQuarter(currentDate);
      return eachMonthOfInterval({ start: qStart, end: qEnd }).map(d => ({
        key: format(d, 'yyyy-MM'),
        label: format(d, 'MMMM yyyy'),
        shortLabel: format(d, 'MMM'),
        start: startOfMonth(d),
        end: endOfMonth(d),
        isToday: isSameMonth(d, new Date()),
        days: getDaysInMonth(d),
      }));
    }

    if (viewMode === 'month') {
      // Each day of the current month as its own row
      const mStart = startOfMonth(currentDate);
      const mEnd = endOfMonth(currentDate);
      return eachDayOfInterval({ start: mStart, end: mEnd }).map(d => {
        const dayOfWeek = getDay(d);
        return {
          key: format(d, 'yyyy-MM-dd'),
          label: format(d, 'EEE d'),
          shortLabel: format(d, 'EEE d'),
          start: d,
          end: d,
          isToday: isDateToday(d),
          days: 1,
          isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
        };
      });
    }

    if (viewMode === 'week') {
      // All 52 weeks of the year
      const yearStart = startOfYear(currentDate);
      const yearEnd = endOfYear(currentDate);
      const firstWeek = startOfWeek(yearStart, { weekStartsOn: 1 });
      const lastWeek = startOfWeek(yearEnd, { weekStartsOn: 1 });
      return eachWeekOfInterval(
        { start: firstWeek, end: lastWeek },
        { weekStartsOn: 1 }
      ).map((d, i) => ({
        key: format(d, 'yyyy-ww'),
        label: `W${i + 1}: ${format(d, 'MMM d')} – ${format(endOfWeek(d, { weekStartsOn: 1 }), 'MMM d')}`,
        shortLabel: `W${i + 1}`,
        start: d,
        end: endOfWeek(d, { weekStartsOn: 1 }),
        isToday: isDateToday(d) || (d <= new Date() && endOfWeek(d, { weekStartsOn: 1 }) >= new Date()),
        days: 7,
      }));
    }

    // Day view: 7 days centered on currentDate
    const dayStart = currentDate;
    return eachDayOfInterval({
      start: dayStart,
      end: addDays(dayStart, 6),
    }).map(d => {
      const dayOfWeek = getDay(d);
      return {
        key: format(d, 'yyyy-MM-dd'),
        label: format(d, 'EEEE, MMMM d'),
        shortLabel: format(d, 'EEE d'),
        start: d,
        end: d,
        isToday: isDateToday(d),
        days: 1,
        isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
      };
    });
  }, [viewMode, currentDate]);

  // Cell height per period row
  const cellHeight = useMemo(() => {
    switch (viewMode) {
      case 'year': return 100;     // 12 month rows — enough to read trip blocks
      case 'quarter': return 300;  // 3 detailed month rows
      case 'month': return 44;     // per-day rows
      case 'week': return 52;      // 52 week rows — readable
      case 'day': return 140;      // 7 detailed day rows
      default: return 60;
    }
  }, [viewMode]);

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
  const getEntriesForCell = useCallback((vesselId: string, period: TimePeriod) => {
    const periodStart = period.start.getTime();
    const periodEnd = period.end.getTime();
    const periodDuration = periodEnd - periodStart || 86400000; // at least 1 day in ms

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

        // For single-day periods (month/day view), fill the entire cell
        if (period.days === 1) {
          return { entry, topPct: 0, heightPct: 100, laneIndex: 0, totalLanes: 1 };
        }

        const topPct = ((entryStart - periodStart) / periodDuration) * 100;
        const heightPct = Math.max(((entryEnd - entryStart) / periodDuration) * 100, 4);
        return { entry, topPct, heightPct, laneIndex: 0, totalLanes: 1 };
      });

    // Compute overlap lanes for multi-day periods
    if (items.length > 1 && period.days > 1) {
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

    // For single-day cells with multiple entries, stack them horizontally
    if (items.length > 1 && period.days === 1) {
      items.forEach((it, i) => {
        it.laneIndex = i;
        it.totalLanes = items.length;
      });
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

  // Minimum column width based on view mode
  const vesselColWidth = viewMode === 'year' || viewMode === 'week' ? 120 : 160;

  return (
    <div className="overflow-auto flex-1">
      <table className="w-full border-collapse min-w-[600px]">
        {/* Header: vessel names */}
        <thead className="sticky top-0 z-20 bg-card">
          <tr>
            <th className="sticky left-0 z-30 bg-card border-b border-r border-border px-2 py-2 text-left text-xs font-semibold text-muted-foreground w-[100px] min-w-[100px]">
              {viewMode === 'year' ? 'Month' : viewMode === 'quarter' ? 'Month' : viewMode === 'month' ? 'Day' : viewMode === 'week' ? 'Week' : 'Day'}
            </th>
            {visibleVessels.map(vessel => (
              <th
                key={vessel.id}
                className="border-b border-r border-border px-2 py-2 text-center text-xs font-semibold text-foreground"
                style={{ minWidth: vesselColWidth }}
              >
                {vessel.name.replace('M/Y ', '').replace('R/V ', '')}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {timePeriods.map(period => (
            <tr key={period.key} className={cn(
              period.isToday && 'bg-primary/5',
              period.isWeekend && 'bg-muted/20',
            )}>
              {/* Time label */}
              <td className={cn(
                'sticky left-0 z-10 border-b border-r border-border px-2 py-0 text-xs font-medium whitespace-nowrap align-middle',
                period.isToday ? 'text-primary bg-primary/10 font-bold' : period.isWeekend ? 'text-muted-foreground/60 bg-muted/20' : 'text-muted-foreground bg-card',
              )} style={{ height: cellHeight }}>
                <div className="flex items-center gap-1">
                  {period.isToday && <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block flex-shrink-0" />}
                  <span className="truncate">{period.shortLabel}</span>
                </div>
              </td>

              {/* Vessel cells */}
              {visibleVessels.map(vessel => {
                const cellEntries = getEntriesForCell(vessel.id, period);

                return (
                  <td
                    key={`${period.key}-${vessel.id}`}
                    className={cn(
                      'border-b border-r border-border px-0 py-0 align-top group/cell relative',
                      period.isToday && 'bg-primary/5',
                      period.isWeekend && 'bg-muted/10',
                    )}
                    style={{ height: cellHeight }}
                  >
                    <div className="relative w-full h-full">
                      {/* Per-day gridlines for multi-day cells (quarter view) */}
                      {viewMode === 'quarter' && Array.from({ length: period.days - 1 }, (_, i) => {
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

                      {/* Per-day gridlines for year view */}
                      {viewMode === 'year' && [7, 14, 21, 28].filter(d => d < period.days).map(d => (
                        <div
                          key={d}
                          className="absolute left-0 right-0 border-t border-border/10"
                          style={{ top: `${(d / period.days) * 100}%` }}
                        />
                      ))}

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
                          onDateChange={period.days > 1 ? handleDateChange : undefined}
                        />
                      ))}
                    </div>

                    {/* Add button on hover */}
                    <button
                      onClick={() => onCreateEntry(vessel.id, format(period.start, 'yyyy-MM-dd'))}
                      className="absolute top-0.5 right-0.5 w-4 h-4 rounded flex items-center justify-center bg-muted/80 text-muted-foreground opacity-0 group-hover/cell:opacity-100 transition-opacity hover:bg-primary hover:text-primary-foreground z-30"
                    >
                      <Plus className="w-2.5 h-2.5" />
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default PlanningGrid;
