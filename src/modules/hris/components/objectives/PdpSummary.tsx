import React, { useMemo } from 'react';
import { AlertTriangle, CalendarClock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  TONE_CLASS,
  computeObjectiveKpis,
  countByStatus,
  weightedCompletion,
  type CrewObjectiveRow,
  type ObjectiveStatus,
  type ObjectiveTone,
} from '@/modules/hris/lib/objectives';

interface PdpSummaryProps {
  objectives: CrewObjectiveRow[];
  crewName?: string;
  isLoading?: boolean;
}

const RING_SIZE = 112;
const STROKE = 10;

const CompletionRing: React.FC<{ value: number | null }> = ({ value }) => {
  const r = (RING_SIZE - STROKE) / 2;
  const circumference = 2 * Math.PI * r;
  const pct = value ?? 0;
  return (
    <div className="relative" style={{ width: RING_SIZE, height: RING_SIZE }}>
      <svg width={RING_SIZE} height={RING_SIZE} className="-rotate-90" aria-hidden="true">
        <circle cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={r} fill="none" stroke="hsl(var(--secondary))" strokeWidth={STROKE} />
        <circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={r}
          fill="none"
          stroke="hsl(var(--primary))"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - pct / 100)}
          className="transition-[stroke-dashoffset] duration-500"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-semibold tabular-nums text-foreground">{value === null ? '—' : `${value}%`}</span>
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">weighted</span>
      </div>
    </div>
  );
};

const STATUS_ORDER: { status: ObjectiveStatus; label: string; tone: ObjectiveTone }[] = [
  { status: 'not_started', label: 'Not started', tone: 'muted' },
  { status: 'in_progress', label: 'In progress', tone: 'active' },
  { status: 'achieved', label: 'Achieved', tone: 'success' },
  { status: 'missed', label: 'Missed', tone: 'danger' },
  { status: 'cancelled', label: 'Cancelled', tone: 'muted' },
];

/** Per-crew PDP header: weighted completion ring plus counts by status. */
export const PdpSummary: React.FC<PdpSummaryProps> = ({ objectives, crewName, isLoading }) => {
  const completion = useMemo(() => weightedCompletion(objectives), [objectives]);
  const counts = useMemo(() => countByStatus(objectives), [objectives]);
  const kpis = useMemo(() => computeObjectiveKpis(objectives), [objectives]);

  if (isLoading) return <Skeleton className="h-40 w-full" />;

  return (
    <Card className="bg-card">
      <CardContent className="flex flex-col gap-6 p-6 md:flex-row md:items-center">
        <CompletionRing value={completion} />
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <p className="text-sm font-medium text-foreground">{crewName ? `${crewName}'s development plan` : 'Personal development plan'}</p>
            <p className="text-xs text-muted-foreground">
              {objectives.length === 0
                ? 'No objectives yet.'
                : `${objectives.length} objective${objectives.length === 1 ? '' : 's'} · completion weighted by objective weight, cancelled objectives excluded.`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {STATUS_ORDER.map(({ status, label, tone }) => (
              <span
                key={status}
                className={cn('inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs', TONE_CLASS[tone], counts[status] === 0 && 'opacity-60')}
              >
                <span className="font-semibold tabular-nums">{counts[status]}</span> {label}
              </span>
            ))}
          </div>
          {(kpis.overdue > 0 || kpis.dueSoon > 0) && (
            <div className="flex flex-wrap gap-3 text-xs">
              {kpis.overdue > 0 && (
                <span className="inline-flex items-center gap-1 text-destructive">
                  <AlertTriangle className="h-3.5 w-3.5" /> {kpis.overdue} overdue
                </span>
              )}
              {kpis.dueSoon > 0 && (
                <span className="inline-flex items-center gap-1 text-yellow-500">
                  <CalendarClock className="h-3.5 w-3.5" /> {kpis.dueSoon} due within 14 days
                </span>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default PdpSummary;
