import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import type { PermissionLevel } from '../lib/presets';

interface SaveArgs {
  userId: string;
  moduleKey: string;
  permission: PermissionLevel | null; // null = remove (no access)
}

export function useSavePermissionOverride() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ userId, moduleKey, permission }: SaveArgs) => {
      // Always clear any existing overrides for this user+module first.
      const { error: delErr } = await supabase
        .from('user_permission_overrides')
        .delete()
        .eq('user_id', userId)
        .eq('module_key', moduleKey);
      if (delErr) throw delErr;

      if (permission) {
        const { error: insErr } = await supabase.from('user_permission_overrides').insert({
          user_id: userId,
          module_key: moduleKey,
          permission,
          is_granted: true,
          created_by: user!.id,
          reason: 'Updated via Users & Access',
        });
        if (insErr) throw insErr;
      }
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['users-access', 'detail', vars.userId] });
      qc.invalidateQueries({ queryKey: ['users-access', 'list'] });
    },
  });
}

export function useApplyPreset() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ userId, matrix }: { userId: string; matrix: Record<string, PermissionLevel | null> }) => {
      const moduleKeys = Object.keys(matrix);
      const { error: delErr } = await supabase
        .from('user_permission_overrides')
        .delete()
        .eq('user_id', userId)
        .in('module_key', moduleKeys);
      if (delErr) throw delErr;

      const rows = moduleKeys
        .filter((k) => matrix[k])
        .map((k) => ({
          user_id: userId,
          module_key: k,
          permission: matrix[k] as PermissionLevel,
          is_granted: true,
          created_by: user!.id,
          reason: 'Applied access preset',
        }));

      if (rows.length) {
        const { error: insErr } = await supabase.from('user_permission_overrides').insert(rows);
        if (insErr) throw insErr;
      }
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['users-access', 'detail', vars.userId] });
      qc.invalidateQueries({ queryKey: ['users-access', 'list'] });
    },
  });
}