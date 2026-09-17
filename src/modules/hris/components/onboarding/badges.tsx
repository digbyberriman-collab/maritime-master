import React from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { OWNER_LABELS, STATUS_LABELS, isOnboardingOwner, isOnboardingStatus, type OnboardingOwner, type OnboardingStatus } from '@/modules/hris/lib/onboarding';

const OWNER_CLASS: Record<OnboardingOwner, string> = {
  hr: 'bg-primary/10 text-primary border-primary/20',
  finance: 'bg-violet-500/10 text-violet-600 border-violet-500/20 dark:text-violet-400',
  vessel: 'bg-sky-500/10 text-sky-600 border-sky-500/20 dark:text-sky-400',
  employee: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:text-emerald-400',
  buddy: 'bg-amber-500/10 text-amber-600 border-amber-500/20 dark:text-amber-400',
};

export const OwnerBadge: React.FC<{ owner: string; className?: string }> = ({ owner, className }) => {
  const key: OnboardingOwner = isOnboardingOwner(owner) ? owner : 'hr';
  return (
    <Badge variant="outline" className={cn('text-[10px] uppercase tracking-wide', OWNER_CLASS[key], className)}>
      {OWNER_LABELS[key]}
    </Badge>
  );
};

const STATUS_CLASS: Record<OnboardingStatus, string> = {
  not_started: 'bg-muted text-muted-foreground border-border',
  in_progress: 'bg-sky-500/10 text-sky-600 border-sky-500/20 dark:text-sky-400',
  completed: 'bg-green-500/10 text-green-600 border-green-500/20 dark:text-green-400',
  cancelled: 'bg-destructive/10 text-destructive border-destructive/20',
};

export const OnboardingStatusBadge: React.FC<{ status: string | null; className?: string }> = ({ status, className }) => {
  if (!isOnboardingStatus(status)) {
    return <Badge variant="outline" className={cn('text-[10px] uppercase tracking-wide bg-muted text-muted-foreground', className)}>Not started</Badge>;
  }
  return (
    <Badge variant="outline" className={cn('text-[10px] uppercase tracking-wide', STATUS_CLASS[status], className)}>
      {STATUS_LABELS[status]}
    </Badge>
  );
};
