import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useToast } from '@/shared/hooks/use-toast';

export interface DevTodo {
  id: string;
  company_id: string;
  title: string;
  description: string | null;
  priority: number;
  status: string;
  assigned_to: string | null;
  created_by: string;
  image_urls: string[];
  created_at: string;
  updated_at: string;
  assigned_profile?: { first_name: string | null; last_name: string | null } | null;
  created_by_profile?: { first_name: string | null; last_name: string | null } | null;
}

export interface CreateDevTodoInput {
  title: string;
  description?: string;
  priority: number;
  assigned_to?: string;
  image_urls?: string[];
}

export function useDevTodos() {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const todosQuery = useQuery({
    queryKey: ['dev-todos', profile?.company_id],
    queryFn: async () => {
      if (!profile?.company_id) return [];
      const { data, error } = await supabase
        .from('dev_todos')
        .select('*')
        .eq('company_id', profile.company_id)
        .order('priority', { ascending: true })
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as unknown as DevTodo[];
    },
    enabled: !!profile?.company_id,
  });

  const createTodo = useMutation({
    mutationFn: async (input: CreateDevTodoInput) => {
      if (!user?.id || !profile?.company_id) throw new Error('Not authenticated');
      const { data, error } = await supabase
        .from('dev_todos')
        .insert({
          company_id: profile.company_id,
          title: input.title,
          description: input.description || null,
          priority: input.priority,
          assigned_to: input.assigned_to || null,
          created_by: user.id,
          image_urls: input.image_urls || [],
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dev-todos'] });
      toast({ title: 'Success', description: 'To-do item created' });
    },
    onError: (err) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  const updateTodo = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; status?: string; priority?: number; title?: string; description?: string; assigned_to?: string | null }) => {
      const { error } = await supabase
        .from('dev_todos')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dev-todos'] });
    },
    onError: (err) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  const deleteTodo = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('dev_todos').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dev-todos'] });
      toast({ title: 'Deleted', description: 'To-do item removed' });
    },
    onError: (err) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  return {
    todos: todosQuery.data || [],
    loading: todosQuery.isLoading,
    createTodo,
    updateTodo,
    deleteTodo,
  };
}
