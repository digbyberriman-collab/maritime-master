import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, UserPlus, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { HealthPageHeader } from '@/modules/health/components/HealthPageHeader';
import { HealthEmpty, HealthError, HealthLoading } from '@/modules/health/components/HealthStates';
import { PersonPicker } from '@/modules/health/components/PersonPicker';
import { StatGrid, StatTile } from '@/modules/health/components/StatTile';
import {
  AdherenceMeter,
  Fact,
  ProgramStatusBadge,
  StaffOnlyNotice,
} from '@/modules/health/components/pt/PtCommon';
import { useWellnessAccess } from '@/modules/auth/hooks/useWellnessAccess';
import { emptyPersonForm, useHealthPersonMutations, PERSON_TYPES } from '@/modules/health/hooks/useHealthPeople';
import { useAthleteRoster } from '@/modules/health/hooks/usePtPrograms';
import { HEALTH_PATHS, healthLink } from '@/modules/health/paths';
import { formatDate, formatWeight } from '@/modules/health/lib/format';
import { useHealthSettings } from '@/modules/health/hooks/useHealthSettings';

type RosterFilter = 'all' | 'programme' | 'stale' | 'no_programme';

/** Everyone who trains on board, and the state each of them is in. */
const AthleteRosterPage: React.FC = () => {
  const access = useWellnessAccess();
  const navigate = useNavigate();
  const roster = useAthleteRoster();
  const { settings } = useHealthSettings();
  const { createPerson, isMutating } = useHealthPersonMutations();

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<RosterFilter>('all');
  const [guestOpen, setGuestOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [guest, setGuest] = useState({ first_name: '', last_name: '', person_type: 'guest', cabin: '' });

  const entries = useMemo(() => {
    const term = search.trim().toLowerCase();
    return roster.entries.filter((entry) => {
      if (term && !`${entry.name} ${entry.rank ?? ''} ${entry.vesselName ?? ''}`.toLowerCase().includes(term))
        return false;
      if (filter === 'programme') return entry.activeProgram?.status === 'active';
      if (filter === 'stale') return entry.isStale;
      if (filter === 'no_programme') return !entry.activeProgram;
      return true;
    });
  }, [roster.entries, search, filter]);

  if (!access.loading && !access.canView) {
    return (
      <div className="space-y-6">
        <HealthPageHeader icon={Users} title="Athlete roster" description="Everyone training on board." />
        <StaffOnlyNotice what="roster" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <HealthPageHeader
        icon={Users}
        title="Athlete roster"
        description="Crew and guests who are training, with their programme, adherence and latest measurements."
        actions={
          access.canEdit ? (
            <>
              <Button variant="outline" size="sm" onClick={() => setAddOpen(true)}>
                <UserPlus className="mr-2 h-4 w-4" />
                Open an athlete
              </Button>
              <Button size="sm" onClick={() => setGuestOpen(true)}>
                <UserPlus className="mr-2 h-4 w-4" />
                Add a guest athlete
              </Button>
            </>
          ) : undefined
        }
        toolbar={
          <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, rank or vessel"
                className="pl-9"
              />
            </div>
            <Select value={filter} onValueChange={(value) => setFilter(value as RosterFilter)}>
              <SelectTrigger className="sm:w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Everyone</SelectItem>
                <SelectItem value="programme">On an active programme</SelectItem>
                <SelectItem value="stale">Not trained in 14 days</SelectItem>
                <SelectItem value="no_programme">No programme yet</SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
      />

      <StatGrid className="lg:grid-cols-3">
        <StatTile
          icon={Users}
          label="Athletes"
          value={roster.isLoading ? null : roster.summary.total}
          hint="With a programme or a booked session"
        />
        <StatTile
          icon={Users}
          label="On an active programme"
          value={roster.isLoading ? null : roster.summary.onProgramme}
          tone="good"
        />
        <StatTile
          icon={Users}
          label="Not trained in 14 days"
          value={roster.isLoading ? null : roster.summary.stale}
          tone={roster.summary.stale > 0 ? 'warning' : 'good'}
        />
      </StatGrid>

      {roster.isLoading ? (
        <HealthLoading rows={4} />
      ) : roster.isError ? (
        <HealthError error={roster.error} title="Could not load the roster" />
      ) : entries.length === 0 ? (
        <HealthEmpty
          icon={Users}
          title={roster.entries.length ? 'Nobody matches those filters' : 'No athletes yet'}
          description={
            roster.entries.length
              ? 'Clear the search or choose a different filter.'
              : 'Assign a programme or book a session and the athlete will appear here.'
          }
          action={
            access.canEdit && !roster.entries.length ? (
              <Button size="sm" onClick={() => setAddOpen(true)}>
                Open an athlete
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {entries.map((entry) => (
            <Card key={entry.personId}>
              <CardContent className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      to={healthLink(HEALTH_PATHS.athleteWorkspace, entry.personId)}
                      className="truncate text-base font-semibold text-foreground hover:underline"
                    >
                      {entry.name}
                    </Link>
                    <p className="truncate text-xs text-muted-foreground">
                      {[entry.rank, entry.vesselName, entry.isCrew ? 'Crew' : 'Guest'].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {entry.activeProgram ? (
                      <ProgramStatusBadge status={entry.activeProgram.status} />
                    ) : (
                      <Badge variant="outline" className="text-[10px]">
                        No programme
                      </Badge>
                    )}
                    {entry.isStale && (
                      <Badge
                        variant="outline"
                        className="border-warning/20 bg-warning/10 text-[10px] text-warning"
                      >
                        Quiet for 14 days
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Fact label="Programme" value={entry.activeProgram?.name ?? 'None'} />
                  <Fact
                    label="Last session"
                    value={entry.lastSessionOn ? formatDate(entry.lastSessionOn) : 'Never'}
                  />
                  <Fact
                    label="Next booking"
                    value={entry.nextAppointmentAt ? formatDate(entry.nextAppointmentAt) : 'None'}
                  />
                  <Fact label="Open goals" value={entry.openGoals} />
                  <Fact
                    label="Weight"
                    value={formatWeight(entry.latestMeasurement?.weight_kg ?? null, settings?.units)}
                  />
                  <Fact
                    label="Body fat"
                    value={
                      entry.latestMeasurement?.body_fat_pct !== null &&
                      entry.latestMeasurement?.body_fat_pct !== undefined
                        ? `${entry.latestMeasurement.body_fat_pct}%`
                        : '—'
                    }
                  />
                  <Fact
                    label="Measured"
                    value={
                      entry.latestMeasurement ? formatDate(entry.latestMeasurement.measured_on) : 'Never'
                    }
                  />
                  <AdherenceMeter value={entry.adherencePct} label="Last 4 weeks" />
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button asChild size="sm" variant="outline">
                    <Link to={healthLink(HEALTH_PATHS.athleteWorkspace, entry.personId)}>
                      Open workspace
                    </Link>
                  </Button>
                  <Button asChild size="sm" variant="ghost">
                    <Link to={healthLink(HEALTH_PATHS.activePrograms, entry.personId)}>Programmes</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Open an athlete</DialogTitle>
            <DialogDescription>
              Anyone in the health directory can be trained. Choosing someone opens their workspace,
              where you assign a programme.
            </DialogDescription>
          </DialogHeader>
          <PersonPicker
            value={null}
            onChange={(id) => {
              if (!id) return;
              setAddOpen(false);
              navigate(healthLink(HEALTH_PATHS.athleteWorkspace, id));
            }}
            placeholder="Search crew and guests"
          />
        </DialogContent>
      </Dialog>

      <Dialog open={guestOpen} onOpenChange={setGuestOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add a guest athlete</DialogTitle>
            <DialogDescription>
              Guests have no login. This creates the health record the training pages need.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!guest.first_name.trim() || !guest.last_name.trim()) return;
              createPerson.mutate(
                {
                  ...emptyPersonForm(),
                  first_name: guest.first_name,
                  last_name: guest.last_name,
                  person_type: guest.person_type,
                  cabin: guest.cabin || null,
                },
                {
                  onSuccess: (row) => {
                    setGuest({ first_name: '', last_name: '', person_type: 'guest', cabin: '' });
                    setGuestOpen(false);
                    navigate(healthLink(HEALTH_PATHS.athleteWorkspace, row.id));
                  },
                },
              );
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="guest-first">First name</Label>
                <Input
                  id="guest-first"
                  value={guest.first_name}
                  onChange={(e) => setGuest((prev) => ({ ...prev, first_name: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="guest-last">Last name</Label>
                <Input
                  id="guest-last"
                  value={guest.last_name}
                  onChange={(e) => setGuest((prev) => ({ ...prev, last_name: e.target.value }))}
                  required
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select
                value={guest.person_type}
                onValueChange={(value) => setGuest((prev) => ({ ...prev, person_type: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PERSON_TYPES.filter((t) => t.value !== 'crew').map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="guest-cabin">Cabin</Label>
              <Input
                id="guest-cabin"
                value={guest.cabin}
                onChange={(e) => setGuest((prev) => ({ ...prev, cabin: e.target.value }))}
                placeholder="VIP 2"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setGuestOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isMutating}>
                {isMutating ? 'Adding...' : 'Add athlete'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AthleteRosterPage;
