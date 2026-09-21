import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Apple, ClipboardList, Plus, Target, Trash2, UserRound } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { HealthPageHeader } from '@/modules/health/components/HealthPageHeader';
import {
  HealthEmpty,
  HealthError,
  HealthLoading,
  NoSubjectRecord,
} from '@/modules/health/components/HealthStates';
import { Fact, ProgramStatusBadge } from '@/modules/health/components/pt/PtCommon';
import { useSelectedPerson } from '@/modules/health/hooks/useSelectedPerson';
import {
  ACTIVITY_LEVELS,
  TRAINING_GOAL_TYPES,
  useAthletePreferences,
  usePtPrograms,
  useTrainingGoals,
  todayIsoDate,
} from '@/modules/health/hooks/usePtPrograms';
import { HEALTH_PATHS } from '@/modules/health/paths';
import { formatDate } from '@/modules/health/lib/format';

const GOAL_METRICS = [
  { value: 'weight', label: 'Weight' },
  { value: 'body_fat', label: 'Body fat' },
  { value: 'waist', label: 'Waist' },
  { value: 'custom', label: 'Something else' },
] as const;

const GOAL_DIRECTIONS = [
  { value: 'decrease', label: 'Down to' },
  { value: 'increase', label: 'Up to' },
  { value: 'maintain', label: 'Hold at' },
] as const;

/** The athlete's own page: goals, trainer, history and what they prefer. */
const MyAthleteProfilePage: React.FC = () => {
  const { personId, person, myPerson, selfOnly, directoryLoading } = useSelectedPerson('wellness');
  const athleteId = selfOnly ? personId : personId ?? myPerson?.id ?? null;
  const subject = person ?? myPerson;

  const programs = usePtPrograms({ personId: athleteId });
  const goals = useTrainingGoals({ personId: athleteId });
  const preferences = useAthletePreferences(athleteId);

  const [goalOpen, setGoalOpen] = useState(false);
  const [goalForm, setGoalForm] = useState({
    title: '',
    metric: 'weight',
    direction: 'decrease',
    target_value: '',
    unit: 'kg',
    target_date: '',
  });

  const [goalType, setGoalType] = useState('maintain');
  const [activityLevel, setActivityLevel] = useState('moderate');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!preferences.preferences) return;
    setGoalType(preferences.preferences.goal_type);
    setActivityLevel(preferences.preferences.activity_level);
    setNotes(preferences.preferences.notes ?? '');
  }, [preferences.preferences]);

  const activeProgram =
    programs.programs.find((p) => p.status === 'active' || p.status === 'paused') ?? null;

  if (!athleteId) {
    return (
      <div className="space-y-6">
        <HealthPageHeader icon={UserRound} title="My athlete profile" description="Goals, trainer and history." />
        {directoryLoading ? <HealthLoading rows={2} /> : <NoSubjectRecord />}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <HealthPageHeader
        icon={UserRound}
        title="My athlete profile"
        description="Your goals, who trains you, what you have done and how you like to train."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to={HEALTH_PATHS.myTraining}>My training</Link>
          </Button>
        }
      />

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">{subject?.displayName ?? 'Athlete'}</CardTitle>
              <CardDescription>
                {[subject?.rank, subject?.vessel_name, subject?.cabin].filter(Boolean).join(' · ') ||
                  'No vessel or cabin recorded'}
              </CardDescription>
            </div>
            {activeProgram && <ProgramStatusBadge status={activeProgram.status} />}
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Fact label="Current programme" value={activeProgram?.name ?? 'None'} />
          <Fact label="Trainer" value={activeProgram?.trainer_name ?? 'Unassigned'} />
          <Fact
            label="Started"
            value={activeProgram ? formatDate(activeProgram.start_date) : '—'}
          />
          <Fact
            label="Sessions done"
            value={
              activeProgram
                ? `${activeProgram.completedSessions}/${activeProgram.totalSessions}`
                : '—'
            }
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-3 pb-3">
            <div>
              <CardTitle className="text-base">My goals</CardTitle>
              <CardDescription>Shared with the trainer, the nutritionist and the physio.</CardDescription>
            </div>
            <Button size="sm" variant="outline" onClick={() => setGoalOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" />
              Add
            </Button>
          </CardHeader>
          <CardContent>
            {goals.isLoading ? (
              <HealthLoading rows={2} />
            ) : goals.isError ? (
              <HealthError error={goals.error} title="Could not load your goals" />
            ) : goals.goals.length === 0 ? (
              <HealthEmpty
                icon={Target}
                title="No goals set"
                description="Write down one thing you want to change. It gives every session a point."
                className="border-0 p-6"
                action={
                  <Button size="sm" onClick={() => setGoalOpen(true)}>
                    Add a goal
                  </Button>
                }
              />
            ) : (
              <ul className="divide-y">
                {goals.goals.map((goal) => (
                  <li key={goal.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{goal.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[
                          goal.target_value !== null
                            ? `${goal.direction === 'increase' ? 'Up to' : goal.direction === 'maintain' ? 'Hold at' : 'Down to'} ${goal.target_value}${goal.unit ?? ''}`
                            : null,
                          goal.target_date ? `by ${formatDate(goal.target_date)}` : null,
                        ]
                          .filter(Boolean)
                          .join(' · ') || 'No target set'}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant="outline" className="text-[10px] capitalize">
                        {goal.status}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        aria-label={`Remove ${goal.title}`}
                        onClick={() => goals.remove.mutate(goal.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Training preferences</CardTitle>
            <CardDescription>
              Your goal and activity level are shared with Nutrition, so your targets match your
              training.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>What I am training for</Label>
                <Select
                  value={goalType}
                  onValueChange={(value) => {
                    setGoalType(value);
                    preferences.save.mutate({ goal_type: value, activity_level: activityLevel });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TRAINING_GOAL_TYPES.map((g) => (
                      <SelectItem key={g.value} value={g.value}>
                        {g.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>How active my work is</Label>
                <Select
                  value={activityLevel}
                  onValueChange={(value) => {
                    setActivityLevel(value);
                    preferences.save.mutate({ goal_type: goalType, activity_level: value });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACTIVITY_LEVELS.map((a) => (
                      <SelectItem key={a.value} value={a.value}>
                        {a.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="preference-notes">What my trainer should know</Label>
              <Textarea
                id="preference-notes"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                onBlur={() =>
                  notes !== (preferences.preferences?.notes ?? '') &&
                  preferences.save.mutate({
                    goal_type: goalType,
                    activity_level: activityLevel,
                    notes: notes.trim() || null,
                  })
                }
                placeholder="Early mornings suit me, old shoulder injury, no running on a moving deck"
              />
            </div>

            {preferences.hasNutritionProfile ? (
              <Button asChild variant="outline" size="sm">
                <Link to={HEALTH_PATHS.nutritionOverview}>
                  <Apple className="mr-2 h-4 w-4" />
                  Open my nutrition
                </Link>
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">
                Saving a preference here also opens your nutrition profile, where targets and food
                logging live.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Programme history</CardTitle>
          <CardDescription>Everything you have been given, newest first.</CardDescription>
        </CardHeader>
        <CardContent>
          {programs.isLoading ? (
            <HealthLoading rows={2} />
          ) : programs.isError ? (
            <HealthError error={programs.error} title="Could not load your programmes" />
          ) : programs.programs.length === 0 ? (
            <HealthEmpty
              icon={ClipboardList}
              title="No programmes yet"
              description="Once a trainer assigns you a programme it will be listed here for good."
              className="border-0 p-6"
            />
          ) : (
            <ul className="divide-y">
              {programs.programs.map((program) => (
                <li key={program.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{program.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[
                        program.trainer_name,
                        `${formatDate(program.start_date)} to ${formatDate(program.end_date)}`,
                        `${program.completedSessions}/${program.totalSessions} sessions`,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  <ProgramStatusBadge status={program.status} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={goalOpen} onOpenChange={setGoalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add a goal</DialogTitle>
            <DialogDescription>
              Keep it to one measurable thing with a date on it.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!goalForm.title.trim()) return;
              goals.save.mutate(
                {
                  title: goalForm.title.trim(),
                  metric: goalForm.metric,
                  direction: goalForm.direction,
                  target_value: goalForm.target_value ? Number(goalForm.target_value) : null,
                  unit: goalForm.unit.trim() || null,
                  target_date: goalForm.target_date || null,
                  start_date: todayIsoDate(),
                  status: 'active',
                },
                {
                  onSuccess: () => {
                    setGoalForm({
                      title: '',
                      metric: 'weight',
                      direction: 'decrease',
                      target_value: '',
                      unit: 'kg',
                      target_date: '',
                    });
                    setGoalOpen(false);
                  },
                },
              );
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="goal-title">Goal</Label>
              <Input
                id="goal-title"
                value={goalForm.title}
                onChange={(e) => setGoalForm((prev) => ({ ...prev, title: e.target.value }))}
                placeholder="Get back to 80 kg before the summer season"
                required
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Measured by</Label>
                <Select
                  value={goalForm.metric}
                  onValueChange={(value) => setGoalForm((prev) => ({ ...prev, metric: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GOAL_METRICS.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Direction</Label>
                <Select
                  value={goalForm.direction}
                  onValueChange={(value) => setGoalForm((prev) => ({ ...prev, direction: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GOAL_DIRECTIONS.map((d) => (
                      <SelectItem key={d.value} value={d.value}>
                        {d.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="goal-target">Target</Label>
                <Input
                  id="goal-target"
                  type="number"
                  step="0.1"
                  value={goalForm.target_value}
                  onChange={(e) => setGoalForm((prev) => ({ ...prev, target_value: e.target.value }))}
                  placeholder="80"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="goal-unit">Unit</Label>
                <Input
                  id="goal-unit"
                  value={goalForm.unit}
                  onChange={(e) => setGoalForm((prev) => ({ ...prev, unit: e.target.value }))}
                  placeholder="kg"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="goal-date">By when</Label>
              <Input
                id="goal-date"
                type="date"
                value={goalForm.target_date}
                onChange={(e) => setGoalForm((prev) => ({ ...prev, target_date: e.target.value }))}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setGoalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={goals.isMutating}>
                {goals.isMutating ? 'Saving...' : 'Save goal'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MyAthleteProfilePage;
