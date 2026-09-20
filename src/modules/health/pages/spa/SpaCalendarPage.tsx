import React, { useMemo, useState } from 'react';
import { addDays, endOfWeek, startOfWeek } from 'date-fns';
import { CalendarRange, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { HealthPageHeader } from '@/modules/health/components/HealthPageHeader';
import { HealthEmpty, HealthError, HealthLoading } from '@/modules/health/components/HealthStates';
import { BookingStatusBadge } from '@/modules/health/components/spa/BookingStatusBadge';
import { BookingDialog } from '@/modules/health/components/spa/BookingDialog';
import {
  SpaDayGrid,
  SpaWeekGrid,
  type CalendarGroup,
} from '@/modules/health/components/spa/SpaCalendarGrid';
import { useWellnessAccess } from '@/modules/auth/hooks/useWellnessAccess';
import { usePractitioners } from '@/modules/health/hooks/usePractitioners';
import { useHealthSettings } from '@/modules/health/hooks/useHealthSettings';
import {
  localDayIso,
  minutesOfTime,
  useSpaBookings,
  useSpaRooms,
  useSpaTreatments,
  type BookingFormData,
  type SpaBookingEntry,
} from '@/modules/health/hooks/useSpa';
import { formatDate, formatDuration } from '@/modules/health/lib/format';

type ViewMode = 'day' | 'week';
type GroupMode = 'therapist' | 'room';

interface SlotDefaults {
  dayIso: string;
  time?: string;
  therapistId?: string | null;
  roomId?: string | null;
}

/** The spa diary: a day or a week of bookings, split by therapist or by room. */
const SpaCalendarPage: React.FC = () => {
  const wellness = useWellnessAccess();
  const canEdit = !wellness.loading && wellness.canEdit;
  const { settings } = useHealthSettings();

  const [view, setView] = useState<ViewMode>('day');
  const [groupBy, setGroupBy] = useState<GroupMode>('therapist');
  const [anchor, setAnchor] = useState<string>(localDayIso(new Date()));

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SpaBookingEntry | null>(null);
  const [slotDefaults, setSlotDefaults] = useState<SlotDefaults | undefined>(undefined);
  const [clashMessage, setClashMessage] = useState<string | null>(null);
  const [detail, setDetail] = useState<SpaBookingEntry | null>(null);

  const anchorDate = useMemo(() => new Date(`${anchor}T00:00:00`), [anchor]);
  const weekDays = useMemo(() => {
    const start = startOfWeek(anchorDate, { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, i) => localDayIso(addDays(start, i)));
  }, [anchorDate]);

  const fromDay = view === 'day' ? anchor : weekDays[0];
  const toDay = view === 'day' ? anchor : localDayIso(endOfWeek(anchorDate, { weekStartsOn: 1 }));

  const bookings = useSpaBookings({ fromDay, toDay });
  const treatments = useSpaTreatments();
  const rooms = useSpaRooms();
  const therapists = usePractitioners('spa');

  const openingTime = settings?.spa_opening_time ?? '08:00';
  const closingTime = settings?.spa_closing_time ?? '20:00';
  const openingMinutes = minutesOfTime(openingTime, 8 * 60);
  const closingMinutes = minutesOfTime(closingTime, 20 * 60);

  const groups = useMemo<CalendarGroup[]>(() => {
    if (groupBy === 'therapist') {
      return therapists.active.map((t) => ({ id: t.id, label: t.full_name, hint: t.role_title }));
    }
    return rooms.rooms.map((r) => ({ id: r.id, label: r.name, hint: r.deck }));
  }, [groupBy, therapists.active, rooms.rooms]);

  const shift = (days: number) => setAnchor(localDayIso(addDays(anchorDate, days)));

  const openNew = (slot: SlotDefaults) => {
    if (!canEdit) return;
    setEditing(null);
    setSlotDefaults(slot);
    setClashMessage(null);
    setDialogOpen(true);
  };

  const openEdit = (booking: SpaBookingEntry) => {
    if (!canEdit) {
      setDetail(booking);
      return;
    }
    setEditing(booking);
    setSlotDefaults(undefined);
    setClashMessage(null);
    setDialogOpen(true);
  };

  const submit = async (values: BookingFormData) => {
    setClashMessage(null);
    try {
      await bookings.saveBooking.mutateAsync(values);
      setDialogOpen(false);
      setEditing(null);
    } catch (error) {
      // The double booking guard is a database exception; keep the dialog open
      // with the message so the slot can be changed without retyping.
      setClashMessage(error instanceof Error ? error.message : 'The booking was refused');
    }
  };

  const setStatus = async (booking: SpaBookingEntry, status: string) => {
    await bookings.setBookingStatus.mutateAsync({ id: booking.id, status });
    setDetail(null);
    if (editing?.id === booking.id) setDialogOpen(false);
  };

  const headerRange =
    view === 'day'
      ? formatDate(anchor, 'EEEE d MMMM yyyy')
      : `${formatDate(weekDays[0], 'd MMM')} to ${formatDate(weekDays[6], 'd MMM yyyy')}`;

  return (
    <div className="space-y-6">
      <HealthPageHeader
        icon={CalendarRange}
        title="Spa calendar"
        description={`Open ${openingTime.slice(0, 5)} to ${closingTime.slice(0, 5)}. A therapist or a room cannot take two bookings at once.`}
        actions={
          canEdit ? (
            <Button size="sm" onClick={() => openNew({ dayIso: anchor, time: openingTime.slice(0, 5) })}>
              <Plus className="mr-2 h-4 w-4" /> New booking
            </Button>
          ) : undefined
        }
        toolbar={
          <div className="flex w-full flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  onClick={() => shift(view === 'day' ? -1 : -7)}
                  aria-label="Previous"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button type="button" size="icon" variant="outline" onClick={() => shift(view === 'day' ? 1 : 7)} aria-label="Next">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              <div className="space-y-1">
                <Label htmlFor="calendar-date" className="text-xs text-muted-foreground">
                  Date
                </Label>
                <Input
                  id="calendar-date"
                  type="date"
                  value={anchor}
                  onChange={(e) => setAnchor(e.target.value || localDayIso(new Date()))}
                  className="w-[170px]"
                />
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={() => setAnchor(localDayIso(new Date()))}>
                Today
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Tabs value={groupBy} onValueChange={(v) => setGroupBy(v as GroupMode)}>
                <TabsList>
                  <TabsTrigger value="therapist">By therapist</TabsTrigger>
                  <TabsTrigger value="room">By room</TabsTrigger>
                </TabsList>
              </Tabs>
              <Tabs value={view} onValueChange={(v) => setView(v as ViewMode)}>
                <TabsList>
                  <TabsTrigger value="day">Day</TabsTrigger>
                  <TabsTrigger value="week">Week</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </div>
        }
      />

      <Card>
        <CardContent className="p-3 sm:p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-medium text-foreground">{headerRange}</h2>
            <p className="text-xs text-muted-foreground">
              {bookings.summary.total} booked · {formatDuration(bookings.summary.minutesBooked)} of treatments
            </p>
          </div>

          {bookings.isLoading ? (
            <HealthLoading rows={4} />
          ) : bookings.isError ? (
            <HealthError title="Could not load the calendar" error={bookings.error} />
          ) : bookings.bookings.length === 0 ? (
            <HealthEmpty
              icon={CalendarRange}
              title={view === 'day' ? 'Nothing booked on this day' : 'Nothing booked this week'}
              description={
                canEdit
                  ? 'Choose a slot in the grid, or use New booking, to put someone in. The treatment you pick sets the length.'
                  : 'Nothing is in the diary for this period. Ask the spa team to add a booking for you.'
              }
              action={
                canEdit ? (
                  <Button onClick={() => openNew({ dayIso: anchor, time: openingTime.slice(0, 5) })}>
                    <Plus className="mr-2 h-4 w-4" /> New booking
                  </Button>
                ) : undefined
              }
            />
          ) : view === 'day' ? (
            <SpaDayGrid
              dayIso={anchor}
              bookings={bookings.bookings}
              groups={groups}
              groupBy={groupBy}
              openingMinutes={openingMinutes}
              closingMinutes={closingMinutes}
              canEdit={canEdit}
              onSelect={openEdit}
              onCreate={(slot) =>
                openNew({
                  dayIso: slot.dayIso,
                  time: slot.time,
                  therapistId: groupBy === 'therapist' ? slot.groupId : null,
                  roomId: groupBy === 'room' ? slot.groupId : null,
                })
              }
            />
          ) : (
            <SpaWeekGrid
              days={weekDays}
              bookings={bookings.bookings}
              groupBy={groupBy}
              canEdit={canEdit}
              openingTime={openingTime}
              onSelect={openEdit}
              onCreate={(slot) => openNew({ dayIso: slot.dayIso, time: slot.time })}
            />
          )}
        </CardContent>
      </Card>

      {groups.length === 0 && !bookings.isLoading && (
        <HealthEmpty
          icon={CalendarRange}
          title={groupBy === 'therapist' ? 'No spa therapists on the roster' : 'No spa rooms set up'}
          description={
            groupBy === 'therapist'
              ? 'Add your therapists to the practitioner roster with the discipline "Spa" so the day can be split between them.'
              : 'Add your treatment rooms, sauna and salon so bookings can hold a space.'
          }
        />
      )}

      <BookingDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setEditing(null);
            setClashMessage(null);
          }
        }}
        booking={editing}
        defaults={slotDefaults}
        treatments={treatments.treatments}
        rooms={rooms.rooms}
        therapists={therapists.active}
        openingTime={openingTime}
        closingTime={closingTime}
        onSubmit={submit}
        isPending={bookings.saveBooking.isPending}
        errorMessage={clashMessage}
        onStatusChange={editing ? (status) => void setStatus(editing, status) : undefined}
        statusPending={bookings.setBookingStatus.isPending}
      />

      <Dialog open={Boolean(detail)} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{detail?.person_name ?? 'Booking'}</DialogTitle>
            <DialogDescription>
              {detail ? formatDate(detail.starts_at, 'EEEE d MMMM, HH:mm') : ''}
            </DialogDescription>
          </DialogHeader>
          {detail && (
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Treatment</dt>
                <dd className="text-right text-foreground">{detail.treatment_name ?? 'Not set'}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Therapist</dt>
                <dd className="text-right text-foreground">{detail.therapist_name ?? 'Unassigned'}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Room</dt>
                <dd className="text-right text-foreground">{detail.room_name ?? 'No room'}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Length</dt>
                <dd className="text-right text-foreground">{formatDuration(detail.durationMinutes)}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Status</dt>
                <dd>
                  <BookingStatusBadge status={detail.status} />
                </dd>
              </div>
            </dl>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDetail(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SpaCalendarPage;
