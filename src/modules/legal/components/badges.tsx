import React from 'react';
import { AlertTriangle, CheckCircle2, Clock, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import {
  priorityDef,
  riskDef,
  statusDef,
  submissionStatusDef,
  templateStatusDef,
  TONE_CLASS,
  TONE_DOT_CLASS,
  VERSION_STATUSES,
  type Tone,
} from '@/modules/legal/lib/constants';
import { slaState } from '@/modules/legal/lib/sla';

interface ToneBadgeProps {
  tone: Tone;
  icon?: LucideIcon;
  dot?: boolean;
  className?: string;
  title?: string;
  children: React.ReactNode;
}

/** Outline badge coloured from a semantic tone token. */
export const ToneBadge: React.FC<ToneBadgeProps> = ({ tone, icon: Icon, dot, className, title, children }) => (
  <Badge variant="outline" title={title} className={cn('gap-1 whitespace-nowrap font-medium', TONE_CLASS[tone], className)}>
    {Icon && <Icon className="h-3 w-3" aria-hidden />}
    {dot && <span className={cn('h-1.5 w-1.5 rounded-full', TONE_DOT_CLASS[tone])} aria-hidden />}
    {children}
  </Badge>
);

export const StatusBadge: React.FC<{ status: string | null | undefined; className?: string }> = ({ status, className }) => {
  const def = statusDef(status);
  return (
    <ToneBadge tone={def.tone} dot className={className} title={def.description}>
      {def.label}
    </ToneBadge>
  );
};

export const PriorityBadge: React.FC<{ priority: string | null | undefined; className?: string; showSla?: boolean }> = ({ priority, className, showSla }) => {
  const def = priorityDef(priority);
  return (
    <ToneBadge tone={def.tone} className={className} title={`SLA ${def.slaLabel}`} icon={def.value === 'urgent' ? AlertTriangle : undefined}>
      {def.label}
      {showSla && <span className="font-normal opacity-80">· {def.slaLabel}</span>}
    </ToneBadge>
  );
};

export const RiskBadge: React.FC<{ risk: string | null | undefined; className?: string; short?: boolean }> = ({ risk, className, short }) => {
  if (!risk) return null;
  const def = riskDef(risk);
  return (
    <ToneBadge tone={def.tone} dot className={className}>
      {short ? def.label.replace(' risk', '') : def.label}
    </ToneBadge>
  );
};

export const SlaBadge: React.FC<{
  row: { sla_deadline: string | null; status: string; resolved_at: string | null };
  now?: Date;
  className?: string;
}> = ({ row, now, className }) => {
  const state = slaState(row, now);
  if (state.kind === 'none') return null;
  const Icon = state.kind === 'breached' || state.kind === 'missed' ? AlertTriangle : state.kind === 'met' ? CheckCircle2 : Clock;
  return (
    <ToneBadge tone={state.tone} icon={Icon} className={className} title={state.deadline ? `SLA deadline ${state.deadline.toLocaleString()}` : undefined}>
      {state.label}
    </ToneBadge>
  );
};

export const TemplateStatusBadge: React.FC<{ status: string | null | undefined; className?: string }> = ({ status, className }) => {
  const def = templateStatusDef(status);
  return (
    <ToneBadge tone={def.tone} dot className={className}>
      {def.label}
    </ToneBadge>
  );
};

export const VersionStatusBadge: React.FC<{ status: string | null | undefined; className?: string }> = ({ status, className }) => {
  const def = VERSION_STATUSES.find((s) => s.value === status) ?? VERSION_STATUSES[0];
  return (
    <ToneBadge tone={def.tone} className={className}>
      {def.label}
    </ToneBadge>
  );
};

export const SubmissionStatusBadge: React.FC<{ status: string | null | undefined; className?: string }> = ({ status, className }) => {
  const def = submissionStatusDef(status);
  return (
    <ToneBadge tone={def.tone} dot className={className}>
      {def.label}
    </ToneBadge>
  );
};
