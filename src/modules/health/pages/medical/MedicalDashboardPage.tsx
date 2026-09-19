import React from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  BriefcaseMedical,
  CalendarClock,
  ClipboardCheck,
  HeartPulse,
  LifeBuoy,
  Package,
  ShieldAlert,
  Stethoscope,
  Wrench,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { HealthPageHeader } from '@/modules/health/components/HealthPageHeader';
import { StatTile, StatGrid } from '@/modules/health/components/StatTile';
import { HealthEmpty } from '@/modules/health/components/HealthStates';
import { useMedicalDashboard } from '@/modules/health/hooks/useMedicalDashboard';
import { HEALTH_PATHS, healthLink } from '@/modules/health/paths';
import { formatDate, humanise } from '@/modules/health/lib/format';

const ITEM_TYPE_LABEL: Record<string, string> = {
  fitness: 'Fitness certificate',
  vaccination: 'Vaccination',
  practitioner_licence: 'Practitioner licence',
  practitioner_qualification: 'Qualification',
  medical_stock: 'Medical stores',
  medical_equipment: 'Equipment check',
  medical_equipment_service: 'Equipment service',
  first_aid_kit: 'First aid kit',
  protocol_review: 'Protocol review',
  screening_due: 'Health screening',
};

const ITEM_TYPE_PATH: Record<string, string> = {
  fitness: HEALTH_PATHS.fitnessToWork,
  vaccination: HEALTH_PATHS.vaccinations,
  practitioner_licence: HEALTH_PATHS.medicalStaff,
  practitioner_qualification: HEALTH_PATHS.medicalStaff,
  medical_stock: HEALTH_PATHS.medicalSupplies,
  medical_equipment: HEALTH_PATHS.medicalEquipment,
  medical_equipment_service: HEALTH_PATHS.medicalEquipment,
  first_aid_kit: HEALTH_PATHS.medicalFirstAid,
  protocol_review: HEALTH_PATHS.medicalProtocols,
  screening_due: HEALTH_PATHS.medicalScreening,
};

/**
 * The ship's medical dashboard: who cannot sail, what is running out, what is
 * overdue a check, and what has happened in the last month.
 */
const MedicalDashboardPage: React.FC = () => {
  const data = useMedicalDashboard();

  const urgent = data.expiry.items.filter((i) => (i.days_remaining ?? 0) < 0);
  const soon = data.expiry.items.filter(
    (i) => (i.days_remaining ?? 0) >= 0 && (i.days_remaining ?? 0) <= 30,
  );

  return (
    <div className="space-y-6">
      <HealthPageHeader
        icon={Stethoscope}
        scope="medical"
        title="Medical dashboard"
        description="Fitness to work, medical stores, equipment readiness and recent clinical activity."
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link to={HEALTH_PATHS.medicalPatients}>Patients</Link>
            </Button>
            <Button asChild size="sm">
              <Link to={HEALTH_PATHS.treatmentHistory}>Record a consultation</Link>
            </Button>
          </>
        }
      />

      <section aria-labelledby="fitness-heading" className="space-y-3">
        <h2 id="fitness-heading" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Fitness to work
        </h2>
        <StatGrid>
          <StatTile
            icon={HeartPulse}
            label="Fit for duty"
            value={data.loading ? null : data.fitness.valid}
            tone="good"
            to={HEALTH_PATHS.fitnessToWork}
          />
          <StatTile
            icon={ShieldAlert}
            label="Fit with restrictions"
            value={data.loading ? null : data.fitness.restricted}
            tone="warning"
            to={HEALTH_PATHS.fitnessToWork}
          />
          <StatTile
            icon={CalendarClock}
            label="Expiring within 30 days"
            value={data.loading ? null : data.fitness.expiring}
            tone="warning"
            to={HEALTH_PATHS.fitnessToWork}
          />
          <StatTile
            icon={AlertTriangle}
            label="Expired or unfit"
            value={data.loading ? null : data.fitness.expired + data.fitness.unfit}
            hint="Cannot sail without review"
            tone={data.fitness.expired + data.fitness.unfit > 0 ? 'critical' : 'good'}
            to={HEALTH_PATHS.fitnessToWork}
          />
        </StatGrid>
      </section>

      <section aria-labelledby="readiness-heading" className="space-y-3">
        <h2 id="readiness-heading" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Readiness
        </h2>
        <StatGrid>
          <StatTile
            icon={Package}
            label="Stores below minimum"
            value={data.loading ? null : data.stores.low}
            hint={`${data.stores.expired} expired, ${data.stores.expiringSoon} expiring`}
            tone={data.stores.low > 0 ? 'warning' : 'good'}
            to={HEALTH_PATHS.medicalSupplies}
          />
          <StatTile
            icon={Wrench}
            label="Equipment defective"
            value={data.loading ? null : data.equipment.defective}
            hint={`${data.equipment.checkOverdue} checks overdue`}
            tone={data.equipment.defective > 0 ? 'critical' : 'good'}
            to={HEALTH_PATHS.medicalEquipment}
          />
          <StatTile
            icon={LifeBuoy}
            label="Kits needing attention"
            value={data.loading ? null : data.kits.needsAttention}
            hint={`${data.kits.overdue} inspections overdue`}
            tone={data.kits.needsAttention > 0 ? 'warning' : 'good'}
            to={HEALTH_PATHS.medicalFirstAid}
          />
          <StatTile
            icon={AlertTriangle}
            label="Severe allergies on board"
            value={data.loading ? null : data.severeAllergies}
            hint="Anaphylaxis or severe"
            tone={data.severeAllergies > 0 ? 'warning' : 'default'}
            to={HEALTH_PATHS.allergiesConditions}
          />
        </StatGrid>
      </section>

      <section aria-labelledby="activity-heading" className="space-y-3">
        <h2 id="activity-heading" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Last 30 days
        </h2>
        <StatGrid>
          <StatTile
            icon={BriefcaseMedical}
            label="Consultations"
            value={data.loading ? null : data.consultations.last30}
            to={HEALTH_PATHS.treatmentHistory}
          />
          <StatTile
            icon={Activity}
            label="Referred or evacuated"
            value={data.loading ? null : data.consultations.escalated30}
            tone={data.consultations.escalated30 > 0 ? 'warning' : 'default'}
            to={HEALTH_PATHS.treatmentHistory}
          />
          <StatTile
            icon={CalendarClock}
            label="Days lost to sickness"
            value={data.loading ? null : data.consultations.daysLost30}
            to={HEALTH_PATHS.treatmentHistory}
          />
          <StatTile
            icon={ClipboardCheck}
            label="Screenings outstanding"
            value={data.loading ? null : data.screening.outstanding}
            hint={`${data.screening.awaitingReview} awaiting review`}
            tone={data.screening.outstanding > 0 ? 'warning' : 'good'}
            to={HEALTH_PATHS.medicalScreening}
          />
        </StatGrid>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Overdue</CardTitle>
            <CardDescription>
              {urgent.length ? 'These have passed their date.' : 'Nothing is overdue.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {data.expiry.isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : urgent.length === 0 ? (
              <HealthEmpty
                icon={ClipboardCheck}
                title="All clear"
                description="No expired certificates, stores or checks."
                className="border-0 p-6"
              />
            ) : (
              <ul className="divide-y">
                {urgent.slice(0, 8).map((item) => (
                  <ExpiryRow key={`${item.item_type}-${item.record_id}`} item={item} />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Due within 30 days</CardTitle>
            <CardDescription>
              {soon.length ? 'Plan these before the next passage.' : 'Nothing due in the next month.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {data.expiry.isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : soon.length === 0 ? (
              <HealthEmpty
                icon={CalendarClock}
                title="Nothing due"
                description="The next 30 days are clear."
                className="border-0 p-6"
              />
            ) : (
              <ul className="divide-y">
                {soon.slice(0, 8).map((item) => (
                  <ExpiryRow key={`${item.item_type}-${item.record_id}`} item={item} />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

interface ExpiryRowProps {
  item: {
    item_type: string | null;
    record_id: string | null;
    person_id: string | null;
    person_name: string | null;
    label: string | null;
    due_date: string | null;
    days_remaining: number | null;
  };
}

const ExpiryRow: React.FC<ExpiryRowProps> = ({ item }) => {
  const days = item.days_remaining ?? 0;
  const overdue = days < 0;
  const path = ITEM_TYPE_PATH[item.item_type ?? ''] ?? HEALTH_PATHS.medicalDashboard;
  return (
    <li className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <Link
          to={healthLink(path, item.person_id)}
          className="truncate text-sm font-medium text-foreground hover:underline"
        >
          {item.label ?? '—'}
        </Link>
        <p className="truncate text-xs text-muted-foreground">
          {[item.person_name, ITEM_TYPE_LABEL[item.item_type ?? ''] ?? humanise(item.item_type)]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <Badge
          variant="outline"
          className={cn(
            'text-[10px]',
            overdue
              ? 'border-destructive/20 bg-destructive/10 text-destructive'
              : 'border-warning/20 bg-warning/10 text-warning',
          )}
        >
          {overdue ? `${Math.abs(days)}d overdue` : `${days}d left`}
        </Badge>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{formatDate(item.due_date)}</p>
      </div>
    </li>
  );
};

export default MedicalDashboardPage;
