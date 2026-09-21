import React, { useMemo } from 'react';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { BookingStatusBadge } from '@/modules/health/components/spa/BookingStatusBadge';
import { formatDate } from '@/modules/health/lib/format';
import { RELEASED_STATUSES, timeOfDay, type SpaBookingEntry } from '@/modules/health/hooks/useSpa';

export interface CalendarGroup {
  id: string;
  label: string;
  hint?: string | null;
}

const minutesToLabel = (minutes: number): string =>
  `${`${Math.floor(minutes / 60)}`.padStart(2, '0')}:${`${minutes % 60}`.padStart(2, '0')}`;

const PX_PER_MINUTE = 1.25;
const UNASSIGNED = '__unassigned__';

const blockTone = (booking: SpaBookingEntry): string => {
  if (booking.status === 'cancelled' || booking.status === 'no_show') {
    return 'border-destructive/30 bg-destructive/10 text-destructive';
  }
  if (booking.status === 'completed') return 'border-success/30 bg-success/10 text-success';
  if (booking.status === 'requested') return 'border-warning/30 bg-warning/10 text-warning';
  return 'border-primary/30 bg-primary/10 text-foreground';
};

interface DayGridProps {
  dayIso: string;
  bookings: SpaBookingEntry[];
  groups: CalendarGroup[];
  /** Which field the columns represent. */
  groupBy: 'therapist' | 'room';
  openingMinutes: number;
  closingMinutes: number;
  canEdit: boolean;
  onSelect: (booking: SpaBookingEntry) => void;
  onCreate: (slot: { dayIso: string; time: string; groupId: string | null }) => void;
}

/** A single day laid out by time, with one column per therapist or room. */
export const SpaDayGrid: React.FC<DayGridProps> = ({
  dayIso,
  bookings,
  groups,
  groupBy,
  openingMinutes,
  closingMinutes,
  canEdit,
  onSelect,
  onCreate,
}) => {
  const columns = useMemo<CalendarGroup[]>(() => [...groups, { id: UNASSIGNED, label: 'Unassigned' }], [groups]);

  const start = Math.min(openingMinutes, ...bookings.map((b) => b.startMinutes), closingMinutes - 60);
  const end = Math.max(
    closingMinutes,
    ...bookings.map((b) => b.startMinutes + b.durationMinutes),
    openingMinutes + 60,
  );
  const spanStart = Math.floor(start / 60) * 60;
  const spanEnd = Math.ceil(end / 60) * 60;
  const height = (spanEnd - spanStart) * PX_PER_MINUTE;

  const hourLines = useMemo(() => {
    const lines: number[] = [];
    for (let m = spanStart; m <= spanEnd; m += 60) lines.push(m);
    return lines;
  }, [spanStart, spanEnd]);

  const byColumn = useMemo(() => {
    const map = new Map<string, SpaBookingEntry[]>();
    for (const booking of bookings) {
      const key = (groupBy === 'therapist' ? booking.therapist_id : booking.room_id) ?? UNASSIGNED;
      map.set(key, [...(map.get(key) ?? []), booking]);
    }
    return map;
  }, [bookings, groupBy]);

  return (
    <div className="overflow-x-auto">
      <div className="flex min-w-[640px]">
        <div className="w-16 shrink-0 pt-10">
          <div className="relative" style={{ height }}>
            {hourLines.map((m) => (
              <div
                key={m}
                className="absolute -translate-y-1/2 pr-2 text-right text-[11px] text-muted-foreground"
                style={{ top: (m - spanStart) * PX_PER_MINUTE, width: '100%' }}
              >
                {minutesToLabel(m)}
              </div>
            ))}
          </div>
        </div>

        {columns.map((column) => {
          const columnBookings = byColumn.get(column.id) ?? [];
          if (column.id === UNASSIGNED && columnBookings.length === 0) return null;
          return (
            <div key={column.id} className="min-w-[180px] flex-1 border-l border-border">
              <div className="flex h-10 items-center justify-between gap-2 border-b border-border px-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-foreground">{column.label}</p>
                  {column.hint && (
                    <p className="truncate text-[10px] text-muted-foreground">{column.hint}</p>
                  )}
                </div>
                <Badge variant="outline" className="shrink-0 text-[10px]">
                  {columnBookings.filter((b) => !RELEASED_STATUSES.includes(b.status)).length}
                </Badge>
              </div>

              <div className="relative" style={{ height }}>
                {hourLines.map((m) => (
                  <button
                    key={m}
                    type="button"
                    disabled={!canEdit}
                    onClick={() =>
                      onCreate({
                        dayIso,
                        time: minutesToLabel(m),
                        groupId: column.id === UNASSIGNED ? null : column.id,
                      })
                    }
                    className={cn(
                      'absolute left-0 right-0 border-t border-dashed border-border/60 text-left',
                      canEdit && 'hover:bg-accent/40',
                    )}
                    style={{ top: (m - spanStart) * PX_PER_MINUTE, height: 60 * PX_PER_MINUTE }}
                    aria-label={`Book ${minutesToLabel(m)} in ${column.label}`}
                  />
                ))}

                {columnBookings.map((booking) => (
                  <button
                    key={booking.id}
                    type="button"
                    onClick={() => onSelect(booking)}
                    className={cn(
                      'absolute left-1 right-1 overflow-hidden rounded-md border px-2 py-1 text-left transition-colors hover:brightness-110',
                      blockTone(booking),
                      RELEASED_STATUSES.includes(booking.status) && 'opacity-60',
                    )}
                    style={{
                      top: Math.max(0, (booking.startMinutes - spanStart) * PX_PER_MINUTE),
                      height: Math.max(22, booking.durationMinutes * PX_PER_MINUTE - 2),
                    }}
                  >
                    <p className="truncate text-[11px] font-medium">
                      {timeOfDay(booking.starts_at)} {booking.person_name ?? 'Unnamed client'}
                    </p>
                    <p className="truncate text-[10px] opacity-80">
                      {booking.treatment_name ?? 'No treatment set'}
                    </p>
                    {booking.durationMinutes >= 45 && (
                      <p className="truncate text-[10px] opacity-70">
                        {groupBy === 'therapist'
                          ? booking.room_name ?? 'No room'
                          : booking.therapist_name ?? 'Unassigned'}
                      </p>
                    )}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

interface WeekGridProps {
  days: string[];
  bookings: SpaBookingEntry[];
  groupBy: 'therapist' | 'room';
  canEdit: boolean;
  onSelect: (booking: SpaBookingEntry) => void;
  onCreate: (slot: { dayIso: string; time: string; groupId: string | null }) => void;
  openingTime: string;
}

/** Seven day columns, each listing its bookings in time order. */
export const SpaWeekGrid: React.FC<WeekGridProps> = ({
  days,
  bookings,
  groupBy,
  canEdit,
  onSelect,
  onCreate,
  openingTime,
}) => {
  const byDay = useMemo(() => {
    const map = new Map<string, SpaBookingEntry[]>();
    for (const booking of bookings) {
      map.set(booking.dayIso, [...(map.get(booking.dayIso) ?? []), booking]);
    }
    return map;
  }, [bookings]);

  const todayIsoValue = new Date().toDateString();

  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[900px] grid-cols-7 gap-2">
        {days.map((dayIso) => {
          const dayBookings = (byDay.get(dayIso) ?? []).sort((a, b) => a.startMinutes - b.startMinutes);
          const isToday = new Date(`${dayIso}T00:00:00`).toDateString() === todayIsoValue;
          return (
            <div
              key={dayIso}
              className={cn(
                'flex min-h-[220px] flex-col rounded-lg border border-border bg-card p-2',
                isToday && 'border-primary/50',
              )}
            >
              <div className="mb-2 flex items-center justify-between">
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-foreground">
                    {formatDate(dayIso, 'EEE')}
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {formatDate(dayIso, 'd MMM')}
                  </p>
                </div>
                {canEdit && (
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6"
                    onClick={() => onCreate({ dayIso, time: openingTime.slice(0, 5), groupId: null })}
                    aria-label={`Add a booking on ${formatDate(dayIso)}`}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>

              <div className="flex flex-1 flex-col gap-1.5">
                {dayBookings.length === 0 ? (
                  <p className="mt-2 text-[11px] text-muted-foreground">Nothing booked.</p>
                ) : (
                  dayBookings.map((booking) => (
                    <button
                      key={booking.id}
                      type="button"
                      onClick={() => onSelect(booking)}
                      className={cn(
                        'rounded-md border px-2 py-1 text-left transition-colors hover:brightness-110',
                        blockTone(booking),
                        RELEASED_STATUSES.includes(booking.status) && 'opacity-60',
                      )}
                    >
                      <p className="truncate text-[11px] font-medium">
                        {timeOfDay(booking.starts_at)} {booking.person_name ?? 'Unnamed client'}
                      </p>
                      <p className="truncate text-[10px] opacity-80">
                        {booking.treatment_name ?? 'No treatment set'}
                      </p>
                      <p className="truncate text-[10px] opacity-70">
                        {groupBy === 'therapist'
                          ? booking.therapist_name ?? 'Unassigned'
                          : booking.room_name ?? 'No room'}
                      </p>
                    </button>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/** Compact list used on the dashboard and on narrow screens. */
export const BookingList: React.FC<{
  bookings: SpaBookingEntry[];
  onSelect?: (booking: SpaBookingEntry) => void;
}> = ({ bookings, onSelect }) => (
  <ul className="divide-y divide-border">
    {bookings.map((booking) => (
      <li key={booking.id}>
        <button
          type="button"
          disabled={!onSelect}
          onClick={() => onSelect?.(booking)}
          className="flex w-full items-center justify-between gap-3 py-2.5 text-left disabled:cursor-default"
        >
          <div className="w-14 shrink-0 text-sm font-medium text-foreground">
            {timeOfDay(booking.starts_at)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">
              {booking.person_name ?? 'Unnamed client'}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {[booking.treatment_name, booking.therapist_name, booking.room_name]
                .filter(Boolean)
                .join(' · ') || 'No treatment set'}
            </p>
          </div>
          <BookingStatusBadge status={booking.status} className="shrink-0" />
        </button>
      </li>
    ))}
  </ul>
);
