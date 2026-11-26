import React, { Suspense, lazy, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import {
  Users, Search, FileText, Download, IdCard, Ship, Building2, HardHat, AlertTriangle, ListOrdered,
} from 'lucide-react';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import PageHeader from '@/shared/components/layout/PageHeader';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useCrew, type CrewMember } from '@/modules/crew/hooks/useCrew';
import { useVessel } from '@/modules/vessels/contexts/VesselContext';
import OfficialCrewListDialog from '@/modules/crew/components/OfficialCrewListDialog';
import PersonnelRecordDialog from '@/modules/crew/components/PersonnelRecordDialog';
import { personnelToCsv } from '@/modules/crew/lib/crewListPdf';
import { KpiGrid, KpiTile, TABLET_MIN_WIDTH, useMinWidth } from '@/shared/components/data';
import { StatusPill } from '@/shared/components/status';
import { useScope } from '@/app/router/scopeContext';

/**
 * The vessel's positions (X1-01), opened with ?positions=1 and loaded only
 * then. The drawer holds its own gates (crew_list.view to see it,
 * crew_compliance.admin to change it), so this page imports no access code.
 */
const PositionsDrawer = lazy(() => import('@/modules/crew/components/PositionsDrawer'));
const POSITIONS_PARAM = 'positions';

type TypeFilter = 'all' | 'crew' | 'contractor' | 'shoreside';

const TYPE_LABEL: Record<string, string> = {
  crew: 'Crew',
  contractor: 'Contractor',
  shoreside: 'Shoreside',
};

const typeOf = (person: CrewMember) => (person.personnel_type ?? 'crew');

const fmt = (value?: string | null) => {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '—' : format(parsed, 'dd MMM yyyy');
};

const passportWarning = (person: CrewMember) => {
  if (!person.passport_expiry) return false;
  const expiry = new Date(person.passport_expiry);
  if (Number.isNaN(expiry.getTime())) return false;
  const sixMonths = new Date();
  sixMonths.setMonth(sixMonths.getMonth() + 6);
  return expiry <= sixMonths;
};

/** Passport expiry date, flagged when it falls within six months (danger tone plus an icon, never colour alone). */
function PassportExpiry({ person }: { person: CrewMember }) {
  const warn = passportWarning(person);
  return (
    <span className={warn ? 'inline-flex items-center gap-1 font-medium text-critical' : 'inline-flex items-center gap-1'}>
      {warn ? <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5" /> : null}
      {fmt(person.passport_expiry)}
      {warn ? <span className="sr-only"> (expires within six months)</span> : null}
    </span>
  );
}

const CrewList: React.FC = () => {
  const { crew, isLoading } = useCrew();
  const { vessels, selectedVesselId } = useVessel();
  const isWide = useMinWidth(TABLET_MIN_WIDTH);

  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [search, setSearch] = useState('');
  const [vesselFilter, setVesselFilter] = useState('all');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [officialOpen, setOfficialOpen] = useState(false);
  const [recordPerson, setRecordPerson] = useState<CrewMember | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const scope = useScope();
  const routeVessel = scope.scope === 'vessel' ? scope.vessel ?? null : null;
  const positionsOpen = routeVessel !== null && searchParams.get(POSITIONS_PARAM) === '1';
  const setPositionsOpen = (open: boolean) =>
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (open) next.set(POSITIONS_PARAM, '1');
        else next.delete(POSITIONS_PARAM);
        return next;
      },
      { replace: true },
    );

  const departments = useMemo(
    () => Array.from(new Set(crew.map((person) => person.department).filter(Boolean))).sort() as string[],
    [crew],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return crew
      .filter((person) => (typeFilter === 'all' ? true : typeOf(person) === typeFilter))
      .filter((person) => {
        if (vesselFilter === 'all') return true;
        if (vesselFilter === 'unassigned') return !person.current_assignment;
        return person.current_assignment?.vessel_id === vesselFilter;
      })
      .filter((person) => (departmentFilter === 'all' ? true : person.department === departmentFilter))
      .filter((person) => (statusFilter === 'all' ? true : (person.status ?? '') === statusFilter))
      .filter((person) => {
        if (!term) return true;
        return [
          person.first_name, person.last_name, person.preferred_name, person.email,
          person.rank, person.job_title, person.department, person.nationality,
          person.current_assignment?.vessel_name, person.office_location,
        ]
          .filter(Boolean)
          .some((field) => String(field).toLowerCase().includes(term));
      })
      .sort((a, b) => `${a.last_name}`.localeCompare(`${b.last_name}`));
  }, [crew, typeFilter, vesselFilter, departmentFilter, statusFilter, search]);

  const counts = useMemo(() => ({
    all: crew.length,
    crew: crew.filter((person) => typeOf(person) === 'crew').length,
    contractor: crew.filter((person) => typeOf(person) === 'contractor').length,
    shoreside: crew.filter((person) => typeOf(person) === 'shoreside').length,
  }), [crew]);

  const statuses = useMemo(
    () => Array.from(new Set(crew.map((person) => person.status).filter(Boolean))).sort() as string[],
    [crew],
  );

  const handleCsv = () => {
    const blob = new Blob([personnelToCsv(filtered)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `personnel-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const summaryCards = [
    { label: 'Total personnel', value: counts.all, icon: Users },
    { label: 'Crew', value: counts.crew, icon: Ship },
    { label: 'Contractors', value: counts.contractor, icon: HardHat },
    { label: 'Shoreside', value: counts.shoreside, icon: Building2 },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <PageHeader
          className="max-sm:flex-col max-sm:items-stretch"
          title="Crew list"
          description="Every person on the books (crew, contractors and shoreside staff), with the official crew list ready for port and immigration."
          actions={
            <>
              {routeVessel ? (
                <Button variant="outline" onClick={() => setPositionsOpen(true)} aria-haspopup="dialog">
                  <ListOrdered aria-hidden="true" className="mr-2 h-4 w-4" /> Positions
                </Button>
              ) : null}
              <Button variant="outline" onClick={handleCsv} disabled={filtered.length === 0}>
                <Download aria-hidden="true" className="mr-2 h-4 w-4" /> Export list
              </Button>
              <Button onClick={() => setOfficialOpen(true)} disabled={vessels.length === 0}>
                <FileText aria-hidden="true" className="mr-2 h-4 w-4" /> Official crew list
              </Button>
            </>
          }
        />

        <section aria-label="Personnel counts">
          <KpiGrid className="lg:grid-cols-4 min-[1440px]:grid-cols-4">
            {summaryCards.map((card) => (
              <KpiTile
                key={card.label}
                label={card.label}
                icon={card.icon}
                value={card.value}
                state={isLoading ? 'loading' : 'ready'}
              />
            ))}
          </KpiGrid>
        </section>

        <Card>
          <CardHeader className="space-y-4">
            <Tabs value={typeFilter} onValueChange={(value) => setTypeFilter(value as TypeFilter)}>
              {/* Four filters do not fit 390 px: the strip scrolls inside itself, never the page. */}
              <TabsList className="max-w-full justify-start overflow-x-auto">
                <TabsTrigger value="all">Everyone ({counts.all})</TabsTrigger>
                <TabsTrigger value="crew">Crew ({counts.crew})</TabsTrigger>
                <TabsTrigger value="contractor">Contractors ({counts.contractor})</TabsTrigger>
                <TabsTrigger value="shoreside">Shoreside ({counts.shoreside})</TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <div className="relative md:col-span-2">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Search name, rank, vessel, nationality"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
              <Select value={vesselFilter} onValueChange={setVesselFilter}>
                <SelectTrigger><SelectValue placeholder="Vessel" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All vessels &amp; offices</SelectItem>
                  {vessels.map((vessel) => (
                    <SelectItem key={vessel.id} value={vessel.id}>{vessel.name}</SelectItem>
                  ))}
                  <SelectItem value="unassigned">Not assigned to a vessel</SelectItem>
                </SelectContent>
              </Select>
              <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
                <SelectTrigger><SelectValue placeholder="Department" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All departments</SelectItem>
                  {departments.map((department) => (
                    <SelectItem key={department} value={department}>{department}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {statuses.map((status) => (
                    <SelectItem key={status} value={status}>{status}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>

          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {[0, 1, 2, 3, 4].map((row) => <Skeleton key={row} className="h-10 w-full" />)}
              </div>
            ) : filtered.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No personnel match these filters.
              </p>
            ) : isWide ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Rank / job title</TableHead>
                      <TableHead>Department</TableHead>
                      <TableHead>Vessel / office</TableHead>
                      <TableHead>Nationality</TableHead>
                      <TableHead>Passport expiry</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Record</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((person) => (
                      <TableRow key={person.id}>
                        <TableCell>
                          <span className="block font-medium">
                            {person.last_name}, {person.first_name}
                          </span>
                          <span className="block text-xs text-muted-foreground">{person.email}</span>
                        </TableCell>
                        <TableCell>
                          <Badge variant={typeOf(person) === 'crew' ? 'secondary' : 'outline'}>
                            {TYPE_LABEL[typeOf(person)] ?? typeOf(person)}
                          </Badge>
                        </TableCell>
                        <TableCell>{person.rank ?? person.job_title ?? '—'}</TableCell>
                        <TableCell>{person.department ?? '—'}</TableCell>
                        <TableCell>
                          {person.current_assignment?.vessel_name ?? person.office_location ?? '—'}
                        </TableCell>
                        <TableCell>{person.nationality ?? '—'}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          <PassportExpiry person={person} />
                        </TableCell>
                        <TableCell>
                          <StatusPill domain="crew" status={person.status ?? 'unknown'} />
                        </TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="ghost" onClick={() => setRecordPerson(person)}>
                            <IdCard aria-hidden="true" className="mr-1 h-4 w-4" /> Edit
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <ul aria-label="Personnel" className="divide-y divide-border">
                {filtered.map((person) => (
                  <li key={person.id} className="flex items-start gap-3 py-3">
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="truncate font-medium">
                        {person.last_name}, {person.first_name}
                      </p>
                      <p className="truncate text-sm text-muted-foreground">
                        {[person.rank ?? person.job_title, person.current_assignment?.vessel_name ?? person.office_location]
                          .filter(Boolean)
                          .join(' · ') || '—'}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <StatusPill domain="crew" status={person.status ?? 'unknown'} />
                        <Badge variant={typeOf(person) === 'crew' ? 'secondary' : 'outline'}>
                          {TYPE_LABEL[typeOf(person)] ?? typeOf(person)}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          Passport <PassportExpiry person={person} />
                        </span>
                      </div>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setRecordPerson(person)}
                      aria-label={`Edit personnel record: ${person.first_name} ${person.last_name}`}
                    >
                      <IdCard aria-hidden="true" className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <OfficialCrewListDialog
        open={officialOpen}
        onOpenChange={setOfficialOpen}
        vessels={vessels}
        defaultVesselId={selectedVesselId}
        people={crew}
      />

      <PersonnelRecordDialog
        open={!!recordPerson}
        onOpenChange={(open) => { if (!open) setRecordPerson(null); }}
        person={recordPerson}
      />

      {positionsOpen && routeVessel ? (
        <Suspense fallback={null}>
          <PositionsDrawer
            open
            onOpenChange={setPositionsOpen}
            vessel={{ id: routeVessel.id, companyId: routeVessel.company_id, name: routeVessel.name }}
          />
        </Suspense>
      ) : null}
    </DashboardLayout>
  );
};

export default CrewList;
