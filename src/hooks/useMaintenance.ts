import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';

// Types
export interface EquipmentCategory {
  id: string;
  category_name: string;
  parent_category_id: string | null;
  icon: string;
  color: string;
  display_order: number;
  children?: EquipmentCategory[];
}

export interface Equipment {
  id: string;
  vessel_id: string;
  category_id: string;
  equipment_name: string;
  equipment_code: string;
  location: string | null;
  manufacturer: string | null;
  model: string | null;
  serial_number: string | null;
  installation_date: string | null;
  warranty_expiry: string | null;
  criticality: string;
  running_hours_total: number;
  running_hours_last_updated: string | null;
  status: string;
  specifications: Record<string, string> | null;
  manual_url: string | null;
  photo_url: string | null;
  created_at: string;
  updated_at: string;
  category?: EquipmentCategory;
  vessel?: { id: string; name: string };
}

export interface MaintenanceTask {
  id: string;
  task_number: string;
  equipment_id: string;
  template_id: string | null;
  task_name: string;
  task_type: string;
  due_date: string;
  due_running_hours: number | null;
  scheduled_date: string | null;
  actual_start_date: string | null;
  actual_completion_date: string | null;
  assigned_to_id: string | null;
  status: string;
  priority: string;
  work_description: string | null;
  work_performed: string | null;
  findings: string | null;
  spares_used: unknown;
  hours_spent: number | null;
  completed_by_id: string | null;
  verified_by_id: string | null;
  next_due_date: string | null;
  attachments: string[] | null;
  created_at: string;
  updated_at: string;
  equipment?: Equipment;
  assigned_to?: { user_id: string; first_name: string; last_name: string };
  completed_by?: { user_id: string; first_name: string; last_name: string };
}

export interface Defect {
  id: string;
  defect_number: string;
  vessel_id: string;
  equipment_id: string | null;
  reported_by_id: string;
  reported_date: string;
  defect_description: string;
  priority: string;
  operational_impact: string;
  status: string;
  temporary_repair: string | null;
  permanent_repair_plan: string | null;
  target_completion_date: string | null;
  actual_completion_date: string | null;
  linked_maintenance_task_id: string | null;
  closed_by_id: string | null;
  attachments: string[] | null;
  created_at: string;
  updated_at: string;
  equipment?: Equipment;
  vessel?: { id: string; name: string };
  reported_by?: { user_id: string; first_name: string; last_name: string };
}

export interface SparePart {
  id: string;
  vessel_id: string;
  part_number: string;
  part_name: string;
  equipment_ids: string[] | null;
  manufacturer: string | null;
  quantity_onboard: number;
  minimum_stock: number;
  unit_cost: number | null;
  location_onboard: string | null;
  last_ordered_date: string | null;
  supplier: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  vessel?: { id: string; name: string };
}

export interface RunningHoursLog {
  id: string;
  equipment_id: string;
  recorded_date: string;
  running_hours: number;
  recorded_by_id: string;
  notes: string | null;
  created_at: string;
  equipment?: Equipment;
  recorded_by?: { user_id: string; first_name: string; last_name: string };
}

// Hook
export function useMaintenance() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  // Fetch equipment categories (hierarchical)
  const { data: categories = [], isLoading: categoriesLoading } = useQuery({
    queryKey: ['equipment-categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('equipment_categories')
        .select('*')
        .order('display_order');
      
      if (error) throw error;
      
      // Build hierarchy
      const categoryMap = new Map<string, EquipmentCategory>();
      const rootCategories: EquipmentCategory[] = [];
      
      data.forEach(cat => {
        categoryMap.set(cat.id, { ...cat, children: [] });
      });
      
      data.forEach(cat => {
        const category = categoryMap.get(cat.id)!;
        if (cat.parent_category_id) {
          const parent = categoryMap.get(cat.parent_category_id);
          if (parent) {
            parent.children = parent.children || [];
            parent.children.push(category);
          }
        } else {
          rootCategories.push(category);
        }
      });
      
      return rootCategories;
    },
  });

  // Fetch flat categories for dropdowns
  const { data: flatCategories = [] } = useQuery({
    queryKey: ['equipment-categories-flat'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('equipment_categories')
        .select('*')
        .order('display_order');
      
      if (error) throw error;
      return data as EquipmentCategory[];
    },
  });

  // Fetch equipment
  const { data: equipment = [], isLoading: equipmentLoading, refetch: refetchEquipment } = useQuery({
    queryKey: ['equipment'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('equipment')
        .select(`
          *,
          category:equipment_categories(*),
          vessel:vessels(id, name)
        `)
        .order('equipment_code');
      
      if (error) throw error;
      return data as Equipment[];
    },
    enabled: !!profile,
  });

  // Fetch maintenance tasks
  const { data: tasks = [], isLoading: tasksLoading, refetch: refetchTasks } = useQuery({
    queryKey: ['maintenance-tasks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('maintenance_tasks')
        .select(`
          *,
          equipment:equipment(*, vessel:vessels(id, name), category:equipment_categories(*)),
          assigned_to:profiles!maintenance_tasks_assigned_to_id_fkey(user_id, first_name, last_name),
          completed_by:profiles!maintenance_tasks_completed_by_id_fkey(user_id, first_name, last_name)
        `)
        .order('due_date');
      
      if (error) throw error;
      return data as MaintenanceTask[];
    },
    enabled: !!profile,
  });

  // Fetch defects
  const { data: defects = [], isLoading: defectsLoading, refetch: refetchDefects } = useQuery({
    queryKey: ['defects'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('defects')
        .select(`
          *,
          equipment:equipment(*),
          vessel:vessels(id, name),
          reported_by:profiles!defects_reported_by_id_fkey(user_id, first_name, last_name)
        `)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as Defect[];
    },
    enabled: !!profile,
  });

  // Fetch spare parts
  const { data: spareParts = [], isLoading: sparePartsLoading, refetch: refetchSpareParts } = useQuery({
    queryKey: ['spare-parts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('spare_parts')
        .select(`
          *,
          vessel:vessels(id, name)
        `)
        .order('part_name');
      
      if (error) throw error;
      return data as SparePart[];
    },
    enabled: !!profile,
  });

  // Create equipment mutation
  const createEquipment = useMutation({
    mutationFn: async (equipmentData: Omit<Equipment, 'id' | 'created_at' | 'updated_at' | 'category' | 'vessel'>) => {
      const { data, error } = await supabase
        .from('equipment')
        .insert(equipmentData)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment'] });
      toast({ title: 'Equipment added successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error adding equipment', description: error.message, variant: 'destructive' });
    },
  });

  // Update equipment mutation
  const updateEquipment = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Equipment> & { id: string }) => {
      // Remove joined relation fields that don't exist on the table
      const { category, vessel, ...dbUpdates } = updates as Record<string, unknown>;

      const { data, error } = await supabase
        .from('equipment')
        .update(dbUpdates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment'] });
      toast({ title: 'Equipment updated successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error updating equipment', description: error.message, variant: 'destructive' });
    },
  });

  // Create maintenance task mutation
  const createTask = useMutation({
    mutationFn: async (taskData: {
      task_number: string;
      equipment_id: string;
      task_name: string;
      task_type: string;
      due_date: string;
      priority?: string;
      status?: string;
      work_description?: string;
      assigned_to_id?: string;
      template_id?: string;
      due_running_hours?: number;
      scheduled_date?: string;
    }) => {
      const { data, error } = await supabase
        .from('maintenance_tasks')
        .insert(taskData)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance-tasks'] });
      toast({ title: 'Maintenance task created successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error creating task', description: error.message, variant: 'destructive' });
    },
  });

  // Update maintenance task mutation
  const updateTask = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; [key: string]: unknown }) => {
      // Remove relation fields that shouldn't be sent to DB
      const { equipment, assigned_to, completed_by, ...dbUpdates } = updates as Record<string, unknown>;
      
      const { data, error } = await supabase
        .from('maintenance_tasks')
        .update(dbUpdates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance-tasks'] });
      toast({ title: 'Task updated successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error updating task', description: error.message, variant: 'destructive' });
    },
  });

  // Create defect mutation
  const createDefect = useMutation({
    mutationFn: async (defectData: Omit<Defect, 'id' | 'created_at' | 'updated_at' | 'equipment' | 'vessel' | 'reported_by'>) => {
      const { data, error } = await supabase
        .from('defects')
        .insert(defectData)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['defects'] });
      toast({ title: 'Defect logged successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error logging defect', description: error.message, variant: 'destructive' });
    },
  });

  // Update defect mutation
  const updateDefect = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Defect> & { id: string }) => {
      // Remove joined relation fields that don't exist on the table
      const { equipment, vessel, reported_by, ...dbUpdates } = updates as Record<string, unknown>;

      const { data, error } = await supabase
        .from('defects')
        .update(dbUpdates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['defects'] });
      toast({ title: 'Defect updated successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error updating defect', description: error.message, variant: 'destructive' });
    },
  });

  // Log running hours mutation
  const logRunningHours = useMutation({
    mutationFn: async (logData: { equipment_id: string; running_hours: number; notes?: string }) => {
      // Insert log entry
      const { error: logError } = await supabase
        .from('running_hours_log')
        .insert({
          ...logData,
          recorded_by_id: profile?.user_id,
        });
      
      if (logError) throw logError;
      
      // Update equipment running hours
      const { error: updateError } = await supabase
        .from('equipment')
        .update({
          running_hours_total: logData.running_hours,
          running_hours_last_updated: new Date().toISOString(),
        })
        .eq('id', logData.equipment_id);
      
      if (updateError) throw updateError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment'] });
      queryClient.invalidateQueries({ queryKey: ['running-hours-log'] });
      toast({ title: 'Running hours updated' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error updating running hours', description: error.message, variant: 'destructive' });
    },
  });

  // Create spare part mutation
  const createSparePart = useMutation({
    mutationFn: async (partData: Omit<SparePart, 'id' | 'created_at' | 'updated_at' | 'vessel'>) => {
      const { data, error } = await supabase
        .from('spare_parts')
        .insert(partData)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['spare-parts'] });
      toast({ title: 'Spare part added successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error adding spare part', description: error.message, variant: 'destructive' });
    },
  });

  // Update spare part mutation
  const updateSparePart = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<SparePart> & { id: string }) => {
      // Remove joined relation fields that don't exist on the table
      const { vessel, ...dbUpdates } = updates as Record<string, unknown>;

      const { data, error } = await supabase
        .from('spare_parts')
        .update(dbUpdates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['spare-parts'] });
      toast({ title: 'Spare part updated successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error updating spare part', description: error.message, variant: 'destructive' });
    },
  });

  // Calculate stats
  const stats = {
    totalEquipment: equipment.length,
    overdueTasks: tasks.filter(t => t.status === 'Overdue' || (t.status === 'Pending' && new Date(t.due_date) < new Date())).length,
    criticalDefects: defects.filter(d => d.priority === 'P1_Critical' && d.status === 'Open').length,
    tasksDueThisWeek: tasks.filter(t => {
      const dueDate = new Date(t.due_date);
      const today = new Date();
      const weekFromNow = new Date();
      weekFromNow.setDate(today.getDate() + 7);
      return t.status !== 'Completed' && t.status !== 'Cancelled' && dueDate >= today && dueDate <= weekFromNow;
    }).length,
    lowStockParts: spareParts.filter(p => p.quantity_onboard <= p.minimum_stock).length,
  };

  return {
    categories,
    flatCategories,
    equipment,
    tasks,
    defects,
    spareParts,
    stats,
    isLoading: categoriesLoading || equipmentLoading || tasksLoading || defectsLoading || sparePartsLoading,
    createEquipment,
    updateEquipment,
    createTask,
    updateTask,
    createDefect,
    updateDefect,
    logRunningHours,
    createSparePart,
    updateSparePart,
    refetchEquipment,
    refetchTasks,
    refetchDefects,
    refetchSpareParts,
  };
}
