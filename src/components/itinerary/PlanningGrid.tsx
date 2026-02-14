import React, { useMemo } from 'react';
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachMonthOfInterval,
  eachWeekOfInterval,
  eachDayOfInterval,
  isWithinInterval,
  parseISO,
  isSameMonth,
  isToday,
  addMonths,
  addWeeks,
  addDays,
} from 'date-fns';
import { cn } from '@/lib/utils';
import { Plus } from 'lucide-react';
import TripBlock from './TripBlock';
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
        isToday: isWithinInterval(new Date(), { start: d, end: endOfWeek(d, { weekStartsOn: 1 }) }),
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
      isToday: isToday(d),
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

  // Get entries for a vessel + time period
  const getEntriesForCell = (vesselId: string, period: typeof timePeriods[0]) => {
    return filteredEntries.filter(entry => {
      const hasVessel = entry.vessels?.some(ev => ev.vessel_id === vesselId);
      if (!hasVessel) return false;

      const entryStart = parseISO(entry.start_date);
      const entryEnd = parseISO(entry.end_date);

      // Check overlap
      return entryStart <= period.end && entryEnd >= period.start;
    });
  };

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
        <thead className="sticky top-0 z-10 bg-card">
          <tr>
            <th className="sticky left-0 z-20 bg-card border-b border-r border-border px-3 py-2 text-left text-xs font-semibold text-muted-foreground w-[120px] min-w-[120px]">
              Period
            </th>
            {visibleVessels.map(vessel => (
              <th
                key={vessel.id}
                className="border-b border-r border-border px-2 py-2 text-center text-xs font-semibold text-foreground min-w-[150px]"
              >
                {vessel.name.replace('M/Y ', '').replace('R/V ', '')}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {timePeriods.map(period => (
            <tr key={period.key} className={cn(period.isToday && 'bg-primary/5')}>
              {/* Time label */}
              <td className={cn(
                'sticky left-0 z-10 bg-card border-b border-r border-border px-3 py-2 text-xs font-medium whitespace-nowrap',
                period.isToday ? 'text-primary bg-primary/5' : 'text-muted-foreground'
              )}>
                {viewMode === 'month' ? period.label : period.shortLabel}
              </td>

              {/* Vessel cells */}
              {visibleVessels.map(vessel => {
                const cellEntries = getEntriesForCell(vessel.id, period);

                return (
                  <td
                    key={`${period.key}-${vessel.id}`}
                    className={cn(
                      'border-b border-r border-border px-1 py-1 align-top min-h-[40px] group relative',
                      period.isToday && 'bg-primary/5'
                    )}
                  >
                    <div className="space-y-0.5 min-h-[32px]">
                      {cellEntries.map(entry => (
                        <TripBlock
                          key={entry.id}
                          entry={entry}
                          compact={viewMode === 'day'}
                          onClick={onSelectEntry}
                        />
                      ))}
                    </div>
                    {/* Add button on hover */}
                    <button
                      onClick={() => onCreateEntry(vessel.id, format(period.start, 'yyyy-MM-dd'))}
                      className="absolute top-1 right-1 w-5 h-5 rounded flex items-center justify-center bg-muted/80 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity hover:bg-primary hover:text-primary-foreground"
                    >
                      <Plus className="w-3 h-3" />
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
