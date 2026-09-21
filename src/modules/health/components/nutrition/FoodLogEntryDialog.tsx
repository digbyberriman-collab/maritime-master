import React, { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  LOG_MEALS,
  emptyLogEntryForm,
  logEntryToForm,
  type LogEntryFormData,
  type LogEntryRow,
  type NutFood,
} from '@/modules/health/hooks/useNutrition';
import { formatMacros } from '@/modules/health/lib/format';

const NONE = '__none__';

interface FoodLogEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: LogEntryRow | null;
  day: string;
  defaultMeal?: string;
  foods: NutFood[];
  onSubmit: (values: LogEntryFormData) => Promise<void>;
  isPending?: boolean;
}

/**
 * Add or edit a food log line, either from the library or as free text. When
 * a library food is chosen the macros are recalculated by a database trigger
 * on save, so the numbers shown here are a preview only.
 */
export const FoodLogEntryDialog: React.FC<FoodLogEntryDialogProps> = ({
  open,
  onOpenChange,
  entry,
  day,
  defaultMeal = 'lunch',
  foods,
  onSubmit,
  isPending,
}) => {
  const [mode, setMode] = useState<'library' | 'free'>('library');
  const [values, setValues] = useState<LogEntryFormData>(emptyLogEntryForm(day, defaultMeal));

  useEffect(() => {
    if (!open) return;
    if (entry) {
      setValues(logEntryToForm(entry));
      setMode(entry.food_id ? 'library' : 'free');
      return;
    }
    setValues(emptyLogEntryForm(day, defaultMeal));
    setMode(foods.length ? 'library' : 'free');
  }, [open, entry, day, defaultMeal, foods.length]);

  const patch = (next: Partial<LogEntryFormData>) => setValues((prev) => ({ ...prev, ...next }));

  const food = useMemo(() => foods.find((f) => f.id === values.food_id) ?? null, [foods, values.food_id]);

  const preview = useMemo(() => {
    if (!food) return null;
    const q = values.quantity > 0 ? values.quantity : 1;
    return {
      calories: Number(food.calories) * q,
      protein_g: Number(food.protein_g) * q,
      carbs_g: Number(food.carbs_g) * q,
      fat_g: Number(food.fat_g) * q,
    };
  }, [food, values.quantity]);

  const chooseFood = (id: string) => {
    if (id === NONE) {
      patch({ food_id: null });
      return;
    }
    const chosen = foods.find((f) => f.id === id) ?? null;
    patch({
      food_id: id,
      description: values.description.trim() || chosen?.name || '',
      unit: chosen?.serving_description ?? 'serving',
    });
  };

  const switchMode = (next: 'library' | 'free') => {
    setMode(next);
    if (next === 'free') patch({ food_id: null });
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    await onSubmit({ ...values, food_id: mode === 'library' ? values.food_id : null });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{entry ? 'Edit entry' : 'Log something'}</DialogTitle>
          <DialogDescription>
            Choose from the food library so the macros stay consistent, or type them in by hand.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={submit}>
          <Tabs value={mode} onValueChange={(v) => switchMode(v as 'library' | 'free')}>
            <TabsList className="w-full">
              <TabsTrigger value="library" className="flex-1" disabled={foods.length === 0}>
                From the library
              </TabsTrigger>
              <TabsTrigger value="free" className="flex-1">
                Free text
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="entry-date">Date</Label>
              <Input
                id="entry-date"
                type="date"
                value={values.logged_on}
                onChange={(e) => patch({ logged_on: e.target.value || day })}
              />
            </div>
            <div className="space-y-2">
              <Label>Meal</Label>
              <Select value={values.meal} onValueChange={(v) => patch({ meal: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LOG_MEALS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {mode === 'library' && (
            <div className="space-y-2">
              <Label>Food</Label>
              <Select value={values.food_id ?? NONE} onValueChange={chooseFood}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a food or recipe" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value={NONE}>Not chosen</SelectItem>
                  {foods.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name}
                      {f.brand ? ` · ${f.brand}` : ''} · {Math.round(Number(f.calories))} kcal per{' '}
                      {f.serving_description}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {food && (food.allergens ?? []).length > 0 && (
                <p className="text-xs text-warning">Contains {food.allergens.join(', ')}.</p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="entry-description">Description</Label>
            <Input
              id="entry-description"
              value={values.description}
              onChange={(e) => patch({ description: e.target.value })}
              placeholder={mode === 'library' ? 'Leave empty to use the food name' : 'Chicken salad from the galley'}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="entry-quantity">
                {mode === 'library' ? 'Servings' : 'Quantity'}
              </Label>
              <Input
                id="entry-quantity"
                inputMode="decimal"
                value={values.quantity}
                onChange={(e) => patch({ quantity: Number(e.target.value) || 0 })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="entry-unit">Unit</Label>
              <Input
                id="entry-unit"
                value={values.unit}
                onChange={(e) => patch({ unit: e.target.value })}
                placeholder="serving, plate, bowl"
              />
            </div>
          </div>

          {mode === 'library' ? (
            preview && (
              <Alert>
                <AlertDescription className="text-sm">
                  This works out at {formatMacros(preview)}. The exact figures are set by the food
                  library when the entry saves.
                </AlertDescription>
              </Alert>
            )
          ) : (
            <div className="grid gap-4 sm:grid-cols-4">
              <div className="space-y-2">
                <Label htmlFor="entry-calories">Calories</Label>
                <Input
                  id="entry-calories"
                  inputMode="decimal"
                  value={values.calories}
                  onChange={(e) => patch({ calories: Number(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="entry-protein">Protein (g)</Label>
                <Input
                  id="entry-protein"
                  inputMode="decimal"
                  value={values.protein_g}
                  onChange={(e) => patch({ protein_g: Number(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="entry-carbs">Carbs (g)</Label>
                <Input
                  id="entry-carbs"
                  inputMode="decimal"
                  value={values.carbs_g}
                  onChange={(e) => patch({ carbs_g: Number(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="entry-fat">Fat (g)</Label>
                <Input
                  id="entry-fat"
                  inputMode="decimal"
                  value={values.fat_g}
                  onChange={(e) => patch({ fat_g: Number(e.target.value) || 0 })}
                />
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="entry-water">Water (ml)</Label>
              <Input
                id="entry-water"
                inputMode="numeric"
                value={values.water_ml ?? ''}
                onChange={(e) =>
                  patch({ water_ml: e.target.value.trim() ? Number(e.target.value) || 0 : null })
                }
                placeholder="250"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="entry-notes">Notes</Label>
              <Textarea
                id="entry-notes"
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
            <Button
              type="submit"
              disabled={isPending || (!values.description.trim() && !values.food_id)}
            >
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {entry ? 'Save entry' : 'Add entry'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default FoodLogEntryDialog;
