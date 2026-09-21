import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Tables, TablesInsert } from '@/integrations/supabase/types';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useToast } from '@/shared/hooks/use-toast';

export type PtExercise = Tables<'pt_exercises'>;
export type PtVideo = Tables<'pt_videos'>;
export type PtProgramTemplate = Tables<'pt_program_templates'>;
export type PtTemplateDay = Tables<'pt_template_days'>;
export type PtTemplateItem = Tables<'pt_template_items'>;
export type PtExerciseSource = Tables<'pt_exercise_sources'>;

export const PT_EXERCISES_KEY = ['health', 'pt-exercises'] as const;
export const PT_EXERCISE_FACETS_KEY = ['health', 'pt-exercise-facets'] as const;
export const PT_VIDEOS_KEY = ['health', 'pt-videos'] as const;
export const PT_TEMPLATES_KEY = ['health', 'pt-templates'] as const;
export const PT_TEMPLATE_BUILDER_KEY = ['health', 'pt-template-builder'] as const;
export const PT_SOURCES_KEY = ['health', 'pt-exercise-sources'] as const;

export const EXERCISE_CATEGORIES = [
  { value: 'strength', label: 'Strength' },
  { value: 'cardio', label: 'Cardio' },
  { value: 'mobility', label: 'Mobility' },
  { value: 'rehab', label: 'Rehabilitation' },
  { value: 'plyometric', label: 'Plyometric' },
  { value: 'balance', label: 'Balance' },
  { value: 'stretch', label: 'Stretch' },
  { value: 'core', label: 'Core' },
  { value: 'skill', label: 'Skill' },
  { value: 'other', label: 'Other' },
] as const;

export const DIFFICULTIES = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
] as const;

export const EXERCISE_SOURCES = [
  { value: 'custom', label: 'Written on board' },
  { value: 'wger', label: 'wger' },
  { value: 'exercisedb', label: 'ExerciseDB API' },
  { value: 'exercisedb_import', label: 'ExerciseDB import' },
  { value: 'musclewiki', label: 'MuscleWiki' },
  { value: 'anatomytool', label: 'AnatomyTOOL' },
  { value: 'z_anatomy', label: 'Z-Anatomy' },
] as const;

export const VIDEO_CATEGORIES = [
  { value: 'technique', label: 'Technique' },
  { value: 'warm_up', label: 'Warm up' },
  { value: 'cool_down', label: 'Cool down' },
  { value: 'rehab', label: 'Rehabilitation' },
  { value: 'mobility', label: 'Mobility' },
  { value: 'class', label: 'Class' },
  { value: 'education', label: 'Education' },
  { value: 'other', label: 'Other' },
] as const;

export const TEMPLATE_CATEGORIES = [
  { value: 'general', label: 'General' },
  { value: 'strength', label: 'Strength' },
  { value: 'hypertrophy', label: 'Hypertrophy' },
  { value: 'endurance', label: 'Endurance' },
  { value: 'power', label: 'Power' },
  { value: 'mobility', label: 'Mobility' },
  { value: 'rehab', label: 'Rehabilitation' },
  { value: 'sport', label: 'Sport specific' },
  { value: 'onboard_minimal', label: 'Minimal kit on board' },
] as const;

export const TEMPLATE_STATUSES = [
  { value: 'draft', label: 'Draft' },
  { value: 'active', label: 'Published' },
  { value: 'archived', label: 'Archived' },
] as const;

/** Rehab protocols are filed by the region they rehabilitate. */
export const BODY_REGIONS = [
  { value: 'shoulder', label: 'Shoulder' },
  { value: 'elbow_wrist', label: 'Elbow and wrist' },
  { value: 'cervical', label: 'Neck' },
  { value: 'thoracic', label: 'Upper back' },
  { value: 'lumbar', label: 'Lower back' },
  { value: 'hip_groin', label: 'Hip and groin' },
  { value: 'knee', label: 'Knee' },
  { value: 'ankle_foot', label: 'Ankle and foot' },
  { value: 'general', label: 'General' },
] as const;

export const REHAB_STAGES = [
  { value: 'acute', label: 'Acute' },
  { value: 'subacute', label: 'Subacute' },
  { value: 'strengthening', label: 'Strengthening' },
  { value: 'return_to_work', label: 'Return to work' },
  { value: 'return_to_sport', label: 'Return to sport' },
  { value: 'maintenance', label: 'Maintenance' },
] as const;

/** Blocks a trainer groups a session into. Free text in the database. */
export const SESSION_BLOCKS = [
  { value: 'warm_up', label: 'Warm up' },
  { value: 'main', label: 'Main' },
  { value: 'accessory', label: 'Accessory' },
  { value: 'conditioning', label: 'Conditioning' },
  { value: 'cool_down', label: 'Cool down' },
] as const;

const labelFrom = (
  options: readonly { value: string; label: string }[],
  value: string | null | undefined,
  fallback = '—',
): string => options.find((o) => o.value === value)?.label ?? fallback;

export const exerciseCategoryLabel = (value: string | null | undefined): string =>
  labelFrom(EXERCISE_CATEGORIES, value, 'Other');
export const difficultyLabel = (value: string | null | undefined): string =>
  labelFrom(DIFFICULTIES, value);
export const exerciseSourceLabel = (value: string | null | undefined): string =>
  labelFrom(EXERCISE_SOURCES, value, 'Written on board');
export const videoCategoryLabel = (value: string | null | undefined): string =>
  labelFrom(VIDEO_CATEGORIES, value, 'Other');
export const templateCategoryLabel = (value: string | null | undefined): string =>
  labelFrom(TEMPLATE_CATEGORIES, value, 'General');
export const templateStatusLabel = (value: string | null | undefined): string =>
  labelFrom(TEMPLATE_STATUSES, value, 'Draft');
export const bodyRegionLabel = (value: string | null | undefined): string =>
  labelFrom(BODY_REGIONS, value);
export const rehabStageLabel = (value: string | null | undefined): string =>
  labelFrom(REHAB_STAGES, value);
export const blockLabel = (value: string | null | undefined): string =>
  labelFrom(SESSION_BLOCKS, value, value ?? '—');

/** A row that came from an import carries the licence of the source it came from. */
export const isImported = (exercise: Pick<PtExercise, 'source'>): boolean =>
  exercise.source !== 'custom';

const blankToNull = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim() ?? '';
  return trimmed ? trimmed : null;
};

export interface ExerciseFilters {
  search?: string;
  category?: string | null;
  bodyPart?: string | null;
  targetMuscle?: string | null;
  equipment?: string | null;
  difficulty?: string | null;
  source?: string | null;
  rehabOnly?: boolean;
  includeInactive?: boolean;
  limit?: number;
}

/**
 * The exercise library. Imported rows sit alongside rows written on board;
 * `source` tells them apart and carries the licence the import was made under.
 */
export function useExercises(filters: ExerciseFilters = {}) {
  const { profile, user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const companyId = profile?.company_id ?? null;
  const {
    search = '',
    category = null,
    bodyPart = null,
    targetMuscle = null,
    equipment = null,
    difficulty = null,
    source = null,
    rehabOnly = false,
    includeInactive = false,
    limit = 500,
  } = filters;

  const query = useQuery({
    queryKey: [
      ...PT_EXERCISES_KEY,
      companyId,
      search,
      category,
      bodyPart,
      targetMuscle,
      equipment,
      difficulty,
      source,
      rehabOnly,
      includeInactive,
      limit,
    ],
    enabled: Boolean(companyId),
    staleTime: 60_000,
    queryFn: async (): Promise<PtExercise[]> => {
      let request = supabase
        .from('pt_exercises')
        .select('*')
        .eq('company_id', companyId as string)
        .order('name')
        .limit(limit);
      if (!includeInactive) request = request.eq('is_active', true);
      if (category) request = request.eq('category', category);
      if (bodyPart) request = request.eq('body_part', bodyPart);
      if (targetMuscle) request = request.eq('target_muscle', targetMuscle);
      if (equipment) request = request.eq('equipment', equipment);
      if (difficulty) request = request.eq('difficulty', difficulty);
      if (source) request = request.eq('source', source);
      if (rehabOnly) request = request.eq('is_rehab', true);
      const term = search.trim();
      if (term) {
        const safe = term.replace(/[%,()]/g, ' ');
        request = request.or(
          `name.ilike.%${safe}%,target_muscle.ilike.%${safe}%,body_part.ilike.%${safe}%,equipment.ilike.%${safe}%`,
        );
      }
      const { data, error } = await request;
      if (error) throw error;
      return data ?? [];
    },
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: PT_EXERCISES_KEY });
    void queryClient.invalidateQueries({ queryKey: PT_EXERCISE_FACETS_KEY });
  };

  const save = useMutation({
    mutationFn: async (values: Partial<PtExercise> & { name: string }) => {
      if (!companyId) throw new Error('No company on your profile');
      if (values.id) {
        const { error } = await supabase
          .from('pt_exercises')
          .update({ ...values, updated_by: user?.id ?? null })
          .eq('id', values.id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from('pt_exercises').insert({
        ...values,
        company_id: companyId,
        created_by: user?.id ?? null,
        updated_by: user?.id ?? null,
      } as TablesInsert<'pt_exercises'>);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Exercise saved' });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not save', description: error.message, variant: 'destructive' });
    },
  });

  const setActive = useMutation({
    mutationFn: async ({ ids, isActive }: { ids: string[]; isActive: boolean }) => {
      if (!ids.length) return;
      const { error } = await supabase
        .from('pt_exercises')
        .update({ is_active: isActive, updated_by: user?.id ?? null })
        .in('id', ids);
      if (error) throw error;
    },
    onSuccess: (_result, variables) => {
      invalidate();
      toast({
        title: variables.isActive ? 'Exercises restored' : 'Exercises archived',
        description: `${variables.ids.length} exercise${variables.ids.length === 1 ? '' : 's'} updated.`,
      });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not update', description: error.message, variant: 'destructive' });
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('pt_exercises').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Exercise deleted' });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not delete', description: error.message, variant: 'destructive' });
    },
  });

  const summary = useMemo(() => {
    const rows = query.data ?? [];
    return {
      total: rows.length,
      custom: rows.filter((r) => r.source === 'custom').length,
      imported: rows.filter((r) => r.source !== 'custom').length,
      rehab: rows.filter((r) => r.is_rehab).length,
      archived: rows.filter((r) => !r.is_active).length,
    };
  }, [query.data]);

  return {
    ...query,
    exercises: query.data ?? [],
    summary,
    save,
    setActive,
    remove,
    isMutating: save.isPending || setActive.isPending || remove.isPending,
  };
}

export interface ExerciseFacets {
  bodyParts: string[];
  targetMuscles: string[];
  equipment: string[];
}

/** The values actually present in the library, for the filter menus. */
export function useExerciseFacets() {
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;

  const query = useQuery({
    queryKey: [...PT_EXERCISE_FACETS_KEY, companyId],
    enabled: Boolean(companyId),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<ExerciseFacets> => {
      const { data, error } = await supabase
        .from('pt_exercises')
        .select('body_part, target_muscle, equipment')
        .eq('company_id', companyId as string)
        .eq('is_active', true)
        .limit(5000);
      if (error) throw error;
      const bodyParts = new Set<string>();
      const targetMuscles = new Set<string>();
      const equipment = new Set<string>();
      for (const row of data ?? []) {
        if (row.body_part) bodyParts.add(row.body_part);
        if (row.target_muscle) targetMuscles.add(row.target_muscle);
        if (row.equipment) equipment.add(row.equipment);
      }
      const sorted = (set: Set<string>) => Array.from(set).sort((a, b) => a.localeCompare(b));
      return {
        bodyParts: sorted(bodyParts),
        targetMuscles: sorted(targetMuscles),
        equipment: sorted(equipment),
      };
    },
  });

  return {
    ...query,
    facets: query.data ?? { bodyParts: [], targetMuscles: [], equipment: [] },
  };
}

export interface VideoFilters {
  search?: string;
  category?: string | null;
  exerciseId?: string | null;
  includeInactive?: boolean;
}

export interface PtVideoEntry extends PtVideo {
  exercise_name: string | null;
}

/** The media library: technique clips, class recordings and rehab guides. */
export function useVideos(filters: VideoFilters = {}) {
  const { profile, user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const companyId = profile?.company_id ?? null;
  const { search = '', category = null, exerciseId = null, includeInactive = false } = filters;

  const query = useQuery({
    queryKey: [...PT_VIDEOS_KEY, companyId, search, category, exerciseId, includeInactive],
    enabled: Boolean(companyId),
    staleTime: 60_000,
    queryFn: async (): Promise<PtVideoEntry[]> => {
      let request = supabase
        .from('pt_videos')
        .select('*, pt_exercises(name)')
        .eq('company_id', companyId as string)
        .order('title');
      if (!includeInactive) request = request.eq('is_active', true);
      if (category) request = request.eq('category', category);
      if (exerciseId) request = request.eq('exercise_id', exerciseId);
      const term = search.trim();
      if (term) {
        const safe = term.replace(/[%,()]/g, ' ');
        request = request.or(`title.ilike.%${safe}%,description.ilike.%${safe}%`);
      }
      const { data, error } = await request;
      if (error) throw error;
      return (data ?? []).map((row) => {
        const typed = row as PtVideo & { pt_exercises?: { name: string } | null };
        return { ...typed, exercise_name: typed.pt_exercises?.name ?? null };
      });
    },
  });

  const save = useMutation({
    mutationFn: async (values: Partial<PtVideo> & { title: string }) => {
      if (!companyId) throw new Error('No company on your profile');
      if (!values.url && !values.storage_path) {
        throw new Error('Add a link or upload path so the clip can be played');
      }
      if (values.id) {
        const { error } = await supabase.from('pt_videos').update(values).eq('id', values.id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from('pt_videos').insert({
        ...values,
        company_id: companyId,
        created_by: user?.id ?? null,
      } as TablesInsert<'pt_videos'>);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PT_VIDEOS_KEY });
      toast({ title: 'Video saved' });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not save', description: error.message, variant: 'destructive' });
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('pt_videos').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PT_VIDEOS_KEY });
      toast({ title: 'Video removed' });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not remove', description: error.message, variant: 'destructive' });
    },
  });

  return {
    ...query,
    videos: query.data ?? [],
    save,
    remove,
    isMutating: save.isPending || remove.isPending,
  };
}

export interface TemplateFilters {
  rehabOnly?: boolean;
  category?: string | null;
  status?: string | null;
  search?: string;
  includeInactive?: boolean;
}

export interface PtTemplateEntry extends PtProgramTemplate {
  dayCount: number;
  exerciseCount: number;
  weeks: number[];
}

/**
 * Programme templates. Rehab protocols are the same table with `is_rehab`
 * set, so Physio and PT edit one shared library rather than two that drift.
 */
export function useProgramTemplates(filters: TemplateFilters = {}) {
  const { profile, user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const companyId = profile?.company_id ?? null;
  const { rehabOnly = false, category = null, status = null, search = '', includeInactive = false } = filters;

  const query = useQuery({
    queryKey: [...PT_TEMPLATES_KEY, companyId, rehabOnly, category, status, search, includeInactive],
    enabled: Boolean(companyId),
    staleTime: 60_000,
    queryFn: async (): Promise<PtTemplateEntry[]> => {
      let request = supabase
        .from('pt_program_templates')
        .select('*, pt_template_days(id, week_number, pt_template_items(id))')
        .eq('company_id', companyId as string)
        .order('name');
      if (rehabOnly) request = request.eq('is_rehab', true);
      if (!includeInactive) request = request.eq('is_active', true);
      if (category) request = request.eq('category', category);
      if (status) request = request.eq('status', status);
      const term = search.trim();
      if (term) {
        const safe = term.replace(/[%,()]/g, ' ');
        request = request.or(`name.ilike.%${safe}%,description.ilike.%${safe}%,goals.ilike.%${safe}%`);
      }
      const { data, error } = await request;
      if (error) throw error;
      return (data ?? []).map((row) => {
        const typed = row as PtProgramTemplate & {
          pt_template_days?: { id: string; week_number: number; pt_template_items?: { id: string }[] }[];
        };
        const days = typed.pt_template_days ?? [];
        return {
          ...typed,
          dayCount: days.length,
          exerciseCount: days.reduce((sum, d) => sum + (d.pt_template_items?.length ?? 0), 0),
          weeks: Array.from(new Set(days.map((d) => d.week_number))).sort((a, b) => a - b),
        };
      });
    },
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: PT_TEMPLATES_KEY });
    void queryClient.invalidateQueries({ queryKey: PT_TEMPLATE_BUILDER_KEY });
  };

  const save = useMutation({
    mutationFn: async (values: Partial<PtProgramTemplate> & { name: string }): Promise<string> => {
      if (!companyId) throw new Error('No company on your profile');
      if (values.id) {
        const { error } = await supabase
          .from('pt_program_templates')
          .update({ ...values, updated_by: user?.id ?? null })
          .eq('id', values.id);
        if (error) throw error;
        return values.id;
      }
      const { data, error } = await supabase
        .from('pt_program_templates')
        .insert({
          ...values,
          company_id: companyId,
          created_by: user?.id ?? null,
          updated_by: user?.id ?? null,
        } as TablesInsert<'pt_program_templates'>)
        .select('id')
        .single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Template saved' });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not save', description: error.message, variant: 'destructive' });
    },
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status: next }: { id: string; status: string }) => {
      const { error } = await supabase
        .from('pt_program_templates')
        .update({ status: next, is_active: next !== 'archived', updated_by: user?.id ?? null })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_result, variables) => {
      invalidate();
      toast({ title: `Template ${templateStatusLabel(variables.status).toLowerCase()}` });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not update', description: error.message, variant: 'destructive' });
    },
  });

  /**
   * Copies a template with its days and items. Programmes already assigned
   * keep their own snapshot, so a copy never disturbs an athlete.
   */
  const duplicate = useMutation({
    mutationFn: async (templateId: string): Promise<string> => {
      if (!companyId) throw new Error('No company on your profile');
      const { data: original, error: readError } = await supabase
        .from('pt_program_templates')
        .select('*')
        .eq('id', templateId)
        .single();
      if (readError) throw readError;

      const {
        id: _id,
        created_at: _createdAt,
        updated_at: _updatedAt,
        ...rest
      } = original as PtProgramTemplate;
      const { data: copy, error: insertError } = await supabase
        .from('pt_program_templates')
        .insert({
          ...rest,
          name: `${original.name} (copy)`,
          status: 'draft',
          is_active: true,
          created_by: user?.id ?? null,
          updated_by: user?.id ?? null,
        } as TablesInsert<'pt_program_templates'>)
        .select('id')
        .single();
      if (insertError) throw insertError;

      const { data: days, error: daysError } = await supabase
        .from('pt_template_days')
        .select('*, pt_template_items(*)')
        .eq('template_id', templateId);
      if (daysError) throw daysError;

      for (const day of (days ?? []) as (PtTemplateDay & { pt_template_items?: PtTemplateItem[] })[]) {
        const { data: newDay, error: dayError } = await supabase
          .from('pt_template_days')
          .insert({
            company_id: companyId,
            template_id: copy.id,
            week_number: day.week_number,
            day_number: day.day_number,
            title: day.title,
            focus: day.focus,
            notes: day.notes,
          })
          .select('id')
          .single();
        if (dayError) throw dayError;
        const items = day.pt_template_items ?? [];
        if (!items.length) continue;
        const { error: itemsError } = await supabase.from('pt_template_items').insert(
          items.map((item) => ({
            company_id: companyId,
            day_id: newDay.id,
            exercise_id: item.exercise_id,
            exercise_name: item.exercise_name,
            position: item.position,
            block: item.block,
            sets: item.sets,
            reps: item.reps,
            tempo: item.tempo,
            rest_seconds: item.rest_seconds,
            load_prescription: item.load_prescription,
            rpe: item.rpe,
            duration_seconds: item.duration_seconds,
            distance_m: item.distance_m,
            notes: item.notes,
          })),
        );
        if (itemsError) throw itemsError;
      }
      return copy.id;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Template copied', description: 'The copy is a draft until you publish it.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not copy', description: error.message, variant: 'destructive' });
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('pt_program_templates').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Template deleted' });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not delete', description: error.message, variant: 'destructive' });
    },
  });

  const summary = useMemo(() => {
    const rows = query.data ?? [];
    return {
      total: rows.length,
      published: rows.filter((r) => r.status === 'active').length,
      draft: rows.filter((r) => r.status === 'draft').length,
      archived: rows.filter((r) => r.status === 'archived').length,
    };
  }, [query.data]);

  return {
    ...query,
    templates: query.data ?? [],
    summary,
    save,
    setStatus,
    duplicate,
    remove,
    isMutating: save.isPending || setStatus.isPending || duplicate.isPending || remove.isPending,
  };
}

export interface TemplateDayEntry extends PtTemplateDay {
  items: PtTemplateItem[];
}

export interface TemplateWeek {
  week: number;
  days: TemplateDayEntry[];
}

export interface AddTemplateItemInput {
  day_id: string;
  exercise_id?: string | null;
  exercise_name: string;
  block?: string | null;
  sets?: number | null;
  reps?: string | null;
  tempo?: string | null;
  rest_seconds?: number | null;
  load_prescription?: string | null;
  rpe?: number | null;
  duration_seconds?: number | null;
  distance_m?: number | null;
  notes?: string | null;
}

/** One template's days and items, grouped into weeks for the builder. */
export function useTemplateBuilder(templateId: string | null | undefined) {
  const { profile } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const companyId = profile?.company_id ?? null;

  const query = useQuery({
    queryKey: [...PT_TEMPLATE_BUILDER_KEY, templateId ?? null],
    enabled: Boolean(templateId && companyId),
    staleTime: 30_000,
    queryFn: async (): Promise<TemplateDayEntry[]> => {
      const { data, error } = await supabase
        .from('pt_template_days')
        .select('*, pt_template_items(*)')
        .eq('template_id', templateId as string);
      if (error) throw error;
      return ((data ?? []) as (PtTemplateDay & { pt_template_items?: PtTemplateItem[] })[])
        .map((day) => ({
          ...day,
          items: [...(day.pt_template_items ?? [])].sort((a, b) => a.position - b.position),
        }))
        .sort((a, b) => a.week_number - b.week_number || a.day_number - b.day_number);
    },
  });

  const days = useMemo(() => query.data ?? [], [query.data]);

  const weeks = useMemo<TemplateWeek[]>(() => {
    const map = new Map<number, TemplateDayEntry[]>();
    for (const day of days) map.set(day.week_number, [...(map.get(day.week_number) ?? []), day]);
    return Array.from(map.entries())
      .sort(([a], [b]) => a - b)
      .map(([week, weekDays]) => ({ week, days: weekDays }));
  }, [days]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: PT_TEMPLATE_BUILDER_KEY });
    void queryClient.invalidateQueries({ queryKey: PT_TEMPLATES_KEY });
  };

  const fail = (title: string) => (error: Error) =>
    toast({ title, description: error.message, variant: 'destructive' });

  const addDay = useMutation({
    mutationFn: async (values: { week_number: number; title?: string; focus?: string | null }) => {
      if (!companyId || !templateId) throw new Error('No template selected');
      const used = days.filter((d) => d.week_number === values.week_number).map((d) => d.day_number);
      const nextDay = used.length ? Math.max(...used) + 1 : 1;
      const { error } = await supabase.from('pt_template_days').insert({
        company_id: companyId,
        template_id: templateId,
        week_number: values.week_number,
        day_number: nextDay,
        title: values.title?.trim() || `Day ${nextDay}`,
        focus: blankToNull(values.focus),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Day added' });
    },
    onError: fail('Could not add the day'),
  });

  const updateDay = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: Partial<PtTemplateDay> }) => {
      const { error } = await supabase.from('pt_template_days').update(values).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Day saved' });
    },
    onError: fail('Could not save the day'),
  });

  const removeDay = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('pt_template_days').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Day removed' });
    },
    onError: fail('Could not remove the day'),
  });

  const addItem = useMutation({
    mutationFn: async (input: AddTemplateItemInput) => {
      if (!companyId) throw new Error('No company on your profile');
      const day = days.find((d) => d.id === input.day_id);
      const position = day?.items.length ? Math.max(...day.items.map((i) => i.position)) + 1 : 0;
      const { error } = await supabase.from('pt_template_items').insert({
        company_id: companyId,
        day_id: input.day_id,
        exercise_id: input.exercise_id ?? null,
        exercise_name: input.exercise_name,
        position,
        block: blankToNull(input.block),
        sets: input.sets ?? null,
        reps: blankToNull(input.reps),
        tempo: blankToNull(input.tempo),
        rest_seconds: input.rest_seconds ?? null,
        load_prescription: blankToNull(input.load_prescription),
        rpe: input.rpe ?? null,
        duration_seconds: input.duration_seconds ?? null,
        distance_m: input.distance_m ?? null,
        notes: blankToNull(input.notes),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Exercise added' });
    },
    onError: fail('Could not add the exercise'),
  });

  const updateItem = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: Partial<PtTemplateItem> }) => {
      const { error } = await supabase.from('pt_template_items').update(values).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Prescription saved' });
    },
    onError: fail('Could not save'),
  });

  const removeItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('pt_template_items').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Exercise removed' });
    },
    onError: fail('Could not remove'),
  });

  /** Swaps `position` with the neighbour, which is what the order is read from. */
  const moveItem = useMutation({
    mutationFn: async ({ id, direction }: { id: string; direction: 'up' | 'down' }) => {
      const day = days.find((d) => d.items.some((i) => i.id === id));
      if (!day) throw new Error('That exercise is no longer in the template');
      const index = day.items.findIndex((i) => i.id === id);
      const swapWith = direction === 'up' ? index - 1 : index + 1;
      if (swapWith < 0 || swapWith >= day.items.length) return;
      const a = day.items[index];
      const b = day.items[swapWith];
      const { error: errorA } = await supabase
        .from('pt_template_items')
        .update({ position: b.position })
        .eq('id', a.id);
      if (errorA) throw errorA;
      const { error: errorB } = await supabase
        .from('pt_template_items')
        .update({ position: a.position })
        .eq('id', b.id);
      if (errorB) throw errorB;
    },
    onSuccess: () => invalidate(),
    onError: fail('Could not reorder'),
  });

  return {
    ...query,
    days,
    weeks,
    addDay,
    updateDay,
    removeDay,
    addItem,
    updateItem,
    removeItem,
    moveItem,
    isMutating:
      addDay.isPending ||
      updateDay.isPending ||
      removeDay.isPending ||
      addItem.isPending ||
      updateItem.isPending ||
      removeItem.isPending ||
      moveItem.isPending,
  };
}

/** A connector row with the credential reduced to "is one set?". */
export interface PtExerciseSourceEntry extends Omit<PtExerciseSource, 'credential'> {
  hasCredential: boolean;
}

export interface ImportResult {
  imported: number;
  skipped: number;
  failed: number;
  message: string;
}

export interface FileImportRow {
  name: string;
  source_id: string;
  category?: string | null;
  body_part?: string | null;
  target_muscle?: string | null;
  equipment?: string | null;
  difficulty?: string | null;
  instructions?: string | null;
  coaching_cues?: string | null;
  video_url?: string | null;
  image_url?: string | null;
}

/**
 * Exercise import connectors. Admin only: the table holds API keys.
 * The credential itself is reduced to a boolean the moment it arrives, so a
 * saved key is never put in the query cache or rendered anywhere.
 */
export function useExerciseSources() {
  const { profile, user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const companyId = profile?.company_id ?? null;

  const query = useQuery({
    queryKey: [...PT_SOURCES_KEY, companyId],
    enabled: Boolean(companyId),
    staleTime: 30_000,
    queryFn: async (): Promise<PtExerciseSourceEntry[]> => {
      const { data, error } = await supabase
        .from('pt_exercise_sources')
        .select('*')
        .eq('company_id', companyId as string)
        .order('label');
      if (error) throw error;
      return (data ?? []).map((row) => {
        const { credential, ...rest } = row;
        return { ...rest, hasCredential: Boolean(credential) };
      });
    },
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: PT_SOURCES_KEY });
  };

  const seedSources = useMutation({
    mutationFn: async (): Promise<number> => {
      if (!companyId) throw new Error('No company on your profile');
      const { data, error } = await supabase.rpc('pt_seed_exercise_sources', {
        p_company_id: companyId,
      });
      if (error) throw error;
      return (data as number) ?? 0;
    },
    onSuccess: (count) => {
      invalidate();
      toast({
        title: count ? 'Connectors created' : 'Connectors already set up',
        description: count
          ? `${count} import source${count === 1 ? '' : 's'} registered.`
          : 'Nothing to add for this company.',
      });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not create the connectors', description: error.message, variant: 'destructive' });
    },
  });

  const saveSource = useMutation({
    mutationFn: async ({
      id,
      values,
    }: {
      id: string;
      values: Partial<PtExerciseSource>;
    }) => {
      const { error } = await supabase.from('pt_exercise_sources').update(values).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Source saved' });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not save', description: error.message, variant: 'destructive' });
    },
  });

  /**
   * API imports run in the `pt-exercise-import` edge function so the API key
   * stays on the server. The function owns the connector's sync status.
   */
  const runApiImport = useMutation({
    mutationFn: async ({ sourceKey, limit }: { sourceKey: string; limit: number }): Promise<ImportResult> => {
      const { data, error } = await supabase.functions.invoke('pt-exercise-import', {
        body: { source_key: sourceKey, limit },
      });
      if (error) throw error;
      const result = (data ?? {}) as Partial<ImportResult>;
      return {
        imported: result.imported ?? 0,
        skipped: result.skipped ?? 0,
        failed: result.failed ?? 0,
        message: result.message ?? 'Import finished',
      };
    },
    onSuccess: (result) => {
      invalidate();
      void queryClient.invalidateQueries({ queryKey: PT_EXERCISES_KEY });
      void queryClient.invalidateQueries({ queryKey: PT_EXERCISE_FACETS_KEY });
      toast({
        title: `${result.imported} exercises imported`,
        description: `${result.skipped} already on board, ${result.failed} could not be read. ${result.message}`,
      });
    },
    onError: (error: Error) => {
      toast({ title: 'Import failed', description: error.message, variant: 'destructive' });
    },
  });

  /**
   * File imports insert straight from the browser. Rows already carrying the
   * same `source_id` are left alone, which is what the unique index on
   * (company_id, source, source_id) enforces at the database as well.
   */
  const importFileRows = useMutation({
    mutationFn: async ({
      sourceKey,
      rows,
      licence,
      attribution,
    }: {
      sourceKey: string;
      rows: FileImportRow[];
      licence: string | null;
      attribution: string | null;
    }): Promise<ImportResult> => {
      if (!companyId) throw new Error('No company on your profile');
      if (!rows.length) throw new Error('Nothing to import');

      const { data: existing, error: existingError } = await supabase
        .from('pt_exercises')
        .select('source_id')
        .eq('company_id', companyId)
        .eq('source', sourceKey)
        .limit(10000);
      if (existingError) throw existingError;
      const seen = new Set((existing ?? []).map((r) => r.source_id).filter(Boolean) as string[]);

      const fresh: TablesInsert<'pt_exercises'>[] = [];
      let skipped = 0;
      for (const row of rows) {
        if (!row.name?.trim() || !row.source_id?.trim()) {
          skipped += 1;
          continue;
        }
        if (seen.has(row.source_id)) {
          skipped += 1;
          continue;
        }
        seen.add(row.source_id);
        fresh.push({
          company_id: companyId,
          name: row.name.trim(),
          category: row.category || 'strength',
          body_part: blankToNull(row.body_part),
          target_muscle: blankToNull(row.target_muscle),
          equipment: blankToNull(row.equipment),
          difficulty: row.difficulty || null,
          instructions: blankToNull(row.instructions),
          coaching_cues: blankToNull(row.coaching_cues),
          video_url: blankToNull(row.video_url),
          image_url: blankToNull(row.image_url),
          source: sourceKey,
          source_id: row.source_id.trim(),
          source_licence: licence,
          attribution,
          created_by: user?.id ?? null,
          updated_by: user?.id ?? null,
        });
      }

      let imported = 0;
      let failed = 0;
      for (let i = 0; i < fresh.length; i += 200) {
        const chunk = fresh.slice(i, i + 200);
        // Upsert on the source key so a second import, or two people importing
        // at once, tops the library up rather than failing the whole chunk.
        const { error } = await supabase
          .from('pt_exercises')
          .upsert(chunk, { onConflict: 'company_id,source,source_id', ignoreDuplicates: true });
        if (error) failed += chunk.length;
        else imported += chunk.length;
      }

      const sourceRow = (query.data ?? []).find((s) => s.source_key === sourceKey);
      if (sourceRow) {
        await supabase
          .from('pt_exercise_sources')
          .update({
            last_synced_at: new Date().toISOString(),
            last_sync_status: failed ? (imported ? 'partial' : 'failed') : 'success',
            last_sync_message: `${imported} imported, ${skipped} already on board, ${failed} failed`,
            imported_count: (sourceRow.imported_count ?? 0) + imported,
          })
          .eq('id', sourceRow.id);
      }

      return {
        imported,
        skipped,
        failed,
        message: failed ? 'Some rows were rejected. Check the column mapping.' : 'Import finished',
      };
    },
    onSuccess: (result) => {
      invalidate();
      void queryClient.invalidateQueries({ queryKey: PT_EXERCISES_KEY });
      void queryClient.invalidateQueries({ queryKey: PT_EXERCISE_FACETS_KEY });
      toast({
        title: `${result.imported} exercises imported`,
        description: `${result.skipped} skipped, ${result.failed} failed.`,
      });
    },
    onError: (error: Error) => {
      toast({ title: 'Import failed', description: error.message, variant: 'destructive' });
    },
  });

  const summary = useMemo(() => {
    const rows = query.data ?? [];
    return {
      total: rows.length,
      enabled: rows.filter((r) => r.is_enabled).length,
      imported: rows.reduce((sum, r) => sum + (r.imported_count ?? 0), 0),
    };
  }, [query.data]);

  return {
    ...query,
    sources: query.data ?? [],
    summary,
    seedSources,
    saveSource,
    runApiImport,
    importFileRows,
    isMutating:
      seedSources.isPending || saveSource.isPending || runApiImport.isPending || importFileRows.isPending,
  };
}
