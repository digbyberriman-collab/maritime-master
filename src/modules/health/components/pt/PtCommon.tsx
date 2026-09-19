import React from 'react';
import { Link } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { badgeToneClass } from '@/modules/health/lib/format';
import {
  adherenceTone,
  appointmentStatusLabel,
  appointmentStatusTone,
  programStatusLabel,
  programStatusTone,
  sessionStatusLabel,
  sessionStatusTone,
  type PtTone,
} from '@/modules/health/hooks/usePtPrograms';
import { blockLabel } from '@/modules/health/hooks/usePtLibrary';
import { HEALTH_PATHS } from '@/modules/health/paths';

interface ToneBadgeProps {
  tone: PtTone;
  children: React.ReactNode;
  className?: string;
}

export const ToneBadge: React.FC<ToneBadgeProps> = ({ tone, children, className }) => (
  <Badge variant="outline" className={cn('text-[10px] font-medium', badgeToneClass[tone], className)}>
    {children}
  </Badge>
);

export const ProgramStatusBadge: React.FC<{ status: string | null | undefined }> = ({ status }) => (
  <ToneBadge tone={programStatusTone(status)}>{programStatusLabel(status)}</ToneBadge>
);

export const SessionStatusBadge: React.FC<{ status: string | null | undefined }> = ({ status }) => (
  <ToneBadge tone={sessionStatusTone(status)}>{sessionStatusLabel(status)}</ToneBadge>
);

export const AppointmentStatusBadge: React.FC<{ status: string | null | undefined }> = ({ status }) => (
  <ToneBadge tone={appointmentStatusTone(status)}>{appointmentStatusLabel(status)}</ToneBadge>
);

interface AdherenceMeterProps {
  value: number | null;
  label?: string;
  className?: string;
}

/** Adherence as a bar plus the number, used on rosters and programme cards. */
export const AdherenceMeter: React.FC<AdherenceMeterProps> = ({ value, label, className }) => {
  const tone = adherenceTone(value);
  const barTone =
    tone === 'good'
      ? '[&>div]:bg-success'
      : tone === 'warning'
        ? '[&>div]:bg-warning'
        : tone === 'critical'
          ? '[&>div]:bg-destructive'
          : '[&>div]:bg-primary';
  return (
    <div className={cn('min-w-[7rem] space-y-1', className)}>
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="text-muted-foreground">{label ?? 'Adherence'}</span>
        <span className="font-medium text-foreground">{value === null ? 'No sessions due' : `${value}%`}</span>
      </div>
      <Progress value={value ?? 0} className={cn('h-1.5', barTone)} />
    </div>
  );
};

export interface PrescriptionLike {
  sets?: number | null;
  prescribed_sets?: number | null;
  reps?: string | null;
  prescribed_reps?: string | null;
  load_prescription?: string | null;
  prescribed_load?: string | null;
  tempo?: string | null;
  rest_seconds?: number | null;
  rpe?: number | null;
  duration_seconds?: number | null;
  distance_m?: number | null;
}

/** Reads both the template shape and the session snapshot shape. */
export const formatPrescription = (item: PrescriptionLike): string => {
  const sets = item.sets ?? item.prescribed_sets ?? null;
  const reps = item.reps ?? item.prescribed_reps ?? null;
  const load = item.load_prescription ?? item.prescribed_load ?? null;
  const parts: string[] = [];
  if (sets && reps) parts.push(`${sets} x ${reps}`);
  else if (sets) parts.push(`${sets} sets`);
  else if (reps) parts.push(`${reps} reps`);
  if (load) parts.push(load);
  if (item.duration_seconds) parts.push(`${item.duration_seconds}s`);
  if (item.distance_m) parts.push(`${item.distance_m}m`);
  if (item.tempo) parts.push(`tempo ${item.tempo}`);
  if (item.rpe !== null && item.rpe !== undefined) parts.push(`RPE ${item.rpe}`);
  if (item.rest_seconds !== null && item.rest_seconds !== undefined)
    parts.push(`${item.rest_seconds}s rest`);
  return parts.length ? parts.join(' · ') : 'No prescription set';
};

export const BlockBadge: React.FC<{ block: string | null | undefined }> = ({ block }) =>
  block ? (
    <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
      {blockLabel(block)}
    </Badge>
  ) : null;

/** A short read-only fact, used across the workspace cards. */
export const Fact: React.FC<{ label: string; value: React.ReactNode; className?: string }> = ({
  label,
  value,
  className,
}) => (
  <div className={cn('min-w-0', className)}>
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className="truncate text-sm font-medium text-foreground">{value ?? '—'}</p>
  </div>
);

/**
 * Shown on the trainer-side pages to someone whose wellness access is
 * self-service only. They are sent to their own training rather than shown an
 * empty list they have no right to.
 */
export const StaffOnlyNotice: React.FC<{ what?: string }> = ({ what = 'page' }) => (
  <Alert>
    <Lock className="h-4 w-4" />
    <AlertTitle>This {what} is for the training team</AlertTitle>
    <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <span>
        Your access covers your own training records. Ask a trainer or the purser if you need to see
        the wider roster.
      </span>
      <Button asChild variant="outline" size="sm" className="sm:shrink-0">
        <Link to={HEALTH_PATHS.myTraining}>Go to my training</Link>
      </Button>
    </AlertDescription>
  </Alert>
);
