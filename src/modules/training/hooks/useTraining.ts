import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { toast } from 'sonner';
import { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';

export type TrainingCourse = Tables<'training_courses'>;
export type TrainingRecord = Tables<'training_records'> & {
  course?: TrainingCourse;
  user?: Tables<'profiles'>;
};
export type FamiliarizationTemplate = Tables<'familiarization_templates'>;
export type FamiliarizationRecord = Tables<'familiarization_records'> & {
  user?: Tables<'profiles'>;
  supervisor?: Tables<'profiles'>;
  template?: FamiliarizationTemplate;
  vessel?: Tables<'vessels'>;
};
export type FamiliarizationChecklistItem = Tables<'familiarization_checklist_items'>;
export type TrainingMatrix = Tables<'training_matrix'>;

export function useTraining() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  // Fetch training courses (master list)
  const { data: courses = [], isLoading: coursesLoading } = useQuery({
    queryKey: ['training-courses'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('training_courses')
        .select('*')
        .order('course_category', { ascending: true })
        .order('course_name', { ascending: true });
      
      if (error) throw error;
      return data as TrainingCourse[];
    },
  });

  // Fetch training records for company
  const { data: trainingRecords = [], isLoading: recordsLoading, refetch: refetchRecords } = useQuery({
    queryKey: ['training-records'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('training_records')
        .select(`
          *,
          course:training_courses(*),
          user:profiles!training_records_user_id_fkey(*)
        `)
        .order('expiry_date', { ascending: true, nullsFirst: false });
      
      if (error) throw error;
      return data as TrainingRecord[];
    },
    enabled: !!profile,
  });

  // Fetch familiarization templates
  const { data: templates = [], isLoading: templatesLoading } = useQuery({
    queryKey: ['familiarization-templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('familiarization_templates')
        .select('*')
        .eq('is_active', true)
        .order('template_name', { ascending: true });
      
      if (error) throw error;
      return data as FamiliarizationTemplate[];
    },
    enabled: !!profile,
  });

  // Fetch familiarization records
  const { data: familiarizationRecords = [], isLoading: familiarizationLoading, refetch: refetchFamiliarization } = useQuery({
    queryKey: ['familiarization-records'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('familiarization_records')
        .select(`
          *,
          user:profiles!familiarization_records_user_id_fkey(*),
          supervisor:profiles!familiarization_records_supervisor_id_fkey(*),
          template:familiarization_templates(*),
          vessel:vessels(*)
        `)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as FamiliarizationRecord[];
    },
    enabled: !!profile,
  });

  // Fetch training matrix
  const { data: trainingMatrix = [], isLoading: matrixLoading } = useQuery({
    queryKey: ['training-matrix'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('training_matrix')
        .select('*');
      
      if (error) throw error;
      return data as TrainingMatrix[];
    },
    enabled: !!profile,
  });

  // Add training record
  const addTrainingRecord = useMutation({
    mutationFn: async (record: TablesInsert<'training_records'>) => {
      const { data, error } = await supabase
        .from('training_records')
        .insert(record)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['training-records'] });
      toast.success('Training record added successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to add training record: ${error.message}`);
    },
  });

  // Update training record
  const updateTrainingRecord = useMutation({
    mutationFn: async ({ id, ...updates }: TablesUpdate<'training_records'> & { id: string }) => {
      const { data, error } = await supabase
        .from('training_records')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['training-records'] });
      toast.success('Training record updated successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update training record: ${error.message}`);
    },
  });

  // Delete training record
  const deleteTrainingRecord = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('training_records')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['training-records'] });
      toast.success('Training record deleted successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete training record: ${error.message}`);
    },
  });

  // Add familiarization template
  const addFamiliarizationTemplate = useMutation({
    mutationFn: async (template: TablesInsert<'familiarization_templates'>) => {
      const { data, error } = await supabase
        .from('familiarization_templates')
        .insert(template)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['familiarization-templates'] });
      toast.success('Familiarization template created successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to create template: ${error.message}`);
    },
  });

  // Start familiarization (create record + checklist items)
  const startFamiliarization = useMutation({
    mutationFn: async ({
      record,
      checklistItems,
    }: {
      record: TablesInsert<'familiarization_records'>;
      checklistItems: Omit<TablesInsert<'familiarization_checklist_items'>, 'familiarization_id'>[];
    }) => {
      // Create the familiarization record
      const { data: famRecord, error: famError } = await supabase
        .from('familiarization_records')
        .insert(record)
        .select()
        .single();
      
      if (famError) throw famError;

      // Create checklist items
      if (checklistItems.length > 0) {
        const itemsWithId = checklistItems.map(item => ({
          ...item,
          familiarization_id: famRecord.id,
        }));

        const { error: itemsError } = await supabase
          .from('familiarization_checklist_items')
          .insert(itemsWithId);
        
        if (itemsError) throw itemsError;
      }

      return famRecord;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['familiarization-records'] });
      toast.success('Familiarization started successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to start familiarization: ${error.message}`);
    },
  });

  // Update familiarization record
  const updateFamiliarization = useMutation({
    mutationFn: async ({ id, ...updates }: TablesUpdate<'familiarization_records'> & { id: string }) => {
      const { data, error } = await supabase
        .from('familiarization_records')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['familiarization-records'] });
      toast.success('Familiarization updated successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update familiarization: ${error.message}`);
    },
  });

  // Fetch checklist items for a familiarization
  const fetchChecklistItems = async (familiarizationId: string) => {
    const { data, error } = await supabase
      .from('familiarization_checklist_items')
      .select(`
        *,
        completed_by:profiles!familiarization_checklist_items_completed_by_id_fkey(*)
      `)
      .eq('familiarization_id', familiarizationId)
      .order('section_name', { ascending: true })
      .order('item_order', { ascending: true });
    
    if (error) throw error;
    return data;
  };

  // Update checklist item
  const updateChecklistItem = useMutation({
    mutationFn: async ({ id, ...updates }: TablesUpdate<'familiarization_checklist_items'> & { id: string }) => {
      const { data, error } = await supabase
        .from('familiarization_checklist_items')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['familiarization-records'] });
    },
    onError: (error: Error) => {
      toast.error(`Failed to update checklist item: ${error.message}`);
    },
  });

  // Save training matrix
  const saveTrainingMatrix = useMutation({
    mutationFn: async (matrixEntry: TablesInsert<'training_matrix'>) => {
      const { data, error } = await supabase
        .from('training_matrix')
        .upsert(matrixEntry, { onConflict: 'vessel_id,rank' })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['training-matrix'] });
      toast.success('Training matrix updated successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update training matrix: ${error.message}`);
    },
  });

  // Calculate compliance stats
  const complianceStats = {
    totalRecords: trainingRecords.length,
    validRecords: trainingRecords.filter(r => r.status === 'Valid').length,
    expiringSoon: trainingRecords.filter(r => r.status === 'Expiring_Soon').length,
    expired: trainingRecords.filter(r => r.status === 'Expired').length,
    activeFamiliarizations: familiarizationRecords.filter(r => r.status === 'In_Progress').length,
    overdueFamiliarizations: familiarizationRecords.filter(r => r.status === 'Overdue').length,
  };

  return {
    // Data
    courses,
    trainingRecords,
    templates,
    familiarizationRecords,
    trainingMatrix,
    complianceStats,

    // Loading states
    isLoading: coursesLoading || recordsLoading || templatesLoading || familiarizationLoading || matrixLoading,
    coursesLoading,
    recordsLoading,
    templatesLoading,
    familiarizationLoading,
    matrixLoading,

    // Mutations
    addTrainingRecord,
    updateTrainingRecord,
    deleteTrainingRecord,
    addFamiliarizationTemplate,
    startFamiliarization,
    updateFamiliarization,
    updateChecklistItem,
    saveTrainingMatrix,

    // Helpers
    fetchChecklistItems,
    refetchRecords,
    refetchFamiliarization,
  };
}
