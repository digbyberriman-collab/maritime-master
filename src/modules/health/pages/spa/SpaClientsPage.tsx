import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CalendarRange, Search, UserPlus, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { HealthPageHeader } from '@/modules/health/components/HealthPageHeader';
import { HealthEmpty, HealthError, HealthLoading } from '@/modules/health/components/HealthStates';
import { BookingStatusBadge } from '@/modules/health/components/spa/BookingStatusBadge';
import { AddGuestDialog } from '@/modules/health/components/spa/AddGuestDialog';
import { useWellnessAccess } from '@/modules/auth/hooks/useWellnessAccess';
import { useCompanyVessels } from '@/modules/hris/hooks/useCrewContracts';
import {
  personTypeLabel,
  useHealthPeople,
  useHealthPersonMutations,
  type HealthPersonFormData,
} from '@/modules/health/hooks/useHealthPeople';
import { useAllergies } from '@/modules/health/hooks/usePatientRecord';
import { useSpaClients } from '@/modules/health/hooks/useSpa';
import { badgeToneClass, formatDate, formatDuration, SEVERITY_TONE } from '@/modules/health/lib/format';
import { HEALTH_PATHS, healthLink } from '@/modules/health/paths';

/** Spa clients: who has been in, what they book and what they react to. */
const SpaClientsPage: React.FC = () => {
  const wellness = useWellnessAccess();
  const canEdit = !wellness.loading && wellness.canEdit;

  const { clients, isLoading, isError, error } = useSpaClients();
  const directory = useHealthPeople({ includeInactive: true });
  const { vessels } = useCompanyVessels();
  const { createPerson } = useHealthPersonMutations();

  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const peopleById = useMemo(
    () => new Map(directory.all.map((p) => [p.id, p])),
    [directory.all],
  );

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return clients
      .map((client) => ({ ...client, person: peopleById.get(client.personId) ?? null }))
      .filter((client) => {
        if (!term) return true;
        const person = client.person;
        const haystack = [
          person?.fullName,
          person?.preferred_name,
          person?.cabin,
          person?.rank,
          person?.vessel_name,
          ...client.favourites,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return haystack.includes(term);
      });
  }, [clients, peopleById, search]);

  const selected = useMemo(
    () => rows.find((c) => c.personId === selectedId) ?? null,
    [rows, selectedId],
  );

  // Allergies come from the clinical tables and are only returned when the
  // reader is allowed them and the subject has consented, so an empty list
  // here is not the same as "no allergies". The copy below says so.
  const allergies = useAllergies({ personId: selectedId, activeOnly: true });

  const handleAddGuest = async (values: HealthPersonFormData) => {
    const created = await createPerson.mutateAsync(values);
    setAddOpen(false);
    setSelectedId(created.id);
  };

  return (
    <div className="space-y-6">
      <HealthPageHeader
        icon={Users}
        title="Spa clients"
        description="Everyone the spa has treated, what they book and anything the therapist needs to know first."
        actions={
          canEdit ? (
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <UserPlus className="mr-2 h-4 w-4" /> Add a client
            </Button>
          ) : undefined
        }
        toolbar={
          <div className="relative w-full md:max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, cabin, rank or treatment"
              className="pl-9"
            />
          </div>
        }
      />

      {isLoading ? (
        <HealthLoading rows={4} />
      ) : isError ? (
        <HealthError title="Could not load the client list" error={error} />
      ) : clients.length === 0 ? (
        <HealthEmpty
          icon={Users}
          title="Nobody has been booked into the spa yet"
          description="Clients appear here the first time they are booked. Add a guest or the owner's party first, then put them in the calendar."
          action={
            canEdit ? (
              <div className="flex flex-wrap justify-center gap-2">
                <Button onClick={() => setAddOpen(true)}>
                  <UserPlus className="mr-2 h-4 w-4" /> Add a client
                </Button>
                <Button asChild variant="outline">
                  <Link to={HEALTH_PATHS.spaCalendar}>Open the calendar</Link>
                </Button>
              </div>
            ) : undefined
          }
        />
      ) : rows.length === 0 ? (
        <HealthEmpty
          icon={Search}
          title="No client matches that search"
          description="Try a surname, a cabin number or the name of a treatment they book."
          action={
            <Button variant="outline" onClick={() => setSearch('')}>
              Clear the search
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                {rows.length} {rows.length === 1 ? 'client' : 'clients'}
              </CardTitle>
              <CardDescription>Most recently treated first.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <ul className="divide-y divide-border">
                {rows.map((client) => {
                  const person = client.person;
                  const isSelected = client.personId === selectedId;
                  return (
                    <li key={client.personId}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(client.personId)}
                        className={cn(
                          'flex w-full flex-col gap-1 px-4 py-3 text-left transition-colors hover:bg-accent/50 sm:flex-row sm:items-center sm:justify-between',
                          isSelected && 'bg-accent/60',
                        )}
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">
                            {person?.displayName ?? 'Unknown client'}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {[
                              person ? personTypeLabel(person.person_type) : null,
                              person?.cabin ? `Cabin ${person.cabin}` : null,
                              person?.vessel_name,
                            ]
                              .filter(Boolean)
                              .join(' · ') || 'No cabin recorded'}
                          </p>
                          {client.favourites.length > 0 && (
                            <p className="truncate text-xs text-muted-foreground">
                              Books: {client.favourites.join(', ')}
                            </p>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-3 text-right">
                          <div>
                            <p className="text-sm font-medium text-foreground">{client.visits}</p>
                            <p className="text-[11px] text-muted-foreground">visits</p>
                          </div>
                          <div className="hidden sm:block">
                            <p className="text-xs text-foreground">{formatDate(client.lastVisit)}</p>
                            <p className="text-[11px] text-muted-foreground">last visit</p>
                          </div>
                          {client.noShows > 0 && (
                            <Badge
                              variant="outline"
                              className="border-warning/20 bg-warning/10 text-[10px] text-warning"
                            >
                              {client.noShows} no show
                            </Badge>
                          )}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>

          <div className="space-y-4">
            {!selected ? (
              <HealthEmpty
                icon={Users}
                title="Choose a client"
                description="Pick someone from the list to see their allergies and their booking history."
              />
            ) : (
              <>
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">
                      {selected.person?.displayName ?? 'Client'}
                    </CardTitle>
                    <CardDescription>
                      {selected.visits} {selected.visits === 1 ? 'visit' : 'visits'} ·{' '}
                      {selected.nextBooking
                        ? `next in on ${formatDate(selected.nextBooking, 'd MMM, HH:mm')}`
                        : 'nothing booked ahead'}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground">Last visit</p>
                        <p className="text-foreground">{formatDate(selected.lastVisit)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Cabin</p>
                        <p className="text-foreground">{selected.person?.cabin ?? '—'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Type</p>
                        <p className="text-foreground">
                          {selected.person ? personTypeLabel(selected.person.person_type) : '—'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">No shows</p>
                        <p className="text-foreground">{selected.noShows}</p>
                      </div>
                    </div>

                    {selected.favourites.length > 0 && (
                      <div>
                        <p className="mb-1 text-xs text-muted-foreground">Preferred treatments</p>
                        <div className="flex flex-wrap gap-1.5">
                          {selected.favourites.map((name) => (
                            <Badge key={name} variant="secondary" className="text-[10px]">
                              {name}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    <Button asChild size="sm" variant="outline" className="w-full">
                      <Link to={healthLink(HEALTH_PATHS.spaCalendar, selected.personId)}>
                        <CalendarRange className="mr-2 h-4 w-4" /> Open the calendar
                      </Link>
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <AlertTriangle className="h-4 w-4 text-warning" /> Allergies
                    </CardTitle>
                    <CardDescription>
                      Shown only where the client has consented to share safety flags.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {allergies.isLoading ? (
                      <HealthLoading rows={1} />
                    ) : allergies.allergies.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        Nothing recorded that you can see. Always ask the client before a treatment.
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {allergies.allergies.map((a) => (
                          <li key={a.id} className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-foreground">{a.allergen}</p>
                              {a.reaction && (
                                <p className="truncate text-xs text-muted-foreground">{a.reaction}</p>
                              )}
                            </div>
                            <Badge
                              variant="outline"
                              className={cn(
                                'shrink-0 text-[10px]',
                                badgeToneClass[SEVERITY_TONE[a.severity ?? ''] ?? 'default'],
                              )}
                            >
                              {a.severity ?? 'Unknown'}
                            </Badge>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Booking history</CardTitle>
                    <CardDescription>Newest first.</CardDescription>
                  </CardHeader>
                  <CardContent className="p-0">
                    <ul className="max-h-[420px] divide-y divide-border overflow-y-auto">
                      {selected.bookings.map((booking) => (
                        <li key={booking.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                          <div className="min-w-0">
                            <p className="truncate text-sm text-foreground">
                              {booking.treatment_name ?? 'No treatment set'}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {formatDate(booking.starts_at, 'd MMM yyyy, HH:mm')} ·{' '}
                              {formatDuration(booking.durationMinutes)}
                              {booking.therapist_name ? ` · ${booking.therapist_name}` : ''}
                            </p>
                          </div>
                          <BookingStatusBadge status={booking.status} className="shrink-0" />
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </div>
      )}

      <AddGuestDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        vessels={vessels}
        onSubmit={handleAddGuest}
        isPending={createPerson.isPending}
      />
    </div>
  );
};

export default SpaClientsPage;
