import React from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Droplet, Phone, ShieldAlert, Ship } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { personTypeLabel, type HealthPersonEntry } from '@/modules/health/hooks/useHealthPeople';
import { useAllergies, usePatientRecord } from '@/modules/health/hooks/usePatientRecord';
import { useFitnessStatus } from '@/modules/health/hooks/useFitnessAssessments';
import { HEALTH_PATHS, healthLink } from '@/modules/health/paths';
import { FITNESS_LABELS, FITNESS_TONE, badgeToneClass, formatDate } from '@/modules/health/lib/format';

interface PersonClinicalBannerProps {
  person: HealthPersonEntry;
  /** Hide the links when the banner is already on that page. */
  compact?: boolean;
}

/**
 * The strip a medic reads first: who this is, their blood group, anything
 * that would kill them, and whether they are fit to work. It sits at the top
 * of every personnel record page so the answer is never a click away.
 */
export const PersonClinicalBanner: React.FC<PersonClinicalBannerProps> = ({ person, compact }) => {
  const record = usePatientRecord(person.id);
  const allergies = useAllergies({ personId: person.id, activeOnly: true });
  const fitness = useFitnessStatus();

  const current = fitness.rows.find((f) => f.person_id === person.id) ?? null;
  const state = (current?.state ?? 'unknown') as keyof typeof FITNESS_LABELS;
  const severe = allergies.allergies.filter(
    (a) => a.severity === 'severe' || a.severity === 'anaphylaxis',
  );
  const initials = `${person.first_name?.[0] ?? ''}${person.last_name?.[0] ?? ''}`.toUpperCase();

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar className="h-11 w-11">
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate text-lg font-semibold text-foreground">{person.displayName}</p>
                {!person.isCrew && (
                  <Badge variant="outline" className="text-[10px]">
                    {personTypeLabel(person.person_type)}
                  </Badge>
                )}
                {record.record?.blood_group && record.record.blood_group !== 'unknown' && (
                  <Badge variant="outline" className="gap-1 text-[10px]">
                    <Droplet className="h-3 w-3" /> {record.record.blood_group}
                  </Badge>
                )}
              </div>
              <p className="truncate text-xs text-muted-foreground">
                {[
                  person.rank,
                  person.department,
                  person.cabin ? `Cabin ${person.cabin}` : null,
                  person.date_of_birth ? `Born ${formatDate(person.date_of_birth)}` : null,
                ]
                  .filter(Boolean)
                  .join(' · ') || 'No details recorded'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {person.vessel_name && (
              <Badge variant="outline" className="gap-1 text-[10px]">
                <Ship className="h-3 w-3" /> {person.vessel_name}
              </Badge>
            )}
            <Badge
              variant="outline"
              className={cn('text-[10px]', badgeToneClass[FITNESS_TONE[state] ?? 'default'])}
            >
              {FITNESS_LABELS[state]}
              {current?.expires_on ? ` to ${formatDate(current.expires_on)}` : ''}
            </Badge>
          </div>
        </div>

        {record.record?.critical_alert && (
          <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-2.5 text-sm text-destructive">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{record.record.critical_alert}</span>
          </div>
        )}

        {severe.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-md bg-warning/10 p-2.5 text-sm text-warning">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span className="font-medium">Allergies:</span>
            {severe.map((a) => (
              <Badge key={a.id} variant="outline" className={cn('text-[10px]', badgeToneClass.critical)}>
                {a.allergen}
                {a.carries_autoinjector ? ' (carries auto-injector)' : ''}
              </Badge>
            ))}
          </div>
        )}

        {current?.restrictions && (
          <p className="rounded-md bg-muted/60 p-2.5 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Restrictions: </span>
            {current.restrictions}
          </p>
        )}

        {!compact && (
          <div className="flex flex-wrap gap-2 border-t pt-3">
            <Button asChild variant="outline" size="sm">
              <Link to={healthLink(HEALTH_PATHS.crewMedicalRecords, person.id)}>Record</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to={healthLink(HEALTH_PATHS.fitnessToWork, person.id)}>Fitness</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to={healthLink(HEALTH_PATHS.allergiesConditions, person.id)}>Allergies</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to={healthLink(HEALTH_PATHS.medications, person.id)}>Medication</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to={healthLink(HEALTH_PATHS.vaccinations, person.id)}>Vaccinations</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to={healthLink(HEALTH_PATHS.treatmentHistory, person.id)}>History</Link>
            </Button>
            {person.emergency_contact_phone && (
              <Button asChild variant="outline" size="sm" className="gap-1">
                <a href={`tel:${person.emergency_contact_phone}`}>
                  <Phone className="h-4 w-4" /> {person.emergency_contact_name ?? 'Emergency contact'}
                </a>
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default PersonClinicalBanner;
