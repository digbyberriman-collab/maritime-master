import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Apple,
  Droplets,
  Flame,
  Pencil,
  Ruler,
  Scale,
  Target,
  UtensilsCrossed,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
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
import { MacroProgress, MacroProgressGrid } from '@/modules/health/components/nutrition/MacroProgress';
import { AllergySafetyStrip } from '@/modules/health/components/nutrition/AllergySafetyStrip';
import { CalorieTrendChart, MacroTrendChart } from '@/modules/health/components/nutrition/MacroTrendChart';
import { NutritionProfileDialog } from '@/modules/health/components/nutrition/NutritionProfileDialog';
import { useSelectedPerson } from '@/modules/health/hooks/useSelectedPerson';
import { usePractitioners } from '@/modules/health/hooks/usePractitioners';
import { useHealthSettings } from '@/modules/health/hooks/useHealthSettings';
import {
  activityLevelLabel,
  goalMetricLabel,
  goalTypeLabel,
  useMeasurements,
  useNutritionGoals,
  useNutritionProfile,
  useNutritionTrend,
  type NutProfileFormData,
} from '@/modules/health/hooks/useNutrition';
import {
  bmiBand,
  formatDate,
  formatWeight,
  todayIso,
} from '@/modules/health/lib/format';
import { HEALTH_PATHS, healthLink } from '@/modules/health/paths';

/** One person's nutrition at a glance: targets, today, body and trend. */
const NutritionOverviewPage: React.FC = () => {
  const { personId, person, setPersonId, selfOnly, myPerson, wellness, directoryLoading } =
    useSelectedPerson('wellness');
  const canEdit = !wellness.loading && wellness.canEdit;
  const { settings } = useHealthSettings();
  const units = settings?.units ?? 'metric';

  const [profileOpen, setProfileOpen] = useState(false);

  const profile = useNutritionProfile(personId);
  const trend = useNutritionTrend(personId, 14);
  const measurements = useMeasurements(personId, 30);
  const goals = useNutritionGoals(personId);
  const nutritionists = usePractitioners('nutrition');

  const today = todayIso();
  const todayTotals = useMemo(
    () => trend.byDay.get(today) ?? { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, water_ml: 0, entries: 0 },
    [trend.byDay, today],
  );

  const submitProfile = async (values: NutProfileFormData) => {
    await profile.saveProfile.mutateAsync(values);
    setProfileOpen(false);
  };

  const latest = measurements.latest;
  const bmiValue = measurements.latestBmi;

  if (selfOnly && !directoryLoading && !myPerson) {
    return (
      <div className="space-y-6">
        <HealthPageHeader icon={Apple} title="Nutrition" description="Your targets, your logging and your progress." />
        <NoSubjectRecord />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <HealthPageHeader
        icon={Apple}
        title="Nutrition overview"
        description="Targets against what has actually been eaten, body metrics and the last fortnight."
        actions={
          personId ? (
            <>
              <Button asChild variant="outline" size="sm">
                <Link to={healthLink(HEALTH_PATHS.nutritionFoodLog, personId)}>
                  <UtensilsCrossed className="mr-2 h-4 w-4" /> Food log
                </Link>
              </Button>
              {canEdit && (
                <Button size="sm" onClick={() => setProfileOpen(true)}>
                  <Pencil className="mr-2 h-4 w-4" /> {profile.profile ? 'Edit profile' : 'Set targets'}
                </Button>
              )}
            </>
          ) : undefined
        }
        toolbar={
          !selfOnly && (
            <PersonPicker
              value={personId}
              onChange={(id) => setPersonId(id)}
              className="md:w-[420px]"
              placeholder="Choose whose nutrition to look at"
            />
          )
        }
      />

      {!personId ? (
        <PickPersonPrompt what="nutrition" icon={Apple} />
      ) : (
        <>
          <AllergySafetyStrip personId={personId} />

          {profile.isLoading ? (
            <HealthLoading rows={3} />
          ) : profile.isError ? (
            <HealthError title="Could not load the nutrition profile" error={profile.error} />
          ) : !profile.profile ? (
            <HealthEmpty
              icon={Target}
              title={`No nutrition profile for ${person?.displayName ?? 'this person'}`}
              description="Set daily calorie and macro targets so the food log has something to measure against. It takes a minute and can be changed at any time."
              action={
                canEdit ? (
                  <Button onClick={() => setProfileOpen(true)}>Set the targets</Button>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Ask the nutritionist or the purser to set the targets.
                  </p>
                )
              }
            />
          ) : (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">Today against target</CardTitle>
                    <CardDescription>
                      {goalTypeLabel(profile.profile.goal_type)} ·{' '}
                      {activityLevelLabel(profile.profile.activity_level)} ·{' '}
                      {todayTotals.entries} {todayTotals.entries === 1 ? 'entry' : 'entries'} logged
                    </CardDescription>
                  </div>
                  <Button asChild variant="outline" size="sm">
                    <Link to={healthLink(HEALTH_PATHS.nutritionFoodLog, personId)}>Log something</Link>
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                <MacroProgressGrid>
                  <MacroProgress
                    label="Calories"
                    current={todayTotals.calories}
                    target={profile.profile.target_calories}
                    unit="kcal"
                  />
                  <MacroProgress
                    label="Protein"
                    current={todayTotals.protein_g}
                    target={profile.profile.target_protein_g}
                    unit="g"
                    overIsWarning={false}
                  />
                  <MacroProgress
                    label="Carbohydrate"
                    current={todayTotals.carbs_g}
                    target={profile.profile.target_carbs_g}
                    unit="g"
                  />
                  <MacroProgress
                    label="Fat"
                    current={todayTotals.fat_g}
                    target={profile.profile.target_fat_g}
                    unit="g"
                  />
                  <MacroProgress
                    label="Water"
                    current={todayTotals.water_ml}
                    target={profile.profile.target_water_ml}
                    unit="ml"
                    overIsWarning={false}
                  />
                  <MacroProgress
                    label="Fibre target"
                    current={0}
                    target={profile.profile.target_fibre_g}
                    unit="g"
                    overIsWarning={false}
                  />
                </MacroProgressGrid>

                {(profile.profile.dietary_preferences ?? []).length > 0 && (
                  <div>
                    <p className="mb-1.5 text-xs text-muted-foreground">Dietary preferences</p>
                    <div className="flex flex-wrap gap-1.5">
                      {profile.profile.dietary_preferences.map((p) => (
                        <Badge key={p} variant="secondary" className="text-[10px]">
                          {p}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {(profile.profile.dislikes || profile.profile.supplements) && (
                  <div className="grid gap-3 sm:grid-cols-2 text-sm">
                    {profile.profile.dislikes && (
                      <div>
                        <p className="text-xs text-muted-foreground">Dislikes</p>
                        <p className="text-foreground">{profile.profile.dislikes}</p>
                      </div>
                    )}
                    {profile.profile.supplements && (
                      <div>
                        <p className="text-xs text-muted-foreground">Supplements</p>
                        <p className="text-foreground">{profile.profile.supplements}</p>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <StatGrid>
            <StatTile
              icon={Scale}
              label="Latest weight"
              value={measurements.isLoading ? null : formatWeight(latest?.weight_kg ?? null, units)}
              hint={latest ? `Measured ${formatDate(latest.measured_on)}` : 'No measurement yet'}
            />
            <StatTile
              icon={Ruler}
              label="Body fat"
              value={
                measurements.isLoading
                  ? null
                  : latest?.body_fat_pct === null || latest?.body_fat_pct === undefined
                    ? '—'
                    : `${Number(latest.body_fat_pct).toFixed(1)}%`
              }
              hint={latest?.waist_cm ? `Waist ${Number(latest.waist_cm)} cm` : 'No waist measurement'}
            />
            <StatTile
              icon={Scale}
              label="BMI"
              value={measurements.isLoading ? null : bmiValue === null ? '—' : bmiValue.toFixed(1)}
              hint={bmiBand(bmiValue)}
              tone={bmiValue !== null && (bmiValue < 18.5 || bmiValue >= 30) ? 'warning' : 'good'}
            />
            <StatTile
              icon={Flame}
              label="Average calories"
              value={trend.isLoading ? null : trend.averageCalories || '—'}
              hint={`Across ${trend.loggedDays} logged ${trend.loggedDays === 1 ? 'day' : 'days'}`}
            />
          </StatGrid>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Calories, last 14 days</CardTitle>
                <CardDescription>
                  {trend.loggedDays
                    ? 'Each bar is a day that was logged. The dashed line is the target.'
                    : 'Nothing logged in the last fortnight.'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {trend.isLoading ? (
                  <HealthLoading rows={2} />
                ) : trend.isError ? (
                  <HealthError title="Could not load the trend" error={trend.error} />
                ) : trend.loggedDays === 0 ? (
                  <HealthEmpty
                    icon={Flame}
                    title="Nothing logged yet"
                    description="Log a couple of meals and the fortnight's picture builds itself."
                    className="border-0 p-6"
                    action={
                      <Button asChild size="sm" variant="outline">
                        <Link to={healthLink(HEALTH_PATHS.nutritionFoodLog, personId)}>Open the food log</Link>
                      </Button>
                    }
                  />
                ) : (
                  <CalorieTrendChart
                    data={trend.series}
                    targetCalories={profile.profile?.target_calories ?? null}
                  />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Macros, last 14 days</CardTitle>
                <CardDescription>Protein, carbohydrate and fat a day, in grams.</CardDescription>
              </CardHeader>
              <CardContent>
                {trend.isLoading ? (
                  <HealthLoading rows={2} />
                ) : trend.isError ? (
                  <HealthError title="Could not load the trend" error={trend.error} />
                ) : trend.loggedDays === 0 ? (
                  <HealthEmpty
                    icon={Droplets}
                    title="No macros to show"
                    description="The chart fills in once meals are logged against the food library."
                    className="border-0 p-6"
                  />
                ) : (
                  <MacroTrendChart data={trend.series} />
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-base">Active goals</CardTitle>
                  <CardDescription>
                    {goals.summary.active
                      ? `${goals.summary.active} in progress, ${goals.summary.overdue} past their date`
                      : 'Nothing set yet.'}
                  </CardDescription>
                </div>
                <Button asChild variant="outline" size="sm">
                  <Link to={healthLink(HEALTH_PATHS.nutritionGoals, personId)}>
                    <Target className="mr-2 h-4 w-4" /> Manage goals
                  </Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {goals.isLoading ? (
                <HealthLoading rows={2} />
              ) : goals.isError ? (
                <HealthError title="Could not load the goals" error={goals.error} />
              ) : goals.active.length === 0 ? (
                <HealthEmpty
                  icon={Target}
                  title="No active goals"
                  description="Set a goal so progress can be measured against something. Weight, body fat and waist pull their trend from the measurement record."
                  className="border-0 p-6"
                  action={
                    canEdit ? (
                      <Button asChild size="sm">
                        <Link to={healthLink(HEALTH_PATHS.nutritionGoals, personId)}>Set a goal</Link>
                      </Button>
                    ) : undefined
                  }
                />
              ) : (
                <ul className="space-y-4">
                  {goals.active.slice(0, 4).map((goal) => (
                    <li key={goal.id} className="space-y-1.5">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="text-sm font-medium text-foreground">{goal.title}</span>
                        <span className="text-xs text-muted-foreground">
                          {goalMetricLabel(goal.metric)} ·{' '}
                          {goal.current_value === null ? '—' : Number(goal.current_value)}
                          {goal.target_value === null ? '' : ` of ${Number(goal.target_value)}`}{' '}
                          {goal.unit ?? ''}
                        </span>
                      </div>
                      <Progress value={goal.progressPct ?? 0} className="h-2" />
                      <p
                        className={cn(
                          'text-[11px]',
                          goal.isOverdue ? 'text-warning' : 'text-muted-foreground',
                        )}
                      >
                        {goal.daysRemaining === null
                          ? 'No target date'
                          : goal.isOverdue
                            ? `${Math.abs(goal.daysRemaining)} days past the target date`
                            : `${goal.daysRemaining} days remaining`}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <NutritionProfileDialog
        open={profileOpen}
        onOpenChange={setProfileOpen}
        profile={profile.profile}
        personName={person?.displayName}
        nutritionists={nutritionists.active}
        onSubmit={submitProfile}
        isPending={profile.saveProfile.isPending}
      />
    </div>
  );
};

export default NutritionOverviewPage;
