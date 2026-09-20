import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  HeartPulse,
  Pill,
  Plus,
  Search,
  Syringe,
  UserPlus,
  Users,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { HealthPageHeader } from '@/modules/health/components/HealthPageHeader';
import { StatTile, StatGrid } from '@/modules/health/components/StatTile';
import { HealthEmpty, HealthError, HealthLoading } from '@/modules/health/components/HealthStates';
import { PersonFormDialog } from '@/modules/health/components/PersonFormDialog';
import {
  personTypeLabel,
  PERSON_TYPES,
  useHealthPeople,
  type HealthPersonEntry,
} from '@/modules/health/hooks/useHealthPeople';
import { useFitnessStatus } from '@/modules/health/hooks/useFitnessAssessments';
import { useAllergies, useConditions, useMedications } from '@/modules/health/hooks/usePatientRecord';
import { useMedicalAccess } from '@/modules/auth/hooks/useMedicalAccess';
import { HEALTH_PATHS, healthLink } from '@/modules/health/paths';
import { FITNESS_LABELS, FITNESS_TONE, badgeToneClass, formatDate } from '@/modules/health/lib/format';

interface PatientRow extends HealthPersonEntry {
  fitnessState: string;
  fitnessExpires: string | null;
  severeAllergies: number;
  activeConditions: number;
  activeMedications: number;
}

const initials = (p: HealthPersonEntry) =>
  `${p.first_name?.[0] ?? ''}${p.last_name?.[0] ?? ''}`.toUpperCase();

/**
 * Everyone the ship's medic is responsible for: crew, guests, the owner's
 * party and contractors. The list leads with what would stop someone
 * working or put them at risk, not with demographics.
 */
const MedicalPatientsPage: React.FC = () => {
  const access = useMedicalAccess();
  const people = useHealthPeople({ includeInactive: true });
  const fitness = useFitnessStatus();
  const allergies = useAllergies({ activeOnly: true });
  const conditions = useConditions({ activeOnly: true });
  const medications = useMedications({ activeOnly: true });

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [flagFilter, setFlagFilter] = useState('all');
  const [showInactive, setShowInactive] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const rows = useMemo<PatientRow[]>(() => {
    const fitnessByPerson = new Map(fitness.rows.map((f) => [f.person_id, f]));
    const countBy = <T extends { person_id: string }>(list: T[]) => {
      const map = new Map<string, number>();
      for (const item of list) map.set(item.person_id, (map.get(item.person_id) ?? 0) + 1);
      return map;
    };
    const severe = countBy(
      allergies.allergies.filter((a) => a.severity === 'severe' || a.severity === 'anaphylaxis'),
    );
    const conds = countBy(conditions.conditions);
    const meds = countBy(medications.medications);

    return people.all.map((p) => {
      const f = fitnessByPerson.get(p.id);
      return {
        ...p,
        fitnessState: f?.fitness_state ?? 'unknown',
        fitnessExpires: f?.expires_on ?? null,
        severeAllergies: severe.get(p.id) ?? 0,
        activeConditions: conds.get(p.id) ?? 0,
        activeMedications: meds.get(p.id) ?? 0,
      };
    });
  }, [people.all, fitness.rows, allergies.allergies, conditions.conditions, medications.medications]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (!showInactive && !row.is_active) return false;
      if (typeFilter !== 'all' && row.person_type !== typeFilter) return false;
      if (flagFilter === 'allergies' && row.severeAllergies === 0) return false;
      if (flagFilter === 'conditions' && row.activeConditions === 0) return false;
      if (flagFilter === 'medications' && row.activeMedications === 0) return false;
      if (
        flagFilter === 'not_fit' &&
        !['expired', 'unfit', 'expiring'].includes(row.fitnessState)
      ) {
        return false;
      }
      if (!term) return true;
      return [row.fullName, row.preferred_name, row.rank, row.department, row.cabin, row.vessel_name]
        .filter(Boolean)
        .some((value) => (value as string).toLowerCase().includes(term));
    });
  }, [rows, search, typeFilter, flagFilter, showInactive]);

  const loading = people.isLoading || fitness.isLoading;

  const summary = useMemo(
    () => ({
      total: rows.filter((r) => r.is_active).length,
      crew: rows.filter((r) => r.is_active && r.isCrew).length,
      guests: rows.filter((r) => r.is_active && !r.isCrew).length,
      flagged: rows.filter(
        (r) => r.is_active && (r.severeAllergies > 0 || ['expired', 'unfit'].includes(r.fitnessState)),
      ).length,
    }),
    [rows],
  );

  let body: React.ReactNode;
  if (people.isError) {
    body = <HealthError error={people.error} title="Could not load the patient list" />;
  } else if (loading) {
    body = <HealthLoading rows={5} />;
  } else if (filtered.length === 0) {
    body = (
      <HealthEmpty
        icon={Users}
        title={rows.length === 0 ? 'No people on the list yet' : 'Nobody matches those filters'}
        description={
          rows.length === 0
            ? 'Crew appear here automatically from their profile. Add guests and the owner’s party by hand.'
            : 'Clear the search or the filters to see everyone again.'
        }
        action={
          access.canEdit && rows.length === 0 ? (
            <Button onClick={() => setAddOpen(true)} className="gap-1">
              <UserPlus className="h-4 w-4" /> Add a guest
            </Button>
          ) : undefined
        }
      />
    );
  } else {
    body = (
      <Card>
        <CardContent className="p-0">
          <div className="divide-y">
            {filtered.map((row) => (
              <PatientListRow key={row.id} row={row} />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <HealthPageHeader
        icon={Users}
        scope="medical"
        title="Patients"
        description="Everyone on board the medic is responsible for, with what matters clinically first."
        actions={
          access.canEdit && (
            <Button onClick={() => setAddOpen(true)} size="sm" className="gap-1">
              <Plus className="h-4 w-4" /> Add a guest
            </Button>
          )
        }
        toolbar={
          <>
            <div className="relative md:w-72">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, rank, cabin or vessel"
                className="pl-8"
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="md:w-44">
                <SelectValue placeholder="Everyone" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Everyone</SelectItem>
                {PERSON_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={flagFilter} onValueChange={setFlagFilter}>
              <SelectTrigger className="md:w-52">
                <SelectValue placeholder="No flag filter" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">No flag filter</SelectItem>
                <SelectItem value="not_fit">Not fit or expiring</SelectItem>
                <SelectItem value="allergies">Severe allergies</SelectItem>
                <SelectItem value="conditions">Ongoing conditions</SelectItem>
                <SelectItem value="medications">On medication</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant={showInactive ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setShowInactive((v) => !v)}
            >
              {showInactive ? 'Hiding nobody' : 'Show inactive'}
            </Button>
          </>
        }
      />

      <StatGrid>
        <StatTile icon={Users} label="On the list" value={loading ? null : summary.total} />
        <StatTile icon={HeartPulse} label="Crew" value={loading ? null : summary.crew} />
        <StatTile icon={UserPlus} label="Guests and others" value={loading ? null : summary.guests} />
        <StatTile
          icon={AlertTriangle}
          label="Flagged"
          value={loading ? null : summary.flagged}
          hint="Severe allergy, expired or unfit"
          tone={summary.flagged > 0 ? 'warning' : 'good'}
        />
      </StatGrid>

      {body}

      <PersonFormDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
};

const PatientListRow: React.FC<{ row: PatientRow }> = ({ row }) => {
  const tone = FITNESS_TONE[row.fitnessState as keyof typeof FITNESS_TONE] ?? 'default';
  return (
    <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <Avatar className="h-9 w-9">
          <AvatarFallback className="text-xs">{initials(row)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to={healthLink(HEALTH_PATHS.crewMedicalRecords, row.id)}
              className="truncate font-medium text-foreground hover:underline"
            >
              {row.displayName}
            </Link>
            {!row.isCrew && (
              <Badge variant="outline" className="text-[10px]">
                {personTypeLabel(row.person_type)}
              </Badge>
            )}
            {!row.is_active && (
              <Badge variant="outline" className="text-[10px]">
                Inactive
              </Badge>
            )}
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {[row.rank, row.department, row.cabin, row.vessel_name].filter(Boolean).join(' · ') ||
              'No posting recorded'}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {row.severeAllergies > 0 && (
          <Badge variant="outline" className={cn('gap-1 text-[10px]', badgeToneClass.critical)}>
            <AlertTriangle className="h-3 w-3" />
            {row.severeAllergies} severe {row.severeAllergies === 1 ? 'allergy' : 'allergies'}
          </Badge>
        )}
        {row.activeConditions > 0 && (
          <Badge variant="outline" className="gap-1 text-[10px]">
            <HeartPulse className="h-3 w-3" />
            {row.activeConditions} {row.activeConditions === 1 ? 'condition' : 'conditions'}
          </Badge>
        )}
        {row.activeMedications > 0 && (
          <Badge variant="outline" className="gap-1 text-[10px]">
            <Pill className="h-3 w-3" />
            {row.activeMedications}
          </Badge>
        )}
        <Badge variant="outline" className={cn('text-[10px]', badgeToneClass[tone])}>
          {FITNESS_LABELS[row.fitnessState as keyof typeof FITNESS_LABELS] ?? 'No certificate'}
        </Badge>
        {row.fitnessExpires && (
          <span className="text-[11px] text-muted-foreground">
            to {formatDate(row.fitnessExpires)}
          </span>
        )}
        <Button asChild variant="ghost" size="sm">
          <Link to={healthLink(HEALTH_PATHS.vaccinations, row.id)} aria-label={`Vaccinations for ${row.displayName}`}>
            <Syringe className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
};

export default MedicalPatientsPage;
