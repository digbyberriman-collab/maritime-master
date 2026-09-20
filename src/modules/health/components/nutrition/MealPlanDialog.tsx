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
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PersonPicker } from '@/modules/health/components/PersonPicker';
import { AllergenPicker } from '@/modules/health/components/nutrition/AllergenPicker';
import {
  PLAN_MEALS,
  PLAN_STATUSES,
  emptyMealPlanForm,
  mealPlanToForm,
  type MealPlanEntry,
  type MealPlanFormData,
  type NutFood,
} from '@/modules/health/hooks/useNutrition';

const NONE = '__none__';

interface MealPlanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan: MealPlanEntry | null;
  defaults?: { dayIso: string; meal?: string };
  recipes: NutFood[];
  vessels: { id: string; name: string }[];
  onSubmit: (values: MealPlanFormData) => Promise<void>;
  isPending?: boolean;
}

/** Create or edit a planned meal. A plan with no person is a vessel menu. */
export const MealPlanDialog: React.FC<MealPlanDialogProps> = ({
  open,
  onOpenChange,
  plan,
  defaults,
  recipes,
  vessels,
  onSubmit,
  isPending,
}) => {
  const [values, setValues] = useState<MealPlanFormData>(
    emptyMealPlanForm(defaults?.dayIso ?? '', defaults?.meal),
  );
  const [personal, setPersonal] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (plan) {
      setValues(mealPlanToForm(plan));
      setPersonal(plan.person_id !== null);
      return;
    }
    setValues(emptyMealPlanForm(defaults?.dayIso ?? '', defaults?.meal));
    setPersonal(false);
  }, [open, plan, defaults?.dayIso, defaults?.meal]);

  const patch = (next: Partial<MealPlanFormData>) => setValues((prev) => ({ ...prev, ...next }));

  const chooseRecipe = (id: string) => {
    if (id === NONE) {
      patch({ recipe_id: null });
      return;
    }
    const recipe = recipes.find((r) => r.id === id) ?? null;
    patch({
      recipe_id: id,
      title: values.title.trim() || recipe?.name || '',
      // The recipe's own allergens are merged in on read; seed them here too
      // so the cook can see and adjust what will be declared.
      allergens: Array.from(new Set([...values.allergens, ...(recipe?.allergens ?? [])])),
      calories: values.calories ?? (recipe ? Math.round(Number(recipe.calories)) : null),
    });
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    await onSubmit({ ...values, person_id: personal ? values.person_id : null });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{plan ? 'Edit planned meal' : 'Plan a meal'}</DialogTitle>
          <DialogDescription>
            Leave it as a vessel menu for everyone aboard, or name a person for a personal plan.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-5" onSubmit={submit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="plan-date">Date</Label>
              <Input
                id="plan-date"
                type="date"
                required
                value={values.plan_date}
                onChange={(e) => patch({ plan_date: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Meal</Label>
              <Select value={values.meal} onValueChange={(v) => patch({ meal: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PLAN_MEALS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/30 p-3">
            <div className="space-y-0.5">
              <Label htmlFor="plan-personal">Personal plan</Label>
              <p className="text-xs text-muted-foreground">
                Off means a vessel menu that everyone aboard can read.
              </p>
            </div>
            <Switch id="plan-personal" checked={personal} onCheckedChange={setPersonal} />
          </div>

          {personal && (
            <div className="space-y-2">
              <Label>Person</Label>
              <PersonPicker
                value={values.person_id}
                onChange={(id) => patch({ person_id: id })}
                placeholder="Who is this plan for"
              />
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="plan-title">Title</Label>
              <Input
                id="plan-title"
                required
                value={values.title}
                onChange={(e) => patch({ title: e.target.value })}
                placeholder="Seared tuna with greens"
              />
            </div>

            <div className="space-y-2">
              <Label>Recipe</Label>
              <Select value={values.recipe_id ?? NONE} onValueChange={chooseRecipe}>
                <SelectTrigger>
                  <SelectValue placeholder="No recipe" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value={NONE}>No recipe</SelectItem>
                  {recipes.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="plan-serves">Serves</Label>
              <Input
                id="plan-serves"
                inputMode="numeric"
                value={values.serves ?? ''}
                onChange={(e) =>
                  patch({ serves: e.target.value.trim() ? Number(e.target.value) || null : null })
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="plan-calories">Calories per portion</Label>
              <Input
                id="plan-calories"
                inputMode="numeric"
                value={values.calories ?? ''}
                onChange={(e) =>
                  patch({ calories: e.target.value.trim() ? Number(e.target.value) || null : null })
                }
              />
            </div>

            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={values.status} onValueChange={(v) => patch({ status: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PLAN_STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Vessel</Label>
              <Select
                value={values.vessel_id ?? NONE}
                onValueChange={(v) => patch({ vessel_id: v === NONE ? null : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Fleet wide" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Fleet wide</SelectItem>
                  {vessels.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="plan-prepared">Prepared by</Label>
              <Input
                id="plan-prepared"
                value={values.prepared_by ?? ''}
                onChange={(e) => patch({ prepared_by: e.target.value })}
                placeholder="Chef or the galley team"
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="plan-description">Description</Label>
              <Textarea
                id="plan-description"
                rows={2}
                value={values.description ?? ''}
                onChange={(e) => patch({ description: e.target.value })}
              />
            </div>
          </div>

          <AllergenPicker
            id="plan-allergens"
            value={values.allergens}
            onChange={(next) => patch({ allergens: next })}
            description="Declare everything on the plate. Anyone aboard with a matching allergy is flagged on the calendar."
          />

          <div className="space-y-2">
            <Label htmlFor="plan-notes">Notes</Label>
            <Textarea
              id="plan-notes"
              rows={2}
              value={values.notes ?? ''}
              onChange={(e) => patch({ notes: e.target.value })}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isPending || !values.title.trim() || (personal && !values.person_id)}
            >
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {plan ? 'Save meal' : 'Add to the plan'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default MealPlanDialog;
