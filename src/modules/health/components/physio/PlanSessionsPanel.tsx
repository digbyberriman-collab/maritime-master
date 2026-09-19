import React, { useMemo } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CalendarClock, Plus, Waves } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { HealthEmpty } from '@/modules/health/components/HealthStates';
import { PainChange, SessionStatusBadge } from '@/modules/health/components/physio/PhysioBadges';
import type { PhysioSessionEntry, PhysioTreatmentPlanEntry } from '@/modules/health/hooks/usePhysio';
import { formatDate, formatDuration } from '@/modules/health/lib/format';

interface PlanSessionsPanelProps {
  plan: PhysioTreatmentPlanEntry;
  sessions: PhysioSessionEntry[];
  isLoading?: boolean;
  canEdit: boolean;
  onRecordSession: () => void;
  onOpenSession: (session: PhysioSessionEntry) => void;
}

const tooltipStyle = {
  backgroundColor: 'hsl(var(--popover))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '8px',
  color: 'hsl(var(--popover-foreground))',
  fontSize: 12,
};

/** How far through the plan we are, between the start date and the review date. */
const reviewProgress = (plan: PhysioTreatmentPlanEntry): number | null => {
  if (!plan.review_date) return null;
  const start = new Date(`${plan.start_date}T00:00:00Z`).getTime();
  const review = new Date(`${plan.review_date}T00:00:00Z`).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(review) || review <= start) return null;
  const now = Date.now();
  return Math.max(0, Math.min(100, Math.round(((now - start) / (review - start)) * 100)));
};

/** A plan's sessions, its pain trend and how close the review date is. */
export const PlanSessionsPanel: React.FC<PlanSessionsPanelProps> = ({
  plan,
  sessions,
  isLoading,
  canEdit,
  onRecordSession,
  onOpenSession,
}) => {
  const ordered = useMemo(
    () => [...sessions].sort((a, b) => a.session_date.localeCompare(b.session_date)),
    [sessions],
  );

  const chartData = useMemo(
    () =>
      ordered
        .filter((s) => s.pain_before !== null || s.pain_after !== null)
        .map((s) => ({
          date: formatDate(s.session_date, 'dd MMM'),
          before: s.pain_before,
          after: s.pain_after,
        })),
    [ordered],
  );

  const progress = reviewProgress(plan);

  return (
    <div className="space-y-4">
      {plan.review_date && (
        <div className="rounded-lg border bg-card p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-sm font-medium text-foreground">
              <CalendarClock className="h-4 w-4 text-muted-foreground" />
              Review due {formatDate(plan.review_date)}
            </span>
            <span
              className={
                plan.isOverdueForReview
                  ? 'text-xs font-medium text-destructive'
                  : 'text-xs text-muted-foreground'
              }
            >
              {plan.daysToReview === null
                ? ''
                : plan.daysToReview < 0
                  ? `${Math.abs(plan.daysToReview)} days overdue`
                  : `${plan.daysToReview} days to go`}
            </span>
          </div>
          {progress !== null && <Progress value={progress} className="mt-2 h-2" />}
        </div>
      )}

      <div className="rounded-lg border bg-card p-3">
        <h4 className="text-sm font-medium text-foreground">Pain trend</h4>
        {isLoading ? (
          <Skeleton className="mt-3 h-40 w-full" />
        ) : chartData.length < 2 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Record pain before and after at least two sessions to see the trend.
          </p>
        ) : (
          <div className="mt-2 h-48 text-xs">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  domain={[0, 10]}
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line
                  type="monotone"
                  dataKey="before"
                  name="Before"
                  stroke="hsl(var(--destructive))"
                  strokeWidth={2}
                  connectNulls
                  dot={{ r: 3 }}
                />
                <Line
                  type="monotone"
                  dataKey="after"
                  name="After"
                  stroke="hsl(var(--success))"
                  strokeWidth={2}
                  connectNulls
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium text-foreground">
            Sessions ({ordered.length})
          </h4>
          {canEdit && (
            <Button variant="outline" size="sm" onClick={onRecordSession}>
              <Plus className="mr-2 h-4 w-4" />
              Record a session
            </Button>
          )}
        </div>
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : ordered.length === 0 ? (
          <HealthEmpty
            icon={Waves}
            title="No sessions on this plan yet"
            description={
              canEdit
                ? 'Record the first treatment session so the pain trend and the review have something to work from.'
                : 'Sessions appear here once the physiotherapist records them.'
            }
            className="p-6"
          />
        ) : (
          <ul className="divide-y rounded-md border">
            {[...ordered].reverse().map((session) => (
              <li key={session.id} className="flex flex-wrap items-start justify-between gap-2 p-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-foreground">
                      {formatDate(session.session_date)}
                    </span>
                    <SessionStatusBadge value={session.status} />
                    {session.duration_minutes && (
                      <span className="text-xs text-muted-foreground">
                        {formatDuration(session.duration_minutes)}
                      </span>
                    )}
                  </div>
                  {session.treatment_given && (
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                      {session.treatment_given}
                    </p>
                  )}
                  <div className="mt-1.5">
                    <PainChange before={session.pain_before} after={session.pain_after} />
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => onOpenSession(session)}>
                  {canEdit ? 'Open' : 'View'}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default PlanSessionsPanel;
