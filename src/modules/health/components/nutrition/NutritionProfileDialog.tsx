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
import { cn } from '@/lib/utils';
import {
  ACTIVITY_LEVELS,
  DIETARY_PREFERENCES,
  GOAL_TYPES,
  profileToForm,
  type NutProfile,
  type NutProfileFormData,
} from '@/modules/health/hooks/useNutrition';
import type { PractitionerEntry } from '@/modules/health/hooks/usePractitioners';

const NONE = '__none__';

interface NutritionProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: NutProfile | null;
  personName?: string;
  nutritionists: PractitionerEntry[];
  onSubmit: (values: NutProfileFormData) => Promise<void>;
  isPending?: boolean;
}

const numberOrNull = (value: string): number | null => {
  if (!value.trim()) return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : null;
};

/** Targets, goal and dietary preferences for one person. */
export const NutritionProfileDialog: React.FC<NutritionProfileDialogProps> = ({
  open,
  onOpenChange,
  profile,
  personName,
  nutritionists,
  onSubmit,
  isPending,
}) => {
  const [values, setValues] = useState<NutProfileFormData>(profileToForm(null));

  useEffect(() => {
    if (open) setValues(profileToForm(profile));
  }, [open, profile]);

  const patch = (next: Partial<NutProfileFormData>) => setValues((prev) => ({ ...prev, ...next }));

  const togglePreference = (preference: string) =>
    patch({
      dietary_preferences: values.dietary_preferences.includes(preference)
        ? values.dietary_preferences.filter((p) => p !== preference)
        : [...values.dietary_preferences, preference],
    });

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    await onSubmit(values);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nutrition profile</DialogTitle>
          <DialogDescription>
            {personName ? `Targets and preferences for ${personName}. ` : ''}
            Leave a target empty if it is not being tracked.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-5" onSubmit={submit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Goal</Label>
              <Select value={values.goal_type} onValueChange={(v) => patch({ goal_type: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GOAL_TYPES.map((g) => (
                    <SelectItem key={g.value} value={g.value}>
                      {g.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Activity level</Label>
              <Select value={values.activity_level} onValueChange={(v) => patch({ activity_level: v })}>
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

          <div>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Daily targets
            </h3>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="target-calories">Calories (kcal)</Label>
                <Input
                  id="target-calories"
                  inputMode="numeric"
                  value={values.target_calories ?? ''}
                  onChange={(e) => patch({ target_calories: numberOrNull(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="target-protein">Protein (g)</Label>
                <Input
                  id="target-protein"
                  inputMode="numeric"
                  value={values.target_protein_g ?? ''}
                  onChange={(e) => patch({ target_protein_g: numberOrNull(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="target-carbs">Carbohydrate (g)</Label>
                <Input
                  id="target-carbs"
                  inputMode="numeric"
                  value={values.target_carbs_g ?? ''}
                  onChange={(e) => patch({ target_carbs_g: numberOrNull(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="target-fat">Fat (g)</Label>
                <Input
                  id="target-fat"
                  inputMode="numeric"
                  value={values.target_fat_g ?? ''}
                  onChange={(e) => patch({ target_fat_g: numberOrNull(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="target-fibre">Fibre (g)</Label>
                <Input
                  id="target-fibre"
                  inputMode="numeric"
                  value={values.target_fibre_g ?? ''}
                  onChange={(e) => patch({ target_fibre_g: numberOrNull(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="target-water">Water (ml)</Label>
                <Input
                  id="target-water"
                  inputMode="numeric"
                  value={values.target_water_ml ?? ''}
                  onChange={(e) => patch({ target_water_ml: numberOrNull(e.target.value) })}
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Dietary preferences</Label>
            <div className="flex flex-wrap gap-1.5">
              {DIETARY_PREFERENCES.map((preference) => {
                const on = values.dietary_preferences.includes(preference);
                return (
                  <button
                    key={preference}
                    type="button"
                    onClick={() => togglePreference(preference)}
                    aria-pressed={on}
                    className={cn(
                      'rounded-full border px-2.5 py-1 text-xs transition-colors',
                      on
                        ? 'border-primary/30 bg-primary/10 text-primary'
                        : 'border-border bg-card text-muted-foreground hover:bg-accent',
                    )}
                  >
                    {preference}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="profile-dislikes">Dislikes</Label>
              <Textarea
                id="profile-dislikes"
                rows={3}
                value={values.dislikes ?? ''}
                onChange={(e) => patch({ dislikes: e.target.value })}
                placeholder="Foods to keep off the plate. Allergies belong on the medical record, not here."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile-supplements">Supplements</Label>
              <Textarea
                id="profile-supplements"
                rows={3}
                value={values.supplements ?? ''}
                onChange={(e) => patch({ supplements: e.target.value })}
                placeholder="Whey, creatine, vitamin D, omega 3"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Nutritionist</Label>
              <Select
                value={values.nutritionist_id ?? NONE}
                onValueChange={(v) => patch({ nutritionist_id: v === NONE ? null : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Not assigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Not assigned</SelectItem>
                  {nutritionists.map((n) => (
                    <SelectItem key={n.id} value={n.id}>
                      {n.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile-notes">Notes</Label>
              <Textarea
                id="profile-notes"
                rows={2}
                value={values.notes ?? ''}
                onChange={(e) => patch({ notes: e.target.value })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save profile
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default NutritionProfileDialog;
