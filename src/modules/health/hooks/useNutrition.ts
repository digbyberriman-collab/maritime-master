import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Tables, TablesInsert } from '@/integrations/supabase/types';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useToast } from '@/shared/hooks/use-toast';
import { addDaysIso, bmi, todayIso } from '@/modules/health/lib/format';

export type NutProfile = Tables<'nut_profiles'>;
export type NutFood = Tables<'nut_foods'>;
export type NutLogEntry = Tables<'nut_food_log_entries'>;
export type NutMealPlan = Tables<'nut_meal_plans'>;
export type NutGoal = Tables<'nut_goals'>;
export type HealthMeasurement = Tables<'hw_measurements'>;

export const NUT_PROFILE_KEY = ['health', 'nutrition-profile'] as const;
export const NUT_FOODS_KEY = ['health', 'nutrition-foods'] as const;
export const NUT_LOG_KEY = ['health', 'nutrition-log'] as const;
export const NUT_PLANS_KEY = ['health', 'nutrition-meal-plans'] as const;
export const NUT_GOALS_KEY = ['health', 'nutrition-goals'] as const;
export const MEASUREMENTS_KEY = ['health', 'measurements'] as const;

export const GOAL_TYPES = [
  { value: 'maintain', label: 'Maintain' },
  { value: 'lose_fat', label: 'Lose fat' },
  { value: 'gain_muscle', label: 'Gain muscle' },
  { value: 'performance', label: 'Performance' },
  { value: 'medical', label: 'Medical' },
  { value: 'recovery', label: 'Recovery' },
] as const;

export const ACTIVITY_LEVELS = [
  { value: 'sedentary', label: 'Sedentary' },
  { value: 'light', label: 'Lightly active' },
  { value: 'moderate', label: 'Moderately active' },
  { value: 'active', label: 'Active' },
  { value: 'very_active', label: 'Very active' },
] as const;

/** Meals a food log entry can belong to. */
export const LOG_MEALS = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'snack', label: 'Snack' },
  { value: 'drink', label: 'Drink' },
  { value: 'pre_workout', label: 'Pre workout' },
  { value: 'post_workout', label: 'Post workout' },
] as const;

/** Meals a meal plan entry can belong to. Not the same list as the log. */
export const PLAN_MEALS = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'snack', label: 'Snack' },
  { value: 'drink', label: 'Drink' },
  { value: 'crew_mess', label: 'Crew mess' },
  { value: 'guest_service', label: 'Guest service' },
] as const;

export const PLAN_STATUSES = [
  { value: 'planned', label: 'Planned' },
  { value: 'prepared', label: 'Prepared' },
  { value: 'served', label: 'Served' },
  { value: 'cancelled', label: 'Cancelled' },
] as const;

export const FOOD_CATEGORIES = [
  { value: 'protein', label: 'Protein' },
  { value: 'carbohydrate', label: 'Carbohydrate' },
  { value: 'fat', label: 'Fat' },
  { value: 'vegetable', label: 'Vegetable' },
  { value: 'fruit', label: 'Fruit' },
  { value: 'dairy', label: 'Dairy' },
  { value: 'drink', label: 'Drink' },
  { value: 'snack', label: 'Snack' },
  { value: 'supplement', label: 'Supplement' },
  { value: 'composite', label: 'Composite dish' },
  { value: 'other', label: 'Other' },
] as const;

export const FOOD_SOURCES = [
  { value: 'custom', label: 'Custom' },
  { value: 'imported', label: 'Imported' },
  { value: 'galley', label: 'Galley' },
] as const;

export const GOAL_METRICS = [
  { value: 'weight', label: 'Weight' },
  { value: 'body_fat', label: 'Body fat' },
  { value: 'calories', label: 'Calories' },
  { value: 'protein', label: 'Protein' },
  { value: 'carbs', label: 'Carbohydrate' },
  { value: 'fat', label: 'Fat' },
  { value: 'water', label: 'Water' },
  { value: 'waist', label: 'Waist' },
  { value: 'custom', label: 'Something else' },
] as const;

export const GOAL_DIRECTIONS = [
  { value: 'decrease', label: 'Bring down' },
  { value: 'increase', label: 'Bring up' },
  { value: 'maintain', label: 'Hold steady' },
] as const;

export const GOAL_STATUSES = [
  { value: 'active', label: 'Active' },
  { value: 'achieved', label: 'Achieved' },
  { value: 'missed', label: 'Missed' },
  { value: 'abandoned', label: 'Abandoned' },
  { value: 'paused', label: 'Paused' },
] as const;

export const DIETARY_PREFERENCES = [
  'Vegetarian',
  'Vegan',
  'Pescatarian',
  'Halal',
  'Kosher',
  'Gluten free',
  'Dairy free',
  'Low carb',
  'Low sodium',
  'High protein',
] as const;

/** The 14 allergens UK and EU food law requires a galley to declare. */
export const COMMON_ALLERGENS = [
  'Celery',
  'Cereals containing gluten',
  'Crustaceans',
  'Eggs',
  'Fish',
  'Lupin',
  'Milk',
  'Molluscs',
  'Mustard',
  'Nuts',
  'Peanuts',
  'Sesame',
  'Soya',
  'Sulphites',
] as const;

export const goalTypeLabel = (value: string | null | undefined): string =>
  GOAL_TYPES.find((g) => g.value === value)?.label ?? 'Maintain';

export const activityLevelLabel = (value: string | null | undefined): string =>
  ACTIVITY_LEVELS.find((a) => a.value === value)?.label ?? 'Moderately active';

export const mealLabel = (value: string | null | undefined): string =>
  PLAN_MEALS.find((m) => m.value === value)?.label ??
  LOG_MEALS.find((m) => m.value === value)?.label ??
  'Meal';

export const planStatusLabel = (value: string | null | undefined): string =>
  PLAN_STATUSES.find((s) => s.value === value)?.label ?? '—';

export const foodCategoryLabel = (value: string | null | undefined): string =>
  FOOD_CATEGORIES.find((c) => c.value === value)?.label ?? 'Other';

export const goalMetricLabel = (value: string | null | undefined): string =>
  GOAL_METRICS.find((m) => m.value === value)?.label ?? 'Custom';

export const goalDirectionLabel = (value: string | null | undefined): string =>
  GOAL_DIRECTIONS.find((d) => d.value === value)?.label ?? '—';

export const goalStatusLabel = (value: string | null | undefined): string =>
  GOAL_STATUSES.find((s) => s.value === value)?.label ?? '—';

/** Default unit for a goal metric, offered when the user has not set one. */
export const goalMetricUnit = (metric: string | null | undefined): string => {
  switch (metric) {
    case 'weight':
      return 'kg';
    case 'body_fat':
      return '%';
    case 'waist':
      return 'cm';
    case 'calories':
      return 'kcal';
    case 'water':
      return 'ml';
    case 'protein':
    case 'carbs':
    case 'fat':
      return 'g';
    default:
      return '';
  }
};

/** The measurement column a goal metric tracks, when one exists. */
export const GOAL_METRIC_MEASUREMENT: Record<string, keyof HealthMeasurement> = {
  weight: 'weight_kg',
  body_fat: 'body_fat_pct',
  waist: 'waist_cm',
};

const useCompanyId = () => {
  const { profile } = useAuth();
  return profile?.company_id ?? null;
};

const blankToNull = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim() ?? '';
  return trimmed ? trimmed : null;
};

const num = (value: number | string | null | undefined): number => {
  const n = typeof value === 'string' ? Number(value) : value;
  return Number.isFinite(n) ? (n as number) : 0;
};

export interface MacroTotals {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  water_ml: number;
  entries: number;
}

export const emptyTotals = (): MacroTotals => ({
  calories: 0,
  protein_g: 0,
  carbs_g: 0,
  fat_g: 0,
  water_ml: 0,
  entries: 0,
});

const addEntry = (totals: MacroTotals, entry: NutLogEntry): MacroTotals => ({
  calories: totals.calories + num(entry.calories),
  protein_g: totals.protein_g + num(entry.protein_g),
  carbs_g: totals.carbs_g + num(entry.carbs_g),
  fat_g: totals.fat_g + num(entry.fat_g),
  water_ml: totals.water_ml + num(entry.water_ml),
  entries: totals.entries + 1,
});

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

export interface NutProfileFormData {
  goal_type: string;
  activity_level: string;
  target_calories: number | null;
  target_protein_g: number | null;
  target_carbs_g: number | null;
  target_fat_g: number | null;
  target_fibre_g: number | null;
  target_water_ml: number | null;
  dietary_preferences: string[];
  dislikes: string | null;
  supplements: string | null;
  nutritionist_id: string | null;
  notes: string | null;
}

export const emptyNutProfileForm = (): NutProfileFormData => ({
  goal_type: 'maintain',
  activity_level: 'moderate',
  target_calories: 2200,
  target_protein_g: 140,
  target_carbs_g: 220,
  target_fat_g: 70,
  target_fibre_g: 30,
  target_water_ml: 2500,
  dietary_preferences: [],
  dislikes: null,
  supplements: null,
  nutritionist_id: null,
  notes: null,
});

export const profileToForm = (row: NutProfile | null): NutProfileFormData =>
  row
    ? {
        goal_type: row.goal_type,
        activity_level: row.activity_level,
        target_calories: row.target_calories,
        target_protein_g: row.target_protein_g,
        target_carbs_g: row.target_carbs_g,
        target_fat_g: row.target_fat_g,
        target_fibre_g: row.target_fibre_g,
        target_water_ml: row.target_water_ml,
        dietary_preferences: row.dietary_preferences ?? [],
        dislikes: row.dislikes,
        supplements: row.supplements,
        nutritionist_id: row.nutritionist_id,
        notes: row.notes,
      }
    : emptyNutProfileForm();

/** One person's nutrition targets. The row is created on first save. */
export function useNutritionProfile(personId: string | null | undefined) {
  const companyId = useCompanyId();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: [...NUT_PROFILE_KEY, personId ?? null],
    enabled: Boolean(personId),
    staleTime: 60_000,
    queryFn: async (): Promise<NutProfile | null> => {
      const { data, error } = await supabase
        .from('nut_profiles')
        .select('*')
        .eq('person_id', personId as string)
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
  });

  const saveProfile = useMutation({
    mutationFn: async (values: NutProfileFormData) => {
      if (!companyId || !personId) throw new Error('No person selected');
      const columns = {
        goal_type: values.goal_type,
        activity_level: values.activity_level,
        target_calories: values.target_calories,
        target_protein_g: values.target_protein_g,
        target_carbs_g: values.target_carbs_g,
        target_fat_g: values.target_fat_g,
        target_fibre_g: values.target_fibre_g,
        target_water_ml: values.target_water_ml,
        dietary_preferences: values.dietary_preferences,
        dislikes: blankToNull(values.dislikes),
        supplements: blankToNull(values.supplements),
        nutritionist_id: values.nutritionist_id || null,
        notes: blankToNull(values.notes),
      };
      const existing = query.data;
      if (existing) {
        const { error } = await supabase
          .from('nut_profiles')
          .update({ ...columns, updated_by: user?.id ?? null })
          .eq('id', existing.id);
        if (error) throw error;
        return;
      }
      const payload: TablesInsert<'nut_profiles'> = {
        ...columns,
        company_id: companyId,
        person_id: personId,
        created_by: user?.id ?? null,
        updated_by: user?.id ?? null,
      };
      const { error } = await supabase.from('nut_profiles').insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: NUT_PROFILE_KEY });
      toast({ title: 'Nutrition profile saved' });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not save the profile', description: error.message, variant: 'destructive' });
    },
  });

  return { ...query, profile: query.data ?? null, saveProfile, isMutating: saveProfile.isPending };
}

// ---------------------------------------------------------------------------
// Food library
// ---------------------------------------------------------------------------

export interface FoodFormData {
  id?: string;
  name: string;
  brand: string | null;
  category: string | null;
  serving_description: string;
  serving_grams: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fibre_g: number | null;
  sugar_g: number | null;
  sodium_mg: number | null;
  allergens: string[];
  is_recipe: boolean;
  recipe_method: string | null;
  source: string;
  is_active: boolean;
  notes: string | null;
}

export const emptyFoodForm = (): FoodFormData => ({
  name: '',
  brand: null,
  category: 'other',
  serving_description: '100 g',
  serving_grams: 100,
  calories: 0,
  protein_g: 0,
  carbs_g: 0,
  fat_g: 0,
  fibre_g: null,
  sugar_g: null,
  sodium_mg: null,
  allergens: [],
  is_recipe: false,
  recipe_method: null,
  source: 'custom',
  is_active: true,
  notes: null,
});

export const foodToForm = (row: NutFood): FoodFormData => ({
  id: row.id,
  name: row.name,
  brand: row.brand,
  category: row.category,
  serving_description: row.serving_description,
  serving_grams: num(row.serving_grams),
  calories: num(row.calories),
  protein_g: num(row.protein_g),
  carbs_g: num(row.carbs_g),
  fat_g: num(row.fat_g),
  fibre_g: row.fibre_g === null ? null : num(row.fibre_g),
  sugar_g: row.sugar_g === null ? null : num(row.sugar_g),
  sodium_mg: row.sodium_mg === null ? null : num(row.sodium_mg),
  allergens: row.allergens ?? [],
  is_recipe: row.is_recipe,
  recipe_method: row.recipe_method,
  source: row.source,
  is_active: row.is_active,
  notes: row.notes,
});

/**
 * The company food and recipe library. Log entries copy their macros from
 * here through a database trigger, so editing a food does not rewrite meals
 * already logged against it.
 */
export function useNutritionFoods(options: { includeInactive?: boolean } = {}) {
  const companyId = useCompanyId();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: [...NUT_FOODS_KEY, companyId],
    enabled: Boolean(companyId),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<NutFood[]> => {
      const { data, error } = await supabase
        .from('nut_foods')
        .select('*')
        .eq('company_id', companyId as string)
        .order('name');
      if (error) throw error;
      return data ?? [];
    },
  });

  const foods = useMemo(() => {
    const rows = query.data ?? [];
    return options.includeInactive ? rows : rows.filter((f) => f.is_active);
  }, [query.data, options.includeInactive]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: NUT_FOODS_KEY });
  };

  const saveFood = useMutation({
    mutationFn: async (values: FoodFormData) => {
      if (!companyId) throw new Error('No company on your profile');
      const columns = {
        name: values.name.trim(),
        brand: blankToNull(values.brand),
        category: values.category || null,
        serving_description: values.serving_description.trim() || '1 serving',
        serving_grams: values.serving_grams || 100,
        calories: values.calories,
        protein_g: values.protein_g,
        carbs_g: values.carbs_g,
        fat_g: values.fat_g,
        fibre_g: values.fibre_g,
        sugar_g: values.sugar_g,
        sodium_mg: values.sodium_mg,
        allergens: values.allergens,
        is_recipe: values.is_recipe,
        recipe_method: blankToNull(values.recipe_method),
        source: values.source,
        is_active: values.is_active,
        notes: blankToNull(values.notes),
      };
      if (values.id) {
        const { error } = await supabase.from('nut_foods').update(columns).eq('id', values.id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from('nut_foods').insert({
        ...columns,
        company_id: companyId,
        created_by: user?.id ?? null,
      } as TablesInsert<'nut_foods'>);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Food saved' });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not save the food', description: error.message, variant: 'destructive' });
    },
  });

  const setFoodActive = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const { error } = await supabase.from('nut_foods').update({ is_active: isActive }).eq('id', id);
      if (error) throw error;
      return isActive;
    },
    onSuccess: (isActive) => {
      invalidate();
      toast({ title: isActive ? 'Food restored' : 'Food archived' });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not change the food', description: error.message, variant: 'destructive' });
    },
  });

  const archiveFoods = useMutation({
    mutationFn: async (ids: string[]) => {
      if (!ids.length) throw new Error('Nothing selected');
      const { error } = await supabase.from('nut_foods').update({ is_active: false }).in('id', ids);
      if (error) throw error;
      return ids.length;
    },
    onSuccess: (count) => {
      invalidate();
      toast({
        title: `${count} ${count === 1 ? 'food' : 'foods'} archived`,
        description: 'Meals already logged against them keep their macros.',
      });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not archive', description: error.message, variant: 'destructive' });
    },
  });

  const summary = useMemo(() => {
    const rows = query.data ?? [];
    return {
      total: rows.length,
      active: rows.filter((f) => f.is_active).length,
      archived: rows.filter((f) => !f.is_active).length,
      recipes: rows.filter((f) => f.is_recipe && f.is_active).length,
      withAllergens: rows.filter((f) => (f.allergens ?? []).length > 0).length,
    };
  }, [query.data]);

  return {
    ...query,
    foods,
    allFoods: query.data ?? [],
    summary,
    saveFood,
    setFoodActive,
    archiveFoods,
    isMutating: saveFood.isPending || setFoodActive.isPending || archiveFoods.isPending,
  };
}

/** Foods that have never been logged or planned, so are safe to archive. */
export function useUnusedFoods() {
  const companyId = useCompanyId();

  return useQuery({
    queryKey: [...NUT_FOODS_KEY, 'unused', companyId],
    enabled: Boolean(companyId),
    staleTime: 60_000,
    queryFn: async (): Promise<string[]> => {
      const [logged, planned] = await Promise.all([
        supabase
          .from('nut_food_log_entries')
          .select('food_id')
          .eq('company_id', companyId as string)
          .not('food_id', 'is', null),
        supabase
          .from('nut_meal_plans')
          .select('recipe_id')
          .eq('company_id', companyId as string)
          .not('recipe_id', 'is', null),
      ]);
      if (logged.error) throw logged.error;
      if (planned.error) throw planned.error;
      const used = new Set<string>();
      for (const row of logged.data ?? []) if (row.food_id) used.add(row.food_id);
      for (const row of planned.data ?? []) if (row.recipe_id) used.add(row.recipe_id);
      return Array.from(used);
    },
  });
}

// ---------------------------------------------------------------------------
// Food log
// ---------------------------------------------------------------------------

export interface LogEntryFormData {
  id?: string;
  logged_on: string;
  meal: string;
  food_id: string | null;
  description: string;
  quantity: number;
  unit: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  water_ml: number | null;
  notes: string | null;
}

export const emptyLogEntryForm = (day: string, meal = 'lunch'): LogEntryFormData => ({
  logged_on: day,
  meal,
  food_id: null,
  description: '',
  quantity: 1,
  unit: 'serving',
  calories: 0,
  protein_g: 0,
  carbs_g: 0,
  fat_g: 0,
  water_ml: null,
  notes: null,
});

export const logEntryToForm = (row: NutLogEntry): LogEntryFormData => ({
  id: row.id,
  logged_on: row.logged_on,
  meal: row.meal,
  food_id: row.food_id,
  description: row.description,
  quantity: num(row.quantity),
  unit: row.unit,
  calories: num(row.calories),
  protein_g: num(row.protein_g),
  carbs_g: num(row.carbs_g),
  fat_g: num(row.fat_g),
  water_ml: row.water_ml,
  notes: row.notes,
});

export interface LogEntryRow extends NutLogEntry {
  food_name: string | null;
  food_allergens: string[];
}

/**
 * A person's food log over a day range. When an entry names a food the
 * database recalculates its macros from the library on write, so the hook
 * refetches rather than trusting what it sent.
 */
export function useFoodLog(options: {
  personId?: string | null;
  fromDay?: string;
  toDay?: string;
}) {
  const companyId = useCompanyId();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { personId = null, fromDay = todayIso(), toDay = fromDay ?? todayIso() } = options;

  const query = useQuery({
    queryKey: [...NUT_LOG_KEY, personId, fromDay, toDay],
    enabled: Boolean(companyId) && Boolean(personId),
    staleTime: 15_000,
    queryFn: async (): Promise<LogEntryRow[]> => {
      const { data, error } = await supabase
        .from('nut_food_log_entries')
        .select('*, nut_foods(name, allergens)')
        .eq('person_id', personId as string)
        .gte('logged_on', fromDay)
        .lte('logged_on', toDay)
        .order('logged_on', { ascending: false })
        .order('created_at');
      if (error) throw error;
      return (data ?? []).map((row) => {
        const typed = row as NutLogEntry & { nut_foods?: { name: string; allergens: string[] } | null };
        return {
          ...typed,
          food_name: typed.nut_foods?.name ?? null,
          food_allergens: typed.nut_foods?.allergens ?? [],
        };
      });
    },
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: NUT_LOG_KEY });
  };

  const saveEntry = useMutation({
    mutationFn: async (values: LogEntryFormData) => {
      if (!companyId || !personId) throw new Error('No person selected');
      const description = values.description.trim();
      if (!description && !values.food_id) throw new Error('Describe what was eaten, or choose a food');
      // Macros are owned by the nut_food_log_fill_macros trigger whenever a
      // food is chosen; the values sent here are only used for free text.
      const columns = {
        logged_on: values.logged_on,
        meal: values.meal,
        food_id: values.food_id || null,
        description: description || 'Logged item',
        quantity: values.quantity > 0 ? values.quantity : 1,
        unit: values.unit.trim() || 'serving',
        calories: Math.max(0, values.calories),
        protein_g: values.protein_g,
        carbs_g: values.carbs_g,
        fat_g: values.fat_g,
        water_ml: values.water_ml,
        notes: blankToNull(values.notes),
      };
      if (values.id) {
        const { error } = await supabase.from('nut_food_log_entries').update(columns).eq('id', values.id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from('nut_food_log_entries').insert({
        ...columns,
        company_id: companyId,
        person_id: personId,
        logged_by: user?.id ?? null,
      } as TablesInsert<'nut_food_log_entries'>);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Entry saved' });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not save the entry', description: error.message, variant: 'destructive' });
    },
  });

  const deleteEntry = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('nut_food_log_entries').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Entry removed' });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not remove the entry', description: error.message, variant: 'destructive' });
    },
  });

  const logWater = useMutation({
    mutationFn: async ({ day, ml }: { day: string; ml: number }) => {
      if (!companyId || !personId) throw new Error('No person selected');
      const { error } = await supabase.from('nut_food_log_entries').insert({
        company_id: companyId,
        person_id: personId,
        logged_on: day,
        meal: 'drink',
        description: 'Water',
        quantity: 1,
        unit: 'glass',
        calories: 0,
        protein_g: 0,
        carbs_g: 0,
        fat_g: 0,
        water_ml: ml,
        logged_by: user?.id ?? null,
      } as TablesInsert<'nut_food_log_entries'>);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Water logged' });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not log the water', description: error.message, variant: 'destructive' });
    },
  });

  const totals = useMemo(
    () => (query.data ?? []).reduce(addEntry, emptyTotals()),
    [query.data],
  );

  const byDay = useMemo(() => {
    const map = new Map<string, MacroTotals>();
    for (const entry of query.data ?? []) {
      map.set(entry.logged_on, addEntry(map.get(entry.logged_on) ?? emptyTotals(), entry));
    }
    return map;
  }, [query.data]);

  const byMeal = useMemo(() => {
    const map = new Map<string, LogEntryRow[]>();
    for (const entry of query.data ?? []) {
      map.set(entry.meal, [...(map.get(entry.meal) ?? []), entry]);
    }
    return map;
  }, [query.data]);

  return {
    ...query,
    entries: query.data ?? [],
    totals,
    byDay,
    byMeal,
    saveEntry,
    deleteEntry,
    logWater,
    isMutating: saveEntry.isPending || deleteEntry.isPending || logWater.isPending,
  };
}

/** Daily totals across a window, for the overview trend chart. */
export function useNutritionTrend(personId: string | null | undefined, days = 14) {
  const fromDay = addDaysIso(todayIso(), -(days - 1));
  const log = useFoodLog({ personId, fromDay, toDay: todayIso() });

  const series = useMemo(() => {
    const rows: Array<{ day: string; label: string; calories: number; protein: number; carbs: number; fat: number }> =
      [];
    for (let i = 0; i < days; i += 1) {
      const day = addDaysIso(fromDay, i);
      const totals = log.byDay.get(day) ?? emptyTotals();
      rows.push({
        day,
        label: day.slice(8) + '/' + day.slice(5, 7),
        calories: Math.round(totals.calories),
        protein: Math.round(totals.protein_g),
        carbs: Math.round(totals.carbs_g),
        fat: Math.round(totals.fat_g),
      });
    }
    return rows;
  }, [log.byDay, fromDay, days]);

  const loggedDays = useMemo(() => series.filter((d) => d.calories > 0).length, [series]);
  const averageCalories = useMemo(
    () => (loggedDays ? Math.round(series.reduce((s, d) => s + d.calories, 0) / loggedDays) : 0),
    [series, loggedDays],
  );

  return { ...log, series, loggedDays, averageCalories };
}

// ---------------------------------------------------------------------------
// Meal plans
// ---------------------------------------------------------------------------

export interface MealPlanEntry extends NutMealPlan {
  person_name: string | null;
  recipe_name: string | null;
  recipe_allergens: string[];
  vessel_name: string | null;
  /** All allergens the plan declares, from the plan row and its recipe. */
  allAllergens: string[];
  isVesselMenu: boolean;
}

export interface MealPlanFormData {
  id?: string;
  plan_date: string;
  meal: string;
  person_id: string | null;
  vessel_id: string | null;
  title: string;
  description: string | null;
  recipe_id: string | null;
  serves: number | null;
  allergens: string[];
  calories: number | null;
  prepared_by: string | null;
  status: string;
  notes: string | null;
}

export const emptyMealPlanForm = (day: string, meal = 'lunch'): MealPlanFormData => ({
  plan_date: day,
  meal,
  person_id: null,
  vessel_id: null,
  title: '',
  description: null,
  recipe_id: null,
  serves: null,
  allergens: [],
  calories: null,
  prepared_by: null,
  status: 'planned',
  notes: null,
});

export const mealPlanToForm = (row: NutMealPlan): MealPlanFormData => ({
  id: row.id,
  plan_date: row.plan_date,
  meal: row.meal,
  person_id: row.person_id,
  vessel_id: row.vessel_id,
  title: row.title,
  description: row.description,
  recipe_id: row.recipe_id,
  serves: row.serves,
  allergens: row.allergens ?? [],
  calories: row.calories === null ? null : num(row.calories),
  prepared_by: row.prepared_by,
  status: row.status,
  notes: row.notes,
});

/** Meal plans in a date range. A null `person_id` is a vessel-wide menu. */
export function useMealPlans(options: {
  fromDay: string;
  toDay: string;
  vesselId?: string | null;
  personId?: string | null;
}) {
  const companyId = useCompanyId();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { fromDay, toDay, vesselId = null, personId = null } = options;

  const query = useQuery({
    queryKey: [...NUT_PLANS_KEY, companyId, fromDay, toDay, vesselId, personId],
    enabled: Boolean(companyId),
    staleTime: 30_000,
    queryFn: async (): Promise<MealPlanEntry[]> => {
      let request = supabase
        .from('nut_meal_plans')
        .select('*, hw_people(first_name, last_name, preferred_name), nut_foods(name, allergens), vessels(name)')
        .eq('company_id', companyId as string)
        .gte('plan_date', fromDay)
        .lte('plan_date', toDay)
        .order('plan_date')
        .order('meal');
      if (vesselId) request = request.eq('vessel_id', vesselId);
      if (personId) request = request.eq('person_id', personId);
      const { data, error } = await request;
      if (error) throw error;
      return (data ?? []).map((row) => {
        const typed = row as NutMealPlan & {
          hw_people?: { first_name: string; last_name: string; preferred_name: string | null } | null;
          nut_foods?: { name: string; allergens: string[] } | null;
          vessels?: { name: string } | null;
        };
        const recipeAllergens = typed.nut_foods?.allergens ?? [];
        const person = typed.hw_people;
        return {
          ...typed,
          person_name: person ? `${person.preferred_name ?? person.first_name} ${person.last_name}` : null,
          recipe_name: typed.nut_foods?.name ?? null,
          recipe_allergens: recipeAllergens,
          vessel_name: typed.vessels?.name ?? null,
          allAllergens: Array.from(new Set([...(typed.allergens ?? []), ...recipeAllergens])),
          isVesselMenu: typed.person_id === null,
        };
      });
    },
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: NUT_PLANS_KEY });
  };

  const savePlan = useMutation({
    mutationFn: async (values: MealPlanFormData) => {
      if (!companyId) throw new Error('No company on your profile');
      if (!values.title.trim()) throw new Error('Give the meal a name');
      const columns = {
        plan_date: values.plan_date,
        meal: values.meal,
        person_id: values.person_id || null,
        vessel_id: values.vessel_id || null,
        title: values.title.trim(),
        description: blankToNull(values.description),
        recipe_id: values.recipe_id || null,
        serves: values.serves,
        allergens: values.allergens,
        calories: values.calories,
        prepared_by: blankToNull(values.prepared_by),
        status: values.status,
        notes: blankToNull(values.notes),
      };
      if (values.id) {
        const { error } = await supabase.from('nut_meal_plans').update(columns).eq('id', values.id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from('nut_meal_plans').insert({
        ...columns,
        company_id: companyId,
        created_by: user?.id ?? null,
      } as TablesInsert<'nut_meal_plans'>);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Meal plan saved' });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not save the meal plan', description: error.message, variant: 'destructive' });
    },
  });

  const deletePlan = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('nut_meal_plans').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Meal plan removed' });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not remove the meal plan', description: error.message, variant: 'destructive' });
    },
  });

  const summary = useMemo(() => {
    const rows = query.data ?? [];
    return {
      total: rows.length,
      vesselMenus: rows.filter((p) => p.isVesselMenu).length,
      personal: rows.filter((p) => !p.isVesselMenu).length,
      served: rows.filter((p) => p.status === 'served').length,
      withAllergens: rows.filter((p) => p.allAllergens.length > 0).length,
    };
  }, [query.data]);

  return {
    ...query,
    plans: query.data ?? [],
    summary,
    savePlan,
    deletePlan,
    isMutating: savePlan.isPending || deletePlan.isPending,
  };
}

// ---------------------------------------------------------------------------
// Goals
// ---------------------------------------------------------------------------

export interface NutGoalEntry extends NutGoal {
  /** 0 to 100, or null when the goal has no start and target to measure. */
  progressPct: number | null;
  daysRemaining: number | null;
  isOverdue: boolean;
}

export interface GoalFormData {
  id?: string;
  title: string;
  metric: string;
  target_value: number | null;
  start_value: number | null;
  current_value: number | null;
  unit: string | null;
  direction: string;
  start_date: string;
  target_date: string | null;
  status: string;
  notes: string | null;
}

export const emptyGoalForm = (): GoalFormData => ({
  title: '',
  metric: 'weight',
  target_value: null,
  start_value: null,
  current_value: null,
  unit: 'kg',
  direction: 'decrease',
  start_date: todayIso(),
  target_date: addDaysIso(todayIso(), 90),
  status: 'active',
  notes: null,
});

export const goalToForm = (row: NutGoal): GoalFormData => ({
  id: row.id,
  title: row.title,
  metric: row.metric,
  target_value: row.target_value === null ? null : num(row.target_value),
  start_value: row.start_value === null ? null : num(row.start_value),
  current_value: row.current_value === null ? null : num(row.current_value),
  unit: row.unit,
  direction: row.direction,
  start_date: row.start_date,
  target_date: row.target_date,
  status: row.status,
  notes: row.notes,
});

/** How far a goal has travelled from its start value towards its target. */
export const goalProgress = (row: NutGoal): number | null => {
  const start = row.start_value === null ? null : num(row.start_value);
  const target = row.target_value === null ? null : num(row.target_value);
  const current = row.current_value === null ? start : num(row.current_value);
  if (start === null || target === null || current === null) return null;
  const span = target - start;
  if (span === 0) return current === target ? 100 : 0;
  const pct = ((current - start) / span) * 100;
  return Math.max(0, Math.min(100, Math.round(pct)));
};

export function useNutritionGoals(personId: string | null | undefined) {
  const companyId = useCompanyId();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: [...NUT_GOALS_KEY, personId ?? null],
    enabled: Boolean(personId),
    staleTime: 30_000,
    queryFn: async (): Promise<NutGoalEntry[]> => {
      const { data, error } = await supabase
        .from('nut_goals')
        .select('*')
        .eq('person_id', personId as string)
        .order('status')
        .order('target_date', { nullsFirst: false });
      if (error) throw error;
      const today = new Date(`${todayIso()}T00:00:00`).getTime();
      return (data ?? []).map((row) => {
        const daysRemaining = row.target_date
          ? Math.round((new Date(`${row.target_date}T00:00:00`).getTime() - today) / 86_400_000)
          : null;
        return {
          ...row,
          progressPct: goalProgress(row),
          daysRemaining,
          isOverdue: daysRemaining !== null && daysRemaining < 0 && row.status === 'active',
        };
      });
    },
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: NUT_GOALS_KEY });
  };

  const saveGoal = useMutation({
    mutationFn: async (values: GoalFormData) => {
      if (!companyId || !personId) throw new Error('No person selected');
      if (!values.title.trim()) throw new Error('Give the goal a name');
      const columns = {
        title: values.title.trim(),
        metric: values.metric,
        target_value: values.target_value,
        start_value: values.start_value,
        current_value: values.current_value,
        unit: blankToNull(values.unit),
        direction: values.direction,
        start_date: values.start_date,
        target_date: values.target_date || null,
        status: values.status,
        notes: blankToNull(values.notes),
      };
      if (values.id) {
        const { error } = await supabase.from('nut_goals').update(columns).eq('id', values.id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from('nut_goals').insert({
        ...columns,
        company_id: companyId,
        person_id: personId,
        created_by: user?.id ?? null,
      } as TablesInsert<'nut_goals'>);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Goal saved' });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not save the goal', description: error.message, variant: 'destructive' });
    },
  });

  const recordProgress = useMutation({
    mutationFn: async ({ id, value }: { id: string; value: number }) => {
      const { error } = await supabase.from('nut_goals').update({ current_value: value }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Progress recorded' });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not record progress', description: error.message, variant: 'destructive' });
    },
  });

  const setGoalStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from('nut_goals')
        .update({ status, achieved_on: status === 'achieved' ? todayIso() : null })
        .eq('id', id);
      if (error) throw error;
      return status;
    },
    onSuccess: (status) => {
      invalidate();
      toast({ title: `Goal marked ${goalStatusLabel(status).toLowerCase()}` });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not update the goal', description: error.message, variant: 'destructive' });
    },
  });

  const deleteGoal = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('nut_goals').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Goal removed' });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not remove the goal', description: error.message, variant: 'destructive' });
    },
  });

  const summary = useMemo(() => {
    const rows = query.data ?? [];
    const active = rows.filter((g) => g.status === 'active');
    return {
      total: rows.length,
      active: active.length,
      achieved: rows.filter((g) => g.status === 'achieved').length,
      overdue: rows.filter((g) => g.isOverdue).length,
      averageProgress: active.length
        ? Math.round(
            active.reduce((sum, g) => sum + (g.progressPct ?? 0), 0) / active.length,
          )
        : null,
    };
  }, [query.data]);

  return {
    ...query,
    goals: query.data ?? [],
    active: (query.data ?? []).filter((g) => g.status === 'active'),
    summary,
    saveGoal,
    recordProgress,
    setGoalStatus,
    deleteGoal,
    isMutating:
      saveGoal.isPending || recordProgress.isPending || setGoalStatus.isPending || deleteGoal.isPending,
  };
}

// ---------------------------------------------------------------------------
// Measurements
// ---------------------------------------------------------------------------

export interface MeasurementEntry extends HealthMeasurement {
  bmiValue: number | null;
}

/**
 * Body metrics for one subject, newest first. Shared with physiotherapy and
 * personal training, so this hook only reads: nutrition does not own them.
 */
export function useMeasurements(personId: string | null | undefined, limit = 60) {
  const query = useQuery({
    queryKey: [...MEASUREMENTS_KEY, personId ?? null, limit],
    enabled: Boolean(personId),
    staleTime: 60_000,
    queryFn: async (): Promise<MeasurementEntry[]> => {
      const { data, error } = await supabase
        .from('hw_measurements')
        .select('*')
        .eq('person_id', personId as string)
        .order('measured_on', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []).map((row) => ({
        ...row,
        bmiValue: bmi(row.weight_kg === null ? null : num(row.weight_kg), row.height_cm === null ? null : num(row.height_cm)),
      }));
    },
  });

  const latest = useMemo(() => (query.data ?? [])[0] ?? null, [query.data]);

  /** The most recent non-null height, so a weight-only entry still gives BMI. */
  const latestHeightCm = useMemo(() => {
    const row = (query.data ?? []).find((m) => m.height_cm !== null);
    return row?.height_cm === undefined || row?.height_cm === null ? null : num(row.height_cm);
  }, [query.data]);

  const latestBmi = useMemo(() => {
    if (!latest) return null;
    return bmi(latest.weight_kg === null ? null : num(latest.weight_kg), latestHeightCm);
  }, [latest, latestHeightCm]);

  return { ...query, measurements: query.data ?? [], latest, latestHeightCm, latestBmi };
}
