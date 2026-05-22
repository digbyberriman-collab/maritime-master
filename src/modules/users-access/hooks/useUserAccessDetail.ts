import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { PermissionLevel } from '../lib/presets';

export interface AccessDetail {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  position: string | null;
  roleDisplayName: string | null;
  permissions: Record<string, PermissionLevel | null>;
}

export function useUserAccessDetail(userId?: string) {
  return useQuery({
    enabled: !!userId,
    queryKey: ['users-access', 'detail', userId],
    queryFn: async (): Promise<AccessDetail | null> => {
      const { data: prof } = await supabase
        .from('profiles')
        .select('user_id, first_name, last_name, email')
        .eq('user_id', userId!)
        .maybeSingle();
      if (!prof) return null;

      const [{ data: assignment }, { data: overrides }, { data: rolesRows }] = await Promise.all([
        supabase.from('crew_assignments').select('position').eq('user_id', userId!).eq('is_current', true).maybeSingle(),
        supabase
          .from('user_permission_overrides')
          .select('module_key, permission, is_granted')
          .eq('user_id', userId!)
          .eq('is_granted', true),
        supabase.rpc('get_user_roles_full', { p_user_id: userId! }),
      ]);

      const permissions: Record<string, PermissionLevel | null> = {};
      (overrides ?? []).forEach((o) => {
        permissions[o.module_key] = o.permission as PermissionLevel;
      });

      const roleDisplayName = (rolesRows ?? [])[0]?.role_display_name ?? null;

      return {
        userId: prof.user_id,
        firstName: prof.first_name ?? '',
        lastName: prof.last_name ?? '',
        email: prof.email ?? '',
        position: assignment?.position ?? null,
        roleDisplayName,
        permissions,
      };
    },
  });
}

export function useModulesList() {
  return useQuery({
    queryKey: ['users-access', 'modules'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('modules')
        .select('key, name, sort_order')
        .eq('is_active', true)
        .order('sort_order');
      if (error) throw error;
      return data ?? [];
    },
  });
}