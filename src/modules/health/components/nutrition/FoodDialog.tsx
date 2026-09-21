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
import { AllergenPicker } from '@/modules/health/components/nutrition/AllergenPicker';
import {
  FOOD_CATEGORIES,
  FOOD_SOURCES,
  emptyFoodForm,
  foodToForm,
  type FoodFormData,
  type NutFood,
} from '@/modules/health/hooks/useNutrition';

interface FoodDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  food: NutFood | null;
  onSubmit: (values: FoodFormData) => Promise<void>;
  isPending?: boolean;
}

const numberOrNull = (value: string): number | null => {
  if (!value.trim()) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

/** Create or edit a food or a galley recipe in the company library. */
export const FoodDialog: React.FC<FoodDialogProps> = ({
  open,
  onOpenChange,
  food,
  onSubmit,
  isPending,
}) => {
  const [values, setValues] = useState<FoodFormData>(emptyFoodForm());

  useEffect(() => {
    if (open) setValues(food ? foodToForm(food) : emptyFoodForm());
  }, [open, food]);

  const patch = (next: Partial<FoodFormData>) => setValues((prev) => ({ ...prev, ...next }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    await onSubmit(values);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{food ? 'Edit food' : 'New food'}</DialogTitle>
          <DialogDescription>
            Macros are per serving. Meals logged against this food take their figures from here.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-5" onSubmit={submit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="food-name">Name</Label>
              <Input
                id="food-name"
                required
                value={values.name}
                onChange={(e) => patch({ name: e.target.value })}
                placeholder="Grilled chicken breast"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="food-brand">Brand or source</Label>
              <Input
                id="food-brand"
                value={values.brand ?? ''}
                onChange={(e) => patch({ brand: e.target.value })}
                placeholder="Galley, or a supplier"
              />
            </div>

            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={values.category ?? 'other'} onValueChange={(v) => patch({ category: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FOOD_CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="food-serving">Serving description</Label>
              <Input
                id="food-serving"
                value={values.serving_description}
                onChange={(e) => patch({ serving_description: e.target.value })}
                placeholder="100 g, one fillet, one bowl"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="food-grams">Serving weight (g)</Label>
              <Input
                id="food-grams"
                inputMode="decimal"
                value={values.serving_grams}
                onChange={(e) => patch({ serving_grams: Number(e.target.value) || 0 })}
              />
            </div>
          </div>

          <div>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Per serving
            </h3>
            <div className="grid gap-4 sm:grid-cols-4">
              <div className="space-y-2">
                <Label htmlFor="food-calories">Calories</Label>
                <Input
                  id="food-calories"
                  inputMode="decimal"
                  value={values.calories}
                  onChange={(e) => patch({ calories: Number(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="food-protein">Protein (g)</Label>
                <Input
                  id="food-protein"
                  inputMode="decimal"
                  value={values.protein_g}
                  onChange={(e) => patch({ protein_g: Number(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="food-carbs">Carbs (g)</Label>
                <Input
                  id="food-carbs"
                  inputMode="decimal"
                  value={values.carbs_g}
                  onChange={(e) => patch({ carbs_g: Number(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="food-fat">Fat (g)</Label>
                <Input
                  id="food-fat"
                  inputMode="decimal"
                  value={values.fat_g}
                  onChange={(e) => patch({ fat_g: Number(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="food-fibre">Fibre (g)</Label>
                <Input
                  id="food-fibre"
                  inputMode="decimal"
                  value={values.fibre_g ?? ''}
                  onChange={(e) => patch({ fibre_g: numberOrNull(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="food-sugar">Sugar (g)</Label>
                <Input
                  id="food-sugar"
                  inputMode="decimal"
                  value={values.sugar_g ?? ''}
                  onChange={(e) => patch({ sugar_g: numberOrNull(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="food-sodium">Sodium (mg)</Label>
                <Input
                  id="food-sodium"
                  inputMode="decimal"
                  value={values.sodium_mg ?? ''}
                  onChange={(e) => patch({ sodium_mg: numberOrNull(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label>Source</Label>
                <Select value={values.source} onValueChange={(v) => patch({ source: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FOOD_SOURCES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <AllergenPicker
            id="food-allergens"
            value={values.allergens}
            onChange={(next) => patch({ allergens: next })}
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/30 p-3">
              <div className="space-y-0.5">
                <Label htmlFor="food-recipe">This is a recipe</Label>
                <p className="text-xs text-muted-foreground">Recipes can be attached to a meal plan.</p>
              </div>
              <Switch
                id="food-recipe"
                checked={values.is_recipe}
                onCheckedChange={(checked) => patch({ is_recipe: checked })}
              />
            </div>
            <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/30 p-3">
              <div className="space-y-0.5">
                <Label htmlFor="food-active">In the library</Label>
                <p className="text-xs text-muted-foreground">
                  Archived foods stay on the meals already logged against them.
                </p>
              </div>
              <Switch
                id="food-active"
                checked={values.is_active}
                onCheckedChange={(checked) => patch({ is_active: checked })}
              />
            </div>
          </div>

          {values.is_recipe && (
            <div className="space-y-2">
              <Label htmlFor="food-method">Method</Label>
              <Textarea
                id="food-method"
                rows={4}
                value={values.recipe_method ?? ''}
                onChange={(e) => patch({ recipe_method: e.target.value })}
                placeholder="Ingredients and how the galley puts it together"
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="food-notes">Notes</Label>
            <Textarea
              id="food-notes"
              rows={2}
              value={values.notes ?? ''}
              onChange={(e) => patch({ notes: e.target.value })}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || !values.name.trim()}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {food ? 'Save food' : 'Add food'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default FoodDialog;
