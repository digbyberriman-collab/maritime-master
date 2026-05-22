import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/modules/auth/contexts/AuthContext';

const MODULE_KEY = 'crew.department_scope';

export function useDepartmentScope(userId?: string) {
  return useQuery({
    enabled: !!userId,
    queryKey: ['dept-scope', userId],
    queryFn: async (): Promise<string[]> => {
      const { data } = await supabase
        .from('user_permission_overrides')
        .select('restrictions')
        .eq('user_id', userId!)
        .eq('module_key', MODULE_KEY)
        .maybeSingle();
      const r = data?.restrictions as any;
      return Array.isArray(r?.departments) ? r.departments : [];
    },
  });
}

export function useSaveDepartmentScope() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ userId, departments }: { userId: string; departments: string[] }) => {
      await supabase
        .from('user_permission_overrides')
        .delete()
        .eq('user_id', userId)
        .eq('module_key', MODULE_KEY);
      const { error } = await supabase.from('user_permission_overrides').insert({
        user_id: userId,
        module_key: MODULE_KEY,
        permission: 'view',
        is_granted: true,
        restrictions: { departments },
        created_by: user!.id,
        reason: 'Department scope',
      });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['dept-scope', vars.userId] });
    },
  });
}