import React, { useMemo, useState } from 'react';
import { addDays, startOfWeek } from 'date-fns';
import { AlertTriangle, CalendarRange, ChevronLeft, ChevronRight, Plus, Trash2, Utensils } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { HealthPageHeader } from '@/modules/health/components/HealthPageHeader';
import { StatGrid, StatTile } from '@/modules/health/components/StatTile';
import { HealthEmpty, HealthError, HealthLoading } from '@/modules/health/components/HealthStates';
import { MealPlanDialog } from '@/modules/health/components/nutrition/MealPlanDialog';
import { useWellnessAccess } from '@/modules/auth/hooks/useWellnessAccess';
import { useCompanyVessels } from '@/modules/hris/hooks/useCrewContracts';
import { useHealthPeople } from '@/modules/health/hooks/useHealthPeople';
import { useAllergies } from '@/modules/health/hooks/usePatientRecord';
import {
  PLAN_MEALS,
  mealLabel,
  planStatusLabel,
  useMealPlans,
  useNutritionFoods,
  type MealPlanEntry,
  type MealPlanFormData,
} from '@/modules/health/hooks/useNutrition';
import { formatDate } from '@/modules/health/lib/format';
import { localDayIso } from '@/modules/health/hooks/useSpa';

const ALL = '__all__';

const statusTone: Record<string, string> = {
  planned: 'border-border bg-muted text-muted-foreground',
  prepared: 'border-primary/30 bg-primary/10 text-primary',
  served: 'border-success/30 bg-success/10 text-success',
  cancelled: 'border-destructive/30 bg-destructive/10 text-destructive',
};

/** Loose match so "Nuts" on a menu still flags a "Tree nut" allergy. */
const allergenMatches = (allergen: string, recorded: string): boolean => {
  const a = allergen.trim().toLowerCase();
  const b = recorded.trim().toLowerCase();
  if (!a || !b) return false;
  return a.includes(b) || b.includes(a);
};

/** The week's menus, with a flag on anything that clashes with an allergy. */
const MealCalendarPage: React.FC = () => {
  const wellness = useWellnessAccess();
  const canEdit = !wellness.loading && wellness.canEdit;

  const { vessels } = useCompanyVessels();
  const [vesselId, setVesselId] = useState(ALL);
  const [anchor, setAnchor] = useState(localDayIso(new Date()));
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<MealPlanEntry | null>(null);
  const [defaults, setDefaults] = useState<{ dayIso: string; meal?: string } | undefined>(undefined);
  const [deleting, setDeleting] = useState<MealPlanEntry | null>(null);

  const weekDays = useMemo(() => {
    const start = startOfWeek(new Date(`${anchor}T00:00:00`), { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, i) => localDayIso(addDays(start, i)));
  }, [anchor]);

  const plans = useMealPlans({
    fromDay: weekDays[0],
    toDay: weekDays[6],
    vesselId: vesselId === ALL ? null : vesselId,
  });
  const library = useNutritionFoods();
  const directory = useHealthPeople();
  // Company-wide allergies. The clinical policies return only what this
  // reader is allowed, so an empty list quietly means "nothing to flag".
  const allergies = useAllergies({ activeOnly: true });

  const peopleById = useMemo(() => new Map(directory.entries.map((p) => [p.id, p])), [directory.entries]);

  const clashesByPlan = useMemo(() => {
    const map = new Map<string, { person: string; allergen: string }[]>();
    if (allergies.allergies.length === 0) return map;
    for (const plan of plans.plans) {
      if (plan.allAllergens.length === 0) continue;
      const hits: { person: string; allergen: string }[] = [];
      for (const allergy of allergies.allergies) {
        const person = peopleById.get(allergy.person_id);
        if (!person) continue;
        // A personal plan only concerns its own subject; a vessel menu
        // concerns everyone active on that vessel.
        if (plan.person_id) {
          if (plan.person_id !== allergy.person_id) continue;
        } else if (plan.vessel_id && person.vessel_id !== plan.vessel_id) {
          continue;
        }
        const match = plan.allAllergens.find((a) => allergenMatches(a, allergy.allergen));
        if (match) hits.push({ person: person.displayName, allergen: allergy.allergen });
      }
      if (hits.length) map.set(plan.id, hits);
    }
    return map;
  }, [plans.plans, allergies.allergies, peopleById]);

  const byDay = useMemo(() => {
    const map = new Map<string, MealPlanEntry[]>();
    for (const plan of plans.plans) {
      map.set(plan.plan_date, [...(map.get(plan.plan_date) ?? []), plan]);
    }
    return map;
  }, [plans.plans]);

  const openNew = (dayIso: string, meal?: string) => {
    if (!canEdit) return;
    setEditing(null);
    setDefaults({ dayIso, meal });
    setDialogOpen(true);
  };

  const openEdit = (plan: MealPlanEntry) => {
    if (!canEdit) return;
    setEditing(plan);
    setDefaults(undefined);
    setDialogOpen(true);
  };

  const submit = async (values: MealPlanFormData) => {
    await plans.savePlan.mutateAsync({
      ...values,
      vessel_id: values.vessel_id ?? (vesselId === ALL ? null : vesselId),
    });
    setDialogOpen(false);
    setEditing(null);
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    await plans.deletePlan.mutateAsync(deleting.id);
    setDeleting(null);
  };

  const totalClashes = clashesByPlan.size;

  return (
    <div className="space-y-6">
      <HealthPageHeader
        icon={CalendarRange}
        title="Meal calendar"
        description="The week's menus. A plan with no name against it is a vessel menu for everyone aboard."
        actions={
          canEdit ? (
            <Button size="sm" onClick={() => openNew(weekDays[0])}>
              <Plus className="mr-2 h-4 w-4" /> Plan a meal
            </Button>
          ) : undefined
        }
        toolbar={
          <div className="flex w-full flex-wrap items-end gap-3">
            <div className="flex items-center gap-1">
              <Button
                type="button"
                size="icon"
                variant="outline"
                onClick={() => setAnchor(localDayIso(addDays(new Date(`${anchor}T00:00:00`), -7)))}
                aria-label="Previous week"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="outline"
                onClick={() => setAnchor(localDayIso(addDays(new Date(`${anchor}T00:00:00`), 7)))}
                aria-label="Next week"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-1">
              <Label htmlFor="plan-week" className="text-xs text-muted-foreground">
                Week of
              </Label>
              <Input
                id="plan-week"
                type="date"
                value={anchor}
                onChange={(e) => setAnchor(e.target.value || localDayIso(new Date()))}
                className="w-[170px]"
              />
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={() => setAnchor(localDayIso(new Date()))}>
              This week
            </Button>
            <Select value={vesselId} onValueChange={setVesselId}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All vessels</SelectItem>
                {vessels.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      />

      <StatGrid>
        <StatTile icon={Utensils} label="Meals planned" value={plans.isLoading ? null : plans.summary.total} />
        <StatTile
          icon={Utensils}
          label="Vessel menus"
          value={plans.isLoading ? null : plans.summary.vesselMenus}
        />
        <StatTile
          icon={Utensils}
          label="Personal plans"
          value={plans.isLoading ? null : plans.summary.personal}
        />
        <StatTile
          icon={AlertTriangle}
          label="Allergen clashes"
          value={plans.isLoading ? null : totalClashes}
          hint={totalClashes ? 'Check these before service' : 'Nothing flagged'}
          tone={totalClashes > 0 ? 'critical' : 'good'}
        />
      </StatGrid>

      {totalClashes > 0 && (
        <Alert className="border-destructive/40 bg-destructive/5">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          <AlertTitle>{totalClashes} planned {totalClashes === 1 ? 'meal clashes' : 'meals clash'} with a recorded allergy</AlertTitle>
          <AlertDescription>
            Flagged meals are outlined below. Speak to the person before service, or change the dish.
          </AlertDescription>
        </Alert>
      )}

      {plans.isLoading ? (
        <HealthLoading rows={4} />
      ) : plans.isError ? (
        <HealthError title="Could not load the meal calendar" error={plans.error} />
      ) : plans.plans.length === 0 ? (
        <HealthEmpty
          icon={CalendarRange}
          title="Nothing planned this week"
          description="Add the crew mess and guest menus for the week so allergies can be checked ahead of service, and so the food log can pull the right macros."
          action={
            canEdit ? (
              <Button onClick={() => openNew(weekDays[0])}>
                <Plus className="mr-2 h-4 w-4" /> Plan the first meal
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">
                Ask the chef or the purser to put the week's menu up.
              </p>
            )
          }
        />
      ) : (
        <div className="overflow-x-auto">
          <div className="grid min-w-[980px] grid-cols-7 gap-2">
            {weekDays.map((dayIso) => {
              const dayPlans = (byDay.get(dayIso) ?? []).sort(
                (a, b) =>
                  PLAN_MEALS.findIndex((m) => m.value === a.meal) -
                  PLAN_MEALS.findIndex((m) => m.value === b.meal),
              );
              const isToday = dayIso === localDayIso(new Date());
              return (
                <div
                  key={dayIso}
                  className={cn(
                    'flex min-h-[260px] flex-col rounded-lg border border-border bg-card p-2',
                    isToday && 'border-primary/50',
                  )}
                >
                  <div className="mb-2 flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-foreground">
                        {formatDate(dayIso, 'EEE')}
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {formatDate(dayIso, 'd MMM')}
                      </p>
                    </div>
                    {canEdit && (
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        onClick={() => openNew(dayIso)}
                        aria-label={`Plan a meal on ${formatDate(dayIso)}`}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>

                  <div className="flex flex-1 flex-col gap-1.5">
                    {dayPlans.length === 0 ? (
                      <p className="mt-2 text-[11px] text-muted-foreground">Nothing planned.</p>
                    ) : (
                      dayPlans.map((plan) => {
                        const clashes = clashesByPlan.get(plan.id) ?? [];
                        return (
                          <div
                            key={plan.id}
                            className={cn(
                              'rounded-md border p-2',
                              statusTone[plan.status] ?? statusTone.planned,
                              clashes.length && 'border-destructive ring-1 ring-destructive/40',
                            )}
                          >
                            <button
                              type="button"
                              onClick={() => openEdit(plan)}
                              disabled={!canEdit}
                              className="w-full text-left disabled:cursor-default"
                            >
                              <p className="text-[10px] uppercase tracking-wide opacity-70">
                                {mealLabel(plan.meal)}
                              </p>
                              <p className="truncate text-[11px] font-medium">{plan.title}</p>
                              <p className="truncate text-[10px] opacity-80">
                                {plan.isVesselMenu
                                  ? plan.vessel_name ?? 'Vessel menu'
                                  : plan.person_name ?? 'Personal plan'}
                                {plan.serves ? ` · serves ${plan.serves}` : ''}
                              </p>
                              {plan.allAllergens.length > 0 && (
                                <p className="truncate text-[10px] opacity-80">
                                  Allergens: {plan.allAllergens.join(', ')}
                                </p>
                              )}
                              {clashes.length > 0 && (
                                <p className="mt-1 text-[10px] font-medium text-destructive">
                                  Clashes with {clashes.map((c) => c.person).join(', ')}
                                </p>
                              )}
                            </button>
                            <div className="mt-1 flex items-center justify-between gap-1">
                              <Badge variant="outline" className="text-[9px]">
                                {planStatusLabel(plan.status)}
                              </Badge>
                              {canEdit && (
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  className="h-5 w-5"
                                  onClick={() => setDeleting(plan)}
                                  aria-label={`Remove ${plan.title}`}
                                >
                                  <Trash2 className="h-3 w-3 text-destructive" />
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {totalClashes > 0 && (
        <Card>
          <CardContent className="space-y-2 p-4">
            <h2 className="text-sm font-medium text-foreground">Allergen clashes in detail</h2>
            <ul className="space-y-2">
              {plans.plans
                .filter((p) => clashesByPlan.has(p.id))
                .map((plan) => (
                  <li key={plan.id} className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-foreground">
                        {formatDate(plan.plan_date, 'EEE d MMM')} · {mealLabel(plan.meal)} · {plan.title}
                      </p>
                      <p className="truncate text-xs text-destructive">
                        {(clashesByPlan.get(plan.id) ?? [])
                          .map((c) => `${c.person} (${c.allergen})`)
                          .join(', ')}
                      </p>
                    </div>
                    {canEdit && (
                      <Button size="sm" variant="outline" onClick={() => openEdit(plan)}>
                        Change the dish
                      </Button>
                    )}
                  </li>
                ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <MealPlanDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditing(null);
        }}
        plan={editing}
        defaults={defaults}
        recipes={library.foods}
        vessels={vessels}
        onSubmit={submit}
        isPending={plans.savePlan.isPending}
      />

      <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this planned meal</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting
                ? `"${deleting.title}" will come off ${formatDate(deleting.plan_date, 'EEEE d MMMM')}.`
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

export default MealCalendarPage;
