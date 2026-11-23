import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { clearOverrides, isRlsRefusal, OverrideRefusedError } from './useSavePermissionOverride';

const MODULE_KEY = 'crew.department_scope';

const departmentsOf = (restrictions: unknown): string[] => {
  const departments = restrictions && typeof restrictions === 'object' && !Array.isArray(restrictions) ? (restrictions as { departments?: unknown }).departments : null;
  return Array.isArray(departments) ? departments.filter((d): d is string => typeof d === 'string') : [];
};

export function useDepartmentScope(userId?: string) {
  return useQuery({
    enabled: !!userId,
    queryKey: ['dept-scope', userId],
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from('user_permission_overrides')
        .select('restrictions')
        .eq('user_id', userId!)
        .eq('module_key', MODULE_KEY)
        .order('created_at', { ascending: false })
        .limit(1);
      // A failed read is not "all departments" (fail closed).
      if (error) throw error;
      return departmentsOf(data?.[0]?.restrictions ?? null);
    },
  });
}

/** Replace the department scope; a refusal (RLS, or your own access) is an `OverrideRefusedError`, never a silent no-op. */
export function useSaveDepartmentScope() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ userId, departments }: { userId: string; departments: string[] }) => {
      if (!user) throw new Error('Your session has expired. Sign in again to continue.');
      if (userId === user.id) throw new OverrideRefusedError([MODULE_KEY], { self: true });
      const { refused, removedAny } = await clearOverrides(userId, [MODULE_KEY]);
      if (refused.length > 0) throw new OverrideRefusedError(refused, { partial: removedAny });
      const { error } = await supabase.from('user_permission_overrides').insert({
        user_id: userId,
        module_key: MODULE_KEY,
        permission: 'view',
        is_granted: true,
        restrictions: { departments },
        created_by: user.id,
        reason: 'Department scope',
      });
      if (error) {
        if (isRlsRefusal(error)) throw new OverrideRefusedError([MODULE_KEY], { partial: removedAny });
        throw error;
      }
    },
    onSettled: (_d, _e, vars) => {
      void qc.invalidateQueries({ queryKey: ['dept-scope', vars.userId] });
    },
  });
}
