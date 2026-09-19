import React from 'react';
import { AlertTriangle, CheckCircle2, Inbox, Timer, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { DashboardMetrics } from '@/modules/legal/lib/dashboard';

interface MetricProps {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: string;
  tone?: 'default' | 'warning' | 'critical' | 'success';
}

const TONE: Record<NonNullable<MetricProps['tone']>, string> = {
  default: 'bg-primary/10 text-primary',
  warning: 'bg-warning/10 text-warning',
  critical: 'bg-critical/10 text-critical',
  success: 'bg-success/10 text-success',
};

const Metric: React.FC<MetricProps> = ({ icon: Icon, label, value, hint, tone = 'default' }) => (
  <Card>
    <CardContent className="flex items-start gap-3 p-4">
      <div className={cn('rounded-lg p-2', TONE[tone])}>
        <Icon className="h-5 w-5" aria-hidden />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold tabular-nums text-foreground">{value}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
    </CardContent>
  </Card>
);

export const MetricCards: React.FC<{ metrics: DashboardMetrics | null; isLoading?: boolean }> = ({ metrics, isLoading }) => {
  if (isLoading || !metrics) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Metric icon={Inbox} label="Open requests" value={String(metrics.open)} hint={metrics.breached ? `${metrics.breached} past SLA` : 'Across all statuses'} tone={metrics.breached ? 'critical' : 'default'} />
      <Metric icon={AlertTriangle} label="Urgent" value={String(metrics.urgent)} hint="High / urgent priority or high risk" tone={metrics.urgent ? 'warning' : 'default'} />
      <Metric icon={Timer} label="Avg cycle time" value={metrics.avgCycleDays === null ? '—' : `${metrics.avgCycleDays} d`} hint={metrics.completed ? `Over ${metrics.completed} completed` : 'No completed requests yet'} />
      <Metric
        icon={CheckCircle2}
        label="SLA compliance"
        value={`${metrics.slaCompliancePct}%`}
        hint="Completed on or before the SLA deadline"
        tone={metrics.slaCompliancePct >= 90 ? 'success' : metrics.slaCompliancePct >= 70 ? 'warning' : 'critical'}
      />
    </div>
  );
};

export default MetricCards;
