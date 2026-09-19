import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { endOfWeek, startOfWeek } from 'date-fns';
import {
  AlertTriangle,
  CalendarDays,
  CalendarRange,
  CheckCircle2,
  Flower2,
  Package,
  Sparkles,
  UserRound,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { HealthPageHeader } from '@/modules/health/components/HealthPageHeader';
import { StatGrid, StatTile } from '@/modules/health/components/StatTile';
import { HealthEmpty, HealthError, HealthLoading } from '@/modules/health/components/HealthStates';
import { BookingList } from '@/modules/health/components/spa/SpaCalendarGrid';
import { useWellnessAccess } from '@/modules/auth/hooks/useWellnessAccess';
import { usePractitioners } from '@/modules/health/hooks/usePractitioners';
import { useHealthSettings } from '@/modules/health/hooks/useHealthSettings';
import {
  localDayIso,
  useSpaBookings,
  useSpaInventory,
  useSpaTreatments,
} from '@/modules/health/hooks/useSpa';
import { formatDate, formatDuration } from '@/modules/health/lib/format';
import { HEALTH_PATHS } from '@/modules/health/paths';

/** The spa team's morning view: who is in today and what needs attention. */
const SpaDashboardPage: React.FC = () => {
  const wellness = useWellnessAccess();
  const canEdit = !wellness.loading && wellness.canEdit;
  const { settings } = useHealthSettings();

  const today = new Date();
  const todayIso = localDayIso(today);
  const weekStartIso = localDayIso(startOfWeek(today, { weekStartsOn: 1 }));
  const weekEndIso = localDayIso(endOfWeek(today, { weekStartsOn: 1 }));

  const week = useSpaBookings({ fromDay: weekStartIso, toDay: weekEndIso });
  const treatments = useSpaTreatments();
  const inventory = useSpaInventory({ expiryWarningDays: settings?.stock_expiry_warning_days ?? 90 });
  const therapists = usePractitioners('spa');

  const todaysBookings = useMemo(
    () => week.bookings.filter((b) => b.dayIso === todayIso),
    [week.bookings, todayIso],
  );

  const upcoming = useMemo(() => {
    const now = Date.now();
    return week.bookings
      .filter((b) => new Date(b.starts_at).getTime() >= now && b.status !== 'cancelled')
      .slice(0, 6);
  }, [week.bookings]);

  const todaySummary = useMemo(() => {
    const finished = todaysBookings.filter((b) => ['completed', 'no_show'].includes(b.status));
    return {
      total: todaysBookings.length,
      live: todaysBookings.filter((b) => !['cancelled', 'no_show'].includes(b.status)).length,
      minutes: todaysBookings
        .filter((b) => !['cancelled', 'no_show'].includes(b.status))
        .reduce((sum, b) => sum + b.durationMinutes, 0),
      finished: finished.length,
    };
  }, [todaysBookings]);

  const onDutyToday = useMemo(() => {
    const ids = new Set(
      todaysBookings
        .filter((b) => b.therapist_id && !['cancelled'].includes(b.status))
        .map((b) => b.therapist_id as string),
    );
    return therapists.active.filter((t) => ids.has(t.id));
  }, [todaysBookings, therapists.active]);

  const lowStock = useMemo(
    () => inventory.items.filter((i) => i.isLow || i.isExpired || i.isExpiringSoon).slice(0, 8),
    [inventory.items],
  );

  const noMenu = !treatments.isLoading && !treatments.isError && treatments.allTreatments.length === 0;

  return (
    <div className="space-y-6">
      <HealthPageHeader
        icon={Flower2}
        title="Spa dashboard"
        description="Today's bookings, the week ahead, who is on and what the spa store is short of."
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link to={HEALTH_PATHS.spaTreatments}>Treatment menu</Link>
            </Button>
            <Button asChild size="sm">
              <Link to={HEALTH_PATHS.spaCalendar}>
                <CalendarRange className="mr-2 h-4 w-4" /> Open the calendar
              </Link>
            </Button>
          </>
        }
      />

      {noMenu ? (
        <HealthEmpty
          icon={Sparkles}
          title="The spa has no treatment menu yet"
          description="Add the standard menu of massages, facials and body treatments, then set your own prices and room requirements. Bookings take their length from the menu, so this comes first."
          action={
            canEdit ? (
              <Button onClick={() => treatments.seedMenu.mutate()} disabled={treatments.seedMenu.isPending}>
                {treatments.seedMenu.isPending ? 'Creating the menu…' : 'Create the default menu'}
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">
                Ask the spa manager or the purser to set the menu up.
              </p>
            )
          }
        />
      ) : (
        <>
          <StatGrid>
            <StatTile
              icon={CalendarDays}
              label="Booked today"
              value={week.isLoading ? null : todaySummary.live}
              hint={todaySummary.minutes ? formatDuration(todaySummary.minutes) + ' of treatments' : 'Nothing booked'}
              to={HEALTH_PATHS.spaCalendar}
            />
            <StatTile
              icon={CalendarRange}
              label="Booked this week"
              value={week.isLoading ? null : week.summary.total - week.summary.cancelled}
              hint={`${week.summary.requested} awaiting confirmation`}
              to={HEALTH_PATHS.spaCalendar}
            />
            <StatTile
              icon={CheckCircle2}
              label="Completed this week"
              value={week.isLoading ? null : week.summary.completionRate === null ? '—' : `${week.summary.completionRate}%`}
              hint={`${week.summary.completed} of ${week.summary.completed + week.summary.noShow} finished`}
              tone={week.summary.completionRate !== null && week.summary.completionRate < 80 ? 'warning' : 'good'}
            />
            <StatTile
              icon={AlertTriangle}
              label="No shows this week"
              value={week.isLoading ? null : week.summary.noShowRate === null ? '—' : `${week.summary.noShowRate}%`}
              hint={`${week.summary.noShow} missed`}
              tone={week.summary.noShow > 0 ? 'warning' : 'good'}
            />
          </StatGrid>

          <StatGrid>
            <StatTile
              icon={Users}
              label="Therapists on today"
              value={therapists.isLoading ? null : onDutyToday.length}
              hint={`${therapists.active.length} on the roster`}
              to={HEALTH_PATHS.medicalStaff}
            />
            <StatTile
              icon={Sparkles}
              label="Treatments on the menu"
              value={treatments.isLoading ? null : treatments.summary.active}
              hint={`${treatments.summary.categories} categories`}
              to={HEALTH_PATHS.spaTreatments}
            />
            <StatTile
              icon={Package}
              label="Stock below minimum"
              value={inventory.isLoading ? null : inventory.summary.low}
              hint={`${inventory.summary.expiringSoon} expiring, ${inventory.summary.expired} expired`}
              tone={inventory.summary.low > 0 ? 'warning' : 'good'}
              to={HEALTH_PATHS.spaInventory}
            />
            <StatTile
              icon={UserRound}
              label="Clients seen this week"
              value={week.isLoading ? null : new Set(week.bookings.map((b) => b.person_id)).size}
              to={HEALTH_PATHS.spaClients}
            />
          </StatGrid>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Today</CardTitle>
                <CardDescription>{formatDate(todayIso, 'EEEE d MMMM')}</CardDescription>
              </CardHeader>
              <CardContent>
                {week.isLoading ? (
                  <HealthLoading rows={3} />
                ) : week.isError ? (
                  <HealthError title="Could not load today's bookings" error={week.error} />
                ) : todaysBookings.length === 0 ? (
                  <HealthEmpty
                    icon={CalendarDays}
                    title="Nothing booked today"
                    description="Open the calendar to add a booking, or wait for guest services to request one."
                    className="border-0 p-6"
                    action={
                      canEdit ? (
                        <Button asChild size="sm" variant="outline">
                          <Link to={HEALTH_PATHS.spaCalendar}>Add a booking</Link>
                        </Button>
                      ) : undefined
                    }
                  />
                ) : (
                  <div className="overflow-x-auto">
                    <BookingList bookings={todaysBookings} />
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Next up</CardTitle>
                <CardDescription>The rest of this week, in order.</CardDescription>
              </CardHeader>
              <CardContent>
                {week.isLoading ? (
                  <HealthLoading rows={3} />
                ) : week.isError ? (
                  <HealthError title="Could not load the week" error={week.error} />
                ) : upcoming.length === 0 ? (
                  <HealthEmpty
                    icon={CalendarRange}
                    title="The week is clear"
                    description="Nothing else is booked before the week is out. Use the calendar to fill it."
                    className="border-0 p-6"
                  />
                ) : (
                  <ul className="divide-y divide-border">
                    {upcoming.map((booking) => (
                      <li key={booking.id} className="flex items-center justify-between gap-3 py-2.5">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">
                            {booking.person_name ?? 'Unnamed client'}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {[booking.treatment_name, booking.therapist_name, booking.room_name]
                              .filter(Boolean)
                              .join(' · ') || 'No treatment set'}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-xs font-medium text-foreground">
                            {formatDate(booking.starts_at, 'EEE HH:mm')}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {formatDuration(booking.durationMinutes)}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Spa store needs attention</CardTitle>
              <CardDescription>Below minimum, expiring or already out of date.</CardDescription>
            </CardHeader>
            <CardContent>
              {inventory.isLoading ? (
                <HealthLoading rows={2} />
              ) : inventory.isError ? (
                <HealthError title="Could not load the spa store" error={inventory.error} />
              ) : lowStock.length === 0 ? (
                <HealthEmpty
                  icon={Package}
                  title="The store is in good order"
                  description="Nothing is below its minimum or close to expiry. Record a stock check after each count to keep it that way."
                  className="border-0 p-6"
                  action={
                    <Button asChild size="sm" variant="outline">
                      <Link to={HEALTH_PATHS.spaInventory}>Open the spa store</Link>
                    </Button>
                  }
                />
              ) : (
                <ul className="divide-y divide-border">
                  {lowStock.map((item) => (
                    <li key={item.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <Link
                          to={HEALTH_PATHS.spaInventory}
                          className="truncate text-sm font-medium text-foreground hover:underline"
                        >
                          {item.name}
                        </Link>
                        <p className="truncate text-xs text-muted-foreground">
                          {Number(item.quantity)} {item.unit} on hand · minimum{' '}
                          {Number(item.minimum_quantity)}
                          {item.vessel_name ? ` · ${item.vessel_name}` : ''}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-1.5">
                        {item.isLow && (
                          <Badge variant="outline" className="border-warning/20 bg-warning/10 text-warning text-[10px]">
                            Low
                          </Badge>
                        )}
                        {item.isExpired ? (
                          <Badge
                            variant="outline"
                            className="border-destructive/20 bg-destructive/10 text-destructive text-[10px]"
                          >
                            Expired
                          </Badge>
                        ) : item.isExpiringSoon ? (
                          <Badge variant="outline" className="border-warning/20 bg-warning/10 text-warning text-[10px]">
                            {item.daysToExpiry}d left
                          </Badge>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Therapists on today</CardTitle>
              <CardDescription>Anyone holding a booking on {formatDate(todayIso, 'd MMMM')}.</CardDescription>
            </CardHeader>
            <CardContent>
              {therapists.isLoading ? (
                <HealthLoading rows={1} />
              ) : therapists.isError ? (
                <HealthError title="Could not load the therapist roster" error={therapists.error} />
              ) : onDutyToday.length === 0 ? (
                <HealthEmpty
                  icon={Users}
                  title="No therapist is holding a booking today"
                  description="Assign a therapist on each booking in the calendar so the day can be split between them."
                  className="border-0 p-6"
                />
              ) : (
                <div className="flex flex-wrap gap-2">
                  {onDutyToday.map((t) => {
                    const count = todaysBookings.filter((b) => b.therapist_id === t.id).length;
                    return (
                      <div
                        key={t.id}
                        className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5"
                      >
                        <span className="text-sm text-foreground">{t.full_name}</span>
                        <Badge variant="secondary" className="text-[10px]">
                          {count} {count === 1 ? 'booking' : 'bookings'}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};

export default SpaDashboardPage;
