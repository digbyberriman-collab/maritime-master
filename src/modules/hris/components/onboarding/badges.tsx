import React from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { TONE_SURFACE } from '@/components/ui/tones';
import { OWNER_LABELS, STATUS_LABELS, isOnboardingOwner, isOnboardingStatus, type OnboardingOwner, type OnboardingStatus } from '@/modules/hris/lib/onboarding';

/** Who owns a task: a category, shown on the tone surfaces so it matches every other chip. */
const OWNER_CLASS: Record<OnboardingOwner, string> = {
  hr: TONE_SURFACE.signal,
  finance: TONE_SURFACE.purple,
  vessel: TONE_SURFACE.info,
  employee: TONE_SURFACE.ok,
  buddy: TONE_SURFACE.warn,
};

export const OwnerBadge: React.FC<{ owner: string; className?: string }> = ({ owner, className }) => {
  const key: OnboardingOwner = isOnboardingOwner(owner) ? owner : 'hr';
  return (
    <Badge variant="outline" className={cn('text-[10px] uppercase tracking-wide', OWNER_CLASS[key], className)}>
      {OWNER_LABELS[key]}
    </Badge>
  );
};

/** Onboarding status tones (gap/10 §A.8): live work is signal, cancelled is inactive. */
const STATUS_CLASS: Record<OnboardingStatus, string> = {
  not_started: TONE_SURFACE.neutral,
  in_progress: TONE_SURFACE.signal,
  completed: TONE_SURFACE.ok,
  cancelled: TONE_SURFACE.neutral,
};

export const OnboardingStatusBadge: React.FC<{ status: string | null; className?: string }> = ({ status, className }) => {
  if (!isOnboardingStatus(status)) {
    return <Badge variant="outline" className={cn('text-[10px] uppercase tracking-wide', TONE_SURFACE.neutral, className)}>Not started</Badge>;
  }
  return (
    <Badge variant="outline" className={cn('text-[10px] uppercase tracking-wide', STATUS_CLASS[status], className)}>
      {STATUS_LABELS[status]}
    </Badge>
  );
};
