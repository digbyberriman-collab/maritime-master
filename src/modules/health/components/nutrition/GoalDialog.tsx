import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  GOAL_DIRECTIONS,
  GOAL_METRICS,
  GOAL_STATUSES,
  emptyGoalForm,
  goalMetricUnit,
  goalToForm,
  type GoalFormData,
  type NutGoal,
} from '@/modules/health/hooks/useNutrition';

interface GoalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  goal: NutGoal | null;
  personName?: string;
  /** Seeds the start value from the latest measurement when creating. */
  suggestedStart?: (metric: string) => number | null;
  onSubmit: (values: GoalFormData) => Promise<void>;
  isPending?: boolean;
}

const numberOrNull = (value: string): number | null => {
  if (!value.trim()) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

/** Create or edit a nutrition goal. */
export const GoalDialog: React.FC<GoalDialogProps> = ({
  open,
  onOpenChange,
  goal,
  personName,
  suggestedStart,
  onSubmit,
  isPending,
}) => {
  const [values, setValues] = useState<GoalFormData>(emptyGoalForm());

  useEffect(() => {
    if (!open) return;
    if (goal) {
      setValues(goalToForm(goal));
      return;
    }
    const base = emptyGoalForm();
    const start = suggestedStart?.(base.metric) ?? null;
    setValues({ ...base, start_value: start, current_value: start });
  }, [open, goal, suggestedStart]);

  const patch = (next: Partial<GoalFormData>) => setValues((prev) => ({ ...prev, ...next }));

  const chooseMetric = (metric: string) => {
    const start = goal ? values.start_value : (suggestedStart?.(metric) ?? values.start_value);
    patch({
      metric,
      unit: goalMetricUnit(metric) || values.unit,
      start_value: start,
      current_value: goal ? values.current_value : start,
    });
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    await onSubmit(values);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{goal ? 'Edit goal' : 'New goal'}</DialogTitle>
          <DialogDescription>
            {personName ? `For ${personName}. ` : ''}
            Progress is measured from the start value towards the target.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={submit}>
          <div className="space-y-2">
            <Label htmlFor="goal-title">Title</Label>
            <Input
              id="goal-title"
              required
              value={values.title}
              onChange={(e) => patch({ title: e.target.value })}
              placeholder="Down to 82 kg before the Caribbean season"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>What is being tracked</Label>
              <Select value={values.metric} onValueChange={chooseMetric}>
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

            <div className="space-y-2">
              <Label>Direction</Label>
              <Select value={values.direction} onValueChange={(v) => patch({ direction: v })}>
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

            <div className="space-y-2">
              <Label htmlFor="goal-start">Start value</Label>
              <Input
                id="goal-start"
                inputMode="decimal"
                value={values.start_value ?? ''}
                onChange={(e) => patch({ start_value: numberOrNull(e.target.value) })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="goal-target">Target value</Label>
              <Input
                id="goal-target"
                inputMode="decimal"
                value={values.target_value ?? ''}
                onChange={(e) => patch({ target_value: numberOrNull(e.target.value) })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="goal-current">Where they are now</Label>
              <Input
                id="goal-current"
                inputMode="decimal"
                value={values.current_value ?? ''}
                onChange={(e) => patch({ current_value: numberOrNull(e.target.value) })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="goal-unit">Unit</Label>
              <Input
                id="goal-unit"
                value={values.unit ?? ''}
                onChange={(e) => patch({ unit: e.target.value })}
                placeholder={goalMetricUnit(values.metric) || 'kg'}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="goal-start-date">Started</Label>
              <Input
                id="goal-start-date"
                type="date"
                value={values.start_date}
                onChange={(e) => patch({ start_date: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="goal-target-date">Target date</Label>
              <Input
                id="goal-target-date"
                type="date"
                value={values.target_date ?? ''}
                onChange={(e) => patch({ target_date: e.target.value || null })}
              />
            </div>

            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={values.status} onValueChange={(v) => patch({ status: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GOAL_STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="goal-notes">Notes</Label>
            <Textarea
              id="goal-notes"
              rows={2}
              value={values.notes ?? ''}
              onChange={(e) => patch({ notes: e.target.value })}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || !values.title.trim()}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {goal ? 'Save goal' : 'Create goal'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default GoalDialog;
