import React, { useMemo, useState } from 'react';
import {
  Archive,
  ArchiveRestore,
  ChevronLeft,
  ChevronRight,
  Droplets,
  Library,
  Pencil,
  Plus,
  Search,
  Trash2,
  UtensilsCrossed,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { HealthPageHeader } from '@/modules/health/components/HealthPageHeader';
import { PersonPicker } from '@/modules/health/components/PersonPicker';
import {
  HealthEmpty,
  HealthError,
  HealthLoading,
  NoSubjectRecord,
  PickPersonPrompt,
} from '@/modules/health/components/HealthStates';
import { MacroProgress, MacroProgressGrid } from '@/modules/health/components/nutrition/MacroProgress';
import { AllergySafetyStrip } from '@/modules/health/components/nutrition/AllergySafetyStrip';
import { FoodLogEntryDialog } from '@/modules/health/components/nutrition/FoodLogEntryDialog';
import { FoodDialog } from '@/modules/health/components/nutrition/FoodDialog';
import { useSelectedPerson } from '@/modules/health/hooks/useSelectedPerson';
import { useWellnessAccess } from '@/modules/auth/hooks/useWellnessAccess';
import {
  LOG_MEALS,
  foodCategoryLabel,
  mealLabel,
  useFoodLog,
  useNutritionFoods,
  useNutritionProfile,
  type FoodFormData,
  type LogEntryFormData,
  type LogEntryRow,
  type NutFood,
} from '@/modules/health/hooks/useNutrition';
import { addDaysIso, formatMacros } from '@/modules/health/lib/format';
import { localDayIso } from '@/modules/health/hooks/useSpa';

const WATER_STEPS = [250, 500, 750];

/** A day of logging for one person, plus the company food library. */
const FoodLogPage: React.FC = () => {
  const { personId, person, setPersonId, selfOnly, myPerson, directoryLoading } =
    useSelectedPerson('wellness');
  const wellness = useWellnessAccess();
  const canEdit = !wellness.loading && (wellness.canEdit || wellness.selfOnly);
  const canEditLibrary = !wellness.loading && wellness.canEdit;

  const [day, setDay] = useState(localDayIso(new Date()));
  const [entryOpen, setEntryOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<LogEntryRow | null>(null);
  const [entryMeal, setEntryMeal] = useState('lunch');
  const [deleting, setDeleting] = useState<LogEntryRow | null>(null);

  const [foodOpen, setFoodOpen] = useState(false);
  const [editingFood, setEditingFood] = useState<NutFood | null>(null);
  const [foodSearch, setFoodSearch] = useState('');
  const [showArchivedFoods, setShowArchivedFoods] = useState(false);

  const log = useFoodLog({ personId, fromDay: day, toDay: day });
  const profile = useNutritionProfile(personId);
  const library = useNutritionFoods({ includeInactive: true });

  const shiftDay = (days: number) => setDay(addDaysIso(day, days));

  const filteredFoods = useMemo(() => {
    const term = foodSearch.trim().toLowerCase();
    return library.allFoods.filter((f) => {
      if (!showArchivedFoods && !f.is_active) return false;
      if (!term) return true;
      return [f.name, f.brand, ...(f.allergens ?? [])]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(term);
    });
  }, [library.allFoods, foodSearch, showArchivedFoods]);

  const openEntry = (meal: string, entry: LogEntryRow | null) => {
    setEntryMeal(meal);
    setEditingEntry(entry);
    setEntryOpen(true);
  };

  const submitEntry = async (values: LogEntryFormData) => {
    await log.saveEntry.mutateAsync(values);
    setEntryOpen(false);
    setEditingEntry(null);
  };

  const submitFood = async (values: FoodFormData) => {
    await library.saveFood.mutateAsync(values);
    setFoodOpen(false);
    setEditingFood(null);
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    await log.deleteEntry.mutateAsync(deleting.id);
    setDeleting(null);
  };

  if (selfOnly && !directoryLoading && !myPerson) {
    return (
      <div className="space-y-6">
        <HealthPageHeader icon={UtensilsCrossed} title="Food log" description="What was eaten and when." />
        <NoSubjectRecord />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <HealthPageHeader
        icon={UtensilsCrossed}
        title="Food log"
        description="One day at a time. Choosing a food from the library keeps the macros honest."
        toolbar={
          !selfOnly && (
            <PersonPicker
              value={personId}
              onChange={(id) => setPersonId(id)}
              className="md:w-[420px]"
              placeholder="Choose whose log to open"
            />
          )
        }
      />

      <Tabs defaultValue="day">
        <TabsList>
          <TabsTrigger value="day">Day</TabsTrigger>
          <TabsTrigger value="library">Food library</TabsTrigger>
        </TabsList>

        <TabsContent value="day" className="mt-4 space-y-4">
          {!personId ? (
            <PickPersonPrompt what="food log" icon={UtensilsCrossed} />
          ) : (
            <>
              <AllergySafetyStrip personId={personId} />

              <div className="flex flex-wrap items-end gap-3">
                <div className="flex items-center gap-1">
                  <Button type="button" size="icon" variant="outline" onClick={() => shiftDay(-1)} aria-label="Previous day">
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button type="button" size="icon" variant="outline" onClick={() => shiftDay(1)} aria-label="Next day">
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="log-date" className="text-xs text-muted-foreground">
                    Date
                  </Label>
                  <Input
                    id="log-date"
                    type="date"
                    value={day}
                    onChange={(e) => setDay(e.target.value || localDayIso(new Date()))}
                    className="w-[170px]"
                  />
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={() => setDay(localDayIso(new Date()))}>
                  Today
                </Button>
                {canEdit && (
                  <Button type="button" size="sm" className="ml-auto" onClick={() => openEntry('lunch', null)}>
                    <Plus className="mr-2 h-4 w-4" /> Log something
                  </Button>
                )}
              </div>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Daily totals</CardTitle>
                  <CardDescription>
                    {profile.profile
                      ? 'Against the targets on the nutrition profile.'
                      : 'No targets set yet, so this is a running total only.'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <MacroProgressGrid>
                    <MacroProgress
                      label="Calories"
                      current={log.totals.calories}
                      target={profile.profile?.target_calories}
                      unit="kcal"
                    />
                    <MacroProgress
                      label="Protein"
                      current={log.totals.protein_g}
                      target={profile.profile?.target_protein_g}
                      unit="g"
                      overIsWarning={false}
                    />
                    <MacroProgress
                      label="Carbohydrate"
                      current={log.totals.carbs_g}
                      target={profile.profile?.target_carbs_g}
                      unit="g"
                    />
                    <MacroProgress
                      label="Fat"
                      current={log.totals.fat_g}
                      target={profile.profile?.target_fat_g}
                      unit="g"
                    />
                    <MacroProgress
                      label="Water"
                      current={log.totals.water_ml}
                      target={profile.profile?.target_water_ml}
                      unit="ml"
                      overIsWarning={false}
                    />
                  </MacroProgressGrid>

                  {canEdit && (
                    <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Droplets className="h-3.5 w-3.5" /> Quick water
                      </span>
                      {WATER_STEPS.map((ml) => (
                        <Button
                          key={ml}
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={log.logWater.isPending}
                          onClick={() => log.logWater.mutate({ day, ml })}
                        >
                          +{ml} ml
                        </Button>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {log.isLoading ? (
                <HealthLoading rows={4} />
              ) : log.isError ? (
                <HealthError title="Could not load the food log" error={log.error} />
              ) : log.entries.length === 0 ? (
                <HealthEmpty
                  icon={UtensilsCrossed}
                  title="Nothing logged on this day"
                  description="Add the first meal. Pick from the food library where you can, so the calories and macros match the galley."
                  action={
                    canEdit ? (
                      <Button onClick={() => openEntry('breakfast', null)}>
                        <Plus className="mr-2 h-4 w-4" /> Log the first meal
                      </Button>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        You can read this log but not add to it.
                      </p>
                    )
                  }
                />
              ) : (
                <div className="space-y-3">
                  {LOG_MEALS.map((meal) => {
                    const entries = log.byMeal.get(meal.value) ?? [];
                    if (entries.length === 0) return null;
                    const mealTotals = entries.reduce(
                      (sum, e) => ({
                        calories: sum.calories + Number(e.calories ?? 0),
                        protein_g: sum.protein_g + Number(e.protein_g ?? 0),
                        carbs_g: sum.carbs_g + Number(e.carbs_g ?? 0),
                        fat_g: sum.fat_g + Number(e.fat_g ?? 0),
                      }),
                      { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
                    );
                    return (
                      <Card key={meal.value}>
                        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                          <div>
                            <CardTitle className="text-sm">{meal.label}</CardTitle>
                            <CardDescription className="text-xs">{formatMacros(mealTotals)}</CardDescription>
                          </div>
                          {canEdit && (
                            <Button size="sm" variant="ghost" onClick={() => openEntry(meal.value, null)}>
                              <Plus className="h-4 w-4" />
                              <span className="sr-only">Add to {meal.label}</span>
                            </Button>
                          )}
                        </CardHeader>
                        <CardContent className="p-0">
                          <ul className="divide-y divide-border">
                            {entries.map((entry) => (
                              <li
                                key={entry.id}
                                className="flex items-center justify-between gap-3 px-4 py-2.5"
                              >
                                <div className="min-w-0">
                                  <p className="truncate text-sm text-foreground">{entry.description}</p>
                                  <p className="truncate text-xs text-muted-foreground">
                                    {Number(entry.quantity)} {entry.unit} · {formatMacros(entry)}
                                    {entry.water_ml ? ` · ${entry.water_ml} ml water` : ''}
                                  </p>
                                  {entry.food_allergens.length > 0 && (
                                    <p className="truncate text-[11px] text-warning">
                                      Contains {entry.food_allergens.join(', ')}
                                    </p>
                                  )}
                                </div>
                                {canEdit && (
                                  <div className="flex shrink-0 gap-1">
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => openEntry(entry.meal, entry)}
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                      <span className="sr-only">Edit {entry.description}</span>
                                    </Button>
                                    <Button size="sm" variant="ghost" onClick={() => setDeleting(entry)}>
                                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                      <span className="sr-only">Delete {entry.description}</span>
                                    </Button>
                                  </div>
                                )}
                              </li>
                            ))}
                          </ul>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="library" className="mt-4 space-y-4">
          <div className="flex w-full flex-col gap-3 md:flex-row md:items-center">
            <div className="relative flex-1 md:max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={foodSearch}
                onChange={(e) => setFoodSearch(e.target.value)}
                placeholder="Search foods, recipes and allergens"
                className="pl-9"
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="show-archived-foods"
                checked={showArchivedFoods}
                onCheckedChange={setShowArchivedFoods}
              />
              <Label htmlFor="show-archived-foods" className="text-sm text-muted-foreground">
                Show archived
              </Label>
            </div>
            {canEditLibrary && (
              <Button
                size="sm"
                className="md:ml-auto"
                onClick={() => {
                  setEditingFood(null);
                  setFoodOpen(true);
                }}
              >
                <Plus className="mr-2 h-4 w-4" /> New food
              </Button>
            )}
          </div>

          {library.isLoading ? (
            <HealthLoading rows={4} />
          ) : library.isError ? (
            <HealthError title="Could not load the food library" error={library.error} />
          ) : library.allFoods.length === 0 ? (
            <HealthEmpty
              icon={Library}
              title="The food library is empty"
              description="Add the foods and galley recipes the crew eat most. Once they are here, logging a meal is one tap and the macros come out right every time."
              action={
                canEditLibrary ? (
                  <Button
                    onClick={() => {
                      setEditingFood(null);
                      setFoodOpen(true);
                    }}
                  >
                    <Plus className="mr-2 h-4 w-4" /> Add the first food
                  </Button>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Ask the nutritionist or the chef to build the library.
                  </p>
                )
              }
            />
          ) : filteredFoods.length === 0 ? (
            <HealthEmpty
              icon={Search}
              title="No food matches that search"
              description="Try part of the name, a brand, or an allergen such as Milk."
              action={
                <Button variant="outline" onClick={() => setFoodSearch('')}>
                  Clear the search
                </Button>
              }
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filteredFoods.map((food) => (
                <Card key={food.id} className={cn(!food.is_active && 'opacity-60')}>
                  <CardContent className="space-y-2 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{food.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {[food.brand, foodCategoryLabel(food.category)].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                      {food.is_recipe && (
                        <Badge variant="secondary" className="shrink-0 text-[10px]">
                          Recipe
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Per {food.serving_description}: {formatMacros(food)}
                    </p>
                    {(food.allergens ?? []).length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {food.allergens.map((a) => (
                          <Badge
                            key={a}
                            variant="outline"
                            className="border-warning/20 bg-warning/10 text-[10px] text-warning"
                          >
                            {a}
                          </Badge>
                        ))}
                      </div>
                    )}
                    {canEditLibrary && (
                      <div className="flex gap-2 pt-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1"
                          onClick={() => {
                            setEditingFood(food);
                            setFoodOpen(true);
                          }}
                        >
                          <Pencil className="mr-2 h-3.5 w-3.5" /> Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            library.setFoodActive.mutate({ id: food.id, isActive: !food.is_active })
                          }
                        >
                          {food.is_active ? (
                            <Archive className="h-3.5 w-3.5" />
                          ) : (
                            <ArchiveRestore className="h-3.5 w-3.5" />
                          )}
                          <span className="sr-only">
                            {food.is_active ? 'Archive' : 'Restore'} {food.name}
                          </span>
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <FoodLogEntryDialog
        open={entryOpen}
        onOpenChange={(open) => {
          setEntryOpen(open);
          if (!open) setEditingEntry(null);
        }}
        entry={editingEntry}
        day={day}
        defaultMeal={entryMeal}
        foods={library.foods}
        onSubmit={submitEntry}
        isPending={log.saveEntry.isPending}
      />

      <FoodDialog
        open={foodOpen}
        onOpenChange={(open) => {
          setFoodOpen(open);
          if (!open) setEditingFood(null);
        }}
        food={editingFood}
        onSubmit={submitFood}
        isPending={library.saveFood.isPending}
      />

      <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this entry</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting
                ? `"${deleting.description}" will be taken off ${mealLabel(deleting.meal).toLowerCase()} and the day's totals.`
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default FoodLogPage;
