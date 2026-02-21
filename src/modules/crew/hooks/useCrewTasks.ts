import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useToast } from '@/shared/hooks/use-toast';

export type TaskType = 'task' | 'review' | 'evaluation' | 'form' | 'acknowledgement' | 'other';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'overdue' | 'cancelled';

export interface CrewTask {
  id: string;
  company_id: string;
  vessel_id: string | null;
  title: string;
  description: string | null;
  task_type: TaskType;
  priority: TaskPriority;
  assigned_to: string;
  assigned_by: string;
  due_date: string | null;
  started_at: string | null;
  completed_at: string | null;
  status: TaskStatus;
  related_form_id: string | null;
  related_document_id: string | null;
  completion_notes: string | null;
  verification_required: boolean;
  verified_by: string | null;
  verified_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  assigned_to_profile?: {
    first_name: string | null;
    last_name: string | null;
    email: string | null;
  };
  assigned_by_profile?: {
    first_name: string | null;
    last_name: string | null;
  };
  vessel?: {
    name: string;
  };
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  task_type: TaskType;
  priority: TaskPriority;
  assigned_to: string;
  vessel_id?: string;
  due_date?: string;
  related_form_id?: string;
  related_document_id?: string;
  verification_required?: boolean;
}

export function useCrewTasks(options?: { 
  assignedToMe?: boolean; 
  assignedByMe?: boolean;
  vesselId?: string;
  status?: TaskStatus[];
}) {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const [tasks, setTasks] = useState<CrewTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadTasks = useCallback(async () => {
    if (!user?.id || !profile?.company_id) return;
    
    setLoading(true);
    try {
      let query = supabase
        .from('crew_tasks')
        .select(`
          *,
          assigned_to_profile:profiles!crew_tasks_assigned_to_fkey(first_name, last_name, email),
          assigned_by_profile:profiles!crew_tasks_assigned_by_fkey(first_name, last_name),
          vessel:vessels(name)
        `)
        .eq('company_id', profile.company_id)
        .order('due_date', { ascending: true, nullsFirst: false });

      if (options?.assignedToMe) {
        query = query.eq('assigned_to', user.id);
      }
      
      if (options?.assignedByMe) {
        query = query.eq('assigned_by', user.id);
      }

      if (options?.vesselId) {
        query = query.eq('vessel_id', options.vesselId);
      }

      if (options?.status?.length) {
        query = query.in('status', options.status);
      }

      const { data, error: fetchError } = await query;

      if (fetchError) throw fetchError;
      setTasks(data as CrewTask[] || []);
    } catch (err) {
      console.error('Failed to load tasks:', err);
      setError(err instanceof Error ? err.message : 'Failed to load tasks');
    } finally {
      setLoading(false);
    }
  }, [user?.id, profile?.company_id, options?.assignedToMe, options?.assignedByMe, options?.vesselId, options?.status]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  const createTask = async (input: CreateTaskInput) => {
    if (!user?.id || !profile?.company_id) {
      toast({ title: 'Error', description: 'Not authenticated', variant: 'destructive' });
      return null;
    }

    try {
      const { data, error } = await supabase
        .from('crew_tasks')
        .insert({
          company_id: profile.company_id,
          vessel_id: input.vessel_id || null,
          title: input.title,
          description: input.description || null,
          task_type: input.task_type,
          priority: input.priority,
          assigned_to: input.assigned_to,
          assigned_by: user.id,
          due_date: input.due_date || null,
          related_form_id: input.related_form_id || null,
          related_document_id: input.related_document_id || null,
          verification_required: input.verification_required || false,
          status: 'pending',
        })
        .select()
        .single();

      if (error) throw error;

      toast({ title: 'Success', description: 'Task assigned successfully' });
      loadTasks();
      return data;
    } catch (err) {
      console.error('Failed to create task:', err);
      toast({ 
        title: 'Error', 
        description: err instanceof Error ? err.message : 'Failed to create task',
        variant: 'destructive' 
      });
      return null;
    }
  };

  const updateTaskStatus = async (taskId: string, status: TaskStatus, notes?: string) => {
    try {
      const updates: Record<string, unknown> = { status };
      
      if (status === 'in_progress' && !tasks.find(t => t.id === taskId)?.started_at) {
        updates.started_at = new Date().toISOString();
      }
      
      if (status === 'completed') {
        updates.completed_at = new Date().toISOString();
        if (notes) updates.completion_notes = notes;
      }

      const { error } = await supabase
        .from('crew_tasks')
        .update(updates)
        .eq('id', taskId);

      if (error) throw error;

      toast({ title: 'Success', description: 'Task updated' });
      loadTasks();
    } catch (err) {
      console.error('Failed to update task:', err);
      toast({ 
        title: 'Error', 
        description: err instanceof Error ? err.message : 'Failed to update task',
        variant: 'destructive' 
      });
    }
  };

  const verifyTask = async (taskId: string) => {
    if (!user?.id) return;

    try {
      const { error } = await supabase
        .from('crew_tasks')
        .update({
          verified_by: user.id,
          verified_at: new Date().toISOString(),
        })
        .eq('id', taskId);

      if (error) throw error;

      toast({ title: 'Success', description: 'Task verified' });
      loadTasks();
    } catch (err) {
      console.error('Failed to verify task:', err);
      toast({ 
        title: 'Error', 
        description: err instanceof Error ? err.message : 'Failed to verify task',
        variant: 'destructive' 
      });
    }
  };

  const deleteTask = async (taskId: string) => {
    try {
      const { error } = await supabase
        .from('crew_tasks')
        .delete()
        .eq('id', taskId);

      if (error) throw error;

      toast({ title: 'Success', description: 'Task deleted' });
      loadTasks();
    } catch (err) {
      console.error('Failed to delete task:', err);
      toast({ 
        title: 'Error', 
        description: err instanceof Error ? err.message : 'Failed to delete task',
        variant: 'destructive' 
      });
    }
  };

  return {
    tasks,
    loading,
    error,
    refresh: loadTasks,
    createTask,
    updateTaskStatus,
    verifyTask,
    deleteTask,
  };
}
