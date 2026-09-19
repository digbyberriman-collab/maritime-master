import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Lock, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';

/** Standard loading body for a health page. */
export const HealthLoading: React.FC<{ rows?: number }> = ({ rows = 3 }) => (
  <div className="space-y-4">
    <Skeleton className="h-24 w-full" />
    {Array.from({ length: rows }).map((_, i) => (
      <Skeleton key={i} className="h-16 w-full" />
    ))}
  </div>
);

/** Standard error body. */
export const HealthError: React.FC<{ title?: string; error: unknown }> = ({
  title = 'Could not load this page',
  error,
}) => (
  <Alert variant="destructive">
    <AlertTitle>{title}</AlertTitle>
    <AlertDescription>
      {error instanceof Error ? error.message : 'Unknown error'}
    </AlertDescription>
  </Alert>
);

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

/** Standard empty body: says what is missing and offers the way to fix it. */
export const HealthEmpty: React.FC<EmptyStateProps> = ({
  icon: Icon,
  title,
  description,
  action,
  className,
}) => (
  <div
    className={cn(
      'flex flex-col items-center justify-center rounded-lg border border-dashed p-10 text-center',
      className,
    )}
  >
    <Icon className="mb-3 h-10 w-10 text-muted-foreground/40" />
    <p className="text-base font-medium text-foreground">{title}</p>
    {description && (
      <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
    )}
    {action && <div className="mt-4">{action}</div>}
  </div>
);

/**
 * Shown on clinical pages to a reader who can see fitness but not diagnosis.
 * Being explicit about the boundary stops people assuming the record is
 * empty when it is simply not theirs to read.
 */
export const ClinicalNotice: React.FC<{ className?: string }> = ({ className }) => (
  <Alert className={cn('border-dashed', className)}>
    <ShieldAlert className="h-4 w-4" />
    <AlertTitle>Clinical detail is hidden</AlertTitle>
    <AlertDescription>
      You can see fitness to work, restrictions and expiry dates. Diagnosis, medication and
      consultation notes are visible only to medical staff and the crew member themselves.
    </AlertDescription>
  </Alert>
);

/** Shown when a page needs a person chosen before it can show anything. */
export const PickPersonPrompt: React.FC<{ what: string; icon: LucideIcon }> = ({ what, icon }) => (
  <HealthEmpty icon={icon} title={`Choose someone to see their ${what}`} description="Use the picker above, or open this page from their record." />
);

/** Shown when the signed-in person has no subject record of their own. */
export const NoSubjectRecord: React.FC = () => (
  <Alert>
    <Lock className="h-4 w-4" />
    <AlertTitle>No health record yet</AlertTitle>
    <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <span>
        Your crew profile has not been linked to a health record. Ask the ship&apos;s medic or your
        purser to create one.
      </span>
      <Button asChild variant="outline" size="sm" className="sm:shrink-0">
        <Link to="/dashboard">Back to dashboard</Link>
      </Button>
    </AlertDescription>
  </Alert>
);
