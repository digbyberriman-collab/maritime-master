import React, { useCallback, useMemo, useState } from 'react';
import { CheckCircle2, CircleSlash, Pencil, Plus, Target, TrendingUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { HealthPageHeader } from '@/modules/health/components/HealthPageHeader';
import { PersonPicker } from '@/modules/health/components/PersonPicker';
import { StatGrid, StatTile } from '@/modules/health/components/StatTile';
import {
  HealthEmpty,
  HealthError,
  HealthLoading,
  NoSubjectRecord,
  PickPersonPrompt,
} from '@/modules/health/components/HealthStates';
import { GoalDialog } from '@/modules/health/components/nutrition/GoalDialog';
import { MeasurementTrendChart } from '@/modules/health/components/nutrition/MacroTrendChart';
import { useSelectedPerson } from '@/modules/health/hooks/useSelectedPerson';
import {
  GOAL_METRIC_MEASUREMENT,
  goalDirectionLabel,
  goalMetricLabel,
  goalMetricUnit,
  goalStatusLabel,
  useMeasurements,
  useNutritionGoals,
  type GoalFormData,
  type NutGoalEntry,
} from '@/modules/health/hooks/useNutrition';
import { formatDate } from '@/modules/health/lib/format';

type StatusFilter = 'active' | 'achieved' | 'all';

const statusTone: Record<string, string> = {
  active: 'border-primary/20 bg-primary/10 text-primary',
  achieved: 'border-success/20 bg-success/10 text-success',
  missed: 'border-destructive/20 bg-destructive/10 text-destructive',
  abandoned: 'border-border bg-muted text-muted-foreground',
  paused: 'border-warning/20 bg-warning/10 text-warning',
};

/** Nutrition goals for one person, with the measurement trend behind them. */
const NutritionGoalsPage: React.FC = () => {
  const { personId, person, setPersonId, selfOnly, myPerson, wellness, directoryLoading } =
    useSelectedPerson('wellness');
  const canEdit = !wellness.loading && (wellness.canEdit || wellness.selfOnly);

  const [filter, setFilter] = useState<StatusFilter>('active');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<NutGoalEntry | null>(null);
  const [progressDrafts, setProgressDrafts] = useState<Record<string, string>>({});
  const [trendFor, setTrendFor] = useState<string | null>(null);

  const goals = useNutritionGoals(personId);
  const measurements = useMeasurements(personId, 60);

  const rows = useMemo(() => {
    if (filter === 'all') return goals.goals;
    if (filter === 'achieved') return goals.goals.filter((g) => g.status === 'achieved');
    return goals.goals.filter((g) => g.status === 'active');
  }, [goals.goals, filter]);

  const suggestedStart = useCallback(
    (metric: string): number | null => {
      const column = GOAL_METRIC_MEASUREMENT[metric];
      if (!column) return null;
      const row = measurements.measurements.find((m) => m[column] !== null && m[column] !== undefined);
      const value = row?.[column];
      return value === null || value === undefined ? null : Number(value);
    },
    [measurements.measurements],
  );

  const trendGoal = useMemo(() => rows.find((g) => g.id === trendFor) ?? null, [rows, trendFor]);

  const trendSeries = useMemo(() => {
    if (!trendGoal) return [];
    const column = GOAL_METRIC_MEASUREMENT[trendGoal.metric];
    if (!column) return [];
    return [...measurements.measurements]
      .reverse()
      .map((m) => ({
        label: formatDate(m.measured_on, 'd MMM'),
        value: m[column] === null || m[column] === undefined ? null : Number(m[column]),
      }))
      .filter((p) => p.value !== null);
  }, [trendGoal, measurements.measurements]);

  const submit = async (values: GoalFormData) => {
    await goals.saveGoal.mutateAsync(values);
    setDialogOpen(false);
    setEditing(null);
  };

  const recordProgress = async (goal: NutGoalEntry) => {
    const raw = progressDrafts[goal.id];
    const value = Number(raw);
    if (!raw?.trim() || !Number.isFinite(value)) return;
    await goals.recordProgress.mutateAsync({ id: goal.id, value });
    setProgressDrafts((prev) => ({ ...prev, [goal.id]: '' }));
  };

  if (selfOnly && !directoryLoading && !myPerson) {
    return (
      <div className="space-y-6">
        <HealthPageHeader icon={Target} title="Nutrition goals" description="What you are working towards." />
        <NoSubjectRecord />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <HealthPageHeader
        icon={Target}
        title="Nutrition goals"
        description="Weight, body fat, waist and macro goals, measured from where they started."
        actions={
          personId && canEdit ? (
            <Button
              size="sm"
              onClick={() => {
                setEditing(null);
                setDialogOpen(true);
              }}
            >
              <Plus className="mr-2 h-4 w-4" /> New goal
            </Button>
          ) : undefined
        }
        toolbar={
          <div className="flex w-full flex-col gap-3 md:flex-row md:items-center md:justify-between">
            {!selfOnly && (
              <PersonPicker
                value={personId}
                onChange={(id) => setPersonId(id)}
                className="md:w-[420px]"
                placeholder="Choose whose goals to see"
              />
            )}
            <Tabs value={filter} onValueChange={(v) => setFilter(v as StatusFilter)}>
              <TabsList>
                <TabsTrigger value="active">Active</TabsTrigger>
                <TabsTrigger value="achieved">Achieved</TabsTrigger>
                <TabsTrigger value="all">All</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        }
      />

      {!personId ? (
        <PickPersonPrompt what="goals" icon={Target} />
      ) : (
        <>
          <StatGrid>
            <StatTile icon={Target} label="Active goals" value={goals.isLoading ? null : goals.summary.active} />
            <StatTile
              icon={CheckCircle2}
              label="Achieved"
              value={goals.isLoading ? null : goals.summary.achieved}
              tone="good"
            />
            <StatTile
              icon={CircleSlash}
              label="Past their date"
              value={goals.isLoading ? null : goals.summary.overdue}
              tone={goals.summary.overdue > 0 ? 'warning' : 'good'}
            />
            <StatTile
              icon={TrendingUp}
              label="Average progress"
              value={
                goals.isLoading
                  ? null
                  : goals.summary.averageProgress === null
                    ? '—'
                    : `${goals.summary.averageProgress}%`
              }
              hint="Across the active goals"
            />
          </StatGrid>

          {goals.isLoading ? (
            <HealthLoading rows={3} />
          ) : goals.isError ? (
            <HealthError title="Could not load the goals" error={goals.error} />
          ) : goals.goals.length === 0 ? (
            <HealthEmpty
              icon={Target}
              title={`No goals for ${person?.displayName ?? 'this person'}`}
              description="Set a goal with a start value, a target and a date. Weight, body fat and waist goals pull their trend from the measurement record automatically."
              action={
                canEdit ? (
                  <Button
                    onClick={() => {
                      setEditing(null);
                      setDialogOpen(true);
                    }}
                  >
                    <Plus className="mr-2 h-4 w-4" /> Set the first goal
                  </Button>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Ask the nutritionist to set a goal with you.
                  </p>
                )
              }
            />
          ) : rows.length === 0 ? (
            <HealthEmpty
              icon={Target}
              title={filter === 'achieved' ? 'Nothing achieved yet' : 'No active goals'}
              description={
                filter === 'achieved'
                  ? 'Goals appear here once they are marked achieved. Switch to All to see the rest.'
                  : 'Everything has been closed off. Switch to All to see the history, or set a new goal.'
              }
              action={
                <Button variant="outline" onClick={() => setFilter('all')}>
                  Show all goals
                </Button>
              }
            />
          ) : (
            <div className="space-y-3">
              {rows.map((goal) => {
                const unit = goal.unit ?? goalMetricUnit(goal.metric);
                const hasTrend = Boolean(GOAL_METRIC_MEASUREMENT[goal.metric]);
                return (
                  <Card key={goal.id}>
                    <CardHeader className="pb-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <CardTitle className="text-base">{goal.title}</CardTitle>
                          <CardDescription>
                            {goalMetricLabel(goal.metric)} · {goalDirectionLabel(goal.direction)} · started{' '}
                            {formatDate(goal.start_date)}
                            {goal.target_date ? ` · target ${formatDate(goal.target_date)}` : ''}
                          </CardDescription>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <Badge
                            variant="outline"
                            className={cn('text-[10px]', statusTone[goal.status] ?? statusTone.abandoned)}
                          >
                            {goalStatusLabel(goal.status)}
                          </Badge>
                          {canEdit && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setEditing(goal);
                                setDialogOpen(true);
                              }}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              <span className="sr-only">Edit {goal.title}</span>
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-1.5">
                        <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
                          <span className="text-muted-foreground">
                            Start {goal.start_value === null ? '—' : Number(goal.start_value)} {unit}
                          </span>
                          <span className="font-medium text-foreground">
                            Now {goal.current_value === null ? '—' : Number(goal.current_value)} {unit}
                          </span>
                          <span className="text-muted-foreground">
                            Target {goal.target_value === null ? '—' : Number(goal.target_value)} {unit}
                          </span>
                        </div>
                        <Progress value={goal.progressPct ?? 0} className="h-2" />
                        <p
                          className={cn(
                            'text-[11px]',
                            goal.isOverdue ? 'text-warning' : 'text-muted-foreground',
                          )}
                        >
                          {goal.progressPct === null
                            ? 'Set a start and a target value to measure progress.'
                            : `${goal.progressPct}% of the way there`}
                          {goal.daysRemaining === null
                            ? ''
                            : goal.isOverdue
                              ? ` · ${Math.abs(goal.daysRemaining)} days past the target date`
                              : ` · ${goal.daysRemaining} days remaining`}
                        </p>
                      </div>

                      {goal.notes && <p className="text-sm text-muted-foreground">{goal.notes}</p>}

                      {canEdit && goal.status === 'active' && (
                        <div className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
                          <div className="space-y-1">
                            <Label htmlFor={`progress-${goal.id}`} className="text-xs text-muted-foreground">
                              Record today&apos;s figure ({unit || 'value'})
                            </Label>
                            <Input
                              id={`progress-${goal.id}`}
                              inputMode="decimal"
                              className="w-[140px]"
                              value={progressDrafts[goal.id] ?? ''}
                              onChange={(e) =>
                                setProgressDrafts((prev) => ({ ...prev, [goal.id]: e.target.value }))
                              }
                            />
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={goals.recordProgress.isPending || !progressDrafts[goal.id]?.trim()}
                            onClick={() => recordProgress(goal)}
                          >
                            Update progress
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={goals.setGoalStatus.isPending}
                            onClick={() => goals.setGoalStatus.mutate({ id: goal.id, status: 'achieved' })}
                          >
                            <CheckCircle2 className="mr-2 h-3.5 w-3.5" /> Achieved
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={goals.setGoalStatus.isPending}
                            onClick={() => goals.setGoalStatus.mutate({ id: goal.id, status: 'abandoned' })}
                          >
                            Abandon
                          </Button>
                          {hasTrend && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="ml-auto"
                              onClick={() => setTrendFor(trendFor === goal.id ? null : goal.id)}
                            >
                              <TrendingUp className="mr-2 h-3.5 w-3.5" />
                              {trendFor === goal.id ? 'Hide the trend' : 'Show the trend'}
                            </Button>
                          )}
                        </div>
                      )}

                      {trendFor === goal.id && (
                        <div className="border-t border-border pt-3">
                          {measurements.isLoading ? (
                            <HealthLoading rows={1} />
                          ) : measurements.isError ? (
                            <HealthError title="Could not load the measurements" error={measurements.error} />
                          ) : trendSeries.length === 0 ? (
                            <HealthEmpty
                              icon={TrendingUp}
                              title="No measurements recorded"
                              description="Once weight, body fat or waist measurements are taken, the trend appears here."
                              className="border-0 p-6"
                            />
                          ) : (
                            <MeasurementTrendChart
                              data={trendSeries}
                              name={goalMetricLabel(goal.metric)}
                              targetValue={goal.target_value === null ? null : Number(goal.target_value)}
                            />
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      <GoalDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditing(null);
        }}
        goal={editing}
        personName={person?.displayName}
        suggestedStart={suggestedStart}
        onSubmit={submit}
        isPending={goals.saveGoal.isPending}
      />
    </div>
  );
};

export default NutritionGoalsPage;
